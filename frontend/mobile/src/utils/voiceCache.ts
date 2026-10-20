import { resolveFileUrl } from '@/api/file'
import { refreshTokenIfNeeded } from '@/api/http'

let audioCtx: AudioContext | null = null
const decoded = new Map<string, AudioBuffer>()
const inflight = new Map<string, Promise<AudioBuffer | null>>()
/** 本地录音 / 已拉取的远端文件：用 HTMLAudio 播，避开 decodeAudioData 静音缓存 */
const localBlobs = new Map<string, Blob>()
const prefetching = new Set<string>()
let currentSource: AudioBufferSourceNode | null = null
let currentOnEnded: (() => void) | null = null
let htmlAudio: HTMLAudioElement | null = null
let objectUrlToRevoke: string | null = null
let cacheClearPending = false
/** HTMLAudio 播放的音量增益（MediaElementSourceNode 增益节点） */
let boostCtx: AudioContext | null = null
let boostSource: MediaElementAudioSourceNode | null = null
let boostGain: GainNode | null = null
const VOICE_PLAYBACK_GAIN = 1.8

function cacheKey(url: string): string {
  return resolveFileUrl(url)
}

async function fetchVoiceResponse(url: string): Promise<Response> {
  let token = await refreshTokenIfNeeded()
  const request = () => fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    credentials: 'include',
  })
  let response = await request()
  if (response.status === 401) {
    token = await refreshTokenIfNeeded(true)
    if (token) response = await request()
  }
  return response
}

function getCtx(): AudioContext {
  if (!audioCtx) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    audioCtx = new Ctx()
  }
  return audioCtx
}

function isSilentBuffer(buf: AudioBuffer): boolean {
  try {
    const ch = buf.getChannelData(0)
    if (!ch.length) return true
    const step = Math.max(1, Math.floor(ch.length / 2000))
    let peak = 0
    for (let i = 0; i < ch.length; i += step) {
      const v = Math.abs(ch[i])
      if (v > peak) peak = v
      if (peak >= 0.002) return false
    }
    return peak < 0.002
  } catch {
    return false
  }
}

async function decodeFromArrayBuffer(ab: ArrayBuffer): Promise<AudioBuffer | null> {
  const ctx = getCtx()
  const copy = ab.slice(0)
  const buffer = await ctx.decodeAudioData(copy)
  if (isSilentBuffer(buffer)) return null
  return buffer
}

function normalizeAudioBlob(blob: Blob, fallbackType = 'audio/webm'): Blob {
  const t = (blob.type || '').toLowerCase()
  // 服务端常把 .webm 标成 video/webm，HTMLAudio 在部分机型上会播不出声
  if (!t || t === 'application/octet-stream' || t.startsWith('video/')) {
    const nameHint = t.includes('mp4') || t.includes('m4a') ? 'audio/mp4' : fallbackType
    return new Blob([blob], { type: nameHint })
  }
  return blob
}

async function decodeFromUrlOrBlob(url: string, blob?: Blob): Promise<AudioBuffer | null> {
  const key = cacheKey(url)
  if (!key) return null
  const hit = decoded.get(key)
  if (hit) return hit

  const pending = inflight.get(key)
  if (pending) return pending

  const task = (async () => {
    try {
      let data: ArrayBuffer
      if (blob) {
        data = await blob.arrayBuffer()
      } else {
        const response = await fetchVoiceResponse(key)
        if (!response.ok) return null
        data = await response.arrayBuffer()
      }
      const buffer = await decodeFromArrayBuffer(data)
      if (buffer) decoded.set(key, buffer)
      return buffer
    } catch {
      return null
    } finally {
      inflight.delete(key)
    }
  })()

  inflight.set(key, task)
  return task
}

/** 写入本地录音，发送后立刻可播（不走 WebAudio 解码，避免静音缓存） */
export function cacheVoiceBlob(url: string, blob: Blob): void {
  const key = cacheKey(url)
  if (!key || !blob) return
  localBlobs.set(key, normalizeAudioBlob(blob))
  decoded.delete(key)
  inflight.delete(key)
  void decodeFromUrlOrBlob(key, localBlobs.get(key)).catch(() => null)
}

/** 读取本地缓存或远端语音文件，供播放使用 */
export async function loadVoiceBlob(url: string): Promise<Blob | null> {
  const key = cacheKey(url)
  if (!key) return null
  const local = localBlobs.get(key)
  if (local) return local
  try {
    const res = await fetchVoiceResponse(key)
    if (!res.ok) return null
    const raw = await res.blob()
    if (raw.size <= 0) return null
    const blob = normalizeAudioBlob(raw, key.includes('.m4a') || key.includes('.mp4') ? 'audio/mp4' : 'audio/webm')
    localBlobs.set(key, blob)
    return blob
  } catch {
    return null
  }
}

/** 服务端 ffmpeg 转 WAV，解决 iOS 等机型播不了 webm/opus */
async function fetchServerWavBlob(url: string): Promise<Blob | null> {
  const key = cacheKey(url)
  if (!key) return null
  try {
    const fileMatch = key.match(/\/files\/([^/?#]+)\/(?:download|preview)(?:[/?#]|$)/i)
    const fileId = fileMatch?.[1] ? decodeURIComponent(fileMatch[1]) : ''
    const endpoint = fileId ? '/api/v1/files/audio/wav-from-file' : '/api/v1/files/audio/wav-from-url'
    const body = fileId
      ? JSON.stringify({ fileId })
      : JSON.stringify({ url: key.startsWith('/api/') ? key : `/api${key.startsWith('/') ? key : `/${key}`}` })
    let token = await refreshTokenIfNeeded()
    const request = () => fetch(resolveFileUrl(endpoint), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
      body,
    })
    let response = await request()
    if (response.status === 401) {
      token = await refreshTokenIfNeeded(true)
      if (token) response = await request()
    }
    if (!response.ok) return null
    const blob = await response.blob()
    return blob.size > 0 ? new Blob([blob], { type: blob.type || 'audio/wav' }) : null
  } catch {
    return null
  }
}

/** 后台预取文件（不 decode），避免把静音 AudioBuffer 写进缓存 */
export function prefetchVoice(url?: string): void {
  if (!url) return
  const key = cacheKey(url)
  if (!key || prefetching.has(key) || decoded.has(key)) return
  const cachedBlob = localBlobs.get(key)
  if (cachedBlob) {
    void decodeFromUrlOrBlob(key, cachedBlob)
    return
  }
  prefetching.add(key)
  void loadVoiceBlob(key)
    .then((blob) => blob ? decodeFromUrlOrBlob(key, blob) : null)
    .finally(() => prefetching.delete(key))
}

function revokeObjectUrl() {
  if (!objectUrlToRevoke) return
  try {
    URL.revokeObjectURL(objectUrlToRevoke)
  } catch {
    /* ignore */
  }
  objectUrlToRevoke = null
}

function stopHtmlAudio() {
  if (!htmlAudio) return
  try {
    htmlAudio.onended = null
    htmlAudio.onerror = null
    htmlAudio.pause()
    htmlAudio.removeAttribute('src')
    htmlAudio.load()
  } catch {
    /* ignore */
  }
  revokeObjectUrl()
}

function hasActivePlayback(): boolean {
  return Boolean(currentSource || (htmlAudio && htmlAudio.src))
}

function clearVoiceCacheData(): void {
  decoded.clear()
  inflight.clear()
  localBlobs.clear()
  prefetching.clear()
}

function flushPendingCacheClear(): void {
  if (!cacheClearPending || hasActivePlayback()) return
  cacheClearPending = false
  clearVoiceCacheData()
  window.dispatchEvent(new CustomEvent('pulse:voice-cache-cleared'))
}

/**
 * 给 HTMLAudio 播放附加音量增益。HTMLAudio 本身 volume 上限为 1，
 * 通过 MediaElementSourceNode 挂增益节点放大音量，解决语音播放偏小。
 * AudioContext 重建（录音后会 close）时换新元素重新挂载。
 */
function ensurePlaybackBoost(): void {
  try {
    const ctx = getCtx()
    if (!ctx || ctx.state === 'closed') return
    if (boostSource && boostCtx === ctx) return
    if (boostSource) {
      try {
        boostSource.disconnect()
      } catch {
        /* ignore */
      }
      try {
        boostGain?.disconnect()
      } catch {
        /* ignore */
      }
      boostSource = null
      boostGain = null
      // 旧元素已绑定到已关闭的 AudioContext，重建一个元素重新挂载
      htmlAudio = new Audio()
      htmlAudio.preload = 'auto'
      htmlAudio.setAttribute('playsinline', 'true')
      htmlAudio.setAttribute('webkit-playsinline', 'true')
      ;(htmlAudio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true
    }
    const el = htmlAudio
    if (!el) return
    boostSource = ctx.createMediaElementSource(el)
    boostGain = ctx.createGain()
    boostGain.gain.value = VOICE_PLAYBACK_GAIN
    boostSource.connect(boostGain)
    boostGain.connect(ctx.destination)
    boostCtx = ctx
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    // 挂载失败时退化为普通音量播放
  }
}

export function stopCachedVoice(): void {
  try {
    currentSource?.stop()
  } catch {
    /* already stopped */
  }
  currentSource = null
  stopHtmlAudio()
  const cb = currentOnEnded
  currentOnEnded = null
  cb?.()
  flushPendingCacheClear()
}

function playViaHtmlAudio(
  url: string,
  onEnded?: () => void,
  waitUntilEnd = false,
  trackAsObjectUrl = false,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (htmlAudio) {
      try {
        htmlAudio.onended = null
        htmlAudio.onerror = null
        htmlAudio.pause()
      } catch {
        /* ignore */
      }
    }
    const prevObjectUrl = objectUrlToRevoke
    objectUrlToRevoke = null
    if (prevObjectUrl && prevObjectUrl !== url) {
      try {
        URL.revokeObjectURL(prevObjectUrl)
      } catch {
        /* ignore */
      }
    }

    if (!htmlAudio) {
      htmlAudio = new Audio()
      htmlAudio.preload = 'auto'
      htmlAudio.setAttribute('playsinline', 'true')
      htmlAudio.setAttribute('webkit-playsinline', 'true')
      ;(htmlAudio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true
    }
    ensurePlaybackBoost()
    if (trackAsObjectUrl) objectUrlToRevoke = url

    const el = htmlAudio
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      resolve(ok)
    }
    currentOnEnded = () => {
      onEnded?.()
      if (waitUntilEnd) finish(true)
    }
    el.onended = () => {
      const cb = currentOnEnded
      currentOnEnded = null
      cb?.()
      stopHtmlAudio()
      flushPendingCacheClear()
    }
    el.onerror = () => finish(false)
    el.volume = 1
    el.muted = false
    el.playbackRate = 1
    el.defaultPlaybackRate = 1
    el.src = url
    void el
      .play()
      .then(() => {
        if (!waitUntilEnd) finish(true)
      })
      .catch(() => finish(false))
  })
}

async function playLocalBlob(
  blob: Blob,
  onEnded?: () => void,
  waitUntilEnd = false,
): Promise<boolean> {
  const objUrl = URL.createObjectURL(normalizeAudioBlob(blob))
  return playViaHtmlAudio(objUrl, onEnded, waitUntilEnd, true)
}

async function playViaWebAudio(
  key: string,
  blob: Blob | undefined,
  onEnded: (() => void) | undefined,
  waitUntilEnd: boolean,
): Promise<boolean> {
  const ctx = getCtx()
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume()
    } catch {
      return false
    }
  }
  const buffer = await decodeFromUrlOrBlob(key, blob)
  if (!buffer) return false

  return new Promise<boolean>((resolve) => {
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const gain = ctx.createGain()
    gain.gain.value = VOICE_PLAYBACK_GAIN
    source.playbackRate.value = 1
    source.connect(gain)
    gain.connect(ctx.destination)
    currentSource = source

    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      resolve(ok)
    }

    currentOnEnded = () => {
      onEnded?.()
      if (waitUntilEnd) finish(true)
    }
    source.onended = () => {
      if (currentSource === source) {
        currentSource = null
        const cb = currentOnEnded
        currentOnEnded = null
        cb?.()
        flushPendingCacheClear()
      }
    }
    try {
      source.start(0)
      if (!waitUntilEnd) finish(true)
      else {
        const ms = Math.max(800, Math.ceil(buffer.duration * 1000) + 800)
        window.setTimeout(() => finish(true), ms)
      }
    } catch {
      currentSource = null
      currentOnEnded = null
      finish(false)
    }
  })
}

/**
 * 播放已缓存/远程语音。
 * 优先 HTMLAudio（接收方 webm 用 WebAudio 常解成静音）；失败再 WAV / WebAudio。
 */
export async function playCachedVoice(
  url: string,
  onEnded?: () => void,
  waitUntilEnd = false,
): Promise<boolean> {
  const key = cacheKey(url)
  if (!key) return false

  stopCachedVoice()

  // 预解码完成时优先走 WebAudio，可提升音量且首播无需再次等待网络。
  if (decoded.has(key)) {
    const ok = await playViaWebAudio(key, undefined, onEnded, waitUntilEnd)
    if (ok) return true
  }

  // 1) 本地录音或已拉取 blob
  let blob: Blob | undefined = localBlobs.get(key)
  if (blob) {
    const ok = await playLocalBlob(blob, onEnded, waitUntilEnd)
    if (ok) return true
  }

  // 2) 直接用文件 URL（部分安卓可播）
  if (await playViaHtmlAudio(key, onEnded, waitUntilEnd)) {
    return true
  }

  // 3) 拉文件后按 audio/* Blob 再播（修正 video/webm Content-Type）
  blob = (await loadVoiceBlob(key)) || undefined
  if (blob) {
    const ok = await playLocalBlob(blob, onEnded, waitUntilEnd)
    if (ok) return true
  }

  // 4) 服务端转 WAV（iOS 播 webm 常失败）
  const wav = await fetchServerWavBlob(key)
  if (wav) {
    localBlobs.set(key, wav)
    decoded.delete(key)
    const ok = await playLocalBlob(wav, onEnded, waitUntilEnd)
    if (ok) return true
  }

  // 5) 最后才 WebAudio（并拒绝静音 buffer）
  return playViaWebAudio(key, blob || undefined, onEnded, waitUntilEnd)
}

/** 播放本地 Blob 并等到结束（用于发送前听写） */
export async function playVoiceBlobUntilEnd(blob: Blob): Promise<boolean> {
  return playLocalBlob(blob, undefined, true)
}

export function clearVoiceCache(): void {
  // Storage cleanup must never interrupt a voice message that is currently
  // playing. Mark it pending and finish as soon as playback releases its
  // source; the UI can rescan after the event below.
  if (hasActivePlayback()) {
    cacheClearPending = true
    return
  }
  clearVoiceCacheData()
  window.dispatchEvent(new CustomEvent('pulse:voice-cache-cleared'))
}

export function getVoiceCacheSize(): number {
  let bytes = 0
  localBlobs.forEach((blob) => {
    bytes += blob.size
  })
  decoded.forEach((buffer) => {
    bytes += buffer.length * buffer.numberOfChannels * 4
  })
  return bytes
}

/**
 * 录音结束后重置音频会话。
 * 移动端 getUserMedia 后 WebAudio / 播放常会静音，需关闭旧 AudioContext。
 */
export async function resetVoiceAudioSession(): Promise<void> {
  stopCachedVoice()
  boostSource = null
  boostGain = null
  boostCtx = null
  if (!audioCtx) return
  try {
    await audioCtx.close()
  } catch {
    /* ignore */
  }
  audioCtx = null
}

/** 在用户手势里提前 resume，避免首播卡顿 */
export async function warmVoiceAudio(): Promise<void> {
  try {
    const ctx = getCtx()
    if (ctx.state === 'suspended') await ctx.resume()
  } catch {
    /* ignore */
  }
}

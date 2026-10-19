import {
  fetchCallRingtoneConfig,
  fetchMyRingtone,
  fetchPeerRingtone,
} from '@/api/callRingtone'

const LS_RING_URL = 'pulse_ringtone_url'
/** 本地合成回铃 — v5 清晰加响 + 更快生成 */
const LOCAL_RINGBACK_ID = '__pulse_local_ringback_v5__'
/** 苹果 WebAudio 仅作 HTML 失败兜底 */
const APPLE_RING_GAIN = 1.2
/** 苹果 HTML 播放用：解码后做线性放大（硬限幅，不 tanh 糊音） */
const APPLE_HTML_BOOST = 1.9

let audio: HTMLAudioElement | null = null
let previewAudio: HTMLAudioElement | null = null
/** 常驻极短静音循环：帮助部分 iOS 维持媒体会话 */
let silentKeepAlive: HTMLAudioElement | null = null
let audioCtx: AudioContext | null = null
let playing = false
let currentUrl = ''
let unlockBound = false
let prefetching = false
let webAudioPrimed = false
let localWavUrl = ''
let preferredMineUrl = ''
try {
  preferredMineUrl = (localStorage.getItem(LS_RING_URL) || '').trim()
} catch {
  preferredMineUrl = ''
}
const peerUrlCache = new Map<string, string>()
let playGen = 0
let previewGen = 0
let ringWatchTimer = 0
/** 开麦后保持 play-and-record，避免铃声被静音键掐掉 */
let micAudioSession = false
/** 当前铃声只走一路，禁止 HTML + WebAudio 叠播 */
let activeEngine: 'html' | 'webaudio' | '' = ''

const blobCache = new Map<string, string>()
const bufferCache = new Map<string, AudioBuffer>()
/** 苹果专用：放大后的 WAV blob，走 HTML 也能更响且不糊 */
const appleLoudUrlCache = new Map<string, string>()
let loopSource: AudioBufferSourceNode | null = null
let loopGain: GainNode | null = null

/**
 * iOS 17+：静音键会 mute ambient/WebAudio；playback / play-and-record 才能出声。
 */
export function promoteCallAudioSession(mode: 'playback' | 'play-and-record' = 'playback') {
  try {
    const nav = navigator as Navigator & { audioSession?: { type: string } }
    if (!nav.audioSession) return
    const cur = String(nav.audioSession.type || '')
    // 开麦后不要降回 playback
    if (cur === 'play-and-record' && mode === 'playback') return
    nav.audioSession.type = mode
  } catch {
    /* ignore */
  }
}

function persistMineUrl(url: string) {
  preferredMineUrl = (url || '').trim()
  try {
    if (preferredMineUrl) localStorage.setItem(LS_RING_URL, preferredMineUrl)
  } catch {
    /* ignore */
  }
}

function attachToDom(el: HTMLAudioElement) {
  try {
    el.style.display = 'none'
    el.setAttribute('aria-hidden', 'true')
    if (!el.isConnected && typeof document !== 'undefined' && document.body) {
      document.body.appendChild(el)
    }
  } catch {
    /* ignore */
  }
}

function getAudioEl() {
  if (audio) return audio
  audio = new Audio()
  audio.loop = true
  audio.preload = 'auto'
  ;(audio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true
  audio.setAttribute('playsinline', 'true')
  audio.setAttribute('webkit-playsinline', 'true')
  // 不要设 crossOrigin：blob/本地 wav 在 iOS 上可能因此播不出来
  attachToDom(audio)
  return audio
}

function getPreviewEl() {
  if (previewAudio) return previewAudio
  previewAudio = new Audio()
  previewAudio.loop = false
  previewAudio.preload = 'auto'
  ;(previewAudio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true
  previewAudio.setAttribute('playsinline', 'true')
  previewAudio.setAttribute('webkit-playsinline', 'true')
  attachToDom(previewAudio)
  return previewAudio
}

function getSilentKeepAlive() {
  if (silentKeepAlive) return silentKeepAlive
  silentKeepAlive = new Audio()
  silentKeepAlive.loop = true
  silentKeepAlive.preload = 'auto'
  ;(silentKeepAlive as HTMLAudioElement & { playsInline?: boolean }).playsInline = true
  silentKeepAlive.muted = true
  silentKeepAlive.volume = 0
  silentKeepAlive.setAttribute('playsinline', 'true')
  silentKeepAlive.setAttribute('webkit-playsinline', 'true')
  silentKeepAlive.src =
    'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'
  attachToDom(silentKeepAlive)
  return silentKeepAlive
}

function getCtx() {
  if (audioCtx) return audioCtx
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return null
  audioCtx = new Ctx()
  return audioCtx
}

function writeWavHeader(view: DataView, sampleRate: number, numSamples: number) {
  const byteRate = sampleRate * 2
  const blockAlign = 2
  const dataSize = numSamples * 2
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)
}

/** 生成本地回铃：22.05k 双音（电话铃足够清晰，首通生成更快） */
function ensureLocalRingback() {
  const sr = 22050
  const leadSec = 0
  const ringSec = 2.2
  const totalSec = leadSec + 3.5
  const frames = Math.floor(sr * totalSec)
  const samples = new Float32Array(frames)
  for (let i = 0; i < frames; i++) {
    const t = i / sr
    const ringT = t - leadSec
    if (ringT < 0 || ringT >= ringSec) {
      samples[i] = 0
      continue
    }
    const env = Math.min(1, ringT * 50) * Math.min(1, (ringSec - ringT) * 50)
    const tone =
      Math.sin(2 * Math.PI * 440 * ringT) + Math.sin(2 * Math.PI * 480 * ringT)
    // 峰值约 0.92，线性限幅，不 tanh
    samples[i] = Math.max(-0.92, Math.min(0.92, 0.46 * env * tone))
  }

  if (!bufferCache.has(LOCAL_RINGBACK_ID)) {
    const ctx = getCtx()
    if (ctx) {
      const buf = ctx.createBuffer(1, frames, sr)
      buf.copyToChannel(samples, 0)
      bufferCache.set(LOCAL_RINGBACK_ID, buf)
    }
  }

  if (!localWavUrl) {
    const ab = new ArrayBuffer(44 + frames * 2)
    const view = new DataView(ab)
    writeWavHeader(view, sr, frames)
    let offset = 44
    for (let i = 0; i < frames; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    }
    const blob = new Blob([ab], { type: 'audio/wav' })
    localWavUrl = URL.createObjectURL(blob)
    blobCache.set(LOCAL_RINGBACK_ID, localWavUrl)
  }
  return localWavUrl
}

function audioBufferToBoostedWavUrl(buf: AudioBuffer, gain: number): string {
  const sr = buf.sampleRate
  const frames = buf.length
  const nCh = Math.max(1, buf.numberOfChannels)
  const ab = new ArrayBuffer(44 + frames * 2)
  const view = new DataView(ab)
  writeWavHeader(view, sr, frames)
  let offset = 44
  for (let i = 0; i < frames; i++, offset += 2) {
    let mixed = 0
    for (let c = 0; c < nCh; c++) mixed += buf.getChannelData(c)[i] || 0
    mixed = (mixed / nCh) * gain
    // 硬限幅保清晰，避免 soft-clip 糊感
    const s = Math.max(-0.98, Math.min(0.98, mixed))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return URL.createObjectURL(new Blob([ab], { type: 'audio/wav' }))
}

function ensureAppleLoudPlayUrl(key: string): string | undefined {
  if (!isAppleClient()) return undefined
  const hit = appleLoudUrlCache.get(key)
  if (hit) return hit
  const buf = bufferCache.get(key)
  if (!buf) return undefined
  try {
    const url = audioBufferToBoostedWavUrl(buf, APPLE_HTML_BOOST)
    appleLoudUrlCache.set(key, url)
    return url
  } catch {
    return undefined
  }
}

/** 来电常无用户手势：WebAudio 在 suspended 时会静音；只有 running 才可切过去 */
function isWebAudioRunnable(): boolean {
  const ctx = getCtx()
  return !!ctx && ctx.state === 'running'
}

function scheduleDecode(src: string, blob: Blob) {
  if (bufferCache.has(src)) {
    if (isAppleClient()) ensureAppleLoudPlayUrl(src)
    return
  }
  const ctx = getCtx()
  if (!ctx) return
  void blob
    .arrayBuffer()
    .then((ab) => ctx.decodeAudioData(ab.slice(0)))
    .then((decoded) => {
      bufferCache.set(src, decoded)
      if (isAppleClient()) {
        ensureAppleLoudPlayUrl(src)
        // 正在播同一首时，切到更响的 HTML 版（不经 WebAudio，避免糊/无声）
        if (playing && currentUrl === src && activeEngine === 'html') {
          const loud = appleLoudUrlCache.get(src)
          if (loud) {
            try {
              const el = getAudioEl()
              const was = el.currentTime
              el.src = loud
              el.volume = 1
              el.muted = false
              void el.play().then(() => {
                try {
                  el.currentTime = was
                } catch {
                  /* ignore */
                }
              }).catch(() => {})
            } catch {
              /* ignore */
            }
          }
        }
      }
    })
    .catch(() => {})
}

/** WebAudio 不可用时立刻回退 HTML，恢复有声 */
function fallbackAppleToHtml(key?: string) {
  const url = (key || currentUrl || LOCAL_RINGBACK_ID).trim()
  if (!url) return false
  stopWebAudio()
  return playHtmlAudioLoop(url)
}

/**
 * iOS 关键：只动「静音保活」元素 + AudioContext，绝不碰铃声用的 audio。
 * 以前在铃声元素上 muted play 再 pause，会异步把刚起播的铃声掐掉（苹果典型无声）。
 */
export function unlockCallRingtoneAudio() {
  try {
    promoteCallAudioSession(micAudioSession ? 'play-and-record' : 'playback')
    ensureLocalRingback()

    const ctx = getCtx()
    if (ctx) {
      const afterResume = () => {
        if (!webAudioPrimed && ctx.state === 'running') {
          try {
            const buf = ctx.createBuffer(1, 1, ctx.sampleRate || 44100)
            const src = ctx.createBufferSource()
            src.buffer = buf
            src.connect(ctx.destination)
            src.start(0)
            webAudioPrimed = true
          } catch {
            /* ignore */
          }
        }
      }
      if (ctx.state === 'suspended') {
        void ctx.resume().then(afterResume).catch(() => {})
      } else {
        afterResume()
      }
    }

    // The silent keep-alive is only useful on iOS. On Android it can request
    // audio focus again while getUserMedia is switching to communication
    // mode, which is heard as a short ringback interruption.
    if (isAppleClient()) {
      const keep = getSilentKeepAlive()
      if (keep.paused) {
        void keep.play().catch(() => {})
      }
    }
  } catch {
    /* ignore */
  }
}

export function bindCallRingtoneUnlock() {
  if (unlockBound || typeof window === 'undefined') return
  unlockBound = true
  const onGesture = () => unlockCallRingtoneAudio()
  window.addEventListener('pointerdown', onGesture, { capture: true, passive: true })
  window.addEventListener('touchstart', onGesture, { capture: true, passive: true })
  window.addEventListener('keydown', onGesture, { capture: true, passive: true })
  window.addEventListener('click', onGesture, { capture: true, passive: true })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      unlockCallRingtoneAudio()
      void keepCallRingtoneAlive()
    }
  })
}

export async function ensureRingtoneCached(url: string): Promise<string> {
  const src = (url || '').trim()
  if (!src) return ''
  if (src === LOCAL_RINGBACK_ID) return ensureLocalRingback()
  const hit = blobCache.get(src)
  if (hit) {
    if (!bufferCache.has(src)) {
      void fetch(hit)
        .then((r) => r.blob())
        .then((b) => scheduleDecode(src, b))
        .catch(() => {})
    }
    return hit
  }
  try {
    const res = await fetch(src, { credentials: 'include' })
    if (!res.ok) return src
    const blob = await res.blob()
    const obj = URL.createObjectURL(blob)
    blobCache.set(src, obj)
    scheduleDecode(src, blob)
    return obj
  } catch {
    return src
  }
}

function stopWebAudio() {
  try {
    loopSource?.stop()
  } catch {
    /* ignore */
  }
  try {
    loopSource?.disconnect()
  } catch {
    /* ignore */
  }
  try {
    loopGain?.disconnect()
  } catch {
    /* ignore */
  }
  loopSource = null
  loopGain = null
}

function stopRingWatch() {
  if (ringWatchTimer) {
    window.clearInterval(ringWatchTimer)
    ringWatchTimer = 0
  }
}

function startRingWatch() {
  stopRingWatch()
  if (!isAppleClient()) return
  ringWatchTimer = window.setInterval(() => {
    if (!playing) {
      stopRingWatch()
      return
    }
    void keepCallRingtoneAlive()
  }, 350)
}

function playHtmlAudioLoop(url: string): boolean {
  const key = (url || '').trim()
  if (!key) return false
  let playSrc =
    key === LOCAL_RINGBACK_ID ? ensureLocalRingback() : blobCache.get(key) || key
  // 苹果：优先播解码后线性放大的 WAV，媒体音量下也更响且不失真糊化
  if (isAppleClient() && key !== LOCAL_RINGBACK_ID) {
    playSrc = ensureAppleLoudPlayUrl(key) || appleLoudUrlCache.get(key) || playSrc
  }
  if (!playSrc) return false
  try {
    promoteCallAudioSession(micAudioSession ? 'play-and-record' : 'playback')
    // 单通道：先停 WebAudio，避免安卓叠两首
    stopWebAudio()
    const el = getAudioEl()
    if (!isAppleClient()) {
      // A previous Android communication route can leave HTMLMediaElement at
      // a stale decoder position. Fully reload it for every call so playback
      // starts at the first sample after microphone permission has settled.
      try {
        el.pause()
        el.removeAttribute('src')
        el.load()
      } catch {
        /* ignore */
      }
    }
    el.muted = false
    // iOS 媒体音量偏小：拉满；部分机型需重复赋值才生效
    el.volume = 1
    try {
      el.setAttribute('volume', '1')
    } catch {
      /* ignore */
    }
    el.loop = true
    const curAttr = el.getAttribute('src') || ''
    if (curAttr !== playSrc && el.src !== playSrc) {
      el.src = playSrc
    }
    if (!isAppleClient()) el.load()
    try {
      el.currentTime = 0
    } catch {
      /* ignore */
    }
    if (!isAppleClient()) {
      el.onplaying = () => {
        el.onplaying = null
        try {
          if (el.currentTime > 0.02) el.currentTime = 0
        } catch {
          /* ignore */
        }
      }
    }
    const p = el.play()
    currentUrl = key
    playing = true
    activeEngine = 'html'
    startRingWatch()
    if (p && typeof p.then === 'function') {
      void p
        .then(() => {
          try {
            el.volume = 1
            if (!isAppleClient() && el.currentTime > 0.08) {
              el.currentTime = 0
            }
          } catch {
            /* ignore */
          }
        })
        .catch(() => {
          // HTML 被拒时再试 WebAudio（仍只一路）
          if (playing && activeEngine === 'html' && bufferCache.has(key)) {
            playCallWebAudio(key, isAppleClient() ? APPLE_RING_GAIN : 1.7)
          }
        })
    }
    return true
  } catch {
    return false
  }
}

function playCallWebAudio(url: string, gainValue = 1): boolean {
  const key = (url || '').trim()
  if (!key) return false
  if (key === LOCAL_RINGBACK_ID) ensureLocalRingback()
  const buf = bufferCache.get(key)
  const ctx = getCtx()
  if (!buf || !ctx) return false
  try {
    promoteCallAudioSession(micAudioSession ? 'play-and-record' : 'playback')
    // 未 running 时绝不能 pause HTML：来电无手势时 resume 常失败 → 整段无声
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {})
      return false
    }
    if (ctx.state !== 'running') return false

    stopWebAudio()
    try {
      const el = getAudioEl()
      el.pause()
    } catch {
      /* ignore */
    }
    const srcNode = ctx.createBufferSource()
    const gain = ctx.createGain()
    // 不加 WaveShaper/强压缩：高增益 soft-clip 会明显发糊
    gain.gain.value = Math.min(1.4, Math.max(0.6, gainValue))
    srcNode.buffer = buf
    srcNode.loop = true
    srcNode.connect(gain)
    gain.connect(ctx.destination)
    srcNode.start(0)
    loopSource = srcNode
    loopGain = gain
    currentUrl = key
    playing = true
    activeEngine = 'webaudio'
    startRingWatch()
    return true
  } catch {
    return false
  }
}

function isAppleClient(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iP(hone|ad|od)/.test(ua)) return true
  return /Macintosh/.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1
}

/**
 * 全平台只播一路。
 * 苹果：优先清晰 HTML（自定义铃/本地干净双音），不把铃声灌进高增益 WebAudio（会糊）。
 */
function playBestAvailableSync(preferredUrl?: string): boolean {
  promoteCallAudioSession(micAudioSession ? 'play-and-record' : 'playback')
  unlockCallRingtoneAudio()
  ensureLocalRingback()
  const want = (preferredUrl || '').trim()

  let key = LOCAL_RINGBACK_ID
  if (want && blobCache.has(want)) key = want
  else if (want && bufferCache.has(want)) key = want

  if (playing && currentUrl === key) {
    void keepCallRingtoneAlive()
    return true
  }

  playGen += 1
  const apple = isAppleClient()

  if (apple) {
    const playKey =
      key === LOCAL_RINGBACK_ID || blobCache.has(key) || bufferCache.has(key)
        ? key
        : LOCAL_RINGBACK_ID
    const ok = playHtmlAudioLoop(playKey)
    if (ok && playKey !== LOCAL_RINGBACK_ID) {
      const hit = blobCache.get(playKey)
      if (hit) {
        void fetch(hit)
          .then((r) => r.blob())
          .then((b) => scheduleDecode(playKey, b))
          .catch(() => {})
      }
    }
    // HTML 失败才用干净 WebAudio 兜底
    if (!ok && isWebAudioRunnable() && bufferCache.has(playKey)) {
      return playCallWebAudio(playKey, APPLE_RING_GAIN)
    }
    return ok
  }

  if (key === LOCAL_RINGBACK_ID || blobCache.has(key)) {
    return playHtmlAudioLoop(key)
  }
  if (bufferCache.has(key) && playCallWebAudio(key, 1)) return true
  return playHtmlAudioLoop(LOCAL_RINGBACK_ID)
}

/** 开麦前调用：切到 play-and-record，避免铃声被静音键/开麦路由掐掉 */
export function prepareCallRingtoneForMic() {
  micAudioSession = true
  promoteCallAudioSession('play-and-record')
  void keepCallRingtoneAlive()
}

export async function keepCallRingtoneAlive() {
  if (!playing) return false
  try {
    if (!isAppleClient() && activeEngine === 'html') {
      const el = getAudioEl()
      el.muted = false
      el.volume = 1
      if (el.paused && currentUrl) {
        const src =
          currentUrl === LOCAL_RINGBACK_ID
            ? ensureLocalRingback()
            : blobCache.get(currentUrl) || currentUrl
        if (src && el.getAttribute('src') !== src && el.src !== src) el.src = src
        await el.play().catch(() => {})
      }
      return playing
    }
    promoteCallAudioSession(micAudioSession ? 'play-and-record' : 'playback')
    unlockCallRingtoneAudio()
    const ctx = getCtx()
    if (ctx && ctx.state === 'suspended') {
      await ctx.resume().catch(() => {})
    }

    // WebAudio 已挂起：立刻回退 HTML，避免「假播放」无声
    if (activeEngine === 'webaudio' && isAppleClient() && !isWebAudioRunnable()) {
      fallbackAppleToHtml(currentUrl)
      return playing
    }

    if (activeEngine === 'html' || (!activeEngine && currentUrl)) {
      const el = getAudioEl()
      el.muted = false
      el.volume = 1
      if (el.paused && currentUrl) {
        const src =
          currentUrl === LOCAL_RINGBACK_ID
            ? ensureLocalRingback()
            : blobCache.get(currentUrl) || currentUrl
        if (src) {
          if (el.getAttribute('src') !== src && el.src !== src) {
            el.src = src
          }
          await el.play().catch(() => {})
        }
      }
      return playing
    }

    if (activeEngine === 'webaudio') {
      if (!loopSource && currentUrl && bufferCache.has(currentUrl)) {
        if (!playCallWebAudio(currentUrl, isAppleClient() ? APPLE_RING_GAIN : 1)) {
          if (isAppleClient()) fallbackAppleToHtml(currentUrl)
        }
      }
    }
    return playing
  } catch {
    return false
  }
}

export async function resumeCallRingtone() {
  return keepCallRingtoneAlive()
}

export async function prefetchCallRingtones() {
  if (prefetching) return
  prefetching = true
  try {
    unlockCallRingtoneAudio()
    // 登录后立刻预热本地回铃，避免首通点击同帧生成 WAV 卡顿
    ensureLocalRingback()
    const mine = await fetchMyRingtone(true)
    if (mine.enabled !== false && mine.url) persistMineUrl(mine.url)
    const urls = new Set<string>()
    if (mine.url) urls.add(mine.url)
    for (const item of mine.list || []) {
      if (item.url) urls.add(item.url)
    }
    if (preferredMineUrl) await ensureRingtoneCached(preferredMineUrl)
    await Promise.all(
      [...urls].filter((u) => u !== preferredMineUrl).map((u) => ensureRingtoneCached(u)),
    )
  } catch {
    /* ignore */
  } finally {
    prefetching = false
  }
}

/** 轻量预热：本地回铃 WAV（可在 idle 调用） */
export function warmLocalCallRingtone() {
  try {
    ensureLocalRingback()
  } catch {
    /* ignore */
  }
}

export async function prefetchRingtoneList(urls: string[]) {
  unlockCallRingtoneAudio()
  const list = [...new Set(urls.map((u) => (u || '').trim()).filter(Boolean))]
  await Promise.all(list.map((u) => ensureRingtoneCached(u)))
}

export function prefetchPeerRingtone(peerUserId: string | number) {
  const key = String(peerUserId)
  void fetchPeerRingtone(peerUserId)
    .then(async (peer) => {
      if (peer.url && peer.enabled !== false) {
        peerUrlCache.set(key, peer.url)
        await ensureRingtoneCached(peer.url)
        return peer.url
      }
      return ''
    })
    .catch(() => {})
}

export async function startCallRingtone(overrideUrl?: string, opts?: { vibrate?: boolean }) {
  try {
    unlockCallRingtoneAudio()
    if (opts?.vibrate !== false) {
      try {
        navigator.vibrate?.([200, 100, 200, 100, 200])
      } catch {
        /* ignore */
      }
    }
    if (overrideUrl) {
      const src = overrideUrl.trim()
      const ok = playBestAvailableSync(src)
      if (!bufferCache.has(src) && src !== LOCAL_RINGBACK_ID) void ensureRingtoneCached(src)
      return ok
    }

    const instant = preferredMineUrl
    const ok = playBestAvailableSync(instant || undefined)
    void fetchCallRingtoneConfig().then(async (cfg) => {
      if (!cfg.url || cfg.enabled === false) return
      persistMineUrl(cfg.url)
      await ensureRingtoneCached(cfg.url)
    })
    return ok
  } catch {
    playing = false
    return false
  }
}

export function startPeerCallRingtone(peerUserId: string | number): boolean {
  unlockCallRingtoneAudio()
  ensureLocalRingback()
  const key = String(peerUserId)

  const cachedPeer = peerUrlCache.get(key)
  const readyPeer =
    cachedPeer && (bufferCache.has(cachedPeer) || blobCache.has(cachedPeer)) ? cachedPeer : undefined
  const ok = playBestAvailableSync(readyPeer)

  void fetchPeerRingtone(peerUserId)
    .then(async (peer) => {
      if (peer.url && peer.enabled !== false) {
        peerUrlCache.set(key, peer.url)
        await ensureRingtoneCached(peer.url)
      }
    })
    .catch(() => {})

  return ok
}

export function stopCallRingtone() {
  playGen += 1
  playing = false
  currentUrl = ''
  activeEngine = ''
  micAudioSession = false
  stopRingWatch()
  stopWebAudio()
  try {
    navigator.vibrate?.(0)
  } catch {
    /* ignore */
  }
  if (!audio) return
  try {
    audio.pause()
    audio.currentTime = 0
  } catch {
    /* ignore */
  }
}

export async function playPreviewRingtone(url: string, onEnded?: () => void): Promise<boolean> {
  const src = (url || '').trim()
  if (!src) return false

  stopPreviewRingtone()
  const gen = ++previewGen
  unlockCallRingtoneAudio()
  promoteCallAudioSession('playback')

  const alive = () => gen === previewGen
  const markEnded = () => {
    if (alive()) onEnded?.()
  }

  const el = getPreviewEl()
  el.muted = false
  el.loop = false
  el.dataset.unlocked = '1'
  el.onended = markEnded

  const tryPlay = async (next: string) => {
    if (!alive()) return false
    try {
      el.pause()
    } catch {
      /* ignore */
    }
    el.src = next
    try {
      el.currentTime = 0
    } catch {
      /* ignore */
    }
    if (!alive()) return false
    await el.play()
    return alive()
  }

  const blob = blobCache.get(src) || ''
  try {
    if (await tryPlay(blob || src)) return true
  } catch {
    /* continue */
  }
  if (!alive()) return false

  try {
    const cached = await ensureRingtoneCached(src)
    if (!alive()) return false
    return await tryPlay(cached || src)
  } catch {
    return false
  }
}

function stopPreviewPlaybackOnly() {
  if (!previewAudio) return
  try {
    previewAudio.onended = null
    previewAudio.pause()
    previewAudio.currentTime = 0
  } catch {
    /* ignore */
  }
}

export function stopPreviewRingtone() {
  previewGen += 1
  stopPreviewPlaybackOnly()
}

export function isCallRingtonePlaying() {
  return playing
}

export function getPreferredRingtoneUrl() {
  return preferredMineUrl
}

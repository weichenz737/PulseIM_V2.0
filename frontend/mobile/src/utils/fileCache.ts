import { refreshTokenIfNeeded } from '@/api/http'
import { clearResumableDownloadParts, fetchResumableBlob, getResumableDownloadUsage } from '../../../shared/resumableDownload.ts'

export type ChatCacheKind = 'image' | 'video' | 'file' | 'audio'
export type ChatCacheVariant = 'thumb' | 'preview' | 'original'

export type ChatCacheType =
  | 'THUMBNAIL'
  | 'COMPRESSED_IMAGE'
  | 'ORIGINAL_IMAGE'
  | 'VIDEO_COVER'
  | 'COMPRESSED_VIDEO'
  | 'ORIGINAL_VIDEO'
  | 'AUDIO'
  | 'DOCUMENT'

export interface ChatCacheIndexEntry {
  fileId: string
  cacheType: ChatCacheType
  variant: ChatCacheVariant
  localPath: string
  fileSize: number
  hash: string
  createdAt: string
  lastAccessAt: string
}

const CACHE_NAME = 'pulse-chat-file-cache-v2'
const LEGACY_CACHE_NAME = 'pulse-chat-file-cache-v1'
const INDEX_PREFIX = 'pulse_chat_cache_index:'
const MEDIA_ORIGINAL_KEY_PREFIX = 'pulse_media_original_v2:'
const CACHE_MAX_BYTES = 512 * 1024 * 1024
const HASH_MAX_BYTES = 64 * 1024 * 1024
const objectUrlKeys = new Map<string, string>()
const inUseKeys = new Set<string>()
const inFlightKeys = new Set<string>()
const inFlightDownloads = new Map<string, Promise<string>>()
const inFlightKinds = new Map<string, ChatCacheKind>()
const pendingClearKeys = new Set<string>()
// CacheStorage stores the bytes, while the WebView renders an object URL.
// Reusing the object URL is important: creating a new one every time a chat
// is activated makes every <img>/<video> start a fresh decode and causes a
// visible flash even though the bytes are already cached.
const stableObjectUrls = new Map<string, string>()

function cacheScope(): string {
  try {
    const raw = localStorage.getItem('pulse_user_profile')
    const userId = raw ? JSON.parse(raw)?.userId : ''
    return encodeURIComponent(String(userId || 'anonymous'))
  } catch {
    return 'anonymous'
  }
}

function mediaOriginalStorageKey(): string {
  return `${MEDIA_ORIGINAL_KEY_PREFIX}${cacheScope()}`
}

function indexStorageKey(): string {
  return `${INDEX_PREFIX}${cacheScope()}`
}

function entryKey(fileId: string, variant: ChatCacheVariant): string {
  return `${String(fileId || '').trim()}::${variant}`
}

function cacheRequest(kind: ChatCacheKind, fileId: string, variant: ChatCacheVariant): Request {
  const encoded = [cacheScope(), kind, fileId, variant].map(encodeURIComponent).join('/')
  return new Request(`${window.location.origin}/__pulse_chat_cache__/${encoded}`)
}

function cacheTypeOf(kind: ChatCacheKind, variant: ChatCacheVariant): ChatCacheType {
  if (kind === 'image') {
    return variant === 'thumb' ? 'THUMBNAIL' : variant === 'preview' ? 'COMPRESSED_IMAGE' : 'ORIGINAL_IMAGE'
  }
  if (kind === 'video') {
    return variant === 'thumb' ? 'VIDEO_COVER' : variant === 'preview' ? 'COMPRESSED_VIDEO' : 'ORIGINAL_VIDEO'
  }
  if (kind === 'audio') return 'AUDIO'
  return 'DOCUMENT'
}

function readIndex(): ChatCacheIndexEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(indexStorageKey()) || '[]')
    return Array.isArray(raw) ? raw.filter((item) => item && item.fileId && item.localPath) : []
  } catch {
    return []
  }
}

function writeIndex(entries: ChatCacheIndexEntry[]): void {
  try {
    localStorage.setItem(indexStorageKey(), JSON.stringify(entries))
  } catch {
    // The index is an optimization; the attachment cache remains usable if storage is full.
  }
}

function touchIndex(kind: ChatCacheKind, fileId: string, variant: ChatCacheVariant, localPath?: string, size?: number, hash?: string): void {
  const now = new Date().toISOString()
  const entries = readIndex()
  const key = entryKey(fileId, variant)
  const existing = entries.find((item) => entryKey(item.fileId, item.variant) === key)
  if (existing) {
    existing.lastAccessAt = now
    if (localPath) existing.localPath = localPath
    if (size != null) existing.fileSize = size
    if (hash) existing.hash = hash
  } else if (localPath) {
    entries.push({
      fileId,
      cacheType: cacheTypeOf(kind, variant),
      variant,
      localPath,
      fileSize: Math.max(0, Number(size || 0)),
      hash: hash || '',
      createdAt: now,
      lastAccessAt: now,
    })
  }
  writeIndex(entries)
}

async function hashBlob(blob: Blob): Promise<string> {
  try {
    if (!globalThis.crypto?.subtle || blob.size > HASH_MAX_BYTES) return ''
    const digest = await globalThis.crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
    return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
  } catch {
    return ''
  }
}

function rememberObjectUrl(url: string, fileId: string, variant: ChatCacheVariant): void {
  const key = entryKey(fileId, variant)
  const previous = stableObjectUrls.get(key)
  if (previous && previous !== url) {
    URL.revokeObjectURL(previous)
    objectUrlKeys.delete(previous)
  }
  stableObjectUrls.set(key, url)
  objectUrlKeys.set(url, key)
}

function forgetObjectUrl(url: string): void {
  const key = objectUrlKeys.get(url)
  objectUrlKeys.delete(url)
  if (key && stableObjectUrls.get(key) === url) stableObjectUrls.delete(key)
  URL.revokeObjectURL(url)
}

/**
 * Returns the object URL already created for a cached attachment, if any.
 *
 * ChatView is intentionally not kept alive because it owns realtime
 * listeners and polling. On a chat remount, using this synchronous lookup
 * lets the message bubble reuse the same decoded-media source before the
 * asynchronous CacheStorage read finishes.
 */
export function getStableChatFileUrl(fileId: string, variant: ChatCacheVariant): string {
  const id = String(fileId || '').trim()
  return id ? stableObjectUrls.get(entryKey(id, variant)) || '' : ''
}

/** Reads a completed attachment from the app-private browser/WebView cache. */
export async function getCachedChatFile(
  kind: ChatCacheKind,
  fileId: string,
  variant: ChatCacheVariant,
): Promise<string> {
  const id = String(fileId || '').trim()
  if (!id || typeof caches === 'undefined') return ''
  try {
    const cache = await caches.open(CACHE_NAME)
    const request = cacheRequest(kind, id, variant)
    const response = await cache.match(request)
    if (!response) {
      const stale = stableObjectUrls.get(entryKey(id, variant))
      if (stale) forgetObjectUrl(stale)
      removeIndexEntries((item) => item.fileId === id && item.variant === variant)
      return ''
    }
    const stable = stableObjectUrls.get(entryKey(id, variant))
    if (stable) {
      touchIndex(kind, id, variant, request.url, Number(response.headers.get('Content-Length') || 0))
      return stable
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    rememberObjectUrl(url, id, variant)
    touchIndex(kind, id, variant, request.url, blob.size)
    return url
  } catch {
    return ''
  }
}

/** Downloads one attachment over HTTP, reports progress, then stores it in the chat cache. */
async function cacheChatFileInternal(
  kind: ChatCacheKind,
  fileId: string,
  variant: ChatCacheVariant,
  url: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<string> {
  const id = String(fileId || '').trim()
  const cacheKey = entryKey(id, variant)
  inFlightKeys.add(cacheKey)
  inFlightKinds.set(cacheKey, kind)
  try {
    const cached = await getCachedChatFile(kind, id, variant)
    if (cached) return cached
    const headers: HeadersInit = {}
    const token = await refreshTokenIfNeeded()
    if (token) headers.Authorization = `Bearer ${token}`
    const blob = await fetchResumableBlob({
      key: `mobile:${cacheScope()}:${kind}:${id}:${variant}`,
      url,
      headers,
      refreshToken: refreshTokenIfNeeded,
      onProgress,
    })
    const request = cacheRequest(kind, id, variant)
    if (typeof caches !== 'undefined' && id) {
      const cache = await caches.open(CACHE_NAME)
      await cache.put(request, new Response(blob, {
        headers: { 'Content-Type': blob.type, 'Content-Length': String(blob.size) },
      }))
      const now = new Date().toISOString()
      const entries = readIndex().filter((item) => entryKey(item.fileId, item.variant) !== entryKey(id, variant))
      entries.push({
        fileId: id,
        cacheType: cacheTypeOf(kind, variant),
        variant,
        localPath: request.url,
        fileSize: blob.size,
        hash: await hashBlob(blob),
        createdAt: now,
        lastAccessAt: now,
      })
      writeIndex(entries)
    }
    const objectUrl = URL.createObjectURL(blob)
    rememberObjectUrl(objectUrl, id, variant)
    return objectUrl
  } finally {
    inFlightKeys.delete(cacheKey)
    inFlightKinds.delete(cacheKey)
    if (pendingClearKeys.has(cacheKey) && !inUseKeys.has(cacheKey)) {
      pendingClearKeys.delete(cacheKey)
      void deleteCacheEntryKey(cacheKey)
    }
  }
}

/** Shares concurrent requests for the same local cache entry. */
export function cacheChatFile(
  kind: ChatCacheKind,
  fileId: string,
  variant: ChatCacheVariant,
  url: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<string> {
  const id = String(fileId || '').trim()
  if (!id) return cacheChatFileInternal(kind, id, variant, url, onProgress)
  const key = entryKey(id, variant)
  const existing = inFlightDownloads.get(key)
  if (existing) return existing
  const task = cacheChatFileInternal(kind, id, variant, url, onProgress)
  inFlightDownloads.set(key, task)
  void task.then(() => {
    if (inFlightDownloads.get(key) === task) inFlightDownloads.delete(key)
    void enforceCacheLimit(key)
  }, () => {
    if (inFlightDownloads.get(key) === task) inFlightDownloads.delete(key)
  })
  return task
}

function removeIndexEntries(predicate: (item: ChatCacheIndexEntry) => boolean): void {
  writeIndex(readIndex().filter((item) => !predicate(item)))
}

function readMediaOriginalMarkers(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(mediaOriginalStorageKey()) || '[]')
    return new Set(Array.isArray(raw) ? raw.filter((item) => typeof item === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeMediaOriginalMarkers(markers: Set<string>): void {
  try { localStorage.setItem(mediaOriginalStorageKey(), JSON.stringify([...markers])) } catch { /* best effort */ }
}

/** Clears device-local original-view preferences without touching messages or server files. */
export function forgetMediaOriginalMarkers(kind?: ChatCacheKind, fileId?: string): void {
  const markers = readMediaOriginalMarkers()
  if (!kind) {
    markers.clear()
  } else if (fileId) {
    markers.delete(`${kind}:${String(fileId).trim()}`)
  } else {
    for (const marker of markers) if (marker.startsWith(`${kind}:`)) markers.delete(marker)
  }
  writeMediaOriginalMarkers(markers)
}

function shouldClear(kind: ChatCacheKind | undefined, entry: ChatCacheIndexEntry): boolean {
  if (!kind) return true
  if (kind === 'image') return ['THUMBNAIL', 'COMPRESSED_IMAGE', 'ORIGINAL_IMAGE'].includes(entry.cacheType)
  if (kind === 'video') return ['VIDEO_COVER', 'COMPRESSED_VIDEO', 'ORIGINAL_VIDEO'].includes(entry.cacheType)
  if (kind === 'audio') return entry.cacheType === 'AUDIO'
  return entry.cacheType === 'DOCUMENT'
}

async function deleteCacheEntries(predicate: (item: ChatCacheIndexEntry) => boolean): Promise<void> {
  if (typeof caches === 'undefined') return
  const cache = await caches.open(CACHE_NAME)
  const entries = readIndex()
  const kept: ChatCacheIndexEntry[] = []
  await Promise.all(entries.map(async (entry) => {
    const key = entryKey(entry.fileId, entry.variant)
    if (!predicate(entry) || inUseKeys.has(key) || inFlightKeys.has(key)) {
      if (predicate(entry) && (inUseKeys.has(key) || inFlightKeys.has(key))) pendingClearKeys.add(key)
      kept.push(entry)
      return
    }
    await cache.delete(new Request(entry.localPath))
    objectUrlKeys.forEach((mappedKey, objectUrl) => {
      if (mappedKey === key && !inUseKeys.has(key)) {
        forgetObjectUrl(objectUrl)
      }
    })
  }))
  writeIndex(kept)
}

async function deleteCacheEntryKey(key: string): Promise<void> {
  if (typeof caches === 'undefined') return
  try {
    const cache = await caches.open(CACHE_NAME)
    const entries = readIndex()
    const matched = entries.filter((entry) => entryKey(entry.fileId, entry.variant) === key)
    await Promise.all(matched.map((entry) => cache.delete(new Request(entry.localPath))))
    objectUrlKeys.forEach((mappedKey, objectUrl) => {
      if (mappedKey === key && !inUseKeys.has(key)) {
        forgetObjectUrl(objectUrl)
      }
    })
    writeIndex(entries.filter((entry) => entryKey(entry.fileId, entry.variant) !== key))
  } catch {
    // Best effort; the next index reconciliation will remove stale rows.
  }
}

async function enforceCacheLimit(protectedKey = ''): Promise<void> {
  if (typeof caches === 'undefined') return
  try {
    let entries = await listChatCacheIndex()
    let total = entries.reduce((sum, entry) => sum + Math.max(0, Number(entry.fileSize || 0)), 0)
    if (total <= CACHE_MAX_BYTES) return
    const cache = await caches.open(CACHE_NAME)
    const candidates = [...entries].sort((a, b) => Date.parse(a.lastAccessAt || a.createdAt) - Date.parse(b.lastAccessAt || b.createdAt))
    for (const entry of candidates) {
      const key = entryKey(entry.fileId, entry.variant)
      if (total <= CACHE_MAX_BYTES) break
      if (key === protectedKey || inUseKeys.has(key) || inFlightKeys.has(key)) continue
      await cache.delete(new Request(entry.localPath))
      total -= Math.max(0, Number(entry.fileSize || 0))
      entries = entries.filter((item) => entryKey(item.fileId, item.variant) !== key)
      objectUrlKeys.forEach((mappedKey, objectUrl) => {
        if (mappedKey === key) {
          forgetObjectUrl(objectUrl)
        }
      })
    }
    writeIndex(entries)
  } catch {
    // Cache eviction is an optimization; a full browser quota is handled by
    // the cache write path and the next reconciliation.
  }
}

/** Clears only this device's chat attachment cache; messages and server files are untouched. */
export async function clearChatFileCache(kind?: ChatCacheKind): Promise<void> {
  if (typeof caches !== 'undefined') await caches.delete(LEGACY_CACHE_NAME)
  for (const [key, activeKind] of inFlightKinds) {
    if (!kind || activeKind === kind) pendingClearKeys.add(key)
  }
  forgetMediaOriginalMarkers(kind)
  await listChatCacheIndex()
  await deleteCacheEntries((entry) => shouldClear(kind, entry))
  await clearResumableDownloadParts(kind ? `mobile:${cacheScope()}:${kind}:` : `mobile:${cacheScope()}:`)
  window.dispatchEvent(new CustomEvent('pulse:chat-cache-cleared', { detail: { kind: kind || 'all' } }))
}

export async function clearCachedChatFile(fileId?: string, kind?: ChatCacheKind): Promise<void> {
  const id = String(fileId || '').trim()
  if (!id) {
    await clearChatFileCache(kind)
    return
  }
  for (const [key, activeKind] of inFlightKinds) {
    if (key.startsWith(`${id}::`) && (!kind || activeKind === kind)) pendingClearKeys.add(key)
  }
  if (kind) forgetMediaOriginalMarkers(kind, id)
  else {
    forgetMediaOriginalMarkers('image', id)
    forgetMediaOriginalMarkers('video', id)
  }
  await listChatCacheIndex()
  await deleteCacheEntries((entry) => entry.fileId === id && shouldClear(kind, entry))
  const partialKinds: ChatCacheKind[] = kind ? [kind] : ['image', 'video', 'file', 'audio']
  await Promise.all(partialKinds.map((partialKind) => (
    clearResumableDownloadParts(`mobile:${cacheScope()}:${partialKind}:${id}:`)
  )))
  window.dispatchEvent(new CustomEvent('pulse:chat-cache-cleared', { detail: { fileId: id, kind: kind || 'all' } }))
}

/** Marks a media variant as in use so a concurrent cache clear leaves it readable. */
export function markChatCacheInUse(fileId: string, variant: ChatCacheVariant, inUse: boolean): void {
  const key = entryKey(fileId, variant)
  if (inUse) inUseKeys.add(key)
  else {
    inUseKeys.delete(key)
    if (pendingClearKeys.delete(key)) void deleteCacheEntryKey(key)
  }
}

function parseCacheRequest(url: string): {
  scope: string
  kind: ChatCacheKind
  fileId: string
  variant: ChatCacheVariant
} | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean)
    const marker = parts.indexOf('__pulse_chat_cache__')
    if (marker < 0 || parts.length < marker + 5) return null
    const scope = decodeURIComponent(parts[marker + 1] || '')
    const kind = decodeURIComponent(parts[marker + 2] || '') as ChatCacheKind
    const fileId = decodeURIComponent(parts[marker + 3] || '')
    const variant = decodeURIComponent(parts[marker + 4] || '') as ChatCacheVariant
    if (!['image', 'video', 'file', 'audio'].includes(kind)) return null
    if (!['thumb', 'preview', 'original'].includes(variant) || !fileId) return null
    return { scope, kind, fileId, variant }
  } catch {
    return null
  }
}

/** Reconciles the index against real CacheStorage entries before storage statistics are shown. */
export async function listChatCacheIndex(): Promise<ChatCacheIndexEntry[]> {
  if (typeof caches === 'undefined') return []
  try {
    await caches.delete(LEGACY_CACHE_NAME)
    const cache = await caches.open(CACHE_NAME)
    const entries = readIndex()
    const validByKey = new Map<string, ChatCacheIndexEntry>()
    for (const entry of entries) {
      const response = await cache.match(new Request(entry.localPath))
      if (!response) continue
      const size = Number(response.headers.get('Content-Length') || entry.fileSize || 0)
      validByKey.set(entryKey(entry.fileId, entry.variant), {
        ...entry,
        fileSize: size,
        lastAccessAt: entry.lastAccessAt || entry.createdAt,
      })
    }
    // Rebuild missing index rows from real CacheStorage entries. This covers
    // interrupted index writes and makes cleanup/statistics reflect bytes
    // that actually exist on the device.
    for (const request of await cache.keys()) {
      const parsed = parseCacheRequest(request.url)
      if (!parsed || parsed.scope !== cacheScope()) continue
      const response = await cache.match(request)
      if (!response) continue
      const blob = await response.blob()
      const key = entryKey(parsed.fileId, parsed.variant)
      const existing = validByKey.get(key)
      if (existing) {
        validByKey.set(key, { ...existing, localPath: request.url, fileSize: blob.size })
        continue
      }
      const now = new Date().toISOString()
      validByKey.set(key, {
        fileId: parsed.fileId,
        cacheType: cacheTypeOf(parsed.kind, parsed.variant),
        variant: parsed.variant,
        localPath: request.url,
        fileSize: blob.size,
        hash: '',
        createdAt: now,
        lastAccessAt: now,
      })
    }
    const valid = [...validByKey.values()]
    writeIndex(valid)
    return valid
  } catch {
    return []
  }
}

export async function getChatCacheUsage(): Promise<Record<ChatCacheKind, number> & { total: number }> {
  const entries = await listChatCacheIndex()
  const usage: Record<ChatCacheKind, number> & { total: number } = { image: 0, video: 0, file: 0, audio: 0, total: 0 }
  entries.forEach((entry) => {
    const kind: ChatCacheKind = entry.cacheType.includes('IMAGE') || entry.cacheType === 'THUMBNAIL'
      ? 'image'
      : entry.cacheType.includes('VIDEO')
        ? 'video'
        : entry.cacheType === 'AUDIO' ? 'audio' : 'file'
    usage[kind] += Math.max(0, Number(entry.fileSize || 0))
    usage.total += Math.max(0, Number(entry.fileSize || 0))
  })
  const scope = `mobile:${cacheScope()}:`
  const partials = await Promise.all((['image', 'video', 'file', 'audio'] as ChatCacheKind[]).map(async (kind) => ({
    kind,
    bytes: await getResumableDownloadUsage(`${scope}${kind}:`),
  })))
  partials.forEach(({ kind, bytes }) => {
    usage[kind] += bytes
    usage.total += bytes
  })
  return usage
}

export async function clearAllChatFileCache(): Promise<void> {
  await clearChatFileCache()
}

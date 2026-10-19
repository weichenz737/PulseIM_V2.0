import { clearResumableDownloadParts, getResumableDownloadUsage } from '../../shared/resumableDownload.ts'

export type DesktopFileCacheCategory = 'image' | 'video' | 'audio' | 'file'
export type DesktopFileCacheVariant = 'thumb' | 'preview' | 'original'
export type DesktopCacheType =
  | 'THUMBNAIL'
  | 'COMPRESSED_IMAGE'
  | 'ORIGINAL_IMAGE'
  | 'VIDEO_COVER'
  | 'COMPRESSED_VIDEO'
  | 'ORIGINAL_VIDEO'
  | 'AUDIO'
  | 'DOCUMENT'

export interface DesktopCacheIndexEntry {
  fileId: string
  cacheType: DesktopCacheType
  variant: DesktopFileCacheVariant
  localPath: string
  fileSize: number
  hash: string
  createdAt: string
  lastAccessAt: string
}

// v8 invalidates completed entries created while media could remain a 1x1
// placeholder after a failed rendition load.
// Those entries can be valid Blob responses while still containing only a
// transparent 1x1 image, so reusing them would keep the chat stuck on a bar.
const DESKTOP_FILE_CACHE_NAME = 'pulse-desktop-chat-files-v8'
const LEGACY_DESKTOP_FILE_CACHE_NAMES = [
  'pulse-desktop-chat-files-v1',
  'pulse-desktop-chat-files-v2',
  'pulse-desktop-chat-files-v3',
  'pulse-desktop-chat-files-v4',
  'pulse-desktop-chat-files-v5',
  'pulse-desktop-chat-files-v6',
  'pulse-desktop-chat-files-v7',
]
const INDEX_KEY_PREFIX = 'pulse_desktop_chat_cache_index:'
const CACHE_MAX_BYTES = 1024 * 1024 * 1024
const HASH_MAX_BYTES = 64 * 1024 * 1024
const inUseKeys = new Set<string>()
const inFlightKeys = new Set<string>()
const inFlightLoads = new Map<string, Promise<Blob>>()
const inFlightCategories = new Map<string, DesktopFileCacheCategory>()
const pendingClearKeys = new Set<string>()

function cacheScope(): string {
  try {
    const raw = localStorage.getItem('pulse_user_profile')
    const userId = raw ? JSON.parse(raw)?.userId : ''
    return encodeURIComponent(String(userId || 'anonymous'))
  } catch {
    return 'anonymous'
  }
}

function indexKey(): string {
  return `${INDEX_KEY_PREFIX}${cacheScope()}`
}

function cacheRequest(fileId: string, category: DesktopFileCacheCategory, variant: DesktopFileCacheVariant): Request {
  const safeId = encodeURIComponent(String(fileId || '').trim())
  return new Request(`https://pulse.local/cache/${cacheScope()}/${category}/${safeId}/${variant}`)
}

function cacheTypeOf(category: DesktopFileCacheCategory, variant: DesktopFileCacheVariant): DesktopCacheType {
  if (category === 'image') return variant === 'thumb' ? 'THUMBNAIL' : variant === 'preview' ? 'COMPRESSED_IMAGE' : 'ORIGINAL_IMAGE'
  if (category === 'video') return variant === 'thumb' ? 'VIDEO_COVER' : variant === 'preview' ? 'COMPRESSED_VIDEO' : 'ORIGINAL_VIDEO'
  if (category === 'audio') return 'AUDIO'
  return 'DOCUMENT'
}

function entryKey(fileId: string, variant: DesktopFileCacheVariant): string {
  return `${String(fileId || '').trim()}::${variant}`
}

async function isUsableDesktopCachedBlob(blob: Blob, category: DesktopFileCacheCategory): Promise<boolean> {
  if (!blob?.size) return false
  const contentType = String(blob.type || '').toLowerCase()
  if (category === 'image') {
    if (!contentType.startsWith('image/')) return false
    // A failed rendition can still be a syntactically valid image response
    // containing only a transparent 1x1 placeholder. Do not persist or reuse
    // that response as a chat thumbnail.
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(blob)
        const usable = bitmap.width > 1 && bitmap.height > 1
        bitmap.close()
        return usable
      } catch {
        return false
      }
    }
    return true
  }
  if (category === 'video') return contentType.startsWith('video/')
  if (category === 'audio') return contentType.startsWith('audio/')
  return !contentType.startsWith('text/') && !contentType.includes('json') && !contentType.includes('html')
}

function readIndex(): DesktopCacheIndexEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(indexKey()) || '[]')
    return Array.isArray(parsed) ? parsed.filter((entry) => entry?.fileId && entry?.localPath) : []
  } catch {
    return []
  }
}

function writeIndex(entries: DesktopCacheIndexEntry[]): void {
  try { localStorage.setItem(indexKey(), JSON.stringify(entries)) } catch { /* best effort */ }
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

function touchIndex(category: DesktopFileCacheCategory, fileId: string, variant: DesktopFileCacheVariant, localPath: string, size?: number, hash?: string): void {
  const now = new Date().toISOString()
  const key = entryKey(fileId, variant)
  const entries = readIndex()
  const existing = entries.find((entry) => entryKey(entry.fileId, entry.variant) === key)
  if (existing) {
    existing.lastAccessAt = now
    existing.localPath = localPath
    if (size != null) existing.fileSize = size
    if (hash) existing.hash = hash
  } else {
    entries.push({ fileId, cacheType: cacheTypeOf(category, variant), variant, localPath, fileSize: Math.max(0, Number(size || 0)), hash: hash || '', createdAt: now, lastAccessAt: now })
  }
  writeIndex(entries)
}

/**
 * Persistent local cache for chat attachments. It contains HTTP responses only;
 * deleting it never touches MinIO, the server DB, saved files, or messages.
 */
async function fetchDesktopCachedFileBlobInternal(
  fileId: string,
  category: DesktopFileCacheCategory,
  variant: DesktopFileCacheVariant,
  loader: () => Promise<Blob>,
): Promise<Blob> {
  const id = String(fileId || '').trim()
  if (!id || !('caches' in window)) return loader()
  const key = entryKey(id, variant)
  inFlightKeys.add(key)
  inFlightCategories.set(key, category)
  try {
    // CacheStorage is only an optimization. Some browsers reject open/match
    // in private mode, after a storage quota change, or when site storage is
    // disabled. A cache failure must never prevent the authenticated download
    // from reaching the visible media element.
    let cache: Cache | null = null
    try {
      cache = await window.caches.open(DESKTOP_FILE_CACHE_NAME)
    } catch {
      return loader()
    }
    const request = cacheRequest(id, category, variant)
    let cached: Response | undefined
    try {
      cached = await cache.match(request)
    } catch {
      return loader()
    }
    if (cached) {
      const blob = await cached.blob()
      if (await isUsableDesktopCachedBlob(blob, category)) {
        touchIndex(category, id, variant, request.url, blob.size)
        return blob
      }
      // A previous failed request may have cached an API error body. Never
      // feed that body to an image/video element or keep the UI on its 1x1
      // placeholder forever.
      try {
        await cache.delete(request)
      } catch {
        // The fresh authenticated request below is still safe to continue.
      }
      writeIndex(readIndex().filter((entry) => entryKey(entry.fileId, entry.variant) !== key))
    }
    const blob = await loader()
    const blobUsable = Boolean(blob?.size) && await isUsableDesktopCachedBlob(blob, category)
    if (blobUsable) {
      // CacheStorage is an optimization only. In Electron/file:// contexts
      // cache.put can be unavailable even when the authenticated download
      // itself succeeded; that must not turn a real image into a placeholder.
      try {
        await cache.put(request, new Response(blob, { headers: { 'Content-Type': blob.type || 'application/octet-stream', 'Content-Length': String(blob.size) } }))
        touchIndex(category, id, variant, request.url, blob.size, await hashBlob(blob))
      } catch {
        // Keep the freshly downloaded Blob in the current render path.
      }
    }
    if (category === 'image' && !blobUsable) {
      // Let the visible-media loader choose its original-file fallback, but
      // never leave the invalid rendition in the persistent cache.
      try { await cache.delete(request) } catch { /* best effort */ }
      writeIndex(readIndex().filter((entry) => entryKey(entry.fileId, entry.variant) !== key))
    }
    return blob
  } finally {
    inFlightKeys.delete(key)
    inFlightCategories.delete(key)
    if (pendingClearKeys.has(key) && !inUseKeys.has(key)) {
      pendingClearKeys.delete(key)
      void deleteDesktopCacheEntryKey(key)
    }
  }
}

/** Shares concurrent requests for the same desktop cache entry. */
export function fetchDesktopCachedFileBlob(
  fileId: string,
  category: DesktopFileCacheCategory,
  variant: DesktopFileCacheVariant,
  loader: () => Promise<Blob>,
): Promise<Blob> {
  const id = String(fileId || '').trim()
  if (!id) return fetchDesktopCachedFileBlobInternal(id, category, variant, loader)
  const key = entryKey(id, variant)
  const existing = inFlightLoads.get(key)
  if (existing) return existing
  const task = fetchDesktopCachedFileBlobInternal(id, category, variant, loader)
  inFlightLoads.set(key, task)
  void task.then(() => {
    if (inFlightLoads.get(key) === task) inFlightLoads.delete(key)
    void enforceDesktopCacheLimit(key)
  }, () => {
    if (inFlightLoads.get(key) === task) inFlightLoads.delete(key)
  })
  return task
}

/** Returns a completed local attachment without starting a network request. */
export async function getDesktopCachedFileBlob(
  fileId: string,
  category: DesktopFileCacheCategory,
  variant: DesktopFileCacheVariant,
): Promise<Blob | null> {
  const id = String(fileId || '').trim()
  if (!id || !('caches' in window)) return null
  try {
    const cache = await window.caches.open(DESKTOP_FILE_CACHE_NAME)
    const request = cacheRequest(id, category, variant)
    const response = await cache.match(request)
    if (!response) return null
    const blob = await response.blob()
    if (!(await isUsableDesktopCachedBlob(blob, category))) {
      await cache.delete(request)
      writeIndex(readIndex().filter((entry) => entryKey(entry.fileId, entry.variant) !== entryKey(id, variant)))
      return null
    }
    touchIndex(category, id, variant, request.url, blob.size)
    return blob.size ? blob : null
  } catch {
    return null
  }
}

/** Removes one invalidated local rendition without touching the server file. */
export async function deleteDesktopCachedFile(
  fileId: string,
  category: DesktopFileCacheCategory,
  variant: DesktopFileCacheVariant,
): Promise<void> {
  const id = String(fileId || '').trim()
  if (!id || !('caches' in window)) return
  try {
    const cache = await window.caches.open(DESKTOP_FILE_CACHE_NAME)
    await cache.delete(cacheRequest(id, category, variant))
    writeIndex(readIndex().filter((entry) => entryKey(entry.fileId, entry.variant) !== entryKey(id, variant)))
  } catch {
    // Cache cleanup is best effort; the next read will validate it again.
  }
}

function matchesType(kind: DesktopFileCacheCategory | undefined, entry: DesktopCacheIndexEntry): boolean {
  if (!kind) return true
  if (kind === 'image') return entry.cacheType === 'THUMBNAIL' || entry.cacheType.includes('IMAGE')
  if (kind === 'video') return entry.cacheType.includes('VIDEO')
  if (kind === 'audio') return entry.cacheType === 'AUDIO'
  return entry.cacheType === 'DOCUMENT'
}

async function deleteDesktopCacheEntryKey(key: string): Promise<void> {
  if (!('caches' in window)) return
  try {
    const cache = await window.caches.open(DESKTOP_FILE_CACHE_NAME)
    const entries = readIndex()
    await Promise.all(entries
      .filter((entry) => entryKey(entry.fileId, entry.variant) === key)
      .map((entry) => cache.delete(new Request(entry.localPath))))
    writeIndex(entries.filter((entry) => entryKey(entry.fileId, entry.variant) !== key))
  } catch {
    // Best effort; reconciliation removes stale index rows later.
  }
}

async function enforceDesktopCacheLimit(protectedKey = ''): Promise<void> {
  if (!('caches' in window)) return
  try {
    let entries = await listDesktopFileCacheIndex()
    let total = entries.reduce((sum, entry) => sum + Math.max(0, Number(entry.fileSize || 0)), 0)
    if (total <= CACHE_MAX_BYTES) return
    const cache = await window.caches.open(DESKTOP_FILE_CACHE_NAME)
    const candidates = [...entries].sort((a, b) => Date.parse(a.lastAccessAt || a.createdAt) - Date.parse(b.lastAccessAt || b.createdAt))
    for (const entry of candidates) {
      if (total <= CACHE_MAX_BYTES) break
      const key = entryKey(entry.fileId, entry.variant)
      if (key === protectedKey || inUseKeys.has(key) || inFlightKeys.has(key)) continue
      await cache.delete(new Request(entry.localPath))
      total -= Math.max(0, Number(entry.fileSize || 0))
      entries = entries.filter((item) => entryKey(item.fileId, item.variant) !== key)
    }
    writeIndex(entries)
  } catch {
    // Cache eviction is an optimization; quota errors remain recoverable.
  }
}

export async function listDesktopFileCacheIndex(): Promise<DesktopCacheIndexEntry[]> {
  if (!('caches' in window)) return []
  try {
    await Promise.all(LEGACY_DESKTOP_FILE_CACHE_NAMES.map((name) => window.caches.delete(name)))
    const cache = await window.caches.open(DESKTOP_FILE_CACHE_NAME)
    const validByKey = new Map<string, DesktopCacheIndexEntry>()
    for (const entry of readIndex()) {
      const response = await cache.match(new Request(entry.localPath))
      if (!response) continue
      validByKey.set(entryKey(entry.fileId, entry.variant), {
        ...entry,
        fileSize: Number(response.headers.get('Content-Length') || entry.fileSize || 0),
      })
    }
    for (const request of await cache.keys()) {
      const parsed = parseDesktopCacheRequest(request.url)
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
        cacheType: cacheTypeOf(parsed.category, parsed.variant),
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

export async function clearDesktopFileCache(kind?: DesktopFileCacheCategory): Promise<void> {
  const cacheStorage: CacheStorage | undefined = typeof window !== 'undefined' ? window.caches : undefined
  if (!cacheStorage) {
    await clearResumableDownloadParts(kind ? `desktop:${kind}:` : 'desktop:')
    window.dispatchEvent(new CustomEvent('pulse:desktop-chat-cache-cleared', { detail: { kind: kind || 'all' } }))
    return
  }
  await Promise.all(LEGACY_DESKTOP_FILE_CACHE_NAMES.map((name) => cacheStorage.delete(name)))
  for (const [key, activeKind] of inFlightCategories) {
    if (!kind || activeKind === kind) pendingClearKeys.add(key)
  }
  await listDesktopFileCacheIndex()
  const cache = await cacheStorage.open(DESKTOP_FILE_CACHE_NAME)
  const kept: DesktopCacheIndexEntry[] = []
  for (const entry of readIndex()) {
    const key = entryKey(entry.fileId, entry.variant)
    if (!matchesType(kind, entry) || inUseKeys.has(key) || inFlightKeys.has(key)) {
      if (matchesType(kind, entry) && (inUseKeys.has(key) || inFlightKeys.has(key))) pendingClearKeys.add(key)
      kept.push(entry)
      continue
    }
    await cache.delete(new Request(entry.localPath))
  }
  writeIndex(kept)
  await clearResumableDownloadParts(kind ? `desktop:${kind}:` : 'desktop:')
  window.dispatchEvent(new CustomEvent('pulse:desktop-chat-cache-cleared', { detail: { kind: kind || 'all' } }))
}

function parseDesktopCacheRequest(url: string): {
  scope: string
  category: DesktopFileCacheCategory
  fileId: string
  variant: DesktopFileCacheVariant
} | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean)
    const marker = parts.indexOf('cache')
    if (marker < 0 || parts.length < marker + 4) return null
    const scope = decodeURIComponent(parts[marker + 1] || '')
    const category = decodeURIComponent(parts[marker + 2] || '') as DesktopFileCacheCategory
    const fileId = decodeURIComponent(parts[marker + 3] || '')
    const variant = decodeURIComponent(parts[marker + 4] || '') as DesktopFileCacheVariant
    if (!['image', 'video', 'audio', 'file'].includes(category)) return null
    if (!['thumb', 'preview', 'original'].includes(variant) || !fileId) return null
    return { scope, category, fileId, variant }
  } catch {
    return null
  }
}

export function markDesktopFileCacheInUse(fileId: string, variant: DesktopFileCacheVariant, inUse: boolean): void {
  const key = entryKey(fileId, variant)
  if (inUse) inUseKeys.add(key)
  else {
    inUseKeys.delete(key)
    if (pendingClearKeys.delete(key)) void deleteDesktopCacheEntryKey(key)
  }
}

export async function getDesktopFileCacheUsage(): Promise<Record<DesktopFileCacheCategory, number> & { total: number }> {
  const entries = await listDesktopFileCacheIndex()
  const usage: Record<DesktopFileCacheCategory, number> & { total: number } = { image: 0, video: 0, audio: 0, file: 0, total: 0 }
  entries.forEach((entry) => {
    const kind: DesktopFileCacheCategory = entry.cacheType.includes('IMAGE') || entry.cacheType === 'THUMBNAIL'
      ? 'image'
      : entry.cacheType.includes('VIDEO') ? 'video' : entry.cacheType === 'AUDIO' ? 'audio' : 'file'
    usage[kind] += Math.max(0, Number(entry.fileSize || 0))
    usage.total += Math.max(0, Number(entry.fileSize || 0))
  })
  const partials = await Promise.all((['image', 'video', 'file', 'audio'] as DesktopFileCacheCategory[]).map(async (category) => ({
    category,
    bytes: await getResumableDownloadUsage(`desktop:${category}:`),
  })))
  partials.forEach(({ category, bytes }) => {
    usage[category] += bytes
    usage.total += bytes
  })
  return usage
}

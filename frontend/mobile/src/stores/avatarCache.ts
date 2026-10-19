import { getToken, refreshTokenIfNeeded } from '@/api/http'
import { fetchBinaryResponse } from '../../../shared/resumableDownload.ts'

const STORAGE_KEY = 'pulse_avatar_cache_v1'
const MAX_ENTRIES = 160
const ACCOUNT_AVATAR_CACHE_NAME = 'pulse-account-avatar-cache-v1'
const CHAT_AVATAR_CACHE_NAME = 'pulse-chat-avatar-cache-v1'

const memoryCache = new Map<string, string>()
const accountAvatarObjectUrls = new Map<string, { source: string; url: string }>()
const accountAvatarLoads = new Map<string, Promise<string>>()
const chatAvatarObjectUrls = new Map<string, { source: string; url: string }>()
const chatAvatarLoads = new Map<string, Promise<string>>()
let storageLoaded = false

function cacheKey(ownerId: string, targetId: string, kind: 'user' | 'group'): string {
  return `${kind}:${String(ownerId || '').trim()}:${String(targetId || '').trim()}`
}

function loadStorage(): void {
  if (storageLoaded) return
  storageLoaded = true
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const saved = JSON.parse(raw) as Record<string, unknown>
    Object.entries(saved).forEach(([key, value]) => {
      const avatar = typeof value === 'string' ? value.trim() : ''
      if (key && avatar) memoryCache.set(key, avatar)
    })
  } catch {
    // Avatar caching is best effort; the route-provided avatar remains usable.
  }
}

function trimCache(): void {
  while (memoryCache.size > MAX_ENTRIES) {
    const oldest = memoryCache.keys().next().value
    if (oldest === undefined) break
    memoryCache.delete(oldest)
  }
}

function persistStorage(): void {
  try {
    const entries = [...memoryCache.entries()].slice(-MAX_ENTRIES)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    // Storage may be unavailable or full; memory cache still helps this session.
  }
}

/** Return the last known avatar without starting a network request. */
export function getCachedAvatar(
  ownerId: string,
  targetId: string,
  kind: 'user' | 'group' = 'user',
): string {
  const key = cacheKey(ownerId, targetId, kind)
  if (!ownerId || !targetId) return ''
  loadStorage()
  const avatar = memoryCache.get(key) || ''
  if (avatar) {
    // Refresh LRU position so active accounts remain available longer.
    memoryCache.delete(key)
    memoryCache.set(key, avatar)
  }
  return avatar
}

/** Save a stable, already-resolved avatar URL for the next chat entry. */
export function setCachedAvatar(
  ownerId: string,
  targetId: string,
  avatar: string,
  kind: 'user' | 'group' = 'user',
): void {
  if (
    !ownerId
    || !targetId
    || !avatar
    || avatar.startsWith('data:')
    || avatar.startsWith('blob:')
  ) return
  loadStorage()
  const key = cacheKey(ownerId, targetId, kind)
  memoryCache.delete(key)
  memoryCache.set(key, avatar)
  trimCache()
  persistStorage()
}

export function removeCachedAvatar(
  ownerId: string,
  targetId: string,
  kind: 'user' | 'group' = 'user',
): void {
  loadStorage()
  memoryCache.delete(cacheKey(ownerId, targetId, kind))
  persistStorage()
}

/** Protected file downloads cannot be used by a plain <img> without a token. */
export function isProtectedAvatarUrl(source: string): boolean {
  const url = String(source || '').trim()
  if (!url) return false
  try {
    const pathname = new URL(url, window.location.origin).pathname
    return /^\/(?:api\/)?v1\/files\/[^/]+\/download\/?$/.test(pathname)
  } catch {
    return false
  }
}

/** Avatar endpoints are safe to cache as bytes and render from a stable Blob URL. */
export function isCacheableAvatarUrl(source: string): boolean {
  const url = String(source || '').trim()
  if (!url) return false
  try {
    const pathname = new URL(url, window.location.origin).pathname
    return isProtectedAvatarUrl(url) || /^\/(?:api\/)?v1\/files\/raw\/[^/]+$/.test(pathname)
  } catch {
    return false
  }
}

function accountAvatarRequest(userId: string, source: string): Request {
  const key = encodeURIComponent(`${String(userId || '').trim()}:${String(source || '').trim()}`)
  return new Request(`${window.location.origin}/__pulse_account_avatar_cache__/${key}`)
}

/** Return a stable object URL for a saved account avatar when this session has one. */
export function getCachedAccountAvatar(userId: string, source = ''): string {
  const id = String(userId || '').trim()
  const item = accountAvatarObjectUrls.get(id)
  if (!id || !item || (source && item.source !== source)) return ''
  return item.url
}

/**
 * Read or download a saved account avatar once and keep its bytes in CacheStorage.
 * The account token is used because the avatar endpoint may require auth and the
 * active session can belong to a different saved account.
 */
export async function loadCachedAccountAvatar(
  userId: string,
  source: string,
  token = '',
): Promise<string> {
  const id = String(userId || '').trim()
  const url = String(source || '').trim()
  if (!id || !url || url.startsWith('data:') || url.startsWith('blob:')) return ''

  const stable = getCachedAccountAvatar(id, url)
  if (stable) return stable

  const loadKey = `${id}:${url}`
  const existing = accountAvatarLoads.get(loadKey)
  if (existing) return existing

  const task = (async () => {
    if (typeof caches === 'undefined') return ''
    try {
      const cache = await caches.open(ACCOUNT_AVATAR_CACHE_NAME)
      const request = accountAvatarRequest(id, url)
      let response = await cache.match(request)
      if (!response) {
        const authToken = token || await refreshTokenIfNeeded() || getToken() || ''
        const headers: HeadersInit = authToken ? { Authorization: `Bearer ${authToken}` } : {}
        const fetched = await fetchBinaryResponse(url, { credentials: 'include', headers })
        if (!fetched.ok) return ''
        response = fetched.clone()
        await cache.put(request, fetched)
      }
      const objectUrl = URL.createObjectURL(await response.blob())
      const previous = accountAvatarObjectUrls.get(id)
      if (previous && previous.url !== objectUrl) URL.revokeObjectURL(previous.url)
      accountAvatarObjectUrls.set(id, { source: url, url: objectUrl })
      return objectUrl
    } catch {
      return ''
    }
  })()
  accountAvatarLoads.set(loadKey, task)
  try {
    return await task
  } finally {
    if (accountAvatarLoads.get(loadKey) === task) accountAvatarLoads.delete(loadKey)
  }
}

export function getCachedUserAvatar(
  ownerId: string,
  targetId: string,
  source: string,
  kind: 'user' | 'group' = 'user',
): string {
  const owner = String(ownerId || '').trim()
  const target = String(targetId || '').trim()
  if (!target) return ''
  if (kind === 'user' && owner && owner === target) {
    return getCachedAccountAvatar(target, source)
  }
  return getCachedChatAvatar(owner, target, source, kind)
}

export async function loadCachedUserAvatar(
  ownerId: string,
  targetId: string,
  source: string,
  kind: 'user' | 'group' = 'user',
): Promise<string> {
  const owner = String(ownerId || '').trim()
  const target = String(targetId || '').trim()
  if (!target) return ''
  if (kind === 'user' && owner && owner === target) {
    return loadCachedAccountAvatar(target, source)
  }
  return loadCachedChatAvatar(owner, target, source, kind)
}

function chatAvatarKey(
  ownerId: string,
  targetId: string,
  source: string,
  kind: 'user' | 'group',
): string {
  return `${kind}:${String(ownerId || '').trim()}:${String(targetId || '').trim()}:${String(source || '').trim()}`
}

function chatAvatarRequest(key: string): Request {
  return new Request(`${window.location.origin}/__pulse_chat_avatar_cache__/${encodeURIComponent(key)}`)
}

/** Return a stable object URL for a chat avatar already loaded in this app. */
export function getCachedChatAvatar(
  ownerId: string,
  targetId: string,
  source: string,
  kind: 'user' | 'group' = 'user',
): string {
  const key = chatAvatarKey(ownerId, targetId, source, kind)
  return chatAvatarObjectUrls.get(key)?.url || ''
}

/**
 * Load a chat avatar into the app-private cache. The returned object URL is
 * stable across ChatView remounts, so returning to a conversation does not
 * start another image request or show the initials placeholder first.
 */
export async function loadCachedChatAvatar(
  ownerId: string,
  targetId: string,
  source: string,
  kind: 'user' | 'group' = 'user',
): Promise<string> {
  const owner = String(ownerId || '').trim()
  const target = String(targetId || '').trim()
  const url = String(source || '').trim()
  if (!owner || !target || !url || url.startsWith('data:') || url.startsWith('blob:')) return ''

  const key = chatAvatarKey(owner, target, url, kind)
  const stable = chatAvatarObjectUrls.get(key)
  if (stable?.source === url) return stable.url
  const existing = chatAvatarLoads.get(key)
  if (existing) return existing

  const task = (async () => {
    if (typeof caches === 'undefined') return ''
    try {
      const cache = await caches.open(CHAT_AVATAR_CACHE_NAME)
      const request = chatAvatarRequest(key)
      let response = await cache.match(request)
      if (!response) {
        const token = await refreshTokenIfNeeded() || getToken()
        const fetched = await fetchBinaryResponse(url, {
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (!fetched.ok) return ''
        await cache.put(request, fetched.clone())
        response = fetched
      }
      const objectUrl = URL.createObjectURL(await response.blob())
      const previous = chatAvatarObjectUrls.get(key)
      if (previous && previous.url !== objectUrl) URL.revokeObjectURL(previous.url)
      chatAvatarObjectUrls.set(key, { source: url, url: objectUrl })
      return objectUrl
    } catch {
      return ''
    }
  })()
  chatAvatarLoads.set(key, task)
  try {
    return await task
  } finally {
    if (chatAvatarLoads.get(key) === task) chatAvatarLoads.delete(key)
  }
}

import { fetchMessages, type ChatMessage } from '@/api/message'
import { SERVER_ORIGIN } from '@/config/endpoints'

const MAX_ENTRIES = 8
const MAX_AGE_MS = 2 * 60_000
const cache = new Map<string, { at: number; messages: ChatMessage[] }>()
const pending = new Map<string, Promise<ChatMessage[]>>()
let cacheGeneration = 0

function persistentKey(conversationId: string): string {
  try {
    const profile = JSON.parse(localStorage.getItem('pulse_user_profile') || 'null')
    if (!profile?.userId) return ''
    return `pulse_chat_messages_v1:${encodeURIComponent(SERVER_ORIGIN || window.location.origin)}:${profile.userId}:${encodeURIComponent(conversationId)}`
  } catch { return '' }
}

function readPersistentMessages(key: string): ChatMessage[] | null {
  if (!key) return null
  try {
    const list = JSON.parse(localStorage.getItem(key) || 'null')
    return Array.isArray(list) && list.every((item) => item && typeof item.id === 'string') ? list : null
  } catch { return null }
}

function trimCache() {
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

export function getCachedChatMessages(conversationId: string): ChatMessage[] | null {
  const key = persistentKey(conversationId)
  const hit = cache.get(key)
  if (!hit || Date.now() - hit.at > MAX_AGE_MS) {
    cache.delete(key)
    return readPersistentMessages(key)
  }
  // Refresh LRU position without retaining Vue's reactive array proxy.
  cache.delete(key)
  cache.set(key, hit)
  return hit.messages.slice()
}

export function setCachedChatMessages(conversationId: string, messages: ChatMessage[]) {
  const key = persistentKey(conversationId)
  if (!key) return
  const recent = messages.slice(-40)
  cache.delete(key)
  cache.set(key, { at: Date.now(), messages: recent })
  try { localStorage.setItem(key, JSON.stringify(recent)) } catch { /* Keep the memory cache when storage is full. */ }
  trimCache()
}

export function clearChatWarmCache() {
  cache.clear()
  pending.clear()
  cacheGeneration += 1
}

export function warmChatMessages(conversationId: string, userId: string, limit = 20) {
  const key = persistentKey(conversationId)
  const pendingKey = key || conversationId
  const active = pending.get(pendingKey)
  if (active) return active

  const generation = cacheGeneration
  const task = fetchMessages(conversationId, userId || 'me', { limit })
    .then((messages) => {
      if (generation === cacheGeneration && persistentKey(conversationId) === key) setCachedChatMessages(conversationId, messages)
      return messages.slice()
    })
    .finally(() => { if (pending.get(pendingKey) === task) pending.delete(pendingKey) })
  pending.set(pendingKey, task)
  return task
}

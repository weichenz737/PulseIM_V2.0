import { fetchMessages, type ChatMessage } from '@/api/message'

const MAX_ENTRIES = 8
const MAX_AGE_MS = 2 * 60_000
const cache = new Map<string, { at: number; messages: ChatMessage[] }>()
const pending = new Map<string, Promise<ChatMessage[]>>()
let cacheGeneration = 0

function trimCache() {
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

export function getCachedChatMessages(conversationId: string): ChatMessage[] | null {
  const hit = cache.get(conversationId)
  if (!hit || Date.now() - hit.at > MAX_AGE_MS) {
    cache.delete(conversationId)
    return null
  }
  // Refresh LRU position without retaining Vue's reactive array proxy.
  cache.delete(conversationId)
  cache.set(conversationId, hit)
  return hit.messages.slice()
}

export function setCachedChatMessages(conversationId: string, messages: ChatMessage[]) {
  cache.delete(conversationId)
  cache.set(conversationId, { at: Date.now(), messages: messages.slice(-40) })
  trimCache()
}

export function clearChatWarmCache() {
  cache.clear()
  pending.clear()
  cacheGeneration += 1
}

export function warmChatMessages(conversationId: string, userId: string, limit = 20) {
  const active = pending.get(conversationId)
  if (active) return active

  const generation = cacheGeneration
  const task = fetchMessages(conversationId, userId || 'me', { limit })
    .then((messages) => {
      if (generation === cacheGeneration) setCachedChatMessages(conversationId, messages)
      return messages.slice()
    })
    .finally(() => pending.delete(conversationId))
  pending.set(conversationId, task)
  return task
}

import { useUserStore } from '@/stores/user'

type LocalClearMarkers = Record<string, number>

const STORAGE_KEY_PREFIX = 'pulse_local_chat_history_clear:'

function userScope(): string {
  return useUserStore().userId || 'anonymous'
}

function storageKey(): string {
  return `${STORAGE_KEY_PREFIX}${userScope()}`
}

function readMarkers(): LocalClearMarkers {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey()) || '{}')
    if (!raw || typeof raw !== 'object') return {}
    return Object.fromEntries(
      Object.entries(raw).filter(([, value]) => Number.isFinite(Number(value))),
    ) as LocalClearMarkers
  } catch {
    return {}
  }
}

function messageTime(message: { createdAt?: string }): number {
  const value = Date.parse(String(message.createdAt || ''))
  return Number.isFinite(value) ? value : 0
}

function clearMarker(conversationId: string): number {
  return Number(readMarkers()[String(conversationId)] || 0)
}

export function markConversationsLocallyCleared(conversationIds: string[], clearedAt = Date.now()): void {
  const markers = readMarkers()
  const timestamp = Math.max(1, Number(clearedAt) || Date.now())
  conversationIds.forEach((conversationId) => {
    if (conversationId) markers[String(conversationId)] = timestamp
  })
  try {
    localStorage.setItem(storageKey(), JSON.stringify(markers))
  } catch {
    // The in-memory UI still gets refreshed when storage is unavailable.
  }
}

export function isMessageLocallyCleared(
  conversationId: string,
  message: { createdAt?: string },
): boolean {
  const marker = clearMarker(conversationId)
  if (!marker) return false
  const createdAt = messageTime(message)
  // Messages without a timestamp are server-history rows in this flow. Hide
  // them after a local clear; realtime messages always receive createdAt.
  return !createdAt || createdAt <= marker
}

export function filterLocallyClearedMessages<T extends { createdAt?: string }>(
  conversationId: string,
  messages: T[],
): T[] {
  const marker = clearMarker(conversationId)
  if (!marker) return messages
  return messages.filter((message) => {
    const createdAt = messageTime(message)
    return !!createdAt && createdAt > marker
  })
}

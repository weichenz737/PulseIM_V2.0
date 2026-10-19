export interface OutboxMessagePayload {
  conversationId: string
  toUserId?: string
  content: string
  clientMsgId: string
  replyToMsgId?: string
  msgType?: number
  mentionUserIds?: string[]
  atAll?: boolean
  fileId?: string
  fromUserId?: string
}

interface OutboxEntry {
  payload: OutboxMessagePayload
  attempts: number
  nextRetryAt: number
  createdAt: number
}

type OutboxSender = (payload: OutboxMessagePayload) => Promise<unknown>

const STORAGE_KEY = 'pulse_message_outbox_v1'
const MAX_ATTEMPTS = 8
let sender: OutboxSender | null = null
let flushing: Promise<void> | null = null
let retryTimer: number | null = null

function readEntries(): OutboxEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as OutboxEntry[]
    return Array.isArray(parsed)
      ? parsed.filter((entry) => entry?.payload?.clientMsgId && entry?.payload?.conversationId)
      : []
  } catch {
    return []
  }
}

function writeEntries(entries: OutboxEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Keep runtime delivery working even if storage quota is unavailable.
  }
  scheduleNextFlush(entries)
}

function retryDelay(attempts: number) {
  return Math.min(5 * 60_000, 1500 * 2 ** Math.min(attempts, 8))
}

function scheduleNextFlush(entries = readEntries()) {
  if (retryTimer !== null) window.clearTimeout(retryTimer)
  retryTimer = null
  if (!entries.length || !navigator.onLine) return
  const nextAt = Math.min(...entries.map((entry) => entry.nextRetryAt))
  retryTimer = window.setTimeout(() => {
    retryTimer = null
    void flushMessageOutbox()
  }, Math.max(0, nextAt - Date.now()))
}

export function registerOutboxSender(next: OutboxSender) {
  sender = next
  scheduleNextFlush()
}

export function queueFailedMessage(payload: OutboxMessagePayload) {
  const entries = readEntries()
  const existing = entries.find((entry) => entry.payload.clientMsgId === payload.clientMsgId)
  if (existing) {
    existing.payload = payload
    existing.nextRetryAt = Math.min(existing.nextRetryAt, Date.now())
  } else {
    entries.push({ payload, attempts: 0, nextRetryAt: Date.now(), createdAt: Date.now() })
  }
  writeEntries(entries)
  window.dispatchEvent(
    new CustomEvent('pulse:message-queued', { detail: { clientMsgId: payload.clientMsgId } }),
  )
}

export function removeQueuedMessage(clientMsgId: string) {
  writeEntries(readEntries().filter((entry) => entry.payload.clientMsgId !== clientMsgId))
}

export function retryQueuedMessage(clientMsgId: string) {
  const entries = readEntries()
  const target = entries.find((entry) => entry.payload.clientMsgId === clientMsgId)
  if (!target) return false
  target.attempts = 0
  target.nextRetryAt = Date.now()
  writeEntries(entries)
  void flushMessageOutbox()
  return true
}

export function queuedMessageIds() {
  return readEntries().map((entry) => entry.payload.clientMsgId)
}

export function flushMessageOutbox(): Promise<void> {
  if (flushing) return flushing
  if (!sender || !navigator.onLine) return Promise.resolve()
  flushing = (async () => {
    const entries = readEntries()
    for (const entry of entries) {
      if (entry.nextRetryAt > Date.now()) continue
      try {
        const message = await sender!(entry.payload)
        removeQueuedMessage(entry.payload.clientMsgId)
        window.dispatchEvent(
          new CustomEvent('pulse:message-sent', {
            detail: { clientMsgId: entry.payload.clientMsgId, message },
          }),
        )
      } catch (error) {
        const current = readEntries()
        const target = current.find(
          (item) => item.payload.clientMsgId === entry.payload.clientMsgId,
        )
        if (!target) continue
        target.attempts += 1
        if (target.attempts >= MAX_ATTEMPTS) {
          writeEntries(current.filter((item) => item !== target))
          window.dispatchEvent(
            new CustomEvent('pulse:message-failed', {
              detail: { clientMsgId: target.payload.clientMsgId, error },
            }),
          )
        } else {
          target.nextRetryAt = Date.now() + retryDelay(target.attempts)
          writeEntries(current)
        }
      }
    }
  })().finally(() => {
    flushing = null
    scheduleNextFlush()
  })
  return flushing
}

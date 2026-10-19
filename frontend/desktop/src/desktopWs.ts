import { getDesktopDeviceId, getDesktopServerOrigin } from './desktopApi'

function desktopWsPlatform(): 'windows' | 'windows_web' {
  return typeof window !== 'undefined' && Boolean(window.pulseDesktop)
    ? 'windows'
    : 'windows_web'
}

type DesktopWsMessage = {
  cmd?: string
  type?: string
  id?: string | number
  msgId?: string | number
  conversationId?: string | number
  fromUserId?: string | number
  fromNickname?: string
  fromAvatarUrl?: string
  toUserId?: string | number
  userId?: string | number
  online?: boolean
  onlineHidden?: boolean
  content?: string
  msgType?: number
  clientMsgId?: string
  sendTime?: number
  createdAt?: string
  event?: string
  lastReadMsgId?: string
  lastReadSendTime?: number
  action?: string
  pendingCount?: number
  nickname?: string
  burnAfterRead?: boolean
  burnSeconds?: number
  burnReadAt?: string
  burnExpiresAt?: string
  autoDeleteExpiresAt?: string
  mentionUserIds?: Array<string | number>
  atAll?: boolean
  mentionedMe?: boolean
  [key: string]: unknown
}

type MessageHandler = (message: DesktopWsMessage) => void

function objectFromNested(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

/**
 * The API push path currently sends flat JSON, while older gateways and some
 * deployments wrap it in payload/data/message. Normalize all of them before
 * command filtering so a valid message or read receipt is never discarded.
 */
function normalizeDesktopWsPayload(payload: DesktopWsMessage): DesktopWsMessage {
  let merged: Record<string, unknown> = { ...payload }
  for (let depth = 0; depth < 3; depth += 1) {
    const nested = objectFromNested(merged.payload ?? merged.data ?? merged.message ?? merged.signal)
    if (!nested) break
    merged = { ...merged, ...nested }
  }
  const command = String(merged.cmd || merged.type || merged.event || '').trim().toUpperCase()
  return command ? { ...merged, cmd: command } as DesktopWsMessage : merged as DesktopWsMessage
}

let socket: WebSocket | null = null
let token = ''
let reconnectTimer: number | null = null
let heartbeatTimer: number | null = null
let stopped = true
let authenticated = false
let reconnectAttempt = 0
let lastInboundAt = 0
let awaitingHeartbeatAt = 0
const authWaiters = new Set<(ok: boolean) => void>()
const handlers = new Set<MessageHandler>()
const chatAckWaiters = new Map<string, {
  resolve: (message: DesktopWsMessage) => void
  reject: (error: Error) => void
  timer: number
}>()

const HEARTBEAT_INTERVAL_MS = 15_000
const HEARTBEAT_TIMEOUT_MS = 10_000
const RECONNECT_BASE_MS = 500
const RECONNECT_MAX_MS = 8_000

function rejectPendingChatAcks(message = 'WebSocket 已断开') {
  const error = new Error(message)
  const pending = [...chatAckWaiters.values()]
  chatAckWaiters.clear()
  pending.forEach((waiter) => {
    window.clearTimeout(waiter.timer)
    waiter.reject(error)
  })
}

function websocketUrl(): string {
  const configured = getDesktopServerOrigin()
  if (configured) {
    const url = new URL(configured)
    const path = url.pathname.replace(/\/+$/, '')
    return `${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}${path}/ws`
  }
  const pathPrefix = /^\/pulseim(?:\/|$)/i.test(window.location.pathname) ? '/pulseim' : ''
  return `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${pathPrefix}/ws`
}

function clearTimers() {
  if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
  if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer)
  reconnectTimer = null
  heartbeatTimer = null
}

function scheduleReconnect() {
  if (stopped || reconnectTimer !== null || !token) return
  const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.min(reconnectAttempt, 4))
  reconnectAttempt += 1
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null
    connectDesktopWs(token)
  }, delay)
}

export function connectDesktopWs(nextToken: string): void {
  const cleanToken = nextToken.trim()
  if (cleanToken && cleanToken !== token) reconnectAttempt = 0
  token = cleanToken
  stopped = false
  if (!token || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return
  clearTimers()
  authenticated = false
  lastInboundAt = Date.now()
  awaitingHeartbeatAt = 0
  try {
    const ws = new WebSocket(websocketUrl())
    socket = ws
    ws.onopen = () => {
      if (socket !== ws) return
      console.info('[pulse-ws] connected', websocketUrl())
      ws.send(JSON.stringify({ cmd: 'AUTH', token, deviceId: getDesktopDeviceId(), platform: desktopWsPlatform() }))
      heartbeatTimer = window.setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN || !authenticated) return
        const now = Date.now()
        if (
          awaitingHeartbeatAt > 0
          && now - awaitingHeartbeatAt >= HEARTBEAT_TIMEOUT_MS
          && now - lastInboundAt >= HEARTBEAT_TIMEOUT_MS
        ) {
          // A WebSocket can remain OPEN after a proxy/network failure. Close
          // it ourselves so the reconnect path is not stuck on a dead socket.
          ws.close()
          return
        }
        awaitingHeartbeatAt = now
        ws.send(JSON.stringify({ cmd: 'HEARTBEAT', seq: now }))
      }, HEARTBEAT_INTERVAL_MS)
    }
    ws.onmessage = (event) => {
      if (socket !== ws || typeof event.data !== 'string') return
      try {
        lastInboundAt = Date.now()
        const payload = normalizeDesktopWsPayload(JSON.parse(event.data) as DesktopWsMessage)
        const cmd = String(payload.cmd || payload.type || payload.event || '').toUpperCase()
        if (cmd === 'MSG_ACK' || cmd === 'MESSAGE_ACK' || cmd === 'SEND_MSG_ACK') {
          const clientMsgId = String(payload.clientMsgId || '').trim()
          const waiter = clientMsgId ? chatAckWaiters.get(clientMsgId) : null
          if (waiter) {
            chatAckWaiters.delete(clientMsgId)
            window.clearTimeout(waiter.timer)
            if (payload.success === false) waiter.reject(new Error(String(payload.message || '消息发送失败')))
            else waiter.resolve(payload)
          }
        }
        if (cmd === 'HEARTBEAT_ACK') {
          awaitingHeartbeatAt = 0
          return
        }
        if (cmd === 'AUTH_ACK') {
          authenticated = payload.success !== false
          if (authenticated) {
            reconnectAttempt = 0
            awaitingHeartbeatAt = 0
          }
          const waiters = [...authWaiters]
          authWaiters.clear()
          waiters.forEach((waiter) => waiter(authenticated))
          if (!authenticated) {
            ws.close()
            return
          }
        }
        const isReadReceipt = cmd === 'READ_RECEIPT' || cmd === 'READ_RECEIPT_PUSH' || cmd === 'MESSAGE_READ' || cmd === 'MESSAGE_READ_RECEIPT'
        const nonMessageCommand = cmd === 'RECALL_MSG' || cmd === 'BUSINESS_STATUS'
        const hasMessageFields = !nonMessageCommand && payload.conversationId != null
          && (payload.id != null || payload.msgId != null || payload.clientMsgId != null)
        if (cmd === 'PUSH_MSG' || cmd === 'PUSH_MESSAGE' || cmd === 'MSG' || cmd === 'MESSAGE' || cmd === 'MESSAGE_PUSH' || cmd === 'NEW_MESSAGE' || cmd === 'CHAT_MESSAGE' || hasMessageFields || cmd === 'PRESENCE' || isReadReceipt || cmd === 'FRIEND_REQUEST' || cmd === 'BURN_STARTED' || cmd === 'BURN_EXPIRED' || cmd === 'RECALL_MSG' || cmd === 'BUSINESS_STATUS' || cmd === 'AUTH_ACK' || cmd === 'KICK' || cmd === 'DEVICE_REVOKED' || cmd === 'SESSION_REVOKED' || cmd === 'FORCE_LOGOUT' || cmd === 'TOKEN_REVOKED' || cmd === 'AUTH_REVOKED' || cmd.startsWith('CALL_')) {
          handlers.forEach((handler) => handler(payload))
        }
      } catch {
        // Ignore malformed frames; the HTTP history remains the source of truth.
      }
    }
    ws.onerror = (event) => {
      console.warn('[pulse-ws] socket error', (event as ErrorEvent)?.message || (event as Event)?.type || 'unknown')
      ws.close()
    }
    ws.onclose = (event) => {
      console.warn(`[pulse-ws] socket closed code=${event.code} reason=${event.reason || ''} wasClean=${event.wasClean}`)
      if (socket !== ws) return
      socket = null
      authenticated = false
      awaitingHeartbeatAt = 0
      const waiters = [...authWaiters]
      authWaiters.clear()
      waiters.forEach((waiter) => waiter(false))
      rejectPendingChatAcks()
      clearTimers()
      scheduleReconnect()
    }
  } catch {
    scheduleReconnect()
  }
}

export function disconnectDesktopWs(): void {
  stopped = true
  token = ''
  authenticated = false
  reconnectAttempt = 0
  lastInboundAt = 0
  awaitingHeartbeatAt = 0
  const waiters = [...authWaiters]
  authWaiters.clear()
  waiters.forEach((waiter) => waiter(false))
  rejectPendingChatAcks('WebSocket 已关闭')
  clearTimers()
  const current = socket
  socket = null
  if (current) {
    current.onclose = null
    current.close()
  }
}

export function onDesktopWsMessage(handler: MessageHandler): () => void {
  handlers.add(handler)
  return () => handlers.delete(handler)
}

export function sendDesktopWsMessage(payload: unknown): boolean {
  if (!authenticated || socket?.readyState !== WebSocket.OPEN) return false
  try {
    socket.send(typeof payload === 'string' ? payload : JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

/**
 * Chat messages are metadata-only JSON frames. The server replies with a
 * MSG_ACK carrying the clientMsgId; file bytes never enter this channel.
 */
export async function sendDesktopChatMessageAwaitAck(
  payload: Record<string, unknown>,
  nextToken: string,
  timeoutMs = 12_000,
): Promise<DesktopWsMessage> {
  const ready = await ensureDesktopWsReady(nextToken, Math.min(timeoutMs, 8_000))
  if (!ready) throw new Error('消息通道未连接')
  const clientMsgId = String(payload.clientMsgId || '').trim()
  if (!clientMsgId) throw new Error('消息缺少 clientMsgId')
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      if (!chatAckWaiters.has(clientMsgId)) return
      chatAckWaiters.delete(clientMsgId)
      reject(new Error('消息发送超时'))
    }, timeoutMs)
    chatAckWaiters.set(clientMsgId, { resolve, reject, timer })
    const sent = sendDesktopWsMessage({
      cmd: 'SEND_MSG',
      seq: Date.now(),
      ...payload,
    })
    if (!sent) {
      chatAckWaiters.delete(clientMsgId)
      window.clearTimeout(timer)
      reject(new Error('消息通道未连接'))
    }
  })
}

export function isDesktopWsReady(): boolean {
  return authenticated && socket?.readyState === WebSocket.OPEN
}

export function ensureDesktopWsReady(nextToken: string, timeoutMs = 8000): Promise<boolean> {
  if (isDesktopWsReady()) return Promise.resolve(true)
  const cleanToken = nextToken.trim()
  if (!cleanToken) return Promise.resolve(false)
  connectDesktopWs(cleanToken)
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      authWaiters.delete(waiter)
      resolve(isDesktopWsReady())
    }, timeoutMs)
    const waiter = (ok: boolean) => {
      window.clearTimeout(timer)
      resolve(ok && isDesktopWsReady())
    }
    authWaiters.add(waiter)
  })
}

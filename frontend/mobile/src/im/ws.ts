import { websocketUrl } from '@/config/endpoints'

type MessageHandler = (data: unknown) => void
type ConnectionHandler = (state: WsConnectionState) => void

export type WsConnectionState =
  | 'offline'
  | 'connecting'
  | 'authenticating'
  | 'connected'
  | 'disconnected'

let socket: WebSocket | null = null
let heartbeatTimer: number | null = null
let reconnectTimer: number | null = null
let leaderHeartbeatTimer: number | null = null
let lastToken: string | null = null
let authed = false
let connecting = false
let networkOnline = typeof navigator === 'undefined' ? true : navigator.onLine
let appActive = true
let connectGen = 0
let reconnectAttempt = 0
let lastReconnectAt = 0
let heartbeatSeq = 0
interface PendingMessageAck {
  resolve: (value: { msgId: string; clientMsgId: string }) => void
  reject: (reason?: unknown) => void
  timer: number
}
const pendingMessageAcks = new Map<string, PendingMessageAck>()
let awaitingHeartbeatAt = 0
let lastInboundAt = 0
let connectionState: WsConnectionState = networkOnline ? 'disconnected' : 'offline'

const handlers = new Set<MessageHandler>()
const connectionHandlers = new Set<ConnectionHandler>()
const authWaiters = new Set<(ok: boolean) => void>()
const pendingCallSignals: string[] = []
const recentMessageKeys = new Map<string, number>()
const MAX_PENDING_SIGNALS = 40
const MAX_RECENT_MESSAGES = 2000
// Must be shorter than the heartbeat interval. Otherwise an iOS client that
// keeps a dead socket in OPEN state can never satisfy the timeout check.
const HEARTBEAT_TIMEOUT_MS = 10_000

const TAB_ID = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`
const LEADER_KEY = 'pulse_ws_leader_v1'
let isLeader = false

function setConnectionState(next: WsConnectionState) {
  if (connectionState === next) return
  connectionState = next
  connectionHandlers.forEach((handler) => handler(next))
  window.dispatchEvent(new CustomEvent('pulse:ws-state', { detail: { state: next } }))
}

function notifyAuthWaiters(ok: boolean) {
  const waiters = [...authWaiters]
  authWaiters.clear()
  waiters.forEach((waiter) => waiter(ok))
}

function getWsUrl(): string {
  return websocketUrl()
}

function normalizeWsPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload
  let merged = { ...(payload as Record<string, unknown>) }
  for (let depth = 0; depth < 3; depth += 1) {
    const value = merged.payload ?? merged.data ?? merged.message
    let nested: Record<string, unknown> | null = null
    if (value && typeof value === 'object' && !Array.isArray(value)) nested = value as Record<string, unknown>
    else if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) nested = parsed as Record<string, unknown>
      } catch {
        // Ignore non-JSON wrapper fields.
      }
    }
    if (!nested) break
    merged = { ...merged, ...nested }
  }
  return merged
}

function getDevicePlatform() {
  const native = document.documentElement.classList.contains('capacitor-native')
  let deviceId = localStorage.getItem('pulse_device_id')
  if (!deviceId) {
    deviceId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
    localStorage.setItem('pulse_device_id', deviceId)
  }
  if (!native) return { deviceId, platform: 'web' }
  const platform = /android/i.test(navigator.userAgent) ? 'android' : 'ios'
  return { deviceId, platform }
}

function clearHeartbeat() {
  if (heartbeatTimer !== null) {
    window.clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
  awaitingHeartbeatAt = 0
}

function startHeartbeat() {
  clearHeartbeat()
  const interval = 15_000
  heartbeatTimer = window.setInterval(() => {
    // 后台/锁屏时也保持心跳，避免服务端因空闲断开导致收不到消息通知
    if (!networkOnline || socket?.readyState !== WebSocket.OPEN || !authed) return
    const now = Date.now()
    if (
      awaitingHeartbeatAt > 0 &&
      now - awaitingHeartbeatAt >= HEARTBEAT_TIMEOUT_MS &&
      now - lastInboundAt >= HEARTBEAT_TIMEOUT_MS
    ) {
      reconnectWs()
      return
    }
    heartbeatSeq += 1
    awaitingHeartbeatAt = now
    socket.send(JSON.stringify({ cmd: 'HEARTBEAT', seq: heartbeatSeq }))
  }, interval)
}

function readLeader(): { id: string; at: number } | null {
  try {
    const raw = localStorage.getItem(LEADER_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { id?: string; at?: number }
    return parsed.id && parsed.at ? { id: parsed.id, at: parsed.at } : null
  } catch {
    return null
  }
}

function writeLeader() {
  try {
    localStorage.setItem(LEADER_KEY, JSON.stringify({ id: TAB_ID, at: Date.now() }))
  } catch {
    // Storage is best effort.
  }
}

function claimLeadership() {
  const current = readLeader()
  if (current && current.id !== TAB_ID && Date.now() - current.at < 3500) {
    isLeader = false
    return false
  }
  writeLeader()
  isLeader = true
  return true
}

function closeSocket() {
  connectGen += 1
  connecting = false
  authed = false
  clearHeartbeat()
  if (!socket) return
  const old = socket
  socket = null
  old.onopen = null
  old.onmessage = null
  old.onerror = null
  old.onclose = null
  try {
    old.close()
  } catch {
    // Already closed.
  }
}

function startLeaderHeartbeat() {
  if (leaderHeartbeatTimer !== null) return
  leaderHeartbeatTimer = window.setInterval(() => {
    if (!lastToken || !networkOnline) return
    if (claimLeadership()) {
      if (!socket && !connecting) connectWs(lastToken)
    } else if (socket) {
      closeSocket()
      setConnectionState('disconnected')
    }
  }, 1200)
}

function stopLeaderHeartbeat() {
  if (leaderHeartbeatTimer !== null) {
    window.clearInterval(leaderHeartbeatTimer)
    leaderHeartbeatTimer = null
  }
}

function reconnectDelay() {
  // 聊天连接断开时不能让指数退避增长到 30 秒，否则移动端会长时间依赖历史消息轮询。
  // 保留退避避免服务端被重连风暴打满，但把单次等待限制在 5 秒内。
  const base = Math.min(5_000, 800 * 2 ** Math.min(reconnectAttempt, 6))
  const jitter = Math.round(base * (Math.random() * 0.4 - 0.2))
  return Math.max(500, base + jitter)
}

function scheduleReconnect(immediate = false) {
  if (
    reconnectTimer !== null ||
    !lastToken ||
    connecting ||
    !networkOnline ||
    !claimLeadership()
  ) return
  const delay = immediate ? 0 : reconnectDelay()
  reconnectAttempt += 1
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null
    if (lastToken) connectWs(lastToken)
  }, delay)
}

function flushPendingCallSignals() {
  if (!authed || socket?.readyState !== WebSocket.OPEN) return
  while (pendingCallSignals.length) {
    const raw = pendingCallSignals.shift()
    if (!raw) break
    try {
      socket.send(raw)
    } catch {
      pendingCallSignals.unshift(raw)
      break
    }
  }
}

function enqueueCallSignal(json: string) {
  pendingCallSignals.push(json)
  while (pendingCallSignals.length > MAX_PENDING_SIGNALS) pendingCallSignals.shift()
}

function messageDedupKey(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const msg = payload as Record<string, unknown>
  const cmd = String(msg.cmd || msg.type || '')
  if (!['PUSH_MSG', 'MSG', 'MSG_ACK', 'RECALL_MSG', 'message', 'recall'].includes(cmd)) return ''
  const id = String(msg.id || msg.msgId || '')
  const clientId = String(msg.clientMsgId || '')
  return id ? `${cmd}:${id}` : clientId ? `${cmd}:${clientId}` : ''
}

function isDuplicateMessage(payload: unknown) {
  const key = messageDedupKey(payload)
  if (!key) return false
  const now = Date.now()
  if (recentMessageKeys.has(key)) return true
  recentMessageKeys.set(key, now)
  while (recentMessageKeys.size > MAX_RECENT_MESSAGES) {
    const oldest = recentMessageKeys.keys().next().value
    if (!oldest) break
    recentMessageKeys.delete(oldest)
  }
  return false
}

export function connectWs(token: string): void {
  const cleanToken = token.trim()
  if (!cleanToken) return
  lastToken = cleanToken
  startLeaderHeartbeat()
  if (!networkOnline) {
    setConnectionState('offline')
    return
  }
  if (!claimLeadership()) return
  if (
    socket?.readyState === WebSocket.OPEN ||
    socket?.readyState === WebSocket.CONNECTING ||
    connecting
  ) return

  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  closeSocket()
  const gen = ++connectGen
  connecting = true
  setConnectionState('connecting')

  try {
    const ws = new WebSocket(getWsUrl())
    socket = ws
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      if (gen !== connectGen || socket !== ws) return
      connecting = false
      setConnectionState('authenticating')
      ws.send(JSON.stringify({ cmd: 'AUTH', token: cleanToken, ...getDevicePlatform() }))
    }

    ws.onmessage = (event: MessageEvent) => {
      if (gen !== connectGen || socket !== ws) return
      lastInboundAt = Date.now()
      let payload: unknown = event.data
      if (event.data instanceof ArrayBuffer) {
        console.warn('[Pulse WS] binary frame rejected; file bytes must use HTTP')
        ws.close(1003, 'metadata-only websocket')
        return
      } else if (typeof Blob !== 'undefined' && event.data instanceof Blob) {
        console.warn('[Pulse WS] blob frame rejected; file bytes must use HTTP')
        ws.close(1003, 'metadata-only websocket')
        return
      } else if (typeof event.data === 'string') {
        try {
          payload = JSON.parse(event.data)
        } catch {
          ws.close(1003, 'JSON text required')
          return
        }
      }
      payload = normalizeWsPayload(payload)
      const cmd =
        payload && typeof payload === 'object'
          ? String((payload as Record<string, unknown>).cmd || '')
          : ''
      if (cmd === 'HEARTBEAT_ACK') {
        awaitingHeartbeatAt = 0
      }
      if (cmd === 'AUTH_ACK') {
        const success =
          !payload || typeof payload !== 'object' ||
          !('success' in payload) ||
          Boolean((payload as Record<string, unknown>).success)
        authed = success
        notifyAuthWaiters(success)
        if (success) {
          reconnectAttempt = 0
          setConnectionState('connected')
          startHeartbeat()
          flushPendingCallSignals()
          window.dispatchEvent(new CustomEvent('pulse:ws-authenticated'))
        }
      }
      if (cmd === 'MSG_ACK') {
        const ack = payload as Record<string, unknown>
        const clientMsgId = String(ack.clientMsgId || '')
        const pending = clientMsgId ? pendingMessageAcks.get(clientMsgId) : undefined
        if (pending) {
          pendingMessageAcks.delete(clientMsgId)
          window.clearTimeout(pending.timer)
          if (ack.success === false) pending.reject(new Error(String(ack.message || '消息发送失败')))
          else pending.resolve({ msgId: String(ack.msgId || ack.id || ''), clientMsgId })
        }
      }
      if (cmd === 'PRESENCE') {
        window.dispatchEvent(new CustomEvent('pulse:presence', { detail: payload }))
      }
      if (isDuplicateMessage(payload)) return
      handlers.forEach((handler) => handler(payload))
    }

    ws.onerror = () => {
      console.warn('[Pulse WS] connection error')
    }

    ws.onclose = () => {
      if (gen !== connectGen) return
      if (socket === ws) socket = null
      connecting = false
      authed = false
      clearHeartbeat()
      notifyAuthWaiters(false)
      setConnectionState(networkOnline ? 'disconnected' : 'offline')
      scheduleReconnect()
    }
  } catch (error) {
    connecting = false
    setConnectionState(networkOnline ? 'disconnected' : 'offline')
    console.warn('[Pulse WS] failed to connect', error)
    scheduleReconnect()
  }
}

export function reconnectWs(token?: string | null): void {
  const cleanToken = (token || lastToken || '').trim()
  if (!cleanToken) return
  lastToken = cleanToken
  if (!networkOnline) return
  const now = Date.now()
  if (
    now - lastReconnectAt < 800 &&
    (socket?.readyState === WebSocket.OPEN || connecting)
  ) return
  lastReconnectAt = now
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  notifyAuthWaiters(false)
  closeSocket()
  scheduleReconnect(true)
}

export function updateWsRuntimeState(state: { online?: boolean; active?: boolean }) {
  if (typeof state.online === 'boolean') networkOnline = state.online
  if (typeof state.active === 'boolean') appActive = state.active
  if (!networkOnline) {
    if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
    reconnectTimer = null
    closeSocket()
    setConnectionState('offline')
    return
  }
  if (!appActive) {
    // 退到后台/锁屏时不关连接、不停心跳，保证仍能收到新消息并弹出通知；
    // 进程被系统回收后的兜底需要 FCM 推送或前台服务。
    return
  }
  if (lastToken) reconnectWs(lastToken)
}

export function updateWsToken(token: string, reconnect = true) {
  const cleanToken = token.trim()
  if (!cleanToken || cleanToken === lastToken) return
  lastToken = cleanToken
  if (reconnect) reconnectWs(cleanToken)
}

export async function ensureSignalAfterMedia(
  token?: string | null,
  timeoutMs = 12_000,
): Promise<boolean> {
  if (await ensureWsReady(token, 2000)) return true
  reconnectWs(token)
  return ensureWsReady(token, timeoutMs)
}

export function ensureWsReady(token?: string | null, timeoutMs = 8000): Promise<boolean> {
  if (socket?.readyState === WebSocket.OPEN && authed) return Promise.resolve(true)
  const cleanToken = (token || lastToken || '').trim()
  if (!cleanToken || !networkOnline || !appActive || !claimLeadership()) {
    return Promise.resolve(false)
  }
  connectWs(cleanToken)
  return new Promise((resolve) => {
    const waiter = (ok: boolean) => {
      window.clearTimeout(timeout)
      resolve(ok)
    }
    authWaiters.add(waiter)
    const timeout = window.setTimeout(() => {
      authWaiters.delete(waiter)
      resolve(socket?.readyState === WebSocket.OPEN && authed)
    }, timeoutMs)
  })
}

export function disconnectWs(clearToken = true): void {
  if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
  reconnectTimer = null
  stopLeaderHeartbeat()
  if (clearToken) lastToken = null
  notifyAuthWaiters(false)
  pendingCallSignals.length = 0
  closeSocket()
  try {
    if (readLeader()?.id === TAB_ID) localStorage.removeItem(LEADER_KEY)
  } catch {
    // Storage is best effort.
  }
  isLeader = false
  reconnectAttempt = 0
  setConnectionState(networkOnline ? 'disconnected' : 'offline')
}

export function sendWs(data: string): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(data)
}

export function onWsMessage(handler: MessageHandler): () => void {
  handlers.add(handler)
  return () => handlers.delete(handler)
}

export function onWsConnectionChange(handler: ConnectionHandler): () => void {
  connectionHandlers.add(handler)
  handler(connectionState)
  return () => connectionHandlers.delete(handler)
}

export const getWsConnectionState = () => connectionState
export const isWsOpen = () => socket?.readyState === WebSocket.OPEN
export const isWsAuthed = () => !!socket && socket.readyState === WebSocket.OPEN && authed
export const isWsLeaderTab = () => isLeader || claimLeadership()

export interface SendMsgPayload {
  cmd: 'SEND_MSG'
  conversationId: string
  toUserId: string
  content: string
  clientMsgId: string
  msgType: number
  fileId?: string
  replyToMsgId?: string
  mentionUserIds?: string[]
  atAll?: boolean
}

export function sendChatMessage(payload: Omit<SendMsgPayload, 'cmd'>): boolean {
  if (socket?.readyState !== WebSocket.OPEN || !authed) return false
  sendWs(JSON.stringify({ cmd: 'SEND_MSG', ...payload }))
  return true
}

export interface TypingStatusPayload {
  conversationId: string
  toUserId: string
  typing: boolean
}

export function sendTypingStatus(payload: TypingStatusPayload): boolean {
  if (
    !payload.conversationId ||
    !payload.toUserId ||
    socket?.readyState !== WebSocket.OPEN ||
    !authed
  ) return false
  sendWs(JSON.stringify({ cmd: 'TYPING_STATUS', ...payload }))
  return true
}

/** Sends only a JSON message envelope and waits for the small server ACK. */
export function sendChatMessageAwaitAck(
  payload: Omit<SendMsgPayload, 'cmd'>,
  timeoutMs = 10_000,
): Promise<{ msgId: string; clientMsgId: string }> {
  const clientMsgId = String(payload.clientMsgId || '')
  if (!clientMsgId) {
    return Promise.reject(new Error('WebSocket 未连接'))
  }
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pendingMessageAcks.delete(clientMsgId)
      reject(new Error('消息发送超时'))
    }, timeoutMs)
    pendingMessageAcks.set(clientMsgId, { resolve, reject, timer })
    if (!sendChatMessage(payload)) {
      pendingMessageAcks.delete(clientMsgId)
      window.clearTimeout(timer)
      reject(new Error('WebSocket 未连接'))
    }
  })
}

export type CallSignalCmd =
  | 'CALL_INVITE' | 'CALL_RINGING' | 'CALL_ACCEPT' | 'CALL_REJECT' | 'CALL_BUSY'
  | 'CALL_OFFER' | 'CALL_ANSWER' | 'CALL_ICE' | 'CALL_HANGUP' | 'CALL_UNAVAILABLE'
  | 'CALL_ERROR' | 'CALL_GROUP_INVITE' | 'CALL_GROUP_RINGING' | 'CALL_GROUP_JOIN'
  | 'CALL_GROUP_MEMBER_JOINED' | 'CALL_GROUP_OFFER' | 'CALL_GROUP_ANSWER'
  | 'CALL_GROUP_ICE' | 'CALL_GROUP_LEAVE' | 'CALL_GROUP_END'

export interface CallSignalPayload {
  cmd: CallSignalCmd
  callId: string
  toUserId: string
  fromUserId?: string
  fromNickname?: string
  fromAvatarUrl?: string
  conversationId?: string
  mediaType?: 'audio' | 'video'
  sdp?: string
  candidate?: RTCIceCandidateInit
  reason?: string
  message?: string
  groupTitle?: string
  members?: Array<{ userId: string; nickname: string; avatarUrl?: string }>
  member?: { userId: string; nickname: string; avatarUrl?: string }
  shouldOffer?: boolean
}

export function sendCallSignal(payload: CallSignalPayload): boolean {
  const json = JSON.stringify(payload)
  if (socket?.readyState === WebSocket.OPEN && authed) {
    sendWs(json)
    return true
  }
  if (payload.cmd !== 'CALL_ICE' && !payload.cmd.endsWith('_ICE')) enqueueCallSignal(json)
  if (lastToken && networkOnline && appActive) scheduleReconnect(true)
  return false
}

export const isCallSignalCmd = (cmd: string) => cmd.startsWith('CALL_')

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== LEADER_KEY || !event.newValue) return
    try {
      const next = JSON.parse(event.newValue) as { id?: string }
      if (next.id && next.id !== TAB_ID && socket) {
        isLeader = false
        closeSocket()
        setConnectionState('disconnected')
      }
    } catch {
      // Ignore malformed cross-tab data.
    }
  })
}

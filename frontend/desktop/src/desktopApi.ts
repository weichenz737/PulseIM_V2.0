export interface ApiResult<T> {
  code: number
  message?: string
  data: T
}

export const DESKTOP_AUTH_EXPIRED_MESSAGE = '登录已失效，请重新登录'

type DesktopAuthError = Error & {
  code: 'AUTH_EXPIRED'
  status: 401
}

export function createDesktopAuthError(): DesktopAuthError {
  const error = new Error(DESKTOP_AUTH_EXPIRED_MESSAGE) as DesktopAuthError
  error.name = 'DesktopAuthExpiredError'
  error.code = 'AUTH_EXPIRED'
  error.status = 401
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pulse:desktop-auth-expired'))
  }
  return error
}

export function isDesktopAuthError(error: unknown): boolean {
  const candidate = error as { code?: unknown; status?: unknown; message?: unknown } | null
  if (!candidate) return false
  return candidate.code === 'AUTH_EXPIRED'
    || Number(candidate.status) === 401
    || String(candidate.message || '') === '未登录或令牌无效'
    || String(candidate.message || '') === DESKTOP_AUTH_EXPIRED_MESSAGE
}

export interface DesktopProfile {
  userId: string
  pulseId?: string
  nickname: string
  displayName?: string
  avatarUrl?: string
  phone?: string
  signature?: string
  remark?: string
  fileTransferAssistant?: boolean
  commonGroupCount?: number
  friendAddSource?: string
  friendAddInitiatorId?: string | number
  friendSince?: string
  blocked?: boolean
  blockedByPeer?: boolean
  tag?: string
}

export interface DesktopQrLoginStart {
  ticket: string
  payload: string
  expiresAt: string
  expiresIn: number
}

export interface DesktopQrLoginStatus {
  status: 'PENDING' | 'CONFIRMED' | 'EXPIRED' | string
  expiresAt?: string
  login?: LoginResponse
}

export interface DesktopClientAccessConfig {
  windows?: boolean
  phoneLoginEnabled: boolean
  qrLoginEnabled: boolean
  registerEnabled: boolean
  walletEnabled: boolean
}

export interface DesktopFileConfig {
  maxSizeMb: number
  allowedExtensions: string[]
}

export interface DesktopDeviceSession {
  deviceId: string
  name: string
  platform?: string
  trusted?: boolean
  trustedAt?: string
  loginAt?: string
  lastActiveAt?: string
  current?: boolean
}

export interface DesktopAccountSecurityInfo {
  phone: string
  securityCodeEnabled: boolean
  securityCode: string
}

export interface DesktopSystemText {
  key: string
  title: string
  content: string
  updatedAt?: string
}

export interface DesktopHelpQuestion {
  id: string
  question: string
  answer: string
  category?: string
}

export type DesktopMomentsVisibleRange = 'all' | 'half_year' | 'month' | 'three_days'

export interface DesktopPrivacySettings {
  friendVerifyRequired: boolean
  groupInviteVerify: boolean
  addByPhone: boolean
  addByPulseId: boolean
  addByGroup: boolean
  addByQrcode: boolean
  addByCard: boolean
  addByDeletedChat: boolean
  searchByPhone: boolean
  searchByPulseId: boolean
  momentsVisibleRange: DesktopMomentsVisibleRange
  momentsStrangerTen: boolean
  hideOnlineStatus: boolean
  readReceiptEnabled: boolean
}

export interface DesktopMomentComment {
  id: string
  userId: string
  nickname: string
  avatarUrl?: string
  content: string
  replyToUserId?: string
  replyToNickname?: string
  createdAt?: string
  likeCount?: number
  likedByMe?: boolean
}

export interface DesktopMoment {
  id: string
  userId: string
  mine?: boolean
  nickname: string
  avatarUrl?: string
  content: string
  images: string[]
  originalImages: string[]
  mediaTypes: Array<'image' | 'video'>
  mediaFileIds: string[]
  visibility: number
  visibleUserIds: string[]
  visibleNicknames: string[]
  mentionUserIds: string[]
  mentionNicknames: string[]
  mentionedMe: boolean
  locationName?: string
  locationAddress?: string
  latitude?: number
  longitude?: number
  createdAt?: string
  likeCount: number
  commentCount: number
  likedByMe: boolean
  favoritedByMe: boolean
  likeNicknames: string[]
  likeUserIds: string[]
  comments: DesktopMomentComment[]
}

export interface DesktopMomentInteraction {
  id: string
  type: 'like' | 'comment' | 'reply' | 'mention' | string
  actorUserId: string
  actorNickname: string
  actorAvatarUrl?: string
  postId: string
  commentId?: string
  summary: string
  postPreview: string
  isRead: boolean
  createdAt?: string
}

export interface DesktopConversation {
  id: string
  type: 'personal' | 'group'
  title: string
  avatarUrl?: string
  fileTransferAssistant?: boolean
  lastMsgPreview?: string
  lastMsgTime?: string
  unreadCount?: number
  mentionUnread?: boolean
  peerUserId?: string
  online?: boolean
  onlineHidden?: boolean
  tag?: string
  pinned?: boolean
  mute?: boolean
}

export interface DesktopContact {
  userId: string
  pulseId?: string
  nickname: string
  displayName?: string
  avatarUrl?: string
  online?: boolean
  onlineHidden?: boolean
  remark?: string
  tag?: string
  birthday?: string
  signature?: string
  fileTransferAssistant?: boolean
}

export interface DesktopCommonGroup {
  id: string
  title: string
  avatarUrl?: string
  memberCount?: number
}

export type DesktopGroupRole = 'owner' | 'admin' | 'member'

export interface DesktopGroupMember {
  userId: string
  nickname: string
  groupNickname?: string
  remark?: string
  avatarUrl?: string
  role: DesktopGroupRole
  owner?: boolean
  admin?: boolean
  speakMuted?: boolean
}

export interface DesktopGroupDetail {
  id: string
  title: string
  pulseId?: string
  avatarUrl?: string
  notice: string
  welcomeMessage: string
  welcomeSetterId?: string
  welcomeSetterNickname?: string
  welcomeSetterAvatarUrl?: string
  ownerId?: string
  owner: boolean
  admin: boolean
  myRole: DesktopGroupRole
  myGroupNickname: string
  groupRemark: string
  hidden: boolean
  pinned: boolean
  mute: boolean
  muteAll: boolean
  joinVerifyRequired: boolean
  allowMemberAddFriend: boolean
  searchMode: 1 | 2 | 3
  memberInviteAllowed: boolean
  pendingJoinCount: number
  speakMuted: boolean
  memberCount: number
  members: DesktopGroupMember[]
}

export interface DesktopGroupPreview {
  id: string
  pulseId: string
  title: string
  avatarUrl?: string
  notice?: string
  memberCount: number
  joined: boolean
  joinVerifyRequired: boolean
  joinPending: boolean
  ownerNickname?: string
}

export interface DesktopImportantNotificationSetting {
  atAll: boolean
  mentionMe: boolean
  replyMe: boolean
  announcement: boolean
  followedMemberIds: string[]
}

export interface DesktopMessage {
  id: string
  conversationId: string
  fromUserId: string
  fromNickname?: string
  fromAvatarUrl?: string
  toUserId: string
  content: string
  msgType?: number
  createdAt?: string
  recalled?: boolean
  clientMsgId?: string
  replyToMsgId?: string
  replyToContent?: string
  replyToMsgType?: number
  replyToNickname?: string
  replyToRecalled?: boolean
  mentionUserIds?: string[]
  atAll?: boolean
  mentionedMe?: boolean
  burnAfterRead?: boolean
  burnSeconds?: number
  burnReadAt?: string
  burnExpiresAt?: string
  autoDeleteExpiresAt?: string
  fileId?: string
  file?: DesktopUploadedFile
}

export interface DesktopBurnSetting {
  conversationId?: string
  enabled: boolean
  burnSeconds: number
}

export interface DesktopAutoDeleteSetting {
  conversationId?: string
  enabled: boolean
  ttlSeconds: number
  peerEnabled?: boolean
  peerTtlSeconds?: number
}

export interface DesktopUploadedFile {
  fileId?: string
  objectKey?: string
  thumbObjectKey?: string
  previewObjectKey?: string
  url: string
  originalUrl?: string
  thumbUrl?: string
  previewUrl?: string
  downloadUrl?: string
  name: string
  size: number
  originalSize?: number
  contentType: string
  sha256?: string
  width?: number
  height?: number
  durationMs?: number
}

export interface DesktopFavorite {
  id: string
  conversationId: string
  msgId: string
  msgType?: number
  content: string
  images?: string[]
  mediaTypes?: string[]
  mediaFileIds?: string[]
  fileId?: string
  fromNickname?: string
  sourceTitle?: string
  createdAt?: string
}

export interface DesktopWalletSummary {
  balance: number
  hasPaymentPassword: boolean
}

export interface DesktopWalletAmountConfig {
  redPacketMaxCents: number
  transferMaxCents: number
}

export interface DesktopWalletTransaction {
  id: number | string
  trade_no: string
  direction: 'IN' | 'OUT'
  trade_type: 'RED_PACKET' | 'TRANSFER' | 'ADMIN_ADJUST' | string
  amount: number
  balance_after: number
  counterparty_user_id?: number | string
  counterparty_name?: string
  conversation_id?: number | string
  remark?: string
  created_at: string
}

export interface DesktopReadState {
  conversationId: string
  conversationType?: number
  readReceiptEnabled?: boolean
  myLastReadMsgId?: string
  myLastReadSendTime?: number
  peerLastReadMsgId?: string
  peerLastReadSendTime?: number
  members: Array<{
    userId: string
    lastReadMsgId?: string
    lastReadSendTime?: number
    lastReadAt?: string
  }>
}

export interface DesktopSearchResult {
  contacts: Array<{
    userId: string
    nickname: string
    avatarUrl?: string
    online?: boolean
    onlineHidden?: boolean
    subtitle?: string
    fileTransferAssistant?: boolean
  }>
  groups: Array<{
    id: string
    title: string
    avatarUrl?: string
    memberCount?: number
  }>
  conversations: Array<{
    conversationId: string
    conversationTitle: string
    conversationType?: number
    avatarUrl?: string
    matchCount?: number
    preview?: string
    latestMsgId?: string
    latestMsgType?: number
    createdAt?: string
  }>
  messages: Array<{
    msgId: string
    conversationId: string
    conversationTitle: string
    conversationType?: number
    fromNickname?: string
    content: string
    msgType?: number
    createdAt?: string
  }>
}

interface DesktopSearchPayload {
  contacts?: Array<{
    userId: number | string
    nickname?: string
    avatarUrl?: string
    online?: boolean
    onlineHidden?: boolean
    subtitle?: string
    fileTransferAssistant?: boolean
  }>
  groups?: Array<{
    id: number | string
    title?: string
    pulseId?: string
    avatarUrl?: string
    memberCount?: number
  }>
  messages?: Array<{
    msgId: string
    conversationId: number | string
    conversationTitle?: string
    conversationType?: number
    fromNickname?: string
    content?: string
    msgType?: number
    createdAt?: string
  }>
  conversations?: Array<{
    conversationId: number | string
    conversationTitle?: string
    conversationType?: number
    avatarUrl?: string
    matchCount?: number
    preview?: string
    latestMsgId?: string
    latestMsgType?: number
    createdAt?: string
  }>
}

export interface DesktopFriendRequest {
  id: string
  fromUserId: string
  toUserId: string
  nickname: string
  avatarUrl?: string
  message?: string
  direction?: 'incoming' | 'outgoing'
  status?: number
  createdAt?: string
}

export interface DesktopGroupNotificationItem {
  id: string
  conversationId: string
  groupTitle: string
  applicantId: string
  applicantNickname: string
  applicantAvatarUrl?: string
  inviterId?: string
  inviterNickname?: string
  message?: string
  source?: string
  status?: number
  createdAt?: string
}

export interface DesktopGroupNotificationEvent {
  id: string
  conversationId: string
  groupTitle: string
  eventType?: string
  operatorNickname?: string
  source?: string
  reason?: string
  createdAt?: string
}

export interface LoginResponse {
  token: string
  userId: string | number
  pulseId?: string
  nickname: string
  avatarUrl?: string
  phone?: string
}

export interface DesktopMapConfig {
  provider: 'baidu' | string
  configured: boolean
  ak: string
}

const TOKEN_KEY = 'pulse_token'
const PROFILE_KEY = 'pulse_user_profile'
const DEVICE_KEY = 'pulse_device_id'
const REMEMBER_KEY = 'pulse_desktop_remember_login'
const REMEMBER_CREDENTIALS_KEY = 'pulse_remember_login'

export interface RememberedLogin {
  phone: string
  password: string
}

export function formatDesktopGroupPulseId(id: string | number): string {
  const raw = String(id ?? '')
  let hash = 2166136261
  for (const char of raw) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return String(1_000_000_000 + (hash >>> 0) % 9_000_000_000)
}

function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

const configuredOrigin = normalizeOrigin(import.meta.env.VITE_SERVER_ORIGIN || '')
const DEFAULT_BOOTSTRAP_ORIGIN = 'https://110.42.238.238:9001'
const SERVER_ORIGIN_CACHE_KEY = 'pulse_desktop_server_origin'

function validOrigin(value: unknown): string {
  const normalized = normalizeOrigin(String(value || ''))
  if (!normalized) return ''
  try {
    const url = new URL(normalized)
    if (!['http:', 'https:'].includes(url.protocol)) return ''
    if (!url.hostname || url.username || url.password || url.search || url.hash) return ''
    return normalized
  } catch {
    return ''
  }
}

function readCachedServerOrigin(): string {
  try {
    return validOrigin(localStorage.getItem(SERVER_ORIGIN_CACHE_KEY))
  } catch {
    return ''
  }
}

function cacheServerOrigin(origin: string): void {
  try {
    localStorage.setItem(SERVER_ORIGIN_CACHE_KEY, origin)
  } catch {
    // Best effort only; the bootstrap address remains available.
  }
}

function resolveRuntimeOrigin(): string {
  if (configuredOrigin) return configuredOrigin
  if (typeof window !== 'undefined' && /^https?:$/i.test(window.location.protocol)) {
    // The desktop web page is mounted at /pulseim/desktop/ while the API is
    // mounted at /pulseim/api/. Keep both web and packaged clients on the same
    // API origin instead of accidentally requesting the mobile fallback route.
    return window.location.pathname === '/pulseim' || window.location.pathname.startsWith('/pulseim/')
      ? `${window.location.origin}/pulseim`
      : ''
  }
  // Electron loads index.html from file://, so it cannot use a relative /api
  // URL. The build can still override this through VITE_SERVER_ORIGIN.
  return readCachedServerOrigin() || DEFAULT_BOOTSTRAP_ORIGIN
}

let serverOrigin = resolveRuntimeOrigin()
let apiBase = serverOrigin ? `${serverOrigin}/api` : '/api'
let serverOriginDiscovery: Promise<string> | null = null
let serverOriginDiscoveryCompleted = false

function applyDesktopServerOrigin(origin: string): string {
  const next = validOrigin(origin)
  if (!next) return serverOrigin
  serverOrigin = next
  apiBase = `${next}/api`
  return next
}

async function setDesktopServerOriginInShell(origin: string): Promise<void> {
  const shell = (globalThis as typeof globalThis & {
    pulseDesktop?: { setServerOrigin?: (value: string) => Promise<boolean> }
  }).pulseDesktop
  if (typeof shell?.setServerOrigin !== 'function') return
  const accepted = await shell.setServerOrigin(origin)
  if (accepted === false) throw new Error('桌面端服务器地址未被允许')
}

/** Discover the active server once per app start, with a forced refresh on retry. */
export function initializeDesktopServerOrigin(force = false): Promise<string> {
  if (!isElectronShell()) return Promise.resolve(serverOrigin)
  if (serverOriginDiscovery) return serverOriginDiscovery
  if (serverOriginDiscoveryCompleted && !force) return Promise.resolve(serverOrigin)

  serverOriginDiscovery = (async () => {
    const candidates = [readCachedServerOrigin(), configuredOrigin, DEFAULT_BOOTSTRAP_ORIGIN]
      .map(validOrigin)
      .filter((value, index, values) => value && values.indexOf(value) === index)
    const shell = (globalThis as typeof globalThis & {
      pulseDesktop?: {
        apiRequest?: (options: {
          url: string
          method: string
          headers: Record<string, string>
        }) => Promise<{ status: number; body: string }>
      }
    }).pulseDesktop
    if (!shell?.apiRequest) return serverOrigin

    for (const candidate of candidates) {
      applyDesktopServerOrigin(candidate)
      try {
        await setDesktopServerOriginInShell(candidate)
        const result = await shell.apiRequest({
          url: `${candidate}/api/v1/config/server-origin`,
          method: 'GET',
          headers: { Accept: 'application/json' },
        })
        if (result.status < 200 || result.status >= 300) continue
        let body: { code?: number; data?: { serverOrigin?: unknown } }
        try {
          body = JSON.parse(result.body || '{}') as { code?: number; data?: { serverOrigin?: unknown } }
        } catch {
          continue
        }
        if (typeof body.code === 'number' && body.code !== 0) continue
        const discovered = validOrigin(body.data?.serverOrigin)
        if (!discovered) continue
        applyDesktopServerOrigin(discovered)
        await setDesktopServerOriginInShell(discovered)
        cacheServerOrigin(discovered)
        return discovered
      } catch {
        // Try the next known bootstrap address.
      }
    }
    return serverOrigin
  })().finally(() => {
    serverOriginDiscoveryCompleted = true
    serverOriginDiscovery = null
  })
  return serverOriginDiscovery
}

export function getDesktopServerOrigin(): string {
  return serverOrigin
}

/** Resolve a server file URL for a plain media element in the desktop app. */
export function resolveDesktopFileUrl(value?: string): string {
  if (!value) return ''
  let url = String(value).trim()
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return url

  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url)
      const params = new URLSearchParams(parsed.search)
      ;['t', 'ts', 'timestamp', '_t', 'cacheBust'].forEach((key) => params.delete(key))
      const query = params.toString()
      const rawPath = parsed.pathname
      // Older messages can contain a URL copied from the internal API host
      // (localhost:8080) or with the reverse-proxy prefix (/pulseim/api).
      // Keep the API path but always point it at the current desktop server;
      // otherwise the packaged client either rejects it or requests a host
      // that is not reachable from the user's machine.
      const apiIndex = rawPath.search(/\/api\//i)
      const versionIndex = rawPath.search(/\/v1\//i)
      if (apiIndex >= 0) {
        url = rawPath.slice(apiIndex) + (query ? `?${query}` : '')
      } else if (versionIndex === 0) {
        url = rawPath + (query ? `?${query}` : '')
      } else {
        return url
      }
    } catch {
      return url
    }
  }

  const [path, rawQuery = ''] = url.split('?', 2)
  const params = new URLSearchParams(rawQuery)
  ;['t', 'ts', 'timestamp', '_t', 'cacheBust'].forEach((key) => params.delete(key))
  const query = params.toString()
  const apiIndex = path.search(/\/api\//i)
  const normalizedPath = apiIndex >= 0 ? path.slice(apiIndex) : path
  url = normalizedPath + (query ? `?${query}` : '')
  if (url.startsWith('/api/')) return serverOrigin ? `${serverOrigin}${url}` : url
  if (url.startsWith('/v1/')) return serverOrigin ? `${serverOrigin}/api${url}` : `/api${url}`
  if (url.startsWith('/')) return serverOrigin ? `${serverOrigin}/api${url}` : `/api${url}`
  return url
}

/** Add the lightweight avatar rendition query for locally uploaded avatars. */
export function resolveDesktopAvatarUrl(value?: string): string {
  const resolved = resolveDesktopFileUrl(value)
  if (!resolved || resolved.startsWith('data:') || resolved.startsWith('blob:')) return resolved
  try {
    const parsed = new URL(resolved, typeof window !== 'undefined' ? window.location.href : undefined)
    // Production desktop builds may be served below a prefix such as
    // /pulseim, so the API path is not necessarily at the URL root.
    if (parsed.pathname.includes('/api/v1/files/raw/')) parsed.searchParams.set('avatar', '1')
    return parsed.href
  } catch {
    return resolved
  }
}

export function getDesktopToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function clearDesktopSession(): void {
  syncDesktopMediaToken('')
  try {
    localStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(PROFILE_KEY)
    // A stale shared device id can be picked up by the mobile web on the same
    // origin and fight over one server-side device record, which makes old
    // devices kick each other in a loop. Rotate it so every login registers
    // as a fresh device.
    localStorage.removeItem(DEVICE_KEY)
    localStorage.removeItem(`${DEVICE_KEY}_desktop`)
  } catch {
    // Storage is best effort; the server session is still invalidated below.
  }
}

export function getRememberLogin(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) !== 'false'
  } catch {
    return true
  }
}

export function setRememberLogin(value: boolean): void {
  try {
    localStorage.setItem(REMEMBER_KEY, String(value))
  } catch {
    // Storage is best effort.
  }
}

export function getRememberedLogin(): RememberedLogin | null {
  try {
    const raw = localStorage.getItem(REMEMBER_CREDENTIALS_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as Partial<RememberedLogin>
    const phone = String(data.phone || '').trim()
    const password = String(data.password || '')
    if (!phone || !password) return null
    return { phone, password }
  } catch {
    try {
      localStorage.removeItem(REMEMBER_CREDENTIALS_KEY)
    } catch {
      // Storage is best effort.
    }
    return null
  }
}

export function saveRememberedLogin(phone: string, password: string): void {
  const normalizedPhone = phone.trim()
  if (!normalizedPhone || !password) {
    clearRememberedLogin()
    return
  }
  try {
    localStorage.setItem(
      REMEMBER_CREDENTIALS_KEY,
      JSON.stringify({ phone: normalizedPhone, password }),
    )
  } catch {
    // Storage is best effort.
  }
}

export function clearRememberedLogin(): void {
  try {
    localStorage.removeItem(REMEMBER_CREDENTIALS_KEY)
  } catch {
    // Storage is best effort.
  }
}

export function saveDesktopSession(token: string, profile?: Partial<DesktopProfile>, remember = getRememberLogin()): void {
  syncDesktopMediaToken(token)
  // Drop the legacy shared device id once the desktop registers its own
  // identity, so the mobile web on the same origin cannot pick it up and
  // reuse a device id that used to belong to another account. Only do this
  // when this client does not itself store its id under the shared key: the
  // packaged shell uses pulse_device_id on file://, and wiping it right after
  // login would make getDesktopDeviceId() generate a fresh id that no longer
  // matches the server-side device record (the session then looks revoked).
  try {
    if (desktopDeviceStorageKey() !== DEVICE_KEY) {
      localStorage.removeItem(DEVICE_KEY)
    }
  } catch {
    // Storage is best effort.
  }
  const target = remember ? localStorage : sessionStorage
  const other = remember ? sessionStorage : localStorage
  target.setItem(TOKEN_KEY, token)
  other.removeItem(TOKEN_KEY)
  if (profile) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({
      ...profile,
      avatarUrl: profile.avatarUrl == null ? profile.avatarUrl : resolveDesktopAvatarUrl(profile.avatarUrl),
    }))
  }
}

export function readCachedProfile(): DesktopProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    return raw ? (JSON.parse(raw) as DesktopProfile) : null
  } catch {
    return null
  }
}

function desktopDeviceStorageKey(): string {
  try {
    // The desktop web is mounted under /pulseim/desktop/ while the mobile web
    // shares the same origin (/pulseim). Both used to read 'pulse_device_id',
    // so two accounts could fight over one server-side device record and kick
    // each other. Give the desktop web its own namespace. The packaged
    // Electron client loads from file:// and is already isolated, so it keeps
    // the original key.
    if (typeof window !== 'undefined' && /^https?:$/i.test(window.location.protocol)) {
      return `${DEVICE_KEY}_desktop`
    }
  } catch {
    // Fall through to the shared key.
  }
  return DEVICE_KEY
}

function deviceId(): string {
  const key = desktopDeviceStorageKey()
  let value = localStorage.getItem(key)
  if (!value) {
    value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
    localStorage.setItem(key, value)
  }
  return value
}

export function getDesktopDeviceId(): string {
  return deviceId()
}

function isElectronShell(): boolean {
  return typeof window !== 'undefined' && Boolean(window.pulseDesktop)
}

export function syncDesktopMediaToken(token?: string | null): void {
  const desktopShell = (globalThis as typeof globalThis & {
    pulseDesktop?: {
      setMediaToken?: (value: string) => void
    }
  }).pulseDesktop
  if (typeof desktopShell?.setMediaToken === 'function') {
    desktopShell.setMediaToken(String(token || '').trim())
  }
}

function desktopDeviceMetadata(): { deviceName: string; platform: 'windows' | 'windows_web' } {
  return isElectronShell()
    ? { deviceName: 'Windows 客户端', platform: 'windows' }
    : { deviceName: 'Windows 网页端', platform: 'windows_web' }
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

async function request<T>(path: string, init: RequestInit = {}, allowRefresh = true): Promise<T> {
  await initializeDesktopServerOrigin()
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const token = getDesktopToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let response: Response
  try {
    const requestUrl = `${apiBase}${path}`
    const desktopShell = (globalThis as typeof globalThis & {
      pulseDesktop?: {
        apiRequest?: (options: {
          url: string
          method: string
          headers: Record<string, string>
          body?: string
        }) => Promise<{ status: number; headers?: Record<string, string>; body: string }>
      }
    }).pulseDesktop
    const isSimpleBody = init.body == null || typeof init.body === 'string'
    const isElectronApi = isElectronShell() && isSimpleBody && desktopShell?.apiRequest
    if (isElectronApi) {
      const requestHeaders: Record<string, string> = {}
      headers.forEach((value, key) => { requestHeaders[key] = value })
      const proxied = await desktopShell.apiRequest({
        url: requestUrl,
        method: String(init.method || (init.body ? 'POST' : 'GET')).toUpperCase(),
        headers: requestHeaders,
        body: typeof init.body === 'string' ? init.body : undefined,
      })
      response = new Response(proxied.body, {
        status: proxied.status,
        headers: proxied.headers || {},
      })
    } else {
      response = await fetch(requestUrl, {
        ...init,
        headers,
        credentials: 'include',
      })
    }
  } catch {
    throw new Error('无法连接 Pulse 服务，请检查服务器地址或网络')
  }

  const body = await parseBody(response)
  if (response.status === 401 && allowRefresh && token && path !== '/v1/auth/refresh') {
    const refreshed = await request<{ token: string }>('/v1/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({}),
    }, false).catch(() => null)
    if (refreshed?.token) {
      saveDesktopSession(refreshed.token)
      return request<T>(path, init, false)
    }
    clearDesktopSession()
    throw createDesktopAuthError()
  }
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && 'message' in body
      ? String((body as { message?: unknown }).message || '')
      : ''
    if (response.status === 401 && token) throw createDesktopAuthError()
    throw new Error(message || `请求失败（${response.status}）`)
  }
  if (typeof body === 'object' && body !== null && 'code' in body) {
    const result = body as ApiResult<T>
    if (result.code !== 0) throw new Error(result.message || '请求失败')
    return result.data
  }
  return body as T
}

export function requestDesktopApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  return request<T>(path, init)
}

/** Refreshes the desktop session for direct media requests that bypass request(). */
export async function refreshDesktopToken(): Promise<string | null> {
  const token = getDesktopToken()
  if (!token) return null
  const refreshed = await request<{ token: string }>('/v1/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({}),
  }, false).catch((error) => {
    if (isDesktopAuthError(error)) clearDesktopSession()
    return null
  })
  if (!refreshed?.token) return null
  saveDesktopSession(refreshed.token)
  return refreshed.token
}

export function fetchDesktopMapConfig(): Promise<DesktopMapConfig> {
  return request<DesktopMapConfig>('/v1/config/map?platform=desktop')
}

export function fetchDesktopClientAccessConfig(): Promise<DesktopClientAccessConfig> {
  const metadata = desktopDeviceMetadata()
  return request<DesktopClientAccessConfig>(`/v1/config/client-access?platform=${encodeURIComponent(metadata.platform)}`)
}

export function fetchDesktopFileConfig(): Promise<DesktopFileConfig> {
  return request<DesktopFileConfig>('/v1/files/config')
}

export async function loginDesktop(phone: string, password: string, remember = true, securityCode = ''): Promise<LoginResponse> {
  setRememberLogin(remember)
  const metadata = desktopDeviceMetadata()
  const data = await request<LoginResponse>('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      phone,
      password,
      deviceId: deviceId(),
      deviceName: metadata.deviceName,
      platform: metadata.platform,
      securityCode: securityCode.trim().toUpperCase() || undefined,
    }),
  }, false)
  if (!data?.token) throw new Error('登录接口未返回 Token')
  const normalized = { ...data, avatarUrl: resolveDesktopAvatarUrl(data.avatarUrl || '') }
  saveDesktopSession(data.token, {
    userId: String(data.userId),
    pulseId: data.pulseId,
    nickname: data.nickname,
    avatarUrl: normalized.avatarUrl,
    phone: data.phone,
  }, remember)
  return normalized
}

export async function registerDesktop(
  phone: string,
  code: string,
  nickname: string,
  password: string,
  remember = true,
): Promise<LoginResponse> {
  setRememberLogin(remember)
  const metadata = desktopDeviceMetadata()
  const data = await request<LoginResponse>('/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      phone,
      code,
      nickname,
      password,
      deviceId: deviceId(),
      deviceName: metadata.deviceName,
      platform: metadata.platform,
    }),
  }, false)
  if (!data?.token) throw new Error('注册接口未返回 Token')
  const normalized = { ...data, avatarUrl: resolveDesktopAvatarUrl(data.avatarUrl || '') }
  saveDesktopSession(data.token, {
    userId: String(data.userId),
    pulseId: data.pulseId,
    nickname: data.nickname,
    avatarUrl: normalized.avatarUrl,
    phone: data.phone,
  }, remember)
  return normalized
}

export function startDesktopQrLogin(): Promise<DesktopQrLoginStart> {
  const metadata = desktopDeviceMetadata()
  return request<DesktopQrLoginStart>('/v1/auth/qr/start', {
    method: 'POST',
    body: JSON.stringify({
      deviceId: deviceId(),
      deviceName: metadata.deviceName,
      platform: metadata.platform,
    }),
  }, false)
}

export function pollDesktopQrLogin(ticket: string): Promise<DesktopQrLoginStatus> {
  return request<DesktopQrLoginStatus>(`/v1/auth/qr/status?ticket=${encodeURIComponent(ticket)}`, {}, false)
}

export function sendDesktopSmsCode(phone: string, scene: 'register' | 'reset' | 'login' | 'change_phone' | 'change_password' = 'reset'): Promise<{ message: string; devHint?: string }> {
  const metadata = desktopDeviceMetadata()
  return request<{ message: string; devHint?: string }>('/v1/auth/sms/send', {
    method: 'POST',
    body: JSON.stringify({ phone, scene, platform: metadata.platform }),
  }, false)
}

export function resetDesktopPassword(payload: { phone: string; code: string; password: string }): Promise<unknown> {
  return request<unknown>('/v1/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, false)
}

export async function logoutDesktop(): Promise<void> {
  try {
    await request<unknown>('/v1/auth/logout', { method: 'POST' })
  } finally {
    clearDesktopSession()
  }
}

export function fetchDesktopProfile(): Promise<DesktopProfile> {
  return request<DesktopProfile>('/v1/user/profile').then((profile) => ({
    ...profile,
    avatarUrl: resolveDesktopAvatarUrl(profile.avatarUrl || ''),
  }))
}

export function fetchDesktopAccountSecurity(): Promise<DesktopAccountSecurityInfo> {
  return request<DesktopAccountSecurityInfo>('/v1/user/security')
}

export function changeDesktopAccountPassword(payload: {
  oldPassword: string
  newPassword: string
  code: string
}): Promise<void> {
  return request<void>('/v1/user/security/password', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function changeDesktopAccountPhone(payload: {
  newPhone: string
  code: string
}): Promise<DesktopAccountSecurityInfo> {
  return request<DesktopAccountSecurityInfo>('/v1/user/security/phone', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function fetchDesktopSystemText(key: string): Promise<DesktopSystemText> {
  return request<DesktopSystemText>(`/v1/system/texts/${encodeURIComponent(key)}`)
}

export function deleteDesktopAccount(agreementKey = 'account_deletion_agreement'): Promise<void> {
  return request<void>('/v1/user/security/account', {
    method: 'DELETE',
    body: JSON.stringify({ agreementKey }),
  })
}

export function setDesktopSecurityCodeEnabled(enabled: boolean): Promise<DesktopAccountSecurityInfo> {
  return request<DesktopAccountSecurityInfo>('/v1/user/security/security-code', {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  })
}

export function refreshDesktopSecurityCode(): Promise<DesktopAccountSecurityInfo> {
  return request<DesktopAccountSecurityInfo>('/v1/user/security/security-code/refresh', { method: 'POST' })
}

export async function fetchDesktopHelpQuestions(): Promise<DesktopHelpQuestion[]> {
  const payload = await request<Array<Record<string, unknown>>>('/v1/help/questions')
  return (Array.isArray(payload) ? payload : []).map((item) => ({
    id: String(item.id ?? ''),
    question: String(item.question ?? item.title ?? ''),
    answer: String(item.answer ?? item.content ?? ''),
    category: item.category ? String(item.category) : undefined,
  })).filter((item) => item.id && item.question)
}

export function submitDesktopFeedback(content: string): Promise<{ id?: string | number; status?: string }> {
  return request<{ id?: string | number; status?: string }>('/v1/help/feedback', {
    method: 'POST',
    body: JSON.stringify({ content, imageUrls: [] }),
  })
}

export function fetchDesktopDeviceSessions(): Promise<{
  list: DesktopDeviceSession[]
  currentDeviceId?: string
}> {
  return request('/v1/user/security/devices')
}

export function revokeDesktopDevice(deviceId: string): Promise<void> {
  return request<void>(`/v1/user/security/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' })
}

export function revokeDesktopOtherDevices(): Promise<{ count: number }> {
  return request<{ count: number }>('/v1/user/security/devices/logout-others', { method: 'POST' })
}

export function fetchDesktopConversations(filter = 'all'): Promise<DesktopConversation[]> {
  return request<DesktopConversation[]>(`/v1/conversations?filter=${encodeURIComponent(filter)}`)
}

export function fetchDesktopContacts(): Promise<{ list: DesktopContact[] }> {
  return request<{ list: DesktopContact[] }>('/v1/contacts')
}

export function updateDesktopFriendRemark(userId: string, remark: string): Promise<void> {
  return request<void>(`/v1/contacts/${encodeURIComponent(userId)}/remark`, {
    method: 'PUT',
    body: JSON.stringify({ remark: remark.trim() }),
  })
}

export async function searchDesktop(keyword: string): Promise<DesktopSearchResult> {
  const raw = await request<DesktopSearchPayload>(`/v1/search?q=${encodeURIComponent(keyword.trim())}`)
  const messages = (raw.messages || []).map((message) => ({
    msgId: String(message.msgId || ''),
    conversationId: String(message.conversationId),
    conversationTitle: message.conversationTitle || '聊天',
    conversationType: message.conversationType ?? 1,
    fromNickname: message.fromNickname || '用户',
    content: message.content || '',
    msgType: message.msgType ?? 0,
    createdAt: message.createdAt,
  }))

  let conversations: DesktopSearchResult['conversations'] = (raw.conversations || []).map((conversation) => ({
    conversationId: String(conversation.conversationId),
    conversationTitle: conversation.conversationTitle || '聊天',
    conversationType: conversation.conversationType ?? 1,
    avatarUrl: resolveDesktopAvatarUrl(conversation.avatarUrl || ''),
    matchCount: conversation.matchCount || 0,
    preview: conversation.preview || '',
    latestMsgId: conversation.latestMsgId || '',
    latestMsgType: conversation.latestMsgType ?? 0,
    createdAt: conversation.createdAt,
  }))

  // 与移动端保持一致：旧服务端只返回 messages 时，按会话聚合为聊天记录。
  if (!conversations.length && messages.length) {
    const grouped = new Map<string, DesktopSearchResult['conversations'][number]>()
    for (const message of messages) {
      const current = grouped.get(message.conversationId)
      if (current) {
        current.matchCount = (current.matchCount || 0) + 1
        continue
      }
      grouped.set(message.conversationId, {
        conversationId: message.conversationId,
        conversationTitle: message.conversationTitle,
        conversationType: message.conversationType,
        avatarUrl: '',
        matchCount: 1,
        preview: message.content,
        latestMsgId: message.msgId,
        latestMsgType: message.msgType,
        createdAt: message.createdAt,
      })
    }
    conversations = Array.from(grouped.values())
  }

  return {
    contacts: (raw.contacts || []).map((contact) => ({
      userId: String(contact.userId),
      nickname: contact.nickname || '用户',
      avatarUrl: resolveDesktopAvatarUrl(contact.avatarUrl || ''),
      online: Boolean(contact.online),
      onlineHidden: Boolean(contact.onlineHidden),
      subtitle: contact.subtitle || '',
      fileTransferAssistant: Boolean(contact.fileTransferAssistant),
    })),
    groups: (raw.groups || []).map((group) => ({
      id: String(group.id),
      title: group.title || '群聊',
      avatarUrl: resolveDesktopAvatarUrl(group.avatarUrl || ''),
      memberCount: group.memberCount || 0,
    })),
    messages,
    conversations,
  }
}

export function fetchDesktopUserProfile(userId: string): Promise<DesktopProfile & {
  friend?: boolean
  friendStatus?: string
  signature?: string
}> {
  return request<DesktopProfile & { friend?: boolean; friendStatus?: string; signature?: string }>(
    `/v1/user/${encodeURIComponent(userId)}`,
  ).then((profile) => ({
    ...profile,
    avatarUrl: resolveDesktopAvatarUrl(profile.avatarUrl || ''),
  }))
}

export function fetchDesktopUserMoments(userId: string): Promise<DesktopMoment[]> {
  return request<DesktopMomentPayload[]>(`/v1/users/${encodeURIComponent(userId)}/moments`)
    .then((items) => (items || []).map(mapDesktopMoment).filter((item) => item.id))
}

export function fetchDesktopCommonGroups(userId: string): Promise<DesktopCommonGroup[]> {
  return request<{ list?: Array<{ id: string | number; title?: string; avatarUrl?: string; memberCount?: number }> }>(
    `/v1/users/${encodeURIComponent(userId)}/common-groups`,
  ).then((result) => (result.list || []).map((group) => ({
    id: String(group.id),
    title: group.title || '群聊',
    avatarUrl: resolveDesktopAvatarUrl(group.avatarUrl || ''),
    memberCount: Number(group.memberCount || 0),
  })))
}

export function openDesktopPrivateConversation(peerUserId: string): Promise<DesktopConversation> {
  return request<DesktopConversation>('/v1/conversations/private', {
    method: 'POST',
    body: JSON.stringify({ peerUserId: Number(peerUserId) }),
  })
}

export function createDesktopGroupConversation(title: string, memberIds: string[]): Promise<DesktopConversation> {
  return request<DesktopConversation>('/v1/conversations/group', {
    method: 'POST',
    body: JSON.stringify({
      title: title.trim(),
      memberIds: memberIds.map((id) => Number(id)),
    }),
  })
}

export function searchDesktopGroups(keyword: string): Promise<DesktopGroupPreview[]> {
  return request<Array<{
    id: number | string
    pulseId?: string
    title?: string
    avatarUrl?: string
    notice?: string
    groupWelcomeMessage?: string
    groupWelcomeSetterId?: number | string
    groupWelcomeSetterNickname?: string
    groupWelcomeSetterAvatarUrl?: string
    memberCount?: number
    joined?: boolean
    joinVerifyRequired?: boolean
    joinPending?: boolean
    ownerNickname?: string
  }>>(`/v1/conversations/group/search?q=${encodeURIComponent(keyword.trim())}`).then((items) => (items || []).map((item) => ({
    id: String(item.id),
    pulseId: item.pulseId || formatDesktopGroupPulseId(item.id),
    title: item.title || '群聊',
    avatarUrl: resolveDesktopAvatarUrl(item.avatarUrl || ''),
    notice: item.notice || '',
    memberCount: Number(item.memberCount || 0),
    joined: Boolean(item.joined),
    joinVerifyRequired: Boolean(item.joinVerifyRequired),
    joinPending: Boolean(item.joinPending),
    ownerNickname: item.ownerNickname || '',
  })))
}

export function fetchDesktopGroupPreview(conversationId: string): Promise<DesktopGroupPreview> {
  return request<{
    id: number | string
    pulseId?: string
    title?: string
    avatarUrl?: string
    notice?: string
    memberCount?: number
    joined?: boolean
    joinVerifyRequired?: boolean
    joinPending?: boolean
    ownerNickname?: string
  }>(`/v1/conversations/${encodeURIComponent(conversationId)}/group/preview`).then((item) => ({
    id: String(item.id),
    pulseId: item.pulseId || formatDesktopGroupPulseId(item.id),
    title: item.title || '缇よ亰',
    avatarUrl: resolveDesktopAvatarUrl(item.avatarUrl || ''),
    notice: item.notice || '',
    memberCount: Number(item.memberCount || 0),
    joined: Boolean(item.joined),
    joinVerifyRequired: Boolean(item.joinVerifyRequired),
    joinPending: Boolean(item.joinPending),
    ownerNickname: item.ownerNickname || '',
  }))
}

export function joinDesktopGroup(conversationId: string, source = 'search'): Promise<unknown> {
  return request<unknown>(`/v1/conversations/${encodeURIComponent(conversationId)}/group/join`, {
    method: 'POST',
    body: JSON.stringify({ source }),
  })
}

export function sendDesktopFriendRequest(userId: string, message = ''): Promise<unknown> {
  return request<unknown>(`/v1/contacts/${encodeURIComponent(userId)}`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  })
}

export function fetchDesktopFriendRequests(): Promise<{ list: DesktopFriendRequest[]; pendingCount: number }> {
  return request<{ list: DesktopFriendRequest[]; pendingCount: number }>('/v1/friend-requests').then((result) => ({
    pendingCount: Number(result.pendingCount || 0),
    list: (result.list || []).map((item) => ({
      ...item,
      id: String(item.id),
      fromUserId: String(item.fromUserId),
      toUserId: String(item.toUserId),
    })),
  }))
}

export function acceptDesktopFriendRequest(id: string): Promise<unknown> {
  return request<unknown>(`/v1/friend-requests/${encodeURIComponent(id)}/accept`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function rejectDesktopFriendRequest(id: string): Promise<unknown> {
  return request<unknown>(`/v1/friend-requests/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
  })
}

export function fetchDesktopGroupNotifications(): Promise<{
  invites: DesktopGroupNotificationItem[]
  joinRequests: DesktopGroupNotificationItem[]
  events: DesktopGroupNotificationEvent[]
  pendingCount: number
}> {
  return request<{
    invites?: DesktopGroupNotificationItem[]
    joinRequests?: DesktopGroupNotificationItem[]
    events?: DesktopGroupNotificationEvent[]
    pendingCount?: number
  }>('/v1/user/group-notifications').then((result) => ({
    invites: (result.invites || []).map((item) => ({ ...item, id: String(item.id), conversationId: String(item.conversationId), applicantId: String(item.applicantId) })),
    joinRequests: (result.joinRequests || []).map((item) => ({ ...item, id: String(item.id), conversationId: String(item.conversationId), applicantId: String(item.applicantId) })),
    events: (result.events || []).map((item) => ({ ...item, id: String(item.id), conversationId: String(item.conversationId) })),
    pendingCount: Number(result.pendingCount || 0),
  }))
}

export function acceptDesktopGroupInvite(requestId: string): Promise<unknown> {
  return request<unknown>(`/v1/user/group-invites/${encodeURIComponent(requestId)}/accept`, { method: 'POST' })
}

export function rejectDesktopGroupInvite(requestId: string): Promise<unknown> {
  return request<unknown>(`/v1/user/group-invites/${encodeURIComponent(requestId)}/reject`, { method: 'POST' })
}

export function approveDesktopGroupJoinRequest(conversationId: string, requestId: string): Promise<unknown> {
  return request<unknown>(`/v1/conversations/${encodeURIComponent(conversationId)}/group/join-requests/${encodeURIComponent(requestId)}/approve`, { method: 'POST' })
}

export function rejectDesktopGroupJoinRequest(conversationId: string, requestId: string): Promise<unknown> {
  return request<unknown>(`/v1/conversations/${encodeURIComponent(conversationId)}/group/join-requests/${encodeURIComponent(requestId)}/reject`, { method: 'POST', body: JSON.stringify({}) })
}

export function fetchDesktopMessages(
  conversationId: string,
  limit = 60,
  options: { after?: string; before?: string } = {},
): Promise<DesktopMessage[]> {
  const safeLimit = Math.min(Math.max(Number(limit) || 60, 1), 200)
  const query = new URLSearchParams({ limit: String(safeLimit) })
  if (options.after) query.set('after', options.after)
  if (options.before) query.set('before', options.before)
  return request<DesktopMessage[]>(`/v1/conversations/${encodeURIComponent(conversationId)}/messages?${query.toString()}`)
}

export async function fetchDesktopGroupDetail(conversationId: string): Promise<DesktopGroupDetail> {
  const source = await request<{
    id: number | string
    title?: string
    pulseId?: string
    avatarUrl?: string
    notice?: string
    groupWelcomeMessage?: string
    groupWelcomeSetterId?: number | string
    groupWelcomeSetterNickname?: string
    groupWelcomeSetterAvatarUrl?: string
    ownerId?: number | string
    owner?: boolean
    admin?: boolean
    myRole?: string
    myGroupNickname?: string
    groupRemark?: string
    hidden?: boolean
    pinned?: boolean
    mute?: boolean
    muteAll?: boolean
    joinVerifyRequired?: boolean
    memberFriendAllowed?: boolean
    searchMode?: number
    memberInviteAllowed?: boolean
    pendingJoinCount?: number
    speakMuted?: boolean
    memberCount?: number
    members?: Array<{
      userId: number | string
      nickname?: string
      groupNickname?: string
      remark?: string
      avatarUrl?: string
      role?: string
      owner?: boolean
      admin?: boolean
      speakMuted?: boolean
    }>
  }>(`/v1/conversations/${encodeURIComponent(conversationId)}/group`)
  const ownerId = source.ownerId == null ? undefined : String(source.ownerId)
  const members = (source.members || []).map((member) => {
    const memberId = String(member.userId)
    const isOwner = Boolean(member.owner) || (Boolean(ownerId) && memberId === ownerId) || member.role === 'owner'
    const isAdmin = isOwner || Boolean(member.admin) || member.role === 'admin'
    const role: DesktopGroupRole = isOwner ? 'owner' : isAdmin ? 'admin' : 'member'
    const displayName = String(member.remark || member.groupNickname || member.nickname || '用户').trim() || '用户'
    return {
      userId: memberId,
      nickname: displayName,
      groupNickname: member.groupNickname?.trim() || undefined,
      remark: member.remark?.trim() || undefined,
      avatarUrl: resolveDesktopAvatarUrl(member.avatarUrl || ''),
      role,
      owner: isOwner,
      admin: isAdmin,
      speakMuted: Boolean(member.speakMuted),
    }
  })
  return {
    id: String(source.id || conversationId),
    pulseId: source.pulseId || formatDesktopGroupPulseId(source.id || conversationId),
    title: source.title || '群聊',
    avatarUrl: resolveDesktopAvatarUrl(source.avatarUrl || ''),
    notice: source.notice || '',
    welcomeMessage: source.groupWelcomeMessage || '',
    welcomeSetterId: source.groupWelcomeSetterId == null ? undefined : String(source.groupWelcomeSetterId),
    welcomeSetterNickname: source.groupWelcomeSetterNickname || '',
    welcomeSetterAvatarUrl: resolveDesktopAvatarUrl(source.groupWelcomeSetterAvatarUrl || ''),
    ownerId,
    owner: Boolean(source.owner),
    admin: Boolean(source.admin),
    myRole: source.myRole === 'owner' || source.owner
      ? 'owner'
      : source.myRole === 'admin' || source.admin
        ? 'admin'
        : 'member',
    myGroupNickname: source.myGroupNickname || '',
    groupRemark: source.groupRemark || '',
    hidden: Boolean(source.hidden),
    pinned: Boolean(source.pinned),
    mute: Boolean(source.mute),
    muteAll: Boolean(source.muteAll),
    joinVerifyRequired: Boolean(source.joinVerifyRequired),
    allowMemberAddFriend: source.memberFriendAllowed !== false,
    searchMode: source.searchMode === 1 || source.searchMode === 2 ? source.searchMode : 3,
    memberInviteAllowed: source.memberInviteAllowed !== false,
    pendingJoinCount: Number(source.pendingJoinCount || 0),
    speakMuted: Boolean(source.speakMuted),
    memberCount: Number(source.memberCount || members.length),
    members,
  }
}

export function updateDesktopGroupTitle(conversationId: string, title: string): Promise<unknown> {
  return request<unknown>(`/v1/conversations/${encodeURIComponent(conversationId)}/group/title`, {
    method: 'PUT',
    body: JSON.stringify({ title }),
  })
}

export function updateDesktopGroupNotice(conversationId: string, notice: string): Promise<unknown> {
  return request<unknown>(`/v1/conversations/${encodeURIComponent(conversationId)}/group/notice`, {
    method: 'PUT',
    body: JSON.stringify({ notice }),
  })
}

export interface DesktopGroupScheduledMessage {
  id: string
  conversationId: string
  setterId?: string
  setterNickname?: string
  setterAvatarUrl?: string
  msgType: 0 | 1 | 2
  content: string
  sendAt: string
  status: string
  lastError?: string
  sentMsgId?: string
}

function mapDesktopScheduledMessage(row: any): DesktopGroupScheduledMessage {
  return {
    id: String(row.id),
    conversationId: String(row.conversationId),
    setterId: row.setterId == null ? undefined : String(row.setterId),
    setterNickname: row.setterNickname || '',
    setterAvatarUrl: resolveDesktopAvatarUrl(row.setterAvatarUrl || ''),
    msgType: row.msgType === 1 || row.msgType === 2 ? row.msgType : 0,
    content: row.content || '',
    sendAt: row.sendAt || '',
    status: row.status || 'PENDING',
    lastError: row.lastError || '',
    sentMsgId: row.sentMsgId ? String(row.sentMsgId) : undefined,
  }
}

export function updateDesktopGroupWelcome(conversationId: string, message: string): Promise<unknown> {
  return request<unknown>(`/v1/conversations/${encodeURIComponent(conversationId)}/group/welcome`, {
    method: 'PUT',
    body: JSON.stringify({ message }),
  })
}

export function fetchDesktopGroupScheduledMessages(conversationId: string): Promise<DesktopGroupScheduledMessage[]> {
  return request<any[]>(`/v1/conversations/${encodeURIComponent(conversationId)}/group/scheduled-messages`)
    .then((rows) => (rows || []).map(mapDesktopScheduledMessage))
}

export function createDesktopGroupScheduledMessage(
  conversationId: string,
  payload: { msgType: 0 | 1 | 2; content: string; sendAt: string },
): Promise<DesktopGroupScheduledMessage> {
  return request<any>(`/v1/conversations/${encodeURIComponent(conversationId)}/group/scheduled-messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }).then(mapDesktopScheduledMessage)
}

export function updateDesktopGroupScheduledMessage(
  conversationId: string,
  scheduleId: string,
  payload: { msgType: 0 | 1 | 2; content: string; sendAt: string },
): Promise<DesktopGroupScheduledMessage> {
  return request<any>(`/v1/conversations/${encodeURIComponent(conversationId)}/group/scheduled-messages/${encodeURIComponent(scheduleId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }).then(mapDesktopScheduledMessage)
}

export function cancelDesktopGroupScheduledMessage(conversationId: string, scheduleId: string): Promise<unknown> {
  return request<unknown>(`/v1/conversations/${encodeURIComponent(conversationId)}/group/scheduled-messages/${encodeURIComponent(scheduleId)}`, { method: 'DELETE' })
}

export function setDesktopJoinVerifyRequired(conversationId: string, joinVerifyRequired: boolean): Promise<unknown> {
  return request<unknown>(`/v1/conversations/${encodeURIComponent(conversationId)}/group/join-verify`, {
    method: 'POST',
    body: JSON.stringify({ joinVerifyRequired }),
  })
}

export function setDesktopGroupMemberFriendAllowed(conversationId: string, memberFriendAllowed: boolean): Promise<unknown> {
  return request<unknown>(`/v1/conversations/${encodeURIComponent(conversationId)}/group/member-friend-allowed`, {
    method: 'POST',
    body: JSON.stringify({ memberFriendAllowed }),
  })
}

export function setDesktopGroupSearchMode(conversationId: string, searchMode: 1 | 2 | 3): Promise<unknown> {
  return request<unknown>(`/v1/conversations/${encodeURIComponent(conversationId)}/group/search-mode`, {
    method: 'POST',
    body: JSON.stringify({ searchMode }),
  })
}

export function setDesktopGroupMemberInviteAllowed(conversationId: string, memberInviteAllowed: boolean): Promise<unknown> {
  return request<unknown>(`/v1/conversations/${encodeURIComponent(conversationId)}/group/member-invite-allowed`, {
    method: 'POST',
    body: JSON.stringify({ memberInviteAllowed }),
  })
}

export function fetchDesktopImportantNotificationSetting(conversationId: string): Promise<DesktopImportantNotificationSetting> {
  return request<{
    atAll?: boolean
    mentionMe?: boolean
    replyMe?: boolean
    announcement?: boolean
    followedMemberIds?: Array<number | string>
  }>(`/v1/conversations/${encodeURIComponent(conversationId)}/group/important-notifications`).then((value) => ({
    atAll: value.atAll !== false,
    mentionMe: value.mentionMe !== false,
    replyMe: value.replyMe !== false,
    announcement: value.announcement !== false,
    followedMemberIds: (value.followedMemberIds || []).map(String),
  }))
}

export function updateDesktopImportantNotificationSetting(
  conversationId: string,
  setting: DesktopImportantNotificationSetting,
): Promise<unknown> {
  return request<unknown>(`/v1/conversations/${encodeURIComponent(conversationId)}/group/important-notifications`, {
    method: 'PUT',
    body: JSON.stringify({
      ...setting,
      followedMemberIds: setting.followedMemberIds.map((id) => Number(id)),
    }),
  })
}

export function setDesktopGroupMemberRole(conversationId: string, userId: string, role: 'admin' | 'member'): Promise<unknown> {
  return request<unknown>(`/v1/conversations/${encodeURIComponent(conversationId)}/group/members/role`, {
    method: 'POST',
    body: JSON.stringify({ userId: Number(userId), role }),
  })
}

export function setDesktopGroupMuteAll(conversationId: string, muteAll: boolean): Promise<unknown> {
  return request<unknown>(`/v1/conversations/${encodeURIComponent(conversationId)}/group/mute-all`, {
    method: 'POST',
    body: JSON.stringify({ muteAll }),
  })
}

export function setDesktopGroupMemberSpeakMuted(conversationId: string, userId: string, speakMuted: boolean): Promise<unknown> {
  return request<unknown>(`/v1/conversations/${encodeURIComponent(conversationId)}/group/members/speak-mute`, {
    method: 'POST',
    body: JSON.stringify({ userId: Number(userId), speakMuted }),
  })
}

export function addDesktopGroupMembers(conversationId: string, memberIds: string[]): Promise<unknown> {
  return request<unknown>(`/v1/conversations/${encodeURIComponent(conversationId)}/group/members`, {
    method: 'POST',
    body: JSON.stringify({ memberIds: memberIds.map((id) => Number(id)) }),
  })
}

export function removeDesktopGroupMember(conversationId: string, userId: string): Promise<unknown> {
  return request<unknown>(`/v1/conversations/${encodeURIComponent(conversationId)}/group/members/remove`, {
    method: 'POST',
    body: JSON.stringify({ userId: Number(userId) }),
  })
}

export function transferDesktopGroupOwner(conversationId: string, userId: string): Promise<unknown> {
  return request<unknown>(`/v1/conversations/${encodeURIComponent(conversationId)}/group/transfer`, {
    method: 'POST',
    body: JSON.stringify({ userId: Number(userId) }),
  })
}

export function leaveDesktopGroup(conversationId: string): Promise<unknown> {
  return request<unknown>(`/v1/conversations/${encodeURIComponent(conversationId)}/group/leave`, { method: 'POST' })
}

export function dissolveDesktopGroup(conversationId: string): Promise<unknown> {
  return request<unknown>(`/v1/conversations/${encodeURIComponent(conversationId)}/group/dissolve`, { method: 'POST' })
}

export function fetchDesktopBurnSetting(conversationId: string): Promise<DesktopBurnSetting> {
  return request<DesktopBurnSetting>(`/v1/conversations/${encodeURIComponent(conversationId)}/burn-setting`)
}

export function updateDesktopBurnSetting(
  conversationId: string,
  setting: { enabled: boolean; burnSeconds: number },
): Promise<DesktopBurnSetting> {
  return request<DesktopBurnSetting>(`/v1/conversations/${encodeURIComponent(conversationId)}/burn-setting`, {
    method: 'PUT',
    body: JSON.stringify(setting),
  })
}

export function fetchDesktopAutoDeleteSetting(conversationId: string): Promise<DesktopAutoDeleteSetting> {
  return request<DesktopAutoDeleteSetting>(`/v1/conversations/${encodeURIComponent(conversationId)}/auto-delete-setting`)
}

export function updateDesktopAutoDeleteSetting(
  conversationId: string,
  setting: { enabled: boolean; ttlSeconds: number },
): Promise<DesktopAutoDeleteSetting> {
  return request<DesktopAutoDeleteSetting>(`/v1/conversations/${encodeURIComponent(conversationId)}/auto-delete-setting`, {
    method: 'PUT',
    body: JSON.stringify(setting),
  })
}

export function viewDesktopBurnMedia(conversationId: string, messageId: string): Promise<{
  msgId: string
  burnReadAt: string
  burnExpiresAt: string
}> {
  return request(`/v1/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/burn-view`, {
    method: 'POST',
  })
}

export function searchDesktopMessages(
  conversationId: string,
  keyword: string,
  options: { filter?: 'media' | 'file' | 'contact' | 'date' | string; from?: string; to?: string } = {},
): Promise<DesktopMessage[]> {
  const query = new URLSearchParams()
  if (keyword) query.set('q', keyword)
  if (options.filter) query.set('filter', options.filter)
  if (options.from) query.set('from', options.from)
  if (options.to) query.set('to', options.to)
  const suffix = query.toString() ? `?${query.toString()}` : ''
  return request<DesktopMessage[]>(`/v1/conversations/${encodeURIComponent(conversationId)}/messages/search${suffix}`)
}

export function recallDesktopMessage(conversationId: string, messageId: string): Promise<DesktopMessage> {
  return request<DesktopMessage>(`/v1/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/recall`, {
    method: 'POST',
  })
}

export function deleteDesktopMessages(conversationId: string, messageIds: string[], mode: 'self' | 'both' = 'self'): Promise<unknown> {
  return request<unknown>(`/v1/conversations/${encodeURIComponent(conversationId)}/messages/delete`, {
    method: 'POST',
    body: JSON.stringify({ msgIds: messageIds, mode }),
  })
}

export function forwardDesktopMessages(
  conversationId: string,
  targetConversationIds: string[],
  messageIds: string[],
  mode: 'separate' | 'merge' = 'merge',
): Promise<{ count?: number }> {
  return request<{ count?: number }>(`/v1/conversations/${encodeURIComponent(conversationId)}/messages/forward`, {
    method: 'POST',
    body: JSON.stringify({ targetConversationIds, msgIds: messageIds, mode }),
  })
}

export function addDesktopFavorite(conversationId: string, messageId: string): Promise<DesktopFavorite> {
  return request<DesktopFavorite>('/v1/favorites', {
    method: 'POST',
    body: JSON.stringify({ conversationId, msgId: messageId }),
  })
}

export function fetchDesktopFavorites(): Promise<DesktopFavorite[]> {
  return request<DesktopFavorite[]>('/v1/favorites')
}

export function fetchDesktopFavorite(favoriteId: string): Promise<DesktopFavorite> {
  return request<DesktopFavorite>(`/v1/favorites/${encodeURIComponent(favoriteId)}`)
}

export function deleteDesktopFavorite(favoriteId: string): Promise<unknown> {
  return request<unknown>(`/v1/favorites/${encodeURIComponent(favoriteId)}/delete`, {
    method: 'POST',
  })
}

export function fetchDesktopWallet(): Promise<DesktopWalletSummary> {
  return request<DesktopWalletSummary>('/v1/wallet')
}

export function fetchDesktopWalletAmountConfig(): Promise<DesktopWalletAmountConfig> {
  return request<DesktopWalletAmountConfig>('/v1/wallet/config')
}

export function fetchDesktopWalletTransactions(params: { type?: string; from?: string; to?: string } = {}): Promise<DesktopWalletTransaction[]> {
  const query = new URLSearchParams()
  if (params.type) query.set('type', params.type)
  if (params.from) query.set('from', params.from)
  if (params.to) query.set('to', params.to)
  const suffix = query.toString() ? `?${query.toString()}` : ''
  return request<DesktopWalletTransaction[]>(`/v1/wallet/transactions${suffix}`)
}

export function fetchDesktopWalletTransaction(id: string | number): Promise<DesktopWalletTransaction> {
  return request<DesktopWalletTransaction>(`/v1/wallet/transactions/${encodeURIComponent(String(id))}`)
}

export function setDesktopPaymentPassword(password: string, oldPassword?: string): Promise<unknown> {
  return request<unknown>('/v1/wallet/payment-password', {
    method: 'PUT',
    body: JSON.stringify({ password, oldPassword }),
  })
}

export function markDesktopConversationRead(conversationId: string): Promise<unknown> {
  return request<unknown>(`/v1/conversations/${encodeURIComponent(conversationId)}/read`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function markDesktopConversationUnread(conversationId: string): Promise<unknown> {
  return request<unknown>(`/v1/conversations/${encodeURIComponent(conversationId)}/unread`, {
    method: 'POST',
  })
}

export function updateDesktopConversationSettings(
  conversationId: string,
  settings: { pinned?: boolean; mute?: boolean; hidden?: boolean; groupNickname?: string; groupRemark?: string },
): Promise<unknown> {
  return request<unknown>(`/v1/conversations/${encodeURIComponent(conversationId)}/settings`, {
    method: 'PUT',
    body: JSON.stringify(settings),
  })
}

export function removeDesktopConversation(conversationId: string): Promise<unknown> {
  return request<unknown>(`/v1/conversations/${encodeURIComponent(conversationId)}/remove`, {
    method: 'POST',
  })
}

/** Clear a private chat history from one side or both sides. */
export function deleteDesktopPrivateConversation(
  conversationId: string,
  scope: 'self' | 'both',
): Promise<unknown> {
  return request<unknown>(`/v1/conversations/${encodeURIComponent(conversationId)}/delete`, {
    method: 'POST',
    body: JSON.stringify({ scope }),
  })
}

/** Clear a group history. Only the group owner may use the `both` scope. */
export function clearDesktopGroupHistory(
  conversationId: string,
  scope: 'self' | 'both',
): Promise<unknown> {
  return request<unknown>(`/v1/conversations/${encodeURIComponent(conversationId)}/group/clear-history`, {
    method: 'POST',
    body: JSON.stringify({ scope }),
  })
}

/** Mark every conversation as read. */
export function markAllDesktopConversationsRead(): Promise<unknown> {
  return request<unknown>('/v1/conversations/read-all', {
    method: 'POST',
  })
}

export function deleteDesktopFriend(userId: string): Promise<unknown> {
  return request<unknown>(`/v1/contacts/${encodeURIComponent(userId)}/delete`, {
    method: 'POST',
  })
}

export function blockDesktopUser(userId: string): Promise<unknown> {
  return request<unknown>(`/v1/contacts/${encodeURIComponent(userId)}/block`, {
    method: 'POST',
  })
}

export function unblockDesktopUser(userId: string): Promise<unknown> {
  return request<unknown>(`/v1/contacts/${encodeURIComponent(userId)}/unblock`, {
    method: 'POST',
  })
}

export function fetchDesktopConversationReadStates(conversationId: string): Promise<DesktopReadState> {
  return request<DesktopReadState>(`/v1/conversations/${encodeURIComponent(conversationId)}/read-states`)
}

export function fetchDesktopPrivacy(): Promise<{ readReceiptEnabled?: boolean }> {
  return request<{ readReceiptEnabled?: boolean }>('/v1/user/privacy')
}

const defaultDesktopPrivacySettings: DesktopPrivacySettings = {
  friendVerifyRequired: true,
  groupInviteVerify: false,
  addByPhone: true,
  addByPulseId: true,
  addByGroup: true,
  addByQrcode: true,
  addByCard: true,
  addByDeletedChat: true,
  searchByPhone: true,
  searchByPulseId: true,
  momentsVisibleRange: 'all',
  momentsStrangerTen: false,
  hideOnlineStatus: false,
  readReceiptEnabled: true,
}

function normalizeDesktopMomentsRange(value?: string | null): DesktopMomentsVisibleRange {
  const range = String(value || '').trim().toLowerCase()
  if (range === 'half_year' || range === 'halfyear' || range === '6m') return 'half_year'
  if (range === 'month' || range === '1m') return 'month'
  if (range === 'three_days' || range === 'threedays' || range === '3d') return 'three_days'
  return 'all'
}

function mapDesktopPrivacySettings(value?: Partial<DesktopPrivacySettings> | null): DesktopPrivacySettings {
  const source = value || {}
  return {
    friendVerifyRequired: source.friendVerifyRequired ?? defaultDesktopPrivacySettings.friendVerifyRequired,
    groupInviteVerify: source.groupInviteVerify ?? defaultDesktopPrivacySettings.groupInviteVerify,
    addByPhone: source.addByPhone ?? defaultDesktopPrivacySettings.addByPhone,
    addByPulseId: source.addByPulseId ?? defaultDesktopPrivacySettings.addByPulseId,
    addByGroup: source.addByGroup ?? defaultDesktopPrivacySettings.addByGroup,
    addByQrcode: source.addByQrcode ?? defaultDesktopPrivacySettings.addByQrcode,
    addByCard: source.addByCard ?? defaultDesktopPrivacySettings.addByCard,
    addByDeletedChat: source.addByDeletedChat ?? defaultDesktopPrivacySettings.addByDeletedChat,
    searchByPhone: source.searchByPhone ?? defaultDesktopPrivacySettings.searchByPhone,
    searchByPulseId: source.searchByPulseId ?? defaultDesktopPrivacySettings.searchByPulseId,
    momentsVisibleRange: normalizeDesktopMomentsRange(source.momentsVisibleRange),
    momentsStrangerTen: source.momentsStrangerTen ?? defaultDesktopPrivacySettings.momentsStrangerTen,
    hideOnlineStatus: source.hideOnlineStatus ?? defaultDesktopPrivacySettings.hideOnlineStatus,
    readReceiptEnabled: source.readReceiptEnabled ?? defaultDesktopPrivacySettings.readReceiptEnabled,
  }
}

export function fetchDesktopPrivacySettings(): Promise<DesktopPrivacySettings> {
  return request<Partial<DesktopPrivacySettings>>('/v1/user/privacy').then(mapDesktopPrivacySettings)
}

export function updateDesktopPrivacySettings(
  patch: Partial<DesktopPrivacySettings>,
): Promise<DesktopPrivacySettings> {
  return request<Partial<DesktopPrivacySettings>>('/v1/user/privacy', {
    method: 'PUT',
    body: JSON.stringify(patch),
  }).then(mapDesktopPrivacySettings)
}

interface DesktopMomentCommentPayload {
  id?: number | string
  userId?: number | string
  nickname?: string
  avatarUrl?: string
  content?: string
  replyToUserId?: number | string | null
  replyToNickname?: string | null
  createdAt?: string
  likeCount?: number
  likedByMe?: boolean
}

interface DesktopMomentPayload {
  id?: number | string
  userId?: number | string
  mine?: boolean
  nickname?: string
  avatarUrl?: string
  content?: string
  images?: string[]
  originalImages?: string[]
  mediaTypes?: string[]
  mediaFileIds?: Array<number | string>
  visibility?: number
  mentionUserIds?: Array<number | string>
  mentionNicknames?: string[]
  mentionedMe?: boolean
  visibleUserIds?: Array<number | string>
  visibleNicknames?: string[]
  locationName?: string
  locationAddress?: string
  latitude?: number
  longitude?: number
  createdAt?: string
  likeCount?: number
  commentCount?: number
  likedByMe?: boolean
  favoritedByMe?: boolean
  likeNicknames?: string[]
  likeUserIds?: Array<number | string>
  comments?: DesktopMomentCommentPayload[]
}

function mapDesktopMomentComment(value: DesktopMomentCommentPayload): DesktopMomentComment {
  return {
    id: String(value.id ?? ''),
    userId: String(value.userId ?? ''),
    nickname: value.nickname || '用户',
    avatarUrl: resolveDesktopAvatarUrl(value.avatarUrl || ''),
    content: value.content || '',
    replyToUserId: value.replyToUserId != null ? String(value.replyToUserId) : undefined,
    replyToNickname: value.replyToNickname || undefined,
    createdAt: value.createdAt,
    likeCount: Number(value.likeCount || 0),
    likedByMe: Boolean(value.likedByMe),
  }
}

function mapDesktopMoment(value: DesktopMomentPayload): DesktopMoment {
  const images = Array.isArray(value.images) ? value.images : []
  const mediaFileIds = (value.mediaFileIds || []).map(String)
  const mediaCount = Math.max(images.length, mediaFileIds.length)
  const mappedImages = Array.from({ length: mediaCount }, (_, index) => resolveDesktopFileUrl(mediaFileIds[index] ? `/v1/files/${encodeURIComponent(mediaFileIds[index])}/download?variant=thumb` : images[index] || ''))
  const mappedOriginalImages = Array.from({ length: mediaCount }, (_, index) => resolveDesktopFileUrl(mediaFileIds[index] ? `/v1/files/${encodeURIComponent(mediaFileIds[index])}/download` : (value.originalImages || images)[index] || mappedImages[index] || ''))
  return {
    id: String(value.id ?? ''),
    userId: String(value.userId ?? ''),
    mine: value.mine === true,
    nickname: value.nickname || '用户',
    avatarUrl: resolveDesktopAvatarUrl(value.avatarUrl || ''),
    content: value.content || '',
    images: mappedImages,
    originalImages: mappedOriginalImages,
    mediaTypes: (value.mediaTypes || mappedImages.map((url) => /\.(mp4|webm|mov|m4v|mkv|3gp)(\?|$)/i.test(url) ? 'video' : 'image'))
      .map((type) => type === 'video' ? 'video' : 'image'),
    mediaFileIds,
    visibility: Number(value.visibility ?? 0),
    mentionUserIds: (value.mentionUserIds || []).map(String),
    mentionNicknames: value.mentionNicknames || [],
    mentionedMe: Boolean(value.mentionedMe),
    visibleUserIds: (value.visibleUserIds || []).map(String),
    visibleNicknames: value.visibleNicknames || [],
    locationName: value.locationName || undefined,
    locationAddress: value.locationAddress || undefined,
    latitude: value.latitude != null ? Number(value.latitude) : undefined,
    longitude: value.longitude != null ? Number(value.longitude) : undefined,
    createdAt: value.createdAt,
    likeCount: Number(value.likeCount || 0),
    commentCount: Number(value.commentCount || 0),
    likedByMe: Boolean(value.likedByMe),
    favoritedByMe: Boolean(value.favoritedByMe),
    likeNicknames: value.likeNicknames || [],
    likeUserIds: (value.likeUserIds || []).map(String),
    comments: (value.comments || []).map(mapDesktopMomentComment),
  }
}

export function fetchDesktopMoments(): Promise<DesktopMoment[]> {
  return request<DesktopMomentPayload[]>('/v1/moments').then((items) => (items || []).map(mapDesktopMoment).filter((item) => item.id))
}

export function fetchDesktopMoment(id: string): Promise<DesktopMoment> {
  return request<DesktopMomentPayload>(`/v1/moments/${encodeURIComponent(id)}`).then(mapDesktopMoment)
}

export function fetchDesktopMomentInteractions(limit = 50): Promise<DesktopMomentInteraction[]> {
  return request<DesktopMomentInteraction[]>(`/v1/moments/interactions?limit=${Math.max(1, Math.min(100, Number(limit) || 50))}`).then((items) => (items || []).map((item) => ({
    ...item,
    id: String(item.id),
    actorUserId: String(item.actorUserId),
    postId: String(item.postId),
    commentId: item.commentId == null ? undefined : String(item.commentId),
    actorAvatarUrl: resolveDesktopAvatarUrl(item.actorAvatarUrl || ''),
    summary: item.summary || '',
    postPreview: item.postPreview || '',
    isRead: Boolean(item.isRead),
  })))
}

export function fetchDesktopMomentInteractionUnreadCount(): Promise<number> {
  return request<{ count?: number }>('/v1/moments/interactions/unread-count').then((result) => Number(result.count || 0))
}

export function markDesktopMomentInteractionsRead(id?: string): Promise<void> {
  return request<void>('/v1/moments/interactions/read', {
    method: 'POST',
    body: JSON.stringify(id ? { id: Number(id) } : {}),
  })
}

export function publishDesktopMoment(payload: {
  content: string
  images?: string[]
  originalImages?: string[]
  mediaTypes?: Array<'image' | 'video'>
  mediaFileIds?: string[]
  visibility?: number
  mentionUserIds?: string[]
  visibleUserIds?: string[]
  locationName?: string
  locationAddress?: string
  latitude?: number
  longitude?: number
}): Promise<DesktopMoment> {
  return request<DesktopMomentPayload>('/v1/moments', {
    method: 'POST',
    body: JSON.stringify({
      content: payload.content || '',
      images: payload.images || [],
      originalImages: payload.originalImages || payload.images || [],
      mediaTypes: payload.mediaTypes || [],
      mediaFileIds: (payload.mediaFileIds || []).map(String),
      visibility: payload.visibility ?? 0,
      mentionUserIds: (payload.mentionUserIds || []).map(Number),
      visibleUserIds: (payload.visibleUserIds || []).map(Number),
      locationName: payload.locationName || undefined,
      locationAddress: payload.locationAddress || undefined,
      latitude: payload.latitude,
      longitude: payload.longitude,
    }),
  }).then(mapDesktopMoment)
}

export function toggleDesktopMomentLike(id: string): Promise<DesktopMoment> {
  return request<DesktopMomentPayload>(`/v1/moments/${encodeURIComponent(id)}/like`, { method: 'POST' }).then(mapDesktopMoment)
}

export function toggleDesktopMomentFavorite(id: string): Promise<DesktopMoment> {
  return request<DesktopMomentPayload>(`/v1/moments/${encodeURIComponent(id)}/favorite`, { method: 'POST' }).then(mapDesktopMoment)
}

export function addDesktopMomentComment(
  id: string,
  content: string,
  replyToCommentId?: string | number,
): Promise<DesktopMomentComment> {
  return request<DesktopMomentCommentPayload>(`/v1/moments/${encodeURIComponent(id)}/comments`, {
    method: 'POST',
    body: JSON.stringify(
      replyToCommentId != null ? { content, replyToCommentId: String(replyToCommentId) } : { content },
    ),
  }).then(mapDesktopMomentComment)
}

export function deleteDesktopMoment(id: string): Promise<void> {
  return request<void>(`/v1/moments/${encodeURIComponent(id)}/delete`, { method: 'POST' })
}

export function markDesktopMomentsSeen(): Promise<void> {
  return request<void>('/v1/moments/seen', { method: 'POST' })
}

export function fetchDesktopMomentsHideUsers(): Promise<DesktopContact[]> {
  return request<{ list: DesktopContact[] }>('/v1/contacts/moments-hide').then((result) => result.list || [])
}

export function fetchDesktopMomentsRejectUsers(): Promise<DesktopContact[]> {
  return request<{ list: DesktopContact[] }>('/v1/contacts/moments-reject').then((result) => result.list || [])
}

export function updateDesktopFriendMomentsPermission(
  userId: string,
  payload: { hideHisMoments?: boolean; rejectHisMoments?: boolean },
): Promise<void> {
  return request<void>(`/v1/contacts/${encodeURIComponent(userId)}/moments-permission`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function sendDesktopTextMessage(payload: {
  conversationId: string
  toUserId?: string
  content: string
  clientMsgId: string
  msgType?: number
  replyToMsgId?: string
  mentionUserIds?: string[]
  atAll?: boolean
  fileId?: string
}): Promise<DesktopMessage> {
  const body: Record<string, unknown> = {
    content: payload.content,
    clientMsgId: payload.clientMsgId,
    msgType: payload.msgType ?? 0,
    replyToMsgId: payload.replyToMsgId,
    mentionUserIds: (payload.mentionUserIds || []).map((id) => Number(id)),
    atAll: !!payload.atAll,
    fileId: payload.fileId?.trim() || undefined,
  }
  if (payload.toUserId?.trim()) body.toUserId = Number(payload.toUserId)
  return request<DesktopMessage>(`/v1/conversations/${encodeURIComponent(payload.conversationId)}/messages`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function fetchDesktopFileMetadata(fileId: string): Promise<DesktopUploadedFile> {
  return request<DesktopUploadedFile>(`/v1/files/${encodeURIComponent(fileId.trim())}/metadata`)
}

export async function uploadDesktopFile(file: File, options: {
  durationMs?: number
  videoCodecHint?: string
} = {}): Promise<DesktopUploadedFile> {
  const form = new FormData()
  form.append('file', file)
  form.append('fileName', file.name)
  if (Number.isFinite(options.durationMs)) form.append('durationMs', String(Math.max(0, Math.round(Number(options.durationMs)))))
  if (options.videoCodecHint?.trim()) form.append('videoCodecHint', options.videoCodecHint.trim())
  const uploaded = await request<DesktopUploadedFile>('/v1/files/upload', {
    method: 'POST',
    body: form,
  })
  return {
    ...uploaded,
    fileId: uploaded.fileId ? String(uploaded.fileId) : undefined,
    name: uploaded.name || file.name,
    size: Number(uploaded.size || file.size || 0),
    contentType: uploaded.contentType || file.type || 'application/octet-stream',
  }
}

export function forwardDesktopFavorite(favoriteId: string, targetConversationId: string): Promise<{ count?: number }> {
  return request<{ count?: number }>(`/v1/favorites/${encodeURIComponent(favoriteId)}/forward`, {
    method: 'POST',
    body: JSON.stringify({ targetConversationIds: [targetConversationId] }),
  })
}

export function sendDesktopRedPacket(payload: {
  conversationId: string
  packetType: string
  targetUserId?: string
  totalAmount: number
  count: number
  greeting?: string
  paymentPassword: string
}): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>('/v1/wallet/red-packets', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function fetchDesktopRedPacket(packetNo: string): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(`/v1/wallet/red-packets/${encodeURIComponent(packetNo)}`)
}

export function receiveDesktopRedPacket(packetNo: string): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(`/v1/wallet/red-packets/${encodeURIComponent(packetNo)}/receive`, {
    method: 'POST',
  })
}

export function fetchDesktopTransfer(transferNo: string): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(`/v1/wallet/transfers/${encodeURIComponent(transferNo)}`)
}

export function receiveDesktopTransfer(transferNo: string): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(`/v1/wallet/transfers/${encodeURIComponent(transferNo)}/receive`, {
    method: 'POST',
  })
}

export function sendDesktopTransfer(payload: {
  conversationId: string
  receiverId: string
  amount: number
  remark?: string
  paymentPassword: string
}): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>('/v1/wallet/transfers', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export interface DesktopLiveLocationState {
  conversationId: string
  active: boolean
  sessionId?: string
  initiatorId?: string
  initiator?: boolean
}

export function updateDesktopLiveLocation(conversationId: string, payload: {
  latitude: number
  longitude: number
  accuracy?: number
  heading?: number
  start?: boolean
}): Promise<DesktopLiveLocationState> {
  return request<DesktopLiveLocationState>(`/v1/conversations/${encodeURIComponent(conversationId)}/live-location`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function leaveDesktopLiveLocation(conversationId: string): Promise<unknown> {
  return request<unknown>(`/v1/conversations/${encodeURIComponent(conversationId)}/live-location`, { method: 'DELETE' })
}

export function endDesktopLiveLocation(conversationId: string): Promise<unknown> {
  return request<unknown>(`/v1/conversations/${encodeURIComponent(conversationId)}/live-location/session`, { method: 'DELETE' })
}

export function updateDesktopProfile(payload: {
  nickname?: string
  signature?: string
  avatarUrl?: string
}): Promise<DesktopProfile> {
  return request<DesktopProfile>('/v1/user/profile', {
    method: 'PUT',
    body: JSON.stringify(payload),
  }).then((profile) => ({
    ...profile,
    avatarUrl: resolveDesktopAvatarUrl(profile.avatarUrl || ''),
  }))
}

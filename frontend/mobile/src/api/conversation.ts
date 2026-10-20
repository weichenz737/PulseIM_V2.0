import http, { getToken, type ApiResult } from './http'
import { resolveAvatarUrl } from './file'
import { formatCallPreview } from '@/utils/callPreview'
import { formatBusinessPreview } from '@/utils/businessPreview'
import { isMobileNotificationDismissed } from '@/utils/notificationDismissals'

export type ConversationType = 'personal' | 'group'

export function formatGroupPulseId(id: string | number): string {
  const raw = String(id ?? '')
  let hash = 2166136261
  for (const char of raw) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return String(1_000_000_000 + (hash >>> 0) % 9_000_000_000)
}

export interface ConversationItem {
  id: string
  name: string
  avatar: string
  /** 无头像时使用的对方真实昵称，不受好友备注影响 */
  avatarName?: string
  preview: string
  lastMsgType?: number
  time: string
  lastMsgTimeMs?: number
  unread: number
  online: boolean
  onlineHidden?: boolean
  type: ConversationType
  peerUserId?: string
  pinned?: boolean
  mute?: boolean
  /** 有人 @ 我且未读 */
  mentionUnread?: boolean
  /** 单聊好友标签 */
  tag?: string
  /** 系统文件传输助手会话，不支持通话 */
  fileTransferAssistant?: boolean
}

interface BackendConversationVO {
  id: number
  type: number
  title: string
  avatarUrl?: string
  peerNickname?: string
  lastMsgPreview?: string
  lastMsgType?: number
  lastMsgTime?: string
  unreadCount?: number
  peerUserId?: number
  online?: boolean
  onlineHidden?: boolean
  pinned?: boolean
  mute?: boolean
  mentionUnread?: boolean
  tag?: string
  fileTransferAssistant?: boolean
}

function formatTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const hm = d.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((startOfToday.getTime() - startOfMsg.getTime()) / 86400000)
  if (diffDays === 0) return hm
  if (diffDays === 1) return `昨天 ${hm}`
  if (d.getFullYear() !== now.getFullYear()) {
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${hm}`
  }
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`
}

function mapItem(vo: BackendConversationVO): ConversationItem {
  const rawPreview = vo.lastMsgPreview || ''
  return {
    id: String(vo.id),
    name: vo.title || '会话',
    avatar: resolveAvatarUrl(vo.avatarUrl || ''),
    avatarName: vo.peerNickname ? String(vo.peerNickname) : undefined,
    preview: Number(vo.lastMsgType) === 0 && vo.lastMsgType != null
      ? rawPreview
      : formatCallPreview(rawPreview) || formatBusinessPreview(rawPreview),
    lastMsgType: vo.lastMsgType,
    time: formatTime(vo.lastMsgTime),
    lastMsgTimeMs: vo.lastMsgTime ? Date.parse(vo.lastMsgTime) || 0 : 0,
    unread: vo.unreadCount || 0,
    online: !!vo.online,
    onlineHidden: !!vo.onlineHidden,
    // 兼容接口返回数字或字符串，避免群聊被误判为单聊。
    type: Number(vo.type) === 2 ? 'group' : 'personal',
    peerUserId: vo.peerUserId != null ? String(vo.peerUserId) : undefined,
    pinned: !!vo.pinned,
    mute: !!vo.mute,
    mentionUnread: !!vo.mentionUnread,
    tag: vo.tag ? String(vo.tag).trim() : undefined,
    fileTransferAssistant: !!vo.fileTransferAssistant,
  }
}

/**
 * A damaged/legacy member table can expose more than one private conversation
 * for the same peer.  The conversation id is not a safe UI identity in that
 * case; keep the first server-sorted row (the canonical/latest row), merge
 * unread flags, and retain useful fields from the duplicate.
 */
export function dedupeConversationItems(list: ConversationItem[]): ConversationItem[] {
  const byIdentity = new Map<string, ConversationItem>()
  for (const item of list) {
    const identity = item.type === 'personal' && item.peerUserId
      ? `personal:${item.peerUserId}`
      : `conversation:${item.id}`
    const existing = byIdentity.get(identity)
    if (!existing) {
      byIdentity.set(identity, item)
      continue
    }
    byIdentity.set(identity, {
      ...existing,
      avatar: existing.avatar || item.avatar,
      avatarName: existing.avatarName || item.avatarName,
      name: existing.name || item.name,
      preview: existing.preview || item.preview,
      time: existing.time || item.time,
      unread: Math.max(existing.unread || 0, item.unread || 0),
      online: existing.online || item.online,
      onlineHidden: existing.onlineHidden && item.onlineHidden,
      pinned: !!existing.pinned || !!item.pinned,
      mute: !!existing.mute || !!item.mute,
      mentionUnread: !!existing.mentionUnread || !!item.mentionUnread,
      tag: existing.tag || item.tag,
      fileTransferAssistant: !!existing.fileTransferAssistant || !!item.fileTransferAssistant,
    })
  }
  return [...byIdentity.values()]
}

export async function fetchConversations(filter = 'all'): Promise<ConversationItem[]> {
  const { data } = await http.get<ApiResult<BackendConversationVO[]>>('/v1/conversations', {
    params: { filter },
  })
  return dedupeConversationItems((data.data || []).map(mapItem))
}

/** 我加入的群聊列表 */
export async function fetchMyGroups(): Promise<ConversationItem[]> {
  return fetchConversations('group')
}

/** 打开/创建私聊，返回会话（会同步出现在消息首页） */
export async function openPrivateConversation(peerUserId: string): Promise<ConversationItem> {
  const { data } = await http.post<ApiResult<BackendConversationVO>>('/v1/conversations/private', {
    peerUserId: Number(peerUserId),
  })
  return mapItem(data.data)
}

/** 标记会话已读，清零未读角标并上报已读水位 */
export async function markConversationRead(
  conversationId: string,
  lastReadMsgId?: string,
): Promise<{
  lastReadMsgId?: string
  lastReadSendTime?: number
  requestedReadMsgFound?: boolean
  burnStarted?: Array<{ msgId: string; burnReadAt: string; burnExpiresAt: string }>
}> {
  if (!conversationId || conversationId.startsWith('tmp_')) return {}
  const body =
    lastReadMsgId && !lastReadMsgId.startsWith('tmp_') && !lastReadMsgId.startsWith('local_')
      ? { lastReadMsgId }
      : {}
  const { data } = await http.post<ApiResult<{
    lastReadMsgId?: string
    lastReadSendTime?: number
    requestedReadMsgFound?: boolean
    burnStarted?: Array<{ msgId: string; burnReadAt: string; burnExpiresAt: string }>
  }>>(
    `/v1/conversations/${conversationId}/read`,
    body,
  )
  return data.data || {}
}

export interface MemberReadState {
  userId: string
  lastReadMsgId?: string
  lastReadSendTime?: number
  lastReadAt?: string
}

export interface ConversationReadStates {
  conversationId: string
  conversationType?: number
  readReceiptEnabled?: boolean
  myLastReadMsgId?: string
  myLastReadSendTime?: number
  peerLastReadMsgId?: string
  peerLastReadSendTime?: number
  members: MemberReadState[]
}

/** 拉取会话已读水位（单聊对方 / 群成员） */
export async function fetchConversationReadStates(
  conversationId: string,
): Promise<ConversationReadStates> {
  const { data } = await http.get<
    ApiResult<{
      conversationId: number | string
      conversationType?: number
      readReceiptEnabled?: boolean
      myLastReadMsgId?: string
      myLastReadSendTime?: number
      peerLastReadMsgId?: string
      peerLastReadSendTime?: number
      members?: Array<{
        userId: number | string
        lastReadMsgId?: string
        lastReadSendTime?: number
        lastReadAt?: string
      }>
    }>
  >(`/v1/conversations/${conversationId}/read-states`)
  const vo = data.data
  return {
    conversationId: String(vo.conversationId),
    conversationType: vo.conversationType,
    readReceiptEnabled: vo.readReceiptEnabled !== false,
    myLastReadMsgId: vo.myLastReadMsgId || undefined,
    myLastReadSendTime: vo.myLastReadSendTime || undefined,
    peerLastReadMsgId: vo.peerLastReadMsgId || undefined,
    peerLastReadSendTime: vo.peerLastReadSendTime || undefined,
    members: (vo.members || []).map((m) => ({
      userId: String(m.userId),
      lastReadMsgId: m.lastReadMsgId || undefined,
      lastReadSendTime: m.lastReadSendTime || undefined,
      lastReadAt: m.lastReadAt,
    })),
  }
}

/** 发起群聊 */
export async function createGroupConversation(
  title: string,
  memberIds: string[],
): Promise<ConversationItem> {
  const { data } = await http.post<ApiResult<BackendConversationVO>>('/v1/conversations/group', {
    title,
    memberIds: memberIds.map((id) => Number(id)),
  })
  return mapItem(data.data)
}

export type GroupRole = 'owner' | 'admin' | 'member'

export interface GroupMember {
  userId: string
  nickname: string
  groupNickname?: string
  /** 好友备注 / 后台默认好友新昵称 */
  remark?: string
  /** 好友标签 / 后台默认好友标签 */
  tag?: string
  avatarUrl: string
  role: GroupRole
  owner?: boolean
  admin?: boolean
  speakMuted?: boolean
}

export interface GroupDetail {
  id: string
  title: string
  pulseId: string
  avatarUrl: string
  notice: string
  welcomeMessage: string
  welcomeSetterId?: string
  welcomeSetterNickname?: string
  welcomeSetterAvatarUrl?: string
  ownerId?: string
  owner: boolean
  admin: boolean
  myRole: GroupRole
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
  members: GroupMember[]
}

interface BackendGroupDetail {
  id: number
  title: string
  pulseId?: string
  avatarUrl?: string
  notice?: string
  groupWelcomeMessage?: string
  groupWelcomeSetterId?: number
  groupWelcomeSetterNickname?: string
  groupWelcomeSetterAvatarUrl?: string
  ownerId?: number
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
    nickname: string
    groupNickname?: string
    remark?: string
    tag?: string
    avatarUrl?: string
    role?: string
    owner?: boolean
    admin?: boolean
    speakMuted?: boolean
  }>
}

function normalizeRole(role?: string, isOwner = false, isAdmin = false): GroupRole {
  if (isOwner || role === 'owner') return 'owner'
  if (isAdmin || role === 'admin') return 'admin'
  return 'member'
}

export function roleLabel(role?: GroupRole | string): string {
  if (role === 'owner') return '群主'
  if (role === 'admin') return '管理员'
  return '群成员'
}

type CachedGroupDetail = {
  detail: GroupDetail
}

const groupDetailCache = new Map<string, CachedGroupDetail>()

function currentGroupDetailUserId(): string {
  try {
    const raw = localStorage.getItem('pulse_user_profile') || sessionStorage.getItem('pulse_user_profile')
    if (raw) {
      const userId = String(JSON.parse(raw)?.userId || '').trim()
      if (userId) return userId
    }
  } catch {
    /* ignore */
  }
  try {
    const token = getToken() || ''
    const payload = token.split('.')[1]
    if (payload) {
      const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
      return String(json.uid ?? json.sub ?? '').trim()
    }
  } catch {
    /* ignore */
  }
  return ''
}

function groupDetailCacheKey(conversationId: string): string {
  return `${currentGroupDetailUserId() || 'anonymous'}:${String(conversationId || '')}`
}

/** 群聊天先展示上次成功加载的成员身份，网络请求仍会在后台刷新。 */
export function getCachedGroupDetail(conversationId: string): GroupDetail | null {
  return groupDetailCache.get(groupDetailCacheKey(conversationId))?.detail || null
}

export function invalidateCachedGroupDetail(conversationId: string): void {
  groupDetailCache.delete(groupDetailCacheKey(conversationId))
}

export async function fetchGroupDetail(conversationId: string): Promise<GroupDetail> {
  const { data } = await http.get<ApiResult<BackendGroupDetail>>(`/v1/conversations/${conversationId}/group`)
  const g = data.data
  const localUid = currentGroupDetailUserId()
  const ownerId = g.ownerId != null ? String(g.ownerId) : undefined
  const isOwner = !!g.owner || (!!ownerId && !!localUid && ownerId === localUid)
  const myRole = normalizeRole(g.myRole, isOwner, !!g.admin)
  const isAdmin = isOwner || myRole === 'admin' || !!g.admin
  const detail: GroupDetail = {
    id: String(g.id),
    title: g.title || '群聊',
    pulseId: g.pulseId || formatGroupPulseId(g.id),
    avatarUrl: resolveAvatarUrl(g.avatarUrl || ''),
    notice: g.notice || '',
    welcomeMessage: g.groupWelcomeMessage || '',
    welcomeSetterId: g.groupWelcomeSetterId != null ? String(g.groupWelcomeSetterId) : undefined,
    welcomeSetterNickname: g.groupWelcomeSetterNickname || '',
    welcomeSetterAvatarUrl: resolveAvatarUrl(g.groupWelcomeSetterAvatarUrl || ''),
    ownerId,
    owner: isOwner,
    admin: isAdmin,
    myRole,
    myGroupNickname: g.myGroupNickname || '',
    groupRemark: g.groupRemark || '',
    hidden: !!g.hidden,
    pinned: !!g.pinned,
    mute: !!g.mute,
    muteAll: !!g.muteAll,
    joinVerifyRequired: !!g.joinVerifyRequired,
    allowMemberAddFriend: g.memberFriendAllowed !== false,
    searchMode: g.searchMode === 1 || g.searchMode === 2 ? g.searchMode : 3,
    memberInviteAllowed: g.memberInviteAllowed !== false,
    pendingJoinCount: g.pendingJoinCount || 0,
    speakMuted: !!g.speakMuted,
    memberCount: g.memberCount || g.members?.length || 0,
    members: (g.members || []).map((m) => {
      const role = normalizeRole(
        m.role,
        !!m.owner || (!!ownerId && String(m.userId) === ownerId),
        !!m.admin,
      )
      const systemNick = m.nickname || ''
      const groupNick = (m.groupNickname || '').trim()
      const remark = (m.remark || '').trim()
      // 展示名：好友备注（含后台新昵称）> 群昵称 > 系统昵称
      const displayName = remark || groupNick || systemNick || '用户'
      return {
        userId: String(m.userId),
        nickname: displayName,
        groupNickname: groupNick || undefined,
        remark: remark || undefined,
        tag: m.tag ? String(m.tag).trim() : undefined,
        avatarUrl: resolveAvatarUrl(m.avatarUrl || ''),
        role,
        owner: role === 'owner',
        admin: role === 'owner' || role === 'admin',
        speakMuted: !!m.speakMuted,
      }
    }),
  }
  groupDetailCache.set(groupDetailCacheKey(conversationId), {
    detail,
  })
  return detail
}

export interface GroupPreview {
  id: string
  pulseId: string
  title: string
  avatarUrl: string
  notice: string
  memberCount: number
  joined: boolean
  joinVerifyRequired: boolean
  joinPending: boolean
  ownerNickname?: string
}

export async function fetchGroupPreview(conversationId: string): Promise<GroupPreview> {
  const { data } = await http.get<
    ApiResult<{
      id: number
      pulseId?: string
      title?: string
      avatarUrl?: string
      notice?: string
      memberCount?: number
      joined?: boolean
      joinVerifyRequired?: boolean
      joinPending?: boolean
      ownerNickname?: string
    }>
  >(`/v1/conversations/${conversationId}/group/preview`)
  const g = data.data
  return {
    id: String(g.id),
    pulseId: g.pulseId || formatGroupPulseId(g.id),
    title: g.title || '群聊',
    avatarUrl: resolveAvatarUrl(g.avatarUrl || ''),
    notice: g.notice || '',
    memberCount: g.memberCount || 0,
    joined: !!g.joined,
    joinVerifyRequired: !!g.joinVerifyRequired,
    joinPending: !!g.joinPending,
    ownerNickname: g.ownerNickname || '',
  }
}

export interface GroupJoinResult {
  joined: boolean
  pending: boolean
  requestId?: string
  message?: string
  conversation?: ConversationItem
}

export async function joinGroup(
  conversationId: string,
  source?: string,
  message?: string,
): Promise<GroupJoinResult> {
  const { data } = await http.post<
    ApiResult<{
      joined?: boolean
      pending?: boolean
      requestId?: number
      message?: string
      conversation?: BackendConversationVO
    }>
  >(`/v1/conversations/${conversationId}/group/join`, {
    source: source || undefined,
    message: message || undefined,
  })
  const r = data.data
  return {
    joined: !!r.joined,
    pending: !!r.pending,
    requestId: r.requestId != null ? String(r.requestId) : undefined,
    message: r.message || '',
    conversation: r.conversation ? mapItem(r.conversation) : undefined,
  }
}

export async function setJoinVerifyRequired(
  conversationId: string,
  joinVerifyRequired: boolean,
): Promise<void> {
  await http.post(`/v1/conversations/${conversationId}/group/join-verify`, { joinVerifyRequired })
}

export async function setAllowMemberAddFriend(
  conversationId: string,
  allowMemberAddFriend: boolean,
): Promise<void> {
  await http.post(`/v1/conversations/${conversationId}/group/member-friend-allowed`, {
    memberFriendAllowed: allowMemberAddFriend,
  })
}

export async function searchPublicGroups(keyword: string): Promise<GroupPreview[]> {
  const { data } = await http.get<ApiResult<Array<{
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
  }>>>(`/v1/conversations/group/search`, { params: { q: keyword } })
  return (data.data || []).map((g) => ({
    id: String(g.id),
    pulseId: g.pulseId || formatGroupPulseId(g.id),
    title: g.title || '群聊',
    avatarUrl: resolveAvatarUrl(g.avatarUrl || ''),
    notice: g.notice || '',
    memberCount: g.memberCount || 0,
    joined: !!g.joined,
    joinVerifyRequired: !!g.joinVerifyRequired,
    joinPending: !!g.joinPending,
    ownerNickname: g.ownerNickname || '',
  }))
}

export async function setGroupSearchMode(conversationId: string, searchMode: 1 | 2 | 3): Promise<void> {
  await http.post(`/v1/conversations/${conversationId}/group/search-mode`, { searchMode })
}

export async function setMemberInviteAllowed(conversationId: string, memberInviteAllowed: boolean): Promise<void> {
  await http.post(`/v1/conversations/${conversationId}/group/member-invite-allowed`, { memberInviteAllowed })
}

export interface ImportantNotificationSetting {
  atAll: boolean
  mentionMe: boolean
  replyMe: boolean
  announcement: boolean
  followedMemberIds: string[]
}

export async function fetchImportantNotificationSetting(
  conversationId: string,
): Promise<ImportantNotificationSetting> {
  const { data } = await http.get<ApiResult<{
    atAll?: boolean
    mentionMe?: boolean
    replyMe?: boolean
    announcement?: boolean
    followedMemberIds?: Array<number | string>
  }>>(`/v1/conversations/${conversationId}/group/important-notifications`)
  const value = data.data || {}
  return {
    atAll: value.atAll !== false,
    mentionMe: value.mentionMe !== false,
    replyMe: value.replyMe !== false,
    announcement: value.announcement !== false,
    followedMemberIds: (value.followedMemberIds || []).map(String),
  }
}

export async function updateImportantNotificationSetting(
  conversationId: string,
  setting: ImportantNotificationSetting,
): Promise<void> {
  await http.put(`/v1/conversations/${conversationId}/group/important-notifications`, {
    ...setting,
    followedMemberIds: setting.followedMemberIds.map(Number),
  })
}

export interface GroupJoinRequestItem {
  id: string
  conversationId: string
  groupTitle?: string
  applicantId: string
  applicantNickname: string
  applicantAvatarUrl: string
  inviterId?: string
  inviterNickname?: string
  message?: string
  source?: string
  status: number
  createdAt?: string
}

export async function fetchGroupJoinRequests(conversationId: string): Promise<GroupJoinRequestItem[]> {
  const { data } = await http.get<
    ApiResult<
      Array<{
        id: number
        conversationId: number
        groupTitle?: string
        applicantId: number
        applicantNickname?: string
        applicantAvatarUrl?: string
        inviterId?: number
        inviterNickname?: string
        message?: string
        source?: string
        status?: number
        createdAt?: string
      }>
    >
  >(`/v1/conversations/${conversationId}/group/join-requests`)
  return (data.data || []).map((r) => ({
    id: String(r.id),
    conversationId: String(r.conversationId),
    groupTitle: r.groupTitle || '',
    applicantId: String(r.applicantId),
    applicantNickname: r.applicantNickname || '用户',
    applicantAvatarUrl: resolveAvatarUrl(r.applicantAvatarUrl || ''),
    inviterId: r.inviterId != null ? String(r.inviterId) : undefined,
    inviterNickname: r.inviterNickname || '',
    message: r.message || '',
    source: r.source || '',
    status: r.status ?? 0,
    createdAt: r.createdAt,
  }))
}

export async function fetchMyGroupInvites(): Promise<{
  list: GroupJoinRequestItem[]
  pendingCount: number
}> {
  const { data } = await http.get<
    ApiResult<{
      list?: Array<{
        id: number
        conversationId: number
        groupTitle?: string
        applicantId: number
        applicantNickname?: string
        applicantAvatarUrl?: string
        inviterId?: number
        inviterNickname?: string
        message?: string
        source?: string
        status?: number
        createdAt?: string
      }>
      pendingCount?: number
    }>
  >('/v1/user/group-invites')
  const payload = data.data
  return {
    pendingCount: payload?.pendingCount || 0,
    list: (payload?.list || []).map((r) => ({
      id: String(r.id),
      conversationId: String(r.conversationId),
      groupTitle: r.groupTitle || '群聊',
      applicantId: String(r.applicantId),
      applicantNickname: r.applicantNickname || '用户',
      applicantAvatarUrl: resolveAvatarUrl(r.applicantAvatarUrl || ''),
      inviterId: r.inviterId != null ? String(r.inviterId) : undefined,
      inviterNickname: r.inviterNickname || '好友',
      message: r.message || '',
      source: r.source || '',
      status: r.status ?? 0,
      createdAt: r.createdAt,
    })),
  }
}

export async function acceptGroupInvite(requestId: string): Promise<void> {
  await http.post(`/v1/user/group-invites/${requestId}/accept`)
}

export async function rejectGroupInvite(requestId: string): Promise<void> {
  await http.post(`/v1/user/group-invites/${requestId}/reject`)
}

export interface GroupNotificationEvent {
  id: string
  conversationId: string
  groupTitle: string
  eventType: string
  operatorNickname?: string
  source?: string
  reason?: string
  createdAt?: string
}

export async function fetchMyGroupNotifications(): Promise<{
  invites: GroupJoinRequestItem[]
  joinRequests: GroupJoinRequestItem[]
  events: GroupNotificationEvent[]
  pendingCount: number
}> {
  const { data } = await http.get<ApiResult<{
    invites?: Array<{
      id: number
      conversationId: number
      groupTitle?: string
      applicantId: number
      applicantNickname?: string
      applicantAvatarUrl?: string
      inviterId?: number
      inviterNickname?: string
      message?: string
      source?: string
      status?: number
      createdAt?: string
    }>
    joinRequests?: Array<{
      id: number
      conversationId: number
      groupTitle?: string
      applicantId: number
      applicantNickname?: string
      applicantAvatarUrl?: string
      message?: string
      source?: string
      status?: number
      createdAt?: string
    }>
    events?: Array<{
      id: number
      conversationId: number
      groupTitle?: string
      eventType?: string
      operatorNickname?: string
      source?: string
      reason?: string
      createdAt?: string
    }>
    pendingCount?: number
  }>>('/v1/user/group-notifications')
  const payload = data.data || {}
  const invites = (payload.invites || []).map((r) => ({
    id: String(r.id),
    conversationId: String(r.conversationId),
    groupTitle: r.groupTitle || '群聊',
    applicantId: String(r.applicantId),
    applicantNickname: r.applicantNickname || '用户',
    applicantAvatarUrl: resolveAvatarUrl(r.applicantAvatarUrl || ''),
    inviterId: r.inviterId != null ? String(r.inviterId) : undefined,
    inviterNickname: r.inviterNickname || '好友',
    message: r.message || '',
    source: r.source || '',
    status: r.status ?? 0,
    createdAt: r.createdAt,
  })).filter((item) => !isMobileNotificationDismissed('group-invite', item.id, item.createdAt))
  const joinRequests = (payload.joinRequests || []).map((r) => ({
    id: String(r.id),
    conversationId: String(r.conversationId),
    groupTitle: r.groupTitle || '群聊',
    applicantId: String(r.applicantId),
    applicantNickname: r.applicantNickname || '用户',
    applicantAvatarUrl: resolveAvatarUrl(r.applicantAvatarUrl || ''),
    message: r.message || '',
    source: r.source || '',
    status: r.status ?? 0,
    createdAt: r.createdAt,
  })).filter((item) => !isMobileNotificationDismissed('group-join', item.id, item.createdAt))
  const events = (payload.events || []).map((e) => ({
    id: String(e.id),
    conversationId: String(e.conversationId),
    groupTitle: e.groupTitle || '群聊',
    eventType: e.eventType || '',
    operatorNickname: e.operatorNickname || '',
    source: e.source || '',
    reason: e.reason || '',
    createdAt: e.createdAt,
  })).filter((item) => !isMobileNotificationDismissed('group-event', item.id, item.createdAt))
  return {
    pendingCount: [...invites, ...joinRequests].filter((item) => item.status === 0).length,
    invites,
    joinRequests,
    events,
  }
}

export async function approveGroupJoinRequest(
  conversationId: string,
  requestId: string,
): Promise<void> {
  await http.post(`/v1/conversations/${conversationId}/group/join-requests/${requestId}/approve`)
}

export async function rejectGroupJoinRequest(
  conversationId: string,
  requestId: string,
  remark?: string,
): Promise<void> {
  await http.post(`/v1/conversations/${conversationId}/group/join-requests/${requestId}/reject`, {
    remark: remark || undefined,
  })
}

export async function updateGroupTitle(conversationId: string, title: string): Promise<void> {
  await http.put(`/v1/conversations/${conversationId}/group/title`, { title })
}

export async function updateGroupNotice(conversationId: string, notice: string): Promise<void> {
  await http.put(`/v1/conversations/${conversationId}/group/notice`, { notice })
}

export interface GroupWelcomeSetting {
  conversationId: string
  message: string
  setterId?: string
  setterNickname?: string
  setterAvatarUrl?: string
}

export async function fetchGroupWelcome(conversationId: string): Promise<GroupWelcomeSetting> {
  const { data } = await http.get<ApiResult<{
    conversationId?: number
    message?: string
    setterId?: number
    setterNickname?: string
    setterAvatarUrl?: string
  }>>(`/v1/conversations/${conversationId}/group/welcome`)
  const value = data.data || {}
  return {
    conversationId: String(value.conversationId || conversationId),
    message: value.message || '',
    setterId: value.setterId != null ? String(value.setterId) : undefined,
    setterNickname: value.setterNickname || '',
    setterAvatarUrl: resolveAvatarUrl(value.setterAvatarUrl || ''),
  }
}

export async function updateGroupWelcome(conversationId: string, message: string): Promise<void> {
  await http.put(`/v1/conversations/${conversationId}/group/welcome`, { message })
}

export interface GroupScheduledMessage {
  id: string
  conversationId: string
  setterId?: string
  setterNickname?: string
  setterAvatarUrl?: string
  msgType: 0 | 1 | 2 | 3 | 4
  content: string
  sendAt: string
  status: string
  lastError?: string
  sentMsgId?: string
}

function mapScheduledMessage(row: any): GroupScheduledMessage {
  return {
    id: String(row.id),
    conversationId: String(row.conversationId),
    setterId: row.setterId != null ? String(row.setterId) : undefined,
    setterNickname: row.setterNickname || '',
    setterAvatarUrl: resolveAvatarUrl(row.setterAvatarUrl || ''),
    msgType: row.msgType === 1 || row.msgType === 2 || row.msgType === 3 || row.msgType === 4 ? row.msgType : 0,
    content: row.content || '',
    sendAt: row.sendAt || '',
    status: row.status || 'PENDING',
    lastError: row.lastError || '',
    sentMsgId: row.sentMsgId ? String(row.sentMsgId) : undefined,
  }
}

export async function fetchGroupScheduledMessages(conversationId: string): Promise<GroupScheduledMessage[]> {
  const { data } = await http.get<ApiResult<any[]>>(`/v1/conversations/${conversationId}/group/scheduled-messages`)
  return (data.data || []).map(mapScheduledMessage)
}

export async function createGroupScheduledMessage(
  conversationId: string,
  payload: { msgType: 0 | 1 | 2 | 3 | 4; content: string; sendAt: string },
): Promise<GroupScheduledMessage> {
  const { data } = await http.post<ApiResult<any>>(
    `/v1/conversations/${conversationId}/group/scheduled-messages`,
    { ...payload, msgType: Number(payload.msgType), sendAt: payload.sendAt },
  )
  return mapScheduledMessage(data.data)
}

export async function updateGroupScheduledMessage(
  conversationId: string,
  scheduleId: string,
  payload: { msgType: 0 | 1 | 2 | 3 | 4; content: string; sendAt: string },
): Promise<GroupScheduledMessage> {
  const { data } = await http.put<ApiResult<any>>(
    `/v1/conversations/${conversationId}/group/scheduled-messages/${scheduleId}`,
    { ...payload, msgType: Number(payload.msgType), sendAt: payload.sendAt },
  )
  return mapScheduledMessage(data.data)
}

export async function cancelGroupScheduledMessage(conversationId: string, scheduleId: string): Promise<void> {
  await http.delete(`/v1/conversations/${conversationId}/group/scheduled-messages/${scheduleId}`)
}

export async function updateGroupAvatar(conversationId: string, avatarUrl: string): Promise<void> {
  await http.put(`/v1/conversations/${conversationId}/group/avatar`, { avatarUrl })
}

export async function setGroupMemberRole(
  conversationId: string,
  userId: string,
  role: 'admin' | 'member',
): Promise<void> {
  await http.post(`/v1/conversations/${conversationId}/group/members/role`, {
    userId: Number(userId),
    role,
  })
}

export async function setGroupMuteAll(conversationId: string, muteAll: boolean): Promise<void> {
  await http.post(`/v1/conversations/${conversationId}/group/mute-all`, { muteAll })
}

export async function setMemberSpeakMuted(
  conversationId: string,
  userId: string,
  speakMuted: boolean,
): Promise<void> {
  await http.post(`/v1/conversations/${conversationId}/group/members/speak-mute`, {
    userId: Number(userId),
    speakMuted,
  })
}

export async function addGroupMembers(conversationId: string, memberIds: string[]): Promise<void> {
  await http.post(`/v1/conversations/${conversationId}/group/members`, {
    memberIds: memberIds.map((id) => Number(id)),
  })
}

export async function removeGroupMember(conversationId: string, userId: string): Promise<void> {
  await http.post(`/v1/conversations/${conversationId}/group/members/remove`, {
    userId: Number(userId),
  })
}

export async function transferGroupOwner(conversationId: string, userId: string): Promise<void> {
  await http.post(`/v1/conversations/${conversationId}/group/transfer`, {
    userId: Number(userId),
  })
}

export async function dissolveGroup(conversationId: string): Promise<void> {
  await http.post(`/v1/conversations/${conversationId}/group/dissolve`)
}

export async function leaveGroup(conversationId: string): Promise<void> {
  await http.post(`/v1/conversations/${conversationId}/group/leave`)
}

export async function updateConversationSettings(
  conversationId: string,
  settings: {
    pinned?: boolean
    mute?: boolean
    hidden?: boolean
    groupNickname?: string
    groupRemark?: string
  },
): Promise<void> {
  await http.put(`/v1/conversations/${conversationId}/settings`, settings)
}

export interface BurnSetting {
  enabled: boolean
  ttlSeconds: number
}

export async function fetchBurnSetting(conversationId: string): Promise<BurnSetting> {
  const { data } = await http.get<ApiResult<BurnSetting>>(
    `/v1/conversations/${conversationId}/burn-setting`,
  )
  return data.data
}

export async function updateBurnSetting(
  conversationId: string,
  setting: BurnSetting,
): Promise<void> {
  await http.put(`/v1/conversations/${conversationId}/burn-setting`, setting)
}

export interface LiveLocationParticipant {
  userId: string
  nickname: string
  avatarUrl?: string
  latitude: number
  longitude: number
  accuracy: number
  heading?: number
  updatedAt: number
  mine: boolean
}

export interface LiveLocationState {
  conversationId: string
  active: boolean
  sessionId?: string
  initiatorId?: string
  initiator: boolean
  participants: LiveLocationParticipant[]
}

export async function fetchLiveLocation(conversationId: string): Promise<LiveLocationState> {
  const { data } = await http.get<ApiResult<LiveLocationState>>(
    `/v1/conversations/${conversationId}/live-location`,
  )
  return data.data
}

export async function updateLiveLocation(
  conversationId: string,
  location: { latitude: number; longitude: number; accuracy?: number; heading?: number; start?: boolean },
): Promise<LiveLocationState> {
  const { data } = await http.put<ApiResult<LiveLocationState>>(
    `/v1/conversations/${conversationId}/live-location`,
    location,
  )
  return data.data
}

export async function leaveLiveLocation(conversationId: string): Promise<void> {
  await http.delete(`/v1/conversations/${conversationId}/live-location`)
}

export async function endLiveLocation(conversationId: string): Promise<void> {
  await http.delete(`/v1/conversations/${conversationId}/live-location/session`)
}

export interface AutoDeleteSetting {
  enabled: boolean
  ttlSeconds: number
  peerEnabled?: boolean
  peerTtlSeconds?: number
}

export async function fetchAutoDeleteSetting(conversationId: string): Promise<AutoDeleteSetting> {
  const { data } = await http.get<ApiResult<AutoDeleteSetting>>(
    `/v1/conversations/${conversationId}/auto-delete-setting`,
  )
  return data.data
}

export async function updateAutoDeleteSetting(
  conversationId: string,
  setting: AutoDeleteSetting,
): Promise<void> {
  await http.put(`/v1/conversations/${conversationId}/auto-delete-setting`, setting)
}

export interface BurnMediaView {
  msgId: string
  burnReadAt: string
  burnExpiresAt: string
}

export async function viewBurnMedia(
  conversationId: string,
  msgId: string,
): Promise<BurnMediaView> {
  const { data } = await http.post<ApiResult<BurnMediaView>>(
    `/v1/conversations/${conversationId}/messages/${msgId}/burn-view`,
  )
  return data.data
}

export async function markConversationUnread(conversationId: string): Promise<void> {
  await http.post(`/v1/conversations/${conversationId}/unread`)
}

export async function removeConversation(conversationId: string): Promise<void> {
  await http.post(`/v1/conversations/${conversationId}/remove`)
}

export async function deletePrivateConversation(
  conversationId: string,
  scope: 'self' | 'both',
): Promise<void> {
  await http.post(`/v1/conversations/${conversationId}/delete`, { scope })
}

export async function clearGroupHistory(
  conversationId: string,
  scope: 'self' | 'both',
): Promise<void> {
  await http.post(`/v1/conversations/${conversationId}/group/clear-history`, { scope })
}

export async function markAllConversationsRead(): Promise<void> {
  await http.post('/v1/conversations/read-all')
}

export async function batchConversations(
  ids: string[],
  action: 'delete' | 'read' | 'unread',
): Promise<void> {
  await http.post('/v1/conversations/batch', {
    ids: ids.map((id) => Number(id)),
    action,
  })
}

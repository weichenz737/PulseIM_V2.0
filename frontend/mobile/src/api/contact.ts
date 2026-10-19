import http, { type ApiResult } from './http'
import { resolveAvatarUrl, resolveFileUrl } from './file'

export interface ContactItem {
  userId: string
  pulseId?: string
  nickname: string
  displayName?: string
  avatarUrl: string
  online: boolean
  onlineHidden?: boolean
  letter: string
  remark?: string
  /** 好友标签（如默认好友后台配置） */
  tag?: string
  /** 好友添加来源，用于隐藏后台默认好友的原昵称 */
  friendAddSource?: string
  /** 是否为系统文件传输助手账号 */
  fileTransferAssistant?: boolean
}

interface BackendContactVO {
  userId: number | string
  pulseId?: string
  nickname: string
  displayName?: string
  avatarUrl?: string
  online?: boolean
  onlineHidden?: boolean
  letter?: string
  remark?: string
  tag?: string
  friendAddSource?: string
  fileTransferAssistant?: boolean
}

function mapContact(vo: BackendContactVO): ContactItem {
  const name = vo.nickname || '用户'
  return {
    userId: String(vo.userId),
    pulseId: vo.pulseId ? String(vo.pulseId) : undefined,
    nickname: name,
    displayName: vo.displayName ? String(vo.displayName) : name,
    avatarUrl: resolveAvatarUrl(vo.avatarUrl || ''),
    online: !!vo.online,
    onlineHidden: !!vo.onlineHidden,
    letter: vo.letter || name.charAt(0).toUpperCase(),
    remark: vo.remark ? String(vo.remark) : '',
    tag: vo.tag ? String(vo.tag).trim() : '',
    friendAddSource: vo.friendAddSource ? String(vo.friendAddSource) : '',
    fileTransferAssistant: !!vo.fileTransferAssistant,
  }
}

export async function fetchContacts(): Promise<ContactItem[]> {
  const { data } = await http.get<ApiResult<{ list: BackendContactVO[] }>>('/v1/contacts')
  return (data.data?.list || []).map(mapContact)
}

export interface UserOnlineState {
  online: boolean
  onlineHidden: boolean
}

/** 查询指定用户是否在线（含隐藏状态） */
export async function fetchUserOnline(userId: string): Promise<UserOnlineState> {
  if (!userId) return { online: false, onlineHidden: false }
  const { data } = await http.get<ApiResult<{ online?: boolean; onlineHidden?: boolean }>>(
    `/v1/users/${userId}/online`,
  )
  return {
    online: !!data.data?.online,
    onlineHidden: !!data.data?.onlineHidden,
  }
}

export interface UserSearchResult {
  userId: string
  nickname: string
  avatarUrl: string
  phone?: string
}

export async function searchUserByPhone(phone: string): Promise<UserSearchResult | null> {
  const { data } = await http.get<ApiResult<UserSearchResult | null>>('/v1/user/search', {
    params: { phone },
  })
  const result = data.data
  if (!result) return null
  return {
    userId: String(result.userId),
    nickname: result.nickname,
    avatarUrl: resolveAvatarUrl(result.avatarUrl || ''),
    phone: result.phone,
  }
}

export interface UserProfile {
  userId: string
  pulseId?: string
  nickname: string
  displayName?: string
  avatarUrl: string
  momentsCoverUrl?: string
  gender?: string
  birthday?: string
  region?: string
  signature?: string
  phone?: string
  friend?: boolean
  /** none | pending_sent | pending_received | friend | blocked */
  friendStatus?: string
  /** 当前用户是否已拉黑对方 */
  blocked?: boolean
  /** 对方是否已将当前用户拉黑 */
  blockedByPeer?: boolean
  commonGroupCount?: number
  /** 我对对方的备注 */
  remark?: string
  /** 好友标签（如默认好友后台配置） */
  tag?: string
  /** 好友添加来源 */
  friendAddSource?: string
  /** 系统文件传输助手不能通话 */
  fileTransferAssistant?: boolean
  /** 发起添加的用户 ID */
  friendAddInitiatorId?: string
  /** 成为好友时间 ISO */
  friendSince?: string
  /** 不看对方的朋友圈 */
  hideHisMoments?: boolean
  /** 不让对方看我的朋友圈 */
  rejectHisMoments?: boolean
}

function mapProfile(p: UserProfile & { momentsCoverUrl?: string; commonGroupCount?: number }): UserProfile {
  return {
    userId: String(p.userId),
    pulseId: p.pulseId ? String(p.pulseId) : undefined,
    nickname: p.nickname,
    displayName: p.displayName ? String(p.displayName) : undefined,
    avatarUrl: resolveAvatarUrl(p.avatarUrl || ''),
    momentsCoverUrl: resolveFileUrl(p.momentsCoverUrl || ''),
    gender: p.gender,
    birthday: p.birthday,
    region: p.region,
    signature: p.signature,
    phone: p.phone,
    friend: !!p.friend || p.friendStatus === 'friend',
    friendStatus: p.friendStatus || (p.friend ? 'friend' : 'none'),
    blocked: !!p.blocked || p.friendStatus === 'blocked',
    blockedByPeer: !!p.blockedByPeer || p.friendStatus === 'blocked_by_peer',
    commonGroupCount: typeof p.commonGroupCount === 'number' ? p.commonGroupCount : 0,
    remark: p.remark ? String(p.remark) : '',
    tag: p.tag ? String(p.tag).trim() : '',
    friendAddSource: p.friendAddSource ? String(p.friendAddSource) : '',
    fileTransferAssistant: !!p.fileTransferAssistant,
    friendAddInitiatorId: p.friendAddInitiatorId != null ? String(p.friendAddInitiatorId) : '',
    friendSince: p.friendSince ? String(p.friendSince) : '',
    hideHisMoments: !!p.hideHisMoments,
    rejectHisMoments: !!p.rejectHisMoments,
  }
}

export async function fetchUserProfile(userId?: string): Promise<UserProfile> {
  const url = userId ? `/v1/user/${userId}` : '/v1/user/profile'
  const { data } = await http.get<ApiResult<UserProfile>>(url)
  return mapProfile(data.data)
}

export async function fetchUserByPulseId(pulseId: string): Promise<UserProfile> {
  const { data } = await http.get<ApiResult<UserProfile>>(`/v1/user/pulse/${pulseId}`)
  const p = data.data
  return {
    ...mapProfile(p),
    pulseId: p.pulseId ? String(p.pulseId) : pulseId,
  }
}

export async function addFriend(
  userId: string,
  payload?: { message?: string; remark?: string; source?: string; groupId?: string },
): Promise<void> {
  await http.post(`/v1/contacts/${userId}`, payload || {})
}

/** 允许朋友查看朋友圈的时间范围 */
export type MomentsVisibleRange = 'all' | 'half_year' | 'month' | 'three_days'

export interface PrivacySettings {
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
  momentsVisibleRange: MomentsVisibleRange
  momentsStrangerTen: boolean
  hideOnlineStatus: boolean
  readReceiptEnabled: boolean
  typingStatusEnabled: boolean
}

const defaultPrivacy = (): PrivacySettings => ({
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
  typingStatusEnabled: true,
})

function normalizeMomentsRange(v?: string | null): MomentsVisibleRange {
  const r = (v || '').trim().toLowerCase()
  if (r === 'half_year' || r === 'halfyear' || r === '6m') return 'half_year'
  if (r === 'month' || r === '1m') return 'month'
  if (r === 'three_days' || r === 'threedays' || r === '3d') return 'three_days'
  return 'all'
}

function mapPrivacy(p?: Partial<PrivacySettings> | null): PrivacySettings {
  const d = defaultPrivacy()
  if (!p) return d
  return {
    friendVerifyRequired: p.friendVerifyRequired ?? d.friendVerifyRequired,
    groupInviteVerify: p.groupInviteVerify ?? d.groupInviteVerify,
    addByPhone: p.addByPhone ?? d.addByPhone,
    addByPulseId: p.addByPulseId ?? d.addByPulseId,
    addByGroup: p.addByGroup ?? d.addByGroup,
    addByQrcode: p.addByQrcode ?? d.addByQrcode,
    addByCard: p.addByCard ?? d.addByCard,
    addByDeletedChat: p.addByDeletedChat ?? d.addByDeletedChat,
    searchByPhone: p.searchByPhone ?? d.searchByPhone,
    searchByPulseId: p.searchByPulseId ?? d.searchByPulseId,
    momentsVisibleRange: normalizeMomentsRange(p.momentsVisibleRange),
    momentsStrangerTen: p.momentsStrangerTen ?? d.momentsStrangerTen,
    hideOnlineStatus: p.hideOnlineStatus ?? d.hideOnlineStatus,
    readReceiptEnabled: p.readReceiptEnabled ?? d.readReceiptEnabled,
    typingStatusEnabled: p.typingStatusEnabled ?? d.typingStatusEnabled,
  }
}

export async function fetchPrivacySettings(): Promise<PrivacySettings> {
  const { data } = await http.get<ApiResult<PrivacySettings>>('/v1/user/privacy')
  return mapPrivacy(data.data)
}

export async function updatePrivacySettings(
  patch: Partial<PrivacySettings>,
): Promise<PrivacySettings> {
  const { data } = await http.put<ApiResult<PrivacySettings>>('/v1/user/privacy', patch)
  return mapPrivacy(data.data)
}

export async function deleteFriend(userId: string): Promise<void> {
  await http.post(`/v1/contacts/${userId}/delete`)
}

export async function blockUser(userId: string): Promise<void> {
  await http.post(`/v1/contacts/${userId}/block`)
}

export async function unblockUser(userId: string): Promise<void> {
  await http.post(`/v1/contacts/${userId}/unblock`)
}

export async function updateFriendRemark(userId: string, remark: string): Promise<void> {
  await http.put(`/v1/contacts/${userId}/remark`, { remark: remark.trim() })
}

export async function updateFriendMomentsPermission(
  userId: string,
  payload: { hideHisMoments?: boolean; rejectHisMoments?: boolean },
): Promise<void> {
  await http.put(`/v1/contacts/${userId}/moments-permission`, payload)
}

export async function fetchBlockedUsers(): Promise<ContactItem[]> {
  const { data } = await http.get<ApiResult<{ list: BackendContactVO[] }>>('/v1/contacts/blocked')
  return (data.data?.list || []).map(mapContact)
}

/** 不看他（她）的朋友圈名单 */
export async function fetchMomentsHideUsers(): Promise<ContactItem[]> {
  const { data } = await http.get<ApiResult<{ list: BackendContactVO[] }>>('/v1/contacts/moments-hide')
  return (data.data?.list || []).map(mapContact)
}

/** 不让他（她）看我的朋友圈名单 */
export async function fetchMomentsRejectUsers(): Promise<ContactItem[]> {
  const { data } = await http.get<ApiResult<{ list: BackendContactVO[] }>>('/v1/contacts/moments-reject')
  return (data.data?.list || []).map(mapContact)
}

export interface CommonGroupItem {
  id: string
  title: string
  avatarUrl: string
  memberCount: number
}

export async function fetchCommonGroups(userId: string): Promise<CommonGroupItem[]> {
  const { data } = await http.get<
    ApiResult<{
      list: Array<{
        id: number | string
        title?: string
        avatarUrl?: string
        memberCount?: number
      }>
      count?: number
    }>
  >(`/v1/users/${userId}/common-groups`)
  return (data.data?.list || []).map((g) => ({
    id: String(g.id),
    title: g.title || '群聊',
    avatarUrl: resolveAvatarUrl(g.avatarUrl || ''),
    memberCount: g.memberCount ?? 0,
  }))
}

export interface FriendRequestItem {
  id: string
  fromUserId: string
  toUserId: string
  nickname: string
  avatarUrl: string
  message?: string
  remark?: string
  status: number
  direction: 'incoming' | 'outgoing'
  createdAt?: string
  handledAt?: string
}

export async function fetchFriendRequests(): Promise<{
  list: FriendRequestItem[]
  pendingCount: number
}> {
  const { data } = await http.get<
    ApiResult<{
      list: Array<{
        id: number | string
        fromUserId: number | string
        toUserId: number | string
        nickname: string
        avatarUrl?: string
        message?: string
        remark?: string
        status: number
        direction: string
        createdAt?: string
        handledAt?: string
      }>
      pendingCount: number
    }>
  >('/v1/friend-requests')
  const payload = data.data
  return {
    pendingCount: payload?.pendingCount || 0,
    list: (payload?.list || []).map((r) => ({
      id: String(r.id),
      fromUserId: String(r.fromUserId),
      toUserId: String(r.toUserId),
      nickname: r.nickname || '用户',
      avatarUrl: resolveAvatarUrl(r.avatarUrl || ''),
      message: r.message || '',
      remark: r.remark || '',
      status: r.status ?? 0,
      direction: r.direction === 'outgoing' ? 'outgoing' : 'incoming',
      createdAt: r.createdAt,
      handledAt: r.handledAt,
    })),
  }
}

export async function acceptFriendRequest(id: string, remark?: string): Promise<void> {
  await http.post(`/v1/friend-requests/${id}/accept`, remark ? { remark } : {})
}

export async function rejectFriendRequest(id: string): Promise<void> {
  await http.post(`/v1/friend-requests/${id}/reject`)
}

export async function updateUserProfile(payload: Partial<UserProfile>): Promise<void> {
  await http.put<ApiResult<unknown>>('/v1/user/profile', payload)
}

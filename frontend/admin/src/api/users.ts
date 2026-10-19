import http, { type ApiResult } from './http'

export interface AdminUser {
  id: number
  phone: string
  password?: string
  securityCodeEnabled?: boolean
  securityCode?: string
  pulseId?: string
  nickname: string
  avatarUrl?: string
  gender?: string
  birthday?: string
  region?: string
  signature?: string
  /** 钱包余额，单位：分 */
  walletBalance?: number
  status: number
  /** 是否永久封禁 */
  banPermanent?: boolean
  /** 封禁到期时间 */
  banUntil?: string
  /** 封禁原因 */
  banReason?: string
  online?: boolean
  lastOnlineAt?: string
  createdAt?: string
  updatedAt?: string
  /** 该用户拉黑的人数 */
  blockCount?: number
  /** 好友数 */
  friendCount?: number
  /** 收藏数 */
  favoriteCount?: number
  /** 删友记录数 */
  friendDeleteCount?: number
  /** 朋友权限（由用户隐私设置字段透传） */
  friendVerifyRequired?: boolean
  groupInviteVerify?: boolean
  addByPhone?: boolean
  addByPulseId?: boolean
  addByGroup?: boolean
  addByQrcode?: boolean
  addByCard?: boolean
  addByDeletedChat?: boolean
  searchByPhone?: boolean
  searchByPulseId?: boolean
}

export interface AdminBlockedUser {
  userId: number
  phone?: string
  pulseId?: string
  nickname?: string
  avatarUrl?: string
  remark?: string
  blockedAt?: string
  ownerUserId?: number
  ownerNickname?: string
  ownerPhone?: string
  ownerPulseId?: string
}

export interface AdminCommonGroup {
  id: number
  title?: string
  avatarUrl?: string
  memberCount?: number
}

export interface AdminFriend {
  userId: number
  phone?: string
  pulseId?: string
  nickname?: string
  avatarUrl?: string
  remark?: string
  addSource?: string
  addSourceLabel?: string
  addInitiatorId?: number
  addInitiatorNickname?: string
  friendSince?: string
  online?: boolean
  ownerUserId?: number
  ownerNickname?: string
  ownerPhone?: string
  ownerPulseId?: string
  commonGroupCount?: number
  commonGroups?: AdminCommonGroup[]
}

export interface AdminFriendDeleteLog {
  id: number
  userId?: number
  userNickname?: string
  userPhone?: string
  userPulseId?: string
  friendId?: number
  friendNickname?: string
  friendPhone?: string
  friendPulseId?: string
  friendAvatarUrl?: string
  addSource?: string
  addSourceLabel?: string
  addInitiatorId?: number
  friendSince?: string
  reason?: string
  reasonLabel?: string
  deletedAt?: string
}

export interface AdminFavorite {
  id: number
  conversationId?: number
  msgId?: string
  msgType?: number
  msgTypeLabel?: string
  content?: string
  contentPreview?: string
  fromNickname?: string
  sourceTitle?: string
  createdAt?: string
  ownerUserId?: number
  ownerNickname?: string
  ownerPhone?: string
  ownerPulseId?: string
}

export interface RelationListResult<T> {
  list: T[]
  total: number
  page: number
  size: number
}

export interface UserListParams {
  page?: number
  size?: number
  keyword?: string
  status?: number | ''
  online?: boolean | ''
  /** 与控制台「今日活跃」同一口径 */
  activeToday?: boolean | ''
  /** 注册日起 YYYY-MM-DD */
  createdFrom?: string
  /** 注册日止 YYYY-MM-DD */
  createdTo?: string
  /** online | lastOnlineAt | createdAt */
  sortBy?: string
  /** asc | desc */
  sortOrder?: 'asc' | 'desc' | ''
}

export interface UserListResult {
  list: AdminUser[]
  total: number
  page: number
  size: number
}

export interface DefaultFriendItem {
  friendUserId?: number
  nicknameMode: 'original' | 'custom'
  customNickname?: string
  /** 用户端展示的好友标签 */
  tag?: string
  /** 新用户添加该默认好友后收到的首条消息 */
  greetingText?: string
  friendNickname?: string
  friendPhone?: string
  friendPulseId?: string
  friendAvatarUrl?: string
  affectedUsers?: number
}

export interface DefaultFriendConfig {
  enabled: boolean
  items: DefaultFriendItem[]
  affectedUsers?: number
}

export interface CreateUserPayload {
  phone: string
  password: string
  nickname: string
  avatarUrl?: string
  gender?: string
  region?: string
  signature?: string
}

export interface UpdateUserPayload {
  nickname?: string
  avatarUrl?: string
  gender?: string
  region?: string
  signature?: string
  birthday?: string
  friendVerifyRequired?: boolean
  groupInviteVerify?: boolean
  addByPhone?: boolean
  addByPulseId?: boolean
  addByGroup?: boolean
  addByQrcode?: boolean
  addByCard?: boolean
  addByDeletedChat?: boolean
  searchByPhone?: boolean
  searchByPulseId?: boolean
}

export interface DashboardStats {
  totalUsers: number
  activeUsers: number
  disabledUsers: number
  todayRegistered: number
  onlineUsers: number
  /** 今日活跃（登录/在线/发消息等） */
  todayActiveUsers: number
  /** 群聊总数 */
  totalGroups: number
  /** 动态（朋友圈）总数 */
  totalMoments: number
  /** 配置的默认好友账号数 */
  defaultFriendCount: number
}

export async function fetchUsers(params: UserListParams): Promise<UserListResult> {
  const { data } = await http.get<ApiResult<UserListResult>>('/admin/users', {
    params: {
      page: params.page ?? 1,
      size: params.size ?? 20,
      keyword: params.keyword || undefined,
      status: params.status === '' || params.status === undefined ? undefined : params.status,
      online: params.online === '' || params.online === undefined ? undefined : params.online,
      activeToday:
        params.activeToday === '' || params.activeToday === undefined
          ? undefined
          : params.activeToday,
      createdFrom: params.createdFrom || undefined,
      createdTo: params.createdTo || undefined,
      sortBy: params.sortBy || undefined,
      sortOrder: params.sortOrder || undefined,
    },
  })
  return data.data
}

export async function fetchUser(id: number): Promise<AdminUser> {
  const { data } = await http.get<ApiResult<AdminUser>>(`/admin/users/${id}`)
  return data.data
}

export async function createUser(payload: CreateUserPayload): Promise<AdminUser> {
  const { data } = await http.post<ApiResult<AdminUser>>('/admin/users', payload)
  return data.data
}

export async function updateUser(id: number, payload: UpdateUserPayload): Promise<AdminUser> {
  const { data } = await http.put<ApiResult<AdminUser>>(`/admin/users/${id}`, payload)
  return data.data
}

export async function updateUserStatus(
  id: number,
  payload: { status: number; banDays?: number | null; banReason?: string },
): Promise<AdminUser> {
  const { data } = await http.put<ApiResult<AdminUser>>(`/admin/users/${id}/status`, {
    status: payload.status,
    banDays: payload.status === 0 ? (payload.banDays ?? 0) : undefined,
    banReason: payload.status === 0 ? payload.banReason || undefined : undefined,
  })
  return data.data
}

export async function resetUserPassword(id: number, password: string): Promise<void> {
  await http.put(`/admin/users/${id}/password`, { password })
}

export async function deleteUser(
  id: number,
  transfers?: OwnerTransfer[],
  deleteOwnedCommunities = false,
): Promise<void> {
  await http.delete(`/admin/users/${id}`, {
    data: transfers?.length || deleteOwnedCommunities
      ? { transfers, deleteOwnedCommunities }
      : undefined,
  })
}

export async function deleteUsers(ids: number[]): Promise<number> {
  const { data } = await http.post<ApiResult<{ deleted: number }>>('/admin/users/batch-delete', {
    ids,
  })
  return data.data?.deleted ?? 0
}

export interface OwnedGroupCandidate {
  userId: number
  nickname?: string
  phone?: string
  pulseId?: string
  avatarUrl?: string
  role?: string
}

export interface OwnedGroup {
  conversationId: number
  title?: string
  avatarUrl?: string
  memberCount?: number
  mustDissolve?: boolean
  candidates?: OwnedGroupCandidate[]
}

export interface OwnedCommunity {
  communityId: number
  name?: string
  memberCount?: number
  status?: string
}

export interface OwnerTransfer {
  conversationId: number
  newOwnerId: number
}

export async function fetchOwnedGroups(userId: number): Promise<OwnedGroup[]> {
  const { data } = await http.get<ApiResult<OwnedGroup[]>>(`/admin/users/${userId}/owned-groups`)
  return data.data ?? []
}

export async function fetchOwnedCommunities(userId: number): Promise<OwnedCommunity[]> {
  const { data } = await http.get<ApiResult<OwnedCommunity[]>>(
    `/admin/users/${userId}/owned-communities`,
  )
  return data.data ?? []
}

export async function fetchUserBlockedUsers(userId: number): Promise<AdminBlockedUser[]> {
  const { data } = await http.get<ApiResult<AdminBlockedUser[]>>(`/admin/users/${userId}/blocked-users`)
  return data.data ?? []
}

export async function fetchUserFriends(userId: number): Promise<AdminFriend[]> {
  const { data } = await http.get<ApiResult<AdminFriend[]>>(`/admin/users/${userId}/friends`)
  return data.data ?? []
}

export async function fetchUserFriendDeleteLogs(userId: number): Promise<AdminFriendDeleteLog[]> {
  const { data } = await http.get<ApiResult<AdminFriendDeleteLog[]>>(
    `/admin/users/${userId}/friend-delete-logs`,
  )
  return data.data ?? []
}

export async function fetchUserFavorites(userId: number): Promise<AdminFavorite[]> {
  const { data } = await http.get<ApiResult<AdminFavorite[]>>(`/admin/users/${userId}/favorites`)
  return data.data ?? []
}

export async function fetchAllUserFriends(params: {
  page?: number
  size?: number
  keyword?: string
  userId?: number | ''
}): Promise<RelationListResult<AdminFriend>> {
  const { data } = await http.get<ApiResult<RelationListResult<AdminFriend>>>('/admin/user-friends', {
    params: {
      page: params.page ?? 1,
      size: params.size ?? 20,
      keyword: params.keyword || undefined,
      userId: params.userId === '' || params.userId == null ? undefined : params.userId,
    },
  })
  return data.data
}

export async function createUserFriend(payload: {
  userId: number
  friendId: number
  remark?: string
}): Promise<AdminFriend> {
  const { data } = await http.post<ApiResult<AdminFriend>>('/admin/user-friends', {
    userId: payload.userId,
    friendId: payload.friendId,
    remark: payload.remark?.trim() || undefined,
  })
  return data.data
}

export async function fetchAllUserBlocks(params: {
  page?: number
  size?: number
  keyword?: string
  userId?: number | ''
}): Promise<RelationListResult<AdminBlockedUser>> {
  const { data } = await http.get<ApiResult<RelationListResult<AdminBlockedUser>>>('/admin/user-blocks', {
    params: {
      page: params.page ?? 1,
      size: params.size ?? 20,
      keyword: params.keyword || undefined,
      userId: params.userId === '' || params.userId == null ? undefined : params.userId,
    },
  })
  return data.data
}

export async function fetchAllUserFavorites(params: {
  page?: number
  size?: number
  keyword?: string
  userId?: number | ''
  msgType?: number | ''
}): Promise<RelationListResult<AdminFavorite>> {
  const { data } = await http.get<ApiResult<RelationListResult<AdminFavorite>>>('/admin/user-favorites', {
    params: {
      page: params.page ?? 1,
      size: params.size ?? 20,
      keyword: params.keyword || undefined,
      userId: params.userId === '' || params.userId == null ? undefined : params.userId,
      msgType: params.msgType === '' || params.msgType == null ? undefined : params.msgType,
    },
  })
  return data.data
}

export async function fetchAllFriendDeleteLogs(params: {
  page?: number
  size?: number
  keyword?: string
  userId?: number | ''
  reason?: string | ''
}): Promise<RelationListResult<AdminFriendDeleteLog>> {
  const { data } = await http.get<ApiResult<RelationListResult<AdminFriendDeleteLog>>>(
    '/admin/user-friend-delete-logs',
    {
      params: {
        page: params.page ?? 1,
        size: params.size ?? 20,
        keyword: params.keyword || undefined,
        userId: params.userId === '' || params.userId == null ? undefined : params.userId,
        reason: params.reason || undefined,
      },
    },
  )
  return data.data
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const { data } = await http.get<ApiResult<DashboardStats>>('/admin/dashboard/stats')
  return data.data
}

export async function adjustUserWallet(
  id: number,
  payload: { direction: 'CREDIT' | 'DEBIT'; amount: number; remark?: string },
): Promise<{ balanceBefore: number; balanceAfter: number; tradeNo: string }> {
  const { data } = await http.post<ApiResult<{ balanceBefore: number; balanceAfter: number; tradeNo: string }>>(
    `/admin/users/${id}/wallet/adjust`,
    payload,
  )
  return data.data
}

export async function fetchDefaultFriend(): Promise<DefaultFriendConfig> {
  const { data } = await http.get<ApiResult<DefaultFriendConfig>>('/admin/users/default-friend')
  return data.data
}

export async function saveDefaultFriend(payload: {
  enabled: boolean
  items: Array<{
    friendUserId?: number
    nicknameMode: 'original' | 'custom'
    customNickname?: string
    tag?: string
    greetingText?: string
  }>
}): Promise<DefaultFriendConfig> {
  const { data } = await http.put<ApiResult<DefaultFriendConfig>>(
    '/admin/users/default-friend',
    payload,
  )
  return data.data
}

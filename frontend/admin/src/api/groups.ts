import http, { type ApiResult } from './http'

export interface GroupMember {
  userId: number
  nickname?: string
  phone?: string
  pulseId?: string
  avatarUrl?: string
  role?: string
  speakMuted?: boolean
  joinSource?: string
  joinedAt?: string
}

export interface GroupCreateRecord {
  userId?: number
  nickname?: string
  phone?: string
  pulseId?: string
  avatarUrl?: string
  source?: string
  sourceLabel?: string
  reason?: string
  operatorId?: number
  operatorNickname?: string
  createdAt?: string
}

export interface AdminGroup {
  id: number
  pulseId?: string
  title?: string
  avatarUrl?: string
  ownerId?: number
  ownerNickname?: string
  ownerPhone?: string
  memberCount?: number
  muteAll?: boolean
  joinVerifyRequired?: boolean
  notice?: string
  welcomeMessage?: string
  welcomeSetterId?: number
  welcomeSetterNickname?: string
  welcomeSetterAvatarUrl?: string
  lastMsgPreview?: string
  lastMsgTime?: string
  createdAt?: string
  updatedAt?: string
  members?: GroupMember[]
  createRecords?: GroupCreateRecord[]
}

export interface GroupListParams {
  page?: number
  size?: number
  keyword?: string
}

export interface GroupListResult {
  list: AdminGroup[]
  total: number
  page: number
  size: number
}

export async function fetchGroups(params: GroupListParams): Promise<GroupListResult> {
  const { data } = await http.get<ApiResult<GroupListResult>>('/admin/groups', {
    params: {
      page: params.page ?? 1,
      size: params.size ?? 20,
      keyword: params.keyword || undefined,
    },
  })
  return data.data
}

export async function fetchGroup(id: number): Promise<AdminGroup> {
  const { data } = await http.get<ApiResult<AdminGroup>>(`/admin/groups/${id}`)
  return data.data
}

export async function createGroup(payload: {
  title: string
  ownerId: number
  memberIds: number[]
  notice?: string
}): Promise<AdminGroup> {
  const { data } = await http.post<ApiResult<AdminGroup>>('/admin/groups', {
    title: payload.title,
    ownerId: payload.ownerId,
    memberIds: payload.memberIds,
    notice: payload.notice || undefined,
  })
  return data.data
}

export async function dissolveGroup(id: number): Promise<void> {
  await http.delete(`/admin/groups/${id}`)
}

export async function transferGroupOwner(id: number, newOwnerId: number): Promise<AdminGroup> {
  const { data } = await http.put<ApiResult<AdminGroup>>(`/admin/groups/${id}/owner`, {
    newOwnerId,
  })
  return data.data
}

export async function dissolveGroups(ids: number[]): Promise<number> {
  const { data } = await http.post<ApiResult<{ deleted: number }>>('/admin/groups/batch-delete', {
    ids,
  })
  return data.data?.deleted ?? 0
}

import http, { type ApiResult } from './http'

export interface AdminMomentComment {
  id: number
  userId?: number
  nickname?: string
  avatarUrl?: string
  content?: string
  replyToCommentId?: number
  replyToUserId?: number
  replyToNickname?: string
  imageUrl?: string
  imageFileId?: string
  createdAt?: string
}

export interface AdminMoment {
  id: number
  userId?: number
  nickname?: string
  phone?: string
  pulseId?: string
  avatarUrl?: string
  content?: string
  images?: string[]
  originalImages?: string[]
  mediaTypes?: Array<'image' | 'video'>
  mediaFileIds?: string[]
  visibility?: number
  visibilityLabel?: string
  likeCount?: number
  commentCount?: number
  likeNicknames?: string[]
  comments?: AdminMomentComment[]
  mentionNicknames?: string[]
  /** normal / user_deleted / admin_deleted */
  status?: string
  statusLabel?: string
  removedAt?: string
  removedBy?: string
  createdAt?: string
}

export interface MomentListParams {
  page?: number
  size?: number
  keyword?: string
  status?: string
}

export interface MomentListResult {
  list: AdminMoment[]
  total: number
  page: number
  size: number
}

export async function fetchMoments(params: MomentListParams): Promise<MomentListResult> {
  const { data } = await http.get<ApiResult<MomentListResult>>('/admin/moments', {
    params: {
      page: params.page ?? 1,
      size: params.size ?? 20,
      keyword: params.keyword || undefined,
      status: params.status || undefined,
    },
  })
  return data.data
}

export async function fetchMoment(id: number): Promise<AdminMoment> {
  const { data } = await http.get<ApiResult<AdminMoment>>(`/admin/moments/${id}`)
  return data.data
}

export async function deleteMoment(id: number): Promise<void> {
  await http.delete(`/admin/moments/${id}`)
}

export async function deleteMoments(ids: number[]): Promise<number> {
  const { data } = await http.post<ApiResult<{ deleted: number }>>('/admin/moments/batch-delete', {
    ids,
  })
  return data.data?.deleted ?? 0
}

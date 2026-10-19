import http, { type ApiResult } from './http'
import { fileDownloadUrl, resolveAvatarUrl, resolveFileUrl } from './file'
import type { MomentCommentItem, MomentItem } from './moments'

export interface Community {
  id: number
  name: string
  avatar?: string
  description: string
  rules?: string
  announcement?: string
  topic?: string
  type: 'FREE' | 'PAID'
  price: number
  status: string
  reject_reason?: string
  member_count: number
  post_count: number
  joined?: boolean
  canViewContent?: boolean
  my_role?: string
  post_mode?: 'ALL' | 'REVIEW' | 'ADMIN_ONLY' | string
  join_review_required?: boolean
  leave_review_required?: boolean
  join_request_status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | string
  leave_request_status?: 'PENDING' | 'APPROVED' | 'REJECTED' | string
  pending_name?: string
  pending_avatar?: string
  pending_name_review?: boolean
  pending_avatar_review?: boolean
  pending_post_count?: number
  profile_review_unread_count?: number
  owner_name?: string
  posts?: CommunityPost[]
}

export interface CommunityPost extends MomentItem {
  id: string
  communityId: string
  locationName?: string
  locationAddress?: string
  latitude?: number
  longitude?: number
  status: string
  pinned: boolean
  pinnedAt?: string
  favoritedByMe: boolean
  canDelete: boolean
  canAttemptDelete: boolean
  authorRole: 'OWNER' | 'ADMIN' | 'MEMBER' | string
  myRole?: 'OWNER' | 'ADMIN' | 'MEMBER' | string
  forwardCount?: number
  quotedPost?: {
    id: string
    userId: string
    nickname: string
    content: string
    images: string[]
    mediaTypes: Array<'image' | 'video'>
    mediaFileIds?: string[]
  }
}

export interface CommunityReportReason {
  code: string
  name: string
  sortOrder: number
}

export interface CommunityMemberRemovalReason {
  code: string
  name: string
  sortOrder: number
}

export interface CommunityReportPayload {
  targetType: 'COMMUNITY' | 'POST' | 'COMMENT' | 'USER'
  targetId: string | number
  reasonCode: string
  detail?: string
  evidenceUrls?: string[]
  evidenceTypes?: Array<'image' | 'video'>
}

const unwrap = <T>(r: { data: ApiResult<T> }) => r.data.data
const mapCommunityAvatar = (value: unknown) => value ? resolveFileUrl(String(value)) : undefined

export const listCommunities = async (params: Record<string, unknown> = {}) => {
  const result = unwrap(await http.get<ApiResult<{ items: Community[] }>>('/v1/communities', { params }))
  return { ...result, items: (result?.items || []).map((item) => ({ ...item, avatar: mapCommunityAvatar(item.avatar) })) }
}
export const myCommunities = async () => {
  const rows = unwrap(await http.get<ApiResult<Array<Community & { role?: string }>>>('/v1/communities/mine')) || []
  return rows.map((item) => ({ ...item, avatar: mapCommunityAvatar(item.avatar), my_role: item.my_role || item.role || 'MEMBER' }))
}
export const communityTopics = async () => unwrap(await http.get<ApiResult<{ id: number; name: string }[]>>('/v1/communities/topics')) || []
export async function communityDetail(id: number): Promise<Community> {
  const raw = unwrap(await http.get<ApiResult<Record<string, any>>>(`/v1/communities/${id}`)) || {}
  return {
    ...(raw as Community),
    id: Number(raw.id),
    avatar: mapCommunityAvatar(raw.avatar),
    pending_avatar: mapCommunityAvatar(raw.pending_avatar ?? raw.pendingAvatar),
    member_count: Number(raw.member_count ?? raw.memberCount ?? 0),
    post_count: Number(raw.post_count ?? raw.postCount ?? 0),
    price: Number(raw.price ?? 0),
    announcement: String(raw.announcement ?? '').trim() || undefined,
    posts: Array.isArray(raw.posts) ? raw.posts.map(mapCommunityPost) : [],
  }
}
export const createCommunity = async (p: Record<string, unknown>) => unwrap(await http.post<ApiResult<{ id: number }>>('/v1/communities', p))
export interface CommunityJoinResult { joined: boolean; paid: boolean; pendingApproval?: boolean; orderNo?: string }
export const joinCommunity = async (id: number, paymentPassword = '', agreementAccepted = false) => unwrap(await http.post<ApiResult<CommunityJoinResult>>(`/v1/communities/${id}/join`, { paymentPassword, agreementAccepted }))

export interface CommunityMember {
  id: number
  user_id: number
  nickname: string
  avatar_url?: string
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | string
  permissions?: string
  status: 'ACTIVE' | 'MUTED' | 'REMOVED' | string
  muted_until?: string
  join_time?: string
  status_updated_at?: string
}

export interface CommunityJoinRequest {
  id: number
  user_id: number
  nickname: string
  avatar_url?: string
  status: string
  created_at: string
  reviewed_at?: string
}
export interface CommunityLeaveRequest extends CommunityJoinRequest { reason: string }

export interface CommunityDashboardDetail {
  id: number
  item_type: 'MEMBER' | 'POST' | 'ORDER' | string
  user_id?: number
  nickname?: string
  avatar_url?: string
  role?: string
  status?: string
  operation_date: string
  operation_label: string
  content?: string
  community_id?: number
  like_count?: number
  comment_count?: number
  order_no?: string
  amount?: number
  owner_income?: number
}

export interface CommunityDashboard {
  member_count: number
  post_count: number
  today_new: number
  cumulative_join: number
  cumulative_exit: number
  active_members: number
  post_total: number
  comment_total: number
  like_total: number
  report_total: number
  income_total: number
  income_today: number
  withdrawable: number
  order_count: number
}

export async function fetchCommunityMembers(id: number, keyword = '', status = ''): Promise<CommunityMember[]> {
  const params: Record<string, string> = {}
  if (keyword) params.keyword = keyword
  if (status) params.status = status
  const result = unwrap(await http.get<ApiResult<CommunityMember[]>>(`/v1/communities/${id}/members`, { params }))
  return Array.isArray(result) ? result : []
}

export async function updateCommunity(id: number, payload: Record<string, unknown>): Promise<{ profileReviewPending?: boolean }> {
  return unwrap(await http.put<ApiResult<{ profileReviewPending?: boolean }>>(`/v1/communities/${id}`, payload)) || {}
}

export async function setCommunityMemberStatus(
  id: number,
  memberId: number,
  status: 'ACTIVE' | 'MUTED' | 'REMOVED',
  reason = '',
  reasonCode = '',
  reasonDetail = '',
): Promise<void> {
  await http.put(`/v1/communities/${id}/members/${memberId}/status`, {
    status,
    ...(reasonCode ? { reasonCode, reasonDetail } : { reason }),
  })
}

export async function setCommunityMemberAdmin(id: number, memberId: number, admin: boolean): Promise<void> {
  await http.put(`/v1/communities/${id}/members/${memberId}/admin`, { admin })
}

export async function setCommunityMemberPermissions(id: number, memberId: number, permissions: string[]): Promise<void> {
  await http.put(`/v1/communities/${id}/members/${memberId}/permissions`, { permissions })
}

export async function fetchCommunityDashboard(id: number): Promise<CommunityDashboard> {
  return unwrap(await http.get<ApiResult<CommunityDashboard>>(`/v1/communities/${id}/dashboard`))
}

export async function fetchCommunityDashboardDetails(id: number, type: string): Promise<CommunityDashboardDetail[]> {
  const result = unwrap(await http.get<ApiResult<CommunityDashboardDetail[]>>(`/v1/communities/${id}/dashboard/details`, { params: { type } }))
  return Array.isArray(result) ? result : []
}

export async function fetchCommunityJoinRequests(id: number): Promise<CommunityJoinRequest[]> {
  const result = unwrap(await http.get<ApiResult<CommunityJoinRequest[]>>(`/v1/communities/${id}/join-requests`))
  return Array.isArray(result) ? result : []
}

export async function reviewCommunityJoinRequest(id: number, requestId: number, status: 'APPROVED' | 'REJECTED'): Promise<void> {
  await http.put(`/v1/communities/${id}/join-requests/${requestId}`, { status })
}

export async function leaveCommunity(id: number, reason: string): Promise<{ left: boolean; pendingApproval: boolean }> {
  return unwrap(await http.post<ApiResult<{ left: boolean; pendingApproval: boolean }>>(`/v1/communities/${id}/leave`, { reason }))
}

export async function fetchCommunityLeaveRequests(id: number): Promise<CommunityLeaveRequest[]> {
  const result = unwrap(await http.get<ApiResult<CommunityLeaveRequest[]>>(`/v1/communities/${id}/leave-requests`))
  return Array.isArray(result) ? result : []
}

export async function reviewCommunityLeaveRequest(id: number, requestId: number, status: 'APPROVED' | 'REJECTED', reason = ''): Promise<void> {
  await http.put(`/v1/communities/${id}/leave-requests/${requestId}`, { status, reason })
}

export async function transferCommunityOwner(id: number, userId: number, reason: string): Promise<void> {
  await http.put(`/v1/communities/${id}/owner`, { userId, reason })
}

export async function dissolveCommunity(id: number, reason: string): Promise<void> {
  await http.delete(`/v1/communities/${id}`, { data: { reason } })
}

export async function moderateCommunityPost(postId: string, status: 'PUBLISHED' | 'BLOCKED' | 'DELETED'): Promise<void> {
  await http.put(`/v1/communities/posts/${postId}/status`, { status })
}

export async function fetchCommunityReportReasons(): Promise<CommunityReportReason[]> {
  const raw = unwrap(await http.get<ApiResult<unknown>>('/v1/communities/report-reasons'))
  const source = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { items?: unknown[] } | null)?.items)
      ? (raw as { items: unknown[] }).items
      : []
  return source
    .map((item, index) => {
      const value = (item || {}) as Record<string, unknown>
      return {
        code: String(value.code ?? value.reasonCode ?? value.reason_code ?? '').trim(),
        name: String(value.name ?? value.label ?? value.reasonName ?? value.reason_name ?? '').trim(),
        sortOrder: Number(value.sortOrder ?? value.sort_order ?? index),
      }
    })
    .filter((item) => item.code && item.name)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

export async function fetchCommunityMemberRemovalReasons(): Promise<CommunityMemberRemovalReason[]> {
  const raw = unwrap(await http.get<ApiResult<unknown>>('/v1/communities/member-removal-reasons'))
  const source = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { items?: unknown[] } | null)?.items)
      ? (raw as { items: unknown[] }).items
      : []
  return source
    .map((item, index) => {
      const value = (item || {}) as Record<string, unknown>
      return {
        code: String(value.code ?? '').trim(),
        name: String(value.name ?? '').trim(),
        sortOrder: Number(value.sortOrder ?? value.sort_order ?? index),
      }
    })
    .filter((item) => item.code && item.name)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

export async function reportCommunity(payload: CommunityReportPayload): Promise<void> {
  await http.post('/v1/communities/reports', {
    targetType: payload.targetType,
    targetId: payload.targetId,
    reasonCode: payload.reasonCode,
    detail: payload.detail?.trim() || '',
    evidenceUrls: payload.evidenceUrls || [],
    evidenceTypes: payload.evidenceTypes || [],
  })
}

function rawValue(raw: Record<string, any>, camel: string, snake: string) {
  return raw[camel] ?? raw[snake]
}

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (typeof value !== 'string' || !value.trim()) return []
  const source = value.trim()
  try {
    const parsed = JSON.parse(source)
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean)
  } catch {
    // Legacy rows used a single URL or Java's list string; retain both formats.
  }
  if (source.startsWith('[') && source.endsWith(']')) {
    return source.slice(1, -1).split(',').map((item) => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
  }
  return [source]
}

function mapComment(raw: Record<string, any>): MomentCommentItem {
  const replyToUserId = raw.replyToUserId ?? raw.reply_to_user_id
  const replyToNickname = raw.replyToNickname ?? raw.reply_to_nickname
  return {
    id: String(raw.id ?? ''),
    userId: String(raw.userId ?? raw.user_id ?? ''),
    nickname: raw.nickname || '用户',
    avatarUrl: resolveAvatarUrl(raw.avatarUrl ?? raw.avatar_url ?? ''),
    content: raw.content || '',
    replyToCommentId: raw.replyToCommentId != null ? String(raw.replyToCommentId) : raw.parent_id != null ? String(raw.parent_id) : undefined,
    replyToUserId: replyToUserId != null ? String(replyToUserId) : undefined,
    replyToNickname: replyToNickname || undefined,
    imageFileId: (raw.imageFileId ?? raw.image_file_id)
      ? String(raw.imageFileId ?? raw.image_file_id)
      : undefined,
    imageUrl: raw.imageFileId || raw.image_file_id ? undefined : raw.imageUrl ? resolveFileUrl(raw.imageUrl) : undefined,
    createdAt: raw.createdAt ?? raw.created_at ?? new Date().toISOString(),
    likeCount: Number(raw.likeCount ?? raw.like_count ?? 0),
    likedByMe: Boolean(raw.likedByMe ?? raw.liked_by_me),
  }
}

export function mapCommunityPost(raw: Record<string, any>): CommunityPost {
  const images = parseList(rawValue(raw, 'images', 'images')).map(resolveFileUrl)
  const originalImages = parseList(rawValue(raw, 'originalImages', 'original_images')).map(resolveFileUrl)
  const video = raw.video ? [resolveFileUrl(String(raw.video))] : []
  const mediaFileIds = parseList(rawValue(raw, 'mediaFileIds', 'media_file_ids')).map(String)
  const mediaCount = Math.max(images.length, video.length, mediaFileIds.length)
  const allImages = Array.from({ length: mediaCount }, (_, index) => mediaFileIds[index] ? fileDownloadUrl(mediaFileIds[index], 'thumb') : images[index] || video[index] || '')
  const normalizedOriginalImages = Array.from({ length: mediaCount }, (_, index) => mediaFileIds[index] ? fileDownloadUrl(mediaFileIds[index]) : originalImages[index] || allImages[index] || '')
  const mediaTypes = parseList(rawValue(raw, 'mediaTypes', 'media_types')).map((type) => type === 'video' ? 'video' : 'image') as Array<'image' | 'video'>
  const normalizedTypes = mediaTypes.length === allImages.length
    ? mediaTypes
    : allImages.map((url) => video.includes(url) ? 'video' : 'image')
  const quotedId = raw.quotedPostId ?? raw.quoted_post_id
  const quotedImages = parseList(raw.quotedImages ?? raw.quoted_images).map(resolveFileUrl)
  const quotedTypes = parseList(raw.quotedMediaTypes ?? raw.quoted_media_types).map((type) => type === 'video' ? 'video' : 'image') as Array<'image' | 'video'>
  const quotedMediaFileIds = parseList(raw.quotedMediaFileIds ?? raw.quoted_media_file_ids).map(String)
  const quotedVideo = raw.quotedVideo ?? raw.quoted_video
  const quotedPost = quotedId == null ? undefined : {
    id: String(quotedId),
    userId: String(raw.quotedUserId ?? raw.quoted_user_id ?? ''),
    nickname: String(raw.quotedNickname ?? raw.quoted_nickname ?? '用户'),
    content: String(raw.quotedContent ?? raw.quoted_content ?? ''),
    images: Array.from({ length: Math.max(quotedImages.length, quotedVideo ? 1 : 0, quotedMediaFileIds.length) }, (_, index) => quotedMediaFileIds[index] ? fileDownloadUrl(quotedMediaFileIds[index], 'thumb') : quotedImages[index] || (index === 0 && quotedVideo ? resolveFileUrl(String(quotedVideo)) : '')),
    mediaTypes: quotedTypes.length ? quotedTypes : quotedVideo || quotedMediaFileIds.length ? Array.from({ length: Math.max(quotedImages.length, quotedVideo ? 1 : 0, quotedMediaFileIds.length) }, (_, index) => index === 0 && quotedVideo ? 'video' as const : 'image' as const) : [],
    mediaFileIds: quotedMediaFileIds,
  }
  return {
    id: String(raw.id ?? ''),
    communityId: String(raw.communityId ?? raw.community_id ?? ''),
    userId: String(raw.userId ?? raw.user_id ?? ''),
    nickname: raw.nickname || '用户',
    avatarUrl: resolveAvatarUrl(raw.avatarUrl ?? raw.avatar_url ?? ''),
    content: raw.content || '',
    images: allImages,
    originalImages: normalizedOriginalImages,
    mediaTypes: normalizedTypes,
    mediaFileIds,
    locationName: raw.locationName ?? raw.location_name ?? undefined,
    locationAddress: raw.locationAddress ?? raw.location_address ?? undefined,
    latitude: raw.latitude != null ? Number(raw.latitude) : undefined,
    longitude: raw.longitude != null ? Number(raw.longitude) : undefined,
    status: raw.status || 'PUBLISHED',
    pinned: Boolean(raw.pinned),
    pinnedAt: raw.pinnedAt ?? raw.pinned_at ?? undefined,
    createdAt: raw.createdAt ?? raw.created_at ?? new Date().toISOString(),
    likeCount: Number(raw.likeCount ?? raw.like_count ?? 0),
    commentCount: Number(raw.commentCount ?? raw.comment_count ?? 0),
    forwardCount: Number(raw.forwardCount ?? raw.forward_count ?? 0),
    likedByMe: Boolean(raw.likedByMe ?? raw.liked_by_me),
    favoritedByMe: Boolean(raw.favoritedByMe ?? raw.favorited_by_me),
    mine: Boolean(raw.mine ?? raw.isMine ?? raw.is_mine),
    visibility: 0,
    mentionUserIds: [],
    mentionNicknames: [],
    visibleUserIds: [],
    visibleNicknames: [],
    mentionedMe: false,
    likeNicknames: [],
    likeUserIds: [],
    comments: Array.isArray(raw.comments) ? raw.comments.map(mapComment) : [],
    canDelete: Boolean(raw.canDelete ?? raw.can_delete),
    canAttemptDelete: Boolean(raw.canAttemptDelete ?? raw.can_attempt_delete),
    authorRole: String(raw.authorRole ?? raw.author_role ?? 'MEMBER').toUpperCase(),
    myRole: raw.myRole ?? raw.my_role ?? undefined,
    quotedPost,
  }
}

export async function fetchCommunityPosts(id: number): Promise<CommunityPost[]> {
  const result = unwrap(await http.get<ApiResult<Record<string, any>[]>>(`/v1/communities/${id}/posts`))
  return (Array.isArray(result) ? result : []).map(mapCommunityPost).filter((post) => !!post.id)
}

export interface CommunityManagePostQuery {
  keyword?: string
  startDate?: string
  endDate?: string
  sort?: 'LATEST' | 'LIKE_COUNT' | 'COMMENT_COUNT' | 'FORWARD_COUNT'
  page?: number
  size?: number
}

export async function fetchCommunityManagePosts(id: number, params: CommunityManagePostQuery = {}): Promise<CommunityPost[]> {
  const result = unwrap(await http.get<ApiResult<Record<string, any>[]>>(`/v1/communities/${id}/manage/posts`, { params }))
  return (Array.isArray(result) ? result : []).map(mapCommunityPost).filter((post) => !!post.id)
}

export interface CommunityManageReport {
  id: number
  target_type: string
  target_id: number
  reason: string
  reason_code?: string
  reason_name: string
  detail?: string
  status: string
  created_at: string
  reporter_name: string
  post_id?: number
  post_content?: string
  post_status?: string
  post_author_name?: string
  post_created_at?: string
}

export async function fetchCommunityManageReports(id: number, status = 'PENDING'): Promise<CommunityManageReport[]> {
  const result = unwrap(await http.get<ApiResult<{ items?: CommunityManageReport[] }>>(`/v1/communities/${id}/reports`, { params: { status, page: 1, size: 100 } }))
  return Array.isArray(result) ? result : result?.items || []
}

export async function moderateCommunityReportedPost(id: number, reportId: number, status: 'BLOCKED' | 'DELETED' = 'DELETED'): Promise<void> {
  await http.put(`/v1/communities/${id}/reports/${reportId}/post`, { status })
}

export async function fetchCommunityPost(postId: string): Promise<CommunityPost> {
  const result = unwrap(await http.get<ApiResult<Record<string, any>>>(`/v1/communities/posts/${postId}`))
  return mapCommunityPost(result || {})
}

export async function deleteCommunityPost(postId: string): Promise<void> {
  await http.delete(`/v1/communities/posts/${postId}`)
}

export async function forwardCommunityPost(postId: string, opinion = ''): Promise<{ id: string; status: string }> {
  const result = unwrap(await http.post<ApiResult<{ id: number | string; status: string }>>(`/v1/communities/posts/${postId}/forward`, { opinion }))
  return { id: String(result?.id ?? ''), status: String(result?.status ?? 'PUBLISHED') }
}

export async function setCommunityPostPinned(postId: string, pinned: boolean): Promise<{ pinned: boolean }> {
  const result = unwrap(await http.put<ApiResult<{ pinned?: boolean }>>(`/v1/communities/posts/${postId}/pin`, { pinned }))
  return { pinned: Boolean(result?.pinned ?? pinned) }
}

export interface CommunityPublishPayload {
  content: string
  images?: string[]
  originalImages?: string[]
  mediaTypes?: Array<'image' | 'video'>
  mediaFileIds?: string[]
  video?: string
  linkUrl?: string
  locationName?: string
  locationAddress?: string
  latitude?: number
  longitude?: number
}

export const publishPost = async (id: number, payload: CommunityPublishPayload | string) => {
  const value: CommunityPublishPayload = typeof payload === 'string' ? { content: payload } : payload
  return unwrap(await http.post<ApiResult<{ id: number; status: string }>>(`/v1/communities/${id}/posts`, {
    content: value.content || '',
    images: JSON.stringify(value.images || []),
    originalImages: JSON.stringify(value.originalImages || value.images || []),
    mediaTypes: JSON.stringify(value.mediaTypes || []),
    mediaFileIds: JSON.stringify(value.mediaFileIds || []),
    video: value.video,
    linkUrl: value.linkUrl,
    locationName: value.locationName,
    locationAddress: value.locationAddress,
    latitude: value.latitude,
    longitude: value.longitude,
  }))
}

export async function toggleCommunityLike(postId: string): Promise<{ liked: boolean; likeCount: number }> {
  return unwrap(await http.post<ApiResult<{ liked: boolean; likeCount: number }>>(`/v1/communities/posts/${postId}/like`))
}

export async function fetchCommunityComments(postId: string): Promise<MomentCommentItem[]> {
  const result = unwrap(await http.get<ApiResult<Record<string, any>[]>>(`/v1/communities/posts/${postId}/comments`))
  return (Array.isArray(result) ? result : []).map(mapComment)
}

export async function addCommunityComment(postId: string, payload: { content?: string; parentId?: string }): Promise<MomentCommentItem> {
  const result = unwrap(await http.post<ApiResult<Record<string, any>>>(`/v1/communities/posts/${postId}/comments`, {
    content: payload.content || '',
    parentId: payload.parentId ? Number(payload.parentId) : undefined,
  }))
  return mapComment(result || {})
}

export async function deleteCommunityComment(commentId: string): Promise<void> {
  await http.post(`/v1/communities/posts/comments/${commentId}/delete`)
}

export async function toggleCommunityCommentLike(commentId: string): Promise<{ liked: boolean; likeCount: number }> {
  const result = unwrap(await http.post<ApiResult<Record<string, unknown>>>(`/v1/communities/posts/comments/${commentId}/like`)) || {}
  return {
    liked: Boolean(result.liked ?? result.liked_by_me),
    likeCount: Number(result.likeCount ?? result.like_count ?? 0),
  }
}

export async function toggleCommunityFavorite(postId: string): Promise<{ favorited: boolean }> {
  return unwrap(await http.post<ApiResult<{ favorited: boolean }>>(`/v1/communities/posts/${postId}/favorite`))
}

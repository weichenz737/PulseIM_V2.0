import http, { type ApiResult } from './http'
import { extractChatFileId, fileDownloadUrl, resolveAvatarUrl, resolveFileUrl } from './file'

export interface MomentCommentItem {
  id: string
  userId: string
  nickname: string
  avatarUrl: string
  content: string
  replyToCommentId?: string
  replyToUserId?: string
  replyToNickname?: string
  /** 新版评论图片引用；图片本体不进入消息/评论数据。 */
  imageFileId?: string
  /** 旧评论兼容字段；新评论不再写入。 */
  imageUrl?: string
  createdAt: string
  likeCount?: number
  likedByMe?: boolean
}

export interface MomentItem {
  id: string
  userId: string
  mine?: boolean
  nickname: string
  avatarUrl: string
  content: string
  images: string[]
  originalImages: string[]
  mediaTypes: Array<'image' | 'video'>
  /** im_file.file_id，与媒体数组下标对应；旧动态可能为空。 */
  mediaFileIds?: string[]
  visibility: number
  mentionUserIds: string[]
  mentionNicknames: string[]
  visibleUserIds: string[]
  visibleNicknames: string[]
  locationName?: string
  locationAddress?: string
  latitude?: number
  longitude?: number
  /** 当前用户是否被提醒 */
  mentionedMe: boolean
  createdAt: string
  likeCount: number
  commentCount: number
  likedByMe: boolean
  favoritedByMe?: boolean
  likeNicknames: string[]
  likeUserIds: string[]
  comments: MomentCommentItem[]
}

export interface MomentsUpdate {
  count: number
  avatars: Array<{ userId: string; nickname: string; avatarUrl: string }>
}

export interface PublishMomentPayload {
  content: string
  images?: string[]
  originalImages?: string[]
  mediaTypes?: Array<'image' | 'video'>
  mediaFileIds?: string[]
  /** 0=好友可见 1=仅自己 2=选择好友可见（已取消所有人可见） */
  visibility?: number
  mentionUserIds?: string[]
  visibleUserIds?: string[]
  locationName?: string
  locationAddress?: string
  latitude?: number
  longitude?: number
}

interface BackendMomentVO {
  id: number | string
  userId: number | string
  mine?: boolean
  nickname: string
  avatarUrl?: string
  content: string
  images?: string[]
  originalImages?: string[]
  mediaTypes?: string[]
  mediaFileIds?: Array<string | number>
  visibility?: number
  mentionUserIds?: Array<number | string>
  mentionNicknames?: string[]
  visibleUserIds?: Array<number | string>
  visibleNicknames?: string[]
  locationName?: string
  locationAddress?: string
  latitude?: number
  longitude?: number
  mentionedMe?: boolean
  createdAt?: string
  likeCount?: number
  commentCount?: number
  likedByMe?: boolean
  favoritedByMe?: boolean
  likeNicknames?: string[]
  likeUserIds?: Array<number | string>
  comments?: Array<{
    id?: number | string
    userId?: number | string
    nickname?: string
    avatarUrl?: string
    content?: string
    replyToCommentId?: number | string | null
    replyToUserId?: number | string | null
    replyToNickname?: string | null
    imageFileId?: string | number | null
    imageUrl?: string | null
    createdAt?: string
    likeCount?: number
    likedByMe?: boolean
  }>
}

function mapComment(c: NonNullable<BackendMomentVO['comments']>[number]): MomentCommentItem {
  return {
    id: String(c.id ?? ''),
    userId: String(c.userId ?? ''),
    nickname: c.nickname || '用户',
    avatarUrl: resolveAvatarUrl(c.avatarUrl || ''),
    content: c.content || '',
    replyToCommentId: c.replyToCommentId != null ? String(c.replyToCommentId) : undefined,
    replyToUserId: c.replyToUserId != null ? String(c.replyToUserId) : undefined,
    replyToNickname: c.replyToNickname || undefined,
    imageFileId: c.imageFileId != null && String(c.imageFileId).trim() ? String(c.imageFileId) : undefined,
    imageUrl: c.imageFileId ? undefined : c.imageUrl ? resolveFileUrl(c.imageUrl) : undefined,
    createdAt: c.createdAt || new Date().toISOString(),
    likeCount: Number(c.likeCount || 0),
    likedByMe: !!c.likedByMe,
  }
}

function mapMoment(vo: BackendMomentVO): MomentItem {
  const id = vo.id != null && String(vo.id) !== 'undefined' ? String(vo.id) : ''
  const declaredMediaFileIds = (vo.mediaFileIds || []).map((value) => value == null ? '' : String(value).trim())
  const mediaCount = Math.max((vo.images || []).length, (vo.originalImages || []).length, declaredMediaFileIds.length)
  // Posts created before the fileId migration still contain an authenticated
  // download URL. Recover its file id so mobile can fetch it with a Bearer
  // header instead of assigning that protected URL directly to <img>.
  const mediaFileIds = Array.from({ length: mediaCount }, (_, index) => (
    declaredMediaFileIds[index]
      || extractChatFileId(resolveFileUrl(vo.images?.[index] || vo.originalImages?.[index] || ''))
      || ''
  ))
  const images = Array.from({ length: mediaCount }, (_, index) => resolveFileUrl(mediaFileIds[index]
    ? fileDownloadUrl(mediaFileIds[index], 'thumb')
    : vo.images?.[index] || ''))
  const originalImages = Array.from({ length: mediaCount }, (_, index) => resolveFileUrl(mediaFileIds[index]
    ? fileDownloadUrl(mediaFileIds[index])
    : vo.originalImages?.[index] || vo.images?.[index] || ''))
  const declaredMediaTypes = (vo.mediaTypes || []).map((type) => type === 'video' ? 'video' : type === 'image' ? 'image' : '')
  const mediaTypes = Array.from({ length: mediaCount }, (_, index) => {
    const declared = declaredMediaTypes[index]
    if (declared) return declared
    return isVideoUrl(vo.images?.[index] || vo.originalImages?.[index] || '') ? 'video' : 'image'
  })
  return {
    id,
    userId: vo.userId != null ? String(vo.userId) : '',
    mine: vo.mine === true,
    nickname: vo.nickname || '用户',
    avatarUrl: resolveAvatarUrl(vo.avatarUrl || ''),
    content: vo.content || '',
    images,
    originalImages,
    mediaTypes,
    mediaFileIds,
    visibility: vo.visibility ?? 0,
    mentionUserIds: (vo.mentionUserIds || []).map(String),
    mentionNicknames: vo.mentionNicknames || [],
    visibleUserIds: (vo.visibleUserIds || []).map(String),
    visibleNicknames: vo.visibleNicknames || [],
    locationName: vo.locationName || undefined,
    locationAddress: vo.locationAddress || undefined,
    latitude: vo.latitude,
    longitude: vo.longitude,
    mentionedMe: !!vo.mentionedMe,
    createdAt: vo.createdAt || new Date().toISOString(),
    likeCount: vo.likeCount ?? 0,
    commentCount: vo.commentCount ?? 0,
    likedByMe: !!vo.likedByMe,
    favoritedByMe: !!vo.favoritedByMe,
    likeNicknames: vo.likeNicknames || [],
    likeUserIds: (vo.likeUserIds || []).map(String),
    comments: (vo.comments || []).map(mapComment),
  }
}

export function isVideoUrl(url: string): boolean {
  const raw = (url || '').toLowerCase()
  const u = raw.split('?')[0]
  if (/\.(mp4|webm|mov|m4v|mkv|3gp)$/i.test(u)) return true
  if (raw.includes('video/') || raw.includes('/video')) return true
  // 部分上传路径无扩展名，靠 content 关键字兜底
  if (/[?&](ct|type)=video\//i.test(raw)) return true
  return false
}

/** 列表缩略：媒体片段帮助部分机型画出首帧 */
export function videoThumbSrc(url: string): string {
  if (!url) return url
  if (url.includes('#')) return url
  return `${url}#t=0.001`
}

export async function fetchMoments(): Promise<MomentItem[]> {
  const { data } = await http.get<ApiResult<BackendMomentVO[]>>('/v1/moments')
  const raw = Array.isArray(data.data) ? data.data : []
  return raw.map(mapMoment).filter((m) => !!m.id)
}

/** 查看指定用户的朋友圈（按可见性过滤） */
export async function fetchUserMoments(userId: string): Promise<MomentItem[]> {
  if (!userId) return []
  const { data } = await http.get<ApiResult<BackendMomentVO[]>>(`/v1/users/${userId}/moments`)
  const raw = Array.isArray(data.data) ? data.data : []
  return raw.map(mapMoment).filter((m) => !!m.id)
}

export async function publishMoment(payload: PublishMomentPayload): Promise<void> {
  await http.post<ApiResult<unknown>>('/v1/moments', {
    content: payload.content || '',
    images: payload.images || [],
    originalImages: payload.originalImages || payload.images || [],
    mediaTypes: payload.mediaTypes || (payload.images || []).map((url) => isVideoUrl(url) ? 'video' : 'image'),
    mediaFileIds: payload.mediaFileIds || [],
    visibility: payload.visibility ?? 0,
    mentionUserIds: (payload.mentionUserIds || []).map((id) => Number(id)),
    visibleUserIds: (payload.visibleUserIds || []).map((id) => Number(id)),
    locationName: payload.locationName,
    locationAddress: payload.locationAddress,
    latitude: payload.latitude,
    longitude: payload.longitude,
  })
}

export async function checkDynamicContent(content: string): Promise<void> {
  await http.post<ApiResult<unknown>>('/v1/moments/check-content', { content })
}

export async function fetchMomentsUpdates(): Promise<MomentsUpdate> {
  const { data } = await http.get<
    ApiResult<{
      count?: number
      avatars?: Array<{ userId?: number | string; nickname?: string; avatarUrl?: string }>
    }>
  >('/v1/moments/updates')
  const raw = data.data || {}
  return {
    count: raw.count || 0,
    avatars: (raw.avatars || []).map((a) => ({
      userId: String(a.userId ?? ''),
      nickname: a.nickname || '',
      avatarUrl: resolveAvatarUrl(a.avatarUrl || ''),
    })),
  }
}

export async function markMomentsSeen(): Promise<void> {
  await http.post('/v1/moments/seen')
}

export async function toggleMomentLike(id: string): Promise<MomentItem> {
  const { data } = await http.post<ApiResult<BackendMomentVO>>(`/v1/moments/${id}/like`)
  return mapMoment(data.data)
}

export async function toggleMomentFavorite(id: string): Promise<MomentItem> {
  const { data } = await http.post<ApiResult<BackendMomentVO>>(`/v1/moments/${id}/favorite`)
  return mapMoment(data.data)
}

export async function addMomentComment(
  id: string,
  payload: { content?: string; replyToCommentId?: string; imageFileId?: string; imageUrl?: string } | string,
): Promise<MomentCommentItem> {
  const body =
    typeof payload === 'string'
      ? { content: payload }
      : {
          content: payload.content || '',
          replyToCommentId: payload.replyToCommentId || undefined,
          imageFileId: payload.imageFileId || undefined,
          // Keep this only for clients/posts created before the fileId migration.
          imageUrl: payload.imageFileId ? undefined : payload.imageUrl || undefined,
        }
  const { data } = await http.post<ApiResult<NonNullable<BackendMomentVO['comments']>[number]>>(
    `/v1/moments/${id}/comments`,
    body,
  )
  return mapComment(data.data || {})
}

export async function deleteMomentComment(commentId: string): Promise<void> {
  await http.post(`/v1/moments/comments/${commentId}/delete`)
}

export async function deleteMoment(id: string): Promise<void> {
  await http.post(`/v1/moments/${id}/delete`)
}

export async function updateMomentVisibility(
  id: string,
  visibility: number,
  visibleUserIds: string[] = [],
): Promise<MomentItem> {
  const { data } = await http.put<ApiResult<BackendMomentVO>>(`/v1/moments/${id}/visibility`, {
    visibility,
    visibleUserIds: visibleUserIds.map((x) => Number(x)),
  })
  return mapMoment(data.data)
}

export interface MomentInteractionItem {
  id: string
  type: 'like' | 'comment' | 'reply' | 'mention' | string
  actorUserId: string
  actorNickname: string
  actorAvatarUrl: string
  postId: string
  commentId?: string
  summary: string
  postPreview: string
  isRead: boolean
  createdAt: string
}

interface BackendInteractionVO {
  id?: number | string
  type?: string
  actorUserId?: number | string
  actorNickname?: string
  actorAvatarUrl?: string
  postId?: number | string
  commentId?: number | string | null
  summary?: string
  postPreview?: string
  isRead?: boolean
  createdAt?: string
}

function mapInteraction(vo: BackendInteractionVO): MomentInteractionItem {
  return {
    id: String(vo.id ?? ''),
    type: vo.type || 'comment',
    actorUserId: String(vo.actorUserId ?? ''),
    actorNickname: vo.actorNickname || '用户',
    actorAvatarUrl: resolveAvatarUrl(vo.actorAvatarUrl || ''),
    postId: String(vo.postId ?? ''),
    commentId: vo.commentId != null ? String(vo.commentId) : undefined,
    summary: vo.summary || '',
    postPreview: vo.postPreview || '',
    isRead: !!vo.isRead,
    createdAt: vo.createdAt || new Date().toISOString(),
  }
}

export async function fetchMoment(id: string): Promise<MomentItem> {
  const { data } = await http.get<ApiResult<BackendMomentVO>>(`/v1/moments/${id}`)
  return mapMoment(data.data)
}

export async function fetchMomentInteractions(limit = 50): Promise<MomentInteractionItem[]> {
  const { data } = await http.get<ApiResult<BackendInteractionVO[]>>('/v1/moments/interactions', {
    params: { limit },
  })
  const raw = Array.isArray(data.data) ? data.data : []
  return raw.map(mapInteraction).filter((x) => !!x.id)
}

export async function fetchMomentInteractionUnreadCount(): Promise<number> {
  const { data } = await http.get<ApiResult<{ count?: number }>>('/v1/moments/interactions/unread-count')
  return Number(data.data?.count || 0)
}

export async function markMomentInteractionsRead(id?: string): Promise<void> {
  await http.post('/v1/moments/interactions/read', id ? { id: Number(id) } : {})
}

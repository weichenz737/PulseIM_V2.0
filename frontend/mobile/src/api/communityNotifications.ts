import http, { type ApiResult } from './http'
import { resolveAvatarUrl } from './file'

export const COMMUNITY_NOTIFICATIONS_UPDATED_EVENT = 'pulse:community-notifications-updated'

export type CommunityNotificationType =
  | 'LIKE'
  | 'COMMENT'
  | 'REPLY'
  | 'COMMENT_LIKE'
  | 'ADMIN_SET'
  | 'ADMIN_UNSET'
  | 'MEMBER_REMOVED'
  | 'POST_PINNED'
  | 'POST_UNPINNED'
  | 'POST_DELETED'
  | 'MEMBER_MUTED'
  | 'JOIN_APPROVED'
  | 'JOIN_REJECTED'
  | 'PROFILE_APPROVED'
  | 'PROFILE_REJECTED'
  | 'LEAVE_APPROVED'
  | 'LEAVE_REJECTED'
  | 'OWNER_TRANSFERRED'
  | 'REPORT_CREATED'
  | string

export interface CommunityNotification {
  id: string
  type: CommunityNotificationType
  title: string
  content: string
  postExcerpt: string
  unread: boolean
  readAt?: string
  createdAt: string
  communityId?: string
  communityName: string
  postId?: string
  commentId?: string
  actorId?: string
  actorNickname: string
  actorAvatar: string
  actorRole?: string
}

interface BackendCommunityNotification {
  id?: number | string
  type?: string
  title?: string
  content?: string
  summary?: string
  postExcerpt?: string
  post_excerpt?: string
  postPreview?: string
  post_preview?: string
  unread?: boolean | number | string
  isRead?: boolean | number | string
  is_read?: boolean | number | string
  readAt?: string | null
  read_at?: string | null
  createdAt?: string
  created_at?: string
  communityId?: number | string | null
  community_id?: number | string | null
  communityName?: string | null
  community_name?: string | null
  postId?: number | string | null
  post_id?: number | string | null
  commentId?: number | string | null
  comment_id?: number | string | null
  actorId?: number | string | null
  actor_id?: number | string | null
  actorNickname?: string | null
  actor_nickname?: string | null
  actorName?: string | null
  actor_name?: string | null
  nickname?: string | null
  actorRole?: string | null
  actor_role?: string | null
  actorAvatar?: string | null
  actor_avatar?: string | null
  actorAvatarUrl?: string | null
  actor_avatar_url?: string | null
  avatarUrl?: string | null
  avatar_url?: string | null
  avatar?: string | null
}

function optionalId(value: number | string | null | undefined): string | undefined {
  if (value == null || value === '') return undefined
  return String(value)
}

function booleanValue(value: boolean | number | string | undefined): boolean | undefined {
  if (value == null) return undefined
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (/^(true|1|yes)$/i.test(value)) return true
  if (/^(false|0|no)$/i.test(value)) return false
  return undefined
}

function mapNotification(raw: BackendCommunityNotification): CommunityNotification {
  const readAt = raw.readAt || raw.read_at || undefined
  const explicitUnread = booleanValue(raw.unread)
  const explicitRead = booleanValue(raw.isRead ?? raw.is_read)

  return {
    id: String(raw.id ?? ''),
    type: String(raw.type || '').trim().toUpperCase() || 'COMMENT',
    title: String(raw.title || ''),
    content: String(raw.content || raw.summary || ''),
    postExcerpt: String(raw.postExcerpt || raw.post_excerpt || raw.postPreview || raw.post_preview || ''),
    unread: explicitUnread ?? (explicitRead == null ? !readAt : !explicitRead),
    readAt,
    createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
    communityId: optionalId(raw.communityId ?? raw.community_id),
    communityName: String(raw.communityName ?? raw.community_name ?? ''),
    postId: optionalId(raw.postId ?? raw.post_id),
    commentId: optionalId(raw.commentId ?? raw.comment_id),
    actorId: optionalId(raw.actorId ?? raw.actor_id),
    actorNickname: String(
      raw.actorNickname ?? raw.actor_nickname ?? raw.actorName ?? raw.actor_name ?? raw.nickname ?? '',
    ),
    actorAvatar: resolveAvatarUrl(
      String(
        raw.actorAvatar ??
          raw.actor_avatar ??
          raw.actorAvatarUrl ??
          raw.actor_avatar_url ??
          raw.avatarUrl ??
          raw.avatar_url ??
          raw.avatar ??
          '',
      ),
    ),
    actorRole: String(raw.actorRole ?? raw.actor_role ?? '').trim().toUpperCase() || undefined,
  }
}

export async function fetchCommunityNotifications(): Promise<CommunityNotification[]> {
  const { data } = await http.get<
    ApiResult<BackendCommunityNotification[] | { items?: BackendCommunityNotification[] }>
  >('/v1/communities/notifications')
  const payload = data.data
  const items = Array.isArray(payload) ? payload : payload?.items || []
  return items.map(mapNotification).filter((item) => !!item.id)
}

export async function fetchCommunityNotificationUnreadCount(): Promise<number> {
  const { data } = await http.get<
    ApiResult<number | { unreadCount?: number; unread_count?: number; count?: number }>
  >('/v1/communities/notifications/unread-count')
  const payload = data.data
  const count =
    typeof payload === 'number'
      ? payload
      : Number(payload?.unreadCount ?? payload?.unread_count ?? payload?.count ?? 0)
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
}

export async function markCommunityNotificationsRead(): Promise<void> {
  await http.post('/v1/communities/notifications/read', {})
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(COMMUNITY_NOTIFICATIONS_UPDATED_EVENT, {
        detail: { unreadCount: 0 },
      }),
    )
  }
}

export async function deleteCommunityNotification(notificationId: string): Promise<void> {
  await http.delete(`/v1/communities/notifications/${notificationId}`)
}

import http, { type ApiResult } from './http'
import { mapCommunityPost, type CommunityPost } from './community'

export interface CommunityFavoriteItem extends CommunityPost {
  communityName: string
  favoritedAt?: string
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' ? value as Record<string, any> : {}
}

/** 圈子动态收藏统一展示在“我 → 我的收藏”中。 */
export async function fetchCommunityFavorites(): Promise<CommunityFavoriteItem[]> {
  const { data } = await http.get<ApiResult<unknown>>('/v1/communities/favorites')
  const payload = data.data
  const rows: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray(record(payload).items)
      ? record(payload).items as unknown[]
      : []

  return rows
    .map((value) => {
      const raw = record(value)
      const post = mapCommunityPost(record(raw.post).id != null ? record(raw.post) : raw)
      return {
        ...post,
        communityId: post.communityId || String(raw.communityId ?? raw.community_id ?? ''),
        communityName: String(raw.communityName ?? raw.community_name ?? '圈子'),
        favoritedAt: raw.favoritedAt ?? raw.favorited_at ?? undefined,
      }
    })
    .filter((item) => Boolean(item.id && item.communityId))
}

export async function removeCommunityFavorite(postId: string): Promise<void> {
  const { data } = await http.post<ApiResult<{ favorited: boolean }>>(
    `/v1/communities/posts/${postId}/favorite`,
  )
  if (data.data?.favorited) throw new Error('取消收藏失败，请重试')
}

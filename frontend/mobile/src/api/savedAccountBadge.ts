import { isTokenExpired } from './http'
import { API_BASE_URL, initializeServerOrigin } from '@/config/endpoints'
import type { SavedAccount } from '@/stores/accounts'
import {
  updateSavedAccountBadgeCount,
  updateSavedAccountUnreadCount,
} from '@/stores/accounts'

interface ApiEnvelope<T> {
  code?: number
  data?: T
}

interface RawConversation {
  id?: number | string
  type?: number | string
  peerUserId?: number | string
  unreadCount?: number | string
  archived?: boolean | number | string
  mute?: boolean | number | string
}

interface RawFriendRequests {
  pendingCount?: number | string
}

interface RawGroupNotifications {
  invites?: Array<{ id?: number | string; status?: number | string }>
  joinRequests?: Array<{ id?: number | string; status?: number | string }>
  pendingCount?: number | string
}

interface RawMomentsUpdates {
  count?: number | string
}

interface RawMomentInteractions {
  count?: number | string
}

function numberValue(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
}

function booleanValue(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  return /^(true|1|yes)$/i.test(String(value || ''))
}

function apiUrl(path: string): string {
  return `${API_BASE_URL.replace(/\/+$/, '')}${path}`
}

async function getWithToken<T>(token: string, path: string): Promise<T | null> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 8_000)
  try {
    const response = await fetch(apiUrl(path), {
      method: 'GET',
      cache: 'no-store',
      credentials: 'include',
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
    if (!response.ok) return null
    const body = await response.json() as ApiEnvelope<T>
    if (typeof body.code === 'number' && body.code !== 0) return null
    return body.data ?? null
  } catch {
    return null
  } finally {
    window.clearTimeout(timeout)
  }
}

function conversationUnread(account: SavedAccount, rows: RawConversation[]): number {
  const canonical = new Map<string, number>()
  for (const row of rows) {
    const type = Number(row.type) === 2 ? 'group' : 'personal'
    const peerId = row.peerUserId == null ? '' : String(row.peerUserId)
    // 与消息首页一致：不把“文件传输助手/自己”的会话计入底部角标。
    if (type === 'personal' && peerId === account.userId) continue
    if (booleanValue(row.archived) || booleanValue(row.mute)) continue
    const key = type === 'personal' && peerId
      ? `personal:${peerId}`
      : `conversation:${String(row.id ?? '')}`
    canonical.set(key, Math.max(canonical.get(key) || 0, numberValue(row.unreadCount)))
  }
  return [...canonical.values()].reduce((sum, count) => sum + count, 0)
}

function groupNotificationCount(payload: RawGroupNotifications): number {
  const pending = [...(payload.invites || []), ...(payload.joinRequests || [])]
    .filter((item) => numberValue(item.status) === 0)
    .length
  return pending || numberValue(payload.pendingCount)
}

async function refreshSavedAccountBadge(account: SavedAccount): Promise<void> {
  if (!account.token || isTokenExpired(account.token)) return

  const [conversations, friendRequests, groupNotifications, moments, interactions] =
    await Promise.all([
      getWithToken<RawConversation[]>(account.token, '/v1/conversations?filter=all'),
      getWithToken<RawFriendRequests>(account.token, '/v1/friend-requests'),
      getWithToken<RawGroupNotifications>(account.token, '/v1/user/group-notifications'),
      getWithToken<RawMomentsUpdates>(account.token, '/v1/moments/updates'),
      getWithToken<RawMomentInteractions>(account.token, '/v1/moments/interactions/unread-count'),
    ] as const)

  if (conversations) {
    updateSavedAccountUnreadCount(account.userId, conversationUnread(account, conversations))
  }

  // 消息接口是角标的核心来源。旧服务端或网络抖动导致其他接口失败时，
  // 保留旧的总角标字段，但仍写入最新消息未读数，切换页至少能显示消息角标。
  if (!conversations || !friendRequests || !groupNotifications || !moments || !interactions) return

  const total =
    conversationUnread(account, conversations) +
    numberValue(friendRequests.pendingCount) +
    groupNotificationCount(groupNotifications) +
    numberValue(moments.count) +
    numberValue(interactions.count)
  updateSavedAccountBadgeCount(account.userId, total)
}

export async function refreshSavedAccountBadges(accounts: SavedAccount[]): Promise<void> {
  if (accounts.length === 0) return
  await initializeServerOrigin()
  await Promise.all(accounts.map((account) => refreshSavedAccountBadge(account)))
}

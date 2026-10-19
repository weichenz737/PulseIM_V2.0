import http, { type ApiResult } from './http'
import { resolveAvatarUrl } from './file'

export interface SearchContactHit {
  userId: string
  nickname: string
  avatarUrl: string
  online: boolean
  subtitle?: string
  fileTransferAssistant?: boolean
}

export interface SearchGroupHit {
  id: string
  title: string
  avatarUrl: string
  memberCount: number
}

export interface SearchMessageHit {
  msgId: string
  conversationId: string
  conversationTitle: string
  conversationType: number
  fromNickname: string
  content: string
  msgType: number
  createdAt?: string
}

/** 按会话聚合的聊天记录命中（微信样式） */
export interface SearchConversationHit {
  conversationId: string
  conversationTitle: string
  conversationType: number
  avatarUrl: string
  matchCount: number
  preview: string
  latestMsgId: string
  latestMsgType: number
  createdAt?: string
}

export interface GlobalSearchResult {
  contacts: SearchContactHit[]
  groups: SearchGroupHit[]
  messages: SearchMessageHit[]
  conversations: SearchConversationHit[]
}

export async function globalSearch(keyword: string): Promise<GlobalSearchResult> {
  const { data } = await http.get<
    ApiResult<{
      contacts?: Array<{
        userId: number | string
        nickname: string
        avatarUrl?: string
        online?: boolean
        subtitle?: string
        fileTransferAssistant?: boolean
      }>
      groups?: Array<{
        id: number | string
        title: string
        avatarUrl?: string
        memberCount?: number
      }>
      messages?: Array<{
        msgId: string
        conversationId: number | string
        conversationTitle?: string
        conversationType?: number
        fromNickname?: string
        content?: string
        msgType?: number
        createdAt?: string
      }>
      conversations?: Array<{
        conversationId: number | string
        conversationTitle?: string
        conversationType?: number
        avatarUrl?: string
        matchCount?: number
        preview?: string
        latestMsgId?: string
        latestMsgType?: number
        createdAt?: string
      }>
    }>
  >('/v1/search', { params: { q: keyword } })

  const raw = data.data || {}
  const conversations: SearchConversationHit[] = (raw.conversations || []).map((c) => ({
    conversationId: String(c.conversationId),
    conversationTitle: c.conversationTitle || '聊天',
    conversationType: c.conversationType ?? 1,
    avatarUrl: resolveAvatarUrl(c.avatarUrl || ''),
    matchCount: c.matchCount || 0,
    preview: c.preview || '',
    latestMsgId: c.latestMsgId || '',
    latestMsgType: c.latestMsgType ?? 0,
    createdAt: c.createdAt,
  }))

  // 旧后端无 conversations 时，从前端按会话聚合 messages
  const messages: SearchMessageHit[] = (raw.messages || []).map((m) => ({
    msgId: m.msgId,
    conversationId: String(m.conversationId),
    conversationTitle: m.conversationTitle || '聊天',
    conversationType: m.conversationType ?? 1,
    fromNickname: m.fromNickname || '用户',
    content: m.content || '',
    msgType: m.msgType ?? 0,
    createdAt: m.createdAt,
  }))

  let convHits = conversations
  if (!convHits.length && messages.length) {
    const map = new Map<string, SearchConversationHit>()
    for (const m of messages) {
      const cur = map.get(m.conversationId)
      if (!cur) {
        map.set(m.conversationId, {
          conversationId: m.conversationId,
          conversationTitle: m.conversationTitle,
          conversationType: m.conversationType,
          avatarUrl: '',
          matchCount: 1,
          preview: m.content,
          latestMsgId: m.msgId,
          latestMsgType: m.msgType,
          createdAt: m.createdAt,
        })
      } else {
        cur.matchCount += 1
      }
    }
    convHits = Array.from(map.values())
  }

  return {
    contacts: (raw.contacts || []).map((c) => ({
      userId: String(c.userId),
      nickname: c.nickname || '用户',
      avatarUrl: resolveAvatarUrl(c.avatarUrl || ''),
      online: !!c.online,
      subtitle: c.subtitle || '',
      fileTransferAssistant: !!c.fileTransferAssistant,
    })),
    groups: (raw.groups || []).map((g) => ({
      id: String(g.id),
      title: g.title || '群聊',
      avatarUrl: resolveAvatarUrl(g.avatarUrl || ''),
      memberCount: g.memberCount || 0,
    })),
    messages,
    conversations: convHits,
  }
}

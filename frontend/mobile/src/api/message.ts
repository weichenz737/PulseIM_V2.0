import http, { type ApiResult } from './http'
import {
  fileDownloadUrl,
  inferMediaContentType,
  normalizeFileContentType,
  normalizeFileName,
  resolveAvatarUrl,
} from './file'
import { ensureWsReady, sendChatMessageAwaitAck } from '@/im/ws'
import { getToken } from './http'
import { formatBusinessPreview } from '@/utils/businessPreview'
import {
  queueFailedMessage,
  registerOutboxSender,
  type OutboxMessagePayload,
} from '@/im/messageOutbox'

export type MsgType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 // includes red packet, transfer, and moment favorites

export interface LocationPayload {
  latitude: number
  longitude: number
  name: string
  address: string
}

export function parseLocationPayload(content?: string | null): LocationPayload | null {
  if (!content) return null
  try {
    const value = JSON.parse(content) as Partial<LocationPayload>
    const latitude = Number(value.latitude)
    const longitude = Number(value.longitude)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
    return {
      latitude,
      longitude,
      name: String(value.name || value.address || '位置'),
      address: String(value.address || value.name || ''),
    }
  } catch {
    return null
  }
}

export interface FilePayload {
  url: string
  fileId?: string
  objectKey?: string
  thumbObjectKey?: string
  previewObjectKey?: string
  /** 原图/原视频 */
  originalUrl?: string
  /** 视频封面图 */
  thumbUrl?: string
  /** 中等清晰度图片/压缩视频预览 */
  previewUrl?: string
  name: string
  size?: number
  originalSize?: number
  contentType?: string
  sha256?: string
  width?: number
  height?: number
  /** 语音时长（毫秒） */
  durationMs?: number
  /** 兼容旧语音消息中已保存的转写文本 */
  transcript?: string
  /** 发送方勾选“原图/原视频”后保留该标记，接收方不再提示查看原图。 */
  originalSent?: boolean
}

export interface ContactCardPayload {
  /** user | group，缺省为 user */
  cardType?: 'user' | 'group' | 'community'
  userId?: string
  conversationId?: string
  communityId?: string
  nickname: string
  avatarUrl?: string
  pulseId?: string
  description?: string
  topic?: string
  memberCount?: number
  postCount?: number
  communityType?: 'FREE' | 'PAID'
  price?: number
}

export interface ForwardCardItem {
  msgId?: string
  fromUserId?: string
  fromNickname?: string
  msgType?: MsgType
  content?: string
  createdAt?: string
}

export interface ForwardCardPayload {
  title: string
  sourceTitle?: string
  count: number
  items: ForwardCardItem[]
}

export interface ChatMessage {
  id: string
  conversationId: string
  fromUserId: string
  fromNickname?: string
  fromAvatarUrl?: string
  toUserId: string
  content: string
  msgType: MsgType
  clientMsgId?: string
  createdAt?: string
  mine?: boolean
  recalled?: boolean
  replyToMsgId?: string
  replyToContent?: string
  replyToMsgType?: MsgType
  replyToNickname?: string
  replyToRecalled?: boolean
  mentionUserIds?: string[]
  atAll?: boolean
  mentionedMe?: boolean
  burnAfterRead?: boolean
  burnSeconds?: number
  burnReadAt?: string
  burnExpiresAt?: string
  autoDeleteExpiresAt?: string
  deliveryState?: 'sending' | 'queued' | 'sent' | 'failed'
  fileId?: string
}

interface BackendMessageVO {
  id: number | string
  conversationId: number | string
  fromUserId: number | string
  fromNickname?: string
  fromAvatarUrl?: string
  toUserId: number | string
  content: string
  /** Server keeps the original attachment JSON here while `content` is file:<id>. */
  rawContent?: string
  fileId?: string
  file?: Partial<FilePayload> & { downloadUrl?: string }
  msgType?: number
  clientMsgId?: string
  createdAt?: string
  recalled?: boolean
  replyToMsgId?: string
  replyToContent?: string
  replyToMsgType?: number
  replyToNickname?: string
  replyToRecalled?: boolean
  mentionUserIds?: Array<number | string>
  atAll?: boolean
  mentionedMe?: boolean
  burnAfterRead?: boolean
  burnSeconds?: number
  burnReadAt?: string
  burnExpiresAt?: string
  autoDeleteExpiresAt?: string
}

function mapMessage(vo: BackendMessageVO, myUserId: string): ChatMessage {
  const fromId = String(vo.fromUserId)
  // REST responses from newer servers carry the attachment in `file`, while
  // legacy rows can still only contain the JSON/file marker in `content`.
  // Normalize both shapes here so re-entering a chat cannot turn media back
  // into a generic file message.
  const isAttachment = [1, 2, 3].includes(Number(vo.msgType))
    || Boolean(vo.fileId || vo.file?.fileId)
  const contentFile = isAttachment ? parseFilePayload(vo.content) : null
  const rawContentFile = isAttachment ? parseFilePayload(vo.rawContent) : null
  const attachmentSource = {
    ...(contentFile || {}),
    ...(rawContentFile || {}),
    ...(vo.file || {}),
  }
  const file = isAttachment && (vo.fileId || vo.file?.fileId || rawContentFile?.fileId)
    ? normalizeBackendFile(vo.fileId, attachmentSource)
    : rawContentFile || contentFile
  return {
    id: String(vo.id),
    conversationId: String(vo.conversationId),
    fromUserId: fromId,
    fromNickname: vo.fromNickname || undefined,
    fromAvatarUrl: vo.fromAvatarUrl ? resolveAvatarUrl(vo.fromAvatarUrl) : undefined,
    toUserId: String(vo.toUserId),
    content: file ? JSON.stringify(file) : vo.content,
    msgType: normalizeMessageType(vo.msgType, vo.content, file),
    clientMsgId: vo.clientMsgId,
    createdAt: vo.createdAt,
    mine: fromId === myUserId,
    recalled: !!vo.recalled,
    replyToMsgId: vo.replyToMsgId || undefined,
    replyToContent: vo.replyToContent || undefined,
    replyToMsgType: vo.replyToMsgType != null ? (vo.replyToMsgType as MsgType) : undefined,
    replyToNickname: vo.replyToNickname || undefined,
    replyToRecalled: !!vo.replyToRecalled,
    mentionUserIds: (vo.mentionUserIds || []).map(String),
    atAll: !!vo.atAll,
    mentionedMe: !!vo.mentionedMe,
    burnAfterRead: !!vo.burnAfterRead,
    burnSeconds:
      vo.burnSeconds != null && Number.isFinite(Number(vo.burnSeconds))
        ? Number(vo.burnSeconds)
        : undefined,
    burnReadAt: vo.burnReadAt || undefined,
    burnExpiresAt: vo.burnExpiresAt || undefined,
    autoDeleteExpiresAt: vo.autoDeleteExpiresAt || undefined,
    fileId: file?.fileId || vo.fileId || undefined,
  }
}

/** Infer structured card message types for old rows/realtime payloads. */
export function normalizeMessageType(
  rawType: unknown,
  content?: string | null,
  file?: Pick<FilePayload, 'contentType' | 'name' | 'url'> | null,
): MsgType {
  const value = Number(rawType)
  const valid = rawType != null && rawType !== ''
    && Number.isInteger(value) && value >= 0 && value <= 10
  const attachment = file || parseFilePayload(content || '')
  const contentType = normalizeFileContentType(attachment?.contentType, attachment?.name || attachment?.url)
  const inferredType = inferMediaContentType(attachment?.name) || inferMediaContentType(attachment?.url)
  // An explicit message type is authoritative. In particular, an audio file
  // sent through the file picker is still msgType=2; only recorded voice
  // messages sent as msgType=3 should use the voice bubble.
  if (valid && value !== 0) {
    if (value === 2 && (contentType.startsWith('image/') || inferredType.startsWith('image/'))) return 1
    if (value === 2 && (contentType.startsWith('video/') || inferredType.startsWith('video/'))) return 2
    return value as MsgType
  }
  // A server-declared text message stays text even if its contents are a URL
  // or structured JSON. Only messages without a declared type use inference.
  if (valid && value === 0) return 0
  if (contentType.startsWith('image/') || inferredType.startsWith('image/')) return 1
  if (contentType.startsWith('video/') || inferredType.startsWith('video/')) return 2
  if (parseContactCard(content || '')) return 5
  if (parseLocationPayload(content)) return 6
  return (valid ? value : 0) as MsgType
}

function normalizeBackendFile(fileId?: string, raw?: Partial<FilePayload> & { downloadUrl?: string }): FilePayload {
  const id = String(fileId || raw?.fileId || '')
  const originalUrl = raw?.originalUrl || raw?.downloadUrl || (id ? fileDownloadUrl(id) : '')
  const name = normalizeFileName(raw?.name) || '文件'
  return {
    fileId: id || undefined,
    objectKey: raw?.objectKey,
    thumbObjectKey: raw?.thumbObjectKey,
    previewObjectKey: raw?.previewObjectKey,
    url: raw?.url || originalUrl,
    originalUrl,
    // Do not synthesize a rendition URL when the server did not create that
    // object. The API must not silently turn a thumbnail request into an
    // original-file download.
    thumbUrl: raw?.thumbUrl || (raw?.thumbObjectKey ? fileDownloadUrl(id, 'thumb') : undefined),
    previewUrl: raw?.previewUrl || (raw?.previewObjectKey ? fileDownloadUrl(id, 'preview') : undefined),
    name,
    size: raw?.size != null ? Number(raw.size) : undefined,
    originalSize: raw?.originalSize != null ? Number(raw.originalSize) : undefined,
    contentType: normalizeFileContentType(raw?.contentType, name || raw?.url || originalUrl),
    sha256: raw?.sha256,
    width: raw?.width != null ? Number(raw.width) : undefined,
    height: raw?.height != null ? Number(raw.height) : undefined,
    durationMs: raw?.durationMs != null ? Number(raw.durationMs) : undefined,
    originalSent: raw?.originalSent === true,
  }
}

/** Normalize file metadata carried by websocket messages into the same payload
 * shape used by REST messages and the chat bubbles. */
export function normalizeMessageFilePayload(
  fileId?: string,
  raw?: Partial<FilePayload> & { downloadUrl?: string },
): FilePayload {
  return normalizeBackendFile(fileId, raw)
}

export async function fetchMessages(
  conversationId: string,
  myUserId: string,
  options?: { after?: string; before?: string; limit?: number },
): Promise<ChatMessage[]> {
  const { data } = await http.get<ApiResult<BackendMessageVO[]>>(
    `/v1/conversations/${conversationId}/messages`,
    {
      params: {
        after: options?.after || undefined,
        before: options?.before || undefined,
        limit: options?.limit || undefined,
      },
    },
  )
  return (data.data || []).map((m) => mapMessage(m, myUserId))
}

export async function searchMessages(
  conversationId: string,
  keyword: string,
  myUserId: string,
  options?: {
    filter?: 'media' | 'file' | 'contact' | 'date' | string
    from?: string
    to?: string
  },
): Promise<ChatMessage[]> {
  const { data } = await http.get<ApiResult<BackendMessageVO[]>>(
    `/v1/conversations/${conversationId}/messages/search`,
    {
      params: {
        q: keyword || undefined,
        filter: options?.filter || undefined,
        from: options?.from || undefined,
        to: options?.to || undefined,
      },
    },
  )
  return (data.data || []).map((m) => mapMessage(m, myUserId))
}

export interface SendMessagePayload {
  conversationId: string
  toUserId?: string
  content: string
  clientMsgId: string
  replyToMsgId?: string
  msgType?: MsgType
  mentionUserIds?: string[]
  atAll?: boolean
  fromUserId?: string
  fileId?: string
}

async function postMessage(payload: SendMessagePayload): Promise<ChatMessage> {
  const { data } = await http.post<ApiResult<BackendMessageVO>>(
    `/v1/conversations/${payload.conversationId}/messages`,
    {
      content: payload.content,
      toUserId: payload.toUserId,
      clientMsgId: payload.clientMsgId,
      replyToMsgId: payload.replyToMsgId,
      msgType: payload.msgType ?? 0,
      mentionUserIds: (payload.mentionUserIds || []).map((id) => Number(id)),
      atAll: !!payload.atAll,
      fileId: payload.fileId,
    },
  )
  const vo = data.data
  return mapMessage(vo, String(vo.fromUserId))
}

function isTransientSendError(error: unknown) {
  const value = error as { status?: number; code?: string; message?: string }
  if (value.status != null) return value.status >= 500 || value.status === 408 || value.status === 429
  return (
    !navigator.onLine ||
    /network|timeout|连接|网络|WebSocket/i.test(String(value.message || value.code || ''))
  )
}

async function sendViaWebSocket(payload: SendMessagePayload): Promise<ChatMessage> {
  const ready = await ensureWsReady(getToken(), 6000)
  if (!ready) throw new Error('WebSocket 未连接')
  const ack = await sendChatMessageAwaitAck({
      conversationId: payload.conversationId,
      toUserId: payload.toUserId || '',
      content: payload.fileId ? `file:${payload.fileId}` : payload.content,
      clientMsgId: payload.clientMsgId,
      msgType: payload.msgType ?? 0,
      fileId: payload.fileId,
      replyToMsgId: payload.replyToMsgId,
      mentionUserIds: payload.mentionUserIds || [],
      atAll: !!payload.atAll,
  })
  return {
      id: ack.msgId || payload.clientMsgId,
      conversationId: payload.conversationId,
      fromUserId: payload.fromUserId || '',
      toUserId: payload.toUserId || '',
      content: payload.content,
      msgType: payload.msgType ?? 0,
      clientMsgId: payload.clientMsgId,
      createdAt: new Date().toISOString(),
      mine: true,
      fileId: payload.fileId,
      replyToMsgId: payload.replyToMsgId,
      mentionUserIds: payload.mentionUserIds,
      atAll: payload.atAll,
      deliveryState: 'sent',
  }
}

export async function sendTextMessage(payload: SendMessagePayload): Promise<ChatMessage> {
  try {
    // Business message types 7/8 still use their dedicated HTTP workflow;
    // regular text and all attachments use the metadata-only WS path.
    if ((payload.msgType ?? 0) > 6) return { ...(await postMessage(payload)), deliveryState: 'sent' }
    return await sendViaWebSocket(payload)
  } catch (error) {
    if (!isTransientSendError(error)) throw error
    queueFailedMessage(payload)
    return {
      id: payload.clientMsgId,
      conversationId: payload.conversationId,
      fromUserId: '',
      toUserId: payload.toUserId || '',
      content: payload.content,
      msgType: payload.msgType ?? 0,
      clientMsgId: payload.clientMsgId,
      createdAt: new Date().toISOString(),
      mine: true,
      replyToMsgId: payload.replyToMsgId,
      mentionUserIds: payload.mentionUserIds,
      atAll: payload.atAll,
      fileId: payload.fileId,
      deliveryState: 'queued',
    }
  }
}

registerOutboxSender((payload: OutboxMessagePayload) =>
  sendViaWebSocket({ ...payload, msgType: payload.msgType as MsgType | undefined }),
)

export function parseFilePayload(content?: string): FilePayload | null {
  if (!content) return null
  if (content.startsWith('file:')) {
    const fileId = content.slice('file:'.length).trim()
    return fileId ? normalizeBackendFile(fileId) : null
  }
  if (content.startsWith('http') || content.startsWith('/') || content.startsWith('data:')) {
    return { url: content, name: '文件' }
  }
  try {
    const raw = JSON.parse(content) as FilePayload
    if (!raw?.url && !raw?.fileId) return null
    const normalized = normalizeBackendFile(raw.fileId, raw)
    return {
      ...normalized,
      transcript: typeof raw.transcript === 'string' ? raw.transcript : undefined,
    }
  } catch {
    return null
  }
}

export function parseContactCard(content?: string): ContactCardPayload | null {
  if (!content) return null
  try {
    const raw = JSON.parse(content) as ContactCardPayload & { title?: string }
    if (raw.cardType === 'community' || raw.communityId != null) {
      if (raw.communityId == null || raw.communityId === '') return null
      return { cardType: 'community', communityId: String(raw.communityId), nickname: raw.nickname || raw.title || '圈子', avatarUrl: resolveAvatarUrl(raw.avatarUrl || ''), description: raw.description || '', topic: raw.topic || '', memberCount: Number(raw.memberCount || 0), postCount: Number(raw.postCount || 0), communityType: raw.communityType === 'PAID' ? 'PAID' : 'FREE', price: Number(raw.price || 0) }
    }
    const cardType = raw.cardType === 'group' ? 'group' : 'user'
    if (cardType === 'group') {
      const conversationId = raw.conversationId != null ? String(raw.conversationId) : ''
      if (!conversationId) return null
      return {
        cardType: 'group',
        conversationId,
        nickname: raw.nickname || raw.title || '群聊',
        avatarUrl: resolveAvatarUrl(raw.avatarUrl || ''),
      }
    }
    if (raw.userId == null || raw.userId === '') return null
    return {
      cardType: 'user',
      userId: String(raw.userId),
      nickname: raw.nickname || '用户',
      avatarUrl: resolveAvatarUrl(raw.avatarUrl || ''),
      pulseId: raw.pulseId,
    }
  } catch {
    return null
  }
}

export async function recallMessage(
  conversationId: string,
  msgId: string,
): Promise<ChatMessage> {
  const { data } = await http.post<ApiResult<BackendMessageVO>>(
    `/v1/conversations/${conversationId}/messages/${encodeURIComponent(msgId)}/recall`,
  )
  return mapMessage(data.data, String(data.data.fromUserId))
}

export async function deleteMessages(
  conversationId: string,
  msgIds: string[],
  mode: 'self' | 'both' = 'self',
): Promise<void> {
  await http.post(`/v1/conversations/${conversationId}/messages/delete`, { msgIds, mode })
}

export async function forwardMessages(
  conversationId: string,
  targetConversationIds: string[],
  msgIds: string[],
  mode: 'separate' | 'merge' = 'merge',
): Promise<number> {
  const { data } = await http.post<ApiResult<{ count: number }>>(
    `/v1/conversations/${conversationId}/messages/forward`,
    { targetConversationIds, msgIds, mode },
  )
  return data.data?.count || 0
}

export async function addFavorite(conversationId: string, msgId: string): Promise<void> {
  await http.post('/v1/favorites', { conversationId, msgId })
}

export interface FavoriteItem {
  id: string
  conversationId: string
  msgId: string
  msgType: MsgType
  content: string
  fileId?: string
  /** 朋友圈收藏的图片/视频地址（普通消息收藏为空） */
  images?: string[]
  /** image/video，与 images 下标一一对应 */
  mediaTypes?: string[]
  mediaFileIds?: string[]
  fromNickname?: string
  sourceTitle?: string
  createdAt?: string
}

export async function fetchFavorites(): Promise<FavoriteItem[]> {
  const { data } = await http.get<
    ApiResult<
      Array<{
        id: number | string
        conversationId: number | string
        msgId: string
        msgType?: number
        content: string
        fileId?: string
        images?: string[]
        mediaTypes?: string[]
        mediaFileIds?: string[]
        fromNickname?: string
        sourceTitle?: string
        createdAt?: string
      }>
    >
  >('/v1/favorites')
  return (data.data || []).map((f) => mapFavorite(f))
}

export async function fetchFavorite(id: string): Promise<FavoriteItem> {
  const { data } = await http.get<
    ApiResult<{
      id: number | string
      conversationId: number | string
      msgId: string
        msgType?: number
        content: string
        fileId?: string
        images?: string[]
        mediaTypes?: string[]
        mediaFileIds?: string[]
      fromNickname?: string
      sourceTitle?: string
      createdAt?: string
    }>
  >(`/v1/favorites/${id}`)
  if (!data.data) throw new Error('收藏不存在')
  return mapFavorite(data.data)
}

function mapFavorite(f: {
  id: number | string
  conversationId: number | string
  msgId: string
  msgType?: number
  content: string
  fileId?: string
  images?: string[]
  mediaTypes?: string[]
  mediaFileIds?: string[]
  fromNickname?: string
  sourceTitle?: string
  createdAt?: string
}): FavoriteItem {
  return {
    id: String(f.id),
    conversationId: String(f.conversationId),
    msgId: f.msgId,
    msgType: (f.msgType ?? 0) as MsgType,
    content: f.content,
    fileId: f.fileId ? String(f.fileId) : undefined,
    images: Array.isArray(f.images) ? f.images.map((url) => String(url)) : undefined,
    mediaTypes: Array.isArray(f.mediaTypes)
      ? f.mediaTypes.map((type) => String(type || '').toLowerCase())
      : undefined,
    mediaFileIds: Array.isArray(f.mediaFileIds) ? f.mediaFileIds.map((id) => String(id)) : undefined,
    fromNickname: f.fromNickname,
    sourceTitle: f.sourceTitle,
    createdAt: f.createdAt,
  }
}

export async function deleteFavorite(id: string): Promise<void> {
  await http.post(`/v1/favorites/${id}/delete`)
}

/** 转发收藏到一个或多个会话 */
export async function forwardFavorite(
  favoriteId: string,
  targetConversationIds: string[],
): Promise<number> {
  const { data } = await http.post<ApiResult<{ count: number }>>(
    `/v1/favorites/${favoriteId}/forward`,
    { targetConversationIds },
  )
  return data.data?.count || 0
}

/** 收藏/引用预览文案 */
export function favoritePreviewLabel(msgType: MsgType | number | undefined, content?: string): string {
  const t = (msgType ?? 0) as MsgType
  switch (t) {
    case 1:
      return '[图片]'
    case 2: {
      const f = parseFilePayload(content)
      if (f?.contentType?.startsWith('video/')) {
        return f.name ? `[视频] ${f.name}` : '[视频]'
      }
      return f?.name ? `[文件] ${f.name}` : '[文件]'
    }
    case 3: {
      const f = parseFilePayload(content)
      return f?.durationMs ? `[语音] ${formatVoiceDuration(f.durationMs)}` : '[语音]'
    }
    case 4: {
      const card = parseForwardCard(content)
      return card?.title ? `[聊天记录] ${card.title}` : '[聊天记录]'
    }
    case 5: {
      const c = parseContactCard(content)
      if (!c) return '[名片]'
      if (c.cardType === 'community') return `[圈子] ${c.nickname}`
      return c.cardType === 'group' ? `[群名片] ${c.nickname}` : `[名片] ${c.nickname}`
    }
    case 6: {
      const location = parseLocationPayload(content)
      if (!location) return '[位置]'
      return `[位置] ${location.name || location.address || '位置信息'}`
    }
    case 7: {
      const label = formatBusinessPreview(content)
      return label && label !== content ? label : '[红包]'
    }
    case 8: {
      const label = formatBusinessPreview(content)
      return label && label !== content ? label : '[转账]'
    }
    case 9:
      return content || '[群提示]'
    default: {
      if (!content) return ''
      // 旧收藏可能只存了预览文案
      if (content === '[图片]' || content.startsWith('[文件]') || content.startsWith('[语音]')) {
        return content
      }
      return content.length > 80 ? `${content.slice(0, 80)}…` : content
    }
  }
}

function formatVoiceDuration(ms?: number): string {
  if (!ms || ms < 0) return ''
  const sec = Math.max(1, Math.round(ms / 1000))
  return `${sec}"`
}

export function canRecallMessage(msg: ChatMessage, now = Date.now()): boolean {
  if (msg.recalled || !msg.mine) return false
  if (!msg.createdAt) return false
  const t = new Date(msg.createdAt).getTime()
  if (Number.isNaN(t)) return false
  return now - t <= 2 * 60 * 1000
}

export function parseForwardCard(content?: string): ForwardCardPayload | null {
  if (!content) return null
  try {
    const raw = JSON.parse(content) as ForwardCardPayload
    if (!raw || !Array.isArray(raw.items)) return null
    return {
      title: raw.title || '聊天记录',
      sourceTitle: raw.sourceTitle,
      count: raw.count || raw.items.length,
      items: raw.items.map((it) => ({
        msgId: it.msgId,
        fromUserId: it.fromUserId != null ? String(it.fromUserId) : undefined,
        fromNickname: it.fromNickname,
        msgType: (it.msgType ?? 0) as MsgType,
        content: it.content,
        createdAt: it.createdAt,
      })),
    }
  } catch {
    return null
  }
}

export function forwardItemPreview(item: ForwardCardItem): string {
  switch (item.msgType) {
    case 1:
      return '[图片]'
    case 2: {
      const f = parseFilePayload(item.content)
      return f?.name ? `[文件] ${f.name}` : '[文件]'
    }
    case 3:
      return '[语音]'
    case 4:
      return '[聊天记录]'
    case 5: {
      const c = parseContactCard(item.content)
      if (!c) return '[名片]'
      if (c.cardType === 'community') return `[圈子] ${c.nickname}`
      return c.cardType === 'group'
        ? `[群名片] ${c.nickname}`
        : `[名片] ${c.nickname}`
    }
    case 6: {
      const location = parseLocationPayload(item.content)
      return location ? `[位置] ${location.name || location.address || '位置信息'}` : '[位置]'
    }
    case 7:
    case 8: {
      const label = formatBusinessPreview(item.content)
      return label && label !== item.content ? label : (item.msgType === 7 ? '[红包]' : '[转账]')
    }
    case 9:
      return formatBusinessPreview(item.content) || '[系统消息]'
    default:
      return item.content || ''
  }
}

export function copyableText(msg: ChatMessage): string {
  if (msg.recalled) return ''
  if (msg.msgType === 4) {
    const card = parseForwardCard(msg.content)
    return card?.title || '[聊天记录]'
  }
  switch (msg.msgType) {
    case 1:
      return '[图片]'
    case 2: {
      const f = parseFilePayload(msg.content)
      return f?.name ? `[文件] ${f.name}` : '[文件]'
    }
    case 3:
      return '[语音]'
    case 5: {
      const c = parseContactCard(msg.content)
      if (!c) return '[名片]'
      if (c.cardType === 'community') return `[圈子] ${c.nickname}`
      return c.cardType === 'group'
        ? `[群名片] ${c.nickname}`
        : `[名片] ${c.nickname}`
    }
    default:
      return msg.content || ''
  }
}

export async function fetchMessage(
  conversationId: string,
  msgId: string,
  myUserId: string,
): Promise<ChatMessage> {
  const { data } = await http.get<ApiResult<BackendMessageVO>>(
    `/v1/conversations/${conversationId}/messages/${encodeURIComponent(msgId)}`,
  )
  return mapMessage(data.data, myUserId)
}

/**
 * Resolve a message before navigating to it from a secondary view such as
 * search, favorites, or storage. Recalled messages are still returned by the
 * API so the chat can render the recall tip, but they are not valid targets
 * for "定位到原消息".
 */
export async function fetchLocatableMessage(
  conversationId: string,
  msgId: string,
  myUserId = 'me',
): Promise<ChatMessage | null> {
  if (!conversationId || !msgId) return null
  try {
    const message = await fetchMessage(conversationId, msgId, myUserId)
    return message.recalled ? null : message
  } catch {
    return null
  }
}

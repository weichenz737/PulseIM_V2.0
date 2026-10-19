import http, { type ApiResult } from './http'

export interface AdminFileMetadata {
  fileId?: string
  url?: string
  originalUrl?: string
  thumbUrl?: string
  previewUrl?: string
  downloadUrl?: string
  name?: string
  size?: number
  contentType?: string
  durationMs?: number
}

export interface AdminMessage {
  id: number
  msgId?: string
  conversationId?: number
  conversationType?: number
  conversationTitle?: string
  fromUserId?: number
  fromNickname?: string
  fromPhone?: string
  fromPulseId?: string
  fromAvatarUrl?: string
  peerUserId?: number
  peerNickname?: string
  peerPhone?: string
  msgType?: number
  burnAfterRead?: boolean
  burnExpiresAt?: string
  autoDeleteExpiresAt?: string
  fileId?: string
  file?: AdminFileMetadata
  content?: string
  contentPreview?: string
  recalled?: boolean
  scheduledMessage?: boolean
  userDeleted?: boolean
  hideCount?: number
  replyToMsgId?: string
  sendTime?: string
  latitude?: number
  longitude?: number
  address?: string
}

export interface MessageListParams {
  page?: number
  size?: number
  conversationType: 1 | 2
  keyword?: string
  conversationId?: number | ''
  fromUserId?: number | ''
  msgType?: number | 'video' | 'file' | 'live-location' | ''
  /** video | file：区分 msgType=2 */
  mediaKind?: 'video' | 'file' | ''
  /** live-location：msgType=0 中的实时位置共享消息 */
  contentKind?: 'live-location' | ''
  recalled?: boolean | ''
  userDeleted?: boolean | ''
}

export interface MessageListResult {
  list: AdminMessage[]
  total: number
  page: number
  size: number
}

export interface MessageContextParams {
  conversationId: number
  anchorId?: number
  beforeId?: number
  afterId?: number
  before?: number
  after?: number
}

export interface MessageContextResult {
  list: AdminMessage[]
  conversationId: number
  conversationType: number
  conversationTitle?: string
  anchorId?: number | null
  hasMoreBefore?: boolean
  hasMoreAfter?: boolean
}

export async function fetchAdminMessages(params: MessageListParams): Promise<MessageListResult> {
  const { data } = await http.get<ApiResult<MessageListResult>>('/admin/messages', {
    params: {
      page: params.page ?? 1,
      size: params.size ?? 20,
      conversationType: params.conversationType,
      keyword: params.keyword || undefined,
      conversationId:
        params.conversationId === '' || params.conversationId === undefined
          ? undefined
          : params.conversationId,
      fromUserId:
        params.fromUserId === '' || params.fromUserId === undefined
          ? undefined
          : params.fromUserId,
      msgType:
        params.msgType === '' || params.msgType === undefined ? undefined : params.msgType,
      mediaKind:
        params.mediaKind === '' || params.mediaKind === undefined ? undefined : params.mediaKind,
      contentKind:
        params.contentKind === '' || params.contentKind === undefined ? undefined : params.contentKind,
      recalled:
        params.recalled === '' || params.recalled === undefined ? undefined : params.recalled,
      userDeleted:
        params.userDeleted === '' || params.userDeleted === undefined
          ? undefined
          : params.userDeleted,
    },
  })
  return data.data
}

export async function fetchMessageContext(params: MessageContextParams): Promise<MessageContextResult> {
  const { data } = await http.get<ApiResult<MessageContextResult>>('/admin/messages/context', {
    params: {
      conversationId: params.conversationId,
      anchorId: params.anchorId,
      beforeId: params.beforeId,
      afterId: params.afterId,
      before: params.before ?? 30,
      after: params.after ?? 30,
    },
  })
  return data.data
}

export async function deleteAdminMessages(ids: number[]): Promise<number> {
  const { data } = await http.post<ApiResult<{ deleted: number }>>('/admin/messages/batch-delete', {
    ids,
  })
  return data.data?.deleted ?? 0
}

/** 一键清空全部私聊(1)或群聊(2)记录 */
export async function clearAllAdminMessages(conversationType: 1 | 2): Promise<number> {
  const { data } = await http.post<ApiResult<{ deleted: number }>>('/admin/messages/clear-all', {
    conversationType,
  })
  return data.data?.deleted ?? 0
}

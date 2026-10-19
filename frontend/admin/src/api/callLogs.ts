import http, { type ApiResult } from './http'

export interface CallLog {
  id: number
  callId?: string
  conversationId?: number
  callerId?: number
  callerNickname?: string
  callerPhone?: string
  calleeId?: number
  calleeNickname?: string
  calleePhone?: string
  recorderId?: number
  reason?: string
  resultText?: string
  connected?: boolean
  durationSec?: number
  durationText?: string
  /** audio | video */
  mediaType?: string
  mediaTypeLabel?: string
  /** private | group */
  callType?: string
  groupTitle?: string
  participantCount?: number
  createdAt?: string
}

export interface CallLogParams {
  page?: number
  size?: number
  keyword?: string
  conversationId?: number | ''
  userId?: number | ''
  connected?: boolean | ''
  reason?: string | ''
  /** audio | video */
  mediaType?: string | ''
}

export interface CallLogListResult {
  list: CallLog[]
  total: number
  page: number
  size: number
}

export async function fetchCallLogs(params: CallLogParams): Promise<CallLogListResult> {
  const { data } = await http.get<ApiResult<CallLogListResult>>('/admin/call-logs', {
    params: {
      page: params.page ?? 1,
      size: params.size ?? 20,
      keyword: params.keyword || undefined,
      conversationId:
        params.conversationId === '' || params.conversationId === undefined
          ? undefined
          : params.conversationId,
      userId: params.userId === '' || params.userId === undefined ? undefined : params.userId,
      connected:
        params.connected === '' || params.connected === undefined ? undefined : params.connected,
      reason: params.reason || undefined,
      mediaType: params.mediaType || undefined,
    },
  })
  return data.data
}

export async function deleteCallLogs(ids: number[]): Promise<number> {
  const { data } = await http.post<ApiResult<{ deleted: number }>>('/admin/call-logs/batch-delete', {
    ids,
  })
  return data.data?.deleted ?? 0
}

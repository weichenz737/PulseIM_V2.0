import http, { type ApiResult } from './http'

export interface GroupMemberEvent {
  id: number
  conversationId?: number
  conversationTitle?: string
  userId?: number
  userNickname?: string
  userPhone?: string
  operatorId?: number
  operatorNickname?: string
  eventType: string
  source?: string
  message?: string
  reason?: string
  requestId?: number
  createdAt?: string
}

export interface GroupMemberEventParams {
  page?: number
  size?: number
  keyword?: string
  conversationId?: number | ''
  eventType?: string | ''
}

export interface GroupMemberEventListResult {
  list: GroupMemberEvent[]
  total: number
  page: number
  size: number
}

export async function fetchGroupMemberEvents(
  params: GroupMemberEventParams,
): Promise<GroupMemberEventListResult> {
  const { data } = await http.get<ApiResult<GroupMemberEventListResult>>('/admin/group-member-events', {
    params: {
      page: params.page ?? 1,
      size: params.size ?? 20,
      keyword: params.keyword || undefined,
      conversationId:
        params.conversationId === '' || params.conversationId === undefined
          ? undefined
          : params.conversationId,
      eventType: params.eventType || undefined,
    },
  })
  return data.data
}

export async function deleteGroupMemberEvents(ids: number[]): Promise<number> {
  const { data } = await http.post<ApiResult<{ deleted: number }>>(
    '/admin/group-member-events/batch-delete',
    { ids },
  )
  return data.data?.deleted ?? 0
}

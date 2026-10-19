import http, { type ApiResult } from './http'

export interface GroupOperationLog {
  id: number
  msgId?: string
  conversationId?: number
  conversationTitle?: string
  operatorId?: number
  operatorNickname?: string
  operatorPhone?: string
  opType?: string
  opTypeLabel?: string
  content?: string
  createdAt?: string
}

export interface GroupOperationLogParams {
  page?: number
  size?: number
  keyword?: string
  conversationId?: number | ''
  opType?: string | ''
}

export interface GroupOperationLogListResult {
  list: GroupOperationLog[]
  total: number
  page: number
  size: number
}

export async function fetchGroupOperationLogs(
  params: GroupOperationLogParams,
): Promise<GroupOperationLogListResult> {
  const { data } = await http.get<ApiResult<GroupOperationLogListResult>>('/admin/group-operation-logs', {
    params: {
      page: params.page ?? 1,
      size: params.size ?? 20,
      keyword: params.keyword || undefined,
      conversationId:
        params.conversationId === '' || params.conversationId === undefined
          ? undefined
          : params.conversationId,
      opType: params.opType || undefined,
    },
  })
  return data.data
}

export async function deleteGroupOperationLogs(ids: number[]): Promise<number> {
  const { data } = await http.post<ApiResult<{ deleted: number }>>(
    '/admin/group-operation-logs/batch-delete',
    { ids },
  )
  return data.data?.deleted ?? 0
}

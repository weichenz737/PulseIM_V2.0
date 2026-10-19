import http, { type ApiResult } from './http'

export interface GroupOwnerTransfer {
  id: number
  conversationId?: number
  conversationTitle?: string
  fromUserId?: number
  fromNickname?: string
  fromPhone?: string
  toUserId?: number
  toNickname?: string
  toPhone?: string
  operatorId?: number
  operatorNickname?: string
  operatorType?: string
  reason?: string
  createdAt?: string
}

export interface GroupOwnerTransferParams {
  page?: number
  size?: number
  keyword?: string
  conversationId?: number | ''
}

export interface GroupOwnerTransferListResult {
  list: GroupOwnerTransfer[]
  total: number
  page: number
  size: number
}

export async function fetchGroupOwnerTransfers(
  params: GroupOwnerTransferParams,
): Promise<GroupOwnerTransferListResult> {
  const { data } = await http.get<ApiResult<GroupOwnerTransferListResult>>(
    '/admin/group-owner-transfers',
    {
      params: {
        page: params.page ?? 1,
        size: params.size ?? 20,
        keyword: params.keyword || undefined,
        conversationId:
          params.conversationId === '' || params.conversationId === undefined
            ? undefined
            : params.conversationId,
      },
    },
  )
  return data.data
}

export async function deleteGroupOwnerTransfers(ids: number[]): Promise<number> {
  const { data } = await http.post<ApiResult<{ deleted: number }>>(
    '/admin/group-owner-transfers/batch-delete',
    { ids },
  )
  return data.data?.deleted ?? 0
}

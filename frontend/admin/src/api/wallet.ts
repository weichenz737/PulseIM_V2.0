import http, { type ApiResult } from './http'

export type MoneyRecord = Record<string, any>

export interface MoneyListResult {
  list: MoneyRecord[]
  total: number
  page: number
  size: number
}

export async function fetchRedPacketRecords(params: {
  conversationType: number
  packetType?: string
  keyword?: string
  page?: number
  size?: number
}): Promise<MoneyListResult> {
  const { data } = await http.get<ApiResult<MoneyListResult>>('/admin/wallet/red-packets', {
    params: {
      conversationType: params.conversationType,
      packetType: params.packetType || undefined,
      keyword: params.keyword || undefined,
      page: params.page ?? 1,
      size: params.size ?? 20,
    },
  })
  return data.data || { list: [], total: 0, page: 1, size: 20 }
}

export async function fetchTransferRecords(params: {
  conversationType: number
  keyword?: string
  page?: number
  size?: number
}): Promise<MoneyListResult> {
  const { data } = await http.get<ApiResult<MoneyListResult>>('/admin/wallet/transfers', {
    params: {
      conversationType: params.conversationType,
      keyword: params.keyword || undefined,
      page: params.page ?? 1,
      size: params.size ?? 20,
    },
  })
  return data.data || { list: [], total: 0, page: 1, size: 20 }
}

export async function fetchBalanceRecords(params: {
  userId?: number
  type?: string
  direction?: string
  keyword?: string
  page?: number
  size?: number
}): Promise<MoneyListResult> {
  const { data } = await http.get<ApiResult<MoneyListResult>>('/admin/wallet/transactions', {
    params: {
      userId: params.userId,
      type: params.type || undefined,
      direction: params.direction || undefined,
      keyword: params.keyword || undefined,
      page: params.page ?? 1,
      size: params.size ?? 20,
    },
  })
  return data.data || { list: [], total: 0, page: 1, size: 20 }
}

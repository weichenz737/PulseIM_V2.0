import http, { type ApiResult } from './http'

export interface AmountConfig {
  redPacketMaxAmount: number
  transferMaxAmount: number
  updatedAt?: string
}

export async function fetchAmountConfig(): Promise<AmountConfig> {
  const { data } = await http.get<ApiResult<AmountConfig>>('/admin/amount-config')
  return data.data
}

export async function updateAmountConfig(
  payload: Pick<AmountConfig, 'redPacketMaxAmount' | 'transferMaxAmount'>,
): Promise<AmountConfig> {
  const { data } = await http.put<ApiResult<AmountConfig>>('/admin/amount-config', payload)
  return data.data
}

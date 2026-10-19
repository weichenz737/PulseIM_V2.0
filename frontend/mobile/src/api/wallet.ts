import http, { type ApiResult } from './http'

export interface WalletSummary { balance: number; hasPaymentPassword: boolean }
export interface WalletAmountConfig {
  redPacketMaxCents: number
  transferMaxCents: number
}
export interface WalletTransaction {
  id: number; trade_no: string; direction: 'IN'|'OUT'; trade_type: 'RED_PACKET'|'TRANSFER'|'ADMIN_ADJUST'
  amount: number; balance_after: number; counterparty_user_id?: number; counterparty_name?: string
  conversation_id?: number; remark?: string; created_at: string
}
export async function fetchWallet(): Promise<WalletSummary> {
  const { data } = await http.get<ApiResult<WalletSummary>>('/v1/wallet'); return data.data
}

let cachedWalletAmountConfig: WalletAmountConfig | null = null

export async function fetchWalletAmountConfig(force = false): Promise<WalletAmountConfig> {
  if (!force && cachedWalletAmountConfig) return cachedWalletAmountConfig
  try {
    const { data } = await http.get<ApiResult<WalletAmountConfig>>('/v1/wallet/config')
    const config = {
      redPacketMaxCents: Number(data.data?.redPacketMaxCents || 20000),
      transferMaxCents: Number(data.data?.transferMaxCents || 1000000),
    }
    cachedWalletAmountConfig = config
    return config
  } catch {
    if (cachedWalletAmountConfig) return cachedWalletAmountConfig
    return { redPacketMaxCents: 20000, transferMaxCents: 1000000 }
  }
}
export async function setPaymentPassword(password: string, oldPassword?: string) {
  await http.put('/v1/wallet/payment-password', { password, oldPassword })
}
export async function resetPaymentPassword(code:string,password:string) {
  await http.post('/v1/wallet/payment-password/reset',{code,password})
}
export async function fetchWalletTransactions(params: {type?:string;from?:string;to?:string} = {}) {
  const { data } = await http.get<ApiResult<WalletTransaction[]>>('/v1/wallet/transactions', { params }); return data.data || []
}
export async function fetchWalletTransaction(id: string | number) {
  const { data } = await http.get<ApiResult<WalletTransaction>>(`/v1/wallet/transactions/${id}`)
  return data.data
}
export async function sendRedPacket(payload: {
  conversationId:string; packetType:string; targetUserId?:string; totalAmount:number
  count:number; greeting?:string; paymentPassword:string
}) {
  const { data } = await http.post<ApiResult<Record<string,unknown>>>('/v1/wallet/red-packets', payload); return data.data
}
export async function receiveRedPacket(no:string) {
  const { data } = await http.post<ApiResult<Record<string,unknown>>>(`/v1/wallet/red-packets/${no}/receive`); return data.data
}
export async function fetchRedPacket(no:string) {
  const { data } = await http.get<ApiResult<Record<string,unknown>>>(`/v1/wallet/red-packets/${no}`); return data.data
}
export async function sendTransfer(payload: {
  conversationId:string; receiverId:string; amount:number; remark?:string; paymentPassword:string
}) {
  const { data } = await http.post<ApiResult<Record<string,unknown>>>('/v1/wallet/transfers', payload); return data.data
}
export async function receiveTransfer(no:string) {
  const { data } = await http.post<ApiResult<Record<string,unknown>>>(`/v1/wallet/transfers/${no}/receive`)
  return data.data
}
export async function fetchTransfer(no:string) {
  const { data } = await http.get<ApiResult<Record<string,unknown>>>(`/v1/wallet/transfers/${no}`)
  return data.data
}
export const yuan = (cents?:number) => `¥${((Number(cents)||0)/100).toFixed(2)}`

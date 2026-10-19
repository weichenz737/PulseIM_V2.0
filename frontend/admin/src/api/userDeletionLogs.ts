import http, { type ApiResult } from './http'

export interface UserDeletionLog {
  id: number
  userId: number
  phone?: string
  pulseId?: string
  nickname?: string
  walletBalance?: number
  agreementTitle?: string
  createdAt?: string
}

export interface UserDeletionLogListResult {
  list: UserDeletionLog[]
  total: number
  page: number
  size: number
}

type RawUserDeletionLog = Partial<UserDeletionLog> & {
  user_id?: number
  pulse_id?: string
  wallet_balance?: number
  agreement_title?: string
  created_at?: string
}

export async function fetchUserDeletionLogs(params: {
  page?: number
  size?: number
  userId?: number | ''
  keyword?: string
}): Promise<UserDeletionLogListResult> {
  const { data } = await http.get<ApiResult<{
    list?: RawUserDeletionLog[]
    total?: number
    page?: number
    size?: number
  }>>('/admin/user-deletion-logs', {
    params: {
      page: params.page ?? 1,
      size: params.size ?? 20,
      userId: params.userId === '' || params.userId == null ? undefined : params.userId,
      keyword: params.keyword?.trim() || undefined,
    },
  })
  const result = data.data
  return {
    list: (result?.list ?? []).map((row) => ({
      id: Number(row.id),
      userId: Number(row.userId ?? row.user_id),
      phone: row.phone,
      pulseId: row.pulseId ?? row.pulse_id,
      nickname: row.nickname,
      walletBalance: Number(row.walletBalance ?? row.wallet_balance ?? 0),
      agreementTitle: row.agreementTitle ?? row.agreement_title,
      createdAt: row.createdAt ?? row.created_at,
    })),
    total: Number(result?.total ?? 0),
    page: Number(result?.page ?? params.page ?? 1),
    size: Number(result?.size ?? params.size ?? 20),
  }
}

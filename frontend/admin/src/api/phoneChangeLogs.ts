import http, { type ApiResult } from './http'

export interface UserPhoneChangeLog {
  id: number
  userId: number
  nickname?: string
  oldPhone?: string
  newPhone?: string
  createdAt?: string
}

export interface UserPhoneChangeLogListResult {
  list: UserPhoneChangeLog[]
  total: number
  page: number
  size: number
}

type RawPhoneChangeLog = Partial<UserPhoneChangeLog> & {
  user_id?: number
  old_phone?: string
  new_phone?: string
  created_at?: string
}

export async function fetchUserPhoneChangeLogs(params: {
  page?: number
  size?: number
  userId?: number | ''
}): Promise<UserPhoneChangeLogListResult> {
  const { data } = await http.get<ApiResult<{
    list?: RawPhoneChangeLog[]
    total?: number
    page?: number
    size?: number
  }>>('/admin/user-phone-change-logs', {
    params: {
      page: params.page ?? 1,
      size: params.size ?? 20,
      userId: params.userId === '' || params.userId == null ? undefined : params.userId,
    },
  })
  const result = data.data
  return {
    list: (result?.list ?? []).map((row) => ({
      id: Number(row.id),
      userId: Number(row.userId ?? row.user_id),
      nickname: row.nickname,
      oldPhone: row.oldPhone ?? row.old_phone,
      newPhone: row.newPhone ?? row.new_phone,
      createdAt: row.createdAt ?? row.created_at,
    })),
    total: Number(result?.total ?? 0),
    page: Number(result?.page ?? params.page ?? 1),
    size: Number(result?.size ?? params.size ?? 20),
  }
}

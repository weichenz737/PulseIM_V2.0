import http, { type ApiResult } from './http'

export interface LoginLog {
  id: number
  userId?: number
  phone?: string
  nickname?: string
  pulseId?: string
  loginType: string
  success: boolean
  failReason?: string
  ip?: string
  userAgent?: string
  deviceSummary?: string
  securityCodeChecked?: boolean | null
  newDevice?: boolean | null
  createdAt?: string
  /** 兼容后端在线/进入系统日志字段 */
  eventType?: string
  logType?: string
  onlineEvent?: boolean
  eventName?: string
}

export interface LoginLogParams {
  page?: number
  size?: number
  keyword?: string
  loginType?: string | ''
  success?: boolean | ''
  userId?: number | ''
  /** YYYY-MM-DD */
  from?: string
  /** YYYY-MM-DD */
  to?: string
}

export interface LoginLogListResult {
  list: LoginLog[]
  total: number
  page: number
  size: number
}

export async function fetchLoginLogs(params: LoginLogParams): Promise<LoginLogListResult> {
  const { data } = await http.get<ApiResult<LoginLogListResult>>('/admin/login-logs', {
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
    params: {
      page: params.page ?? 1,
      size: params.size ?? 20,
      keyword: params.keyword || undefined,
      loginType: params.loginType || undefined,
      success: params.success === '' || params.success === undefined ? undefined : params.success,
      userId: params.userId === '' || params.userId == null ? undefined : params.userId,
      from: params.from || undefined,
      to: params.to || undefined,
      _t: Date.now(),
    },
  })
  return data.data
}

export async function deleteLoginLogs(ids: number[]): Promise<number> {
  const { data } = await http.post<ApiResult<{ deleted: number }>>('/admin/login-logs/batch-delete', {
    ids,
  })
  return data.data?.deleted ?? 0
}

export async function clearAllLoginLogs(): Promise<number> {
  const { data } = await http.post<ApiResult<{ deleted: number }>>('/admin/login-logs/clear-all')
  return data.data?.deleted ?? 0
}

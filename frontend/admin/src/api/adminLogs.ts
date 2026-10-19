import http, { type ApiResult } from './http'

export interface AdminLoginLog {
  id: number
  adminId?: number
  username?: string
  success: boolean
  failReason?: string
  ip?: string
  userAgent?: string
  createdAt?: string
}

export interface AdminOperationLog {
  id: number
  adminId?: number
  username?: string
  module?: string
  moduleLabel?: string
  action?: string
  /** 可读操作说明 */
  summary?: string
  method?: string
  path?: string
  detail?: string
  ip?: string
  createdAt?: string
}

export interface AdminLogListResult<T> {
  list: T[]
  total: number
  page: number
  size: number
}

export async function fetchAdminLoginLogs(params: {
  page?: number
  size?: number
  keyword?: string
  success?: boolean | ''
}): Promise<AdminLogListResult<AdminLoginLog>> {
  const { data } = await http.get<ApiResult<AdminLogListResult<AdminLoginLog>>>('/admin/admin-login-logs', {
    headers: {
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
    params: {
      page: params.page ?? 1,
      size: params.size ?? 20,
      keyword: params.keyword || undefined,
      success: params.success === '' || params.success === undefined ? undefined : params.success,
      _t: Date.now(),
    },
  })
  return data.data
}

export async function deleteAdminLoginLogs(ids: number[]): Promise<number> {
  const { data } = await http.post<ApiResult<{ deleted: number }>>('/admin/admin-login-logs/batch-delete', {
    ids,
  })
  return data.data?.deleted ?? 0
}

export async function clearAllAdminLoginLogs(): Promise<number> {
  const { data } = await http.post<ApiResult<{ deleted: number }>>('/admin/admin-login-logs/clear-all')
  return data.data?.deleted ?? 0
}

export async function fetchAdminOperationLogs(params: {
  page?: number
  size?: number
  keyword?: string
  module?: string | ''
}): Promise<AdminLogListResult<AdminOperationLog>> {
  const { data } = await http.get<ApiResult<AdminLogListResult<AdminOperationLog>>>(
    '/admin/admin-operation-logs',
    {
      params: {
        page: params.page ?? 1,
        size: params.size ?? 20,
        keyword: params.keyword || undefined,
        module: params.module || undefined,
      },
    },
  )
  return data.data
}

export async function deleteAdminOperationLogs(ids: number[]): Promise<number> {
  const { data } = await http.post<ApiResult<{ deleted: number }>>(
    '/admin/admin-operation-logs/batch-delete',
    { ids },
  )
  return data.data?.deleted ?? 0
}

export async function clearAllAdminOperationLogs(): Promise<number> {
  const { data } = await http.post<ApiResult<{ deleted: number }>>(
    '/admin/admin-operation-logs/clear-all',
  )
  return data.data?.deleted ?? 0
}

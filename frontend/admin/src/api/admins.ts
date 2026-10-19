import http, { type ApiResult } from './http'
import { resolveAvatarUrl } from './files'

export interface AdminAccount {
  id: number
  username: string
  nickname?: string
  avatarUrl?: string
  status: number
  superAdmin?: boolean
  permissions?: string[]
  createdAt?: string
}

export interface PermissionItem {
  code: string
  label: string
  group?: string
}

export interface AdminListParams {
  page?: number
  size?: number
  keyword?: string
  status?: number | ''
}

export interface AdminListResult {
  list: AdminAccount[]
  total: number
  page: number
  size: number
}

export interface CreateAdminPayload {
  username: string
  password: string
  nickname?: string
  superAdmin?: boolean
  permissions?: string[]
  status?: number
}

export interface UpdateAdminPayload {
  nickname?: string
  superAdmin?: boolean
  permissions?: string[]
  status?: number
}

function mapAdmin(row: AdminAccount): AdminAccount {
  return {
    ...row,
    avatarUrl: resolveAvatarUrl(row.avatarUrl || '') || undefined,
    permissions: row.permissions || [],
  }
}

export async function fetchPermissionCatalog(): Promise<PermissionItem[]> {
  const { data } = await http.get<ApiResult<PermissionItem[]>>('/admin/permissions')
  return data.data ?? []
}

export async function fetchAdmins(params: AdminListParams): Promise<AdminListResult> {
  const { data } = await http.get<ApiResult<AdminListResult>>('/admin/admins', {
    params: {
      page: params.page ?? 1,
      size: params.size ?? 20,
      keyword: params.keyword || undefined,
      status: params.status === '' || params.status === undefined ? undefined : params.status,
    },
  })
  return {
    ...data.data,
    list: (data.data?.list || []).map(mapAdmin),
  }
}

export async function createAdmin(payload: CreateAdminPayload): Promise<AdminAccount> {
  const { data } = await http.post<ApiResult<AdminAccount>>('/admin/admins', payload)
  return mapAdmin(data.data)
}

export async function updateAdmin(id: number, payload: UpdateAdminPayload): Promise<AdminAccount> {
  const { data } = await http.put<ApiResult<AdminAccount>>(`/admin/admins/${id}`, payload)
  return mapAdmin(data.data)
}

export async function resetAdminPassword(id: number, password: string): Promise<void> {
  await http.put(`/admin/admins/${id}/password`, { password })
}

export async function deleteAdmin(id: number): Promise<void> {
  await http.delete(`/admin/admins/${id}`)
}

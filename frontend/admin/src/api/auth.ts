import http, { type ApiResult } from './http'
import { resolveAvatarUrl } from './files'

export interface AdminLoginPayload {
  username: string
  password: string
}

export interface AdminProfile {
  token?: string
  userId?: string
  username?: string
  nickname?: string
  avatarUrl?: string
  superAdmin?: boolean
  permissions?: string[]
}

export type AdminLoginResult = AdminProfile & { token: string }

interface BackendLoginVO {
  token?: string
  userId?: number | string
  username?: string
  nickname?: string
  avatarUrl?: string
  superAdmin?: boolean
  permissions?: string[]
}

function mapProfile(vo: BackendLoginVO, fallbackUsername?: string): AdminProfile {
  return {
    token: vo.token,
    userId: vo.userId != null ? String(vo.userId) : undefined,
    username: vo.username || fallbackUsername,
    nickname: vo.nickname,
    avatarUrl: resolveAvatarUrl(vo.avatarUrl || '') || undefined,
    superAdmin: !!vo.superAdmin,
    permissions: Array.isArray(vo.permissions) ? vo.permissions : [],
  }
}

export async function adminLogin(payload: AdminLoginPayload): Promise<AdminLoginResult> {
  const { data } = await http.post<ApiResult<BackendLoginVO>>('/admin/auth/login', payload)
  const mapped = mapProfile(data.data, payload.username)
  return {
    ...mapped,
    token: mapped.token || '',
  }
}

export async function fetchAdminProfile(): Promise<AdminProfile> {
  const { data } = await http.get<ApiResult<BackendLoginVO>>('/admin/profile')
  return mapProfile(data.data)
}

export async function updateAdminProfile(payload: {
  nickname?: string
  avatarUrl?: string
}): Promise<AdminProfile> {
  const { data } = await http.put<ApiResult<BackendLoginVO>>('/admin/profile', payload)
  return mapProfile(data.data)
}

export async function changeAdminPassword(payload: {
  oldPassword: string
  newPassword: string
}): Promise<void> {
  await http.put('/admin/profile/password', payload)
}

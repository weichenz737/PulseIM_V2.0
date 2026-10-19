import http, { type ApiResult } from './http'

export interface CallRingtone {
  id: number
  name: string
  url: string
  enabled: boolean
  isDefault: boolean
  sortOrder: number
  usageCount: number
  createdAt?: string
  updatedAt?: string
  users?: {
    list: CallRingtoneUser[]
    total: number
    page: number
    size: number
  }
}

export interface CallRingtoneUser {
  userId: number
  nickname: string
  avatarUrl: string
  pulseId: string
  phone: string
}

export async function fetchCallRingtones(params: {
  page?: number
  size?: number
  keyword?: string
}): Promise<{ list: CallRingtone[]; total: number }> {
  const { data } = await http.get<ApiResult<{ list: CallRingtone[]; total: number }>>(
    '/admin/call-ringtones',
    { params },
  )
  return data.data
}

export async function fetchCallRingtoneDetail(id: number): Promise<CallRingtone> {
  const { data } = await http.get<ApiResult<CallRingtone>>(`/admin/call-ringtones/${id}`)
  return data.data
}

export async function fetchCallRingtoneUsers(
  id: number,
  params?: { page?: number; size?: number },
): Promise<{ list: CallRingtoneUser[]; total: number }> {
  const { data } = await http.get<ApiResult<{ list: CallRingtoneUser[]; total: number }>>(
    `/admin/call-ringtones/${id}/users`,
    { params },
  )
  return data.data
}

export async function createCallRingtone(payload: {
  name: string
  url: string
  enabled?: boolean
  isDefault?: boolean
  sortOrder?: number
}): Promise<CallRingtone> {
  const { data } = await http.post<ApiResult<CallRingtone>>('/admin/call-ringtones', payload)
  return data.data
}

export async function updateCallRingtone(
  id: number,
  payload: Partial<{
    name: string
    url: string
    enabled: boolean
    isDefault: boolean
    sortOrder: number
  }>,
): Promise<CallRingtone> {
  const { data } = await http.put<ApiResult<CallRingtone>>(`/admin/call-ringtones/${id}`, payload)
  return data.data
}

export async function deleteCallRingtone(id: number): Promise<void> {
  await http.delete(`/admin/call-ringtones/${id}`)
}

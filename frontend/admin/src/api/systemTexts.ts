import http, { type ApiResult } from './http'

export type SystemTextKey = 'privacy_policy' | 'service_terms' | 'community_join_agreement' | 'community_create_agreement' | 'account_deletion_agreement'

export interface SystemText {
  key: SystemTextKey
  title: string
  content: string
  updatedAt?: string
}

export async function fetchSystemTexts(): Promise<SystemText[]> {
  const { data } = await http.get<ApiResult<SystemText[]>>('/admin/system-texts')
  return data.data
}

export async function updateSystemText(
  key: SystemTextKey,
  payload: Pick<SystemText, 'title' | 'content'>,
): Promise<SystemText> {
  const { data } = await http.put<ApiResult<SystemText>>(`/admin/system-texts/${key}`, payload)
  return data.data
}

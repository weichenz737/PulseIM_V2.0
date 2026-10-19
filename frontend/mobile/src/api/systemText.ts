import http, { type ApiResult } from './http'

export type SystemTextKey = 'privacy_policy' | 'service_terms' | 'community_join_agreement' | 'community_create_agreement' | 'account_deletion_agreement'

export interface SystemText {
  key: SystemTextKey
  title: string
  content: string
  updatedAt?: string
}

export async function fetchSystemText(key: SystemTextKey): Promise<SystemText> {
  const { data } = await http.get<ApiResult<SystemText>>(`/v1/system/texts/${key}`)
  return data.data
}

import http, { type ApiResult } from './http'

export interface NicknameConfig {
  userNicknameMaxLength: number
  communityNicknameMaxLength: number
  updatedAt?: string
}

export async function fetchNicknameConfig(): Promise<NicknameConfig> {
  const { data } = await http.get<ApiResult<NicknameConfig>>('/admin/nickname-config')
  return data.data
}

export async function updateNicknameConfig(
  payload: Pick<NicknameConfig, 'userNicknameMaxLength' | 'communityNicknameMaxLength'>,
): Promise<NicknameConfig> {
  const { data } = await http.put<ApiResult<NicknameConfig>>('/admin/nickname-config', payload)
  return data.data
}

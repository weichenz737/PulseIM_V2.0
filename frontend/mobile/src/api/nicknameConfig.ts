import http, { type ApiResult } from './http'

export interface NicknameConfig {
  userNicknameMaxLength: number
  communityNicknameMaxLength: number
}

export async function fetchNicknameConfig(): Promise<NicknameConfig> {
  const { data } = await http.get<ApiResult<NicknameConfig>>('/v1/config/nickname')
  return data.data
}

import http, { type ApiResult } from './http'
import { nativePlatform } from '@/native/platform'

export interface MapConfig {
  provider: 'baidu'
  configured: boolean
  ak: string
}

export async function getMapConfig() {
  const { data } = await http.get<ApiResult<MapConfig>>('/v1/config/map', {
    params: { platform: nativePlatform },
  })
  return data.data
}

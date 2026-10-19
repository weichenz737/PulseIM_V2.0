import http, { type ApiResult } from './http'

export interface MapConfig {
  provider: 'baidu'
  enabled: boolean
  ak: string
  appAk: string
  configured: boolean
  appConfigured: boolean
  source: 'database' | 'environment' | 'none'
  appSource: 'database' | 'environment' | 'none'
  updatedAt?: string
}

export async function fetchMapConfig(): Promise<MapConfig> {
  const { data } = await http.get<ApiResult<MapConfig>>('/admin/map-config')
  return data.data
}

export async function updateMapConfig(payload: Pick<MapConfig, 'enabled' | 'ak' | 'appAk'>): Promise<MapConfig> {
  const { data } = await http.put<ApiResult<MapConfig>>('/admin/map-config', payload)
  return data.data
}

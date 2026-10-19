import http, { type ApiResult } from './http'

export interface AppVersionConfig {
  versionCode: number
  versionName: string
  apkUrl: string
  apkName: string
  apkSize: number
  releaseNotes: string
  forceUpdate: boolean
  enabled: boolean
  updatedAt?: string
}

export async function fetchAppVersion(): Promise<AppVersionConfig> {
  const { data } = await http.get<ApiResult<AppVersionConfig>>('/admin/app-version')
  return data.data
}

export async function updateAppVersion(payload: AppVersionConfig): Promise<AppVersionConfig> {
  const { data } = await http.put<ApiResult<AppVersionConfig>>('/admin/app-version', payload)
  return data.data
}

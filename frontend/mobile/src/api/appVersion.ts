import http, { type ApiResult } from './http'

export interface AppVersionInfo {
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

export async function fetchLatestAppVersion(): Promise<AppVersionInfo> {
  const { data } = await http.get<ApiResult<AppVersionInfo>>('/v1/app-version/latest')
  return data.data
}

import http, { type ApiResult } from './http'

export interface FileConfig {
  maxSizeMb: number
  imageMaxSizeMb: number
  videoMaxSizeMb: number
  fileMaxSizeMb: number
  allowedExtensions: string[]
  updatedAt?: string
}

export async function fetchFileConfig(): Promise<FileConfig> {
  const { data } = await http.get<ApiResult<FileConfig>>('/admin/file-config')
  return data.data
}

export async function updateFileConfig(
  payload: Pick<FileConfig, 'imageMaxSizeMb' | 'videoMaxSizeMb' | 'fileMaxSizeMb' | 'allowedExtensions'>,
): Promise<FileConfig> {
  const { data } = await http.put<ApiResult<FileConfig>>('/admin/file-config', payload)
  return data.data
}

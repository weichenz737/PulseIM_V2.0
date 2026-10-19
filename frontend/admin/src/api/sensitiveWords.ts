import http, { type ApiResult } from './http'

export interface PageResult<T> {
  list: T[]
  total: number
  page: number
  size: number
}

export interface SensitiveWord {
  id: number
  word: string
  enabled: boolean
  created_at: string
  updated_at: string
}

export async function fetchSensitiveWords(params: Record<string, unknown>) {
  const { data } = await http.get<ApiResult<PageResult<SensitiveWord>>>('/admin/sensitive-words', {
    params,
  })
  return data.data
}

export async function createSensitiveWord(payload: { word: string; enabled: boolean }) {
  const { data } = await http.post<ApiResult<SensitiveWord>>('/admin/sensitive-words', payload)
  return data.data
}

export async function updateSensitiveWord(
  id: number,
  payload: { word: string; enabled: boolean },
) {
  const { data } = await http.put<ApiResult<SensitiveWord>>(`/admin/sensitive-words/${id}`, payload)
  return data.data
}

export async function deleteSensitiveWord(id: number) {
  await http.delete(`/admin/sensitive-words/${id}`)
}

export async function batchImportSensitiveWords(payload: { text: string; enabled: boolean }) {
  const { data } = await http.post<
    ApiResult<{ inserted: number; skipped: number; total: number }>
  >('/admin/sensitive-words/batch', payload)
  return data.data
}

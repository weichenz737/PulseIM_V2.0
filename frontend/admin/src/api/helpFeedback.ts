import http, { type ApiResult } from './http'

export interface PageResult<T> { list: T[]; total: number; page: number; size: number }
export interface HelpFaq {
  id: number
  title: string
  answer: string
  sort_order: number
  enabled: boolean
  created_at: string
  updated_at: string
}
export interface UserFeedback {
  id: number
  user_id: number
  nickname?: string
  phone?: string
  pulse_id?: string
  content: string
  image_urls: string[]
  status: 'pending' | 'processing' | 'replied' | 'closed'
  reply?: string
  replied_at?: string
  created_at: string
  updated_at: string
}

export async function fetchHelpFaqs(params: Record<string, unknown>) {
  const { data } = await http.get<ApiResult<PageResult<HelpFaq>>>('/admin/help-faqs', { params })
  return data.data
}
export async function createHelpFaq(payload: Record<string, unknown>) {
  const { data } = await http.post<ApiResult<HelpFaq>>('/admin/help-faqs', payload)
  return data.data
}
export async function updateHelpFaq(id: number, payload: Record<string, unknown>) {
  const { data } = await http.put<ApiResult<HelpFaq>>(`/admin/help-faqs/${id}`, payload)
  return data.data
}
export async function deleteHelpFaq(id: number) {
  await http.delete(`/admin/help-faqs/${id}`)
}
export async function fetchUserFeedback(params: Record<string, unknown>) {
  const { data } = await http.get<ApiResult<PageResult<UserFeedback>>>('/admin/user-feedback', { params })
  return data.data
}
export async function updateUserFeedback(id: number, payload: { status: string; reply: string }) {
  const { data } = await http.put<ApiResult<UserFeedback>>(`/admin/user-feedback/${id}`, payload)
  return data.data
}

import http, { type ApiResult } from './http'

export interface HelpQuestion {
  id: string
  question: string
  answer: string
  category?: string
  sortOrder?: number
  updatedAt?: string
}

function normalizeQuestion(value: Record<string, unknown>): HelpQuestion {
  return {
    id: String(value.id ?? ''),
    question: String(value.question ?? value.title ?? ''),
    answer: String(value.answer ?? value.content ?? ''),
    category: value.category ? String(value.category) : undefined,
    sortOrder: value.sortOrder == null ? undefined : Number(value.sortOrder),
    updatedAt: value.updatedAt ? String(value.updatedAt) : undefined,
  }
}

export async function fetchHelpQuestions(): Promise<HelpQuestion[]> {
  const { data } = await http.get<ApiResult<Record<string, unknown>[] | { list?: Record<string, unknown>[] }>>(
    '/v1/help/questions',
  )
  const payload = data.data
  const list = Array.isArray(payload) ? payload : payload?.list || []
  return list.map(normalizeQuestion).filter((item) => item.id && item.question)
}

export async function fetchHelpQuestion(id: string): Promise<HelpQuestion> {
  const { data } = await http.get<ApiResult<Record<string, unknown>>>(
    `/v1/help/questions/${encodeURIComponent(id)}`,
  )
  return normalizeQuestion(data.data)
}

export async function submitUserFeedback(content: string, imageUrls: string[]): Promise<void> {
  await http.post<ApiResult<unknown>>('/v1/help/feedback', {
    content,
    imageUrls,
  })
}

import http, { type ApiResult } from './http'

function rawFilenameFromUrl(url: string): string | null {
  const m = String(url || '').match(/\/files\/raw\/([^/?#]+)/i)
  return m?.[1] ? decodeURIComponent(m[1]) : null
}

/** 服务端语音转文字 */
export async function transcribeVoiceOnServer(sourceUrl: string): Promise<string> {
  const fileMatch = String(sourceUrl || '').match(/\/files\/([^/?#]+)\/(?:download|preview)(?:[/?#]|$)/i)
  if (fileMatch?.[1]) {
    const { data } = await http.post<ApiResult<{ text?: string }>>(
      '/v1/files/audio/transcribe-file',
      { fileId: decodeURIComponent(fileMatch[1]) },
      { timeout: 180000 },
    )
    const text = (data.data?.text || '').trim()
    if (!text) throw new Error('未能识别出文字')
    return text
  }
  const filename = rawFilenameFromUrl(sourceUrl)
  if (!filename) {
    throw new Error('语音文件地址无效')
  }
  const { data } = await http.post<ApiResult<{ text?: string }>>(
    '/v1/files/audio/transcribe',
    { url: `/api/v1/files/raw/${filename}` },
    { timeout: 180000 },
  )
  const text = (data.data?.text || '').trim()
  if (!text) throw new Error('未能识别出文字')
  return text
}

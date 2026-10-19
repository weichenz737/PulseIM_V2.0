import http, { type ApiResult } from './http'

const deployPrefix = (import.meta.env.VITE_DEPLOY_PREFIX || '').replace(/\/+$/, '')
const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || (deployPrefix ? `${deployPrefix}/api` : '/api')
).replace(/\/+$/, '')

export interface UploadedFile {
  url: string
  name: string
  size: number
  contentType: string
  versionCode?: number
  versionName?: string
}

export async function uploadAdminAvatar(file: File): Promise<UploadedFile> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await http.post<ApiResult<UploadedFile>>('/admin/files/avatar', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000,
  })
  const f = data.data
  return {
    url: f.url,
    name: f.name || file.name,
    size: Number(f.size || file.size || 0),
    contentType: f.contentType || file.type || 'image/jpeg',
  }
}

export async function uploadAdminRingtone(file: File): Promise<UploadedFile> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await http.post<ApiResult<UploadedFile>>('/admin/files/ringtone', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  })
  const f = data.data
  return {
    url: f.url,
    name: f.name || file.name,
    size: Number(f.size || file.size || 0),
    contentType: f.contentType || file.type || 'audio/mpeg',
  }
}

export async function uploadAppApk(file: File): Promise<UploadedFile> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await http.post<ApiResult<UploadedFile>>('/admin/files/app-apk', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 10 * 60 * 1000,
  })
  return data.data
}

/** 将相对上传地址转为可访问 URL（管理端走 Vite /api 代理） */
export function resolveFileUrl(url?: string): string {
  if (!url) return ''
  let u = String(url).trim()
  if (!u) return ''
  if (u.startsWith('data:') || u.startsWith('blob:')) return u
  if (/^https?:\/\//i.test(u)) {
    try {
      const parsed = new URL(u)
      const path = parsed.pathname + parsed.search
      if (path.startsWith('/api/') || path.startsWith('/v1/')) {
        u = path
      } else {
        return u
      }
    } catch {
      return u
    }
  }
  // 允许已经解析过的 /pulseim/api 或自定义 API_BASE_URL 地址再次传入。
  if (u === API_BASE_URL || u.startsWith(`${API_BASE_URL}/`)) return u
  if (u.startsWith('/api/')) return `${API_BASE_URL}${u.slice('/api'.length)}`
  if (u.startsWith('/')) return `${API_BASE_URL}${u}`
  return u
}

/**
 * 读取需要后台权限的媒体文件。
 *
 * <img>/<video>/<audio> 不能像 Axios 一样自动附带 Authorization，
 * 所以后台页面先用现有 HTTP 客户端下载 Blob，再交给媒体标签展示。
 */
export async function fetchAdminMediaBlob(url: string): Promise<Blob> {
  const raw = String(url || '').trim()
  const resolved = raw === API_BASE_URL || raw.startsWith(`${API_BASE_URL}/`)
    ? raw
    : resolveFileUrl(raw)
  if (!resolved) throw new Error('媒体地址为空')

  // 使用绝对同源地址，避免部署在 /pulseim 时被 Axios baseURL 再拼接一次前缀。
  const requestUrl = /^https?:\/\//i.test(resolved)
    ? resolved
    : new URL(resolved, window.location.origin).toString()
  const { data } = await http.get<Blob>(requestUrl, {
    responseType: 'blob',
    timeout: 120000,
  })
  if (!(data instanceof Blob) || data.size <= 0 || /^(application\/json|text\/plain)/i.test(data.type || '')) {
    throw new Error('媒体文件为空')
  }
  return data
}

/** Build the admin-only file endpoint used for protected moment/community media. */
export function adminMediaUrl(
  fileId: string,
  variant: 'thumb' | 'preview' | 'original' = 'original',
  scope: 'moments' | 'communities/content' | 'messages' = 'moments',
): string {
  const id = String(fileId || '').trim()
  if (!id) return ''
  return `${API_BASE_URL}/admin/${scope}/files/${encodeURIComponent(id)}?variant=${encodeURIComponent(variant)}`
}

/** 使用服务端生成并长期缓存的 128px 头像预览，避免列表下载原始大图。 */
export function resolveAvatarUrl(url?: string): string {
  const resolved = resolveFileUrl(url)
  if (!resolved) return resolved
  try {
    const parsed = new URL(resolved, window.location.origin)
    // 用户头像历史上复用了聊天文件下载地址；后台 Token 是 ADMIN
    // 角色，不能直接访问 /api/v1/files/{id}/download。改用受引用保护
    // 的公开头像缩略图，列表和详情都显示真实头像。
    const protectedAvatar = parsed.pathname.match(/^(.*\/v1)\/files\/([^/]+)\/download\/?$/)
    if (protectedAvatar?.[1] && protectedAvatar[2]) {
      const avatarPath = `${protectedAvatar[1]}/files/${encodeURIComponent(protectedAvatar[2])}/avatar`
      return parsed.origin === window.location.origin ? avatarPath : `${parsed.origin}${avatarPath}`
    }
    if (!parsed.pathname.includes('/files/raw/')) return resolved
    const separator = resolved.includes('?') ? '&' : '?'
    return `${resolved}${separator}avatar=1`
  } catch {
    return resolved
  }
}

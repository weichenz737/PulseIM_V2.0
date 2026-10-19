import http, { type ApiResult } from './http'
import { absoluteApiUrl, SERVER_ORIGIN } from '@/config/endpoints'

export interface UploadedFile {
  fileId?: string
  objectKey?: string
  thumbObjectKey?: string
  previewObjectKey?: string
  url: string
  /** 原图/原视频 URL（与 url 不同时存在） */
  originalUrl?: string
  /** 视频封面 */
  thumbUrl?: string
  /** 中等清晰度图片/压缩视频预览 */
  previewUrl?: string
  name: string
  /** 预览文件大小 */
  size: number
  /** 原文件大小 */
  originalSize?: number
  contentType: string
  sha256?: string
  width?: number
  height?: number
  durationMs?: number
  downloadUrl?: string
}

const GENERIC_CONTENT_TYPES = new Set([
  '',
  'application/octet-stream',
  'binary/octet-stream',
  'application/force-download',
  'application/download',
])

/** 根据手机文件名补齐相机/相册经常缺失的 MIME 类型。 */
export function inferMediaContentType(name?: string): string {
  const raw = String(name || '').split(/[?#]/, 1)[0].replace(/\\/g, '/').split('/').pop() || ''
  const dot = raw.lastIndexOf('.')
  if (dot < 0) return ''
  switch (raw.slice(dot + 1).toLowerCase()) {
    case 'jpg':
    case 'jpeg': return 'image/jpeg'
    case 'png': return 'image/png'
    case 'gif': return 'image/gif'
    case 'webp': return 'image/webp'
    case 'heic': return 'image/heic'
    case 'heif': return 'image/heif'
    case 'bmp': return 'image/bmp'
    case 'mp4': return 'video/mp4'
    case 'mov': return 'video/quicktime'
    case 'm4v': return 'video/x-m4v'
    case 'webm': return 'video/webm'
    case '3gp':
    case '3gpp': return 'video/3gpp'
    case 'avi': return 'video/x-msvideo'
    case 'mkv': return 'video/x-matroska'
    case 'ogv': return 'video/ogg'
    case 'mp3': return 'audio/mpeg'
    case 'wav': return 'audio/wav'
    case 'ogg': return 'audio/ogg'
    case 'm4a': return 'audio/mp4'
    case 'aac': return 'audio/aac'
    default: return ''
  }
}

export function normalizeFileContentType(contentType?: string, name?: string): string {
  const raw = String(contentType || '').trim().toLowerCase().split(';', 1)[0]
  if (!GENERIC_CONTENT_TYPES.has(raw)) return raw
  return inferMediaContentType(name) || raw || 'application/octet-stream'
}

export function normalizeUploadContentType(file: Pick<File, 'type' | 'name'>): string {
  return normalizeFileContentType(file.type, file.name)
}

function normalizedUploadFile(file: File): File {
  const name = normalizeFileName(file.name) || file.name || '文件'
  const contentType = normalizeUploadContentType(file)
  if (name === file.name && contentType === file.type) return file
  try {
    return new File([file], name, { type: contentType, lastModified: file.lastModified })
  } catch {
    return file
  }
}

export async function fetchFileMetadata(fileId: string): Promise<UploadedFile> {
  const { data } = await http.get<ApiResult<UploadedFile>>(
    `/v1/files/${encodeURIComponent(fileId)}/metadata`,
  )
  const value = data.data
  const name = normalizeFileName(value.name) || '文件'
  return {
    ...value,
    fileId: value.fileId || fileId,
    url: value.url || fileDownloadUrl(fileId),
    originalUrl: value.originalUrl || value.downloadUrl || fileDownloadUrl(fileId),
    thumbUrl: value.thumbUrl || undefined,
    previewUrl: value.previewUrl || undefined,
    name,
    size: Number(value.size || value.originalSize || 0),
    contentType: normalizeFileContentType(value.contentType, name),
  }
}

/** Android 选择器/Servlet multipart 可能把 UTF-8 文件名按 Windows-1252 错解码。 */
const CP1252_BYTES: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x2c6: 0x88, 0x2030: 0x89, 0x160: 0x8a,
  0x2039: 0x8b, 0x152: 0x8c, 0x17d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x2dc: 0x98, 0x2122: 0x99, 0x161: 0x9a, 0x203a: 0x9b, 0x153: 0x9c,
  0x17e: 0x9e, 0x178: 0x9f,
}

function cjkCount(text: string): number {
  return (text.match(/[\u3400-\u9fff]/g) || []).length
}

function suspiciousFilenameCount(text: string): number {
  return (text.match(/[ÃÂâäåæçèéêëïöøù]/g) || []).length
}

function cp1252Byte(code: number): number | undefined {
  return code <= 0xff ? code : CP1252_BYTES[code]
}

function decodeMojibakeSegments(value: string): string {
  let result = ''
  let index = 0
  while (index < value.length) {
    const firstByte = cp1252Byte(value.charCodeAt(index))
    if (firstByte == null) {
      result += value[index]
      index += 1
      continue
    }

    let end = index + 1
    while (end < value.length && cp1252Byte(value.charCodeAt(end)) != null) end += 1
    const segment = value.slice(index, end)
    let decodedSegment = segment
    try {
      const bytes = Uint8Array.from([...segment].map((char) => cp1252Byte(char.charCodeAt(0))!))
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      if (
        decoded &&
        decoded !== segment &&
        (cjkCount(decoded) > cjkCount(segment) || suspiciousFilenameCount(decoded) < suspiciousFilenameCount(segment))
      ) {
        decodedSegment = decoded
      }
    } catch {
      // 正常的 Latin-1/Windows-1252 文件名不是 UTF-8，保持原样。
    }
    result += decodedSegment
    index = end
  }
  return result
}

/**
 * 统一清理文件名：去掉 Android 临时路径、百分号编码及可逆 UTF-8 乱码。
 * 正常的中文、英文和带重音字符文件名保持不变。
 */
export function normalizeFileName(name?: string): string {
  let value = String(name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim()
  if (!value) return ''

  value = value.replace(/\\/g, '/').split('/').pop() || ''

  try {
    if (/%(?:[0-9a-f]{2})/i.test(value)) {
      const decoded = decodeURIComponent(value)
      if (decoded) value = decoded
    }
  } catch {
    // Not a percent-encoded filename.
  }

  value = value.replace(/\\/g, '/').split('/').pop() || ''
  return decodeMojibakeSegments(value).normalize('NFC')
}

export async function uploadChatFile(
  file: File,
  options: {
    timeout?: number
    signal?: AbortSignal
    videoCodecHint?: 'avc' | 'hevc' | 'unknown'
    durationMs?: number
  } = {},
): Promise<UploadedFile> {
  const uploadFile = normalizedUploadFile(file)
  const form = new FormData()
  const clientFileName = normalizeFileName(uploadFile.name) || '文件'
  // Pass the filename explicitly. Some Android WebViews otherwise omit it or
  // use a platform-encoded temporary name in Content-Disposition.
  form.append('file', uploadFile, clientFileName)
  // Do not rely on multipart Content-Disposition for CJK names. Android's
  // WebView/Servlet combination may decode that header as ISO-8859-1 before
  // the server sees it; a normal UTF-8 form field remains intact.
  form.append('fileName', clientFileName)
  if (options.videoCodecHint) form.append('videoCodecHint', options.videoCodecHint)
  if (options.durationMs != null) form.append('durationMs', String(Math.max(0, Math.round(options.durationMs))))
  const { data } = await http.post<ApiResult<UploadedFile>>('/v1/files/upload', form, {
    timeout: options.timeout ?? 300000,
    signal: options.signal,
  })
  const f = data.data
  const name = normalizeFileName(f.name) || normalizeFileName(uploadFile.name) || '文件'
  return {
    fileId: f.fileId || undefined,
    objectKey: f.objectKey || undefined,
    thumbObjectKey: f.thumbObjectKey || undefined,
    previewObjectKey: f.previewObjectKey || undefined,
    url: f.url,
    originalUrl: f.originalUrl || undefined,
    thumbUrl: f.thumbUrl || undefined,
    previewUrl: f.previewUrl || undefined,
    name,
    size: Number(f.size || uploadFile.size || 0),
    originalSize: f.originalSize != null ? Number(f.originalSize) : undefined,
    contentType: normalizeFileContentType(f.contentType, name) || normalizeUploadContentType(uploadFile),
    sha256: f.sha256 || undefined,
    width: f.width != null ? Number(f.width) : undefined,
    height: f.height != null ? Number(f.height) : undefined,
    durationMs: f.durationMs != null ? Number(f.durationMs) : undefined,
    downloadUrl: f.downloadUrl || f.originalUrl || f.url,
  }
}

export interface FileSendConfig {
  maxSizeMb: number
  allowedExtensions: string[]
}

let cachedFileSendConfig: FileSendConfig | null = null

/** 读取后台配置的聊天文件发送参数（大小上限 + 允许类型），登录后调用。 */
export async function fetchFileSendConfig(force = false): Promise<FileSendConfig> {
  if (!force && cachedFileSendConfig) return cachedFileSendConfig
  try {
    const { data } = await http.get<ApiResult<FileSendConfig>>('/v1/files/config')
    const config = {
      maxSizeMb: Number(data.data?.maxSizeMb || 100),
      allowedExtensions: Array.isArray(data.data?.allowedExtensions)
        ? data.data.allowedExtensions.map((item) => String(item).toLowerCase())
        : [],
    }
    cachedFileSendConfig = config
    return config
  } catch {
    if (cachedFileSendConfig) return cachedFileSendConfig
    return { maxSizeMb: 100, allowedExtensions: [] }
  }
}

export function fileExtensionOf(name: string): string {
  const lower = String(name || '').trim().toLowerCase()
  const dot = lower.lastIndexOf('.')
  if (dot < 0 || dot >= lower.length - 1) return ''
  const ext = lower.slice(dot + 1)
  return ext.length > 12 ? '' : ext
}

/** 按后台配置校验待发送文件，返回错误文案；空字符串表示允许。 */
export async function validateClientFileSend(
  file: File,
  config?: FileSendConfig,
): Promise<string> {
  const cfg = config || (await fetchFileSendConfig())
  const maxBytes = Number(cfg.maxSizeMb || 100) * 1024 * 1024
  if (file.size > maxBytes) {
    return `文件不能超过 ${cfg.maxSizeMb}MB`
  }
  const allowed = cfg.allowedExtensions || []
  if (!allowed.length) return ''
  const ext = fileExtensionOf(file.name)
  if (ext && allowed.includes(ext)) return ''
  const subtype = normalizeUploadContentType(file).split('/')[1]?.split(';')[0]?.trim().toLowerCase()
  if (subtype && allowed.includes(subtype === 'jpeg' ? 'jpg' : subtype)) return ''
  return `仅支持发送 ${allowed.join('、')} 类型的文件`
}

// The API accepts chunks up to 8 MiB. Larger chunks avoid dozens of multipart
// requests on mobile networks while keeping each WebView FormData allocation
// bounded.
const VIDEO_CHUNK_SIZE = 8 * 1024 * 1024
const VIDEO_UPLOAD_CONCURRENCY = 4

function resumableKey(file: File): string {
  // Include the chunking version so an interrupted upload created with the old
  // 2 MiB layout cannot be resumed with incompatible metadata.
  return `pulse_video_upload:v2:${file.name}:${file.size}:${file.lastModified}`
}

function getUploadId(file: File): string {
  const key = resumableKey(file)
  try {
    const saved = localStorage.getItem(key)
    if (saved) return saved
  } catch {
    // Ignore unavailable storage.
  }
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`
  try {
    localStorage.setItem(key, id)
  } catch {
    // Resume remains available for the current attempt.
  }
  return id
}

export async function uploadVideoResumable(
  file: File,
  options: {
    signal?: AbortSignal
    videoCodecHint?: 'avc' | 'hevc' | 'unknown'
    onProgress?: (ratio: number) => void
  } = {},
): Promise<UploadedFile> {
  const uploadFile = normalizedUploadFile(file)
  const contentType = normalizeUploadContentType(uploadFile)
  const totalChunks = Math.ceil(uploadFile.size / VIDEO_CHUNK_SIZE)
  const uploadId = getUploadId(uploadFile)
  const init = await http.post<ApiResult<{ uploaded?: number[] }>>('/v1/files/multipart/init', {
    uploadId,
    name: uploadFile.name,
    contentType,
    size: uploadFile.size,
    chunkSize: VIDEO_CHUNK_SIZE,
    totalChunks,
    videoCodecHint: options.videoCodecHint || 'unknown',
  }, { signal: options.signal, timeout: 30_000 })
  const completed = new Set((init.data.data.uploaded || []).map(Number))
  let completedBytes = [...completed].reduce((sum, index) => {
    const start = index * VIDEO_CHUNK_SIZE
    return sum + Math.min(VIDEO_CHUNK_SIZE, uploadFile.size - start)
  }, 0)
  options.onProgress?.(completedBytes / uploadFile.size)

  const pending = Array.from({ length: totalChunks }, (_, index) => index)
    .filter((index) => !completed.has(index))
  let cursor = 0
  const worker = async () => {
    while (cursor < pending.length) {
      const index = pending[cursor++]
      const start = index * VIDEO_CHUNK_SIZE
      const end = Math.min(uploadFile.size, start + VIDEO_CHUNK_SIZE)
      const form = new FormData()
      form.append('chunk', uploadFile.slice(start, end), `${index}.part`)
      let lastError: unknown
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await http.post(`/v1/files/multipart/${encodeURIComponent(uploadId)}/chunks/${index}`, form, {
            signal: options.signal,
            timeout: 90_000,
          })
          completedBytes += end - start
          options.onProgress?.(Math.min(0.99, completedBytes / uploadFile.size))
          lastError = undefined
          break
        } catch (error) {
          lastError = error
          if (options.signal?.aborted) throw error
          await new Promise((resolve) => window.setTimeout(resolve, 500 * (attempt + 1)))
        }
      }
      if (lastError) throw lastError
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(VIDEO_UPLOAD_CONCURRENCY, pending.length) }, () => worker()),
  )
  const { data } = await http.post<ApiResult<UploadedFile>>(
    `/v1/files/multipart/${encodeURIComponent(uploadId)}/complete`,
    {},
    { signal: options.signal, timeout: 120_000 },
  )
  try {
    localStorage.removeItem(resumableKey(uploadFile))
  } catch {
    // Ignore.
  }
  options.onProgress?.(1)
  return data.data
}

/** 将相对上传地址转为可访问 URL */
export function resolveFileUrl(url?: string): string {
  if (!url) return ''
  let u = String(url).trim()
  if (!u) return ''
  if (u.startsWith('data:') || u.startsWith('blob:')) return u

  // Web builds are served below /pulseim/, while API responses and old
  // local profiles may already contain the /pulseim/api prefix. Do not feed
  // such a path through the generic relative-path branch, otherwise it turns
  // into /pulseim/api/pulseim/api/... and protected avatar requests fail.
  const normalizeDeployPath = (path: string): string => {
    try {
      const configured = new URL(SERVER_ORIGIN, window.location.origin)
      const prefix = configured.pathname.replace(/\/+$/, '')
      if (!prefix || prefix === '/') return path
      const duplicateApiPrefix = `${prefix}/api${prefix}/api`
      let normalized = path
      while (normalized.startsWith(duplicateApiPrefix)) {
        normalized = `${prefix}/api${normalized.slice(duplicateApiPrefix.length)}`
      }
      return normalized
    } catch {
      return path
    }
  }

  const absoluteDeployPath = (path: string): string => {
    if (!path.startsWith('/')) return ''
    try {
      const configured = new URL(SERVER_ORIGIN, window.location.origin)
      const prefix = configured.pathname.replace(/\/+$/, '')
      if (!prefix || prefix === '/' || !(path === prefix || path.startsWith(`${prefix}/`))) return ''
      const normalized = normalizeDeployPath(path)
      return `${configured.origin}${normalized}`
    } catch {
      return ''
    }
  }

  // 绝对地址：同源 /api、/v1 转成相对路径，避免 https 页加载 http 图被拦
  if (/^https?:\/\//i.test(u)) {
    try {
      const parsed = new URL(u)
      const params = new URLSearchParams(parsed.search)
      // Temporary cache-busting parameters make the same image a new browser resource.
      ;['t', 'ts', 'timestamp', '_t', 'cacheBust'].forEach((key) => params.delete(key))
      const query = params.toString()
      const normalizedPath = normalizeDeployPath(parsed.pathname)
      const path = normalizedPath + (query ? `?${query}` : '')
      if (path.startsWith('/api/') || path.startsWith('/v1/')) {
        u = path
      } else if (absoluteDeployPath(normalizedPath)) {
        return `${parsed.origin}${normalizedPath}${query ? `?${query}` : ''}${parsed.hash}`
      } else {
        return u
      }
    } catch {
      return u
    }
  }

  const stabilizeRelativeUrl = (value: string) => {
    const [path, rawQuery = ''] = value.split('?', 2)
    if (!rawQuery) return path
    const params = new URLSearchParams(rawQuery)
    ;['t', 'ts', 'timestamp', '_t', 'cacheBust'].forEach((key) => params.delete(key))
    const query = params.toString()
    return path + (query ? `?${query}` : '')
  }

  const normalizedDeployUrl = absoluteDeployPath(u)
  if (normalizedDeployUrl) return normalizedDeployUrl

  if (u.startsWith('/api/')) return absoluteApiUrl(stabilizeRelativeUrl(u))
  if (u.startsWith('/')) return absoluteApiUrl(`/api${stabilizeRelativeUrl(u)}`)
  return u
}

/** Metadata-only attachment URL helpers. File bytes are fetched by HTTP on demand. */
export function fileDownloadUrl(fileId?: string, variant: 'original' | 'thumb' | 'preview' = 'original'): string {
  if (!fileId) return ''
  const suffix = variant === 'original' ? '' : `?variant=${variant}`
  return resolveFileUrl(`/v1/files/${encodeURIComponent(fileId)}/download${suffix}`)
}

/** Extract the protected chat-file id from a metadata/download URL. */
export function extractChatFileId(url?: string): string {
  const raw = String(url || '').trim()
  if (!raw) return ''
  try {
    const parsed = new URL(raw, typeof window === 'undefined' ? 'http://localhost' : window.location.origin)
    // resolveFileUrl() normalizes relative /v1 paths to /api/v1, while older
    // records may still contain the bare /v1 form. Accept both forms so old
    // moments and profile covers can be rehydrated through the auth cache.
    const match = parsed.pathname.match(/(?:\/api)?\/v1\/files\/([^/]+)\/download\/?$/)
    return match?.[1] ? decodeURIComponent(match[1]) : ''
  } catch {
    return ''
  }
}

/** Office 文件先由服务端转换为 PDF，再交给 PDF.js 按 Range 分段读取。 */
export function fileDocumentPreviewUrl(fileId?: string): string {
  if (!fileId) return ''
  return resolveFileUrl(`/v1/files/${encodeURIComponent(fileId)}/preview`)
}

/** Use the lightweight server-side rendition for locally uploaded avatars. */
export function resolveAvatarUrl(url?: string): string {
  const resolved = resolveFileUrl(url)
  if (!resolved || resolved.startsWith('data:') || resolved.startsWith('blob:')) return resolved
  try {
    const parsed = new URL(resolved, window.location.origin)
    // 旧版资料把头像保存成私有聊天文件下载地址。统一切到只允许被
    // profile avatar 引用的公开头像缩略图，这样普通 <img>、WebView
    // 和联系人缓存都能显示同一张真实头像，不需要给 img 手动塞 Token。
    const protectedAvatar = parsed.pathname.match(/^(.*\/v1)\/files\/([^/]+)\/download\/?$/)
    if (protectedAvatar?.[1] && protectedAvatar[2]) {
      const avatarPath = `${protectedAvatar[1]}/files/${encodeURIComponent(protectedAvatar[2])}/avatar`
      return parsed.origin === window.location.origin ? avatarPath : `${parsed.origin}${avatarPath}`
    }
    if (!parsed.pathname.startsWith('/api/v1/files/raw/')) return resolved
    parsed.searchParams.set('avatar', '1')
    return parsed.origin === window.location.origin
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : parsed.href
  } catch {
    return resolved
  }
}

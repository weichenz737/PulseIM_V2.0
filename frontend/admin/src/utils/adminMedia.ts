import { adminMediaUrl, fetchAdminMediaBlob } from '@/api/files'

export type AdminMediaVariant = 'thumb' | 'preview' | 'original'
export type AdminMediaScope = 'moments' | 'communities/content' | 'messages'

export interface AdminMediaItem {
  source: string
  fileId: string
  kind: 'image' | 'video'
}

const objectUrls = new Map<string, string>()
const inFlight = new Map<string, Promise<string>>()
const MAX_OBJECT_URLS = 240

function cacheKey(source: string, fileId: string, variant: AdminMediaVariant): string {
  return fileId ? `file:${fileId}:${variant}` : `url:${source}`
}

function remember(key: string, url: string): void {
  const previous = objectUrls.get(key)
  if (previous && previous !== url) URL.revokeObjectURL(previous)
  objectUrls.delete(key)
  objectUrls.set(key, url)
  while (objectUrls.size > MAX_OBJECT_URLS) {
    const oldest = objectUrls.keys().next().value
    if (!oldest) break
    const oldUrl = objectUrls.get(oldest)
    objectUrls.delete(oldest)
    if (oldUrl) URL.revokeObjectURL(oldUrl)
  }
}

export function parseAdminMediaList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean)
  const raw = String(value || '').trim()
  if (!raw) return []
  if (raw.startsWith('[') && raw.endsWith(']')) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parseAdminMediaList(parsed)
    } catch {
      // Fall through to the legacy comma-delimited format.
    }
  }
  return raw.split(',').map((item) => item.trim()).filter(Boolean)
}

export async function loadAdminMediaSource(
  source: string,
  fileId = '',
  variant: AdminMediaVariant = 'preview',
  scope: AdminMediaScope = 'moments',
): Promise<string> {
  const rawSource = String(source || '').trim()
  const id = String(fileId || '').trim()
  if (!rawSource && !id) return ''
  const key = `${scope}:${cacheKey(rawSource, id, variant)}`
  const cached = objectUrls.get(key)
  if (cached) return cached
  const pending = inFlight.get(key)
  if (pending) return pending

  const task = (async () => {
    const blob = id
      ? await fetchAdminMediaBlob(adminMediaUrl(id, variant, scope))
      : await fetchAdminMediaBlob(rawSource)
    const url = URL.createObjectURL(blob)
    remember(key, url)
    return url
  })()
  inFlight.set(key, task)
  try {
    return await task
  } finally {
    if (inFlight.get(key) === task) inFlight.delete(key)
  }
}

export function mediaKind(types: string[], index: number, source: string): 'image' | 'video' {
  if (types[index] === 'video') return 'video'
  return /\.(mp4|webm|mov|m4v|mkv|3gp)(?:\?|$)/i.test(source) || source.toLowerCase().includes('video/')
    ? 'video'
    : 'image'
}

export function normalizeAdminMedia(
  images: unknown,
  originalImages: unknown,
  mediaTypes: unknown,
  mediaFileIds: unknown,
  video?: unknown,
): AdminMediaItem[] {
  const preview = parseAdminMediaList(images)
  const original = parseAdminMediaList(originalImages)
  const types = parseAdminMediaList(mediaTypes)
  const ids = parseAdminMediaList(mediaFileIds)
  const videos = parseAdminMediaList(video)
  const count = Math.max(preview.length, original.length, types.length, ids.length, videos.length)
  return Array.from({ length: count }, (_, index) => {
    const source = preview[index] || original[index] || videos[index] || ''
    return {
      source,
      fileId: ids[index] || '',
      kind: mediaKind(types, index, source),
    }
  }).filter((item) => item.source || item.fileId)
}

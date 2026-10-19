import { reactive } from 'vue'
import { fetchFileMetadata, fileDownloadUrl, resolveFileUrl } from '@/api/file'
import { cacheChatFile, getStableChatFileUrl } from '@/utils/fileCache'

function toAbsoluteMediaUrl(url: string): string {
  const resolved = resolveFileUrl(url)
  if (!resolved) return ''
  if (/^https?:\/\//i.test(resolved) || resolved.startsWith('blob:') || resolved.startsWith('data:')) {
    return resolved
  }
  return `${window.location.origin}${resolved.startsWith('/') ? '' : '/'}${resolved}`
}

/** 全局单例：关闭直接改这里，不走 props/emit */
export const mediaVideoPreviewState = reactive({
  visible: false,
  src: '',
  loading: false,
  variant: 'preview' as 'preview' | 'original',
  /** 允许长按媒体弹出保存/转发操作 */
  allowActions: false,
  fileId: '',
})

let blobUrl = ''
let openToken = 0
let activeVideoEl: HTMLVideoElement | null = null
let cacheFallbackAttempted = false
let renditionWaitAttempted = false

function revokeBlob() {
  if (blobUrl) {
    URL.revokeObjectURL(blobUrl)
    blobUrl = ''
  }
}

export function bindMediaVideoEl(el: HTMLVideoElement | null) {
  activeVideoEl = el
}

export function closeMediaVideoPreview() {
  openToken += 1
  if (activeVideoEl) {
    try {
      activeVideoEl.pause()
    } catch {
      /* ignore */
    }
  }
  activeVideoEl = null
  mediaVideoPreviewState.visible = false
  mediaVideoPreviewState.src = ''
  mediaVideoPreviewState.loading = false
  mediaVideoPreviewState.variant = 'preview'
  mediaVideoPreviewState.allowActions = false
  mediaVideoPreviewState.fileId = ''
  renditionWaitAttempted = false
  revokeBlob()
}

export async function openMediaVideoPreview(
  url: string,
  options: { allowActions?: boolean; fileId?: string; variant?: 'preview' | 'original' } = {},
) {
  const source = url || (options.fileId ? fileDownloadUrl(options.fileId, options.variant || 'preview') : '')
  const abs = toAbsoluteMediaUrl(source)
  if (!abs) {
    return
  }

  const token = ++openToken
  revokeBlob()
  mediaVideoPreviewState.visible = true
  mediaVideoPreviewState.loading = true
  mediaVideoPreviewState.src = ''
  mediaVideoPreviewState.variant = options.variant || 'preview'
  mediaVideoPreviewState.allowActions = !!options.allowActions
  mediaVideoPreviewState.fileId = options.fileId || ''
  cacheFallbackAttempted = false
  renditionWaitAttempted = false

  if (abs.startsWith('blob:') || abs.startsWith('data:')) {
    if (token !== openToken) return
    mediaVideoPreviewState.src = abs
    mediaVideoPreviewState.loading = false
    return
  }

  if (options.fileId) {
    const cached = getStableChatFileUrl(options.fileId, options.variant || 'preview')
    if (cached) {
      if (token !== openToken) return
      mediaVideoPreviewState.src = cached
      mediaVideoPreviewState.loading = false
      return
    }
    // The file endpoint supports authenticated Range requests. Start the
    // player immediately; only fall back to a complete blob of the same
    // rendition if the WebView cannot use the direct request.
    if (token !== openToken) return
    mediaVideoPreviewState.src = abs
    mediaVideoPreviewState.loading = false
    return
  }

  // Keep the direct URL so the browser can stream with HTTP Range.
  if (token !== openToken) return
  mediaVideoPreviewState.src = abs
  mediaVideoPreviewState.loading = false

}

/** Wait for a just-uploaded compressed rendition without switching to the original. */
export async function waitForMediaVideoRendition(): Promise<boolean> {
  const fileId = mediaVideoPreviewState.fileId
  if (!fileId || mediaVideoPreviewState.variant !== 'preview' || renditionWaitAttempted) return false
  renditionWaitAttempted = true
  const token = ++openToken
  mediaVideoPreviewState.loading = true
  mediaVideoPreviewState.src = ''
  for (let attempt = 0; attempt < 18; attempt += 1) {
    if (token !== openToken || !mediaVideoPreviewState.visible) return false
    try {
      const metadata = await fetchFileMetadata(fileId)
      if (metadata.previewUrl) {
        const source = toAbsoluteMediaUrl(metadata.previewUrl)
        if (token !== openToken || !mediaVideoPreviewState.visible || !source) return false
        mediaVideoPreviewState.src = source
        mediaVideoPreviewState.loading = false
        return true
      }
    } catch {
      // The server may still be committing the ffmpeg rendition.
    }
    if (attempt < 17) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 700))
    }
  }
  if (token === openToken) mediaVideoPreviewState.loading = false
  return false
}

/** Retry a failed direct stream with the same rendition cached as a Blob.
 * The original file is never selected implicitly. */
export async function retryMediaVideoFromCache(): Promise<boolean> {
  const fileId = mediaVideoPreviewState.fileId
  const variant = mediaVideoPreviewState.variant
  if (!fileId || cacheFallbackAttempted) return false
  cacheFallbackAttempted = true
  const token = ++openToken
  mediaVideoPreviewState.loading = true
  mediaVideoPreviewState.src = ''
  try {
    const cached = await cacheChatFile('video', fileId, variant, fileDownloadUrl(fileId, variant))
    if (token !== openToken || !mediaVideoPreviewState.visible || !cached) return false
    mediaVideoPreviewState.src = cached
    mediaVideoPreviewState.loading = false
    return true
  } catch {
    if (token === openToken) mediaVideoPreviewState.loading = false
    return false
  }
}

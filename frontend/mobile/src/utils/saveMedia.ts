/** 将图片/视频保存到设备（相册或本地下载） */

import { nativeMediaGallery } from '@/native'
import { isAndroid } from '@/native/platform'
import { refreshTokenIfNeeded } from '@/api/http'

export type SaveMediaResult = 'gallery' | 'shared' | 'downloaded' | 'opened' | 'cancelled'

function isAppleTouchDevice(): boolean {
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod/i.test(ua)) return true
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

export function isVideoMedia(contentType?: string, urlOrName?: string): boolean {
  const normalizedType = String(contentType || '').trim().toLowerCase().split(';', 1)[0]
  if (normalizedType.startsWith('video/')) return true
  return /\.(mp4|webm|mov|m4v|avi|mkv|3gp|3gpp|ogv)(?:[?#]|$)/i.test(urlOrName || '')
}

function extFromMime(mime: string): string {
  const m = mime.toLowerCase()
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg'
  if (m.includes('png')) return 'png'
  if (m.includes('gif')) return 'gif'
  if (m.includes('webp')) return 'webp'
  if (m.includes('mp4')) return 'mp4'
  if (m.includes('webm')) return 'webm'
  if (m.includes('quicktime') || m.includes('mov')) return 'mov'
  if (m.startsWith('video/')) return 'mp4'
  if (m.startsWith('image/')) return 'jpg'
  return 'bin'
}

function guessFilename(url: string, mime: string, preferred?: string): string {
  if (preferred && /\.[a-z0-9]{2,5}$/i.test(preferred)) return preferred
  try {
    const path = new URL(url, window.location.origin).pathname
    const base = path.split('/').pop() || ''
    if (base && /\.[a-z0-9]{2,5}$/i.test(base)) {
      return preferred ? preferred.replace(/\.[^.]+$/, '') + base.slice(base.lastIndexOf('.')) : decodeURIComponent(base)
    }
  } catch {
    /* ignore */
  }
  const ext = extFromMime(mime)
  const stem = (preferred || `pulse_${Date.now()}`).replace(/\.[^.]+$/, '')
  return `${stem}.${ext}`
}

/**
 * 保存远程媒体到本地。
 * - 优先系统分享（iOS 可选「存储到照片」）
 * - 桌面触发下载
 * - iOS 分享不可用时打开新页，提示长按保存
 */
export async function saveMediaToDevice(
  url: string,
  options: { filename?: string; mimeType?: string } = {},
): Promise<SaveMediaResult> {
  if (!url) throw new Error('无效的媒体地址')

  const token = await refreshTokenIfNeeded()
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
  const res = await fetch(url, { headers, credentials: 'include', mode: 'cors' })
  if (!res.ok) throw new Error('下载失败')
  const blob = await res.blob()
  const mime = options.mimeType || blob.type || 'application/octet-stream'
  const name = guessFilename(url, mime, options.filename)
  const mediaType = mime.startsWith('video/') ? 'video' : 'image'

  // 原生端：先申请相册/存储权限，再写入
  try {
    await nativeMediaGallery.ensureSavePermissions(mediaType)
  } catch (e) {
    if (e instanceof Error && /权限/.test(e.message)) throw e
  }

  if (isAndroid && (mime.startsWith('image/') || mime.startsWith('video/'))) {
    await nativeMediaGallery.saveBlob(blob, name, mime)
    return 'gallery'
  }

  const file = new File([blob], name, { type: mime || blob.type || 'application/octet-stream' })
  const blobUrl = URL.createObjectURL(file)

  try {
    const shareData: ShareData = {
      files: [file],
      title: isVideoMedia(mime, name) ? '保存视频' : '保存图片',
    }
    if (typeof navigator.share === 'function' && navigator.canShare?.(shareData)) {
      try {
        await navigator.share(shareData)
        return 'shared'
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return 'cancelled'
        // 继续兜底
      }
    }

    if (isAppleTouchDevice()) {
      const opened = window.open(blobUrl, '_blank')
      if (!opened) {
        const a = document.createElement('a')
        a.href = blobUrl
        a.target = '_blank'
        a.rel = 'noopener'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 120000)
      return 'opened'
    }

    const a = document.createElement('a')
    a.href = blobUrl
    a.download = name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(blobUrl), 8000)
    return 'downloaded'
  } catch (e) {
    URL.revokeObjectURL(blobUrl)
    throw e
  }
}

export function toastForSaveResult(result: SaveMediaResult): string | null {
  switch (result) {
    case 'gallery':
      return '已保存到系统相册'
    case 'shared':
      return '请选择「存储到照片」完成保存'
    case 'downloaded':
      return '已保存到本地'
    case 'opened':
      return '请长按图片/视频，选择「存储到照片」'
    default:
      return null
  }
}

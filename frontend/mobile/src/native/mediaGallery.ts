import { registerPlugin } from '@capacitor/core'
import { isAndroid, isNativeApp } from './platform'
import {
  checkFilesystemPermissions,
  requestFilesystemPermissions,
} from './filesystem'
import { refreshTokenIfNeeded } from '@/api/http'

export interface NativeMediaAsset {
  uri: string
  name: string
  mimeType: string
  size: number
  duration: number
  createdAt: number
  thumbnail: string
}

interface MediaGalleryPlugin {
  ensurePermissions(options: { mediaType: 'image' | 'video' | 'file' }): Promise<{ granted: boolean }>
  listMedia(options?: { offset?: number; limit?: number }): Promise<{ items: NativeMediaAsset[] }>
  readMedia(options: { uri: string }): Promise<{
    data: string
    mimeType: string
    size: number
  }>
  save(options: {
    data: string
    filename: string
    mimeType: string
    mediaType: 'image' | 'video'
  }): Promise<{ uri: string }>
  openData(options: {
    data: string
    filename: string
    mimeType: string
  }): Promise<{ uri: string }>
  downloadAndOpen(options: {
    url: string
    filename: string
    mimeType: string
    authorization?: string
  }): Promise<{ downloadId: number }>
  download(options: {
    url: string
    filename: string
    mimeType: string
    authorization?: string
  }): Promise<{ downloadId: number }>
}

const MediaGallery = registerPlugin<MediaGalleryPlugin>('MediaGallery')

export async function listMedia(options: { offset?: number; limit?: number } = {}): Promise<NativeMediaAsset[]> {
  if (!isAndroid) return []
  const result = await MediaGallery.listMedia(options)
  return Array.isArray(result?.items) ? result.items : []
}

export function readMedia(uri: string) {
  if (!isAndroid) throw new Error('当前平台暂不支持读取系统相册')
  return MediaGallery.readMedia({ uri })
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('读取媒体文件失败'))
    reader.onload = () => {
      const value = String(reader.result || '')
      resolve(value.includes(',') ? value.slice(value.indexOf(',') + 1) : value)
    }
    reader.readAsDataURL(blob)
  })
}

/** 保存到相册 / 本机前先申请存储或相册权限 */
export async function ensureSavePermissions(mediaType: 'image' | 'video' | 'file' = 'image') {
  if (!isNativeApp) return
  if (isAndroid) {
    await MediaGallery.ensurePermissions({ mediaType })
    return
  }
  // iOS / 其它原生：申请 Filesystem 访问（分享/下载前）
  try {
    const current = await checkFilesystemPermissions()
    if (current.publicStorage === 'granted') return
    const next = await requestFilesystemPermissions()
    if (next.publicStorage !== 'granted') {
      throw new Error('未获得存储权限，无法保存到本地')
    }
  } catch (e) {
    if (e instanceof Error && /未获得存储权限/.test(e.message)) throw e
    // 部分平台无 publicStorage 字段时忽略，交给后续系统分享面板
  }
}

export async function saveBlob(
  blob: Blob,
  filename: string,
  mimeType: string,
): Promise<{ uri: string }> {
  return saveBase64(await blobToBase64(blob), filename, mimeType)
}

/**
 * 直接打开已经在 WebView 中取得的文件数据。
 *
 * 预览时文件已经下载到内存，Android 端不能把 blob: URL 交给外部应用，
 * 因此由原生插件写入应用缓存后通过 FileProvider 打开，避免再次请求服务器。
 */
export async function openBlob(
  blob: Blob,
  filename: string,
  mimeType: string,
): Promise<{ uri: string }> {
  if (!isAndroid) throw new Error('当前平台暂不支持使用其他应用打开本地文件')
  const data = await blobToBase64(blob)
  return MediaGallery.openData({ data, filename, mimeType })
}

/** 直接以 base64 保存到相册（Android）。data 为去掉 data: 前缀的纯 base64 字符串。 */
export async function saveBase64(
  data: string,
  filename: string,
  mimeType: string,
): Promise<{ uri: string }> {
  if (!isAndroid) throw new Error('当前平台暂不支持直接保存到系统相册')
  const mediaType = mimeType.startsWith('video/') ? 'video' : 'image'
  await ensureSavePermissions(mediaType)

  return MediaGallery.save({
    data,
    filename,
    mimeType,
    mediaType,
  })
}

async function authHeader(): Promise<string | undefined> {
  const token = await refreshTokenIfNeeded()
  return token ? `Bearer ${token}` : undefined
}

export async function downloadFile(
  url: string,
  filename: string,
  mimeType = 'video/mp4',
): Promise<{ downloadId: number }> {
  if (!isAndroid) throw new Error('当前平台不支持原生下载')
  await ensureSavePermissions(mimeType.startsWith('video/') ? 'video' : 'file')
  return MediaGallery.download({ url, filename, mimeType, authorization: await authHeader() })
}

export async function downloadAndOpen(
  url: string,
  filename: string,
  mimeType = 'video/mp4',
): Promise<{ downloadId: number }> {
  if (!isAndroid) throw new Error('当前平台不支持原生下载并打开')
  await ensureSavePermissions(mimeType.startsWith('video/') ? 'video' : 'file')
  return MediaGallery.downloadAndOpen({ url, filename, mimeType, authorization: await authHeader() })
}

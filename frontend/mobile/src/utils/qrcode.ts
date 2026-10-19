import QRCode from 'qrcode'
import { nativeMediaGallery } from '@/native'
import { isAndroid } from '@/native/platform'

/** 个人名片二维码内容 */
export function userQrPayload(pulseId: string): string {
  return `pulse://user/${pulseId}`
}

/** 群聊二维码内容 */
export function groupQrPayload(conversationId: string): string {
  return `pulse://group/${conversationId}`
}

export async function renderQrDataUrl(payload: string, size = 280): Promise<string> {
  return QRCode.toDataURL(payload, {
    width: size,
    margin: 2,
    color: { dark: '#121317', light: '#ffffff' },
    errorCorrectionLevel: 'M',
  })
}

function isAppleTouchDevice(): boolean {
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod/i.test(ua)) return true
  // iPadOS 桌面 UA
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

function normalizeFilename(filename: string): string {
  return filename.endsWith('.png') ? filename : `${filename}.png`
}

async function dataUrlToPngFile(dataUrl: string, filename: string): Promise<File> {
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  return new File([blob], filename, { type: 'image/png' })
}

export type SaveQrResult = 'gallery' | 'shared' | 'downloaded' | 'opened' | 'cancelled'

/**
 * 保存二维码到设备。
 * - iOS / 支持文件分享的浏览器：走系统分享（可选「存储到照片」）
 * - 其他桌面浏览器：触发下载
 * - iOS 分享不可用时：打开大图，提示长按保存
 */
export async function saveQrToDevice(payload: string, filename: string): Promise<SaveQrResult> {
  const name = normalizeFilename(filename)
  const dataUrl = await renderQrDataUrl(payload, 512)

  if (isAndroid) {
    // 直接把 base64 交给原生层写入 MediaStore，避免 fetch/File/FileReader
    // 在 WebView 上的兼容性问题和多余的内存拷贝。
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
    await nativeMediaGallery.saveBase64(base64, name, 'image/png')
    return 'gallery'
  }

  const file = await dataUrlToPngFile(dataUrl, name)
  const blobUrl = URL.createObjectURL(file)

  try {
    const shareData: ShareData = {
      files: [file],
      title: 'Pulse 二维码',
      text: 'Pulse 二维码',
    }
    if (typeof navigator.share === 'function' && navigator.canShare?.(shareData)) {
      try {
        await navigator.share(shareData)
        return 'shared'
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return 'cancelled'
        }
        // 分享失败则继续走兜底
      }
    }

    // iOS Safari 不支持 a[download]，打开图片供长按「存储到照片」
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
      // 延迟回收，避免新页加载前失效
      setTimeout(() => URL.revokeObjectURL(blobUrl), 120000)
      return 'opened'
    }

    const a = document.createElement('a')
    a.href = blobUrl
    a.download = name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(blobUrl), 4000)
    return 'downloaded'
  } catch (e) {
    URL.revokeObjectURL(blobUrl)
    throw e
  }
}

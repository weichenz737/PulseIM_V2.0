/** 压缩图片后转为 File，便于上传 */
export async function compressImageFile(
  file: File,
  options: { maxEdge?: number; quality?: number; maxBytes?: number; preserveGif?: boolean } = {},
): Promise<File> {
  const maxEdge = options.maxEdge ?? 1600
  const quality = options.quality ?? 0.82
  const maxBytes = options.maxBytes ?? 2.5 * 1024 * 1024

  if (!file.type.startsWith('image/') || (file.type === 'image/gif' && options.preserveGif !== false)) {
    return file
  }

  // On mobile, decoding and re-encoding a small image can take longer than
  // uploading it. Keep the original when it is already reasonably compact;
  // larger images still get resized/compressed below.
  if (file.size <= Math.min(maxBytes, 2 * 1024 * 1024)) return file

  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return file
  }
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  )
  if (!blob) return file

  let out = blob
  if (out.size > maxBytes && quality > 0.5) {
    const tighter: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.6),
    )
    if (tighter) out = tighter
  }

  const base = file.name.replace(/\.[^.]+$/, '') || 'image'
  return new File([out], `${base}.jpg`, { type: 'image/jpeg' })
}

/** Keep enough source detail for high-density mobile avatar rendering. */
export async function compressAvatarFile(file: File): Promise<File> {
  return compressImageFile(file, {
    maxEdge: 768,
    quality: 0.88,
    maxBytes: 768 * 1024,
    preserveGif: false,
  })
}

export function formatFileSize(bytes?: number): string {
  const n = Number(bytes || 0)
  if (!n || n < 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** 语音时长展示，如 5" */
export function formatVoiceDuration(durationMs?: number): string {
  const ms = Number(durationMs || 0)
  const sec = Math.max(1, Math.round(ms / 1000))
  return `${sec}"`
}

/** 选择浏览器支持的录音 MIME（优先跨端可播格式） */
export function pickAudioRecorderMime(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  const ua = navigator.userAgent || ''
  const apple =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const candidates = apple
    ? ['audio/mp4', 'audio/aac', 'audio/webm;codecs=opus', 'audio/webm']
    : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg']
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) || ''
}

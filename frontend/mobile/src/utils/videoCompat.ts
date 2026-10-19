/** 从文件头判断是否可能是 HEVC（相册视频常见，安卓 Chrome 常播不了） */
export async function sniffVideoHints(file: Blob): Promise<{ hevc: boolean; avc: boolean }> {
  // MP4 codec metadata is often placed at the end of phone-recorded videos.
  // Probe both ends while keeping allocations small for Android WebView.
  const probeBytes = 256 * 1024
  const head = file.slice(0, Math.min(file.size, probeBytes))
  const tailStart = Math.max(head.size, file.size - probeBytes)
  const tail = tailStart < file.size ? file.slice(tailStart) : null
  const decoder = new TextDecoder('latin1')
  const headText = decoder.decode(await head.arrayBuffer())
  const tailText = tail ? decoder.decode(await tail.arrayBuffer()) : ''
  const text = headText + tailText
  return {
    hevc: text.includes('hvc1') || text.includes('hev1') || text.includes('hvcC'),
    avc: text.includes('avc1') || text.includes('avcC'),
  }
}

export async function sniffVideoHintsFromUrl(url: string): Promise<{ hevc: boolean; avc: boolean }> {
  try {
    const res = await fetch(url, {
      headers: { Range: 'bytes=0-2097151' },
      credentials: 'same-origin',
    })
    if (!res.ok && res.status !== 206) return { hevc: false, avc: false }
    const buf = new Uint8Array(await res.arrayBuffer())
    const text = new TextDecoder('latin1').decode(buf)
    return {
      hevc: text.includes('hvc1') || text.includes('hev1') || text.includes('hvcC'),
      avc: text.includes('avc1') || text.includes('avcC'),
    }
  } catch {
    return { hevc: false, avc: false }
  }
}

function pickRecorderMime(): string {
  const candidates = [
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm',
    'video/mp4',
  ]
  for (const m of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m
  }
  return 'video/webm'
}

/**
 * 安卓相册 HEVC/大视频：在可解码时转成浏览器友好的 webm/mp4。
 * 若本机无法解码 HEVC，则原样返回。
 */
export async function reencodeVideoForCompat(
  file: File,
  onProgress?: (ratio: number) => void
): Promise<{ file: File; converted: boolean }> {
  const hints = await sniffVideoHints(file)
  const need = hints.hevc || file.size > 12 * 1024 * 1024
  if (!need) return { file, converted: false }

  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.setAttribute('playsinline', 'true')
  video.preload = 'auto'
  video.src = url

  try {
    await new Promise<void>((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error('视频加载超时')), 20000)
      video.onloadedmetadata = () => {
        window.clearTimeout(t)
        resolve()
      }
      video.onerror = () => {
        window.clearTimeout(t)
        reject(new Error('无法解码该视频'))
      }
    })

    if (!video.videoWidth || !video.duration || !Number.isFinite(video.duration)) {
      return { file, converted: false }
    }

    // 限制最长 90s，避免超长相册视频卡死上传
    if (video.duration > 90) {
      throw new Error('视频过长，请选择 90 秒以内的片段')
    }

    await video.play().catch(() => undefined)
    video.pause()
    video.currentTime = 0

    const maxW = 1280
    const scale = Math.min(1, maxW / video.videoWidth)
    const w = Math.max(2, Math.round((video.videoWidth * scale) / 2) * 2)
    const h = Math.max(2, Math.round((video.videoHeight * scale) / 2) * 2)

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return { file, converted: false }

    const canvasStream = canvas.captureStream(25)
    let recordStream: MediaStream = canvasStream
    try {
      const vs = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.()
      if (vs && vs.getVideoTracks().length) {
        // 优先用 video.captureStream，保留音轨
        recordStream = vs
      }
    } catch {
      /* use canvas */
    }

    // 无音轨时仍用 canvas 视频轨
    if (!recordStream.getVideoTracks().length) {
      recordStream = canvasStream
    }

    const mime = pickRecorderMime()
    const chunks: BlobPart[] = []
    const rec = new MediaRecorder(recordStream, {
      mimeType: mime,
      videoBitsPerSecond: 2_500_000,
    })
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data)
    }

    const stopped = new Promise<Blob>((resolve, reject) => {
      rec.onstop = () => resolve(new Blob(chunks, { type: mime.split(';')[0] }))
      rec.onerror = () => reject(new Error('转码失败'))
    })

    const useCanvas = recordStream === canvasStream
    rec.start(200)
    await video.play()

    await new Promise<void>((resolve, reject) => {
      const draw = () => {
        if (video.ended || video.paused) return
        if (useCanvas) ctx.drawImage(video, 0, 0, w, h)
        const ratio = video.duration ? video.currentTime / video.duration : 0
        onProgress?.(Math.min(0.99, ratio))
        requestAnimationFrame(draw)
      }
      video.onended = () => resolve()
      video.onerror = () => reject(new Error('播放转码中断'))
      if (useCanvas) draw()
      else {
        const timer = window.setInterval(() => {
          const ratio = video.duration ? video.currentTime / video.duration : 0
          onProgress?.(Math.min(0.99, ratio))
          if (video.ended || video.paused) window.clearInterval(timer)
        }, 200)
      }
    })

    if (rec.state !== 'inactive') rec.stop()
    recordStream.getTracks().forEach((t) => t.stop())
    const blob = await stopped
    onProgress?.(1)
    if (blob.size < 1024) return { file, converted: false }

    const ext = mime.includes('mp4') ? 'mp4' : 'webm'
    const out = new File([blob], `pulse_${Date.now()}.${ext}`, {
      type: blob.type || (ext === 'mp4' ? 'video/mp4' : 'video/webm'),
      lastModified: Date.now(),
    })
    return { file: out, converted: true }
  } catch {
    return { file, converted: false }
  } finally {
    URL.revokeObjectURL(url)
    video.removeAttribute('src')
    video.load()
  }
}

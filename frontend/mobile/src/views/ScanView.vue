<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { smartBack } from '@/utils/navBack'
import { showConfirmDialog, showToast, closeToast } from 'vant'
import jsQR from 'jsqr'
import { searchUserByPhone } from '@/api/contact'
import { confirmDesktopQrLogin } from '@/api/auth'

const router = useRouter()
const route = useRoute()
const videoRef = ref<HTMLVideoElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const albumInputRef = ref<HTMLInputElement | null>(null)
const cameraError = ref('')
const scanning = ref(false)
const previewReady = ref(false)
const manualCode = ref('')
let stream: MediaStream | null = null
let scanTimer: ReturnType<typeof setInterval> | null = null
let handling = false

function goBack() {
  stopCamera()
  smartBack(router, '/app/discover')
}

function isSecureContextOk() {
  return window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1'
}

async function startCamera() {
  cameraError.value = ''
  previewReady.value = false
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraError.value = '当前浏览器不支持摄像头，请用相册识别或手动输入'
    return
  }
  if (!isSecureContextOk()) {
    cameraError.value =
      '当前为 HTTP 访问，手机浏览器不允许打开摄像头。请改用 HTTPS 地址访问（如 https://服务器IP），也可点下方「相册识别」'
    return
  }

  const attempts: MediaStreamConstraints[] = [
    { audio: false, video: { facingMode: { ideal: 'environment' } } },
    { audio: false, video: { facingMode: 'environment' } },
    { audio: false, video: true },
  ]

  let lastErr: unknown = null
  for (const constraints of attempts) {
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints)
      break
    } catch (e) {
      lastErr = e
    }
  }

  if (!stream) {
    const name = lastErr instanceof DOMException ? lastErr.name : ''
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      cameraError.value = '未授权摄像头权限，请在系统设置中允许后重试，或使用相册识别'
    } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      cameraError.value = '未检测到摄像头，请使用相册识别或手动输入'
    } else if (name === 'NotReadableError' || name === 'TrackStartError') {
      cameraError.value = '摄像头被占用，请关闭其他应用后重试'
    } else {
      cameraError.value = '无法打开摄像头，请使用相册识别或手动输入'
    }
    return
  }

  if (videoRef.value) {
    videoRef.value.srcObject = stream
    videoRef.value.setAttribute('playsinline', 'true')
    videoRef.value.setAttribute('webkit-playsinline', 'true')
    try {
      await videoRef.value.play()
    } catch {
      cameraError.value = '摄像头预览失败，请使用相册识别'
      stopCamera()
      return
    }
  }
  startDetectLoop()
}

function stopCamera() {
  if (scanTimer) {
    clearInterval(scanTimer)
    scanTimer = null
  }
  scanning.value = false
  previewReady.value = false
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
  if (videoRef.value) {
    videoRef.value.pause()
    videoRef.value.srcObject = null
    videoRef.value.removeAttribute('src')
    videoRef.value.load()
  }
}

function decodeFromVideoFrame(): string | null {
  const video = videoRef.value
  const canvas = canvasRef.value
  if (!video || !canvas || video.readyState < 2) return null
  const w = video.videoWidth
  const h = video.videoHeight
  if (!w || !h) return null
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(video, 0, 0, w, h)
  const image = ctx.getImageData(0, 0, w, h)
  const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' })
  return code?.data?.trim() || null
}

function startDetectLoop() {
  scanning.value = true
  scanTimer = setInterval(async () => {
    if (handling) return
    try {
      const value = decodeFromVideoFrame()
      if (value) {
        handling = true
        stopCamera()
        await handleScanResult(value)
        handling = false
      }
    } catch {
      // ignore frame errors
    }
  }, 500)
}

async function decodeImageFile(file: File): Promise<string | null> {
  const tryDecode = (imageData: ImageData) => {
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth',
    })
    return code?.data?.trim() || null
  }

  const drawAndDecode = async (source: CanvasImageSource, sw: number, sh: number) => {
    const maxEdge = 1280
    const scale = Math.min(1, maxEdge / Math.max(sw, sh))
    const w = Math.max(1, Math.round(sw * scale))
    const h = Math.max(1, Math.round(sh * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(source, 0, 0, w, h)
    let hit = tryDecode(ctx.getImageData(0, 0, w, h))
    if (hit) return hit
    // 再试一次半尺寸，提高大图识别率
    if (w > 640 || h > 640) {
      const w2 = Math.round(w / 2)
      const h2 = Math.round(h / 2)
      canvas.width = w2
      canvas.height = h2
      ctx.drawImage(source, 0, 0, w2, h2)
      hit = tryDecode(ctx.getImageData(0, 0, w2, h2))
    }
    return hit
  }

  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file)
      const hit = await drawAndDecode(bitmap, bitmap.width, bitmap.height)
      bitmap.close()
      if (hit) return hit
    }
  } catch {
    // fallback below
  }

  // 部分机型 createImageBitmap 失败，改用 Image 加载
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('load failed'))
      el.src = url
    })
    return await drawAndDecode(img, img.naturalWidth || img.width, img.naturalHeight || img.height)
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

function openAlbum() {
  albumInputRef.value?.click()
}

async function onAlbumSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    showToast('请选择图片')
    return
  }
  try {
    showToast({ message: '正在识别二维码...', duration: 0 })
    const value = await decodeImageFile(file)
    closeToast()
    if (!value) {
      showToast('未识别到二维码，请换一张更清晰的图')
      return
    }
    stopCamera()
    await handleScanResult(value)
  } catch {
    closeToast()
    showToast('识别失败，请重试')
  }
}

async function handleScanResult(raw: string) {
  const text = raw.trim()
  const desktopLoginMatch = text.match(/^pulse:\/\/desktop-login\/([A-Za-z0-9]{20,64})$/i)
  if (desktopLoginMatch) {
    stopCamera()
    try {
      await showConfirmDialog({
        title: '确认电脑端登录',
        message: '检测到一台电脑正在请求登录你的 Pulse 账号。确认后，电脑端才会完成登录。',
        confirmButtonText: '确认登录',
        cancelButtonText: '取消',
      })
    } catch {
      await startCamera()
      return
    }
    try {
      await confirmDesktopQrLogin(desktopLoginMatch[1])
      showToast('已确认电脑端登录')
      router.replace('/app/messages')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '二维码已失效，请让电脑端刷新')
      await startCamera()
    }
    return
  }
  const groupMatch = text.match(/pulse:\/\/group\/(\d+)/i)
  if (groupMatch) {
    showToast('识别成功')
    router.replace({
      path: `/group/${groupMatch[1]}/profile`,
      query: { source: 'qrcode', target: route.query.target === 'group' ? 'group' : undefined },
    })
    return
  }

  let pulseOrUserId = ''
  const m = text.match(/pulse:\/\/user\/(\d+)/i) || text.match(/userId[=:](\d+)/i)
  if (m) pulseOrUserId = m[1]
  else if (/^\d{11}$/.test(text)) {
    try {
      const u = await searchUserByPhone(text)
      if (u) {
        showToast('识别成功')
        router.replace({ path: `/contacts/${u.userId}`, query: { source: 'phone' } })
        return
      }
    } catch {
      showToast('未找到该用户')
      return
    }
  } else if (/^\d{7}$/.test(text) || /^\d+$/.test(text)) {
    pulseOrUserId = text
  }

  if (!pulseOrUserId) {
    showToast('无法识别的二维码')
    await startCamera()
    return
  }

  try {
    if (/^\d{7}$/.test(pulseOrUserId)) {
      const { fetchUserByPulseId } = await import('@/api/contact')
      const u = await fetchUserByPulseId(pulseOrUserId)
      showToast('识别成功')
      router.replace({ path: `/contacts/${u.userId}`, query: { source: 'qrcode' } })
      return
    }
  } catch {
    // fallback
  }

  showToast('识别成功')
  router.replace({ path: `/contacts/${pulseOrUserId}`, query: { source: 'qrcode' } })
}

async function submitManual() {
  const v = manualCode.value.trim()
  if (!v) {
    showToast('请输入手机号或用户 ID')
    return
  }
  stopCamera()
  await handleScanResult(v)
}

onMounted(() => {
  void startCamera()
})

onUnmounted(() => {
  stopCamera()
})
</script>

<template>
  <div class="scan-page">
    <header class="page-header">
      <button type="button" class="icon-btn" @click="goBack">
        <span class="material-symbols-outlined">arrow_back</span>
      </button>
      <h1 class="page-title">扫一扫</h1>
      <button type="button" class="icon-btn" @click="openAlbum">
        <span class="material-symbols-outlined">photo_library</span>
      </button>
    </header>

    <div class="camera-stage">
      <video
        ref="videoRef"
        class="camera"
        :class="{ ready: previewReady }"
        playsinline
        webkit-playsinline
        muted
        autoplay
        @playing="previewReady = true"
      />
      <canvas ref="canvasRef" class="hidden-canvas" />
      <div class="frame">
        <span class="corner tl" />
        <span class="corner tr" />
        <span class="corner bl" />
        <span class="corner br" />
        <div class="scan-line" />
      </div>
      <p class="tip">
        {{ cameraError || (scanning ? '将二维码放入框内' : '对准二维码，或使用相册/手动输入') }}
      </p>
    </div>

    <div class="actions">
      <button type="button" class="action-btn primary" @click="openAlbum">
        <span class="material-symbols-outlined">photo_library</span>
        从相册选择图片识别
      </button>
      <button type="button" class="action-btn" @click="startCamera">
        <span class="material-symbols-outlined">photo_camera</span>
        重试摄像头
      </button>
    </div>

    <div class="manual-card">
      <p class="manual-title">手动输入</p>
      <div class="manual-row">
        <input
          v-model="manualCode"
          type="text"
          class="manual-input"
          placeholder="手机号 / PulseID"
          enterkeyhint="done"
          @keyup.enter="submitManual"
        />
        <button type="button" class="manual-btn" @click="submitManual">确定</button>
      </div>
    </div>

    <input
      ref="albumInputRef"
      type="file"
      accept="image/*"
      class="hidden-file"
      @change="onAlbumSelected"
    />
  </div>
</template>

<style scoped>
.scan-page {
  min-height: 100%;
  background: #0a0b0d;
  color: var(--pulse-text);
}

.page-header {
  position: relative;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 12px;
  padding-top: var(--pulse-header-pad-top);
  background: #0a0b0d !important;
}

.icon-btn {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: #fff;
  display: grid;
  place-items: center;
}

.page-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}

.camera-stage {
  position: relative;
  margin: 8px 16px 0;
  aspect-ratio: 3 / 4;
  border-radius: 16px;
  overflow: hidden;
  background: #111;
}

.camera {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #000;
  opacity: 0;
}

.camera.ready {
  opacity: 1;
}

.hidden-canvas,
.hidden-file {
  display: none;
}

.frame {
  position: absolute;
  inset: 18% 16%;
  pointer-events: none;
}

.corner {
  position: absolute;
  width: 22px;
  height: 22px;
  border: 3px solid var(--pulse-primary-container);
}

.corner.tl {
  top: 0;
  left: 0;
  border-right: none;
  border-bottom: none;
}
.corner.tr {
  top: 0;
  right: 0;
  border-left: none;
  border-bottom: none;
}
.corner.bl {
  bottom: 0;
  left: 0;
  border-right: none;
  border-top: none;
}
.corner.br {
  bottom: 0;
  right: 0;
  border-left: none;
  border-top: none;
}

.scan-line {
  position: absolute;
  left: 8%;
  right: 8%;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--pulse-primary-container), transparent);
  animation: scan 2s linear infinite;
}

@keyframes scan {
  0% {
    top: 8%;
  }
  100% {
    top: 90%;
  }
}

.tip {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 14px;
  margin: 0;
  text-align: center;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
}

.actions {
  display: flex;
  gap: 10px;
  padding: 14px 16px 0;
}

.action-btn {
  flex: 1;
  height: 44px;
  border: none;
  border-radius: 10px;
  background: var(--pulse-surface-container);
  color: var(--pulse-text);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
}

.action-btn.primary {
  flex: 1.4;
  background: var(--pulse-primary-container);
  color: var(--pulse-on-primary-container);
}

.action-btn .material-symbols-outlined {
  font-size: 18px;
}

.manual-card {
  margin: 14px 16px 28px;
  padding: 14px;
  border-radius: 14px;
  background: var(--pulse-surface-container);
}

.manual-title {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--pulse-text-secondary);
}

.manual-row {
  display: flex;
  gap: 8px;
}

.manual-input {
  flex: 1;
  min-width: 0;
  height: 40px;
  border: none;
  border-radius: 10px;
  background: var(--pulse-surface-high);
  color: var(--pulse-text);
  padding: 0 12px;
  outline: none;
}

.manual-btn {
  flex: 0 0 auto;
  min-width: 68px;
  border: none;
  border-radius: 10px;
  padding: 0 16px;
  background: var(--pulse-primary-container);
  color: var(--pulse-on-primary-container);
  font-weight: 600;
  white-space: nowrap;
  writing-mode: horizontal-tb;
}
</style>

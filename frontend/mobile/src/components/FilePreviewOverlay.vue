<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { showLoadingToast, closeToast, showToast } from 'vant'
import { filePreviewState, closeFilePreview } from '@/composables/useFilePreview'
import { nativeMediaGallery } from '@/native'
import { isAndroid, isNativeApp } from '@/native/platform'
import { formatFileSize } from '@/utils/media'
import { refreshTokenIfNeeded } from '@/api/http'
import { fileDocumentPreviewUrl } from '@/api/file'
import { cacheChatFile, getCachedChatFile, markChatCacheInUse } from '@/utils/fileCache'
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

// PDF.js 的 worker 约 1MB 以上，首次点击文件时才加载会明显放大等待感。
// 在应用空闲后预加载资源，不阻塞首屏，同时让真正打开 PDF 时可以复用缓存。
function schedulePdfWorkerPreload() {
  if (typeof document === 'undefined') return
  const preload = () => {
    if (document.head.querySelector('link[data-pulse-pdf-worker-preload]')) return
    const link = document.createElement('link')
    link.rel = 'preload'
    link.as = 'script'
    link.href = pdfWorkerUrl
    link.crossOrigin = 'anonymous'
    link.dataset.pulsePdfWorkerPreload = '1'
    document.head.appendChild(link)
  }
  const idle = (window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
  }).requestIdleCallback
  if (idle) idle(preload, { timeout: 2500 })
  else window.setTimeout(preload, 1200)
}

schedulePdfWorkerPreload()

const textContent = ref('')
const textLoading = ref(false)
const textTruncated = ref(false)
const previewUrl = ref('')
const previewLoading = ref(false)
const videoReady = ref(false)
const previewError = ref('')
const pdfPreviewReady = ref(false)
const pdfMount = ref<HTMLElement | null>(null)
const fileImageViewport = ref<HTMLElement | null>(null)
const fileImageScale = ref(1)
const fileImageOffset = ref({ x: 0, y: 0 })
const previewBlob = ref<Blob | null>(null)
let previewObjectUrl = ''
let cachedChatObjectUrl = ''
let activeMediaSource = ''
let mediaFallbackStarted = false
let previewRequestId = 0
let pdfDocument: PDFDocumentProxy | null = null
let pdfLoadingTask: PDFDocumentLoadingTask | null = null
let activePdfCacheKey = ''
let pdfRenderGeneration = 0
const FILE_REQUEST_TIMEOUT_MS = 30_000
const PDF_LOAD_TIMEOUT_MS = 30_000
const PDF_CACHE_TTL_MS = 10 * 60_000
const PDF_CACHE_LIMIT = 2

const pdfCache = new Map<string, { pdf: PDFDocumentProxy; touchedAt: number }>()

type FileImageTouchGesture =
  | { kind: 'pan'; x: number; y: number; offsetX: number; offsetY: number }
  | { kind: 'pinch'; distance: number; scale: number; offsetX: number; offsetY: number; midX: number; midY: number }
  | null

let fileImageGesture: FileImageTouchGesture = null
let fileImageHadMultipleTouches = false

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer = 0
  return new Promise<T>((resolve, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), timeoutMs)
    promise.then(resolve, reject)
  }).finally(() => {
    if (timer) window.clearTimeout(timer)
  })
}

function extOf(name: string): string {
  const lower = String(name || '').toLowerCase().trim()
  const dot = lower.lastIndexOf('.')
  if (dot < 0 || dot >= lower.length - 1) return ''
  return lower.slice(dot + 1)
}

type PreviewKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'document' | 'none'

let activeCacheFileId = ''
let activeCacheKind: 'image' | 'video' | 'file' | 'audio' | '' = ''
let activeCacheVariant: 'thumb' | 'preview' | 'original' = 'original'

function releaseActiveCacheUse(): void {
  if (activeCacheFileId && activeCacheKind) {
    markChatCacheInUse(activeCacheFileId, activeCacheVariant, false)
  }
  activeCacheFileId = ''
  activeCacheKind = ''
}

function markActiveCacheUse(kind: PreviewKind): void {
  releaseActiveCacheUse()
  const fileId = String(filePreviewState.fileId || '').trim()
  if (!fileId || kind === 'none') return
  activeCacheFileId = fileId
  activeCacheKind = kind === 'image' ? 'image' : kind === 'video' ? 'video' : kind === 'audio' ? 'audio' : 'file'
  activeCacheVariant = kind === 'document' ? 'preview' : 'original'
  markChatCacheInUse(activeCacheFileId, activeCacheVariant, true)
}

const DOCUMENT_EXTENSIONS = [
  'doc', 'docx', 'docm', 'dot', 'dotx', 'dotm', 'rtf', 'wps', 'wpt',
  'xls', 'xlsx', 'xlsm', 'xlt', 'xltx', 'xltm', 'csv', 'et',
  'ppt', 'pptx', 'pptm', 'pps', 'ppsx', 'ppsm', 'potx', 'potm', 'dpt', 'dps',
  'odt', 'ods', 'odp',
]

const previewKind = computed<PreviewKind>(() => {
  const ct = String(filePreviewState.contentType || '').toLowerCase()
  const ext = extOf(filePreviewState.name)
  if (ct.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'].includes(ext)) {
    return 'image'
  }
  if (ct.startsWith('video/') || ['mp4', 'webm', 'mov', 'm4v', '3gp'].includes(ext)) return 'video'
  if (ct.startsWith('audio/') || ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'amr', 'opus'].includes(ext)) return 'audio'
  if (ct === 'application/pdf' || ext === 'pdf') {
    return 'pdf'
  }
  if (DOCUMENT_EXTENSIONS.includes(ext) || /word|excel|sheet|powerpoint|presentation|opendocument/.test(ct)) {
    return 'document'
  }
  if (
    ct.startsWith('text/') ||
    ['txt', 'md', 'markdown', 'json', 'log', 'csv', 'xml', 'yaml', 'yml', 'ini', 'conf'].includes(ext)
  ) {
    return 'text'
  }
  return 'none'
})

watch(
  [
    () => filePreviewState.visible,
    () => filePreviewState.url,
    () => filePreviewState.name,
    () => filePreviewState.contentType,
    () => filePreviewState.fileId,
  ],
  ([visible]) => {
    if (!visible) {
      previewRequestId += 1
      destroyPdf()
      releaseActiveCacheUse()
      releasePreviewUrl()
      textContent.value = ''
      textTruncated.value = false
      textLoading.value = false
      previewLoading.value = false
      previewError.value = ''
      pdfPreviewReady.value = false
      resetFileImageGesture()
      return
    }
    if (!filePreviewState.url) return
    void loadPreview()
  },
  { immediate: true },
)

function releasePreviewUrl() {
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl)
    previewObjectUrl = ''
  }
  previewUrl.value = ''
  previewBlob.value = null
  activeMediaSource = ''
  mediaFallbackStarted = false
  videoReady.value = false
  if (cachedChatObjectUrl) {
    cachedChatObjectUrl = ''
  }
}

const fileImageTransform = computed(() => {
  if (isPdfGestureStage()) {
    // CSS zoom participates in layout, so the PDF stage can keep its native
    // vertical scroll range after a pinch instead of clipping transformed pages.
    return { transform: 'none', zoom: String(fileImageScale.value) }
  }
  return {
    transform: `translate3d(${fileImageOffset.value.x}px, ${fileImageOffset.value.y}px, 0) scale(${fileImageScale.value})`,
  }
})

function isPdfGestureStage(): boolean {
  return previewKind.value === 'pdf' || previewKind.value === 'document'
}

function resetFileImageGesture() {
  fileImageGesture = null
  fileImageHadMultipleTouches = false
  fileImageScale.value = 1
  fileImageOffset.value = { x: 0, y: 0 }
}

function clampFileImageOffset(x: number, y: number, scale = fileImageScale.value) {
  const viewport = fileImageViewport.value
  if (!viewport || scale <= 1) return { x: 0, y: 0 }
  const rect = viewport.getBoundingClientRect()
  const maxX = Math.max(0, rect.width * (scale - 1) / 2)
  const maxY = Math.max(0, rect.height * (scale - 1) / 2)
  return {
    x: Math.max(-maxX, Math.min(maxX, x)),
    y: Math.max(-maxY, Math.min(maxY, y)),
  }
}

function fileImageTouchDistance(touches: TouchList): number {
  const first = touches[0]
  const second = touches[1]
  if (!first || !second) return 1
  return Math.max(1, Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY))
}

function fileImageTouchMidpoint(touches: TouchList): { x: number; y: number } {
  const first = touches[0]
  const second = touches[1]
  if (!first || !second) return { x: first?.clientX || 0, y: first?.clientY || 0 }
  return {
    x: (first.clientX + second.clientX) / 2,
    y: (first.clientY + second.clientY) / 2,
  }
}

function fileImageTouchStart(event: TouchEvent) {
  if (event.touches.length >= 2) {
    const midpoint = fileImageTouchMidpoint(event.touches)
    fileImageGesture = {
      kind: 'pinch',
      distance: fileImageTouchDistance(event.touches),
      scale: fileImageScale.value,
      offsetX: fileImageOffset.value.x,
      offsetY: fileImageOffset.value.y,
      midX: midpoint.x,
      midY: midpoint.y,
    }
    fileImageHadMultipleTouches = true
    event.preventDefault()
    return
  }
  const touch = event.touches[0]
  if (!touch) return
  if (isPdfGestureStage()) {
    // PDF uses the browser's native vertical scrolling; a single finger must
    // never be treated as a custom drag gesture.
    fileImageGesture = null
    return
  }
  fileImageGesture = {
    kind: 'pan',
    x: touch.clientX,
    y: touch.clientY,
    offsetX: fileImageOffset.value.x,
    offsetY: fileImageOffset.value.y,
  }
  if (Math.abs(fileImageScale.value - 1) > 0.01) event.preventDefault()
}

function fileImageTouchMove(event: TouchEvent) {
  if (event.touches.length >= 2) {
    if (!fileImageGesture || fileImageGesture.kind !== 'pinch') {
      const midpoint = fileImageTouchMidpoint(event.touches)
      fileImageGesture = {
        kind: 'pinch',
        distance: fileImageTouchDistance(event.touches),
        scale: fileImageScale.value,
        offsetX: fileImageOffset.value.x,
        offsetY: fileImageOffset.value.y,
        midX: midpoint.x,
        midY: midpoint.y,
      }
    }
    const midpoint = fileImageTouchMidpoint(event.touches)
    const scale = Math.max(0.55, Math.min(4, fileImageGesture.scale * fileImageTouchDistance(event.touches) / fileImageGesture.distance))
    fileImageScale.value = scale
    if (isPdfGestureStage()) {
      fileImageOffset.value = { x: 0, y: 0 }
    } else {
      fileImageOffset.value = clampFileImageOffset(
        fileImageGesture.offsetX + midpoint.x - fileImageGesture.midX,
        fileImageGesture.offsetY + midpoint.y - fileImageGesture.midY,
        scale,
      )
    }
    fileImageHadMultipleTouches = true
    event.preventDefault()
    return
  }
  const touch = event.touches[0]
  if (!touch || !fileImageGesture || fileImageGesture.kind !== 'pan' || Math.abs(fileImageScale.value - 1) <= 0.01) return
  fileImageOffset.value = clampFileImageOffset(
    fileImageGesture.offsetX + touch.clientX - fileImageGesture.x,
    fileImageGesture.offsetY + touch.clientY - fileImageGesture.y,
  )
  if (Math.abs(fileImageScale.value - 1) > 0.01) {
    event.preventDefault()
  }
}

function fileImageTouchEnd(event: TouchEvent) {
  if (isPdfGestureStage()) {
    fileImageGesture = null
    fileImageHadMultipleTouches = false
    return
  }
  const hadMultipleTouches = fileImageHadMultipleTouches || fileImageGesture?.kind === 'pinch'
  if (event.touches.length === 1 && hadMultipleTouches) {
    const touch = event.touches[0]
    if (touch) {
      fileImageGesture = {
        kind: 'pan',
        x: touch.clientX,
        y: touch.clientY,
        offsetX: fileImageOffset.value.x,
        offsetY: fileImageOffset.value.y,
      }
    }
    event.preventDefault()
    return
  }
  if (!event.touches.length) {
    fileImageGesture = null
    fileImageHadMultipleTouches = false
  }
}

function fileImageDoubleClick() {
  const scale = fileImageScale.value > 1 ? 1 : 2.2
  fileImageScale.value = scale
  fileImageOffset.value = clampFileImageOffset(fileImageOffset.value.x, fileImageOffset.value.y, scale)
}

function destroyPdf() {
  pdfRenderGeneration += 1
  const loadingTask = pdfLoadingTask
  pdfLoadingTask = null
  if (loadingTask) void loadingTask.destroy().catch(() => {})
  const document = pdfDocument
  pdfDocument = null
  const cacheKey = activePdfCacheKey
  activePdfCacheKey = ''
  if (document && !cacheKey) void document.destroy().catch(() => {})
  pdfMount.value?.replaceChildren()
  pdfPreviewReady.value = false
}

function takeCachedPdf(source: string): PDFDocumentProxy | null {
  const cached = pdfCache.get(source)
  if (!cached) return null
  if (Date.now() - cached.touchedAt > PDF_CACHE_TTL_MS) {
    pdfCache.delete(source)
    void cached.pdf.destroy().catch(() => {})
    return null
  }
  cached.touchedAt = Date.now()
  return cached.pdf
}

function cachePdf(source: string, pdf: PDFDocumentProxy) {
  pdfCache.set(source, { pdf, touchedAt: Date.now() })
  while (pdfCache.size > PDF_CACHE_LIMIT) {
    const oldest = [...pdfCache.entries()].sort((a, b) => a[1].touchedAt - b[1].touchedAt)[0]
    if (!oldest) break
    pdfCache.delete(oldest[0])
    if (oldest[0] !== activePdfCacheKey) void oldest[1].pdf.destroy().catch(() => {})
  }
}

function documentPreviewUrl(source: string): string {
  const value = String(source || '').trim()
  const queryIndex = value.search(/[?#]/)
  const path = queryIndex >= 0 ? value.slice(0, queryIndex) : value
  const suffix = queryIndex >= 0 ? value.slice(queryIndex) : ''
  const marker = '/files/raw/'
  const markerIndex = path.lastIndexOf(marker)
  if (markerIndex < 0) return value
  const filename = path.slice(markerIndex + marker.length)
  if (!filename || filename.includes('/')) return value
  return `${path.slice(0, markerIndex)}/files/preview/${encodeURIComponent(filename)}${suffix}`
}

function isDirectMediaSource(source: string): boolean {
  if (/^(?:blob|data):/i.test(source)) return true
  if (!filePreviewState.fileId) return true
  try {
    const path = new URL(source, window.location.href).pathname
    return path.includes('/api/v1/files/raw/')
      || /\/api\/v1\/files\/[^/]+\/(download|preview)\/?$/i.test(path)
  } catch {
    return false
  }
}

async function authHeaders(): Promise<HeadersInit | undefined> {
  const token = await refreshTokenIfNeeded()
  return token ? { Authorization: `Bearer ${token}` } : undefined
}

async function pdfHttpHeaders(): Promise<Record<string, string> | undefined> {
  const token = await refreshTokenIfNeeded()
  return token ? { Authorization: `Bearer ${token}` } : undefined
}

async function fetchPreviewResponse(url: string, timeoutMs = FILE_REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      credentials: 'include',
      headers: await authHeaders(),
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('文件请求超时，请检查网络或重新登录')
    }
    throw error
  } finally {
    window.clearTimeout(timer)
  }
}

async function loadPreview() {
  const requestId = ++previewRequestId
  releaseActiveCacheUse()
  releasePreviewUrl()
  previewError.value = ''
  pdfPreviewReady.value = false
  previewLoading.value = true
  resetFileImageGesture()
  textContent.value = ''
  textTruncated.value = false
  destroyPdf()
  try {
    const kind = previewKind.value
    // PDF.js must receive an HTTP URL so it can use Range requests. Office
    // files use the authenticated fileId preview endpoint; only ordinary
    // non-PDF files are materialized into the local chat cache here.
    if (kind === 'none') return
    markActiveCacheUse(kind)
    const remoteSource = kind === 'document'
      ? (filePreviewState.fileId
        ? fileDocumentPreviewUrl(filePreviewState.fileId)
        : documentPreviewUrl(filePreviewState.url))
      : kind === 'pdf'
        ? filePreviewState.url
        : filePreviewState.url
    let source = remoteSource
    let pdfCacheHit = false
    if ((kind === 'document' || kind === 'pdf') && filePreviewState.fileId) {
      const cached = await getCachedChatFile(
        'file',
        filePreviewState.fileId,
        kind === 'document' ? 'preview' : 'original',
      )
      if (cached) {
        cachedChatObjectUrl = cached
        source = cached
        pdfCacheHit = true
      }
    }
    if (requestId !== previewRequestId || !filePreviewState.visible) return
    if (kind === 'document' || kind === 'pdf') {
      await loadPdfPreview(requestId, source)
      if (!pdfCacheHit && filePreviewState.fileId && remoteSource) {
        const variant = kind === 'document' ? 'preview' : 'original'
        void cacheChatFile('file', filePreviewState.fileId, variant, remoteSource)
          .catch(() => undefined)
      }
      return
    }
    if (previewKind.value === 'text') {
      const res = await fetchPreviewResponse(source)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const raw = await res.text()
      const MAX = 500 * 1024
      textTruncated.value = raw.length > MAX
      textContent.value = raw.slice(0, MAX)
      previewBlob.value = new Blob([raw], {
        type: res.headers.get('content-type')?.split(';')[0] || currentMime(),
      })
    } else if (previewKind.value === 'image' || previewKind.value === 'video' || previewKind.value === 'audio') {
      activeMediaSource = source
      mediaFallbackStarted = false
      if (isDirectMediaSource(source)) {
        // Raw media endpoints support native streaming and avoid downloading
        // the complete file before the first frame becomes visible.
        previewUrl.value = source
      } else {
        await loadMediaBlobPreview(requestId, source)
      }
    }
  } catch {
    previewError.value = '文件预览加载失败，请下载后查看。'
    if (previewKind.value === 'text') textContent.value = previewError.value
  } finally {
    if (requestId === previewRequestId) {
      previewLoading.value = false
      textLoading.value = false
    }
  }
}

async function loadMediaBlobPreview(requestId: number, source: string) {
  const res = await fetchPreviewResponse(source)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  if (!blob.size) throw new Error('empty file')
  const objectUrl = URL.createObjectURL(blob)
  if (requestId !== previewRequestId || !filePreviewState.visible) {
    URL.revokeObjectURL(objectUrl)
    return
  }
  previewBlob.value = blob
  previewObjectUrl = objectUrl
  previewUrl.value = objectUrl
}

async function fallbackMediaPreview() {
  if (!activeMediaSource || mediaFallbackStarted || previewUrl.value.startsWith('blob:')) return
  mediaFallbackStarted = true
  previewLoading.value = true
  previewError.value = ''
  try {
    await loadMediaBlobPreview(previewRequestId, activeMediaSource)
  } catch {
    previewError.value = '文件预览加载失败，请下载后查看。'
  } finally {
    if (filePreviewState.visible) previewLoading.value = false
  }
}

function onPreviewVideoReady() {
  videoReady.value = true
}

function onPreviewVideoError() {
  videoReady.value = false
  void fallbackMediaPreview()
}

async function loadPdfPreview(requestId: number, cachedSource = '') {
  const source = cachedSource || (
    previewKind.value === 'document'
      ? (filePreviewState.fileId
        ? fileDocumentPreviewUrl(filePreviewState.fileId)
        : documentPreviewUrl(filePreviewState.url))
      : filePreviewState.url
  )
  const cachedPdf = takeCachedPdf(source)
  if (cachedPdf) {
    if (requestId !== previewRequestId || !filePreviewState.visible) return
    pdfDocument = cachedPdf
    activePdfCacheKey = source
    pdfPreviewReady.value = true
    await nextTick()
    if (!pdfMount.value) throw new Error('PDF 预览容器未就绪')
    void renderPdfPages(cachedPdf, pdfRenderGeneration, requestId)
    return
  }

  // PDF.js can request byte ranges and render the first page before the whole
  // document arrives. This avoids downloading large PDFs into a JS Blob first.
  let loadingTask = getDocument({
    url: source,
    httpHeaders: await pdfHttpHeaders(),
    withCredentials: true,
    rangeChunkSize: 4 * 1024 * 1024,
    disableStream: false,
    // Only request the bytes needed for the first visible page initially.
    // Remaining pages are fetched as the incremental renderer advances, so a
    // large PDF does not compete with first-page parsing on a mobile network.
    disableAutoFetch: true,
  })
  pdfLoadingTask = loadingTask
  let pdf: PDFDocumentProxy
  try {
    pdf = await withTimeout(loadingTask.promise, PDF_LOAD_TIMEOUT_MS, 'PDF 引擎加载超时，请刷新后重试')
  } catch (error) {
    if (pdfLoadingTask === loadingTask) pdfLoadingTask = null
    void loadingTask.destroy().catch(() => {})
    if (requestId !== previewRequestId || !filePreviewState.visible) return

    // Some deployments do not expose CORS/range headers to PDF.js. Keep a
    // compatible authenticated Blob fallback for those servers.
    const res = await fetchPreviewResponse(source)
    if (!res.ok) throw error
    const data = new Uint8Array(await res.arrayBuffer())
    if (requestId !== previewRequestId || !filePreviewState.visible) return
    previewBlob.value = new Blob([data], { type: 'application/pdf' })
    loadingTask = getDocument({ data })
    pdfLoadingTask = loadingTask
    pdf = await withTimeout(loadingTask.promise, PDF_LOAD_TIMEOUT_MS, 'PDF 引擎加载超时，请刷新后重试')
  }
  pdfLoadingTask = null
  if (requestId !== previewRequestId || !filePreviewState.visible) {
    void pdf.destroy().catch(() => {})
    return
  }
  cachePdf(source, pdf)
  pdfDocument = pdf
  activePdfCacheKey = source
  pdfPreviewReady.value = true
  await nextTick()
  if (!pdfMount.value) throw new Error('PDF 预览容器未就绪')
  const generation = pdfRenderGeneration
  void renderPdfPages(pdf, generation, requestId)
}

async function renderPdfPages(pdf: PDFDocumentProxy, generation: number, requestId: number) {
  const mount = pdfMount.value
  if (!mount) return
  mount.replaceChildren()
  try {
    await renderPdfPage(pdf, 1, mount, generation, requestId)
    let pageNumber = 2
    const renderNextPage = () => {
      if (
        pageNumber > pdf.numPages
        || generation !== pdfRenderGeneration
        || requestId !== previewRequestId
        || !filePreviewState.visible
      ) return
      void renderPdfPage(pdf, pageNumber, mount, generation, requestId)
        .then(() => {
          pageNumber += 1
          // Yield between pages so opening a long PDF remains interactive.
          window.setTimeout(renderNextPage, 0)
        })
        .catch(() => {
          if (generation === pdfRenderGeneration && requestId === previewRequestId) {
            previewError.value = 'PDF 后续页面渲染失败，请下载后查看。'
          }
        })
    }
    renderNextPage()
  } catch {
    if (generation === pdfRenderGeneration && requestId === previewRequestId) {
      previewError.value = 'PDF 渲染失败，请下载后查看。'
      pdfPreviewReady.value = false
    }
  }
}

async function renderPdfPage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  mount: HTMLElement,
  generation: number,
  requestId: number,
) {
  if (generation !== pdfRenderGeneration || requestId !== previewRequestId || !filePreviewState.visible) return
  const page = await pdf.getPage(pageNumber)
  const baseViewport = page.getViewport({ scale: 1 })
  const width = Math.max(240, mount.clientWidth - 16)
  const scale = Math.min(2, Math.max(0.75, width / baseViewport.width))
  const viewport = page.getViewport({ scale })
  // 1.5x is enough for mobile reading and avoids the extra 2x canvas cost on
  // high-density phones, especially for large PDF pages.
  const outputScale = Math.min(window.devicePixelRatio || 1, 1.5)
  const wrapper = document.createElement('div')
  wrapper.className = 'fp-pdf-page'
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width * outputScale)
  canvas.height = Math.ceil(viewport.height * outputScale)
  canvas.style.width = `${Math.ceil(viewport.width)}px`
  canvas.style.height = `${Math.ceil(viewport.height)}px`
  wrapper.appendChild(canvas)
  mount.appendChild(wrapper)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('PDF 画布初始化失败')
  await page.render({
    canvasContext: context,
    viewport,
    transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
  }).promise
}

function guessMime(name: string): string {
  const ext = extOf(name)
  if (ext === 'mp4' || ext === 'm4v') return 'video/mp4'
  if (ext === 'webm') return 'video/webm'
  if (ext === 'mov') return 'video/quicktime'
  if (ext === 'mp3') return 'audio/mpeg'
  if (ext === 'wav') return 'audio/wav'
  if (ext === 'm4a') return 'audio/mp4'
  if (ext === 'ogg' || ext === 'opus') return 'audio/ogg'
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'zip' || ext === 'rar' || ext === '7z') return 'application/zip'
  if (ext === 'doc') return 'application/msword'
  if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (ext === 'docm') return 'application/vnd.ms-word.document.macroEnabled.12'
  if (ext === 'dot') return 'application/msword'
  if (ext === 'dotx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.template'
  if (ext === 'dotm') return 'application/vnd.ms-word.template.macroEnabled.12'
  if (ext === 'xls') return 'application/vnd.ms-excel'
  if (ext === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (ext === 'xlsm') return 'application/vnd.ms-excel.sheet.macroEnabled.12'
  if (ext === 'xlt' || ext === 'xltx' || ext === 'xltm') return 'application/vnd.ms-excel'
  if (ext === 'csv') return 'text/csv'
  if (ext === 'ppt') return 'application/vnd.ms-powerpoint'
  if (ext === 'pptx') return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  if (ext === 'pptm') return 'application/vnd.ms-powerpoint.presentation.macroEnabled.12'
  if (ext === 'pps') return 'application/vnd.ms-powerpoint'
  if (ext === 'ppsx') return 'application/vnd.openxmlformats-officedocument.presentationml.slideshow'
  if (ext === 'ppsm') return 'application/vnd.ms-powerpoint.slideshow.macroEnabled.12'
  if (ext === 'txt' || ext === 'md' || ext === 'log' || ext === 'csv') return 'text/plain'
  return 'application/octet-stream'
}

function currentMime(): string {
  const supplied = String(filePreviewState.contentType || '').trim().toLowerCase()
  if (supplied && supplied !== 'application/octet-stream' && supplied !== 'binary/octet-stream') {
    return supplied
  }
  return guessMime(filePreviewState.name || '')
}

function nativePreviewFilename(name: string): string {
  if (previewKind.value !== 'document') return name || '文件'
  const value = String(name || '文件').trim()
  const dot = value.lastIndexOf('.')
  const stem = dot > 0 ? value.slice(0, dot) : value
  return `${stem || '文件'}.pdf`
}

function nativePreviewMime(): string {
  return previewKind.value === 'document' || previewKind.value === 'pdf'
    ? 'application/pdf'
    : currentMime()
}

async function downloadViaBlob(url: string, filename: string) {
  const res = await fetchPreviewResponse(url)
  if (!res.ok) throw new Error(`下载失败（${res.status}）`)
  const blob = await res.blob()
  const obj = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = obj
  a.setAttribute('download', filename || '文件')
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.setTimeout(() => URL.revokeObjectURL(obj), 30_000)
}

async function downloadCurrentFile() {
  const { url, name } = filePreviewState
  if (!url) return
  showLoadingToast({ message: '正在下载…', forbidClick: true, duration: 0, zIndex: 21001 })
  try {
    if (isNativeApp && isAndroid) {
      await nativeMediaGallery.downloadFile(url, name || '文件', currentMime())
      showToast({ message: '已开始下载，请在通知栏或文件管理中查看', zIndex: 21001 })
    } else {
      await downloadViaBlob(url, name || '文件')
      showToast({ message: '已开始下载', zIndex: 21001 })
    }
  } catch (e) {
    showToast({ message: e instanceof Error ? e.message : '下载失败', zIndex: 21001 })
  } finally {
    closeToast()
  }
}

async function openExternally() {
  const { url, name } = filePreviewState
  if (!url) return
  const externalUrl = previewKind.value === 'document'
    ? (filePreviewState.fileId ? fileDocumentPreviewUrl(filePreviewState.fileId) : documentPreviewUrl(url))
    : url
  // 必须在点击事件中立即创建窗口，否则等待鉴权文件请求完成后，
  // 移动浏览器可能把 window.open 当成非用户操作而拦截。
  const popup = isNativeApp && isAndroid ? null : window.open('', '_blank')
  if (popup) {
    try {
      popup.document.title = name || '文件预览'
      popup.document.body.innerHTML = '<p style="font:14px sans-serif;color:#666;text-align:center;margin-top:40vh">正在加载文件…</p>'
    } catch {
      // Some browsers expose a restricted popup document; navigation below still works.
    }
  }
  showLoadingToast({ message: '正在准备文件…', forbidClick: true, duration: 0, zIndex: 21001 })
  let objectUrl = ''
  try {
    if (isNativeApp && isAndroid) {
      if (previewBlob.value?.size) {
        await nativeMediaGallery.openBlob(
          previewBlob.value,
          nativePreviewFilename(name || '文件'),
          nativePreviewMime(),
        )
        showToast({ message: '已使用其他应用打开', zIndex: 21001 })
      } else {
        await nativeMediaGallery.downloadAndOpen(url, name || '文件', currentMime())
        showToast({ message: '预览未完成，已下载后选择应用打开', zIndex: 21001 })
      }
      return
    }

    // 浏览器不能直接把 Authorization 传给新窗口；先带登录态取 Blob，
    // 再导航到 Blob URL，避免新窗口收到 401。
    const res = await fetchPreviewResponse(externalUrl)
    if (!res.ok) throw new Error(`打开失败（${res.status}）`)
    const blob = await res.blob()
    if (!blob.size) throw new Error('文件为空')
    objectUrl = URL.createObjectURL(blob)
    if (popup) {
      popup.location.replace(objectUrl)
      const popupUrl = objectUrl
      window.setTimeout(() => URL.revokeObjectURL(popupUrl), 120_000)
    } else {
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = name || '文件'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(objectUrl)
      objectUrl = ''
      showToast({ message: '浏览器阻止了新窗口，文件已下载', zIndex: 21001 })
    }
  } catch (e) {
    showToast({ message: e instanceof Error ? e.message : '打开失败，请先下载', zIndex: 21001 })
    if (popup && !popup.closed) popup.close()
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  } finally {
    closeToast()
  }
}

function onClose() {
  closeFilePreview()
}

function onForward() {
  const action = filePreviewState.onForward
  closeFilePreview()
  action?.()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="filePreviewState.visible"
      class="fp-root"
      role="dialog"
      aria-modal="true"
    >
      <div class="fp-mask" @click="onClose" />

      <div class="fp-chrome">
        <div class="fp-title-wrap">
          <span class="material-symbols-outlined fp-file-icon">description</span>
          <div class="fp-title-meta">
            <strong class="fp-title">{{ filePreviewState.name }}</strong>
            <small v-if="filePreviewState.size" class="fp-sub">{{ formatFileSize(filePreviewState.size) }}</small>
          </div>
        </div>
        <div class="fp-header-actions">
          <button
            v-if="filePreviewState.onForward"
            type="button"
            class="fp-forward"
            @click="onForward"
          >转发</button>
          <button type="button" class="fp-close" @click="onClose">关闭</button>
        </div>
      </div>

      <div class="fp-stage">
        <div
          v-if="previewKind === 'image' && previewUrl"
          ref="fileImageViewport"
          class="fp-zoom-viewport"
          @touchstart="fileImageTouchStart"
          @touchmove="fileImageTouchMove"
          @touchend="fileImageTouchEnd"
          @touchcancel="fileImageTouchEnd"
          @dblclick.prevent="fileImageDoubleClick"
        >
          <img
            :src="previewUrl"
            :alt="filePreviewState.name"
            class="fp-image"
            :style="fileImageTransform"
            @error="fallbackMediaPreview"
          />
        </div>

        <div
          v-else-if="previewKind === 'video' && previewUrl"
          ref="fileImageViewport"
          class="fp-zoom-viewport"
          @touchstart="fileImageTouchStart"
          @touchmove="fileImageTouchMove"
          @touchend="fileImageTouchEnd"
          @touchcancel="fileImageTouchEnd"
          @dblclick.prevent="fileImageDoubleClick"
        >
          <video
            :src="previewUrl"
            crossorigin="use-credentials"
            class="fp-video"
            :class="{ 'fp-video-ready': videoReady }"
            :style="fileImageTransform"
            controls
            playsinline
            preload="metadata"
            @loadeddata="onPreviewVideoReady"
            @canplay="onPreviewVideoReady"
            @playing="onPreviewVideoReady"
            @error="onPreviewVideoError"
          />
          <div v-if="!videoReady" class="fp-video-loading">视频加载中…</div>
        </div>

        <audio
          v-else-if="previewKind === 'audio' && previewUrl"
          :src="previewUrl"
          class="fp-audio"
          controls
          preload="metadata"
          @error="fallbackMediaPreview"
        />

        <div
          v-else-if="(previewKind === 'document' || previewKind === 'pdf') && pdfPreviewReady"
          ref="fileImageViewport"
          class="fp-pdf-stage"
          @touchstart="fileImageTouchStart"
          @touchmove="fileImageTouchMove"
          @touchend="fileImageTouchEnd"
          @touchcancel="fileImageTouchEnd"
          @dblclick.prevent="fileImageDoubleClick"
        >
          <div ref="pdfMount" class="fp-pdf-mount" :style="fileImageTransform" />
        </div>

        <div v-else-if="previewKind === 'text'" class="fp-text-wrap">
          <pre class="fp-text">{{ textContent }}</pre>
          <p v-if="textLoading || previewLoading" class="fp-hint">加载中…</p>
          <p v-if="textTruncated" class="fp-hint">文件较大，仅预览前 500KB，完整内容请下载查看。</p>
        </div>

        <div v-else-if="previewLoading" class="fp-unsupported">
          <span class="material-symbols-outlined fp-unsupported-icon">progress_activity</span>
          <p>正在加载预览…</p>
        </div>

        <div v-else class="fp-unsupported">
          <span class="material-symbols-outlined fp-unsupported-icon">folder_open</span>
          <p v-if="previewError">{{ previewError }}</p>
          <p v-else>该类型暂不支持页内预览，可下载后用本地应用打开。</p>
        </div>
      </div>

      <div class="fp-actions">
        <button type="button" class="fp-action" @click="openExternally">
          <span class="material-symbols-outlined">open_in_new</span>
          {{ isNativeApp && isAndroid ? '用其他应用打开' : '新窗口打开' }}
        </button>
        <button type="button" class="fp-action primary" @click="downloadCurrentFile">
          <span class="material-symbols-outlined">download</span>
          下载
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.fp-root {
  position: fixed;
  inset: 0;
  z-index: 19000;
  display: flex;
  flex-direction: column;
  background: #121317;
}

.fp-mask {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: #121317;
}

.fp-chrome {
  position: relative;
  z-index: 3;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: calc(var(--pulse-safe-top, 0px) + 8px) 12px 8px;
  background: rgba(0, 0, 0, 0.72);
}

.fp-title-wrap {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.fp-file-icon {
  flex: 0 0 auto;
  color: #adc6ff;
  font-size: 24px;
}

.fp-title-meta {
  min-width: 0;
}

.fp-title {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #f4f4f6;
  font-size: 15px;
  font-weight: 600;
}

.fp-sub {
  color: rgba(255, 255, 255, 0.55);
  font-size: 12px;
}

.fp-close {
  flex: 0 0 auto;
  min-width: 64px;
  height: 36px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.fp-header-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.fp-forward {
  flex: 0 0 auto;
  min-width: 52px;
  height: 36px;
  padding: 0 10px;
  border: 0;
  background: transparent;
  color: #adc6ff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.fp-stage {
  position: relative;
  z-index: 1;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px 12px;
  box-sizing: border-box;
  overflow: hidden;
}

.fp-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  transform-origin: center center;
  will-change: transform;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.fp-zoom-viewport {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  touch-action: none;
  cursor: grab;
}

.fp-zoom-viewport:active {
  cursor: grabbing;
}

.fp-video {
  max-width: 100%;
  max-height: 100%;
  background: #000;
  border-radius: 8px;
  transform-origin: center center;
  will-change: transform;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.fp-video:not(.fp-video-ready) {
  visibility: hidden;
}

.fp-video-loading {
  position: absolute;
  z-index: 1;
  color: rgba(255, 255, 255, .76);
  font-size: 14px;
  pointer-events: none;
}
.fp-audio { width: min(100%, 420px); }

.fp-pdf-stage {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  overflow-x: auto;
  overflow-y: auto;
  touch-action: pan-x pan-y;
  overscroll-behavior: contain;
  border-radius: 4px;
  background: #525659;
}

.fp-pdf-mount {
  width: 100%;
  min-height: 100%;
  padding: 8px 0 18px;
  box-sizing: border-box;
  transform-origin: center top;
  will-change: transform;
}

.fp-pdf-page {
  display: flex;
  justify-content: center;
  margin: 0 auto 10px;
  padding: 0 8px;
  box-sizing: border-box;
}

.fp-pdf-page canvas {
  display: block;
  max-width: 100%;
  height: auto;
  background: #fff;
  box-shadow: 0 1px 5px rgba(0, 0, 0, 0.28);
}

.fp-text-wrap {
  width: 100%;
  height: 100%;
  overflow: auto;
  background: #1a1b1f;
  border-radius: 6px;
  -webkit-overflow-scrolling: touch;
}

.fp-text {
  margin: 0;
  padding: 14px;
  white-space: pre-wrap;
  word-break: break-word;
  color: #e3e2e7;
  font-size: 13px;
  line-height: 1.6;
}

.fp-hint {
  margin: 0;
  padding: 8px 14px 14px;
  color: #c1c6d7;
  font-size: 12px;
}

.fp-unsupported {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px;
  text-align: center;
  color: #c1c6d7;
  font-size: 14px;
  line-height: 1.6;
}

.fp-unsupported p {
  margin: 0;
}

.fp-unsupported-icon {
  font-size: 56px;
  color: #8b90a0;
}

.fp-actions {
  position: relative;
  z-index: 3;
  flex: 0 0 auto;
  display: flex;
  gap: 10px;
  padding: 10px 12px calc(var(--pulse-safe-bottom, 0px) + 10px);
  background: rgba(0, 0, 0, 0.72);
}

.fp-action {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 46px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 23px;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.fp-action.primary {
  border-color: transparent;
  background: linear-gradient(135deg, #4b8eff, #6675f5);
  color: #fff;
}
</style>

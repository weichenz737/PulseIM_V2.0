<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { showToast } from 'vant'
import { nativeMediaGallery } from '@/native'
import type { NativeMediaAsset } from '@/native/mediaGallery'

interface Props {
  show: boolean
  files: File[]
  galleryAssets?: NativeMediaAsset[]
  galleryLoading?: boolean
  original?: boolean
  initialMode?: 'grid' | 'preview' | 'trim'
  directSend?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  cancel: []
  edit: [payload: { index: number; imageIndices: number[]; files: File[] }]
  replace: [payload: { index: number; file: File }]
  send: [payload: { files: File[]; original: boolean }]
  loadMore: []
}>()

type PickerMode = 'grid' | 'preview' | 'trim'
type MediaFilter = 'all' | 'image' | 'video'

const mode = ref<PickerMode>('grid')
const mediaFilter = ref<MediaFilter>('all')
const showFilterMenu = ref(false)
const selected = ref<number[]>([])
const previewFileIndex = ref(0)
const previewSelectionOnly = ref(true)
const previewTouchStartX = ref<number | null>(null)
const objectUrls = ref<string[]>([])
const durations = ref<Record<number, number>>({})
const original = ref(!!props.original)
const trimStart = ref(0)
const trimEnd = ref(0)
const trimDuration = ref(0)
const trimBusy = ref(false)
const trimFrames = ref<string[]>([])
const trimFramesLoading = ref(false)
const trimDragHandle = ref<'start' | 'end' | null>(null)
const previewVideoReady = ref(false)
const trimVideoReady = ref(false)
let trimFrameLoadToken = 0
const galleryPlaceholderFiles = ref<File[]>([])
const resolvedGalleryFiles = ref<Array<File | null>>([])
const galleryLoadingIndex = ref<number | null>(null)

const galleryMode = computed(() => !!props.galleryAssets?.length)
const effectiveFiles = computed(() => galleryMode.value ? galleryPlaceholderFiles.value : props.files)
const selectedIndices = computed(() => selected.value.filter((index) => !!effectiveFiles.value[index]))
const selectedFiles = computed(() => selectedIndices.value
  .map((index) => effectiveFiles.value[index] || null)
  .filter((file): file is File => !!file))
const visibleIndices = computed(() => effectiveFiles.value
  .map((file, index) => ({ file, index }))
  .filter(({ file }) => mediaFilter.value === 'all' || (mediaFilter.value === 'image' ? isImageFile(file) : isVideoFile(file)))
  .map(({ index }) => index))
// 点击底部“预览”时只浏览已选媒体；直接点击网格中的媒体时，进入完整的
// 当前筛选结果，方便先查看内容，再通过右上角圆圈决定是否选中。
const previewIndices = computed(() => previewSelectionOnly.value ? selectedIndices.value : visibleIndices.value)
const currentFile = computed(() => effectiveFiles.value[previewFileIndex.value] || null)
const currentUrl = computed(() => objectUrls.value[previewFileIndex.value]
  || props.galleryAssets?.[previewFileIndex.value]?.thumbnail
  || '')
const currentPreviewIndex = computed(() => previewIndices.value.indexOf(previewFileIndex.value))
const currentPosition = computed(() => currentPreviewIndex.value >= 0 ? currentPreviewIndex.value + 1 : 0)
const currentSelected = computed(() => selectedIndices.value.includes(previewFileIndex.value))
const currentIsVideo = computed(() => isVideoFile(currentFile.value))
const mediaFilterLabel = computed(() => mediaFilter.value === 'image' ? '图片' : mediaFilter.value === 'video' ? '视频' : '图片和视频')
const trimStartPercent = computed(() => trimDuration.value > 0
  ? `${Math.max(0, Math.min(100, (trimStart.value / trimDuration.value) * 100))}%`
  : '0%')
const trimEndPercent = computed(() => trimDuration.value > 0
  ? `${Math.max(0, Math.min(100, (trimEnd.value / trimDuration.value) * 100))}%`
  : '100%')
const trimSelectionWidth = computed(() => trimDuration.value > 0
  ? `${Math.max(0, Math.min(100, ((trimEnd.value - trimStart.value) / trimDuration.value) * 100))}%`
  : '100%')

function isVideoFile(file: File | null | undefined): boolean {
  if (!file) return false
  return file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v|3gp|3gpp)$/i.test(file.name)
}

function isImageFile(file: File | null | undefined): boolean {
  if (!file) return false
  return file.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(file.name)
}

function displayUrl(index: number): string {
  return objectUrls.value[index] || props.galleryAssets?.[index]?.thumbnail || ''
}

function durationFor(index: number): number {
  return durations.value[index] || Number(props.galleryAssets?.[index]?.duration || 0)
}

function makeGalleryPlaceholder(asset: NativeMediaAsset): File {
  try {
    return new File([], asset.name || 'pulse_media', {
      type: asset.mimeType || 'application/octet-stream',
      lastModified: asset.createdAt ? asset.createdAt * 1000 : Date.now(),
    })
  } catch {
    return new Blob([], { type: asset.mimeType || 'application/octet-stream' }) as File
  }
}

function base64ToBytes(data: string): Uint8Array {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

async function ensureFile(index: number): Promise<File | null> {
  const existing = resolvedGalleryFiles.value[index]
  if (!galleryMode.value) return effectiveFiles.value[index] || null
  if (existing) return existing
  const asset = props.galleryAssets?.[index]
  if (!asset || galleryLoadingIndex.value === index) return null
  galleryLoadingIndex.value = index
  try {
    const payload = await nativeMediaGallery.readMedia(asset.uri)
    const file = new File([base64ToBytes(payload.data)], asset.name || `pulse_media_${index}`, {
      type: payload.mimeType || asset.mimeType || 'application/octet-stream',
      lastModified: asset.createdAt ? asset.createdAt * 1000 : Date.now(),
    })
    resolvedGalleryFiles.value[index] = file
    objectUrls.value[index] = URL.createObjectURL(file)
    return file
  } catch (error) {
    showToast(error instanceof Error ? error.message : '读取媒体失败')
    return null
  } finally {
    if (galleryLoadingIndex.value === index) galleryLoadingIndex.value = null
  }
}

function revokeObjectUrls() {
  objectUrls.value.forEach((url) => URL.revokeObjectURL(url))
  objectUrls.value = []
}

function syncFiles(resetSelection = false) {
  const keepPreview = mode.value === 'preview' || mode.value === 'trim'
  const previousIndex = previewFileIndex.value
  const previousSelected = new Set(selected.value)
  revokeObjectUrls()
  galleryPlaceholderFiles.value = (props.galleryAssets || []).map(makeGalleryPlaceholder)
  resolvedGalleryFiles.value = (props.galleryAssets || []).map(() => null)
  objectUrls.value = effectiveFiles.value.map((file) => galleryMode.value ? '' : URL.createObjectURL(file))
  const fileCount = effectiveFiles.value.length
  selected.value = galleryMode.value
    ? (resetSelection
      ? []
      : effectiveFiles.value.map((_, index) => index).filter((index) => previousSelected.has(index)))
    : (resetSelection || !previousSelected.size
      ? effectiveFiles.value.map((_, index) => index)
      : effectiveFiles.value.map((_, index) => index).filter((index) => previousSelected.has(index)))
  previewFileIndex.value = keepPreview && effectiveFiles.value[previousIndex]
    ? previousIndex
    : selected.value[0] ?? 0
  mode.value = resetSelection && fileCount && props.initialMode
    ? props.initialMode
    : keepPreview && fileCount
      ? mode.value
      : 'grid'
  durations.value = {}
  if (!keepPreview) original.value = !!props.original
  if (!effectiveFiles.value[previewFileIndex.value]) previewFileIndex.value = visibleIndices.value[0] ?? 0
  trimStart.value = 0
  trimEnd.value = 0
  trimDuration.value = 0
  trimFrames.value = []
  trimFramesLoading.value = false
  trimDragHandle.value = null
  trimFrameLoadToken += 1
}

watch([() => props.files, () => props.galleryAssets], () => syncFiles(), { immediate: true })
watch(() => props.show, (visible) => {
  if (visible) {
    mediaFilter.value = 'all'
    showFilterMenu.value = false
    syncFiles(true)
  }
})
watch([mode, previewFileIndex, currentUrl], () => {
  previewVideoReady.value = false
  trimVideoReady.value = false
})

onBeforeUnmount(revokeObjectUrls)

function close() {
  mode.value = 'grid'
  previewSelectionOnly.value = true
  showFilterMenu.value = false
  emit('cancel')
}

function setMediaFilter(filter: MediaFilter) {
  mediaFilter.value = filter
  showFilterMenu.value = false
}

function onGridScroll(event: Event) {
  const target = event.currentTarget as HTMLElement | null
  if (!target) return
  const remaining = target.scrollHeight - target.scrollTop - target.clientHeight
  if (remaining <= Math.max(120, target.clientHeight * 0.35)) emit('loadMore')
}

function toggleSelected(index: number) {
  const next = new Set(selected.value)
  if (next.has(index)) next.delete(index)
  else next.add(index)
  selected.value = [...next].sort((a, b) => a - b)
  if (previewSelectionOnly.value && !selected.value.includes(previewFileIndex.value)) {
    previewFileIndex.value = selected.value[0] ?? visibleIndices.value[0] ?? 0
  }
}

function openPreview(index?: number) {
  const target = index != null ? index : selectedIndices.value[0]
  if (target == null || !effectiveFiles.value[target]) {
    showToast('请先选择图片或视频')
    return
  }
  previewSelectionOnly.value = index == null
  previewFileIndex.value = target
  mode.value = 'preview'
  // 先显示原生缩略图，完整媒体在后台读取，避免点击图片后卡在相册页。
  if (galleryMode.value) void ensureFile(target)
}

function backToGrid() {
  mode.value = 'grid'
}

// 供宿主页处理 Android 返回键：预览/裁剪是相册内部页面，先逐级返回，
// 只有已经回到网格页时才允许宿主关闭整个相册。
function handleBack(): boolean {
  if (mode.value === 'trim') {
    mode.value = 'preview'
    return true
  }
  if (mode.value === 'preview') {
    backToGrid()
    return true
  }
  return false
}

async function selectPreviewFile(index: number) {
  previewFileIndex.value = index
  if (galleryMode.value) void ensureFile(index)
}

function toggleCurrentSelection() {
  if (currentFile.value) toggleSelected(previewFileIndex.value)
}

async function switchPreview(delta: number) {
  const indices = previewIndices.value
  if (!indices.length) return
  const current = Math.max(0, currentPreviewIndex.value)
  const nextPosition = Math.max(0, Math.min(indices.length - 1, current + delta))
  const next = indices[nextPosition]
  if (next === undefined || next === previewFileIndex.value) return
  previewFileIndex.value = next
  if (galleryMode.value) void ensureFile(next)
}

function onPreviewTouchStart(event: TouchEvent) {
  previewTouchStartX.value = event.touches[0]?.clientX ?? null
}

function onPreviewTouchEnd(event: TouchEvent) {
  const startX = previewTouchStartX.value
  previewTouchStartX.value = null
  const endX = event.changedTouches[0]?.clientX
  if (startX == null || endX == null || Math.abs(endX - startX) < 45) return
  void switchPreview(endX < startX ? 1 : -1)
}

async function editCurrent() {
  const index = previewFileIndex.value
  const file = await ensureFile(index)
  if (!file) return
  if (!currentSelected.value) {
    // 单张预览中的“编辑/裁剪”默认作用于当前媒体，先自动加入选择集。
    toggleSelected(index)
  }
  if (isImageFile(file)) {
    const imageIndices = selectedIndices.value.filter((selectedIndex) => isImageFile(effectiveFiles.value[selectedIndex]))
    const files = (await Promise.all(imageIndices.map((selectedIndex) => ensureFile(selectedIndex))))
      .filter((selectedFile): selectedFile is File => !!selectedFile)
    if (files.length !== imageIndices.length) {
      showToast('图片加载失败，请重试')
      return
    }
    emit('edit', {
      index: previewFileIndex.value,
      imageIndices,
      files,
    })
    return
  }
  if (isVideoFile(file)) openTrim(previewFileIndex.value)
}

function rememberDuration(index: number, event: Event) {
  const duration = Number((event.currentTarget as HTMLVideoElement).duration)
  if (!Number.isFinite(duration) || duration <= 0) return
  durations.value = { ...durations.value, [index]: duration }
  if (index === previewFileIndex.value && !trimDuration.value) {
    trimDuration.value = duration
    trimEnd.value = duration
  }
}

function formatDuration(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return ''
  const seconds = Math.max(0, Math.round(value))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function openTrim(index: number) {
  const duration = durations.value[index] || 0
  previewFileIndex.value = index
  trimStart.value = 0
  trimDuration.value = duration
  trimEnd.value = duration
  trimFrames.value = []
  trimFramesLoading.value = false
  trimFrameLoadToken += 1
  mode.value = 'trim'
}

function onTrimMetadata(event: Event) {
  const duration = Number((event.currentTarget as HTMLVideoElement).duration)
  if (!Number.isFinite(duration) || duration <= 0) return
  trimDuration.value = duration
  trimEnd.value = Math.min(trimEnd.value || duration, duration)
  void loadTrimFrames()
}

function onPreviewVideoReady() {
  previewVideoReady.value = true
}

function onTrimVideoReady() {
  trimVideoReady.value = true
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('视频缩略图读取失败'))
    }
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
    }
    video.addEventListener('seeked', onSeeked, { once: true })
    video.addEventListener('error', onError, { once: true })
    video.currentTime = Math.max(0, time)
  })
}

async function loadTrimFrames() {
  const url = currentUrl.value
  const duration = trimDuration.value
  if (!url || !currentIsVideo.value || !duration || trimFramesLoading.value) return
  const token = ++trimFrameLoadToken
  trimFramesLoading.value = true
  trimFrames.value = []
  const video = document.createElement('video')
  const canvas = document.createElement('canvas')
  video.src = url
  video.preload = 'auto'
  video.muted = true
  video.playsInline = true
  video.style.position = 'fixed'
  video.style.left = '-10000px'
  video.style.top = '0'
  video.style.width = '2px'
  video.style.height = '2px'
  document.body.appendChild(video)
  try {
    await waitForEvent(video, 'loadedmetadata')
    const frameCount = 10
    canvas.width = 160
    canvas.height = 90
    const context = canvas.getContext('2d')
    if (!context) return
    const frames: string[] = []
    for (let index = 0; index < frameCount; index += 1) {
      if (token !== trimFrameLoadToken) return
      await seekVideo(video, duration * (index / Math.max(1, frameCount - 1)))
      context.drawImage(video, 0, 0, canvas.width, canvas.height)
      frames.push(canvas.toDataURL('image/jpeg', 0.72))
      trimFrames.value = [...frames]
    }
  } catch {
    // A video can still be trimmed without the optional filmstrip.
  } finally {
    video.pause()
    video.removeAttribute('src')
    video.load()
    video.remove()
    if (token === trimFrameLoadToken) trimFramesLoading.value = false
  }
}

function trimRatioFromPointer(event: PointerEvent): number {
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  if (!rect.width) return 0
  return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
}

function updateTrimFromPointer(event: PointerEvent) {
  if (!trimDragHandle.value || !trimDuration.value) return
  const value = trimRatioFromPointer(event) * trimDuration.value
  if (trimDragHandle.value === 'start') {
    trimStart.value = Math.max(0, Math.min(value, trimEnd.value - 0.2))
  } else {
    trimEnd.value = Math.min(trimDuration.value, Math.max(value, trimStart.value + 0.2))
  }
}

function startTrimDrag(event: PointerEvent) {
  if (!trimDuration.value) return
  const ratio = trimRatioFromPointer(event)
  const startRatio = trimStart.value / trimDuration.value
  const endRatio = trimEnd.value / trimDuration.value
  trimDragHandle.value = Math.abs(ratio - startRatio) <= Math.abs(ratio - endRatio) ? 'start' : 'end'
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture?.(event.pointerId)
  updateTrimFromPointer(event)
}

function endTrimDrag(event: PointerEvent) {
  const target = event.currentTarget as HTMLElement
  if (target.hasPointerCapture?.(event.pointerId)) target.releasePointerCapture?.(event.pointerId)
  trimDragHandle.value = null
}

function pickRecorderMime(): string {
  const options = [
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ]
  return options.find((value) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(value)) || 'video/webm'
}

function waitForEvent(target: EventTarget, eventName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onEvent = () => {
      target.removeEventListener(eventName, onEvent)
      target.removeEventListener('error', onError)
      resolve()
    }
    const onError = () => {
      target.removeEventListener(eventName, onEvent)
      target.removeEventListener('error', onError)
      reject(new Error('视频读取失败'))
    }
    target.addEventListener(eventName, onEvent, { once: true })
    target.addEventListener('error', onError, { once: true })
  })
}

async function createTrimmedVideo(file: File, start: number, end: number): Promise<File> {
  const sourceUrl = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.src = sourceUrl
  video.preload = 'auto'
  video.playsInline = true
  video.muted = false
  document.body.appendChild(video)
  try {
    await waitForEvent(video, 'loadedmetadata')
    const captureStream = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream
    if (!captureStream || typeof MediaRecorder === 'undefined') {
      throw new Error('当前设备暂不支持视频裁剪')
    }
    video.currentTime = Math.max(0, start)
    await waitForEvent(video, 'seeked')
    const stream = captureStream.call(video)
    const mime = pickRecorderMime()
    const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    const chunks: Blob[] = []
    const stopped = new Promise<Blob>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data)
      }
      recorder.onerror = () => reject(new Error('视频裁剪失败'))
      recorder.onstop = () => resolve(new Blob(chunks, { type: mime.split(';')[0] || file.type || 'video/webm' }))
    })
    recorder.start(100)
    await video.play()
    await new Promise((resolve) => window.setTimeout(resolve, Math.max(200, (end - start) * 1000)))
    video.pause()
    if (recorder.state !== 'inactive') recorder.stop()
    const blob = await stopped
    stream.getTracks().forEach((track) => track.stop())
    if (!blob.size) throw new Error('视频裁剪失败')
    const extension = mime.includes('mp4') ? 'mp4' : 'webm'
    const name = file.name.replace(/\.[^.]+$/, '') || 'video'
    return new File([blob], `${name}_trimmed.${extension}`, {
      type: blob.type || file.type || `video/${extension}`,
      lastModified: Date.now(),
    })
  } finally {
    video.pause()
    video.removeAttribute('src')
    video.load()
    video.remove()
    URL.revokeObjectURL(sourceUrl)
  }
}

async function applyTrim() {
  const index = previewFileIndex.value
  const file = await ensureFile(index)
  if (!file || !isVideoFile(file) || trimEnd.value - trimStart.value >= (trimDuration.value || Infinity) - 0.05) {
    if (props.directSend) sendSelected()
    else mode.value = 'preview'
    return
  }
  trimBusy.value = true
  try {
    const trimmed = await createTrimmedVideo(file, trimStart.value, trimEnd.value)
    const nextFiles = effectiveFiles.value.slice()
    nextFiles[index] = trimmed
    emit('replace', { index, file: trimmed })
    if (props.directSend) sendSelected(nextFiles.filter((_, fileIndex) => selected.value.includes(fileIndex)))
    else mode.value = 'preview'
  } catch (error) {
    showToast(error instanceof Error ? error.message : '视频裁剪失败')
  } finally {
    trimBusy.value = false
  }
}

async function sendSelected(files?: File[]) {
  const filesToSend = files || (galleryMode.value
    ? (await Promise.all(selectedIndices.value.map((index) => ensureFile(index)))).filter((file): file is File => !!file)
    : selectedFiles.value)
  if (!filesToSend.length) {
    showToast('请先选择图片或视频')
    return
  }
  mode.value = 'grid'
  emit('send', { files: filesToSend, original: original.value })
}

async function sendCurrentPreview() {
  const index = previewFileIndex.value
  if (!currentFile.value) return
  if (!currentSelected.value) toggleSelected(index)
  await sendSelected()
}

defineExpose({ handleBack })
</script>

<template>
  <div v-if="show" class="media-picker-root" @click.self="close">
    <section v-if="mode === 'grid'" class="media-picker-page" @click="showFilterMenu = false">
      <header class="media-picker-header">
        <button type="button" class="media-picker-icon" aria-label="关闭" @click="close">×</button>
        <div class="media-filter-wrap">
          <button type="button" class="media-filter-button" @click.stop="showFilterMenu = !showFilterMenu">
            {{ mediaFilterLabel }}
            <span class="media-filter-chevron" aria-hidden="true"></span>
          </button>
          <div v-if="showFilterMenu" class="media-filter-menu" @click.stop>
            <button type="button" :class="{ active: mediaFilter === 'all' }" @click="setMediaFilter('all')">
              <span>图片和视频</span><span class="media-filter-option-check">✓</span>
            </button>
            <button type="button" :class="{ active: mediaFilter === 'image' }" @click="setMediaFilter('image')">
              <span>图片</span><span class="media-filter-option-check">✓</span>
            </button>
            <button type="button" :class="{ active: mediaFilter === 'video' }" @click="setMediaFilter('video')">
              <span>视频</span><span class="media-filter-option-check">✓</span>
            </button>
          </div>
        </div>
        <span class="media-picker-header-spacer" aria-hidden="true"></span>
      </header>
      <div class="media-grid" @scroll.passive="onGridScroll">
        <div v-if="galleryLoading && !effectiveFiles.length" class="media-grid-loading">正在加载相册…</div>
        <button
          v-for="index in visibleIndices"
          :key="`${effectiveFiles[index]?.name}-${effectiveFiles[index]?.lastModified}-${index}`"
          type="button"
          class="media-tile"
          @click="openPreview(index)"
        >
          <img v-if="isImageFile(effectiveFiles[index]) || !objectUrls[index]" :src="displayUrl(index)" alt="" />
          <video
            v-else
            :src="objectUrls[index]"
            muted
            playsinline
            preload="metadata"
            @loadedmetadata="rememberDuration(index, $event)"
          />
          <span v-if="isVideoFile(effectiveFiles[index]) && durationFor(index)" class="media-duration">{{ formatDuration(durationFor(index)) }}</span>
          <span
            class="media-check"
            :class="{ checked: selected.includes(index) }"
            role="checkbox"
            :aria-checked="selected.includes(index)"
            tabindex="0"
            @click.stop="toggleSelected(index)"
            @keydown.enter.stop.prevent="toggleSelected(index)"
            @keydown.space.stop.prevent="toggleSelected(index)"
          >
            <template v-if="selected.includes(index)">{{ selected.indexOf(index) + 1 }}</template>
          </span>
        </button>
      </div>
      <footer class="media-picker-footer">
        <button type="button" class="media-preview-button" @click="openPreview()">
          预览({{ selected.length }})
        </button>
        <button type="button" class="media-footer-option" @click="original = !original">
          <span class="media-radio" :class="{ checked: original }">✓</span>
          原图
        </button>
        <button type="button" class="media-send-button" @click="sendSelected()">发送({{ selected.length }})</button>
      </footer>
    </section>

    <section v-else-if="mode === 'preview'" class="media-picker-page media-preview-page" @click="showFilterMenu = false">
      <header class="media-picker-header preview-header">
        <button type="button" class="media-picker-back" @click="backToGrid">‹</button>
        <strong>{{ currentPosition }}/{{ previewIndices.length }}</strong>
        <button type="button" class="media-picker-select" :aria-pressed="currentSelected" @click="toggleCurrentSelection">
          <span class="media-select-circle" :class="{ checked: currentSelected }">
            <span v-if="currentSelected">✓</span>
          </span>
          选择
        </button>
      </header>
      <div class="media-preview-stage" @touchstart="onPreviewTouchStart" @touchend="onPreviewTouchEnd">
        <img v-if="isImageFile(currentFile) || !objectUrls[previewFileIndex]" :src="currentUrl" alt="" />
        <video
          v-else
          :src="currentUrl"
          :class="{ 'media-video-ready': previewVideoReady }"
          controls
          playsinline
          preload="metadata"
          @loadedmetadata="onTrimMetadata"
          @loadeddata="onPreviewVideoReady"
          @canplay="onPreviewVideoReady"
          @playing="onPreviewVideoReady"
          @error="previewVideoReady = false"
        />
        <span v-if="currentIsVideo && !previewVideoReady" class="media-video-loading">视频加载中…</span>
      </div>
      <div v-if="selectedIndices.length" class="media-preview-thumbs">
        <button
          v-for="index in selectedIndices"
          :key="index"
          type="button"
          class="media-preview-thumb"
          :class="{ active: index === previewFileIndex, unselected: !selected.includes(index) }"
          @click="selectPreviewFile(index)"
        >
          <img v-if="isImageFile(effectiveFiles[index]) || !objectUrls[index]" :src="displayUrl(index)" alt="" />
          <video v-else :src="objectUrls[index]" muted playsinline preload="metadata" />
          <span v-if="!selected.includes(index)" class="media-preview-thumb-mask" aria-hidden="true"></span>
        </button>
      </div>
      <footer class="media-picker-footer preview-footer">
        <button type="button" class="media-edit-button" @click="editCurrent">{{ currentIsVideo ? '裁剪' : '编辑' }}</button>
        <button type="button" class="media-footer-option" @click="original = !original">
          <span class="media-radio" :class="{ checked: original }">✓</span>
          原图
        </button>
        <button type="button" class="media-send-button" @click="sendCurrentPreview">发送({{ selected.length }})</button>
      </footer>
    </section>

    <section v-else class="media-picker-page media-trim-page" @click="showFilterMenu = false">
      <header class="media-picker-header preview-header">
        <button type="button" class="media-picker-back" @click="mode = 'preview'">‹</button>
        <strong>裁剪视频</strong>
        <span class="media-picker-header-spacer" aria-hidden="true"></span>
      </header>
      <div class="media-trim-stage">
        <video
          :src="currentUrl"
          :class="{ 'media-video-ready': trimVideoReady }"
          controls
          playsinline
          @loadedmetadata="onTrimMetadata"
          @loadeddata="onTrimVideoReady"
          @canplay="onTrimVideoReady"
          @playing="onTrimVideoReady"
          @error="trimVideoReady = false"
        />
        <span v-if="!trimVideoReady" class="media-video-loading">视频加载中…</span>
      </div>
      <div class="media-trim-controls">
        <div class="media-trim-time"><span>{{ formatDuration(trimStart) }}</span><span>{{ formatDuration(trimEnd) }}</span></div>
        <div
          class="media-trim-timeline"
          :class="{ dragging: !!trimDragHandle }"
          @pointerdown.prevent="startTrimDrag"
          @pointermove.prevent="updateTrimFromPointer"
          @pointerup="endTrimDrag"
          @pointercancel="endTrimDrag"
        >
          <div class="media-trim-filmstrip">
            <template v-if="trimFrames.length">
              <img v-for="(frame, frameIndex) in trimFrames" :key="frameIndex" :src="frame" alt="" />
            </template>
            <video v-else :src="currentUrl" muted playsinline preload="metadata" />
          </div>
          <div class="media-trim-dim left" :style="{ width: trimStartPercent }"></div>
          <div class="media-trim-dim right" :style="{ left: trimEndPercent }"></div>
          <div class="media-trim-selection" :style="{ left: trimStartPercent, width: trimSelectionWidth }"></div>
          <span class="media-trim-handle start" :style="{ left: trimStartPercent }"><i></i></span>
          <span class="media-trim-handle end" :style="{ left: trimEndPercent }"><i></i></span>
        </div>
        <div class="media-trim-selection-label">拖动两侧选择要保留的视频片段</div>
        <button type="button" class="media-trim-complete" :disabled="trimBusy" @click="applyTrim">完成</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.media-picker-root { position: fixed; inset: 0; z-index: 5200; background: #2f2f2f; color: #fff; }
.media-picker-page { display: flex; flex-direction: column; width: 100%; height: 100%; background: #303030; }
.media-picker-header { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; height: calc(58px + var(--pulse-safe-top, 0px)); padding: var(--pulse-safe-top, 0px) 16px 0; box-sizing: border-box; font-size: 19px; }
.media-picker-header strong { font-weight: 600; }
.media-picker-icon, .media-picker-back, .media-picker-select { border: 0; background: transparent; color: #fff; font: inherit; cursor: pointer; }
.media-picker-icon { width: 36px; font-size: 34px; font-weight: 200; line-height: 1; }
.media-picker-header-spacer { width: 36px; height: 1px; }
.media-filter-wrap { position: relative; }
.media-filter-button { display: inline-flex; align-items: center; gap: 7px; padding: 5px 8px 5px 13px; border: 0; border-radius: 22px; background: #4a4a4a; color: #fff; font: inherit; font-size: 16px; font-weight: 600; line-height: 1.2; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
.media-filter-chevron { position: relative; display: grid; place-items: center; width: 27px; height: 27px; border-radius: 50%; background: #c9caca; color: #303030; }
.media-filter-chevron::after { width: 8px; height: 8px; border-right: 2px solid #303030; border-bottom: 2px solid #303030; transform: translateY(-2px) rotate(45deg); content: ''; }
.media-filter-menu { position: absolute; top: calc(100% + 7px); left: 50%; z-index: 3; display: flex; flex-direction: column; min-width: 148px; padding: 6px; border: 1px solid rgba(255,255,255,.12); border-radius: 14px; background: rgba(54,54,54,.98); box-shadow: 0 10px 28px rgba(0,0,0,.4); transform: translateX(-50%); }
.media-filter-menu button { display: flex; align-items: center; justify-content: space-between; gap: 18px; min-height: 38px; padding: 0 10px 0 12px; border: 0; border-radius: 9px; background: transparent; color: rgba(255,255,255,.82); font: inherit; font-size: 14px; text-align: left; cursor: pointer; }
.media-filter-menu button.active { background: #5a5a5a; color: #fff; }
.media-filter-option-check { display: none; }
.media-picker-back { width: 36px; font-size: 44px; line-height: .7; text-align: left; }
.media-picker-select { min-width: 48px; text-align: right; font-size: 16px; }
.media-grid { --media-tile-size: calc((100vw - 6px) / 4); flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-auto-rows: var(--media-tile-size); gap: 2px; overflow-y: auto; align-content: start; background: #202020; }
.media-grid { position: relative; }
.media-grid-loading { position: absolute; inset: 0; z-index: 2; display: grid; place-items: center; color: rgba(255,255,255,.72); font-size: 14px; pointer-events: none; }
.media-tile { position: relative; width: 100%; height: var(--media-tile-size); min-width: 0; padding: 0; border: 0; overflow: hidden; background: #111; cursor: pointer; }
.media-tile img, .media-tile video { position: absolute; inset: 0; display: block; width: 100%; height: 100%; object-fit: cover; object-position: center; }
.media-check { position: absolute; top: 8px; right: 8px; display: grid; place-items: center; width: 25px; height: 25px; border: 2px solid #fff; border-radius: 50%; box-sizing: border-box; color: #fff; font-size: 14px; font-weight: 700; background: rgba(0,0,0,.18); }
.media-check.checked { border-color: #19c46b; background: #19c46b; }
.media-duration { position: absolute; left: 7px; bottom: 6px; color: #fff; font-size: 12px; text-shadow: 0 1px 3px #000; }
.media-picker-footer { flex: 0 0 auto; display: flex; align-items: center; gap: 10px; min-height: 68px; padding: 8px 14px calc(8px + var(--pulse-safe-bottom, 0px)); box-sizing: border-box; background: #303030; }
.media-footer-option, .media-preview-button, .media-edit-button { border: 0; background: transparent; color: #fff; font: inherit; font-size: 15px; cursor: pointer; white-space: nowrap; }
.media-footer-option { display: flex; align-items: center; gap: 6px; }
.media-radio { display: grid; place-items: center; width: 22px; height: 22px; border: 2px solid #fff; border-radius: 50%; color: transparent; box-sizing: border-box; }
.media-radio.checked { border-color: #19c46b; background: #19c46b; color: #fff; }
.media-preview-button { flex: 1; text-align: left; }
.media-send-button { flex: 0 0 auto; min-width: 96px; height: 40px; padding: 0 14px; border: 0; border-radius: 7px; background: #16c66b; color: #fff; font: inherit; font-size: 15px; cursor: pointer; }
.preview-header { justify-content: space-between; }
.media-picker-select { display: inline-flex; align-items: center; justify-content: flex-end; gap: 6px; min-width: 66px; font-size: 16px; }
.media-select-circle { display: grid; place-items: center; width: 23px; height: 23px; border: 2px solid #fff; border-radius: 50%; color: transparent; font-size: 14px; font-weight: 700; box-sizing: border-box; }
.media-select-circle.checked { border-color: #19c46b; background: #19c46b; color: #fff; }
.media-preview-stage { position: relative; flex: 1 1 auto; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #000; touch-action: pan-y; }
.media-preview-stage img, .media-preview-stage video { display: block; width: 100%; height: 100%; object-fit: contain; transition: none !important; }
.media-preview-stage video:not(.media-video-ready), .media-trim-stage video:not(.media-video-ready) { visibility: hidden; }
.media-video-loading { position: absolute; color: rgba(255,255,255,.78); font-size: 14px; pointer-events: none; }
.media-preview-thumbs { flex: 0 0 auto; display: flex; gap: 12px; overflow-x: auto; padding: 12px 16px 10px; background: #303030; }
.media-preview-thumb { position: relative; flex: 0 0 76px; width: 76px; height: 76px; padding: 2px; border: 2px solid transparent; background: transparent; cursor: pointer; }
.media-preview-thumb.active { border-color: #19c46b; }
.media-preview-thumb img, .media-preview-thumb video { display: block; width: 100%; height: 100%; object-fit: cover; }
.media-preview-thumb-mask { position: absolute; inset: 2px; background: rgba(255,255,255,.48); pointer-events: none; }
.preview-footer { border-top: 1px solid rgba(255,255,255,.08); }
.media-edit-button { margin-right: auto; font-size: 15px; }
.media-trim-stage { position: relative; flex: 1 1 auto; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 20px; background: #000; }
.media-trim-stage video { max-width: 100%; max-height: 100%; }
.media-trim-controls { flex: 0 0 auto; padding: 14px 16px calc(16px + var(--pulse-safe-bottom, 0px)); background: #303030; }
.media-trim-time { display: flex; justify-content: space-between; margin-bottom: 7px; color: #fff; font-size: 13px; font-variant-numeric: tabular-nums; }
.media-trim-timeline { position: relative; height: 64px; overflow: hidden; border: 2px solid transparent; border-radius: 6px; background: #111; touch-action: none; user-select: none; }
.media-trim-timeline.dragging { border-color: #19c46b; }
.media-trim-filmstrip { display: flex; width: 100%; height: 100%; pointer-events: none; }
.media-trim-filmstrip img, .media-trim-filmstrip video { flex: 1 1 0; min-width: 0; height: 100%; object-fit: cover; }
.media-trim-dim { position: absolute; top: 0; bottom: 0; z-index: 1; background: rgba(0,0,0,.64); pointer-events: none; }
.media-trim-dim.left { left: 0; }
.media-trim-dim.right { right: 0; }
.media-trim-selection { position: absolute; top: 0; bottom: 0; z-index: 2; border-top: 3px solid #19c46b; border-bottom: 3px solid #19c46b; box-sizing: border-box; pointer-events: none; }
.media-trim-handle { position: absolute; top: -2px; bottom: -2px; z-index: 3; width: 17px; border-radius: 3px; background: #19c46b; transform: translateX(-50%); pointer-events: none; }
.media-trim-handle.start { border-radius: 4px 0 0 4px; }
.media-trim-handle.end { border-radius: 0 4px 4px 0; }
.media-trim-handle i { position: absolute; top: 50%; left: 50%; width: 3px; height: 25px; border-radius: 2px; background: #fff; transform: translate(-50%, -50%); content: ''; }
.media-trim-selection-label { margin-top: 7px; color: rgba(255,255,255,.58); font-size: 12px; text-align: center; }
.media-trim-complete { display: block; width: min(180px, 100%); height: 40px; margin: 12px auto 0; border: 0; border-radius: 8px; background: #16c66b; color: #fff; font: inherit; font-size: 15px; font-weight: 600; cursor: pointer; }
.media-trim-complete:disabled { opacity: .55; cursor: default; }
</style>

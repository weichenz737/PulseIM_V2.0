<script setup lang="ts">
import { ref, onMounted, onUnmounted, onActivated, onDeactivated, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  showToast,
  showLoadingToast,
  closeToast,
  showConfirmDialog,
  showImagePreview,
  showDialog,
  type ActionSheetAction,
} from 'vant'
import {
  fetchMoments,
  markMomentsSeen,
  isVideoUrl,
  toggleMomentLike,
  toggleMomentFavorite,
  deleteMoment,
  updateMomentVisibility,
  type MomentItem,
} from '@/api/moments'
import { fetchUserProfile, updateUserProfile, fetchContacts } from '@/api/contact'
import { fileDownloadUrl, normalizeUploadContentType, uploadChatFile, resolveFileUrl, extractChatFileId } from '@/api/file'
import { useUserStore } from '@/stores/user'
import { useDiscoverStore } from '@/stores/discover'
import { openMediaVideoPreview } from '@/composables/useMediaVideoPreview'
import { openMediaActions } from '@/composables/useMediaActions'
import MomentComments from '@/components/MomentComments.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import { smartBack } from '@/utils/navBack'
import { createMomentMediaCacheGuard, getStableMomentMedia, loadMomentMedia, loadMomentMediaWithRetry } from '@/utils/momentMedia'
import { getCachedChatFile } from '@/utils/fileCache'
import { storeToRefs } from 'pinia'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const discover = useDiscoverStore()
const { interactionUnread } = storeToRefs(discover)
const moments = ref<MomentItem[]>([])
const localMediaUrls = ref<Record<string, string>>({})
const loading = ref(true)
const refreshing = ref(false)
const coverSignature = ref('')
const coverInputRef = ref<HTMLInputElement | null>(null)
const updatingCover = ref(false)
const highlightPostId = ref('')
let coverLoadToken = 0

function persistedProfileUserId(): string {
  try {
    const raw = localStorage.getItem('pulse_user_profile')
    return raw ? String(JSON.parse(raw)?.userId || '').trim() : ''
  } catch {
    return ''
  }
}

function coverOwnerKey(): string {
  return String(userStore.userId || persistedProfileUserId() || 'anonymous').trim() || 'anonymous'
}

function coverStorageKey(): string {
  return `pulse_moments_cover_source:${coverOwnerKey()}`
}

function readRememberedCoverSource(): string {
  try { return String(localStorage.getItem(coverStorageKey()) || '').trim() } catch { return '' }
}

function rememberCoverSource(source: string): void {
  try {
    if (source) localStorage.setItem(coverStorageKey(), source)
    else localStorage.removeItem(coverStorageKey())
  } catch {
    // Best effort. The authenticated file cache remains the source of truth.
  }
}

const rememberedCoverSource = readRememberedCoverSource()
const rememberedCoverId = extractChatFileId(resolveFileUrl(rememberedCoverSource))
const rememberedStableCover = rememberedCoverId
  ? getStableMomentMedia(rememberedCoverId, 'image', 'preview')
  : null
// Keep the last decoded Blob URL during route remounts. This removes the
// background flash before the profile request returns again.
const coverUrl = ref(rememberedStableCover?.url || '')
let coverSourceUrl = rememberedCoverSource
const mediaCacheGuard = createMomentMediaCacheGuard()
const coverHydrating = ref(!!rememberedCoverId && !rememberedStableCover)

if (rememberedStableCover) {
  mediaCacheGuard.onLoaded(rememberedCoverId, rememberedStableCover.variant)
} else if (rememberedCoverId) {
  // CacheStorage survives a WebView restart, while the Blob URL does not.
  // Hydrate the remembered cover immediately instead of waiting for the
  // profile request, which previously exposed the default gradient first.
  void getCachedChatFile('image', rememberedCoverId, 'preview').then((cached) => {
    if (!cached || coverSourceUrl !== rememberedCoverSource) return
    coverHydrating.value = false
    coverUrl.value = cached
    mediaCacheGuard.onLoaded(rememberedCoverId, 'preview')
  }).catch(() => undefined)
}

async function paintCoverWhenReady(url: string, token: number) {
  if (!url || token !== coverLoadToken || coverUrl.value === url) return
  const image = new Image()
  image.decoding = 'async'
  const loaded = await new Promise<boolean>((resolve) => {
    let settled = false
    const finish = (value: boolean) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    image.onload = () => finish(true)
    image.onerror = () => finish(false)
    image.src = url
    if (image.complete) finish(image.naturalWidth > 0)
  })
  if (!loaded || token !== coverLoadToken) return
  try {
    await image.decode?.()
  } catch {
    // Some Android WebViews do not implement decode for Blob URLs. The load
    // event is still sufficient to paint the already decoded image.
  }
  if (token === coverLoadToken) coverUrl.value = url
}

function setCoverUrl(rawUrl?: string) {
  const token = ++coverLoadToken
  coverSourceUrl = String(rawUrl || '').trim()
  rememberCoverSource(coverSourceUrl)
  const resolved = resolveFileUrl(rawUrl || '')
  if (!resolved) {
    coverHydrating.value = false
    coverUrl.value = ''
    return
  }
  const fileId = extractChatFileId(resolved)
  if (!fileId) {
    coverHydrating.value = false
    void paintCoverWhenReady(resolved, token)
    return
  }
  const stable = getStableMomentMedia(fileId, 'image', 'preview')
  if (stable) {
    mediaCacheGuard.onLoaded(fileId, stable.variant)
    coverHydrating.value = false
    // A stable object URL is already authenticated and decoded/cached by the
    // WebView. Assign it synchronously so returning to this page does not
    // briefly show the gradient cover.
    coverUrl.value = stable.url
    void paintCoverWhenReady(stable.url, token)
    return
  }
  // CSS background images cannot carry the Axios Authorization header. Read
  // protected covers through the authenticated cache, then paint the blob URL.
  // Keep the old cover visible until the replacement has loaded; a transient
  // refresh/auth failure must not make a saved cover look deleted.
  coverHydrating.value = !coverUrl.value
  void loadMomentMediaWithRetry(fileId, 'image', 'preview', undefined, 3,
    (variant) => mediaCacheGuard.onLoaded(fileId, variant))
    .then((localUrl) => {
      if (!localUrl) return
      void paintCoverWhenReady(localUrl, token)
    })
    .catch(() => undefined)
}

function mediaKey(item: MomentItem, index: number): string { return `${item.id}:${index}` }
function mediaSrc(item: MomentItem, index: number): string {
  return item.mediaFileIds?.[index] ? (localMediaUrls.value[mediaKey(item, index)] || '') : (item.images[index] || '')
}
async function warmMomentMedia(list: MomentItem[]) {
  await Promise.all(list.flatMap((item) => (item.images || []).map(async (source, index) => {
    const fileId = item.mediaFileIds?.[index]
    const key = mediaKey(item, index)
    if (!fileId) return
    const kind = item.mediaTypes?.[index] === 'video' ? 'video' : 'image'
    const variant = kind === 'video' ? 'thumb' : 'preview'
    if (localMediaUrls.value[key]) {
      mediaCacheGuard.onLoaded(fileId, variant)
      return
    }
    const stable = getStableMomentMedia(fileId, kind, variant)
    if (stable) {
      mediaCacheGuard.onLoaded(fileId, stable.variant)
      localMediaUrls.value = { ...localMediaUrls.value, [key]: stable.url }
      return
    }
    try {
      const cacheSource = kind === 'video' ? (source || fileDownloadUrl(fileId, 'thumb')) : fileDownloadUrl(fileId, 'preview')
      const cached = await loadMomentMediaWithRetry(fileId, kind, variant, cacheSource, undefined,
        (loadedVariant) => mediaCacheGuard.onLoaded(fileId, loadedVariant))
      if (cached) localMediaUrls.value = { ...localMediaUrls.value, [key]: cached }
    } catch { /* show a placeholder for unavailable protected media */ }
  })))
}

const commentOpenId = ref('')

const sheetVisible = ref(false)
const sheetActions = ref<ActionSheetAction[]>([])
let sheetResolve: ((name: string | null) => void) | null = null
let momentLongPressTimer: ReturnType<typeof setTimeout> | null = null
let momentLongPressMoved = false
let momentLongPressOpened = false

function openActionSheet(actions: ActionSheetAction[]): Promise<string | null> {
  return new Promise((resolve) => {
    sheetResolve = resolve
    sheetActions.value = actions
    sheetVisible.value = true
  })
}

function onSheetSelect(action: ActionSheetAction) {
  sheetVisible.value = false
  const resolve = sheetResolve
  sheetResolve = null
  resolve?.(action.name || null)
}

function onSheetCancel() {
  // 只处理点「取消」；不要绑到 @close，否则选中项后 close 会把结果清成 null
  sheetVisible.value = false
  const resolve = sheetResolve
  sheetResolve = null
  resolve?.(null)
}

function bd09ToGcj02(latitude: number, longitude: number) {
  const x = longitude - 0.0065
  const y = latitude - 0.006
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * Math.PI)
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * Math.PI)
  return { latitude: z * Math.sin(theta), longitude: z * Math.cos(theta) }
}

function openMapWithFallback(appUrl: string, webUrl: string) {
  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  if (!mobile) {
    window.open(webUrl, '_blank', 'noopener')
    return
  }
  let opened = false
  const onHidden = () => {
    if (document.hidden) opened = true
  }
  document.addEventListener('visibilitychange', onHidden)
  window.location.href = appUrl
  window.setTimeout(() => {
    document.removeEventListener('visibilitychange', onHidden)
    if (!opened && !document.hidden) window.location.href = webUrl
  }, 1300)
}

async function openMomentLocation(item: MomentItem) {
  const latitude = Number(item.latitude)
  const longitude = Number(item.longitude)
  const name = item.locationName || '动态位置'
  const address = item.locationAddress || name
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    await showDialog({ title: name, message: address, confirmButtonText: '知道了' })
    return
  }
  try {
    await showConfirmDialog({
      title: name,
      message: `${address}\n经纬度：${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
      confirmButtonText: '选择地图',
      cancelButtonText: '关闭',
    })
  } catch {
    return
  }
  const selected = await openActionSheet([
    { name: '高德地图' },
    { name: '百度地图' },
    { name: '腾讯地图' },
  ])
  if (!selected) return
  if (selected === '百度地图') {
    const query = new URLSearchParams({
      location: `${latitude.toFixed(6)},${longitude.toFixed(6)}`,
      title: name,
      content: address,
      output: 'html',
      src: 'webapp.PulseIM',
    })
    openMapWithFallback(`baidumap://map/marker?${query.toString()}`, `https://api.map.baidu.com/marker?${query.toString()}`)
    return
  }
  const point = bd09ToGcj02(latitude, longitude)
  const lat = point.latitude.toFixed(6)
  const lon = point.longitude.toFixed(6)
  if (selected === '高德地图') {
    const appQuery = new URLSearchParams({ sourceApplication: 'PulseIM', poiname: name, lat, lon, dev: '0' })
    const webQuery = new URLSearchParams({ position: `${lon},${lat}`, name, src: 'PulseIM', coordinate: 'gaode', callnative: '0' })
    const scheme = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'iosamap://viewMap' : 'androidamap://viewMap'
    openMapWithFallback(`${scheme}?${appQuery.toString()}`, `https://uri.amap.com/marker?${webQuery.toString()}`)
    return
  }
  const query = new URLSearchParams({
    marker: `coord:${lat},${lon};title:${name};addr:${address}`,
    referer: 'PulseIM',
  })
  openMapWithFallback(`qqmap://map/marker?${query.toString()}`, `https://apis.map.qq.com/uri/v1/marker?${query.toString()}`)
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 3600000) return `${Math.max(1, Math.floor(diff / 60000))} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  if (diff < 172800000) return '昨天'
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

function visibilityTag(item: MomentItem): string {
  if (item.visibility === 1) return '仅自己'
  if (item.visibility === 2) return '部分可见'
  return ''
}

function isMine(item: MomentItem) {
  return item.mine === true || String(item.userId) === String(userStore.userId)
}

function openProfile(userId?: string) {
  const id = String(userId || '')
  if (!id) return
  if (id === String(userStore.userId || '')) {
    void router.push('/app/me')
  } else {
    void router.push(`/contacts/${id}`)
  }
}

function replaceMoment(updated: MomentItem) {
  const idx = moments.value.findIndex((m) => m.id === updated.id)
  if (idx >= 0) moments.value[idx] = updated
}

async function onLike(item: MomentItem) {
  try {
    replaceMoment(await toggleMomentLike(item.id))
  } catch (e) {
    showToast(e instanceof Error ? e.message : '操作失败')
  }
}

function toggleCommentBox(item: MomentItem) {
  commentOpenId.value = commentOpenId.value === item.id ? '' : item.id
}

function onCommentOpenChange(itemId: string, open: boolean) {
  if (open) commentOpenId.value = itemId
  else if (commentOpenId.value === itemId) commentOpenId.value = ''
}

async function onDeleteMoment(item: MomentItem) {
  try {
    await showConfirmDialog({ title: '删除动态', message: '确定删除这条朋友圈？' })
  } catch {
    return
  }
  try {
    await deleteMoment(item.id)
    moments.value = moments.value.filter((m) => m.id !== item.id)
    showToast('已删除')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '删除失败')
  }
}

async function onChangeVisibility(item: MomentItem) {
  const name = await openActionSheet([
    { name: `好友可见${item.visibility === 0 ? '  ✓' : ''}` },
    { name: `仅自己${item.visibility === 1 ? '  ✓' : ''}` },
    { name: `选择好友可见${item.visibility === 2 ? '  ✓' : ''}` },
  ])
  if (!name) return
  const vis = name.startsWith('仅自己') ? 1 : name.startsWith('选择好友可见') ? 2 : 0
  let visibleUserIds: string[] = []
  if (vis === 2) {
    try {
      const friends = await fetchContacts()
      if (!friends.length) {
        showToast('暂无好友可选')
        return
      }
      await showDialog({
        title: '选择好友可见',
        message: `将对 ${friends.length} 位好友可见`,
        showCancelButton: true,
        confirmButtonText: '确定',
      })
      visibleUserIds = item.visibility === 2 && item.visibleUserIds?.length
        ? item.visibleUserIds
        : friends.map((f) => f.userId)
    } catch {
      return
    }
  }
  try {
    replaceMoment(await updateMomentVisibility(item.id, vis, visibleUserIds))
    showToast('权限已更新')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '更新失败')
  }
}

async function onMomentMore(item: MomentItem) {
  const favoriteAction = item.favoritedByMe ? '取消收藏' : '收藏'
  const actions: ActionSheetAction[] = [{ name: favoriteAction }]
  if (isMine(item)) {
    actions.push({ name: '更改权限' }, { name: '删除', color: '#ee0a24' })
  }
  const name = await openActionSheet([
    ...actions,
  ])
  if (name === favoriteAction) void onFavorite(item)
  else if (name === '删除') void onDeleteMoment(item)
  else if (name === '更改权限') void onChangeVisibility(item)
}

async function onFavorite(item: MomentItem) {
  try {
    const wasFavorited = Boolean(item.favoritedByMe)
    replaceMoment(await toggleMomentFavorite(item.id))
    showToast(wasFavorited ? '已取消收藏' : '已收藏')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '收藏失败')
  }
}

function clearMomentLongPress() {
  if (momentLongPressTimer) {
    clearTimeout(momentLongPressTimer)
    momentLongPressTimer = null
  }
}

function onMomentPressStart(event: TouchEvent, item: MomentItem) {
  if (event.touches.length !== 1) return
  clearMomentLongPress()
  momentLongPressMoved = false
  momentLongPressOpened = false
  const touch = event.touches[0]
  const current = event.currentTarget as HTMLElement | null
  if (current) current.dataset.momentPressStart = `${touch.clientX},${touch.clientY}`
  momentLongPressTimer = setTimeout(() => {
    momentLongPressTimer = null
    if (momentLongPressMoved) return
    momentLongPressOpened = true
    void onMomentMore(item)
    navigator.vibrate?.(12)
  }, 450)
}

function onMomentPressMove(event: TouchEvent) {
  const raw = (event.currentTarget as HTMLElement | null)?.dataset.momentPressStart || ''
  const [startX, startY] = raw.split(',').map(Number)
  const touch = event.touches[0]
  if (!touch || Math.hypot(touch.clientX - startX, touch.clientY - startY) > 10) {
    momentLongPressMoved = true
    clearMomentLongPress()
  }
}

function onMomentPressEnd() {
  clearMomentLongPress()
}

function suppressMomentClick(event: MouseEvent) {
  if (!momentLongPressOpened) return
  event.preventDefault()
  event.stopPropagation()
  momentLongPressOpened = false
}

onMounted(() => {
  void loadMoments()
  void discover.refreshInteractions()
})

onActivated(() => {
  mediaCacheGuard.activate()
  if (coverSourceUrl && !coverUrl.value) setCoverUrl(coverSourceUrl)
  void warmMomentMedia(moments.value)
})

onDeactivated(() => {
  mediaCacheGuard.deactivate()
})

watch(moments, (list) => { void warmMomentMedia(list) }, { deep: true })

onUnmounted(() => {
  coverLoadToken += 1
  mediaCacheGuard.dispose()
})

watch(
  () => route.query.postId,
  () => {
    if (!loading.value) void focusPostFromQuery()
  },
)

async function focusPostFromQuery() {
  const postId = String(route.query.postId || '')
  if (!postId) return
  highlightPostId.value = postId
  commentOpenId.value = postId
  await nextTick()
  const el = document.getElementById(`moment-${postId}`)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  } else {
    showToast('未找到该动态，可能已删除')
  }
  // 清掉 query，避免返回再触发
  if (route.query.postId) {
    const nextQuery = { ...route.query }
    delete nextQuery.postId
    void router.replace({ path: '/moments', query: nextQuery })
  }
  window.setTimeout(() => {
    if (highlightPostId.value === postId) highlightPostId.value = ''
  }, 2200)
}

async function loadMoments() {
  loading.value = true
  try {
    const [list, profile] = await Promise.all([
      fetchMoments(),
      fetchUserProfile().catch(() => null),
    ])
    moments.value = Array.isArray(list) ? list.filter((m) => m.id && m.id !== 'undefined') : []
    if (profile) {
      setCoverUrl(profile.momentsCoverUrl)
      coverSignature.value = String(profile.signature || '').trim()
    }
    void markMomentsSeen()
      .then(() => {
        discover.clearMomentsBadge()
      })
      .catch(() => {
        /* ignore */
      })
  } catch (e) {
    console.error('[moments] load failed', e)
    moments.value = []
    showToast('朋友圈加载失败，请稍后重试')
  } finally {
    loading.value = false
    await focusPostFromQuery()
  }
}

async function onPullRefresh() {
  refreshing.value = true
  try {
    const [list, profile] = await Promise.all([
      fetchMoments(),
      fetchUserProfile().catch(() => null),
    ])
    moments.value = Array.isArray(list) ? list.filter((m) => m.id && m.id !== 'undefined') : []
    if (profile) {
      setCoverUrl(profile.momentsCoverUrl)
      coverSignature.value = String(profile.signature || '').trim()
    }
  } catch (e) {
    showToast(e instanceof Error ? e.message : '刷新失败')
  } finally {
    refreshing.value = false
  }
}

function goBack() {
  smartBack(router, '/app/discover')
}

function goCompose() {
  router.push('/moments/compose')
}

function goNotifications() {
  router.push('/moments/notifications')
}

async function onCoverClick() {
  try {
    await showConfirmDialog({
      title: '更换封面',
      message: '从相册选择一张图片作为朋友圈背景',
      confirmButtonText: '选择图片',
    })
    coverInputRef.value?.click()
  } catch {
    // cancelled
  }
}

async function onCoverSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!normalizeUploadContentType(file).startsWith('image/')) {
    showToast('请选择图片')
    return
  }
  if (file.size > 100 * 1024 * 1024) {
    showToast('图片不能超过 100MB')
    return
  }
  if (updatingCover.value) return
  updatingCover.value = true
  showLoadingToast({ message: '上传封面...', forbidClick: true })
  try {
    const uploaded = await uploadChatFile(file)
    await updateUserProfile({ momentsCoverUrl: uploaded.url })
    setCoverUrl(uploaded.originalUrl || uploaded.url)
    closeToast()
    showToast('封面已更新')
  } catch (err) {
    closeToast()
    showToast(err instanceof Error ? err.message : '更新失败')
  } finally {
    updatingCover.value = false
  }
}

/** 点击动态媒体：图片可左右滑动预览，视频全屏播放 */
async function openMediaPreview(item: MomentItem, index: number) {
  const isVideo = item.mediaTypes?.[index] === 'video'
  const fileId = item.mediaFileIds?.[index]
  const url = isVideo
    ? (fileId
        ? (getStableMomentMedia(fileId, 'video', 'preview')?.url || fileDownloadUrl(fileId, 'preview'))
        : item.images[index] || item.originalImages?.[index])
    : (item.originalImages?.[index] || item.images[index])
  if (!url) return
  if (isVideo || isVideoUrl(url)) {
    void openMediaVideoPreview(url, { allowActions: true, fileId: item.mediaFileIds?.[index], variant: 'preview' })
    return
  }
  const imageIndexes = item.originalImages.map((_, i) => i).filter((i) => item.mediaTypes?.[i] !== 'video')
  const images = await Promise.all(imageIndexes.map(async (sourceIndex) => {
    const fileId = item.mediaFileIds?.[sourceIndex]
    if (!fileId) return item.originalImages[sourceIndex] || item.images[sourceIndex]
    const key = mediaKey(item, sourceIndex)
    if (localMediaUrls.value[key]) return localMediaUrls.value[key]
    const stableOriginal = getStableMomentMedia(fileId, 'image', 'original')
    if (stableOriginal) {
      mediaCacheGuard.onLoaded(fileId, stableOriginal.variant)
      return stableOriginal.url
    }
    try {
      // Open with the cached/compact preview first. Waiting for every
      // original image made the first tap on a multi-image post feel stuck.
      const preview = await loadMomentMedia(fileId, 'image', 'preview', item.images[sourceIndex] || item.originalImages[sourceIndex],
        (variant) => mediaCacheGuard.onLoaded(fileId, variant))
      if (preview) localMediaUrls.value = { ...localMediaUrls.value, [key]: preview }
      return preview
    } catch {
      return ''
    }
  }))
  if (!images.some(Boolean)) return
  // `images` contains cached object URLs, while `url` is the clicked source
  // URL. Use the original media index instead of comparing those values.
  const start = Math.max(0, imageIndexes.indexOf(index))
  showImagePreview({
    images,
    startPosition: start >= 0 ? start : 0,
    closeable: true,
    closeIconPosition: 'top-right',
    onLongPress: ({ index: mediaIndex }: { index: number }) => {
      const target = images[mediaIndex]
      if (!target) return
      const sourceIndex = imageIndexes[mediaIndex]
      void openMediaActions({ url: target, kind: 'image', fileId: item.mediaFileIds?.[sourceIndex] })
    },
  } as Parameters<typeof showImagePreview>[0] & {
    onLongPress?: (e: { index: number }) => void
  })
}

</script>

<template>
  <div class="moments-page">
    <header class="moments-header">
      <div class="header-left">
        <button type="button" class="icon-btn" @click="goBack">
          <span class="material-symbols-outlined">arrow_back_ios</span>
        </button>
        <h1 class="header-title">朋友圈</h1>
      </div>
      <div class="header-right">
        <button type="button" class="icon-btn notif-btn" @click="goNotifications">
          <span class="material-symbols-outlined">notifications</span>
          <span v-if="interactionUnread > 0" class="notif-badge">
            {{ interactionUnread > 99 ? '99+' : interactionUnread }}
          </span>
        </button>
        <button type="button" class="icon-btn" @click="goCompose">
          <span class="material-symbols-outlined">photo_camera</span>
        </button>
      </div>
    </header>

    <van-pull-refresh
      v-model="refreshing"
      class="list-pull"
      pulling-text="下拉刷新"
      loosing-text="释放刷新"
      loading-text="刷新中..."
      @refresh="onPullRefresh"
    >
    <section class="cover-section" @click="onCoverClick">
      <div
        class="cover-bg"
        :class="{ custom: !!coverUrl, hydrating: coverHydrating && !coverUrl }"
        :style="coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined"
      />
      <div class="cover-hint">
        <span class="material-symbols-outlined">photo_camera</span>
        <span>点击更换封面</span>
      </div>
      <div class="cover-profile" @click.stop>
        <div class="cover-text">
          <h2 class="cover-name">{{ userStore.nickname || 'Pulse 用户' }}</h2>
          <p class="cover-sig">{{ coverSignature || '个人简介' }}</p>
        </div>
        <UserAvatar
          :src="userStore.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=me'"
          :user-id="userStore.userId"
          :name="userStore.nickname || '用'"
          :size="48"
          class="cover-avatar"
          role="button"
          tabindex="0"
          @click="router.push('/profile/edit')"
          @keydown.enter="router.push('/profile/edit')"
        />
      </div>
    </section>
    <input
      ref="coverInputRef"
      type="file"
      accept="image/*"
      class="hidden-input"
      @change="onCoverSelected"
    />

    <div v-if="loading" class="loading-state">加载中...</div>

    <section v-else class="feed-list">
      <template v-for="(item, index) in moments" :key="item.id">
        <article
          :id="`moment-${item.id}`"
          class="feed-item"
          :class="{ highlight: highlightPostId === item.id, mine: isMine(item) }"
          @touchstart.passive="onMomentPressStart($event, item)"
          @touchmove.passive="onMomentPressMove"
          @touchend="onMomentPressEnd"
          @touchcancel="onMomentPressEnd"
          @contextmenu.prevent
          @click.capture="suppressMomentClick"
        >
          <div
            class="feed-avatar-wrap profile-link"
            role="link"
            tabindex="0"
            @click="openProfile(item.userId)"
            @keydown.enter.prevent="openProfile(item.userId)"
          >
            <UserAvatar
              :src="item.avatarUrl"
              :user-id="item.userId"
              :name="item.nickname"
              :size="44"
              class="feed-avatar"
            />
          </div>
          <div class="feed-body">
            <h3 class="feed-name">
              <span class="profile-link" role="link" @click="openProfile(item.userId)">
                {{ item.nickname }}
              </span>
              <span v-if="visibilityTag(item)" class="private-tag">{{ visibilityTag(item) }}</span>
            </h3>
            <p v-if="item.content" class="feed-content">{{ item.content }}</p>
            <p v-if="item.mentionedMe" class="feed-mention me">提醒了你</p>
            <p
              v-else-if="item.mentionNicknames?.length && item.userId === userStore.userId"
              class="feed-mention"
            >
              提醒 {{ item.mentionNicknames.join('、') }}
            </p>
            <div
              v-if="item.images?.length"
              class="image-grid"
              :class="`grid-${Math.min(item.images.length, 9)}`"
            >
              <button
                v-for="(media, idx) in item.images.slice(0, 9)"
                :key="idx"
                type="button"
                class="media-thumb"
                @click="openMediaPreview(item, idx)"
              >
                <img v-if="item.mediaTypes?.[idx] === 'video'" :src="mediaSrc(item, idx)" alt="视频封面" class="grid-img" />
                <img v-else :src="mediaSrc(item, idx)" alt="" class="grid-img" />
                <span v-if="item.mediaTypes?.[idx] === 'video' || isVideoUrl(media)" class="video-play">
                  <span class="material-symbols-outlined">play_circle</span>
                </span>
              </button>
            </div>
            <div class="feed-actions">
              <div class="feed-meta">
                <span class="feed-time">{{ formatTime(item.createdAt) }}</span>
                <button
                  v-if="item.locationName"
                  type="button"
                  class="feed-location"
                  @click="openMomentLocation(item)"
                >
                  <span class="material-symbols-outlined">location_on</span>
                  <span>{{ item.locationName }}</span>
                  <span class="material-symbols-outlined location-chevron">chevron_right</span>
                </button>
              </div>
              <div class="action-btns">
                <button
                  v-if="isMine(item)"
                  type="button"
                  class="action-btn"
                  @click="onMomentMore(item)"
                >
                  <span class="material-symbols-outlined">more_horiz</span>
                </button>
                <button
                  type="button"
                  class="action-btn"
                  :class="{ liked: item.likedByMe }"
                  @click="onLike(item)"
                >
                  <span class="material-symbols-outlined" :class="{ filled: item.likedByMe }">favorite</span>
                  <span class="action-count">{{ item.likeCount }}</span>
                </button>
                <button type="button" class="action-btn" @click="toggleCommentBox(item)">
                  <span class="material-symbols-outlined">chat_bubble</span>
                  <span class="action-count">{{ item.commentCount }}</span>
                </button>
              </div>
            </div>

            <div v-if="item.likeNicknames?.length" class="like-row">
              <span class="material-symbols-outlined filled like-ico">favorite</span>
              <span class="like-users">
                <template v-for="(name, likeIndex) in item.likeNicknames" :key="`${item.id}-${likeIndex}`">
                  <button
                    type="button"
                    class="like-user-link"
                    @click="openProfile(item.likeUserIds?.[likeIndex])"
                  >{{ name }}</button><span v-if="likeIndex < item.likeNicknames.length - 1">、</span>
                </template>
              </span>
            </div>

            <MomentComments
              :item="item"
              :my-user-id="String(userStore.userId || '')"
              :open="commentOpenId === item.id"
              @update:item="replaceMoment"
              @update:open="(v) => onCommentOpenChange(item.id, v)"
            />
          </div>
        </article>
        <div v-if="index < moments.length - 1" class="feed-divider" />
      </template>
    </section>
    </van-pull-refresh>

    <van-action-sheet
      v-model:show="sheetVisible"
      :actions="sheetActions"
      cancel-text="取消"
      close-on-click-action
      @select="onSheetSelect"
      @cancel="onSheetCancel"
    />
  </div>
</template>

<style scoped>
.moments-page {
  min-height: 100vh;
  background: var(--pulse-page-bg, var(--pulse-bg));
  padding-bottom: 24px;
}

.moments-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 8px 0 4px;
  padding-top: var(--pulse-header-pad-top);
  box-sizing: content-box;
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 4px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 2px;
}

.icon-btn {
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  color: var(--pulse-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 50%;
  position: relative;
}

.header-right .icon-btn {
  color: var(--pulse-primary);
}

.icon-btn:active {
  background: rgba(52, 53, 57, 0.5);
}

.icon-btn .material-symbols-outlined {
  font-size: 22px;
}

.notif-badge {
  position: absolute;
  top: 4px;
  right: 2px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: #ee0a24;
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
  text-align: center;
  box-sizing: border-box;
}

.header-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 25px;
  color: var(--pulse-text);
}

.cover-section {
  position: relative;
  width: 100%;
  height: 380px;
  cursor: pointer;
}

.cover-bg {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(to bottom, transparent, transparent, var(--pulse-bg)),
    linear-gradient(135deg, #1a1f3a 0%, #2d1b4e 40%, var(--pulse-bg) 100%);
  background-size: cover;
  background-position: center;
}

.cover-bg.custom {
  background-color: var(--pulse-bg);
  background-repeat: no-repeat;
  background-size: cover;
  background-position: center;
}

.cover-bg.hydrating {
  /* Do not show the default gradient while a saved cover is being restored. */
  background: var(--pulse-bg);
}

.cover-bg.custom::after {
  content: '';
  position: absolute;
  inset: 0;
  /* 只做轻微的底部渐变，不再用整块主题色盖住封面。 */
  background: linear-gradient(
    to bottom,
    transparent 64%,
    color-mix(in srgb, var(--pulse-bg) 16%, transparent) 88%,
    color-mix(in srgb, var(--pulse-bg) 48%, transparent) 100%
  );
  pointer-events: none;
}

.cover-hint {
  position: absolute;
  top: 72px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.35);
  color: rgba(255, 255, 255, 0.85);
  font-size: 12px;
  pointer-events: none;
  opacity: 0.75;
}

.cover-hint .material-symbols-outlined {
  font-size: 16px;
}

.cover-profile {
  position: absolute;
  bottom: -24px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 16px;
  z-index: 2;
}

.cover-text {
  text-align: right;
  padding-bottom: 0;
}

.cover-name {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 25px;
  color: #fff;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}

.cover-sig {
  margin: 4px 0 0;
  font-size: 13px;
  font-weight: 500;
  color: rgba(193, 198, 215, 0.8);
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cover-avatar {
  width: 96px;
  height: 96px;
  border-radius: 12px;
  object-fit: cover;
  border: 4px solid var(--pulse-bg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  background: var(--pulse-surface-container);
}

.hidden-input {
  display: none;
}

.feed-list {
  margin-top: 64px;
  padding: 0 16px;
  max-width: 672px;
  margin-left: auto;
  margin-right: auto;
}

.loading-state {
  margin-top: 80px;
  text-align: center;
  color: var(--pulse-text-secondary);
  font-size: 14px;
}

.feed-item {
  display: flex;
  gap: 12px;
  padding: 16px 0;
  border-radius: 8px;
  transition: background 0.35s ease;
}

.feed-item.mine {
  flex-direction: row-reverse;
  justify-content: flex-start;
}

.feed-item.mine .feed-body {
  flex: 0 1 72%;
  width: 72%;
  max-width: min(520px, calc(100% - 56px));
  margin-left: auto;
  margin-right: 0;
  text-align: right;
  align-items: flex-end;
}

.feed-item.mine .feed-name {
  justify-content: flex-end;
}

.feed-item.mine .image-grid {
  margin-left: auto;
}

.feed-item.mine .feed-mention {
  text-align: right;
}

.feed-item.highlight {
  background: rgba(76, 139, 245, 0.16);
  margin: 0 -8px;
  padding-left: 8px;
  padding-right: 8px;
}

.feed-avatar-wrap {
  flex-shrink: 0;
}

.profile-link {
  cursor: pointer;
}

.feed-avatar {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  object-fit: cover;
  background: var(--pulse-surface-highest);
}

.feed-avatar.initials {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
  color: var(--pulse-text);
}

.feed-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.feed-name {
  margin: 0;
  font-size: calc(var(--pulse-content-font-size, 15px) - 1px);
  font-weight: 700;
  line-height: 1.35;
  color: var(--pulse-primary);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.like-user-link {
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.private-tag {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--pulse-text-secondary);
}

.feed-content {
  margin: 0;
  font-size: var(--pulse-content-font-size, 15px);
  line-height: 1.5;
  color: var(--pulse-text);
}

.feed-location {
  display: flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  max-width: 180px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--pulse-primary);
  font-size: 12px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.feed-location .material-symbols-outlined {
  font-size: 15px;
  flex-shrink: 0;
}

.feed-location .location-chevron {
  font-size: 14px;
  opacity: 0.72;
}

.feed-mention {
  margin: 0;
  font-size: 12px;
  color: var(--pulse-primary);
  opacity: 0.85;
}

.feed-mention.me {
  opacity: 1;
  font-weight: 600;
}

.image-grid {
  display: grid;
  gap: 4px;
  max-width: 280px;
}

.image-grid.grid-1 {
  grid-template-columns: 1fr;
  max-width: 220px;
}

.image-grid.grid-2,
.image-grid.grid-4 {
  grid-template-columns: repeat(2, 1fr);
}

.image-grid.grid-3,
.image-grid.grid-5,
.image-grid.grid-6,
.image-grid.grid-7,
.image-grid.grid-8,
.image-grid.grid-9 {
  grid-template-columns: repeat(3, 1fr);
}

.grid-img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 4px;
  background: var(--pulse-surface-highest);
  display: block;
  pointer-events: none;
}

.media-thumb {
  position: relative;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  display: block;
  width: 100%;
  border-radius: 4px;
  overflow: hidden;
}

.media-thumb:active {
  opacity: 0.88;
}

.grid-video {
  background: #000;
  pointer-events: none;
}

.video-play {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  color: #fff;
  pointer-events: none;
  filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.45));
}

.video-play .material-symbols-outlined {
  font-size: 36px;
}

.feed-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: min(100%, 280px);
  margin-top: 4px;
  gap: 10px;
}

.feed-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.feed-item.mine .feed-actions {
  flex-direction: row;
  align-self: flex-end;
  transform: translateX(8px);
}

.feed-item.mine .feed-time {
  margin-left: 4px;
}

.feed-time {
  flex-shrink: 0;
  white-space: nowrap;
  line-height: 1.4;
  font-size: max(12px, calc(var(--pulse-content-font-size, 15px) - 3px));
  color: var(--pulse-text-secondary);
}

.action-btns {
  display: flex;
  gap: 12px;
}

.feed-item:not(.mine) .action-btns {
  margin-right: 40px;
}

.action-btn {
  border: none;
  background: transparent;
  color: var(--pulse-text-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  padding: 0;
}

.action-btn.liked {
  color: #ff6b8a;
}

.action-btn .material-symbols-outlined {
  font-size: 18px;
}

.action-count {
  font-size: max(12px, calc(var(--pulse-content-font-size, 15px) - 3px));
}

.like-row {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  font-size: calc(var(--pulse-content-font-size, 15px) - 1px);
  color: var(--pulse-primary);
  display: flex;
  gap: 6px;
  align-items: flex-start;
  line-height: 1.4;
}

.feed-item.mine .like-row,
.feed-item.mine :deep(.moment-comments) {
  width: min(100%, 280px);
  max-width: 100%;
  box-sizing: border-box;
  align-self: flex-end;
  margin-left: auto;
  margin-right: 0;
  text-align: left;
  transform: translateX(8px);
}

.like-ico {
  font-size: 14px;
  margin-top: 1px;
}

.feed-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.06);
}
</style>

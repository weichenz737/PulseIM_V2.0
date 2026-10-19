<script setup lang="ts">
import { computed, onMounted, onUnmounted, onActivated, onDeactivated, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { showToast, type ActionSheetAction } from 'vant'
import { fetchUserMoments, isVideoUrl, toggleMomentFavorite, type MomentItem } from '@/api/moments'
import { fetchUserProfile } from '@/api/contact'
import { useUserStore } from '@/stores/user'
import { smartBack } from '@/utils/navBack'
import { createMomentMediaCacheGuard, getStableMomentMedia, loadMomentMediaWithRetry } from '@/utils/momentMedia'
import { fileDownloadUrl, extractChatFileId, resolveFileUrl } from '@/api/file'
import UserAvatar from '@/components/UserAvatar.vue'

interface TimelineRow {
  item: MomentItem
  showDate: boolean
  showYear: boolean
  year: number
  dayLabel: string
  monthLabel: string
}

const router = useRouter()
const userStore = useUserStore()
const loading = ref(true)
const refreshing = ref(false)
const moments = ref<MomentItem[]>([])
const localMediaUrls = ref<Record<string, string>>({})
const coverUrl = ref('')
let coverLoadToken = 0
let coverSourceUrl = ''
const mediaCacheGuard = createMomentMediaCacheGuard()

function setCoverUrl(rawUrl?: string) {
  const token = ++coverLoadToken
  coverSourceUrl = String(rawUrl || '').trim()
  const resolved = resolveFileUrl(rawUrl || '')
  if (!resolved) {
    coverUrl.value = ''
    return
  }
  const fileId = extractChatFileId(resolved)
  if (!fileId) {
    coverUrl.value = resolved
    return
  }
  const stable = getStableMomentMedia(fileId, 'image', 'preview')
  if (stable) {
    mediaCacheGuard.onLoaded(fileId, stable.variant)
    coverUrl.value = stable.url
    return
  }
  void loadMomentMediaWithRetry(fileId, 'image', 'preview', undefined, 3,
    (variant) => mediaCacheGuard.onLoaded(fileId, variant))
    .then((localUrl) => {
      if (token !== coverLoadToken || !localUrl) return
      coverUrl.value = localUrl
    })
    .catch(() => undefined)
}
const headerSolid = ref(false)
const momentActionVisible = ref(false)
const momentActionItem = ref<MomentItem | null>(null)
const momentActionItems = ref<ActionSheetAction[]>([])

function mediaSrc(item: MomentItem, index: number): string {
  return item.mediaFileIds?.[index] ? (localMediaUrls.value[`${item.id}:${index}`] || '') : (item.images[index] || '')
}
async function warmMomentMedia(list: MomentItem[]) {
  await Promise.all(list.flatMap((item) => (item.images || []).slice(0, 4).map(async (source, index) => {
    const fileId = item.mediaFileIds?.[index]
    const key = `${item.id}:${index}`
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
      const cacheSource = fileDownloadUrl(fileId, variant)
        || source
        || (kind === 'video' ? fileDownloadUrl(fileId, 'thumb') : item.images?.[index] || '')
      const cached = await loadMomentMediaWithRetry(fileId, kind, variant, cacheSource, undefined,
        (loadedVariant) => mediaCacheGuard.onLoaded(fileId, loadedVariant))
      if (cached) localMediaUrls.value = { ...localMediaUrls.value, [key]: cached }
    } catch { /* placeholder */ }
  })))
}
let momentLongPressTimer: ReturnType<typeof setTimeout> | null = null
let momentLongPressMoved = false
let momentLongPressOpened = false
let momentLongPressStartX = 0
let momentLongPressStartY = 0

const timeline = computed<TimelineRow[]>(() => {
  const sorted = [...moments.value].sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime()
    const tb = new Date(b.createdAt || 0).getTime()
    return tb - ta
  })
  const now = new Date()
  const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`
  let lastDayKey = ''
  let lastYear = 0
  return sorted.map((item) => {
    const d = new Date(item.createdAt || 0)
    const y = d.getFullYear()
    const dayKey = `${y}-${d.getMonth()}-${d.getDate()}`
    const showYear = y !== lastYear && y !== now.getFullYear()
    const showDate = dayKey !== lastDayKey
    lastDayKey = dayKey
    lastYear = y
    const isToday = dayKey === todayKey
    return {
      item,
      showDate,
      showYear,
      year: y,
      dayLabel: isToday ? '今天' : String(d.getDate()),
      monthLabel: isToday ? '' : `${d.getMonth() + 1}月`,
    }
  })
})

onMounted(() => {
  void loadData(true)
})

onActivated(() => {
  mediaCacheGuard.activate()
  if (coverSourceUrl) setCoverUrl(coverSourceUrl)
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

async function loadData(showLoading = false) {
  const uid = String(userStore.userId || '')
  if (!uid) {
    loading.value = false
    showToast('请先登录')
    return
  }
  if (showLoading) loading.value = true
  try {
    const [list, profile] = await Promise.all([
      fetchUserMoments(uid),
      fetchUserProfile().catch(() => null),
    ])
    moments.value = list
    if (profile) setCoverUrl(profile.momentsCoverUrl)
  } catch (e) {
    showToast(e instanceof Error ? e.message : '加载失败')
  } finally {
    loading.value = false
  }
}

async function onPullRefresh() {
  refreshing.value = true
  try {
    await loadData(false)
  } finally {
    refreshing.value = false
  }
}

function onScroll(e: Event) {
  const el = e.target as HTMLElement
  headerSolid.value = el.scrollTop > 160
}

function goBack() {
  smartBack(router, '/app/me')
}

function openPermission() {
  router.push({ path: '/settings/friends', query: { section: 'moments' } })
}

function openDetail(item: MomentItem) {
  router.push(`/me/moments/${item.id}`)
}

async function onFavorite(item: MomentItem) {
  try {
    const wasFavorited = Boolean(item.favoritedByMe)
    const updated = await toggleMomentFavorite(item.id)
    const index = moments.value.findIndex((moment) => moment.id === updated.id)
    if (index >= 0) moments.value[index] = updated
    showToast(wasFavorited ? '已取消收藏' : '已收藏')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '收藏失败')
  }
}

function openMomentActions(item: MomentItem) {
  momentActionItem.value = item
  momentActionItems.value = [{ name: item.favoritedByMe ? '取消收藏' : '收藏' }]
  momentActionVisible.value = true
}

function onMomentAction(action: ActionSheetAction) {
  const item = momentActionItem.value
  momentActionVisible.value = false
  momentActionItem.value = null
  if (item && (action.name === '收藏' || action.name === '取消收藏')) void onFavorite(item)
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
  momentLongPressStartX = touch.clientX
  momentLongPressStartY = touch.clientY
  momentLongPressTimer = setTimeout(() => {
    momentLongPressTimer = null
    if (momentLongPressMoved) return
    momentLongPressOpened = true
    openMomentActions(item)
    navigator.vibrate?.(12)
  }, 450)
}

function onMomentPressMove(event: TouchEvent) {
  const touch = event.touches[0]
  if (!touch) return
  if (Math.hypot(touch.clientX - momentLongPressStartX, touch.clientY - momentLongPressStartY) > 10) {
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

function textOf(item: MomentItem) {
  return (item.content || '').trim()
}

function mediaList(item: MomentItem) {
  return (item.images || []).slice(0, 4)
}

function mediaCount(item: MomentItem) {
  return item.images?.length || 0
}

</script>

<template>
  <div class="album-page" @scroll.passive="onScroll">
    <header class="page-header" :class="{ solid: headerSolid }">
      <button type="button" class="icon-btn" @click="goBack">
        <span class="material-symbols-outlined">arrow_back_ios</span>
      </button>
      <h1 class="page-title" :class="{ show: headerSolid }">我的朋友圈</h1>
      <button type="button" class="perm-btn" @click="openPermission">朋友圈权限</button>
    </header>

    <van-pull-refresh
      v-model="refreshing"
      class="list-pull"
      pulling-text="下拉刷新"
      loosing-text="释放刷新"
      loading-text="刷新中..."
      @refresh="onPullRefresh"
    >
    <section class="cover-section">
      <div
        class="cover-bg"
        :class="{ custom: !!coverUrl }"
        :style="coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined"
      />
      <div class="cover-profile">
        <span class="cover-name">{{ userStore.nickname || 'Pulse 用户' }}</span>
        <UserAvatar
          class="cover-avatar"
          :src="userStore.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=me'"
          :user-id="userStore.userId"
          :name="userStore.nickname || '用'"
          :size="48"
          alt=""
        />
      </div>
    </section>

    <div v-if="loading" class="state">加载中...</div>
    <div v-else-if="!timeline.length" class="state empty">暂无朋友圈动态</div>
    <section v-else class="timeline">
      <template v-for="row in timeline" :key="row.item.id">
        <div v-if="row.showYear" class="year-row">{{ row.year }}年</div>
        <button
          type="button"
          class="post-row"
          @touchstart.passive="onMomentPressStart($event, row.item)"
          @touchmove.passive="onMomentPressMove"
          @touchend="onMomentPressEnd"
          @touchcancel="onMomentPressEnd"
          @contextmenu.prevent
          @click.capture="suppressMomentClick"
          @click="openDetail(row.item)"
        >
          <div class="date-col">
            <template v-if="row.showDate">
              <div class="day" :class="{ today: row.dayLabel === '今天' }">{{ row.dayLabel }}</div>
              <div v-if="row.monthLabel" class="month">{{ row.monthLabel }}</div>
            </template>
          </div>
          <div class="post-body">
            <p v-if="textOf(row.item)" class="post-text">{{ textOf(row.item) }}</p>
            <div
              v-if="mediaList(row.item).length"
              class="thumbs"
              :class="{
                single: mediaList(row.item).length === 1,
                multi: mediaList(row.item).length > 1,
              }"
            >
              <div
                v-for="(_, idx) in mediaList(row.item)"
                :key="idx"
                class="thumb"
              >
                <img
                  v-if="isVideoUrl(mediaSrc(row.item, idx)) || row.item.mediaTypes?.[idx] === 'video'"
                  :src="mediaSrc(row.item, idx)"
                  alt="视频封面"
                  class="thumb-media"
                />
                <img v-else :src="mediaSrc(row.item, idx)" alt="" class="thumb-media" />
                <span v-if="isVideoUrl(mediaSrc(row.item, idx)) || row.item.mediaTypes?.[idx] === 'video'" class="play-ico">
                  <span class="material-symbols-outlined filled">play_circle</span>
                </span>
                <span
                  v-if="idx === 3 && mediaCount(row.item) > 4"
                  class="more-mask"
                >+{{ mediaCount(row.item) - 4 }}</span>
              </div>
            </div>
            <p v-if="!textOf(row.item) && !mediaList(row.item).length" class="post-text muted">
              动态
            </p>
          </div>
        </button>
      </template>
    </section>
    </van-pull-refresh>
    <van-action-sheet
      v-model:show="momentActionVisible"
      :actions="momentActionItems"
      cancel-text="取消"
      close-on-click-action
      @select="onMomentAction"
    />
  </div>
</template>

<style scoped>
.album-page {
  height: 100%;
  height: 100dvh;
  overflow-y: auto;
  background: #111;
  color: #e8e8e8;
  -webkit-overflow-scrolling: touch;
}

.page-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  margin: 0;
  padding: 0 8px;
  padding-top: var(--pulse-safe-top, 0px);
  box-sizing: content-box;
  background: var(--pulse-page-bg, #111);
  border: none;
  transition: background 0.2s ease;
}

.page-header.solid {
  background: var(--pulse-page-bg, #111);
  backdrop-filter: none;
}

.list-pull,
.list-pull :deep(.van-pull-refresh),
.list-pull :deep(.van-pull-refresh__track),
.list-pull :deep(.van-pull-refresh__head) {
  background: transparent !important;
}

.icon-btn,
.perm-btn {
  border: none;
  background: transparent;
  color: #fff;
  cursor: pointer;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.45);
}

.icon-btn {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
}

.page-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: #fff;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.page-title.show {
  opacity: 1;
}

.perm-btn {
  min-width: 72px;
  height: 40px;
  padding: 0 6px;
  font-size: 13px;
  font-weight: 500;
}

.cover-section {
  position: relative;
  height: 260px;
  margin: 0 0 36px;
}

.cover-bg {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(0, 0, 0, 0.15), transparent 40%),
    linear-gradient(160deg, #2a3140, #1a1d24 55%, #111);
  background-size: cover;
  background-position: center;
}

.cover-bg.custom {
  background-color: var(--pulse-surface-low);
  background-repeat: no-repeat;
}

.cover-profile {
  position: absolute;
  right: 16px;
  bottom: -28px;
  display: flex;
  align-items: flex-end;
  gap: 10px;
}

.cover-name {
  margin-bottom: 10px;
  font-size: 17px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.55);
}

.cover-avatar {
  width: 70px;
  height: 70px;
  border-radius: 8px;
  object-fit: cover;
  background: #2a2a2a;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
}

.state {
  padding: 48px 16px;
  text-align: center;
  color: rgba(255, 255, 255, 0.45);
  font-size: 14px;
}

.state.empty {
  padding-top: 24px;
}

.timeline {
  padding: 8px 16px 40px;
}

.year-row {
  margin: 8px 0 16px;
  font-size: 22px;
  font-weight: 700;
  color: #fff;
}

.post-row {
  width: 100%;
  display: flex;
  gap: 14px;
  padding: 0 0 22px;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.post-row:active .post-body {
  opacity: 0.75;
}

.date-col {
  width: 52px;
  flex-shrink: 0;
  line-height: 1;
}

.day {
  font-size: 28px;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.5px;
}

.day.today {
  font-size: 18px;
  font-weight: 700;
  padding-top: 6px;
}

.month {
  margin-top: 4px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}

.post-body {
  flex: 1;
  min-width: 0;
  padding-top: 4px;
}

.post-text {
  margin: 0 0 8px;
  font-size: 15px;
  line-height: 1.45;
  color: rgba(255, 255, 255, 0.92);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  word-break: break-word;
}

.post-text.muted {
  color: rgba(255, 255, 255, 0.4);
}

.thumbs {
  display: grid;
  gap: 3px;
  max-width: 220px;
}

.thumbs.single {
  grid-template-columns: 1fr;
  max-width: 160px;
}

.thumbs.multi {
  grid-template-columns: repeat(2, 1fr);
  max-width: 148px;
}

.thumb {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  background: #222;
}

.thumbs.single .thumb {
  aspect-ratio: 4 / 3;
}

.thumb-media {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
  background: #1a1a1a;
}

video.thumb-media {
  opacity: 0.99;
}

.play-ico {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #fff;
  background: rgba(0, 0, 0, 0.18);
  pointer-events: none;
}

.play-ico .material-symbols-outlined {
  font-size: 28px;
}

.more-mask {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 16px;
  font-weight: 600;
}
</style>

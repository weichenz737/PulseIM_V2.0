<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, onActivated, onDeactivated, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  showToast,
  showImagePreview,
  type ActionSheetAction,
} from 'vant'
import {
  fetchUserMoments,
  isVideoUrl,
  toggleMomentLike,
  toggleMomentFavorite,
  type MomentItem,
} from '@/api/moments'
import { fetchUserProfile, type UserProfile } from '@/api/contact'
import { openMediaVideoPreview } from '@/composables/useMediaVideoPreview'
import { openMediaActions } from '@/composables/useMediaActions'
import { useUserStore } from '@/stores/user'
import MomentComments from '@/components/MomentComments.vue'
import { smartBack } from '@/utils/navBack'
import { createMomentMediaCacheGuard, getStableMomentMedia, loadMomentMedia, loadMomentMediaWithRetry } from '@/utils/momentMedia'
import { fileDownloadUrl, extractChatFileId, resolveFileUrl } from '@/api/file'
import UserAvatar from '@/components/UserAvatar.vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const userId = computed(() => String(route.params.userId || ''))

const loading = ref(true)
const refreshing = ref(false)
const profile = ref<UserProfile | null>(null)
const moments = ref<MomentItem[]>([])
const localMediaUrls = ref<Record<string, string>>({})
const coverDisplayUrl = ref('')
let coverLoadToken = 0
let coverSourceUrl = ''
const mediaCacheGuard = createMomentMediaCacheGuard()
const commentOpenId = ref('')
const momentActionVisible = ref(false)
const momentActionItem = ref<MomentItem | null>(null)
const momentActionItems = ref<ActionSheetAction[]>([])
let momentLongPressTimer: ReturnType<typeof setTimeout> | null = null
let momentLongPressMoved = false
let momentLongPressOpened = false
let momentLongPressStartX = 0
let momentLongPressStartY = 0

const title = computed(() => {
  const name = profile.value?.nickname
  return name ? `${name}的朋友圈` : '朋友圈'
})

const coverUrl = computed(() => coverDisplayUrl.value)

function setCoverUrl(rawUrl?: string) {
  const token = ++coverLoadToken
  coverSourceUrl = String(rawUrl || '').trim()
  const resolved = resolveFileUrl(rawUrl || '')
  if (!resolved) {
    coverDisplayUrl.value = ''
    return
  }
  const fileId = extractChatFileId(resolved)
  if (!fileId) {
    coverDisplayUrl.value = resolved
    return
  }
  const stable = getStableMomentMedia(fileId, 'image', 'preview')
  if (stable) {
    mediaCacheGuard.onLoaded(fileId, stable.variant)
    coverDisplayUrl.value = stable.url
    return
  }
  void loadMomentMediaWithRetry(fileId, 'image', 'preview', undefined, 3,
    (variant) => mediaCacheGuard.onLoaded(fileId, variant))
    .then((localUrl) => {
      if (token !== coverLoadToken || !localUrl) return
      coverDisplayUrl.value = localUrl
    })
    .catch(() => undefined)
}

function mediaSrc(item: MomentItem, index: number): string {
  return item.mediaFileIds?.[index] ? (localMediaUrls.value[`${item.id}:${index}`] || '') : (item.images[index] || '')
}

async function warmMomentMedia(list: MomentItem[]) {
  await Promise.all(list.flatMap((item) => (item.images || []).map(async (source, index) => {
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
      const cacheSource = kind === 'video' ? (source || fileDownloadUrl(fileId, 'thumb')) : fileDownloadUrl(fileId, 'preview')
      const cached = await loadMomentMediaWithRetry(fileId, kind, variant, cacheSource, undefined,
        (loadedVariant) => mediaCacheGuard.onLoaded(fileId, loadedVariant))
      if (cached) localMediaUrls.value = { ...localMediaUrls.value, [key]: cached }
    } catch { /* placeholder */ }
  })))
}

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
  if (showLoading) loading.value = true
  try {
    const p = await fetchUserProfile(userId.value).catch(() => null)
    if (p) {
      profile.value = p
      setCoverUrl(p.momentsCoverUrl)
    }
    if (p?.blocked || p?.friendStatus === 'blocked') {
      moments.value = []
      showToast('已拉黑对方，无法查看朋友圈')
      return
    }
    if (p?.blockedByPeer || p?.friendStatus === 'blocked_by_peer') {
      moments.value = []
      showToast('您已被对方拉入黑名单')
      return
    }
    moments.value = await fetchUserMoments(userId.value)
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

function goBack() {
  smartBack(router)
}

function openProfile(targetUserId?: string) {
  const id = String(targetUserId || '')
  if (!id) return
  if (id === String(userStore.userId || '')) {
    void router.push('/app/me')
  } else {
    void router.push(`/contacts/${id}`)
  }
}

function formatTime(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = Date.now()
  const diff = now - d.getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return `${d.getMonth() + 1}/${d.getDate()}`
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

async function openMediaPreview(item: MomentItem, index: number) {
  const isVideo = item.mediaTypes?.[index] === 'video'
  const fileId = item.mediaFileIds?.[index]
  const url = isVideo
    ? (fileId ? fileDownloadUrl(fileId, 'preview') : item.images[index] || item.originalImages?.[index])
    : (item.originalImages?.[index] || item.images[index])
  if (!url) return
  if (isVideo || isVideoUrl(url)) {
    void openMediaVideoPreview(url, { allowActions: true, fileId: item.mediaFileIds?.[index], variant: 'preview' })
    return
  }
  const imageIndexes = item.originalImages.map((_, i) => i).filter((i) => item.mediaTypes?.[i] !== 'video')
  const images = await Promise.all(imageIndexes.map(async (sourceIndex) => {
    const fileId = item.mediaFileIds?.[sourceIndex]
    if (!fileId) return item.originalImages[sourceIndex]
    try {
      return await loadMomentMedia(fileId, 'image', 'original', item.originalImages[sourceIndex] || item.images[sourceIndex],
        (variant) => mediaCacheGuard.onLoaded(fileId, variant))
    } catch {
      return ''
    }
  }))
  if (!images.some(Boolean)) return
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

async function onFavorite(item: MomentItem) {
  try {
    const wasFavorited = Boolean(item.favoritedByMe)
    replaceMoment(await toggleMomentFavorite(item.id))
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
  const target = momentActionItem.value
  momentActionVisible.value = false
  momentActionItem.value = null
  if (target && (action.name === '收藏' || action.name === '取消收藏')) void onFavorite(target)
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

</script>

<template>
  <div class="user-moments-page">
    <header class="page-header">
      <button type="button" class="icon-btn" @click="goBack">
        <span class="material-symbols-outlined">arrow_back_ios</span>
      </button>
      <h1 class="page-title">{{ title }}</h1>
      <div class="header-spacer" />
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
        <div class="cover-text">
          <h2 class="cover-name profile-link" role="link" @click="openProfile(userId)">
            {{ profile?.nickname || '用户' }}
          </h2>
          <p v-if="profile?.signature" class="cover-sig">{{ profile.signature }}</p>
        </div>
        <UserAvatar
          class="cover-avatar profile-link"
          role="link"
          :src="profile?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`"
          :user-id="userId"
          :name="profile?.nickname || '用'"
          :size="48"
          alt=""
          @click="openProfile(userId)"
        />
      </div>
    </section>

    <div v-if="loading" class="state">加载中...</div>
    <div v-else-if="!moments.length" class="state">暂无可见动态</div>
    <section v-else class="feed-list">
      <article
        v-for="item in moments"
        :key="item.id"
        class="feed-item"
        @touchstart.passive="onMomentPressStart($event, item)"
        @touchmove.passive="onMomentPressMove"
        @touchend="onMomentPressEnd"
        @touchcancel="onMomentPressEnd"
        @contextmenu.prevent
        @click.capture="suppressMomentClick"
      >
        <div class="feed-time-col">
          <div class="day">{{ formatTime(item.createdAt) }}</div>
        </div>
        <div class="feed-body">
          <p v-if="item.content" class="feed-content">{{ item.content }}</p>
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
          <p v-if="item.locationName" class="feed-location">
            <span class="material-symbols-outlined">location_on</span>
            {{ item.locationName }}
          </p>
          <div class="feed-actions">
            <button
              type="button"
              class="action-btn"
              :class="{ liked: item.likedByMe }"
              @click="onLike(item)"
            >
              <span class="material-symbols-outlined" :class="{ filled: item.likedByMe }">
                favorite
              </span>
              <span>{{ item.likeCount || '' }}</span>
            </button>
            <button type="button" class="action-btn" @click="toggleCommentBox(item)">
              <span class="material-symbols-outlined">chat_bubble</span>
              <span>{{ item.commentCount || '' }}</span>
            </button>
          </div>
          <div v-if="item.likeNicknames?.length" class="like-row">
            <template v-for="(name, likeIndex) in item.likeNicknames" :key="`${item.id}-${likeIndex}`">
              <button
                type="button"
                class="like-user-link"
                @click="openProfile(item.likeUserIds?.[likeIndex])"
              >{{ name }}</button><span v-if="likeIndex < item.likeNicknames.length - 1">、</span>
            </template>
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
.user-moments-page {
  min-height: 100%;
  min-height: 100dvh;
  background: var(--pulse-page-bg, var(--pulse-bg));
  color: var(--pulse-text);
  padding-bottom: 32px;
}

.page-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px;
  padding-top: var(--pulse-header-pad-top);
  background: rgba(18, 19, 23, 0.88);
  backdrop-filter: blur(16px);
}

.icon-btn {
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  color: var(--pulse-text);
  display: flex;
  align-items: center;
  justify-content: center;
}

.page-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.header-spacer {
  width: 40px;
}

.cover-section {
  position: relative;
  height: 220px;
  margin-bottom: 28px;
}

.cover-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 30% 20%, rgba(173, 198, 255, 0.35), transparent 50%),
    linear-gradient(160deg, var(--pulse-surface-low), #2a3040 55%, var(--pulse-bg));
  background-size: cover;
  background-position: center;
}

.cover-bg.custom {
  background-color: var(--pulse-surface-low);
}

.cover-profile {
  position: absolute;
  right: 16px;
  bottom: -22px;
  display: flex;
  align-items: flex-end;
  gap: 12px;
}

.cover-text {
  text-align: right;
  margin-bottom: 8px;
}

.cover-name {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
}

.cover-sig {
  margin: 4px 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  max-width: 180px;
}

.cover-avatar {
  width: 72px;
  height: 72px;
  border-radius: 10px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  object-fit: cover;
  background: var(--pulse-surface-high);
}

.profile-link {
  cursor: pointer;
}

.state {
  padding: 48px 16px;
  text-align: center;
  color: var(--pulse-text-secondary);
  font-size: 14px;
}

.feed-list {
  padding: 8px 16px 0;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.feed-item {
  display: flex;
  gap: 12px;
}

.feed-time-col {
  width: 56px;
  flex-shrink: 0;
  padding-top: 2px;
}

.day {
  font-size: 12px;
  font-weight: 600;
  color: var(--pulse-text-secondary);
  line-height: 1.3;
}

.feed-body {
  flex: 1;
  min-width: 0;
}

.feed-content {
  margin: 0 0 8px;
  font-size: 15px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.feed-location {
  display: flex;
  align-items: center;
  gap: 3px;
  margin: 0 0 8px;
  color: var(--pulse-primary);
  font-size: 12px;
}

.feed-location .material-symbols-outlined {
  font-size: 15px;
}

.image-grid {
  display: grid;
  gap: 4px;
  max-width: 240px;
  margin-bottom: 8px;
}

.image-grid.grid-1 {
  grid-template-columns: 1fr;
  max-width: 180px;
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

.media-thumb {
  position: relative;
  aspect-ratio: 1;
  border: none;
  padding: 0;
  border-radius: 4px;
  overflow: hidden;
  background: var(--pulse-surface-high);
  cursor: pointer;
}

.grid-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
}

.video-play {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: rgba(0, 0, 0, 0.2);
  pointer-events: none;
}

.feed-actions {
  display: flex;
  gap: 12px;
  margin-top: 4px;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  color: var(--pulse-text-secondary);
  font-size: 13px;
  padding: 4px 0;
  cursor: pointer;
}

.action-btn.liked {
  color: #ff6b6b;
}

.action-btn .material-symbols-outlined {
  font-size: 18px;
}

.like-row {
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  font-size: 13px;
  color: var(--pulse-text-secondary);
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
</style>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, onActivated, onDeactivated, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  showConfirmDialog,
  showImagePreview,
  showToast,
  type ActionSheetAction,
} from 'vant'
import {
  deleteMoment,
  fetchUserMoments,
  isVideoUrl,
  toggleMomentLike,
  toggleMomentFavorite,
  updateMomentVisibility,
  type MomentItem,
} from '@/api/moments'
import { fetchContacts } from '@/api/contact'
import { openMediaVideoPreview } from '@/composables/useMediaVideoPreview'
import { openMediaActions } from '@/composables/useMediaActions'
import { useUserStore } from '@/stores/user'
import { smartBack } from '@/utils/navBack'
import MomentComments from '@/components/MomentComments.vue'
import { createMomentMediaCacheGuard, getStableMomentMedia, loadMomentMedia, loadMomentMediaWithRetry } from '@/utils/momentMedia'
import { fileDownloadUrl } from '@/api/file'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const loading = ref(true)
const item = ref<MomentItem | null>(null)
const localMediaUrls = ref<Record<string, string>>({})
const commentOpen = ref(false)
const mediaCacheGuard = createMomentMediaCacheGuard()

const momentId = computed(() => String(route.params.id || ''))

function mediaSrc(index: number): string {
  const current = item.value
  if (!current) return ''
  return current.mediaFileIds?.[index]
    ? (localMediaUrls.value[`${current.id}:${index}`] || '')
    : (current.images[index] || '')
}

async function warmMomentMedia(current: MomentItem) {
  await Promise.all((current.images || []).map(async (source, index) => {
    const fileId = current.mediaFileIds?.[index]
    const key = `${current.id}:${index}`
    if (!fileId) return
    const kind = current.mediaTypes?.[index] === 'video' ? 'video' : 'image'
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
  }))
}

const sheetVisible = ref(false)
const sheetActions = ref<ActionSheetAction[]>([])
let sheetResolve: ((name: string | null) => void) | null = null

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
  sheetVisible.value = false
  const resolve = sheetResolve
  sheetResolve = null
  resolve?.(null)
}

onMounted(async () => {
  const uid = String(userStore.userId || '')
  if (!uid || !momentId.value) {
    loading.value = false
    showToast('动态不存在')
    return
  }
  try {
    const list = await fetchUserMoments(uid)
    item.value = list.find((m) => m.id === momentId.value) || null
    if (item.value) void warmMomentMedia(item.value)
    if (!item.value) showToast('动态不存在或已删除')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '加载失败')
  } finally {
    loading.value = false
  }
})

onActivated(() => {
  mediaCacheGuard.activate()
  if (item.value) void warmMomentMedia(item.value)
})

onDeactivated(() => {
  mediaCacheGuard.deactivate()
})

onUnmounted(() => {
  mediaCacheGuard.dispose()
})

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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function visibilityLabel(v: number) {
  if (v === 1) return '仅自己'
  if (v === 2) return '部分可见'
  return '好友可见'
}

async function onLike() {
  if (!item.value) return
  try {
    item.value = await toggleMomentLike(item.value.id)
  } catch (e) {
    showToast(e instanceof Error ? e.message : '操作失败')
  }
}

async function onFavorite() {
  if (!item.value) return
  try {
    const wasFavorited = Boolean(item.value.favoritedByMe)
    item.value = await toggleMomentFavorite(item.value.id)
    showToast(wasFavorited ? '已取消收藏' : '已收藏')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '收藏失败')
  }
}

async function openMedia(index: number) {
  if (!item.value?.images?.length) return
  const isVideo = item.value.mediaTypes?.[index] === 'video'
  const fileId = item.value.mediaFileIds?.[index]
  const url = isVideo
    ? (fileId ? fileDownloadUrl(fileId, 'preview') : item.value.images[index] || item.value.originalImages?.[index])
    : (item.value.originalImages?.[index] || item.value.images[index])
  if (!url) return
  if (isVideo || isVideoUrl(url)) {
    void openMediaVideoPreview(url, { allowActions: true, fileId: item.value.mediaFileIds?.[index], variant: 'preview' })
    return
  }
  const imageIndexes = item.value.originalImages.map((_, i) => i).filter((i) => item.value?.mediaTypes?.[i] !== 'video')
  const images = await Promise.all(imageIndexes.map(async (sourceIndex) => {
    const current = item.value!
    const fileId = current.mediaFileIds?.[sourceIndex]
    if (!fileId) return current.originalImages[sourceIndex]
    try {
      return await loadMomentMedia(fileId, 'image', 'original', current.originalImages[sourceIndex] || current.images[sourceIndex],
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
      void openMediaActions({ url: target, kind: 'image', fileId: item.value?.mediaFileIds?.[sourceIndex] })
    },
  } as Parameters<typeof showImagePreview>[0] & {
    onLongPress?: (e: { index: number }) => void
  })
}

async function onDelete() {
  if (!item.value) return
  try {
    await showConfirmDialog({ title: '删除动态', message: '确定删除这条朋友圈？' })
  } catch {
    return
  }
  try {
    await deleteMoment(item.value.id)
    showToast('已删除')
    router.replace('/me/moments')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '删除失败')
  }
}

async function onChangeVisibility() {
  if (!item.value) return
  const name = await openActionSheet([
    { name: `好友可见${item.value.visibility === 0 ? '  ✓' : ''}` },
    { name: `仅自己${item.value.visibility === 1 ? '  ✓' : ''}` },
    { name: `选择好友可见${item.value.visibility === 2 ? '  ✓' : ''}` },
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
      visibleUserIds = item.value.visibility === 2 && item.value.visibleUserIds?.length
        ? item.value.visibleUserIds
        : friends.map((f) => f.userId)
    } catch {
      return
    }
  }
  try {
    item.value = await updateMomentVisibility(item.value.id, vis, visibleUserIds)
    showToast('权限已更新')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '更新失败')
  }
}

async function onMore() {
  if (!item.value) return
  const name = await openActionSheet([
    { name: item.value.favoritedByMe ? '取消收藏' : '收藏' },
    { name: '本条可见范围' },
    { name: '删除', color: '#ee0a24' },
  ])
  if (name === '收藏' || name === '取消收藏') void onFavorite()
  else if (name === '本条可见范围') void onChangeVisibility()
  else if (name === '删除') void onDelete()
}
</script>

<template>
  <div class="detail-page">
    <header class="page-header">
      <button type="button" class="icon-btn" @click="goBack">
        <span class="material-symbols-outlined">arrow_back_ios</span>
      </button>
      <h1 class="page-title">动态详情</h1>
      <button type="button" class="icon-btn" @click="onMore">
        <span class="material-symbols-outlined">more_horiz</span>
      </button>
    </header>

    <div v-if="loading" class="state">加载中...</div>
    <div v-else-if="!item" class="state">动态不存在</div>
    <main v-else class="main">
      <div class="meta-row">
        <span>{{ formatTime(item.createdAt) }}</span>
        <span>{{ visibilityLabel(item.visibility) }}</span>
      </div>
      <p v-if="item.content" class="content">{{ item.content }}</p>
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
          @click="openMedia(idx)"
        >
          <img v-if="item.mediaTypes?.[idx] === 'video'" :src="mediaSrc(idx)" alt="视频封面" class="grid-img" />
          <img v-else :src="mediaSrc(idx)" alt="" class="grid-img" />
          <span v-if="item.mediaTypes?.[idx] === 'video' || isVideoUrl(media)" class="video-play">
            <span class="material-symbols-outlined">play_circle</span>
          </span>
        </button>
      </div>
      <p v-if="item.locationName" class="moment-location">
        <span class="material-symbols-outlined">location_on</span>
        {{ item.locationName }}
      </p>

      <div class="actions">
        <button type="button" class="action-btn" :class="{ liked: item.likedByMe }" @click="onLike">
          <span class="material-symbols-outlined" :class="{ filled: item.likedByMe }">favorite</span>
          <span>{{ item.likeCount || 0 }}</span>
        </button>
        <button type="button" class="action-btn" @click="commentOpen = !commentOpen">
          <span class="material-symbols-outlined">chat_bubble</span>
          <span>{{ item.commentCount || 0 }}</span>
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
        :open="commentOpen"
        @update:item="(m) => (item = m)"
        @update:open="(v) => (commentOpen = v)"
      />
    </main>

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
.detail-page {
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
  height: 56px;
  padding: 0 8px;
  padding-top: var(--pulse-header-pad-top);
  box-sizing: content-box;
  background: var(--pulse-page-bg, var(--pulse-bg));
  backdrop-filter: blur(12px);
}

.icon-btn {
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  color: var(--pulse-text);
  display: grid;
  place-items: center;
  cursor: pointer;
}

.page-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}

.state {
  padding: 48px 16px;
  text-align: center;
  color: var(--pulse-text-secondary);
}

.main {
  padding: 16px;
}

.meta-row {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--pulse-text-secondary);
  margin-bottom: 10px;
}

.content {
  margin: 0 0 12px;
  font-size: 15px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

.moment-location {
  display: flex;
  align-items: center;
  gap: 3px;
  margin: 0 0 12px;
  color: var(--pulse-primary);
  font-size: 12px;
}

.moment-location .material-symbols-outlined {
  font-size: 15px;
}

.image-grid {
  display: grid;
  gap: 4px;
  max-width: 320px;
  margin-bottom: 12px;
}

.image-grid.grid-1 {
  grid-template-columns: 1fr;
  max-width: 240px;
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
  padding: 0;
  border: none;
  background: transparent;
  border-radius: 6px;
  overflow: hidden;
  aspect-ratio: 1;
}

.grid-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
  background: #000;
}

.video-play {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #fff;
  pointer-events: none;
  background: rgba(0, 0, 0, 0.2);
}

.actions {
  display: flex;
  gap: 8px;
  margin: 8px 0;
}

.action-btn {
  border: none;
  border-radius: 8px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--pulse-text-secondary);
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  cursor: pointer;
}

.action-btn.liked {
  color: #ff6b6b;
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

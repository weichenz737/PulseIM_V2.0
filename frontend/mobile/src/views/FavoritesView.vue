<script setup lang="ts">
defineOptions({ name: 'FavoritesView' })
import { computed, ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { smartBack } from '@/utils/navBack'
import { showConfirmDialog, showToast } from 'vant'
import {
  fetchFavorites,
  deleteFavorite,
  favoritePreviewLabel,
  parseFilePayload,
  forwardFavorite,
  type FavoriteItem,
} from '@/api/message'
import { fileDownloadUrl, resolveFileUrl } from '@/api/file'
import { cacheChatFile, getStableChatFileUrl } from '@/utils/fileCache'
import {
  fetchCommunityFavorites,
  removeCommunityFavorite,
  type CommunityFavoriteItem,
} from '@/api/communityFavorites'

const router = useRouter()
const route = useRoute()
const sendTo = computed(() => String(route.query.sendTo || ''))
const sendToName = computed(() => String(route.query.sendToName || ''))
const returnTo = computed(() => String(route.query.returnTo || ''))
const sendingId = ref('')
const loading = ref(true)
const refreshing = ref(false)
const managing = ref(false)
const removingSelected = ref(false)
type FavoriteListItem =
  | { kind: 'message'; key: string; favorite: FavoriteItem }
  | { kind: 'community'; key: string; favorite: CommunityFavoriteItem }

const list = ref<FavoriteListItem[]>([])
const localFavoriteMediaUrls = ref<Record<string, string>>({})
const selectedKeys = ref<Set<string>>(new Set())
const visibleList = computed(() => sendTo.value
  ? list.value.filter((item) => item.kind === 'message' && item.favorite.msgType !== 10)
  : list.value)
const selectedCount = computed(() => selectedKeys.value.size)
const allVisibleSelected = computed(() => (
  visibleList.value.length > 0
  && visibleList.value.every((item) => selectedKeys.value.has(item.key))
))
const scrollBodyRef = ref<HTMLElement | null>(null)
const pullMinHeight = ref(0)
let pullResizeObserver: ResizeObserver | null = null

function syncPullMinHeight() {
  const el = scrollBodyRef.value
  if (!el) return
  pullMinHeight.value = el.clientHeight
}

onMounted(() => {
  window.addEventListener('pulse:native-back', onNativeBack)
  void load()
  nextTick(() => {
    syncPullMinHeight()
    if (scrollBodyRef.value && typeof ResizeObserver !== 'undefined') {
      pullResizeObserver = new ResizeObserver(() => syncPullMinHeight())
      pullResizeObserver.observe(scrollBodyRef.value)
    }
  })
})

onUnmounted(() => {
  window.removeEventListener('pulse:native-back', onNativeBack)
  pullResizeObserver?.disconnect()
  pullResizeObserver = null
})

watch(list, () => { void warmFavoriteMedia() })

watch(sendTo, (value) => {
  if (!value) return
  managing.value = false
  selectedKeys.value = new Set()
})

async function load() {
  loading.value = true
  try {
    list.value = await fetchAllFavorites()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '加载失败')
  } finally {
    loading.value = false
  }
}

async function onPullRefresh() {
  refreshing.value = true
  try {
    list.value = await fetchAllFavorites()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '刷新失败')
  } finally {
    refreshing.value = false
  }
}

function goBack() {
  if (managing.value) {
    toggleManage()
    return
  }
  smartBack(router)
}

function favoriteMediaKey(item: FavoriteListItem, index: number): string {
  return `${item.kind}:${item.favorite.id}:${index}`
}

function favoriteMediaUrl(item: FavoriteListItem, index: number): string {
  const fileId = item.favorite.mediaFileIds?.[index]
  return fileId
    ? (localFavoriteMediaUrls.value[favoriteMediaKey(item, index)] || '')
    : resolveFileUrl(item.favorite.images?.[index] || '')
}

async function warmFavoriteMedia(): Promise<void> {
  await Promise.all(list.value.flatMap((item) => {
    const favorite = item.favorite
    const tasks: Promise<void>[] = []
    if (item.kind === 'community') {
      ;(favorite.mediaFileIds || []).forEach((fileId, index) => {
        const kind = favorite.mediaTypes?.[index] === 'video' ? 'video' : 'image'
        tasks.push(warmFavoriteEntry(item, fileId, index, kind, favorite.images?.[index] || fileDownloadUrl(fileId, kind === 'video' ? 'thumb' : 'preview')))
      })
    } else {
      const messageFavorite = item.favorite
      if (messageFavorite.msgType === 1 || messageFavorite.msgType === 2) {
        const fileId = parseFilePayload(messageFavorite.content)?.fileId || messageFavorite.fileId
        if (fileId) {
          const kind = messageFavorite.msgType === 2 && isVideoItem(messageFavorite) ? 'video' : 'image'
          tasks.push(warmFavoriteEntry(item, fileId, -1, kind, fileDownloadUrl(fileId, kind === 'video' ? 'thumb' : 'preview')))
        }
      }
    }
    return tasks
  }))
}

async function warmFavoriteEntry(item: FavoriteListItem, fileId: string, index: number, kind: 'image' | 'video', source: string): Promise<void> {
    const key = index < 0 ? `message:${item.favorite.id}:attachment` : favoriteMediaKey(item, index)
    const variant = kind === 'image' || kind === 'video' ? 'thumb' : 'original'
    if (!fileId || localFavoriteMediaUrls.value[key]) return
    const stable = getStableChatFileUrl(fileId, variant)
    if (stable) {
      localFavoriteMediaUrls.value = { ...localFavoriteMediaUrls.value, [key]: stable }
      return
    }
    try {
      const cached = await cacheChatFile(kind, fileId, variant, source)
      if (cached) localFavoriteMediaUrls.value = { ...localFavoriteMediaUrls.value, [key]: cached }
    } catch { /* leave a neutral placeholder */ }
}

function onNativeBack(event: Event) {
  if (!managing.value) return
  event.preventDefault()
  toggleManage()
}

async function fetchAllFavorites(): Promise<FavoriteListItem[]> {
  const [messages, communities] = await Promise.allSettled([
    fetchFavorites(),
    fetchCommunityFavorites(),
  ])
  if (messages.status === 'rejected' && communities.status === 'rejected') {
    throw messages.reason
  }
  if (messages.status === 'rejected' || communities.status === 'rejected') {
    showToast('部分收藏加载失败')
  }
  const items: FavoriteListItem[] = [
    ...(messages.status === 'fulfilled'
      ? messages.value.map((favorite) => ({
          kind: 'message' as const,
          key: `message-${favorite.id}`,
          favorite,
        }))
      : []),
    ...(communities.status === 'fulfilled'
      ? communities.value.map((favorite) => ({
          kind: 'community' as const,
          key: `community-${favorite.id}`,
          favorite,
        }))
      : []),
  ]
  return items.sort((a, b) => favoriteTime(b) - favoriteTime(a))
}

function favoriteTime(item: FavoriteListItem): number {
  const iso = item.kind === 'community'
    ? item.favorite.favoritedAt || item.favorite.createdAt
    : item.favorite.createdAt
  const time = iso ? new Date(iso).getTime() : 0
  return Number.isNaN(time) ? 0 : time
}

function openDetail(item: FavoriteListItem) {
  if (item.kind === 'community') {
    void router.push(`/favorites/community/${item.favorite.id}`)
    return
  }
  if (sendTo.value) {
    void sendFavorite(item.favorite)
    return
  }
  router.push(`/favorites/${item.favorite.id}`)
}

function toggleManage() {
  managing.value = !managing.value
  selectedKeys.value = new Set()
}

function toggleSelected(item: FavoriteListItem) {
  if (!managing.value || removingSelected.value) return
  const next = new Set(selectedKeys.value)
  if (next.has(item.key)) next.delete(item.key)
  else next.add(item.key)
  selectedKeys.value = next
}

function isSelected(item: FavoriteListItem) {
  return selectedKeys.value.has(item.key)
}

function toggleAllSelected() {
  if (!managing.value || removingSelected.value) return
  selectedKeys.value = allVisibleSelected.value
    ? new Set()
    : new Set(visibleList.value.map((item) => item.key))
}

async function sendFavorite(item: FavoriteItem) {
  if (!sendTo.value || sendingId.value) return
  try {
    await showConfirmDialog({
      title: '发送收藏内容',
      message: sendToName.value
        ? `确定将这条收藏发送给「${sendToName.value}」吗？`
        : '确定将这条收藏发送到当前聊天吗？',
      cancelButtonText: '取消',
      confirmButtonText: '发送',
    })
  } catch {
    return
  }
  sendingId.value = item.id
  try {
    await forwardFavorite(item.id, [sendTo.value])
    showToast('已发送')
    await router.replace(returnTo.value || `/chat/${sendTo.value}`)
  } catch (e) {
    showToast(e instanceof Error ? e.message : '发送失败')
  } finally {
    sendingId.value = ''
  }
}

function openForward(item: FavoriteListItem) {
  if (item.kind !== 'message') return
  router.push({ path: `/favorites/${item.favorite.id}`, query: { forward: '1' } })
}

function formatTime(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getMonth() + 1}/${d.getDate()} ${d.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })}`
}

function messageThumbUrl(item: FavoriteItem): string {
  if (item.msgType !== 1 && item.msgType !== 2) return ''
  const f = parseFilePayload(item.content)
  const fileId = f?.fileId || item.fileId
  if (fileId) return localFavoriteMediaUrls.value[`message:${item.id}:attachment`] || ''
  const raw = f?.url || (item.msgType === 1 && (item.content.startsWith('http') || item.content.startsWith('/'))
    ? item.content
    : '')
  return raw ? resolveFileUrl(raw) : ''
}

function isVideoItem(item: FavoriteItem): boolean {
  if (item.msgType !== 2) return false
  const f = parseFilePayload(item.content)
  if (!f) return false
  if (f.contentType?.startsWith('video/')) return true
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(f.url || f.name || '')
}

function previewText(item: FavoriteListItem): string {
  if (item.kind === 'community') {
    if (item.favorite.content.trim()) return item.favorite.content
    if (item.favorite.images.length) {
      return item.favorite.mediaTypes[0] === 'video' ? '[视频]' : '[图片]'
    }
    return '[圈子动态]'
  }
  if (item.favorite.msgType === 10 && item.favorite.images?.length && !item.favorite.content.trim()) {
    return '[图片]'
  }
  return favoritePreviewLabel(item.favorite.msgType, item.favorite.content)
}

async function onRemove(item: FavoriteListItem) {
  const isCommunity = item.kind === 'community'
  try {
    await showConfirmDialog({
      title: isCommunity ? '取消收藏' : '删除收藏',
      message: isCommunity ? '确定取消收藏这条圈子动态吗？' : '确定删除这条收藏吗？',
      confirmButtonText: isCommunity ? '取消收藏' : '删除',
      confirmButtonColor: '#ee0a24',
    })
  } catch {
    return
  }
  try {
    await removeFavoriteRequest(item)
    list.value = list.value.filter((x) => x.key !== item.key)
    showToast(isCommunity ? '已取消收藏' : '已删除')
  } catch (e) {
    showToast(e instanceof Error ? e.message : isCommunity ? '取消收藏失败' : '删除失败')
  }
}

async function removeFavoriteRequest(item: FavoriteListItem) {
  if (item.kind === 'community') await removeCommunityFavorite(item.favorite.id)
  else await deleteFavorite(item.favorite.id)
}

async function removeSelected() {
  const selected = visibleList.value.filter((item) => selectedKeys.value.has(item.key))
  if (!selected.length) {
    showToast('请选择收藏')
    return
  }
  try {
    await showConfirmDialog({
      title: '整理收藏',
      message: `确定删除选中的 ${selected.length} 条收藏吗？`,
      confirmButtonText: '删除',
      confirmButtonColor: '#ee0a24',
    })
  } catch {
    return
  }

  removingSelected.value = true
  try {
    const results = await Promise.allSettled(selected.map(removeFavoriteRequest))
    const succeeded = selected.filter((_, index) => results[index]?.status === 'fulfilled')
    const failed = selected.filter((_, index) => results[index]?.status === 'rejected')
    if (succeeded.length) {
      const succeededKeys = new Set(succeeded.map((item) => item.key))
      list.value = list.value.filter((item) => !succeededKeys.has(item.key))
    }
    selectedKeys.value = new Set(failed.map((item) => item.key))
    if (!failed.length) {
      managing.value = false
      showToast('已整理')
    } else {
      showToast(succeeded.length ? '部分收藏整理失败' : '收藏整理失败')
    }
  } finally {
    removingSelected.value = false
  }
}
</script>

<template>
  <div class="favorites-page">
    <header class="page-header">
      <button type="button" class="icon-btn" @click="goBack">
        <span class="material-symbols-outlined">arrow_back_ios</span>
      </button>
      <h1 class="page-title">{{ sendTo ? '选择收藏' : '我的收藏' }}</h1>
      <button
        v-if="!sendTo"
        type="button"
        class="manage-btn"
        :class="{ active: managing }"
        :aria-pressed="managing"
        @click.stop="toggleManage"
      >
        {{ managing ? '完成' : '整理收藏' }}
      </button>
      <span v-else class="spacer" />
    </header>

    <div ref="scrollBodyRef" class="scroll-body">
      <van-pull-refresh
        v-model="refreshing"
        class="list-pull"
        pulling-text="下拉刷新"
        loosing-text="释放刷新"
        loading-text="刷新中..."
        @refresh="onPullRefresh"
      >
        <div
          class="pull-inner"
          :style="pullMinHeight ? { minHeight: `${pullMinHeight}px` } : undefined"
        >
          <div v-if="loading" class="hint">加载中...</div>
          <div v-else-if="!visibleList.length" class="hint">
            {{ sendTo ? '暂无可发送的聊天收藏' : '暂无收藏内容' }}
          </div>
          <van-swipe-cell v-for="item in visibleList" :key="item.key">
            <button
              type="button"
              class="fav-item"
              :class="{ selected: isSelected(item), managing }"
              :disabled="!!sendingId || removingSelected"
              @click="managing ? toggleSelected(item) : openDetail(item)"
            >
              <span v-if="managing" class="fav-check" :class="{ checked: isSelected(item) }">
                <span v-if="isSelected(item)" class="material-symbols-outlined">check</span>
              </span>
              <div class="fav-top">
                <span class="fav-from">
                  {{ item.kind === 'community' ? item.favorite.nickname : item.favorite.fromNickname || '消息' }}
                  <span v-if="item.kind === 'community'" class="fav-kind">圈子动态</span>
                </span>
                <span class="fav-time">{{ formatTime(item.kind === 'community' ? item.favorite.favoritedAt || item.favorite.createdAt : item.favorite.createdAt) }}</span>
              </div>

              <div class="fav-body">
                <div v-if="item.kind === 'community' && item.favorite.images[0]" class="fav-thumb-wrap" :class="{ video: item.favorite.mediaTypes[0] === 'video' }">
                  <img v-if="item.favorite.mediaTypes[0] === 'video' && favoriteMediaUrl(item, 0)" :src="favoriteMediaUrl(item, 0)" alt="视频封面" class="fav-thumb" />
                  <img v-else-if="favoriteMediaUrl(item, 0)" :src="favoriteMediaUrl(item, 0)" alt="" class="fav-thumb" />
                  <span v-if="item.favorite.mediaTypes[0] === 'video'" class="material-symbols-outlined play-badge">play_circle</span>
                </div>
                <div
                  v-else-if="item.kind === 'message' && item.favorite.msgType === 10 && item.favorite.images?.length"
                  class="fav-thumb-wrap"
                  :class="{ video: item.favorite.mediaTypes?.[0] === 'video' }"
                >
                  <img
                    v-if="item.favorite.mediaTypes?.[0] === 'video'"
                    :src="favoriteMediaUrl(item, 0)"
                    alt="视频封面"
                    class="fav-thumb"
                  />
                  <img v-else-if="favoriteMediaUrl(item, 0)" :src="favoriteMediaUrl(item, 0)" alt="" class="fav-thumb" />
                  <span
                    v-if="item.favorite.mediaTypes?.[0] === 'video'"
                    class="material-symbols-outlined play-badge"
                  >play_circle</span>
                </div>
                <div v-else-if="item.kind === 'message' && item.favorite.msgType === 1 && messageThumbUrl(item.favorite)" class="fav-thumb-wrap">
                  <img :src="messageThumbUrl(item.favorite)" alt="" class="fav-thumb" />
                </div>
                <div v-else-if="item.kind === 'message' && isVideoItem(item.favorite) && messageThumbUrl(item.favorite)" class="fav-thumb-wrap video">
                  <img :src="messageThumbUrl(item.favorite)" alt="视频封面" class="fav-thumb" />
                  <span class="material-symbols-outlined play-badge">play_circle</span>
                </div>
                <div v-else-if="item.kind === 'message' && item.favorite.msgType === 2" class="fav-file-chip">
                  <span class="material-symbols-outlined">{{
                    isVideoItem(item.favorite) ? 'movie' : 'description'
                  }}</span>
                </div>
                <div v-else-if="item.kind === 'message' && item.favorite.msgType === 3" class="fav-file-chip">
                  <span class="material-symbols-outlined">mic</span>
                </div>

                <p class="fav-content">{{ previewText(item) }}</p>
              </div>

              <div class="fav-source">
                来自 {{ item.kind === 'community' ? `圈子 · ${item.favorite.communityName}` : item.favorite.sourceTitle || '聊天' }}
              </div>
            </button>
            <template v-if="!sendTo && !managing" #right>
              <button v-if="item.kind === 'message'" type="button" class="swipe-fwd" @click.stop="openForward(item)">转发</button>
              <button type="button" class="swipe-del" @click.stop="onRemove(item)">{{ item.kind === 'community' ? '取消收藏' : '删除' }}</button>
            </template>
          </van-swipe-cell>
          <div class="pull-filler" aria-hidden="true" />
        </div>
      </van-pull-refresh>
    </div>
    <div v-if="managing" class="manage-toolbar">
      <span class="manage-count">已选 {{ selectedCount }} 项</span>
      <button
        type="button"
        class="manage-select-all"
        :disabled="!visibleList.length || removingSelected"
        @click="toggleAllSelected"
      >
        {{ allVisibleSelected ? '取消全选' : '全选' }}
      </button>
      <button
        type="button"
        class="manage-delete"
        :disabled="selectedCount === 0 || removingSelected"
        @click="removeSelected"
      >
        删除选中
      </button>
    </div>
  </div>
</template>

<style scoped>
.favorites-page {
  height: 100%;
  height: 100dvh;
  background: var(--pulse-page-bg, var(--pulse-bg));
  color: var(--pulse-text);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.page-header {
  position: relative;
  z-index: 10;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 12px;
  padding-top: var(--pulse-header-pad-top);
  background: var(--pulse-page-bg, var(--pulse-bg));
  backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.icon-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  color: var(--pulse-primary);
  display: grid;
  place-items: center;
  cursor: pointer;
}

.page-title {
  margin: 0;
  flex: 1;
  text-align: center;
  font-size: 17px;
  font-weight: 700;
}

.spacer {
  width: 76px;
}

.manage-btn {
  position: relative;
  z-index: 3;
  width: 76px;
  height: 36px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--pulse-primary);
  font-size: 13px;
  cursor: pointer;
  pointer-events: auto;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.manage-btn:active {
  opacity: 0.7;
}

.manage-btn.active {
  border-radius: 8px;
  background: color-mix(in srgb, var(--pulse-primary) 12%, transparent);
}

.scroll-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-y: contain;
  background: var(--pulse-page-bg, var(--pulse-bg));
  display: flex;
  flex-direction: column;
}

.list-pull {
  flex: 1 0 auto;
  width: 100%;
  min-height: 100%;
  background: var(--pulse-page-bg, var(--pulse-bg));
  display: flex;
  flex-direction: column;
}

.list-pull :deep(.van-pull-refresh__track) {
  flex: 1 0 auto;
  display: flex;
  flex-direction: column;
  min-height: 100%;
  background: var(--pulse-page-bg, var(--pulse-bg));
}

.pull-inner {
  flex: 1 0 auto;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  padding: 8px 0 32px;
  box-sizing: border-box;
  background: var(--pulse-page-bg, var(--pulse-bg));
}

.pull-filler {
  flex: 1 0 auto;
  min-height: 48px;
  width: 100%;
  pointer-events: auto;
  touch-action: pan-y;
}

.main {
  flex: 1;
  min-height: 0;
  padding: 8px 0 32px;
  display: flex;
  flex-direction: column;
}

.main :deep(.list-pull) {
  flex: 1;
  min-height: calc(100dvh - 120px);
  background: var(--pulse-page-bg, var(--pulse-bg));
}

.hint {
  text-align: center;
  padding: 48px 24px;
  color: var(--pulse-outline);
  font-size: 14px;
}

.fav-item {
  position: relative;
  width: 100%;
  padding: 14px 16px;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  background: var(--pulse-page-bg, var(--pulse-bg));
  box-sizing: border-box;
  color: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.fav-item.selected {
  background: color-mix(in srgb, var(--pulse-primary) 8%, var(--pulse-page-bg, var(--pulse-bg)));
}

.fav-check {
  position: absolute;
  top: 50%;
  left: 16px;
  width: 20px;
  height: 20px;
  border: 1px solid var(--pulse-outline);
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  transform: translateY(-50%);
  box-sizing: border-box;
}

.fav-check.checked {
  border-color: var(--pulse-primary);
  background: var(--pulse-primary);
}

.fav-check .material-symbols-outlined {
  font-size: 15px;
  font-weight: 700;
}

.fav-item.managing {
  padding-left: 52px;
}

.fav-item:active {
  background: rgba(255, 255, 255, 0.03);
}

.fav-top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.fav-from {
  font-size: 13px;
  font-weight: 600;
  color: var(--pulse-primary);
}

.fav-kind {
  display: inline-flex;
  margin-left: 6px;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(173, 198, 255, 0.12);
  color: var(--pulse-primary);
  font-size: 10px;
  font-weight: 600;
  vertical-align: 1px;
}

.fav-time {
  font-size: 11px;
  color: var(--pulse-outline);
}

.fav-body {
  display: flex;
  align-items: center;
  gap: 10px;
}

.fav-thumb-wrap {
  position: relative;
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--pulse-surface-high);
}

.fav-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.fav-thumb-wrap.video .play-badge {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 28px;
  height: 28px;
  font-size: 28px;
  color: rgba(255, 255, 255, 0.92);
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.45));
}

.fav-file-chip {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: rgba(173, 198, 255, 0.12);
  color: var(--pulse-primary);
  display: grid;
  place-items: center;
}

.fav-file-chip .material-symbols-outlined {
  font-size: 22px;
}

.fav-content {
  margin: 0;
  flex: 1;
  min-width: 0;
  font-size: 15px;
  line-height: 1.45;
  color: var(--pulse-text);
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.fav-source {
  margin-top: 8px;
  font-size: 12px;
  color: var(--pulse-outline);
}

.swipe-fwd {
  height: 100%;
  min-width: 72px;
  border: none;
  background: #3b82f6;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  padding: 0 18px;
  cursor: pointer;
}

.swipe-del {
  height: 100%;
  min-width: 72px;
  border: none;
  background: #ee0a24;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  padding: 0 18px;
  cursor: pointer;
}

.manage-toolbar {
  flex-shrink: 0;
  min-height: 58px;
  padding: 8px 16px calc(8px + env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: var(--pulse-surface, var(--pulse-page-bg, var(--pulse-bg)));
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  box-sizing: border-box;
}

.manage-count {
  color: var(--pulse-outline);
  font-size: 13px;
}

.manage-select-all {
  min-width: 60px;
  height: 36px;
  padding: 0 8px;
  border: none;
  background: transparent;
  color: var(--pulse-primary);
  font-size: 13px;
  cursor: pointer;
}

.manage-select-all:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.manage-delete {
  min-width: 92px;
  height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: 8px;
  background: var(--pulse-danger, #ee0a24);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}

.manage-delete:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

:deep(.van-swipe-cell__right) {
  display: flex;
}
</style>

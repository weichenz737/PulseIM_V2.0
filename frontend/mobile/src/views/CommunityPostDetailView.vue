<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { showConfirmDialog, showDialog, showImagePreview, showToast } from 'vant'
import { useRoute, useRouter } from 'vue-router'
import CommunityReportDialog from '@/components/CommunityReportDialog.vue'
import MapAppChooser from '@/components/MapAppChooser.vue'
import MomentComments from '@/components/MomentComments.vue'
import {
  addCommunityComment,
  deleteCommunityComment,
  deleteCommunityPost,
  forwardCommunityPost,
  fetchCommunityComments,
  fetchCommunityPost,
  setCommunityPostPinned,
  toggleCommunityCommentLike,
  toggleCommunityFavorite,
  toggleCommunityLike,
  type CommunityPost,
} from '@/api/community'
import { fileDownloadUrl } from '@/api/file'
import { isVideoUrl, type MomentItem } from '@/api/moments'
import { openMediaVideoPreview } from '@/composables/useMediaVideoPreview'
import { cacheChatFile } from '@/utils/fileCache'
import { createMomentMediaCacheGuard, getStableMomentMedia } from '@/utils/momentMedia'
import { useUserStore } from '@/stores/user'
import { smartBack } from '@/utils/navBack'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const communityId = String(route.params.id || '')
const postId = String(route.params.postId || '')
const post = ref<CommunityPost>()
const loading = ref(true)
const refreshing = ref(false)
const loadError = ref('')
const commentOpen = ref(true)
const reportVisible = ref(false)
const postMenuVisible = ref(false)
const mapChooserVisible = ref(false)
const mapLocation = ref<{ latitude: number; longitude: number; name: string; address?: string } | null>(null)
const commentsSectionRef = ref<HTMLElement | null>(null)
const targetCommentId = computed(() => typeof route.query.commentId === 'string' ? route.query.commentId : '')
const localMediaUrls = ref<Record<string, string>>({})
const mediaCacheGuard = createMomentMediaCacheGuard()
let imagePreviewInstance: ReturnType<typeof showImagePreview> | null = null

function mediaKey(index: number): string { return `${post.value?.id || postId}:${index}` }

function mediaSource(index: number): string {
  const current = post.value
  if (!current) return ''
  const fileId = current.mediaFileIds?.[index]
  return fileId ? (localMediaUrls.value[mediaKey(index)] || '') : (current.images[index] || '')
}

function quotedMediaSource(quoted: NonNullable<CommunityPost['quotedPost']>, index: number): string {
  const fileId = quoted.mediaFileIds?.[index]
  return fileId ? (localMediaUrls.value[`quoted:${quoted.id}:${index}`] || '') : (quoted.images[index] || '')
}

async function warmPostMedia(current: CommunityPost): Promise<void> {
  const tasks = (current.images || []).map(async (source, index) => {
    const fileId = current.mediaFileIds?.[index]
    if (!fileId) return
    const kind = current.mediaTypes?.[index] === 'video' ? 'video' : 'image'
    const variant = kind === 'video' ? 'thumb' : 'preview'
    const key = `${current.id}:${index}`
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
      const cached = await cacheChatFile(kind, fileId, variant, cacheSource)
      if (cached) {
        mediaCacheGuard.onLoaded(fileId, variant)
        localMediaUrls.value = { ...localMediaUrls.value, [key]: cached }
      }
    } catch {
      if (kind === 'video') return
      try {
        const cached = await cacheChatFile('image', fileId, 'thumb', source || fileDownloadUrl(fileId, 'thumb'))
        if (cached) {
          mediaCacheGuard.onLoaded(fileId, 'thumb')
          localMediaUrls.value = { ...localMediaUrls.value, [key]: cached }
        }
      } catch { /* The explicit preview action retries the protected request. */ }
    }
  })
  const quoted = current.quotedPost
  if (quoted?.mediaFileIds?.[0] && quoted.images?.[0]) {
    tasks.push((async () => {
      const quotedKind = quoted.mediaTypes?.[0] === 'video' ? 'video' : 'image'
      try {
        const quotedVariant = quotedKind === 'video' ? 'thumb' : 'preview'
        const quotedSource = quotedKind === 'video' ? quoted.images[0] || fileDownloadUrl(quoted.mediaFileIds![0], 'thumb') : fileDownloadUrl(quoted.mediaFileIds![0], 'preview')
        const quotedKey = `quoted:${quoted.id}:0`
        const stable = getStableMomentMedia(quoted.mediaFileIds![0], quotedKind, quotedVariant)
        if (stable) {
          mediaCacheGuard.onLoaded(quoted.mediaFileIds![0], stable.variant)
          localMediaUrls.value = { ...localMediaUrls.value, [quotedKey]: stable.url }
          return
        }
        const cached = await cacheChatFile(quotedKind, quoted.mediaFileIds![0], quotedVariant, quotedSource)
        if (cached) {
          mediaCacheGuard.onLoaded(quoted.mediaFileIds![0], quotedVariant)
          localMediaUrls.value = { ...localMediaUrls.value, [quotedKey]: cached }
        }
      } catch {
        try {
          const cached = await cacheChatFile(quotedKind, quoted.mediaFileIds![0], 'thumb', quoted.images[0] || fileDownloadUrl(quoted.mediaFileIds![0], 'thumb'))
          if (cached) {
            mediaCacheGuard.onLoaded(quoted.mediaFileIds![0], 'thumb')
            localMediaUrls.value = { ...localMediaUrls.value, [`quoted:${quoted.id}:0`]: cached }
          }
        } catch { /* placeholder */ }
      }
    })())
  }
  await Promise.all(tasks)
}

function clearLocalMediaUrls(): void {
  mediaCacheGuard.reset()
  localMediaUrls.value = {}
}

const canDelete = computed(() =>
  !!post.value && (post.value.canDelete || String(post.value.userId) === String(userStore.userId || '')),
)
const canAttemptDelete = computed(() => !!post.value && (canDelete.value || post.value.canAttemptDelete))
const canManagePost = computed(() => post.value?.myRole === 'OWNER' || post.value?.myRole === 'ADMIN')
const postMenuActions = computed(() => {
  if (!post.value) return []
  const actions: Array<{ name: string; color?: string }> = []
  if (canManagePost.value) actions.push({ name: post.value.pinned ? '取消置顶' : '置顶动态' })
  if (canAttemptDelete.value) actions.push({ name: '删除动态', color: 'var(--pulse-danger)' })
  return actions
})

const commentApi = {
  add: async (id: string, payload: { content?: string; replyToCommentId?: string; imageFileId?: string; imageUrl?: string }) =>
    addCommunityComment(id, { content: payload.content, parentId: payload.replyToCommentId }),
  delete: deleteCommunityComment,
  like: toggleCommunityCommentLike,
}

function goBack() {
  smartBack(router, `/communities/${communityId}`)
}

async function load(silent = false) {
  if (!silent) {
    loading.value = true
    loadError.value = ''
  }
  try {
    const result = await fetchCommunityPost(postId)
    if (!result.id) throw new Error('动态不存在或已删除')
    if (!result.comments.length && result.commentCount > 0) {
      result.comments = await fetchCommunityComments(postId)
    }
    post.value = result
    clearLocalMediaUrls()
    await warmPostMedia(result)
    loadError.value = ''
  } catch (error) {
    const message = error instanceof Error ? error.message : '动态加载失败'
    if (silent) showToast(message)
    else loadError.value = message
  } finally {
    if (!silent) loading.value = false
  }
  if (post.value && targetCommentId.value) await focusNotificationComment()
}

async function onPullRefresh() {
  refreshing.value = true
  try {
    await load(true)
  } finally {
    refreshing.value = false
  }
}

async function focusNotificationComment(): Promise<void> {
  await nextTick()
  const section = commentsSectionRef.value
  if (!section) return
  const target = Array.from(section.querySelectorAll<HTMLElement>('[data-comment-id]'))
    .find((element) => element.dataset.commentId === targetCommentId.value)
  requestAnimationFrame(() => (target || section).scrollIntoView({ behavior: 'smooth', block: 'center' }))
}

function formatTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function statusLabel(status: string) {
  if (status === 'PENDING') return '审核中'
  if (status === 'BLOCKED') return '已屏蔽'
  return ''
}

function replacePost(next: MomentItem) {
  if (!post.value || next.id !== post.value.id) return
  post.value = { ...post.value, ...next }
}

function openAuthor() {
  if (!post.value?.userId) return
  const userId = String(post.value.userId)
  void router.push(userId === String(userStore.userId || '') ? '/app/me' : `/contacts/${userId}`)
}

async function onLike() {
  if (!post.value) return
  try {
    const result = await toggleCommunityLike(post.value.id)
    post.value = { ...post.value, likedByMe: result.liked, likeCount: result.likeCount }
  } catch (error) {
    showToast(error instanceof Error ? error.message : '操作失败')
  }
}

async function onFavorite() {
  if (!post.value) return
  if (post.value.favoritedByMe) {
    try {
      await showConfirmDialog({
        title: '取消收藏',
        message: '确定取消收藏这条圈子动态吗？',
        confirmButtonText: '取消收藏',
        confirmButtonColor: 'var(--pulse-danger, #ee0a24)',
      })
    } catch {
      return
    }
  }
  try {
    const result = await toggleCommunityFavorite(post.value.id)
    post.value = { ...post.value, favoritedByMe: result.favorited }
    showToast(result.favorited ? '已收藏，可在“我－我的收藏”中查看' : '已取消收藏')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '操作失败')
  }
}

async function forwardPost() {
  if (!post.value) return
  const opinion = window.prompt('转发到本圈，并附上你的看法（可留空）', '')
  if (opinion === null) return
  if (opinion.trim().length > 500) {
    showToast('看法不能超过500字')
    return
  }
  try {
    await forwardCommunityPost(post.value.id, opinion)
    showToast('已转发到本圈')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '转发失败')
  }
}

async function onDelete() {
  if (!post.value || !canAttemptDelete.value) return
  if (!canDelete.value) {
    const message = post.value.authorRole === 'OWNER'
      ? '管理员不能删除圈主的动态。'
      : post.value.authorRole === 'ADMIN'
        ? '管理员不能删除其他管理员的动态。'
        : '你没有权限删除这条动态。'
    await showDialog({ title: '无法删除', message })
    return
  }
  try {
    await showConfirmDialog({
      title: '删除动态',
      message: '删除后无法恢复，确定删除这条动态吗？',
      confirmButtonText: '删除',
      confirmButtonColor: 'var(--pulse-danger)',
    })
  } catch {
    return
  }
  try {
    await deleteCommunityPost(post.value.id)
    showToast('动态已删除')
    void router.replace(`/communities/${communityId}`)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '删除失败')
  }
}

async function togglePinned() {
  if (!post.value || !canManagePost.value) return
  const next = !post.value.pinned
  try {
    const result = await setCommunityPostPinned(post.value.id, next)
    post.value = {
      ...post.value,
      pinned: result.pinned,
      pinnedAt: result.pinned ? new Date().toISOString() : undefined,
    }
    showToast(result.pinned ? '动态已置顶' : '已取消置顶')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '置顶操作失败')
  }
}

async function onPostMenuSelect(action: { name: string }) {
  postMenuVisible.value = false
  if (action.name === '置顶动态' || action.name === '取消置顶') {
    await togglePinned()
    return
  }
  if (action.name === '删除动态') await onDelete()
}

async function openMediaPreview(index: number) {
  if (!post.value) return
  const fileId = post.value.mediaFileIds?.[index]
  const isVideo = post.value.mediaTypes?.[index] === 'video'
  const url = isVideo && fileId
    ? fileDownloadUrl(fileId, 'preview')
    : post.value.originalImages?.[index] || post.value.images[index] || (fileId ? fileDownloadUrl(fileId) : '')
  if (!url) return
  if (post.value.mediaTypes?.[index] === 'video' || isVideoUrl(url)) {
    await openMediaVideoPreview(url, { fileId, variant: 'preview' })
    return
  }
  const imageIndexes = (post.value.originalImages?.length ? post.value.originalImages : post.value.images)
    .map((_, mediaIndex) => mediaIndex)
    .filter((mediaIndex) => post.value?.mediaTypes?.[mediaIndex] !== 'video')
  const images = await Promise.all(imageIndexes.map(async (mediaIndex) => {
    const source = post.value?.originalImages?.[mediaIndex] || post.value?.images[mediaIndex] || ''
    const id = post.value?.mediaFileIds?.[mediaIndex]
    if (!id) return source
    try { return await cacheChatFile('image', id, 'original', source || fileDownloadUrl(id)) } catch { return '' }
  }))
  if (!images.some(Boolean)) return
  imagePreviewInstance = showImagePreview({
    images,
    startPosition: Math.max(0, imageIndexes.indexOf(index)),
    closeable: true,
    closeIconPosition: 'top-right',
    onClose: () => { imagePreviewInstance = null },
  })
}

function openLocationMap() {
  if (!post.value) return
  const latitude = Number(post.value.latitude)
  const longitude = Number(post.value.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    showToast('该动态没有可用的位置坐标')
    return
  }
  mapLocation.value = {
    latitude,
    longitude,
    name: post.value.locationName || '动态位置',
    address: post.value.locationAddress,
  }
  mapChooserVisible.value = true
}

function onNativeBack(event: Event) {
  if (!imagePreviewInstance) return
  event.preventDefault()
  imagePreviewInstance.close?.()
  imagePreviewInstance = null
}

onMounted(() => {
  window.addEventListener('pulse:native-back', onNativeBack)
  void load()
})

onBeforeUnmount(() => {
  window.removeEventListener('pulse:native-back', onNativeBack)
  mediaCacheGuard.dispose()
})
</script>

<template>
  <div class="post-detail-page">
    <header class="page-header">
      <button type="button" class="header-icon" aria-label="返回" @click="goBack">
        <span class="material-symbols-outlined">arrow_back_ios_new</span>
      </button>
      <div class="header-title"><h1>动态详情</h1><span>圈子内容</span></div>
      <button v-if="canManagePost" type="button" class="header-icon" aria-label="动态管理" @click="postMenuVisible = true">
        <span class="material-symbols-outlined">more_horiz</span>
      </button>
      <button v-else-if="canAttemptDelete" type="button" class="header-icon danger-icon" aria-label="删除动态" @click="onDelete">
        <span class="material-symbols-outlined">delete</span>
      </button>
      <span v-else class="header-spacer" />
    </header>

    <van-pull-refresh v-model="refreshing" class="post-pull" success-text="刷新成功" @refresh="onPullRefresh">
      <main>
        <div v-if="loading" class="page-state">
          <van-loading vertical>正在加载动态…</van-loading>
        </div>

        <div v-else-if="loadError || !post" class="page-state">
          <span class="material-symbols-outlined state-icon">article</span>
          <h2>暂时无法查看这条动态</h2>
          <p>{{ loadError || '动态不存在或已删除' }}</p>
          <button type="button" @click="goBack">返回圈子</button>
        </div>

        <article v-else class="detail-card">
        <header class="author-row">
          <button type="button" class="author-avatar" @click="openAuthor">
            <img v-if="post.avatarUrl" :src="post.avatarUrl" alt="" />
            <span v-else>{{ post.nickname.slice(0, 1) }}</span>
          </button>
          <div class="author-copy">
            <strong>{{ post.nickname }}</strong>
            <span>{{ formatTime(post.createdAt) }}</span>
          </div>
          <span v-if="post.pinned" class="pinned-chip"><span class="material-symbols-outlined">keep</span>置顶</span>
          <span v-if="statusLabel(post.status)" class="status-chip">{{ statusLabel(post.status) }}</span>
          <span v-else class="community-chip"><span class="material-symbols-outlined">groups</span>圈子动态</span>
        </header>

        <p v-if="post.content" class="post-content">{{ post.content }}</p>

        <button v-if="post.quotedPost" type="button" class="quoted-post-card" @click.stop="router.push(`/communities/${communityId}/posts/${post.quotedPost.id}`)">
          <span class="quoted-label"><span class="material-symbols-outlined">format_quote</span>引用 {{ post.quotedPost.nickname }} 的动态</span>
          <span v-if="post.quotedPost.content" class="quoted-content">{{ post.quotedPost.content }}</span>
          <img v-if="quotedMediaSource(post.quotedPost, 0)" :src="quotedMediaSource(post.quotedPost, 0)" alt="" class="quoted-image" />
        </button>

        <div v-if="post.images.length" class="media-grid" :class="`grid-${Math.min(post.images.length, 4)}`">
          <button
            v-for="(_, index) in post.images"
            :key="`${post.id}-${index}`"
            type="button"
            class="media-item"
            @click="openMediaPreview(index)"
          >
            <img v-if="post.mediaTypes[index] === 'video' && mediaSource(index)" :src="mediaSource(index)" alt="视频封面" />
            <img v-else-if="mediaSource(index)" :src="mediaSource(index)" alt="" />
            <span v-if="post.mediaTypes[index] === 'video' || isVideoUrl(mediaSource(index))" class="video-badge material-symbols-outlined">play_circle</span>
          </button>
        </div>

        <button v-if="post.locationName" type="button" class="location-card" @click="openLocationMap">
          <div class="location-mark">
            <span class="material-symbols-outlined">location_on</span>
            <i /><i /><i />
          </div>
          <div class="location-copy">
            <strong>{{ post.locationName }}</strong>
            <span>{{ post.locationAddress || '发布者标记的位置' }}</span>
          </div>
          <span class="material-symbols-outlined location-open">open_in_new</span>
        </button>

        <div class="engagement-summary">
          <span>{{ post.likeCount }} 个赞</span>
          <span>{{ post.commentCount }} 条评论</span>
        </div>

        <div class="post-actions">
          <button type="button" :class="{ active: post.likedByMe }" @click="onLike">
            <span class="material-symbols-outlined">favorite</span>
            {{ post.likedByMe ? '已赞' : '点赞' }}
          </button>
          <button type="button" @click="commentOpen = !commentOpen">
            <span class="material-symbols-outlined">chat_bubble</span>
            评论
          </button>
          <button type="button" :class="{ active: post.favoritedByMe }" @click="onFavorite">
            <span class="material-symbols-outlined">bookmark</span>
            {{ post.favoritedByMe ? '已收藏' : '收藏' }}
          </button>
          <button type="button" @click="forwardPost">
            <span class="material-symbols-outlined">repeat</span>
            转发
          </button>
          <button type="button" @click="reportVisible = true">
            <span class="material-symbols-outlined">flag</span>
            举报
          </button>
        </div>

        <section ref="commentsSectionRef" class="comments-section">
          <header><h2>评论</h2><span>{{ post.commentCount }}</span></header>
          <div v-if="!post.comments.length" class="comments-empty">
            <span class="material-symbols-outlined">chat_bubble_outline</span>
            <p>还没有评论，说说你的看法吧</p>
          </div>
          <MomentComments
            :item="post"
            :my-user-id="String(userStore.userId || '')"
            :open="commentOpen"
            :supports-images="false"
            :focus-comment-id="targetCommentId"
            :comment-api="commentApi"
            @update:item="replacePost"
            @update:open="commentOpen = $event"
          />
        </section>

        <button v-if="canAttemptDelete" type="button" class="delete-row" @click="onDelete">
          <span class="material-symbols-outlined">delete</span>
          删除这条动态
        </button>
        </article>
      </main>
    </van-pull-refresh>

    <CommunityReportDialog
      v-model:show="reportVisible"
      target-type="POST"
      :target-id="postId"
    />
    <MapAppChooser v-model:show="mapChooserVisible" :location="mapLocation" />
    <van-action-sheet
      v-model:show="postMenuVisible"
      title="动态操作"
      :actions="postMenuActions"
      cancel-text="取消"
      close-on-click-action
      @select="onPostMenuSelect"
    />
  </div>
</template>

<style scoped>
.post-detail-page {
  min-height: 100%;
  min-height: 100dvh;
  padding-bottom: calc(32px + env(safe-area-inset-bottom));
  background: var(--pulse-page-bg, var(--pulse-bg));
  color: var(--pulse-text);
}
.post-pull { min-height: calc(100dvh - 56px - var(--pulse-header-pad-top)); }
.page-header {
  position: sticky;
  top: 0;
  z-index: 25;
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--pulse-header-pad-top) 12px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--pulse-divider) 74%, transparent);
  background: color-mix(in srgb, var(--pulse-page-bg) 89%, transparent);
  backdrop-filter: blur(18px) saturate(1.2);
}
.header-icon,
.header-spacer { width: 40px; height: 40px; flex: 0 0 40px; }
.header-icon { display: grid; place-items: center; padding: 0; border: 0; border-radius: 50%; background: var(--pulse-surface-high); color: var(--pulse-text); }
.header-icon .material-symbols-outlined { font-size: 20px; }
.danger-icon { color: var(--pulse-danger); }
.header-title { text-align: center; }
.header-title h1,
.header-title span { display: block; margin: 0; }
.header-title h1 { font-size: 16px; }
.header-title span { margin-top: 1px; color: var(--pulse-text-secondary); font-size: 9px; }
:global(:root[data-theme='light']) .post-detail-page .page-header .header-title { flex-direction: column !important; }
:global(:root[data-theme='light']) .post-detail-page .page-header .header-title h1 {
  position: static !important;
  inset: auto !important;
  width: auto !important;
  height: auto !important;
  display: block !important;
  overflow: visible;
  pointer-events: auto !important;
}
main { width: min(100%, 680px); margin: 0 auto; }
.detail-card { margin: 14px; padding: 18px; border: 1px solid var(--pulse-divider); border-radius: 24px; background: var(--pulse-surface-container); box-shadow: 0 16px 38px color-mix(in srgb, var(--pulse-text) 7%, transparent); }
.author-row { display: flex; align-items: center; gap: 11px; }
.author-avatar { width: 46px; height: 46px; flex: 0 0 46px; display: grid; place-items: center; overflow: hidden; padding: 0; border: 0; border-radius: 50%; background: var(--pulse-surface-high); color: var(--pulse-primary); font-weight: 700; }
.author-avatar img { width: 100%; height: 100%; object-fit: cover; }
.author-copy { min-width: 0; flex: 1; }
.author-copy strong,
.author-copy span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.author-copy strong { font-size: 15px; }
.author-copy span { margin-top: 4px; color: var(--pulse-text-secondary); font-size: 11px; }
.community-chip,
.status-chip { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 3px; padding: 5px 8px; border-radius: 9px; background: color-mix(in srgb, var(--pulse-primary) 12%, var(--pulse-surface-high)); color: var(--pulse-primary); font-size: 10px; }
.community-chip .material-symbols-outlined { font-size: 14px; }
.pinned-chip { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 2px; padding: 5px 8px; border-radius: 9px; background: color-mix(in srgb, #f59e0b 14%, var(--pulse-surface-high)); color: #d97706; font-size: 10px; white-space: nowrap; }
.pinned-chip .material-symbols-outlined { font-size: 13px; }
.post-content { margin: 18px 0 0; font-size: var(--pulse-content-font-size, 16px); line-height: 1.78; white-space: pre-wrap; word-break: break-word; }
.media-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; margin-top: 16px; overflow: hidden; border-radius: 16px; }
.media-grid.grid-1 { grid-template-columns: 1fr; }
.media-grid.grid-2,
.media-grid.grid-4 { grid-template-columns: repeat(2, 1fr); }
.media-item { position: relative; min-width: 0; aspect-ratio: 1; overflow: hidden; padding: 0; border: 0; background: var(--pulse-surface-high); }
.grid-1 .media-item { aspect-ratio: 16 / 11; }
.media-item img,
.media-item video { width: 100%; height: 100%; display: block; object-fit: cover; }
.video-badge { position: absolute; inset: 0; display: grid; place-items: center; color: var(--pulse-on-primary); font-size: 44px; text-shadow: 0 2px 10px color-mix(in srgb, var(--pulse-text) 60%, transparent); }
.location-card { position: relative; overflow: hidden; display: flex; width: 100%; align-items: center; gap: 13px; margin-top: 16px; padding: 12px; border: 1px solid color-mix(in srgb, var(--pulse-primary) 18%, var(--pulse-divider)); border-radius: 16px; background: color-mix(in srgb, var(--pulse-primary) 8%, var(--pulse-surface-high)); color: var(--pulse-text); text-align: left; }
.location-mark { position: relative; width: 54px; height: 50px; flex: 0 0 54px; display: grid; place-items: center; overflow: hidden; border-radius: 12px; background: var(--pulse-surface-highest); color: var(--pulse-primary); }
.location-mark > span { position: relative; z-index: 2; font-size: 29px; font-variation-settings: 'FILL' 1; }
.location-mark i { position: absolute; width: 80px; height: 1px; background: color-mix(in srgb, var(--pulse-primary) 22%, transparent); transform: rotate(24deg); }
.location-mark i:nth-child(2) { transform: rotate(-18deg) translateY(14px); }
.location-mark i:nth-child(3) { transform: rotate(43deg) translateY(-13px); }
.location-copy { min-width: 0; flex: 1; }
.location-copy strong,
.location-copy span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.location-copy strong { font-size: 13px; }
.location-copy span { margin-top: 4px; color: var(--pulse-text-secondary); font-size: 11px; }
.location-open { flex: 0 0 auto; color: var(--pulse-primary); font-size: 19px; }
.engagement-summary { display: flex; gap: 14px; margin-top: 17px; color: var(--pulse-text-secondary); font-size: 11px; }
.post-actions { display: grid; grid-template-columns: repeat(5, 1fr); margin-top: 10px; padding: 10px 0; border-top: 1px solid var(--pulse-divider); border-bottom: 1px solid var(--pulse-divider); }
.post-actions button { min-width: 0; display: inline-flex; flex-direction: column; align-items: center; gap: 4px; padding: 5px 2px; border: 0; background: transparent; color: var(--pulse-text-secondary); font-size: 10px; }
.post-actions button.active { color: var(--pulse-primary); }
.post-actions .material-symbols-outlined { font-size: 20px; }
.quoted-post-card { display: flex; position: relative; width: 100%; flex-direction: column; gap: 6px; margin-top: 14px; padding: 11px 12px; border: 1px solid var(--pulse-divider); border-radius: 13px; background: var(--pulse-surface-high); color: var(--pulse-text); text-align: left; }
.quoted-label { display: flex; align-items: center; gap: 4px; color: var(--pulse-primary); font-size: 11px; font-weight: 650; }
.quoted-label .material-symbols-outlined { font-size: 16px; }
.quoted-content { display: -webkit-box; overflow: hidden; color: var(--pulse-text-secondary); font-size: 12px; line-height: 1.5; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
.quoted-image { width: 46px; height: 46px; margin-top: 2px; border-radius: 8px; object-fit: cover; }
.comments-section { margin-top: 18px; }
.comments-section > header { display: flex; align-items: baseline; gap: 6px; }
.comments-section h2 { margin: 0; font-size: 17px; }
.comments-section header span { color: var(--pulse-text-secondary); font-size: 11px; }
.comments-empty { display: flex; flex-direction: column; align-items: center; margin: 14px 0 6px; padding: 18px; border-radius: 14px; background: var(--pulse-surface-high); color: var(--pulse-text-secondary); }
.comments-empty .material-symbols-outlined { color: var(--pulse-primary); font-size: 28px; }
.comments-empty p { margin: 6px 0 0; font-size: 12px; }
.delete-row { width: 100%; min-height: 44px; display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 18px; border: 1px solid color-mix(in srgb, var(--pulse-danger) 35%, var(--pulse-divider)); border-radius: 14px; background: color-mix(in srgb, var(--pulse-danger) 7%, var(--pulse-surface-container)); color: var(--pulse-danger); }
.delete-row .material-symbols-outlined { font-size: 18px; }
.page-state { min-height: 62dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px 24px; color: var(--pulse-text-secondary); text-align: center; }
.page-state h2 { margin: 14px 0 0; color: var(--pulse-text); font-size: 18px; }
.page-state p { margin: 7px 0 18px; font-size: 13px; }
.page-state > button { min-height: 42px; padding: 0 18px; border: 0; border-radius: 21px; background: var(--pulse-primary-gradient, var(--pulse-primary)); color: var(--pulse-on-primary); font-weight: 600; }
.state-icon { color: var(--pulse-primary); font-size: 42px; }
button { font: inherit; cursor: pointer; }
</style>

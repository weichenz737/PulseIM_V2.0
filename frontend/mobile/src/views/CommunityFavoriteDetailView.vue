<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog, showImagePreview, showToast } from 'vant'
import {
  fetchCommunityFavorites,
  removeCommunityFavorite,
  type CommunityFavoriteItem,
} from '@/api/communityFavorites'
import { isVideoUrl } from '@/api/moments'
import { fileDownloadUrl } from '@/api/file'
import { openMediaVideoPreview } from '@/composables/useMediaVideoPreview'
import { cacheChatFile } from '@/utils/fileCache'
import { createMomentMediaCacheGuard, getStableMomentMedia } from '@/utils/momentMedia'
import { smartBack } from '@/utils/navBack'

const route = useRoute()
const router = useRouter()
const favoriteId = computed(() => String(route.params.id || ''))
const item = ref<CommunityFavoriteItem>()
const loading = ref(true)
const localMediaUrls = ref<Record<string, string>>({})
const mediaCacheGuard = createMomentMediaCacheGuard()

function mediaSource(index: number): string {
  if (!item.value) return ''
  const fileId = item.value.mediaFileIds?.[index]
  return fileId ? (localMediaUrls.value[`${item.value.id}:${index}`] || '') : (item.value.images[index] || '')
}

async function warmMedia(): Promise<void> {
  const current = item.value
  if (!current) return
  await Promise.all((current.images || []).map(async (source, index) => {
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
      const cached = await cacheChatFile(kind, fileId, variant, fileDownloadUrl(fileId, variant) || source)
      if (cached) {
        mediaCacheGuard.onLoaded(fileId, variant)
        localMediaUrls.value = { ...localMediaUrls.value, [key]: cached }
      }
    } catch { /* placeholder */ }
  }))
}

function clearLocalMediaUrls(): void {
  mediaCacheGuard.reset()
  localMediaUrls.value = {}
}

onMounted(() => { void load() })

async function load() {
  loading.value = true
  try {
    const rows = await fetchCommunityFavorites()
    item.value = rows.find((entry) => entry.id === favoriteId.value)
    clearLocalMediaUrls()
    await warmMedia()
    if (!item.value) showToast('该收藏不存在或已取消')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '收藏详情加载失败')
  } finally {
    loading.value = false
  }
}

function goBack() {
  smartBack(router, '/favorites')
}

function formatTime(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN', { hour12: false })
}

async function openMedia(index: number) {
  if (!item.value) return
  const fileId = item.value.mediaFileIds?.[index]
  const isVideo = item.value.mediaTypes?.[index] === 'video'
  const url = isVideo && fileId
    ? fileDownloadUrl(fileId, 'preview')
    : item.value.originalImages?.[index] || item.value.images[index] || (fileId ? fileDownloadUrl(fileId) : '')
  if (!url) return
  if (item.value.mediaTypes[index] === 'video' || isVideoUrl(url)) {
    await openMediaVideoPreview(url, { fileId, variant: 'preview' })
    return
  }
  const imageIndexes = (item.value.originalImages?.length ? item.value.originalImages : item.value.images)
    .map((_, mediaIndex) => mediaIndex)
    .filter((mediaIndex) => item.value?.mediaTypes[mediaIndex] !== 'video')
  const images = await Promise.all(imageIndexes.map(async (mediaIndex) => {
    const source = item.value?.originalImages?.[mediaIndex] || item.value?.images[mediaIndex] || ''
    const id = item.value?.mediaFileIds?.[mediaIndex]
    if (!id) return source
    try { return await cacheChatFile('image', id, 'original', source || fileDownloadUrl(id)) } catch { return '' }
  }))
  if (!images.some(Boolean)) return
  showImagePreview({ images, startPosition: Math.max(0, imageIndexes.indexOf(index)), closeable: true })
}

function openOriginal() {
  if (!item.value) return
  void router.push(`/communities/${item.value.communityId}/posts/${item.value.id}`)
}

async function removeFavorite() {
  if (!item.value) return
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
  try {
    await removeCommunityFavorite(item.value.id)
    showToast('已取消收藏')
    await router.replace('/favorites')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '取消收藏失败')
  }
}

onBeforeUnmount(() => mediaCacheGuard.dispose())
</script>

<template>
  <div class="favorite-detail-page">
    <header class="page-header">
      <button type="button" class="header-btn" aria-label="返回" @click="goBack">
        <span class="material-symbols-outlined">arrow_back_ios_new</span>
      </button>
      <h1>收藏详情</h1>
      <button v-if="item" type="button" class="header-btn delete-btn" aria-label="取消收藏" @click="removeFavorite">
        <span class="material-symbols-outlined">delete</span>
      </button>
      <span v-else class="header-btn" />
    </header>

    <main>
      <div v-if="loading" class="page-state"><van-loading vertical>正在加载收藏…</van-loading></div>
      <div v-else-if="!item" class="page-state">
        <span class="material-symbols-outlined state-icon">bookmark_remove</span>
        <p>该收藏不存在或已取消</p>
        <button type="button" @click="goBack">返回我的收藏</button>
      </div>
      <article v-else class="detail-card">
        <section class="source-card">
          <span class="source-icon material-symbols-outlined">groups</span>
          <div><small>来自圈子</small><strong>{{ item.communityName }}</strong></div>
          <time>收藏于 {{ formatTime(item.favoritedAt) }}</time>
        </section>

        <header class="author-row">
          <img v-if="item.avatarUrl" :src="item.avatarUrl" alt="" />
          <span v-else class="author-avatar">{{ item.nickname.slice(0, 1) }}</span>
          <div><strong>{{ item.nickname }}</strong><small>发布于 {{ formatTime(item.createdAt) }}</small></div>
        </header>

        <p v-if="item.content" class="post-content">{{ item.content }}</p>
        <p v-else-if="!item.images.length" class="post-content empty-content">这条动态没有文字内容</p>

        <div v-if="item.images.length" class="media-grid" :class="`grid-${Math.min(item.images.length, 4)}`">
          <button v-for="(_, index) in item.images" :key="`${item.id}-${index}`" type="button" @click="openMedia(index)">
            <img v-if="item.mediaTypes[index] === 'video' && mediaSource(index)" :src="mediaSource(index)" alt="视频封面" />
            <img v-else-if="mediaSource(index)" :src="mediaSource(index)" alt="" />
            <span v-if="item.mediaTypes[index] === 'video' || isVideoUrl(mediaSource(index))" class="play-icon material-symbols-outlined">play_circle</span>
          </button>
        </div>

        <button type="button" class="original-btn" @click="openOriginal">
          <span class="material-symbols-outlined">open_in_new</span>
          查看原动态
        </button>
      </article>
    </main>
  </div>
</template>

<style scoped>
.favorite-detail-page{min-height:100dvh;background:var(--pulse-page-bg,var(--pulse-bg));color:var(--pulse-text)}
.page-header{position:sticky;top:0;z-index:20;display:flex;height:56px;align-items:center;padding:var(--pulse-header-pad-top) 12px 0;border-bottom:1px solid var(--pulse-divider);background:var(--pulse-page-bg,var(--pulse-bg))}.page-header h1{min-width:0;flex:1;margin:0;text-align:center;font-size:17px}.header-btn{width:40px;height:40px;display:grid;flex:0 0 40px;place-items:center;padding:0;border:0;border-radius:50%;background:transparent;color:var(--pulse-primary)}.delete-btn{color:var(--pulse-danger,#ee0a24)}
.favorite-detail-page .page-header h1{position:absolute;top:50%;left:50%;width:max-content;max-width:calc(100% - 120px);margin:0;transform:translate(-50%,-50%);white-space:nowrap;pointer-events:none}
main{width:min(100%,680px);margin:0 auto;padding-bottom:calc(30px + env(safe-area-inset-bottom))}.detail-card{margin:14px;padding:17px;border:1px solid var(--pulse-divider);border-radius:22px;background:var(--pulse-surface-container)}
.source-card{display:flex;align-items:center;gap:10px;padding:12px;border-radius:15px;background:color-mix(in srgb,var(--pulse-primary) 9%,var(--pulse-surface-high))}.source-icon{display:grid;width:40px;height:40px;place-items:center;border-radius:12px;background:var(--pulse-surface-high);color:var(--pulse-primary)}.source-card div{min-width:0;flex:1}.source-card small,.source-card strong{display:block}.source-card small,.source-card time{color:var(--pulse-text-secondary);font-size:10px}.source-card strong{margin-top:3px;font-size:14px}.source-card time{text-align:right}
.author-row{display:flex;align-items:center;gap:10px;margin-top:18px}.author-row img,.author-avatar{width:44px;height:44px;flex:0 0 44px;border-radius:50%;object-fit:cover}.author-avatar{display:grid;place-items:center;background:var(--pulse-surface-high);color:var(--pulse-primary);font-weight:700}.author-row div{min-width:0}.author-row strong,.author-row small{display:block}.author-row small{margin-top:4px;color:var(--pulse-text-secondary);font-size:11px}
.post-content{margin:17px 0 0;font-size:16px;line-height:1.75;white-space:pre-wrap;word-break:break-word}.empty-content{color:var(--pulse-text-secondary)}.media-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:16px;overflow:hidden;border-radius:15px}.media-grid.grid-1{grid-template-columns:1fr}.media-grid.grid-2,.media-grid.grid-4{grid-template-columns:repeat(2,1fr)}.media-grid button{position:relative;aspect-ratio:1;overflow:hidden;padding:0;border:0;background:var(--pulse-surface-high)}.media-grid.grid-1 button{aspect-ratio:16/11}.media-grid img,.media-grid video{width:100%;height:100%;display:block;object-fit:cover}.play-icon{position:absolute;inset:0;display:grid;place-items:center;color:#fff;font-size:42px;text-shadow:0 2px 8px #0008}
.original-btn{width:100%;height:44px;display:flex;align-items:center;justify-content:center;gap:6px;margin-top:20px;border:1px solid color-mix(in srgb,var(--pulse-primary) 34%,var(--pulse-divider));border-radius:14px;background:color-mix(in srgb,var(--pulse-primary) 8%,var(--pulse-surface-container));color:var(--pulse-primary);font:inherit;font-weight:650}.original-btn .material-symbols-outlined{font-size:18px}.page-state{min-height:70dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:30px;color:var(--pulse-text-secondary);text-align:center}.page-state>button{height:42px;padding:0 18px;border:0;border-radius:21px;background:var(--pulse-primary);color:var(--pulse-on-primary)}.state-icon{color:var(--pulse-primary);font-size:44px}
</style>

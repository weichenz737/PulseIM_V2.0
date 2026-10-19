<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import {
  fetchMessage,
  parseForwardCard,
  parseFilePayload,
  parseContactCard,
  parseLocationPayload,
  forwardItemPreview,
  type ForwardCardPayload,
  type ForwardCardItem,
} from '@/api/message'
import { fileDownloadUrl, resolveFileUrl } from '@/api/file'
import { openFilePreview } from '@/composables/useFilePreview'
import { cacheChatFile, getStableChatFileUrl } from '@/utils/fileCache'
import { formatFileSize, formatVoiceDuration } from '@/utils/media'
import { useUserStore, parseUserIdFromToken } from '@/stores/user'
import { smartBack } from '@/utils/navBack'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const conversationId = computed(() => route.params.id as string)
const msgId = computed(() => route.params.msgId as string)
const loading = ref(true)
const card = ref<ForwardCardPayload | null>(null)
const localFileThumbs = ref<Record<string, string>>({})

const myUserId = computed(() => {
  const fromStore = userStore.userId
  if (fromStore) return String(fromStore)
  return parseUserIdFromToken(userStore.token) || ''
})

onMounted(async () => {
  userStore.restoreSession()
  try {
    const msg = await fetchMessage(conversationId.value, msgId.value, myUserId.value || 'me')
    if (msg.msgType !== 4) {
      showToast('不是聊天记录卡片')
      card.value = null
      return
    }
    card.value = parseForwardCard(msg.content)
    await warmForwardMedia()
    if (!card.value) showToast('聊天记录解析失败')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '加载失败')
  } finally {
    loading.value = false
  }
})

async function warmForwardMedia() {
  const items = card.value?.items || []
  await Promise.all(items.map(async (item, index) => {
    const file = fileOf(item)
    const fileId = file?.fileId
    if (!fileId || localFileThumbs.value[String(index)]) return
    const kind = item.msgType === 2 ? 'video' : item.msgType === 3 ? 'audio' : 'image'
    const variant = kind === 'image' ? 'thumb' : kind === 'video' ? 'preview' : 'original'
    try {
      const stable = getStableChatFileUrl(fileId, variant)
      if (stable) {
        localFileThumbs.value = { ...localFileThumbs.value, [String(index)]: stable }
        return
      }
      const cacheSource = variant === 'thumb'
        ? file?.thumbUrl || fileDownloadUrl(fileId, 'thumb')
        : file?.previewUrl || fileDownloadUrl(fileId, 'preview')
      const cached = await cacheChatFile(kind, fileId, variant, cacheSource)
      if (cached) localFileThumbs.value = { ...localFileThumbs.value, [String(index)]: cached }
    } catch { /* leave a neutral placeholder */ }
  }))
}

function goBack() {
  smartBack(router)
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

function fileOf(item: ForwardCardItem) {
  return item.msgType === 1 || item.msgType === 2 || item.msgType === 3
    ? parseFilePayload(item.content)
    : null
}

function imageUrlOf(item: ForwardCardItem, index?: number) {
  const file = fileOf(item)
  if (file?.fileId) return index == null ? '' : localFileThumbs.value[String(index)] || ''
  return file?.thumbUrl || file?.url ? resolveFileUrl(file.thumbUrl || file.url) : ''
}

function openItemPreview(item: ForwardCardItem) {
  const file = fileOf(item)
  if (!file?.url) return
  openFilePreview({
    url: resolveFileUrl(file.url),
    fileId: file.fileId,
    name: file.name || '文件',
    size: file.size,
    contentType: file.contentType,
  })
}

function isVideoItem(item: ForwardCardItem) {
  const file = fileOf(item)
  if (!file) return false
  return file.contentType?.startsWith('video/') === true
    || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(file.url || file.name || '')
}

function contactCardOf(item: ForwardCardItem) {
  return item.msgType === 5 ? parseContactCard(item.content) : null
}

function locationOf(item: ForwardCardItem) {
  return item.msgType === 6 ? parseLocationPayload(item.content) : null
}

function nestedForwardOf(item: ForwardCardItem) {
  return item.msgType === 4 ? parseForwardCard(item.content) : null
}

function contactCardLabel(item: ForwardCardItem) {
  const card = contactCardOf(item)
  if (!card) return '名片'
  if (card.cardType === 'community') return '圈子名片'
  return card.cardType === 'group' ? '群名片' : '个人名片'
}

function locationMapUrl(item: ForwardCardItem) {
  const location = locationOf(item)
  if (!location) return ''
  const point = `${location.latitude},${location.longitude}`
  return `https://api.map.baidu.com/marker?location=${encodeURIComponent(point)}&title=${encodeURIComponent(location.name || '位置')}&content=${encodeURIComponent(location.address || '')}&output=html&src=pulseim`
}
</script>

<template>
  <div class="forward-detail-page">
    <header class="page-header">
      <button type="button" class="icon-btn" @click="goBack">
        <span class="material-symbols-outlined">arrow_back_ios</span>
      </button>
      <h1 class="page-title">{{ card?.title || '聊天记录' }}</h1>
      <span class="spacer" />
    </header>

    <main class="main">
      <div v-if="loading" class="hint">加载中...</div>
      <div v-else-if="!card" class="hint">无法查看该聊天记录</div>
      <template v-else>
        <div class="meta">共 {{ card.count }} 条消息 · 来自 {{ card.sourceTitle || '聊天' }}</div>
        <div v-for="(item, idx) in card.items" :key="item.msgId || idx" class="item">
          <div class="item-top">
            <span class="name">{{ item.fromNickname || '用户' }}</span>
            <span class="time">{{ formatTime(item.createdAt) }}</span>
          </div>
          <div v-if="item.msgType === 1 && imageUrlOf(item, idx)" class="media-block" @click="openItemPreview(item)">
            <img :src="imageUrlOf(item, idx)" alt="图片" class="img" />
          </div>
          <div v-else-if="item.msgType === 2 && fileOf(item)" class="media-block">
            <button type="button" class="file-card" @click="openItemPreview(item)">
              <span class="material-symbols-outlined file-icon">{{ isVideoItem(item) ? 'movie' : 'description' }}</span>
              <span class="file-meta">
                <strong>{{ fileOf(item)?.name || (isVideoItem(item) ? '视频' : '文件') }}</strong>
                <small>{{ formatFileSize(fileOf(item)?.size) || '点击打开预览' }}</small>
              </span>
              <span class="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
          <button v-else-if="item.msgType === 3 && fileOf(item)" type="button" class="voice-card" @click="openItemPreview(item)">
            <span class="material-symbols-outlined">mic</span>
            <span>{{ fileOf(item)?.durationMs ? `语音 ${formatVoiceDuration(fileOf(item)!.durationMs)}` : '语音消息' }}</span>
            <span class="material-symbols-outlined">play_arrow</span>
          </button>
          <div v-else-if="item.msgType === 4 && nestedForwardOf(item)" class="nested-forward">
            <strong>{{ nestedForwardOf(item)!.title }}</strong>
            <small>聊天记录 · {{ nestedForwardOf(item)!.count }} 条</small>
          </div>
          <div v-else-if="item.msgType === 5 && contactCardOf(item)" class="contact-card">
            <img
              v-if="contactCardOf(item)!.avatarUrl"
              :src="contactCardOf(item)!.avatarUrl"
              :alt="contactCardOf(item)!.nickname"
              class="contact-avatar"
            />
            <span v-else class="contact-avatar initials">{{ contactCardOf(item)!.nickname.slice(0, 1) }}</span>
            <span class="contact-meta">
              <strong>{{ contactCardOf(item)!.nickname }}</strong>
              <small>{{ contactCardLabel(item) }}</small>
            </span>
          </div>
          <div v-else-if="item.msgType === 6 && locationOf(item)" class="location-card">
            <span class="material-symbols-outlined location-icon">location_on</span>
            <span class="location-meta">
              <strong>{{ locationOf(item)!.name || '位置信息' }}</strong>
              <small>{{ locationOf(item)!.address || '暂无详细地址' }}</small>
              <a v-if="locationMapUrl(item)" :href="locationMapUrl(item)" target="_blank" rel="noopener noreferrer">查看地图</a>
            </span>
          </div>
          <p v-else class="content">{{ forwardItemPreview(item) }}</p>
        </div>
      </template>
    </main>
  </div>
</template>

<style scoped>
.forward-detail-page {
  min-height: 100%;
  background: var(--pulse-page-bg, var(--pulse-bg));
  color: var(--pulse-text);
}

.page-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 12px;
  padding-top: var(--pulse-header-pad-top);
  background: rgba(18, 19, 23, 0.94);
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
  font-size: 16px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.spacer {
  width: 36px;
}

.main {
  padding: 12px 16px 32px;
}

.hint {
  text-align: center;
  padding: 48px 24px;
  color: var(--pulse-outline);
  font-size: 14px;
}

.meta {
  margin-bottom: 14px;
  font-size: 12px;
  color: var(--pulse-outline);
}

.item {
  padding: 12px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.item-top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.name {
  font-size: 13px;
  font-weight: 700;
  color: var(--pulse-primary);
}

.time {
  font-size: 11px;
  color: var(--pulse-outline);
  flex-shrink: 0;
}

.content {
  margin: 0;
  font-size: 15px;
  line-height: 1.5;
  color: var(--pulse-text);
  word-break: break-word;
  white-space: pre-wrap;
}

.media-block {
  display: grid;
  gap: 8px;
}

.img {
  max-width: min(240px, 70vw);
  border-radius: 8px;
  display: block;
}

.video {
  width: min(300px, 78vw);
  max-width: 100%;
  border-radius: 8px;
  background: #000;
}

.file-card,
.contact-card,
.location-card,
.voice-card,
.nested-forward {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 100%;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--pulse-text);
  text-decoration: none;
}

.file-card { width: 100%; border: 0; text-align: left; font: inherit; cursor: pointer; }

.file-icon,
.location-icon {
  color: var(--pulse-primary);
  flex-shrink: 0;
}

.file-meta,
.contact-meta,
.location-meta,
.nested-forward {
  min-width: 0;
}

.file-meta,
.contact-meta,
.location-meta {
  display: grid;
  gap: 3px;
  flex: 1;
}

.file-meta strong,
.contact-meta strong,
.location-meta strong,
.nested-forward strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-meta small,
.contact-meta small,
.location-meta small,
.nested-forward small {
  color: var(--pulse-outline);
  font-size: 12px;
}

.voice-card {
  flex-wrap: wrap;
  width: 100%;
  border: 0;
  text-align: left;
  font: inherit;
  cursor: pointer;
}

.voice-card audio {
  width: min(260px, 100%);
}

.contact-avatar {
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  border-radius: 50%;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.12);
}

.contact-avatar.initials {
  display: grid;
  place-items: center;
  color: var(--pulse-primary);
  font-weight: 700;
}

.location-card {
  align-items: flex-start;
}

.location-meta a {
  color: var(--pulse-primary);
  font-size: 12px;
}

.nested-forward {
  display: grid;
  gap: 4px;
  border-left: 3px solid var(--pulse-primary);
}
</style>

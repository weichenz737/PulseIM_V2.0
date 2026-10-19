<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { smartBack } from '@/utils/navBack'
import {
  showConfirmDialog,
  showImagePreview,
  showLoadingToast,
  closeToast,
  showToast,
} from 'vant'
import {
  fetchFavorite,
  fetchLocatableMessage,
  deleteFavorite,
  forwardFavorite,
  favoritePreviewLabel,
  parseFilePayload,
  parseForwardCard,
  parseContactCard,
  parseLocationPayload,
  type FavoriteItem,
} from '@/api/message'
import { fetchConversations, type ConversationItem } from '@/api/conversation'
import { fileDownloadUrl, resolveAvatarUrl, resolveFileUrl } from '@/api/file'
import { openFilePreview } from '@/composables/useFilePreview'
import { openMediaVideoPreview } from '@/composables/useMediaVideoPreview'
import { cacheChatFile, getStableChatFileUrl } from '@/utils/fileCache'
import { formatFileSize, formatVoiceDuration } from '@/utils/media'
import { saveMediaToDevice, toastForSaveResult } from '@/utils/saveMedia'
import { useConversationInboxStore } from '@/stores/conversationInbox'

const route = useRoute()
const router = useRouter()
const inbox = useConversationInboxStore()
const loading = ref(true)
const item = ref<FavoriteItem | null>(null)
const showSaveSheet = ref(false)
const saving = ref(false)
const locating = ref(false)
const localMomentMediaUrls = ref<Record<string, string>>({})
const localMessageImageUrl = ref('')

const showForwardSheet = ref(false)
const forwardTargets = ref<ConversationItem[]>([])
const forwardSelectedIds = ref<Set<string>>(new Set())
const forwardLoading = ref(false)
const forwarding = ref(false)
const forwardSelectedCount = computed(() => forwardSelectedIds.value.size)

const favoriteId = computed(() => String(route.params.id || ''))

onMounted(async () => {
  await load()
  if (route.query.forward === '1' && item.value && item.value.msgType !== 10) {
    await openForwardPicker()
    router.replace({ path: route.path, query: {} })
  }
})

async function load() {
  loading.value = true
  try {
    const loaded = await fetchFavorite(favoriteId.value)
    if (loaded.msgType === 10 && loaded.mediaFileIds?.length) {
      const count = Math.max(loaded.images?.length || 0, loaded.mediaFileIds.length)
      loaded.images = Array.from({ length: count }, (_, index) => loaded.mediaFileIds?.[index]
        ? fileDownloadUrl(loaded.mediaFileIds[index], 'thumb')
        : loaded.images?.[index] || '')
    }
    clearLocalMomentMediaUrls()
    localMessageImageUrl.value = ''
    item.value = loaded
    if (loaded.msgType === 1) {
      const payload = parseFilePayload(loaded.content)
      const fileId = payload?.fileId || loaded.fileId
      if (fileId) {
        try {
          localMessageImageUrl.value = await cacheChatFile(
            'image',
            fileId,
            'thumb',
            fileDownloadUrl(fileId, 'thumb'),
          )
        } catch {
          localMessageImageUrl.value = ''
        }
      }
    }
    await warmMomentMedia()
  } catch (e) {
    item.value = null
    localMessageImageUrl.value = ''
    showToast(e instanceof Error ? e.message : '加载失败')
  } finally {
    loading.value = false
  }
}

async function openForwardPicker() {
  if (!item.value || item.value.msgType === 10) return
  forwardSelectedIds.value = new Set()
  forwardLoading.value = true
  showForwardSheet.value = true
  try {
    const list = await fetchConversations('all')
    forwardTargets.value = list.filter((c) => !String(c.id).startsWith('tmp_'))
  } catch {
    forwardTargets.value = []
    showToast('加载会话失败')
  } finally {
    forwardLoading.value = false
  }
}

function toggleForwardTarget(id: string) {
  const next = new Set(forwardSelectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  forwardSelectedIds.value = next
}

function isForwardSelected(id: string) {
  return forwardSelectedIds.value.has(id)
}

async function submitForward() {
  if (!item.value) return
  const targetIds = [...forwardSelectedIds.value]
  if (!targetIds.length) {
    showToast('请选择转发目标')
    return
  }
  const names = forwardTargets.value
    .filter((c) => forwardSelectedIds.value.has(c.id))
    .map((c) => c.name)
  const nameText = names.length <= 2 ? names.join('、') : `${names[0]}等${names.length}个会话`
  try {
    await showConfirmDialog({
      title: '确认转发',
      message: `将收藏内容转发到「${nameText}」？`,
      confirmButtonText: '转发',
    })
  } catch {
    return
  }
  forwarding.value = true
  try {
    const count = await forwardFavorite(item.value.id, targetIds)
    const preview = favoritePreviewLabel(item.value.msgType, item.value.content) || '[转发消息]'
    targetIds.forEach((id) => inbox.notifyLocalMessage(id, preview))
    showForwardSheet.value = false
    forwardSelectedIds.value = new Set()
    showToast(`已转发至 ${targetIds.length} 个会话（${count} 条）`)
  } catch (e) {
    showToast(e instanceof Error ? e.message : '转发失败')
  } finally {
    forwarding.value = false
  }
}

function goBack() {
  smartBack(router)
}

function clearLocalMomentMediaUrls() {
  localMomentMediaUrls.value = {}
}

function momentMediaSource(index: number): string {
  const current = item.value
  if (!current) return ''
  const fileId = current.mediaFileIds?.[index]
  return fileId ? (localMomentMediaUrls.value[`${current.id}:${index}`] || '') : resolveFileUrl(current.images?.[index] || '')
}

async function warmMomentMedia() {
  const current = item.value
  if (!current || current.msgType !== 10 || !current.images?.length) return
  await Promise.all(current.images.map(async (source, index) => {
    const fileId = current.mediaFileIds?.[index]
    const key = `${current.id}:${index}`
    if (!fileId || localMomentMediaUrls.value[key]) return
    const kind = current.mediaTypes?.[index] === 'video' ? 'video' : 'image'
    const variant = kind === 'video' ? 'thumb' : 'preview'
    const stable = getStableChatFileUrl(fileId, variant)
    if (stable) {
      localMomentMediaUrls.value = { ...localMomentMediaUrls.value, [key]: stable }
      return
    }
    try {
      const cached = await cacheChatFile(kind, fileId, variant, fileDownloadUrl(fileId, variant) || source)
      if (cached) localMomentMediaUrls.value = { ...localMomentMediaUrls.value, [key]: cached }
    } catch { /* placeholder */ }
  }))
}

async function locateOriginalMessage() {
  if (!item.value || locating.value) return
  locating.value = true
  try {
    if (item.value.msgType === 10) {
      const postId = item.value.msgId.replace(/^moment:/, '')
      if (!postId) {
        showToast('朋友圈动态不存在')
        return
      }
      await router.push({ path: '/moments', query: { postId } })
      return
    }
    const conversations = await fetchConversations('all')
    const conversation = conversations.find((entry) => entry.id === item.value?.conversationId)
    if (!conversation) {
      showToast('原会话不存在或已不可访问')
      return
    }
    const original = await fetchLocatableMessage(item.value.conversationId, item.value.msgId)
    if (!original) {
      showToast('原消息已不存在')
      return
    }
    await router.push({
      path: `/chat/${item.value.conversationId}`,
      query: {
        title: conversation.name || item.value.sourceTitle || '聊天',
        type: conversation.type,
        peerUserId: conversation.peerUserId || '',
        avatar: conversation.avatar || '',
        highlightMsgId: original.id,
      },
    })
  } catch (error) {
    showToast(error instanceof Error ? error.message : '暂时无法定位原消息')
  } finally {
    locating.value = false
  }
}

function formatTime(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })}`
}

const filePayload = computed(() => {
  const it = item.value
  if (!it) return null
  if (it.msgType === 1 || it.msgType === 2 || it.msgType === 3) {
    return parseFilePayload(it.content)
  }
  return null
})

const imageUrl = computed(() => {
  const it = item.value
  if (!it || it.msgType !== 1) return ''
  const f = filePayload.value
  return resolveFileUrl(
    f?.url || (it.content.startsWith('http') || it.content.startsWith('/') ? it.content : ''),
  )
})

const messageImageUrl = computed(() => {
  const f = filePayload.value
  const fileId = f?.fileId || item.value?.fileId
  // Protected fileId URLs cannot be used as a bare <img> source. The
  // preview layer can authenticate and download them when the user taps the
  // fallback card, but the detail image itself must be cache-backed.
  return fileId ? localMessageImageUrl.value : imageUrl.value
})

const isVideo = computed(() => {
  const f = filePayload.value
  if (!f) return false
  if (f.contentType?.startsWith('video/')) return true
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(f.url || f.name || '')
})

const fileUrl = computed(() => {
  const f = filePayload.value
  return f?.url ? resolveFileUrl(f.url) : ''
})

const canSaveAlbum = computed(() => {
  if (item.value?.msgType === 1 && imageUrl.value) return true
  if (item.value?.msgType === 2 && isVideo.value && fileUrl.value) return true
  return false
})

const forwardCard = computed(() =>
  item.value?.msgType === 4 ? parseForwardCard(item.value.content) : null,
)

const contactCard = computed(() =>
  item.value?.msgType === 5 ? parseContactCard(item.value.content) : null,
)

const locationPayload = computed(() =>
  item.value?.msgType === 6 ? parseLocationPayload(item.value.content) : null,
)

const textBody = computed(() => {
  const it = item.value
  if (!it) return ''
  if (it.msgType === 0 || it.msgType === 9 || it.msgType === 10) return it.content
  if (!filePayload.value && (it.msgType === 1 || it.msgType === 2 || it.msgType === 3)) {
    return favoritePreviewLabel(it.msgType, it.content)
  }
  return ''
})

function openImage() {
  if (longPressOpened) {
    longPressOpened = false
    return
  }
  if (!imageUrl.value) return
  openFilePreview({
    url: imageUrl.value,
    fileId: filePayload.value?.fileId || item.value?.fileId,
    name: filePayload.value?.name || '图片',
    size: filePayload.value?.size,
    contentType: filePayload.value?.contentType || 'image/*',
  })
}

async function openMomentImage(index: number) {
  const it = item.value
  if (!it?.images?.length) return
  const imageIndexes = it.images.map((_, mediaIndex) => mediaIndex).filter((mediaIndex) => it.mediaTypes?.[mediaIndex] !== 'video')
  const images = await Promise.all(imageIndexes.map(async (mediaIndex) => {
    const fileId = it.mediaFileIds?.[mediaIndex]
    const source = fileId ? fileDownloadUrl(fileId) : it.images?.[mediaIndex] || ''
    if (!fileId) return resolveFileUrl(source)
    try { return await cacheChatFile('image', fileId, 'original', source || fileDownloadUrl(fileId)) } catch { return '' }
  }))
  if (!images.some(Boolean)) return
  showImagePreview({
    images,
    startPosition: Math.max(0, imageIndexes.indexOf(index)),
    closeable: true,
  })
}

async function openMomentVideo(index: number) {
  const fileId = item.value?.mediaFileIds?.[index]
  const url = fileId ? fileDownloadUrl(fileId, 'preview') : item.value?.images?.[index] || ''
  if (!url) return
  await openMediaVideoPreview(url, { fileId, variant: 'preview' })
}

function openFile() {
  if (!fileUrl.value) return
  const file = filePayload.value
  openFilePreview({
    url: fileUrl.value,
    fileId: filePayload.value?.fileId || item.value?.fileId,
    name: file?.name || '文件',
    size: file?.size,
    contentType: file?.contentType,
  })
}

onBeforeUnmount(clearLocalMomentMediaUrls)

let longPressTimer: ReturnType<typeof setTimeout> | null = null
let longPressOpened = false
let longPressMoved = false
let longPressStartY = 0

function clearMediaLongPress() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

function onMediaPressStart(e: TouchEvent | MouseEvent) {
  if (!canSaveAlbum.value) return
  longPressMoved = false
  longPressOpened = false
  if ('touches' in e) {
    longPressStartY = e.touches[0]?.clientY ?? 0
  }
  clearMediaLongPress()
  longPressTimer = setTimeout(() => {
    longPressTimer = null
    if (longPressMoved) return
    longPressOpened = true
    showSaveSheet.value = true
    try {
      navigator.vibrate?.(12)
    } catch {
      /* ignore */
    }
  }, 420)
}

function onMediaPressMove(e: TouchEvent) {
  const y = e.touches[0]?.clientY ?? longPressStartY
  if (Math.abs(y - longPressStartY) > 8) {
    longPressMoved = true
    clearMediaLongPress()
  }
}

function onMediaPressEnd() {
  clearMediaLongPress()
}

function onMediaContextMenu(e: Event) {
  if (!canSaveAlbum.value) return
  e.preventDefault()
  e.stopPropagation()
  showSaveSheet.value = true
}

async function onSaveAction(action: { name: string }) {
  showSaveSheet.value = false
  if (action.name !== '保存到相册') return
  await saveCurrentMedia()
}

async function saveCurrentMedia() {
  if (saving.value || !canSaveAlbum.value) return
  const isImg = item.value?.msgType === 1
  const url = isImg ? imageUrl.value : fileUrl.value
  if (!url) {
    showToast('无法保存')
    return
  }
  saving.value = true
  showLoadingToast({ message: '保存中...', forbidClick: true, duration: 0 })
  try {
    const result = await saveMediaToDevice(url, {
      filename: isImg
        ? `pulse_image_${Date.now()}`
        : filePayload.value?.name || `pulse_video_${Date.now()}.mp4`,
      ...(isImg
        ? {}
        : { mimeType: filePayload.value?.contentType || 'video/mp4' }),
    })
    closeToast()
    const tip = toastForSaveResult(result)
    if (tip) showToast(tip)
  } catch (e) {
    closeToast()
    showToast(e instanceof Error ? e.message : '保存失败')
  } finally {
    saving.value = false
  }
}

async function onRemove() {
  if (!item.value) return
  try {
    await showConfirmDialog({
      title: '删除收藏',
      message: '确定删除这条收藏吗？',
      confirmButtonText: '删除',
      confirmButtonColor: '#ee0a24',
    })
  } catch {
    return
  }
  try {
    await deleteFavorite(item.value.id)
    showToast('已删除')
    router.replace('/favorites')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '删除失败')
  }
}
</script>

<template>
  <div class="fav-detail-page">
    <header class="page-header">
      <button type="button" class="icon-btn" @click="goBack">
        <span class="material-symbols-outlined">arrow_back_ios</span>
      </button>
      <h1 class="page-title">收藏详情</h1>
      <div class="header-actions">
        <button
          type="button"
          class="icon-btn"
          :disabled="!item || item.msgType === 10"
          @click="openForwardPicker"
        >
          <span class="material-symbols-outlined">forward</span>
        </button>
        <button type="button" class="icon-btn danger" :disabled="!item" @click="onRemove">
          <span class="material-symbols-outlined">delete</span>
        </button>
      </div>
    </header>

    <main class="main">
      <div v-if="loading" class="hint">加载中...</div>
      <div v-else-if="!item" class="hint">收藏不存在或已删除</div>
      <template v-else>
        <div class="meta-card">
          <div class="meta-row">
            <span class="meta-label">来自</span>
            <span class="meta-value">{{ item.fromNickname || '消息' }}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">会话</span>
            <span class="meta-value">{{ item.sourceTitle || '聊天' }}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">时间</span>
            <span class="meta-value">{{ formatTime(item.createdAt) }}</span>
          </div>
        </div>

        <button type="button" class="locate-button" :disabled="locating" @click="locateOriginalMessage">
          <span class="material-symbols-outlined">my_location</span>
          {{ locating ? '正在定位…' : item.msgType === 10 ? '查看朋友圈动态' : '定位到原消息' }}
        </button>

        <section class="content-card">
          <img
            v-if="item.msgType === 1 && messageImageUrl"
            :src="messageImageUrl"
            alt="图片"
            class="detail-image"
            draggable="false"
            @click="openImage"
            @touchstart.passive="onMediaPressStart"
            @touchmove.passive="onMediaPressMove"
            @touchend="onMediaPressEnd"
            @touchcancel="onMediaPressEnd"
            @mousedown="onMediaPressStart"
            @mouseup="onMediaPressEnd"
            @mouseleave="onMediaPressEnd"
            @contextmenu="onMediaContextMenu"
            @dragstart.prevent
          />

          <button
            v-else-if="item.msgType === 1 && filePayload"
            type="button"
            class="file-card"
            @click="openImage"
          >
            <span class="material-symbols-outlined file-icon">image</span>
            <div class="file-meta">
              <div class="file-name">{{ filePayload.name || '图片' }}</div>
              <div class="file-sub">点击加载图片</div>
            </div>
            <span class="material-symbols-outlined">chevron_right</span>
          </button>

          <button
            v-else-if="item.msgType === 2 && filePayload"
            type="button"
            class="file-card"
            @click="openFile"
          >
            <span class="material-symbols-outlined file-icon">{{ isVideo ? 'movie' : 'description' }}</span>
            <div class="file-meta">
              <div class="file-name">{{ filePayload.name || (isVideo ? '视频' : '文件') }}</div>
              <div class="file-sub">{{ formatFileSize(filePayload.size) || '点击打开预览' }}</div>
            </div>
            <span class="material-symbols-outlined">chevron_right</span>
          </button>

          <div v-else-if="item.msgType === 3 && filePayload" class="voice-card">
            <span class="material-symbols-outlined">mic</span>
            <span>{{
              filePayload.durationMs
                ? `语音 ${formatVoiceDuration(filePayload.durationMs)}`
                : '语音消息'
            }}</span>
            <button v-if="fileUrl" type="button" class="link-btn" @click="openFile">播放</button>
          </div>

          <div v-else-if="item.msgType === 4 && forwardCard" class="forward-card">
            <div class="fwd-title">{{ forwardCard.title }}</div>
            <div class="fwd-sub">共 {{ forwardCard.count }} 条 · {{ forwardCard.sourceTitle || '聊天' }}</div>
          </div>

          <div v-else-if="item.msgType === 5 && contactCard" class="contact-card">
            <img
              v-if="contactCard.avatarUrl"
              :src="resolveAvatarUrl(contactCard.avatarUrl)"
              alt=""
              class="contact-avatar"
            />
            <div v-else class="contact-avatar initials">{{ contactCard.nickname.slice(0, 1) }}</div>
            <div>
              <div class="contact-name">{{ contactCard.nickname }}</div>
              <div class="contact-sub">
                {{ contactCard.cardType === 'group' ? '群名片' : '个人名片' }}
              </div>
            </div>
          </div>

          <div v-else-if="item.msgType === 6 && locationPayload" class="location-card">
            <span class="material-symbols-outlined location-icon">location_on</span>
            <div class="location-info">
              <div class="location-name">{{ locationPayload.name || '位置信息' }}</div>
              <div class="location-address">{{ locationPayload.address || '暂无详细地址' }}</div>
            </div>
          </div>

          <div v-else-if="item.msgType === 10 && item.images?.length" class="moment-fav-grid">
            <div
              v-for="(media, index) in item.images"
              :key="media"
              class="moment-fav-media"
              :class="{ video: item.mediaTypes?.[index] === 'video' }"
            >
              <img
                v-if="item.mediaTypes?.[index] === 'video'"
                :src="momentMediaSource(index)"
                alt="视频封面"
                class="moment-fav-thumb"
                @click="openMomentVideo(index)"
              />
              <img
                v-else
                :src="momentMediaSource(index)"
                alt=""
                class="moment-fav-thumb"
                @click="openMomentImage(index)"
              />
              <span
                v-if="item.mediaTypes?.[index] === 'video'"
                class="material-symbols-outlined moment-fav-play"
              >play_circle</span>
            </div>
          </div>

          <p v-else-if="textBody" class="text-body">{{ textBody }}</p>
          <p v-else class="text-body muted">
            {{ favoritePreviewLabel(item.msgType, item.content) || '无法展示该收藏内容' }}
          </p>

          <p v-if="item.msgType === 1 && imageUrl" class="save-hint">长按可保存到相册</p>
        </section>
      </template>
    </main>

    <van-action-sheet
      v-model:show="showSaveSheet"
      :actions="[{ name: '保存到相册' }]"
      cancel-text="取消"
      @select="onSaveAction"
    />

    <van-popup
      v-model:show="showForwardSheet"
      position="bottom"
      round
      :style="{ height: '72%' }"
    >
      <div class="forward-panel">
        <div class="forward-header">
          <div class="forward-title">选择转发对象</div>
          <div class="forward-hint">已选 {{ forwardSelectedCount }} 个会话 · 可多选</div>
        </div>
        <div class="forward-list">
          <div v-if="forwardLoading" class="forward-empty">加载中...</div>
          <div v-else-if="!forwardTargets.length" class="forward-empty">暂无会话</div>
          <button
            v-for="c in forwardTargets"
            :key="c.id"
            type="button"
            class="forward-item"
            :class="{ on: isForwardSelected(c.id) }"
            @click="toggleForwardTarget(c.id)"
          >
            <span class="material-symbols-outlined forward-check">{{
              isForwardSelected(c.id) ? 'check_circle' : 'radio_button_unchecked'
            }}</span>
            <img v-if="c.avatar" :src="c.avatar" :alt="c.name" class="forward-avatar" />
            <div v-else class="forward-avatar initials">{{ c.name.slice(0, 1) }}</div>
            <div class="forward-meta">
              <div class="forward-name">{{ c.name }}</div>
              <div class="forward-sub">{{ c.type === 'group' ? '群聊' : '私聊' }}</div>
            </div>
          </button>
        </div>
        <div class="forward-actions">
          <button type="button" class="forward-cancel" @click="showForwardSheet = false">取消</button>
          <button
            type="button"
            class="forward-submit"
            :disabled="!forwardSelectedCount || forwarding"
            @click="submitForward"
          >
            {{ forwarding ? '转发中...' : `确认转发${forwardSelectedCount ? ` (${forwardSelectedCount})` : ''}` }}
          </button>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.fav-detail-page {
  min-height: 100%;
  background: var(--pulse-page-bg, var(--pulse-bg));
  color: var(--pulse-text);
}

.moment-fav-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin: 12px 0;
}

.moment-fav-media {
  position: relative;
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  background: #000;
}

.moment-fav-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border: none;
}

.moment-fav-play {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 44px;
  color: rgba(255, 255, 255, 0.92);
  pointer-events: none;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
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
  background: rgba(18, 19, 23, 0.92);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.header-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  position: relative;
  z-index: 1;
}

.page-header > .icon-btn:first-child {
  flex: 0 0 36px;
  position: relative;
  z-index: 1;
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

.icon-btn.danger {
  color: #ff8a80;
}

.page-title {
  margin: 0;
  flex: 1;
  text-align: center;
  font-size: 17px;
  font-weight: 700;
}

.fav-detail-page .page-header .page-title {
  position: absolute;
  top: 50%;
  left: 50%;
  right: auto;
  bottom: auto;
  height: auto;
  width: max-content;
  max-width: calc(100% - 120px);
  margin: 0;
  transform: translate(-50%, -50%);
  display: block;
  white-space: nowrap;
  pointer-events: none;
}

.icon-btn:disabled {
  opacity: 0.35;
}

.main {
  padding: 16px;
  padding-bottom: calc(24px + env(safe-area-inset-bottom));
}

.hint {
  text-align: center;
  padding: 48px 24px;
  color: var(--pulse-outline);
  font-size: 14px;
}

.meta-card {
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  margin-bottom: 14px;
}

.meta-row {
  display: flex;
  gap: 12px;
  padding: 4px 0;
  font-size: 13px;
}

.meta-label {
  width: 36px;
  flex-shrink: 0;
  color: var(--pulse-outline);
}

.meta-value {
  flex: 1;
  min-width: 0;
  word-break: break-word;
}

.content-card {
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  padding: 14px;
}

.detail-image {
  width: 100%;
  max-height: 70vh;
  object-fit: contain;
  border-radius: 10px;
  background: var(--pulse-bg);
  cursor: zoom-in;
  -webkit-touch-callout: none;
  user-select: none;
}

.video-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.detail-video {
  width: 100%;
  max-height: 70vh;
  border-radius: 10px;
  background: #000;
}

.video-fallback-btn {
  border: none;
  border-radius: 8px;
  padding: 10px 12px;
  background: rgba(173, 198, 255, 0.16);
  color: var(--pulse-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.save-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--pulse-outline);
  text-align: center;
}

.file-card {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: none;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.file-icon {
  font-size: 28px;
  color: var(--pulse-primary);
}

.file-meta {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 15px;
  font-weight: 600;
  word-break: break-all;
}

.file-sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--pulse-outline);
}

.voice-card {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
}

.link-btn {
  margin-left: auto;
  border: none;
  background: transparent;
  color: var(--pulse-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.forward-card .fwd-title {
  font-size: 15px;
  font-weight: 700;
}

.fwd-sub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--pulse-outline);
}

.contact-card {
  display: flex;
  align-items: center;
  gap: 12px;
}

.contact-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--pulse-surface-high);
}

.contact-avatar.initials {
  display: grid;
  place-items: center;
  font-weight: 700;
}

.contact-name {
  font-size: 16px;
  font-weight: 700;
}

.contact-sub {
  font-size: 12px;
  color: var(--pulse-outline);
}

.locate-button {
  width: 100%;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 0 0 14px;
  border: 1px solid color-mix(in srgb, var(--pulse-primary) 36%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--pulse-primary) 10%, transparent);
  color: var(--pulse-primary);
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}

.locate-button:disabled { opacity: .55; }
.locate-button .material-symbols-outlined { font-size: 19px; }

.location-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border-radius: 14px;
  background: rgba(173, 198, 255, 0.08);
}

.location-icon {
  flex-shrink: 0;
  font-size: 32px;
  color: var(--pulse-primary);
}

.location-info {
  min-width: 0;
}

.location-name {
  font-size: 16px;
  font-weight: 700;
  word-break: break-word;
}

.location-address {
  margin-top: 4px;
  font-size: 13px;
  line-height: 1.4;
  color: var(--pulse-outline);
  word-break: break-word;
}

.text-body {
  margin: 0;
  font-size: 16px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}

.text-body.muted {
  color: var(--pulse-outline);
}

.forward-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1a1b22;
  color: var(--pulse-text);
}

.forward-header {
  padding: 16px 16px 8px;
}

.forward-title {
  font-size: 17px;
  font-weight: 700;
}

.forward-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--pulse-outline);
}

.forward-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 12px 12px;
}

.forward-empty {
  padding: 40px 12px;
  text-align: center;
  color: var(--pulse-outline);
  font-size: 14px;
}

.forward-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 8px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.forward-item.on {
  background: rgba(173, 198, 255, 0.12);
}

.forward-check {
  font-size: 22px;
  color: #6b7185;
}

.forward-item.on .forward-check {
  color: var(--pulse-primary);
}

.forward-avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  object-fit: cover;
  background: #2a2d38;
  flex-shrink: 0;
}

.forward-avatar.initials {
  display: grid;
  place-items: center;
  font-weight: 700;
  color: var(--pulse-primary);
}

.forward-meta {
  min-width: 0;
  flex: 1;
}

.forward-name {
  font-size: 15px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.forward-sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--pulse-outline);
}

.forward-actions {
  display: flex;
  gap: 10px;
  padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.forward-cancel,
.forward-submit {
  flex: 1;
  height: 44px;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.forward-cancel {
  background: rgba(255, 255, 255, 0.08);
  color: var(--pulse-text);
}

.forward-submit {
  background: var(--pulse-primary);
  color: var(--pulse-bg);
}

.forward-submit:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>

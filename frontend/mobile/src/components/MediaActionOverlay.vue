<script setup lang="ts">
import { computed, ref } from 'vue'
import { showLoadingToast, closeToast, showToast, type ActionSheetAction } from 'vant'
import { mediaActionState, closeMediaActions } from '@/composables/useMediaActions'
import { fetchConversations, type ConversationItem } from '@/api/conversation'
import { sendTextMessage } from '@/api/message'
import { saveMediaToDevice, toastForSaveResult } from '@/utils/saveMedia'
import { useConversationInboxStore } from '@/stores/conversationInbox'

const inbox = useConversationInboxStore()

const mediaActions: ActionSheetAction[] = [{ name: '保存到相册' }, { name: '转发' }]

const forwardVisible = ref(false)
const forwardTargets = ref<ConversationItem[]>([])
const forwardSelected = ref<Set<string>>(new Set())
const forwardLoading = ref(false)
const forwarding = ref(false)

const forwardSelectedCount = computed(() => forwardSelected.value.size)
const mediaLabel = computed(() => (mediaActionState.kind === 'video' ? '视频' : '图片'))

function urlFilename(url: string, fallback: string): string {
  if (!url) return fallback
  try {
    const path = new URL(url, window.location.origin).pathname
    const base = decodeURIComponent(path.split('/').pop() || '')
    if (base && /\.\w{2,5}$/i.test(base)) return base
  } catch {
    /* ignore */
  }
  return fallback
}

function guessContentType(url: string, kind: 'image' | 'video'): string {
  const raw = (url || '').toLowerCase().split('?')[0]
  if (kind === 'video') {
    if (/\.(webm)$/i.test(raw)) return 'video/webm'
    if (/\.(mov)$/i.test(raw)) return 'video/quicktime'
    if (/\.(m4v|mkv|3gp)$/i.test(raw)) return 'video/mp4'
    return 'video/mp4'
  }
  if (/\.(png)$/i.test(raw)) return 'image/png'
  if (/\.(gif)$/i.test(raw)) return 'image/gif'
  if (/\.(webp)$/i.test(raw)) return 'image/webp'
  if (/\.(heic|heif)$/i.test(raw)) return 'image/heic'
  return 'image/jpeg'
}

function onAction(action: ActionSheetAction) {
  if (action.name === '保存到相册') {
    void saveCurrentMedia()
  } else if (action.name === '转发') {
    void openForwardPicker()
  }
}

async function saveCurrentMedia() {
  const url = mediaActionState.url
  if (!url) return
  closeMediaActions()
  showLoadingToast({ message: '保存中...', forbidClick: true, duration: 0, zIndex: 21001 })
  try {
    const result = await saveMediaToDevice(url, {
      filename: mediaActionState.filename || undefined,
      mimeType: mediaActionState.contentType || undefined,
    })
    const tip = toastForSaveResult(result)
    if (tip) showToast({ message: tip, zIndex: 21001 })
  } catch (e) {
    showToast({ message: e instanceof Error ? e.message : '保存失败', zIndex: 21001 })
  } finally {
    closeToast()
  }
}

async function openForwardPicker() {
  closeMediaActions()
  forwardVisible.value = true
  forwardSelected.value = new Set()
  forwardLoading.value = true
  try {
    const list = await fetchConversations('all')
    forwardTargets.value = list
  } catch {
    forwardTargets.value = []
    showToast({ message: '加载会话失败', zIndex: 21001 })
  } finally {
    forwardLoading.value = false
  }
}

function toggleForwardTarget(id: string) {
  const next = new Set(forwardSelected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  forwardSelected.value = next
}

function isForwardSelected(id: string) {
  return forwardSelected.value.has(id)
}

async function submitForward() {
  const targetIds = [...forwardSelected.value]
  if (!targetIds.length) {
    showToast({ message: '请选择转发目标', zIndex: 21001 })
    return
  }
  const url = mediaActionState.url
  if (!url) {
    showToast({ message: '转发失败，媒体地址无效', zIndex: 21001 })
    return
  }
  forwarding.value = true
  showLoadingToast({ message: '转发中...', forbidClick: true, duration: 0, zIndex: 21001 })
  const kind = mediaActionState.kind
  const filename =
    mediaActionState.filename ||
    urlFilename(url, kind === 'video' ? `moment_video_${Date.now()}.mp4` : `moment_image_${Date.now()}.jpg`)
  const contentType =
    mediaActionState.contentType || guessContentType(url, kind)
  const payload = JSON.stringify({
    url,
    fileId: mediaActionState.fileId || undefined,
    originalUrl: mediaActionState.originalUrl || undefined,
    name: filename,
    contentType,
  })
  const msgType = kind === 'video' ? 2 : 1
  const preview = kind === 'video' ? '[视频]' : '[图片]'
  try {
    for (const targetId of targetIds) {
      const target = forwardTargets.value.find((c) => c.id === targetId)
      await sendTextMessage({
        conversationId: targetId,
        toUserId: target?.type === 'personal' ? target.peerUserId : undefined,
        content: payload,
        clientMsgId: `moment-fwd-${Date.now()}-${targetId}-${Math.random().toString(36).slice(2, 8)}`,
        msgType,
        fileId: mediaActionState.fileId || undefined,
      })
      inbox.notifyLocalMessage(targetId, preview)
    }
    closeToast()
    forwardVisible.value = false
    forwardSelected.value = new Set()
    showToast({ message: `已转发至 ${targetIds.length} 个会话`, zIndex: 21001 })
  } catch (e) {
    closeToast()
    showToast({ message: e instanceof Error ? e.message : '转发失败', zIndex: 21001 })
  } finally {
    forwarding.value = false
  }
}
</script>

<template>
  <van-action-sheet
    v-model:show="mediaActionState.visible"
    :actions="mediaActions"
    cancel-text="取消"
    close-on-click-action
    :z-index="21000"
    @select="onAction"
  />

  <van-popup
    v-model:show="forwardVisible"
    position="bottom"
    round
    teleport="body"
    safe-area-inset-bottom
    :style="{ height: '70%' }"
    :z-index="21000"
  >
    <div class="media-forward-sheet">
      <div class="media-forward-head">
        <button type="button" class="media-forward-cancel" @click="forwardVisible = false">取消</button>
        <h3 class="media-forward-title">转发{{ mediaLabel }}到</h3>
        <button type="button" class="media-forward-done" :disabled="!forwardSelectedCount || forwarding" @click="submitForward">
          {{ forwarding ? '转发中...' : `确定${forwardSelectedCount ? ` (${forwardSelectedCount})` : ''}` }}
        </button>
      </div>
      <p class="media-forward-hint">已选 {{ forwardSelectedCount }} 个会话</p>
      <div class="media-forward-list">
        <div v-if="forwardLoading" class="media-forward-empty">加载中...</div>
        <div v-else-if="!forwardTargets.length" class="media-forward-empty">暂无其他会话</div>
        <button
          v-for="c in forwardTargets"
          :key="c.id"
          type="button"
          class="media-forward-item"
          :class="{ on: isForwardSelected(c.id) }"
          @click="toggleForwardTarget(c.id)"
        >
          <span class="material-symbols-outlined media-forward-check">
            {{ isForwardSelected(c.id) ? 'check_circle' : 'radio_button_unchecked' }}
          </span>
          <img v-if="c.avatar" :src="c.avatar" :alt="c.name" class="media-forward-avatar" />
          <div v-else class="media-forward-avatar initials">{{ c.name.slice(0, 1) }}</div>
          <div class="media-forward-meta">
            <div class="media-forward-name">{{ c.name }}</div>
            <div class="media-forward-sub">{{ c.type === 'group' ? '群聊' : '私聊' }}</div>
          </div>
        </button>
      </div>
    </div>
  </van-popup>
</template>

<style scoped>
.media-forward-sheet {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  color: var(--pulse-text);
  background: var(--pulse-surface-container);
}

.media-forward-head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: var(--pulse-surface-high);
}

.media-forward-head button {
  min-width: 64px;
  border: 0;
  background: none;
  color: #69a7ff;
  font-size: 15px;
  padding: 4px 0;
}

.media-forward-head button:first-child {
  text-align: left;
  color: var(--pulse-text-secondary);
}

.media-forward-head button:last-child {
  text-align: right;
}

.media-forward-head button:disabled {
  color: #626d7c;
}

.media-forward-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.media-forward-hint {
  margin: 0;
  padding: 10px 16px 6px;
  color: #aab4c2;
  font-size: 12px;
}

.media-forward-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  background: var(--pulse-surface-container);
}

.media-forward-empty {
  padding: 40px 0;
  text-align: center;
  color: var(--pulse-text-secondary);
  font-size: 14px;
}

.media-forward-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 18px;
  border: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.055);
  color: var(--pulse-text);
  background: var(--pulse-surface-container);
  text-align: left;
}

.media-forward-item:active {
  background: #2a3443;
}

.media-forward-avatar {
  flex: 0 0 46px;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid rgba(255, 255, 255, 0.16);
}

.media-forward-avatar.initials {
  display: grid;
  place-items: center;
  color: #fff;
  background: linear-gradient(145deg, #5478d8, #7656c7);
  font-size: 18px;
  font-weight: 600;
}

.media-forward-check {
  flex: 0 0 auto;
  color: #69a7ff;
  font-size: 22px;
}

.media-forward-meta {
  min-width: 0;
}

.media-forward-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
}

.media-forward-sub {
  margin-top: 2px;
  color: var(--pulse-text-secondary);
  font-size: 12px;
}
</style>

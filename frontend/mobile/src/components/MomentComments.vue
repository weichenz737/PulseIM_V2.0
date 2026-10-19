<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  showConfirmDialog,
  showImagePreview,
  showLoadingToast,
  closeToast,
  showToast,
  type ActionSheetAction,
} from 'vant'
import {
  addMomentComment,
  deleteMomentComment,
  type MomentCommentItem,
  type MomentItem,
} from '@/api/moments'
import { fileDownloadUrl, uploadChatFile, resolveFileUrl } from '@/api/file'
import { EMOJI_LIST } from '@/utils/emoji'
import { cacheChatFile, getStableChatFileUrl } from '@/utils/fileCache'

const router = useRouter()

const props = defineProps<{
  item: MomentItem
  myUserId: string
  open: boolean
  /** 圈子评论目前只支持文本；朋友圈评论支持 fileId 图片引用。 */
  supportsImages?: boolean
  focusCommentId?: string
  commentApi?: {
    add: (id: string, payload: { content?: string; replyToCommentId?: string; imageFileId?: string; imageUrl?: string }) => Promise<MomentCommentItem>
    delete: (id: string) => Promise<void>
    like?: (id: string) => Promise<{ liked: boolean; likeCount: number }>
  }
}>()

const emit = defineEmits<{
  'update:item': [MomentItem]
  'update:open': [boolean]
}>()

const draft = ref('')
const replyTo = ref<MomentCommentItem | null>(null)
const pendingImageUrl = ref('')
const pendingImageFileId = ref('')
const pendingImageLocal = ref('')
const commentImageUrls = ref<Record<string, string>>({})
const commentImageFileIds = ref<Record<string, string>>({})
const loadingCommentImageIds = new Set<string>()
const showEmoji = ref(false)
const sending = ref(false)
const uploading = ref(false)
const likingCommentIds = ref<Set<string>>(new Set())
const imageInputRef = ref<HTMLInputElement | null>(null)
const sheetVisible = ref(false)
const sheetActions = ref<ActionSheetAction[]>([])
let sheetTarget: MomentCommentItem | null = null

const placeholder = computed(() =>
  replyTo.value ? `回复 ${replyTo.value.nickname}` : '写评论...',
)

watch(
  () => props.open,
  (v) => {
    if (!v) {
      showEmoji.value = false
      replyTo.value = null
      draft.value = ''
      clearPendingImage()
    }
  },
)

function canDelete(c: MomentCommentItem) {
  const me = String(props.myUserId || '')
  if (!me) return false
  return String(c.userId) === me || String(props.item.userId) === me
}

function patchItem(next: Partial<MomentItem>) {
  emit('update:item', { ...props.item, ...next })
}

function clearPendingImage() {
  if (pendingImageLocal.value.startsWith('blob:')) {
    URL.revokeObjectURL(pendingImageLocal.value)
  }
  pendingImageUrl.value = ''
  pendingImageFileId.value = ''
  pendingImageLocal.value = ''
}

function clearReply() {
  replyTo.value = null
}

const hasPendingImage = computed(
  () => !!(pendingImageLocal.value || pendingImageUrl.value),
)

const sendLabel = computed(() => {
  if (hasPendingImage.value && !draft.value.trim()) return '发送图片'
  return '发送'
})

const supportsImages = computed(() => props.supportsImages !== false)

function startReply(c: MomentCommentItem) {
  replyTo.value = c
  emit('update:open', true)
  showEmoji.value = false
}

function openProfile(userId?: string) {
  const id = String(userId || '')
  if (!id) return
  if (id === String(props.myUserId || '')) {
    void router.push('/app/me')
  } else {
    void router.push(`/contacts/${id}`)
  }
}

function onCommentTap(c: MomentCommentItem) {
  sheetTarget = c
  const actions: ActionSheetAction[] = [{ name: '回复' }]
  if (canDelete(c)) {
    actions.push({ name: '删除', color: 'var(--pulse-danger)' })
  }
  sheetActions.value = actions
  sheetVisible.value = true
}

async function onSheetSelect(action: ActionSheetAction) {
  const c = sheetTarget
  sheetTarget = null
  sheetVisible.value = false
  if (!c) return
  if (action.name === '回复') {
    startReply(c)
    return
  }
  if (action.name === '删除') {
    await onDelete(c)
  }
}

function onSheetCancel() {
  // 仅「取消」；勿绑 @close，否则选中后会清空 sheetTarget 导致删除无效
  sheetVisible.value = false
  sheetTarget = null
}

async function onDelete(c: MomentCommentItem) {
  try {
    await showConfirmDialog({
      title: '删除评论',
      message: '确定删除这条评论？',
      confirmButtonText: '删除',
    })
  } catch {
    return
  }
  try {
    await (props.commentApi?.delete || deleteMomentComment)(c.id)
    const comments = (props.item.comments || []).filter((x) => x.id !== c.id)
    patchItem({
      comments,
      commentCount: Math.max(0, (props.item.commentCount || 0) - 1),
    })
    if (replyTo.value?.id === c.id) clearReply()
    showToast('已删除')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '删除失败')
  }
}

async function onLikeComment(c: MomentCommentItem) {
  const like = props.commentApi?.like
  if (!like || likingCommentIds.value.has(c.id)) return
  likingCommentIds.value = new Set([...likingCommentIds.value, c.id])
  try {
    const result = await like(c.id)
    patchItem({
      comments: (props.item.comments || []).map((comment) =>
        comment.id === c.id
          ? { ...comment, likedByMe: result.liked, likeCount: result.likeCount }
          : comment,
      ),
    })
    showToast(result.liked ? '已点赞评论' : '已取消点赞')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '评论点赞失败')
  } finally {
    const next = new Set(likingCommentIds.value)
    next.delete(c.id)
    likingCommentIds.value = next
  }
}

function insertEmoji(emoji: string) {
  draft.value += emoji
}

function pickImage() {
  if (!supportsImages.value) return
  imageInputRef.value?.click()
}

async function onImageSelected(e: Event) {
  if (!supportsImages.value) return
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    showToast('请选择图片')
    return
  }
  if (file.size > 20 * 1024 * 1024) {
    showToast('图片不能超过 20MB')
    return
  }
  uploading.value = true
  showLoadingToast({ message: '上传中...', forbidClick: true })
  try {
    if (pendingImageLocal.value.startsWith('blob:')) {
      URL.revokeObjectURL(pendingImageLocal.value)
    }
    pendingImageLocal.value = URL.createObjectURL(file)
    const uploaded = await uploadChatFile(file)
    pendingImageFileId.value = uploaded.fileId || ''
    pendingImageUrl.value = uploaded.fileId ? '' : uploaded.url
    closeToast()
    showToast({ message: '图片已添加，请点击发送', duration: 2500 })
    emit('update:open', true)
  } catch (err) {
    clearPendingImage()
    closeToast()
    showToast(err instanceof Error ? err.message : '上传失败')
  } finally {
    uploading.value = false
  }
}

function previewImageUrl(url: string) {
  if (!url) return
  showImagePreview({
    images: [url.startsWith('blob:') ? url : resolveFileUrl(url)],
    closeable: true,
    closeIconPosition: 'top-right',
  })
}

function commentImageSource(comment: MomentCommentItem): string {
  if (comment.imageFileId) return commentImageUrls.value[comment.id] || ''
  return comment.imageUrl || ''
}

async function warmCommentImage(comment: MomentCommentItem): Promise<void> {
  const fileId = String(comment.imageFileId || '').trim()
  if (!fileId || (commentImageFileIds.value[comment.id] === fileId && commentImageUrls.value[comment.id]) || loadingCommentImageIds.has(comment.id)) return
  loadingCommentImageIds.add(comment.id)
  try {
    let local = ''
    try {
      local = getStableChatFileUrl(fileId, 'thumb')
        || await cacheChatFile('image', fileId, 'thumb', fileDownloadUrl(fileId, 'thumb'))
    } catch {
      // A legacy image may not have a generated thumbnail; the medium preview is still safe.
      try {
        local = getStableChatFileUrl(fileId, 'preview')
          || await cacheChatFile('image', fileId, 'preview', fileDownloadUrl(fileId, 'preview'))
      } catch {
        local = ''
      }
    }
    if (local) {
      commentImageFileIds.value = { ...commentImageFileIds.value, [comment.id]: fileId }
      commentImageUrls.value = { ...commentImageUrls.value, [comment.id]: local }
    }
  } finally {
    loadingCommentImageIds.delete(comment.id)
  }
}

async function previewCommentImage(comment: MomentCommentItem) {
  const fileId = String(comment.imageFileId || '').trim()
  if (!fileId) {
    previewImageUrl(comment.imageUrl || '')
    return
  }
  showLoadingToast({ message: '加载图片中...', forbidClick: true })
  try {
    let local = ''
    try {
      local = await cacheChatFile('image', fileId, 'original', fileDownloadUrl(fileId))
    } catch {
      local = commentImageSource(comment)
    }
    closeToast()
    if (local) {
      showImagePreview({ images: [local], closeable: true, closeIconPosition: 'top-right' })
    } else {
      showToast('图片暂时无法加载')
    }
  } catch (error) {
    closeToast()
    showToast(error instanceof Error ? error.message : '图片加载失败')
  }
}

function clearCommentImageMemory() {
  commentImageUrls.value = {}
  commentImageFileIds.value = {}
}

function onChatCacheCleared(event: Event) {
  const kind = (event as CustomEvent<{ kind?: string }>).detail?.kind
  if (kind === 'image' || kind === 'all') {
    clearCommentImageMemory()
    if (props.open) for (const comment of props.item.comments || []) void warmCommentImage(comment)
  }
}

watch(
  () => [props.open, ...(props.item.comments || []).map((comment) => `${comment.id}:${comment.imageFileId || ''}`)],
  () => {
    if (!props.open) return
    const activeIds = new Set((props.item.comments || []).map((comment) => comment.id))
    const currentFileIds = new Map((props.item.comments || []).map((comment) => [comment.id, String(comment.imageFileId || '')]))
    const staleIds = Object.keys(commentImageUrls.value).filter((id) =>
      !activeIds.has(id) || (currentFileIds.get(id) && commentImageFileIds.value[id] !== currentFileIds.get(id)),
    )
    if (staleIds.length) {
      staleIds.forEach((id) => {
        delete commentImageUrls.value[id]
      })
      const nextUrls = { ...commentImageUrls.value }
      const nextFileIds = { ...commentImageFileIds.value }
      staleIds.forEach((id) => { delete nextUrls[id]; delete nextFileIds[id] })
      commentImageUrls.value = nextUrls
      commentImageFileIds.value = nextFileIds
    }
    for (const comment of props.item.comments || []) void warmCommentImage(comment)
  },
  { immediate: true },
)

onMounted(() => window.addEventListener('pulse:chat-cache-cleared', onChatCacheCleared))
onUnmounted(() => {
  window.removeEventListener('pulse:chat-cache-cleared', onChatCacheCleared)
  clearCommentImageMemory()
})

async function submit() {
  const text = draft.value.trim()
  const imageFileId = pendingImageFileId.value
  const imageUrl = pendingImageFileId.value ? '' : pendingImageUrl.value
  if (!text && !imageFileId && !imageUrl) {
    showToast('请输入评论或添加图片')
    return
  }
  if (sending.value || uploading.value) return
  sending.value = true
  try {
    const c = await (props.commentApi?.add || addMomentComment)(props.item.id, {
      content: text,
      replyToCommentId: replyTo.value?.id,
      imageFileId: imageFileId || undefined,
      imageUrl: imageUrl || undefined,
    })
    patchItem({
      comments: [...(props.item.comments || []), c],
      commentCount: (props.item.commentCount || 0) + 1,
    })
    draft.value = ''
    clearReply()
    clearPendingImage()
    showEmoji.value = false
    showToast('已评论')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '评论失败')
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="moment-comments">
    <div v-if="item.comments?.length" class="comment-list">
      <div
        v-for="c in item.comments"
        :key="c.id"
        class="comment-row"
        :class="{ 'notification-target': String(c.id) === String(focusCommentId || '') }"
        :data-comment-id="String(c.id)"
      >
        <button type="button" class="comment-item" @click="onCommentTap(c)">
          <span class="comment-name" role="link" @click.stop="openProfile(c.userId)">{{ c.nickname }}</span>
          <template v-if="c.replyToNickname">
            <span class="comment-reply-label">回复</span>
            <span
              class="comment-name"
              role="link"
              @click.stop="openProfile(c.replyToUserId)"
            >{{ c.replyToNickname }}</span>
          </template>
          <span v-if="c.content" class="comment-text">{{ c.content }}</span>
          <span
            v-if="c.imageFileId || c.imageUrl"
            class="comment-img-btn"
            role="button"
            tabindex="0"
            aria-label="查看图片"
            @click.stop="previewCommentImage(c)"
            @keydown.enter.stop.prevent="previewCommentImage(c)"
          >
            <img v-if="commentImageSource(c)" class="comment-img" :src="commentImageSource(c)" alt="" />
            <span v-else class="comment-img-placeholder">点击加载图片</span>
          </span>
        </button>
        <button
          v-if="commentApi?.like"
          type="button"
          class="comment-like"
          :class="{ active: c.likedByMe }"
          :disabled="likingCommentIds.has(c.id)"
          :aria-label="c.likedByMe ? '取消点赞评论' : '点赞评论'"
          @click="onLikeComment(c)"
        >
          <span class="material-symbols-outlined">favorite</span>
          <span>{{ c.likeCount || '赞' }}</span>
        </button>
      </div>
    </div>

    <div v-if="open" class="comment-composer">
      <div v-if="replyTo" class="reply-tip">
        <span>回复 {{ replyTo.nickname }}</span>
        <button type="button" class="tip-close" @click="clearReply">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div v-if="hasPendingImage" class="pending-img-row">
        <div class="pending-img-wrap">
          <img
            :src="pendingImageLocal || resolveFileUrl(pendingImageUrl)"
            alt=""
            class="pending-img"
            @click="previewImageUrl(pendingImageLocal || pendingImageUrl)"
          />
          <button type="button" class="tip-close on-img" @click="clearPendingImage">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="pending-hint">
          <span class="pending-hint-title">图片已添加</span>
          <span class="pending-hint-desc">请点击右侧「发送」发出评论</span>
        </div>
      </div>
      <div class="composer-row">
        <button type="button" class="tool-btn" @click="showEmoji = !showEmoji">
          <span class="material-symbols-outlined">mood</span>
        </button>
        <button v-if="supportsImages" type="button" class="tool-btn" :disabled="uploading" @click="pickImage">
          <span class="material-symbols-outlined">image</span>
        </button>
        <input
          v-model="draft"
          type="text"
          class="comment-input"
          maxlength="500"
          :placeholder="placeholder"
          @keydown.enter.prevent="submit"
          @focus="showEmoji = false"
        />
        <button
          type="button"
          class="comment-send"
          :class="{ 'comment-send--ready': hasPendingImage }"
          :disabled="sending || uploading"
          @click="submit"
        >
          {{ sendLabel }}
        </button>
      </div>
      <div v-if="showEmoji" class="emoji-panel">
        <button
          v-for="emoji in EMOJI_LIST"
          :key="emoji"
          type="button"
          class="emoji-item"
          @click="insertEmoji(emoji)"
        >
          {{ emoji }}
        </button>
      </div>
      <input
        ref="imageInputRef"
        type="file"
        accept="image/*"
        class="hidden-file"
        @change="onImageSelected"
      />
    </div>

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
.comment-list {
  margin-top: 6px;
  padding: 8px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--pulse-surface-high) 72%, transparent);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.comment-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.comment-row.notification-target {
  margin: -4px -6px;
  padding: 4px 6px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--pulse-primary) 14%, transparent);
  animation: notification-target-pulse 1.8s ease-out 1;
}

@keyframes notification-target-pulse {
  0%, 45% { background: color-mix(in srgb, var(--pulse-primary) 25%, transparent); }
  100% { background: color-mix(in srgb, var(--pulse-primary) 14%, transparent); }
}

.comment-item {
  display: block;
  min-width: 0;
  flex: 1;
  border: none;
  background: transparent;
  padding: 0;
  text-align: left;
  font-size: calc(var(--pulse-content-font-size, 15px) - 1px);
  line-height: 1.45;
  color: var(--pulse-text);
  cursor: pointer;
}

.comment-like {
  flex: 0 0 auto;
  min-width: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
  padding: 1px 0 1px 5px;
  border: 0;
  background: transparent;
  color: var(--pulse-text-secondary);
  font-size: 11px;
  line-height: 1.45;
}

.comment-like .material-symbols-outlined {
  font-size: 16px;
}

.comment-like.active {
  color: var(--pulse-primary);
}

.comment-like.active .material-symbols-outlined {
  font-variation-settings: 'FILL' 1;
}

.comment-like:disabled {
  opacity: .55;
}

.comment-name {
  color: var(--pulse-primary);
  font-weight: 600;
  margin-right: 4px;
}

.comment-reply-label {
  margin-right: 4px;
  color: var(--pulse-text-secondary);
}

.comment-text {
  word-break: break-word;
}

.comment-img-btn {
  display: block;
  margin-top: 6px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: zoom-in;
  line-height: 0;
}

.comment-img {
  display: block;
  width: 56px;
  height: 56px;
  border-radius: 6px;
  object-fit: cover;
  background: var(--pulse-surface-high);
}

.comment-img-placeholder {
  display: block;
  width: 56px;
  height: 56px;
  border-radius: 6px;
  background: var(--pulse-surface-high);
  color: var(--pulse-text-secondary);
  font-size: 11px;
  line-height: 56px;
  text-align: center;
  white-space: nowrap;
}

.comment-composer {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.reply-tip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(75, 142, 255, 0.12);
  font-size: 12px;
  color: var(--pulse-primary);
}

.tip-close {
  border: none;
  background: transparent;
  color: inherit;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  padding: 0;
  cursor: pointer;
}

.tip-close .material-symbols-outlined {
  font-size: 16px;
}

.pending-img-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(75, 142, 255, 0.1);
  border: 1px solid rgba(75, 142, 255, 0.28);
}

.pending-img-wrap {
  position: relative;
  flex: 0 0 auto;
  width: fit-content;
}

.pending-img {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  object-fit: cover;
  cursor: zoom-in;
}

.pending-hint {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.pending-hint-title {
  font-size: calc(var(--pulse-content-font-size, 15px) - 1px);
  font-weight: 600;
  color: var(--pulse-primary);
}

.pending-hint-desc {
  font-size: max(12px, calc(var(--pulse-content-font-size, 15px) - 3px));
  color: var(--pulse-text-secondary);
  line-height: 1.35;
}

.tip-close.on-img {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
}

.composer-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.tool-btn {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: var(--pulse-surface-high);
  color: var(--pulse-text);
  display: grid;
  place-items: center;
  cursor: pointer;
}

.tool-btn:disabled {
  opacity: 0.5;
}

.tool-btn .material-symbols-outlined {
  font-size: 20px;
}

.comment-input {
  flex: 1 1 auto;
  min-width: 0;
  height: 36px;
  border: none;
  border-radius: 8px;
  padding: 0 12px;
  background: var(--pulse-surface-high);
  color: var(--pulse-text);
  outline: none;
  font-size: 14px;
}

.comment-send {
  flex: 0 0 auto;
  border: none;
  border-radius: 8px;
  padding: 0 14px;
  height: 36px;
  min-width: 52px;
  background: var(--pulse-primary);
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}

.comment-send--ready {
  min-width: 72px;
  animation: send-pulse 1.4s ease-in-out infinite;
  box-shadow: 0 0 0 0 rgba(75, 142, 255, 0.55);
}

@keyframes send-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(75, 142, 255, 0.45);
    transform: scale(1);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(75, 142, 255, 0);
    transform: scale(1.04);
  }
}

.comment-send:disabled {
  opacity: 0.55;
  animation: none;
}

.emoji-panel {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 4px;
  max-height: 160px;
  overflow-y: auto;
  padding: 8px;
  border-radius: 10px;
  background: var(--pulse-surface-high);
}

.emoji-item {
  border: none;
  background: transparent;
  font-size: 22px;
  line-height: 1.2;
  padding: 4px 0;
  cursor: pointer;
}

.hidden-file {
  display: none;
}
</style>

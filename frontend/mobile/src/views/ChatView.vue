<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog, showToast, showLoadingToast, closeToast } from 'vant'
import {
  fetchMessage,
  fetchLocatableMessage,
  fetchMessages,
  sendTextMessage,
  recallMessage,
  canRecallMessage,
  deleteMessages,
  forwardMessages,
  copyableText,
  favoritePreviewLabel,
  parseForwardCard,
  parseFilePayload,
  parseContactCard,
  parseLocationPayload,
  normalizeMessageType,
  normalizeMessageFilePayload,
  forwardItemPreview,
  type ChatMessage,
  type ForwardCardPayload,
  type LocationPayload,
  type MsgType,
} from '@/api/message'
import { markConversationRead, viewBurnMedia, fetchConversationReadStates, fetchConversations, fetchGroupDetail, getCachedGroupDetail, fetchAutoDeleteSetting, fetchLiveLocation, type ConversationItem, type ConversationReadStates, type GroupDetail, type GroupMember } from '@/api/conversation'
import {
  fetchContacts,
  fetchPrivacySettings,
  fetchUserOnline,
  fetchUserProfile,
} from '@/api/contact'
import {
  uploadChatFile,
  uploadVideoResumable,
  normalizeFileName,
  normalizeFileContentType,
  resolveAvatarUrl,
  fetchFileMetadata,
  fileDownloadUrl,
  resolveFileUrl,
  validateClientFileSend,
} from '@/api/file'
import {
  cacheChatFile,
  getStableChatFileUrl,
  markChatCacheInUse,
  type ChatCacheKind,
  type ChatCacheVariant,
} from '@/utils/fileCache'
import { openFilePreview } from '@/composables/useFilePreview'
import { fetchRedPacket, fetchTransfer, receiveRedPacket, receiveTransfer, yuan } from '@/api/wallet'
import { formatBusinessPreview } from '@/utils/businessPreview'
import { compressImageFile, formatFileSize, formatVoiceDuration, pickAudioRecorderMime } from '@/utils/media'
import { friendTagStyle } from '@/utils/friendTagColor'
import {
  cacheVoiceBlob,
  clearVoiceCache,
  playCachedVoice,
  prefetchVoice,
  resetVoiceAudioSession,
  stopCachedVoice,
  warmVoiceAudio,
} from '@/utils/voiceCache'
import { isVideoMedia, saveMediaToDevice, toastForSaveResult } from '@/utils/saveMedia'
import { onWsMessage, isWsAuthed, sendTypingStatus } from '@/im/ws'
import { retryQueuedMessage } from '@/im/messageOutbox'
import { useUserStore, parseUserIdFromToken } from '@/stores/user'
import { isNativeApp, nativeClipboard, nativeKeyboard, nativeMediaGallery } from '@/native'
import type { NativeMediaAsset } from '@/native/mediaGallery'
import { smartBack } from '@/utils/navBack'
import { useConversationInboxStore } from '@/stores/conversationInbox'
import { useVoiceCallStore } from '@/stores/voiceCall'
import { useGroupCallStore } from '@/stores/groupCall'
import { prefetchPeerRingtone, unlockCallRingtoneAudio, prepareCallRingtoneForMic, stopCallRingtone } from '@/utils/callRingtone'
import { discardWarmedCallMedia } from '@/im/voiceCallSession'
import type { LocalCallSystemTip } from '@/utils/callSystemTip'
import MediaSendPicker from '@/components/MediaSendPicker.vue'
import {
  getCachedChatMessages,
  setCachedChatMessages,
  warmChatMessages,
} from '@/stores/chatWarmCache'
import {
  getCachedAvatar,
  getCachedChatAvatar,
  loadCachedChatAvatar,
  removeCachedAvatar,
  setCachedAvatar,
} from '@/stores/avatarCache'
import { getChatDraft, setChatDraft } from '@/stores/chatDraft'
import { filterLocallyClearedMessages, isMessageLocallyCleared } from '@/utils/localChatHistory'

const EMOJI_LIST = [
  '😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😉', '😊',
  '😋', '😎', '😍', '😘', '🥰', '😗', '😙', '😚', '🙂', '🤗',
  '🤔', '😐', '😑', '😶', '🙄', '😏', '😣', '😥', '😮', '🤐',
  '😯', '😪', '😫', '🥱', '😴', '😌', '😛', '😜', '😝', '🤤',
  '😒', '😓', '😔', '😕', '🙃', '🤑', '😲', '☹️', '🙁', '😖',
  '😞', '😟', '😤', '😢', '😭', '😦', '😧', '😨', '😩', '🤯',
  '😬', '😰', '😱', '🥵', '🥶', '😳', '🤪', '😵', '😡', '😠',
  '🤬', '😷', '🤒', '🤕', '🤢', '🤮', '🥴', '😇', '🥳', '🥺',
  '🤠', '🤡', '🤥', '🤫', '🤭', '🧐', '🤓', '😈', '👿', '👹',
  '👻', '💀', '👽', '🤖', '💩', '😺', '😸', '😹', '😻', '😼',
  '👍', '👎', '👏', '🙌', '👋', '🤝', '🙏', '💪', '✌️', '🤞',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💔', '💕', '💖',
  '🔥', '⭐', '✨', '🎉', '🎊', '💯', '✅', '❌', '⚠️', '💤',
] as const

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const inbox = useConversationInboxStore()
const voiceCall = useVoiceCallStore()
const groupCall = useGroupCallStore()

// 已读水位属于会话状态，不应随着 ChatView 的销毁/重建而清空。
// 群聊和单聊统一缓存；打开群聊的“消息回执”面板时仍会强制刷新。
const conversationReadStateCache = new Map<string, ConversationReadStates>()
const conversationReadStateCacheAt = new Map<string, number>()
const READ_STATE_STORAGE_PREFIX = 'pulse_read_state:'
const READ_STATE_CACHE_TTL_MS = 2 * 60_000

function readStateStorageKey(cacheKey: string): string {
  return `${READ_STATE_STORAGE_PREFIX}${cacheKey}`
}

function readPersistedReadState(cacheKey: string): ConversationReadStates | null {
  if (!cacheKey || cacheKey.startsWith(':')) return null
  try {
    const raw = localStorage.getItem(readStateStorageKey(cacheKey))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at?: number; state?: ConversationReadStates }
    if (!parsed.state || !Array.isArray(parsed.state.members)) return null
    const at = Number(parsed.at) || 0
    if (at <= 0 || Date.now() - at > READ_STATE_CACHE_TTL_MS) return null
    conversationReadStateCache.set(cacheKey, parsed.state)
    conversationReadStateCacheAt.set(cacheKey, at)
    return parsed.state
  } catch {
    return null
  }
}

function cacheReadState(cacheKey: string, state: ConversationReadStates, at = Date.now()): void {
  if (!cacheKey) return
  conversationReadStateCache.set(cacheKey, state)
  conversationReadStateCacheAt.set(cacheKey, at)
  if (cacheKey.startsWith(':')) return
  try {
    localStorage.setItem(readStateStorageKey(cacheKey), JSON.stringify({ at, state }))
  } catch {
    // Best effort only; the in-memory cache still prevents a same-session flash.
  }
}

const conversationId = computed(() => route.params.id as string)
const peerUserId = computed(() => (route.query.peerUserId as string) || '')
const isGroup = computed(() => route.query.type === 'group')
const resolvedPeerTitle = ref('')
const resolvedPeerTag = ref(String(route.query.tag || '').trim())
const resolvedPeerInitialName = ref(String(route.query.avatarName || '').trim())
const resolvedPeerAvatar = ref<string | null>(null)
const peerFileTransferAssistant = ref(route.query.fileTransferAssistant === '1')
const peerTitle = computed(() => resolvedPeerTitle.value || (route.query.title as string) || '聊天')
const peerTag = computed(() => resolvedPeerTag.value.trim() || String(route.query.tag || '').trim())
const cachedPeerAvatar = computed(() => getCachedAvatar(
  String(userStore.userId || parseUserIdFromToken(userStore.token) || ''),
  peerUserId.value,
))
const cachedGroupAvatar = computed(() => getCachedAvatar(
  String(userStore.userId || parseUserIdFromToken(userStore.token) || ''),
  conversationId.value,
  'group',
))
const routePeerAvatar = computed(() => resolveAvatarUrl((route.query.avatar as string) || ''))
const peerAvatar = computed(() => {
  // null means the profile has not replied yet; an empty string is an
  // intentional server-side avatar removal and must not fall back to stale data.
  if (resolvedPeerAvatar.value !== null) return resolvedPeerAvatar.value
  return routePeerAvatar.value || (isGroup.value ? cachedGroupAvatar.value : cachedPeerAvatar.value)
})

function cacheInitialPeerAvatar(): void {
  const avatar = resolveAvatarUrl((route.query.avatar as string) || '')
  const ownerId = String(userStore.userId || parseUserIdFromToken(userStore.token) || '')
  const targetId = isGroup.value ? conversationId.value : peerUserId.value
  if (!avatar || !ownerId || !targetId) return
  setCachedAvatar(ownerId, targetId, avatar, isGroup.value ? 'group' : 'user')
}

const peerOnline = ref(route.query.online === 'true')
const peerOnlineHidden = ref(route.query.onlineHidden === '1')
/** 输入状态仅在当前用户开关已加载且开启时发送/展示。 */
const typingStatusEnabled = ref(false)
const typingSettingsLoaded = ref(false)
const peerTyping = ref(false)
/** 已读回执开关：关闭后聊天气泡不展示已读/未读与对钩 */
const readReceiptsEnabled = ref(true)
const conversationReadReceiptsEnabled = ref(true)
const readReceiptsVisible = computed(() => readReceiptsEnabled.value && conversationReadReceiptsEnabled.value && !peerFileTransferAssistant.value && peerTitle.value !== '文件传输助手')
void fetchPrivacySettings()
  .then((privacy) => {
    readReceiptsEnabled.value = privacy.readReceiptEnabled
    typingStatusEnabled.value = privacy.typingStatusEnabled !== false
    typingSettingsLoaded.value = true
  })
  .catch(() => {
    /* 未确认隐私设置前不发送输入状态 */
})
// 当前会话收到消息后会先进入全局未读 store，再异步提交已读；
// 顶部入口排除当前会话，避免这段时间出现 0 → 1 → 0 的闪烁。
const headerUnreadSummary = computed(() => inbox.unreadNavigationSummary(conversationId.value))
const headerUnreadCount = computed(() => headerUnreadSummary.value.count)
const myAutoDeleteSeconds = ref<number | null>(null)
const peerAutoDeleteSeconds = ref<number | null>(null)
const effectiveAutoDeleteSeconds = computed(() => {
  const values = [myAutoDeleteSeconds.value, peerAutoDeleteSeconds.value]
    .filter((value): value is number => value != null && value > 0)
  return values.length ? Math.min(...values) : null
})

function autoDeleteTimeLabel(seconds: number): string {
  const days = seconds / 86400
  if (days === 1) return '1天'
  if (days === 7) return '7天'
  if (days === 30) return '一个月'
  if (days === 90) return '3个月'
  if (days === 180) return '6个月'
  if (days === 365) return '一年'
  if (days >= 1) return `${Math.round(days)}天`
  if (seconds >= 3600) return `${Math.round(seconds / 3600)}小时`
  return `${Math.round(seconds / 60)}分钟`
}

async function loadAutoDeleteStatus() {
  if (isGroup.value) return
  try {
    const setting = await fetchAutoDeleteSetting(conversationId.value)
    myAutoDeleteSeconds.value = setting.enabled ? setting.ttlSeconds : null
    peerAutoDeleteSeconds.value = setting.peerEnabled ? (setting.peerTtlSeconds || 86400) : null
  } catch {
    myAutoDeleteSeconds.value = null
    peerAutoDeleteSeconds.value = null
  }
}

function onAutoDeleteSettingUpdated(event: Event) {
  const detail = (event as CustomEvent<{ conversationId?: string }>).detail
  if (detail?.conversationId && String(detail.conversationId) !== conversationId.value) return
  void loadAutoDeleteStatus()
  void refreshLatest(false)
}

function onBurnSettingUpdated(event: Event) {
  const detail = (event as CustomEvent<{ conversationId?: string }>).detail
  if (detail?.conversationId && String(detail.conversationId) !== conversationId.value) return
  // 设置页保存成功后立即拉取系统提示，避免必须退出并重新打开会话才能看到。
  void refreshLatest(false)
}

function outgoingRetention(message: ChatMessage, existing?: ChatMessage): Pick<ChatMessage, 'burnAfterRead' | 'burnSeconds' | 'autoDeleteExpiresAt'> {
  return {
    burnAfterRead: existing?.burnAfterRead || message.burnAfterRead,
    burnSeconds: existing?.burnSeconds ?? message.burnSeconds,
    autoDeleteExpiresAt: existing?.autoDeleteExpiresAt ?? message.autoDeleteExpiresAt,
  }
}

const peerNameRowRef = ref<HTMLElement | null>(null)
const peerNameTrackRef = ref<HTMLElement | null>(null)
const peerNameScrolling = ref(false)
let peerNameResizeObserver: ResizeObserver | null = null

function measurePeerNameScroll() {
  const row = peerNameRowRef.value
  const track = peerNameTrackRef.value
  if (!row || !track) {
    peerNameScrolling.value = false
    return
  }
  const prevMax = track.style.maxWidth
  track.style.maxWidth = 'none'
  const overflow = track.scrollWidth - row.clientWidth
  track.style.maxWidth = prevMax
  if (overflow > 2) {
    peerNameScrolling.value = true
    row.style.setProperty('--peer-marquee-x', `${-overflow}px`)
  } else {
    peerNameScrolling.value = false
    row.style.removeProperty('--peer-marquee-x')
  }
}

function bindPeerNameScroll() {
  peerNameResizeObserver?.disconnect()
  peerNameResizeObserver = null
  const row = peerNameRowRef.value
  if (!row || typeof ResizeObserver === 'undefined') {
    void nextTick(measurePeerNameScroll)
    return
  }
  peerNameResizeObserver = new ResizeObserver(() => measurePeerNameScroll())
  peerNameResizeObserver.observe(row)
  if (peerNameTrackRef.value) peerNameResizeObserver.observe(peerNameTrackRef.value)
  void nextTick(measurePeerNameScroll)
}

watch([peerTitle, peerTag], () => {
  void nextTick(() => {
    bindPeerNameScroll()
  })
})

let onlinePollTimer: ReturnType<typeof setInterval> | null = null
let typingStopTimer: ReturnType<typeof setTimeout> | null = null
let peerTypingTimer: ReturnType<typeof setTimeout> | null = null
let typingLastSentAt = 0
let typingActiveSent = false
let sendKeyboardState: boolean | null = null
let burnCountdownTimer: ReturnType<typeof setInterval> | null = null
let burnReadSyncTimer: ReturnType<typeof setTimeout> | null = null
let readMarkTimer: ReturnType<typeof setTimeout> | null = null
let readMarkInFlight = false
let pendingReadMarkId = ''
let lastReadMarkId: string | null = null
let readStatesRequest: Promise<void> | null = null
let readStatesLoaded = false
const burnClock = ref(Date.now())

/** 单聊：对方已读水位 */
const peerLastReadMsgId = ref('')
const peerLastReadSendTime = ref(0)
/** 群聊：成员已读水位 userId -> { msgId, sendTime } */
const memberReadMap = ref<Record<string, { lastReadMsgId: string; lastReadSendTime: number }>>({})

async function refreshPeerOnline() {
  if (isGroup.value || !peerUserId.value || isFileTransferAssistant.value) return
  if (peerBlockedMe.value) {
    peerOnline.value = false
    peerOnlineHidden.value = false
    return
  }
  try {
    const state = await fetchUserOnline(peerUserId.value)
    peerOnline.value = state.online
    peerOnlineHidden.value = state.onlineHidden
  } catch {
    // keep previous
  }
}

const messages = ref<ChatMessage[]>([])
const cachedFileUrls = reactive<Record<string, string>>({})
const fileHydrationInFlight = new Set<string>()
const fileHydrationRetryCounts = new Map<string, number>()
let chatViewMounted = false
const recalledEditHiddenIds = ref<Set<string>>(new Set())
const loading = ref(true)
const HISTORY_PAGE_SIZE = 20
const showingLocatedWindow = ref(false)
const highlightUnavailable = ref(false)
const historyLoading = ref(false)
const historyHasMore = ref(true)
const historyReady = ref(false)
const pendingRealtimeMessages: Array<Record<string, unknown>> = []
const inputText = ref('')
const composerRef = ref<HTMLTextAreaElement | null>(null)
/** 软键盘：固定到 visualViewport；打开时去掉底部 safe-area，否则键盘上方会留白 */
const viewportHeightPx = ref(0)
const viewportTopPx = ref(0)
const keyboardOpen = ref(false)
const composerFocused = ref(false)
const nativeKeyboardHeightPx = ref(0)
let keyboardSyncRaf = 0
let nativeKeyboardVisible = false
let keyboardHideTimers: number[] = []
function readRootPx(property: string): number {
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(property))
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function currentLayoutHeight(): number {
  return Math.max(1, Math.round(Math.max(window.innerHeight, document.documentElement.clientHeight || 0)))
}

function readSharedKeyboardViewport(): boolean {
  const root = document.documentElement
  if (!root.classList.contains('pulse-keyboard-open')) return false
  const height = readRootPx('--pulse-viewport-height')
  if (height <= 0) return false

  // main.ts owns keyboard geometry. ChatView mirrors its final visible height
  // so adjustResize and visualViewport cannot move this fixed page twice.
  viewportHeightPx.value = Math.max(1, Math.round(height))
  viewportTopPx.value = isNativeApp ? 0 : Math.max(0, Math.round(window.visualViewport?.offsetTop || 0))
  keyboardOpen.value = true
  return true
}

// main.ts publishes this stable baseline while the keyboard is closed. Keep
// a local fallback for the short period before the native shell listeners bind.
let keyboardBaseHeightPx = Math.max(readRootPx('--pulse-keyboard-base-height'), currentLayoutHeight())
let keyboardBackConsumed = false

function resetDocumentScroll() {
  window.scrollTo(0, 0)
  document.documentElement.scrollTop = 0
  document.body.scrollTop = 0
}

function syncKeyboardInset() {
  const vv = window.visualViewport
  const sharedBase = readRootPx('--pulse-keyboard-base-height')
  if (sharedBase > 0) keyboardBaseHeightPx = sharedBase
  if (readSharedKeyboardViewport()) return

  if (!vv) {
    const nativeOpen = nativeKeyboardVisible || document.documentElement.classList.contains('native-keyboard-open')
    const nativeHeight = nativeOpen && nativeKeyboardHeightPx.value > 0 && keyboardBaseHeightPx > nativeKeyboardHeightPx.value
      ? keyboardBaseHeightPx - nativeKeyboardHeightPx.value
      : currentLayoutHeight()
    viewportHeightPx.value = nativeHeight
    viewportTopPx.value = 0
    keyboardOpen.value = nativeOpen || nativeKeyboardHeightPx.value > 48
    if (!keyboardOpen.value) {
      keyboardBaseHeightPx = currentLayoutHeight()
      viewportHeightPx.value = keyboardBaseHeightPx
    }
    return
  }
  const nativeOpen = nativeKeyboardVisible || document.documentElement.classList.contains('native-keyboard-open')
  const layoutHeight = currentLayoutHeight()
  const visualBottom = Math.round(vv.offsetTop + vv.height)
  const layoutDrop = Math.max(0, keyboardBaseHeightPx - layoutHeight)
  const visualDrop = Math.max(0, keyboardBaseHeightPx - visualBottom)
  // iOS interactive-widget 可能已缩小 layout，单靠 visualViewport 底部会漏检
  const heightDrop = Math.max(0, layoutHeight - Math.round(vv.height))
  const open = nativeOpen
    || nativeKeyboardHeightPx.value > 48
    || layoutDrop > 80
    || visualDrop > 80
    || (composerFocused.value && heightDrop > 60)

  // During keyboard hide the native class can clear before the WebView grows
  // back. Once there is no remaining keyboard geometry, restore the explicit
  // chat page height even if Android kept the textarea focused after Back.
  if (!open) {
    keyboardBaseHeightPx = layoutHeight
    viewportHeightPx.value = layoutHeight
    viewportTopPx.value = 0
    keyboardOpen.value = false
    resetDocumentScroll()
    return
  }

  keyboardOpen.value = open
  if (open) {
    // Prefer a boundary that already excludes the IME. Only fall back to the
    // native height when neither Android nor visualViewport resized the page.
    // This prevents subtracting one keyboard twice.
    const layoutAlreadyResized = layoutDrop > 48
    const visualViewportAlreadyResized = visualDrop > 48
    const nativeHeight = nativeOpen && nativeKeyboardHeightPx.value > 0
      ? Math.max(1, keyboardBaseHeightPx - nativeKeyboardHeightPx.value)
      : 0
    const nextH = layoutAlreadyResized
      ? layoutHeight
      : visualViewportAlreadyResized
        ? Math.min(layoutHeight, visualBottom)
        : nativeHeight > 0
          ? nativeHeight
          : Math.min(layoutHeight, visualBottom)
    // Native Android resizes from the top of the WebView. visualViewport's
    // offsetTop only applies to browser/iOS viewport panning.
    const nextT = nativeOpen ? 0 : Math.max(0, Math.round(vv.offsetTop))
    if (viewportHeightPx.value !== nextH) viewportHeightPx.value = nextH
    if (viewportTopPx.value !== nextT) viewportTopPx.value = nextT
  }
}

function scheduleKeyboardInset() {
  if (keyboardSyncRaf) return
  keyboardSyncRaf = requestAnimationFrame(() => {
    keyboardSyncRaf = 0
    syncKeyboardInset()
  })
}

function scheduleKeyboardInsetAfterHide() {
  scheduleKeyboardInset()
  for (const timer of keyboardHideTimers) window.clearTimeout(timer)
  keyboardHideTimers = [80, 180, 360, 600].map((delay) =>
    window.setTimeout(scheduleKeyboardInset, delay),
  )
}

function onComposerFocus() {
  composerFocused.value = true
  keyboardBackConsumed = false
  showEmojiPanel.value = false
  syncKeyboardInset()
  // 键盘弹起后滚到底，避免输入框被挡；不再反复改 transform
  window.setTimeout(() => {
    syncKeyboardInset()
    scrollToBottom(false)
  }, 120)
  window.setTimeout(() => {
    syncKeyboardInset()
    scrollToBottom(false)
  }, 360)
}

function ensureComposerFocus(event: Event) {
  const input = event.currentTarget instanceof HTMLTextAreaElement
    ? event.currentTarget
    : composerRef.value
  if (!input || input.disabled) return
  if (document.activeElement !== input) input.focus({ preventScroll: true })
  if (isNativeApp) void nativeKeyboard.showKeyboard().catch(() => {})
  scheduleKeyboardInset()
}

function onComposerBlur() {
  composerFocused.value = false
  stopTypingStatus()
  window.setTimeout(() => {
    syncKeyboardInset()
    resetDocumentScroll()
  }, 80)
  scheduleKeyboardInsetAfterHide()
}

function stopTypingStatus() {
  if (typingStopTimer) {
    clearTimeout(typingStopTimer)
    typingStopTimer = null
  }
  if (typingActiveSent && peerUserId.value && conversationId.value && typingSettingsLoaded.value) {
    sendTypingStatus({
      conversationId: conversationId.value,
      toUserId: String(peerUserId.value),
      typing: false,
    })
  }
  typingActiveSent = false
}

function syncTypingStatus() {
  if (
    isGroup.value ||
    isFileTransferAssistant.value ||
    !peerUserId.value ||
    !conversationId.value ||
    !typingSettingsLoaded.value ||
    !typingStatusEnabled.value ||
    !canChat.value
  ) {
    stopTypingStatus()
    return
  }
  if (!inputText.value.length) {
    stopTypingStatus()
    return
  }
  const now = Date.now()
  if (!typingActiveSent || now - typingLastSentAt >= 1200) {
    sendTypingStatus({
      conversationId: conversationId.value,
      toUserId: String(peerUserId.value),
      typing: true,
    })
    typingActiveSent = true
    typingLastSentAt = now
  }
  if (typingStopTimer) clearTimeout(typingStopTimer)
  typingStopTimer = setTimeout(() => {
    typingStopTimer = null
    stopTypingStatus()
  }, 4500)
}

function onPrivacySettingsUpdated(event: Event) {
  const settings = (event as CustomEvent<{ typingStatusEnabled?: boolean }>).detail
  if (!settings || typeof settings.typingStatusEnabled !== 'boolean') return
  typingStatusEnabled.value = settings.typingStatusEnabled
  typingSettingsLoaded.value = true
  if (!typingStatusEnabled.value) {
    peerTyping.value = false
    stopTypingStatus()
  } else {
    syncTypingStatus()
  }
}

/** Read the keyboard state without trusting a possibly stale Vue ref. */
function isComposerKeyboardOpen(): boolean {
  const root = document.documentElement
  if (isNativeApp) {
    // Android's keyboard callbacks are the source of truth. The textarea can
    // stay focused after the IME has already been dismissed.
    return nativeKeyboardVisible
      || root.classList.contains('native-keyboard-open')
  }

  if (root.classList.contains('pulse-keyboard-open')) return true
  const visualViewport = window.visualViewport
  if (visualViewport) {
    const baseHeight = Number.parseFloat(
      getComputedStyle(root).getPropertyValue('--pulse-keyboard-base-height'),
    ) || keyboardBaseHeightPx
    const visualBottom = Math.round(visualViewport.offsetTop + visualViewport.height)
    if (baseHeight - visualBottom > 80) return true
  }
  return false
}

/** Capture before the button event can move focus or trigger a keyboard hide. */
function captureSendKeyboardState(): void {
  sendKeyboardState = isComposerKeyboardOpen()
}

function consumeSendKeyboardState(): boolean {
  const captured = sendKeyboardState
  sendKeyboardState = null
  return captured ?? isComposerKeyboardOpen()
}

/** 发送文本后，仅在发送前键盘已打开时继续保持输入焦点。 */
function restoreComposerFocusAfterSend(keepKeyboardOpen: boolean) {
  if (!keepKeyboardOpen) return
  const input = composerRef.value
  if (!input || input.disabled) return
  composerFocused.value = true
  keyboardBackConsumed = false
  void nextTick(() => {
    if (composerRef.value !== input || input.disabled) return
    input.focus({ preventScroll: true })
    if (isNativeApp) void nativeKeyboard.showKeyboard().catch(() => {})
    scheduleKeyboardInset()
  })
}

function dismissChatKeyboard() {
  if (!keyboardOpen.value && !composerFocused.value && !showEmojiPanel.value) return
  showEmojiPanel.value = false
  showPlusSheet.value = false
  try {
    composerRef.value?.blur()
  } catch {
    /* ignore */
  }
  const active = document.activeElement as HTMLElement | null
  if (active && typeof active.blur === 'function' && active !== document.body) {
    try {
      active.blur()
    } catch {
      /* ignore */
    }
  }
  if (isNativeApp) void nativeKeyboard.hideKeyboard().catch(() => {})
  composerFocused.value = false
  keyboardOpen.value = false
  scheduleKeyboardInsetAfterHide()
  window.setTimeout(resetDocumentScroll, 60)
}

/** 消息区下滑收起键盘（安卓 / iOS） */
let kbSwipeStartY = 0
let kbSwipeStartX = 0
let kbSwipeTracking = false

function onMessageListTouchStart(e: TouchEvent) {
  const inputFocused = document.activeElement === composerRef.value
  if (!keyboardOpen.value && !composerFocused.value && !inputFocused && !showEmojiPanel.value) {
    kbSwipeTracking = false
    return
  }
  const t = e.touches[0]
  if (!t) return
  kbSwipeTracking = true
  kbSwipeStartY = t.clientY
  kbSwipeStartX = t.clientX
}

function onMessageListTouchMove(e: TouchEvent) {
  if (!kbSwipeTracking) return
  const t = e.touches[0]
  if (!t) return
  const dy = t.clientY - kbSwipeStartY
  const dx = Math.abs(t.clientX - kbSwipeStartX)
  // 明显向下滑且不是横向手势
  if (dy > 32 && dy > dx * 1.15) {
    kbSwipeTracking = false
    dismissChatKeyboard()
  }
}

function onMessageListTouchEnd() {
  kbSwipeTracking = false
}

const listRef = ref<HTMLElement | null>(null)
const showPlusSheet = ref(false)
const plusScroller = ref<HTMLElement | null>(null)
const plusPage = ref(0)
const showMediaPicker = ref(false)
const mediaSendPickerRef = ref<{ handleBack?: () => boolean } | null>(null)
const mediaPickerFiles = ref<File[]>([])
const mediaPickerGalleryAssets = ref<NativeMediaAsset[]>([])
const mediaPickerGalleryOffset = ref(0)
const mediaPickerGalleryHasMore = ref(false)
const mediaPickerGalleryLoading = ref(false)
const mediaPickerInitialMode = ref<'grid' | 'preview' | 'trim'>('grid')
const mediaPickerDirectSend = ref(false)
const mediaPickerEditIndex = ref<number | null>(null)
const mediaPickerEditIndices = ref<number[]>([])
const showMsgSheet = ref(false)
// 定位到原消息只出现在图片/视频放大后长按的菜单里，消息列表长按不显示
const msgActionsFromPreview = ref(false)
const showImageEditor = ref(false)
const showImageEditorExitPrompt = ref(false)
const imageEditorCanvas = ref<HTMLCanvasElement | null>(null)
const imageEditorImage = ref<HTMLImageElement | null>(null)
const imageEditorLoading = ref(false)
let imageEditorObjectUrl = ''
const imageEditorRotation = ref(0)
const imageEditorCropSquare = ref(false)
const imageEditorCropRect = ref<{ x: number; y: number; w: number; h: number } | null>(null)
const imageEditorCropDrag = ref('')
const imageEditorCropDragStart = ref<{
  x: number
  y: number
  rect: { x: number; y: number; w: number; h: number }
} | null>(null)
const imageEditorRotatedSize = ref({ w: 0, h: 0 })
const imageEditorDrawing = ref(false)
type ImageEditorPoint = { x: number; y: number }
type ImageEditorStroke = { points: ImageEditorPoint[]; width: number }
type ImageEditorSnapshot = { data: string; strokes: ImageEditorStroke[]; rotation: number }
const IMAGE_EDITOR_MAX_EDGE = 2048
const imageEditorUndoStack = ref<ImageEditorSnapshot[]>([])
const imageEditorRedoStack = ref<ImageEditorSnapshot[]>([])
const imageEditorStrokes: ImageEditorStroke[] = []
let imageEditorDrawingDirty = false
let pendingSendFiles: File[] = []
let pendingSendIndex = 0
const imageEditorDrawingActive = ref(false)
let imageEditorCurrentStroke: ImageEditorStroke | null = null
let imageEditorLastPoint: ImageEditorPoint | null = null
let imageEditorLastMidpoint: ImageEditorPoint | null = null
let imageEditorPendingPoints: ImageEditorPoint[] = []
let imageEditorDrawingFrame = 0
const showDeleteModeSheet = ref(false)
const pendingDeleteIds = ref<string[]>([])
const showForwardSheet = ref(false)
const showEmojiPanel = ref(false)
const voiceMode = ref(false)
const recording = ref(false)
const recordCancel = ref(false)
const recordSeconds = ref(0)
const playingVoiceId = ref('')
const voiceLoadingId = ref('')
const uploading = ref(false)
const showFileSendConfirm = ref(false)
const pendingFileToSend = ref<File | null>(null)
const mediaInputRef = ref<HTMLInputElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const showMediaSourceSheet = ref(false)
const showMapSourceSheet = ref(false)
const pendingMapLocation = ref<LocationPayload | null>(null)
const showVideoCapture = ref(false)
const captureMode = ref<'video' | 'photo'>('video')
const capturePreviewReady = ref(false)
const videoCapturePreviewRef = ref<HTMLVideoElement | null>(null)
const captureReviewUrl = ref('')
const captureReviewFile = ref<File | null>(null)
const captureReviewKind = ref<'photo' | 'video' | ''>('')
const videoCapturing = ref(false)
const videoCaptureSeconds = ref(0)
const videoCaptureFacing = ref<'environment' | 'user'>('environment')
const videoCaptureInfo = ref('')
const photoCapturing = ref(false)
let videoCaptureStream: MediaStream | null = null
let videoCaptureRecorder: MediaRecorder | null = null
let videoCaptureChunks: Blob[] = []
let videoCaptureTimer: ReturnType<typeof setInterval> | null = null
let videoCaptureMime = 'video/webm'
let videoCaptureBitrate = 12_000_000
let capturePressTimer: number | null = null
let capturePressActive = false
const activeMsg = ref<ChatMessage | null>(null)
const replyTarget = ref<ChatMessage | null>(null)
const multiMode = ref(false)
const selectedIds = ref<Set<string>>(new Set())
const forwardTargets = ref<ConversationItem[]>([])
const forwardSelectedIds = ref<Set<string>>(new Set())
const forwardLoading = ref(false)
const forwarding = ref(false)
const forwardMode = ref<'separate' | 'merge'>('merge')
const friendIds = ref<Set<string>>(new Set())
const friendRelationshipLoaded = ref(false)
/** 私聊：我是否拉黑了对方 */
const peerBlockedByMe = ref(false)
/** 私聊：对方是否拉黑了我 */
const peerBlockedMe = ref(false)
const groupMuteAll = ref(false)
const groupSpeakMuted = ref(false)
const groupIsManager = ref(false)
const groupIsOwner = ref(false)
const groupMembers = ref<GroupMember[]>([])
const showGroupCallPicker = ref(false)
const groupCallMediaType = ref<'audio' | 'video'>('audio')
const selectedCallMemberIds = ref<string[]>([])
const callableGroupMembers = computed(() =>
  groupMembers.value.filter((m) => String(m.userId) !== String(userStore.userId || '')),
)

function applyGroupDetail(g: GroupDetail) {
  resolvedPeerTitle.value = g.title || resolvedPeerTitle.value
  const avatar = resolveAvatarUrl(g.avatarUrl || '')
  if (avatar) {
    setCachedAvatar(
      String(userStore.userId || parseUserIdFromToken(userStore.token) || ''),
      conversationId.value,
      avatar,
      'group',
    )
  } else {
    removeCachedAvatar(
      String(userStore.userId || parseUserIdFromToken(userStore.token) || ''),
      conversationId.value,
      'group',
    )
  }
  // Keep the existing URL when the server confirms the same avatar. This
  // avoids replacing an already painted image on every chat entry.
  if (avatar !== peerAvatar.value) resolvedPeerAvatar.value = avatar
  groupMuteAll.value = !!g.muteAll
  groupSpeakMuted.value = !!g.speakMuted
  groupIsManager.value = !!g.owner || !!g.admin || g.myRole === 'owner' || g.myRole === 'admin'
  groupIsOwner.value = !!g.owner || g.myRole === 'owner'
  // 不先清空旧成员，避免消息气泡上的群主/管理员标识随页面进入闪烁。
  groupMembers.value = g.members || []
}

function hydrateCachedGroupDetail() {
  if (!isGroup.value) return
  const cached = getCachedGroupDetail(conversationId.value)
  if (cached) applyGroupDetail(cached)
}

function onNativeKeyboard(event: Event) {
  const detail = (event as CustomEvent<{ visible?: boolean; keyboardHeight?: number }>).detail
  nativeKeyboardVisible = !!detail?.visible
  if (nativeKeyboardVisible) keyboardBackConsumed = false
  if (nativeKeyboardVisible) {
    if (!keyboardBaseHeightPx) {
      keyboardBaseHeightPx = Math.max(readRootPx('--pulse-keyboard-base-height'), currentLayoutHeight())
    }
    nativeKeyboardHeightPx.value = Math.max(0, Math.round(Number(detail?.keyboardHeight) || 0))
  } else {
    nativeKeyboardHeightPx.value = 0
    // Android's IME consumes the first hardware-back event before
    // Capacitor's backButton listener is invoked. Treat the native hide as
    // that consumed back so the next back navigates instead of merely
    // clearing the textarea's still-active DOM focus.
    keyboardBackConsumed = true
  }
  keyboardOpen.value = nativeKeyboardVisible
  nativeKeyboardVisible ? scheduleKeyboardInset() : scheduleKeyboardInsetAfterHide()
  if (nativeKeyboardVisible) {
    window.setTimeout(() => scrollToBottom(false), 50)
  }
}

function onNativeKeyboardSettled(event: Event) {
  const detail = (event as CustomEvent<{ visible?: boolean; keyboardHeight?: number }>).detail
  nativeKeyboardVisible = !!detail?.visible
  if (nativeKeyboardVisible) keyboardBackConsumed = false
  if (nativeKeyboardVisible) {
    if (!keyboardBaseHeightPx) {
      keyboardBaseHeightPx = Math.max(readRootPx('--pulse-keyboard-base-height'), currentLayoutHeight())
    }
    nativeKeyboardHeightPx.value = Math.max(0, Math.round(Number(detail?.keyboardHeight) || 0))
  } else {
    nativeKeyboardHeightPx.value = 0
    // Keep the back-button state in sync when the keyboard hide is reported
    // only by the settled event.
    keyboardBackConsumed = true
  }
  nativeKeyboardVisible ? scheduleKeyboardInset() : scheduleKeyboardInsetAfterHide()
  if (nativeKeyboardVisible) scrollToBottom(false)
}

function onNativeOrientationChange() {
  scheduleKeyboardInset()
  window.setTimeout(() => {
    scheduleKeyboardInset()
    if (stickToBottom) scrollToBottom(false)
  }, 180)
}

function onNativeBack(event: Event) {
  if (showImageEditor.value) {
    if (showImageEditorExitPrompt.value) showImageEditorExitPrompt.value = false
    else requestCloseImageEditor()
  } else if (showMediaPicker.value) {
    if (!mediaSendPickerRef.value?.handleBack?.()) closeMediaPicker()
  } else if (imagePreviewVisible.value) {
    closeImagePreview()
  } else if (videoPlayerVisible.value) {
    closeVideoPlayer()
  } else if (showVideoCapture.value) {
    closeVideoCapture()
  } else if (showForwardSheet.value) {
    showForwardSheet.value = false
  } else if (showGroupCallPicker.value) {
    showGroupCallPicker.value = false
  } else if (showMapSourceSheet.value) {
    showMapSourceSheet.value = false
  } else if (showMediaSourceSheet.value) {
    showMediaSourceSheet.value = false
  } else if (showPlusSheet.value) {
    showPlusSheet.value = false
  } else if (showMsgSheet.value || showDeleteModeSheet.value) {
    showMsgSheet.value = false
    showDeleteModeSheet.value = false
  } else if (businessCoverDetailOpen.value) {
    // 红包领取详情属于聊天页上的二级浮层，第一次返回只收起详情。
    businessCoverDetailOpen.value = false
  } else if (businessCoverVisible.value) {
    // 红包/转账封面也是当前页的浮层，不能让第一次返回直接退出聊天页。
    closeBusinessCover()
  } else if ((keyboardOpen.value || composerFocused.value || nativeKeyboardVisible) && !keyboardBackConsumed) {
    keyboardBackConsumed = true
    dismissChatKeyboard()
  } else if (multiMode.value) {
    keyboardBackConsumed = false
    exitMultiMode()
  } else {
    keyboardBackConsumed = false
    goBack()
  }
  event.preventDefault()
}

function openGroupCallPicker(type: 'audio' | 'video') {
  if (!canChat.value) {
    showToast(chatBlockTip.value || '无法发起通话')
    return
  }
  if (!callableGroupMembers.value.length) {
    showToast('暂无可邀请的群成员')
    return
  }
  // 群通话发起方不播铃声
  stopCallRingtone()
  discardWarmedCallMedia()
  groupCallMediaType.value = type
  selectedCallMemberIds.value = []
  showGroupCallPicker.value = true
}

function toggleCallMember(userId: string) {
  selectedCallMemberIds.value = selectedCallMemberIds.value.includes(userId)
    ? selectedCallMemberIds.value.filter((id) => id !== userId)
    : [...selectedCallMemberIds.value, userId]
}

function confirmGroupCall() {
  const selected = callableGroupMembers.value.filter((m) =>
    selectedCallMemberIds.value.includes(String(m.userId)),
  )
  if (!selected.length) return
  showGroupCallPicker.value = false
  stopCallRingtone()
  discardWarmedCallMedia()
  void groupCall.startGroupCall({
    conversationId: conversationId.value,
    groupTitle: peerTitle.value || '群聊',
    mediaType: groupCallMediaType.value,
    members: selected,
    allMembers: callableGroupMembers.value,
  })
}
const showMentionPopup = ref(false)
/** 本条待发送消息里选中的 @ 成员 */
const pendingMentions = ref<Array<{ userId: string; nickname: string }>>([])
const pendingAtAll = ref(false)
let mentionAvatarTimer: ReturnType<typeof setTimeout> | null = null
let suppressAvatarClick = false

const showGroupReadSheet = ref(false)
const groupReadSheetTab = ref<'read' | 'unread'>('read')
const groupReadSheetMsg = ref<ChatMessage | null>(null)

let mediaRecorder: MediaRecorder | null = null
let mediaStream: MediaStream | null = null
let recordChunks: Blob[] = []
let recordStartedAt = 0
let recordTimer: ReturnType<typeof setInterval> | null = null
let recordMaxTimer: ReturnType<typeof setTimeout> | null = null
let recordStartY = 0
let finishingRecord = false
let recordSession = 0
let playToken = 0
const speakBlocked = computed(() => {
  if (!isGroup.value) return false
  if (groupIsManager.value) return false
  return groupMuteAll.value || groupSpeakMuted.value
})
const speakBlockTip = computed(() => {
  if (groupSpeakMuted.value) return '你已被禁言，无法发送消息'
  if (groupMuteAll.value) return '全员禁言中，仅群主和管理员可发言'
  return ''
})
const muteBannerTip = computed(() => {
  if (!isGroup.value) return ''
  if (speakBlocked.value) return speakBlockTip.value
  if (groupMuteAll.value && groupIsManager.value) return '全员禁言已开启，普通成员无法发言'
  return ''
})
const canChat = computed(() => {
  if (isGroup.value) return !speakBlocked.value
  if (peerBlockedByMe.value || peerBlockedMe.value) return false
  const peer = peerUserId.value
  if (!peer) return true
  return friendIds.value.has(String(peer))
})
// 首屏先保留输入区的布局，等私聊关系校验完成后再决定是否允许操作，
// 避免联系人列表异步返回时输入区整体从页面上闪现。
const composerChecking = computed(() =>
  !isGroup.value && !!peerUserId.value && !friendRelationshipLoaded.value,
)
const composerVisible = computed(() => canChat.value || composerChecking.value)
const isFileTransferAssistant = computed(() =>
  !isGroup.value && (peerFileTransferAssistant.value || peerTitle.value === '文件传输助手'),
)
const chatBlockTip = computed(() => {
  if (isGroup.value) return speakBlockTip.value
  if (peerBlockedByMe.value) return '已拉黑对方，无法发送消息'
  if (peerBlockedMe.value) return '您已被对方拉入黑名单'
  return '对方不是你好友，无法发送消息'
})
const showChatBlockTip = computed(() => {
  if (canChat.value) return false
  return isGroup.value || friendRelationshipLoaded.value
})
const isMuteBlock = computed(() => isGroup.value && speakBlocked.value)
let unsubWs: (() => void) | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let longPressTimer: ReturnType<typeof setTimeout> | null = null

const myUserId = computed(() => {
  const fromStore = userStore.userId
  if (fromStore) return String(fromStore)
  return parseUserIdFromToken(userStore.token) || ''
})

// Drafts are restored per conversation and kept in a volatile module store.
// This survives route changes but is intentionally not persisted to storage,
// so a fresh app launch starts with an empty composer.
watch(
  [conversationId, myUserId],
  ([nextConversationId, nextUserId], previous) => {
    const previousConversationId = previous?.[0]
    const previousUserId = previous?.[1]
    if (
      previousConversationId
      && (previousConversationId !== nextConversationId || previousUserId !== nextUserId)
    ) {
      // Route changes and text input can happen in the same tick. Save the
      // old conversation synchronously before loading the next draft.
      setChatDraft(previousConversationId, previousUserId, inputText.value)
    }

    const nextDraft = getChatDraft(nextConversationId, nextUserId)
    if (inputText.value !== nextDraft) inputText.value = nextDraft
    clearPendingMentions()
  },
  { immediate: true },
)

watch(inputText, (text) => {
  setChatDraft(conversationId.value, myUserId.value, text)
})

const selectedCount = computed(() => selectedIds.value.size)
const forwardSelectedCount = computed(() => forwardSelectedIds.value.size)

const msgActions = computed(() => {
  const msg = activeMsg.value
  if (!msg || msg.recalled) return []
  // 通话记录：仅提供删除与多选
  if (isCallRecord(msg)) {
    return [{ name: '删除' }, { name: '多选' }]
  }
  const actions: Array<{ name: string }> = []
  if (msg.msgType === 0 || msg.msgType === 4 || msg.msgType === 5) {
    actions.push({ name: '复制' })
  } else if (msg.msgType === 2) {
    actions.push({ name: '复制文件名' })
  }
  if (msg.msgType === 1 && imageUrlOf(msg)) {
    actions.unshift({ name: '编辑图片' })
  }
  if (canSaveMsgMedia(msg)) {
    actions.unshift({ name: '保存到相册' })
  }
  if (msgActionsFromPreview.value) {
    actions.push({ name: '定位到原消息' })
  }
  actions.push(
    { name: '转发' },
    { name: '删除' },
    { name: '多选' },
    { name: '引用' },
  )
  if (canRecallMessage(msg)) actions.push({ name: '撤回' })
  return actions
})

/** 删除模式可选操作：群聊仅群主可双向删除（全员不可见） */
const deleteModeActions = computed(() => {
  const selfOnly = { name: '单向删除', subname: '仅自己不可见' }
  if (!isGroup.value) {
    return [selfOnly, { name: '双向删除', subname: '双方都不可见' }]
  }
  if (groupIsOwner.value) {
    return [selfOnly, { name: '双向删除', subname: '删除后所有成员不可见' }]
  }
  return [selfOnly]
})

function isBurnMessage(msg: ChatMessage | null | undefined): boolean {
  return !!msg?.burnAfterRead
}

function isBurnMedia(msg: ChatMessage): boolean {
  return msg.msgType === 1 || (msg.msgType === 2 && isVideoMsg(msg))
}

function isBurnMediaLocked(msg: ChatMessage): boolean {
  return isBurnMessage(msg) && isBurnMedia(msg) && !isMine(msg) && !msg.burnReadAt
}

async function unlockBurnMedia(msg: ChatMessage): Promise<boolean> {
  if (!isBurnMediaLocked(msg)) return true
  try {
    const state = await viewBurnMedia(conversationId.value, msg.id)
    msg.burnReadAt = state.burnReadAt
    msg.burnExpiresAt = state.burnExpiresAt
    messages.value = messages.value.slice()
    tickBurnMessages()
    return messages.value.some((item) => item.id === msg.id)
  } catch (e) {
    showToast(e instanceof Error ? e.message : '查看失败，请稍后重试')
    return false
  }
}

function burnExpireTime(msg: ChatMessage): number {
  const raw = msg.burnExpiresAt
  if (!raw) return 0
  const numeric = Number(raw)
  const value = Number.isFinite(numeric) && numeric > 0
    ? (numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : Date.parse(raw)
  return Number.isFinite(value) ? value : 0
}

function autoDeleteExpireTime(msg: ChatMessage): number {
  const raw = msg.autoDeleteExpiresAt
  if (!raw) return 0
  const numeric = Number(raw)
  const value = Number.isFinite(numeric) && numeric > 0
    ? (numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : Date.parse(raw)
  return Number.isFinite(value) ? value : 0
}

function burnRemainingSeconds(msg: ChatMessage): number | null {
  if (!isBurnMessage(msg)) return null
  const expires = burnExpireTime(msg)
  if (!expires) return null
  return Math.max(0, Math.ceil((expires - burnClock.value) / 1000))
}

function burnProgressPercent(msg: ChatMessage): number {
  const expires = burnExpireTime(msg)
  const duration = Number(msg.burnSeconds || 0) * 1000
  if (!expires || duration <= 0) return 0
  return Math.max(0, Math.min(100, (expires - burnClock.value) / duration * 100))
}

function burnStatusLabel(msg: ChatMessage): string {
  if (isBurnMediaLocked(msg)) return '点击查看后开始计时'
  const remaining = burnRemainingSeconds(msg)
  if (remaining == null) return '阅后即焚'
  if (remaining <= 0) return '正在销毁'
  if (remaining < 60) return `${remaining} 秒后销毁`
  return `${Math.ceil(remaining / 60)} 分钟后销毁`
}

function removeExpiredBurnMessages() {
  const now = burnClock.value
  const expiredIds = new Set(
    messages.value
      .filter((msg) => {
        const burnExpiry = burnExpireTime(msg)
        const autoDeleteExpiry = autoDeleteExpireTime(msg)
        return (burnExpiry > 0 && burnExpiry <= now)
          || (autoDeleteExpiry > 0 && autoDeleteExpiry <= now)
      })
      .map((msg) => msg.id),
  )
  if (!expiredIds.size) return
  const latestBefore = messages.value[messages.value.length - 1]
  const latestBurnExpired = !!latestBefore?.burnAfterRead && expiredIds.has(latestBefore.id)
  messages.value = messages.value.filter((msg) => !expiredIds.has(msg.id))
  syncConversationPreviewFromMessages()
  if (latestBurnExpired) inbox.notifyBurnExpired(conversationId.value)
  selectedIds.value = new Set([...selectedIds.value].filter((id) => !expiredIds.has(id)))
  if (activeMsg.value && expiredIds.has(activeMsg.value.id)) {
    activeMsg.value = null
    showMsgSheet.value = false
  }
  if (replyTarget.value && expiredIds.has(replyTarget.value.id)) replyTarget.value = null
}

function tickBurnMessages() {
  burnClock.value = Date.now()
  removeExpiredBurnMessages()
}

function removeBurnMessageById(msgId: string) {
  if (!msgId) return
  const latestBefore = messages.value[messages.value.length - 1]
  messages.value = messages.value.filter((msg) => msg.id !== msgId)
  syncConversationPreviewFromMessages()
  if (latestBefore?.id === msgId && latestBefore.burnAfterRead) {
    inbox.notifyBurnExpired(conversationId.value)
  }
  selectedIds.value = new Set([...selectedIds.value].filter((id) => id !== msgId))
  if (activeMsg.value?.id === msgId) {
    activeMsg.value = null
    showMsgSheet.value = false
  }
  if (replyTarget.value?.id === msgId) replyTarget.value = null
  if (imagePreviewMsg?.id === msgId) closeImagePreview()
}

function blockBurnExport(msg?: ChatMessage | null): boolean {
  if (!isBurnMessage(msg)) return false
  showToast('阅后即焚消息禁止转发、复制、收藏或下载')
  return true
}

function isMine(msg: { fromUserId?: string; mine?: boolean }): boolean {
  const from = String(msg.fromUserId ?? '')
  const me = myUserId.value
  if (me && from) return from === me
  const peer = peerUserId.value
  if (peer && from) return from !== peer
  return msg.mine === true
}

function isSystemTip(msg: { msgType?: number; recalled?: boolean }): boolean {
  return !msg.recalled && msg.msgType === 9
}

function msgSendTimeMs(msg: ChatMessage): number {
  if (!msg.createdAt) return 0
  const t = Date.parse(msg.createdAt)
  return Number.isFinite(t) ? t : 0
}

/** 消息是否已被某水位覆盖（含该条） */
function isCoveredByRead(
  msg: ChatMessage,
  lastReadMsgId?: string,
  lastReadSendTime?: number,
): boolean {
  if (!lastReadMsgId && !(lastReadSendTime && lastReadSendTime > 0)) return false
  if (lastReadMsgId && msg.id === lastReadMsgId) return true
  const mt = msgSendTimeMs(msg)
  if (lastReadSendTime && lastReadSendTime > 0 && mt > 0) {
    if (mt < lastReadSendTime) return true
    if (mt > lastReadSendTime) return false
  }
  if (lastReadMsgId) {
    const idx = messages.value.findIndex((m) => m.id === msg.id)
    const wIdx = messages.value.findIndex((m) => m.id === lastReadMsgId)
    if (idx >= 0 && wIdx >= 0) return idx <= wIdx
  }
  return !!(lastReadSendTime && lastReadSendTime > 0 && mt > 0 && mt <= lastReadSendTime)
}

function isPrivateMsgRead(msg: ChatMessage): boolean {
  return isCoveredByRead(msg, peerLastReadMsgId.value, peerLastReadSendTime.value)
}

function groupMsgReadCount(msg: ChatMessage): number {
  const me = myUserId.value
  let n = 0
  for (const [uid, st] of Object.entries(memberReadMap.value)) {
    if (!uid || uid === me) continue
    if (isCoveredByRead(msg, st.lastReadMsgId, st.lastReadSendTime)) n += 1
  }
  return n
}

function groupReadLabel(msg: ChatMessage): string {
  const n = groupMsgReadCount(msg)
  return n > 0 ? `已读 ${n}` : '未读'
}

type GroupReadMemberRow = {
  userId: string
  nickname: string
  avatarUrl: string
}

function resolveGroupMemberRow(userId: string): GroupReadMemberRow {
  const m = groupMembers.value.find((x) => String(x.userId) === userId)
  return {
    userId,
    nickname: m?.nickname || `用户${userId}`,
    avatarUrl: m?.avatarUrl || '',
  }
}

/** 除自己外的群成员（用于已读/未读名单） */
function groupPeerUserIds(): string[] {
  const me = myUserId.value
  const fromDetail = groupMembers.value
    .map((m) => String(m.userId))
    .filter((id) => id && id !== me)
  if (fromDetail.length) return fromDetail
  // 详情未就绪时，退化为已读水位里出现过的成员
  return Object.keys(memberReadMap.value).filter((id) => id && id !== me)
}

function groupReadMembers(msg: ChatMessage): GroupReadMemberRow[] {
  const rows: GroupReadMemberRow[] = []
  for (const uid of groupPeerUserIds()) {
    const st = memberReadMap.value[uid]
    if (isCoveredByRead(msg, st?.lastReadMsgId, st?.lastReadSendTime)) {
      rows.push(resolveGroupMemberRow(uid))
    }
  }
  return rows
}

function groupUnreadMembers(msg: ChatMessage): GroupReadMemberRow[] {
  const rows: GroupReadMemberRow[] = []
  for (const uid of groupPeerUserIds()) {
    const st = memberReadMap.value[uid]
    if (!isCoveredByRead(msg, st?.lastReadMsgId, st?.lastReadSendTime)) {
      rows.push(resolveGroupMemberRow(uid))
    }
  }
  return rows
}

const groupReadSheetReadList = computed(() => {
  const msg = groupReadSheetMsg.value
  return msg ? groupReadMembers(msg) : []
})

const groupReadSheetUnreadList = computed(() => {
  const msg = groupReadSheetMsg.value
  return msg ? groupUnreadMembers(msg) : []
})

const groupReadSheetList = computed(() =>
  groupReadSheetTab.value === 'read' ? groupReadSheetReadList.value : groupReadSheetUnreadList.value,
)

async function openGroupReadSheet(msg: ChatMessage) {
  if (!isGroup.value || !isMine(msg)) return
  groupReadSheetMsg.value = msg
  groupReadSheetTab.value = groupMsgReadCount(msg) > 0 ? 'read' : 'unread'
  showGroupReadSheet.value = true
  // 打开时刷新成员与水位，保证名单准确
  void Promise.all([refreshGroupMuteState(), loadReadStates(true)])
}

function applyMemberRead(userId: string, lastReadMsgId: string, lastReadSendTime: number) {
  if (!userId) return
  const prev = memberReadMap.value[userId]
  if (
    prev &&
    lastReadSendTime > 0 &&
    prev.lastReadSendTime > 0 &&
    lastReadSendTime < prev.lastReadSendTime
  ) {
    return
  }
  if (prev && lastReadMsgId && prev.lastReadMsgId === lastReadMsgId) {
    if (lastReadSendTime > 0 && lastReadSendTime <= prev.lastReadSendTime) return
  }
  const nextLastReadMsgId = lastReadMsgId || prev?.lastReadMsgId || ''
  const nextLastReadSendTime = lastReadSendTime || prev?.lastReadSendTime || 0
  if (
    prev &&
    prev.lastReadMsgId === nextLastReadMsgId &&
    prev.lastReadSendTime === nextLastReadSendTime
  ) {
    return
  }
  memberReadMap.value = {
    ...memberReadMap.value,
    [userId]: {
      lastReadMsgId: nextLastReadMsgId,
      lastReadSendTime: nextLastReadSendTime,
    },
  }
  if (!isGroup.value && peerUserId.value && userId === String(peerUserId.value)) {
    peerLastReadMsgId.value = nextLastReadMsgId
    peerLastReadSendTime.value = nextLastReadSendTime
  }

  const cacheKey = readStateCacheKey(conversationId.value)
  const cached = conversationReadStateCache.get(cacheKey)
  const members = (cached?.members || []).filter((member) => member.userId !== userId)
  members.push({
    userId,
    lastReadMsgId: nextLastReadMsgId || undefined,
    lastReadSendTime: nextLastReadSendTime || undefined,
  })
  const next: ConversationReadStates = {
    conversationId: String(conversationId.value),
    conversationType: cached?.conversationType,
    readReceiptEnabled: cached?.readReceiptEnabled ?? conversationReadReceiptsEnabled.value,
    myLastReadMsgId: cached?.myLastReadMsgId,
    myLastReadSendTime: cached?.myLastReadSendTime,
    peerLastReadMsgId: cached?.peerLastReadMsgId,
    peerLastReadSendTime: cached?.peerLastReadSendTime,
    members,
  }
  if (!isGroup.value && peerUserId.value && userId === String(peerUserId.value)) {
    next.peerLastReadMsgId = nextLastReadMsgId || undefined
    next.peerLastReadSendTime = nextLastReadSendTime || undefined
  }
  cacheReadState(cacheKey, next)
}

function readStateCacheKey(cid: string): string {
  return `${String(myUserId.value || userStore.userId || '')}:${cid}`
}

function applyReadStateSnapshot(st: ConversationReadStates) {
  conversationReadReceiptsEnabled.value = st.readReceiptEnabled !== false
  for (const m of st.members) {
    if (!m.userId) continue
    applyMemberRead(m.userId, m.lastReadMsgId || '', m.lastReadSendTime || 0)
  }
  if (st.peerLastReadMsgId || st.peerLastReadSendTime) {
    applyMemberRead(
      String(peerUserId.value || ''),
      st.peerLastReadMsgId || '',
      st.peerLastReadSendTime || 0,
    )
  }
  const cacheKey = readStateCacheKey(conversationId.value)
  const membersById = new Map(st.members.map((member) => [member.userId, member]))
  for (const [userId, state] of Object.entries(memberReadMap.value)) {
    membersById.set(userId, {
      userId,
      lastReadMsgId: state.lastReadMsgId || undefined,
      lastReadSendTime: state.lastReadSendTime || undefined,
    })
  }
  cacheReadState(cacheKey, {
    ...st,
    members: [...membersById.values()],
    peerLastReadMsgId: peerLastReadMsgId.value || st.peerLastReadMsgId,
    peerLastReadSendTime: peerLastReadSendTime.value || st.peerLastReadSendTime,
  })
}

async function loadReadStates(force = false) {
  const cid = conversationId.value
  if (!cid || cid.startsWith('tmp_')) return
  if (isFileTransferAssistant.value || peerTitle.value === '文件传输助手') return
  if (readStatesRequest) return readStatesRequest

  const cacheKey = readStateCacheKey(cid)
  const cached = conversationReadStateCache.get(cacheKey) || readPersistedReadState(cacheKey)
  if (cached) {
    // 先恢复缓存，避免消息列表按默认“未读”渲染一帧后再跳变。
    applyReadStateSnapshot(cached)
    readStatesLoaded = true
    const cachedAt = conversationReadStateCacheAt.get(cacheKey) || 0
    if (!force && cachedAt > 0 && Date.now() - cachedAt <= READ_STATE_CACHE_TTL_MS) return
  }

  const request = (async () => {
    try {
      const st = await fetchConversationReadStates(cid)
      applyReadStateSnapshot(st)
      // applyReadStateSnapshot 会把期间收到的 WS 新回执合并回来，不能直接
      // 用接口响应覆盖它们，否则进入页面时可能出现“已读 → 未读 → 已读”。
      cacheReadState(cacheKey, conversationReadStateCache.get(cacheKey) || st)
      readStatesLoaded = true
    } catch {
      // ignore
    }
  })()
  readStatesRequest = request
  try {
    await request
  } finally {
    if (readStatesRequest === request) readStatesRequest = null
  }
}

function latestReadableMsgId(): string | undefined {
  for (let i = messages.value.length - 1; i >= 0; i--) {
    const m = messages.value[i]
    if (!m?.id) continue
    if (m.id.startsWith('tmp_') || m.id.startsWith('local_')) continue
    return m.id
  }
  return undefined
}

function readMarkKey(value: string) {
  return value || '__conversation__'
}

function flushReadMark() {
  if (readMarkTimer) {
    clearTimeout(readMarkTimer)
    readMarkTimer = null
  }
  if (readMarkInFlight) return
  const cid = conversationId.value
  if (!cid || cid.startsWith('tmp_')) return
  const targetId = pendingReadMarkId
  const targetKey = readMarkKey(targetId)
  if (targetKey === lastReadMarkId) return

  readMarkInFlight = true
  let retryDelay = 0
  void markConversationRead(cid, targetId || undefined)
    .then((result) => {
      const effectiveId = String(
        result?.lastReadMsgId || targetId,
      )
      lastReadMarkId = readMarkKey(result?.requestedReadMsgFound === false ? effectiveId : targetId)
      inbox.notifyConversationRead(
        cid,
        myUserId.value,
        effectiveId,
        Number(result?.lastReadSendTime) || 0,
      )
      for (const started of result?.burnStarted || []) {
        const message = messages.value.find((item) => item.id === started.msgId)
        if (!message) continue
        message.burnReadAt = started.burnReadAt
        message.burnExpiresAt = started.burnExpiresAt
      }
      if (result?.burnStarted?.length) {
        messages.value = messages.value.slice()
        tickBurnMessages()
      }
      if (result?.requestedReadMsgFound === false) retryDelay = 100
      scheduleBurnReadSync()
    })
    .catch(() => {
      retryDelay = 300
    })
    .finally(() => {
      readMarkInFlight = false
      if (readMarkKey(pendingReadMarkId) !== lastReadMarkId) {
        if (readMarkTimer) clearTimeout(readMarkTimer)
        readMarkTimer = setTimeout(flushReadMark, retryDelay)
      }
    })
}

function markReadNow(immediate = false) {
  const cid = conversationId.value
  if (!cid || cid.startsWith('tmp_')) return
  // The conversation is visibly open, so remove its source immediately. The
  // server read receipt is asynchronous; waiting for it makes the header
  // unread counter flash 0 -> 1 -> 0 whenever a message arrives here.
  inbox.clearConversationUnread(cid)
  inbox.clearMention(cid)
  pendingReadMarkId = latestReadableMsgId() || ''
  if (readMarkKey(pendingReadMarkId) === lastReadMarkId) return
  if (readMarkTimer) clearTimeout(readMarkTimer)
  const hasUnreadBurn = messages.value.some((message) =>
    message.burnAfterRead && !isMine(message) && !message.burnReadAt && !isBurnMedia(message))
  readMarkTimer = immediate || hasUnreadBurn ? null : setTimeout(flushReadMark, 60)
  if (immediate || hasUnreadBurn) flushReadMark()
}

function syncConversationPreviewFromMessages() {
  const cid = conversationId.value
  if (!cid || cid.startsWith('tmp_')) return
  inbox.syncFromMessages(cid, messages.value as unknown as Array<Record<string, unknown>>)
}

function scheduleBurnReadSync() {
  if (isGroup.value) return
  if (!messages.value.some((message) => message.burnAfterRead)) return
  if (burnReadSyncTimer) clearTimeout(burnReadSyncTimer)
  burnReadSyncTimer = setTimeout(async () => {
    burnReadSyncTimer = null
    const cid = conversationId.value
    if (!cid || cid.startsWith('tmp_')) return
    try {
      const serverMessages = await fetchMessages(cid, myUserId.value || 'me', { limit: 40 })
      const serverById = new Map(serverMessages.map((message) => [message.id, message]))
      let changed = false
      messages.value = messages.value.filter((message) => {
        if (!message.burnAfterRead) return true
        const server = serverById.get(message.id)
        if (!server) return true
        if (server.burnExpiresAt !== message.burnExpiresAt) {
          message.burnExpiresAt = server.burnExpiresAt
          message.burnReadAt = server.burnReadAt
          changed = true
        }
        return true
      })
      if (changed) {
        messages.value = messages.value.slice()
        tickBurnMessages()
        syncConversationPreviewFromMessages()
      }
    } catch {
      // WebSocket and periodic full refresh remain as fallbacks.
    }
  }, 250)
}

const mentionCandidates = computed(() =>
  groupMembers.value.filter((m) => String(m.userId) !== myUserId.value),
)

function openMentionPicker() {
  if (!isGroup.value) return
  if (!canChat.value) {
    showToast(chatBlockTip.value || '无法发送消息')
    return
  }
  showEmojiPanel.value = false
  showPlusSheet.value = false
  showMentionPopup.value = true
}

function onComposerInput(event: Event) {
  if (!isGroup.value) syncTypingStatus()
  if (!isGroup.value || !canChat.value) return
  const inputEvent = event as InputEvent
  if (inputEvent.inputType !== 'insertText' || inputEvent.data !== '@') return
  const textarea = event.currentTarget as HTMLTextAreaElement
  const caret = textarea.selectionStart ?? inputText.value.length
  inputText.value = `${inputText.value.slice(0, Math.max(0, caret - 1))}${inputText.value.slice(caret)}`
  openMentionPicker()
}

function beginAvatarMention(msg: ChatMessage) {
  if (!isGroup.value || isMine(msg) || multiMode.value) return
  if (mentionAvatarTimer) clearTimeout(mentionAvatarTimer)
  mentionAvatarTimer = setTimeout(() => {
    mentionAvatarTimer = null
    const member = groupMembers.value.find(
      (item) => String(item.userId) === String(msg.fromUserId || ''),
    )
    if (!member) return
    suppressAvatarClick = true
    pickMentionMember(member)
    nextTick(() => composerRef.value?.focus())
  }, 500)
}

function cancelAvatarMention() {
  if (mentionAvatarTimer) clearTimeout(mentionAvatarTimer)
  mentionAvatarTimer = null
}

function onSenderAvatarClick(msg: ChatMessage) {
  if (suppressAvatarClick) {
    suppressAvatarClick = false
    return
  }
  if (!multiMode.value) openSenderProfile(msg)
}

function onSenderAvatarContextMenu(msg: ChatMessage) {
  if (!isGroup.value || isMine(msg) || multiMode.value) return
  const member = groupMembers.value.find(
    (item) => String(item.userId) === String(msg.fromUserId || ''),
  )
  if (!member) return
  pickMentionMember(member)
  nextTick(() => composerRef.value?.focus())
}

function insertMentionToken(token: string) {
  const cur = inputText.value
  const needsSpace = cur.length > 0 && !/\s$/.test(cur)
  inputText.value = `${cur}${needsSpace ? ' ' : ''}${token} `
}

function pickAtAll() {
  if (!groupIsManager.value) {
    showToast('仅群主或管理员可@全体成员')
    return
  }
  pendingAtAll.value = true
  pendingMentions.value = []
  insertMentionToken('@全体成员')
  showMentionPopup.value = false
}

function pickMentionMember(m: GroupMember) {
  const uid = String(m.userId)
  const name = (m.nickname || '用户').trim() || '用户'
  if (!pendingMentions.value.some((x) => x.userId === uid)) {
    pendingMentions.value = [...pendingMentions.value, { userId: uid, nickname: name }]
  }
  pendingAtAll.value = false
  insertMentionToken(`@${name}`)
  showMentionPopup.value = false
}

function resolveOutgoingMentions(text: string): { mentionUserIds: string[]; atAll: boolean } {
  if (pendingAtAll.value && text.includes('@全体成员')) {
    return { mentionUserIds: [], atAll: true }
  }
  const ids = pendingMentions.value
    .filter((m) => text.includes(`@${m.nickname}`))
    .map((m) => m.userId)
  return { mentionUserIds: [...new Set(ids)], atAll: false }
}

function clearPendingMentions() {
  pendingMentions.value = []
  pendingAtAll.value = false
}

type TextPart = { text: string; mention?: boolean }

function textParts(content?: string): TextPart[] {
  const raw = content || ''
  if (!raw) return [{ text: '' }]
  const re = /(@全体成员|@[^\s@]+)/g
  const parts: TextPart[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) {
    if (m.index > last) parts.push({ text: raw.slice(last, m.index) })
    parts.push({ text: m[0], mention: true })
    last = m.index + m[0].length
  }
  if (last < raw.length) parts.push({ text: raw.slice(last) })
  return parts.length ? parts : [{ text: raw }]
}

function systemTipText(content?: string, message?: ChatMessage): string {
  if (!content) return ''
  const raw = content.trim()
  if (!raw.startsWith('{')) return raw
  try {
    const obj = JSON.parse(raw) as {
      kind?: string
      text?: string
      mediaType?: string
      actorId?: string | number
      actorName?: string
      targetId?: string | number
      targetName?: string
      ownerId?: string | number
      ownerName?: string
      actorRole?: string
      actorTitle?: string
      source?: string
      enabled?: boolean
      ttlSeconds?: number
      burnSeconds?: number
    }
    if (obj?.kind === 'red_packet_received') {
      const actorIsMe = obj.actorId != null && String(obj.actorId) === myUserId.value
      const ownerIsMe = obj.ownerId != null && String(obj.ownerId) === myUserId.value
      const sameUser = obj.actorId != null && obj.ownerId != null
        && String(obj.actorId) === String(obj.ownerId)
      const actor = actorIsMe ? '你' : (obj.actorName || '群成员')
      const owner = ownerIsMe ? '你' : (obj.ownerName || '群成员')
      if (sameUser) return actorIsMe ? '你领取了自己发的红包' : `${actor}领取了自己发的红包`
      if (ownerIsMe) return `${actor}领取了你的红包`
      if (actorIsMe) return `你领取了${owner}的红包`
      return `${actor}领取了${owner}的红包`
    }
    if (obj?.kind === 'transfer_received') {
      const actorIsMe = obj.actorId != null && String(obj.actorId) === myUserId.value
      const ownerIsMe = obj.ownerId != null && String(obj.ownerId) === myUserId.value
      const actor = actorIsMe ? '你' : (obj.actorName || '收款人')
      const owner = ownerIsMe ? '你' : (obj.ownerName || '转账人')
      if (actorIsMe) return '你已收款'
      if (ownerIsMe) return `${actor}已收款`
      return `${actor}已收取${owner}的转账`
    }
    if (obj?.kind === 'red_packet_expired') {
      return `红包已过期，未领取金额 ${yuan(Number((obj as any).refundAmount || 0))} 已退回`
    }
    if (obj?.kind === 'transfer_expired') {
      return `转账已过期，金额 ${yuan(Number((obj as any).refundAmount || 0))} 已退回`
    }
    const actorIsMe = obj.actorId != null && String(obj.actorId) === myUserId.value
    const groupRole = String(obj.actorRole || '')
    const groupRoleLabel = String(obj.actorTitle || (groupRole === 'owner' ? '群主' : groupRole === 'admin' ? '管理员' : groupRole === 'member' ? '群成员' : ''))
    const groupActorName = String(obj.actorName || message?.fromNickname || (actorIsMe ? userStore.nickname : '群成员'))
    const groupActor = isGroup.value && groupRoleLabel
      ? (actorIsMe ? `我（${groupRoleLabel}·${groupActorName}）` : `${groupRoleLabel}·${groupActorName}`)
      : (actorIsMe ? '我' : groupActorName)
    if (obj?.kind === 'group_action') {
      return `${groupActor}${String(obj.text || '')}`
    }
    if (obj?.kind === 'group_member_join') {
      const targetIsMe = obj.targetId != null && String(obj.targetId) === myUserId.value
      const target = targetIsMe ? '我' : (obj.targetName || '新成员')
      if (obj.actorId != null) return `${groupActor}邀请${target}加入群聊`
      if (obj.source === 'qrcode') return `${target}通过扫描二维码加入群聊`
      if (obj.source === 'card') return `${target}通过群名片加入群聊`
      return `${target}加入了群聊`
    }
    if (obj?.kind === 'group_member_kick') {
      const targetIsMe = obj.targetId != null && String(obj.targetId) === myUserId.value
      return `${groupActor}将${targetIsMe ? '我' : (obj.targetName || '群成员')}移出群聊`
    }
    if (obj?.kind === 'auto_delete_setting') {
      const actorIsMe = obj.actorId != null && String(obj.actorId) === myUserId.value
      const actor = actorIsMe ? '我' : '对方'
      if (obj.enabled === false) return `${actor}关闭了自动删除记录`
      const seconds = Number(obj.ttlSeconds) || 86400
      return `${actor}开启了自动删除记录，双方发送的新消息，都会在${autoDeleteTimeLabel(seconds)}后从双方的聊天记录中删除`
    }
    if (obj?.kind === 'burn_setting') {
      const actorIsMe = obj.actorId != null && String(obj.actorId) === myUserId.value
      const actor = actorIsMe ? '我' : (peerTitle.value || obj.actorName || '对方')
      if (obj.enabled === false) return `${actor}关闭了阅后即焚`
      const seconds = Math.max(0, Number(obj.burnSeconds ?? obj.ttlSeconds) || 0)
      const period = seconds <= 0 ? '立即' : `${Math.max(1, Math.round(seconds))}秒后`
      return `${actor}开启了阅后即焚，消息将在阅读后${period}销毁`
    }
    if (obj?.kind === 'group_member_join') {
      const actorIsMe = obj.actorId != null && String(obj.actorId) === myUserId.value
      const targetIsMe = obj.targetId != null && String(obj.targetId) === myUserId.value
      const actor = actorIsMe ? '我' : (obj.actorName || '群成员')
      const target = targetIsMe ? '我' : (obj.targetName || '新成员')
      if (obj.actorId != null) return `${actor}邀请${target}加入群聊`
      if (obj.source === 'qrcode') return `${target}通过扫描二维码加入群聊`
      if (obj.source === 'card') return `${target}通过群名片加入群聊`
      return `${target}加入群聊`
    }
    if (obj?.kind === 'group_member_kick') {
      const actorIsMe = obj.actorId != null && String(obj.actorId) === myUserId.value
      const targetIsMe = obj.targetId != null && String(obj.targetId) === myUserId.value
      const actor = actorIsMe ? '我' : (obj.actorName || '管理员')
      const target = targetIsMe ? '我' : (obj.targetName || '群成员')
      return `${actor}将${target}移出群聊`
    }
    if (obj?.kind === 'voice_call' || obj?.kind === 'video_call') {
      const text = obj.text || '通话已结束'
      const isVideo =
        obj.kind === 'video_call' || String(obj.mediaType || '').toLowerCase() === 'video'
      return `${isVideo ? '[视频通话]' : '[语音通话]'} ${text}`
    }
  } catch {
    /* ignore */
  }
  return raw
}

type SystemBusinessLink = {
  kind: 'redpacket' | 'transfer'
  businessNo?: string
  sourceMsgId?: string
}

function systemBusinessLink(msg: ChatMessage): SystemBusinessLink | null {
  if (!isSystemTip(msg)) return null
  try {
    const data = JSON.parse((msg.content || '').trim()) as Record<string, unknown>
    const kind = String(data.kind || '').trim()
    const linkKind = kind.startsWith('red_packet') ? 'redpacket' : kind.startsWith('transfer') ? 'transfer' : ''
    if (!linkKind) return null
    return {
      kind: linkKind,
      businessNo: String(data.businessNo || '').trim() || undefined,
      sourceMsgId: String(data.sourceMsgId || data.sourceMessageId || '').trim() || undefined,
    }
  } catch {
    return null
  }
}

function isBusinessSystemTip(msg: ChatMessage): boolean {
  return !!systemBusinessLink(msg)
}

function businessSourceMessage(msg: ChatMessage, link: SystemBusinessLink): ChatMessage | undefined {
  if (link.sourceMsgId) {
    const byId = messages.value.find((item) => item.id === link.sourceMsgId)
    if (byId) return byId
  }
  if (link.businessNo) {
    return messages.value.find((item) => {
      const business = businessOf(item)
      return business
        && ((link.kind === 'redpacket' && item.msgType === 7) || (link.kind === 'transfer' && item.msgType === 8))
        && String(business.businessNo || '') === link.businessNo
    })
  }
  const systemTime = msgSendTimeMs(msg)
  return [...messages.value].reverse().find((item) => {
    const business = businessOf(item)
    if (!business) return false
    if (link.kind === 'redpacket' && item.msgType !== 7) return false
    if (link.kind === 'transfer' && item.msgType !== 8) return false
    return !systemTime || !msgSendTimeMs(item) || msgSendTimeMs(item) <= systemTime
  })
}

async function jumpToBusinessSource(msg: ChatMessage) {
  const link = systemBusinessLink(msg)
  if (!link) return
  const target = businessSourceMessage(msg, link)
  if (target) {
    await scrollToMessageWithHistory(target.id)
    return
  }
  if (link.sourceMsgId) {
    await scrollToMessageWithHistory(link.sourceMsgId)
    return
  }
  showToast('原红包/转账消息不在当前记录中')
}

function callRecordMediaType(content?: string): 'audio' | 'video' | null {
  if (!content) return null
  try {
    const obj = JSON.parse(content) as { kind?: string; mediaType?: string; group?: boolean }
    if (obj.kind !== 'voice_call' && obj.kind !== 'video_call') return null
    // 群通话 tip 不可点按回拨私聊
    if (obj.group === true) return null
    return obj.kind === 'video_call' || String(obj.mediaType || '').toLowerCase() === 'video'
      ? 'video'
      : 'audio'
  } catch {
    return null
  }
}

/** 判断是否为通话记录消息（含群通话），用于以聊天气泡形式展示 */
function isCallRecord(msg: ChatMessage): boolean {
  if (!isSystemTip(msg)) return false
  const raw = (msg.content || '').trim()
  if (!raw) return false
  if (raw.startsWith('{')) {
    try {
      const obj = JSON.parse(raw) as { kind?: string }
      return obj?.kind === 'voice_call' || obj?.kind === 'video_call'
    } catch {
      return false
    }
  }
  return /^(通话|\[(语音通话|视频通话)\])/.test(raw)
}

function callRecordIsVideo(content?: string): boolean {
  if (!content) return false
  const raw = content.trim()
  if (raw.startsWith('{')) {
    try {
      const obj = JSON.parse(raw) as { kind?: string; mediaType?: string }
      return obj.kind === 'video_call'
        || String(obj.mediaType || '').toLowerCase() === 'video'
    } catch {
      return false
    }
  }
  return raw.includes('视频')
}

function callRecordIsGroup(content?: string): boolean {
  if (!content) return false
  try {
    const obj = JSON.parse(content.trim()) as { group?: boolean }
    return obj?.group === true
  } catch {
    return false
  }
}

function callRecordLabel(msg: ChatMessage): string {
  const base = callRecordIsVideo(msg.content) ? '视频通话' : '语音通话'
  return callRecordIsGroup(msg.content) ? `群${base}` : base
}

function callRecordStatusText(content?: string): string {
  if (!content) return '通话记录'
  let text = content.trim()
  if (text.startsWith('{')) {
    try {
      const obj = JSON.parse(text) as { text?: string }
      text = String(obj.text || '').trim()
    } catch {
      /* keep raw */
    }
  }
  text = text.replace(/^\[(语音通话|视频通话)\]\s*/, '')
  return text || '通话记录'
}


async function refreshGroupMuteState() {
  if (!isGroup.value) return
  try {
    const g = await fetchGroupDetail(conversationId.value)
    applyGroupDetail(g)
  } catch {
    /* ignore */
  }
}

function onGroupProfileUpdated(event: Event) {
  const detail = (event as CustomEvent<{ conversationId?: string; title?: string; avatarUrl?: string }>).detail
  if (!detail || String(detail.conversationId || '') !== conversationId.value) return
  if (detail.title) resolvedPeerTitle.value = detail.title
  if (detail.avatarUrl != null) {
    const avatar = resolveAvatarUrl(detail.avatarUrl)
    if (avatar) {
      setCachedAvatar(
        String(userStore.userId || parseUserIdFromToken(userStore.token) || ''),
        conversationId.value,
        avatar,
        'group',
      )
    } else {
      removeCachedAvatar(
        String(userStore.userId || parseUserIdFromToken(userStore.token) || ''),
        conversationId.value,
        'group',
      )
    }
    resolvedPeerAvatar.value = avatar
  }
}

function onLocalCallSystemTip(event: Event) {
  const tip = (event as CustomEvent<LocalCallSystemTip>).detail
  if (!tip || String(tip.conversationId || '') !== conversationId.value) return
  const clientMsgId = String(tip.clientMsgId || '')
  if (!clientMsgId) return
  const existingIdx = messages.value.findIndex(
    (m) => m.clientMsgId === clientMsgId || m.id === clientMsgId,
  )
  const next: ChatMessage = {
    id: clientMsgId,
    conversationId: conversationId.value,
    fromUserId: myUserId.value || '',
    toUserId: peerUserId.value || '',
    content: tip.content,
    msgType: 9,
    clientMsgId,
    createdAt: new Date().toISOString(),
    mine: false,
  }
  if (existingIdx >= 0) {
    messages.value[existingIdx] = {
      ...messages.value[existingIdx],
      ...next,
      id: messages.value[existingIdx].id || clientMsgId,
    }
  } else {
    messages.value.push(next)
  }
  scrollToBottom()
  if (tip.preview) {
    inbox.notifyLocalMessage(conversationId.value, tip.preview, 9)
  }
}

function onReliableMessageSent(event: Event) {
  const detail = (event as CustomEvent<{ clientMsgId?: string; message?: ChatMessage }>).detail
  const clientMsgId = String(detail?.clientMsgId || '')
  const saved = detail?.message
  if (!clientMsgId || !saved || saved.conversationId !== conversationId.value) return
  const index = messages.value.findIndex((message) => message.clientMsgId === clientMsgId)
  if (index < 0) return
  messages.value[index] = {
    ...messages.value[index],
    ...saved,
    mine: true,
    deliveryState: 'sent',
  }
}

function onReliableMessageFailed(event: Event) {
  const clientMsgId = String(
    (event as CustomEvent<{ clientMsgId?: string }>).detail?.clientMsgId || '',
  )
  const index = messages.value.findIndex((message) => message.clientMsgId === clientMsgId)
  if (index < 0) return
  messages.value[index] = { ...messages.value[index], deliveryState: 'failed' }
}

function retryFailedMessage(message: ChatMessage) {
  if (!message.clientMsgId || !retryQueuedMessage(message.clientMsgId)) return
  message.deliveryState = 'queued'
  messages.value = messages.value.slice()
}

function onOfflineSync() {
  void refreshLatest(false)
}

function handleChatWsMessage(data: unknown) {
  const msg = data as Record<string, unknown>
  const cmd = String(msg.cmd ?? '')
  const normalizedCmd = cmd.toUpperCase()
  if (normalizedCmd === 'BURN_STARTED') {
    const convId = String(msg.conversationId ?? '')
    if (convId && convId !== conversationId.value) return
    const msgId = String(msg.msgId ?? msg.id ?? '')
    const target = messages.value.find((item) => item.id === msgId)
    if (target) {
      target.burnAfterRead = true
      target.burnExpiresAt =
        msg.burnExpiresAt != null ? String(msg.burnExpiresAt) : target.burnExpiresAt
      messages.value = messages.value.slice()
      tickBurnMessages()
    }
    return
  }
  if (normalizedCmd === 'BURN_EXPIRED') {
    const convId = String(msg.conversationId ?? '')
    if (convId && convId !== conversationId.value) return
    removeBurnMessageById(String(msg.msgId ?? msg.id ?? ''))
    return
  }
  if (normalizedCmd === 'TYPING_STATUS' || msg.type === 'typing_status') {
    const convId = String(msg.conversationId ?? '')
    const fromUserId = String(msg.fromUserId ?? '')
    if (
      !typingSettingsLoaded.value ||
      !typingStatusEnabled.value ||
      isGroup.value ||
      convId !== conversationId.value ||
      fromUserId !== String(peerUserId.value || '')
    ) return
    peerTyping.value = Boolean(msg.typing)
    if (peerTypingTimer) clearTimeout(peerTypingTimer)
    if (peerTyping.value) {
      peerTypingTimer = setTimeout(() => {
        peerTyping.value = false
        peerTypingTimer = null
      }, 5000)
    }
    return
  }
  if (normalizedCmd === 'RECALL_MSG' || msg.type === 'recall') {
    applyRecall(String(msg.msgId ?? msg.id ?? ''), String(msg.conversationId ?? ''))
    return
  }
  if (normalizedCmd === 'READ_RECEIPT' || msg.type === 'read_receipt' || msg.event === 'read_receipt') {
    const convId = String(msg.conversationId ?? '')
    if (convId && convId !== conversationId.value) return
    const from = String(msg.fromUserId ?? '')
    const lastId = String(msg.lastReadMsgId ?? '')
    const lastTs = Number(msg.lastReadSendTime) || 0
    applyMemberRead(from, lastId, lastTs)
    return
  }
  if (normalizedCmd === 'BUSINESS_STATUS' || msg.type === 'business_status' || msg.event === 'business_status') {
    const convId = String(msg.conversationId ?? '')
    if (convId && convId !== conversationId.value) return
    const status = String(msg.status ?? '').trim()
    const businessNo = String(msg.businessNo ?? '').trim()
    if (!status || !businessNo) return
    for (const item of messages.value) {
      if (businessOf(item)?.businessNo !== businessNo) continue
      setBusinessStatus(item, status)
    }
    return
  }
  if (normalizedCmd === 'PUSH_MSG' || normalizedCmd === 'MSG' || msg.type === 'message') {
    const convId = String(msg.conversationId ?? '')
    if (convId && convId !== conversationId.value) return
    if (!historyReady.value) {
      pendingRealtimeMessages.push(msg)
      return
    }
    appendIncoming(msg)
  }
}

function flushPendingRealtimeMessages() {
  if (!pendingRealtimeMessages.length) return
  const pending = pendingRealtimeMessages.splice(0)
  pending.forEach((msg) => appendIncoming(msg))
}

onMounted(async () => {
  chatViewMounted = true
  window.addEventListener('pulse:group-profile-updated', onGroupProfileUpdated)
  window.addEventListener('pulse:auto-delete-setting-updated', onAutoDeleteSettingUpdated)
  window.addEventListener('pulse:burn-setting-updated', onBurnSettingUpdated)
  window.addEventListener('pulse:privacy-settings-updated', onPrivacySettingsUpdated)
  window.addEventListener('pulse:call-system-tip', onLocalCallSystemTip)
  window.addEventListener('pulse:native-keyboard', onNativeKeyboard)
  window.addEventListener('pulse:native-keyboard-settled', onNativeKeyboardSettled)
  window.addEventListener('pulse:orientation-change', onNativeOrientationChange)
  window.addEventListener('pulse:native-back', onNativeBack)
  window.addEventListener('pulse:message-sent', onReliableMessageSent)
  window.addEventListener('pulse:message-failed', onReliableMessageFailed)
  window.addEventListener('pulse:offline-sync', onOfflineSync)
  window.addEventListener('pulse:chat-cache-cleared', onChatCacheCleared)
  window.addEventListener('popstate', onMediaPreviewPopState)
  void nextTick(bindPeerNameScroll)
  userStore.restoreSession()
  // Prime the account-scoped cache from navigation data before any profile
  // request completes, including deep links that do not start at Messages.
  cacheInitialPeerAvatar()
  // 直接打开深链会话时，消息首页可能尚未加载，先用服务端未读补齐顶部入口。
  void fetchConversations('all')
    .then((list) => inbox.hydrateUnreadSources(list))
    .catch(() => {})
  // 同步自己的头像到 store（刷新后 session 可能缺头像）
  void fetchUserProfile()
    .then((me) => {
      userStore.setUserInfo({
        userId: me.userId,
        pulseId: me.pulseId,
        nickname: me.nickname,
        avatar: me.avatarUrl,
      })
    })
    .catch(() => {})
  const me = myUserId.value || 'me'
  const cid = conversationId.value
  unsubWs = onWsMessage(handleChatWsMessage)
  void loadAutoDeleteStatus()
  hydrateCachedGroupDetail()
  // 已读水位先于消息首屏恢复；没有缓存时也在后台请求，不再等消息接口完成后才开始。
  void loadReadStates()

  const cachedMessages = filterLocallyClearedMessages(cid, getCachedChatMessages(cid) || [])
  if (cachedMessages?.length) {
    messages.value = cachedMessages.map((message) => ({ ...message, mine: isMine(message) }))
    syncConversationPreviewFromMessages()
    warmAttachments(messages.value)
    loading.value = false
    historyHasMore.value = cachedMessages.length >= HISTORY_PAGE_SIZE
    // A deep-link location must keep the initial viewport available for the
    // target message. The final history load will perform the exact scroll.
    if (!String(route.query.highlightMsgId || '')) scrollToBottom(false)
  }

  // 首屏优先拉消息，附属数据并行，不阻塞出字
  const msgTask = (async () => {
    try {
      let list = filterLocallyClearedMessages(cid, await warmChatMessages(cid, me, HISTORY_PAGE_SIZE))
      const highlightId = String(route.query.highlightMsgId || '')
      const inlineTarget = highlightId ? list.find((message) => message.id === highlightId) : undefined
      let locatedTarget: ChatMessage | null = null
      if (highlightId && !inlineTarget) locatedTarget = await fetchMessage(cid, highlightId, me)
      if (inlineTarget?.recalled || locatedTarget?.recalled) {
        highlightUnavailable.value = true
        showToast('原消息已不存在')
        historyHasMore.value = list.length >= HISTORY_PAGE_SIZE
      } else if (locatedTarget) {
        const anchorTime = locatedTarget.createdAt
        const [older, newer] = anchorTime
          ? await Promise.all([
              fetchMessages(cid, me, { before: anchorTime, limit: HISTORY_PAGE_SIZE }),
              fetchMessages(cid, me, { after: anchorTime, limit: HISTORY_PAGE_SIZE }),
            ])
          : [[], []]
        const unique = new Map<string, ChatMessage>()
        ;[...older, locatedTarget, ...newer].forEach((message) => unique.set(message.id, message))
        list = [...unique.values()].sort((a, b) =>
          new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())
        showingLocatedWindow.value = true
        historyHasMore.value = older.length >= HISTORY_PAGE_SIZE
      } else {
        historyHasMore.value = list.length >= HISTORY_PAGE_SIZE
      }
      list = filterLocallyClearedMessages(cid, list)
      messages.value = list.map((m) => ({ ...m, mine: isMine(m) }))
      syncConversationPreviewFromMessages()
      if (!showingLocatedWindow.value) setCachedChatMessages(cid, messages.value)
      if (isGroup.value && route.query.mentionUnread === '1') {
        mentionJumpIds.value = messages.value
          .filter((m) => !isMine(m) && !!m.mentionedMe && !!m.id)
          .map((m) => m.id)
      }
      // REST media messages contain private file IDs. Warm their lightweight
      // rendition after the first paint so reopening a chat does not fall back
      // to a generic file card.
      warmAttachments(messages.value)
      prefetchVoiceMessages(messages.value)
      void loadReadStates()
      markReadNow()
    } catch {
      if (String(route.query.highlightMsgId || '')) {
        highlightUnavailable.value = true
        showToast('原消息已不存在')
      }
      // 保留空列表，避免加载失败时显示不准确的数据
      if (!messages.value.length) messages.value = []
    } finally {
      loading.value = false
      historyReady.value = true
      flushPendingRealtimeMessages()
      const highlightId = String(route.query.highlightMsgId || '')
      if (highlightId && !highlightUnavailable.value) scrollToHighlight()
      else scrollToBottom()
    }
  })()

  void (async () => {
    try {
      const contacts = await fetchContacts()
      friendIds.value = new Set(contacts.map((c) => String(c.userId)))
    } catch {
      friendIds.value = new Set()
    } finally {
      friendRelationshipLoaded.value = true
    }
  })()

  if (!isGroup.value && peerUserId.value && !isFileTransferAssistant.value) {
    void prefetchPeerRingtone(peerUserId.value)
    void fetchUserProfile(String(peerUserId.value))
      .then((peer) => {
        // 单聊标题：优先后台/本端备注（默认好友「新昵称」写入 remark）
        resolvedPeerTitle.value = peer.displayName?.trim() || peer.remark?.trim() || peer.nickname || ''
        resolvedPeerTag.value = peer.tag?.trim() || ''
        resolvedPeerInitialName.value = peer.nickname?.trim() || resolvedPeerInitialName.value
        const avatar = resolveAvatarUrl(peer.avatarUrl || '')
        if (avatar) {
          setCachedAvatar(
            String(userStore.userId || parseUserIdFromToken(userStore.token) || ''),
            String(peerUserId.value),
            avatar,
          )
        } else {
          removeCachedAvatar(
            String(userStore.userId || parseUserIdFromToken(userStore.token) || ''),
            String(peerUserId.value),
          )
        }
        // The list/deep-link avatar is already visible. Only change it when
        // the server reports a genuinely different avatar.
        if (avatar !== peerAvatar.value) resolvedPeerAvatar.value = avatar
        peerFileTransferAssistant.value = !!peer.fileTransferAssistant
        peerBlockedByMe.value = !!peer.blocked || peer.friendStatus === 'blocked'
        peerBlockedMe.value = !!peer.blockedByPeer || peer.friendStatus === 'blocked_by_peer'
        if (peerBlockedMe.value) {
          peerOnline.value = false
        }
        if (peer.friend || peer.friendStatus === 'friend') {
          friendIds.value.add(String(peerUserId.value))
        } else if (peerBlockedByMe.value || peerBlockedMe.value) {
          friendIds.value.delete(String(peerUserId.value))
        }
      })
      .catch(() => {
        peerBlockedByMe.value = false
        peerBlockedMe.value = false
      })
  }
  if (isGroup.value) {
    void refreshGroupMuteState()
  }

  await msgTask
  void refreshLiveLocationCardState()

  const locationDraftKey = `pulse_location_${cid}`
  const locationDraft = sessionStorage.getItem(locationDraftKey)
  if (locationDraft) {
    sessionStorage.removeItem(locationDraftKey)
    try {
      const payload = JSON.parse(locationDraft) as LocationPayload
      if (
        Number.isFinite(Number(payload.latitude)) &&
        Number.isFinite(Number(payload.longitude))
      ) {
        await sendTypedMessage(JSON.stringify(payload), 6)
      }
    } catch {
      showToast('位置发送失败，请重新选择')
    }
  }

  // 兜底轮询：WS 正常时稀疏增量；断连时更勤；定期全量以同步撤回等
  let pollTick = 0
  let pollInFlight = false
  pollTimer = setInterval(() => {
    if (document.hidden) return
    pollTick += 1
    const wsOk = isWsAuthed()
    // WS 连接未完成认证时也要快速补偿；避免连接表面 OPEN 但实际漏收消息。
    if (pollInFlight) return
    const full = wsOk ? pollTick % 24 === 0 : pollTick % 6 === 0
    pollInFlight = true
    void refreshLatest(full).finally(() => {
      pollInFlight = false
    })
    void refreshLiveLocationCardState()
  }, 2500)

  // 私聊：定时刷新对方在线状态（进入后先勤轮询，再降频）
  if (!isGroup.value && peerUserId.value) {
    void refreshPeerOnline()
    let onlineTicks = 0
    onlinePollTimer = setInterval(() => {
      if (document.hidden) return
      onlineTicks += 1
      void refreshPeerOnline()
      if (onlineTicks === 10 && onlinePollTimer) {
        clearInterval(onlinePollTimer)
        onlinePollTimer = setInterval(() => {
          if (!document.hidden) void refreshPeerOnline()
        }, 4000)
      }
    }, 1200)
  }

  syncKeyboardInset()
  window.visualViewport?.addEventListener('resize', scheduleKeyboardInset)
  window.visualViewport?.addEventListener('scroll', scheduleKeyboardInset)
  window.addEventListener('resize', scheduleKeyboardInset)
  if (listRef.value) {
    messageMutationObserver = new MutationObserver(() => {
      if (stickToBottom) scrollToBottom(false)
    })
    messageMutationObserver.observe(listRef.value, {
      childList: true,
      subtree: true,
      characterData: true,
    })
  }
  tickBurnMessages()
  burnCountdownTimer = setInterval(tickBurnMessages, 250)
})

onUnmounted(() => {
  chatViewMounted = false
  for (const timer of keyboardHideTimers) window.clearTimeout(timer)
  keyboardHideTimers = []
  // Keep the latest keystrokes even if navigation happens before Vue flushes
  // the input watcher.
  setChatDraft(conversationId.value, myUserId.value, inputText.value)
  if (!showingLocatedWindow.value) setCachedChatMessages(conversationId.value, messages.value)
  window.removeEventListener('pulse:group-profile-updated', onGroupProfileUpdated)
  window.removeEventListener('pulse:auto-delete-setting-updated', onAutoDeleteSettingUpdated)
  window.removeEventListener('pulse:burn-setting-updated', onBurnSettingUpdated)
  window.removeEventListener('pulse:privacy-settings-updated', onPrivacySettingsUpdated)
  window.removeEventListener('pulse:call-system-tip', onLocalCallSystemTip)
  window.removeEventListener('pulse:native-keyboard', onNativeKeyboard)
  window.removeEventListener('pulse:native-keyboard-settled', onNativeKeyboardSettled)
  window.removeEventListener('pulse:orientation-change', onNativeOrientationChange)
  window.removeEventListener('pulse:native-back', onNativeBack)
  window.removeEventListener('pulse:message-sent', onReliableMessageSent)
  window.removeEventListener('pulse:message-failed', onReliableMessageFailed)
  window.removeEventListener('pulse:offline-sync', onOfflineSync)
  window.removeEventListener('pulse:chat-cache-cleared', onChatCacheCleared)
  window.removeEventListener('popstate', onMediaPreviewPopState)
  mediaPreviewHistoryActive = false
  peerNameResizeObserver?.disconnect()
  peerNameResizeObserver = null
  // 离开会话再清一次，避免停留期间新消息把未读加回去
  markReadNow(true)
  pendingRealtimeMessages.splice(0)
  unsubWs?.()
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  if (onlinePollTimer) {
    clearInterval(onlinePollTimer)
    onlinePollTimer = null
  }
  stopTypingStatus()
  if (peerTypingTimer) {
    clearTimeout(peerTypingTimer)
    peerTypingTimer = null
  }
  if (burnCountdownTimer) {
    clearInterval(burnCountdownTimer)
    burnCountdownTimer = null
  }
  if (burnReadSyncTimer) {
    clearTimeout(burnReadSyncTimer)
    burnReadSyncTimer = null
  }
  if (readMarkTimer) {
    clearTimeout(readMarkTimer)
    readMarkTimer = null
  }
  if (receiveSuccessTimer) {
    clearTimeout(receiveSuccessTimer)
    receiveSuccessTimer = null
  }
  clearLongPress()
  clearMediaLongPress()
  stopVoicePlayback()
  void abortVoiceRecord()
  clearVoiceCache()
  stopVideoCaptureStream()
  if (keyboardSyncRaf) {
    cancelAnimationFrame(keyboardSyncRaf)
    keyboardSyncRaf = 0
  }
  window.visualViewport?.removeEventListener('resize', scheduleKeyboardInset)
  window.visualViewport?.removeEventListener('scroll', scheduleKeyboardInset)
  window.removeEventListener('resize', scheduleKeyboardInset)
  messageMutationObserver?.disconnect()
  messageMutationObserver = null
  if (scrollSettleTimer) {
    clearTimeout(scrollSettleTimer)
    scrollSettleTimer = null
  }
  resetDocumentScroll()
})

function hasMessage(idOrClientId: string): boolean {
  for (const m of messages.value) {
    if (m.id === idOrClientId || m.clientMsgId === idOrClientId) return true
  }
  return false
}

function applyRecall(msgId: string, convId: string) {
  if (convId && convId !== conversationId.value) return
  if (!msgId) return
  const idx = messages.value.findIndex((m) => m.id === msgId)
  if (idx < 0) return
  const cur = messages.value[idx]
  if (cur.recalled) return
  messages.value[idx] = {
    ...cur,
    recalled: true,
  }
  // 仅更新引用该消息的气泡，避免整表 map 重渲染
  let touched = false
  for (let i = 0; i < messages.value.length; i++) {
    const m = messages.value[i]
    if (m.replyToMsgId === msgId && !m.replyToRecalled) {
      messages.value[i] = { ...m, replyToRecalled: true, replyToContent: '该消息已撤回' }
      touched = true
    }
  }
  if (touched) {
    messages.value = messages.value.slice()
  }
  syncConversationPreviewFromMessages()
}

function canReeditRecalledMessage(msg: ChatMessage): boolean {
  return Boolean(msg.recalled && isMine(msg) && Number(msg.msgType || 0) === 0 && msg.content && !recalledEditHiddenIds.value.has(msg.id))
}

function reeditRecalledMessage(msg: ChatMessage) {
  if (!canReeditRecalledMessage(msg)) return
  inputText.value = msg.content || ''
  const next = new Set(recalledEditHiddenIds.value)
  next.add(msg.id)
  recalledEditHiddenIds.value = next
  void nextTick(() => {
    composerRef.value?.focus()
    composerRef.value?.setSelectionRange(inputText.value.length, inputText.value.length)
  })
}

function appendIncoming(msg: Record<string, unknown>) {
  const convId = String(msg.conversationId ?? '')
  if (convId !== conversationId.value) return
  const incomingCreatedAt = msg.createdAt != null
    ? String(msg.createdAt)
    : msg.sendTime != null
      ? new Date(Number(msg.sendTime)).toISOString()
      : ''
  if (incomingCreatedAt && isMessageLocallyCleared(convId, { createdAt: incomingCreatedAt })) return
  if (!isMine(msg)) inbox.clearConversationUnread(convId)
  const shouldFollowLatest = stickToBottom

  const clientMsgId = msg.clientMsgId != null ? String(msg.clientMsgId) : ''
  const id = String(msg.id ?? msg.msgId ?? clientMsgId ?? Date.now())
  const existingIdx = messages.value.findIndex(
    (m) =>
      (id && (m.id === id || m.clientMsgId === id)) ||
      (clientMsgId && (m.clientMsgId === clientMsgId || m.id === clientMsgId)),
  )

  // Websocket payloads may already contain the file metadata. Keep it in the
  // message content immediately so media bubbles do not briefly (or after a
  // re-entry) fall back to the generic file bubble while hydration runs.
  const rawFile = msg.file && typeof msg.file === 'object'
    ? msg.file as Partial<import('@/api/message').FilePayload> & { downloadUrl?: string }
    : undefined
  const incomingFileId = String(msg.fileId ?? rawFile?.fileId ?? '').trim()
  const isAttachment = [1, 2, 3].includes(Number(msg.msgType))
    || Boolean(incomingFileId)
  const contentFile = isAttachment ? parseFilePayload(String(msg.content ?? '')) : null
  const rawContentFile = isAttachment ? parseFilePayload(String(msg.rawContent ?? '')) : null
  const incomingFile = isAttachment && (incomingFileId || rawFile?.fileId || rawContentFile?.fileId)
    ? normalizeMessageFilePayload(incomingFileId, {
        ...(contentFile || {}),
        ...(rawContentFile || {}),
        ...(rawFile || {}),
      })
    : rawContentFile || contentFile
  const incomingContent = incomingFile ? JSON.stringify(incomingFile) : String(msg.content ?? '')

  const replyToMsgId = msg.replyToMsgId != null ? String(msg.replyToMsgId) : ''
  const incoming: ChatMessage = {
    id,
    conversationId: convId,
    fromUserId: String(msg.fromUserId ?? ''),
    fromNickname: msg.fromNickname != null ? String(msg.fromNickname) : undefined,
    fromAvatarUrl: msg.fromAvatarUrl != null ? resolveAvatarUrl(String(msg.fromAvatarUrl)) : undefined,
    toUserId: String(msg.toUserId ?? ''),
    content: incomingContent,
    msgType: normalizeMessageType(msg.msgType, incomingContent, incomingFile),
    fileId: incomingFile?.fileId || (msg.fileId != null ? String(msg.fileId) : undefined),
    clientMsgId: clientMsgId || undefined,
    createdAt: msg.sendTime ? new Date(Number(msg.sendTime)).toISOString() : new Date().toISOString(),
    mine: false,
    recalled: !!msg.recalled,
    replyToMsgId: replyToMsgId || undefined,
    replyToContent: msg.replyToContent != null ? String(msg.replyToContent) : undefined,
    replyToMsgType:
      msg.replyToMsgType != null ? (Number(msg.replyToMsgType) as ChatMessage['msgType']) : undefined,
    replyToNickname: msg.replyToNickname != null ? String(msg.replyToNickname) : undefined,
    replyToRecalled: !!msg.replyToRecalled,
    mentionUserIds: Array.isArray(msg.mentionUserIds)
      ? msg.mentionUserIds.map((x) => String(x))
      : undefined,
    atAll: !!msg.atAll,
    mentionedMe: !!msg.mentionedMe,
    burnAfterRead: !!msg.burnAfterRead,
    burnSeconds:
      msg.burnSeconds != null && Number.isFinite(Number(msg.burnSeconds))
        ? Number(msg.burnSeconds)
        : undefined,
    burnReadAt: msg.burnReadAt != null ? String(msg.burnReadAt) : undefined,
    burnExpiresAt: msg.burnExpiresAt != null ? String(msg.burnExpiresAt) : undefined,
    autoDeleteExpiresAt: msg.autoDeleteExpiresAt != null ? String(msg.autoDeleteExpiresAt) : undefined,
  }
  incoming.mine = isMine(incoming)
  if (isSystemTip(incoming)) {
    if (existingIdx >= 0) {
      const prev = messages.value[existingIdx]
      messages.value[existingIdx] = {
        ...prev,
        ...incoming,
        // 保留本端乐观 tip 文案（拒绝/取消等双方措辞不同），只升级服务端 id
        id: incoming.id || prev.id,
        content: prev.content || incoming.content,
        clientMsgId: clientMsgId || prev.clientMsgId,
      }
    } else {
      messages.value.push(incoming)
    }
    if (shouldFollowLatest) scrollToBottom()
    markReadNow()
    inbox.notifyLocalMessage(convId, incoming.burnAfterRead ? '[阅后即焚消息]' : msgLabel(incoming), incoming.msgType)
    void refreshGroupMuteState()
    return
  }
  if (existingIdx >= 0) {
    const existing = messages.value[existingIdx]
    messages.value[existingIdx] = {
      ...existing,
      id: incoming.id || existing.id,
      burnAfterRead: incoming.burnAfterRead || existing.burnAfterRead,
      burnSeconds: incoming.burnSeconds ?? existing.burnSeconds,
      burnReadAt: incoming.burnReadAt ?? existing.burnReadAt,
      burnExpiresAt: incoming.burnExpiresAt ?? existing.burnExpiresAt,
      autoDeleteExpiresAt: incoming.autoDeleteExpiresAt ?? existing.autoDeleteExpiresAt,
    }
    return
  }
  if (hasMessage(id) || (clientMsgId && hasMessage(clientMsgId))) return
  // 发送者的其他设备也会收到推送；本端重复消息已在上面按 id/clientMsgId 去重。
  // 因此只有已存在的乐观消息会被忽略，未存在的同账号跨设备消息仍需插入。
  messages.value.push(incoming)
  void hydrateAttachment(incoming)
  if (msg.legacyFile) window.setTimeout(() => { void refreshLatest(true) }, 250)
  addMentionJump(incoming)
  if (incoming.msgType === 3) prefetchVoiceMessages([incoming])
  if (shouldFollowLatest) scrollToBottom()
  markReadNow()
  inbox.notifyLocalMessage(convId, incoming.burnAfterRead ? '[阅后即焚消息]' : msgLabel(incoming), incoming.msgType)
}

async function refreshLatest(full = false) {
  const cid = conversationId.value
  if (!cid || cid === 'undefined' || cid.startsWith('tmp_')) return
  const me = myUserId.value || 'me'
  try {
    const last = messages.value[messages.value.length - 1]
    const after = !full && last?.createdAt ? last.createdAt : undefined
    const list = filterLocallyClearedMessages(cid, await fetchMessages(cid, me, {
      after,
      limit: after ? 40 : 40,
    }))
    const mapped = list.map((m) => ({ ...m, mine: isMine(m) }))
    if (after) {
      if (!mapped.length) return
      const known = new Set(
        messages.value.flatMap((message) =>
          [message.id, message.clientMsgId].filter((value): value is string => !!value),
        ),
      )
      const fresh = mapped.filter(
        (message) =>
          message.id &&
          !known.has(message.id) &&
          (!message.clientMsgId || !known.has(message.clientMsgId)),
      )
      if (!fresh.length) return
      const wasAtBottom =
        !!listRef.value &&
        listRef.value.scrollHeight - listRef.value.scrollTop - listRef.value.clientHeight < 120
      messages.value = [...messages.value, ...fresh]
      warmAttachments(fresh)
      syncConversationPreviewFromMessages()
      prefetchVoiceMessages(fresh)
      if (wasAtBottom) scrollToBottom()
      markReadNow()
      return
    }
    // 全量窗口：用轻量签名对比，避免无变化时重渲染
    const sig = (arr: ChatMessage[]) =>
      arr
        .map(
          (m) =>
            `${m.id}:${m.recalled ? 1 : 0}:${m.msgType}:${(m.content || '').length}:${m.clientMsgId || ''}:${m.burnExpiresAt || ''}`,
        )
        .join('|')
    if (sig(mapped) !== sig(messages.value)) {
      const wasAtBottom =
        !!listRef.value &&
        listRef.value.scrollHeight - listRef.value.scrollTop - listRef.value.clientHeight < 120
      const pending = messages.value.filter(
        (message) =>
          message.deliveryState === 'queued' &&
          !mapped.some(
            (server) =>
              server.id === message.id ||
              (!!server.clientMsgId && server.clientMsgId === message.clientMsgId),
          ),
      )
      messages.value = [...mapped, ...pending]
      warmAttachments(messages.value)
      syncConversationPreviewFromMessages()
      prefetchVoiceMessages(messages.value)
      if (wasAtBottom) scrollToBottom()
    }
    syncConversationPreviewFromMessages()
    if (full || !readStatesLoaded) void loadReadStates()
    markReadNow()
  } catch {
    // ignore poll errors
  }
}

let stickToBottom = true
let messageMutationObserver: MutationObserver | null = null
let scrollSettleTimer: number | null = null
// A locate jump and the normal "stay at bottom" compensation can be queued
// in the same frame. Keep the latter from winning while the target is being
// centered, including delayed image/layout load callbacks.
let locateScrollSuppressedUntil = 0

function isLocateScrollActive(): boolean {
  return Date.now() < locateScrollSuppressedUntil
}

function scrollToBottom(smoothExtra = true, force = false) {
  if (!force && isLocateScrollActive()) {
    stickToBottom = false
    return
  }
  stickToBottom = true
  nextTick(() => {
    const el = listRef.value
    if (!el || (!force && isLocateScrollActive())) return
    el.scrollTop = el.scrollHeight
    showJumpLatest.value = false
    if (!smoothExtra) return
    // 部分机型键盘弹起后布局延迟，再滚一次
    requestAnimationFrame(() => {
      // 定位消息可能在同一帧覆盖默认的“滚到底部”；仅在仍然贴底时
      // 执行这次布局补偿，避免搜索结果定位后又跳回最新消息。
      if (stickToBottom && (force || !isLocateScrollActive())) el.scrollTop = el.scrollHeight
    })
    if (scrollSettleTimer) clearTimeout(scrollSettleTimer)
    scrollSettleTimer = window.setTimeout(() => {
      const current = listRef.value
      if (current && stickToBottom && (force || !isLocateScrollActive())) current.scrollTop = current.scrollHeight
      scrollSettleTimer = null
    }, 180)
  })
}

const showJumpLatest = ref(false)
const mentionJumpIds = ref<string[]>([])

function addMentionJump(msg: ChatMessage) {
  if (!isGroup.value || isMine(msg) || !msg.mentionedMe || !msg.id) return
  if (!mentionJumpIds.value.includes(msg.id)) {
    mentionJumpIds.value = [...mentionJumpIds.value, msg.id]
  }
}

function jumpToNextMention() {
  const [id, ...rest] = mentionJumpIds.value
  if (!id) return
  mentionJumpIds.value = rest
  scrollToMessage(id)
}

function onMessageListScroll() {
  const el = listRef.value
  if (!el) return
  const locateActive = isLocateScrollActive()
  if (locateActive) stickToBottom = false
  if (historyReady.value && el.scrollTop < 36 && historyHasMore.value && !historyLoading.value) {
    void loadOlderMessages()
  }
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight
  if (!locateActive) stickToBottom = distance < 120
  showJumpLatest.value = distance > 180
}

async function loadOlderMessages() {
  const el = listRef.value
  const oldest = messages.value.find((msg) => !!msg.createdAt)
  if (!el || !oldest?.createdAt || historyLoading.value || !historyHasMore.value) return
  historyLoading.value = true
  const previousHeight = el.scrollHeight
  const previousTop = el.scrollTop
  try {
    const older = filterLocallyClearedMessages(conversationId.value, await fetchMessages(conversationId.value, myUserId.value || 'me', {
      before: oldest.createdAt,
      limit: HISTORY_PAGE_SIZE,
    }))
    const existingIds = new Set(messages.value.map((msg) => msg.id))
    const unique = older.filter((msg) => !existingIds.has(msg.id)).map((msg) => ({ ...msg, mine: isMine(msg) }))
    historyHasMore.value = older.length >= HISTORY_PAGE_SIZE
    if (unique.length) {
      messages.value = [...unique, ...messages.value]
      prefetchVoiceMessages(unique)
      await nextTick()
      el.scrollTop = el.scrollHeight - previousHeight + previousTop
    }
  } catch {
    showToast('历史消息加载失败')
  } finally {
    historyLoading.value = false
  }
}

function onMessageContentLoad() {
  if (stickToBottom && !isLocateScrollActive()) scrollToBottom(false)
}

function jumpToLatest() {
  scrollToBottom(true, true)
}

function goBack() {
  dismissChatKeyboard()
  smartBack(router)
}

async function openHeaderUnread() {
  const summary = inbox.unreadNavigationSummary()
  if (!summary.count) return

  // 未读来自多个会话或多个群成员时，回到消息首页统一处理。
  if (!summary.directConversationId) {
    await router.replace('/app/messages')
    return
  }

  const targetId = summary.directConversationId
  if (targetId === conversationId.value) {
    inbox.clearConversationUnread(targetId)
    markReadNow(true)
    scrollToBottom()
    return
  }

  try {
    const target = (await fetchConversations('all')).find((item) => item.id === targetId)
    if (!target) {
      await router.replace('/app/messages')
      return
    }
    inbox.clearConversationUnread(targetId)
    await router.push({
      path: `/chat/${target.id}`,
      query: {
        title: target.name,
        peerUserId: target.peerUserId || '',
        avatar: target.avatar || '',
        online: target.online ? 'true' : 'false',
        onlineHidden: target.onlineHidden ? '1' : '',
        type: target.type,
        mentionUnread: target.mentionUnread ? '1' : '',
        tag: target.tag || '',
        fileTransferAssistant: target.fileTransferAssistant ? '1' : '',
      },
    })
  } catch {
    await router.replace('/app/messages')
  }
}

function openPeerProfile() {
  if (isGroup.value) {
    router.push({
      path: `/group/${conversationId.value}`,
      query: { title: peerTitle.value },
    })
    return
  }
  if (!peerUserId.value) {
    showToast('暂无好友资料')
    return
  }
  router.push(`/contacts/${peerUserId.value}`)
}

function openChatSettings() {
  if (isGroup.value) {
    openPeerProfile()
    return
  }
  router.push({
    path: `/chat/${conversationId.value}/settings`,
    query: {
      title: peerTitle.value,
      type: 'personal',
      peerUserId: peerUserId.value,
      avatar: peerAvatar.value,
      fileTransferAssistant: isFileTransferAssistant.value ? '1' : '',
    },
  })
}

function scrollToHighlight() {
  const id = route.query.highlightMsgId as string
  if (!id || highlightUnavailable.value) return
  // 搜索/收藏/存储页进入聊天时，目标消息通常不在首屏缓存里；统一走
  // 带历史补拉的定位流程，避免只在当前 DOM 查找后误报“当前列表不存在”。
  void scrollToMessageWithHistory(id)
}

function findMessageRow(list: HTMLElement, id: string): HTMLElement | null {
  const rows = list.querySelectorAll<HTMLElement>('[data-msg-id]')
  for (const row of rows) {
    if (row.dataset.msgId === id) return row
  }
  return null
}

let highlightClearTimer: ReturnType<typeof setTimeout> | null = null

async function scrollToMessageWithHistory(id: string) {
  if (!id || !listRef.value) return
  locateScrollSuppressedUntil = Date.now() + 1200
  if (scrollSettleTimer) {
    clearTimeout(scrollSettleTimer)
    scrollSettleTimer = null
  }
  stickToBottom = false
  await nextTick()
  let list = listRef.value
  const loadedTarget = messages.value.find((message) => message.id === id)
  if (loadedTarget?.recalled) {
    showToast('原消息已不存在')
    return
  }
  let row = list ? findMessageRow(list, id) : null
  let originalUnavailable = false

  if (!row) {
    historyLoading.value = true
    try {
      const target = await fetchMessage(conversationId.value, id, myUserId.value || 'me')
      if (target.recalled) {
        originalUnavailable = true
        showToast('原消息已不存在')
        return
      }
      const anchorTime = target.createdAt
      const [older, newer] = anchorTime
        ? await Promise.all([
            fetchMessages(conversationId.value, myUserId.value || 'me', {
              before: anchorTime,
              limit: HISTORY_PAGE_SIZE,
            }),
            fetchMessages(conversationId.value, myUserId.value || 'me', {
              after: anchorTime,
              limit: HISTORY_PAGE_SIZE,
            }),
          ])
        : [[], []]
      const unique = new Map<string, ChatMessage>()
      ;[...older, target, ...newer].forEach((message) => unique.set(message.id, message))
      messages.value = filterLocallyClearedMessages(conversationId.value, [...unique.values()])
        .sort((left, right) => new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime())
        .map((message) => ({ ...message, mine: isMine(message) }))
      showingLocatedWindow.value = true
      historyHasMore.value = older.length >= HISTORY_PAGE_SIZE
      prefetchVoiceMessages(messages.value)
      await nextTick()
      list = listRef.value
      row = list ? findMessageRow(list, id) : null
    } catch {
      originalUnavailable = true
      row = null
    } finally {
      historyLoading.value = false
    }
  }

  if (!row || !list) {
    showToast(originalUnavailable ? '原消息已不存在' : '原消息不在当前列表')
    return
  }

  const focus =
    (row.querySelector('.msg-image, .msg-video-wrap, .bubble, .recall-tip') as HTMLElement | null) ||
    row
  const listRect = list.getBoundingClientRect()
  const focusRect = focus.getBoundingClientRect()
  const delta = focusRect.top + focusRect.height / 2 - (listRect.top + listRect.height / 2)
  list.scrollBy({ top: delta, behavior: 'smooth' })
  list.querySelectorAll('.message-row.highlight').forEach((el) => el.classList.remove('highlight'))
  if (highlightClearTimer) {
    clearTimeout(highlightClearTimer)
    highlightClearTimer = null
  }
  row.classList.add('highlight')
  highlightClearTimer = setTimeout(() => {
    row?.classList.remove('highlight')
    highlightClearTimer = null
  }, 1800)

  // The highlight is a one-shot navigation command. Removing it from this
  // chat history entry prevents remounting ChatView after Settings from
  // interpreting the old favorite/search link as a fresh locate request.
  if (String(route.query.highlightMsgId || '') === id) {
    const query = { ...route.query }
    delete query.highlightMsgId
    void router.replace({ path: route.path, query })
  }
}

function scrollToMessage(id: string) {
  if (!id || !listRef.value) return
  stickToBottom = false
  const target = messages.value.find((message) => message.id === id)
  if (target?.recalled) {
    showToast('原消息已不存在')
    return
  }
  nextTick(() => {
    const list = listRef.value
    if (!list) return
    const row = findMessageRow(list, id)
    if (!row) {
      showToast('原消息不在当前列表')
      return
    }
    // 以气泡/图片本身居中，避免整行（含头像、昵称）导致高亮框视觉偏移
    const focus =
      (row.querySelector('.msg-image, .msg-video-wrap, .bubble, .recall-tip') as HTMLElement | null) ||
      row
    const listRect = list.getBoundingClientRect()
    const focusRect = focus.getBoundingClientRect()
    const delta = focusRect.top + focusRect.height / 2 - (listRect.top + listRect.height / 2)
    list.scrollBy({ top: delta, behavior: 'smooth' })

    list.querySelectorAll('.message-row.highlight').forEach((el) => el.classList.remove('highlight'))
    if (highlightClearTimer) {
      clearTimeout(highlightClearTimer)
      highlightClearTimer = null
    }
    row.classList.add('highlight')
    highlightClearTimer = setTimeout(() => {
      row.classList.remove('highlight')
      highlightClearTimer = null
    }, 1800)
  })
}

function clearLongPress() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

let bubbleTouchStartY = 0
let bubbleTouchStartX = 0
let bubbleTouchMoved = false
const swipingMessageId = ref('')
const swipeReplyOffset = ref(0)
let bubblePressAt = 0
let bubbleLongPressOpened = false

function clearTextSelection() {
  try {
    window.getSelection()?.removeAllRanges()
  } catch {
    // ignore
  }
}

function onBubblePressStart(msg: ChatMessage, e?: TouchEvent | MouseEvent) {
  if (msg.recalled || multiMode.value) return
  bubbleTouchMoved = false
  bubbleLongPressOpened = false
  bubblePressAt = Date.now()
  if (e && 'touches' in e) {
    // 不能 preventDefault：否则 iOS 会吞掉后续 click，语音/图片点不开
    bubbleTouchStartY = e.touches[0]?.clientY ?? 0
    bubbleTouchStartX = e.touches[0]?.clientX ?? 0
    swipingMessageId.value = msg.id
    swipeReplyOffset.value = 0
    clearTextSelection()
  }
  clearLongPress()
  longPressTimer = setTimeout(() => {
    longPressTimer = null
    if (bubbleTouchMoved) return
    bubbleLongPressOpened = true
    clearTextSelection()
    activeMsg.value = msg
    msgActionsFromPreview.value = false
    showMsgSheet.value = true
    try {
      navigator.vibrate?.(12)
    } catch {
      // ignore
    }
  }, 420)
}

function onBubblePressEnd(msg?: ChatMessage) {
  clearLongPress()
  const offset = swipeReplyOffset.value
  if (
    msg &&
    !msg.recalled &&
    !multiMode.value &&
    (isMine(msg) ? offset <= -56 : offset >= 56)
  ) {
    replyTarget.value = msg
    try {
      navigator.vibrate?.(8)
    } catch {
      // ignore
    }
    void nextTick(() => composerRef.value?.focus())
  }
  swipeReplyOffset.value = 0
  window.setTimeout(() => {
    swipingMessageId.value = ''
  }, 180)
}

function onBubbleTouchMove(msg: ChatMessage, e: TouchEvent) {
  const x = e.touches[0]?.clientX ?? bubbleTouchStartX
  const y = e.touches[0]?.clientY ?? bubbleTouchStartY
  const dx = x - bubbleTouchStartX
  const dy = y - bubbleTouchStartY
  if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
    bubbleTouchMoved = true
    clearLongPress()
  }
  // 别人发的消息：右滑快速引用；自己发的消息保持原左滑
  if (isMine(msg)) {
    if (dx < 0 && Math.abs(dx) > Math.abs(dy) * 1.25) {
      e.preventDefault()
      swipeReplyOffset.value = Math.max(-72, dx * 0.72)
    }
  } else if (dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.25) {
    e.preventDefault()
    swipeReplyOffset.value = Math.min(72, dx * 0.72)
  }
}

function onBubbleContextMenu(msg: ChatMessage, e: Event) {
  e.preventDefault()
  e.stopPropagation()
  if (msg.recalled || multiMode.value) return
  openMessageActions(msg)
}

function openMessageActions(msg: ChatMessage) {
  if (msg.recalled || multiMode.value) return
  clearTextSelection()
  activeMsg.value = msg
  msgActionsFromPreview.value = false
  showMsgSheet.value = true
}

function onMsgAction(action: { name: string }) {
  showMsgSheet.value = false
  const fromPreview = msgActionsFromPreview.value
  msgActionsFromPreview.value = false
  mediaPreviewMenuOpen.value = false
  const msg = activeMsg.value
  activeMsg.value = null
  if (!msg) return
  if (fromPreview) {
    // 预览中长按弹出的菜单：执行操作前关闭全屏预览（不走 history.back()，
    // 避免 WebView 把它当成系统返回键退回消息列表页）。
    if (imagePreviewMsg) closeImagePreview()
    if (videoPlayerMsg) closeVideoPlayer()
  }
  if (
    ['保存到相册', '编辑图片', '复制', '复制文件名', '转发'].includes(action.name) &&
    blockBurnExport(msg)
  ) return
  switch (action.name) {
    case '保存到相册':
      void doSaveMedia(msg)
      break
    case '编辑图片':
      void openImageEditor(msg)
      break
    case '定位到原消息':
      void locateMessageInCurrentChat(msg)
      break
    case '复制':
    case '复制文件名':
      void doCopy(msg)
      break
    case '转发':
      selectedIds.value = new Set([msg.id])
      void openForwardPicker()
      break
    case '删除':
      void doDelete([msg.id])
      break
    case '多选':
      enterMultiMode(msg.id)
      break
    case '引用':
      replyTarget.value = msg
      break
    case '撤回':
      void doRecall(msg)
      break
  }
}

async function locateMessageInCurrentChat(msg: ChatMessage) {
  const target = await fetchLocatableMessage(conversationId.value, msg.id, myUserId.value || 'me')
  if (!target) {
    showToast('原消息已不存在')
    return
  }
  scrollToMessage(target.id)
}

async function onQuoteClick(msg: ChatMessage) {
  if (multiMode.value) return
  clearLongPress()
  const targetId = String(msg.replyToMsgId || '').trim()
  if (!targetId) {
    showToast('原消息已不存在')
    return
  }
  await scrollToMessageWithHistory(targetId)
}

function onMessageSheetClosed() {
  // Cancel/overlay taps close Vant's sheet without going through
  // onMsgAction. Clear only the menu state; the media preview stays open.
  if (!msgActionsFromPreview.value) return
  msgActionsFromPreview.value = false
  mediaPreviewMenuOpen.value = false
  activeMsg.value = null
}

function canSaveMsgMedia(msg: ChatMessage): boolean {
  if (msg.msgType === 1) return !!imageUrlOf(msg)
  if (msg.msgType !== 2) return false
  const f = fileOf(msg)
  return !!f?.url && isVideoMedia(f.contentType, f.url || f.name)
}

async function doSaveMedia(msg: ChatMessage, preferredUrl = '') {
  if (blockBurnExport(msg)) return
  let url = ''
  let filename = ''
  let mimeType = ''
  if (msg.msgType === 1) {
    const f = parseFilePayload(msg.content)
    url = preferredUrl || imageOriginalUrlOf(msg) || imageUrlOf(msg)
    mimeType = f?.contentType || ''
    filename = `pulse_image_${Date.now()}`
  } else if (msg.msgType === 2) {
    const f = fileOf(msg)
    if (!f?.url || !isVideoMedia(f.contentType, f.url || f.name)) {
      showToast('仅支持保存图片或视频')
      return
    }
    url = preferredUrl || videoOriginalUrlOf(msg) || resolveFileUrl(f.url)
    filename = f.name || `pulse_video_${Date.now()}.mp4`
    mimeType = f.contentType || ''
  }
  if (!url) {
    showToast('无法保存')
    return
  }
  showLoadingToast({ message: '保存中...', forbidClick: true, duration: 0 })
  try {
    const result = await saveMediaToDevice(url, {
      filename,
      ...(mimeType ? { mimeType } : {}),
    })
    closeToast()
    const tip = toastForSaveResult(result)
    if (tip) showToast(tip)
  } catch (e) {
    closeToast()
    showToast(e instanceof Error ? e.message : '保存失败')
  }
}

let mediaLongPressTimer: ReturnType<typeof setTimeout> | null = null
let mediaLongPressStartX = 0
let mediaLongPressStartY = 0
let mediaLongPressTriggered = false

function clearMediaLongPress() {
  if (mediaLongPressTimer) {
    clearTimeout(mediaLongPressTimer)
    mediaLongPressTimer = null
  }
}

function startMediaLongPress(e: TouchEvent, save: () => void) {
  clearMediaLongPress()
  mediaLongPressTriggered = false
  const touch = e.touches[0]
  mediaLongPressStartX = touch?.clientX ?? 0
  mediaLongPressStartY = touch?.clientY ?? 0
  mediaLongPressTimer = setTimeout(() => {
    mediaLongPressTimer = null
    mediaLongPressTriggered = true
    window.setTimeout(() => {
      mediaLongPressTriggered = false
    }, 1000)
    try {
      navigator.vibrate?.(12)
    } catch {
      // ignore
    }
    save()
  }, 520)
}

function moveMediaLongPress(e: TouchEvent) {
  const touch = e.touches[0]
  if (!touch) return
  if (
    Math.abs(touch.clientX - mediaLongPressStartX) > 18 ||
    Math.abs(touch.clientY - mediaLongPressStartY) > 18
  ) {
    clearMediaLongPress()
  }
}

function endMediaLongPress() {
  clearMediaLongPress()
}

function onInlineMediaClick(msg: ChatMessage) {
  if (mediaLongPressTriggered) {
    mediaLongPressTriggered = false
    return
  }
  if (msg.msgType === 1) openImagePreview(msg)
  else openVideoPlayer(msg)
}

function onInlineMediaLongPressStart(msg: ChatMessage, e: TouchEvent) {
  startMediaLongPress(e, () => openMessageActions(msg))
}

function onInlineMediaContextMenu(msg: ChatMessage, e: Event) {
  e.preventDefault()
  e.stopPropagation()
  clearMediaLongPress()
  openMessageActions(msg)
}

function enterMultiMode(firstId?: string) {
  multiMode.value = true
  selectedIds.value = firstId ? new Set([firstId]) : new Set()
  replyTarget.value = null
}

function exitMultiMode() {
  multiMode.value = false
  selectedIds.value = new Set()
}

function toggleSelect(id: string) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function isSelected(id: string) {
  return selectedIds.value.has(id)
}

function canToggleMultiSelect(msg: ChatMessage) {
  return multiMode.value && !msg.recalled && (!isSystemTip(msg) || isCallRecord(msg))
}

/** 多选：整行可点（含气泡附近），避免只能点小选框 */
let multiSelectByTouchAt = 0
let multiRowTouchMsgId = ''
let multiRowTouchY = 0
let multiRowTouchMoved = false

function onMultiRowTouchStart(msg: ChatMessage, e: TouchEvent) {
  if (!canToggleMultiSelect(msg)) return
  multiRowTouchMsgId = msg.id
  multiRowTouchY = e.touches[0]?.clientY ?? 0
  multiRowTouchMoved = false
}

function onMultiRowTouchMove(e: TouchEvent) {
  if (!multiMode.value || !multiRowTouchMsgId) return
  const y = e.touches[0]?.clientY ?? multiRowTouchY
  if (Math.abs(y - multiRowTouchY) > 10) multiRowTouchMoved = true
}

function onMultiRowTouchEnd(msg: ChatMessage) {
  if (!canToggleMultiSelect(msg)) return
  if (multiRowTouchMsgId !== msg.id || multiRowTouchMoved) {
    multiRowTouchMsgId = ''
    return
  }
  multiRowTouchMsgId = ''
  multiSelectByTouchAt = Date.now()
  toggleSelect(msg.id)
}

function onMultiRowClickCapture(msg: ChatMessage, e: MouseEvent) {
  if (!canToggleMultiSelect(msg)) return
  // 拦截子元素 click（预览/播放等），改为选中
  e.preventDefault()
  e.stopPropagation()
  if (Date.now() - multiSelectByTouchAt < 450) return
  toggleSelect(msg.id)
}

async function doCopy(msg: ChatMessage) {
  if (blockBurnExport(msg)) return
  const text = copyableText(msg)
  if (!text) {
    showToast('无可复制内容')
    return
  }
  try {
    if (isNativeApp) {
      await nativeClipboard.writeText(text)
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      const copyArea = document.createElement('textarea')
      copyArea.value = text
      copyArea.style.position = 'fixed'
      copyArea.style.opacity = '0'
      document.body.appendChild(copyArea)
      copyArea.select()
      const copied = document.execCommand('copy')
      copyArea.remove()
      if (!copied) throw new Error('clipboard unavailable')
    }
    showToast('已复制')
  } catch {
    showToast('复制失败')
  }
}

function doDelete(ids: string[]) {
  if (!ids.length) {
    showToast('请选择消息')
    return
  }
  pendingDeleteIds.value = [...ids]
  showDeleteModeSheet.value = true
}

async function confirmDeleteMode(mode: 'self' | 'both') {
  const ids = [...pendingDeleteIds.value]
  showDeleteModeSheet.value = false
  if (!ids.length) return
  const both = mode === 'both'
  const bothTip = isGroup.value ? '删除后所有成员不可见。' : '删除后双方都不可见。'
  try {
    await showConfirmDialog({
      title: both ? '确认双向删除' : '确认单向删除',
      message: both
        ? (ids.length > 1 ? `确定双向删除选中的 ${ids.length} 条消息吗？${bothTip}` : `确定双向删除该消息吗？${bothTip}`)
        : (ids.length > 1 ? `确定删除选中的 ${ids.length} 条消息吗？仅自己不可见。` : '确定删除该消息吗？仅自己不可见。'),
      confirmButtonText: '确认删除',
    })
  } catch {
    return
  }
  try {
    await deleteMessages(conversationId.value, ids, mode)
    const idSet = new Set(ids)
    const latestBefore = messages.value[messages.value.length - 1]
    messages.value = messages.value.filter((m) => !idSet.has(m.id))
    syncConversationPreviewFromMessages()
    if (latestBefore?.burnAfterRead && idSet.has(latestBefore.id)) {
      inbox.notifyBurnExpired(conversationId.value)
    }
    if (replyTarget.value && idSet.has(replyTarget.value.id)) clearReply()
    exitMultiMode()
    pendingDeleteIds.value = []
    showToast(both ? '已双向删除' : '已单向删除')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '删除失败')
  }
}

async function openForwardPicker() {
  if (!selectedIds.value.size) {
    showToast('请选择消息')
    return
  }
  if (messages.value.some((msg) => selectedIds.value.has(msg.id) && isBurnMessage(msg))) {
    showToast('阅后即焚消息禁止转发')
    return
  }
  forwardSelectedIds.value = new Set()
  forwardMode.value = selectedIds.value.size > 1 ? 'merge' : 'separate'
  forwardLoading.value = true
  showForwardSheet.value = true
  try {
    const list = await fetchConversations('all')
    forwardTargets.value = list.filter((c) => c.id !== conversationId.value)
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
  const targetIds = [...forwardSelectedIds.value]
  if (!targetIds.length) {
    showToast('请选择转发目标')
    return
  }
  const msgIds = [...selectedIds.value]
  const names = forwardTargets.value
    .filter((c) => forwardSelectedIds.value.has(c.id))
    .map((c) => c.name)
  const nameText =
    names.length <= 2 ? names.join('、') : `${names.slice(0, 2).join('、')}等${names.length}个会话`
  try {
    await showConfirmDialog({
      title: '确认转发',
      message: `将 ${msgIds.length} 条消息转发到「${nameText}」？`,
      confirmButtonText: '转发',
    })
  } catch {
    return
  }
  forwarding.value = true
  try {
    const count = await forwardMessages(conversationId.value, targetIds, msgIds, forwardMode.value)
    showForwardSheet.value = false
    forwardSelectedIds.value = new Set()
    exitMultiMode()
    const preview =
      msgIds.length > 1 && forwardMode.value === 'merge'
        ? '[聊天记录]'
        : msgLabel(messages.value.find((m) => m.id === msgIds[0]) || messages.value[0])
    targetIds.forEach((id) => inbox.notifyLocalMessage(id, preview || '[转发消息]'))
    showToast(`已转发至 ${targetIds.length} 个会话（${count} 条）`)
  } catch (e) {
    showToast(e instanceof Error ? e.message : '转发失败')
  } finally {
    forwarding.value = false
  }
}

function clearReply() {
  replyTarget.value = null
}

function replyPreview(msg: ChatMessage): string {
  if (msg.recalled) return '该消息已撤回'
  return msgLabel(msg)
}

function replyQuoteType(msg: {
  replyToMsgId?: string
  replyToMsgType?: number
  replyToContent?: string
  replyToRecalled?: boolean
}): number {
  if (msg.replyToRecalled) return -1
  if (msg.replyToMsgType != null) {
    const explicitType = Number(msg.replyToMsgType)
    if (Number.isInteger(explicitType) && explicitType >= 0 && explicitType <= 10) return explicitType
  }
  const target = msg.replyToMsgId
    ? messages.value.find((item) => item.id === msg.replyToMsgId)
    : null
  const targetType = Number(target?.msgType || 0)
  if (targetType > 0) return targetType
  const c = msg.replyToContent || ''
  const file = parseFilePayload(c)
  const contentType = String(file?.contentType || '').toLowerCase()
  const fileUrl = String(file?.url || file?.name || '')
  if (contentType.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif)(\?|$)/i.test(fileUrl)) return 1
  if (contentType.startsWith('video/') || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(fileUrl)) return 2
  if (c === '[图片]') return 1
  if (c.startsWith('[文件]') || c.startsWith('[视频]')) return 2
  if (c.startsWith('[语音]')) return 3
  return 0
}

function replyQuoteImageUrl(content?: string): string {
  const f = parseFilePayload(content)
  // Protected fileId media must be rendered from the hydrated local cache;
  // a reply preview has no authenticated <img>/<video> fallback of its own.
  if (f?.fileId) return ''
  const raw =
    f?.url ||
    (content && (content.startsWith('http') || content.startsWith('/') || content.startsWith('data:'))
      ? content
      : '')
  return raw ? resolveFileUrl(raw) : ''
}

function replyQuoteMediaUrl(message: Pick<ChatMessage, 'replyToMsgId' | 'replyToContent'>): string {
  const target = message.replyToMsgId
    ? messages.value.find((item) => item.id === message.replyToMsgId)
    : undefined
  if (target?.msgType === 1) return imageUrlOf(target)
  if (target?.msgType === 2 && isVideoMsg(target)) return videoThumbUrlOf(target)
  return replyQuoteImageUrl(message.replyToContent)
}

function replyQuoteIsVideo(content?: string): boolean {
  const f = parseFilePayload(content)
  if (!f) return false
  if (f.contentType?.startsWith('video/')) return true
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(f.url || f.name || '')
}

function replyQuoteLabel(msg: {
  replyToMsgType?: number
  replyToContent?: string
  replyToRecalled?: boolean
}): string {
  if (msg.replyToRecalled) return '该消息已撤回'
  const t = replyQuoteType(msg)
  const c = msg.replyToContent || ''
  const file = parseFilePayload(c)
  // 红包 / 转账：内容为 JSON，转成友好文案，避免引用气泡里出现原始 JSON
  if (t === 7 || t === 8 || (c.startsWith('{') && !file)) {
    const label = formatBusinessPreview(c)
    if (label && label !== c) return label
    return t === 7 ? '[红包]' : t === 8 ? '[转账]' : c
  }
  // 旧消息：replyToContent 本身就是预览文案
  if (
    t === 0 &&
    (c === '[图片]' ||
      c.startsWith('[文件]') ||
      c.startsWith('[视频]') ||
      c.startsWith('[语音]') ||
      c.startsWith('[聊天') ||
      c.startsWith('[名片') ||
      c.startsWith('[群'))
  ) {
    return c
  }
  return favoritePreviewLabel(t as MsgType, c)
}

async function doRecall(msg: ChatMessage) {
  if (!canRecallMessage(msg)) {
    showToast('超过2分钟无法撤回')
    return
  }
  try {
    const saved = await recallMessage(conversationId.value, msg.id)
    applyRecall(saved.id || msg.id, conversationId.value)
    if (replyTarget.value?.id === msg.id) clearReply()
    syncConversationPreviewFromMessages()
    showToast('已撤回')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '撤回失败')
  }
}

async function sendMessage() {
  const text = inputText.value.trim()
  if (!text) return
  if (!canChat.value) {
    showToast(chatBlockTip.value || '无法发送消息')
    return
  }
  const keepKeyboardOpen = consumeSendKeyboardState()

  showEmojiPanel.value = false
  stopTypingStatus()
  const reply = replyTarget.value
  const mentionPayload = isGroup.value ? resolveOutgoingMentions(text) : { mentionUserIds: [], atAll: false }
  const clientMsgId = `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const optimistic: ChatMessage = {
    id: clientMsgId,
    conversationId: conversationId.value,
    fromUserId: myUserId.value,
    fromNickname: userStore.nickname || '我',
    fromAvatarUrl: userStore.avatar || '',
    toUserId: peerUserId.value,
    content: text,
    msgType: 0,
    clientMsgId,
    createdAt: new Date().toISOString(),
    mine: true,
    replyToMsgId: reply?.id,
    replyToContent: reply?.content,
    replyToMsgType: reply?.msgType,
    replyToNickname: reply ? senderName(reply) : undefined,
    replyToRecalled: reply?.recalled,
    mentionUserIds: mentionPayload.mentionUserIds,
    atAll: mentionPayload.atAll,
  }
  messages.value.push(optimistic)
  inputText.value = ''
  replyTarget.value = null
  clearPendingMentions()
  restoreComposerFocusAfterSend(keepKeyboardOpen)
  scrollToBottom()
  inbox.notifyLocalMessage(conversationId.value, text, 0)

  try {
    const saved = await sendTextMessage({
      conversationId: conversationId.value,
      toUserId: peerUserId.value || undefined,
      content: text,
      clientMsgId,
      replyToMsgId: reply?.id,
      mentionUserIds: mentionPayload.mentionUserIds,
      atAll: mentionPayload.atAll,
    })
    const idx = messages.value.findIndex((m) => m.clientMsgId === clientMsgId)
    if (idx >= 0) {
      messages.value[idx] = {
        ...saved,
        ...outgoingRetention(saved, messages.value[idx]),
        fromUserId: myUserId.value || saved.fromUserId,
        fromNickname: saved.fromNickname || userStore.nickname || '我',
        fromAvatarUrl: saved.fromAvatarUrl || userStore.avatar || '',
        mine: true,
      }
      void hydrateAttachment(messages.value[idx])
    }
  } catch (e) {
    const tip = e instanceof Error ? e.message : '发送失败，请重试'
    showToast(tip)
    const idx = messages.value.findIndex((m) => m.clientMsgId === clientMsgId)
    if (idx >= 0) messages.value.splice(idx, 1)
    // 违禁/发送失败：提示后保持输入框清空，不回填原文
    inputText.value = ''
    if (isGroup.value && /禁言|@全体/.test(tip)) {
      void refreshGroupMuteState()
    }
  }
}

function onPlusClick() {
  if (!canChat.value) {
    showToast(chatBlockTip.value || '无法发送消息')
    return
  }
  showEmojiPanel.value = false
  showPlusSheet.value = true
  plusPage.value = 0
  void nextTick(() => plusScroller.value?.scrollTo({ left: 0, behavior: 'auto' }))
}

function toggleEmojiPanel() {
  if (!canChat.value) {
    showToast(chatBlockTip.value || '无法发送消息')
    return
  }
  showPlusSheet.value = false
  voiceMode.value = false
  showEmojiPanel.value = !showEmojiPanel.value
}

function insertEmoji(emoji: string) {
  inputText.value += emoji
}

function toggleVoiceMode() {
  if (!canChat.value) {
    showToast(chatBlockTip.value || '无法发送消息')
    return
  }
  showEmojiPanel.value = false
  showPlusSheet.value = false
  voiceMode.value = !voiceMode.value
  void warmVoiceAudio()
}

function stopVoicePlayback() {
  playToken += 1
  releasePlayingVoiceCache()
  stopCachedVoice()
  playingVoiceId.value = ''
  voiceLoadingId.value = ''
}

function prefetchVoiceMessages(list: ChatMessage[]) {
  for (const m of list) {
    if (m.msgType !== 3 || m.recalled) continue
    const f = parseFilePayload(m.content)
    if (f?.url) {
      prefetchVoice(f.url)
      if (f.fileId) {
        void cacheChatFile('audio', f.fileId, 'original', resolveFileUrl(f.url))
          .catch(() => undefined)
      }
    }
  }
}

function clearRecordTimers() {
  if (recordTimer) {
    clearInterval(recordTimer)
    recordTimer = null
  }
  if (recordMaxTimer) {
    clearTimeout(recordMaxTimer)
    recordMaxTimer = null
  }
}

function releaseMediaStream() {
  mediaStream?.getTracks().forEach((t) => t.stop())
  mediaStream = null
  mediaRecorder = null
  recordChunks = []
}

async function abortVoiceRecord() {
  recordSession += 1
  clearRecordTimers()
  recording.value = false
  recordCancel.value = false
  recordSeconds.value = 0
  finishingRecord = false
  try {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.onstop = null
      mediaRecorder.stop()
    }
  } catch {
    /* ignore */
  }
  releaseMediaStream()
  void resetVoiceAudioSession()
}

async function startVoiceRecord(e: TouchEvent | MouseEvent) {
  if (!canChat.value || recording.value || uploading.value || finishingRecord) return
  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    showToast('当前环境不支持录音')
    return
  }
  if (!window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
    showToast('请用 HTTPS 访问才能录音（手机浏览器限制）')
    return
  }

  const pointY =
    'touches' in e && e.touches[0]
      ? e.touches[0].clientY
      : 'clientY' in e
        ? e.clientY
        : 0
  recordStartY = pointY
  recordCancel.value = false
  recordSeconds.value = 0
  recordChunks = []
  const session = ++recordSession

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 48_000,
      },
    })
  } catch {
    showToast('无法使用麦克风，请检查权限')
    return
  }
  if (session !== recordSession) {
    releaseMediaStream()
    return
  }

  const mime = pickAudioRecorderMime()
  try {
    mediaRecorder = mime
      ? new MediaRecorder(mediaStream, { mimeType: mime, audioBitsPerSecond: 128_000 })
      : new MediaRecorder(mediaStream, { audioBitsPerSecond: 128_000 })
  } catch {
    releaseMediaStream()
    showToast('录音初始化失败')
    return
  }

  mediaRecorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) recordChunks.push(ev.data)
  }
  mediaRecorder.start(200)
  recordStartedAt = Date.now()
  recording.value = true
  recordTimer = setInterval(() => {
    recordSeconds.value = Math.floor((Date.now() - recordStartedAt) / 1000)
  }, 200)
  recordMaxTimer = setTimeout(() => {
    void finishVoiceRecord(true)
  }, 60000)
}

function onVoicePressMove(e: TouchEvent) {
  if (!recording.value) return
  const y = e.touches[0]?.clientY ?? recordStartY
  recordCancel.value = recordStartY - y > 60
}

async function finishVoiceRecord(shouldSend: boolean) {
  recordSession += 1
  if (!recording.value || finishingRecord) {
    // 权限弹窗期间已松开：丢弃迟到的录音
    if (!recording.value && mediaStream) releaseMediaStream()
    return
  }
  finishingRecord = true
  clearRecordTimers()
  const cancelled = recordCancel.value || !shouldSend
  const durationMs = Date.now() - recordStartedAt
  const mimeType = mediaRecorder?.mimeType || 'audio/webm'
  recording.value = false

  const blob: Blob | null = await new Promise((resolve) => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      resolve(recordChunks.length ? new Blob(recordChunks, { type: mimeType }) : null)
      return
    }
    mediaRecorder.onstop = () => {
      resolve(recordChunks.length ? new Blob(recordChunks, { type: mimeType }) : null)
    }
    try {
      mediaRecorder.stop()
    } catch {
      resolve(null)
    }
  })
  releaseMediaStream()
  // 录音占用麦克风后，移动端播放常会静音，需重置音频会话
  void resetVoiceAudioSession()
  recordCancel.value = false
  recordSeconds.value = 0
  finishingRecord = false

  if (cancelled) {
    showToast('已取消')
    return
  }
  if (!blob || blob.size < 200 || durationMs < 700) {
    showToast('说话时间太短')
    return
  }
  await sendVoiceBlob(blob, mimeType, durationMs)
}

async function sendVoiceBlob(
  blob: Blob,
  mimeType: string,
  durationMs: number,
) {
  if (!canChat.value) {
    showToast(chatBlockTip.value || '无法发送消息')
    return
  }
  const baseMime = mimeType.split(';')[0] || 'audio/webm'
  const ext = baseMime.includes('mp4')
    ? 'm4a'
    : baseMime.includes('ogg')
      ? 'ogg'
      : 'webm'
  const file = new File([blob], `voice_${Date.now()}.${ext}`, { type: baseMime })
  uploading.value = true
  showLoadingToast({ message: '发送语音...', forbidClick: true, duration: 0 })
  try {
    const uploaded = await uploadChatFileWithTimeout(file, { durationMs })
    cacheVoiceBlob(uploaded.url, blob)
     const payload = JSON.stringify({
       fileId: uploaded.fileId,
       objectKey: uploaded.objectKey,
       url: uploaded.url,
      name: uploaded.name,
      size: uploaded.size,
      contentType: uploaded.contentType || baseMime,
       durationMs,
    })
     await sendTypedMessage(payload, 3, uploaded.fileId)
  } catch (err) {
    showToast(err instanceof Error ? err.message : '语音发送失败')
  } finally {
    closeToast()
    uploading.value = false
  }
}

function onVoicePressStart(e: TouchEvent | MouseEvent) {
  if ('button' in e && e.button !== 0) return
  void startVoiceRecord(e)
}

function onVoicePressEnd() {
  void finishVoiceRecord(true)
}

function voiceOf(msg: ChatMessage) {
  return msg.msgType === 3 ? parseFilePayload(msg.content) : null
}

let voiceTouchPlayedAt = 0
let playingVoiceCacheFileId = ''

function releasePlayingVoiceCache() {
  if (playingVoiceCacheFileId) {
    markChatCacheInUse(playingVoiceCacheFileId, 'original', false)
    playingVoiceCacheFileId = ''
  }
}

/** 语音气泡：用 touchend 触发播放，避免依赖被系统吞掉的 click */
function onVoiceBubbleTap(msg: ChatMessage, e: TouchEvent) {
  if (multiMode.value || bubbleTouchMoved || bubbleLongPressOpened) return
  if (Date.now() - bubblePressAt >= 400) return
  e.preventDefault()
  clearLongPress()
  voiceTouchPlayedAt = Date.now()
  void togglePlayVoice(msg)
}

function onVoiceBubbleClick(msg: ChatMessage) {
  // 触摸已处理则忽略兼容 click，避免播一下立刻被第二次 toggle 关掉
  if (Date.now() - voiceTouchPlayedAt < 700) return
  void togglePlayVoice(msg)
}

async function togglePlayVoice(msg: ChatMessage) {
  if (multiMode.value) return
  const f = voiceOf(msg)
  if (!f?.url) return
  if (playingVoiceId.value === msg.id) {
    stopVoicePlayback()
    return
  }

  const token = ++playToken
  releasePlayingVoiceCache()
  stopCachedVoice()
  playingVoiceId.value = ''
  voiceLoadingId.value = msg.id
  void warmVoiceAudio()

  const fileId = String(f.fileId || '').trim()
  if (fileId) {
    playingVoiceCacheFileId = fileId
    markChatCacheInUse(fileId, 'original', true)
  }
  let playUrl = f.url
  if (f.fileId) {
    try { playUrl = await cacheChatFile('audio', f.fileId, 'original', resolveFileUrl(f.url)) } catch { playUrl = f.url }
  }
  const ok = await playCachedVoice(playUrl, () => {
    if (playToken === token && playingVoiceId.value === msg.id) {
      playingVoiceId.value = ''
      releasePlayingVoiceCache()
    }
  })

  if (playToken !== token) {
    if (playingVoiceCacheFileId === fileId) releasePlayingVoiceCache()
    return
  }
  voiceLoadingId.value = ''
  if (!ok) {
    releasePlayingVoiceCache()
    playingVoiceId.value = ''
    showToast('播放失败')
    return
  }
  playingVoiceId.value = msg.id
}

const plusActions = computed(() => {
  const items = [
    { key: 'album' as const, label: '相册', icon: 'photo_library', enabled: true },
    { key: 'capture' as const, label: '拍摄', icon: 'photo_camera', enabled: true },
    { key: 'file' as const, label: '文件', icon: 'draft', enabled: true },
    { key: 'redpacket' as const, label: '红包', icon: 'redeem', enabled: true },
    { key: 'transfer' as const, label: '转账', icon: 'currency_yen', enabled: true },
    {
      key: 'call' as const,
      label: '语音通话',
      icon: 'call',
      enabled: !isFileTransferAssistant.value && (isGroup.value ? callableGroupMembers.value.length > 0 : !!peerUserId.value),
    },
    {
      key: 'videocall' as const,
      label: '视频通话',
      icon: 'video_call',
      enabled: !isFileTransferAssistant.value && (isGroup.value ? callableGroupMembers.value.length > 0 : !!peerUserId.value),
    },
  ] as const
  if (!isFileTransferAssistant.value) return items
  return items.filter((item) =>
    !['redpacket', 'transfer', 'call', 'videocall'].includes(item.key),
  )
})

const plusPages = computed(() => {
  const items = plusActions.value
  const pages = []
  for (let i = 0; i < items.length; i += 8) pages.push(items.slice(i, i + 8))
  return pages
})

function onPlusScroll(event: Event) {
  const el = event.currentTarget as HTMLElement
  if (!el.clientWidth) return
  plusPage.value = Math.max(0, Math.min(plusPages.value.length - 1, Math.round(el.scrollLeft / el.clientWidth)))
}

function startVoiceCall() {
  if (isFileTransferAssistant.value) {
    showToast('文件传输助手不支持通话')
    return
  }
  if (isGroup.value) {
    openGroupCallPicker('audio')
    return
  }
  if (!peerUserId.value) {
    showToast('无法发起通话')
    return
  }
  if (!canChat.value) {
    showToast(chatBlockTip.value || '无法发起通话')
    return
  }
  // iOS：轻量解锁后立刻 startOutgoing（先出通话层）；铃声在 uiState 之后同手势栈起播
  unlockCallRingtoneAudio()
  prepareCallRingtoneForMic()
  void voiceCall.startOutgoing(
    {
      userId: peerUserId.value,
      nickname: peerTitle.value,
      avatarUrl: peerAvatar.value,
      conversationId: conversationId.value,
    },
    'audio',
  )
}

/** 苹果：touchstart 更早进入手势 */
function onPlusTouchStart(key: string) {
  if (key !== 'call' && key !== 'videocall') return
  if (isFileTransferAssistant.value) return
  if (isGroup.value) return
  if (!peerUserId.value || !canChat.value) return
  // Only unlock inside the gesture. Starting ringback here makes Android play
  // before getUserMedia, so the permission/audio-route switch cuts its start.
  unlockCallRingtoneAudio()
}

function startVideoCall() {
  if (isFileTransferAssistant.value) {
    showToast('文件传输助手不支持通话')
    return
  }
  if (isGroup.value) {
    openGroupCallPicker('video')
    return
  }
  if (!peerUserId.value) {
    showToast('无法发起通话')
    return
  }
  if (!canChat.value) {
    showToast(chatBlockTip.value || '无法发起通话')
    return
  }
  unlockCallRingtoneAudio()
  prepareCallRingtoneForMic()
  void voiceCall.startOutgoing(
    {
      userId: peerUserId.value,
      nickname: peerTitle.value,
      avatarUrl: peerAvatar.value,
      conversationId: conversationId.value,
    },
    'video',
  )
}

function redialCallRecord(msg: ChatMessage) {
  if (multiMode.value) return
  const mediaType = callRecordMediaType(msg.content)
  if (mediaType === 'video') startVideoCall()
  else if (mediaType === 'audio') startVoiceCall()
}

let callLongPressSuppressUntil = 0

/** 通话记录：长按弹出删除/多选菜单，避免长按后松手误触发回拨 */
function onCallBubblePressStart(msg: ChatMessage, e: TouchEvent) {
  if (msg.recalled || multiMode.value) return
  bubbleTouchMoved = false
  bubbleLongPressOpened = false
  bubblePressAt = Date.now()
  if (e.touches[0]) {
    bubbleTouchStartX = e.touches[0].clientX
    bubbleTouchStartY = e.touches[0].clientY
  }
  clearLongPress()
  longPressTimer = setTimeout(() => {
    longPressTimer = null
    if (bubbleTouchMoved) return
    bubbleLongPressOpened = true
    callLongPressSuppressUntil = Date.now() + 700
    clearTextSelection()
    activeMsg.value = msg
    msgActionsFromPreview.value = false
    showMsgSheet.value = true
    try {
      navigator.vibrate?.(12)
    } catch {
      // ignore
    }
  }, 420)
}

function onCallBubbleTouchMove(e: TouchEvent) {
  const x = e.touches[0]?.clientX ?? bubbleTouchStartX
  const y = e.touches[0]?.clientY ?? bubbleTouchStartY
  if (Math.abs(x - bubbleTouchStartX) > 8 || Math.abs(y - bubbleTouchStartY) > 8) {
    bubbleTouchMoved = true
    clearLongPress()
  }
}

function onCallBubblePressEnd() {
  clearLongPress()
}

function onCallBubbleClick(msg: ChatMessage) {
  if (multiMode.value) return
  if (Date.now() < callLongPressSuppressUntil) return
  redialCallRecord(msg)
}

function onPlusAction(key: (typeof plusActions.value)[number]['key']) {
  const item = plusActions.value.find((a) => a.key === key)
  if (!item) return
  if (!item.enabled) {
    showToast('暂不可用')
    return
  }
  showPlusSheet.value = false
  if (key === 'album') void openAlbumFilePicker(mediaInputRef.value)
  else if (key === 'capture') void openHdCapture('photo')
  else if (key === 'file') fileInputRef.value?.click()
  else if (key === 'redpacket') void router.push({
    path: `/chat/${conversationId.value}/red-packet`,
    query: { ...route.query },
  })
  else if (key === 'transfer') void router.push({
    path: `/chat/${conversationId.value}/transfer`,
    query: { ...route.query },
  })
  else if (key === 'call') startVoiceCall()
  else if (key === 'videocall') startVideoCall()
}

/** 仅打开系统相册/文件选择，避免再带出「拍摄」（与 App 内超清拍摄重复） */
type FilePickerHandle = { getFile: () => Promise<File> }
type FilePickerWindow = Window & {
  showOpenFilePicker?: (options: {
    multiple?: boolean
    excludeAcceptAllOption?: boolean
    types?: Array<{
      description?: string
      accept: Record<string, string[]>
    }>
  }) => Promise<FilePickerHandle[]>
}

async function openAlbumFilePicker(input: HTMLInputElement | null) {
  if (isNativeApp) {
    try {
      mediaPickerFiles.value = []
      mediaPickerGalleryAssets.value = []
      mediaPickerGalleryOffset.value = 0
      mediaPickerGalleryHasMore.value = false
      mediaPickerInitialMode.value = 'grid'
      mediaPickerDirectSend.value = false
      mediaPickerEditIndex.value = null
      mediaPickerEditIndices.value = []
      // 先打开相册界面，再在后台读取首屏缩略图，避免用户等待原生缩略图生成。
      showMediaPicker.value = true
      await loadMediaGalleryPage(true)
      if (!mediaPickerGalleryAssets.value.length && showMediaPicker.value) {
        closeMediaPicker()
        showToast('手机相册中没有可用的图片或视频')
      }
      return
    } catch {
      // 原生端始终使用应用内相册；权限拒绝或读取失败时不再跳转到系统文件选择器。
      closeMediaPicker()
      showToast('无法读取手机相册，请允许照片和视频访问权限')
      return
    }
  }
  if (!input) return
  input.removeAttribute('capture')
  input.value = ''

  const picker = (window as FilePickerWindow).showOpenFilePicker
  if (typeof picker === 'function') {
    try {
      const handles = await picker({
        multiple: true,
        excludeAcceptAllOption: true,
        types: [
          {
            description: '图片和视频',
            accept: {
              'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif'],
              'video/*': ['.mp4', '.mov', '.webm', '.3gp', '.3gpp'],
            },
          },
        ],
      })
      const files = await Promise.all(handles.map((handle) => handle.getFile()))
      const selected = pickMixedMediaFiles(files)
      if (!selected.length) return
      openMediaPicker(selected)
      return
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      // Some embedded Android browsers expose the API but reject it at runtime.
    }
  }

  if (typeof input.showPicker === 'function') {
    input.showPicker()
    return
  }
  input.click()
}

function pickVideoRecorderMime(): string {
  const list = [
    'video/mp4;codecs=avc1.640028,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ]
  for (const m of list) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m
  }
  return 'video/webm'
}

/** 尽量申请机型支持的最高清晰度 */
async function openBestCameraStream(
  facing: 'environment' | 'user',
  withAudio: boolean,
): Promise<MediaStream> {
  // 先拿流再按 capabilities 拉满分辨率
  const base = await navigator.mediaDevices.getUserMedia({
    audio: withAudio
      ? { echoCancellation: true, noiseSuppression: true, channelCount: 2 }
      : false,
    video: {
      facingMode: { ideal: facing },
      width: { ideal: 3840 },
      height: { ideal: 2160 },
      frameRate: { ideal: 60 },
    },
  })
  const track = base.getVideoTracks()[0]
  if (!track) return base
  try {
    const caps = track.getCapabilities?.() as
      | (MediaTrackCapabilities & { width?: { max?: number }; height?: { max?: number }; frameRate?: { max?: number } })
      | undefined
    const maxW = caps?.width?.max || 3840
    const maxH = caps?.height?.max || 2160
    const maxFps = caps?.frameRate?.max || 30
    await track.applyConstraints({
      width: { ideal: maxW },
      height: { ideal: maxH },
      frameRate: { ideal: Math.min(60, maxFps) },
    })
  } catch {
    const profiles = [
      { width: 3840, height: 2160 },
      { width: 2560, height: 1440 },
      { width: 1920, height: 1080 },
    ]
    for (const p of profiles) {
      try {
        await track.applyConstraints({
          width: { ideal: p.width },
          height: { ideal: p.height },
          frameRate: { ideal: 30 },
        })
        break
      } catch {
        /* try next */
      }
    }
  }
  return base
}

function bitrateForResolution(width: number, height: number): number {
  const pixels = Math.max(1, width * height)
  // 更高码率，减轻 MediaRecorder 发糊（最高约 40Mbps）
  const estimated = Math.round(pixels * 0.22 * 30)
  return Math.min(40_000_000, Math.max(16_000_000, estimated))
}

function stopVideoCaptureStream() {
  capturePreviewReady.value = false
  if (videoCaptureTimer) {
    clearInterval(videoCaptureTimer)
    videoCaptureTimer = null
  }
  try {
    if (videoCaptureRecorder && videoCaptureRecorder.state !== 'inactive') {
      videoCaptureRecorder.ondataavailable = null
      videoCaptureRecorder.onstop = null
      videoCaptureRecorder.stop()
    }
  } catch {
    /* ignore */
  }
  videoCaptureRecorder = null
  videoCaptureStream?.getTracks().forEach((t) => t.stop())
  videoCaptureStream = null
  const el = videoCapturePreviewRef.value
  if (el) {
    el.pause()
    el.srcObject = null
    el.removeAttribute('src')
    el.load()
  }
  videoCapturing.value = false
  photoCapturing.value = false
  videoCaptureSeconds.value = 0
  videoCaptureChunks = []
  videoCaptureInfo.value = ''
}

function clearCaptureReview() {
  if (captureReviewUrl.value) URL.revokeObjectURL(captureReviewUrl.value)
  captureReviewUrl.value = ''
  captureReviewFile.value = null
  captureReviewKind.value = ''
}

async function retakeCapture() {
  clearCaptureReview()
  await openHdCapture('photo')
}

async function confirmCaptureSend() {
  const file = captureReviewFile.value
  const kind = captureReviewKind.value
  if (!file || !kind) return
  captureReviewFile.value = null
  closeVideoCapture()
  if (kind === 'photo') {
    await openImageEditorForSend([file], 0)
  } else {
    openMediaPicker([file], { initialMode: 'trim', directSend: true })
  }
}

async function openHdCapture(mode: 'video' | 'photo') {
  if (!canChat.value) {
    showToast(chatBlockTip.value || '无法发送消息')
    return
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast('当前环境不支持拍摄，请从相册选择')
    mediaInputRef.value?.click()
    return
  }
  captureMode.value = mode
  clearCaptureReview()
  stopVideoCaptureStream()
  showVideoCapture.value = true
  await nextTick()
  try {
    // 相机入口采用“轻触拍照、长按录像”，因此预先申请音频轨道，
    // 长按录像时可以直接把麦克风声音一起写入 MediaRecorder。
    const stream = await openBestCameraStream(videoCaptureFacing.value, true)
    videoCaptureStream = stream
    const track = stream.getVideoTracks()[0]
    const settings = track?.getSettings?.() || {}
    const w = Number(settings.width || 0)
    const h = Number(settings.height || 0)
    videoCaptureBitrate = bitrateForResolution(w || 1920, h || 1080)
    videoCaptureInfo.value = w && h ? `${w}×${h}` : '超清'
    if (w >= 2560) showToast(`已开启超清 ${w}×${h}`)
    const el = videoCapturePreviewRef.value
    if (el) {
      el.srcObject = stream
      el.muted = true
      el.playsInline = true
      await el.play().catch(() => undefined)
      capturePreviewReady.value = el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    }
  } catch {
    showVideoCapture.value = false
    stopVideoCaptureStream()
    showToast('无法打开相机，请检查权限或改用相册')
  }
}

function closeVideoCapture() {
  capturePressActive = false
  if (capturePressTimer) {
    clearTimeout(capturePressTimer)
    capturePressTimer = null
  }
  try {
    if (videoCapturing.value && videoCaptureRecorder && videoCaptureRecorder.state !== 'inactive') {
      videoCaptureRecorder.ondataavailable = null
      videoCaptureRecorder.onstop = null
      videoCaptureRecorder.stop()
    }
  } catch {
    /* ignore */
  }
  videoCapturing.value = false
  photoCapturing.value = false
  showVideoCapture.value = false
  stopVideoCaptureStream()
  clearCaptureReview()
}

function startCaptureGesture(event: PointerEvent) {
  if (captureReviewKind.value || photoCapturing.value || videoCapturing.value) return
  if (!videoCaptureStream) return
  event.currentTarget instanceof HTMLElement && event.currentTarget.setPointerCapture?.(event.pointerId)
  capturePressActive = true
  if (capturePressTimer) clearTimeout(capturePressTimer)
  capturePressTimer = window.setTimeout(() => {
    capturePressTimer = null
    if (!capturePressActive || !videoCaptureStream) return
    if (typeof MediaRecorder === 'undefined') {
      showToast('当前环境不支持录像，请轻触拍照')
      return
    }
    captureMode.value = 'video'
    startHdVideoRecord()
  }, 360)
}

function endCaptureGesture(event?: PointerEvent) {
  if (!capturePressActive) return
  if (event && event.currentTarget instanceof HTMLElement && event.currentTarget.hasPointerCapture?.(event.pointerId)) {
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }
  capturePressActive = false
  if (capturePressTimer) {
    clearTimeout(capturePressTimer)
    capturePressTimer = null
  }
  if (videoCapturing.value) {
    void stopHdVideoRecordAndSend()
    return
  }
  void takeHdPhotoAndSend()
}

function cancelCaptureGesture(event?: PointerEvent) {
  if (event && event.currentTarget instanceof HTMLElement && event.currentTarget.hasPointerCapture?.(event.pointerId)) {
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }
  capturePressActive = false
  if (capturePressTimer) {
    clearTimeout(capturePressTimer)
    capturePressTimer = null
  }
  if (videoCapturing.value) {
    stopVideoCaptureStream()
    captureMode.value = 'photo'
    showToast('已取消录像')
  }
}

async function flipVideoCaptureCamera() {
  if (videoCapturing.value || photoCapturing.value) {
    showToast('拍摄中无法切换镜头')
    return
  }
  videoCaptureFacing.value = videoCaptureFacing.value === 'environment' ? 'user' : 'environment'
  const mode = captureMode.value
  const wasOpen = showVideoCapture.value
  stopVideoCaptureStream()
  if (wasOpen) await openHdCapture(mode)
}

async function takeHdPhotoAndSend() {
  if (!videoCaptureStream || photoCapturing.value || captureMode.value !== 'photo') return
  photoCapturing.value = true
  try {
    const track = videoCaptureStream.getVideoTracks()[0]
    let blob: Blob | null = null
    const ImageCaptureCtor = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => {
      takePhoto: (opts?: object) => Promise<Blob>
      getPhotoCapabilities?: () => Promise<{ imageWidth?: { max?: number }; imageHeight?: { max?: number } }>
    } }).ImageCapture
    if (track && ImageCaptureCtor) {
      try {
        const ic = new ImageCaptureCtor(track)
        const caps = await ic.getPhotoCapabilities?.().catch(() => null)
        const opts: Record<string, number> = {}
        if (caps?.imageWidth?.max) opts.imageWidth = caps.imageWidth.max
        if (caps?.imageHeight?.max) opts.imageHeight = caps.imageHeight.max
        blob = await ic.takePhoto(opts)
      } catch {
        blob = null
      }
    }
    if (!blob) {
      const el = videoCapturePreviewRef.value
      if (!el || !el.videoWidth) throw new Error('预览未就绪')
      const canvas = document.createElement('canvas')
      canvas.width = el.videoWidth
      canvas.height = el.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('无法截图')
      ctx.drawImage(el, 0, 0, canvas.width, canvas.height)
      blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.95))
    }
    if (!blob || blob.size < 100) throw new Error('拍照失败')
    const file = new File([blob], `pulse_photo_${Date.now()}.jpg`, {
      type: blob.type || 'image/jpeg',
      lastModified: Date.now(),
    })
    // 拍照完成直接进入图片编辑页，底部“完成”即发送。
    closeVideoCapture()
    await openImageEditorForSend([file], 0)
  } catch (e) {
    showToast(e instanceof Error ? e.message : '拍照失败')
  } finally {
    photoCapturing.value = false
  }
}

function startHdVideoRecord() {
  if (!videoCaptureStream || videoCapturing.value) return
  videoCaptureChunks = []
  videoCaptureMime = pickVideoRecorderMime()
  try {
    videoCaptureRecorder = new MediaRecorder(videoCaptureStream, {
      mimeType: videoCaptureMime,
      videoBitsPerSecond: videoCaptureBitrate,
      audioBitsPerSecond: 256_000,
    })
  } catch {
    try {
      videoCaptureRecorder = new MediaRecorder(videoCaptureStream)
    } catch {
      showToast('无法开始录制')
      return
    }
  }
  videoCaptureRecorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) videoCaptureChunks.push(ev.data)
  }
  videoCaptureRecorder.start(100)
  videoCapturing.value = true
  videoCaptureSeconds.value = 0
  const started = Date.now()
  videoCaptureTimer = setInterval(() => {
    videoCaptureSeconds.value = Math.floor((Date.now() - started) / 1000)
    if (videoCaptureSeconds.value >= 60) {
      void stopHdVideoRecordAndSend()
    }
  }, 200)
}

async function stopHdVideoRecordAndSend() {
  if (!videoCaptureRecorder || !videoCapturing.value) return
  const rec = videoCaptureRecorder
  const mime = videoCaptureMime
  const blob: Blob = await new Promise((resolve, reject) => {
    rec.onstop = () => {
      resolve(new Blob(videoCaptureChunks, { type: mime.split(';')[0] || 'video/webm' }))
    }
    rec.onerror = () => reject(new Error('录制失败'))
    try {
      if (rec.state !== 'inactive') rec.stop()
    } catch (e) {
      reject(e)
    }
  })
  videoCapturing.value = false
  if (videoCaptureTimer) {
    clearInterval(videoCaptureTimer)
    videoCaptureTimer = null
  }
  if (blob.size < 1024) {
    showToast('录制失败，请重试')
    return
  }
  const ext = mime.includes('mp4') ? 'mp4' : 'webm'
  const file = new File([blob], `pulse_cam_${Date.now()}.${ext}`, {
    type: blob.type || (ext === 'mp4' ? 'video/mp4' : 'video/webm'),
    lastModified: Date.now(),
  })
  // 录像完成进入视频编辑页，裁剪后点击底部“完成”直接发送。
  closeVideoCapture()
  openMediaPicker([file], { initialMode: 'trim', directSend: true })
}

function openMediaPicker(
  files: File[],
  options: { initialMode?: 'grid' | 'preview' | 'trim'; directSend?: boolean } = {},
) {
  if (!canChat.value) {
    showToast(chatBlockTip.value || '无法发送消息')
    return
  }
  const normalized = files.map(normalizeSelectedFile).filter((file) => isImageMediaFile(file) || isVideoMedia(file.type, file.name))
  if (!normalized.length) {
    showToast('请选择图片或视频')
    return
  }
  mediaPickerFiles.value = normalized.slice(0, MAX_CHAT_MEDIA_SELECT)
  mediaPickerGalleryAssets.value = []
  mediaPickerGalleryOffset.value = 0
  mediaPickerGalleryHasMore.value = false
  mediaPickerInitialMode.value = options.initialMode || 'grid'
  mediaPickerDirectSend.value = options.directSend === true
  mediaPickerEditIndex.value = null
  mediaPickerEditIndices.value = []
  showMediaPicker.value = true
}

function closeMediaPicker() {
  showMediaPicker.value = false
  mediaPickerGalleryAssets.value = []
  mediaPickerGalleryOffset.value = 0
  mediaPickerGalleryHasMore.value = false
  mediaPickerGalleryLoading.value = false
  mediaPickerInitialMode.value = 'grid'
  mediaPickerDirectSend.value = false
}

async function onMediaSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const files = pickMixedMediaFiles(input.files)
  input.value = ''
  if (!files.length) return
  openMediaPicker(files)
}

const MAX_CHAT_MEDIA_SELECT = 9
const MEDIA_GALLERY_PAGE_SIZE = 28

async function loadMediaGalleryPage(reset = false) {
  if (!isNativeApp || mediaPickerGalleryLoading.value) return
  if (!reset && !mediaPickerGalleryHasMore.value) return
  mediaPickerGalleryLoading.value = true
  const offset = reset ? 0 : mediaPickerGalleryOffset.value
  try {
    const page = await nativeMediaGallery.listMedia({
      offset,
      limit: MEDIA_GALLERY_PAGE_SIZE,
    })
    const nextAssets = reset ? page : [
      ...mediaPickerGalleryAssets.value,
      ...page.filter((asset) => !mediaPickerGalleryAssets.value.some((current) => current.uri === asset.uri)),
    ]
    mediaPickerGalleryAssets.value = nextAssets
    mediaPickerGalleryOffset.value = offset + page.length
    mediaPickerGalleryHasMore.value = page.length >= MEDIA_GALLERY_PAGE_SIZE
  } finally {
    mediaPickerGalleryLoading.value = false
  }
}

function loadNextMediaGalleryPage() {
  void loadMediaGalleryPage(false)
}

function isImageMediaFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  return /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(file.name)
}

function normalizeSelectedFile(file: File): File {
  const name = normalizeFileName(file.name)
  if (!name || name === file.name) return file
  try {
    return new File([file], name, { type: file.type, lastModified: file.lastModified })
  } catch {
    return file
  }
}

function pickMixedMediaFiles(list: FileList | File[] | null | undefined): File[] {
  if (!list?.length) return []
  const filtered = Array.from(list).filter((file) => isImageMediaFile(file) || isVideoMedia(file.type, file.name))
  if (!filtered.length) {
    showToast('请选择图片或视频')
    return []
  }
  if (filtered.length > MAX_CHAT_MEDIA_SELECT) showToast(`一次最多发送 ${MAX_CHAT_MEDIA_SELECT} 个`)
  return filtered.slice(0, MAX_CHAT_MEDIA_SELECT)
}

async function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const selected = input.files?.[0]
  input.value = ''
  if (!selected) return
  const file = normalizeSelectedFile(selected)
  if (file.type.startsWith('image/')) {
    await sendImagesWithEdit([file])
    return
  }
  if (file.type.startsWith('video/') || isVideoMedia(file.type, file.name)) {
    openMediaPicker([file])
    return
  }
  queueGenericFile(file)
}

function queueGenericFile(file: File) {
  if (!canChat.value) {
    showToast(chatBlockTip.value || '无法发送消息')
    return
  }
  if (uploading.value) return
  pendingFileToSend.value = file
  showFileSendConfirm.value = true
  showPlusSheet.value = false
}

function cancelGenericFile() {
  showFileSendConfirm.value = false
  pendingFileToSend.value = null
}

async function confirmGenericFile() {
  const file = pendingFileToSend.value
  if (!file || uploading.value) return
  showFileSendConfirm.value = false
  pendingFileToSend.value = null
  await sendGenericFile(file)
}

async function sendImageFiles(files: File[], options: { fromCamera?: boolean; original?: boolean } = {}): Promise<number> {
  if (!canChat.value) {
    showToast(chatBlockTip.value || '无法发送消息')
    return files.length
  }
  if (!files.length) return 0
  uploading.value = true
  showLoadingToast({
    message: files.length > 1 ? `图片发送中 0/${files.length}` : '图片上传中...',
    forbidClick: true,
    duration: 0,
    className: 'media-upload-toast',
  })
  let failed = 0
  try {
    failed = await runMediaUploads(files, async (file) => {
      await sendImageFile(file, { ...options, skipUi: true })
    }, '图片')
  } finally {
    closeToast()
    uploading.value = false
  }
  if (failed > 0) {
    showToast(failed === files.length ? '图片发送失败' : `${failed} 张发送失败`)
  }
  return failed
}

/** 发送图片/视频前先进入仿微信媒体预览页。 */
function sendImagesWithEdit(files: File[]) {
  openMediaPicker(files)
}

function onMediaPickerEdit(payload: { index: number; imageIndices: number[]; files: File[] }) {
  // 原生相册网格使用占位 File，编辑器返回前先把实际读取到的图片回填到父级。
  const next = mediaPickerFiles.value.slice()
  payload.imageIndices.forEach((editIndex, index) => {
    const file = payload.files[index]
    if (file) next[editIndex] = file
  })
  mediaPickerFiles.value = next
  const imageIndices = payload.imageIndices.filter((index) => isImageMediaFile(next[index]!))
  const currentPosition = imageIndices.indexOf(payload.index)
  if (currentPosition < 0) return
  const files = imageIndices.map((index) => next[index]!)
  mediaPickerEditIndices.value = imageIndices
  mediaPickerEditIndex.value = payload.index
  showMediaPicker.value = false
  void openImageEditorForSend(files, currentPosition)
}

function onMediaPickerReplace(payload: { index: number; file: File }) {
  if (!mediaPickerFiles.value[payload.index]) return
  const next = mediaPickerFiles.value.slice()
  next[payload.index] = payload.file
  mediaPickerFiles.value = next
}

async function onMediaPickerSend(payload: { files: File[]; original: boolean }) {
  showMediaPicker.value = false
  mediaPickerInitialMode.value = 'grid'
  mediaPickerDirectSend.value = false
  mediaPickerEditIndex.value = null
  mediaPickerEditIndices.value = []
  const images = payload.files.filter((file) => isImageMediaFile(file))
  const videos = payload.files.filter((file) => isVideoMedia(file.type, file.name))
  let failed = 0
  if (images.length) failed += await sendImageFiles(images, { original: payload.original })
  if (videos.length) failed += await sendVideoFiles(videos, { original: payload.original })
  if (failed) showToast(failed === payload.files.length ? '媒体发送失败' : `${failed} 个媒体发送失败`)
}

async function sendVideoFiles(files: File[], options: { original?: boolean } = {}): Promise<number> {
  if (!canChat.value) {
    showToast(chatBlockTip.value || '无法发送消息')
    return files.length
  }
  if (!files.length) return 0
  if (files.length > 3) {
    showToast('一次最多发送 3 个视频')
    files = files.slice(0, 3)
  }
  uploading.value = true
  showLoadingToast({
    message: files.length > 1 ? `视频发送中 0/${files.length}` : '视频发送中...',
    forbidClick: true,
    duration: 0,
    className: 'media-upload-toast',
  })
  let failed = 0
  try {
    failed = await runMediaUploads(files, async (file) => {
      await sendVideoFile(file, { skipUi: true, original: options.original })
    }, '视频')
  } finally {
    closeToast()
    uploading.value = false
  }
  if (failed > 0) {
    showToast(failed === files.length ? '视频发送失败' : `${failed} 个发送失败`)
  }
  return failed
}

/**
 * Two uploads in flight keeps multi-select responsive without opening one
 * connection per photo/video on a mobile network. Completion order does not
 * affect the selected files themselves; each message still gets its own id.
 */
async function runMediaUploads(
  files: File[],
  send: (file: File) => Promise<void>,
  label: string,
): Promise<number> {
  let cursor = 0
  let completed = 0
  let failed = 0
  const worker = async () => {
    while (true) {
      const index = cursor++
      if (index >= files.length) return
      try {
        await send(files[index]!)
      } catch {
        failed += 1
      } finally {
        completed += 1
        if (files.length > 1 && completed < files.length) {
          showLoadingToast({
            message: `${label}发送中 ${completed}/${files.length}`,
            forbidClick: true,
            duration: 0,
            className: 'media-upload-toast',
          })
        }
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(2, files.length) }, () => worker()),
  )
  return failed
}

async function sendImageFile(
  file: File,
  options: { fromCamera?: boolean; skipUi?: boolean; original?: boolean } = {},
) {
  if (!options.skipUi) {
    if (!canChat.value) {
      showToast(chatBlockTip.value || '无法发送消息')
      return
    }
    uploading.value = true
    showLoadingToast({
      message: '图片上传中...',
      forbidClick: true,
      duration: 0,
      className: 'media-upload-toast',
    })
  }
  try {
    // 上传接近原图，服务端再生成预览图；GIF 不压
    const forUpload =
      options.original || file.type === 'image/gif'
        ? file
        : await compressImageFile(file, {
            maxEdge: options.fromCamera ? 4096 : 3200,
            quality: options.fromCamera ? 0.92 : 0.88,
            maxBytes: options.fromCamera ? 12 * 1024 * 1024 : 8 * 1024 * 1024,
          })
    const uploaded = await uploadChatFileWithTimeout(forUpload)
    const payload = JSON.stringify({
      fileId: uploaded.fileId,
      objectKey: uploaded.objectKey,
      thumbUrl: uploaded.thumbUrl || undefined,
      previewUrl: uploaded.previewUrl || undefined,
      url: uploaded.url,
      originalUrl: uploaded.originalUrl || undefined,
      name: uploaded.name || file.name || `image_${Date.now()}.jpg`,
      size: uploaded.size,
      originalSize: uploaded.originalSize,
      contentType: normalizeFileContentType(uploaded.contentType, uploaded.name || file.name) || 'image/jpeg',
      originalSent: !!options.original,
    })
    await sendTypedMessage(payload, 1, uploaded.fileId)
  } catch (err) {
    if (options.skipUi) throw err
    showToast(err instanceof Error ? err.message : '图片发送失败')
  } finally {
    if (!options.skipUi) {
      closeToast()
      uploading.value = false
    }
  }
}

async function sendVideoFile(file: File, options: { skipUi?: boolean; original?: boolean } = {}) {
  if (!options.skipUi && !canChat.value) {
    showToast(chatBlockTip.value || '无法发送消息')
    return
  }
  if (!file.type.startsWith('video/') && !isVideoMedia(file.type, file.name)) {
    const err = new Error('请选择视频文件')
    if (options.skipUi) throw err
    showToast(err.message)
    return
  }
  if (file.size > 80 * 1024 * 1024) {
    const err = new Error('为保证稳定发送，视频不能超过 80MB')
    if (options.skipUi) throw err
    showToast(err.message)
    return
  }
  if (!options.skipUi) {
    uploading.value = true
  }
  try {
    // Do not transcode on the phone before uploading. Even H.264 videos over
    // 24 MiB used to spend the full video duration in a local MediaRecorder
    // pass. The API returns the original video immediately and prepares any
    // Android-compatible rendition in the background.
    const uploadFile = file
    // Send the camera/gallery file as-is. Codec probing used to delay the
    // upload and showed a compatibility toast before the unified progress UI.
    // The server still validates the actual file and creates a playable
    // rendition in the background when the source codec needs conversion.
    const videoCodecHint: 'avc' | 'hevc' | 'unknown' = 'unknown'

    if (!options.skipUi) {
      showLoadingToast({
        message: '视频发送中...',
        forbidClick: true,
        duration: 0,
        className: 'media-upload-toast',
      })
    }
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 180_000)
    let uploaded
    try {
      // A small video is faster as one multipart request. Resumable upload is
      // reserved for larger files where retrying individual chunks matters.
      uploaded = uploadFile.size <= 16 * 1024 * 1024
        ? await uploadChatFileWithTimeout(uploadFile, { videoCodecHint })
        : await uploadVideoResumable(uploadFile, {
            signal: controller.signal,
            videoCodecHint,
          })
    } finally {
      window.clearTimeout(timeout)
    }
    const payload = JSON.stringify({
      fileId: uploaded.fileId,
       objectKey: uploaded.objectKey,
       thumbUrl: uploaded.thumbUrl || undefined,
       previewUrl: uploaded.previewUrl || undefined,
      url: uploaded.url,
      originalUrl: uploaded.originalUrl || undefined,
      name: uploaded.name || uploadFile.name || file.name || `video_${Date.now()}.mp4`,
      size: uploaded.size,
      originalSize: uploaded.originalSize,
      contentType: normalizeFileContentType(uploaded.contentType, uploaded.name || uploadFile.name || file.name) || 'video/mp4',
      originalSent: !!options.original,
    })
    await sendTypedMessage(payload, 2, uploaded.fileId)
  } catch (err) {
    const message =
      err instanceof Error && (err.name === 'AbortError' || /timeout|aborted/i.test(err.message))
        ? '视频上传超时，请检查网络后重试'
        : err instanceof Error
          ? err.message
          : '视频发送失败'
    if (options.skipUi) throw err
    showToast(message)
  } finally {
    if (!options.skipUi) {
      closeToast()
      uploading.value = false
    }
  }
}

async function sendGenericFile(file: File) {
  if (!canChat.value) {
    showToast(chatBlockTip.value || '无法发送消息')
    return
  }
  const fileConfigError = await validateClientFileSend(file)
  if (fileConfigError) {
    showToast(normalizeFileSendError(fileConfigError))
    return
  }
  uploading.value = true
  showLoadingToast({ message: '文件上传中...', forbidClick: true, duration: 0 })
  let errorMessage = ''
  try {
    const uploaded = await uploadChatFileWithTimeout(file)
    const payload = JSON.stringify({
      fileId: uploaded.fileId,
      objectKey: uploaded.objectKey,
      url: uploaded.url,
      name: uploaded.name,
      size: uploaded.size,
      contentType: uploaded.contentType,
    })
    await sendTypedMessage(payload, 2, uploaded.fileId)
  } catch (err) {
    errorMessage = normalizeFileSendError(err)
  } finally {
    closeToast()
    uploading.value = false
  }
  if (errorMessage) showToast(errorMessage)
}

function normalizeFileSendError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '')
  if (/仅支持发送|不允许上传|不支持.*文件|unsupported.*(file|type)/i.test(message)) {
    return '不支持该文件类型'
  }
  return message || '文件发送失败'
}

/** 普通附件也必须有明确的终止时间，避免网络半断开时一直显示上传中。 */
async function uploadChatFileWithTimeout(
  file: File,
  options: { videoCodecHint?: 'avc' | 'hevc' | 'unknown'; durationMs?: number } = {},
) {
  const sizeMb = file.size / (1024 * 1024)
  const timeout = Math.min(180_000, Math.max(45_000, 45_000 + Math.ceil(sizeMb) * 1_500))
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeout)
  try {
    return await uploadChatFile(file, {
      ...options,
      signal: controller.signal,
      timeout,
    })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('文件上传超时，请检查网络后重试')
    }
    throw error
  } finally {
    window.clearTimeout(timer)
  }
}

async function sendTypedMessage(content: string, msgType: MsgType, fileId?: string) {
  const clientMsgId = `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const optimistic: ChatMessage = {
    id: clientMsgId,
    conversationId: conversationId.value,
    fromUserId: myUserId.value,
    fromNickname: userStore.nickname || '我',
    fromAvatarUrl: userStore.avatar || '',
    toUserId: peerUserId.value,
    content,
    msgType,
    fileId,
    clientMsgId,
    createdAt: new Date().toISOString(),
    mine: true,
  }
  messages.value.push(optimistic)
  scrollToBottom()
  inbox.notifyLocalMessage(conversationId.value, msgLabel(optimistic), msgType)

  try {
    const saved = await sendTextMessage({
      conversationId: conversationId.value,
      toUserId: peerUserId.value || undefined,
      content,
      clientMsgId,
      msgType,
      fileId,
      fromUserId: myUserId.value,
    })
    const idx = messages.value.findIndex((m) => m.clientMsgId === clientMsgId)
    if (idx >= 0) {
      messages.value[idx] = {
        ...saved,
        ...outgoingRetention(saved, messages.value[idx]),
        fromUserId: myUserId.value || saved.fromUserId,
        fromNickname: saved.fromNickname || userStore.nickname || '我',
        fromAvatarUrl: saved.fromAvatarUrl || userStore.avatar || '',
        mine: true,
      }
      if (msgType === 1 || msgType === 2) void hydrateAttachment(messages.value[idx])
    }
  } catch (e) {
    messages.value = messages.value.filter((m) => m.clientMsgId !== clientMsgId)
    const tip = e instanceof Error ? e.message : '发送失败，请重试'
    showToast(tip)
    if (isGroup.value && /禁言/.test(tip)) void refreshGroupMuteState()
    throw e
  }
}

function imageUrlOf(msg: ChatMessage): string {
  if (msg.msgType !== 1) return ''
  if (cachedFileUrls[msg.id]) return cachedFileUrls[msg.id]
  const f = parseFilePayload(msg.content)
  // Private fileId URLs require an Authorization header and cannot be used as
  // a raw <img> fallback. hydrateAttachment will populate the local thumb.
  if (f?.fileId) return ''
  return resolveFileUrl(f?.thumbUrl || f?.url || msg.content)
}

function imagePreviewUrlOf(msg: ChatMessage): string {
  if (msg.msgType !== 1) return ''
  const f = parseFilePayload(msg.content)
  return resolveFileUrl(f?.previewUrl || f?.thumbUrl || f?.url || msg.content)
}

function originalSentOf(msg: ChatMessage): boolean {
  return parseFilePayload(msg.content)?.originalSent === true
}

function imageOriginalUrlOf(msg: ChatMessage): string {
  if (msg.msgType !== 1) return ''
  const f = parseFilePayload(msg.content)
  // 发送方已经明确选择原图时，接收方直接按原图打开，不再展示“查看原图”。
  if (f?.originalSent || usesMediaOriginal(msg)) return ''
  const orig = f?.originalUrl ? resolveFileUrl(f.originalUrl) : ''
  const preview = imagePreviewUrlOf(msg)
  if (!orig || orig === preview) return ''
  return orig
}

function fileOf(msg: ChatMessage) {
  return msg.msgType === 1 || msg.msgType === 2 ? parseFilePayload(msg.content) : null
}

function attachmentKind(msg: ChatMessage, payload: ReturnType<typeof parseFilePayload>): ChatCacheKind {
  if (msg.msgType === 1) return 'image'
  if (msg.msgType === 3) return 'audio'
  return payload && isVideoMedia(payload.contentType, payload.url || payload.name) ? 'video' : 'file'
}

async function hydrateAttachment(msg: ChatMessage) {
  const payload = parseFilePayload(msg.content)
  const normalizedType = normalizeMessageType(msg.msgType, msg.content, payload)
  if (normalizedType !== 1 && normalizedType !== 2) return
  const normalizedMessage = msg.msgType === normalizedType ? msg : { ...msg, msgType: normalizedType }
  const initialKind = attachmentKind(normalizedMessage, payload)
  if (!payload?.fileId || fileHydrationInFlight.has(msg.id)) return
  fileHydrationInFlight.add(msg.id)
  try {
    // The REST message already contains rendition URLs on current servers.
    // Use them immediately and avoid one metadata request per message on a
    // chat reopen. Older rows without a rendition still poll metadata until
    // the server-side video job has produced its cover/preview.
    // A legacy `file:<id>` payload has no MIME type, and a newly uploaded
    // video can have a cover before its MP4 rendition. Refresh metadata in
    // both cases; otherwise the message stays a generic file forever and the
    // player falls back to downloading an incompatible original video.
    const metadata = initialKind === 'image'
      ? payload.thumbUrl || payload.previewUrl ? payload : await fetchFileMetadata(payload.fileId)
      : initialKind === 'video' && payload.previewUrl
        ? payload
        : await fetchFileMetadata(payload.fileId)
    const merged = { ...payload, ...metadata, fileId: payload.fileId }
    const hydratedType = normalizeMessageType(normalizedType, msg.content, merged)
    const hydratedMessage = msg.msgType === hydratedType ? msg : { ...msg, msgType: hydratedType }
    const idx = messages.value.findIndex((item) => item.id === msg.id)
    if (idx >= 0) {
      messages.value[idx] = {
        ...messages.value[idx],
        msgType: hydratedType,
        content: JSON.stringify(merged),
        fileId: payload.fileId,
      }
      // Metadata can arrive after the websocket notification. Recompute the
      // inbox preview so a video is not left displayed as “[文件]”.
      syncConversationPreviewFromMessages()
      // Keep the warm message snapshot in step with the hydrated metadata.
      // Otherwise the next chat mount would need to rediscover the rendition
      // before it could restore the already-cached thumbnail synchronously.
      if (chatViewMounted && !showingLocatedWindow.value) {
        setCachedChatMessages(conversationId.value, messages.value)
      }
    }
    const kind = attachmentKind(hydratedMessage, merged)
    // A video preview is an MP4, not an image.  Never put it into the
    // thumbnail slot: the bubble renders that slot with <img>, and doing so
    // would stop the cover retry loop while leaving a broken preview.  The
    // compressed video is still downloaded on explicit play; only its cover
    // is warmed while the chat list is being hydrated.
    const warmVariant = kind === 'image'
      ? metadata.thumbUrl ? 'thumb' : metadata.previewUrl ? 'preview' : ''
      : kind === 'video' && metadata.thumbUrl
        ? 'thumb'
        : ''
    const warmUrl = warmVariant === 'thumb'
      ? metadata.thumbUrl || ''
      : warmVariant === 'preview'
        ? metadata.previewUrl || ''
        : ''
    if (warmVariant && warmUrl) {
      const url = await cacheChatFile(kind, payload.fileId, warmVariant, resolveFileUrl(warmUrl))
      // Public rendition URLs can be painted immediately. Replacing them a
      // moment later with a new blob URL makes every chat reopen visibly blink.
      // Keep the local object URL for private fileId-only media, where a raw
      // <img>/<video> URL cannot be loaded with the required Authorization.
      if (url && payload.fileId) cachedFileUrls[msg.id] = url
      fileHydrationRetryCounts.delete(msg.id)
    } else if (kind === 'image' || kind === 'video') {
      const retries = fileHydrationRetryCounts.get(msg.id) || 0
      if (retries < 45) {
        fileHydrationRetryCounts.set(msg.id, retries + 1)
        window.setTimeout(() => { void hydrateAttachment(msg) }, 2000)
      }
    }
  } catch {
    // Metadata/thumbnail warm-up is best effort; the bubble remains usable.
    const retries = fileHydrationRetryCounts.get(msg.id) || 0
    if (retries < 45) {
      fileHydrationRetryCounts.set(msg.id, retries + 1)
      window.setTimeout(() => { void hydrateAttachment(msg) }, 2000)
    }
  } finally {
    fileHydrationInFlight.delete(msg.id)
  }
}

function mediaCacheVariant(msg: ChatMessage, variant: ChatCacheVariant): ChatCacheVariant {
  if (msg.msgType === 1) return variant
  if (msg.msgType === 2) return variant
  return 'original'
}

async function loadChatMedia(msg: ChatMessage, variant: ChatCacheVariant): Promise<{ url: string; variant: ChatCacheVariant }> {
  const payload = parseFilePayload(msg.content)
  if (!payload) return { url: '', variant }
  const kind = attachmentKind(msg, payload)
  const actualVariant = mediaCacheVariant(msg, variant)
  const source = actualVariant === 'thumb'
    ? payload.thumbUrl
    : actualVariant === 'preview'
      // A video thumbnail is JPEG and must never be used as the <video>
      // source. If the MP4 rendition is not ready, let the caller decide
      // whether to wait or fall back to the original video.
      ? kind === 'video' ? payload.previewUrl : payload.previewUrl || payload.thumbUrl
      : payload.originalUrl || payload.url
  if (!source) return { url: '', variant: actualVariant }
  // The authenticated endpoint supports Range. Let the native video element
  // stream the MP4 instead of waiting for cacheChatFile() to download the
  // complete compressed rendition before the first frame can appear.
  if (kind === 'video' && payload.fileId) {
    return { url: toAbsoluteMediaUrl(resolveFileUrl(source)), variant: actualVariant }
  }
  if (!payload.fileId) return { url: resolveFileUrl(source), variant: actualVariant }
  const url = await cacheChatFile(kind, payload.fileId, actualVariant, resolveFileUrl(source))
  return { url: toAbsoluteMediaUrl(url), variant: actualVariant }
}

/** 等待服务端生成 MP4 播放版；普通点击绝不选择原视频。 */
async function loadVideoPlaybackMedia(
  msg: ChatMessage,
  preferredVariant: ChatCacheVariant = 'preview',
): Promise<{ url: string; variant: ChatCacheVariant }> {
  const variants: ChatCacheVariant[] = preferredVariant === 'original'
    ? ['original']
    : ['preview']
  for (const variant of variants) {
    try {
      const loaded = await loadChatMedia(msg, variant)
      if (loaded.url) return loaded
    } catch {
      // 预览版可能暂时返回 404/生成中，继续尝试下一种可播放地址。
    }
  }
  return { url: '', variant: preferredVariant }
}

async function activateVideoPlayerSource(
  message: ChatMessage,
  loaded: { url: string; variant: ChatCacheVariant },
  openToken: number,
): Promise<boolean> {
  if (!loaded.url || openToken !== videoPlayerOpenToken || !videoPlayerVisible.value) return false
  videoPlayerMsg = message
  const mediaList = previewableMediaMessages(message)
  imagePreviewList.value = mediaList
  imagePreviewIndex.value = Math.max(0, mediaList.findIndex((item) => item.id === message.id))
  resetMediaPreviewGesture()
  videoPlayerReady.value = false
  markChatCacheInUse(fileOf(message)?.fileId || '', videoPlayerVariant, false)
  revokeVideoBlob()
  // 服务端播放版带 faststart，直接使用 Range 流式播放，避免安卓先下载完整视频。
  videoPlayerUrl.value = loaded.url
  markChatCacheInUse(fileOf(message)?.fileId || '', loaded.variant, true)
  videoPlayerVariant = loaded.variant
  videoPlayerPreparingPreview.value = false
  videoPlayerLoading.value = false
  await nextTick()
  if (openToken !== videoPlayerOpenToken || !videoPlayerVisible.value) return false
  const el = videoPlayerRef.value
  if (!el) return true
  el.playsInline = true
  el.muted = true
  void el.play().then(() => {
    el.muted = false
  }).catch(() => undefined)
  return true
}

/** Keep the player open while the asynchronous compressed rendition is built. */
async function waitForVideoPlaybackRendition(message: ChatMessage, openToken: number) {
  const fileId = fileOf(message)?.fileId || parseFilePayload(message.content)?.fileId || ''
  if (!fileId) {
    videoPlayerPreparingPreview.value = false
    videoPlayerLoading.value = false
    return
  }
  let current = message
  // The upload worker normally finishes quickly; the longer window only
  // covers larger clips or a temporarily busy ffmpeg worker.
  for (let attempt = 0; attempt < 18; attempt += 1) {
    if (openToken !== videoPlayerOpenToken || !videoPlayerVisible.value) return
    try {
      const metadata = await fetchFileMetadata(fileId)
      current = mergeVideoMetadata(current, metadata)
      const loaded = await loadVideoPlaybackMedia(current, 'preview')
      if (await activateVideoPlayerSource(current, loaded, openToken)) return
    } catch {
      // The rendition may still be in progress; keep the player waiting.
    }
    if (attempt < 17) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 700))
    }
  }
  if (openToken === videoPlayerOpenToken && videoPlayerVisible.value) {
    videoPlayerPreparingPreview.value = false
    videoPlayerLoading.value = false
  }
}

function warmAttachments(list: ChatMessage[]) {
  list.forEach((message) => {
    if (message.recalled) return
    if (message.msgType !== 1 && message.msgType !== 2) return
    const payload = parseFilePayload(message.content)
    const normalizedType = normalizeMessageType(message.msgType, message.content, payload)
    const normalizedMessage = normalizedType === message.msgType
      ? message
      : { ...message, msgType: normalizedType }
    const kind = attachmentKind(normalizedMessage, payload)
    // A legacy REST row may be `file:<id>` with no MIME metadata yet. Let
    // hydrateAttachment resolve that id before deciding that it is a file.
    if (kind !== 'image' && kind !== 'video' && !payload?.fileId) return

    // ChatView is remounted when returning from another page. Restore an
    // object URL that was already created for this file synchronously, so the
    // bubble does not briefly switch to the "preparing" placeholder while
    // CacheStorage is being read again.
    if (payload?.fileId && (kind === 'image' || kind === 'video') && !cachedFileUrls[message.id]) {
      const stableUrl = kind === 'video'
        ? getStableChatFileUrl(payload.fileId, 'thumb')
        : getStableChatFileUrl(payload.fileId, 'thumb') || getStableChatFileUrl(payload.fileId, 'preview')
      if (stableUrl) cachedFileUrls[message.id] = stableUrl
    }
    if (normalizedMessage !== message) {
      const index = messages.value.findIndex((item) => item.id === message.id)
      if (index >= 0) messages.value[index] = normalizedMessage
    }
    void hydrateAttachment(normalizedMessage)
  })
}

function isVideoMsg(msg: ChatMessage): boolean {
  const f = fileOf(msg)
  return !!f && isVideoMedia(f.contentType, f.url || f.name)
}

function videoUrlOf(msg: ChatMessage): string {
  const f = fileOf(msg)
  if (!f) return ''
  // The bubble only needs a cover. Keep a cache-backed cover when available;
  // the full compressed MP4 is opened by the player on demand.
  if (cachedFileUrls[msg.id]) return cachedFileUrls[msg.id]
  return resolveFileUrl(f.previewUrl || (f.fileId ? fileDownloadUrl(f.fileId, 'preview') : f.url))
}

function videoThumbUrlOf(msg: ChatMessage): string {
  const f = fileOf(msg)
  if (!f) return ''
  if (cachedFileUrls[msg.id]) return cachedFileUrls[msg.id]
  if (f.fileId) return ''
  return f.thumbUrl ? resolveFileUrl(f.thumbUrl) : ''
}

function videoOriginalUrlOf(msg: ChatMessage): string {
  const f = fileOf(msg)
  if (f?.originalSent || usesMediaOriginal(msg)) return ''
  const orig = f?.originalUrl ? resolveFileUrl(f.originalUrl) : ''
  const preview = videoUrlOf(msg)
  if (!orig || orig === preview) return ''
  return orig
}

/** Device-local preference; cache clearing removes the matching type/file IDs. */
const MEDIA_ORIGINAL_KEY_PREFIX = 'pulse_media_original_v2:'
const mediaOriginalVersion = ref(0)

function mediaOriginalStorageKey(): string {
  try {
    const raw = localStorage.getItem('pulse_user_profile')
    const userId = raw ? JSON.parse(raw)?.userId : ''
    return `${MEDIA_ORIGINAL_KEY_PREFIX}${encodeURIComponent(String(userId || 'anonymous'))}`
  } catch {
    return `${MEDIA_ORIGINAL_KEY_PREFIX}anonymous`
  }
}

function readMediaOriginalKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(mediaOriginalStorageKey())
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr.filter((v) => typeof v === 'string') : [])
  } catch {
    return new Set()
  }
}

function mediaOriginalKey(msg: ChatMessage): string {
  const payload = parseFilePayload(msg.content)
  const kind = msg.msgType === 1 ? 'image' : isVideoMsg(msg) ? 'video' : ''
  const id = payload?.fileId || msg.id
  return kind && id ? `${kind}:${id}` : ''
}

function usesMediaOriginal(msg: ChatMessage | null | undefined): boolean {
  void mediaOriginalVersion.value
  if (!msg?.id || isBurnMessage(msg)) return false
  const key = mediaOriginalKey(msg)
  return !!key && readMediaOriginalKeys().has(key)
}

function rememberMediaOriginal(msg: ChatMessage): void {
  if (!msg.id || isBurnMessage(msg)) return
  const key = mediaOriginalKey(msg)
  if (!key) return
  const keys = readMediaOriginalKeys()
  keys.add(key)
  try { localStorage.setItem(mediaOriginalStorageKey(), JSON.stringify([...keys])) } catch { /* best effort */ }
  mediaOriginalVersion.value += 1
}

function onChatCacheCleared(event: Event) {
  const detail = (event as CustomEvent<{ fileId?: string; kind?: string }>).detail || {}
  const fileId = String(detail.fileId || '')
  const kind = String(detail.kind || '')
  const matchesScope = (message: ChatMessage | undefined): boolean => {
    if (!message) return false
    const payload = parseFilePayload(message.content)
    if (fileId && payload?.fileId !== fileId) return false
    if (kind && kind !== 'all' && (!payload || attachmentKind(message, payload) !== kind)) return false
    return true
  }
  Object.keys(cachedFileUrls).forEach((messageId) => {
    const message = messages.value.find((item) => item.id === messageId)
    if (!matchesScope(message)) return
    delete cachedFileUrls[messageId]
  })
  // fileCache clears the current account's v2 preference, including messages
  // not currently paged into this ChatView. This handler only refreshes rendering.
  if (!fileId && (!kind || kind === 'all')) warmAttachments(messages.value)
  else warmAttachments(messages.value.filter((message) => matchesScope(message)))
  mediaOriginalVersion.value += 1
}

const videoPlayerVisible = ref(false)
const videoPlayerUrl = ref('')
const videoPlayerLoading = ref(false)
const videoPlayerPreparingPreview = ref(false)
const videoPlayerReady = ref(false)
const videoPlayerRef = ref<HTMLVideoElement | null>(null)
/** 当前全屏播放对应的消息，失败时用于兜底 */
let videoPlayerMsg: ChatMessage | null = null
let videoBlobUrl = ''
let videoPlayerErrorAttempts = 0
let videoPlayerCacheFallbackAttempted = false
let videoPlayerOpenToken = 0

const imagePreviewVisible = ref(false)
const imagePreviewUrl = ref('')
let imagePreviewMsg: ChatMessage | null = null
const imagePreviewList = ref<ChatMessage[]>([])
const imagePreviewIndex = ref(0)
// 长按预览媒体时，操作菜单是叠加层；菜单打开、取消或遮罩点击都不能
// 误触发底层图片/视频预览的关闭逻辑。
const mediaPreviewMenuOpen = ref(false)
let mediaPreviewHistoryActive = false
let mediaSwipeStartX = 0
let mediaSwipeStartY = 0

type MediaPreviewGesture =
  | {
      kind: 'pan'
      startX: number
      startY: number
      startOffsetX: number
      startOffsetY: number
    }
  | {
      kind: 'pinch'
      startDistance: number
      startScale: number
      startOffsetX: number
      startOffsetY: number
      startMidX: number
      startMidY: number
    }

const mediaPreviewScale = ref(1)
const mediaPreviewOffsetX = ref(0)
const mediaPreviewOffsetY = ref(0)
const mediaPreviewTransform = computed(() => ({
  transform: `translate3d(${mediaPreviewOffsetX.value}px, ${mediaPreviewOffsetY.value}px, 0) scale(${mediaPreviewScale.value})`,
  transformOrigin: 'center center',
}))
let mediaPreviewGesture: MediaPreviewGesture | null = null
let mediaPreviewHadMultipleTouches = false

function mediaTouchDistance(touches: TouchList): number {
  const first = touches[0]
  const second = touches[1]
  if (!first || !second) return 1
  return Math.max(1, Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY))
}

function mediaTouchMidpoint(touches: TouchList): { x: number; y: number } {
  const first = touches[0]
  const second = touches[1]
  if (!first || !second) {
    return {
      x: first?.clientX || 0,
      y: first?.clientY || 0,
    }
  }
  return {
    x: (first.clientX + second.clientX) / 2,
    y: (first.clientY + second.clientY) / 2,
  }
}

function clampMediaPreviewOffset(x: number, y: number, scale = mediaPreviewScale.value): { x: number; y: number } {
  const maxX = Math.max(0, (window.innerWidth * (scale - 1)) / 2)
  const maxY = Math.max(0, (window.innerHeight * (scale - 1)) / 2)
  return {
    x: Math.max(-maxX, Math.min(maxX, x)),
    y: Math.max(-maxY, Math.min(maxY, y)),
  }
}

function resetMediaPreviewGesture() {
  mediaPreviewScale.value = 1
  mediaPreviewOffsetX.value = 0
  mediaPreviewOffsetY.value = 0
  mediaPreviewGesture = null
  mediaPreviewHadMultipleTouches = false
}

function updateMediaPreviewPinch(touches: TouchList) {
  if (!mediaPreviewGesture || mediaPreviewGesture.kind !== 'pinch') return
  const midpoint = mediaTouchMidpoint(touches)
  const scale = Math.max(1, Math.min(4, mediaPreviewGesture.startScale * mediaTouchDistance(touches) / mediaPreviewGesture.startDistance))
  mediaPreviewScale.value = scale
  const offset = clampMediaPreviewOffset(
    mediaPreviewGesture.startOffsetX + midpoint.x - mediaPreviewGesture.startMidX,
    mediaPreviewGesture.startOffsetY + midpoint.y - mediaPreviewGesture.startMidY,
    scale,
  )
  mediaPreviewOffsetX.value = offset.x
  mediaPreviewOffsetY.value = offset.y
}

/** 图片/视频放大后长按：弹出与消息列表一致的操作菜单（转发/编辑/定位/保存/收藏等）。 */
function openPreviewMediaActions(kind: 'image' | 'video') {
  const msg = kind === 'image' ? imagePreviewMsg : videoPlayerMsg
  if (!msg) return
  activeMsg.value = msg
  msgActionsFromPreview.value = true
  mediaPreviewMenuOpen.value = true
  // 长按不关闭预览：操作菜单以更高层级显示在预览之上，取消后回到预览。
  // 选择具体操作时再由 onMsgAction 关闭预览。
  showMsgSheet.value = true
}

function onPreviewMediaLongPressStart(kind: 'image' | 'video', e: TouchEvent) {
  e.stopPropagation()
  startMediaLongPress(e, () => openPreviewMediaActions(kind))
}

function onPreviewMediaTouchStart(kind: 'image' | 'video', e: TouchEvent) {
  // Keep the gesture local to the media element. Otherwise the overlay's
  // swipe/click handlers can close the preview while Android is dispatching a
  // long-press sequence.
  e.stopPropagation()
  if (e.touches.length >= 2) {
    clearMediaLongPress()
    const midpoint = mediaTouchMidpoint(e.touches)
    mediaPreviewGesture = {
      kind: 'pinch',
      startDistance: mediaTouchDistance(e.touches),
      startScale: mediaPreviewScale.value,
      startOffsetX: mediaPreviewOffsetX.value,
      startOffsetY: mediaPreviewOffsetY.value,
      startMidX: midpoint.x,
      startMidY: midpoint.y,
    }
    mediaPreviewHadMultipleTouches = true
    e.preventDefault()
    return
  }
  const touch = e.touches[0]
  if (!touch) return
  onMediaSwipeStart(e)
  mediaPreviewGesture = {
    kind: 'pan',
    startX: touch.clientX,
    startY: touch.clientY,
    startOffsetX: mediaPreviewOffsetX.value,
    startOffsetY: mediaPreviewOffsetY.value,
  }
  onPreviewMediaLongPressStart(kind, e)
  if (mediaPreviewScale.value > 1) e.preventDefault()
}

function onPreviewMediaTouchMove(e: TouchEvent) {
  e.stopPropagation()
  if (e.touches.length >= 2) {
    clearMediaLongPress()
    mediaPreviewHadMultipleTouches = true
    updateMediaPreviewPinch(e.touches)
    e.preventDefault()
    return
  }
  if (mediaPreviewGesture?.kind === 'pan' && mediaPreviewScale.value > 1) {
    const touch = e.touches[0]
    if (touch) {
      const offset = clampMediaPreviewOffset(
        mediaPreviewGesture.startOffsetX + touch.clientX - mediaPreviewGesture.startX,
        mediaPreviewGesture.startOffsetY + touch.clientY - mediaPreviewGesture.startY,
      )
      mediaPreviewOffsetX.value = offset.x
      mediaPreviewOffsetY.value = offset.y
      clearMediaLongPress()
      e.preventDefault()
    }
    return
  }
  moveMediaLongPress(e)
}

function onPreviewMediaTouchEnd(e: TouchEvent) {
  e.stopPropagation()
  const hadMultipleTouches = mediaPreviewHadMultipleTouches || mediaPreviewGesture?.kind === 'pinch'
  if (e.touches.length === 1 && hadMultipleTouches) {
    const touch = e.touches[0]
    if (touch) {
      mediaPreviewGesture = {
        kind: 'pan',
        startX: touch.clientX,
        startY: touch.clientY,
        startOffsetX: mediaPreviewOffsetX.value,
        startOffsetY: mediaPreviewOffsetY.value,
      }
    }
    endMediaLongPress()
    return
  }
  if (!e.touches.length && !hadMultipleTouches && mediaPreviewScale.value <= 1) {
    onMediaSwipeEnd(e)
  }
  endMediaLongPress()
  if (!e.touches.length) {
    mediaPreviewGesture = null
    mediaPreviewHadMultipleTouches = false
  }
}

function onPreviewMediaTouchCancel(e: TouchEvent) {
  e.stopPropagation()
  endMediaLongPress()
  resetMediaPreviewGesture()
}

function onPreviewMediaContextMenu(kind: 'image' | 'video', e: Event) {
  e.preventDefault()
  e.stopPropagation()
  clearMediaLongPress()
  openPreviewMediaActions(kind)
}

function pushMediaPreviewHistory() {
  if (mediaPreviewHistoryActive) return
  window.history.pushState({ ...window.history.state, pulseMediaPreview: true }, '')
  mediaPreviewHistoryActive = true
}

function consumeMediaPreviewHistory() {
  if (!mediaPreviewHistoryActive) return
  mediaPreviewHistoryActive = false
  window.history.back()
}

function onMediaPreviewPopState() {
  if (!mediaPreviewHistoryActive) return
  mediaPreviewHistoryActive = false
  if (imagePreviewVisible.value) closeImagePreview(false)
  if (videoPlayerVisible.value) closeVideoPlayer(false)
}

function onMediaSwipeStart(event: TouchEvent) {
  const touch = event.touches[0]
  if (!touch) return
  mediaSwipeStartX = touch.clientX
  mediaSwipeStartY = touch.clientY
}

function onMediaSwipeEnd(event: TouchEvent) {
  const touch = event.changedTouches[0]
  if (!touch) return
  const dx = touch.clientX - mediaSwipeStartX
  const dy = touch.clientY - mediaSwipeStartY
  if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.25) {
    // 从左向右滑切上一张，从右向左滑切下一张。
    void switchMediaPreview(dx < 0 ? 1 : -1)
  }
}

function previewableMediaMessages(msg: ChatMessage): ChatMessage[] {
  return messages.value.filter((m) =>
    !m.recalled
    && ((m.msgType === 1 && !!imageUrlOf(m)) || (m.msgType === 2 && isVideoMsg(m) && !!videoUrlOf(m)))
    && !isBurnMediaLocked(m)
    && isBurnMessage(m) === isBurnMessage(msg),
  )
}

async function switchMediaPreview(delta: number) {
  const current = imagePreviewMsg || videoPlayerMsg
  if (!current) return
  const list = previewableMediaMessages(current)
  if (list.length < 2) return
  const currentIndex = list.findIndex((m) => m.id === current.id)
  if (currentIndex < 0) return
  const nextIndex = currentIndex + delta
  if (nextIndex < 0 || nextIndex >= list.length) return
  const nextMsg = list[nextIndex]
  imagePreviewList.value = list
  imagePreviewIndex.value = nextIndex
  if (nextMsg.msgType === 1) {
    if (videoPlayerVisible.value) closeVideoPlayer(false)
    await openImagePreview(nextMsg)
  } else {
    if (imagePreviewVisible.value) closeImagePreview(false)
    await openVideoPlayer(nextMsg)
  }
}

function isAndroidDevice(): boolean {
  return /Android/i.test(navigator.userAgent || '')
}

/** 仅安卓难播：明确 HEVC/H.265。不要把所有 .mov 都判死（很多是 H.264，可页内播） */
function isHardToPlayInline(msg: ChatMessage): boolean {
  if (!isAndroidDevice()) return false
  const f = fileOf(msg)
  if (!f) return false
  const ct = (f.contentType || '').toLowerCase()
  if (ct.includes('hevc') || ct.includes('h265')) return true
  return false
}

function toAbsoluteMediaUrl(url: string): string {
  void isHardToPlayInline
  const resolved = resolveFileUrl(url)
  if (!resolved) return ''
  if (/^https?:\/\//i.test(resolved) || resolved.startsWith('blob:') || resolved.startsWith('data:')) {
    return resolved
  }
  return `${window.location.origin}${resolved.startsWith('/') ? '' : '/'}${resolved}`
}

function revokeVideoBlob() {
  if (videoBlobUrl) {
    URL.revokeObjectURL(videoBlobUrl)
    videoBlobUrl = ''
  }
}

function mergeVideoMetadata(message: ChatMessage, metadata: Awaited<ReturnType<typeof fetchFileMetadata>>): ChatMessage {
  const payload = parseFilePayload(message.content)
  if (!payload?.fileId) return message
  const merged = { ...payload, ...metadata, fileId: payload.fileId }
  const msgType = normalizeMessageType(message.msgType, message.content, merged)
  const next = {
    ...message,
    msgType,
    content: JSON.stringify(merged),
    fileId: payload.fileId,
  }
  const index = messages.value.findIndex((item) => item.id === message.id)
  if (index >= 0) {
    messages.value[index] = next
    syncConversationPreviewFromMessages()
  }
  return next
}

/** Wait briefly for the server-created MP4 rendition without selecting the
 * original file for a normal play action. */
async function waitForVideoPreview(
  message: ChatMessage,
  maxAttempts = 3,
  intervalMs = 350,
): Promise<ChatMessage> {
  let current = message
  const initial = parseFilePayload(current.content)
  if (!initial?.fileId || initial.previewUrl) return current
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const metadata = await fetchFileMetadata(initial.fileId)
      current = mergeVideoMetadata(current, metadata)
      if (parseFilePayload(current.content)?.previewUrl) return current
    } catch {
      // The upload metadata can be briefly unavailable while the background
      // rendition job is being committed.
    }
    if (attempt < maxAttempts - 1) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, intervalMs))
    }
  }
  return current
}

async function openVideoPlayer(msg: ChatMessage, forceOriginal = false) {
  if (multiMode.value) return
  if (!(await unlockBurnMedia(msg))) return
  const wantOriginal = forceOriginal || originalSentOf(msg) || usesMediaOriginal(msg)
  const openToken = ++videoPlayerOpenToken
  videoPlayerMsg = msg
  videoPlayerErrorAttempts = 0
  videoPlayerCacheFallbackAttempted = false
  imagePreviewList.value = previewableMediaMessages(msg)
  imagePreviewIndex.value = Math.max(0, imagePreviewList.value.findIndex((m) => m.id === msg.id))
  resetMediaPreviewGesture()
  videoPlayerLoading.value = true
  videoPlayerPreparingPreview.value = false
  videoPlayerReady.value = false
  videoPlayerUrl.value = ''
  videoPlayerVisible.value = true
  pushMediaPreviewHistory()
  // Normal playback should use the server's compatible rendition. Waiting a
  // few short polls is much cheaper than immediately downloading an HEVC
  // original that Android WebView may not decode.
  const playableMessage = wantOriginal ? msg : await waitForVideoPreview(msg)
  if (openToken !== videoPlayerOpenToken || !videoPlayerVisible.value) return
  const loaded = await loadVideoPlaybackMedia(playableMessage, wantOriginal ? 'original' : 'preview')
  if (!loaded.url) {
    // A just-uploaded video has no previewUrl until the background ffmpeg
    // job commits the compressed MP4. Keep the overlay alive and attach it
    // automatically instead of closing the player or downloading original.
    if (!wantOriginal) {
      videoPlayerPreparingPreview.value = true
      void waitForVideoPlaybackRendition(playableMessage, openToken)
    } else {
      videoPlayerLoading.value = false
    }
    return
  }
  if (!(await activateVideoPlayerSource(playableMessage, loaded, openToken))) return
  if (wantOriginal) rememberMediaOriginal(playableMessage)
}

let videoPlayerVariant: ChatCacheVariant = 'preview'

async function openOriginalVideo() {
  const msg = videoPlayerMsg
  if (!msg || !videoOriginalUrlOf(msg)) return
  const openToken = ++videoPlayerOpenToken
  try {
    videoPlayerLoading.value = true
    videoPlayerPreparingPreview.value = false
    const loaded = await loadChatMedia(msg, 'original')
    if (openToken !== videoPlayerOpenToken || !videoPlayerVisible.value) return
    if (!loaded.url) throw new Error('原视频不存在')
    markChatCacheInUse(fileOf(msg)?.fileId || '', videoPlayerVariant, false)
    markChatCacheInUse(fileOf(msg)?.fileId || '', loaded.variant, true)
    videoPlayerVariant = loaded.variant
    rememberMediaOriginal(msg)
    videoPlayerUrl.value = loaded.url
    videoPlayerLoading.value = false
    videoPlayerErrorAttempts = 0
    videoPlayerReady.value = false
    void nextTick(() => {
      const el = videoPlayerRef.value
      if (el) { el.load(); void el.play().catch(() => undefined) }
    })
  } catch {
    if (openToken !== videoPlayerOpenToken || !videoPlayerVisible.value) return
    videoPlayerPreparingPreview.value = false
    videoPlayerLoading.value = false
  }
}

async function onVideoPlayerError() {
  if (!videoPlayerVisible.value || videoPlayerLoading.value) return
  const msg = videoPlayerMsg
  if (!msg) return
  videoPlayerErrorAttempts += 1
  if (videoPlayerErrorAttempts > 3) {
    return
  }

  videoPlayerLoading.value = true
  try {
    // A native <video> request cannot attach the bearer header. If the
    // cookie-backed Range request is rejected, download only the compressed
    // rendition as a local fallback. Never silently download the original.
    if (videoPlayerVariant === 'preview' && !videoPlayerCacheFallbackAttempted) {
      videoPlayerCacheFallbackAttempted = true
      const fileId = fileOf(msg)?.fileId || parseFilePayload(msg.content)?.fileId || ''
      if (fileId) {
        const previewSource = parseFilePayload(msg.content)?.previewUrl
          || fileDownloadUrl(fileId, 'preview')
        try {
          const cached = await cacheChatFile('video', fileId, 'preview', toAbsoluteMediaUrl(resolveFileUrl(previewSource)))
          if (cached && videoPlayerVisible.value) {
            revokeVideoBlob()
            videoBlobUrl = cached
            videoPlayerUrl.value = cached
            videoPlayerReady.value = false
            videoPlayerLoading.value = false
            await nextTick()
            const el = videoPlayerRef.value
            if (el) { el.load(); void el.play().catch(() => undefined) }
            return
          }
        } catch {
          // Continue with metadata polling below; the preview may still be
          // finishing on the server.
        }
      }
    }

    const fileId = fileOf(msg)?.fileId || parseFilePayload(msg.content)?.fileId || ''
    if (fileId) {
      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          const metadata = await fetchFileMetadata(fileId)
          const latest = mergeVideoMetadata(msg, metadata)
          videoPlayerMsg = latest
          const preview = await loadVideoPlaybackMedia(latest, 'preview')
          if (preview.url && preview.url !== videoPlayerUrl.value) {
            markChatCacheInUse(fileId, videoPlayerVariant, false)
            markChatCacheInUse(fileId, preview.variant, true)
            videoPlayerVariant = preview.variant
            videoPlayerUrl.value = preview.url
            videoPlayerReady.value = false
            await nextTick()
            const el = videoPlayerRef.value
            if (el) { el.load(); void el.play().catch(() => undefined) }
            return
          }
        } catch {
          // Keep retrying while the server is committing the video rendition.
        }
        if (attempt < 5) await new Promise<void>((resolve) => window.setTimeout(resolve, 700))
      }
    }
  } catch {
  } finally {
    videoPlayerLoading.value = false
  }
}

/** 必须在按钮点击里调用，安卓才允许 play() */
function playVideoFromButton() {
  const el = videoPlayerRef.value
  if (!el) {
    return
  }
  el.muted = false
  el.playsInline = true
  const p = el.play()
  if (p && typeof p.then === 'function') {
    void p.then(() => {
      // 部分安卓需要再点一次进全屏才有声画，这里不强制
    }).catch(() => undefined)
  }
}

function onInlineVideoPlaying(event: Event) {
  void playVideoFromButton
  videoPlayerReady.value = true
  videoPlayerErrorAttempts = 0
  const video = event.currentTarget as HTMLVideoElement
  video.muted = false
}

function closeVideoPlayer(consumeHistory = true) {
  if (!videoPlayerVisible.value) return
  videoPlayerOpenToken += 1
  const el = videoPlayerRef.value
  if (el) {
    try {
      el.onerror = null
      el.pause()
      el.removeAttribute('src')
      el.load()
    } catch {
      /* ignore */
    }
  }
  videoPlayerVisible.value = false
  markChatCacheInUse(videoPlayerMsg ? fileOf(videoPlayerMsg)?.fileId || '' : '', videoPlayerVariant, false)
  resetMediaPreviewGesture()
  videoPlayerUrl.value = ''
  videoPlayerLoading.value = false
  videoPlayerPreparingPreview.value = false
  videoPlayerReady.value = false
  videoPlayerErrorAttempts = 0
  videoPlayerMsg = null
  mediaPreviewMenuOpen.value = false
  revokeVideoBlob()
  if (consumeHistory) consumeMediaPreviewHistory()
}

function contactCardOf(msg: ChatMessage) {
  return msg.msgType === 5 ? parseContactCard(msg.content) : null
}

async function openImagePreview(msg: ChatMessage, forceOriginal = false) {
  if (multiMode.value) return
  if (!(await unlockBurnMedia(msg))) return
  let loaded: { url: string; variant: ChatCacheVariant }
  try {
    const preferOriginal = forceOriginal || originalSentOf(msg) || usesMediaOriginal(msg)
    loaded = await loadChatMedia(msg, preferOriginal ? 'original' : 'preview')
    // Keep inline bubbles conservative, but allow an explicit tap to open
    // legacy files whose compressed rendition is unavailable.
    if (!loaded.url && loaded.variant !== 'original') loaded = await loadChatMedia(msg, 'original')
  } catch { showToast('图片加载失败'); return }
  if (!loaded.url) return
  const list = previewableMediaMessages(msg)
  imagePreviewList.value = list
  const idx = list.findIndex((m) => m.id === msg.id)
  imagePreviewIndex.value = idx >= 0 ? idx : 0
  resetMediaPreviewGesture()
  imagePreviewMsg = msg
  imagePreviewUrl.value = loaded.url
  markChatCacheInUse(fileOf(msg)?.fileId || parseFilePayload(msg.content)?.fileId || '', loaded.variant, true)
  imagePreviewVariant = loaded.variant
  if (forceOriginal) rememberMediaOriginal(msg)
  imagePreviewVisible.value = true
  pushMediaPreviewHistory()
}

function openOriginalFromBubble(msg: ChatMessage) {
  if (msg.msgType === 1) void openImagePreview(msg, true)
  else if (msg.msgType === 2) void openVideoPlayer(msg, true)
}

let imagePreviewVariant: ChatCacheVariant = 'preview'

async function openOriginalImage() {
  const msg = imagePreviewMsg
  if (!msg || !imageOriginalUrlOf(msg)) return
  try {
    const loaded = await loadChatMedia(msg, 'original')
    if (!loaded.url) throw new Error('原图不存在')
    const fileId = parseFilePayload(msg.content)?.fileId || ''
    markChatCacheInUse(fileId, imagePreviewVariant, false)
    markChatCacheInUse(fileId, loaded.variant, true)
    imagePreviewVariant = loaded.variant
    rememberMediaOriginal(msg)
    imagePreviewUrl.value = loaded.url
  } catch (error) {
    showToast(error instanceof Error ? error.message : '原图加载失败')
  }
}

function closeImagePreview(consumeHistory = true) {
  const fileId = parseFilePayload(imagePreviewMsg?.content)?.fileId || ''
  markChatCacheInUse(fileId, imagePreviewVariant, false)
  imagePreviewVisible.value = false
  resetMediaPreviewGesture()
  imagePreviewUrl.value = ''
  imagePreviewMsg = null
  mediaPreviewMenuOpen.value = false
  if (consumeHistory) consumeMediaPreviewHistory()
}

function closeImagePreviewFromOverlay() {
  if (mediaPreviewMenuOpen.value) return
  closeImagePreview()
}

function onImagePreviewError() {
  // Do not leave an <img src="">/broken-image fallback in the overlay's
  // closing transition. That fallback renders the alt text and image icon at
  // the top-left corner on Android WebView.
  closeImagePreview()
}

function closeVideoPlayerFromOverlay() {
  if (mediaPreviewMenuOpen.value) return
  closeVideoPlayer()
}

function renderImageEditorCanvas() {
  const image = imageEditorImage.value
  const canvas = imageEditorCanvas.value
  if (!image || !canvas) return
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  if (!width || !height) return
  const rotation = ((imageEditorRotation.value % 360) + 360) % 360
  const quarterTurn = rotation === 90 || rotation === 270
  const rw = quarterTurn ? height : width
  const rh = quarterTurn ? width : height
  // Keep the interactive canvas bounded on mobile. The final export still
  // renders from the original image in buildEditedCanvas().
  const renderScale = Math.min(1, IMAGE_EDITOR_MAX_EDGE / Math.max(rw, rh))
  const renderWidth = Math.max(1, Math.round(rw * renderScale))
  const renderHeight = Math.max(1, Math.round(rh * renderScale))
  imageEditorRotatedSize.value = { w: renderWidth, h: renderHeight }

  // 先把旋转后的缩小图绘制到临时画布，减少移动端每次重绘的数据量。
  const temp = document.createElement('canvas')
  temp.width = renderWidth
  temp.height = renderHeight
  const tctx = temp.getContext('2d')
  if (!tctx) return
  tctx.save()
  if (rotation === 90) {
    tctx.translate(renderWidth, 0)
    tctx.rotate(Math.PI / 2)
    tctx.drawImage(image, 0, 0, width, height, 0, 0, renderHeight, renderWidth)
  } else if (rotation === 180) {
    tctx.translate(renderWidth, renderHeight)
    tctx.rotate(Math.PI)
    tctx.drawImage(image, 0, 0, width, height, 0, 0, renderWidth, renderHeight)
  } else if (rotation === 270) {
    tctx.translate(0, renderHeight)
    tctx.rotate(-Math.PI / 2)
    tctx.drawImage(image, 0, 0, width, height, 0, 0, renderHeight, renderWidth)
  } else {
    tctx.drawImage(image, 0, 0, width, height, 0, 0, renderWidth, renderHeight)
  }
  tctx.restore()

  canvas.width = renderWidth
  canvas.height = renderHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.imageSmoothingEnabled = true
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(temp, 0, 0)
  drawImageEditorStrokes(ctx, renderWidth, renderHeight)
  const rect = imageEditorCropRect.value
  if (rect) drawImageEditorCropOverlay(ctx, renderWidth, renderHeight, rect)
}

function drawImageEditorStrokes(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#ff3b30'
  imageEditorStrokes.forEach((stroke) => {
    const points = stroke.points
    if (!points.length) return
    ctx.lineWidth = Math.max(2, stroke.width * width)
    if (points.length === 1) {
      ctx.beginPath()
      ctx.arc(points[0].x * width, points[0].y * height, ctx.lineWidth / 2, 0, Math.PI * 2)
      ctx.fillStyle = ctx.strokeStyle
      ctx.fill()
      return
    }
    ctx.beginPath()
    ctx.moveTo(points[0].x * width, points[0].y * height)
    for (let index = 1; index < points.length - 1; index += 1) {
      const current = points[index]
      const next = points[index + 1]
      const midpoint = {
        x: (current.x + next.x) / 2,
        y: (current.y + next.y) / 2,
      }
      ctx.quadraticCurveTo(
        current.x * width,
        current.y * height,
        midpoint.x * width,
        midpoint.y * height,
      )
    }
    const last = points[points.length - 1]
    const previous = points[points.length - 2]
    ctx.quadraticCurveTo(
      previous.x * width,
      previous.y * height,
      last.x * width,
      last.y * height,
    )
    ctx.stroke()
  })
  ctx.restore()
}

function drawImageEditorCropOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  rect: { x: number; y: number; w: number; h: number },
) {
  const x = Math.max(0, Math.min(w, rect.x * w))
  const y = Math.max(0, Math.min(h, rect.y * h))
  const bw = Math.max(0, Math.min(w - x, rect.w * w))
  const bh = Math.max(0, Math.min(h - y, rect.h * h))
  ctx.save()
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
  ctx.fillRect(0, 0, w, y)
  ctx.fillRect(0, y + bh, w, h - y - bh)
  ctx.fillRect(0, y, x, bh)
  ctx.fillRect(x + bw, y, w - x - bw, bh)
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = Math.max(1.5, w / 320)
  ctx.setLineDash([8, 6])
  ctx.strokeRect(x, y, bw, bh)
  ctx.setLineDash([])
  const hs = Math.max(10, Math.min(22, w / 34))
  ctx.fillStyle = '#ffffff'
  const corners: Array<[number, number]> = [[x, y], [x + bw, y], [x, y + bh], [x + bw, y + bh]]
  corners.forEach(([cx, cy]) => {
    ctx.fillRect(cx - hs / 2, cy - hs / 2, hs, hs)
  })
  ctx.restore()
}

function resetImageEditorDrawing() {
  if (imageEditorDrawingFrame) {
    window.cancelAnimationFrame(imageEditorDrawingFrame)
    imageEditorDrawingFrame = 0
  }
  imageEditorPendingPoints = []
  imageEditorCurrentStroke = null
  imageEditorLastPoint = null
  imageEditorLastMidpoint = null
  imageEditorDrawingActive.value = false
  imageEditorDrawing.value = false
}

function imageEditorCanvasPoint(event: PointerEvent) {
  const canvas = imageEditorCanvas.value
  if (!canvas) return null
  const rect = canvas.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height),
  }
}

function imageEditorCropHit(point: { x: number; y: number }): '' | 'move' | 'nw' | 'ne' | 'sw' | 'se' {
  const canvas = imageEditorCanvas.value
  const rect = imageEditorCropRect.value
  if (!canvas || !rect) return ''
  const hs = Math.max(10, Math.min(22, canvas.width / 34)) * 1.2
  const x = rect.x * canvas.width
  const y = rect.y * canvas.height
  const w = rect.w * canvas.width
  const h = rect.h * canvas.height
  const near = (px: number, py: number, cx: number, cy: number) =>
    Math.abs(px - cx) <= hs && Math.abs(py - cy) <= hs
  if (near(point.x, point.y, x, y)) return 'nw'
  if (near(point.x, point.y, x + w, y)) return 'ne'
  if (near(point.x, point.y, x, y + h)) return 'sw'
  if (near(point.x, point.y, x + w, y + h)) return 'se'
  if (point.x >= x && point.x <= x + w && point.y >= y && point.y <= y + h) return 'move'
  return ''
}

function onImageEditorPointerDown(event: PointerEvent) {
  if (imageEditorCropRect.value) {
    const point = imageEditorCanvasPoint(event)
    if (!point) return
    const hit = imageEditorCropHit(point)
    if (!hit) return
    event.preventDefault()
    imageEditorCanvas.value?.setPointerCapture?.(event.pointerId)
    imageEditorCropDrag.value = hit
    imageEditorCropDragStart.value = {
      x: event.clientX,
      y: event.clientY,
      rect: { ...imageEditorCropRect.value },
    }
    return
  }
  startImageEditorDrawing(event)
}

function onImageEditorPointerMove(event: PointerEvent) {
  if (imageEditorCropDrag.value && imageEditorCropDragStart.value) {
    moveImageEditorCrop(event)
    return
  }
  moveImageEditorDrawing(event)
}

function onImageEditorPointerUp(event: PointerEvent) {
  if (imageEditorCropDrag.value) {
    endImageEditorCrop(event)
    return
  }
  endImageEditorDrawing(event)
}

function moveImageEditorCrop(event: PointerEvent) {
  const start = imageEditorCropDragStart.value
  const handle = imageEditorCropDrag.value
  const canvas = imageEditorCanvas.value
  if (!start || !handle || !canvas) return
  const rect = canvas.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  const dx = (event.clientX - start.x) / rect.width
  const dy = (event.clientY - start.y) / rect.height
  const r = { ...start.rect }
  const min = 0.1
  if (handle === 'move') {
    r.x = Math.max(0, Math.min(1 - r.w, start.rect.x + dx))
    r.y = Math.max(0, Math.min(1 - r.h, start.rect.y + dy))
  } else {
    let left = start.rect.x
    let top = start.rect.y
    let right = start.rect.x + start.rect.w
    let bottom = start.rect.y + start.rect.h
    if (handle.includes('w')) left = start.rect.x + dx
    if (handle.includes('e')) right = start.rect.x + start.rect.w + dx
    if (handle.includes('n')) top = start.rect.y + dy
    if (handle.includes('s')) bottom = start.rect.y + start.rect.h + dy
    left = Math.max(0, Math.min(left, right - min))
    right = Math.min(1, Math.max(right, left + min))
    top = Math.max(0, Math.min(top, bottom - min))
    bottom = Math.min(1, Math.max(bottom, top + min))
    r.x = left
    r.y = top
    r.w = right - left
    r.h = bottom - top
  }
  imageEditorCropRect.value = r
  void renderImageEditorCanvas()
}

function endImageEditorCrop(event?: PointerEvent) {
  if (event && imageEditorCanvas.value?.hasPointerCapture?.(event.pointerId)) {
    imageEditorCanvas.value.releasePointerCapture?.(event.pointerId)
  }
  imageEditorCropDrag.value = ''
  imageEditorCropDragStart.value = null
}

function startImageEditorDrawing(event: PointerEvent) {
  if (!imageEditorDrawing.value) return
  const point = imageEditorCanvasPoint(event)
  const canvas = imageEditorCanvas.value
  const ctx = canvas?.getContext('2d')
  if (!point || !canvas || !ctx) return
  event.preventDefault()
  pushImageEditorSnapshot()
  imageEditorDrawingDirty = true
  canvas.setPointerCapture?.(event.pointerId)
  imageEditorDrawingActive.value = true
  const width = Math.max(5, Math.min(18, canvas.width / 180))
  imageEditorCurrentStroke = { points: [{ x: point.x / canvas.width, y: point.y / canvas.height }], width: width / canvas.width }
  imageEditorStrokes.push(imageEditorCurrentStroke)
  imageEditorLastPoint = point
  imageEditorLastMidpoint = point
  imageEditorPendingPoints = []
  ctx.beginPath()
  ctx.arc(point.x, point.y, width / 2, 0, Math.PI * 2)
  ctx.fillStyle = '#ff3b30'
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(point.x, point.y)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#ff3b30'
  ctx.lineWidth = width
}

function moveImageEditorDrawing(event: PointerEvent) {
  if (!imageEditorDrawing.value || !imageEditorDrawingActive.value) return
  event.preventDefault()
  const events = event.getCoalescedEvents?.() || [event]
  events.forEach((coalescedEvent) => {
    const point = imageEditorCanvasPoint(coalescedEvent)
    if (point) imageEditorPendingPoints.push(point)
  })
  scheduleImageEditorDrawing()
}

function endImageEditorDrawing(event?: PointerEvent) {
  if (!imageEditorDrawingActive.value) return
  if (event) {
    const events = event.getCoalescedEvents?.() || [event]
    events.forEach((coalescedEvent) => {
      const point = imageEditorCanvasPoint(coalescedEvent)
      if (point) imageEditorPendingPoints.push(point)
    })
  }
  flushImageEditorDrawing()
  const canvas = imageEditorCanvas.value
  const ctx = canvas?.getContext('2d')
  if (ctx && imageEditorLastPoint && imageEditorLastMidpoint) {
    ctx.beginPath()
    ctx.moveTo(imageEditorLastMidpoint.x, imageEditorLastMidpoint.y)
    ctx.lineTo(imageEditorLastPoint.x, imageEditorLastPoint.y)
    ctx.stroke()
  }
  if (event && imageEditorCanvas.value?.hasPointerCapture?.(event.pointerId)) {
    imageEditorCanvas.value.releasePointerCapture?.(event.pointerId)
  }
  imageEditorDrawingActive.value = false
  imageEditorCurrentStroke = null
  imageEditorLastPoint = null
  imageEditorLastMidpoint = null
}

function scheduleImageEditorDrawing() {
  if (imageEditorDrawingFrame || !imageEditorPendingPoints.length) return
  imageEditorDrawingFrame = window.requestAnimationFrame(() => {
    imageEditorDrawingFrame = 0
    drawPendingImageEditorPoints()
  })
}

function flushImageEditorDrawing() {
  if (imageEditorDrawingFrame) {
    window.cancelAnimationFrame(imageEditorDrawingFrame)
    imageEditorDrawingFrame = 0
  }
  drawPendingImageEditorPoints()
}

function drawPendingImageEditorPoints() {
  const canvas = imageEditorCanvas.value
  const ctx = canvas?.getContext('2d')
  const stroke = imageEditorCurrentStroke
  if (!canvas || !ctx || !stroke || !imageEditorLastPoint) {
    imageEditorPendingPoints = []
    return
  }
  const points = imageEditorPendingPoints.splice(0)
  if (!points.length) return
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#ff3b30'
  ctx.lineWidth = Math.max(5, Math.min(18, canvas.width * stroke.width))
  ctx.beginPath()
  points.forEach((point) => {
    const normalized = { x: point.x / canvas.width, y: point.y / canvas.height }
    stroke.points.push(normalized)
    const last = imageEditorLastPoint!
    const midpoint = { x: (last.x + point.x) / 2, y: (last.y + point.y) / 2 }
    const start = imageEditorLastMidpoint || last
    ctx.moveTo(start.x, start.y)
    ctx.quadraticCurveTo(last.x, last.y, midpoint.x, midpoint.y)
    imageEditorLastPoint = point
    imageEditorLastMidpoint = midpoint
  })
  ctx.stroke()
}

function resetImageEditorState() {
  imageEditorRotation.value = 0
  imageEditorCropSquare.value = false
  imageEditorCropRect.value = null
  imageEditorCropDrag.value = ''
  imageEditorCropDragStart.value = null
  resetImageEditorDrawing()
  imageEditorDrawing.value = false
  imageEditorDrawingDirty = false
  imageEditorUndoStack.value = []
  imageEditorRedoStack.value = []
  imageEditorStrokes.length = 0
  imageEditorImage.value = null
  imageEditorLoading.value = true
}

async function bindImageEditorSource(objectUrl: string) {
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('image decode failed'))
      el.src = objectUrl
    })
    imageEditorImage.value = image
    imageEditorLoading.value = false
    void nextTick(renderImageEditorCanvas)
  } catch {
    imageEditorLoading.value = false
    showToast('图片加载失败')
  }
}

async function openImageEditor(msg: ChatMessage) {
  if (msg.msgType !== 1 || blockBurnExport(msg)) return
  const url = imageOriginalUrlOf(msg) || imageUrlOf(msg)
  if (!url) {
    showToast('图片加载失败')
    return
  }
  pendingSendFiles = []
  pendingSendIndex = 0
  resetImageEditorState()
  showImageEditor.value = true
  if (imageEditorObjectUrl) {
    URL.revokeObjectURL(imageEditorObjectUrl)
    imageEditorObjectUrl = ''
  }
  try {
    // 编辑前先把原图下载到本地临时 Blob，避免编辑器继续使用聊天缩略图地址。
    const response = await fetch(toAbsoluteMediaUrl(url), {
      credentials: 'include',
      mode: 'cors',
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const blob = await response.blob()
    if (!blob.size) throw new Error('empty image')
    imageEditorObjectUrl = URL.createObjectURL(blob)
    await bindImageEditorSource(imageEditorObjectUrl)
  } catch {
    imageEditorLoading.value = false
    showToast('图片加载失败')
  }
}

/** 发送前编辑：选择图片后先进入编辑器，可画笔/裁剪/旋转，确认后发送。 */
async function openImageEditorForSend(files: File[], startIndex: number) {
  const imageFiles = files.filter((file) => isImageMediaFile(file))
  if (!imageFiles.length) return
  pendingSendFiles = imageFiles
  pendingSendIndex = Math.max(0, Math.min(startIndex, imageFiles.length - 1))
  resetImageEditorState()
  showImageEditor.value = true
  if (imageEditorObjectUrl) {
    URL.revokeObjectURL(imageEditorObjectUrl)
    imageEditorObjectUrl = ''
  }
  imageEditorObjectUrl = URL.createObjectURL(imageFiles[pendingSendIndex]!)
  await bindImageEditorSource(imageEditorObjectUrl)
}

/** 发送前编辑：多图时切换上一张/下一张，编辑过的图会保存编辑结果。 */
async function switchPendingSendImage(delta: number) {
  if (pendingSendFiles.length < 2 || imageEditorLoading.value) return
  const canvas = imageEditorCanvas.value
  if (canvas && (imageEditorRotation.value || imageEditorCropRect.value || imageEditorDrawingDirty)) {
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.92)
    })
    if (blob && blob.size >= 100) {
      pendingSendFiles[pendingSendIndex] = new File([blob], `pulse_edit_${Date.now()}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      })
    }
  }
  pendingSendIndex = (pendingSendIndex + delta + pendingSendFiles.length) % pendingSendFiles.length
  if (imageEditorObjectUrl) {
    URL.revokeObjectURL(imageEditorObjectUrl)
    imageEditorObjectUrl = ''
  }
  imageEditorObjectUrl = URL.createObjectURL(pendingSendFiles[pendingSendIndex]!)
  resetImageEditorState()
  await bindImageEditorSource(imageEditorObjectUrl)
}

function closeImageEditorInternal(returnToPicker: boolean) {
  showImageEditorExitPrompt.value = false
  showImageEditor.value = false
  pendingSendFiles = []
  pendingSendIndex = 0
  if (returnToPicker) mediaPickerEditIndex.value = null
  resetImageEditorState()
  if (imageEditorObjectUrl) {
    URL.revokeObjectURL(imageEditorObjectUrl)
    imageEditorObjectUrl = ''
  }
  const canvas = imageEditorCanvas.value
  if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
  if (returnToPicker) showMediaPicker.value = true
}

function closeImageEditor() {
  closeImageEditorInternal(mediaPickerEditIndex.value !== null)
}

function requestCloseImageEditor() {
  if (!showImageEditor.value) return
  showImageEditorExitPrompt.value = true
}

function cancelCloseImageEditor() {
  showImageEditorExitPrompt.value = false
}

function confirmCloseImageEditor() {
  showImageEditorExitPrompt.value = false
  closeImageEditor()
}

function rotateImageEditor() {
  resetImageEditorDrawing()
  pushImageEditorSnapshot()
  imageEditorStrokes.forEach((stroke) => {
    stroke.points = stroke.points.map((point) => ({ x: 1 - point.y, y: point.x }))
  })
  imageEditorRotation.value = (imageEditorRotation.value + 90) % 360
  renderImageEditorCanvas()
}

/** 保存当前画布快照，供撤销使用（画笔每笔、旋转前各一次）。 */
function pushImageEditorSnapshot() {
  const snapshot = currentImageEditorSnapshot()
  if (!snapshot) return
  imageEditorUndoStack.value.push(snapshot)
  if (imageEditorUndoStack.value.length > 20) imageEditorUndoStack.value.shift()
  imageEditorRedoStack.value = []
}

function currentImageEditorSnapshot(): ImageEditorSnapshot | null {
  const canvas = imageEditorCanvas.value
  if (!canvas) return null
  try {
    return {
      data: canvas.toDataURL('image/png'),
      rotation: imageEditorRotation.value,
      strokes: imageEditorStrokes.map((stroke) => ({
        width: stroke.width,
        points: stroke.points.map((point) => ({ ...point })),
      })),
    }
  } catch {
    return null
  }
}

function restoreImageEditorSnapshot(snapshot: ImageEditorSnapshot) {
  const image = new Image()
  image.onload = () => {
    const canvas = imageEditorCanvas.value
    if (!canvas) return
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(image, 0, 0)
    imageEditorStrokes.length = 0
    snapshot.strokes.forEach((stroke) => {
      imageEditorStrokes.push({
        width: stroke.width,
        points: stroke.points.map((point) => ({ ...point })),
      })
    })
    imageEditorRotation.value = snapshot.rotation
    imageEditorCropRect.value = null
    imageEditorCropDrag.value = ''
    imageEditorCropDragStart.value = null
    imageEditorDrawingDirty = true
  }
  image.src = snapshot.data
}

function canUndoImageEditor(): boolean {
  return imageEditorUndoStack.value.length > 0 || !!imageEditorCropRect.value
}

function canRedoImageEditor(): boolean {
  return imageEditorRedoStack.value.length > 0
}

/** 撤回上一步：优先取消未应用的裁剪框，再回退到上一张画布快照。 */
function undoImageEditor() {
  if (imageEditorCropRect.value) {
    imageEditorCropRect.value = null
    imageEditorCropDrag.value = ''
    imageEditorCropDragStart.value = null
    renderImageEditorCanvas()
    return
  }
  const snapshot = imageEditorUndoStack.value.pop()
  if (!snapshot) return
  const current = currentImageEditorSnapshot()
  if (current) imageEditorRedoStack.value.push(current)
  restoreImageEditorSnapshot(snapshot)
}

/** 重做上一步，和撤销按钮配套，方便逐步调整图片。 */
function redoImageEditor() {
  const snapshot = imageEditorRedoStack.value.pop()
  if (!snapshot) return
  const current = currentImageEditorSnapshot()
  if (current) imageEditorUndoStack.value.push(current)
  restoreImageEditorSnapshot(snapshot)
}

function toggleImageEditorCrop() {
  resetImageEditorDrawing()
  imageEditorDrawing.value = false
  if (imageEditorCropRect.value) {
    imageEditorCropRect.value = null
    imageEditorCropDrag.value = ''
    imageEditorCropDragStart.value = null
  } else {
    imageEditorCropRect.value = { x: 0.08, y: 0.08, w: 0.84, h: 0.84 }
  }
  renderImageEditorCanvas()
}

function toggleImageEditorDrawing() {
  if (imageEditorCropRect.value) return
  imageEditorDrawing.value = !imageEditorDrawing.value
  imageEditorDrawingActive.value = false
}

/** 生成最终编辑结果（旋转 + 裁剪 + 涂鸦），供发送使用。 */
function buildEditedCanvas(): HTMLCanvasElement | null {
  const image = imageEditorImage.value
  if (!image) return null
  const width = image.naturalWidth || image.width
  const height = image.naturalHeight || image.height
  if (!width || !height) return null
  const rotation = ((imageEditorRotation.value % 360) + 360) % 360
  const quarterTurn = rotation === 90 || rotation === 270
  const rw = quarterTurn ? height : width
  const rh = quarterTurn ? width : height
  const temp = document.createElement('canvas')
  temp.width = rw
  temp.height = rh
  const tctx = temp.getContext('2d')
  if (!tctx) return null
  tctx.save()
  if (rotation === 90) {
    tctx.translate(rw, 0)
    tctx.rotate(Math.PI / 2)
  } else if (rotation === 180) {
    tctx.translate(rw, rh)
    tctx.rotate(Math.PI)
  } else if (rotation === 270) {
    tctx.translate(0, rh)
    tctx.rotate(-Math.PI / 2)
  }
  tctx.drawImage(image, 0, 0, width, height, 0, 0, width, height)
  tctx.restore()
  drawImageEditorStrokes(tctx, rw, rh)

  const rect = imageEditorCropRect.value
  let sx = 0
  let sy = 0
  let sw = rw
  let sh = rh
  if (rect) {
    sx = Math.max(0, Math.round(rw * rect.x))
    sy = Math.max(0, Math.round(rh * rect.y))
    sw = Math.max(1, Math.min(rw - sx, Math.round(rw * rect.w)))
    sh = Math.max(1, Math.min(rh - sy, Math.round(rh * rect.h)))
  }
  const out = document.createElement('canvas')
  out.width = sw
  out.height = sh
  const octx = out.getContext('2d')
  if (!octx) return null
  octx.drawImage(temp, sx, sy, sw, sh, 0, 0, sw, sh)
  return out
}

async function sendEditedImage() {
  if (!imageEditorCanvas.value || imageEditorLoading.value) return
  if (!canChat.value) {
    showToast(chatBlockTip.value || '无法发送消息')
    return
  }
  showLoadingToast({ message: '正在处理图片...', forbidClick: true, duration: 0 })
  try {
    const edited = buildEditedCanvas()
    if (!edited) throw new Error('图片处理失败')
    const blob = await new Promise<Blob | null>((resolve) => {
      edited.toBlob(resolve, 'image/jpeg', 0.92)
    })
    if (!blob || blob.size < 100) throw new Error('图片处理失败')
    const file = new File([blob], `pulse_edit_${Date.now()}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    })
    closeToast()
    if (mediaPickerEditIndex.value !== null) {
      pendingSendFiles[pendingSendIndex] = file
      const next = mediaPickerFiles.value.slice()
      mediaPickerEditIndices.value.forEach((editIndex, index) => {
        if (next[editIndex] && pendingSendFiles[index]) next[editIndex] = pendingSendFiles[index]!
      })
      mediaPickerFiles.value = next
      mediaPickerEditIndex.value = null
      mediaPickerEditIndices.value = []
      closeImageEditorInternal(false)
      showMediaPicker.value = true
      return
    }
    if (pendingSendFiles.length) {
      // 发送前编辑：替换当前图后按多图流程一起发送
      pendingSendFiles[pendingSendIndex] = file
      const files = pendingSendFiles
      pendingSendFiles = []
      closeImageEditor()
      await sendImageFiles(files)
      return
    }
    closeImageEditor()
    await sendImageFile(file)
  } catch (e) {
    closeToast()
    showToast(e instanceof Error ? e.message : '图片处理失败')
  }
}

function openFileMsg(msg: ChatMessage) {
  if (blockBurnExport(msg)) return
  const f = fileOf(msg)
  if (isVideoMsg(msg)) {
    openVideoPlayer(msg)
    return
  }
  if (!f?.url) return
  openFilePreview({
    url: resolveFileUrl(f.url),
    fileId: f.fileId,
    name: f.name || '文件',
    size: f.size,
    contentType: f.contentType,
    onForward: () => {
      selectedIds.value = new Set([msg.id])
      void openForwardPicker()
    },
  })
}

function openContactCard(msg: ChatMessage) {
  const c = contactCardOf(msg)
  if (!c) return
  if (c.cardType === 'community' && c.communityId) {
    router.push(`/communities/${c.communityId}`)
    return
  }
  if (c.cardType === 'group' && c.conversationId) {
    router.push({
      path: `/group/${c.conversationId}/profile`,
      query: { title: c.nickname, avatar: c.avatarUrl || '', source: 'card' },
    })
    return
  }
  if (c.userId) router.push({ path: `/contacts/${c.userId}`, query: { source: 'card' } })
}

function msgLabel(msg: ChatMessage): string {
  if (isLiveLocationInvite(msg)) return '[实时位置共享]'
  switch (msg.msgType) {
    case 1:
      return '[图片]'
    case 2: {
      const f = parseFilePayload(msg.content)
      if (f?.contentType?.startsWith('video/') || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(f?.url || f?.name || '')) {
        return f?.name ? `[视频] ${f.name}` : '[视频]'
      }
      return f?.name ? `[文件] ${f.name}` : '[文件]'
    }
    case 3: {
      const f = parseFilePayload(msg.content)
      return f?.durationMs ? `[语音] ${formatVoiceDuration(f.durationMs)}` : '[语音]'
    }
    case 4: {
      const card = parseForwardCard(msg.content)
      return card?.title ? `[聊天记录] ${card.title}` : '[聊天记录]'
    }
    case 5: {
      const c = parseContactCard(msg.content)
      if (c?.cardType === 'community') return `[圈子] ${c.nickname}`
      if (!c) return '[名片]'
      return c.cardType === 'group' ? `[群名片] ${c.nickname}` : `[名片] ${c.nickname}`
    }
    case 6: {
      const location = parseLocationPayload(msg.content)
      return location ? `[位置] ${location.name}` : '[位置]'
    }
    case 7: {
      const label = formatBusinessPreview(msg.content)
      return label && label !== msg.content ? label : '[红包]'
    }
    case 8: {
      const label = formatBusinessPreview(msg.content)
      return label && label !== msg.content ? label : '[转账]'
    }
    case 9:
      return systemTipText(msg.content, msg) || '[群提示]'
    default:
      return msg.content
  }
}

function isLiveLocationInvite(msg: ChatMessage): boolean {
  return msg.msgType === 0 && msg.content.startsWith('__PULSE_LIVE_LOCATION__')
}

const activeLiveLocationSession = ref<string | null>(null)
const liveLocationStateKnown = ref(false)

function liveLocationSessionOf(msg?: ChatMessage) {
  return msg?.content.startsWith('__PULSE_LIVE_LOCATION__:')
    ? msg.content.slice('__PULSE_LIVE_LOCATION__:'.length)
    : ''
}

async function refreshLiveLocationCardState() {
  try {
    const state = await fetchLiveLocation(conversationId.value)
    activeLiveLocationSession.value = state.active ? String(state.sessionId || '') : null
    liveLocationStateKnown.value = true
  } catch {
    /* Keep the last known state while offline. */
  }
}

function isLiveLocationEnded(msg: ChatMessage) {
  // Render conservatively before the state request finishes so expired cards do
  // not flash as active each time the chat page opens.
  if (!liveLocationStateKnown.value) return true
  const session = liveLocationSessionOf(msg)
  if (activeLiveLocationSession.value == null) return true
  // Legacy invites without a session id belong to an older sharing session;
  // never let them attach to a newly-created active session.
  return session !== activeLiveLocationSession.value
}

async function openLiveLocation(msg?: ChatMessage) {
  await refreshLiveLocationCardState()
  if (msg && isLiveLocationEnded(msg)) {
    showToast('位置共享已结束')
    return
  }
  const session = liveLocationSessionOf(msg)
  void router.push({
    path: `/chat/${conversationId.value}/live-location`,
    query: { title: peerTitle.value, type: isGroup.value ? 'group' : 'personal', entry: 'invite', session },
  })
}

function forwardCardOf(msg: ChatMessage): ForwardCardPayload | null {
  if (msg.msgType !== 4) return null
  return parseForwardCard(msg.content)
}

function openForwardDetail(msg: ChatMessage) {
  if (multiMode.value || msg.msgType !== 4) return
  router.push(`/chat/${conversationId.value}/forward/${encodeURIComponent(msg.id)}`)
}

function formatMsgTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const hm = d.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((startOfToday.getTime() - startOfMsg.getTime()) / 86400000)
  if (diffDays === 0) return hm
  if (diffDays === 1) return `昨天 ${hm}`
  if (d.getFullYear() !== now.getFullYear()) {
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${hm}`
  }
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`
}

function locationOf(msg: ChatMessage): LocationPayload | null {
  return msg.msgType === 6 ? parseLocationPayload(msg.content) : null
}

function openLocation(msg: ChatMessage) {
  const location = locationOf(msg)
  if (!location) return
  pendingMapLocation.value = location
  showMapSourceSheet.value = true
}

const mapSourceActions = [
  { name: '高德地图', icon: 'location-o' },
  { name: '腾讯地图', icon: 'location-o' },
  { name: '百度地图', icon: 'location-o' },
]

function bd09ToGcj02(latitude: number, longitude: number) {
  const x = longitude - 0.0065
  const y = latitude - 0.006
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * Math.PI)
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * Math.PI)
  return {
    latitude: z * Math.sin(theta),
    longitude: z * Math.cos(theta),
  }
}

function openMapAppWithFallback(appUrl: string, webUrl: string) {
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent)
  if (ios) {
    // HTTPS map links act as Universal Links when the app is installed and
    // remain valid Safari destinations when it is not.
    window.location.href = webUrl
    return
  }

  const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  if (!mobile) {
    window.open(webUrl, '_blank', 'noopener')
    return
  }

  let appOpened = false
  const markOpened = () => {
    if (document.hidden) appOpened = true
  }
  document.addEventListener('visibilitychange', markOpened)
  window.location.href = appUrl
  window.setTimeout(() => {
    document.removeEventListener('visibilitychange', markOpened)
    if (!appOpened && !document.hidden) window.location.href = webUrl
  }, 1300)
}

function onMapSourceSelect(action: { name: string }) {
  showMapSourceSheet.value = false
  const location = pendingMapLocation.value
  pendingMapLocation.value = null
  if (!location) return

  const name = location.name || '消息位置'
  const address = location.address || name

  if (action.name === '百度地图') {
    const lat = location.latitude.toFixed(6)
    const lon = location.longitude.toFixed(6)
    const source = /iPhone|iPad|iPod/i.test(navigator.userAgent)
      ? 'ios.PulseIM'
      : 'andr.PulseIM'
    const appQuery = new URLSearchParams({
      location: `${lat},${lon}`,
      title: name,
      content: address,
      src: source,
    })
    const webQuery = new URLSearchParams({
      location: `${lat},${lon}`,
      title: name,
      content: address,
      output: 'html',
      src: 'webapp.PulseIM',
    })
    openMapAppWithFallback(
      `baidumap://map/marker?${appQuery.toString()}`,
      `https://api.map.baidu.com/marker?${webQuery.toString()}`,
    )
    return
  }

  const point = bd09ToGcj02(location.latitude, location.longitude)
  const lat = point.latitude.toFixed(6)
  const lon = point.longitude.toFixed(6)

  if (action.name === '高德地图') {
    const appQuery = new URLSearchParams({
      sourceApplication: 'PulseIM',
      poiname: name,
      lat,
      lon,
      dev: '0',
    })
    const webQuery = new URLSearchParams({
      position: `${lon},${lat}`,
      name,
      src: 'PulseIM',
      coordinate: 'gaode',
      callnative: '0',
    })
    const amapScheme = /iPhone|iPad|iPod/i.test(navigator.userAgent)
      ? 'iosamap://viewMap'
      : 'androidamap://viewMap'
    openMapAppWithFallback(
      `${amapScheme}?${appQuery.toString()}`,
      `https://uri.amap.com/marker?${webQuery.toString()}`,
    )
    return
  }

  const marker = `coord:${lat},${lon};title:${name};addr:${address}`
  const query = new URLSearchParams({ marker, referer: 'PulseIM' })
  openMapAppWithFallback(
    `qqmap://map/marker?${query.toString()}`,
    `https://apis.map.qq.com/uri/v1/marker?${query.toString()}`,
  )
}

function senderName(msg: ChatMessage): string {
  if (isGroup.value) {
    const member = groupMembers.value.find((m) => String(m.userId) === String(msg.fromUserId))
    // 群聊：优先成员展示名（备注/后台新昵称 > 群昵称 > 系统昵称）
    if (member?.remark?.trim()) return member.remark.trim()
    if (member?.nickname) return member.nickname
  }
  if (isMine(msg)) {
    return msg.fromNickname || userStore.nickname || '我'
  }
  // 单聊优先展示备注/后台设置的新昵称，避免消息里的原始 fromNickname 盖住
  if (!isGroup.value && peerTitle.value) return peerTitle.value
  if (msg.fromNickname) return msg.fromNickname
  return msg.fromUserId ? `用户${msg.fromUserId}` : '未知用户'
}

function senderRole(msg: ChatMessage): string {
  if (!isGroup.value) return ''
  const role = groupMembers.value.find(
    (m) => String(m.userId) === String(msg.fromUserId),
  )?.role
  return role === 'owner' ? '群主' : role === 'admin' ? '管理员' : ''
}

function businessOf(msg: ChatMessage): Record<string, any> | null {
  if (msg.msgType !== 7 && msg.msgType !== 8) return null
  try { return JSON.parse(msg.content) as Record<string, any> } catch { return null }
}

const businessStatus = ref<Record<string, string>>({})
const receiveSuccessVisible = ref(false)
const receiveSuccessKind = ref<'redpacket' | 'transfer'>('redpacket')
const receiveSuccessAmount = ref('')
let receiveSuccessTimer: ReturnType<typeof setTimeout> | null = null

function showReceiveSuccess(kind: 'redpacket' | 'transfer', amount = '') {
  receiveSuccessKind.value = kind
  receiveSuccessAmount.value = amount
  receiveSuccessVisible.value = false
  if (receiveSuccessTimer) clearTimeout(receiveSuccessTimer)
  // 先复位一帧，使连续领取时动画可以从头播放。
  requestAnimationFrame(() => {
    receiveSuccessVisible.value = true
    receiveSuccessTimer = setTimeout(() => {
      receiveSuccessVisible.value = false
      receiveSuccessTimer = null
    }, 1850)
  })
}

function businessStatusOf(msg: ChatMessage): string {
  return businessStatus.value[String(msg.id)] || String(businessOf(msg)?.status || '')
}
function setBusinessStatus(msg: ChatMessage, status: string) {
  businessStatus.value = { ...businessStatus.value, [String(msg.id)]: status }
}

function businessExpiryHint(msg: ChatMessage): string {
  const business = businessOf(msg)
  const status = businessStatusOf(msg)
  if (status === 'EXPIRED') return '已过期'
  if (!business?.expiresAt || !['ACTIVE', 'PENDING'].includes(status)) return ''
  const remaining = new Date(String(business.expiresAt)).getTime() - Date.now()
  if (remaining <= 0) return '已过期'
  if (remaining > 5 * 60 * 60 * 1000) return ''
  return `${Math.max(1, Math.ceil(remaining / 3600000))}小时后到期`
}

// ===== 微信风格红包/转账封面 =====
const businessCoverVisible = ref(false)
const businessCoverKind = ref<'redpacket' | 'transfer'>('redpacket')
const businessCover = ref<Record<string, any> | null>(null)
const businessCoverMsg = ref<ChatMessage | null>(null)
const businessReceiving = ref(false)
const businessCoverDetailOpen = ref(false)

const businessCoverSenderName = computed(() => {
  const d = businessCover.value
  return d?.sender_name || (businessCoverMsg.value ? senderName(businessCoverMsg.value) : '')
})

const businessCoverSenderAvatar = computed(() =>
  businessCoverMsg.value ? senderAvatar(businessCoverMsg.value) : '',
)

const businessCoverSenderText = computed(() => {
  const d = businessCover.value
  if (businessCoverKind.value === 'transfer') {
    if (d && String(d.sender_id) === String(userStore.userId)) {
      const receiver = d?.receiver_name || (businessCoverMsg.value ? senderName(businessCoverMsg.value) : '对方')
      return `我向${receiver}转账`
    }
    return `${d?.sender_name || '好友'}向你转账`
  }
  return `${businessCoverSenderName.value || '好友'}的红包`
})

const businessCoverReceived = computed(() => {
  const d = businessCover.value
  if (!d) return false
  if (businessCoverKind.value === 'transfer') return String(d.status) !== 'PENDING'
  return Boolean(d.receivedByMe)
    || String(d.status) === 'FINISHED'
    || String(d.status) === 'EXPIRED'
})

const businessCoverCanReceive = computed(() => {
  const d = businessCover.value
  if (!d || businessReceiving.value) return false
  if (businessCoverKind.value === 'transfer') {
    return String(d.status) === 'PENDING'
      && String(d.receiver_id) === String(userStore.userId)
  }
  if (String(d.status) !== 'ACTIVE' || Boolean(d.receivedByMe)) return false
  const senderIsMe = String(d.sender_id) === String(userStore.userId)
  const senderCanReceive = Number(d.conversation_type) === 2
    && (String(d.packet_type) === 'NORMAL' || String(d.packet_type) === 'LUCKY')
  const exclusiveAllowsMe = String(d.packet_type) !== 'EXCLUSIVE'
    || String(d.target_user_id) === String(userStore.userId)
  return (!senderIsMe || senderCanReceive) && exclusiveAllowsMe
})

const businessCoverReceives = computed<Array<Record<string, any>>>(() => {
  const d = businessCover.value
  return Array.isArray(d?.receives) ? d.receives as Array<Record<string, any>> : []
})

const businessCoverMyAmount = computed(() => {
  if (businessCoverKind.value === 'transfer') {
    return yuan(Number(businessCover.value?.amount))
  }
  const mine = businessCoverReceives.value.find(
    (r) => String(r.user_id) === String(userStore.userId),
  )
  return mine ? yuan(Number(mine.amount)) : ''
})

async function openBusinessMessage(msg: ChatMessage) {
  const business = businessOf(msg)
  if (!business) return
  businessCoverDetailOpen.value = false
  try {
    if (msg.msgType === 8) {
      const detail = await fetchTransfer(String(business.businessNo))
      businessCoverKind.value = 'transfer'
      businessCover.value = detail
      businessCoverMsg.value = msg
      businessCoverVisible.value = true
    } else {
      const detail = await fetchRedPacket(String(business.businessNo))
      businessCoverKind.value = 'redpacket'
      businessCover.value = detail
      businessCoverMsg.value = msg
      businessCoverVisible.value = true
      if (Boolean(detail.receivedByMe)) setBusinessStatus(msg, 'RECEIVED')
      else if (String(detail.status) === 'FINISHED') setBusinessStatus(msg, 'FINISHED')
    }
  } catch (e: any) {
    showToast(e instanceof Error ? e.message : (msg.msgType === 8 ? '转账详情加载失败' : '红包详情加载失败'))
  }
}

function closeBusinessCover() {
  businessCoverVisible.value = false
  businessCoverDetailOpen.value = false
  businessCover.value = null
  businessCoverMsg.value = null
}

async function onReceiveBusiness() {
  if (!businessCover.value || !businessCoverMsg.value || businessReceiving.value) return
  businessReceiving.value = true
  const msg = businessCoverMsg.value
  const business = businessOf(msg)
  try {
    if (businessCoverKind.value === 'transfer') {
      const detail = await receiveTransfer(String(business!.businessNo))
      businessCover.value = detail
      setBusinessStatus(msg, 'RECEIVED')
      void refreshLatest()
      showReceiveSuccess('transfer', yuan(Number(detail.amount)))
    } else {
      const detail = await receiveRedPacket(String(business!.businessNo))
      businessCover.value = detail
      if (Boolean(detail.receivedByMe)) setBusinessStatus(msg, 'RECEIVED')
      else if (String(detail.status) === 'FINISHED') setBusinessStatus(msg, 'FINISHED')
      void refreshLatest()
      showReceiveSuccess('redpacket', businessCoverMyAmount.value)
    }
  } catch (e: any) {
    showToast(e instanceof Error ? e.message : '操作失败')
  } finally {
    businessReceiving.value = false
  }
}

function senderAvatar(msg: ChatMessage): string {
  if (isMine(msg)) {
    return resolveAvatarUrl(msg.fromAvatarUrl || userStore.avatar || '')
  }
  if (!isGroup.value && peerUserId.value && String(msg.fromUserId || '') === peerUserId.value) {
    return peerAvatar.value
  }
  if (msg.fromAvatarUrl) return resolveAvatarUrl(msg.fromAvatarUrl)
  if (!isGroup.value && peerAvatar.value) return peerAvatar.value
  return ''
}

const brokenAvatarUrls = ref(new Set<string>())
const cachedAvatarObjectUrls = reactive<Record<string, string>>({})
const avatarWarmInFlight = new Set<string>()

function chatAvatarOwnerId(): string {
  return String(userStore.userId || parseUserIdFromToken(userStore.token) || '')
}

function chatAvatarCacheKey(source: string, targetId: string, kind: 'user' | 'group'): string {
  return `${kind}:${chatAvatarOwnerId()}:${String(targetId || '').trim()}:${source}`
}

function warmChatAvatar(source: string, targetId: string, kind: 'user' | 'group'): void {
  const url = resolveAvatarUrl(source)
  const ownerId = chatAvatarOwnerId()
  const target = String(targetId || '').trim()
  if (!ownerId || !target || !url || url.startsWith('data:') || url.startsWith('blob:')) return
  const key = chatAvatarCacheKey(url, target, kind)
  if (cachedAvatarObjectUrls[key] || avatarWarmInFlight.has(key)) return
  const stable = getCachedChatAvatar(ownerId, target, url, kind)
  if (stable) {
    cachedAvatarObjectUrls[key] = stable
    return
  }
  avatarWarmInFlight.add(key)
  void loadCachedChatAvatar(ownerId, target, url, kind)
    .then((cached) => {
      if (cached) cachedAvatarObjectUrls[key] = cached
    })
    .finally(() => avatarWarmInFlight.delete(key))
}

function onAvatarImgError(e: Event) {
  const el = e.target as HTMLImageElement | null
  const src = el?.currentSrc || el?.src
  if (!src) return
  const next = new Set(brokenAvatarUrls.value)
  next.add(src)
  try {
    const path = new URL(src, window.location.origin).pathname
    if (path) next.add(path)
  } catch {
    /* ignore */
  }
  brokenAvatarUrls.value = next
}
function displayAvatar(url: string, targetId = '', kind: 'user' | 'group' = 'user'): string {
  const u = resolveAvatarUrl(url)
  if (!u) return ''
  const ownerId = chatAvatarOwnerId()
  const target = String(targetId || '').trim()
  const key = ownerId && target ? chatAvatarCacheKey(u, target, kind) : ''
  const cached = key ? cachedAvatarObjectUrls[key] || getCachedChatAvatar(ownerId, target, u, kind) : ''
  if (cached) {
    if (!brokenAvatarUrls.value.has(cached)) {
      if (cachedAvatarObjectUrls[key] !== cached) cachedAvatarObjectUrls[key] = cached
      return cached
    }
    return ''
  }
  // Start the authenticated cache read before consulting the raw image's
  // broken-url set. A raw <img> can fail with 401 while the same URL is
  // perfectly usable when fetched with the current Bearer token.
  if (target) warmChatAvatar(u, target, kind)
  if (brokenAvatarUrls.value.has(u)) return ''
  try {
    const abs = new URL(u, window.location.origin).href
    if (brokenAvatarUrls.value.has(abs)) return ''
    const path = new URL(u, window.location.origin).pathname
    if (path && brokenAvatarUrls.value.has(path)) return ''
  } catch {
    /* ignore */
  }
  return u
}

function peerAvatarSrc(): string {
  return displayAvatar(
    peerAvatar.value,
    isGroup.value ? conversationId.value : peerUserId.value,
    isGroup.value ? 'group' : 'user',
  )
}

/** 模板里只算一次，避免 v-if/src 各调一遍 */
function msgAvatarSrc(msg: ChatMessage): string {
  const targetId = isMine(msg)
    ? myUserId.value || chatAvatarOwnerId()
    : (!isGroup.value && peerUserId.value && String(msg.fromUserId || '') === peerUserId.value)
      ? peerUserId.value
      : String(msg.fromUserId || '')
  return displayAvatar(senderAvatar(msg), targetId)
}

function senderAvatarName(msg: ChatMessage): string {
  if (isMine(msg)) return userStore.nickname || '我'
  if (!isGroup.value && String(msg.fromUserId || '') === peerUserId.value) {
    return resolvedPeerInitialName.value || peerTitle.value
  }
  return senderName(msg)
}

/** 消息发送者视角的好友标签：单聊取对方，群聊取当前成员。 */
function messageFriendTag(msg: ChatMessage): string {
  if (isGroup.value) {
    return groupMembers.value.find((member) => String(member.userId) === String(msg.fromUserId))?.tag?.trim() || ''
  }
  return peerTag.value
}

function showMessageFriendTag(msg: ChatMessage): boolean {
  return !isFileTransferAssistant.value
    && peerTitle.value !== '文件传输助手'
    && !!messageFriendTag(msg)
    && !!msg.fromUserId
}

function openSenderProfile(msg: ChatMessage) {
  const uid = String(msg.fromUserId || '')
  if (!uid) {
    showToast('暂无用户信息')
    return
  }
  if (uid === myUserId.value) {
    router.push('/profile/edit')
    return
  }
  if (friendIds.value.has(uid)) {
    router.push(`/contacts/${uid}`)
  } else {
    router.push({
      path: `/user/${uid}`,
      query: isGroup.value
        ? { source: 'group', groupId: conversationId.value }
        : undefined,
    })
  }
}

function onDeleteModeSelect(action: { name?: string }) {
  void confirmDeleteMode(action.name === '双向删除' ? 'both' : 'self')
}
</script>

<template>
  <!-- Keep an explicit viewport height on Android too. The chat page is
       position: fixed, so a resized WebView/root alone does not always
       resize this page on edge-to-edge devices. The computed height is
       already de-duplicated against adjustResize/visualViewport. -->
  <div
    class="chat-page"
    :class="{ 'multi-mode': multiMode, 'keyboard-open': keyboardOpen || composerFocused }"
    :style="
      viewportHeightPx
        ? {
            top: `${viewportTopPx}px`,
            height: `${viewportHeightPx}px`,
            maxHeight: `${viewportHeightPx}px`,
          }
        : undefined
    "
  >
    <header class="chat-header glass-header">
      <div class="header-left">
        <button
          type="button"
          class="icon-btn back-btn"
          @click="multiMode ? exitMultiMode() : goBack()"
        >
          <span class="material-symbols-outlined">{{ multiMode ? 'close' : 'arrow_back' }}</span>
      </button>
        <button
          v-if="!multiMode && !isFileTransferAssistant && headerUnreadCount > 0"
          type="button"
          class="header-unread-btn"
          :aria-label="`查看 ${headerUnreadCount} 条未读消息`"
          @click="openHeaderUnread"
        >
          <span class="header-unread-count">{{ headerUnreadCount > 99 ? '99+' : headerUnreadCount }}</span>
        </button>
        <template v-if="multiMode">
          <div class="peer-text">
            <div class="peer-name">已选 {{ selectedCount }} 条</div>
            <div class="peer-status">多选模式</div>
          </div>
        </template>
        <component
          v-else
          :is="isFileTransferAssistant ? 'div' : 'button'"
          :type="isFileTransferAssistant ? undefined : 'button'"
          class="peer-info"
          :class="{ 'peer-info-static': isFileTransferAssistant }"
          :aria-label="isFileTransferAssistant ? undefined : '查看联系人资料'"
          @click="!isFileTransferAssistant && openPeerProfile()"
        >
        <div class="peer-avatar-wrap">
          <img
            v-if="peerAvatarSrc()"
            :src="peerAvatarSrc()"
            :alt="peerTitle"
            class="peer-avatar"
            @error="onAvatarImgError"
          />
          <div v-else class="peer-avatar initials">{{ (resolvedPeerInitialName || peerTitle).slice(0, 1) }}</div>
            <span
              v-if="!peerOnlineHidden && !isFileTransferAssistant"
              class="online-dot"
              :class="{ online: peerOnline, hidden: isGroup }"
            />
        </div>
          <div class="peer-text" :class="{ 'group-peer-text': isGroup }">
            <div ref="peerNameRowRef" class="peer-name-row">
              <div
                ref="peerNameTrackRef"
                class="peer-name-track"
                :class="{ scrolling: peerNameScrolling }"
              >
                <div class="peer-name">{{ peerTitle }}</div>
                <span
                  v-if="peerTag && !isFileTransferAssistant && peerTitle !== '文件传输助手'"
                  class="peer-friend-tag"
                  :style="friendTagStyle(peerUserId)"
                >{{ peerTag }}</span>
              </div>
            </div>
            <div class="peer-status-row">
              <div v-if="isGroup" class="peer-status">群聊</div>
              <div v-else-if="!peerOnlineHidden && !isFileTransferAssistant" class="peer-status" :class="{ online: peerOnline }">
                {{ peerOnline ? '在线' : '离线' }}
              </div>
              <div
                v-if="!isGroup && !isFileTransferAssistant && peerTyping"
                class="peer-typing-status"
              >
                对方正在输入...
              </div>
            </div>
          </div>
        </component>
      </div>
      <div v-if="!multiMode" class="call-actions">
        <button
          type="button"
          class="icon-btn"
          @click="openChatSettings"
        >
          <span class="material-symbols-outlined">more_horiz</span>
        </button>
      </div>
    </header>

    <Teleport to="body">
      <Transition name="receive-success">
        <div
          v-if="receiveSuccessVisible"
          class="receive-success-layer"
          :class="receiveSuccessKind"
          aria-live="polite"
        >
          <div class="receive-success-rays" aria-hidden="true" />
          <div class="receive-success-particles" aria-hidden="true">
            <i v-for="n in 10" :key="n" :style="{ '--particle-index': n }" />
          </div>
          <div class="receive-success-card">
            <div class="receive-success-icon">
              <span class="material-symbols-outlined filled">
                {{ receiveSuccessKind === 'redpacket' ? 'redeem' : 'currency_yen' }}
              </span>
            </div>
            <strong>{{ receiveSuccessKind === 'redpacket' ? '领取成功' : '收款成功' }}</strong>
            <b v-if="receiveSuccessAmount">{{ receiveSuccessAmount }}</b>
            <small>{{ receiveSuccessKind === 'redpacket' ? '红包已存入零钱' : '款项已存入零钱' }}</small>
          </div>
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="cover-fade">
        <div
          v-if="businessCoverVisible"
          class="business-cover-layer"
          :class="businessCoverKind"
          @click.self="closeBusinessCover"
        >
          <div class="business-cover-card" :class="{ received: businessCoverReceived }">
          <button type="button" class="cover-close" aria-label="关闭" @click="closeBusinessCover">
            <span class="material-symbols-outlined">close</span>
          </button>

          <template v-if="businessCoverKind === 'transfer'">
            <div class="cover-sender">
              <img
                v-if="businessCoverSenderAvatar"
                :src="businessCoverSenderAvatar"
                :alt="businessCoverSenderName"
              />
              <span v-else class="cover-sender-fallback">{{ (businessCoverSenderName || '?').slice(0, 1) }}</span>
              <span class="cover-sender-name">{{ businessCoverSenderText }}</span>
            </div>
            <div class="cover-amount">{{ yuan(Number(businessCover?.amount)) }}</div>
            <div class="cover-remark">{{ businessCover?.remark || '转账' }}</div>
            <div v-if="businessCoverReceived" class="cover-status">
              <span class="material-symbols-outlined">check_circle</span>
              已收款，款项已存入零钱
            </div>
            <button
              v-else
              type="button"
              class="cover-receive-btn"
              :disabled="!businessCoverCanReceive || businessReceiving"
              @click="onReceiveBusiness"
            >
              {{ businessReceiving ? '处理中...' : (businessCoverCanReceive ? '收款' : '待收款') }}
            </button>
          </template>

          <template v-else>
            <div class="cover-sender">
              <img
                v-if="businessCoverSenderAvatar"
                :src="businessCoverSenderAvatar"
                :alt="businessCoverSenderName"
              />
              <span v-else class="cover-sender-fallback">{{ (businessCoverSenderName || '?').slice(0, 1) }}</span>
              <span class="cover-sender-name">{{ businessCoverSenderText }}</span>
            </div>
            <div class="cover-greeting">{{ businessCover?.greeting || '恭喜发财，大吉大利' }}</div>
            <div class="cover-pack">
              <span class="material-symbols-outlined filled">redeem</span>
            </div>
            <template v-if="businessCoverReceived">
              <div class="cover-amount">{{ businessCoverMyAmount || '已领取' }}</div>
              <div class="cover-status">
                <span class="material-symbols-outlined">check_circle</span>
                红包已存入零钱
              </div>
            </template>
            <button
              v-else
              type="button"
              class="cover-receive-btn"
              :disabled="!businessCoverCanReceive || businessReceiving"
              @click="onReceiveBusiness"
            >
              {{
                businessReceiving
                  ? '处理中...'
                  : businessCoverCanReceive
                    ? '领取红包'
                    : String(businessCover?.status) === 'FINISHED'
                      ? '已领完'
                      : String(businessCover?.status) === 'EXPIRED'
                        ? '已过期'
                        : '已发放'
              }}
            </button>
            <button
              type="button"
              class="cover-detail-link"
              @click="businessCoverDetailOpen = !businessCoverDetailOpen"
            >
              {{ businessCoverDetailOpen ? '收起' : '查看领取详情' }}
            </button>
            <div v-if="businessCoverDetailOpen" class="cover-receives">
              <div v-if="!businessCoverReceives.length" class="cover-receives-empty">暂无领取记录</div>
              <div v-for="(r, i) in businessCoverReceives" :key="i" class="cover-receive-row">
                <span class="cover-receive-nick">{{ r.nickname || '成员' }}</span>
                <span class="cover-receive-amount">{{ yuan(Number(r.amount)) }}</span>
              </div>
            </div>
          </template>
          </div>
        </div>
      </Transition>
    </Teleport>

    <div
      ref="listRef"
      class="message-list scrollbar-hide"
      @scroll.passive="onMessageListScroll"
      @touchstart.passive="onMessageListTouchStart"
      @touchmove.passive="onMessageListTouchMove"
      @touchend.passive="onMessageListTouchEnd"
      @touchcancel.passive="onMessageListTouchEnd"
      @load.capture="onMessageContentLoad"
    >
      <div v-if="loading" class="loading-state">加载中...</div>
      <template v-else>
      <button
        v-if="historyHasMore || historyLoading"
        type="button"
        class="history-loader"
        :disabled="historyLoading"
        @click="loadOlderMessages"
      >
        <span v-if="historyLoading" class="history-spinner"></span>
        <span>{{ historyLoading ? '正在加载历史消息' : '点击加载更早消息' }}</span>
      </button>
      <div v-else-if="messages.length" class="history-end">已显示全部消息</div>
      <div v-if="!isGroup && (myAutoDeleteSeconds || peerAutoDeleteSeconds)" class="auto-delete-notice">
        <span class="material-symbols-outlined">auto_delete</span>
        <div>
          <p v-if="effectiveAutoDeleteSeconds">自动删除记录：双方发送的新消息，都会在{{ autoDeleteTimeLabel(effectiveAutoDeleteSeconds) }}后从双方的聊天记录中删除。</p>
          <small>从发送时开始计时，即使未读，到期也会删除；同时开启阅后即焚时，以先到期的时间为准。</small>
        </div>
      </div>
      <div
        v-for="msg in messages"
        :key="msg.id"
        class="message-row"
          :class="{
            mine: isMine(msg) && (!isSystemTip(msg) || isCallRecord(msg)),
            selected: multiMode && isSelected(msg.id),
            system: isSystemTip(msg) && !isCallRecord(msg),
            selectable:
              multiMode &&
              !msg.recalled &&
              (!isSystemTip(msg) || isCallRecord(msg)),
          }"
          :data-msg-id="msg.id"
          @touchstart.capture="onMultiRowTouchStart(msg, $event)"
          @touchmove.capture="onMultiRowTouchMove($event)"
          @touchend.capture="onMultiRowTouchEnd(msg)"
          @click.capture="onMultiRowClickCapture(msg, $event)"
        >
          <template v-if="isSystemTip(msg)">
            <template v-if="isCallRecord(msg)">
              <button
                type="button"
                class="msg-avatar-btn"
                @click.stop="onSenderAvatarClick(msg)"
              >
                <template v-for="avatarSrc in [msgAvatarSrc(msg)]" :key="msg.id + '-av'">
                  <img
                    v-if="avatarSrc"
                    :src="avatarSrc"
                    :alt="senderName(msg)"
                    class="msg-avatar"
                    @error="onAvatarImgError"
                  />
                  <div v-else class="msg-avatar initials">{{ senderAvatarName(msg).slice(0, 1) }}</div>
                </template>
              </button>
              <button
                type="button"
                class="call-bubble"
                :class="{ mine: isMine(msg) }"
                @click.stop="onCallBubbleClick(msg)"
                @touchstart.stop="onCallBubblePressStart(msg, $event)"
                @touchmove.stop="onCallBubbleTouchMove($event)"
                @touchend.stop="onCallBubblePressEnd()"
                @touchcancel.stop="onCallBubblePressEnd()"
                @contextmenu.prevent.stop="onBubbleContextMenu(msg, $event)"
              >
                <span class="call-bubble-icon">
                  <span class="material-symbols-outlined">
                    {{ callRecordIsVideo(msg.content) ? 'videocam' : 'call' }}
                  </span>
                </span>
                <span class="call-bubble-body">
                  <b>{{ callRecordLabel(msg) }}</b>
                  <small>{{ callRecordStatusText(msg.content) }}</small>
                </span>
                <span class="material-symbols-outlined call-bubble-arrow">chevron_right</span>
              </button>
            </template>
            <div v-else class="system-tip-wrap">
              <div v-if="formatMsgTime(msg.createdAt)" class="system-tip-time">
                {{ formatMsgTime(msg.createdAt) }}
              </div>
                <div
                  class="system-tip"
                  :class="{ 'business-system-tip': isBusinessSystemTip(msg) }"
                  :role="isBusinessSystemTip(msg) ? 'button' : undefined"
                  :tabindex="isBusinessSystemTip(msg) ? 0 : undefined"
                  :aria-label="isBusinessSystemTip(msg) ? '查看原红包或转账消息' : undefined"
                  @click.stop="isBusinessSystemTip(msg) && jumpToBusinessSource(msg)"
                  @keydown.enter.prevent.stop="isBusinessSystemTip(msg) && jumpToBusinessSource(msg)"
                >
                  <span>{{ systemTipText(msg.content, msg) }}</span>
                  <span v-if="isBusinessSystemTip(msg)" class="material-symbols-outlined system-tip-business-icon">chevron_right</span>
                </div>
            </div>
          </template>
          <template v-else>
          <button
            v-if="multiMode"
            type="button"
            class="select-check"
            :class="{ on: isSelected(msg.id), disabled: msg.recalled }"
            :disabled="!!msg.recalled"
          >
            <span class="material-symbols-outlined">{{
              isSelected(msg.id) ? 'check_circle' : 'radio_button_unchecked'
            }}</span>
          </button>

          <button
            type="button"
            class="msg-avatar-btn"
            @click.stop="onSenderAvatarClick(msg)"
            @touchstart.stop="beginAvatarMention(msg)"
            @touchend.stop="cancelAvatarMention"
            @touchcancel.stop="cancelAvatarMention"
            @touchmove.stop="cancelAvatarMention"
            @contextmenu.prevent.stop="onSenderAvatarContextMenu(msg)"
          >
            <template v-for="avatarSrc in [msgAvatarSrc(msg)]" :key="msg.id + '-av'">
              <img
                v-if="avatarSrc"
                :src="avatarSrc"
                :alt="senderName(msg)"
                class="msg-avatar"
                @error="onAvatarImgError"
              />
              <div v-else class="msg-avatar initials">{{ senderAvatarName(msg).slice(0, 1) }}</div>
            </template>
          </button>
          <div class="message-col" :class="{ mine: isMine(msg) }">
            <div class="sender-name" :class="{ mine: isMine(msg) }">
              <span
                v-if="showMessageFriendTag(msg) && isMine(msg)"
                class="message-friend-tag"
                :style="friendTagStyle(isGroup ? msg.fromUserId : peerUserId)"
              >{{ messageFriendTag(msg) }}</span>
              <span class="sender-name-text">{{ senderName(msg) }}</span>
              <span
                v-if="showMessageFriendTag(msg) && !isMine(msg)"
                class="message-friend-tag"
                :style="friendTagStyle(isGroup ? msg.fromUserId : peerUserId)"
              >{{ messageFriendTag(msg) }}</span>
              <span v-if="senderRole(msg)" class="sender-role">{{ senderRole(msg) }}</span>
            </div>

            <div
              v-if="msg.recalled"
              class="recall-tip"
              :class="{ mine: isMine(msg) }"
            >
              {{ isMine(msg) ? '你撤回了一条消息' : `${senderName(msg)}撤回了一条消息` }}
              <button
                v-if="canReeditRecalledMessage(msg)"
                type="button"
                class="recall-edit-btn"
                @click.stop="reeditRecalledMessage(msg)"
              >重新编辑</button>
            </div>

            <div
              v-else
              class="bubble"
              :class="{
                mine: isMine(msg),
                card:
                  msg.msgType === 4 ||
                  msg.msgType === 5 ||
                  (msg.msgType === 2 && !isVideoMsg(msg)),
                'live-location-message': isLiveLocationInvite(msg),
                image: msg.msgType === 1,
                video: msg.msgType === 2 && isVideoMsg(msg),
                voice: msg.msgType === 3,
                location: msg.msgType === 6 && !!locationOf(msg),
                business: msg.msgType === 7 || msg.msgType === 8,
                'swipe-replying': swipingMessageId === msg.id,
              }"
              :style="swipingMessageId === msg.id ? { transform: `translateX(${swipeReplyOffset}px)` } : undefined"
              @touchstart.stop="onBubblePressStart(msg, $event)"
              @touchmove.stop="onBubbleTouchMove(msg, $event)"
              @touchend.stop="onBubblePressEnd(msg)"
              @touchcancel.stop="onBubblePressEnd()"
              @mousedown="!multiMode && onBubblePressStart(msg)"
              @mouseup="onBubblePressEnd()"
              @mouseleave="onBubblePressEnd()"
              @contextmenu.prevent.stop="onBubbleContextMenu(msg, $event)"
              @selectstart.prevent
              @dragstart.prevent
            >
              <span v-if="swipingMessageId === msg.id" class="swipe-reply-icon material-symbols-outlined">reply</span>
              <button
                v-if="msg.replyToMsgId"
                type="button"
                class="quote-block"
                :class="{ mine: isMine(msg) }"
                @click.stop="onQuoteClick(msg)"
                @touchstart.stop="clearLongPress"
                @touchend.stop.prevent="onQuoteClick(msg)"
                @touchcancel.stop="clearLongPress"
              >
                <span class="quote-name">{{ msg.replyToNickname || '消息' }}</span>
                <div class="quote-main">
                  <div
                    v-if="
                      !msg.replyToRecalled &&
                      replyQuoteType(msg) === 1 &&
                      replyQuoteMediaUrl(msg)
                    "
                    class="quote-thumb"
                  >
                    <img :src="replyQuoteMediaUrl(msg)" alt="" />
                  </div>
                  <div
                    v-else-if="
                      !msg.replyToRecalled &&
                      replyQuoteType(msg) === 2 &&
                      replyQuoteIsVideo(msg.replyToContent) &&
                      replyQuoteMediaUrl(msg)
                    "
                    class="quote-thumb video"
                  >
                    <img
                      :src="replyQuoteMediaUrl(msg)"
                      alt=""
                    />
                    <span class="material-symbols-outlined">play_circle</span>
                  </div>
                  <div
                    v-else-if="!msg.replyToRecalled && replyQuoteType(msg) === 2"
                    class="quote-file-icon"
                  >
                    <span class="material-symbols-outlined">description</span>
                  </div>
                  <span class="quote-text">{{ replyQuoteLabel(msg) }}</span>
                </div>
              </button>

              <button
                v-if="isLiveLocationInvite(msg)"
                type="button"
                class="live-location-card"
                :class="{ ended: isLiveLocationEnded(msg) }"
                @click.stop="openLiveLocation(msg)"
              >
                <span class="live-location-card-map">
                  <i /><i /><i />
                  <span class="material-symbols-outlined">location_on</span>
                </span>
                <span class="live-location-card-body">
                  <span class="live-location-card-copy">
                    <strong>{{ isMine(msg) ? '我发起了位置共享' : `${senderName(msg)}发起了位置共享` }}</strong>
                    <small>{{ isLiveLocationEnded(msg) ? '位置共享已结束' : '进入共享位置' }}</small>
                  </span>
                  <span class="material-symbols-outlined live-location-card-arrow">chevron_right</span>
                </span>
              </button>

              <button
                v-else-if="msg.msgType === 4 && forwardCardOf(msg)"
                type="button"
                class="fwd-card"
                :class="{ mine: isMine(msg) }"
                @click.stop="openForwardDetail(msg)"
              >
                <div class="fwd-card-title">{{ forwardCardOf(msg)!.title }}</div>
                <div
                  v-for="(it, i) in forwardCardOf(msg)!.items.slice(0, 3)"
                  :key="it.msgId || i"
                  class="fwd-card-line"
                >
                  <span class="fwd-card-name">{{ it.fromNickname || '用户' }}：</span>
                  <span class="fwd-card-text">{{ forwardItemPreview(it) }}</span>
                </div>
                <div class="fwd-card-foot">
                  聊天记录
                  <span class="material-symbols-outlined">chevron_right</span>
                </div>
              </button>

              <button
                v-else-if="msg.msgType === 6 && locationOf(msg)"
                type="button"
                class="location-card"
                :class="{ mine: isMine(msg) }"
                @click.stop="openLocation(msg)"
              >
                <div class="location-card-map">
                  <span class="material-symbols-outlined">location_on</span>
                  <i></i><i></i><i></i>
                </div>
                <div class="location-card-meta">
                  <strong>{{ locationOf(msg)!.name }}</strong>
                  <span>{{ locationOf(msg)!.address }}</span>
                </div>
              </button>

              <button
                v-else-if="msg.msgType === 5 && contactCardOf(msg)"
                type="button"
                class="contact-card"
                :class="{ mine: isMine(msg) }"
                @click.stop="openContactCard(msg)"
              >
                <div class="contact-card-main">
                  <img
                    v-if="contactCardOf(msg)!.avatarUrl"
                    :src="contactCardOf(msg)!.avatarUrl"
                    :alt="contactCardOf(msg)!.nickname"
                    class="contact-card-avatar"
                  />
                  <div v-else class="contact-card-avatar initials">
                    {{ contactCardOf(msg)!.nickname.slice(0, 1) }}
                  </div>
                  <div class="contact-card-meta">
                    <div class="contact-card-name">{{ contactCardOf(msg)!.nickname }}</div>
                    <div class="contact-card-sub">
                      {{ contactCardOf(msg)!.cardType === 'community' ? '圈子名片' : contactCardOf(msg)!.cardType === 'group' ? '群名片' : '个人名片' }}
                    </div>
                  </div>
                </div>
                <div class="contact-card-foot">
                  {{ contactCardOf(msg)!.cardType === 'community' ? '查看圈子' : contactCardOf(msg)!.cardType === 'group' ? '群聊' : '名片' }}
                  <span class="material-symbols-outlined">chevron_right</span>
                </div>
              </button>

              <button
                v-else-if="isBurnMediaLocked(msg)"
                type="button"
                class="burn-media-locked"
                @click.stop="msg.msgType === 1 ? openImagePreview(msg) : openVideoPlayer(msg)"
              >
                <span class="material-symbols-outlined">lock</span>
                <span>{{ msg.msgType === 1 ? '点击查看图片' : '点击查看视频' }}</span>
                <small>查看后开始销毁倒计时</small>
              </button>

              <button
                v-else-if="msg.msgType === 2 && isVideoMsg(msg)"
                type="button"
                class="msg-video-wrap"
                @touchstart.stop="onInlineMediaLongPressStart(msg, $event)"
                @touchmove.stop="moveMediaLongPress"
                @touchend.stop="endMediaLongPress"
                @touchcancel.stop="endMediaLongPress"
                @contextmenu.prevent.stop="onInlineMediaContextMenu(msg, $event)"
                @click.stop="onInlineMediaClick(msg)"
              >
                <img
                  v-if="videoThumbUrlOf(msg)"
                  class="msg-video-thumb-img"
                  :src="videoThumbUrlOf(msg)"
                  alt="视频封面"
                  draggable="false"
                />
                <span v-else class="msg-video-pending">
                  <span class="material-symbols-outlined">movie</span>
                  <span>视频准备中</span>
                </span>
                <span v-if="videoThumbUrlOf(msg)" class="video-play-mask" aria-hidden="true">
                  <span class="material-symbols-outlined">play_circle</span>
                </span>
                <span
                  v-if="videoOriginalUrlOf(msg)"
                  class="media-hd-badge"
                  role="button"
                  tabindex="0"
                  @click.stop="openOriginalFromBubble(msg)"
                  @keydown.enter.stop="openOriginalFromBubble(msg)"
                >查看原视频</span>
              </button>

              <button
                v-else-if="msg.msgType === 2 && fileOf(msg)"
                type="button"
                class="file-card"
                :class="{ mine: isMine(msg) }"
                @click.stop="openFileMsg(msg)"
              >
                <span class="material-symbols-outlined file-card-icon">description</span>
                <div class="file-card-meta">
                  <div class="file-card-name">{{ fileOf(msg)!.name }}</div>
                  <div class="file-card-sub">{{ formatFileSize(fileOf(msg)!.size) || '文件' }}</div>
                </div>
              </button>

              <button
                v-else-if="msg.msgType === 3 && voiceOf(msg)"
                type="button"
                class="voice-bubble"
                :class="{
                  mine: isMine(msg),
                  playing: playingVoiceId === msg.id,
                  loading: voiceLoadingId === msg.id,
                }"
                @click.stop="onVoiceBubbleClick(msg)"
                @touchend="onVoiceBubbleTap(msg, $event)"
              >
                <span class="material-symbols-outlined voice-icon">{{
                  voiceLoadingId === msg.id
                    ? 'hourglass_top'
                    : playingVoiceId === msg.id
                      ? 'pause'
                      : 'play_arrow'
                }}</span>
                <span class="voice-bars" aria-hidden="true">
                  <i /><i /><i /><i />
                </span>
                <span class="voice-duration">{{
                  formatVoiceDuration(voiceOf(msg)!.durationMs)
                }}</span>
              </button>

              <button
                v-else-if="(msg.msgType === 7 || msg.msgType === 8) && businessOf(msg)"
                type="button"
                class="money-card"
                :class="{
                  transfer: msg.msgType === 8,
                  received: businessStatusOf(msg) === 'RECEIVED' || businessStatusOf(msg) === 'FINISHED',
                }"
                @click.stop="openBusinessMessage(msg)"
              >
                <span class="material-symbols-outlined">{{ msg.msgType === 7 ? 'redeem' : 'currency_yen' }}</span>
                <span>
                  <b>{{ msg.msgType === 7 ? businessOf(msg)!.greeting || '恭喜发财，大吉大利' : `转账 ${yuan(Number(businessOf(msg)!.amount))}` }}</b>
                  <small>{{
                    msg.msgType === 7
                      ? (businessExpiryHint(msg) || (businessStatusOf(msg) === 'RECEIVED' ? '已领取' : businessStatusOf(msg) === 'FINISHED' ? '已领完' : '领取红包'))
                      : (businessExpiryHint(msg) || (businessStatusOf(msg) === 'PENDING' ? businessOf(msg)!.remark || '待收款' : '已收款'))
                  }}</small>
                </span>
              </button>

              <button
                v-else-if="msg.msgType === 1 && parseFilePayload(msg.content)"
                type="button"
                class="msg-image-wrap"
                @touchstart.stop="onInlineMediaLongPressStart(msg, $event)"
                @touchmove.stop="moveMediaLongPress"
                @touchend.stop="endMediaLongPress"
                @touchcancel.stop="endMediaLongPress"
                @contextmenu.prevent.stop="onInlineMediaContextMenu(msg, $event)"
                @click.stop="onInlineMediaClick(msg)"
              >
                <img
                  v-if="imageUrlOf(msg)"
                  :src="imageUrlOf(msg)"
                  alt="图片"
                  class="msg-image"
                  draggable="false"
                  @dragstart.prevent
                />
                <span v-else class="msg-image-pending">
                  <span class="material-symbols-outlined">image</span>
                  <span>图片准备中</span>
                </span>
                <span
                  v-if="imageOriginalUrlOf(msg)"
                  class="media-hd-badge"
                  role="button"
                  tabindex="0"
                  @click.stop="openOriginalFromBubble(msg)"
                  @keydown.enter.stop="openOriginalFromBubble(msg)"
                >查看原图</span>
              </button>
              <span v-else class="bubble-text">
                <template v-if="msg.msgType === 0 && !msg.recalled">
                  <span
                    v-for="(part, pi) in textParts(msg.content)"
                    :key="pi"
                    :class="{ 'mention-hl': part.mention }"
                  >{{ part.text }}</span>
                </template>
                <template v-else>{{ msgLabel(msg) }}</template>
              </span>
        </div>

            <div
              v-if="!msg.recalled && isBurnMessage(msg)"
              class="burn-status"
              :class="{ mine: isMine(msg) }"
            >
              <span class="material-symbols-outlined">local_fire_department</span>
              <span>{{ burnStatusLabel(msg) }}</span>
              <span v-if="burnRemainingSeconds(msg) != null && Number(burnRemainingSeconds(msg)) > 0" class="burn-progress-track">
                <span class="burn-progress-fill" :style="{ width: `${burnProgressPercent(msg)}%` }" />
              </span>
            </div>

            <div v-if="!msg.recalled" class="msg-meta" :class="{ mine: isMine(msg) }">
              <span v-if="formatMsgTime(msg.createdAt)" class="msg-time">{{ formatMsgTime(msg.createdAt) }}</span>
              <template v-if="isMine(msg)">
                <button
                  v-if="msg.deliveryState === 'queued' || msg.deliveryState === 'failed'"
                  type="button"
                  class="delivery-state"
                  :class="{ failed: msg.deliveryState === 'failed' }"
                  @click.stop="retryFailedMessage(msg)"
                >{{ msg.deliveryState === 'failed' ? '重发' : '待发送' }}</button>
                <button
                  v-if="isGroup && readReceiptsVisible"
                  type="button"
                  class="read-receipt-text"
                  :class="{ read: groupMsgReadCount(msg) > 0 }"
                  @click.stop="openGroupReadSheet(msg)"
                >{{ groupReadLabel(msg) }}</button>
                <span
                  v-else-if="readReceiptsVisible"
                  class="private-read-receipt"
                  :class="{ read: isPrivateMsgRead(msg), unread: !isPrivateMsgRead(msg) }"
                  role="img"
                  :aria-label="isPrivateMsgRead(msg) ? 'Read' : 'Unread'"
                ></span>
              </template>
            </div>
          </div>
          </template>
        </div>
      </template>
    </div>

    <button
      v-if="mentionJumpIds.length && !multiMode"
      type="button"
      class="jump-mention-btn"
      aria-label="定位到@我的消息"
      @click="jumpToNextMention"
    >
      <span class="mention-jump-mark">@</span>
      <span>{{ mentionJumpIds.length > 1 ? `${mentionJumpIds.length}条@我` : '有人@我' }}</span>
      <span class="material-symbols-outlined">chevron_right</span>
    </button>

    <button
      v-if="showJumpLatest && !multiMode"
      type="button"
      class="jump-latest-btn"
      aria-label="跳到最新消息"
      @click="jumpToLatest"
    >
      <span class="material-symbols-outlined">keyboard_arrow_down</span>
    </button>

    <footer v-if="multiMode" class="multi-footer glass-header">
      <button type="button" class="multi-action" :disabled="!selectedCount" @click="openForwardPicker">
        <span class="material-symbols-outlined">forward</span>
        <span>转发</span>
      </button>
      <button
        type="button"
        class="multi-action danger"
        :disabled="!selectedCount"
        @click="doDelete([...selectedIds])"
      >
        <span class="material-symbols-outlined">delete</span>
        <span>删除</span>
      </button>
      <button type="button" class="multi-action" @click="exitMultiMode">
        <span class="material-symbols-outlined">close</span>
        <span>取消</span>
      </button>
    </footer>

    <footer v-else class="chat-footer glass-header">
      <div v-if="muteBannerTip && canChat" class="mute-soft-tip">
        <span class="material-symbols-outlined">volume_off</span>
        <span>{{ muteBannerTip }}</span>
      </div>
      <div v-if="showChatBlockTip" class="chat-block-tip" :class="{ mute: isMuteBlock }">
        <span class="material-symbols-outlined">{{ isMuteBlock ? 'voice_over_off' : 'person_off' }}</span>
        <span>{{ chatBlockTip }}</span>
      </div>
      <div v-else-if="replyTarget" class="reply-bar">
        <div class="reply-bar-body">
          <span class="reply-bar-label">引用 {{ senderName(replyTarget) }}</span>
          <div class="reply-bar-main">
            <div
              v-if="replyTarget.msgType === 1 && imageUrlOf(replyTarget)"
              class="reply-bar-thumb"
            >
              <img :src="imageUrlOf(replyTarget)" alt="" />
            </div>
            <div
              v-else-if="
                replyTarget.msgType === 2 &&
                replyQuoteIsVideo(replyTarget.content) &&
                replyQuoteMediaUrl(replyTarget)
              "
              class="reply-bar-thumb video"
            >
              <img
                :src="replyQuoteMediaUrl(replyTarget)"
                alt=""
              />
              <span class="material-symbols-outlined">play_circle</span>
            </div>
            <div v-else-if="replyTarget.msgType === 2" class="reply-bar-file-icon">
              <span class="material-symbols-outlined">description</span>
            </div>
            <span class="reply-bar-text">{{ replyPreview(replyTarget) }}</span>
          </div>
        </div>
        <button type="button" class="reply-bar-close" @click="clearReply">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <div v-if="composerVisible" class="composer-row" :class="{ 'is-checking': composerChecking }">
        <button type="button" class="plus-btn" :disabled="composerChecking" @click="onPlusClick">
          <span class="material-symbols-outlined">add</span>
        </button>

        <template v-if="voiceMode">
          <button
            type="button"
            class="voice-hold-btn"
            :disabled="composerChecking"
            :class="{ recording, cancel: recording && recordCancel }"
            @touchstart.prevent="onVoicePressStart"
            @touchmove.prevent="onVoicePressMove"
            @touchend.prevent="onVoicePressEnd"
            @touchcancel.prevent="() => finishVoiceRecord(false)"
            @mousedown.prevent="onVoicePressStart"
            @mouseup.prevent="onVoicePressEnd"
            @mouseleave="recording && onVoicePressEnd()"
          >
            {{
              recording
                ? recordCancel
                  ? '松开取消'
                  : `录音中 ${recordSeconds}"`
                : '按住 说话'
            }}
          </button>
          <button type="button" class="mic-btn secondary" :disabled="composerChecking" @click="toggleVoiceMode">
            <span class="material-symbols-outlined">keyboard</span>
          </button>
        </template>

        <template v-else>
          <!-- 诱饵字段：引导浏览器把账号自动填充打到这里，而不是消息框 -->
          <div class="autofill-trap" aria-hidden="true">
            <input type="text" name="username" tabindex="-1" autocomplete="username" />
            <input type="password" name="password" tabindex="-1" autocomplete="current-password" />
          </div>
          <div class="input-wrap">
            <textarea
              ref="composerRef"
              v-model="inputText"
              class="msg-input"
              :disabled="composerChecking"
              :class="{ 'is-mute-placeholder': Boolean(muteBannerTip) }"
              rows="1"
              enterkeyhint="send"
              name="pulse_chat_composer"
              autocomplete="off"
              autocapitalize="sentences"
              autocorrect="off"
              spellcheck="true"
              data-form-type="other"
              data-lpignore="true"
              data-1p-ignore="true"
              data-bwignore="true"
              :placeholder="muteBannerTip ? '全员禁言中，你仍可发言...' : '输入消息...'"
              @focus="onComposerFocus"
              @touchend.passive="ensureComposerFocus"
              @click="ensureComposerFocus"
              @blur="onComposerBlur"
              @input="onComposerInput"
              @keydown.enter.exact.prevent="sendMessage"
            />
            <button type="button" class="emoji-btn" :disabled="composerChecking" @click="toggleEmojiPanel">
              <span class="material-symbols-outlined">{{
                showEmojiPanel ? 'keyboard' : 'sentiment_satisfied'
              }}</span>
            </button>
          </div>
          <button
            v-if="inputText.trim()"
            type="button"
            class="send-btn"
            :disabled="composerChecking"
            @pointerdown="captureSendKeyboardState"
            @mousedown.prevent
            @click="sendMessage"
          >
            发送
          </button>
          <button v-else type="button" class="mic-btn" :disabled="composerChecking" @click="toggleVoiceMode">
            <span class="material-symbols-outlined filled">mic</span>
          </button>
        </template>
      </div>

      <div v-if="canChat && showEmojiPanel" class="emoji-panel">
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
    </footer>

    <van-popup
      v-model:show="showMentionPopup"
      position="bottom"
      round
      :style="{ height: '62%' }"
    >
      <div class="mention-sheet">
        <div class="mention-header">
          <button type="button" class="mention-cancel" @click="showMentionPopup = false">取消</button>
          <h3 class="mention-title">选择提醒的人</h3>
          <span class="mention-spacer" />
        </div>
        <div class="mention-list">
          <button
            v-if="groupIsManager"
            type="button"
            class="mention-item at-all"
            @click="pickAtAll"
          >
            <div class="mention-avatar initials">全</div>
            <div class="mention-meta">
              <span class="mention-name">全体成员</span>
              <span class="mention-sub">群主/管理员可用</span>
            </div>
          </button>
          <button
            v-for="m in mentionCandidates"
            :key="m.userId"
            type="button"
            class="mention-item"
            @click="pickMentionMember(m)"
          >
            <img v-if="m.avatarUrl" :src="m.avatarUrl" alt="" class="mention-avatar" />
            <div v-else class="mention-avatar initials">{{ (m.nickname || '?').slice(0, 1) }}</div>
            <div class="mention-meta">
              <span class="mention-name">{{ m.nickname || '用户' }}</span>
              <span v-if="m.owner || m.role === 'owner'" class="mention-sub">群主</span>
              <span v-else-if="m.admin || m.role === 'admin'" class="mention-sub">管理员</span>
            </div>
          </button>
          <p v-if="!mentionCandidates.length" class="mention-empty">暂无其他成员</p>
        </div>
      </div>
    </van-popup>

    <div v-if="recording" class="voice-record-mask" :class="{ cancel: recordCancel }">
      <div class="voice-record-card">
        <span class="material-symbols-outlined filled voice-record-mic">mic</span>
        <p class="voice-record-tip">
          {{ recordCancel ? '松开手指，取消发送' : '松开发送，上滑取消' }}
        </p>
        <p class="voice-record-sec">{{ recordSeconds }}"</p>
      </div>
    </div>

    <!-- 相册入口支持图片/视频混选，拍摄入口由页面内相机处理。 -->
    <input
      ref="mediaInputRef"
      type="file"
      multiple
      accept="image/*,video/*"
      class="hidden-file"
      @change="onMediaSelected"
    />
    <input
      ref="fileInputRef"
      type="file"
      accept="*/*,.exe,.apk,.ipa,.json"
      class="hidden-file"
      @change="onFileSelected"
    />

    <van-overlay
      :show="showFileSendConfirm"
      z-index="3600"
      :lock-scroll="true"
      :close-on-click-overlay="false"
      teleport="body"
    >
      <div class="file-send-confirm" @click.stop>
        <div class="file-send-confirm-icon">
          <span class="material-symbols-outlined">description</span>
        </div>
        <h3>确认发送文件？</h3>
        <p class="file-send-confirm-name">{{ normalizeFileName(pendingFileToSend?.name) || '文件' }}</p>
        <p class="file-send-confirm-meta">
          {{ formatFileSize(pendingFileToSend?.size) || '大小未知' }}
          <span v-if="pendingFileToSend?.type"> · {{ pendingFileToSend.type }}</span>
        </p>
        <div class="file-send-confirm-actions">
          <button type="button" @click="cancelGenericFile">取消</button>
          <button type="button" class="primary" @click="confirmGenericFile">确认发送</button>
        </div>
      </div>
    </van-overlay>

    <van-action-sheet
      v-model:show="showMapSourceSheet"
      title="选择地图"
      :actions="mapSourceActions"
      cancel-text="取消"
      close-on-click-action
      @select="onMapSourceSelect"
    />

    <van-overlay
      :show="showVideoCapture"
      z-index="4000"
      :lock-scroll="true"
      teleport="body"
      class="video-capture-root"
      :close-on-click-overlay="false"
    >
      <div class="video-capture-page" @click.stop>
        <img
          v-if="captureReviewKind === 'photo' && captureReviewUrl"
          class="video-capture-preview ready"
          :src="captureReviewUrl"
          alt=""
        />
        <video
          v-else
          ref="videoCapturePreviewRef"
          class="video-capture-preview"
          :class="{ ready: capturePreviewReady }"
          autoplay
          muted
          playsinline
          webkit-playsinline
          disablepictureinpicture
          x5-playsinline
          x5-video-player-type="h5"
          x5-video-player-fullscreen="false"
          @playing="capturePreviewReady = true"
          :src="captureReviewKind === 'video' ? captureReviewUrl : undefined"
          :controls="false"
          :loop="captureReviewKind === 'video'"
        />
        <div class="video-capture-top">
          <button type="button" class="video-capture-icon-btn" @click.stop="closeVideoCapture">
            <span class="material-symbols-outlined">close</span>
          </button>
          <span class="video-capture-title">
            {{
              captureMode === 'photo'
                ? '超清拍照'
                : videoCapturing
                  ? `录制中 ${videoCaptureSeconds}s`
                  : '超清摄像'
            }}
            <small v-if="videoCaptureInfo">{{ videoCaptureInfo }}</small>
          </span>
          <button
            v-if="!captureReviewKind"
            type="button"
            class="video-capture-icon-btn"
            @click.stop="flipVideoCaptureCamera"
          >
            <span class="material-symbols-outlined">cameraswitch</span>
          </button>
        </div>
        <div class="video-capture-bottom">
          <p class="video-capture-hint">
            <template v-if="captureReviewKind">拍摄完成，可重拍或发送</template>
            <template v-else-if="videoCapturing">松开停止录像（最长 60 秒）</template>
            <template v-else>轻触拍照，长按录像</template>
          </p>
          <div class="video-capture-actions">
            <template v-if="captureReviewKind">
              <button type="button" class="video-capture-cancel" @click.stop="retakeCapture">
                取消重拍
              </button>
              <button type="button" class="video-capture-confirm" @click.stop="confirmCaptureSend">
                确定发送
              </button>
            </template>
            <template v-else>
              <button type="button" class="video-capture-cancel" @click.stop="closeVideoCapture">
                关闭
              </button>
              <button
                type="button"
                class="video-capture-shutter"
                :class="{ recording: videoCapturing }"
                :disabled="photoCapturing"
                aria-label="轻触拍照，长按录像"
                @pointerdown.prevent.stop="startCaptureGesture"
                @pointerup.prevent.stop="endCaptureGesture"
                @pointercancel.prevent.stop="cancelCaptureGesture"
              />
              <button
                type="button"
                class="video-capture-cancel ghost"
                @click.stop="flipVideoCaptureCamera"
              >
                翻转
              </button>
            </template>
          </div>
        </div>
      </div>
    </van-overlay>

    <van-popup
      v-model:show="showPlusSheet"
      position="bottom"
      round
      teleport="body"
      close-on-click-overlay
      safe-area-inset-bottom
      class="plus-popup"
      :style="{ background: 'var(--pulse-surface-container)' }"
    >
      <div class="plus-panel">
        <div class="plus-handle" />
        <h3 class="plus-title">选择操作</h3>
        <div ref="plusScroller" class="plus-pages" @scroll.passive="onPlusScroll">
          <div v-for="(page, pageIndex) in plusPages" :key="pageIndex" class="plus-grid">
            <button
              v-for="item in page"
              :key="item.key"
              type="button"
              class="plus-item"
              :class="{ disabled: !item.enabled }"
              :disabled="uploading"
              @touchstart.passive="onPlusTouchStart(item.key)"
              @click="onPlusAction(item.key)"
            >
              <span class="plus-icon-wrap">
                <span class="material-symbols-outlined">{{ item.icon }}</span>
              </span>
              <span class="plus-label">{{ item.label }}</span>
            </button>
          </div>
        </div>
        <div v-if="plusPages.length > 1" class="plus-dots">
          <i v-for="(_, i) in plusPages" :key="i" :class="{ on: plusPage === i }" />
        </div>
      </div>
    </van-popup>

    <van-overlay
      :show="showImageEditor"
      z-index="3200"
      :lock-scroll="true"
      class="image-editor-root"
      teleport="body"
      @click="requestCloseImageEditor"
    >
      <div class="image-editor-panel" @click.stop>
        <div class="image-editor-header">
          <button type="button" @click="requestCloseImageEditor">返回</button>
          <strong>编辑图片</strong>
          <div v-if="pendingSendFiles.length > 1" class="image-editor-paging">
            <button
              type="button"
              class="image-editor-page-btn"
              :disabled="imageEditorLoading"
              @click="switchPendingSendImage(-1)"
            >
              <span class="material-symbols-outlined">chevron_left</span>
            </button>
            <span class="image-editor-page-label">{{ pendingSendIndex + 1 }}/{{ pendingSendFiles.length }}</span>
            <button
              type="button"
              class="image-editor-page-btn"
              :disabled="imageEditorLoading"
              @click="switchPendingSendImage(1)"
            >
              <span class="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
          <div class="image-editor-history-actions">
            <button
              type="button"
              class="image-editor-history-btn"
              aria-label="返回上一步"
              :disabled="imageEditorLoading || !canUndoImageEditor()"
              @click="undoImageEditor"
            >
              <span class="material-symbols-outlined">undo</span>
            </button>
            <button
              type="button"
              class="image-editor-history-btn"
              aria-label="下一步"
              :disabled="imageEditorLoading || !canRedoImageEditor()"
              @click="redoImageEditor"
            >
              <span class="material-symbols-outlined">redo</span>
            </button>
          </div>
        </div>
        <div class="image-editor-stage">
          <div v-if="imageEditorLoading" class="image-editor-loading">图片加载中…</div>
          <canvas
            v-else
            ref="imageEditorCanvas"
            class="image-editor-canvas"
            :class="{ drawing: imageEditorDrawing, cropping: !!imageEditorCropRect }"
            @pointerdown="onImageEditorPointerDown"
            @pointermove="onImageEditorPointerMove"
            @pointerup="onImageEditorPointerUp"
            @pointercancel="onImageEditorPointerUp"
            @contextmenu.prevent
          />
        </div>
        <div class="image-editor-toolbar">
          <button
            type="button"
            :class="{ active: imageEditorDrawing }"
            :disabled="!!imageEditorCropRect"
            @click="toggleImageEditorDrawing"
          >
            <span class="material-symbols-outlined">edit</span>
            <span>画笔</span>
          </button>
          <button type="button" :class="{ active: !!imageEditorCropRect }" @click="toggleImageEditorCrop">
            <span class="material-symbols-outlined">crop</span>
            <span>裁剪</span>
          </button>
          <button type="button" @click="rotateImageEditor">
            <span class="material-symbols-outlined">rotate_right</span>
            <span>旋转</span>
          </button>
          <button
            type="button"
            class="image-editor-complete"
            :disabled="imageEditorLoading"
            @click="sendEditedImage"
          >
            {{ mediaPickerEditIndex !== null ? '完成' : '发送' }}
          </button>
        </div>
        <div
          v-if="showImageEditorExitPrompt"
          class="image-editor-exit-mask"
          role="presentation"
          @click.stop="cancelCloseImageEditor"
        >
          <section class="image-editor-exit-dialog" role="dialog" aria-modal="true" aria-label="退出编辑">
            <strong>退出编辑？</strong>
            <p>退出后本次编辑内容不会保存。</p>
            <div class="image-editor-exit-actions">
              <button type="button" @click.stop="cancelCloseImageEditor">继续编辑</button>
              <button type="button" class="danger" @click.stop="confirmCloseImageEditor">退出编辑</button>
            </div>
          </section>
        </div>
      </div>
    </van-overlay>

    <van-overlay
      :show="videoPlayerVisible"
      z-index="3000"
      :lock-scroll="true"
      :duration="0"
      class="video-overlay-root"
      teleport="body"
      @click="closeVideoPlayerFromOverlay"
      @touchstart.passive="onMediaSwipeStart"
      @touchend="onMediaSwipeEnd"
    >
      <div class="video-player-overlay" @click.stop>
        <div class="video-player-stage">
          <div v-if="videoPlayerLoading" class="video-player-loading">
            {{ videoPlayerPreparingPreview ? '视频播放版准备中…' : '视频加载中…' }}
          </div>
          <button
            v-if="videoPlayerMsg && videoOriginalUrlOf(videoPlayerMsg) && !usesMediaOriginal(videoPlayerMsg)"
            type="button"
            class="media-original-action"
            @click.stop="openOriginalVideo"
          >查看原视频</button>
          <video
            v-if="videoPlayerVisible && videoPlayerUrl"
            :key="videoPlayerUrl"
            ref="videoPlayerRef"
            :src="videoPlayerUrl"
            crossorigin="use-credentials"
            class="video-player-el"
            :style="mediaPreviewTransform"
            :class="{ 'is-waiting': !videoPlayerReady }"
            controls
            playsinline
            webkit-playsinline
            preload="auto"
            autoplay
            muted
            @loadeddata="videoPlayerReady = true"
            @canplay="videoPlayerReady = true"
            @touchstart="onPreviewMediaTouchStart('video', $event)"
            @touchmove="onPreviewMediaTouchMove"
            @touchend="onPreviewMediaTouchEnd"
            @touchcancel="onPreviewMediaTouchCancel"
            @contextmenu.prevent.stop="onPreviewMediaContextMenu('video', $event)"
            @playing="onInlineVideoPlaying"
            @error="onVideoPlayerError"
          />
        </div>
      </div>
    </van-overlay>

    <van-overlay
      :show="imagePreviewVisible"
      z-index="3000"
      :lock-scroll="true"
      :duration="0"
      class="image-overlay-root"
      teleport="body"
      @click="closeImagePreviewFromOverlay"
      @touchstart.passive="onMediaSwipeStart"
      @touchend="onMediaSwipeEnd"
    >
      <div class="image-preview-overlay" @click.stop>
        <div class="image-preview-stage">
          <button
            v-if="imagePreviewMsg && imageOriginalUrlOf(imagePreviewMsg) && !usesMediaOriginal(imagePreviewMsg)"
            type="button"
            class="media-original-action"
            @click.stop="openOriginalImage"
          >查看原图</button>
          <img
            v-if="imagePreviewUrl"
            :src="imagePreviewUrl"
            alt=""
            class="image-preview-el"
            :style="mediaPreviewTransform"
            @touchstart="onPreviewMediaTouchStart('image', $event)"
            @touchmove="onPreviewMediaTouchMove"
            @touchend="onPreviewMediaTouchEnd"
            @touchcancel="onPreviewMediaTouchCancel"
            @contextmenu.prevent.stop="onPreviewMediaContextMenu('image', $event)"
            @error="onImagePreviewError"
            @click.stop
          />
        </div>
      </div>
    </van-overlay>

    <van-action-sheet
      v-model:show="showMsgSheet"
      teleport="body"
      :z-index="10050"
      :actions="msgActions"
      cancel-text="取消"
      safe-area-inset-bottom
      @select="onMsgAction"
      @closed="onMessageSheetClosed"
    />
    <van-action-sheet
      v-model:show="showDeleteModeSheet"
      :actions="deleteModeActions"
      cancel-text="取消"
      close-on-click-action
      @select="onDeleteModeSelect"
    />
    <van-popup
      v-model:show="showGroupReadSheet"
      position="bottom"
      round
      teleport="body"
      close-on-click-overlay
      safe-area-inset-bottom
      :style="{ height: '58%', maxHeight: '58vh' }"
      class="group-read-popup"
    >
      <div class="group-read-panel">
        <div class="group-read-header">
          <div class="group-read-title">消息回执</div>
          <div class="group-read-tabs">
            <button
              type="button"
              class="group-read-tab"
              :class="{ on: groupReadSheetTab === 'read' }"
              @click="groupReadSheetTab = 'read'"
            >已读 {{ groupReadSheetReadList.length }}</button>
            <button
              type="button"
              class="group-read-tab"
              :class="{ on: groupReadSheetTab === 'unread' }"
              @click="groupReadSheetTab = 'unread'"
            >未读 {{ groupReadSheetUnreadList.length }}</button>
          </div>
        </div>
        <div class="group-read-list">
          <div v-if="!groupReadSheetList.length" class="group-read-empty">
            {{ groupReadSheetTab === 'read' ? '暂无已读成员' : '全部已读' }}
          </div>
          <div
            v-for="m in groupReadSheetList"
            :key="m.userId"
            class="group-read-item"
          >
            <img v-if="m.avatarUrl" :src="m.avatarUrl" :alt="m.nickname" class="group-read-avatar" />
            <div v-else class="group-read-avatar initials">{{ m.nickname.slice(0, 1) }}</div>
            <div class="group-read-name">{{ m.nickname }}</div>
          </div>
        </div>
      </div>
    </van-popup>
    <van-popup
      v-model:show="showForwardSheet"
      position="bottom"
      round
      teleport="body"
      close-on-click-overlay
      safe-area-inset-bottom
      :style="{ height: '68%', maxHeight: '68vh' }"
    >
      <div class="forward-panel">
        <div class="forward-header">
          <div class="forward-title">选择转发对象</div>
          <div class="forward-hint">已选 {{ forwardSelectedCount }} 个会话 · 可多选</div>
        </div>
        <div v-if="selectedCount > 1" class="forward-mode">
          <button
            type="button"
            :class="{ active: forwardMode === 'separate' }"
            @click="forwardMode = 'separate'"
          >
            <span class="material-symbols-outlined">format_list_bulleted</span>
            <span>
              <strong>逐条转发</strong>
              <small>消息逐条发送</small>
            </span>
          </button>
          <button
            type="button"
            :class="{ active: forwardMode === 'merge' }"
            @click="forwardMode = 'merge'"
          >
            <span class="material-symbols-outlined">library_books</span>
            <span>
              <strong>合并转发</strong>
              <small>生成一条聊天记录</small>
            </span>
          </button>
        </div>
        <div class="forward-list">
          <div v-if="forwardLoading" class="forward-empty">加载中...</div>
          <div v-else-if="!forwardTargets.length" class="forward-empty">暂无其他会话</div>
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
    <van-popup
      v-model:show="showGroupCallPicker"
      position="bottom"
      round
      teleport="body"
      safe-area-inset-bottom
      :z-index="4300"
      class="group-call-picker"
    >
      <div class="group-call-picker-head">
        <button type="button" @click="showGroupCallPicker = false">取消</button>
        <strong>选择群成员</strong>
        <button type="button" :disabled="!selectedCallMemberIds.length" @click="confirmGroupCall">
          呼叫{{ selectedCallMemberIds.length ? `(${selectedCallMemberIds.length})` : '' }}
        </button>
      </div>
      <p class="group-call-picker-tip">
        {{ groupCallMediaType === 'video' ? '视频通话' : '语音通话' }} · 通话中仍可继续邀请成员
      </p>
      <div class="group-call-member-list">
        <button
          v-for="member in callableGroupMembers"
          :key="member.userId"
          type="button"
          class="group-call-member"
          @click="toggleCallMember(String(member.userId))"
        >
          <img v-if="member.avatarUrl" :src="member.avatarUrl" :alt="member.nickname" />
          <span v-else class="initials">{{ member.nickname.slice(0, 1) }}</span>
          <span class="name">{{ member.nickname }}</span>
          <span class="material-symbols-outlined check">
            {{ selectedCallMemberIds.includes(String(member.userId)) ? 'check_circle' : 'radio_button_unchecked' }}
          </span>
        </button>
      </div>
    </van-popup>
    <MediaSendPicker
      ref="mediaSendPickerRef"
      :show="showMediaPicker"
      :files="mediaPickerFiles"
      :gallery-assets="mediaPickerGalleryAssets"
      :gallery-loading="mediaPickerGalleryLoading"
      :initial-mode="mediaPickerInitialMode"
      :direct-send="mediaPickerDirectSend"
      @cancel="closeMediaPicker"
      @edit="onMediaPickerEdit"
      @replace="onMediaPickerReplace"
      @send="onMediaPickerSend"
      @load-more="loadNextMediaGalleryPage"
    />
</template>

<style scoped>
.group-call-picker{height:min(72vh,620px);overflow:hidden}.group-call-picker-head{display:flex;align-items:center;justify-content:space-between;padding:18px 16px 12px}.group-call-picker-head button{min-width:64px;border:0;background:none;color:#2477f3;font-size:15px}.group-call-picker-head button:first-child{text-align:left;color:#666}.group-call-picker-head button:last-child{text-align:right}.group-call-picker-head button:disabled{color:#aaa}.group-call-picker-tip{margin:0;padding:0 18px 12px;color:#888;font-size:13px}.group-call-member-list{height:calc(100% - 88px);overflow:auto}.group-call-member{width:100%;display:flex;align-items:center;gap:12px;padding:10px 18px;border:0;background:#fff}.group-call-member img,.group-call-member .initials{width:46px;height:46px;border-radius:50%;object-fit:cover}.group-call-member .initials{display:grid;place-items:center;background:#e7ebf2}.group-call-member .name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.group-call-member .check{margin-left:auto;color:#2477f3}
.group-call-picker{color:var(--pulse-text);background:var(--pulse-surface-container)}.group-call-picker-head{border-bottom:1px solid rgba(255,255,255,.08);background:var(--pulse-surface-high)}.group-call-picker-head strong{color:#fff}.group-call-picker-head button{color:#69a7ff}.group-call-picker-head button:first-child{color:var(--pulse-text-secondary)}.group-call-picker-head button:disabled{color:#626d7c}.group-call-picker-tip{padding-top:12px;color:#aab4c2;background:var(--pulse-surface-container)}.group-call-member-list{background:var(--pulse-surface-container)}.group-call-member{padding:11px 18px;border-bottom:1px solid rgba(255,255,255,.055);color:var(--pulse-text);background:var(--pulse-surface-container);text-align:left}.group-call-member:active{background:#2a3443}.group-call-member img,.group-call-member .initials{flex:0 0 46px;border:1px solid rgba(255,255,255,.16)}.group-call-member .initials{color:#fff;background:linear-gradient(145deg,#5478d8,#7656c7);font-size:18px;font-weight:600}.group-call-member .name{color:var(--pulse-text)}.group-call-member .check{color:#69a7ff}
.chat-page {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: 100%;
  overflow: hidden;
  background: var(--pulse-page-bg, var(--pulse-bg));
  /* 减少无关重绘 */
  contain: layout style;
  overscroll-behavior: none;
}

/* 键盘弹起：去掉底部 home indicator 留白，避免键盘上方一条空白 */
.chat-page.keyboard-open .chat-footer,
.chat-page.keyboard-open .multi-footer {
  padding-bottom: 8px;
}

.chat-page.keyboard-open .jump-latest-btn {
  bottom: 88px;
}

.chat-page.keyboard-open .jump-mention-btn {
  bottom: 142px;
}

.chat-page.keyboard-open .emoji-panel {
  padding-bottom: 8px;
}

.chat-header {
  position: relative;
  flex-shrink: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 56px;
  height: auto;
  padding: 8px 12px;
  padding-top: var(--pulse-header-pad-top);
  box-sizing: border-box;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
  flex: 1;
}

.peer-info {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 1;
  border: none;
  background: transparent;
  padding: 0;
  margin: 0;
  text-align: left;
  cursor: pointer;
  color: inherit;
}

.peer-info:active {
  opacity: 0.85;
}

.peer-info-static {
  cursor: default;
}

.peer-info-static:active {
  opacity: 1;
}

.back-btn {
  margin-left: 0;
}

.icon-btn {
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  color: var(--pulse-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 50%;
  transition: background 0.2s;
}

.icon-btn .material-symbols-outlined {
  font-size: 22px;
}

.back-btn {
  color: var(--pulse-primary);
}

.header-unread-btn {
  margin-inline: 6px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  min-width: 28px;
  padding: 0 7px;
  border: 1px solid color-mix(in srgb, var(--pulse-primary) 48%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--pulse-primary) 12%, transparent);
  color: var(--pulse-primary);
  font-size: 12px;
  line-height: 1;
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
}

.header-unread-btn:active {
  background: color-mix(in srgb, var(--pulse-primary) 22%, transparent);
}

.header-unread-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  font-weight: 700;
  line-height: 1;
}

.icon-btn:active {
  background: rgba(52, 53, 57, 0.5);
}

.peer-avatar-wrap {
  position: relative;
  flex-shrink: 0;
}

.peer-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--pulse-surface-highest);
  border: 1px solid var(--pulse-outline-variant);
}

.peer-avatar.initials {
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  color: var(--pulse-text);
}

.online-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  z-index: 1;
  background: var(--pulse-outline);
  border: 2px solid var(--pulse-bg);
}

.online-dot.online {
  background: var(--pulse-secondary);
}

.online-dot.hidden {
  display: none;
}

.peer-text {
  min-width: 0;
  flex: 1;
  overflow: hidden;
}

.peer-text.group-peer-text {
  flex: 0 1 min(46vw, 180px);
  max-width: min(46vw, 180px);
}

.peer-name-row {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.peer-name-track {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  min-width: 0;
  will-change: transform;
}

.peer-name-track.scrolling {
  max-width: none;
  animation: peer-name-marquee 9s ease-in-out infinite;
}

.peer-name {
  flex: none;
  font-size: 16px;
  font-weight: 600;
  line-height: 22px;
  color: var(--pulse-text);
  white-space: nowrap;
}

.peer-name-track:not(.scrolling) .peer-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.peer-friend-tag {
  flex: none;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  line-height: 16px;
  white-space: nowrap;
  overflow: visible;
  text-overflow: unset;
}

@keyframes peer-name-marquee {
  0%,
  12% {
    transform: translateX(0);
  }
  45%,
  55% {
    transform: translateX(var(--peer-marquee-x, 0px));
  }
  88%,
  100% {
    transform: translateX(0);
  }
}

.peer-status {
  font-size: 11px;
  font-weight: 600;
  line-height: 13px;
  color: var(--pulse-text-secondary);
}

.peer-status-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  white-space: nowrap;
}

.peer-typing-status {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  font-weight: 600;
  line-height: 13px;
  color: var(--pulse-primary);
}

.peer-status.online {
  color: var(--pulse-secondary);
}

.call-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.auto-delete-notice {
  display: flex;
  gap: 9px;
  padding: 11px 12px;
  border: 1px solid color-mix(in srgb, var(--pulse-primary) 22%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--pulse-primary-container) 45%, transparent);
  color: var(--pulse-text-secondary);
  line-height: 1.45;
}
.auto-delete-notice > span { flex: 0 0 auto; color: var(--pulse-primary); font-size: 20px; }
.auto-delete-notice p { margin: 0; font-size: 13px; }
.auto-delete-notice p + p { margin-top: 3px; }
.auto-delete-notice small { display: block; margin-top: 5px; font-size: 11px; opacity: .78; }

.message-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
  padding: 12px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}

.history-loader {
  min-height: 38px;
  margin: 2px auto 10px;
  padding: 0 14px;
  border: 0;
  background: transparent;
  color: var(--pulse-text-secondary, #8a8a8a);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 12px;
}

.history-spinner {
  width: 15px;
  height: 15px;
  border: 2px solid rgba(128, 128, 128, 0.25);
  border-top-color: var(--pulse-primary, #1677ff);
  border-radius: 50%;
  animation: history-spin 0.7s linear infinite;
}

.history-end {
  padding: 8px 0 14px;
  text-align: center;
  color: var(--pulse-text-tertiary, #aaa);
  font-size: 11px;
}

@keyframes history-spin {
  to { transform: rotate(360deg); }
}

.bubble.swipe-replying {
  position: relative;
  transition: none;
  will-change: transform;
}

.bubble:not(.swipe-replying) {
  transition: transform 0.18s ease-out;
}

.swipe-reply-icon {
  position: absolute;
  top: 50%;
  right: -42px;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #fff;
  background: var(--pulse-primary, #1677ff);
  transform: translateY(-50%);
  font-size: 18px;
  pointer-events: none;
}

.bubble.swipe-replying:not(.mine) .swipe-reply-icon {
  right: auto;
  left: -42px;
}

.jump-latest-btn {
  position: absolute;
  right: 16px;
  bottom: calc(88px + var(--pulse-safe-bottom, env(safe-area-inset-bottom, 0px)));
  z-index: 20;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--pulse-text-primary, #1a1a1a);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  cursor: pointer;
}

.jump-latest-btn .material-symbols-outlined {
  font-size: 26px;
  font-variation-settings: 'FILL' 0, 'wght' 500, 'GRAD' 0, 'opsz' 24;
}

.jump-latest-btn:active {
  transform: scale(0.94);
}

.jump-mention-btn {
  position: absolute;
  right: 0;
  bottom: calc(142px + var(--pulse-safe-bottom, env(safe-area-inset-bottom, 0px)));
  z-index: 21;
  min-height: 42px;
  padding: 0 10px 0 12px;
  border: none;
  border-radius: 21px 0 0 21px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: #2468d6;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 3px 14px rgba(0, 0, 0, 0.13);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.jump-mention-btn .mention-jump-mark {
  width: 23px;
  height: 23px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  background: #3b7be0;
  font-size: 15px;
  font-weight: 700;
}

.jump-mention-btn .material-symbols-outlined {
  font-size: 18px;
}

.jump-mention-btn:active {
  background: #f2f5f9;
}

.message-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  max-width: 100%;
}

.message-row.selectable {
  cursor: pointer;
  padding: 6px 4px;
  margin: 0 -4px;
  border-radius: 12px;
}

.message-row.mine {
  flex-direction: row-reverse;
}

.message-row.selected {
  background: rgba(75, 142, 255, 0.08);
  border-radius: 12px;
}

.select-check {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  margin-top: 4px;
  margin-left: -6px;
  margin-right: -6px;
  border: none;
  background: transparent;
  color: var(--pulse-text-secondary);
  display: grid;
  place-items: center;
  padding: 0;
  pointer-events: none;
}

.select-check.on {
  color: var(--pulse-primary);
}

.select-check.disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.select-check .material-symbols-outlined {
  font-size: 22px;
}

.multi-footer {
  position: relative;
  flex-shrink: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-around;
  min-height: 72px;
  padding: 8px 12px calc(8px + var(--pulse-safe-bottom, env(safe-area-inset-bottom, 0px)));
  box-sizing: border-box;
}

.multi-action {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  color: var(--pulse-text);
  font-size: 12px;
  cursor: pointer;
  min-width: 64px;
  padding: 8px;
}

.multi-action:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.multi-action.danger {
  color: #ff8a80;
}

.multi-action .material-symbols-outlined {
  font-size: 24px;
}

.forward-panel {
  height: 100%;
  max-height: 68vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--pulse-surface-low);
  color: var(--pulse-text);
  box-sizing: border-box;
}

.forward-header {
  flex-shrink: 0;
  padding: 14px 16px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.forward-title {
  font-size: 16px;
  font-weight: 700;
}

.forward-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--pulse-outline);
}

.forward-mode {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 0 16px 12px;
}

.forward-mode button {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--pulse-border);
  border-radius: 8px;
  background: var(--pulse-surface-container);
  color: var(--pulse-text-secondary);
  text-align: left;
}

.forward-mode button.active {
  border-color: var(--pulse-primary);
  background: color-mix(in srgb, var(--pulse-primary) 12%, var(--pulse-surface-container));
  color: var(--pulse-primary);
}

.forward-mode .material-symbols-outlined {
  flex: 0 0 auto;
  font-size: 22px;
}

.forward-mode button > span:last-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.forward-mode strong {
  color: var(--pulse-text);
  font-size: 13px;
  font-weight: 600;
}

.forward-mode small {
  overflow: hidden;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.forward-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.forward-empty {
  padding: 40px 16px;
  text-align: center;
  color: var(--pulse-outline);
  font-size: 14px;
}

.forward-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.forward-item.on {
  background: rgba(75, 142, 255, 0.1);
}

.forward-item:active {
  background: rgba(255, 255, 255, 0.05);
}

.forward-check {
  font-size: 22px;
  color: var(--pulse-outline);
  flex-shrink: 0;
}

.forward-item.on .forward-check {
  color: var(--pulse-primary);
}

.forward-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--pulse-surface-highest);
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
  flex-shrink: 0;
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
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.forward-cancel {
  background: var(--pulse-surface-high);
  color: var(--pulse-text-secondary);
}

.forward-submit {
  background: var(--pulse-primary, var(--pulse-primary-container));
  color: #061a3a;
}

.forward-submit:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.message-row.highlight .bubble:not(.image):not(.video),
.message-row.highlight .recall-tip {
  box-shadow: 0 0 0 2px var(--pulse-primary);
  animation: msg-flash 1.6s ease;
}

.message-row.highlight .bubble.image,
.message-row.highlight .bubble.video {
  box-shadow: none;
  background: transparent !important;
  animation: none;
}

.message-row.highlight .bubble.image .msg-image,
.message-row.highlight .bubble.video .msg-video-wrap {
  outline: 2px solid var(--pulse-primary);
  outline-offset: 2px;
  animation: msg-flash 1.6s ease;
}

@keyframes msg-flash {
  0%,
  100% {
    filter: brightness(1);
  }
  30% {
    filter: brightness(1.25);
  }
}

.msg-avatar-btn {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 50%;
}

.msg-avatar-btn:active {
  opacity: 0.85;
  transform: scale(0.96);
}

.msg-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--pulse-surface-highest);
  border: 1px solid var(--pulse-outline-variant);
  display: block;
}

.msg-avatar.initials {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 700;
  color: var(--pulse-primary);
}

.message-col {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
  max-width: calc(100% - 50px);
  flex: 1;
}

.message-col.mine {
  align-items: flex-end;
}

.sender-name {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  width: fit-content;
  min-width: 0;
  max-width: var(--chat-bubble-max, 78%);
  padding: 0 2px;
  font-size: calc(var(--chat-font-size, 15px) * 0.8);
  font-weight: 600;
  line-height: 1.3;
  color: var(--pulse-text-secondary);
}

.sender-name-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sender-name.mine {
  color: var(--pulse-primary);
}

.message-friend-tag {
  flex: 0 1 auto;
  max-width: 100%;
  box-sizing: border-box;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
  white-space: normal;
  overflow-wrap: anywhere;
}

.bubble {
  max-width: var(--chat-bubble-max, 78%);
  width: fit-content;
  padding: var(--chat-bubble-pad-y, 11px) var(--chat-bubble-pad-x, 15px);
  border-radius: 22px 22px 22px 6px;
  font-size: var(--chat-font-size, 15px);
  line-height: var(--chat-line-height, 22px);
  background: linear-gradient(145deg, #343640 0%, #292b34 100%);
  color: var(--pulse-text);
  word-break: break-word;
  overflow-wrap: anywhere;
  box-shadow:
    0 8px 20px rgba(0, 0, 0, 0.12),
    inset 0 1px 0 rgba(255, 255, 255, 0.035);
  -webkit-user-select: none !important;
  user-select: none !important;
  -webkit-touch-callout: none !important;
  -webkit-user-drag: none;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.bubble.video {
  touch-action: auto;
  -webkit-touch-callout: default;
}

.bubble *:not(video):not(.msg-video):not(.msg-video-wrap):not(.video-play-btn),
.file-card,
.voice-bubble,
.msg-image,
.contact-card,
.fwd-card,
.bubble-text,
.file-card-name,
.file-card-sub {
  -webkit-user-select: none !important;
  user-select: none !important;
  -webkit-touch-callout: none !important;
  -webkit-user-drag: none;
}

.bubble.mine {
  border-radius: 22px 6px 22px 22px;
  background: linear-gradient(135deg, var(--pulse-primary-container) 0%, #6675f5 48%, #a14ff0 100%);
  color: #fff;
  box-shadow:
    0 9px 24px rgba(83, 111, 239, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.16);
}

.bubble.card {
  padding: 0;
  overflow: hidden;
  background: var(--pulse-surface-high);
  min-width: min(240px, 72vw);
}

.bubble.card.mine {
  background: #2f4a7a;
}

.bubble.business {
  width: min(230px, 72vw);
  max-width: 72vw;
  padding: 0;
  overflow: hidden;
  background: transparent;
  box-shadow: none;
}

.fwd-card {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px 10px;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.fwd-card-title {
  font-size: calc(var(--chat-font-size, 15px) * 0.95);
  font-weight: 700;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fwd-card-line {
  font-size: calc(var(--chat-font-size, 15px) * 0.82);
  line-height: 1.35;
  opacity: 0.78;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fwd-card-name {
  opacity: 0.9;
}

.fwd-card-foot {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  opacity: 0.75;
}

.fwd-card-foot .material-symbols-outlined {
  font-size: 16px;
}

.file-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-width: 200px;
  padding: 12px 14px;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  box-sizing: border-box;
}

.file-send-confirm {
  position: absolute;
  top: 50%;
  left: 50%;
  width: min(330px, calc(100vw - 40px));
  box-sizing: border-box;
  margin: 0;
  transform: translate(-50%, -50%);
  padding: 24px 20px 18px;
  border-radius: 22px;
  background: var(--pulse-surface-high, #292b34);
  color: var(--pulse-text, #fff);
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
}

.file-send-confirm-icon {
  width: 56px;
  height: 56px;
  margin: 0 auto 12px;
  border-radius: 18px;
  display: grid;
  place-items: center;
  background: rgba(95, 137, 255, 0.18);
  color: #9ab7ff;
}

.file-send-confirm-icon .material-symbols-outlined {
  font-size: 30px;
}

.file-send-confirm h3 {
  margin: 0;
  font-size: 18px;
}

.file-send-confirm-name {
  margin: 14px 0 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
  font-weight: 600;
}

.file-send-confirm-meta {
  margin: 0;
  color: var(--pulse-text-secondary, #aeb4c5);
  font-size: 12px;
}

.file-send-confirm-actions {
  display: flex;
  gap: 10px;
  margin-top: 22px;
}

.file-send-confirm-actions button {
  flex: 1;
  height: 42px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 21px;
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  font-size: 15px;
  font-weight: 600;
}

.file-send-confirm-actions button.primary {
  border-color: transparent;
  background: linear-gradient(135deg, #4b8eff, #6675f5);
  color: #fff;
}

.file-card-icon {
  font-size: 32px;
  color: var(--pulse-primary);
  flex-shrink: 0;
}

.file-card.mine .file-card-icon {
  color: #c9d8ff;
}

.file-card-meta {
  min-width: 0;
  flex: 1;
}

.file-card-name {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-card-sub {
  margin-top: 2px;
  font-size: 12px;
  opacity: 0.75;
}

.contact-card {
  display: block;
  width: 100%;
  min-width: 200px;
  padding: 12px 14px 10px;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  box-sizing: border-box;
}

.contact-card-main {
  display: flex;
  align-items: center;
  gap: 10px;
}

.contact-card-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--pulse-surface-highest);
  flex-shrink: 0;
}

.contact-card-avatar.initials {
  display: grid;
  place-items: center;
  font-weight: 700;
  color: var(--pulse-primary);
  font-size: 16px;
}

.contact-card-meta {
  min-width: 0;
}

.contact-card-name {
  font-size: 15px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.contact-card-sub {
  margin-top: 2px;
  font-size: 12px;
  opacity: 0.75;
}

.contact-card-foot {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  opacity: 0.75;
}

.contact-card-foot .material-symbols-outlined {
  font-size: 16px;
}

.bubble.voice {
  padding: 4px 8px;
  border-radius: 12px;
}

.bubble.location {
  width: min(270px, 100%);
  max-width: 100%;
  padding: 0;
  overflow: hidden;
  background: transparent;
  box-shadow: none;
}

.bubble.image,
.bubble.video {
  padding: 0;
  background: transparent !important;
  box-shadow: none;
  overflow: visible;
}

.bubble.video {
  width: min(240px, 100%);
  max-width: 100%;
}

.msg-image {
  max-width: min(220px, 70vw);
  border-radius: 10px;
  display: block;
  cursor: zoom-in;
  -webkit-touch-callout: none !important;
  -webkit-user-select: none !important;
  user-select: none !important;
  -webkit-user-drag: none;
  pointer-events: auto;
}

.msg-image-wrap {
  position: relative;
  display: inline-block;
  padding: 0;
  border: none;
  background: transparent;
  max-width: min(220px, 70vw);
  cursor: zoom-in;
}

.msg-image-wrap .msg-image {
  width: 100%;
}

.msg-image-pending {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: min(220px, 70vw);
  min-height: 120px;
  aspect-ratio: 4 / 3;
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.82);
  background: linear-gradient(145deg, #28313d, #111820);
  font-size: 12px;
  pointer-events: none;
}

.msg-image-pending .material-symbols-outlined {
  font-size: 30px;
  opacity: 0.9;
}

.media-hd-badge {
  position: absolute;
  right: 6px;
  bottom: 6px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 10px;
  line-height: 1.3;
  pointer-events: auto;
  cursor: pointer;
  touch-action: manipulation;
}

.msg-video-thumb-img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}

.msg-video-pending {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: rgba(255, 255, 255, 0.82);
  background: linear-gradient(145deg, #28313d, #111820);
  font-size: 12px;
  pointer-events: none;
}

.msg-video-pending .material-symbols-outlined {
  font-size: 30px;
  opacity: 0.9;
}

.msg-video-wrap {
  position: relative;
  display: block;
  max-width: 100%;
  width: 100%;
  aspect-ratio: 16 / 9;
  padding: 0;
  border: none;
  border-radius: 10px;
  overflow: hidden;
  background: #111;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}

.video-play-mask {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: #fff;
}

.video-play-mask .material-symbols-outlined {
  font-size: 52px;
  filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.5));
}

.video-play-text {
  font-size: 12px;
  font-weight: 600;
  opacity: 0.95;
}

.video-overlay-root {
  display: flex !important;
  align-items: stretch;
  justify-content: center;
}

.video-player-overlay {
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: #000;
  padding: 0;
  box-sizing: border-box;
}

.video-player-top {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  color: #fff;
  flex-shrink: 0;
}

.video-player-title {
  flex: 1;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.video-player-close {
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  display: grid;
  place-items: center;
  cursor: pointer;
  flex-shrink: 0;
  -webkit-tap-highlight-color: transparent;
}

.video-player-close-bar {
  flex-shrink: 0;
  margin: 8px 16px 0;
  border: none;
  border-radius: 10px;
  height: 44px;
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.video-player-stage {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  touch-action: none;
}

.video-player-loading {
  position: absolute;
  z-index: 2;
  color: rgba(255, 255, 255, 0.85);
  font-size: 14px;
  font-weight: 600;
}

.media-original-action {
  position: absolute;
  z-index: 4;
  right: 16px;
  bottom: calc(76px + env(safe-area-inset-bottom, 0px));
  padding: 9px 14px;
  border: 1px solid rgba(255, 255, 255, .3);
  border-radius: 999px;
  color: #fff;
  background: rgba(0, 0, 0, .58);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  -webkit-tap-highlight-color: transparent;
}

.video-player-el {
  width: 100%;
  height: 100%;
  min-height: 0;
  background: #000;
  object-fit: contain;
  touch-action: none;
  transform-origin: center center;
  will-change: transform;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

.video-player-el.is-waiting {
  visibility: hidden;
}

.video-player-play-btn {
  position: absolute;
  z-index: 3;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  border: none;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  border-radius: 16px;
  padding: 14px 22px;
  font-size: 15px;
  font-weight: 700;
  -webkit-tap-highlight-color: transparent;
}

.video-player-play-btn .material-symbols-outlined {
  font-size: 56px;
  line-height: 1;
}

.video-player-download {
  flex-shrink: 0;
  margin: 10px 16px 16px;
  border: none;
  border-radius: 10px;
  height: 44px;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.video-player-original,
.image-preview-original {
  flex-shrink: 0;
  margin: 0 16px 8px;
  border: none;
  border-radius: 10px;
  height: 44px;
  background: rgba(75, 142, 255, 0.95);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.video-player-original:disabled,
.image-preview-original:disabled {
  opacity: 0.65;
}

.image-overlay-root {
  display: flex !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  height: 100dvh !important;
  background: #000 !important;
}

.image-preview-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: #000;
}

.image-preview-top {
  position: absolute;
  z-index: 5;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  padding-top: calc(12px + env(safe-area-inset-top, 0px));
  color: #fff;
  background: linear-gradient(to bottom, rgba(0,0,0,.58), transparent);
  pointer-events: none;
}

.image-preview-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  font-weight: 600;
}

.media-preview-type-icon {
  flex: none;
  font-size: 20px;
}

.image-preview-close {
  border: none;
  background: transparent;
  color: #fff;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  pointer-events: auto;
}

.image-preview-stage {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: 0;
  overflow: hidden;
}

.image-preview-el {
  display: block;
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  object-fit: contain;
  border-radius: 0;
  touch-action: none;
  transform-origin: center center;
  transition: none !important;
  will-change: transform;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

.image-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  display: grid;
  place-items: center;
}

.image-nav.prev {
  left: 8px;
}

.image-nav.next {
  right: 8px;
}

.image-preview-close-bar {
  position: absolute;
  z-index: 5;
  left: 16px;
  right: 16px;
  bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  margin: 0;
  border: none;
  border-radius: 10px;
  height: 44px;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
}

.image-preview-original {
  position: absolute;
  z-index: 5;
  left: 16px;
  right: 16px;
  bottom: calc(68px + env(safe-area-inset-bottom, 0px));
  margin: 0;
}

.video-capture-root {
  display: flex !important;
  background: #000 !important;
}

.video-capture-page {
  position: relative;
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background: #000;
  color: #fff;
}

.video-capture-preview {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #111;
  opacity: 0;
  pointer-events: none;
}

.video-capture-preview.ready {
  opacity: 1;
}

.video-capture-top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--pulse-header-pad-top) 12px 10px;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.55), transparent);
  pointer-events: auto;
}

.video-capture-title {
  font-size: 15px;
  font-weight: 700;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.video-capture-title small {
  font-size: 11px;
  font-weight: 600;
  opacity: 0.85;
}

.video-capture-icon-btn {
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  display: grid;
  place-items: center;
  -webkit-tap-highlight-color: transparent;
}

.video-capture-bottom {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 16px 16px calc(28px + env(safe-area-inset-bottom));
  background: linear-gradient(to top, rgba(0, 0, 0, 0.65), transparent);
  pointer-events: auto;
}

.video-capture-hint {
  margin: 0;
  font-size: 12px;
  opacity: 0.9;
  text-align: center;
}

.video-capture-actions {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
}

.video-capture-cancel {
  min-width: 64px;
  height: 40px;
  border: none;
  border-radius: 20px;
  padding: 0 14px;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  -webkit-tap-highlight-color: transparent;
}

.video-capture-cancel.ghost {
  background: rgba(255, 255, 255, 0.12);
}

.video-capture-confirm {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 112px;
  height: 44px;
  border: none;
  border-radius: 22px;
  padding: 0 20px;
  background: #2196f3;
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  -webkit-tap-highlight-color: transparent;
}

.video-capture-shutter {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 4px solid rgba(255, 255, 255, 0.9);
  background: #ff3b30;
  box-shadow: 0 0 0 4px rgba(255, 59, 48, 0.25);
  -webkit-tap-highlight-color: transparent;
}

.video-capture-shutter.recording {
  border-radius: 16px;
  width: 56px;
  height: 56px;
  background: #ff3b30;
}

.hidden-file {
  display: none;
}

.plus-panel {
  padding: 8px 16px calc(28px + env(safe-area-inset-bottom));
  background: var(--pulse-surface-container);
  color: var(--pulse-text);
  width: 100%;
  box-sizing: border-box;
}

.plus-handle {
  width: 36px;
  height: 4px;
  margin: 4px auto 16px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
}

.plus-title {
  margin: 0 4px 20px;
  font-size: 20px;
  font-weight: 700;
  color: #fff;
}

.plus-pages {
  display: flex;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  margin: 0 -16px;
}

.plus-pages::-webkit-scrollbar {
  display: none;
}

.plus-grid {
  flex: 0 0 100%;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: repeat(2, 82px);
  gap: 18px 10px;
  padding: 0 16px;
  scroll-snap-align: start;
}

.plus-dots {
  display: flex;
  justify-content: center;
  gap: 6px;
  margin-top: 18px;
}

.plus-dots i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #55565c;
}

.plus-dots i.on {
  background: #c9cad0;
}

.plus-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 0;
}

.plus-item.disabled {
  opacity: 0.45;
}

.plus-icon-wrap {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: var(--pulse-surface-high);
  display: grid;
  place-items: center;
}

.plus-icon-wrap .material-symbols-outlined {
  font-size: 26px;
  color: var(--pulse-text);
}

.plus-label {
  font-size: 12px;
  color: #c5c6cb;
}

.bubble-text {
  display: block;
}

.mention-hl {
  color: #4c8bf5;
  font-weight: 600;
}

.at-symbol {
  font-size: 20px;
  font-weight: 700;
  line-height: 1;
}

.mention-sheet {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--pulse-bg, var(--pulse-bg));
  color: var(--pulse-text, #fff);
}

.mention-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.mention-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.mention-cancel {
  border: none;
  background: transparent;
  color: var(--pulse-text-secondary, #a0a1a6);
  font-size: 15px;
}

.mention-spacer {
  width: 40px;
}

.mention-list {
  flex: 1;
  overflow: auto;
  padding: 8px 0 24px;
}

.mention-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 16px;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.mention-item:active {
  background: rgba(52, 53, 57, 0.55);
}

.mention-item.at-all .mention-name {
  color: #4c8bf5;
}

.mention-avatar {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  object-fit: cover;
  background: var(--pulse-surface-high);
  flex-shrink: 0;
}

.mention-avatar.initials {
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  color: #fff;
  background: #3d5a80;
}

.mention-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.mention-name {
  font-size: 15px;
  font-weight: 600;
}

.mention-sub {
  font-size: 12px;
  color: var(--pulse-text-secondary, #8a8b90);
}

.mention-empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--pulse-text-secondary, #8a8b90);
  font-size: 14px;
}

.quote-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  margin: 0 0 8px;
  padding: 6px 8px;
  border: none;
  border-left: 3px solid rgba(255, 255, 255, 0.35);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.18);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.quote-block.mine {
  border-left-color: rgba(255, 255, 255, 0.55);
  background: rgba(0, 0, 0, 0.12);
}

.quote-name {
  font-size: calc(var(--chat-font-size, 15px) * 0.78);
  font-weight: 700;
  opacity: 0.9;
}

.quote-main {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
  min-width: 0;
}

.quote-thumb {
  position: relative;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.25);
}

.quote-thumb img,
.quote-thumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.quote-thumb.video .material-symbols-outlined {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 18px;
  height: 18px;
  font-size: 18px;
  color: #fff;
}

.quote-file-icon {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.1);
}

.quote-file-icon .material-symbols-outlined {
  font-size: 18px;
  opacity: 0.9;
}

.quote-text {
  font-size: calc(var(--chat-font-size, 15px) * 0.85);
  opacity: 0.75;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 180px;
  min-width: 0;
}

.recall-tip {
  max-width: var(--chat-bubble-max, 78%);
  padding: 6px 10px;
  border-radius: 8px;
  font-size: calc(var(--chat-font-size, 15px) * 0.85);
  color: var(--pulse-text-secondary);
  background: rgba(56, 57, 61, 0.55);
}

.recall-edit-btn {
  margin-left: 8px;
  padding: 0 4px;
  border: 0;
  background: transparent;
  color: var(--pulse-primary);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.msg-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 2px;
}

.msg-meta.mine {
  margin-left: 0;
  margin-right: 2px;
}

.msg-time {
  font-size: calc(var(--chat-font-size, 15px) * 0.72);
  font-weight: 600;
  color: var(--pulse-text-secondary);
}

.private-read-receipt {
  position: relative;
  display: inline-block;
  flex: 0 0 14px;
  width: 14px;
  height: 14px;
  border: 1.6px solid currentColor;
  border-radius: 50%;
  color: var(--pulse-text-secondary);
  opacity: 0.72;
  box-sizing: border-box;
}

/* 未读：只有一圈轮廓；已读：外圈与内圈之间填充主题色。 */
.private-read-receipt.read {
  border-color: currentColor;
  color: var(--pulse-primary);
  opacity: 1;
  background: transparent;
}

.private-read-receipt.read::before {
  content: '';
  position: absolute;
  inset: 1.6px;
  background: conic-gradient(
    from -35deg,
    #ff5f6d 0deg,
    #ffb347 72deg,
    #4fd1a5 144deg,
    #4f8cff 216deg,
    #a96cff 288deg,
    #ff5f6d 360deg
  );
  border-radius: 50%;
  -webkit-mask: radial-gradient(circle, transparent 0 3.45px, #000 3.6px 100%);
  mask: radial-gradient(circle, transparent 0 3.45px, #000 3.6px 100%);
}

.private-read-receipt.read::after {
  content: '';
  position: absolute;
  inset: 3.4px;
  border: 1px solid currentColor;
  border-radius: 50%;
}

.delivery-state {
  appearance: none;
  border: 0;
  background: transparent;
  padding: 0;
  color: var(--pulse-text-secondary);
  font-size: 11px;
}

.delivery-state.failed {
  color: #ff5c6c;
  cursor: pointer;
}

.read-receipt-text {
  appearance: none;
  border: 0;
  background: transparent;
  padding: 0;
  margin: 0;
  font: inherit;
  font-size: calc(var(--chat-font-size, 15px) * 0.68);
  font-weight: 600;
  color: var(--pulse-text-secondary);
  opacity: 0.85;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.read-receipt-text.read {
  color: var(--pulse-primary);
  opacity: 1;
}

.group-read-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--pulse-surface-low);
  color: var(--pulse-text);
  box-sizing: border-box;
}

.group-read-header {
  flex-shrink: 0;
  padding: 14px 16px 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.group-read-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--pulse-text);
  text-align: center;
  margin-bottom: 12px;
}

.group-read-tabs {
  display: flex;
  gap: 8px;
}

.group-read-tab {
  flex: 1;
  appearance: none;
  border: 0;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 13px;
  font-weight: 650;
  color: var(--pulse-outline);
  background: rgba(255, 255, 255, 0.06);
  cursor: pointer;
}

.group-read-tab.on {
  color: var(--pulse-primary);
  background: color-mix(in srgb, var(--pulse-primary) 22%, transparent);
}

.group-read-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px 12px 16px;
}

.group-read-empty {
  padding: 40px 12px;
  text-align: center;
  font-size: 13px;
  color: var(--pulse-outline);
}

.group-read-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 8px;
}

.group-read-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.08);
}

.group-read-avatar.initials {
  display: grid;
  place-items: center;
  font-size: 15px;
  font-weight: 700;
  color: var(--pulse-outline);
}

.group-read-name {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--pulse-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-footer {
  position: relative;
  flex-shrink: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0;
  min-height: 72px;
  padding: 8px 16px;
  padding-bottom: calc(8px + var(--pulse-safe-bottom, env(safe-area-inset-bottom, 0px)));
  box-sizing: border-box;
}

.friend-block-tip {
  padding: 12px 8px;
  text-align: center;
  font-size: 13px;
  font-weight: 500;
  color: var(--pulse-text-secondary);
}

.chat-block-tip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 12px;
  text-align: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--pulse-text-secondary);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
}

.chat-block-tip.mute {
  color: var(--pulse-error);
  background: rgba(255, 84, 71, 0.12);
}

.chat-block-tip .material-symbols-outlined {
  font-size: 18px;
}

.mute-soft-tip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-bottom: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  color: #ffb74d;
  background: rgba(255, 183, 77, 0.12);
}

.mute-soft-tip .material-symbols-outlined {
  font-size: 16px;
}

.message-row.system {
  justify-content: center;
  padding: 4px 16px;
}

.system-tip-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  max-width: 86%;
}

.system-tip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 6px 12px;
  border-radius: 999px;
  text-align: center;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--pulse-text-secondary);
  background: rgba(56, 57, 61, 0.65);
}

.system-tip.business-system-tip {
  border: 1px solid color-mix(in srgb, var(--pulse-primary) 48%, transparent);
  color: var(--pulse-primary);
  background: color-mix(in srgb, var(--pulse-primary) 13%, var(--pulse-surface-container));
  box-shadow: 0 4px 14px color-mix(in srgb, var(--pulse-primary) 16%, transparent);
  cursor: pointer;
  font-weight: 650;
  -webkit-tap-highlight-color: transparent;
}

.system-tip.business-system-tip:active {
  transform: scale(0.97);
  background: color-mix(in srgb, var(--pulse-primary) 22%, var(--pulse-surface-container));
}

.system-tip-business-icon {
  flex: none;
  font-size: 15px;
  font-weight: 700;
}

.burn-status {
  display: flex;
  align-items: center;
  gap: 3px;
  margin-top: 4px;
  color: #d94b32;
  font-size: 11px;
  line-height: 16px;
}

.burn-status.mine {
  justify-content: flex-end;
}

.burn-status .material-symbols-outlined {
  font-size: 14px;
}

.burn-progress-track {
  width: 32px;
  height: 3px;
  overflow: hidden;
  border-radius: 4px;
  background: color-mix(in srgb, currentColor 20%, transparent);
}

.burn-progress-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: currentColor;
  transition: width 250ms linear;
}

.burn-media-locked {
  width: 176px;
  min-height: 132px;
  border: 0;
  border-radius: 8px;
  background:
    linear-gradient(rgba(30, 31, 35, 0.72), rgba(30, 31, 35, 0.72)),
    repeating-linear-gradient(135deg, #74777f 0 8px, #676a72 8px 16px);
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font: inherit;
}

.burn-media-locked .material-symbols-outlined {
  font-size: 28px;
}

.burn-media-locked small {
  color: rgba(255, 255, 255, 0.76);
  font-size: 11px;
}

.system-tip.call-record {
  appearance: none;
  border: 0;
  font-family: inherit;
  cursor: pointer;
}

.system-tip.call-record:active {
  opacity: 0.75;
}

.system-tip-time {
  font-size: calc(var(--chat-font-size, 15px) * 0.72);
  font-weight: 600;
  color: var(--pulse-text-secondary);
  opacity: 0.9;
  white-space: nowrap;
}


.reply-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--pulse-surface-high);
  border-left: 3px solid var(--pulse-primary);
}

.reply-bar-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.reply-bar-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--pulse-primary);
}

.reply-bar-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.reply-bar-thumb {
  position: relative;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.3);
}

.reply-bar-thumb img,
.reply-bar-thumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.reply-bar-thumb.video .material-symbols-outlined {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 18px;
  height: 18px;
  font-size: 18px;
  color: #fff;
}

.reply-bar-file-icon {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  background: rgba(173, 198, 255, 0.15);
  color: var(--pulse-primary);
}

.reply-bar-file-icon .material-symbols-outlined {
  font-size: 18px;
}

.reply-bar-text {
  font-size: 13px;
  color: var(--pulse-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.reply-bar-close {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--pulse-text-secondary);
  display: grid;
  place-items: center;
  cursor: pointer;
  flex-shrink: 0;
}

.reply-bar-close .material-symbols-outlined {
  font-size: 18px;
}

.composer-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.plus-btn {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: var(--pulse-surface-high);
  color: var(--pulse-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.2s;
}

.money-card{box-sizing:border-box;width:100%;min-height:82px;border:0;border-radius:8px;background:#f19b3b;color:#fff;display:flex;align-items:center;gap:12px;padding:15px;text-align:left;transition:filter .2s,background .2s}.money-card.transfer{background:#ef8b3b}.money-card.received{background:#8a7562;filter:saturate(.55)}.money-card.transfer.received{background:#806b5d}.money-card>.material-symbols-outlined{font-size:38px;border:1px solid rgba(255,255,255,.7);border-radius:50%;padding:4px;flex:none}.money-card>span:last-child{display:flex;flex-direction:column;min-width:0}.money-card b{font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.money-card small{margin-top:5px;color:rgba(255,255,255,.85)}

.plus-btn:active {
  background: var(--pulse-surface-highest);
}

.input-wrap {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
}

.autofill-trap {
  position: absolute;
  left: -10000px;
  top: auto;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}

.msg-input {
  width: 100%;
  min-height: 44px;
  max-height: 100px;
  padding: 11px 44px 11px 20px;
  border: none;
  border-radius: 22px;
  background: var(--pulse-surface-high);
  color: var(--pulse-text);
  font-size: var(--chat-font-size, 15px);
  line-height: 1.4;
  outline: none;
  resize: none;
  overflow-y: auto;
  touch-action: manipulation;
  -webkit-user-select: text;
  user-select: text;
  -webkit-touch-callout: default;
  transition: box-shadow 0.2s;
  -webkit-text-security: none;
}

.msg-input::placeholder {
  color: rgba(193, 198, 215, 0.5);
  white-space: nowrap;
}

.msg-input.is-mute-placeholder::placeholder {
  font-size: 12px;
}

.msg-input:focus {
  box-shadow: 0 0 0 2px var(--pulse-primary);
}

.emoji-btn {
  position: absolute;
  right: 12px;
  border: none;
  background: transparent;
  color: var(--pulse-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 4px;
  transition: color 0.2s;
}

.emoji-btn:active {
  color: var(--pulse-primary);
}

.emoji-btn .material-symbols-outlined {
  font-size: 22px;
}

.mic-btn {
  width: 48px;
  height: 48px;
  border: none;
  border-radius: 50%;
  background: var(--pulse-primary);
  color: var(--pulse-on-primary-container);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(75, 142, 255, 0.35);
  transition: transform 0.15s;
}

.mic-btn.secondary {
  background: var(--pulse-surface-high);
  color: var(--pulse-text-secondary);
  box-shadow: none;
}

.mic-btn:active {
  transform: scale(0.94);
}

.mic-btn .material-symbols-outlined {
  font-size: 24px;
}

.voice-hold-btn {
  flex: 1;
  height: 44px;
  border: none;
  border-radius: 999px;
  background: var(--pulse-surface-high);
  color: var(--pulse-text);
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  touch-action: none;
  transition: background 0.15s, color 0.15s;
}

.voice-hold-btn.recording {
  background: rgba(75, 142, 255, 0.25);
  color: var(--pulse-primary);
}

.voice-hold-btn.cancel {
  background: rgba(255, 84, 71, 0.2);
  color: #ff5447;
}

.emoji-panel {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 4px;
  max-height: 220px;
  overflow-y: auto;
  padding: 8px 4px 4px;
  margin-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  -webkit-overflow-scrolling: touch;
}

.emoji-item {
  border: none;
  background: transparent;
  font-size: 24px;
  line-height: 1.4;
  padding: 6px 0;
  cursor: pointer;
  border-radius: 8px;
}

.emoji-item:active {
  background: rgba(255, 255, 255, 0.08);
}

.voice-bubble {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 64px;
  max-width: 140px;
  padding: 6px 10px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
}

.voice-bubble.mine {
  flex-direction: row-reverse;
}

.voice-icon {
  font-size: 18px;
  opacity: 0.9;
}

.voice-bars {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 12px;
}

.voice-bars i {
  display: block;
  width: 2.5px;
  border-radius: 2px;
  background: currentColor;
  opacity: 0.55;
  animation: none;
}

.voice-bars i:nth-child(1) { height: 5px; }
.voice-bars i:nth-child(2) { height: 10px; }
.voice-bars i:nth-child(3) { height: 7px; }
.voice-bars i:nth-child(4) { height: 11px; }

.voice-bubble.playing .voice-bars i {
  animation: voice-bar 0.8s ease-in-out infinite;
}

.voice-bubble.playing .voice-bars i:nth-child(2) { animation-delay: 0.1s; }
.voice-bubble.playing .voice-bars i:nth-child(3) { animation-delay: 0.2s; }
.voice-bubble.playing .voice-bars i:nth-child(4) { animation-delay: 0.3s; }

.voice-bubble.loading .voice-icon {
  opacity: 0.6;
}

@keyframes voice-bar {
  0%, 100% { transform: scaleY(0.55); }
  50% { transform: scaleY(1); }
}

.voice-duration {
  font-size: 12px;
  font-weight: 500;
  opacity: 0.9;
  min-width: 1.2em;
}

.voice-record-mask {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  pointer-events: none;
}

.voice-record-card {
  width: 160px;
  padding: 24px 16px;
  border-radius: 20px;
  background: rgba(30, 31, 35, 0.92);
  text-align: center;
  color: #fff;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
}

.voice-record-mask.cancel .voice-record-card {
  background: rgba(120, 40, 36, 0.95);
}

.voice-record-mic {
  font-size: 40px;
  color: var(--pulse-primary);
}

.voice-record-mask.cancel .voice-record-mic {
  color: #ff8a80;
}

.voice-record-tip {
  margin: 12px 0 4px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.75);
}

.voice-record-sec {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.send-btn {
  height: 40px;
  min-width: 56px;
  padding: 0 14px;
  border: none;
  border-radius: 999px;
  background: var(--pulse-primary-container);
  color: var(--pulse-on-primary-container);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
  box-shadow: 0 4px 12px rgba(75, 142, 255, 0.3);
}

.send-btn:active {
  transform: scale(0.96);
}

.loading-state {
  text-align: center;
  padding: 24px;
  color: var(--pulse-text-secondary);
}
.location-card {
  display: block;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: 6px;
  background: #fff;
  color: #202327;
  text-align: left;
}

.bubble.live-location-message,
.bubble.live-location-message.mine {
  width: min(268px, 72vw); max-width: 72vw; padding: 0; overflow: hidden;
  border-radius: 12px; background: transparent; color: var(--pulse-text); box-shadow: none;
}
.live-location-card {
  width: 100%; padding: 0; display: block; overflow: hidden;
  border: 1px solid rgba(28, 43, 35, .1); border-radius: 12px; background: #fff;
  color: #202822; text-align: left; box-shadow: 0 5px 16px rgba(22, 54, 36, .1);
}
.live-location-card.ended { filter: grayscale(.85); opacity: .58; box-shadow: none; }
.live-location-card.ended .live-location-card-map > .material-symbols-outlined { color: #7d8781; }
.live-location-card.ended .live-location-card-arrow { display: none; }
.live-location-card-map { position: relative; height: 74px; display: grid; place-items: center; overflow: hidden; background: #dceee3; }
.live-location-card-map::before { content: ''; position: absolute; inset: 0; opacity: .75; background: linear-gradient(32deg, transparent 46%, #b8d3c2 47%, #b8d3c2 50%, transparent 51%), linear-gradient(145deg, transparent 47%, #c4dccd 48%, #c4dccd 51%, transparent 52%); }
.live-location-card-map > .material-symbols-outlined { position: relative; z-index: 2; color: #07a65d; font-size: 38px; font-variation-settings: 'FILL' 1; }
.live-location-card-map i { position: absolute; width: 130%; height: 1px; background: #b5cebf; transform: rotate(15deg); }
.live-location-card-map i:nth-child(2) { transform: rotate(-20deg) translateY(22px); }
.live-location-card-map i:nth-child(3) { transform: rotate(38deg) translateY(-24px); }
.live-location-card-body { min-height: 58px; padding: 10px 12px; display: flex; align-items: center; gap: 8px; }
.live-location-card-copy { min-width: 0; flex: 1; }
.live-location-card-copy strong,.live-location-card-copy small { display: block; }
.live-location-card-copy strong { overflow: hidden; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.live-location-card-copy small { margin-top: 3px; color: #839087; font-size: 11px; }
.live-location-card-arrow { flex: 0 0 auto; color: #a4aea8; font-size: 19px; }
:global(:root[data-theme='dark'] .live-location-card) { border-color: rgba(255,255,255,.08); background: #252b27; color: #f1f4f2; box-shadow: 0 7px 20px rgba(0,0,0,.25); }
:global(:root[data-theme='dark'] .live-location-card-map) { background: #263b30; }
:global(:root[data-theme='dark'] .live-location-card-map::before) { opacity: .32; }
:global(:root[data-theme='dark'] .live-location-card-copy small) { color: #9ba69f; }

.location-card-map {
  position: relative;
  height: 92px;
  overflow: hidden;
  display: grid;
  place-items: center;
  background:
    linear-gradient(28deg, transparent 47%, #cdd7d1 48%, #cdd7d1 51%, transparent 52%),
    linear-gradient(150deg, transparent 47%, #d6ded9 48%, #d6ded9 51%, transparent 52%),
    #e9eee9;
}

.location-card-map .material-symbols-outlined {
  position: relative;
  z-index: 2;
  color: #e7493f;
  font-size: 38px;
}

.location-card-map i {
  position: absolute;
  width: 130%;
  height: 1px;
  background: #c3d1c9;
  transform: rotate(12deg);
}

.location-card-map i:nth-of-type(2) {
  transform: rotate(-22deg) translateY(25px);
}

.location-card-map i:nth-of-type(3) {
  transform: rotate(35deg) translateY(-30px);
}

.location-card-meta {
  padding: 11px 13px 12px;
}

.location-card-meta strong,
.location-card-meta span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.location-card-meta strong {
  font-size: 15px;
}

.location-card-meta span {
  margin-top: 5px;
  color: #858b92;
  font-size: 12px;
}
</style>

<style>
.van-popup.group-call-picker {
  color: var(--pulse-text) !important;
  background: var(--pulse-surface-container) !important;
}

.sender-role {
  display: inline-flex;
  margin-left: 5px;
  padding: 1px 5px;
  border-radius: 4px;
  color: #ffab40;
  background: rgba(255, 171, 64, 0.14);
  font-size: 10px;
  line-height: 16px;
}
.van-popup.group-call-picker .group-call-picker-head {
  color: #fff !important;
  background: var(--pulse-surface-high) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
}
.van-popup.group-call-picker .group-call-picker-head button {
  color: #69a7ff !important;
}
.van-popup.group-call-picker .group-call-picker-head button:first-child {
  color: var(--pulse-text-secondary) !important;
}
.van-popup.group-call-picker .group-call-picker-head button:disabled {
  color: #626d7c !important;
}
.van-popup.group-call-picker .group-call-picker-tip,
.van-popup.group-call-picker .group-call-member-list,
.van-popup.group-call-picker .group-call-member {
  color: var(--pulse-text) !important;
  background: var(--pulse-surface-container) !important;
}
.van-popup.group-call-picker .group-call-picker-tip {
  color: #aab4c2 !important;
}
.van-popup.group-call-picker .group-call-member {
  border-bottom: 1px solid rgba(255, 255, 255, 0.055) !important;
}
.van-popup.group-call-picker .group-call-member .name {
  color: var(--pulse-text) !important;
}
.van-popup.group-call-picker .group-call-member .initials {
  color: #fff !important;
  background: linear-gradient(145deg, #5478d8, #7656c7) !important;
}
</style>

<style>
/* teleported popups：去掉默认白底两侧露边 */
.plus-popup.van-popup,
.plus-popup.van-popup--bottom {
  background: var(--pulse-surface-container) !important;
  overflow: hidden;
}

.group-read-popup.van-popup,
.group-read-popup.van-popup--bottom {
  background: var(--pulse-surface-highest, var(--pulse-surface-container)) !important;
  overflow: hidden;
}

/* 图片/视频上传：独立合成层持续旋转，避免主线程忙碌时出现明显顿挫。 */
.media-upload-toast .van-loading__spinner {
  will-change: transform;
  transform: translateZ(0);
  animation: media-upload-spin 0.72s linear infinite !important;
}

.media-upload-toast .van-loading__spinner::after {
  content: '';
  position: absolute;
  inset: 5px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--pulse-primary) 24%, transparent);
  animation: media-upload-pulse 1.15s ease-in-out infinite;
}

.media-upload-toast .van-toast__text {
  animation: media-upload-text 1.35s ease-in-out infinite;
}

.receive-success-layer {
  position: fixed;
  z-index: 10001;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  pointer-events: none;
  background: rgba(7, 12, 22, 0.26);
  backdrop-filter: blur(3px);
}

.receive-success-card {
  position: relative;
  z-index: 2;
  width: min(250px, 70vw);
  min-height: 230px;
  box-sizing: border-box;
  border: 1px solid rgba(255, 255, 255, 0.46);
  border-radius: 30px;
  display: flex;
  align-items: center;
  flex-direction: column;
  justify-content: center;
  color: #fff;
  background: linear-gradient(145deg, #ff6659, #e83636);
  box-shadow: 0 24px 70px rgba(175, 24, 24, 0.35);
  animation: receive-card-pop 0.62s cubic-bezier(.2, 1.35, .32, 1) both;
}

.receive-success-layer.transfer .receive-success-card {
  background: linear-gradient(145deg, #ffad4c, #ed762c);
  box-shadow: 0 24px 70px rgba(193, 92, 16, 0.34);
}

.receive-success-icon {
  width: 82px;
  height: 82px;
  margin-bottom: 15px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #e83b35;
  background: linear-gradient(150deg, #fffce2, #ffd36a);
  box-shadow: 0 8px 22px rgba(91, 29, 8, 0.22);
  animation: receive-icon-bounce 0.82s 0.12s cubic-bezier(.2, 1.4, .3, 1) both;
}

.receive-success-layer.transfer .receive-success-icon {
  color: #e77625;
}

.receive-success-icon .material-symbols-outlined {
  font-size: 44px;
}

.receive-success-card strong {
  font-size: 25px;
  letter-spacing: 2px;
}

.receive-success-card b {
  margin-top: 5px;
  font-size: 22px;
}

.receive-success-card small {
  margin-top: 8px;
  color: rgba(255, 255, 255, 0.84);
  font-size: 13px;
}

.receive-success-rays {
  position: absolute;
  width: 340px;
  height: 340px;
  border-radius: 50%;
  opacity: 0.5;
  background: repeating-conic-gradient(
    from 0deg,
    rgba(255, 224, 112, 0.6) 0deg 7deg,
    transparent 7deg 20deg
  );
  animation: receive-rays-spin 8s linear infinite, receive-rays-in .55s ease-out both;
}

.receive-success-particles {
  position: absolute;
  z-index: 3;
  width: 18px;
  height: 18px;
}

.receive-success-particles i {
  --angle: calc(var(--particle-index) * 36deg);
  position: absolute;
  inset: 0;
  border-radius: 4px;
  background: #ffe377;
  transform: rotate(var(--angle)) translateY(-32px) scale(0);
  animation: receive-particle 1.05s calc(var(--particle-index) * 0.025s) ease-out both;
}

.receive-success-enter-active,
.receive-success-leave-active {
  transition: opacity .24s ease;
}

.receive-success-enter-from,
.receive-success-leave-to {
  opacity: 0;
}

@keyframes receive-card-pop {
  0% { opacity: 0; transform: translateY(18px) scale(.68); }
  68% { opacity: 1; transform: translateY(-4px) scale(1.04); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes receive-icon-bounce {
  0% { opacity: 0; transform: rotate(-18deg) scale(.25); }
  70% { opacity: 1; transform: rotate(5deg) scale(1.12); }
  100% { opacity: 1; transform: rotate(0) scale(1); }
}

@keyframes receive-rays-spin {
  to { transform: rotate(360deg); }
}

@keyframes receive-rays-in {
  from { opacity: 0; scale: .45; }
}

@keyframes receive-particle {
  0% { opacity: 0; transform: rotate(var(--angle)) translateY(-28px) scale(0); }
  20% { opacity: 1; }
  100% { opacity: 0; transform: rotate(var(--angle)) translateY(-190px) scale(1) rotate(180deg); }
}

@keyframes media-upload-spin {
  to { transform: translateZ(0) rotate(360deg); }
}

@keyframes media-upload-pulse {
  0%, 100% { opacity: 0.28; transform: scale(0.7); }
  50% { opacity: 0.7; transform: scale(1); }
}

@keyframes media-upload-text {
  0%, 100% { opacity: 0.78; }
  50% { opacity: 1; }
}

/* ===== 微信风格红包/转账封面 ===== */
.business-cover-layer {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  padding: 24px;
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.62);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}

.business-cover-card {
  position: relative;
  margin: auto;
  width: min(340px, 90vw);
  max-width: 100%;
  box-sizing: border-box;
  border-radius: 24px;
  padding: 30px 22px 26px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  color: #fff;
  background: linear-gradient(160deg, #ff6a4d 0%, #ef322b 55%, #cf1f22 100%);
  box-shadow: 0 30px 80px rgba(120, 10, 10, 0.45);
  overflow: hidden;
}

.business-cover-layer.transfer .business-cover-card {
  background: linear-gradient(160deg, #35b8ff 0%, #1f7df2 55%, #1757d8 100%);
  box-shadow: 0 30px 80px rgba(10, 60, 150, 0.45);
}

.business-cover-card.received {
  filter: saturate(0.82);
}

.cover-close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  display: grid;
  place-items: center;
  cursor: pointer;
}

.cover-close .material-symbols-outlined {
  font-size: 20px;
}

.cover-sender {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
}

.cover-sender img,
.cover-sender-fallback {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.75);
  object-fit: cover;
  background: rgba(255, 255, 255, 0.25);
  display: grid;
  place-items: center;
  font-size: 18px;
}

.cover-sender-name {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cover-greeting {
  margin-top: 22px;
  font-size: 17px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.96);
}

.cover-pack {
  margin: 26px 0 8px;
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: linear-gradient(150deg, #fff3c9, #ffcf63);
  color: #e63b2c;
  display: grid;
  place-items: center;
  box-shadow: 0 10px 26px rgba(60, 8, 8, 0.32);
}

.cover-pack .material-symbols-outlined {
  font-size: 52px;
}

.cover-amount {
  margin-top: 18px;
  font-size: 42px;
  font-weight: 700;
  letter-spacing: 0.5px;
  line-height: 1.1;
}

.cover-remark {
  margin-top: 12px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.88);
}

.cover-status {
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.92);
}

.cover-status .material-symbols-outlined {
  font-size: 18px;
}

.cover-receive-btn {
  margin-top: 28px;
  width: 100%;
  padding: 14px;
  border: 0;
  border-radius: 999px;
  background: #fff;
  color: #e63b2c;
  font-size: 17px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s, opacity 0.15s;
}

.business-cover-layer.transfer .cover-receive-btn {
  color: #1f6df2;
}

.cover-receive-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.cover-receive-btn:disabled {
  opacity: 0.68;
  cursor: not-allowed;
}

.cover-detail-link {
  margin-top: 16px;
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.85);
  font-size: 13px;
  cursor: pointer;
}

.cover-receives {
  width: 100%;
  margin-top: 12px;
  max-height: 190px;
  overflow: auto;
  border-top: 1px solid rgba(255, 255, 255, 0.22);
  padding-top: 6px;
}

.cover-receive-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 4px;
  font-size: 14px;
}

.cover-receive-nick {
  color: rgba(255, 255, 255, 0.92);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cover-receive-amount {
  font-weight: 600;
  flex: none;
}

.cover-receives-empty {
  padding: 10px;
  color: rgba(255, 255, 255, 0.72);
  font-size: 13px;
}

.cover-fade-enter-active,
.cover-fade-leave-active {
  transition: opacity 0.25s ease;
}

.cover-fade-enter-active .business-cover-card,
.cover-fade-leave-active .business-cover-card {
  transition: transform 0.3s cubic-bezier(0.2, 1.2, 0.3, 1), opacity 0.25s ease;
}

.cover-fade-enter-from,
.cover-fade-leave-to {
  opacity: 0;
}

.cover-fade-enter-from .business-cover-card,
.cover-fade-leave-to .business-cover-card {
  transform: scale(0.86) translateY(18px);
  opacity: 0;
}

/* ===== 通话记录气泡 ===== */
.call-bubble {
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(76vw, 320px);
  width: fit-content;
  border: 0;
  border-radius: 18px 18px 18px 6px;
  padding: 10px 12px;
  background: linear-gradient(145deg, #343640 0%, #292b34 100%);
  color: var(--pulse-text);
  text-align: left;
  cursor: pointer;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
  -webkit-user-select: none;
  user-select: none;
}

.call-bubble.mine {
  border-radius: 18px 6px 18px 18px;
  background: linear-gradient(135deg, var(--pulse-primary-container) 0%, #6675f5 48%, #a14ff0 100%);
  color: #fff;
}

.call-bubble-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  flex: none;
  display: grid;
  place-items: center;
  background: rgba(8, 126, 215, 0.14);
  color: var(--pulse-primary);
}

.call-bubble.mine .call-bubble-icon {
  background: rgba(255, 255, 255, 0.22);
  color: #fff;
}

.call-bubble-icon .material-symbols-outlined {
  font-size: 22px;
}

.call-bubble-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.call-bubble-body b {
  font-size: 15px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.call-bubble-body small {
  font-size: 12px;
  color: var(--pulse-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.call-bubble.mine .call-bubble-body small {
  color: rgba(255, 255, 255, 0.85);
}

.call-bubble-arrow {
  font-size: 18px;
  color: var(--pulse-text-secondary);
  flex: none;
}

.call-bubble.mine .call-bubble-arrow {
  color: rgba(255, 255, 255, 0.8);
}

:root[data-theme='light'] .chat-page .call-bubble:not(.mine) {
  color: #172536;
  background: linear-gradient(145deg, #ffffff 0%, #f4faff 100%);
  border: 1px solid rgba(137, 196, 228, 0.42);
  box-shadow: 0 7px 20px rgba(34, 112, 165, 0.09);
}

:root[data-theme='light'] .chat-page .call-bubble.mine {
  color: #ffffff;
  background: linear-gradient(135deg, #75dafa 0%, #43b2ee 48%, #6398f3 100%);
  border: 1px solid rgba(255, 255, 255, 0.4);
}

.image-editor-root {
  display: flex;
  align-items: stretch;
  justify-content: center;
  background: rgba(0, 0, 0, 0.92);
}

.image-editor-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  padding: env(safe-area-inset-top, 0px) 0 env(safe-area-inset-bottom, 0px);
  color: #fff;
  background: #101114;
}

.image-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 0 0 56px;
  padding: 0 16px;
}

.image-editor-header button {
  min-width: 52px;
  border: 0;
  background: transparent;
  color: #fff;
  font-size: 15px;
}

.image-editor-header button:last-child {
  color: #fff;
  font-weight: 600;
}

.image-editor-header button:disabled {
  opacity: 0.45;
}

.image-editor-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
  flex: 1;
  padding: 16px;
  overflow: hidden;
}

.image-editor-canvas {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  background: #1b1d22;
}

    .image-editor-canvas.drawing {
    touch-action: none;
    cursor: crosshair;
    }

    .image-editor-canvas.cropping {
    touch-action: none;
    cursor: move;
    }

    .image-editor-paging {
    display: flex;
    align-items: center;
    gap: 4px;
    }

    .image-editor-page-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: none;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    cursor: pointer;
    }

    .image-editor-page-btn:disabled {
    color: rgba(255, 255, 255, 0.45);
    }

    .image-editor-page-btn:disabled {
    opacity: 0.4;
    cursor: default;
    }

    .image-editor-page-label {
    min-width: 34px;
    text-align: center;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.8);
    }

    .image-editor-history-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    }

    .image-editor-history-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    min-width: 32px !important;
    height: 32px;
    padding: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1) !important;
    }

    .image-editor-history-btn:disabled {
    opacity: 0.35;
    }

.image-editor-loading {
  color: rgba(255, 255, 255, 0.72);
  font-size: 14px;
}

.image-editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  flex: 0 0 86px;
  padding: 6px 16px calc(6px + env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;
}

.image-editor-toolbar button {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  min-width: 52px;
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.72);
  font-size: 12px;
}

.image-editor-toolbar button.active,
.image-editor-toolbar button:active {
  color: #8bb7ff;
}

.image-editor-toolbar button:disabled {
  opacity: 0.35;
  cursor: default;
}

.image-editor-toolbar .material-symbols-outlined {
  font-size: 22px;
}

.image-editor-exit-mask {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.48);
}

.image-editor-exit-dialog {
  width: min(100%, 320px);
  padding: 22px 20px 18px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 18px;
  background: #25272d;
  color: #fff;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.42);
}

.image-editor-exit-dialog strong {
  display: block;
  font-size: 18px;
}

.image-editor-exit-dialog p {
  margin: 10px 0 18px;
  color: rgba(255, 255, 255, 0.68);
  font-size: 13px;
}

.image-editor-exit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.image-editor-exit-actions button {
  min-width: 86px;
  height: 38px;
  padding: 0 12px;
  border: 0;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font: inherit;
  font-size: 13px;
}

.image-editor-exit-actions button.danger {
  background: #e85b57;
}

.image-editor-complete {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  flex-direction: row !important;
  flex: 0 0 auto;
  min-width: 82px !important;
  height: 40px;
  margin-left: auto;
  padding: 0 16px;
  border-radius: 8px !important;
  background: #16c66b !important;
  color: #fff !important;
  font-size: 15px !important;
  font-weight: 600;
}

.image-editor-complete:disabled {
  background: #5d8f73 !important;
}
</style>

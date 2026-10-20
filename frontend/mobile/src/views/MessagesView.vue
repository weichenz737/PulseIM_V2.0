<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick, type ComponentPublicInstance } from 'vue'
import { onActivated, onDeactivated } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'

type SwipeCellExpose = { close: (position?: string) => void }
import {
  fetchConversations,
  markConversationRead,
  markConversationUnread,
  removeConversation,
  markAllConversationsRead,
  batchConversations,
  updateConversationSettings,
  dedupeConversationItems,
  type ConversationItem,
} from '@/api/conversation'
import { useUserStore } from '@/stores/user'
import { useConversationInboxStore } from '@/stores/conversationInbox'
import { fetchUserProfile } from '@/api/contact'
import { resolveAvatarUrl } from '@/api/file'
import { fetchDeviceSessions, revokeDevice, type DeviceSession } from '@/api/auth'
import { formatCallPreview } from '@/utils/callPreview'
import { formatBusinessPreview } from '@/utils/businessPreview'
import { formatContactCardPreview, formatLocationPreview } from '@/utils/contactPreview'
import { friendTagStyle } from '@/utils/friendTagColor'
import { warmChatMessages } from '@/stores/chatWarmCache'
import { setCachedAvatar } from '@/stores/avatarCache'
import { chatDraftRevision, getChatDraft } from '@/stores/chatDraft'
import { useLockScreenStore } from '@/stores/lockScreen'
import { isNativeApp } from '@/native'
import UserAvatar from '@/components/UserAvatar.vue'

const router = useRouter()
const userStore = useUserStore()
const lockScreen = useLockScreenStore()
const inbox = useConversationInboxStore()
const conversations = ref<ConversationItem[]>([])
const loading = ref(true)
const refreshing = ref(false)
const deviceSessions = ref<DeviceSession[]>([])
const desktopSessionsLoading = ref(false)
const desktopSessionsLoaded = ref(false)
const desktopSessionActionId = ref('')
const showDesktopSessions = ref(false)
const desktopSessionsError = ref('')

function isDesktopSession(device: DeviceSession): boolean {
  const platform = String(device.platform || '').toLowerCase()
  if (['windows', 'windows_web', 'macos', 'mac', 'linux', 'desktop'].includes(platform)) return true
  return /windows|macos|mac os|linux|桌面|电脑/i.test(String(device.name || ''))
}

function desktopSessionLabel(device: DeviceSession): string {
  const platform = String(device.platform || '').toLowerCase()
  if (platform === 'windows_web') return 'Windows 网页端'
  if (platform === 'windows') return 'Windows 客户端'
  return device.name || 'Windows 客户端'
}

// 只显示"当前在线"的电脑端：网页关闭、客户端退出后 IM 服务端清除在线标记，
// 设备列表返回 online=false，图标随之消失；最小化/挂后台连接保持，仍显示。
// online 为空时按在线处理，兼容尚未部署新服务端的过渡期。
const desktopSessions = computed(() => deviceSessions.value.filter((device) => isDesktopSession(device) && device.online !== false))
const hasDesktopSession = computed(() => desktopSessions.value.length > 0)

function formatDesktopLoginTime(value?: string): string {
  if (!value) return '登录时间未知'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '登录时间未知'
  return `登录时间 · ${date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}`
}

async function loadDesktopSessions(options: { showLoading?: boolean } = {}) {
  if (desktopSessionsLoading.value) return
  // Polling happens while this page is alive. Do not replace an already
  // rendered popup with a loading state on every poll; only the first request
  // (or an explicit retry) should show the loading view.
  const showLoading = options.showLoading ?? !desktopSessionsLoaded.value
  if (showLoading) desktopSessionsLoading.value = true
  desktopSessionsError.value = ''
  try {
    const result = await fetchDeviceSessions()
    deviceSessions.value = Array.isArray(result?.list) ? result.list : []
    desktopSessionsLoaded.value = true
  } catch (error) {
    desktopSessionsError.value = error instanceof Error ? error.message : '电脑端状态获取失败'
  } finally {
    if (showLoading) desktopSessionsLoading.value = false
  }
}

function openDesktopSessions() {
  showDesktopSessions.value = true
  void loadDesktopSessions({ showLoading: !desktopSessionsLoaded.value })
}

function handleLockScreen() {
  if (!isNativeApp) return
  if (lockScreen.hasPassword) {
    lockScreen.lock()
    return
  }
  void router.push({ path: '/settings/security', query: { lockScreen: '1' } })
}

async function revokeDesktopSession(device: DeviceSession) {
  if (!device.deviceId || desktopSessionActionId.value) return
  try {
    await showConfirmDialog({
      title: '退出电脑端登录',
      message: `确认退出“${desktopSessionLabel(device)}”吗？退出后需要重新扫码登录。`,
      cancelButtonText: '取消',
      confirmButtonText: '退出登录',
      confirmButtonColor: '#ee0a24',
    })
  } catch {
    return
  }
  desktopSessionActionId.value = device.deviceId
  try {
    await revokeDevice(device.deviceId)
    deviceSessions.value = deviceSessions.value.filter((item) => item.deviceId !== device.deviceId)
    showToast('电脑端已退出登录')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '退出电脑端失败')
  } finally {
    desktopSessionActionId.value = ''
  }
}

function syncOfflineConversations() {
  void loadConversations(false)
}

function syncConversationSettings(event: Event) {
  const detail = (event as CustomEvent<{
    id?: string
    pinned?: boolean
    mute?: boolean
    removed?: boolean
  }>).detail
  if (!detail?.id) return
  if (detail.removed) {
    conversations.value = conversations.value.filter((item) => item.id !== detail.id)
    return
  }
  const patch: Partial<ConversationItem> = {}
  if (typeof detail.pinned === 'boolean') patch.pinned = detail.pinned
  if (typeof detail.mute === 'boolean') patch.mute = detail.mute
  patchConversationLocal(detail.id, patch)
}
const scrollBodyRef = ref<HTMLElement | null>(null)
const pullMinHeight = ref(0)
const editMode = ref(false)
const selectedIds = ref<Set<string>>(new Set())
let pollTimer: ReturnType<typeof setInterval> | null = null
let reloadTimer: ReturnType<typeof setTimeout> | null = null
let pullResizeObserver: ResizeObserver | null = null
let hasMounted = false
let conversationLoadTask: Promise<void> | null = null
const peerProfileCache = new Map<
  string,
  { profile: Awaited<ReturnType<typeof fetchUserProfile>>; fetchedAt: number }
>()

function syncPullMinHeight() {
  const el = scrollBodyRef.value
  if (!el) return
  pullMinHeight.value = el.clientHeight
}

/** 左滑单元格实例，点操作后立即收起 */
const swipeCellMap = new Map<string, SwipeCellExpose>()

function bindSwipeCell(id: string, el: Element | ComponentPublicInstance | null) {
  const cell = el as (ComponentPublicInstance & SwipeCellExpose) | null
  if (cell && typeof cell.close === 'function') {
    swipeCellMap.set(id, cell)
  } else {
    swipeCellMap.delete(id)
  }
}

function closeSwipeCell(id: string) {
  swipeCellMap.get(id)?.close('outside')
}

/** 编辑模式“全选”悬浮按钮（可拖动） */
const selectAllFabRef = ref<HTMLButtonElement | null>(null)
const selectAllPos = ref<{ x: number; y: number } | null>(null)
let saPointerId: number | null = null
let saStartX = 0
let saStartY = 0
let saOriginX = 0
let saOriginY = 0
let saMoved = false
const SELECT_ALL_POS_KEY = 'pulse:select-all-fab-position'

function clampSelectAllPos(x: number, y: number) {
  const size = selectAllFabRef.value?.offsetWidth || 72
  const edge = 8
  const maxX = Math.max(edge, window.innerWidth - size - edge)
  const maxY = Math.max(edge, window.innerHeight - size - 180)
  return {
    x: Math.min(maxX, Math.max(edge, x)),
    y: Math.min(maxY, Math.max(edge, y)),
  }
}

function restoreSelectAllPos() {
  try {
    const raw = localStorage.getItem(SELECT_ALL_POS_KEY)
    if (!raw) return
    const saved = JSON.parse(raw) as { x?: number; y?: number }
    if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      selectAllPos.value = clampSelectAllPos(Number(saved.x), Number(saved.y))
    }
  } catch {
    /* ignore */
  }
}

function onSelectAllDown(event: PointerEvent) {
  if (event.button !== 0 && event.pointerType === 'mouse') return
  const rect = selectAllFabRef.value?.getBoundingClientRect()
  if (!rect) return
  saPointerId = event.pointerId
  saStartX = event.clientX
  saStartY = event.clientY
  saOriginX = rect.left
  saOriginY = rect.top
  saMoved = false
  selectAllFabRef.value?.setPointerCapture(event.pointerId)
}

function onSelectAllMove(event: PointerEvent) {
  if (saPointerId !== event.pointerId) return
  const dx = event.clientX - saStartX
  const dy = event.clientY - saStartY
  if (!saMoved && Math.hypot(dx, dy) < 5) return
  saMoved = true
  selectAllPos.value = clampSelectAllPos(saOriginX + dx, saOriginY + dy)
}

function onSelectAllEnd(event: PointerEvent) {
  if (saPointerId !== event.pointerId) return
  selectAllFabRef.value?.releasePointerCapture(event.pointerId)
  saPointerId = null
  if (saMoved && selectAllPos.value) {
    try {
      localStorage.setItem(SELECT_ALL_POS_KEY, JSON.stringify(selectAllPos.value))
    } catch {
      /* ignore */
    }
  }
}

function onSelectAllClick() {
  if (saMoved) {
    saMoved = false
    return
  }
  toggleSelectAll()
}

const myUserId = computed(() => String(userStore.userId || ''))
const selectedCount = computed(() => selectedIds.value.size)
const allVisibleSelected = computed(
  () => filteredList.value.length > 0 && filteredList.value.every((c) => selectedIds.value.has(c.id)),
)

function isSelfConversation(item: ConversationItem): boolean {
  if (!myUserId.value) return false
  if (item.peerUserId && String(item.peerUserId) === myUserId.value) return true
  if (item.type === 'personal' && !item.peerUserId && userStore.nickname && item.name === userStore.nickname) {
    return true
  }
  return false
}

function formatListPreview(preview?: string, msgType?: number): string {
  const raw = String(preview || '')
  if (msgType === 0) return raw
  return (
    formatCallPreview(raw) ||
    formatContactCardPreview(raw) ||
    formatLocationPreview(raw) ||
    formatBusinessPreview(raw)
  )
}

function formatGroupPreview(item: ConversationItem, preview: string, fromSelf?: boolean, fromNickname?: string): string {
  if (item.type !== 'group' || !preview) return preview
  const sender = fromSelf ? '我' : (fromNickname || '成员').trim()
  if (!sender) return preview
  if (preview.startsWith(`${sender}: `) || preview.startsWith(`${sender}：`)) return preview
  if (fromSelf && /^(我)[:：]\s*/.test(preview)) return preview
  return `${sender}: ${preview}`
}

function conversationDraft(conversationId: string): string {
  // The revision makes the non-reactive in-memory Map participate in the
  // conversation-list render without persisting any draft data.
  void chatDraftRevision.value
  const draft = getChatDraft(conversationId, myUserId.value)
  return draft.trim() ? draft.replace(/\s+/g, ' ') : ''
}

function withPreviewPatches(list: ConversationItem[]): ConversationItem[] {
  const patches = inbox.patches
  return list.map((c) => {
    const p = patches[c.id]
    const serverPreview = formatListPreview(c.preview, c.lastMsgType)
    if (!p) return { ...c, preview: serverPreview }
    const patchedPreview = formatListPreview(p.preview, p.msgType)
    const keepBurnTombstone = serverPreview === '[阅后即焚消息已销毁]'
      && p.at <= (c.lastMsgTimeMs || 0)
    const nextPreview = keepBurnTombstone
      ? serverPreview
      : p.replaceServerPreview ? patchedPreview : (patchedPreview || serverPreview)
    return {
      ...c,
      preview: formatGroupPreview(c, nextPreview, p.fromSelf, p.fromNickname),
      time: p.time || inbox.formatNowTime(),
      mentionUnread: p.mentionUnread != null ? !!p.mentionUnread : c.mentionUnread,
    }
  })
}

function sumUnread(list: ConversationItem[]): number {
  return list.reduce((sum, c) => sum + (c.unread > 0 ? c.unread : 0), 0)
}

async function repairPeerAvatars(list: ConversationItem[]): Promise<ConversationItem[]> {
  const myAvatar = resolveAvatarUrl(userStore.avatar || '')
  // 单聊头像以对方资料为准；空头像 / 误显示成自己头像 / 缓存未命中时都拉一次资料
  const privateItems = list.filter((item) => item.type === 'personal' && !!item.peerUserId)
  const needFetch = privateItems.filter((item) => {
    const peerId = String(item.peerUserId)
    const cached = peerProfileCache.get(peerId)
    const avatar = resolveAvatarUrl(item.avatar || '')
    const avatarNeedsRepair = !avatar || (!!myAvatar && avatar === myAvatar)
    if (!avatarNeedsRepair) return false
    return !cached || Date.now() - cached.fetchedAt >= 10 * 60_000
  })

  if (needFetch.length > 0) {
    const peerIds = [...new Set(needFetch.map((item) => String(item.peerUserId)))]
    let cursor = 0
    const fetchNext = async () => {
      while (cursor < peerIds.length) {
        const peerId = peerIds[cursor++]
        const cached = peerProfileCache.get(peerId)
        if (cached && Date.now() - cached.fetchedAt < 10 * 60_000) continue
        try {
          peerProfileCache.set(peerId, {
            profile: await fetchUserProfile(peerId),
            fetchedAt: Date.now(),
          })
        } catch {
          /* Keep the server-provided data when the peer profile is unavailable. */
        }
      }
    }
    // 限制补资料并发，给首屏头像图片请求留出网络连接。
    await Promise.all(
      Array.from({ length: Math.min(4, peerIds.length) }, () => fetchNext()),
    )
  }

  return list.map((item) => {
    if (item.type !== 'personal' || !item.peerUserId) return item
    const peer = peerProfileCache.get(String(item.peerUserId))?.profile
    if (!peer) return item
    const displayName = peer.displayName?.trim() || peer.remark?.trim()
    const tag = peer.tag?.trim()
    const avatar = resolveAvatarUrl(peer.avatarUrl || '')
    if (avatar) setCachedAvatar(String(userStore.userId || ''), String(item.peerUserId), avatar)
    // 有对方资料时不要回退到会话里过期的 avatar（否则会串成别人的头像）
    return {
      ...item,
      name: displayName || peer.nickname || item.name,
      avatarName: peer.nickname || item.avatarName,
      tag: tag || item.tag,
      avatar,
      fileTransferAssistant: !!peer.fileTransferAssistant || !!item.fileTransferAssistant,
    }
  })
}

/** 底部「消息」Tab：免打扰会话不计入红点 */
const tabUnreadTotal = computed(() => {
  void inbox.revision
  return sumUnread(
    withPreviewPatches(conversations.value).filter(
      (c) => !isSelfConversation(c) && !c.mute,
    ),
  )
})

watch(
  () => tabUnreadTotal.value,
  (n) => {
    // 切换账号后先展示已保存的角标；首屏会话尚未拉取完成时不要被空列表清零。
    if (loading.value && conversations.value.length === 0) return
    inbox.setUnreadTotal(n)
  },
  { immediate: true },
)

const filteredList = computed(() => {
  // 依赖 revision，确保补丁触发重算
  void inbox.revision
  const list = withPreviewPatches(conversations.value).filter((c) => !isSelfConversation(c))
  return [...list].sort((a, b) => {
    const pin = Number(!!b.pinned) - Number(!!a.pinned)
    if (pin !== 0) return pin
    const pa = inbox.patches[a.id]?.at || 0
    const pb = inbox.patches[b.id]?.at || 0
    if (pa || pb) return pb - pa
    return 0
  })
})

async function loadConversations(showLoading = false) {
  if (conversationLoadTask) return conversationLoadTask
  const task = (async () => {
  if (showLoading) loading.value = true
  try {
    const all = await fetchConversations('all')
    const map = new Map<string, ConversationItem>()
    all.forEach((c) => map.set(c.id, c))
    const baseList = dedupeConversationItems([...map.values()])
    const ownerId = String(userStore.userId || '')
    baseList.forEach((item) => {
      if (!ownerId || !item.avatar) return
      setCachedAvatar(
        ownerId,
        item.type === 'group' ? item.id : String(item.peerUserId || ''),
        item.avatar,
        item.type === 'group' ? 'group' : 'user',
      )
    })
    conversations.value = baseList.sort(
      (a, b) => Number(!!b.pinned) - Number(!!a.pinned),
    )
    loading.value = false
    inbox.hydrateUnreadSources(conversations.value)
    // 主动同步底部消息角标，避免 WebSocket 重连或账号切换后残留旧计数。
    inbox.setUnreadTotal(
      sumUnread(
        conversations.value.filter(
          (c) => !isSelfConversation(c) && !c.mute,
        ),
      ),
    )
    void repairPeerAvatars(baseList).then((repaired) => {
      conversations.value = dedupeConversationItems(repaired).sort(
        (a, b) => Number(!!b.pinned) - Number(!!a.pinned),
      )
    })
    // 服务端刷新后清理过期本地预览补丁
    Object.keys(inbox.patches).forEach((id) => {
      const patch = inbox.patches[id]
      if (!patch) return
      const server = map.get(id)
      const serverPreview = server?.preview || ''
      const matched =
        !!server &&
        (serverPreview === patch.preview ||
          serverPreview.endsWith(patch.preview) ||
          serverPreview.includes(patch.preview))
      if (matched || Date.now() - patch.at > 5000) {
        inbox.clearPatch(id)
      }
    })
  } catch {
    // 接口失败时保持当前列表，避免空列表造成误解
  } finally {
    loading.value = false
  }
  })()
  conversationLoadTask = task
  try {
    await task
  } finally {
    if (conversationLoadTask === task) conversationLoadTask = null
  }
}

async function onPullRefresh() {
  refreshing.value = true
  try {
    await Promise.all([loadConversations(false), loadDesktopSessions()])
  } finally {
    refreshing.value = false
  }
}

function scheduleReload() {
  if (reloadTimer) clearTimeout(reloadTimer)
  reloadTimer = setTimeout(() => {
    void loadConversations(false)
  }, 400)
}

function onPresence(e: Event) {
  const d = (e as CustomEvent<{ userId?: string | number; online?: boolean; onlineHidden?: boolean }>).detail
  if (!d || d.userId === undefined) return
  const userId = String(d.userId)
  conversations.value = conversations.value.map((c) =>
    c.peerUserId === userId
      ? { ...c, online: !!d.online, onlineHidden: !!d.onlineHidden }
      : c,
  )
}

function onConversationRead(e: Event) {
  const detail = (e as CustomEvent<{
    conversationId?: string | number
    fromUserId?: string | number
  }>).detail
  const conversationId = String(detail?.conversationId || '')
  if (!conversationId || String(detail?.fromUserId || '') !== String(userStore.userId || '')) return
  const current = conversations.value.find((item) => item.id === conversationId)
  if (!current) return
  if (current.unread > 0 || current.mentionUnread) {
    patchConversationLocal(conversationId, { unread: 0, mentionUnread: false })
    inbox.clearMention(conversationId)
    inbox.setUnreadTotal(
      sumUnread(
        conversations.value.filter((item) => !isSelfConversation(item) && !item.mute),
      ),
    )
  }
}

function startPoll() {
  stopPoll()
  pollTimer = setInterval(() => {
    if (document.hidden) return
    void loadConversations(false)
    void loadDesktopSessions()
  }, 5_000)
}

function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

watch(
  () => inbox.revision,
  () => {
    scheduleReload()
  },
)

onMounted(() => {
  restoreSelectAllPos()
  hasMounted = true
  window.addEventListener('pulse:offline-sync', syncOfflineConversations)
  window.addEventListener('pulse:conversation-settings-updated', syncConversationSettings)
  window.addEventListener('pulse:presence', onPresence)
  window.addEventListener('pulse:conversation-read', onConversationRead)
  window.addEventListener('pulse:native-back', onNativeBack)
  inbox.startWsBridge()
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
  void loadConversations(true)
  void loadDesktopSessions()
  const preloadChat = () => void import('@/views/ChatView.vue')
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(preloadChat, { timeout: 1500 })
  } else {
    setTimeout(preloadChat, 300)
  }
  startPoll()
  nextTick(() => {
    syncPullMinHeight()
    if (scrollBodyRef.value && typeof ResizeObserver !== 'undefined') {
      pullResizeObserver = new ResizeObserver(() => syncPullMinHeight())
      pullResizeObserver.observe(scrollBodyRef.value)
    }
  })
})

onActivated(() => {
  if (hasMounted && !editMode.value) {
    void loadConversations(false)
  }
  void loadDesktopSessions()
  startPoll()
  nextTick(() => {
    syncPullMinHeight()
  })
})

onDeactivated(() => {
  stopPoll()
})

onUnmounted(() => {
  window.removeEventListener('pulse:offline-sync', syncOfflineConversations)
  window.removeEventListener('pulse:conversation-settings-updated', syncConversationSettings)
  window.removeEventListener('pulse:presence', onPresence)
  window.removeEventListener('pulse:conversation-read', onConversationRead)
  window.removeEventListener('pulse:native-back', onNativeBack)
  stopPoll()
  clearLongPressTimer()
  pullResizeObserver?.disconnect()
  pullResizeObserver = null
  if (reloadTimer) clearTimeout(reloadTimer)
})

function openChat(item: ConversationItem) {
  if (editMode.value) {
    toggleSelect(item.id)
    return
  }
  router.push({
    path: `/chat/${item.id}`,
    query: {
      title: item.name,
      peerUserId: item.peerUserId || '',
      avatar: item.avatar || '',
      avatarName: item.avatarName || '',
      online: item.online ? 'true' : 'false',
      onlineHidden: item.onlineHidden ? '1' : '',
      type: item.type,
      mentionUnread: item.mentionUnread ? '1' : '',
      tag: item.tag || '',
      fileTransferAssistant: item.fileTransferAssistant ? '1' : '',
    },
  })
}

function exitEditMode() {
  editMode.value = false
  selectedIds.value = new Set()
  closeMoreMenu()
}

function onNativeBack(event: Event) {
  if (showDesktopSessions.value) {
    showDesktopSessions.value = false
    event.preventDefault()
    return
  }
  if (showMoreMenu.value) {
    closeMoreMenu()
    event.preventDefault()
    return
  }
  if (editMode.value) {
    exitEditMode()
    event.preventDefault()
  }
}

function enterEditModeWith(item: ConversationItem) {
  if (editMode.value) {
    toggleSelect(item.id)
    return
  }
  editMode.value = true
  selectedIds.value = new Set([item.id])
  closeMoreMenu()
}

let longPressTimer: ReturnType<typeof setTimeout> | undefined
let longPressTriggered = false
let longPressItem: ConversationItem | null = null

function clearLongPressTimer() {
  if (!longPressTimer) return
  clearTimeout(longPressTimer)
  longPressTimer = undefined
}

function onItemPressStart(item: ConversationItem) {
  if (editMode.value) return
  // Start both code and data loading at pointer-down, overlapping the request
  // with the tap and route transition instead of waiting for ChatView to mount.
  void import('@/views/ChatView.vue')
  void warmChatMessages(item.id, userStore.userId || 'me').catch(() => {})
  longPressTriggered = false
  longPressItem = item
  clearLongPressTimer()
  longPressTimer = setTimeout(() => {
    longPressTriggered = true
    if (longPressItem) enterEditModeWith(longPressItem)
  }, 420)
}

function onItemPressEnd() {
  clearLongPressTimer()
  longPressItem = null
}

function onItemPressCancel() {
  clearLongPressTimer()
  longPressItem = null
}

function onConversationClick(item: ConversationItem) {
  if (longPressTriggered) {
    longPressTriggered = false
    return
  }
  openChat(item)
}

function onConversationContextMenu(item: ConversationItem, event: Event) {
  event.preventDefault()
  enterEditModeWith(item)
}

function toggleSelect(id: string) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function toggleSelectAll() {
  if (allVisibleSelected.value) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(filteredList.value.map((c) => c.id))
  }
}

async function batchDelete() {
  if (selectedCount.value === 0) {
    showToast('请先选择会话')
    return
  }
  try {
    await showConfirmDialog({
      title: '删除会话',
      message: `确定删除选中的 ${selectedCount.value} 个会话？`,
      confirmButtonText: '删除',
      confirmButtonColor: '#ff5447',
    })
  } catch {
    return
  }
  try {
    await batchConversations([...selectedIds.value], 'delete')
    conversations.value = conversations.value.filter((c) => !selectedIds.value.has(c.id))
    showToast('已删除')
    exitEditMode()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '删除失败')
  }
}

async function batchRead() {
  const selected = selectedCount.value > 0
  try {
    await showConfirmDialog({
      title: selected ? '标为已读' : '全部已读',
      message: selected
        ? `确定将选中的 ${selectedCount.value} 个会话标为已读？`
        : '确定将全部会话标为已读？',
      confirmButtonText: '确定',
    })
  } catch {
    return
  }
  try {
    if (!selected) {
      await markAllConversationsRead()
      conversations.value = conversations.value.map((c) => ({ ...c, unread: 0 }))
      inbox.setUnreadTotal(0)
      showToast('全部已读')
    } else {
      await batchConversations([...selectedIds.value], 'read')
      conversations.value = conversations.value.map((c) =>
        selectedIds.value.has(c.id) ? { ...c, unread: 0 } : c,
      )
      showToast('已标为已读')
    }
    exitEditMode()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '操作失败')
  }
}

/** 右滑操作进行中，防止连点重复请求 */
const swipeBusyIds = new Set<string>()

function patchConversationLocal(id: string, patch: Partial<ConversationItem>) {
  conversations.value = conversations.value.map((c) =>
    c.id === id ? { ...c, ...patch } : c,
  )
}

function findConversationSnapshot(id: string): ConversationItem | undefined {
  return conversations.value.find((c) => c.id === id)
}

function restoreConversation(snapshot: ConversationItem) {
  const idx = conversations.value.findIndex((c) => c.id === snapshot.id)
  if (idx >= 0) {
    const next = conversations.value.slice()
    next[idx] = snapshot
    conversations.value = next
  } else {
    conversations.value = dedupeConversationItems([snapshot, ...conversations.value])
  }
}

async function swipeDelete(item: ConversationItem) {
  closeSwipeCell(item.id)
  try {
    await showConfirmDialog({
      title: '删除会话',
      message: `删除后会话将从列表移除，收到新消息时会重新出现。`,
      confirmButtonText: '删除',
      confirmButtonColor: '#ff5447',
    })
  } catch {
    return
  }
  if (swipeBusyIds.has(item.id)) return
  swipeBusyIds.add(item.id)
  const snapshot = findConversationSnapshot(item.id) ?? { ...item }
  conversations.value = conversations.value.filter((c) => c.id !== item.id)
  showToast('已删除')
  try {
    await removeConversation(item.id)
  } catch (e) {
    restoreConversation(snapshot)
    showToast(e instanceof Error ? e.message : '删除失败')
  } finally {
    swipeBusyIds.delete(item.id)
  }
}

async function swipeToggleRead(item: ConversationItem) {
  closeSwipeCell(item.id)
  if (swipeBusyIds.has(item.id)) return
  swipeBusyIds.add(item.id)
  const markRead = item.unread > 0
  const snapshot = findConversationSnapshot(item.id) ?? { ...item }
  if (markRead) {
    patchConversationLocal(item.id, { unread: 0, mentionUnread: false })
    inbox.clearMention(item.id)
    showToast('已标为已读')
  } else {
    patchConversationLocal(item.id, { unread: 1 })
    showToast('已标为未读')
  }
  try {
    if (markRead) await markConversationRead(item.id)
    else await markConversationUnread(item.id)
  } catch (e) {
    restoreConversation(snapshot)
    showToast(e instanceof Error ? e.message : '操作失败')
  } finally {
    swipeBusyIds.delete(item.id)
  }
}

async function swipeTogglePin(item: ConversationItem) {
  closeSwipeCell(item.id)
  if (swipeBusyIds.has(item.id)) return
  swipeBusyIds.add(item.id)
  const next = !item.pinned
  const snapshot = findConversationSnapshot(item.id) ?? { ...item }
  patchConversationLocal(item.id, { pinned: next })
  showToast(next ? '已置顶' : '已取消置顶')
  try {
    await updateConversationSettings(item.id, { pinned: next })
  } catch (e) {
    restoreConversation(snapshot)
    showToast(e instanceof Error ? e.message : '操作失败')
  } finally {
    swipeBusyIds.delete(item.id)
  }
}

const showMoreMenu = ref(false)

const moreActions = [
  { key: 'add', label: '添加好友', icon: 'person_add', path: '/contacts/add' },
  { key: 'group', label: '添加群聊', icon: 'group_add', path: '/group/add' },
  { key: 'create-group', label: '发起群聊', icon: 'group_add', path: '/group/create' },
  { key: 'scan', label: '扫一扫', icon: 'qr_code_scanner', path: '/scan' },
] as const

function onMore() {
  showMoreMenu.value = !showMoreMenu.value
}

function closeMoreMenu() {
  showMoreMenu.value = false
}

function onMoreAction(path: string) {
  showMoreMenu.value = false
  router.push(path)
}

function goSearch() {
  router.push('/search')
}

</script>

<template>
  <div class="messages-page" :class="{ editing: editMode }" @click="closeMoreMenu">
    <div class="head-area">
    <header class="top-bar">
      <div class="title-row">
        <h1 class="page-title">消息</h1>
        <div class="title-actions">
          <button
            v-if="hasDesktopSession"
            type="button"
            class="desktop-session-btn"
            aria-label="查看电脑端登录状态"
            @click.stop="openDesktopSessions"
          >
            <span class="material-symbols-outlined">computer</span>
          </button>
          <button
            v-if="isNativeApp"
            type="button"
            class="lock-screen-btn"
            aria-label="锁定当前设备"
            @click.stop="handleLockScreen"
          >
            <span class="material-symbols-outlined">lock</span>
          </button>
        </div>
      </div>
      <div class="top-row">
        <div class="search-pill" role="button" tabindex="0" @click="goSearch" @keyup.enter="goSearch">
          <svg class="search-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" stroke-linecap="round" />
          </svg>
          <span class="search-placeholder">搜索</span>
        </div>
        <div class="more-wrap" @click.stop>
          <button type="button" class="more-btn" aria-label="更多" @click.stop="onMore">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <circle cx="12" cy="5" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="12" cy="19" r="1.6" />
            </svg>
          </button>
          <div v-if="showMoreMenu" class="more-menu" @click.stop>
            <button
              v-for="item in moreActions"
              :key="item.key"
              type="button"
              class="more-item"
              @click="onMoreAction(item.path)"
            >
              <span class="material-symbols-outlined more-icon">{{ item.icon }}</span>
              <span>{{ item.label }}</span>
            </button>
          </div>
        </div>
      </div>
    </header>

    </div>

    <!-- 编辑模式：右侧悬浮“全选”按钮 -->
    <button
      v-if="editMode"
      ref="selectAllFabRef"
      type="button"
      class="select-all-fab"
      :style="selectAllPos ? { left: `${selectAllPos.x}px`, top: `${selectAllPos.y}px`, right: 'auto', bottom: 'auto', transform: 'none' } : undefined"
      @pointerdown="onSelectAllDown"
      @pointermove="onSelectAllMove"
      @pointerup="onSelectAllEnd"
      @pointercancel="onSelectAllEnd"
      @click.stop="onSelectAllClick"
    >
      全选
    </button>

    <div ref="scrollBodyRef" class="scroll-body">
      <van-pull-refresh
        v-model="refreshing"
        class="page-pull"
        pulling-text="下拉刷新"
        loosing-text="释放刷新"
        loading-text="刷新中..."
        @refresh="onPullRefresh"
      >
        <div
          class="pull-inner"
          :style="pullMinHeight ? { minHeight: `${pullMinHeight}px` } : undefined"
        >
          <div class="conversation-list">
            <div v-if="loading" class="loading-state">加载中...</div>
            <template v-for="(item, index) in filteredList" :key="item.id">
              <van-swipe-cell
                :ref="(el) => bindSwipeCell(item.id, el)"
                :name="item.id"
                :disabled="editMode"
              >
                <div
                  class="conversation-item"
                  :class="{ selected: selectedIds.has(item.id) }"
                  @click="onConversationClick(item)"
                  @touchstart.passive="onItemPressStart(item)"
                  @touchend="onItemPressEnd"
                  @touchcancel="onItemPressCancel"
                  @touchmove="onItemPressCancel"
                  @contextmenu="onConversationContextMenu(item, $event)"
                >
                  <div v-if="editMode" class="check-wrap" @click.stop="toggleSelect(item.id)">
                    <span class="check" :class="{ on: selectedIds.has(item.id) }">
                      <span v-if="selectedIds.has(item.id)" class="material-symbols-outlined">check</span>
                    </span>
                  </div>
                  <div class="avatar-wrap">
                    <UserAvatar
                      :src="item.avatar"
                      :user-id="item.type === 'personal' ? item.peerUserId : item.id"
                      :kind="item.type === 'group' ? 'group' : 'user'"
                      :name="item.name"
                      :initial-name="item.avatarName"
                      :size="'var(--messages-avatar-size, 56px)'"
                      class="conv-avatar"
                      :loading="index < 8 ? 'eager' : 'lazy'"
                      :fetchpriority="index < 4 ? 'high' : 'auto'"
                    />
                    <span v-if="item.type === 'group'" class="group-tag avatar-group-tag">群</span>
                    <span
                      v-if="item.type === 'personal' && !item.onlineHidden && !item.fileTransferAssistant && item.name !== '文件传输助手'"
                      class="online-dot"
                      :class="{ online: item.online, offline: !item.online }"
                    />
                  </div>
                  <div class="conv-content">
                    <div class="conv-top">
                      <span class="conv-name">
                        <span v-if="item.pinned" class="pin-ico material-symbols-outlined">keep</span>
                        <span class="conv-name-text">{{ item.name }}</span>
                        <span
                          v-if="item.tag && !item.fileTransferAssistant && item.name !== '文件传输助手'"
                          class="conv-friend-tag"
                          :style="friendTagStyle(item.peerUserId || item.id)"
                        >{{ item.tag }}</span>
                        <span v-if="item.mute" class="mute-ico material-symbols-outlined">notifications_off</span>
                      </span>
                      <span class="conv-time" :class="{ unread: item.unread > 0 }">{{ item.time }}</span>
                    </div>
                    <div class="conv-bottom">
                      <p class="conv-preview">
                        <span v-if="item.mentionUnread" class="mention-tag">@了我</span>
                        <span v-if="conversationDraft(item.id)" class="draft-tag">草稿</span>
                        {{ conversationDraft(item.id) || item.preview || '暂无消息' }}
                      </p>
                      <span v-if="item.unread > 0 && !item.mute" class="unread-badge">
                        {{ item.unread > 99 ? '99+' : item.unread }}
                      </span>
                      <span v-else-if="item.unread > 0 && item.mute" class="mute-dot" />
                    </div>
                  </div>
                </div>
                <template #right>
                  <button type="button" class="swipe-btn pin" @click.stop="swipeTogglePin(item)">
                    {{ item.pinned ? '取消置顶' : '置顶' }}
                  </button>
                  <button type="button" class="swipe-btn read" @click.stop="swipeToggleRead(item)">
                    {{ item.unread > 0 ? '已读' : '未读' }}
                  </button>
                  <button type="button" class="swipe-btn danger" @click.stop="swipeDelete(item)">
                    删除
                  </button>
                </template>
              </van-swipe-cell>
            </template>
            <div v-if="!loading && filteredList.length === 0" class="empty-state">
              暂无会话
            </div>
          </div>
          <!-- 占满剩余高度，保证空白处也落在刷新触控区内 -->
          <div class="pull-filler" aria-hidden="true" />
        </div>
      </van-pull-refresh>
    </div>

    <!-- 编辑模式底部操作栏 -->
    <div v-if="editMode" class="edit-bar">
      <button type="button" class="edit-action cancel" @click.stop="exitEditMode">
        <span class="material-symbols-outlined">close</span>
        <span>取消</span>
      </button>
      <button type="button" class="edit-action danger" @click="batchDelete">
        <span class="material-symbols-outlined">delete</span>
        <span>删除</span>
      </button>
      <button type="button" class="edit-action" @click="batchRead">
        <span class="material-symbols-outlined">done_all</span>
        <span>{{ selectedCount > 0 ? '标为已读' : '全部已读' }}</span>
      </button>
    </div>

    <van-popup
      v-model:show="showDesktopSessions"
      position="bottom"
      round
      closeable
      teleport="body"
      class="desktop-sessions-popup"
    >
      <section class="desktop-sessions-sheet">
        <header class="desktop-sessions-head">
          <div class="desktop-sessions-heading">
            <span class="material-symbols-outlined desktop-sessions-icon">computer</span>
            <div>
              <h2>电脑端登录</h2>
              <p>管理已登录的电脑设备</p>
            </div>
          </div>
        </header>

        <div v-if="desktopSessionsLoading" class="desktop-sessions-state">
          <van-loading size="24px" vertical>正在查询登录状态…</van-loading>
        </div>
        <div v-else-if="desktopSessionsError && desktopSessions.length === 0" class="desktop-sessions-state">
          <span class="material-symbols-outlined">error_outline</span>
          <p>{{ desktopSessionsError }}</p>
          <button type="button" class="desktop-session-retry" @click="loadDesktopSessions({ showLoading: true })">重新查询</button>
        </div>
        <div v-else-if="desktopSessions.length === 0" class="desktop-sessions-state">
          <span class="material-symbols-outlined">computer</span>
          <p>当前没有电脑端登录</p>
        </div>
        <div v-else class="desktop-session-list">
          <article v-for="session in desktopSessions" :key="session.deviceId" class="desktop-session-row">
            <span class="material-symbols-outlined desktop-session-device-icon">computer</span>
            <div class="desktop-session-copy">
              <strong>{{ desktopSessionLabel(session) }}</strong>
              <span>{{ formatDesktopLoginTime(session.loginAt) }}</span>
            </div>
            <button
              type="button"
              class="desktop-session-logout"
              :disabled="desktopSessionActionId === session.deviceId"
              @click="revokeDesktopSession(session)"
            >
              {{ desktopSessionActionId === session.deviceId ? '退出中…' : '退出登录' }}
            </button>
          </article>
        </div>
        <p class="desktop-sessions-footnote">退出后，电脑端当前登录会立即失效，需要重新扫码登录。</p>
      </section>
    </van-popup>
  </div>
</template>

<style scoped>
.messages-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 100%;
  overflow: hidden;
  background: var(--pulse-page-bg, var(--pulse-bg));
  color: var(--pulse-text);
}

.messages-page.editing .scroll-body {
  padding-bottom: 120px;
}

.top-bar {
  position: relative;
  z-index: 40;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  padding: 12px 16px 10px;
  padding-top: var(--pulse-header-pad-top);
  background: rgba(18, 19, 23, 0.8);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.head-area {
  flex-shrink: 0;
}

.page-title {
  margin: 0;
  font-size: calc(var(--pulse-content-font-size, 15px) + 3px);
  font-weight: 700;
  line-height: 24px;
  color: var(--pulse-text);
}

.title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 32px;
}

.title-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-right: -4px;
}

.desktop-session-btn {
  position: relative;
  width: 36px;
  height: 36px;
  margin-right: 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--pulse-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.desktop-session-btn:active {
  background: var(--pulse-pressed);
  transform: scale(0.95);
}

.desktop-session-btn .material-symbols-outlined {
  font-size: 24px;
}

.lock-screen-btn {
  position: relative;
  width: 36px;
  height: 36px;
  margin-right: 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--pulse-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.lock-screen-btn:active {
  background: var(--pulse-pressed);
  transform: scale(0.95);
}

.lock-screen-btn .material-symbols-outlined {
  font-size: 22px;
}

.top-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.search-pill {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-radius: 999px;
  background: var(--pulse-surface-high);
  border: 1px solid rgba(65, 71, 85, 0.35);
  cursor: pointer;
}

.search-ico {
  width: 20px;
  height: 20px;
  color: var(--pulse-text-secondary);
  flex-shrink: 0;
}

.search-placeholder {
  flex: 1;
  min-width: 0;
  color: var(--pulse-text-secondary);
  font-size: var(--pulse-content-font-size, 15px);
  line-height: 20px;
}

.more-btn {
  width: 40px;
  height: 40px;
  border: 1px solid rgba(65, 71, 85, 0.35);
  border-radius: 50%;
  background: var(--pulse-surface-high);
  color: var(--pulse-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
  flex-shrink: 0;
}

.more-btn:active {
  transform: scale(0.95);
}

.more-wrap {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.more-menu {
  position: absolute;
  top: calc(100% + 12px);
  right: -4px;
  z-index: 60;
  min-width: 132px;
  padding: 6px;
  border-radius: 14px;
  background: var(--pulse-surface-high);
  border: 1px solid rgba(65, 71, 85, 0.45);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
}

.more-menu::before {
  content: '';
  position: absolute;
  top: -6px;
  right: 14px;
  width: 12px;
  height: 12px;
  background: var(--pulse-surface-high);
  border-left: 1px solid rgba(65, 71, 85, 0.45);
  border-top: 1px solid rgba(65, 71, 85, 0.45);
  transform: rotate(45deg);
}

.more-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--pulse-text);
  font-size: var(--pulse-content-font-size, 15px);
  font-weight: 500;
  cursor: pointer;
  text-align: left;
}

.more-item:active {
  background: rgba(75, 142, 255, 0.16);
}

.more-icon {
  font-size: 22px;
  color: var(--pulse-primary);
}

.desktop-sessions-popup {
  color: var(--pulse-text);
}

.desktop-sessions-sheet {
  padding: 22px 18px calc(22px + env(safe-area-inset-bottom, 0px));
  background: var(--pulse-surface-high);
}

.desktop-sessions-head {
  padding: 0 28px 16px 0;
}

.desktop-sessions-heading {
  display: flex;
  align-items: center;
  gap: 12px;
}

.desktop-sessions-icon {
  width: 42px;
  height: 42px;
  border-radius: 13px;
  background: rgba(75, 142, 255, 0.16);
  color: var(--pulse-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 25px;
}

.desktop-sessions-heading h2 {
  margin: 0;
  font-size: 18px;
  line-height: 26px;
}

.desktop-sessions-heading p {
  margin: 2px 0 0;
  color: var(--pulse-text-secondary);
  font-size: 13px;
  line-height: 19px;
}

.desktop-session-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.desktop-session-row {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
  padding: 13px 0;
  border-top: 1px solid rgba(127, 137, 158, 0.18);
}

.desktop-session-device-icon {
  flex: 0 0 auto;
  color: var(--pulse-primary);
  font-size: 25px;
}

.desktop-session-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.desktop-session-copy strong {
  overflow: hidden;
  color: var(--pulse-text);
  font-size: 15px;
  font-weight: 650;
  line-height: 21px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desktop-session-copy span {
  color: var(--pulse-text-secondary);
  font-size: 12px;
  line-height: 18px;
}

.desktop-session-logout,
.desktop-session-retry {
  flex: 0 0 auto;
  min-height: 32px;
  padding: 0 11px;
  border: 1px solid rgba(238, 10, 36, 0.45);
  border-radius: 999px;
  background: transparent;
  color: #f04450;
  font-size: 12px;
  cursor: pointer;
}

.desktop-session-logout:disabled {
  opacity: 0.55;
  cursor: default;
}

.desktop-sessions-state {
  min-height: 128px;
  padding: 18px 0 12px;
  color: var(--pulse-text-secondary);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 9px;
  text-align: center;
}

.desktop-sessions-state > .material-symbols-outlined {
  color: var(--pulse-text-tertiary, var(--pulse-text-secondary));
  font-size: 36px;
}

.desktop-sessions-state p {
  margin: 0;
  font-size: 13px;
}

.desktop-session-retry {
  border-color: rgba(75, 142, 255, 0.55);
  color: var(--pulse-primary);
}

.desktop-sessions-footnote {
  margin: 14px 0 0;
  color: var(--pulse-text-tertiary, var(--pulse-text-secondary));
  font-size: 12px;
  line-height: 18px;
  text-align: center;
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

.page-pull {
  flex: 1 0 auto;
  width: 100%;
  min-height: 100%;
  background: var(--pulse-page-bg, var(--pulse-bg));
  display: flex;
  flex-direction: column;
}

.page-pull :deep(.van-pull-refresh__track) {
  flex: 1 0 auto;
  display: flex;
  flex-direction: column;
  min-height: 100%;
  background: var(--pulse-page-bg, var(--pulse-bg));
}

.pull-inner {
  flex: 1 0 auto;
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding-top: 4px;
  padding-bottom: 96px;
  background: var(--pulse-page-bg, var(--pulse-bg));
  box-sizing: border-box;
}

.pull-filler {
  flex: 1 0 auto;
  min-height: 48px;
  width: 100%;
  /* 必须可点，否则空白区域收不到 touchstart */
  pointer-events: auto;
  touch-action: pan-y;
}

.conversation-list {
  flex-shrink: 0;
  margin: 14px 12px 12px;
  overflow: hidden;
  border: 1px solid var(--pulse-border);
  border-radius: 16px;
  background: var(--pulse-surface-container);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.24);
}

.select-all-fab {
  position: fixed;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 60;
  border: none;
  border-radius: 999px;
  padding: 12px 18px;
  background: var(--pulse-primary);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28);
  cursor: pointer;
  white-space: nowrap;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.select-all-fab:active {
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.32);
}

.conversation-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  cursor: pointer;
  transition: background 0.15s;
  background: transparent;
}

.conversation-item::after {
  content: '';
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 0;
  height: 1px;
  background: var(--pulse-divider);
  pointer-events: none;
}

.conversation-list :deep(.van-swipe-cell:last-child .conversation-item::after) {
  display: none;
}

.conversation-item:active,
.conversation-item.selected {
  background: var(--pulse-surface-low);
}

.check-wrap {
  flex-shrink: 0;
}

.check {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1.5px solid var(--pulse-outline);
  display: flex;
  align-items: center;
  justify-content: center;
}

.check.on {
  border-color: var(--pulse-primary-container);
  background: var(--pulse-primary-container);
  color: var(--pulse-on-primary-container);
}

.check .material-symbols-outlined {
  font-size: 16px;
  font-variation-settings: 'FILL' 1;
}

.avatar-wrap {
  position: relative;
  flex-shrink: 0;
  --messages-avatar-size: 56px;
}

.conv-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.conv-avatar.initials {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: calc(var(--pulse-content-font-size, 15px) + 1px);
  font-weight: 700;
  color: var(--pulse-primary);
  background: var(--pulse-surface-highest);
}

.online-dot {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  z-index: 1;
  border: 2px solid var(--pulse-bg);
  background: var(--pulse-outline);
}

.online-dot.online {
  background: #42e355;
}

.conv-content {
  flex: 1;
  min-width: 0;
}

.conv-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 2px;
}

.conv-name {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
  font-size: calc(var(--pulse-content-font-size, 15px) + 1px);
  font-weight: 600;
  line-height: 1.35;
  color: var(--pulse-text);
}

.conv-name-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conv-friend-tag {
  flex: 0 1 auto;
  max-width: 100%;
  box-sizing: border-box;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  line-height: 16px;
  white-space: normal;
  overflow-wrap: anywhere;
}

.group-tag {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  padding: 2px 5px;
  border-radius: 3px;
  color: var(--pulse-primary);
  background: rgba(173, 198, 255, 0.14);
  border: 1px solid rgba(173, 198, 255, 0.28);
}

.avatar-group-tag {
  position: absolute;
  right: -5px;
  bottom: -3px;
  z-index: 2;
  box-sizing: border-box;
  padding: 2px 5px;
  border: 2px solid var(--pulse-bg);
  border-radius: 999px;
  line-height: 12px;
  background: var(--pulse-primary-container);
  color: var(--pulse-on-primary-container);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.pin-ico,
.mute-ico {
  flex-shrink: 0;
  font-size: 16px;
  color: var(--pulse-primary);
  font-variation-settings: 'FILL' 1;
}

.mute-ico {
  color: var(--pulse-outline);
}

.mute-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--pulse-primary);
}

.conv-time {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  line-height: 12px;
  color: var(--pulse-text-secondary);
}

.conv-time.unread {
  color: var(--pulse-primary);
  font-weight: 700;
}

.conv-bottom {
  display: flex;
  align-items: center;
  gap: 8px;
}

.conv-preview {
  margin: 0;
  flex: 1;
  min-width: 0;
  font-size: var(--pulse-content-font-size, 15px);
  line-height: 1.35;
  color: var(--pulse-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mention-tag {
  color: #ee0a24;
  margin-right: 4px;
  font-weight: 600;
}

.draft-tag {
  color: #ee0a24;
  margin-right: 4px;
  font-weight: 600;
}

.unread-badge {
  flex-shrink: 0;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--pulse-primary);
  color: var(--pulse-on-primary);
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.swipe-btn {
  height: 100%;
  min-width: 72px;
  border: none;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  padding: 0 12px;
  cursor: pointer;
}

.swipe-btn.read {
  background: var(--pulse-primary-container);
}

.swipe-btn.pin {
  background: #c9a227;
}

.swipe-btn.danger {
  background: #ff5447;
}

.edit-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(64px + env(safe-area-inset-bottom, 0px));
  z-index: 45;
  display: flex;
  justify-content: space-around;
  align-items: center;
  gap: 4px;
  padding: 10px 6px;
  background: var(--pulse-nav-bg, rgba(30, 31, 35, 0.96));
  backdrop-filter: blur(16px);
  border-top: 1px solid var(--pulse-border, rgba(65, 71, 85, 0.35));
}

.edit-action {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  color: var(--pulse-text);
  font-size: 12px;
  cursor: pointer;
  padding: 6px 4px;
}

.edit-action .material-symbols-outlined {
  font-size: 22px;
  color: var(--pulse-primary);
}

.edit-action.cancel .material-symbols-outlined {
  color: var(--pulse-text-secondary);
}

.edit-action.danger .material-symbols-outlined {
  color: #ff5447;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 48px 16px;
  color: var(--pulse-text-secondary);
  font-size: 14px;
}

:deep(.van-swipe-cell__right) {
  display: flex;
}

/* 浅色模式：头部区域淡蓝渐变（与页面蓝白底协调，深色保持原样） */
:root[data-theme='light'] .top-bar {
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

:root[data-theme='light'] .head-area {
  /* 顶部淡蓝，往下逐渐过渡到白色 */
  background: linear-gradient(180deg, #bfe8ff 0%, #d9f2ff 36%, #f4faff 70%, #ffffff 100%);
}

:root[data-theme='light'] .top-bar .page-title {
  color: #fff;
}

:root[data-theme='light'] .top-bar .desktop-session-btn {
  color: #14243a;
}

:root[data-theme='light'] .top-bar .lock-screen-btn {
  color: #14243a;
}

:root[data-theme='light'] .top-bar .search-pill {
  background: rgba(255, 255, 255, 0.24);
  border-color: rgba(255, 255, 255, 0.28);
}

:root[data-theme='light'] .top-bar .search-ico,
:root[data-theme='light'] .top-bar .search-placeholder {
  /* 浅色半透明白底上用深色文字，保证可读 */
  color: #14243a;
}

:root[data-theme='light'] .top-bar .more-btn {
  background: rgba(255, 255, 255, 0.24);
  border-color: rgba(255, 255, 255, 0.28);
  color: #14243a;
}

</style>

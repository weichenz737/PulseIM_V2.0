import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { onWsMessage } from '@/im/ws'
import { useUserStore } from '@/stores/user'
import {
  notifyIncomingMessage,
  resetUnreadNotifications,
  syncUnreadNotifications,
} from '@/native/unreadBadge'
import { favoritePreviewLabel, normalizeMessageFilePayload, type FilePayload } from '@/api/message'
import { formatCallPreview } from '@/utils/callPreview'
import { formatBusinessPreview } from '@/utils/businessPreview'
import { formatContactCardPreview, formatLocationPreview } from '@/utils/contactPreview'
import { updateSavedAccountUnreadCount } from './accounts'

export interface ConversationPreviewPatch {
  conversationId: string
  msgId?: string
  preview: string
  msgType?: number
  at: number
  time?: string
  /** 是否自己发出；自己发出不加未读 */
  fromSelf?: boolean
  /** 群聊最新消息的发送人昵称；会话列表需要显示发送人。 */
  fromNickname?: string
  recalled?: boolean
  /** 推送里标明 @ 了我 */
  mentionUnread?: boolean
  /** 历史消息重算时，即使预览为空也要覆盖服务端旧值。 */
  replaceServerPreview?: boolean
}

interface ConversationUnreadItem {
  id?: string | number
  unread?: number
  type?: string
  mute?: boolean
  fileTransferAssistant?: boolean
}

interface UnreadSourceState {
  count: number
  senderIds: Record<string, true>
  type: 'personal' | 'group' | ''
}

export interface UnreadNavigationSummary {
  count: number
  conversationIds: string[]
  senderIds: string[]
  directConversationId: string
}

function previewFromPayload(msg: Record<string, unknown>): string {
  if (msg.type === 'recall' || String(msg.cmd ?? '') === 'RECALL_MSG') {
    return '撤回了一条消息'
  }
  if (msg.burnAfterRead === true || msg.burn_after_read === true) return '[阅后即焚消息]'
  const msgType = Number(msg.msgType ?? 0)
  const rawFile = msg.file && typeof msg.file === 'object'
    ? msg.file as Partial<FilePayload> & { downloadUrl?: string }
    : undefined
  const fileId = String(msg.fileId ?? rawFile?.fileId ?? '').trim()
  const file = fileId || rawFile?.fileId
    ? normalizeMessageFilePayload(fileId, rawFile)
    : null
  const content = file ? JSON.stringify(file) : String(msg.content ?? '')
  if (msg.msgType != null && msgType === 0) {
    const text = String(msg.content ?? '').trim()
    if (text.startsWith('__PULSE_LIVE_LOCATION__')) return '[实时位置共享]'
    return text.length > 40 ? text.slice(0, 40) + '…' : text
  }
  if (msgType === 9) {
    const formatted = formatCallPreview(content) || formatBusinessPreview(content)
    if (formatted && formatted !== content) return formatted
    // 系统消息即使是旧格式或损坏 JSON，也不能把结构化原文显示在会话列表。
    const trimmed = content.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return '[系统消息]'
    return formatted || content
  }
  if (msgType === 7 || msgType === 8) return formatBusinessPreview(content)
  // 图片/文件/语音/聊天记录/名片/位置
  if (msgType >= 1 && msgType <= 6) {
    return favoritePreviewLabel(msgType, content)
  }
  const text = content.trim()
  // 容错：部分推送可能缺 msgType，但仍带名片/位置 JSON
  const structured =
    formatContactCardPreview(text) ||
    formatLocationPreview(text) ||
    formatCallPreview(text) ||
    formatBusinessPreview(text)
  if (structured) return structured
  return text.length > 40 ? `${text.slice(0, 40)}…` : text
}

function formatNowTime(): string {
  return new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function messageTimeMs(msg: Record<string, unknown>): number {
  const raw = msg.createdAt ?? msg.created_at ?? msg.sendTime ?? msg.send_time
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string') {
    const numeric = Number(raw)
    if (Number.isFinite(numeric) && numeric > 0) return numeric
    const parsed = Date.parse(raw)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function formatMessageTime(ms: number): string {
  if (!ms) return formatNowTime()
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return formatNowTime()
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function isPreviewableMessage(msg: Record<string, unknown>): boolean {
  if (
    msg.recalled ||
    msg.deleted ||
    msg.deletedForMe ||
    msg.deleted_for_me ||
    msg.hidden
  ) return false
  const expiry = msg.burnExpiresAt ?? msg.burn_expires_at ?? msg.autoDeleteExpiresAt ?? msg.auto_delete_expires_at
  if (expiry) {
    const expiryMs = typeof expiry === 'number' ? expiry : Date.parse(String(expiry))
    if (Number.isFinite(expiryMs) && expiryMs > 0 && expiryMs <= Date.now()) return false
  }
  return true
}

export const useConversationInboxStore = defineStore('conversationInbox', () => {
  const userStore = useUserStore()
  const patches = ref<Record<string, ConversationPreviewPatch>>({})
  const revision = ref(0)
  /** 底部「消息」Tab 未读总数（不含免打扰会话由页面侧过滤后写入） */
  const unreadTotal = ref(0)
  /** 顶部未读入口使用的会话来源；同时兼容服务端历史未读和实时推送未读。 */
  const unreadSources = ref<Record<string, UnreadSourceState>>({})
  let unsub: (() => void) | null = null
  let started = false

  function setUnreadTotal(n: number) {
    unreadTotal.value = Math.max(0, Math.floor(Number(n) || 0))
    updateSavedAccountUnreadCount(userStore.userId, unreadTotal.value)
  }

  function bumpUnread(delta = 1) {
    unreadTotal.value = Math.max(0, unreadTotal.value + delta)
    updateSavedAccountUnreadCount(userStore.userId, unreadTotal.value)
  }

  const unreadMessageCount = computed(() =>
    Object.values(unreadSources.value).reduce((sum, source) => sum + source.count, 0),
  )

  function recordUnreadSource(conversationId: string, fromUserId: string) {
    const id = String(conversationId || '')
    if (!id) return
    const senderId = String(fromUserId || '')
    const previous = unreadSources.value[id]
    unreadSources.value = {
      ...unreadSources.value,
      [id]: {
        count: (previous?.count || 0) + 1,
        senderIds: senderId
          ? { ...(previous?.senderIds || {}), [senderId]: true }
          : (previous?.senderIds || {}),
        type: previous?.type || '',
      },
    }
  }

  /**
   * 用会话列表中的服务端未读数补齐页面刚打开时的历史未读。
   * 实时推送已经记录的发送者信息会保留，避免群聊跳转规则被轮询覆盖。
   */
  function hydrateUnreadSources(items: ConversationUnreadItem[]) {
    const next = { ...unreadSources.value }
    items.forEach((item) => {
      const id = String(item.id || '')
      if (!id) return
      const unread = Math.max(0, Math.floor(Number(item.unread) || 0))
      const eligible = unread > 0 && !item.mute && !item.fileTransferAssistant
      if (!eligible) {
        delete next[id]
        return
      }
      const previous = unreadSources.value[id]
      next[id] = {
        count: Math.max(unread, previous?.count || 0),
        senderIds: previous?.senderIds || {},
        type: item.type === 'group' ? 'group' : 'personal',
      }
    })
    unreadSources.value = next
  }

  function clearConversationUnread(conversationId: string) {
    const id = String(conversationId || '')
    if (!id || !unreadSources.value[id]) return
    const next = { ...unreadSources.value }
    delete next[id]
    unreadSources.value = next
  }

  function unreadNavigationSummary(excludeConversationId = ''): UnreadNavigationSummary {
    const excludedId = String(excludeConversationId || '')
    const entries = Object.entries(unreadSources.value).filter(([id, source]) => (
      id !== excludedId && source.count > 0
    ))
    const conversationIds = entries.map(([id]) => id)
    const senderIds = [...new Set(
      entries.flatMap(([, source]) => Object.keys(source.senderIds)),
    )]
    let directConversationId = ''
    if (entries.length === 1) {
      const [id, source] = entries[0]
      const oneSender = Object.keys(source.senderIds).length === 1
      // 私聊天然只有一个发送者；群聊只有能确认是一个发送者时才直达。
      if (source.type === 'personal' || (source.type === 'group' && oneSender) || (!source.type && oneSender)) {
        directConversationId = id
      }
    }
    return {
      count: entries.reduce((sum, [, source]) => sum + source.count, 0),
      conversationIds,
      senderIds,
      directConversationId,
    }
  }

  // 未读总数变化 → 同步桌面图标角标与通知栏未读汇总。
  watch(
    unreadTotal,
    (n) => {
      void syncUnreadNotifications(n)
    },
    { immediate: true },
  )

  function applyPatch(patch: ConversationPreviewPatch) {
    const id = String(patch.conversationId || '')
    if (!id) return
    const prev = patches.value[id]
    patches.value = {
      ...patches.value,
      [id]: {
        ...prev,
        ...patch,
        conversationId: id,
        at: patch.at || Date.now(),
        mentionUnread: patch.mentionUnread ?? prev?.mentionUnread,
      },
    }
    revision.value += 1
  }

  function notifyLocalMessage(conversationId: string, preview: string, msgType?: number) {
    applyPatch({
      conversationId,
      msgId: '',
      preview,
      msgType,
      at: Date.now(),
      fromSelf: true,
      fromNickname: String(userStore.nickname || '').trim() || undefined,
      mentionUnread: false,
    })
  }

  function notifyBurnExpired(conversationId: string) {
    applyPatch({
      conversationId,
      preview: '[阅后即焚消息已销毁]',
      at: Date.now(),
      time: formatNowTime(),
      fromSelf: false,
      replaceServerPreview: true,
    })
  }

  function notifyRecall(conversationId: string) {
    applyPatch({
      conversationId,
      preview: '撤回了一条消息',
      at: Date.now(),
      fromSelf: true,
      recalled: true,
    })
  }

  /**
   * 用会话刚加载的真实消息重算列表预览。
   * 不能只依赖 WebSocket：首次打开会话、刷新页面和断线补拉都会走这里。
   */
  function syncFromMessages(conversationId: string, source: Array<Record<string, unknown>>) {
    const id = String(conversationId || '')
    if (!id) return
    const sorted = source
      .filter(isPreviewableMessage)
      .slice()
      .sort((a, b) => messageTimeMs(a) - messageTimeMs(b))
    const latest = sorted[sorted.length - 1]
    const at = latest ? messageTimeMs(latest) || Date.now() : Date.now()
    const preview = latest ? previewFromPayload(latest) : ''
    applyPatch({
      conversationId: id,
      msgId: latest ? String(latest.id ?? latest.msgId ?? '') : undefined,
      preview,
      msgType: latest?.msgType != null ? Number(latest.msgType) : undefined,
      at,
      time: formatMessageTime(at),
      fromSelf: latest ? String(latest.fromUserId ?? latest.from_user_id ?? '') === String(userStore.userId || '') : false,
      fromNickname: latest ? String(latest.fromNickname ?? latest.from_nickname ?? '').trim() || undefined : undefined,
      replaceServerPreview: true,
    })
  }

  function clearPatch(conversationId: string) {
    const id = String(conversationId || '')
    if (!id || !patches.value[id]) return
    const next = { ...patches.value }
    delete next[id]
    patches.value = next
    revision.value += 1
  }

  function clearMention(conversationId: string) {
    const id = String(conversationId || '')
    const prev = patches.value[id]
    if (!prev?.mentionUnread) return
    applyPatch({
      ...prev,
      conversationId: id,
      mentionUnread: false,
      at: Date.now(),
    })
  }

  function notifyConversationRead(
    conversationId: string,
    fromUserId = String(userStore.userId || ''),
    lastReadMsgId = '',
    lastReadSendTime = 0,
  ) {
    const id = String(conversationId || '')
    if (!id) return
    if (String(fromUserId || '') === String(userStore.userId || '')) {
      clearConversationUnread(id)
    }
    window.dispatchEvent(new CustomEvent('pulse:conversation-read', {
      detail: {
        conversationId: id,
        fromUserId: String(fromUserId || ''),
        lastReadMsgId: String(lastReadMsgId || ''),
        lastReadSendTime: Number(lastReadSendTime) || 0,
      },
    }))
  }

  function startWsBridge() {
    if (started) return
    started = true
    unsub = onWsMessage((data) => {
      const msg = data as Record<string, unknown>
      const cmd = String(msg.cmd ?? '')
      const normalizedCmd = cmd.toUpperCase()
      const isReadReceipt =
        normalizedCmd === 'READ_RECEIPT' ||
        normalizedCmd === 'READ_RECEIPT_PUSH' ||
        normalizedCmd === 'MESSAGE_READ' ||
        normalizedCmd === 'MESSAGE_READ_RECEIPT' ||
        msg.type === 'read_receipt' ||
        msg.event === 'read_receipt'
      if (isReadReceipt) {
        notifyConversationRead(
          String(msg.conversationId ?? ''),
          String(msg.fromUserId ?? ''),
          String(msg.lastReadMsgId ?? ''),
          Number(msg.lastReadSendTime) || 0,
        )
        return
      }
      if (normalizedCmd === 'BURN_EXPIRED') {
        const id = String(msg.conversationId ?? '')
        if (id && patches.value[id]?.msgId === String(msg.msgId ?? '')) notifyBurnExpired(id)
        return
      }
      if (
        !(
          normalizedCmd === 'PUSH_MSG' ||
          normalizedCmd === 'MSG' ||
          normalizedCmd === 'RECALL_MSG' ||
          msg.type === 'message' ||
          msg.type === 'recall'
        )
      ) {
        return
      }
      const conversationId = String(msg.conversationId ?? '')
      if (!conversationId) return
      const fromSelf = String(msg.fromUserId ?? '') === String(userStore.userId || '')
      const recalled = normalizedCmd === 'RECALL_MSG' || msg.type === 'recall'
      const mentionedMe = !!msg.mentionedMe
      const preview = previewFromPayload(msg)
      if (!preview) return
        applyPatch({
          conversationId,
          msgId: String(msg.msgId ?? msg.id ?? ''),
          preview,
          msgType: msg.msgType != null ? Number(msg.msgType) : undefined,
          at: Number(msg.sendTime) || Date.now(),
          fromSelf,
          fromNickname: String(msg.fromNickname ?? msg.from_nickname ?? '').trim() || undefined,
          recalled,
        mentionUnread: recalled ? undefined : mentionedMe || undefined,
      })
      // 他人新消息：先本地 +1，会话列表刷新后会校正准确值
      if (!recalled && !fromSelf) {
        recordUnreadSource(conversationId, String(msg.fromUserId ?? ''))
        bumpUnread(1)
        if (msg.notificationAllowed !== false) {
          void notifyIncomingMessage({
            messageId: String(msg.id ?? msg.msgId ?? ''),
            conversationId,
            title: String(msg.fromNickname ?? '') || undefined,
            body: preview,
          })
        }
      }
    })
  }

  function stopWsBridge() {
    unsub?.()
    unsub = null
    started = false
    patches.value = {}
    unreadSources.value = {}
    revision.value += 1
    unreadTotal.value = 0
    void resetUnreadNotifications()
  }

  return {
    patches,
    revision,
    unreadTotal,
    unreadMessageCount,
    unreadSources,
    setUnreadTotal,
    bumpUnread,
    hydrateUnreadSources,
    clearConversationUnread,
    unreadNavigationSummary,
    applyPatch,
    notifyLocalMessage,
    notifyBurnExpired,
    notifyConversationRead,
    notifyRecall,
    syncFromMessages,
    clearPatch,
    clearMention,
    startWsBridge,
    stopWsBridge,
    formatNowTime,
  }
})

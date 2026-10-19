<script setup lang="ts">
import { formatTime } from '@/utils/datetime'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from '@/utils/elementFeedback'
import type { TableInstance } from 'element-plus'
import { LocationFilled, Money, Present } from '@element-plus/icons-vue'
import {
  clearAllAdminMessages,
  deleteAdminMessages,
  fetchAdminMessages,
  fetchMessageContext,
  type AdminFileMetadata,
  type AdminMessage,
} from '@/api/messages'
import { fetchAdminMediaBlob, resolveFileUrl } from '@/api/files'
import AdminAvatar from '@/components/AdminAvatar.vue'

interface MediaPayload {
  url: string
  fileId?: string
  originalUrl?: string
  thumbUrl?: string
  name: string
  size?: number
  contentType?: string
  durationMs?: number
  transcript?: string
}

interface ContactCardPayload {
  cardType: 'user' | 'group' | 'community'
  nickname: string
  avatarUrl?: string
  userId?: string
  conversationId?: string
  communityId?: string
  pulseId?: string
}

interface ForwardCardItem {
  msgId?: string
  fromUserId?: string
  fromNickname?: string
  msgType?: number
  fileId?: string
  file?: AdminFileMetadata
  content?: string
  createdAt?: string
}

interface ForwardCardPayload {
  title: string
  sourceTitle?: string
  count: number
  items: ForwardCardItem[]
}

interface LocationPayload {
  latitude: number
  longitude: number
  address: string
  name?: string
}

interface WalletPayload {
  businessNo?: string
  packetType?: string
  greeting?: string
  totalCount?: number
  amount?: number
  remark?: string
  status?: string
}

const route = useRoute()
const conversationType = computed(() => (Number(route.meta.conversationType) === 2 ? 2 : 1) as 1 | 2)
const isGroup = computed(() => conversationType.value === 2)

const loading = ref(false)
const deleting = ref(false)
const messages = ref<AdminMessage[]>([])
const total = ref(0)
const detailVisible = ref(false)
const detailRow = ref<AdminMessage | null>(null)
const tableRef = ref<TableInstance>()
const selectedRows = ref<AdminMessage[]>([])

const contextVisible = ref(false)
const contextLoading = ref(false)
const contextLoadingMore = ref(false)
const contextTitle = ref('')
const contextMessages = ref<AdminMessage[]>([])
const contextAnchorId = ref<number | null>(null)
const contextFocusUserId = ref<number | null>(null)
const contextHasMoreBefore = ref(false)
const contextHasMoreAfter = ref(false)
const contextConversationId = ref<number | null>(null)
const chatBodyRef = ref<HTMLElement | null>(null)

type MediaLoadState = 'loading' | 'ready' | 'error'
const mediaBlobUrls = reactive(new Map<string, string>())
const mediaLoadStates = reactive(new Map<string, MediaLoadState>())
const mediaLoads = new Map<string, Promise<string>>()

const query = reactive({
  keyword: '',
  conversationId: '' as number | '',
  fromUserId: '' as number | '',
  /** 数字类型，或 video/file/live-location 特殊分类 */
  msgType: '' as number | 'video' | 'file' | 'live-location' | '',
  recalled: '' as boolean | '',
  userDeleted: '' as boolean | '',
  page: 1,
  size: 20,
})

async function loadMessages() {
  loading.value = true
  selectedRows.value = []
  try {
    const typeFilter = query.msgType
    const isMediaKind = typeFilter === 'video' || typeFilter === 'file'
    const isLiveLocationKind = typeFilter === 'live-location'
    const data = await fetchAdminMessages({
      page: query.page,
      size: query.size,
      conversationType: conversationType.value,
      keyword: query.keyword.trim(),
      conversationId: query.conversationId,
      fromUserId: query.fromUserId,
      msgType: typeof typeFilter === 'number' ? typeFilter : '',
      mediaKind: isMediaKind ? typeFilter : '',
      contentKind: isLiveLocationKind ? 'live-location' : '',
      recalled: query.recalled,
      userDeleted: query.userDeleted,
    })
    messages.value = data.list
    total.value = data.total
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载聊天记录失败')
  } finally {
    loading.value = false
  }
}

function onSelectionChange(rows: AdminMessage[]) {
  selectedRows.value = rows
}

function clearSelection() {
  tableRef.value?.clearSelection()
  selectedRows.value = []
}

async function handleBatchDelete() {
  if (!selectedRows.value.length) {
    ElMessage.warning('请先勾选要删除的记录')
    return
  }
  const ids = selectedRows.value.map((r) => r.id)
  const count = ids.length
  try {
    await ElMessageBox.confirm(
      `确定删除选中的 ${count} 条消息吗？删除后不可恢复。`,
      '批量删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      },
    )
    deleting.value = true
    const n = await deleteAdminMessages(ids)
    ElMessage.success(`已删除 ${n} 条`)
    clearSelection()
    if (messages.value.length <= count && query.page > 1) {
      query.page -= 1
    }
    await loadMessages()
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(e instanceof Error ? e.message : '删除失败')
  } finally {
    deleting.value = false
  }
}

async function handleClearAll() {
  const kind = isGroup.value ? '群聊' : '私聊'
  const expect = '确认删除'
  try {
    await ElMessageBox.confirm(
      `将删除全部${kind}记录（当前列表合计 ${total.value} 条，实际以服务器为准）。\n会话本身保留，仅清空消息，且不可恢复。`,
      `一键删除全部${kind}记录`,
      {
        confirmButtonText: '继续',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      },
    )
    const { value } = await ElMessageBox.prompt(
      `请输入「${expect}」以确认清空全部${kind}记录`,
      '二次确认',
      {
        confirmButtonText: '全部删除',
        cancelButtonText: '取消',
        inputPlaceholder: expect,
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
        inputValidator: (v) => {
          if ((v || '').trim() !== expect) return `请输入：${expect}`
          return true
        },
      },
    )
    if ((value || '').trim() !== expect) return
    deleting.value = true
    const n = await clearAllAdminMessages(conversationType.value)
    ElMessage.success(`已清空 ${n} 条${kind}记录`)
    clearSelection()
    query.page = 1
    await loadMessages()
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(e instanceof Error ? e.message : '清空失败')
  } finally {
    deleting.value = false
  }
}

function handleSearch() {
  query.page = 1
  loadMessages()
}

function handleReset() {
  query.keyword = ''
  query.conversationId = ''
  query.fromUserId = ''
  query.msgType = ''
  query.recalled = ''
  query.userDeleted = ''
  query.page = 1
  loadMessages()
}

function msgTypeLabel(type?: number, row?: AdminMessage) {
  switch (type) {
    case 0:
      if (row && isLiveLocationMsg(row)) return '位置共享'
      return row && isLocationMsg(row) ? '位置' : '文本'
    case 1:
      return '图片'
    case 2:
      if (row) return isVideoMsg(row) ? '视频' : '文件'
      return '文件'
    case 3:
      return '语音'
    case 4:
      return '合并转发'
    case 5: {
      const card = row ? parseContactCard(row.content) : null
      if (card?.cardType === 'community') return '圈子名片'
      if (card?.cardType === 'group') return '群名片'
      if (card?.cardType === 'user') return '个人名片'
      return '名片'
    }
    case 6:
      return '位置'
    case 7:
      return '红包'
    case 8:
      return '转账'
    case 9:
      return '系统提示'
    default:
      return type == null ? '—' : `类型${type}`
  }
}


function formatSize(size?: number) {
  if (size == null || Number.isNaN(size) || size <= 0) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function formatDuration(ms?: number) {
  if (ms == null || Number.isNaN(ms) || ms <= 0) return ''
  const sec = Math.max(1, Math.round(ms / 1000))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}"`
}

function adminMessageFileUrl(fileId: string, variant = 'original') {
  const id = String(fileId || '').trim()
  if (!id) return ''
  const suffix = variant === 'original' ? '' : `?variant=${encodeURIComponent(variant)}`
  return resolveFileUrl(`/api/admin/messages/files/${encodeURIComponent(id)}${suffix}`)
}

function isInlineMediaUrl(url: string) {
  return url.startsWith('data:') || url.startsWith('blob:')
}

function isAdminMediaEndpoint(url: string) {
  try {
    return new URL(url, window.location.origin).pathname.includes('/api/admin/messages/files/')
  } catch {
    return false
  }
}

function isExternalMediaUrl(url: string) {
  if (!/^https?:\/\//i.test(url)) return false
  if (isAdminMediaEndpoint(url)) return false
  try {
    return new URL(url).origin !== window.location.origin
  } catch {
    return true
  }
}

function mediaSourceUrl(url?: string) {
  return String(url || '').trim()
}

function ensureMediaBlobUrl(url?: string) {
  const source = mediaSourceUrl(url)
  if (!source || isInlineMediaUrl(source) || isExternalMediaUrl(source)) return
  if (mediaBlobUrls.has(source) || mediaLoads.has(source)) return

  mediaLoadStates.set(source, 'loading')
  const load = fetchAdminMediaBlob(source)
    .then((blob) => {
      const objectUrl = URL.createObjectURL(blob)
      mediaBlobUrls.set(source, objectUrl)
      mediaLoadStates.set(source, 'ready')
      return objectUrl
    })
    .catch((error) => {
      mediaLoadStates.set(source, 'error')
      throw error
    })
    .finally(() => {
      mediaLoads.delete(source)
    })
  mediaLoads.set(source, load)
  void load.catch(() => undefined)
}

function mediaDisplayUrl(url?: string) {
  const source = mediaSourceUrl(url)
  if (!source || isInlineMediaUrl(source) || isExternalMediaUrl(source)) return source
  const cached = mediaBlobUrls.get(source)
  if (cached) return cached
  ensureMediaBlobUrl(source)
  return ''
}

function mediaState(url?: string): MediaLoadState | undefined {
  return mediaLoadStates.get(mediaSourceUrl(url))
}

function mediaLoadText(url?: string) {
  return mediaState(url) === 'error' ? '加载失败，点击重试' : '加载中…'
}

function retryMedia(url?: string) {
  const source = mediaSourceUrl(url)
  if (!source) return
  const oldObjectUrl = mediaBlobUrls.get(source)
  if (oldObjectUrl) URL.revokeObjectURL(oldObjectUrl)
  mediaBlobUrls.delete(source)
  mediaLoadStates.delete(source)
  ensureMediaBlobUrl(source)
}

function cachedMediaDisplayUrl(url?: string) {
  const source = mediaSourceUrl(url)
  if (!source || isInlineMediaUrl(source) || isExternalMediaUrl(source)) return source
  return mediaBlobUrls.get(source) || ''
}

async function openMedia(url?: string) {
  const source = mediaSourceUrl(url)
  if (!source) return
  if (isInlineMediaUrl(source) || isExternalMediaUrl(source)) {
    window.open(source, '_blank', 'noopener,noreferrer')
    return
  }
  ensureMediaBlobUrl(source)
  try {
    const objectUrl = mediaBlobUrls.get(source) || await mediaLoads.get(source)
    if (!objectUrl) throw new Error('媒体文件为空')
    window.open(objectUrl, '_blank', 'noopener,noreferrer')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '媒体文件加载失败')
  }
}

function mediaFromMetadata(file?: AdminFileMetadata): MediaPayload | null {
  if (!file) return null
  const url = file.url || file.originalUrl || file.downloadUrl
  if (!url) return null
  const originalUrl = file.originalUrl || file.downloadUrl || file.url
  return {
    fileId: file.fileId,
    url: resolveFileUrl(url),
    originalUrl: originalUrl ? resolveFileUrl(originalUrl) : undefined,
    thumbUrl: file.thumbUrl ? resolveFileUrl(file.thumbUrl) : undefined,
    name: file.name || '文件',
    size: file.size,
    contentType: file.contentType,
    durationMs: typeof file.durationMs === 'number' ? file.durationMs : undefined,
  }
}

function parseMedia(content?: string, file?: AdminFileMetadata): MediaPayload | null {
  const hydrated = mediaFromMetadata(file)
  if (hydrated) return hydrated
  if (!content) return null
  const raw = content.trim()
  if (raw.startsWith('http') || raw.startsWith('/') || raw.startsWith('data:')) {
    return { url: resolveFileUrl(raw), name: '文件' }
  }
  if (raw.startsWith('file:')) {
    const fileId = raw.slice('file:'.length).trim()
    return fileId ? { fileId, url: adminMessageFileUrl(fileId), name: '文件' } : null
  }
  try {
    const obj = JSON.parse(raw) as MediaPayload & Record<string, unknown>
    const fileId = obj.fileId ? String(obj.fileId) : undefined
    const sourceUrl = obj.url || obj.originalUrl || obj.downloadUrl || obj.fileUrl || obj.src
    if (!sourceUrl && !fileId) return null
    const url = sourceUrl ? String(sourceUrl) : adminMessageFileUrl(fileId || '')
    const originalUrl = obj.originalUrl || obj.downloadUrl || sourceUrl || url
    return {
      fileId,
      url: resolveFileUrl(url),
      originalUrl: originalUrl ? resolveFileUrl(String(originalUrl)) : undefined,
      thumbUrl: obj.thumbUrl ? resolveFileUrl(obj.thumbUrl) : undefined,
      name: String(obj.name || obj.fileName || obj.filename || obj.originalName || '文件'),
      size: obj.size,
      contentType: String(obj.contentType || obj.mime || obj.mimeType || ''),
      durationMs: typeof obj.durationMs === 'number' ? obj.durationMs : undefined,
      transcript: typeof obj.transcript === 'string' ? obj.transcript : undefined,
    }
  } catch {
    return null
  }
}

function isVideoMedia(contentType?: string, nameOrUrl?: string) {
  const ct = (contentType || '').toLowerCase()
  if (ct.startsWith('video/')) return true
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(nameOrUrl || '')
}

function mediaOf(row: AdminMessage): MediaPayload | null {
  if (row.msgType === 1 || row.msgType === 2 || row.msgType === 3) {
    return parseMedia(row.content, row.file)
  }
  return null
}

function isImageMsg(row: AdminMessage) {
  return row.msgType === 1 && !!mediaOf(row)?.url
}

function isVideoMsg(row: AdminMessage) {
  if (row.msgType !== 2) return false
  const m = mediaOf(row)
  return !!m && isVideoMedia(m.contentType, m.url || m.name)
}

function isFileMsg(row: AdminMessage) {
  return row.msgType === 2 && !!mediaOf(row) && !isVideoMsg(row)
}

function isVoiceMsg(row: AdminMessage) {
  return row.msgType === 3 && !!mediaOf(row)?.url
}

function parseLocation(row: AdminMessage): LocationPayload | null {
  const source = parseLocationPayload(row.content)
  if (!source) return null
  const latitude = Number(row.latitude ?? source.latitude)
  const longitude = Number(row.longitude ?? source.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
  return {
    latitude,
    longitude,
    address: String(row.address ?? source.address ?? '位置消息'),
    name: source.name,
  }
}

function mediaPreviewUrl(row: AdminMessage) {
  const media = mediaOf(row)
  return mediaDisplayUrl(media?.thumbUrl || media?.url)
}

function mediaOriginalUrl(row: AdminMessage) {
  const media = mediaOf(row)
  // 列表优先使用已加载的原图；原图尚未加载时沿用缩略图，避免首屏为
  // 每条消息额外下载一份大文件。详情区域会主动加载原图。
  return cachedMediaDisplayUrl(media?.originalUrl || media?.url) || mediaPreviewUrl(row)
}

function mediaOriginalDisplayUrl(row: AdminMessage) {
  const media = mediaOf(row)
  return mediaDisplayUrl(media?.originalUrl || media?.url)
}

function isLocationMsg(row: AdminMessage) {
  return (row.msgType === 0 || row.msgType === 6) && !!parseLocation(row)
}

function parseLocationPayload(content?: string): LocationPayload | null {
  if (!content) return null
  try {
    const value = JSON.parse(content) as Record<string, unknown>
    const latitude = Number(value.latitude ?? value.lat)
    const longitude = Number(value.longitude ?? value.lng ?? value.lon)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
    const name = String(value.name || value.location || value.address || '位置消息')
    const address = String(value.address || value.location || value.name || '位置消息')
    return { latitude, longitude, name, address }
  } catch {
    return null
  }
}

function locationMapUrl(row: AdminMessage) {
  const location = parseLocation(row)
  if (!location) return ''
  const point = `${location.latitude},${location.longitude}`
  const title = location.name || location.address || '位置消息'
  return `https://api.map.baidu.com/marker?location=${encodeURIComponent(point)}&title=${encodeURIComponent(title)}&content=${encodeURIComponent(location.address)}&output=html&src=pulseim`
}

function parseWallet(row: Pick<AdminMessage, 'msgType' | 'content'> | ForwardCardItem): WalletPayload | null {
  if (row.msgType !== 7 && row.msgType !== 8) return null
  try {
    const raw = JSON.parse(row.content || '{}') as Record<string, unknown>
    if (!raw || typeof raw !== 'object') return null
    return {
      businessNo: raw.businessNo != null ? String(raw.businessNo) : undefined,
      packetType: raw.packetType != null ? String(raw.packetType) : undefined,
      greeting: raw.greeting != null ? String(raw.greeting) : undefined,
      totalCount: raw.totalCount == null ? undefined : Number(raw.totalCount),
      amount: raw.amount == null ? undefined : Number(raw.amount),
      remark: raw.remark != null ? String(raw.remark) : undefined,
      status: raw.status != null ? String(raw.status) : undefined,
    }
  } catch {
    return null
  }
}

function walletStatusText(status?: string) {
  return {
    ACTIVE: '领取中',
    PENDING: '待收款',
    FINISHED: '已领完',
    RECEIVED: '已收款',
    EXPIRED: '已过期',
    REFUNDED: '已退回',
    CANCELLED: '已取消',
  }[status || ''] || status || ''
}

function walletPacketType(packetType?: string) {
  return {
    PRIVATE: '单聊红包',
    NORMAL: '普通红包',
    LUCKY: '拼手气红包',
    EXCLUSIVE: '专属红包',
  }[packetType || ''] || '红包'
}

function walletAmountText(amount?: number) {
  const cents = Number(amount)
  return Number.isFinite(cents) && cents >= 0 ? `¥${(cents / 100).toFixed(2)}` : ''
}

function isWalletMsg(row: AdminMessage) {
  return row.msgType === 7 || row.msgType === 8
}

function walletCardClass(row: AdminMessage) {
  return row.msgType === 7 ? 'red-packet-message-card' : 'transfer-message-card'
}

function walletCardTitle(row: AdminMessage) {
  return row.msgType === 7 ? '红包' : '转账'
}

function walletCardSubtitle(row: AdminMessage | ForwardCardItem) {
  const wallet = parseWallet(row)
  if (!wallet) return row.msgType === 7 ? '红包消息' : '转账消息'
  const parts: string[] = []
  if (row.msgType === 7) {
    parts.push(walletPacketType(wallet.packetType))
    if (Number.isFinite(wallet.totalCount) && (wallet.totalCount || 0) > 0) {
      parts.push(`${wallet.totalCount}份`)
    }
    if (wallet.greeting) parts.push(wallet.greeting)
  } else {
    parts.push(walletAmountText(wallet.amount) || '金额待定')
    if (wallet.remark) parts.push(wallet.remark)
  }
  const status = walletStatusText(wallet.status)
  if (status) parts.push(status)
  return parts.join(' · ') || (row.msgType === 7 ? '红包消息' : '转账消息')
}

function parseContactCard(content?: string): ContactCardPayload | null {
  if (!content) return null
  try {
    const raw = JSON.parse(content) as ContactCardPayload & { title?: string; type?: string }
    const rawType = String(raw.cardType || raw.type || '').toLowerCase()
    const cardType: ContactCardPayload['cardType'] =
      rawType === 'community' ? 'community' : rawType === 'group' ? 'group' : 'user'
    if (cardType === 'community') {
      const communityId = raw.communityId != null ? String(raw.communityId) : ''
      return {
        cardType: 'community',
        communityId: communityId || undefined,
        nickname: raw.nickname || raw.title || '圈子',
        avatarUrl: resolveFileUrl(raw.avatarUrl || '') || undefined,
      }
    }
    if (cardType === 'group') {
      const conversationId = raw.conversationId != null ? String(raw.conversationId) : ''
      return {
        cardType: 'group',
        conversationId: conversationId || undefined,
        nickname: raw.nickname || raw.title || '群聊',
        avatarUrl: resolveFileUrl(raw.avatarUrl || '') || undefined,
      }
    }
    if (raw.userId == null || raw.userId === '') {
      // 容错：只要有昵称也展示为个人名片
      if (!raw.nickname && !raw.title) return null
    }
    return {
      cardType: 'user',
      userId: raw.userId != null ? String(raw.userId) : undefined,
      nickname: raw.nickname || raw.title || '用户',
      avatarUrl: resolveFileUrl(raw.avatarUrl || '') || undefined,
      pulseId: raw.pulseId,
    }
  } catch {
    return null
  }
}

function contactCardLabel(card: ContactCardPayload): string {
  if (card.cardType === 'community') return '圈子名片'
  return card.cardType === 'group' ? '群名片' : '个人名片'
}

function contactCardTagType(card: ContactCardPayload): 'success' | 'warning' | 'primary' {
  if (card.cardType === 'community') return 'success'
  return card.cardType === 'group' ? 'warning' : 'primary'
}

function contactCardPreview(card: ContactCardPayload): string {
  return `[${contactCardLabel(card)}] ${card.nickname}`
}

function contactCardOf(row: AdminMessage): ContactCardPayload | null {
  return row.msgType === 5 ? parseContactCard(row.content) : null
}

function isCardMsg(row: AdminMessage) {
  return row.msgType === 5 && !!contactCardOf(row)
}

function parseForwardCard(content?: string): ForwardCardPayload | null {
  if (!content) return null
  try {
    const raw = JSON.parse(content) as ForwardCardPayload
    if (!raw || !Array.isArray(raw.items)) return null
    return {
      title: raw.title || '聊天记录',
      sourceTitle: raw.sourceTitle,
      count: raw.count || raw.items.length,
      items: raw.items.map((it) => ({
        msgId: it.msgId,
        fromUserId: it.fromUserId != null ? String(it.fromUserId) : undefined,
        fromNickname: it.fromNickname,
        msgType: it.msgType ?? 0,
        fileId: it.fileId != null ? String(it.fileId) : undefined,
        file: it.file,
        content: it.content,
        createdAt: it.createdAt,
      })),
    }
  } catch {
    return null
  }
}

function forwardCardOf(row: AdminMessage): ForwardCardPayload | null {
  return row.msgType === 4 ? parseForwardCard(row.content) : null
}

function isForwardMsg(row: AdminMessage) {
  return row.msgType === 4 && !!forwardCardOf(row)
}

function forwardItemMedia(item: ForwardCardItem) {
  const file = item.file || (item.fileId
    ? { fileId: item.fileId, url: adminMessageFileUrl(item.fileId) }
    : undefined)
  return parseMedia(item.content, file)
}

function isLiveLocationContent(content?: string) {
  return !!content?.trim().startsWith('__PULSE_LIVE_LOCATION__')
}

function isLiveLocationMsg(row: AdminMessage) {
  return row.msgType === 0 && isLiveLocationContent(row.content)
}

function deleteModeLabel(row: AdminMessage) {
  if (!row.userDeleted) return ''
  return row.hideCount && row.hideCount > 1 ? '双向删除' : '单向删除'
}

function forwardItemPreview(item: ForwardCardItem): string {
  if (isLiveLocationContent(item.content)) return '[实时位置共享]'
  const location = parseLocationPayload(item.content)
  if ((item.msgType === 0 || item.msgType === 6) && location) {
    return `[位置] ${location.name || location.address}`
  }
  switch (item.msgType) {
    case 1:
      return '[图片]'
    case 2: {
      const m = forwardItemMedia(item)
      if (m && isVideoMedia(m.contentType, m.url || m.name)) return m.name || '[视频]'
      return m?.name ? `[文件] ${m.name}` : '[文件]'
    }
    case 3: {
      const m = forwardItemMedia(item)
      const dur = formatDuration(m?.durationMs)
      return dur ? `[语音 ${dur}]` : '[语音]'
    }
    case 4:
      return '[聊天记录]'
    case 5: {
      const card = parseContactCard(item.content)
      if (!card) return '[名片]'
      return contactCardPreview(card)
    }
    case 6:
      return '[位置]'
    case 9:
      return callTipText(item.content) || '[系统提示]'
    default:
      return item.content || '—'
  }
}

function forwardItemImageUrl(item: ForwardCardItem): string | undefined {
  if (item.msgType !== 1) return undefined
  const m = forwardItemMedia(item)
  const url = mediaDisplayUrl(m?.thumbUrl || m?.url)
  return url || undefined
}

function contentLabel(row: AdminMessage) {
  if (isLiveLocationContent(row.content)) return '[实时位置共享]'
  if (isLocationMsg(row)) {
    const location = parseLocation(row)
    return location ? `[位置] ${location.name || location.address}` : '[位置消息]'
  }
  const m = mediaOf(row)
  if (row.msgType === 1) return m?.name && m.name !== '文件' ? m.name : '[图片]'
  if (row.msgType === 2) {
    if (isVideoMsg(row)) return m?.name || '[视频]'
    return m?.name && m.name !== '文件' ? m.name : '[文件]'
  }
  if (isVoiceMsg(row)) {
    const dur = formatDuration(m?.durationMs)
    return dur ? `[语音 ${dur}]` : '[语音]'
  }
  if (row.msgType === 4) {
    const card = forwardCardOf(row)
    if (!card) return '[聊天记录]'
    return `[聊天记录] ${card.title}（${card.count}条）`
  }
  if (row.msgType === 5) {
    const card = contactCardOf(row)
    if (!card) return '[名片]'
    return contactCardPreview(card)
  }
  if (row.msgType === 6) {
    const location = parseLocation(row)
    return location ? `[位置] ${location.name || location.address}` : '[位置消息]'
  }
  if (row.msgType === 7 || row.msgType === 8) {
    try {
      const data = JSON.parse(row.content || '{}') as Record<string, unknown>
      const status = {
        ACTIVE: '领取中', PENDING: '待领取', FINISHED: '已领完', RECEIVED: '已收款',
        EXPIRED: '已过期', REFUNDED: '已退款', CANCELLED: '已取消',
      }[String(data.status)] || String(data.status || '')
      if (row.msgType === 7) {
        const packetType = {
          PRIVATE: '单聊红包', NORMAL: '普通红包', LUCKY: '拼手气红包', EXCLUSIVE: '专属红包',
        }[String(data.packetType)] || '红包'
        return `[${packetType}] ${String(data.greeting || '恭喜发财，大吉大利')}${status ? ` · ${status}` : ''}`
      }
      return `[转账] ¥${(Number(data.amount || 0) / 100).toFixed(2)}${data.remark ? ` · ${String(data.remark)}` : ''}${status ? ` · ${status}` : ''}`
    } catch {
      return row.msgType === 7 ? '[红包]' : '[转账]'
    }
  }
  if (row.msgType === 9) {
    const tip = callTipText(row.content)
    return tip.startsWith('通话') || tip.includes('拒绝') || tip.includes('取消') || tip.includes('未接')
      || tip.includes('忙线') || tip.includes('时长')
      ? `[语音通话] ${tip}`
      : tip
  }
  return row.msgType === 0
    ? readableTextContent(row.content)
    : row.content || row.contentPreview || '—'
}

function readableTextContent(content?: string) {
  const raw = content?.trim() || ''
  if (!raw) return '—'
  if (!raw.startsWith('{') && !raw.startsWith('[')) return content || '—'
  try {
    const value = JSON.parse(raw) as unknown
    if (typeof value === 'string') return value || '—'
    if (!value || typeof value !== 'object') return String(value)
    if (Array.isArray(value)) return '[结构化消息]'
    const obj = value as Record<string, unknown>
    for (const key of ['text', 'message', 'content', 'title', 'name']) {
      if (typeof obj[key] === 'string' && obj[key]) return obj[key] as string
    }
    const kind = obj.kind || obj.type
    return kind ? `系统事件：${String(kind)}` : '[结构化消息]'
  } catch {
    return content || '—'
  }
}

function statusText(row: AdminMessage) {
  const parts: string[] = []
  if (row.recalled) parts.push('已撤回')
  if (row.userDeleted) parts.push(deleteModeLabel(row))
  return parts.length ? parts.join(' · ') : '正常'
}

function callTipText(content?: string) {
  if (!content) return ''
  const raw = content.trim()
  if (!raw.startsWith('{')) return raw
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>
    const kind = String(obj.kind || '')
    if (obj?.kind === 'voice_call' || obj?.kind === 'video_call') {
      const text = String(obj.text || '')
      if (text) return text
      return kind === 'video_call' ? '视频通话已结束' : '语音通话已结束'
    }
    const actor = String(obj.actorName || '成员')
    const owner = String(obj.ownerName || '发送人')
    const target = String(obj.targetName || '成员')
    if (kind === 'red_packet_received') return `${actor}领取了${owner}的红包`
    if (kind === 'transfer_received') return `${actor}已收取${owner}的转账`
    if (kind === 'red_packet_expired') {
      return `红包已过期，未领取金额 ¥${(Number(obj.refundAmount || 0) / 100).toFixed(2)} 已退回`
    }
    if (kind === 'transfer_expired') {
      return `转账已过期，金额 ¥${(Number(obj.refundAmount || 0) / 100).toFixed(2)} 已退回`
    }
    if (kind === 'group_member_join') {
      if (obj.actorId != null) return `${actor}邀请${target}加入群聊`
      if (obj.source === 'qrcode') return `${target}通过扫描二维码加入群聊`
      if (obj.source === 'card') return `${target}通过群名片加入群聊`
      return `${target}加入群聊`
    }
    if (kind === 'group_member_kick') return `${actor}将${target}移出群聊`
    if (obj.text) return String(obj.text)
    if (kind) return `系统事件：${kind}`
    return '系统提示'
  } catch {
    return '系统提示（内容格式异常）'
  }
}

function openDetail(row: AdminMessage) {
  detailRow.value = row
  detailVisible.value = true
}

async function openContext(row: AdminMessage) {
  if (!row.conversationId) {
    ElMessage.warning('缺少会话信息')
    return
  }
  contextVisible.value = true
  contextLoading.value = true
  contextMessages.value = []
  contextAnchorId.value = row.id
  contextFocusUserId.value = row.fromUserId ?? null
  contextConversationId.value = row.conversationId
  contextTitle.value = row.conversationTitle || (isGroup.value ? '群聊' : '私聊')
  try {
    const data = await fetchMessageContext({
      conversationId: row.conversationId,
      anchorId: row.id,
      before: 30,
      after: 30,
    })
    contextMessages.value = data.list || []
    contextTitle.value = data.conversationTitle || contextTitle.value
    contextHasMoreBefore.value = !!data.hasMoreBefore
    contextHasMoreAfter.value = !!data.hasMoreAfter
    await nextTick()
    scrollToAnchor()
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载上下文失败')
    contextVisible.value = false
  } finally {
    contextLoading.value = false
  }
}

function scrollToAnchor() {
  const el = chatBodyRef.value?.querySelector('.is-anchor') as HTMLElement | null
  if (!el) {
    ElMessage.warning('未找到原消息')
    return
  }
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

async function loadEarlier() {
  if (!contextConversationId.value || !contextMessages.value.length || contextLoadingMore.value) return
  const beforeId = contextMessages.value[0].id
  const prevHeight = chatBodyRef.value?.scrollHeight || 0
  contextLoadingMore.value = true
  try {
    const data = await fetchMessageContext({
      conversationId: contextConversationId.value,
      beforeId,
      before: 30,
      after: 0,
    })
    const older = data.list || []
    if (older.length) {
      contextMessages.value = [...older, ...contextMessages.value]
      contextHasMoreBefore.value = !!data.hasMoreBefore
      await nextTick()
      if (chatBodyRef.value) {
        chatBodyRef.value.scrollTop = chatBodyRef.value.scrollHeight - prevHeight
      }
    } else {
      contextHasMoreBefore.value = false
    }
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载失败')
  } finally {
    contextLoadingMore.value = false
  }
}

async function loadLater() {
  if (!contextConversationId.value || !contextMessages.value.length || contextLoadingMore.value) return
  const afterId = contextMessages.value[contextMessages.value.length - 1].id
  contextLoadingMore.value = true
  try {
    const data = await fetchMessageContext({
      conversationId: contextConversationId.value,
      afterId,
      before: 0,
      after: 30,
    })
    const newer = data.list || []
    if (newer.length) {
      contextMessages.value = [...contextMessages.value, ...newer]
      contextHasMoreAfter.value = !!data.hasMoreAfter
    } else {
      contextHasMoreAfter.value = false
    }
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载失败')
  } finally {
    contextLoadingMore.value = false
  }
}

function isMine(row: AdminMessage) {
  if (row.msgType === 9 || row.fromUserId == null) return false
  if (contextFocusUserId.value == null) return false
  return row.fromUserId === contextFocusUserId.value
}

function isSystemMsg(row: AdminMessage) {
  return row.msgType === 9 || row.fromUserId == null
}

watch(conversationType, () => {
  query.page = 1
  loadMessages()
})

onMounted(loadMessages)

onBeforeUnmount(() => {
  for (const url of mediaBlobUrls.values()) URL.revokeObjectURL(url)
  mediaBlobUrls.clear()
  mediaLoadStates.clear()
})
</script>

<template>
  <div class="messages-page">
    <el-card shadow="never" class="toolbar-card">
      <el-form :inline="true" @submit.prevent="handleSearch">
        <el-form-item label="关键词">
          <el-input
            v-model="query.keyword"
            clearable
            :placeholder="isGroup ? '内容 / 群名 / 发送者' : '内容 / 发送者 / 会话ID'"
            style="width: 240px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item :label="isGroup ? '群 ID' : '会话 ID'">
          <el-input
            v-model.number="query.conversationId"
            clearable
            placeholder="ID"
            style="width: 120px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="发送者 ID">
          <el-input
            v-model.number="query.fromUserId"
            clearable
            placeholder="用户 ID"
            style="width: 120px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="query.msgType" clearable placeholder="全部" style="width: 130px">
            <el-option label="文本" :value="0" />
            <el-option label="图片" :value="1" />
            <el-option label="视频" value="video" />
            <el-option label="文件" value="file" />
            <el-option label="语音" :value="3" />
            <el-option label="合并转发" :value="4" />
            <el-option label="名片" :value="5" />
            <el-option label="位置" :value="6" />
            <el-option label="位置共享" value="live-location" />
            <el-option label="红包" :value="7" />
            <el-option label="转账" :value="8" />
            <el-option label="系统提示" :value="9" />
          </el-select>
        </el-form-item>
        <el-form-item label="撤回">
          <el-select v-model="query.recalled" clearable placeholder="全部" style="width: 110px">
            <el-option label="已撤回" :value="true" />
            <el-option label="未撤回" :value="false" />
          </el-select>
        </el-form-item>
        <el-form-item label="删除">
          <el-select v-model="query.userDeleted" clearable placeholder="全部" style="width: 110px">
            <el-option label="已删除" :value="true" />
            <el-option label="未删除" :value="false" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="table-card">
      <div class="batch-bar">
        <span class="batch-hint">已选 {{ selectedRows.length }} 条</span>
        <el-button
          type="danger"
          :disabled="!selectedRows.length"
          :loading="deleting"
          @click="handleBatchDelete"
        >删除选中</el-button>
        <el-button :disabled="!selectedRows.length" @click="clearSelection">取消选择</el-button>
        <div class="batch-spacer" />
        <el-button
          type="danger"
          plain
          :disabled="total <= 0"
          :loading="deleting"
          @click="handleClearAll"
        >一键删除全部{{ isGroup ? '群聊' : '私聊' }}记录</el-button>
      </div>
      <el-table
        ref="tableRef"
        v-loading="loading"
        :data="messages"
        stripe
        row-key="id"
        :empty-text="isGroup ? '暂无群聊记录' : '暂无私聊记录'"
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="48" reserve-selection />
        <el-table-column :label="isGroup ? '群聊' : '会话'" min-width="180">
          <template #default="{ row }">
            <div class="title">{{ row.conversationTitle || '—' }}</div>
            <div class="sub">ID {{ row.conversationId ?? '—' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="发送者" min-width="150">
          <template #default="{ row }">
            <div class="title">{{ row.fromNickname || '—' }}</div>
            <div class="sub">
              {{ row.fromPhone || '—' }}
              <template v-if="row.fromPulseId"> · {{ row.fromPulseId }}</template>
            </div>
          </template>
        </el-table-column>
        <el-table-column v-if="!isGroup" label="对方" min-width="140">
          <template #default="{ row }">
            <div class="title">{{ row.peerNickname || '—' }}</div>
            <div class="sub">{{ row.peerPhone || '—' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="消息类型" width="150">
          <template #default="{ row }">
            <div class="message-type-cell">
              <span>{{ msgTypeLabel(row.msgType, row) }}</span>
              <el-tag v-if="row.burnAfterRead" type="danger" size="small" effect="plain">阅后即焚</el-tag>
              <el-tag v-if="row.scheduledMessage" type="warning" size="small" effect="plain">定时消息</el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="内容" min-width="280">
          <template #default="{ row }">
            <div class="content-cell">
              <div v-if="row.recalled || row.userDeleted" class="status-badges">
                <el-tag v-if="row.recalled" type="info" size="small" effect="plain">已撤回</el-tag>
                <el-tag v-if="row.userDeleted" type="warning" size="small" effect="plain">{{ deleteModeLabel(row) }}</el-tag>
              </div>
              <div v-if="isLiveLocationMsg(row)" class="message-card location-message-card live-location-message-card">
                <el-icon class="location-share-icon"><LocationFilled /></el-icon>
                <div class="message-card-body">
                  <div class="title">位置共享</div>
                  <div class="sub">实时位置共享消息</div>
                </div>
              </div>
              <div v-else-if="isImageMsg(row)" class="media-cell">
                <el-image
                  v-if="mediaPreviewUrl(row)"
                  class="thumb"
                  :src="mediaPreviewUrl(row)"
                  fit="cover"
                  lazy
                  :preview-src-list="mediaOriginalUrl(row) ? [mediaOriginalUrl(row)] : []"
                  preview-teleported
                />
                <button
                  v-else
                  type="button"
                  class="media-placeholder thumb"
                  @click="retryMedia(mediaOf(row)!.thumbUrl || mediaOf(row)!.url)"
                >{{ mediaLoadText(mediaOf(row)!.thumbUrl || mediaOf(row)!.url) }}</button>
                <span class="media-name">{{ contentLabel(row) }}</span>
              </div>
              <div v-else-if="isVideoMsg(row)" class="media-cell">
                <video
                  v-if="mediaDisplayUrl(mediaOf(row)!.url)"
                  class="thumb video-thumb"
                  :src="mediaDisplayUrl(mediaOf(row)!.url)"
                  :poster="mediaDisplayUrl(mediaOf(row)!.thumbUrl)"
                  muted
                  preload="none"
                />
                <button
                  v-else
                  type="button"
                  class="media-placeholder thumb"
                  @click="retryMedia(mediaOf(row)!.url)"
                >{{ mediaLoadText(mediaOf(row)!.url) }}</button>
                <div class="media-meta">
                  <div>{{ contentLabel(row) }}</div>
                  <button type="button" class="link link-button" @click="openMedia(mediaOf(row)!.url)">打开视频</button>
                </div>
              </div>
              <div v-else-if="isVoiceMsg(row)" class="media-cell voice-cell">
                <audio
                  v-if="mediaDisplayUrl(mediaOf(row)!.url)"
                  class="audio-mini"
                  :src="mediaDisplayUrl(mediaOf(row)!.url)"
                  controls
                  preload="metadata"
                />
                <button
                  v-else
                  type="button"
                  class="media-placeholder audio-mini"
                  @click="retryMedia(mediaOf(row)!.url)"
                >{{ mediaLoadText(mediaOf(row)!.url) }}</button>
                <span class="media-name">{{ contentLabel(row) }}</span>
              </div>
              <div v-else-if="isFileMsg(row)" class="media-cell">
                <div class="media-meta">
                  <div class="file-name">{{ mediaOf(row)!.name }}</div>
                  <div class="sub">
                    {{ formatSize(mediaOf(row)!.size) }}
                    <template v-if="mediaOf(row)!.contentType"> · {{ mediaOf(row)!.contentType }}</template>
                  </div>
                  <button type="button" class="link link-button" @click="openMedia(mediaOf(row)!.url)">下载 / 打开</button>
                </div>
              </div>
              <div v-else-if="isWalletMsg(row)" class="message-card wallet-message-card" :class="walletCardClass(row)">
                <el-icon class="wallet-icon">
                  <Present v-if="row.msgType === 7" />
                  <Money v-else />
                </el-icon>
                <div class="message-card-body">
                  <div class="title">{{ walletCardTitle(row) }}</div>
                  <div class="sub">{{ walletCardSubtitle(row) }}</div>
                </div>
              </div>
              <div v-else-if="isCardMsg(row)" class="message-card contact-message-card">
                <AdminAvatar :size="36" :url="contactCardOf(row)!.avatarUrl">
                  {{ (contactCardOf(row)!.nickname || '?').slice(0, 1) }}
                </AdminAvatar>
                <div class="card-meta">
                  <div class="title">{{ contactCardOf(row)!.nickname }}</div>
                  <div class="sub">
                    <el-tag size="small" effect="plain" :type="contactCardTagType(contactCardOf(row)!)">
                      {{ contactCardLabel(contactCardOf(row)!) }}
                    </el-tag>
                    <span v-if="contactCardOf(row)!.cardType === 'group' && contactCardOf(row)!.conversationId">
                      · 群 ID {{ contactCardOf(row)!.conversationId }}
                    </span>
                    <span v-else-if="contactCardOf(row)!.cardType === 'community' && contactCardOf(row)!.communityId">
                      · 圈子 ID {{ contactCardOf(row)!.communityId }}
                    </span>
                    <span v-else-if="contactCardOf(row)!.userId">
                      · 用户 ID {{ contactCardOf(row)!.userId }}
                      <template v-if="contactCardOf(row)!.pulseId"> · {{ contactCardOf(row)!.pulseId }}</template>
                    </span>
                  </div>
                </div>
              </div>
              <div v-else-if="isLocationMsg(row)" class="message-card location-message-card">
                <el-icon class="location-share-icon"><LocationFilled /></el-icon>
                <div class="message-card-body">
                  <div class="title">{{ parseLocation(row)!.name || parseLocation(row)!.address }}</div>
                  <div class="sub">{{ parseLocation(row)!.address }}</div>
                </div>
                <a class="link location-link" :href="locationMapUrl(row)" target="_blank" rel="noopener noreferrer">
                  查看地图
                </a>
              </div>
              <div v-else-if="isForwardMsg(row)" class="forward-cell">
                <div class="fwd-title">{{ forwardCardOf(row)!.title }}</div>
                <div class="sub">
                  共 {{ forwardCardOf(row)!.count }} 条
                  <template v-if="forwardCardOf(row)!.sourceTitle">
                    · 来自 {{ forwardCardOf(row)!.sourceTitle }}
                  </template>
                </div>
                <div
                  v-for="(it, idx) in forwardCardOf(row)!.items.slice(0, 3)"
                  :key="it.msgId || idx"
                  class="fwd-line"
                >
                  <span class="fwd-name">{{ it.fromNickname || '用户' }}：</span>
                  <span class="fwd-text">{{ forwardItemPreview(it) }}</span>
                </div>
                <div v-if="forwardCardOf(row)!.items.length > 3" class="sub">…</div>
              </div>
              <span v-else class="text-preview">{{ contentLabel(row) }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="140">
          <template #default="{ row }">
            <div class="status-col">
              <el-tag
                v-if="!row.recalled && !row.userDeleted"
                type="success"
                size="small"
                effect="plain"
              >正常</el-tag>
              <el-tag v-if="row.recalled" type="info" size="small" effect="plain">已撤回</el-tag>
              <el-tag v-if="row.userDeleted" type="warning" size="small" effect="plain">
                {{ row.hideCount && row.hideCount > 1 ? `已删除×${row.hideCount}` : '已删除' }}
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="170">
          <template #default="{ row }">{{ formatTime(row.sendTime) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openContext(row)">查看上下文</el-button>
            <el-button link type="primary" @click="openDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.size"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          background
          @current-change="loadMessages"
          @size-change="() => { query.page = 1; loadMessages() }"
        />
      </div>
    </el-card>

    <el-dialog
      v-model="detailVisible"
      :title="isGroup ? '群聊消息详情' : '私聊消息详情'"
      width="720px"
      destroy-on-close
    >
      <template v-if="detailRow">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="消息 ID" :span="2">{{ detailRow.msgId || detailRow.id }}</el-descriptions-item>
          <el-descriptions-item :label="isGroup ? '群聊' : '会话'" :span="2">
            {{ detailRow.conversationTitle || '—' }}（ID {{ detailRow.conversationId }}）
          </el-descriptions-item>
          <el-descriptions-item label="发送者">
            {{ detailRow.fromNickname || '—' }}
            <template v-if="detailRow.fromPhone">（{{ detailRow.fromPhone }}）</template>
          </el-descriptions-item>
          <el-descriptions-item v-if="!isGroup" label="对方">
            {{ detailRow.peerNickname || '—' }}
            <template v-if="detailRow.peerPhone">（{{ detailRow.peerPhone }}）</template>
          </el-descriptions-item>
          <el-descriptions-item label="类型">
            <div class="message-type-cell">
              <span>{{ msgTypeLabel(detailRow.msgType, detailRow) }}</span>
              <el-tag v-if="detailRow.burnAfterRead" type="danger" size="small" effect="plain">阅后即焚</el-tag>
              <el-tag v-if="detailRow.autoDeleteExpiresAt" type="success" size="small" effect="plain">自动删除</el-tag>
            </div>
          </el-descriptions-item>
          <el-descriptions-item label="状态">{{ statusText(detailRow) }}</el-descriptions-item>
          <el-descriptions-item label="时间" :span="2">{{ formatTime(detailRow.sendTime) }}</el-descriptions-item>
          <el-descriptions-item label="内容" :span="2">
            <div v-if="detailRow.recalled || detailRow.userDeleted" class="status-badges detail-badges">
              <el-tag v-if="detailRow.recalled" type="info" size="small" effect="plain">已撤回</el-tag>
              <el-tag v-if="detailRow.userDeleted" type="warning" size="small" effect="plain">{{ deleteModeLabel(detailRow) }}</el-tag>
              <el-tag v-if="detailRow.burnAfterRead" type="danger" size="small" effect="plain">阅后即焚</el-tag>
              <el-tag v-if="detailRow.autoDeleteExpiresAt" type="success" size="small" effect="plain">自动删除</el-tag>
            </div>
            <div v-if="isLiveLocationMsg(detailRow)" class="message-card location-message-card live-location-message-card">
              <el-icon class="location-share-icon"><LocationFilled /></el-icon>
              <div class="message-card-body">
                <div class="file-name">位置共享</div>
                <div class="sub">实时位置共享消息</div>
              </div>
            </div>
            <div v-else-if="isImageMsg(detailRow)" class="detail-media">
              <el-image
                v-if="mediaOriginalDisplayUrl(detailRow)"
                class="detail-image"
                :src="mediaOriginalDisplayUrl(detailRow)"
                fit="contain"
                :preview-src-list="[mediaOriginalDisplayUrl(detailRow)]"
                preview-teleported
              />
              <button
                v-else
                type="button"
                class="media-placeholder detail-image"
                @click="retryMedia(mediaOf(detailRow)!.originalUrl || mediaOf(detailRow)!.url)"
              >{{ mediaLoadText(mediaOf(detailRow)!.originalUrl || mediaOf(detailRow)!.url) }}</button>
              <button
                type="button"
                class="link link-button"
                @click="openMedia(mediaOf(detailRow)!.originalUrl || mediaOf(detailRow)!.url)"
              >原图链接</button>
            </div>
            <div v-else-if="isVideoMsg(detailRow)" class="detail-media">
              <video
                v-if="mediaOriginalDisplayUrl(detailRow)"
                class="detail-video"
                :src="mediaOriginalDisplayUrl(detailRow)"
                controls
                preload="metadata"
              />
              <button
                v-else
                type="button"
                class="media-placeholder detail-video"
                @click="retryMedia(mediaOf(detailRow)!.url)"
              >{{ mediaLoadText(mediaOf(detailRow)!.url) }}</button>
              <div class="detail-file-meta">
                <div>{{ mediaOf(detailRow)!.name }}</div>
                <div class="sub">
                  {{ formatSize(mediaOf(detailRow)!.size) }}
                  <template v-if="mediaOf(detailRow)!.contentType"> · {{ mediaOf(detailRow)!.contentType }}</template>
                </div>
                <button type="button" class="link link-button" @click="openMedia(mediaOf(detailRow)!.url)">新窗口打开</button>
              </div>
            </div>
            <div v-else-if="isVoiceMsg(detailRow)" class="detail-media">
              <audio
                v-if="mediaDisplayUrl(mediaOf(detailRow)!.url)"
                class="detail-audio"
                :src="mediaDisplayUrl(mediaOf(detailRow)!.url)"
                controls
                preload="metadata"
              />
              <button
                v-else
                type="button"
                class="media-placeholder detail-audio"
                @click="retryMedia(mediaOf(detailRow)!.url)"
              >{{ mediaLoadText(mediaOf(detailRow)!.url) }}</button>
              <div class="detail-file-meta">
                <div>时长：{{ formatDuration(mediaOf(detailRow)!.durationMs) || '—' }}</div>
                <div v-if="mediaOf(detailRow)!.transcript" class="transcript">
                  转写：{{ mediaOf(detailRow)!.transcript }}
                </div>
                <button type="button" class="link link-button" @click="openMedia(mediaOf(detailRow)!.url)">下载语音</button>
              </div>
            </div>
            <div v-else-if="isFileMsg(detailRow)" class="detail-media">
              <div class="detail-file-meta">
                <div class="file-name">{{ mediaOf(detailRow)!.name }}</div>
                <div class="sub">
                  {{ formatSize(mediaOf(detailRow)!.size) }}
                  <template v-if="mediaOf(detailRow)!.contentType"> · {{ mediaOf(detailRow)!.contentType }}</template>
                </div>
                <button type="button" class="link link-button" @click="openMedia(mediaOf(detailRow)!.url)">下载 / 打开</button>
              </div>
            </div>
            <div v-else-if="isWalletMsg(detailRow)" class="message-card wallet-message-card detail-wallet-card" :class="walletCardClass(detailRow)">
              <el-icon class="wallet-icon">
                <Present v-if="detailRow.msgType === 7" />
                <Money v-else />
              </el-icon>
              <div class="message-card-body">
                <div class="file-name">{{ walletCardTitle(detailRow) }}</div>
                <div class="sub">{{ walletCardSubtitle(detailRow) }}</div>
              </div>
            </div>
            <div v-else-if="isCardMsg(detailRow)" class="message-card contact-message-card detail-card">
              <AdminAvatar :size="56" :url="contactCardOf(detailRow)!.avatarUrl">
                {{ (contactCardOf(detailRow)!.nickname || '?').slice(0, 1) }}
              </AdminAvatar>
              <div class="detail-card-meta">
                <div class="file-name">{{ contactCardOf(detailRow)!.nickname }}</div>
                <div class="sub">
                  <el-tag
                    size="small"
                    effect="plain"
                    :type="contactCardTagType(contactCardOf(detailRow)!)"
                  >
                    {{ contactCardLabel(contactCardOf(detailRow)!) }}
                  </el-tag>
                </div>
                <div v-if="contactCardOf(detailRow)!.cardType === 'group'" class="sub">
                  群 ID：{{ contactCardOf(detailRow)!.conversationId || '—' }}
                </div>
                <div v-else-if="contactCardOf(detailRow)!.cardType === 'community'" class="sub">
                  圈子 ID：{{ contactCardOf(detailRow)!.communityId || '—' }}
                </div>
                <template v-else>
                  <div class="sub">用户 ID：{{ contactCardOf(detailRow)!.userId || '—' }}</div>
                  <div v-if="contactCardOf(detailRow)!.pulseId" class="sub">
                    PulseID：{{ contactCardOf(detailRow)!.pulseId }}
                  </div>
                </template>
              </div>
            </div>
            <div v-else-if="isLocationMsg(detailRow)" class="message-card location-message-card detail-location">
              <el-icon class="location-share-icon"><LocationFilled /></el-icon>
              <div class="message-card-body">
                <div class="file-name">
                  {{ parseLocation(detailRow)!.name || parseLocation(detailRow)!.address }}
                </div>
                <div class="sub">{{ parseLocation(detailRow)!.address }}</div>
              </div>
              <a
                class="link location-link"
                :href="locationMapUrl(detailRow)"
                target="_blank"
                rel="noopener noreferrer"
              >查看地图</a>
            </div>
            <div v-else-if="isForwardMsg(detailRow)" class="detail-forward">
              <div class="fwd-title">{{ forwardCardOf(detailRow)!.title }}</div>
              <div class="sub">
                共 {{ forwardCardOf(detailRow)!.count }} 条
                <template v-if="forwardCardOf(detailRow)!.sourceTitle">
                  · 来自 {{ forwardCardOf(detailRow)!.sourceTitle }}
                </template>
              </div>
              <div class="fwd-list">
                <div
                  v-for="(it, idx) in forwardCardOf(detailRow)!.items"
                  :key="it.msgId || idx"
                  class="fwd-item"
                >
                  <div class="fwd-item-top">
                    <span class="fwd-name">{{ it.fromNickname || '用户' }}</span>
                    <span class="sub">{{ formatTime(it.createdAt) }}</span>
                  </div>
                  <el-image
                    v-if="forwardItemImageUrl(it)"
                    class="fwd-image"
                    :src="forwardItemImageUrl(it)"
                    fit="cover"
                    lazy
                    :preview-src-list="[forwardItemImageUrl(it)!]"
                    preview-teleported
                  />
                  <div v-else class="fwd-text">{{ forwardItemPreview(it) }}</div>
                </div>
              </div>
            </div>
            <pre v-else class="content-pre">{{
              contentLabel(detailRow)
            }}</pre>
          </el-descriptions-item>
        </el-descriptions>
      </template>
    </el-dialog>

    <el-dialog
      v-model="contextVisible"
      :title="contextTitle || '查看上下文'"
      width="520px"
      top="4vh"
      destroy-on-close
      class="context-dialog"
      :close-on-click-modal="false"
    >
      <div v-loading="contextLoading" class="chat-window">
        <div class="chat-header-sub">
          会话 ID {{ contextConversationId ?? '—' }}
          <span v-if="contextFocusUserId"> · 右侧为定位消息发送者</span>
        </div>
        <div ref="chatBodyRef" class="chat-body">
          <div v-if="contextHasMoreBefore" class="chat-load-more">
            <el-button
              text
              type="primary"
              size="small"
              :loading="contextLoadingMore"
              @click="loadEarlier"
            >加载更早消息</el-button>
          </div>
          <div v-else-if="contextMessages.length" class="chat-end-tip">没有更早的消息了</div>

          <template v-for="row in contextMessages" :key="row.id">
            <div
              v-if="isSystemMsg(row)"
              class="chat-system"
              :class="{ 'is-anchor': row.id === contextAnchorId }"
            >
              <span>{{ contentLabel(row) }}</span>
              <span class="chat-time">{{ formatTime(row.sendTime) }}</span>
            </div>
            <div
              v-else
              class="chat-row"
              :class="{
                mine: isMine(row),
                'is-anchor': row.id === contextAnchorId,
              }"
            >
              <AdminAvatar class="chat-avatar" :size="36" :url="row.fromAvatarUrl">
                {{ (row.fromNickname || '?').slice(0, 1) }}
              </AdminAvatar>
              <div class="chat-main">
                <div class="chat-meta">
                  <span class="chat-name">{{ row.fromNickname || '未知用户' }}</span>
                   <span class="chat-time">{{ formatTime(row.sendTime) }}</span>
                   <el-tag v-if="row.recalled" size="small" type="info" effect="plain">已撤回</el-tag>
                   <el-tag v-if="row.userDeleted" size="small" type="warning" effect="plain">{{ deleteModeLabel(row) }}</el-tag>
                   <el-tag v-if="row.burnAfterRead" size="small" type="danger" effect="plain">阅后即焚</el-tag>
                   <el-tag v-if="row.autoDeleteExpiresAt" size="small" type="success" effect="plain">自动删除</el-tag>
                 </div>
                <div class="chat-bubble">
                  <template v-if="isLiveLocationMsg(row)">
                    <div class="message-card chat-location live-location-message-card">
                      <el-icon class="location-share-icon"><LocationFilled /></el-icon>
                      <div class="message-card-body">
                        <div class="title">位置共享</div>
                        <div class="sub">实时位置共享消息</div>
                      </div>
                    </div>
                  </template>
                  <template v-else-if="isImageMsg(row)">
                    <el-image
                      v-if="mediaPreviewUrl(row)"
                      class="chat-image"
                      :src="mediaPreviewUrl(row)"
                      fit="cover"
                      lazy
                      :preview-src-list="mediaOriginalUrl(row) ? [mediaOriginalUrl(row)] : []"
                      preview-teleported
                    />
                    <button
                      v-else
                      type="button"
                      class="media-placeholder chat-image"
                      @click="retryMedia(mediaOf(row)!.thumbUrl || mediaOf(row)!.url)"
                    >{{ mediaLoadText(mediaOf(row)!.thumbUrl || mediaOf(row)!.url) }}</button>
                  </template>
                  <template v-else-if="isVideoMsg(row)">
                    <video
                      v-if="mediaDisplayUrl(mediaOf(row)!.url)"
                      class="chat-video"
                      :src="mediaDisplayUrl(mediaOf(row)!.url)"
                      :poster="mediaDisplayUrl(mediaOf(row)!.thumbUrl)"
                      controls
                      preload="none"
                    />
                    <button
                      v-else
                      type="button"
                      class="media-placeholder chat-video"
                      @click="retryMedia(mediaOf(row)!.url)"
                    >{{ mediaLoadText(mediaOf(row)!.url) }}</button>
                  </template>
                  <template v-else-if="isVoiceMsg(row)">
                    <audio
                      v-if="mediaDisplayUrl(mediaOf(row)!.url)"
                      class="chat-audio"
                      :src="mediaDisplayUrl(mediaOf(row)!.url)"
                      controls
                      preload="metadata"
                    />
                    <button
                      v-else
                      type="button"
                      class="media-placeholder chat-audio"
                      @click="retryMedia(mediaOf(row)!.url)"
                    >{{ mediaLoadText(mediaOf(row)!.url) }}</button>
                    <div class="chat-caption">{{ contentLabel(row) }}</div>
                  </template>
                  <template v-else-if="isFileMsg(row)">
                    <div class="chat-file">
                      <div class="file-name">{{ mediaOf(row)!.name }}</div>
                      <div class="sub">{{ formatSize(mediaOf(row)!.size) }}</div>
                      <button type="button" class="link link-button" @click="openMedia(mediaOf(row)!.url)">打开</button>
                    </div>
                  </template>
                  <template v-else-if="isWalletMsg(row)">
                    <div class="message-card wallet-message-card" :class="walletCardClass(row)">
                      <el-icon class="wallet-icon">
                        <Present v-if="row.msgType === 7" />
                        <Money v-else />
                      </el-icon>
                      <div class="message-card-body">
                        <div class="title">{{ walletCardTitle(row) }}</div>
                        <div class="sub">{{ walletCardSubtitle(row) }}</div>
                      </div>
                    </div>
                  </template>
                  <template v-else-if="isCardMsg(row)">
                    <div class="message-card chat-card contact-message-card">
                      <AdminAvatar :size="32" :url="contactCardOf(row)!.avatarUrl">
                        {{ (contactCardOf(row)!.nickname || '?').slice(0, 1) }}
                      </AdminAvatar>
                      <div>
                        <div class="title">{{ contactCardOf(row)!.nickname }}</div>
                        <div class="sub">
                          {{ contactCardLabel(contactCardOf(row)!) }}
                        </div>
                      </div>
                    </div>
                  </template>
                  <template v-else-if="isLocationMsg(row)">
                    <div class="message-card chat-location location-message-card">
                      <el-icon class="location-share-icon"><LocationFilled /></el-icon>
                      <div class="message-card-body">
                        <div class="title">{{ parseLocation(row)!.name || parseLocation(row)!.address }}</div>
                        <div class="sub">{{ parseLocation(row)!.address }}</div>
                      </div>
                      <a
                        class="link location-link"
                        :href="locationMapUrl(row)"
                        target="_blank"
                        rel="noopener noreferrer"
                      >查看地图</a>
                    </div>
                  </template>
                  <template v-else-if="isForwardMsg(row)">
                    <button type="button" class="chat-forward chat-forward-clickable" @click="openDetail(row)">
                      <div class="fwd-title">{{ forwardCardOf(row)!.title }}</div>
                      <div class="sub">共 {{ forwardCardOf(row)!.count }} 条</div>
                      <div
                        v-for="(it, idx) in forwardCardOf(row)!.items.slice(0, 4)"
                        :key="it.msgId || idx"
                        class="fwd-line"
                      >
                        <span class="fwd-name">{{ it.fromNickname || '用户' }}：</span>
                        <span>{{ forwardItemPreview(it) }}</span>
                      </div>
                      <div v-if="forwardCardOf(row)!.items.length > 4" class="sub">…</div>
                      <div class="chat-forward-open">点击查看完整聊天记录</div>
                    </button>
                  </template>
                  <template v-else>
                    <div class="chat-text">{{ contentLabel(row) }}</div>
                  </template>
                </div>
              </div>
            </div>
          </template>

          <div v-if="!contextLoading && !contextMessages.length" class="chat-empty">暂无消息</div>

          <div v-if="contextHasMoreAfter" class="chat-load-more">
            <el-button
              text
              type="primary"
              size="small"
              :loading="contextLoadingMore"
              @click="loadLater"
            >加载更新消息</el-button>
          </div>
          <div v-else-if="contextMessages.length" class="chat-end-tip">没有更新的消息了</div>
        </div>
      </div>
      <template #footer>
        <el-button @click="contextVisible = false">关闭</el-button>
        <el-button type="primary" @click="scrollToAnchor">定位到原消息</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.messages-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.batch-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.batch-spacer {
  flex: 1;
  min-width: 12px;
}

.batch-hint {
  font-size: 13px;
  color: #606266;
  margin-right: 4px;
}

.toolbar-card,
.table-card {
  border-radius: 12px;
}

.toolbar-card :deep(.el-card__body) {
  padding-bottom: 2px;
}

.title {
  font-weight: 600;
  color: #303133;
  line-height: 1.3;
}

.sub {
  margin-top: 2px;
  font-size: 12px;
  color: #909399;
}

.message-type-cell {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.recalled {
  color: #909399;
  font-style: italic;
}

.content-cell {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.status-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.detail-badges {
  margin-bottom: 10px;
}

.status-col {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.text-preview {
  color: #303133;
  word-break: break-word;
}

.media-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.media-placeholder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 6px;
  border: 1px solid #e5e7eb;
  color: #909399;
  background: #f5f7fa;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  line-height: 1.35;
  text-align: center;
}

.media-placeholder:hover {
  color: #409eff;
  border-color: #b3d8ff;
}

.card-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.card-meta {
  min-width: 0;
}

.card-meta .sub {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}

.forward-cell,
.chat-forward,
.detail-forward {
  min-width: 0;
}

.chat-forward-clickable {
  width: 100%;
  border: 0;
  padding: 0;
  text-align: inherit;
  cursor: pointer;
  background: transparent;
}

.chat-forward-clickable:hover .fwd-title {
  color: #409eff;
}

.chat-forward-open {
  margin-top: 8px;
  color: #409eff;
  font-size: 12px;
}

.location-cell,
.detail-location,
.chat-location {
  display: flex;
  align-items: center;
  gap: 8px;
}

.location-share-icon {
  color: #409eff;
  flex-shrink: 0;
}

.message-card {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  max-width: 100%;
  padding: 10px 12px;
  box-sizing: border-box;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
}

.message-card-body {
  flex: 1;
  min-width: 0;
}

.message-card-body .title,
.message-card-body .file-name {
  font-weight: 600;
  color: #303133;
  line-height: 1.35;
}

.message-card-body .sub {
  margin-top: 4px;
  line-height: 1.45;
}

.contact-message-card {
  min-width: 220px;
}

.location-message-card {
  align-items: flex-start;
  min-width: 250px;
  background: #eff6ff;
  border-color: #bfdbfe;
}

.location-message-card .location-share-icon {
  margin-top: 1px;
  padding: 5px;
  border-radius: 50%;
  background: #dbeafe;
}

.location-link {
  align-self: center;
  flex-shrink: 0;
  white-space: nowrap;
}

.live-location-message-card {
  background: rgba(64, 158, 255, 0.08);
}

.wallet-message-card {
  align-items: flex-start;
  min-width: 230px;
}

.wallet-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  padding: 5px;
  border-radius: 50%;
  font-size: 24px;
}

.red-packet-message-card {
  background: #fff7ed;
  border-color: #fed7aa;
}

.red-packet-message-card .wallet-icon {
  color: #ea580c;
  background: #ffedd5;
}

.transfer-message-card {
  background: #f0fdf4;
  border-color: #bbf7d0;
}

.transfer-message-card .wallet-icon {
  color: #16a34a;
  background: #dcfce7;
}

.detail-wallet-card {
  min-width: 280px;
}

.live-location-card {
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(64, 158, 255, 0.08);
}

.fwd-title {
  font-weight: 600;
  color: #303133;
  line-height: 1.3;
}

.fwd-line {
  margin-top: 4px;
  font-size: 12px;
  color: #606266;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fwd-name {
  color: #909399;
}

.fwd-text {
  color: #303133;
  word-break: break-word;
  white-space: pre-wrap;
}

.detail-forward {
  width: 100%;
}

.fwd-list {
  margin-top: 12px;
  max-height: 360px;
  overflow: auto;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  background: #fafafa;
}

.fwd-item {
  padding: 10px 12px;
  border-bottom: 1px solid #ebeef5;
}

.fwd-item:last-child {
  border-bottom: none;
}

.fwd-item-top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.fwd-image {
  width: 120px;
  height: 120px;
  border-radius: 6px;
  overflow: hidden;
}

.detail-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.detail-card-meta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.voice-cell {
  flex-wrap: wrap;
}

.thumb {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  flex-shrink: 0;
  background: #f2f3f5;
  object-fit: cover;
}

.video-thumb {
  object-fit: cover;
}

.media-meta,
.media-name {
  min-width: 0;
  font-size: 13px;
  color: #303133;
}

.file-name {
  font-weight: 600;
  word-break: break-all;
}

.audio-mini {
  width: 180px;
  height: 32px;
}

.link {
  color: #3b82f6;
  text-decoration: none;
  font-size: 12px;
}

.link-button {
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  font: inherit;
}

.link:hover {
  text-decoration: underline;
}

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.detail-media {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.detail-image {
  width: 100%;
  max-height: 360px;
  border-radius: 8px;
  background: #f5f7fa;
}

.detail-video {
  width: 100%;
  max-height: 360px;
  border-radius: 8px;
  background: #000;
}

.detail-audio {
  width: 100%;
}

.detail-file-meta {
  font-size: 13px;
  color: #303133;
  line-height: 1.5;
}

.transcript {
  margin-top: 4px;
  color: #606266;
}

.content-pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.5;
  max-height: 320px;
  overflow: auto;
}

.chat-window {
  min-height: 420px;
}

.chat-header-sub {
  margin: -4px 0 10px;
  font-size: 12px;
  color: #909399;
}

.chat-body {
  height: min(68vh, 640px);
  overflow-y: auto;
  padding: 14px 12px;
  border-radius: 12px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0.2)),
    radial-gradient(circle at 20% 0%, #e8f1ff 0%, transparent 45%),
    radial-gradient(circle at 90% 20%, #f3f4f6 0%, transparent 40%),
    #f5f7fb;
  border: 1px solid #ebeef5;
}

.chat-load-more,
.chat-end-tip,
.chat-empty {
  text-align: center;
  padding: 8px 0;
  color: #909399;
  font-size: 12px;
}

.chat-system {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin: 10px 0;
  font-size: 12px;
  color: #909399;
}

.chat-row {
  display: flex;
  gap: 10px;
  margin: 12px 0;
  align-items: flex-start;
  max-width: 100%;
}

.chat-row.mine {
  flex-direction: row-reverse;
}

.chat-row.is-anchor .chat-bubble {
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.45);
}

.chat-system.is-anchor {
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(59, 130, 246, 0.1);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.45);
}

.chat-avatar {
  flex-shrink: 0;
  background: #dbe3f0;
}

.chat-main {
  max-width: calc(100% - 52px);
  min-width: 0;
}

.chat-row.mine .chat-main {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.chat-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  font-size: 12px;
  color: #909399;
}

.chat-row.mine .chat-meta {
  flex-direction: row-reverse;
}

.chat-name {
  color: #606266;
  font-weight: 600;
}

.chat-bubble {
  display: inline-block;
  max-width: 100%;
  padding: 10px 12px;
  border-radius: 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  word-break: break-word;
}

.chat-row.mine .chat-bubble {
  background: #dbeafe;
  border-color: #bfdbfe;
}

.chat-text {
  font-size: 14px;
  line-height: 1.5;
  color: #1f2937;
  white-space: pre-wrap;
}

.chat-image {
  width: 180px;
  max-width: 100%;
  height: 180px;
  border-radius: 8px;
  overflow: hidden;
}

.chat-video {
  width: 220px;
  max-width: 100%;
  border-radius: 8px;
  background: #000;
}

.chat-audio {
  width: 220px;
  max-width: 100%;
}

.chat-caption {
  margin-top: 6px;
  font-size: 12px;
  color: #606266;
}

.chat-file .file-name,
.chat-card .title {
  font-weight: 600;
  color: #303133;
}

.chat-card {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 160px;
}
</style>

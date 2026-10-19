<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast, showImagePreview, showConfirmDialog } from 'vant'
import {
  deleteMessages,
  forwardMessages,
  searchMessages,
  fetchLocatableMessage,
  addFavorite,
  fetchFavorites,
  parseFilePayload,
  parseContactCard,
  type ChatMessage,
} from '@/api/message'
import { fetchFileMetadata, fileDownloadUrl, resolveFileUrl } from '@/api/file'
import {
  fetchConversations,
  fetchGroupDetail,
  roleLabel,
  type ConversationItem,
  type GroupMember,
} from '@/api/conversation'
import { fetchContacts } from '@/api/contact'
import { useUserStore, parseUserIdFromToken } from '@/stores/user'
import { isVideoMedia, saveMediaToDevice, toastForSaveResult } from '@/utils/saveMedia'
import { formatFileSize } from '@/utils/media'
import { openMediaVideoPreview } from '@/composables/useMediaVideoPreview'
import { openFilePreview } from '@/composables/useFilePreview'
import { cacheChatFile, getStableChatFileUrl } from '@/utils/fileCache'
import { getToken } from '@/api/http'
import { smartBack } from '@/utils/navBack'

type TabKey = 'all' | 'messages' | 'members'
type FilterKey = 'date' | 'media' | 'file' | 'contact'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const conversationId = computed(() => route.params.id as string)
const title = computed(() => (route.query.title as string) || '聊天')
const chatType = computed(() => (route.query.type as string) || 'personal')
const isGroup = computed(() => chatType.value === 'group')
/** messages = 仅聊天记录；all/默认 = 群聊可搜记录+成员 */
const scope = computed(() => (route.query.scope as string) || 'all')
const messagesOnly = computed(() => scope.value === 'messages' || !isGroup.value)
const canSearchMembers = computed(() => isGroup.value && !messagesOnly.value)
const peerUserId = computed(() => (route.query.peerUserId as string) || '')
const peerAvatar = computed(() => (route.query.avatar as string) || '')
/** 从联系人详情进入的“共享图片/视频”“共享文件”页：隐藏右上角清除按钮 */
const sharedFilterView = computed(() => {
  if (scope.value !== 'messages') return false
  const f = String(route.query.filter || '')
  return f === 'media' || f === 'file'
})
const sharedFileView = computed(() => sharedFilterView.value && String(route.query.filter || '') === 'file')
const sharedMediaView = computed(() => sharedFilterView.value && String(route.query.filter || '') === 'media')
const sharedActionView = computed(() => sharedFileView.value || sharedMediaView.value)

// 联系人资料页会直接带 filter 进入“共享文件/共享图片与视频”。
// 首帧就建立筛选状态，避免先渲染通用筛选入口，再切换到目标列表造成闪屏。
const initialSharedFilter = (() => {
  const value = String(route.query.filter || '')
  return value === 'file' || value === 'media' ? (value as FilterKey) : null
})()

const keyword = ref('')
const loading = ref(Boolean(initialSharedFilter))
const searched = ref(Boolean(initialSharedFilter))
const activeTab = ref<TabKey>('all')
const messageResults = ref<ChatMessage[]>([])
const members = ref<GroupMember[]>([])
const friendIds = ref<Set<string>>(new Set())

/** 联系人资料页进入的共享文件列表专用操作状态。 */
const fileSelectionMode = ref(false)
const selectedFileIds = ref<Set<string>>(new Set())
const favoritedFileIds = ref<Set<string>>(new Set())
const fileActionMsg = ref<ChatMessage | null>(null)
const localSearchMediaUrls = ref<Record<string, string>>({})
const showFileActionSheet = ref(false)
const showFileForwardSheet = ref(false)
const fileForwardTargets = ref<ConversationItem[]>([])
const fileForwardSelectedIds = ref<Set<string>>(new Set())
const fileForwardMessageIds = ref<string[]>([])
const fileForwardLoading = ref(false)
const fileForwarding = ref(false)
let filePressTimer: ReturnType<typeof setTimeout> | null = null
let fileLongPressed = false

const activeFilter = ref<FilterKey | null>(initialSharedFilter)
const selectedDate = ref('')
const showCalendar = ref(false)

const filterEntries: { key: FilterKey; label: string; icon: string }[] = [
  { key: 'date', label: '日期', icon: 'calendar_month' },
  { key: 'media', label: '图片与视频', icon: 'photo_library' },
  { key: 'file', label: '文件', icon: 'folder' },
  { key: 'contact', label: '名片', icon: 'contact_page' },
]

const myUserId = computed(() => {
  const fromStore = userStore.userId
  if (fromStore) return String(fromStore)
  return parseUserIdFromToken(userStore.token) || ''
})

const memberResults = computed(() => {
  if (!canSearchMembers.value) return []
  const q = keyword.value.trim().toLowerCase()
  if (!q) return []
  return members.value.filter((m) => (m.nickname || '').toLowerCase().includes(q))
})

const showMembers = computed(
  () => canSearchMembers.value && (activeTab.value === 'all' || activeTab.value === 'members'),
)
const showMessages = computed(() => activeTab.value === 'all' || activeTab.value === 'messages')
const fileResults = computed(() => messageResults.value.filter((msg) => msg.msgType === 2))
const mediaResults = computed(() => messageResults.value.filter((msg) => msg.msgType === 1 || msg.msgType === 2))
const sharedResultMessages = computed(() => sharedMediaView.value ? mediaResults.value : fileResults.value)
const selectedFileCount = computed(() => selectedFileIds.value.size)
const selectedFileSize = computed(() => [...selectedFileIds.value].reduce((total, id) => {
  const msg = sharedResultMessages.value.find((item) => item.id === id)
  return total + Number(msg ? fileMeta(msg)?.size || 0 : 0)
}, 0))
const allFilesSelected = computed(() =>
  sharedResultMessages.value.length > 0
    && sharedResultMessages.value.every((msg) => selectedFileIds.value.has(msg.id)),
)

const fileActionEntries = computed(() => {
  const entries: Array<{ name: string; color?: string }> = [
    { name: '转发' },
    { name: '定位到原消息' },
  ]
  const msg = fileActionMsg.value
  if (sharedFileView.value && msg && !isFileFavorited(msg)) {
    entries.push({ name: '收藏' })
  }
  entries.push({ name: '删除', color: '#ee0a24' })
  return entries
})

const filterTitle = computed(() => {
  if (activeFilter.value === 'date' && selectedDate.value) {
    return formatDateTitle(selectedDate.value)
  }
  const hit = filterEntries.find((e) => e.key === activeFilter.value)
  return hit?.label || ''
})

const showFilterHome = computed(
  () => !keyword.value.trim() && !activeFilter.value && !loading.value,
)

const emptyHint = computed(() => {
  if (!searched.value || loading.value) return ''
  if (keyword.value.trim() && canSearchMembers.value && activeTab.value === 'members') {
    return memberResults.value.length ? '' : '未找到相关群成员'
  }
  if (activeFilter.value || activeTab.value === 'messages' || messagesOnly.value) {
    return messageResults.value.length ? '' : emptyByFilter()
  }
  if (messageResults.value.length || memberResults.value.length) return ''
  return canSearchMembers.value ? '未找到相关聊天记录或群成员' : '未找到相关聊天记录'
})

function emptyByFilter() {
  if (activeFilter.value === 'media') return '暂无图片或视频'
  if (activeFilter.value === 'file') return '暂无文件'
  if (activeFilter.value === 'contact') return '暂无名片'
  if (activeFilter.value === 'date') return '当天暂无聊天记录'
  return '未找到相关聊天记录'
}

const tabs = computed(() => {
  if (!canSearchMembers.value || !keyword.value.trim()) return []
  return [
    { key: 'all' as TabKey, label: '全部' },
    {
      key: 'messages' as TabKey,
      label: `聊天记录${messageResults.value.length ? ` ${messageResults.value.length}` : ''}`,
    },
    {
      key: 'members' as TabKey,
      label: `群成员${memberResults.value.length ? ` ${memberResults.value.length}` : ''}`,
    },
  ]
})

let debounceTimer: ReturnType<typeof setTimeout> | null = null

onMounted(async () => {
  window.addEventListener('pulse:native-back', onNativeBack)
  try {
    const contacts = await fetchContacts()
    friendIds.value = new Set(contacts.map((c) => String(c.userId)))
  } catch {
    friendIds.value = new Set()
  }
  if (canSearchMembers.value) {
    try {
      const detail = await fetchGroupDetail(conversationId.value)
      members.value = detail.members || []
    } catch {
      members.value = []
    }
  }
  const qFromRoute = String(route.query.q || '').trim()
  if (qFromRoute) {
    keyword.value = qFromRoute
    void doKeywordSearch()
    return
  }
  const qFilter = String(route.query.filter || '')
  if (qFilter === 'file') void loadFileFavorites()
  if (qFilter === 'media' || qFilter === 'file' || qFilter === 'contact' || qFilter === 'date') {
    void applyFilter(qFilter)
  }
})

onUnmounted(() => {
  window.removeEventListener('pulse:native-back', onNativeBack)
  if (debounceTimer) clearTimeout(debounceTimer)
  clearFilePressTimer()
})

watch([sharedFileView, conversationId], ([isFile]) => {
  if (isFile) void loadFileFavorites()
  else favoritedFileIds.value = new Set()
})

watch(keyword, () => {
  if (debounceTimer) clearTimeout(debounceTimer)
  const q = keyword.value.trim()
  if (!q) {
    if (!activeFilter.value) {
      messageResults.value = []
      searched.value = false
    }
    return
  }
  // 关键词搜索时退出类型筛选态
  if (activeFilter.value) {
    activeFilter.value = null
    selectedDate.value = ''
  }
  debounceTimer = setTimeout(() => {
    void doKeywordSearch()
  }, 320)
})

async function doKeywordSearch() {
  const q = keyword.value.trim()
  if (!q) {
    messageResults.value = []
    searched.value = false
    return
  }
  loading.value = true
  searched.value = true
  try {
    messageResults.value = await searchMessages(
      conversationId.value,
      q,
      myUserId.value || 'me',
    )
  } catch (e) {
    messageResults.value = []
    showToast(e instanceof Error ? e.message : '搜索失败')
  } finally {
    loading.value = false
  }
}

async function loadFilterResults(filter: FilterKey, date?: string) {
  loading.value = true
  searched.value = true
  try {
    const opts: { filter: string; from?: string; to?: string } = { filter }
    if (filter === 'date' && date) {
      opts.from = date
      opts.to = date
    }
    messageResults.value = await searchMessages(
      conversationId.value,
      '',
      myUserId.value || 'me',
      opts,
    )
  } catch (e) {
    messageResults.value = []
    showToast(e instanceof Error ? e.message : '加载失败')
  } finally {
    loading.value = false
  }
}

function applyFilter(key: FilterKey) {
  keyword.value = ''
  if (key === 'date') {
    showCalendar.value = true
    return
  }
  activeFilter.value = key
  selectedDate.value = ''
  void loadFilterResults(key)
}

function onCalendarConfirm(value: Date) {
  showCalendar.value = false
  const y = value.getFullYear()
  const m = String(value.getMonth() + 1).padStart(2, '0')
  const d = String(value.getDate()).padStart(2, '0')
  selectedDate.value = `${y}-${m}-${d}`
  activeFilter.value = 'date'
  void loadFilterResults('date', selectedDate.value)
}

function clearFilter() {
  activeFilter.value = null
  selectedDate.value = ''
  messageResults.value = []
  searched.value = false
}

function goBack() {
  if (consumeBackState()) return
  smartBack(router)
}

function consumeBackState(): boolean {
  if (showFileForwardSheet.value) {
    showFileForwardSheet.value = false
    return true
  }
  if (showFileActionSheet.value) {
    showFileActionSheet.value = false
    fileActionMsg.value = null
    return true
  }
  if (showCalendar.value) {
    showCalendar.value = false
    return true
  }
  if (fileSelectionMode.value) {
    exitFileSelection()
    return true
  }
  // 从好友资料页进入的共享媒体/共享文件页本身就是独立页面，
  // 返回时应回到好友资料，不要先清空筛选条件再停留在聊天记录搜索页。
  if (activeFilter.value && !sharedActionView.value) {
    clearFilter()
    return true
  }
  return false
}

function onNativeBack(event: Event) {
  if (!consumeBackState()) return
  event.preventDefault()
}

function highlight(text: string): string {
  const q = keyword.value.trim()
  if (!q || !text) return escapeHtml(text || '')
  const lower = text.toLowerCase()
  const ql = q.toLowerCase()
  let out = ''
  let i = 0
  while (i < text.length) {
    const idx = lower.indexOf(ql, i)
    if (idx < 0) {
      out += escapeHtml(text.slice(i))
      break
    }
    out += escapeHtml(text.slice(i, idx))
    out += `<mark>${escapeHtml(text.slice(idx, idx + q.length))}</mark>`
    i = idx + q.length
  }
  return out
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function isVideoMsg(msg: ChatMessage): boolean {
  if (msg.msgType !== 2) return false
  const f = parseFilePayload(msg.content)
  return !!f && isVideoMedia(f.contentType, f.url || f.name)
}

function previewContent(msg: ChatMessage): string {
  switch (msg.msgType) {
    case 1:
      return '[图片]'
    case 2:
      if (isVideoMsg(msg)) return '[视频]'
      return parseFilePayload(msg.content)?.name || '[文件]'
    case 3:
      return '[语音]'
    case 4:
      return '[聊天记录]'
    case 5: {
      const card = parseContactCard(msg.content)
      if (!card) return '[名片]'
      return card.cardType === 'group' ? `[群名片] ${card.nickname}` : `[个人名片] ${card.nickname}`
    }
    case 9: {
      const raw = (msg.content || '').trim()
      if (raw.startsWith('{')) {
        try {
          const obj = JSON.parse(raw) as { kind?: string; text?: string; mediaType?: string }
          if (obj?.kind === 'voice_call' || obj?.kind === 'video_call') {
            const text = obj.text || '通话已结束'
            const isVideo =
              obj.kind === 'video_call' || String(obj.mediaType || '').toLowerCase() === 'video'
            return `${isVideo ? '[视频通话]' : '[语音通话]'} ${text}`
          }
        } catch {
          /* ignore */
        }
      }
      return raw || '[群提示]'
    }
    default:
      return msg.content || ''
  }
}

function mediaThumb(msg: ChatMessage): string {
  const file = parseFilePayload(msg.content)
  const fileId = file?.fileId || msg.fileId
  if (fileId) return localSearchMediaUrls.value[msg.id] || ''
  if (msg.msgType === 1) {
    return resolveFileUrl(file?.url || msg.content)
  }
  if (msg.msgType === 2) {
    return file?.url ? resolveFileUrl(file.url) : ''
  }
  return ''
}

async function loadSearchMedia(msg: ChatMessage, variant: 'thumb' | 'preview' | 'original'): Promise<string> {
  let file = parseFilePayload(msg.content)
  const fileId = file?.fileId || msg.fileId
  if (!fileId) return resolveFileUrl(file?.url || msg.content)
  const kind = msg.msgType === 2 ? 'video' : 'image'
  // A video JPEG cover is not a playable source. Older search results can
  // lack rendition metadata, so resolve it once before opening the player.
  if (kind === 'video' && variant === 'preview' && !file?.previewUrl) {
    try {
      file = { ...file, ...(await fetchFileMetadata(fileId)) }
    } catch {
      return ''
    }
  }
  const source = variant === 'thumb'
    ? file?.thumbUrl || (kind === 'video' ? fileDownloadUrl(fileId, 'thumb') : file?.previewUrl)
    : variant === 'preview'
      ? file?.previewUrl || (kind === 'video' ? '' : file?.url)
      : file?.originalUrl || file?.url
  if (!source) return ''
  return getStableChatFileUrl(fileId, variant)
    || cacheChatFile(kind, fileId, variant, source || fileDownloadUrl(fileId, variant))
}

async function warmSearchMedia(): Promise<void> {
  await Promise.all(messageResults.value
    .filter((msg) => msg.msgType === 1 || msg.msgType === 2)
    .map(async (msg) => {
      if (localSearchMediaUrls.value[msg.id]) return
      try {
        const cached = await loadSearchMedia(msg, 'thumb')
        if (cached) localSearchMediaUrls.value = { ...localSearchMediaUrls.value, [msg.id]: cached }
      } catch { /* placeholder */ }
    }))
}

watch(messageResults, () => { void warmSearchMedia() })

function fileMeta(msg: ChatMessage) {
  return parseFilePayload(msg.content)
}

function isFileFavorited(msg: ChatMessage): boolean {
  return favoritedFileIds.value.has(String(msg.id))
}

async function loadFileFavorites() {
  try {
    const favorites = await fetchFavorites()
    favoritedFileIds.value = new Set(
      favorites
        .filter((item) => String(item.conversationId) === String(conversationId.value))
        .map((item) => String(item.msgId)),
    )
  } catch {
    favoritedFileIds.value = new Set()
  }
}

function clearFilePressTimer() {
  if (filePressTimer) {
    clearTimeout(filePressTimer)
    filePressTimer = null
  }
}

function showFileActions(msg: ChatMessage) {
  if (!sharedActionView.value) return
  clearFilePressTimer()
  fileLongPressed = true
  fileActionMsg.value = msg
  showFileActionSheet.value = true
}

function onFileTouchStart(msg: ChatMessage) {
  if (!sharedActionView.value) return
  clearFilePressTimer()
  fileLongPressed = false
  filePressTimer = setTimeout(() => showFileActions(msg), 520)
}

function onFileTouchEnd() {
  clearFilePressTimer()
}

function onFileTouchCancel() {
  clearFilePressTimer()
  fileLongPressed = false
}

function toggleFileSelection(msgId: string) {
  const next = new Set(selectedFileIds.value)
  if (next.has(msgId)) next.delete(msgId)
  else next.add(msgId)
  selectedFileIds.value = next
}

function enterFileSelection() {
  fileSelectionMode.value = true
  selectedFileIds.value = new Set()
}

function selectAllFiles() {
  fileSelectionMode.value = true
  if (allFilesSelected.value) {
    selectedFileIds.value = new Set()
    return
  }
  selectedFileIds.value = new Set(sharedResultMessages.value.map((msg) => msg.id))
}

function exitFileSelection() {
  fileSelectionMode.value = false
  selectedFileIds.value = new Set()
}

function selectedFileMessages(ids = [...selectedFileIds.value]) {
  const idSet = new Set(ids)
  return sharedResultMessages.value.filter((msg) => idSet.has(msg.id))
}

async function downloadFileBlob(msg: ChatMessage) {
  const file = fileMeta(msg)
  if (!file?.url) throw new Error('文件地址无效')
  const token = getToken()
  const res = await fetch(resolveFileUrl(file.url), {
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })
  if (!res.ok) throw new Error(`下载失败（${res.status}）`)
  const blob = await res.blob()
  if (!blob.size) throw new Error('文件为空')
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = file.name || '文件'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000)
}

async function downloadSelectedFiles() {
  const selected = selectedFileMessages()
  if (!selected.length) {
    showToast('请选择要下载的内容')
    return
  }
  let success = 0
  for (const msg of selected) {
    const file = fileMeta(msg)
    if (!file?.url) continue
    try {
      if (msg.msgType === 1 || isVideoMsg(msg)) {
        const result = await saveMediaToDevice(resolveFileUrl(file.url), {
          filename: file.name,
          mimeType: file.contentType,
        })
        const message = toastForSaveResult(result)
        if (message) showToast(message)
      } else {
        await downloadFileBlob(msg)
      }
      success += 1
    } catch (error) {
      showToast(error instanceof Error ? error.message : '下载失败')
      break
    }
  }
  if (success) {
    exitFileSelection()
    showToast(`已处理 ${success} 项`)
  }
}

async function favoriteSelectedFiles() {
  const selected = selectedFileMessages().filter((msg) => !isFileFavorited(msg))
  if (!selected.length) {
    showToast('所选内容已收藏')
    return
  }
  let success = 0
  const succeeded: ChatMessage[] = []
  for (const msg of selected) {
    try {
      await addFavorite(conversationId.value, msg.id)
      success += 1
      succeeded.push(msg)
    } catch {
      // Continue so one failed item does not block the rest.
    }
  }
  if (success) {
    const next = new Set(favoritedFileIds.value)
    succeeded.forEach((msg) => next.add(String(msg.id)))
    favoritedFileIds.value = next
    exitFileSelection()
    showToast(`已收藏 ${success} 项`)
  } else {
    showToast('收藏失败')
  }
}

async function locateSelectedFile() {
  const msg = selectedFileMessages()[0]
  if (!msg) {
    showToast('请选择要定位的内容')
    return
  }
  if (await openInChat(msg)) exitFileSelection()
}

function onFileClick(msg: ChatMessage) {
  clearFilePressTimer()
  if (fileLongPressed) {
    fileLongPressed = false
    return
  }
  if (fileSelectionMode.value) {
    toggleFileSelection(msg.id)
    return
  }
  void openFileMessage(msg)
}

async function openFileMessage(msg: ChatMessage) {
  const file = fileMeta(msg)
  const fileId = file?.fileId || msg.fileId
  if (!file?.url && !fileId) {
    showToast('文件地址无效')
    return
  }
  if (isVideoMsg(msg)) {
    const previewUrl = await loadSearchMedia(msg, 'preview').catch(() => '')
    const playerUrl = previewUrl || (fileId
      ? fileDownloadUrl(fileId, 'preview')
      : file?.previewUrl || file?.originalUrl || file?.url || '')
    void openMediaVideoPreview(playerUrl, { fileId, variant: 'preview' })
    return
  }
  openFilePreview({
    url: resolveFileUrl(file?.url || (fileId ? fileDownloadUrl(fileId) : '')),
    fileId,
    name: file?.name || (msg.msgType === 1 ? '图片' : isVideoMsg(msg) ? '视频' : '文件'),
    size: file?.size,
    contentType: file?.contentType,
    onForward: () => void openFileForwardPicker([msg.id]),
  })
}

function onFileActionSelect(action: { name?: string }) {
  const msg = fileActionMsg.value
  showFileActionSheet.value = false
  fileActionMsg.value = null
  if (!msg) return
  if (action.name === '转发') {
    void openFileForwardPicker([msg.id])
  } else if (action.name === '定位到原消息') {
    void openInChat(msg)
  } else if (action.name === '收藏') {
    void favoriteFile(msg)
  } else if (action.name === '删除') {
    void deleteFileMessages([msg.id])
  }
}

async function favoriteFile(msg: ChatMessage) {
  if (isFileFavorited(msg)) return
  try {
    await addFavorite(conversationId.value, msg.id)
    const next = new Set(favoritedFileIds.value)
    next.add(String(msg.id))
    favoritedFileIds.value = next
    showToast('已收藏')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '收藏失败')
  }
}

async function openFileForwardPicker(ids: string[]) {
  const validIds = ids.filter((id) => sharedResultMessages.value.some((msg) => msg.id === id))
  if (!validIds.length) {
    showToast('请选择文件')
    return
  }
  fileForwardMessageIds.value = validIds
  fileForwardSelectedIds.value = new Set()
  fileForwardTargets.value = []
  fileForwardLoading.value = true
  showFileForwardSheet.value = true
  try {
    const list = await fetchConversations('all')
    fileForwardTargets.value = list.filter((item) => item.id !== conversationId.value)
  } catch {
    showFileForwardSheet.value = false
    showToast('加载会话失败')
  } finally {
    fileForwardLoading.value = false
  }
}

function toggleFileForwardTarget(id: string) {
  const next = new Set(fileForwardSelectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  fileForwardSelectedIds.value = next
}

async function submitFileForward() {
  const targetIds = [...fileForwardSelectedIds.value]
  const msgIds = [...fileForwardMessageIds.value]
  if (!targetIds.length) {
    showToast('请选择转发对象')
    return
  }
  if (!msgIds.length) return
  const names = fileForwardTargets.value
    .filter((item) => fileForwardSelectedIds.value.has(item.id))
    .map((item) => item.name)
  const targetText = names.length <= 2
    ? names.join('、')
    : `${names.slice(0, 2).join('、')}等${names.length}个会话`
  try {
    await showConfirmDialog({
      title: '确认转发',
      message: `将选中的 ${msgIds.length} 项内容转发到「${targetText}」？`,
      confirmButtonText: '转发',
    })
  } catch {
    return
  }
  fileForwarding.value = true
  try {
    const count = await forwardMessages(
      conversationId.value,
      targetIds,
      msgIds,
      msgIds.length > 1 ? 'merge' : 'separate',
    )
    showFileForwardSheet.value = false
    exitFileSelection()
    showToast(`已转发至 ${targetIds.length} 个会话（${count} 个文件）`)
  } catch (e) {
    showToast(e instanceof Error ? e.message : '转发失败')
  } finally {
    fileForwarding.value = false
  }
}

async function deleteFileMessages(ids: string[]) {
  const validIds = ids.filter((id) => sharedResultMessages.value.some((msg) => msg.id === id))
  if (!validIds.length) {
    showToast('请选择文件')
    return
  }
  try {
    await showConfirmDialog({
      title: '确认删除',
      message: validIds.length > 1
        ? `确定删除选中的 ${validIds.length} 个文件吗？删除后仅自己不可见。`
        : '确定删除这个文件吗？删除后仅自己不可见。',
      confirmButtonText: '确认删除',
      confirmButtonColor: '#ee0a24',
    })
  } catch {
    return
  }
  try {
    await deleteMessages(conversationId.value, validIds, 'self')
    const idSet = new Set(validIds)
    messageResults.value = messageResults.value.filter((msg) => !idSet.has(msg.id))
    exitFileSelection()
    showToast('已删除')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '删除失败')
  }
}

function contactMeta(msg: ChatMessage) {
  return parseContactCard(msg.content)
}

function formatTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const hm = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (sameDay) return hm
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`
}

function formatDateTitle(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number)
  if (!y || !m || !d) return ymd
  const now = new Date()
  if (now.getFullYear() === y && now.getMonth() + 1 === m && now.getDate() === d) {
    return '今天'
  }
  return `${y}年${m}月${d}日`
}

function initials(name?: string) {
  return (name || '?').slice(0, 1)
}

async function openInChat(msg: ChatMessage): Promise<boolean> {
  const target = await fetchLocatableMessage(conversationId.value, msg.id, myUserId.value || 'me')
  if (!target) {
    showToast('原消息已不存在')
    return false
  }
  await router.push({
    path: `/chat/${conversationId.value}`,
    query: {
      title: title.value,
      type: chatType.value,
      peerUserId: peerUserId.value,
      avatar: peerAvatar.value,
      highlightMsgId: target.id,
    },
  })
  return true
}

async function onMediaClick(msg: ChatMessage) {
  if (msg.msgType === 1) {
    const imageMessages = messageResults.value.filter((m) => m.msgType === 1)
    const images = await Promise.all(imageMessages.map((m) => loadSearchMedia(m, 'original').catch(() => '')))
    const current = await loadSearchMedia(msg, 'original').catch(() => '')
    if (!current) return
    const start = Math.max(0, images.indexOf(current))
    showImagePreview({
      images: images.filter(Boolean).length ? images : [current],
      startPosition: start,
      closeable: true,
      closeIconPosition: 'top-right',
      showIndex: images.length > 1,
      transition: 'none',
    })
    return
  }
  if (isVideoMsg(msg)) {
    const file = fileMeta(msg)
    const fileId = file?.fileId || msg.fileId
    const url = await loadSearchMedia(msg, 'preview').catch(() => '')
    const playerUrl = url || (fileId
      ? fileDownloadUrl(fileId, 'preview')
      : file?.previewUrl || file?.originalUrl || file?.url || '')
    void openMediaVideoPreview(playerUrl, { fileId, variant: 'preview' })
    return
  }
  await openInChat(msg)
}

function openMember(m: GroupMember) {
  const uid = String(m.userId)
  if (uid === myUserId.value) {
    router.push('/profile/edit')
    return
  }
  if (friendIds.value.has(uid)) {
    router.push(`/contacts/${uid}`)
  } else {
    router.push({
      path: `/user/${uid}`,
      query: { source: 'group', groupId: conversationId.value },
    })
  }
}

function openContactCard(msg: ChatMessage) {
  const card = contactMeta(msg)
  if (!card) {
    void openInChat(msg)
    return
  }
  if (card.cardType === 'group' && card.conversationId) {
    router.push({
      path: `/chat/${card.conversationId}`,
      query: { title: card.nickname, type: 'group' },
    })
    return
  }
  if (card.userId) {
    if (friendIds.value.has(String(card.userId))) {
      router.push(`/contacts/${card.userId}`)
    } else {
      router.push(`/user/${card.userId}`)
    }
  }
}

const calendarMaxDate = new Date()
const calendarMinDate = new Date(new Date().getFullYear() - 5, 0, 1)
</script>

<template>
  <div class="history-search-page">
    <header class="page-header" :class="{ 'filter-header': !!activeFilter }">
      <button type="button" class="icon-btn" @click="goBack">
        <span class="material-symbols-outlined">arrow_back_ios</span>
      </button>
      <div v-if="activeFilter" class="filter-title-wrap">
        <h1 class="filter-title">{{ filterTitle }}</h1>
        <button
          v-if="sharedActionView"
          type="button"
          class="text-btn file-select-all-btn"
          @click="fileSelectionMode ? selectAllFiles() : enterFileSelection()"
        >{{ fileSelectionMode ? (allFilesSelected ? '取消全选' : '全选') : '选择' }}</button>
      </div>
      <div v-else class="search-box">
        <span class="material-symbols-outlined search-ico">search</span>
        <input
          v-model="keyword"
          class="search-input"
          type="text"
          autofocus
          :placeholder="canSearchMembers ? '搜索聊天记录、群成员' : '搜索聊天记录'"
          enterkeyhint="search"
          @keyup.enter="doKeywordSearch"
        />
        <button v-if="keyword" type="button" class="search-clear-btn" aria-label="清除搜索" @click="keyword = ''">
          <span class="material-symbols-outlined">cancel</span>
        </button>
      </div>
    </header>

    <div v-if="canSearchMembers && keyword.trim()" class="tabs">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        class="tab"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <main class="main" :class="{ 'main-with-selection': sharedActionView && fileSelectionMode }">
      <!-- 微信式快捷筛选 -->
      <div v-if="showFilterHome" class="filter-home">
        <p class="filter-hint">
          查找「{{ title }}」的{{ canSearchMembers ? '聊天记录或群成员' : '聊天记录' }}
        </p>
        <div class="filter-grid">
          <button
            v-for="item in filterEntries"
            :key="item.key"
            type="button"
            class="filter-item"
            @click="applyFilter(item.key)"
          >
            <span class="filter-ico-wrap">
              <span class="material-symbols-outlined">{{ item.icon }}</span>
            </span>
            <span class="filter-label">{{ item.label }}</span>
          </button>
        </div>
      </div>

      <div v-else-if="loading" class="hint">加载中...</div>
      <div v-else-if="emptyHint" class="hint">{{ emptyHint }}</div>

      <template v-else>
        <!-- 图片与视频：宫格 -->
        <section v-if="activeFilter === 'media' && messageResults.length" class="media-grid">
          <button
            v-for="msg in messageResults"
            :key="msg.id"
            type="button"
            class="media-cell"
            :class="{ 'media-cell-selected': sharedMediaView && selectedFileIds.has(msg.id) }"
            @click="sharedMediaView ? onFileClick(msg) : onMediaClick(msg)"
            @touchstart.passive="onFileTouchStart(msg)"
            @touchend="onFileTouchEnd"
            @touchcancel="onFileTouchCancel"
            @contextmenu.prevent="sharedMediaView ? showFileActions(msg) : openInChat(msg)"
          >
            <img
              v-if="isVideoMsg(msg)"
              :src="mediaThumb(msg)"
              alt="视频封面"
              class="media-thumb"
            />
            <img v-else :src="mediaThumb(msg)" alt="" class="media-thumb" />
            <span v-if="isVideoMsg(msg)" class="media-play">
              <span class="material-symbols-outlined filled">play_circle</span>
            </span>
            <span v-if="sharedMediaView && fileSelectionMode" class="media-select-indicator">
              <span class="material-symbols-outlined">
                {{ selectedFileIds.has(msg.id) ? 'check_circle' : 'radio_button_unchecked' }}
              </span>
            </span>
          </button>
        </section>

        <!-- 文件列表 -->
        <section v-else-if="activeFilter === 'file' && messageResults.length" class="section">
          <button
            v-for="msg in messageResults"
            :key="msg.id"
            type="button"
            class="result-item"
            :class="{ 'file-result-selected': selectedFileIds.has(msg.id) }"
            @click="onFileClick(msg)"
            @touchstart.passive="onFileTouchStart(msg)"
            @touchend="onFileTouchEnd"
            @touchcancel="onFileTouchCancel"
            @contextmenu.prevent="showFileActions(msg)"
          >
            <div class="file-ico">
              <span class="material-symbols-outlined">description</span>
            </div>
            <div class="body">
              <div class="top">
                <span class="name">{{ fileMeta(msg)?.name || '文件' }}</span>
                <span class="time">{{ formatTime(msg.createdAt) }}</span>
              </div>
              <p class="content sub">
                {{ formatFileSize(fileMeta(msg)?.size || 0) }}
                · {{ msg.fromNickname || '用户' }}
              </p>
            </div>
            <span v-if="sharedFileView && fileSelectionMode" class="file-select-indicator">
              <span class="material-symbols-outlined">
                {{ selectedFileIds.has(msg.id) ? 'check_circle' : 'radio_button_unchecked' }}
              </span>
            </span>
          </button>
        </section>

        <!-- 名片列表 -->
        <section v-else-if="activeFilter === 'contact' && messageResults.length" class="section">
          <button
            v-for="msg in messageResults"
            :key="msg.id"
            type="button"
            class="result-item"
            @click="openContactCard(msg)"
          >
            <div class="avatar">
              <img
                v-if="contactMeta(msg)?.avatarUrl"
                :src="contactMeta(msg)!.avatarUrl"
                :alt="contactMeta(msg)?.nickname || ''"
              />
              <span v-else>{{ initials(contactMeta(msg)?.nickname) }}</span>
            </div>
            <div class="body">
              <div class="top">
                <span class="name">{{ contactMeta(msg)?.nickname || '名片' }}</span>
                <span class="time">{{ formatTime(msg.createdAt) }}</span>
              </div>
              <p class="content sub">
                {{ contactMeta(msg)?.cardType === 'group' ? '群名片' : '个人名片' }}
                · {{ msg.fromNickname || '用户' }}
              </p>
            </div>
          </button>
        </section>

        <!-- 关键词 / 日期：通用列表 -->
        <template v-else>
          <section v-if="showMembers && memberResults.length" class="section">
            <div class="section-title">群成员 · {{ memberResults.length }}</div>
            <button
              v-for="m in memberResults"
              :key="m.userId"
              type="button"
              class="result-item"
              @click="openMember(m)"
            >
              <div class="avatar">
                <img v-if="m.avatarUrl" :src="m.avatarUrl" :alt="m.nickname" />
                <span v-else>{{ initials(m.nickname) }}</span>
              </div>
              <div class="body">
                <div class="top">
                  <span class="name" v-html="highlight(m.nickname)" />
                  <span class="role-tag" :class="m.role">{{ roleLabel(m.role) }}</span>
                </div>
                <p class="content sub">点击查看资料</p>
              </div>
            </button>
          </section>

          <section v-if="showMessages && messageResults.length" class="section">
            <div v-if="!activeFilter" class="section-title">
              聊天记录 · {{ messageResults.length }}
            </div>
            <button
              v-for="msg in messageResults"
              :key="msg.id"
              type="button"
              class="result-item"
              @click="openInChat(msg)"
            >
              <div class="avatar">
                <img
                  v-if="msg.fromAvatarUrl"
                  :src="msg.fromAvatarUrl"
                  :alt="msg.fromNickname || ''"
                />
                <span v-else>{{ initials(msg.fromNickname) }}</span>
              </div>
              <div class="body">
                <div class="top">
                  <span class="name">{{ msg.fromNickname || '用户' }}</span>
                  <span class="time">{{ formatTime(msg.createdAt) }}</span>
                </div>
                <p class="content" v-html="highlight(previewContent(msg))" />
              </div>
            </button>
          </section>
        </template>
      </template>
    </main>

    <van-calendar
      v-model:show="showCalendar"
      type="single"
      title="按日期查找"
      color="var(--pulse-primary-container)"
      :min-date="calendarMinDate"
      :max-date="calendarMaxDate"
      :show-confirm="false"
      @confirm="onCalendarConfirm"
    />

    <div v-if="sharedActionView && fileSelectionMode" class="file-selection-bar">
      <span class="selection-handle" aria-hidden="true" />
      <div class="file-selection-summary">
        <div>
          <strong>已选 {{ selectedFileCount }} 项</strong>
          <small>{{ selectedFileSize ? formatFileSize(selectedFileSize) : '请选择要操作的内容' }}</small>
        </div>
      </div>
      <div class="file-selection-actions">
        <button type="button" :disabled="!selectedFileCount" @click="downloadSelectedFiles">
          <span class="material-symbols-outlined">download</span>
          下载
        </button>
        <button type="button" :disabled="!selectedFileCount" @click="openFileForwardPicker([...selectedFileIds])">
          <span class="material-symbols-outlined">forward</span>
          转发
        </button>
        <button type="button" :disabled="!selectedFileCount" @click="favoriteSelectedFiles">
          <span class="material-symbols-outlined">bookmark</span>
          收藏
        </button>
        <button type="button" :disabled="!selectedFileCount" @click="locateSelectedFile">
          <span class="material-symbols-outlined">location_on</span>
          定位
        </button>
        <button type="button" class="danger" :disabled="!selectedFileCount" @click="deleteFileMessages([...selectedFileIds])">
          <span class="material-symbols-outlined">delete</span>
          删除
        </button>
      </div>
    </div>

    <van-action-sheet
      v-model:show="showFileActionSheet"
      :actions="fileActionEntries"
      cancel-text="取消"
      close-on-click-action
      @select="onFileActionSelect"
    />

    <van-popup
      v-model:show="showFileForwardSheet"
      position="bottom"
      round
      teleport="body"
      close-on-click-overlay
      safe-area-inset-bottom
      class="file-forward-popup"
    >
      <div class="file-forward-panel">
        <div class="file-forward-header">
          <div>
            <strong>选择转发对象</strong>
            <small>已选 {{ fileForwardSelectedIds.size }} 个会话</small>
          </div>
          <button type="button" @click="showFileForwardSheet = false">关闭</button>
        </div>
        <div class="file-forward-list">
          <div v-if="fileForwardLoading" class="hint">加载中...</div>
          <div v-else-if="!fileForwardTargets.length" class="hint">暂无其他会话</div>
          <template v-else>
            <button
              v-for="item in fileForwardTargets"
              :key="item.id"
              type="button"
              class="file-forward-item"
              :class="{ on: fileForwardSelectedIds.has(item.id) }"
              @click="toggleFileForwardTarget(item.id)"
            >
              <span class="material-symbols-outlined">
                {{ fileForwardSelectedIds.has(item.id) ? 'check_circle' : 'radio_button_unchecked' }}
              </span>
              <img v-if="item.avatar" :src="item.avatar" alt="" />
              <span v-else class="file-forward-avatar">{{ item.name.slice(0, 1) }}</span>
              <span class="file-forward-name">{{ item.name }}</span>
              <small>{{ item.type === 'group' ? '群聊' : '私聊' }}</small>
            </button>
          </template>
        </div>
        <button
          type="button"
          class="file-forward-submit"
          :disabled="!fileForwardSelectedIds.size || fileForwarding"
          @click="submitFileForward"
        >{{ fileForwarding ? '转发中...' : '确认转发' }}</button>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.history-search-page {
  min-height: 100%;
  background: var(--pulse-page-bg, var(--pulse-bg));
  color: var(--pulse-text);
}

.page-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  padding-top: var(--pulse-header-pad-top);
  background: var(--pulse-page-bg, var(--pulse-bg));
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
  flex-shrink: 0;
}

.filter-title-wrap {
  display: contents;
}

.filter-title {
  margin: 0;
  min-width: 0;
  grid-column: 2;
  position: static !important;
  left: auto !important;
  right: auto !important;
  top: auto !important;
  bottom: auto !important;
  width: auto !important;
  height: auto !important;
  display: block !important;
  justify-self: stretch;
  text-align: center;
  font-size: 17px;
  font-weight: 650;
  color: var(--pulse-text);
}

.page-header.filter-header {
  grid-template-columns: 36px minmax(0, 1fr) 60px;
}

.text-btn {
  border: none;
  background: transparent;
  color: var(--pulse-primary);
  font-size: 14px;
  padding: 6px 4px;
  cursor: pointer;
}

.file-select-all-btn {
  flex: 0 0 auto;
  white-space: nowrap;
}

.search-box {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  padding: 0 10px;
  border-radius: 10px;
  background: var(--pulse-surface-container);
}

.search-ico {
  font-size: 20px;
  color: var(--pulse-outline);
}

.search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--pulse-text);
  font-size: 15px;
}

.clear-btn {
  border: none;
  background: transparent;
  color: var(--pulse-outline);
  display: grid;
  place-items: center;
  padding: 0;
  cursor: pointer;
}

.clear-btn .material-symbols-outlined {
  font-size: 18px;
}

.tabs {
  display: flex;
  gap: 8px;
  padding: 10px 16px;
  overflow-x: auto;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.tab {
  flex-shrink: 0;
  border: none;
  border-radius: 999px;
  padding: 6px 12px;
  background: var(--pulse-surface-container);
  color: var(--pulse-text-secondary);
  font-size: 13px;
  cursor: pointer;
}

.tab.active {
  background: rgba(75, 142, 255, 0.2);
  color: var(--pulse-primary);
  font-weight: 600;
}

.main {
  padding: 8px 0 32px;
}

.main-with-selection {
  padding-bottom: calc(148px + var(--pulse-safe-bottom, 0px));
}

.filter-home {
  padding: 28px 20px 16px;
}

.filter-hint {
  margin: 0 0 28px;
  text-align: center;
  color: var(--pulse-outline);
  font-size: 14px;
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.filter-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 4px 0;
}

.filter-ico-wrap {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: var(--pulse-surface-container);
  display: grid;
  place-items: center;
  color: var(--pulse-primary);
}

.filter-ico-wrap .material-symbols-outlined {
  font-size: 26px;
}

.filter-item:active .filter-ico-wrap {
  background: var(--pulse-surface-high);
}

.filter-label {
  font-size: 12px;
  color: var(--pulse-text-secondary);
}

.hint {
  text-align: center;
  padding: 48px 24px;
  color: var(--pulse-outline);
  font-size: 14px;
}

.section-title {
  padding: 10px 16px 6px;
  font-size: 12px;
  color: var(--pulse-outline);
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 2px;
  padding: 2px;
}

.media-cell {
  position: relative;
  aspect-ratio: 1;
  border: none;
  padding: 0;
  background: #1a1a1a;
  overflow: hidden;
  cursor: pointer;
}

.media-cell-selected {
  box-shadow: inset 0 0 0 3px var(--pulse-primary);
}

.media-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
  background: #222;
}

.media-play {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #fff;
  background: rgba(0, 0, 0, 0.18);
  pointer-events: none;
}

.media-play .material-symbols-outlined {
  font-size: 28px;
}

.media-select-indicator {
  position: absolute;
  z-index: 2;
  top: 6px;
  right: 6px;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.42);
  color: #fff;
}

.media-select-indicator .material-symbols-outlined {
  font-size: 22px;
}

.result-item {
  width: 100%;
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.result-item:active {
  background: rgba(255, 255, 255, 0.04);
}

.file-result-selected {
  background: rgba(75, 142, 255, 0.12);
}

.file-select-indicator {
  flex: 0 0 auto;
  align-self: center;
  color: var(--pulse-primary);
}

.file-select-indicator .material-symbols-outlined {
  font-size: 22px;
}

.file-selection-bar {
  position: fixed;
  z-index: 30;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 8px 14px calc(var(--pulse-safe-bottom, 0px) + 12px);
  border-top: 1px solid var(--pulse-border);
  border-radius: 20px 20px 0 0;
  background: color-mix(in srgb, var(--pulse-surface-container) 96%, transparent);
  color: var(--pulse-text-secondary);
  box-shadow: 0 -12px 32px rgba(0, 0, 0, 0.18);
  backdrop-filter: blur(18px);
}

.selection-handle {
  display: block;
  width: 34px;
  height: 4px;
  margin: 0 auto 10px;
  border-radius: 999px;
  background: var(--pulse-outline);
  opacity: 0.45;
}

.file-selection-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.file-selection-summary div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.file-selection-summary strong {
  color: var(--pulse-text);
  font-size: 14px;
}

.file-selection-summary small {
  color: var(--pulse-outline);
  font-size: 11px;
}

.file-selection-actions {
  display: flex;
  gap: 7px;
  overflow-x: auto;
  padding: 1px 1px 3px;
  scrollbar-width: none;
}

.file-selection-actions::-webkit-scrollbar {
  display: none;
}

.file-selection-actions button {
  display: flex;
  flex: 0 0 66px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 66px;
  height: 48px;
  padding: 4px 3px;
  border-radius: 12px;
  background: var(--pulse-surface-high);
  color: var(--pulse-text);
  font-size: 11px;
  font-weight: 550;
}

.file-selection-actions button:not(:disabled):active,
.file-selection-actions button:focus-visible {
  opacity: 0.72;
}

.file-selection-actions button .material-symbols-outlined {
  margin: 0;
  font-size: 19px;
}

.file-selection-actions button:disabled {
  opacity: 0.42;
  cursor: default;
}

.file-selection-actions button.danger {
  color: var(--pulse-error, #ff6b75);
}

.file-selection-actions button:last-child {
  color: var(--pulse-outline);
}

.file-selection-actions button { border: 0; cursor: pointer; }

.file-forward-popup.van-popup {
  max-height: 76vh;
  background: var(--pulse-surface-container, #202126);
  color: var(--pulse-text);
}

.file-forward-panel {
  display: flex;
  flex-direction: column;
  max-height: 76vh;
  padding: 16px 14px calc(var(--pulse-safe-bottom, 0px) + 12px);
}

.file-forward-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
}

.file-forward-header strong,
.file-forward-header small {
  display: block;
}

.file-forward-header strong {
  font-size: 16px;
}

.file-forward-header small {
  margin-top: 4px;
  color: var(--pulse-outline);
  font-size: 12px;
}

.file-forward-header button {
  border: 0;
  background: transparent;
  color: var(--pulse-primary);
  font-size: 14px;
}

.file-forward-list {
  min-height: 80px;
  max-height: 48vh;
  overflow: auto;
}

.file-forward-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 4px;
  border: 0;
  background: transparent;
  color: var(--pulse-text);
  text-align: left;
}

.file-forward-item > .material-symbols-outlined {
  color: var(--pulse-outline);
}

.file-forward-item.on > .material-symbols-outlined {
  color: var(--pulse-primary);
}

.file-forward-item img,
.file-forward-avatar {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  border-radius: 50%;
  object-fit: cover;
}

.file-forward-avatar {
  display: grid;
  place-items: center;
  background: var(--pulse-surface-highest);
  color: var(--pulse-primary);
  font-weight: 700;
}

.file-forward-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}

.file-forward-item small {
  color: var(--pulse-outline);
  font-size: 11px;
}

.file-forward-submit {
  width: 100%;
  height: 44px;
  margin-top: 12px;
  border: 0;
  border-radius: 22px;
  background: linear-gradient(135deg, #4b8eff, #6675f5);
  color: #fff;
  font-size: 15px;
  font-weight: 650;
}

.file-forward-submit:disabled {
  opacity: 0.45;
}

:global(:root[data-theme='light'] .file-selection-bar) {
  border-color: rgba(137, 196, 228, 0.42);
  background: #ffffff;
  color: #526574;
  box-shadow: 0 -12px 32px rgba(34, 112, 165, 0.12);
}

:global(:root[data-theme='light'] .file-selection-summary strong) {
  color: #14243a;
}

:global(:root[data-theme='light'] .file-selection-summary small) {
  color: #718ea4;
}

:global(:root[data-theme='light'] .file-selection-actions button) {
  background: #edf4ff;
  color: #14243a;
}

:global(:root[data-theme='light'] .file-selection-actions button.danger) {
  color: #d9304f;
}

:global(:root[data-theme='light'] .file-selection-actions button:last-child) {
  color: #526574;
}

:global(:root[data-theme='light'] .van-action-sheet) {
  background: #ffffff !important;
  color: #14243a !important;
}

:global(:root[data-theme='light'] .van-action-sheet__item),
:global(:root[data-theme='light'] .van-action-sheet__cancel) {
  color: #14243a !important;
  background: #ffffff !important;
}

:global(:root[data-theme='light'] .van-action-sheet__gap) {
  background: #edf4ff !important;
}

:global(:root[data-theme='light'] .file-forward-popup) {
  background: #ffffff !important;
  color: #14243a !important;
}

.avatar,
.file-ico {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--pulse-surface-highest);
  color: var(--pulse-primary);
  display: grid;
  place-items: center;
  font-weight: 700;
  flex-shrink: 0;
}

.file-ico {
  border-radius: 10px;
  background: rgba(75, 142, 255, 0.16);
}

.file-ico .material-symbols-outlined {
  font-size: 22px;
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.body {
  flex: 1;
  min-width: 0;
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.name {
  font-size: 14px;
  font-weight: 600;
  color: var(--pulse-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.time {
  font-size: 11px;
  color: var(--pulse-outline);
  flex-shrink: 0;
}

.role-tag {
  flex-shrink: 0;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--pulse-outline);
}

.role-tag.owner {
  background: rgba(255, 183, 77, 0.2);
  color: #ffb74d;
}

.role-tag.admin {
  background: rgba(75, 142, 255, 0.2);
  color: var(--pulse-primary);
}

.content {
  margin: 0;
  font-size: 15px;
  line-height: 1.4;
  color: var(--pulse-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.content.sub {
  font-size: 12px;
  color: var(--pulse-outline);
}

.content :deep(mark),
.name :deep(mark) {
  background: rgba(75, 142, 255, 0.35);
  color: var(--pulse-primary);
  border-radius: 2px;
  padding: 0 1px;
}
</style>

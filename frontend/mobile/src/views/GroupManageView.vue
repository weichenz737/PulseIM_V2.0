<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { smartBack } from '@/utils/navBack'
import { showConfirmDialog, showToast } from 'vant'
import {
  fetchGroupDetail,
  updateGroupNotice,
  updateGroupWelcome,
  removeGroupMember,
  transferGroupOwner,
  dissolveGroup,
  addGroupMembers,
  setGroupMemberRole,
  setGroupMuteAll,
  setMemberSpeakMuted,
  setJoinVerifyRequired,
  setAllowMemberAddFriend,
  setGroupSearchMode,
  setMemberInviteAllowed,
  createGroupScheduledMessage,
  updateGroupScheduledMessage,
  fetchGroupScheduledMessages,
  cancelGroupScheduledMessage,
  roleLabel,
  type GroupDetail,
  type GroupMember,
  type GroupScheduledMessage,
} from '@/api/conversation'
import { fetchContacts, type ContactItem } from '@/api/contact'
import {
  uploadChatFile,
  extractChatFileId,
  fileDownloadUrl,
  normalizeFileName,
  resolveFileUrl,
  validateClientFileSend,
  uploadVideoResumable,
} from '@/api/file'
import { cacheChatFile } from '@/utils/fileCache'

const route = useRoute()
const router = useRouter()
const conversationId = computed(() => route.params.id as string)

const loading = ref(true)
const detail = ref<GroupDetail | null>(null)
const showAdd = ref(false)
const contacts = ref<ContactItem[]>([])
const selected = ref<Set<string>>(new Set())
const transferring = ref(false)
const showNoticeDialog = ref(false)
const noticeDraft = ref('')
const saving = ref(false)
const showSearchModeSheet = ref(false)
const scheduledMessages = ref<GroupScheduledMessage[]>([])
const showWelcomeDialog = ref(false)
const welcomeDraft = ref('')
const showScheduledDialog = ref(false)
const editingScheduledId = ref('')
type ScheduledPartType = 0 | 1 | 2 | 3
type ScheduledPart = { msgType: ScheduledPartType; content: string }
type ScheduledFile = { fileId?: string; url?: string; originalUrl?: string; previewUrl?: string; name?: string; size?: number; contentType?: string }
const scheduledTypes = ref<ScheduledPartType[]>([0])
const scheduledTextContent = ref('')
const scheduledFileContents = ref<Partial<Record<ScheduledPartType, string>>>({})
const scheduledFilePreviewUrls = ref<Partial<Record<ScheduledPartType, string>>>({})
const scheduledVideoReady = ref<Partial<Record<ScheduledPartType, boolean>>>({})
const scheduledAt = ref('')
const scheduledFileInput = ref<HTMLInputElement | null>(null)
const scheduledUploading = ref(false)
const scheduledUploadingType = ref<ScheduledPartType | null>(null)
const showScheduledTypeSheet = ref(false)
const showScheduledTimePicker = ref(false)
const scheduledTimePickerValue = ref<string[]>([])

const scheduledTypeOptions = [
  { value: 0 as const, label: '文字', description: '发送文字内容', icon: 'text_fields' },
  { value: 1 as const, label: '图片 / 视频', description: '发送一张图片或一个视频', icon: 'perm_media' },
  { value: 2 as const, label: '文件', description: '发送一个文件附件', icon: 'description' },
  { value: 3 as const, label: '音频 / 语音', description: '发送音频或语音文件', icon: 'mic' },
] as const

const scheduledTypeSummary = computed(() => scheduledTypes.value
  .map((type) => scheduledTypeOptions.find((item) => item.value === type)?.label || '')
  .filter(Boolean)
  .join('、'))

const scheduledTimePickerColumns = computed(() => {
  const currentYear = new Date().getFullYear()
  const year = Number(scheduledTimePickerValue.value[0]) || currentYear
  const month = Number(scheduledTimePickerValue.value[1]) || new Date().getMonth() + 1
  const dayCount = new Date(year, month, 0).getDate()
  return [
    Array.from({ length: 6 }, (_, index) => {
      const value = String(currentYear + index)
      return { text: `${value}年`, value }
    }),
    Array.from({ length: 12 }, (_, index) => {
      const value = String(index + 1).padStart(2, '0')
      return { text: `${value}月`, value }
    }),
    Array.from({ length: dayCount }, (_, index) => {
      const value = String(index + 1).padStart(2, '0')
      return { text: `${value}日`, value }
    }),
    Array.from({ length: 24 }, (_, index) => {
      const value = String(index).padStart(2, '0')
      return { text: `${value}时`, value }
    }),
    Array.from({ length: 60 }, (_, index) => {
      const value = String(index).padStart(2, '0')
      return { text: `${value}分`, value }
    }),
  ]
})

const searchModeActions = [
  { name: '不允许被搜索', mode: 1 as const },
  { name: '可通过群号搜索', mode: 2 as const },
  { name: '可通过群号及关键词搜索', mode: 3 as const },
]
const searchModeLabel = computed(() =>
  searchModeActions.find((item) => item.mode === detail.value?.searchMode)?.name || '可通过群号及关键词搜索',
)

const canManage = computed(() => !!detail.value?.admin || !!detail.value?.owner)
const isOwner = computed(() => !!detail.value?.owner)

const memberIds = computed(() => new Set((detail.value?.members || []).map((m) => m.userId)))
const addableContacts = computed(() => contacts.value.filter((c) => !c.fileTransferAssistant && !memberIds.value.has(c.userId)))

onMounted(async () => {
  await reload()
  try {
    contacts.value = await fetchContacts()
  } catch {
    contacts.value = []
  }
  await loadScheduledMessages()
})

async function reload() {
  loading.value = true
  try {
    detail.value = await fetchGroupDetail(conversationId.value)
    if (detail.value.admin) await loadScheduledMessages()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '加载失败')
    router.back()
  } finally {
    loading.value = false
  }
}

function goBack() {
  smartBack(router)
}

async function loadScheduledMessages() {
  if (!canManage.value) return
  try {
    scheduledMessages.value = await fetchGroupScheduledMessages(conversationId.value)
  } catch (e) {
    showToast(e instanceof Error ? e.message : '定时消息加载失败')
  }
}

function initials(name: string) {
  return (name || '?').slice(0, 1)
}

function openNoticeDialog() {
  if (!canManage.value) {
    showToast('仅群主或管理员可编辑公告')
    return
  }
  noticeDraft.value = detail.value?.notice || ''
  showNoticeDialog.value = true
}

async function confirmNotice() {
  saving.value = true
  try {
    const notice = noticeDraft.value.trim()
    await updateGroupNotice(conversationId.value, notice)
    if (detail.value) detail.value.notice = notice
    showNoticeDialog.value = false
    showToast('公告已更新')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '更新失败')
  } finally {
    saving.value = false
  }
}

function openWelcomeDialog() {
  if (!canManage.value) {
    showToast('仅群主或管理员可设置群聊欢迎语')
    return
  }
  welcomeDraft.value = detail.value?.welcomeMessage || ''
  showWelcomeDialog.value = true
}

async function confirmWelcome() {
  saving.value = true
  try {
    const message = welcomeDraft.value.trim()
    const old = detail.value?.welcomeMessage || ''
    await updateGroupWelcome(conversationId.value, message)
    if (detail.value) detail.value.welcomeMessage = message
    showWelcomeDialog.value = false
    showToast(message ? (old ? '群聊欢迎语已修改' : '群聊欢迎语已设置') : '群聊欢迎语已清空')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '欢迎语更新失败')
  } finally {
    saving.value = false
  }
}

function localDateTimeValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function scheduledPickerValues(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return [
    String(date.getFullYear()),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
  ]
}

function scheduledDateFromPicker(values: Array<string | number>) {
  const [year, month, rawDay, hour, minute] = values.map(Number)
  if (![year, month, rawDay, hour, minute].every(Number.isFinite)) return null
  const maxDay = new Date(year, month, 0).getDate()
  const day = Math.min(Math.max(rawDay, 1), maxDay)
  return new Date(year, month - 1, day, hour, minute, 0, 0)
}

function scheduledAtDisplay() {
  const date = new Date(scheduledAt.value)
  if (Number.isNaN(date.getTime())) return '请选择发送时间'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}年${pad(date.getMonth() + 1)}月${pad(date.getDate())}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function parseMixedScheduledParts(content: string): ScheduledPart[] {
  try {
    const items = JSON.parse(content)?.items
    if (!Array.isArray(items)) return []
    return items
      .map((item: any): ScheduledPart => ({
        msgType: Number(item?.msgType ?? item?.type) as ScheduledPartType,
        content: String(item?.content || ''),
      }))
      .filter((item) => [0, 1, 2, 3].includes(item.msgType) && item.content.trim())
  } catch {
    return []
  }
}

function scheduledPartsFromRow(row?: GroupScheduledMessage): ScheduledPart[] {
  if (!row) return []
  if (row.msgType === 4) return parseMixedScheduledParts(row.content)
  if (row.msgType === 0 || row.msgType === 1 || row.msgType === 2 || row.msgType === 3) {
    return [{ msgType: row.msgType, content: row.content || '' }]
  }
  return []
}

function openScheduledDialog(row?: GroupScheduledMessage) {
  if (!canManage.value) {
    showToast('仅群主或管理员可设置定时消息')
    return
  }
  editingScheduledId.value = row?.id || ''
  const parts = scheduledPartsFromRow(row)
  scheduledTypes.value = parts.length ? parts.map((part) => part.msgType) : [0]
  scheduledTextContent.value = parts.find((part) => part.msgType === 0)?.content || ''
  scheduledFileContents.value = Object.fromEntries(
    parts.filter((part) => part.msgType !== 0).map((part) => [part.msgType, part.content]),
  ) as Partial<Record<ScheduledPartType, string>>
  scheduledFilePreviewUrls.value = {}
  scheduledVideoReady.value = {}
  for (const part of parts) {
    if (part.msgType !== 0) void hydrateScheduledFilePreview(part.msgType, part.content)
  }
  scheduledAt.value = row?.sendAt
    ? localDateTimeValue(new Date(row.sendAt))
    : localDateTimeValue(new Date(Date.now() + 10 * 60 * 1000))
  scheduledTimePickerValue.value = scheduledPickerValues(new Date(scheduledAt.value))
  showScheduledTypeSheet.value = false
  showScheduledDialog.value = true
}

function scheduledFileName(content: string) {
  try {
    return JSON.parse(content)?.name || '已上传文件'
  } catch {
    return content || '未选择文件'
  }
}

function parseScheduledFile(content: string): ScheduledFile | null {
  try {
    const value = JSON.parse(content)
    return value && typeof value === 'object' ? value : null
  } catch {
    return null
  }
}

function scheduledFileUrl(content: string, type?: ScheduledPartType) {
  const file = parseScheduledFile(content)
  return (type != null && scheduledFilePreviewUrls.value[type])
    || (file?.url ? resolveFileUrl(file.url) : '')
}

function scheduledFileKind(content: string) {
  const file = parseScheduledFile(content)
  const type = String(file?.contentType || '').toLowerCase()
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  return 'file'
}

async function hydrateScheduledFilePreview(type: ScheduledPartType, content: string) {
  const file = parseScheduledFile(content)
  if (!file || scheduledFileKind(content) !== 'video') return
  const fileId = file.fileId || extractChatFileId(file.url || file.originalUrl)
  if (!fileId) return
  scheduledVideoReady.value = { ...scheduledVideoReady.value, [type]: false }
  try {
    const cached = await cacheChatFile(
      'video',
      fileId,
      'preview',
      fileDownloadUrl(fileId, 'preview') || resolveFileUrl(file.previewUrl || file.url),
    )
    if (cached && scheduledFileContents.value[type] === content) {
      scheduledFilePreviewUrls.value = { ...scheduledFilePreviewUrls.value, [type]: cached }
    }
  } catch {
    // The player remains hidden until a valid video frame is available.
  }
}

function onScheduledVideoReady(type: ScheduledPartType) {
  scheduledVideoReady.value = { ...scheduledVideoReady.value, [type]: true }
}

function onScheduledVideoError(type: ScheduledPartType) {
  scheduledVideoReady.value = { ...scheduledVideoReady.value, [type]: false }
}

function toggleScheduledType(type: ScheduledPartType) {
  const selected = scheduledTypes.value.includes(type)
  if (selected && scheduledTypes.value.length === 1) {
    showToast('至少选择一种消息类型')
    return
  }
  const next = selected
    ? scheduledTypes.value.filter((item) => item !== type)
    : [...scheduledTypes.value, type]
  scheduledTypes.value = scheduledTypeOptions
    .map((item) => item.value)
    .filter((item) => next.includes(item))
}

function finishScheduledTypeSelection() {
  if (!scheduledTypes.value.length) {
    scheduledTypes.value = [0]
    showToast('至少选择一种消息类型')
    return
  }
  showScheduledTypeSheet.value = false
}

function chooseScheduledFile(type: ScheduledPartType) {
  scheduledUploadingType.value = type
  scheduledFileInput.value?.click()
}

function scheduledFileAccept(type: ScheduledPartType) {
  return type === 1 ? 'image/*,video/*' : type === 3 ? 'audio/*' : '*/*'
}

function guessedContentType(file: File) {
  if (file.type) return file.type.toLowerCase()
  const extension = file.name.toLowerCase().split('.').pop() || ''
  const byExtension: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
    mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/mp4', webm: 'video/webm',
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg',
  }
  return byExtension[extension] || 'application/octet-stream'
}

async function onScheduledFileChange(event: Event, type: ScheduledPartType) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  scheduledUploading.value = true
  scheduledUploadingType.value = type
  try {
    const fileConfigError = await validateClientFileSend(file)
    if (fileConfigError) throw new Error(fileConfigError)
    const pickedContentType = guessedContentType(file)
    if (type === 1 && !pickedContentType.startsWith('image/') && !pickedContentType.startsWith('video/')) {
      showToast('图片或视频消息只能选择图片、视频文件')
      return
    }
    if (type === 3 && !pickedContentType.startsWith('audio/')) {
      showToast('音频或语音消息只能选择音频文件')
      return
    }
    const uploaded = pickedContentType.startsWith('video/') && file.size > 8 * 1024 * 1024
      ? await uploadVideoResumable(file, { videoCodecHint: 'unknown' })
      : await uploadChatFile(file, { timeout: 600000 })
    const contentType = (uploaded.contentType || pickedContentType).toLowerCase()
    if (type === 1 && !contentType.startsWith('image/') && !contentType.startsWith('video/') && !pickedContentType.startsWith('image/') && !pickedContentType.startsWith('video/')) {
      throw new Error('服务器返回的文件类型不是图片或视频')
    }
    if (type === 3 && !contentType.startsWith('audio/') && !pickedContentType.startsWith('audio/')) {
      throw new Error('服务器返回的文件类型不是音频')
    }
    scheduledFileContents.value = {
      ...scheduledFileContents.value,
      [type]: JSON.stringify({
        fileId: uploaded.fileId || undefined,
        url: uploaded.url,
        originalUrl: uploaded.originalUrl || undefined,
        previewUrl: uploaded.previewUrl || undefined,
        name: normalizeFileName(uploaded.name || file.name) || file.name,
        size: uploaded.size || file.size,
        originalSize: uploaded.originalSize,
        contentType: uploaded.contentType || pickedContentType,
      }),
    }
    void hydrateScheduledFilePreview(type, scheduledFileContents.value[type] || '')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '文件上传失败')
  } finally {
    scheduledUploading.value = false
    scheduledUploadingType.value = null
  }
}

function openScheduledTimePicker() {
  const current = new Date(scheduledAt.value)
  const fallback = new Date(Date.now() + 10 * 60 * 1000)
  scheduledTimePickerValue.value = scheduledPickerValues(Number.isNaN(current.getTime()) ? fallback : current)
  showScheduledTimePicker.value = true
}

function confirmScheduledTime({ selectedValues }: { selectedValues?: Array<string | number> }) {
  const date = scheduledDateFromPicker(selectedValues || scheduledTimePickerValue.value)
  if (!date || date.getTime() <= Date.now()) {
    showToast('请选择未来的发送时间')
    return
  }
  scheduledAt.value = localDateTimeValue(date)
  scheduledTimePickerValue.value = scheduledPickerValues(date)
  showScheduledTimePicker.value = false
}

async function confirmScheduled() {
  const items: ScheduledPart[] = []
  for (const type of scheduledTypes.value) {
    const content = type === 0 ? scheduledTextContent.value.trim() : String(scheduledFileContents.value[type] || '').trim()
    if (!content) {
      showToast(type === 0 ? '请输入定时消息内容' : `请先上传${scheduledTypeOptions.find((item) => item.value === type)?.label || '文件'}`)
      return
    }
    items.push({ msgType: type, content })
  }
  const date = new Date(scheduledAt.value)
  if (!scheduledAt.value || Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
    showToast('请选择未来的发送时间')
    return
  }
  saving.value = true
  try {
    const actualType = items.length === 1 ? items[0].msgType : 4
    const content = items.length === 1 ? items[0].content : JSON.stringify({ version: 1, items })
    const payload: { msgType: 0 | 1 | 2 | 3 | 4; content: string; sendAt: string } = { msgType: actualType, content, sendAt: date.toISOString() }
    if (editingScheduledId.value) {
      await updateGroupScheduledMessage(conversationId.value, editingScheduledId.value, payload)
    } else {
      await createGroupScheduledMessage(conversationId.value, payload)
    }
    showScheduledDialog.value = false
    showToast(editingScheduledId.value ? '定时消息已修改' : '定时消息已创建')
    await loadScheduledMessages()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '定时消息保存失败')
  } finally {
    saving.value = false
  }
}

async function cancelScheduled(row: GroupScheduledMessage) {
  try {
    await showConfirmDialog({ title: '删除定时消息', message: '删除后不会再发送，确定删除？', confirmButtonText: '删除', confirmButtonColor: '#ff5447' })
  } catch {
    return
  }
  try {
    await cancelGroupScheduledMessage(conversationId.value, row.id)
    showToast('已删除')
    await loadScheduledMessages()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '删除失败')
  }
}

function scheduledTypeLabel(type: number) {
  return type === 1 ? '图片/视频' : type === 2 ? '文件' : type === 3 ? '音频/语音' : type === 4 ? '混合消息' : '文字'
}

function scheduledContentLabel(row: GroupScheduledMessage) {
  if (row.msgType === 0) return row.content
  if (row.msgType === 4) {
    const parts = parseMixedScheduledParts(row.content)
    return parts.map((part) => part.msgType === 0 ? '文字' : scheduledFileName(part.content)).join('、') || '混合消息'
  }
  return scheduledFileName(row.content)
}

function scheduledStatusLabel(status: string) {
  return ({ PENDING: '待发送', SENDING: '发送中', SENT: '已发送', FAILED: '失败' } as Record<string, string>)[status] || status
}

function openAdd() {
  if (!detail.value) return
  selected.value = new Set()
  showAdd.value = true
}

function toggleSelect(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

async function confirmAdd() {
  if (selected.value.size === 0) {
    showToast('请选择成员')
    return
  }
  try {
    await addGroupMembers(conversationId.value, [...selected.value])
    showAdd.value = false
    if (detail.value?.joinVerifyRequired && !canManage.value) {
      showToast('已提交加群申请，等待审核')
    } else {
      showToast('已添加')
    }
    await reload()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '添加失败')
  }
}

function canRemove(m: GroupMember): boolean {
  if (!canManage.value || m.role === 'owner') return false
  if (isOwner.value) return true
  return m.role === 'member'
}

async function removeMember(userId: string, nickname: string) {
  if (!canManage.value) {
    showToast('仅群主或管理员可移除成员')
    return
  }
  try {
    await showConfirmDialog({
      title: '移除成员',
      message: `确定将「${nickname}」移出群聊？`,
      confirmButtonText: '移除',
      confirmButtonColor: '#ff5447',
    })
  } catch {
    return
  }
  try {
    await removeGroupMember(conversationId.value, userId)
    showToast('已移除')
    await reload()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '移除失败')
  }
}

async function toggleAdmin(m: GroupMember) {
  if (!isOwner.value || m.role === 'owner') return
  const next = m.role === 'admin' ? 'member' : 'admin'
  const tip = next === 'admin' ? `将「${m.nickname}」设为管理员？` : `取消「${m.nickname}」的管理员？`
  try {
    await showConfirmDialog({
      title: next === 'admin' ? '设置管理员' : '取消管理员',
      message: tip,
      confirmButtonText: '确定',
    })
  } catch {
    return
  }
  try {
    await setGroupMemberRole(conversationId.value, m.userId, next)
    showToast(next === 'admin' ? '已设为管理员' : '已取消管理员')
    await reload()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '操作失败')
  }
}

function canSpeakMute(m: GroupMember): boolean {
  if (!canManage.value || m.role === 'owner') return false
  if (isOwner.value) return true
  return m.role === 'member'
}

async function toggleSpeakMute(m: GroupMember) {
  if (!canSpeakMute(m)) {
    showToast('无权操作')
    return
  }
  const next = !m.speakMuted
  try {
    await showConfirmDialog({
      title: next ? '禁言成员' : '解除禁言',
      message: next ? `禁言「${m.nickname}」？禁言后对方无法发言。` : `解除「${m.nickname}」的禁言？`,
      confirmButtonText: '确定',
    })
  } catch {
    return
  }
  try {
    await setMemberSpeakMuted(conversationId.value, m.userId, next)
    showToast(next ? '已禁言' : '已解除禁言')
    await reload()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '操作失败')
  }
}

async function onMuteAllToggle(checked: boolean) {
  if (!canManage.value) {
    showToast('仅群主或管理员可设置')
    return
  }
  try {
    await setGroupMuteAll(conversationId.value, checked)
    if (detail.value) detail.value.muteAll = checked
    showToast(checked ? '已开启全员禁言' : '已关闭全员禁言')
  } catch (e) {
    if (detail.value) detail.value.muteAll = !checked
    showToast(e instanceof Error ? e.message : '设置失败')
  }
}

async function onJoinVerifyToggle(checked: boolean) {
  if (!canManage.value) {
    showToast('仅群主或管理员可设置')
    return
  }
  try {
    await setJoinVerifyRequired(conversationId.value, checked)
    if (detail.value) detail.value.joinVerifyRequired = checked
    showToast(checked ? '已开启加群审核' : '已关闭加群审核')
  } catch (e) {
    if (detail.value) detail.value.joinVerifyRequired = !checked
    showToast(e instanceof Error ? e.message : '设置失败')
  }
}

async function onMemberAddFriendToggle(checked: boolean) {
  if (!canManage.value) {
    showToast('仅群主或管理员可设置')
    return
  }
  try {
    await setAllowMemberAddFriend(conversationId.value, checked)
    if (detail.value) detail.value.allowMemberAddFriend = checked
    showToast(checked ? '已允许群成员互加好友' : '已禁止群成员互加好友')
  } catch (e) {
    if (detail.value) detail.value.allowMemberAddFriend = !checked
    showToast(e instanceof Error ? e.message : '设置失败')
  }
}

async function onMemberInviteToggle(checked: boolean) {
  if (!canManage.value) {
    showToast('仅群主或管理员可设置')
    return
  }
  try {
    await setMemberInviteAllowed(conversationId.value, checked)
    if (detail.value) detail.value.memberInviteAllowed = checked
    showToast(checked ? '已允许群成员邀请好友进群' : '已禁止群成员邀请好友进群')
  } catch (e) {
    if (detail.value) detail.value.memberInviteAllowed = !checked
    showToast(e instanceof Error ? e.message : '设置失败')
  }
}

async function onSearchModeSelect(action: { mode?: 1 | 2 | 3 }) {
  showSearchModeSheet.value = false
  if (!isOwner.value || !action.mode || action.mode === detail.value?.searchMode) return
  try {
    await setGroupSearchMode(conversationId.value, action.mode)
    if (detail.value) detail.value.searchMode = action.mode
    showToast('群搜索方式已更新')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '设置失败')
  }
}

function openJoinRequests() {
  router.push(`/group/${conversationId.value}/join-requests`)
}

async function transferTo(userId: string, nickname: string) {
  if (!isOwner.value) return
  try {
    await showConfirmDialog({
      title: '转让群主',
      message: `确定将群主转让给「${nickname}」？`,
      confirmButtonText: '转让',
    })
  } catch {
    return
  }
  try {
    await transferGroupOwner(conversationId.value, userId)
    transferring.value = false
    showToast('已转让群主')
    await reload()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '转让失败')
  }
}

async function onDissolve() {
  try {
    await showConfirmDialog({
      title: '解散群聊',
      message: '解散后所有成员将退出，聊天记录不可恢复。确定解散？',
      confirmButtonText: '解散',
      confirmButtonColor: '#ff5447',
    })
  } catch {
    return
  }
  try {
    await dissolveGroup(conversationId.value)
    showToast('群聊已解散')
    router.replace('/app/messages')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '解散失败')
  }
}
</script>

<template>
  <div class="manage-page">
    <header class="page-header">
      <button type="button" class="icon-btn" @click="goBack">
        <span class="material-symbols-outlined">arrow_back_ios</span>
      </button>
      <h1 class="page-title">群管理</h1>
      <span class="spacer" />
    </header>

    <div v-if="loading" class="loading-state">加载中...</div>

    <template v-else-if="detail">
      <section class="card">
        <button type="button" class="menu-row" @click="openNoticeDialog">
          <div>
            <div class="menu-label">群公告</div>
            <p class="menu-sub">{{ detail.notice || '暂无公告' }}</p>
          </div>
          <span v-if="canManage" class="material-symbols-outlined chevron">chevron_right</span>
        </button>
        <button v-if="canManage" type="button" class="menu-row" @click="openWelcomeDialog">
          <div>
            <div class="menu-label">群聊欢迎语</div>
            <p class="menu-sub">{{ detail.welcomeMessage || '新成员进群后自动发送' }}</p>
          </div>
          <span class="material-symbols-outlined chevron">chevron_right</span>
        </button>
        <button type="button" class="menu-row" @click="openAdd">
          <span class="menu-label">添加成员</span>
          <span class="material-symbols-outlined chevron">chevron_right</span>
        </button>
        <div v-if="canManage" class="menu-row switch-row">
          <div>
            <div class="menu-label">全员禁言</div>
            <p class="menu-sub">开启后仅群主与管理员可发言</p>
          </div>
          <label class="switch">
            <input
              type="checkbox"
              :checked="detail.muteAll"
              @change="onMuteAllToggle(($event.target as HTMLInputElement).checked)"
            />
            <span class="slider" />
          </label>
        </div>
        <div v-if="canManage" class="menu-row switch-row">
          <div>
            <div class="menu-label">群成员可互加好友</div>
            <p class="menu-sub">关闭后群成员无法通过群聊资料互相添加好友</p>
          </div>
          <label class="switch">
            <input
              type="checkbox"
              :checked="detail.allowMemberAddFriend"
              @change="onMemberAddFriendToggle(($event.target as HTMLInputElement).checked)"
            />
            <span class="slider" />
          </label>
        </div>
        <button v-if="isOwner" type="button" class="menu-row" @click="showSearchModeSheet = true">
          <div>
            <div class="menu-label">群搜索方式</div>
            <p class="menu-sub">{{ searchModeLabel }}</p>
          </div>
          <span class="material-symbols-outlined chevron">chevron_right</span>
        </button>
        <div v-if="canManage" class="menu-row switch-row">
          <div>
            <div class="menu-label">允许群成员邀请好友进群</div>
            <p class="menu-sub">关闭后仅群主和管理员可以邀请好友</p>
          </div>
          <label class="switch">
            <input
              type="checkbox"
              :checked="detail.memberInviteAllowed"
              @change="onMemberInviteToggle(($event.target as HTMLInputElement).checked)"
            />
            <span class="slider" />
          </label>
        </div>
        <div v-if="canManage" class="menu-row switch-row">
          <div>
            <div class="menu-label">加群需审核</div>
            <p class="menu-sub">开启后需群主/管理员同意才能入群</p>
          </div>
          <label class="switch">
            <input
              type="checkbox"
              :checked="detail.joinVerifyRequired"
              @change="onJoinVerifyToggle(($event.target as HTMLInputElement).checked)"
            />
            <span class="slider" />
          </label>
        </div>
        <button
          v-if="canManage"
          type="button"
          class="menu-row"
          @click="openJoinRequests"
        >
          <div>
            <div class="menu-label">加群申请</div>
            <p class="menu-sub">
              {{ detail.pendingJoinCount > 0 ? `${detail.pendingJoinCount} 条待处理` : '暂无待审核申请' }}
            </p>
          </div>
          <span class="material-symbols-outlined chevron">chevron_right</span>
        </button>
        <button
          v-if="isOwner"
          type="button"
          class="menu-row"
          @click="transferring = !transferring"
        >
          <span class="menu-label">转让群主</span>
          <span class="material-symbols-outlined chevron">{{ transferring ? 'expand_less' : 'chevron_right' }}</span>
        </button>
      </section>

      <section v-if="canManage" class="card automation-card">
        <div class="automation-header">
          <div>
            <div class="menu-label">定时消息</div>
            <p class="menu-sub">按设置人的头像和身份，在指定时间发送文字、图片/视频或文件</p>
          </div>
          <button type="button" class="link-btn" @click="openScheduledDialog()">新增</button>
        </div>
        <div v-if="scheduledMessages.length === 0" class="empty compact-empty">暂无定时消息</div>
        <div v-for="row in scheduledMessages" :key="row.id" class="scheduled-row">
          <div class="scheduled-body">
            <div class="scheduled-title">
              <span class="role-tag">{{ scheduledTypeLabel(row.msgType) }}</span>
              <span>{{ scheduledContentLabel(row) }}</span>
            </div>
            <div class="scheduled-meta">
              {{ new Date(row.sendAt).toLocaleString() }} · {{ scheduledStatusLabel(row.status) }} · {{ row.setterNickname || '设置人' }}
            </div>
            <div v-if="row.lastError" class="scheduled-error">{{ row.lastError }}</div>
          </div>
          <div v-if="row.status === 'PENDING' || row.status === 'FAILED'" class="scheduled-actions">
            <button type="button" class="link-btn" @click="openScheduledDialog(row)">编辑</button>
            <button type="button" class="link-btn danger" @click="cancelScheduled(row)">删除</button>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="section-title">群成员（{{ detail.memberCount }}）</div>
        <div
          v-for="m in detail.members"
          :key="m.userId"
          class="member-row"
        >
          <div class="avatar">
            <img v-if="m.avatarUrl" :src="m.avatarUrl" :alt="m.nickname" />
            <span v-else>{{ initials(m.nickname) }}</span>
          </div>
          <div class="member-body">
            <div class="member-top">
              <div class="member-info">
                <div class="member-nick">{{ m.nickname }}</div>
                <div class="member-tags">
                  <span class="role-tag" :class="m.role">{{ roleLabel(m.role) }}</span>
                  <span v-if="m.speakMuted" class="role-tag muted">禁言中</span>
                </div>
              </div>
              <div v-if="transferring && isOwner && m.role !== 'owner'" class="member-actions">
                <button type="button" class="link-btn" @click="transferTo(m.userId, m.nickname)">
                  设为群主
                </button>
              </div>
            </div>
            <div v-if="!transferring && (isOwner && m.role !== 'owner' || canSpeakMute(m) || canRemove(m))" class="member-actions">
              <button
                v-if="isOwner && m.role !== 'owner'"
                type="button"
                class="link-btn"
                @click="toggleAdmin(m)"
              >
                {{ m.role === 'admin' ? '取消管理' : '设为管理' }}
              </button>
              <button
                v-if="canSpeakMute(m)"
                type="button"
                class="link-btn"
                :class="{ danger: !m.speakMuted }"
                @click="toggleSpeakMute(m)"
              >
                {{ m.speakMuted ? '解除禁言' : '禁言' }}
              </button>
              <button
                v-if="canRemove(m)"
                type="button"
                class="link-btn danger"
                @click="removeMember(m.userId, m.nickname)"
              >
                移除
              </button>
            </div>
          </div>
        </div>
      </section>

      <button v-if="isOwner" type="button" class="dissolve-btn" @click="onDissolve">
        解散群聊
      </button>
    </template>

    <div v-if="showAdd" class="sheet-mask" @click="showAdd = false">
      <div class="sheet" @click.stop>
        <div class="sheet-header">
          <button type="button" class="sheet-cancel" @click="showAdd = false">取消</button>
          <h3>添加成员</h3>
          <button type="button" class="sheet-ok" @click="confirmAdd">完成</button>
        </div>
        <div class="sheet-list">
          <button
            v-for="c in addableContacts"
            :key="c.userId"
            type="button"
            class="contact-row"
            @click="toggleSelect(c.userId)"
          >
            <span class="check" :class="{ on: selected.has(c.userId) }">
              <span v-if="selected.has(c.userId)" class="material-symbols-outlined">check</span>
            </span>
            <span class="name">{{ c.nickname }}</span>
          </button>
          <div v-if="addableContacts.length === 0" class="empty">没有可添加的好友</div>
        </div>
      </div>
    </div>

    <div v-if="showNoticeDialog" class="dialog-mask" @click="showNoticeDialog = false">
      <div class="dialog" @click.stop>
        <h3>编辑群公告</h3>
        <textarea
          v-model="noticeDraft"
          class="dialog-textarea"
          maxlength="500"
          rows="5"
          placeholder="请输入群公告"
        />
        <div class="dialog-actions">
          <button type="button" class="dialog-btn" @click="showNoticeDialog = false">取消</button>
          <button type="button" class="dialog-btn primary" :disabled="saving" @click="confirmNotice">
            确定
          </button>
        </div>
      </div>
    </div>

    <div v-if="showWelcomeDialog" class="dialog-mask" @click="showWelcomeDialog = false">
      <div class="dialog" @click.stop>
        <h3>群聊欢迎语</h3>
        <p class="dialog-tip">有新成员加入时自动发送，发送身份使用本次设置人的头像和昵称。</p>
        <textarea
          v-model="welcomeDraft"
          class="dialog-textarea"
          maxlength="2000"
          rows="6"
          placeholder="例如：欢迎加入本群，请先阅读群公告。留空表示关闭。"
        />
        <div class="dialog-actions">
          <button type="button" class="dialog-btn" @click="showWelcomeDialog = false">取消</button>
          <button type="button" class="dialog-btn primary" :disabled="saving" @click="confirmWelcome">保存</button>
        </div>
      </div>
    </div>

    <div v-if="showScheduledDialog" class="dialog-mask" @click="showScheduledDialog = false">
      <div class="dialog scheduled-dialog" @click.stop>
        <h3>{{ editingScheduledId ? '编辑定时消息' : '新增定时消息' }}</h3>
        <button type="button" class="dialog-picker-button" @click="showScheduledTypeSheet = true">
          <span class="dialog-picker-icon material-symbols-outlined">category</span>
          <span class="dialog-picker-copy">
            <small>消息类型</small>
            <strong>{{ scheduledTypeSummary }}</strong>
            <em>可同时选择多种类型，按下方顺序发送</em>
          </span>
          <span class="material-symbols-outlined dialog-picker-arrow">chevron_right</span>
        </button>
        <textarea
          v-if="scheduledTypes.includes(0)"
          v-model="scheduledTextContent"
          class="dialog-textarea"
          maxlength="20000"
          rows="5"
          placeholder="请输入要定时发送的文字"
        />
        <div v-for="type in scheduledTypes.filter((item) => item !== 0)" :key="type" class="scheduled-file-field">
          <div class="scheduled-file-heading">
            <span class="field-label">{{ scheduledTypeOptions.find((item) => item.value === type)?.label }}</span>
            <span class="scheduled-file-hint">{{ scheduledTypeOptions.find((item) => item.value === type)?.description }}</span>
          </div>
          <div class="file-picker-box">
            <div class="scheduled-file-preview">
              <img v-if="scheduledFileContents[type] && scheduledFileKind(scheduledFileContents[type]!) === 'image'" :src="scheduledFileUrl(scheduledFileContents[type]!)" alt="" />
              <template v-else-if="scheduledFileContents[type] && scheduledFileKind(scheduledFileContents[type]!) === 'video'">
                <video
                  :src="scheduledFileUrl(scheduledFileContents[type]!, type)"
                  :class="{ 'scheduled-video-ready': scheduledVideoReady[type] }"
                  muted
                  controls
                  playsinline
                  preload="metadata"
                  @loadeddata="onScheduledVideoReady(type)"
                  @canplay="onScheduledVideoReady(type)"
                  @playing="onScheduledVideoReady(type)"
                  @error="onScheduledVideoError(type)"
                />
                <span v-if="!scheduledVideoReady[type]" class="scheduled-video-loading">视频加载中…</span>
              </template>
              <audio v-else-if="scheduledFileContents[type] && scheduledFileKind(scheduledFileContents[type]!) === 'audio'" :src="scheduledFileUrl(scheduledFileContents[type]!)" controls preload="metadata" />
              <div v-else class="scheduled-file-icon"><span class="material-symbols-outlined">description</span></div>
              <div class="file-picker-name">{{ scheduledFileContents[type] ? scheduledFileName(scheduledFileContents[type]!) : '未选择文件' }}</div>
            </div>
            <button type="button" class="dialog-btn" :disabled="scheduledUploading" @click="chooseScheduledFile(type)">
              {{ scheduledUploading && scheduledUploadingType === type ? '上传中…' : scheduledFileContents[type] ? '重新选择' : '选择并上传' }}
            </button>
          </div>
        </div>
        <input
          ref="scheduledFileInput"
          type="file"
          class="hidden-file-input"
          :accept="scheduledFileAccept(scheduledUploadingType || 2)"
          @change="onScheduledFileChange($event, scheduledUploadingType || 2)"
        />
        <button type="button" class="dialog-picker-button time-picker-button" @click="openScheduledTimePicker">
          <span class="dialog-picker-icon material-symbols-outlined">schedule</span>
          <span class="dialog-picker-copy">
            <small>发送时间</small>
            <strong>{{ scheduledAtDisplay() }}</strong>
            <em>请选择未来时间，发送前仍可修改</em>
          </span>
          <span class="material-symbols-outlined dialog-picker-arrow">chevron_right</span>
        </button>
        <div class="dialog-actions">
          <button type="button" class="dialog-btn" @click="showScheduledDialog = false">取消</button>
          <button type="button" class="dialog-btn primary" :disabled="saving || scheduledUploading" @click="confirmScheduled">保存</button>
        </div>
      </div>
    </div>

    <van-popup v-model:show="showScheduledTypeSheet" position="bottom" round teleport="body" class="scheduled-picker-popup">
      <section class="scheduled-type-sheet">
        <div class="scheduled-sheet-handle" />
        <div class="scheduled-sheet-header">
          <div>
            <small>定时消息</small>
            <h3>选择消息类型</h3>
          </div>
          <button type="button" aria-label="关闭" @click="finishScheduledTypeSelection"><span class="material-symbols-outlined">close</span></button>
        </div>
        <p class="scheduled-sheet-tip">可多选，保存后会在同一时间按文字、图片/视频、文件、音频/语音的顺序发送。</p>
        <button
          v-for="option in scheduledTypeOptions"
          :key="option.value"
          type="button"
          class="scheduled-type-option"
          :class="{ selected: scheduledTypes.includes(option.value) }"
          @click="toggleScheduledType(option.value)"
        >
          <span class="scheduled-type-option-icon material-symbols-outlined">{{ option.icon }}</span>
          <span class="scheduled-type-option-copy"><strong>{{ option.label }}</strong><small>{{ option.description }}</small></span>
          <span class="material-symbols-outlined scheduled-type-check">{{ scheduledTypes.includes(option.value) ? 'check_circle' : 'radio_button_unchecked' }}</span>
        </button>
        <button type="button" class="scheduled-sheet-done" @click="finishScheduledTypeSelection">完成</button>
      </section>
    </van-popup>

    <van-popup v-model:show="showScheduledTimePicker" position="bottom" round teleport="body" class="scheduled-picker-popup">
      <van-picker
        v-model="scheduledTimePickerValue"
        title="选择发送时间"
        :columns="scheduledTimePickerColumns"
        confirm-button-text="确定"
        cancel-button-text="取消"
        @confirm="confirmScheduledTime"
        @cancel="showScheduledTimePicker = false"
      />
    </van-popup>

    <van-action-sheet
      v-model:show="showSearchModeSheet"
      title="群搜索方式"
      :actions="searchModeActions.map((item) => ({ ...item, name: `${item.name}${detail?.searchMode === item.mode ? '  ✓' : ''}` }))"
      cancel-text="取消"
      close-on-click-action
      @select="onSearchModeSelect"
    />
  </div>
</template>

<style scoped>
.manage-page {
  min-height: 100%;
  background: var(--pulse-page-bg, var(--pulse-bg));
  color: var(--pulse-text);
  padding-bottom: 48px;
}

.page-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  height: 56px;
  padding: 0 12px;
  padding-top: var(--pulse-header-pad-top);
  /* 强制与页面背景一致，覆盖全局浅色主题的渐变顶栏 */
  background: var(--pulse-page-bg, var(--pulse-bg)) !important;
}

.icon-btn {
  border: none;
  background: transparent;
  color: var(--pulse-primary);
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.page-title {
  flex: 1;
  margin: 0;
  text-align: center;
  font-size: 18px;
  font-weight: 600;
  color: var(--pulse-primary);
}

.spacer { width: 40px; }

.card {
  margin: 16px;
  background: var(--pulse-surface-container);
  border-radius: 12px;
  overflow: hidden;
}

.automation-card {
  padding-bottom: 4px;
}

.automation-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
}

.compact-empty {
  padding: 18px 16px 22px;
}

.scheduled-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.scheduled-body {
  min-width: 0;
  flex: 1;
}

.scheduled-title {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--pulse-text);
  font-size: 14px;
}

.scheduled-title > span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scheduled-meta, .scheduled-error {
  margin-top: 5px;
  color: var(--pulse-text-secondary);
  font-size: 12px;
}

.scheduled-error { color: var(--pulse-error); }

.scheduled-actions {
  display: flex;
  gap: 10px;
  flex-shrink: 0;
}

.menu-row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.menu-row:last-child { border-bottom: none; }

.menu-label {
  font-size: 15px;
  color: var(--pulse-text);
}

.menu-sub {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--pulse-text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.chevron {
  color: var(--pulse-outline);
  font-size: 20px;
}

.section-title {
  padding: 14px 16px 8px;
  font-size: 13px;
  color: var(--pulse-text-secondary);
}

.member-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--pulse-surface-highest);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--pulse-primary);
  font-weight: 700;
  flex-shrink: 0;
  margin-top: 2px;
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.member-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.member-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.member-info {
  flex: 1;
  min-width: 0;
}

.member-nick {
  font-size: 15px;
  font-weight: 600;
  color: var(--pulse-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}

.role-tag {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--pulse-outline);
  flex-shrink: 0;
  line-height: 1.3;
}

.role-tag.owner {
  background: rgba(255, 183, 77, 0.2);
  color: #ffb74d;
}

.role-tag.admin {
  background: rgba(75, 142, 255, 0.2);
  color: var(--pulse-primary);
}

.role-tag.muted {
  background: rgba(255, 84, 71, 0.18);
  color: #ff8a80;
}

.switch-row {
  cursor: default;
}

.switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 26px;
  flex-shrink: 0;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.16);
  border-radius: 999px;
  transition: 0.2s;
  cursor: pointer;
}

.slider::before {
  content: '';
  position: absolute;
  width: 20px;
  height: 20px;
  left: 3px;
  top: 3px;
  background: #fff;
  border-radius: 50%;
  transition: 0.2s;
}

.switch input:checked + .slider {
  background: var(--pulse-primary-container);
}

.switch input:checked + .slider::before {
  transform: translateX(18px);
}

.member-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
}

.link-btn {
  border: none;
  background: transparent;
  color: var(--pulse-primary);
  font-size: 13px;
  line-height: 1.4;
  padding: 0;
  cursor: pointer;
  white-space: nowrap;
}

.link-btn.danger { color: var(--pulse-error); }

.dissolve-btn {
  display: block;
  width: calc(100% - 32px);
  margin: 8px 16px 0;
  padding: 16px;
  border: none;
  border-radius: 12px;
  background: #93000a;
  color: #ffdad6;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}

.loading-state, .empty {
  text-align: center;
  padding: 40px 16px;
  color: var(--pulse-text-secondary);
}

.sheet-mask, .dialog-mask {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: flex-end;
}

.dialog-mask {
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.sheet {
  width: 100%;
  max-height: 70vh;
  background: var(--pulse-surface-container);
  border-radius: 16px 16px 0 0;
  overflow: hidden;
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--pulse-outline-variant);
}

.sheet-header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--pulse-text);
}

.sheet-cancel, .sheet-ok {
  border: none;
  background: transparent;
  color: var(--pulse-primary);
  font-size: 14px;
  cursor: pointer;
}

.sheet-list {
  max-height: 56vh;
  overflow-y: auto;
  padding-bottom: env(safe-area-inset-bottom);
}

.contact-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border: none;
  background: transparent;
  color: var(--pulse-text);
  text-align: left;
  cursor: pointer;
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

.name {
  color: var(--pulse-text);
  font-size: 15px;
}

.dialog {
  width: 100%;
  max-width: 360px;
  background: var(--pulse-surface-container);
  border-radius: 16px;
  padding: 20px 16px 12px;
}

.scheduled-dialog {
  max-height: min(88dvh, 720px);
  overflow-y: auto;
}

.dialog h3 {
  margin: 0 0 14px;
  font-size: 17px;
  text-align: center;
}

.dialog-textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: var(--pulse-page-bg, var(--pulse-bg));
  color: var(--pulse-text);
  padding: 12px;
  font-size: 15px;
  outline: none;
  resize: none;
}

.dialog-tip {
  margin: -4px 0 12px;
  color: var(--pulse-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.field-label {
  display: block;
  margin: 12px 0 6px;
  color: var(--pulse-text-secondary);
  font-size: 12px;
}

.dialog-select, .dialog-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--pulse-outline-variant);
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--pulse-surface-highest);
  color: var(--pulse-text);
  font-size: 14px;
}

.scheduled-dialog .dialog-textarea { margin-top: 0; }

.dialog-picker-button {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px 12px;
  border: 1px solid var(--pulse-outline-variant);
  border-radius: 12px;
  background: var(--pulse-surface-highest);
  color: var(--pulse-text);
  text-align: left;
}

.dialog-picker-button:active { transform: scale(.99); }

.dialog-picker-icon {
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  display: grid;
  place-items: center;
  border-radius: 11px;
  background: color-mix(in srgb, var(--pulse-primary) 13%, transparent);
  color: var(--pulse-primary);
  font-size: 20px;
}

.dialog-picker-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.dialog-picker-copy small,
.dialog-picker-copy em {
  color: var(--pulse-text-secondary);
  font-size: 11px;
  font-style: normal;
}

.dialog-picker-copy strong {
  overflow: hidden;
  color: var(--pulse-text);
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dialog-picker-arrow { color: var(--pulse-outline); font-size: 20px; }
.time-picker-button { margin-top: 14px; }

.scheduled-file-field { margin-top: 14px; }

.scheduled-file-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.scheduled-file-heading .field-label { margin: 0 0 6px; }
.scheduled-file-hint { color: var(--pulse-text-secondary); font-size: 11px; }

.file-picker-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border: 1px dashed var(--pulse-outline);
  border-radius: 8px;
  background: var(--pulse-surface-highest);
}

.scheduled-file-preview { position: relative; min-width: 0; display: flex; align-items: center; gap: 9px; }
.scheduled-file-preview img, .scheduled-file-preview video { width: 54px; height: 54px; flex: 0 0 54px; object-fit: cover; border-radius: 8px; background: #111; }
.scheduled-file-preview video:not(.scheduled-video-ready) { visibility: hidden; }
.scheduled-video-loading { position: absolute; left: 0; width: 54px; color: var(--pulse-text-secondary); font-size: 10px; line-height: 1.2; text-align: center; pointer-events: none; }
.scheduled-file-preview audio { width: 150px; max-width: 42vw; }
.scheduled-file-icon { width: 42px; height: 42px; display: grid; place-items: center; color: var(--pulse-primary); background: color-mix(in srgb, var(--pulse-primary) 12%, transparent); border-radius: 8px; }

.file-picker-name {
  min-width: 0;
  color: var(--pulse-text);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hidden-file-input { display: none; }

.dialog-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.dialog-btn {
  flex: 1;
  height: 42px;
  border: none;
  border-radius: 10px;
  background: var(--pulse-surface-highest);
  color: var(--pulse-text-secondary);
  font-size: 15px;
  cursor: pointer;
}

.dialog-btn.primary {
  background: var(--pulse-primary-container);
  color: #001c3a;
  font-weight: 600;
}

.dialog-btn:disabled {
  opacity: 0.6;
}

.scheduled-picker-popup { overflow: hidden; }

.scheduled-type-sheet {
  padding: 10px 16px calc(16px + env(safe-area-inset-bottom, 0px));
  background: var(--pulse-surface-container);
  color: var(--pulse-text);
}

.scheduled-sheet-handle {
  width: 38px;
  height: 4px;
  margin: 0 auto 15px;
  border-radius: 999px;
  background: var(--pulse-outline-variant);
}

.scheduled-sheet-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.scheduled-sheet-header small { color: var(--pulse-primary); font-size: 11px; font-weight: 700; }
.scheduled-sheet-header h3 { margin: 4px 0 0; font-size: 20px; }
.scheduled-sheet-header button { display: grid; width: 34px; height: 34px; place-items: center; border: 0; border-radius: 50%; background: var(--pulse-surface-high); color: var(--pulse-text-secondary); }
.scheduled-sheet-tip { margin: 9px 0 14px; color: var(--pulse-text-secondary); font-size: 12px; line-height: 1.5; }

.scheduled-type-option {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 11px;
  min-height: 60px;
  margin-top: 8px;
  padding: 9px 11px;
  border: 1px solid var(--pulse-outline-variant);
  border-radius: 14px;
  background: var(--pulse-surface-high);
  color: var(--pulse-text);
  text-align: left;
}

.scheduled-type-option.selected {
  border-color: color-mix(in srgb, var(--pulse-primary) 70%, var(--pulse-outline-variant));
  background: color-mix(in srgb, var(--pulse-primary) 10%, var(--pulse-surface-high));
}

.scheduled-type-option-icon {
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  display: grid;
  place-items: center;
  border-radius: 11px;
  background: color-mix(in srgb, var(--pulse-primary) 12%, transparent);
  color: var(--pulse-primary);
}

.scheduled-type-option-copy { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 3px; }
.scheduled-type-option-copy strong { font-size: 14px; }
.scheduled-type-option-copy small { color: var(--pulse-text-secondary); font-size: 11px; }
.scheduled-type-check { color: var(--pulse-outline); font-size: 21px; }
.scheduled-type-option.selected .scheduled-type-check { color: var(--pulse-primary); }

.scheduled-sheet-done {
  width: 100%;
  height: 44px;
  margin-top: 15px;
  border: 0;
  border-radius: 12px;
  background: var(--pulse-primary);
  color: var(--pulse-on-primary);
  font-size: 15px;
  font-weight: 650;
}
</style>

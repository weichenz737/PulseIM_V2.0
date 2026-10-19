<script setup lang="ts">
defineOptions({ name: 'ContactDetailView' })
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { onActivated } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast, showLoadingToast, closeToast, showConfirmDialog } from 'vant'
import {
  fetchUserProfile,
  addFriend,
  deleteFriend,
  blockUser,
  unblockUser,
  acceptFriendRequest,
  fetchFriendRequests,
  updateFriendRemark,
  updateFriendMomentsPermission,
  type UserProfile,
} from '@/api/contact'
import { openPrivateConversation } from '@/api/conversation'
import { fetchUserMoments, isVideoUrl, type MomentItem } from '@/api/moments'
import { useUserStore } from '@/stores/user'
import { useFriendRequestStore } from '@/stores/friendRequest'
import { smartBack } from '@/utils/navBack'
import { friendTagStyle } from '@/utils/friendTagColor'
import { fileDownloadUrl } from '@/api/file'
import { cacheChatFile, getStableChatFileUrl } from '@/utils/fileCache'
import { useVoiceCallStore } from '@/stores/voiceCall'
import { unlockCallRingtoneAudio, prepareCallRingtoneForMic } from '@/utils/callRingtone'
import ShareContactCard from '@/components/ShareContactCard.vue'
import UserAvatar from '@/components/UserAvatar.vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const friendRequest = useFriendRequestStore()
const voiceCall = useVoiceCallStore()
const userId = computed(() => route.params.userId as string)

const profile = ref<UserProfile | null>(null)
const loading = ref(true)
const addVisible = ref(false)
const verifyMessage = ref('')
const remarkName = ref('')
const submitting = ref(false)
const pendingRequestId = ref<string | null>(null)
const peerMoments = ref<MomentItem[]>([])
const localMomentPreviewUrls = ref<Record<string, string>>({})
const moreVisible = ref(false)
const remarkEditVisible = ref(false)
const remarkDraft = ref('')
const remarkSaving = ref(false)
const hideHisMoments = ref(false)
const rejectHisMoments = ref(false)
const permSaving = ref(false)
const shareVisible = ref(false)

const isSelf = computed(() => {
  const me = String(userStore.userId || '')
  return !!me && me === String(userId.value)
})

const friendStatus = computed(() => profile.value?.friendStatus || (profile.value?.friend ? 'friend' : 'none'))
const isFriend = computed(() => friendStatus.value === 'friend')
const showPulseId = computed(
  () => route.query.source !== 'group' || isSelf.value || isFriend.value,
)
const isPendingSent = computed(() => friendStatus.value === 'pending_sent')
const isPendingReceived = computed(() => friendStatus.value === 'pending_received')
const isBlocked = computed(() => !!profile.value?.blocked || friendStatus.value === 'blocked')
const isBlockedByPeer = computed(
  () => !!profile.value?.blockedByPeer || friendStatus.value === 'blocked_by_peer',
)
/** 备注 / 朋友圈权限：拉黑双方均可继续设置（有本端好友关系时） */
const canManageFriendSettings = computed(
  () => !isSelf.value && (isFriend.value || isBlocked.value || isBlockedByPeer.value || !!profile.value?.friend),
)
const commonGroupCount = computed(() => profile.value?.commonGroupCount ?? 0)
const displayName = computed(() => {
  const backendDisplayName = profile.value?.displayName?.trim()
  if (backendDisplayName) return backendDisplayName
  const remark = profile.value?.remark?.trim()
  if (remark) return remark
  return profile.value?.nickname || '用户'
})
const hasRemark = computed(() => !!profile.value?.remark?.trim())
const isDefaultFriend = computed(() => profile.value?.friendAddSource === 'default_friend')
const genderLabel = computed(() => formatGender(profile.value?.gender))
const birthdayLabel = computed(() => formatBirthday(profile.value?.birthday))

const friendSourceText = computed(() => {
  if (!isFriend.value || !profile.value) return ''
  const since = formatFriendSince(profile.value.friendSince)
  if (!since) return ''
  const source = (profile.value.friendAddSource || '').toLowerCase()
  if (source === 'default_friend') {
    return `于${since}由系统添加为好友`
  }
  if (source === 'admin') {
    return `于${since}由管理员添加为好友`
  }
  const sourceLabel = friendSourceLabel(profile.value.friendAddSource)
  const me = String(userStore.userId || '')
  const initiator = String(profile.value.friendAddInitiatorId || '')
  const peerPronoun = peerPronounOf(profile.value.gender)
  if (initiator && me && initiator === me) {
    return `我于${since}通过${sourceLabel}添加${peerPronoun}`
  }
  if (initiator) {
    return `${peerPronoun}于${since}通过${sourceLabel}添加我`
  }
  return `于${since}成为好友（通过${sourceLabel}）`
})

function friendSourceLabel(source?: string): string {
  switch ((source || '').toLowerCase()) {
    case 'phone':
      return '手机号'
    case 'pulse_id':
    case 'id':
      return 'ID'
    case 'group':
      return '群聊'
    case 'qrcode':
    case 'qr':
      return '二维码'
    case 'card':
      return '名片'
    case 'deleted_chat':
    case 'deleted':
      return '聊天记录'
    case 'default_friend':
      return '系统'
    case 'admin':
      return '管理员'
    default:
      return '好友验证'
  }
}

function peerPronounOf(gender?: string): string {
  const g = (gender || '').toLowerCase()
  if (g === 'female' || g === '女' || g === 'f') return '她'
  return '他'
}

function formatGender(gender?: string): string {
  const value = (gender || '').trim()
  const normalized = value.toLowerCase()
  if (normalized === 'female' || normalized === 'f' || value === '女') return '女'
  if (normalized === 'male' || normalized === 'm' || value === '男') return '男'
  return value || '未知'
}

function formatBirthday(birthday?: string): string {
  const value = (birthday || '').trim()
  if (!value) return ''
  const parts = value.split('-')
  if (parts.length !== 3) return value
  const [year, month, day] = parts
  if (!year || !month || !day) return value
  return `${year}年${Number(month)}月${Number(day)}日`
}

function formatFriendSince(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  const h = d.getHours()
  const min = d.getMinutes()
  return `${y}年${m}月${day}日${h}时${String(min).padStart(2, '0')}分`
}

/** 资料页朋友圈预览缩略图（最多 3 张，避免挤） */
const momentPreviewThumbs = computed(() => {
  const thumbs: string[] = []
    for (const m of peerMoments.value) {
    for (const [index, url] of (m.images || []).entries()) {
      if (!url) continue
      const fileId = m.mediaFileIds?.[index]
      const local = fileId ? localMomentPreviewUrls.value[`${m.id}:${index}`] : ''
      if (fileId && !local) continue
      thumbs.push(local || url)
      if (thumbs.length >= 3) return thumbs
    }
  }
  return thumbs
})

function clearLocalMomentPreviewUrls() {
  localMomentPreviewUrls.value = {}
}

async function warmPeerMomentMedia(list: MomentItem[]) {
  await Promise.all(list.flatMap((moment) => (moment.images || []).map(async (source, index) => {
    const fileId = moment.mediaFileIds?.[index]
    const key = `${moment.id}:${index}`
    if (!fileId || localMomentPreviewUrls.value[key]) return
    const stable = getStableChatFileUrl(fileId, 'thumb')
    if (stable) {
      localMomentPreviewUrls.value = { ...localMomentPreviewUrls.value, [key]: stable }
      return
    }
    try {
      const cached = await cacheChatFile(
        moment.mediaTypes?.[index] === 'video' ? 'video' : 'image',
        fileId,
        'thumb',
        fileDownloadUrl(fileId, 'thumb') || source,
      )
      if (cached) localMomentPreviewUrls.value = { ...localMomentPreviewUrls.value, [key]: cached }
    } catch { /* Keep the compact profile preview empty; the full page retries. */ }
  })))
}

const canOpenMoments = computed(() => {
  if (isSelf.value) return true
  if (isBlocked.value || isBlockedByPeer.value) return false
  if (hideHisMoments.value) return false
  return isFriend.value || peerMoments.value.length > 0
})

async function loadPeerMoments() {
  if ((!isBlocked.value && !isBlockedByPeer.value && !profile.value?.hideHisMoments) || isSelf.value) {
    try {
      clearLocalMomentPreviewUrls()
      peerMoments.value = await fetchUserMoments(userId.value)
      await warmPeerMomentMedia(peerMoments.value)
    } catch {
      clearLocalMomentPreviewUrls()
      peerMoments.value = []
    }
  } else {
    peerMoments.value = []
  }
}

async function loadProfile(silent = false) {
  if (!silent) loading.value = true
  try {
    profile.value = await fetchUserProfile(userId.value)
    syncFriendPrefsFromProfile()
    if (profile.value.friendStatus === 'pending_received') {
      const { list } = await fetchFriendRequests()
      const hit = list.find(
        (r) => r.direction === 'incoming' && r.status === 0 && r.fromUserId === String(userId.value),
      )
      pendingRequestId.value = hit?.id || null
    } else {
      pendingRequestId.value = null
    }
    await loadPeerMoments()
  } catch {
    peerMoments.value = []
    showToast('联系人资料加载失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  friendRequest.startWsBridge()
  await loadProfile()
})

onActivated(() => {
  friendRequest.startWsBridge()
  void loadProfile(true)
})

onUnmounted(clearLocalMomentPreviewUrls)

// 对方通过申请后，推送/轮询会 bump revision，资料页立刻从「等待验证」切到「发消息」
watch(
  () => friendRequest.revision,
  () => {
    if (!profile.value || isSelf.value) return
    if (friendStatus.value === 'pending_sent' || friendStatus.value === 'pending_received' || friendStatus.value === 'none') {
      void loadProfile(true)
    }
  },
)

function syncFriendPrefsFromProfile() {
  hideHisMoments.value = !!profile.value?.hideHisMoments
  rejectHisMoments.value = !!profile.value?.rejectHisMoments
}

function goBack() {
  smartBack(router)
}

async function copyPulseId() {
  const value = profile.value?.pulseId || profile.value?.userId || ''
  if (!value) return
  try {
    await navigator.clipboard.writeText(value)
    showToast('PulseID 已复制')
  } catch {
    showToast('当前环境不支持复制，请手动记录')
  }
}

function openMore() {
  if (isSelf.value) {
    showToast('这是你自己的资料')
    return
  }
  if (!canManageFriendSettings.value) {
    showToast('添加好友后可设置备注与朋友圈权限')
    return
  }
  syncFriendPrefsFromProfile()
  moreVisible.value = true
}

function closeMore() {
  moreVisible.value = false
}

function openRemarkEdit() {
  if (isDefaultFriend.value) {
    showToast('后台默认好友的备注不可修改')
    return
  }
  moreVisible.value = false
  remarkDraft.value = profile.value?.remark || ''
  remarkEditVisible.value = true
}

function closeRemarkEdit() {
  remarkEditVisible.value = false
}

async function saveRemark() {
  if (remarkSaving.value || !canManageFriendSettings.value) return
  remarkSaving.value = true
  try {
    const text = remarkDraft.value.trim()
    await updateFriendRemark(userId.value, text)
    if (profile.value) profile.value.remark = text
    remarkEditVisible.value = false
    showToast(text ? '备注已更新' : '已清除备注')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '保存失败')
  } finally {
    remarkSaving.value = false
  }
}

async function onToggleHideHisMoments(checked: boolean) {
  if (!canManageFriendSettings.value || permSaving.value) return
  const prev = hideHisMoments.value
  hideHisMoments.value = checked
  permSaving.value = true
  try {
    await updateFriendMomentsPermission(userId.value, { hideHisMoments: checked })
    if (profile.value) profile.value.hideHisMoments = checked
    if (checked) {
      peerMoments.value = []
      showToast('已设置不看对方朋友圈')
    } else {
      try {
        peerMoments.value = await fetchUserMoments(userId.value)
      } catch {
        peerMoments.value = []
      }
      showToast('已恢复查看对方朋友圈')
    }
  } catch (e) {
    hideHisMoments.value = prev
    showToast(e instanceof Error ? e.message : '设置失败')
  } finally {
    permSaving.value = false
  }
}

async function onToggleRejectHisMoments(checked: boolean) {
  if (!canManageFriendSettings.value || permSaving.value) return
  const prev = rejectHisMoments.value
  rejectHisMoments.value = checked
  permSaving.value = true
  try {
    await updateFriendMomentsPermission(userId.value, { rejectHisMoments: checked })
    if (profile.value) profile.value.rejectHisMoments = checked
    showToast(checked ? '已不让对方看你的朋友圈' : '已允许对方看你的朋友圈')
  } catch (e) {
    rejectHisMoments.value = prev
    showToast(e instanceof Error ? e.message : '设置失败')
  } finally {
    permSaving.value = false
  }
}

async function openSharedFiles() {
  if (!profile.value) return
  if (isSelf.value) {
    showToast('没有与自己的共享文件')
    return
  }
  if (isBlocked.value) {
    showToast('已拉黑对方，无法查看')
    return
  }
  if (isBlockedByPeer.value) {
    showToast('你已被对方拉黑')
    return
  }
  if (!isFriend.value) {
    showToast('对方不是你好友')
    return
  }
  showLoadingToast({ message: '加载中...', forbidClick: true })
  try {
    const conv = await openPrivateConversation(userId.value)
    closeToast()
    router.push({
      path: `/chat/${conv.id}/search`,
      query: {
        title: conv.name || displayName.value,
        peerUserId: conv.peerUserId || userId.value,
        avatar: conv.avatar || profile.value.avatarUrl || '',
        avatarName: profile.value.nickname || '',
        type: 'personal',
        tag: profile.value?.tag || conv.tag || '',
        filter: 'file',
        scope: 'messages',
      },
    })
  } catch (e) {
    closeToast()
    showToast(e instanceof Error ? e.message : '打开失败')
  }
}

async function openSharedMedia() {
  if (!profile.value) return
  if (isSelf.value) {
    showToast('没有与自己的共享媒体')
    return
  }
  if (isBlocked.value) {
    showToast('已拉黑对方，无法查看')
    return
  }
  if (isBlockedByPeer.value) {
    showToast('你已被对方拉黑')
    return
  }
  if (!isFriend.value) {
    showToast('对方不是你好友')
    return
  }
  showLoadingToast({ message: '加载中...', forbidClick: true })
  try {
    const conv = await openPrivateConversation(userId.value)
    closeToast()
    router.push({
      path: `/chat/${conv.id}/search`,
      query: {
        title: conv.name || displayName.value,
        peerUserId: conv.peerUserId || userId.value,
        avatar: conv.avatar || profile.value.avatarUrl || '',
        avatarName: profile.value.nickname || '',
        type: 'personal',
        tag: profile.value?.tag || conv.tag || '',
        filter: 'media',
        scope: 'messages',
      },
    })
  } catch (e) {
    closeToast()
    showToast(e instanceof Error ? e.message : '打开失败')
  }
}

async function startChat() {
  if (!profile.value) return
  if (isSelf.value) {
    showToast('不能给自己发消息')
    return
  }
  if (isBlocked.value) {
    showToast('已拉黑对方，无法聊天')
    return
  }
  if (isBlockedByPeer.value) {
    showToast('你已被对方拉黑')
    return
  }
  if (!isFriend.value) {
    showToast('对方不是你好友，无法聊天')
    return
  }
  showLoadingToast({ message: '打开会话...', forbidClick: true })
  try {
    const conv = await openPrivateConversation(userId.value)
    closeToast()
    router.push({
      path: `/chat/${conv.id}`,
      query: {
        title: conv.name || displayName.value,
        peerUserId: conv.peerUserId || userId.value,
        avatar: conv.avatar || profile.value.avatarUrl || '',
        avatarName: profile.value.nickname || '',
        online: conv.online ? 'true' : 'false',
        type: 'personal',
        tag: profile.value?.tag || conv.tag || '',
      },
    })
  } catch (e) {
    closeToast()
    showToast(e instanceof Error ? e.message : '打开会话失败')
  }
}

function openAddDialog() {
  if (!profile.value || isSelf.value) return
  if (isBlocked.value) {
    showToast('已拉黑对方，请先移出黑名单')
    return
  }
  if (isBlockedByPeer.value) {
    showToast('你已被对方拉黑')
    return
  }
  verifyMessage.value = `我是${userStore.nickname || 'Pulse用户'}`
  remarkName.value = ''
  addVisible.value = true
}

function startVoiceCall() {
  if (!profile.value || isSelf.value) return
  if (isBlocked.value) {
    showToast('已拉黑对方，无法通话')
    return
  }
  if (isBlockedByPeer.value) {
    showToast('你已被对方拉黑')
    return
  }
  if (!isFriend.value) {
    showToast('请先添加好友')
    return
  }
  unlockCallRingtoneAudio()
  prepareCallRingtoneForMic()
  void voiceCall.startOutgoing(
    {
      userId: String(userId.value),
      nickname: displayName.value,
      avatarUrl: profile.value.avatarUrl || '',
    },
    'audio',
  )
}

function startVideoCall() {
  if (!profile.value || isSelf.value) return
  if (isBlocked.value) {
    showToast('已拉黑对方，无法通话')
    return
  }
  if (isBlockedByPeer.value) {
    showToast('你已被对方拉黑')
    return
  }
  if (!isFriend.value) {
    showToast('请先添加好友')
    return
  }
  unlockCallRingtoneAudio()
  prepareCallRingtoneForMic()
  void voiceCall.startOutgoing(
    {
      userId: String(userId.value),
      nickname: displayName.value,
      avatarUrl: profile.value.avatarUrl || '',
    },
    'video',
  )
}

function closeAddDialog() {
  addVisible.value = false
}

async function onAddFriend() {
  if (!profile.value || isSelf.value || submitting.value) return
  submitting.value = true
  try {
    await addFriend(userId.value, {
      message: verifyMessage.value.trim() || undefined,
      remark: remarkName.value.trim() || undefined,
      source: (route.query.source as string) || 'pulse_id',
      groupId:
        route.query.source === 'group' && typeof route.query.groupId === 'string'
          ? route.query.groupId
          : undefined,
    })
    // 若对方也申请过，后端会直接成为好友
    const refreshed = await fetchUserProfile(userId.value)
    profile.value = refreshed
    closeAddDialog()
    if (refreshed.friendStatus === 'friend') {
      showToast('已添加好友')
    } else {
      showToast('好友申请已发送')
    }
    if (route.name === 'UserDetail') {
      router.replace(`/contacts/${userId.value}`)
    }
  } catch (e) {
    showToast(e instanceof Error ? e.message : '添加失败')
  } finally {
    submitting.value = false
  }
}

async function onAcceptIncoming() {
  if (!pendingRequestId.value) {
    router.push('/contacts/new-friends')
    return
  }
  try {
    await acceptFriendRequest(pendingRequestId.value, remarkName.value.trim() || undefined)
    if (profile.value) {
      profile.value.friend = true
      profile.value.friendStatus = 'friend'
    }
    showToast('已添加好友')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '操作失败')
  }
}

async function onDeleteFriend() {
  if (!profile.value || (!isFriend.value && !isBlockedByPeer.value)) return
  if (isDefaultFriend.value) {
    showToast('平台客服不可被拉黑或者删除')
    return
  }
  try {
    await showConfirmDialog({
      title: '删除好友',
      message: `确定删除好友「${displayName.value}」？删除后无法继续聊天，且本端聊天记录将被清空。`,
      confirmButtonText: '删除',
      confirmButtonColor: '#ee0a24',
    })
  } catch {
    return
  }
  showLoadingToast({ message: '删除中...', forbidClick: true })
  try {
    await deleteFriend(userId.value)
    if (profile.value) {
      profile.value.friend = false
      profile.value.friendStatus = profile.value.blockedByPeer ? 'blocked_by_peer' : 'none'
    }
    closeToast()
    showToast('已删除好友')
    router.replace('/app/contacts')
  } catch (e) {
    closeToast()
    showToast(e instanceof Error ? e.message : '删除失败')
  }
}

function openCommonGroups() {
  if (isSelf.value) return
  router.push({
    path: `/contacts/${userId.value}/common-groups`,
    query: { name: displayName.value },
  })
}

function openPeerMoments() {
  if (isSelf.value) {
    router.push('/moments')
    return
  }
  if (isBlocked.value) {
    showToast('已拉黑对方，无法查看朋友圈')
    return
  }
  if (isBlockedByPeer.value) {
    showToast('你已被对方拉黑')
    return
  }
  if (!canOpenMoments.value) {
    showToast('暂无可见动态')
    return
  }
  router.push(`/contacts/${userId.value}/moments`)
}

function seekVideoThumb(e: Event) {
  const el = e.target as HTMLVideoElement | null
  if (!el) return
  try {
    const d = el.duration
    if (Number.isFinite(d) && d > 0) {
      el.currentTime = Math.min(0.12, d * 0.02)
    }
  } catch {
    /* ignore */
  }
}

async function onBlockUser() {
  if (!profile.value || isSelf.value) return
  if (isDefaultFriend.value) {
    showToast('平台客服不可被拉黑或者删除')
    return
  }
  try {
    await showConfirmDialog({
      title: '加入黑名单',
      message: `确定将「${displayName.value}」加入黑名单？加入后双方无法互看朋友圈；会话会从消息列表隐藏，但聊天记录不会清空，备注与朋友圈权限仍可设置。`,
      confirmButtonText: '拉黑',
      confirmButtonColor: '#ee0a24',
    })
  } catch {
    return
  }
  showLoadingToast({ message: '处理中...', forbidClick: true })
  try {
    await blockUser(userId.value)
    if (profile.value) {
      profile.value.friendStatus = 'blocked'
      profile.value.blocked = true
      profile.value.friend = true
    }
    closeToast()
    showToast('已加入黑名单')
  } catch (e) {
    closeToast()
    showToast(e instanceof Error ? e.message : '操作失败')
  }
}

async function onUnblockUser() {
  if (!profile.value || !isBlocked.value) return
  try {
    await showConfirmDialog({
      title: '移出黑名单',
      message: `确定将「${displayName.value}」移出黑名单？移出后会话会重新出现在消息列表，此前聊天记录仍会保留。`,
      confirmButtonText: '移出',
    })
  } catch {
    return
  }
  showLoadingToast({ message: '处理中...', forbidClick: true })
  try {
    await unblockUser(userId.value)
    profile.value = await fetchUserProfile(userId.value)
    closeToast()
    showToast('已移出黑名单')
  } catch (e) {
    closeToast()
    showToast(e instanceof Error ? e.message : '操作失败')
  }
}
</script>

<template>
  <div class="contact-detail-page">
    <div v-if="loading" class="loading-state">加载中...</div>

    <template v-else-if="profile">
      <section class="hero-section">
        <div
          class="hero-bg"
        />
        <div class="hero-gradient" />

        <header class="hero-header">
          <button type="button" class="hero-btn" @click="goBack">
            <span class="material-symbols-outlined">arrow_back</span>
          </button>
          <div class="hero-header-actions">
          <button type="button" class="hero-btn" aria-label="分享名片" @click="shareVisible = true">
            <span class="material-symbols-outlined">share</span>
          </button>
          <button type="button" class="hero-btn" @click="openMore">
            <span class="material-symbols-outlined">more_vert</span>
          </button>
          </div>
        </header>

        <div class="hero-info">
          <UserAvatar
            :src="profile.avatarUrl"
            :user-id="profile.userId"
            :name="displayName"
            :initial-name="profile.nickname"
            :size="76"
            class="hero-avatar"
          />
          <div class="profile-name-row">
            <h1 class="profile-name">{{ displayName }}</h1>
            <span
              v-if="profile?.tag && !profile?.fileTransferAssistant"
              class="profile-tag"
              :style="friendTagStyle(profile.userId)"
            >{{ profile.tag }}</span>
          </div>
          <div class="profile-meta">
            <span v-if="showPulseId" class="meta-primary">PulseID: {{ profile.pulseId || profile.userId }}</span>
            <button v-if="showPulseId" type="button" class="meta-copy" aria-label="复制 PulseID" @click.stop="copyPulseId">
              <span class="material-symbols-outlined">content_copy</span>
            </button>
            <span v-if="showPulseId" class="meta-dot" />
            <span v-if="isSelf">我的资料</span>
            <span v-else-if="isFriend">好友</span>
            <span v-else-if="isPendingSent">待对方同意</span>
            <span v-else-if="isPendingReceived">待你处理</span>
            <span v-else>用户</span>
          </div>
          <div
            v-if="hasRemark && profile.nickname && !isDefaultFriend"
            class="profile-nickname"
          >
            昵称：{{ profile.nickname }}
          </div>
          <div v-if="profile.region" class="profile-region">{{ profile.region }}</div>
          <div v-if="profile.gender || profile.birthday" class="profile-personal-meta">
            <span v-if="profile.gender">性别：{{ genderLabel }}</span>
            <span v-if="profile.birthday">生日：{{ birthdayLabel }}</span>
          </div>
          <div v-if="profile.signature" class="profile-signature">{{ profile.signature }}</div>
        </div>
      </section>

      <section class="content-section">
        <div class="action-grid">
          <button
            v-if="!isSelf && (isFriend || isBlocked || isBlockedByPeer)"
            type="button"
            class="action-card primary"
            @click="startChat"
          >
            <span class="material-symbols-outlined filled">chat</span>
            <span class="action-label">发消息</span>
          </button>
          <button
            v-if="!isSelf && friendStatus === 'none'"
            type="button"
            class="action-card"
            @click="openAddDialog"
          >
            <span class="material-symbols-outlined">person_add</span>
            <span class="action-label">加好友</span>
          </button>
          <button
            v-else-if="!isSelf && isPendingSent"
            type="button"
            class="action-card"
            @click="openAddDialog"
          >
            <span class="material-symbols-outlined">person_add</span>
            <span class="action-label">再次申请</span>
          </button>
          <button
            v-else-if="!isSelf && isPendingReceived"
            type="button"
            class="action-card"
            @click="onAcceptIncoming"
          >
            <span class="material-symbols-outlined">how_to_reg</span>
            <span class="action-label">通过申请</span>
          </button>
          <button
            type="button"
            class="action-card"
            @touchstart.passive="
              unlockCallRingtoneAudio()
            "
            @click="startVoiceCall"
          >
            <span class="material-symbols-outlined">call</span>
            <span class="action-label">语音通话</span>
          </button>
          <button
            type="button"
            class="action-card"
            @touchstart.passive="
              unlockCallRingtoneAudio()
            "
            @click="startVideoCall"
          >
            <span class="material-symbols-outlined">videocam</span>
            <span class="action-label">视频通话</span>
          </button>
        </div>

        <div class="info-list">
          <div v-if="friendSourceText" class="info-card glass-card source-card">
            <div class="info-left">
              <div class="info-icon blue">
                <svg class="source-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M10.59 13.41a2 2 0 0 0 2.82 0l3.18-3.18a2 2 0 0 0-2.82-2.82l-1.06 1.06" />
                  <path d="M13.41 10.59a2 2 0 0 0-2.82 0l-3.18 3.18a2 2 0 0 0 2.82 2.82l1.06-1.06" />
                </svg>
              </div>
              <div>
                <p class="info-title">好友来源</p>
                <p class="info-sub source-text">{{ friendSourceText }}</p>
              </div>
            </div>
          </div>

          <div
            v-if="!isBlocked || isSelf"
            class="info-card glass-card moments-card"
            @click="openPeerMoments"
          >
            <div class="moments-row">
              <div class="moments-text">
                <p class="info-title">朋友圈</p>
                <p class="info-sub">
                  {{
                    peerMoments.length > 0
                      ? `${peerMoments.length} 条动态`
                      : isSelf
                        ? '查看我的朋友圈'
                        : '暂无可见动态'
                  }}
                </p>
              </div>
              <span class="material-symbols-outlined info-arrow">chevron_right</span>
            </div>
            <div v-if="momentPreviewThumbs.length" class="moments-preview">
              <div
                v-for="(thumb, idx) in momentPreviewThumbs"
                :key="idx"
                class="moments-thumb"
              >
                <video
                  v-if="isVideoUrl(thumb)"
                  :src="thumb"
                  muted
                  playsinline
                  preload="metadata"
                  @loadedmetadata="seekVideoThumb"
                />
                <img v-else :src="thumb" alt="" />
              </div>
            </div>
          </div>

          <div class="info-card glass-card" @click="openSharedMedia">
            <div class="info-left">
              <div class="info-icon purple">
                <span class="material-symbols-outlined">photo_library</span>
              </div>
              <div>
                <p class="info-title">共享图片与视频</p>
                <p class="info-sub">查看聊天记录中的图片和视频</p>
              </div>
            </div>
            <span class="material-symbols-outlined info-arrow">chevron_right</span>
          </div>

          <div class="info-card glass-card" @click="openSharedFiles">
            <div class="info-left">
              <div class="info-icon green">
                <span class="material-symbols-outlined">folder_shared</span>
              </div>
              <div>
                <p class="info-title">共享文件</p>
                <p class="info-sub">查看聊天记录中的文件</p>
              </div>
            </div>
            <span class="material-symbols-outlined info-arrow">chevron_right</span>
          </div>

          <div class="info-card glass-card" @click="openCommonGroups">
            <div class="info-left">
              <div class="info-icon blue">
                <span class="material-symbols-outlined">group</span>
              </div>
              <div>
                <p class="info-title">共同群聊</p>
                <p class="info-sub">
                  {{ commonGroupCount > 0 ? `${commonGroupCount} 个共同群聊` : '查看共同所在的群聊' }}
                </p>
              </div>
            </div>
            <span class="material-symbols-outlined info-arrow">chevron_right</span>
          </div>
        </div>

        <div v-if="!isSelf && (isFriend || isBlocked || isBlockedByPeer)" class="danger-zone">
          <button
            v-if="isBlocked"
            type="button"
            class="danger-item"
            @click="onUnblockUser"
          >
            <span>移出黑名单</span>
            <span class="material-symbols-outlined">person_off</span>
          </button>
          <button
            v-else-if="(isFriend || isBlockedByPeer) && !isDefaultFriend"
            type="button"
            class="danger-item"
            @click="onBlockUser"
          >
            <span>加入黑名单</span>
            <span class="material-symbols-outlined">block</span>
          </button>
          <button
            v-if="(isFriend || isBlockedByPeer) && !isDefaultFriend"
            type="button"
            class="danger-item delete"
            @click="onDeleteFriend"
          >
            <span>删除好友</span>
            <span class="material-symbols-outlined">delete</span>
          </button>
        </div>
      </section>
    </template>

    <div v-if="addVisible" class="dialog-mask" @click.self="closeAddDialog">
      <div class="dialog">
        <h3 class="dialog-title">申请添加好友</h3>
        <label class="dialog-label">验证信息</label>
        <textarea
          v-model="verifyMessage"
          class="dialog-textarea"
          maxlength="128"
          rows="3"
          placeholder="请输入验证信息"
        />
        <label class="dialog-label">备注名</label>
        <input
          v-model="remarkName"
          class="dialog-input"
          maxlength="64"
          placeholder="备注名（可选）"
        />
        <div class="dialog-actions">
          <button type="button" class="dialog-btn ghost" @click="closeAddDialog">取消</button>
          <button type="button" class="dialog-btn primary" :disabled="submitting" @click="onAddFriend">
            {{ submitting ? '发送中...' : '发送申请' }}
          </button>
        </div>
      </div>
    </div>

    <van-popup
      v-model:show="moreVisible"
      position="bottom"
      round
      :style="{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }"
    >
      <div class="more-sheet">
        <div class="more-title">好友设置</div>
        <button type="button" class="more-item" :disabled="isDefaultFriend" @click="openRemarkEdit">
          <div class="more-item-text">
            <span class="more-label">设置备注</span>
            <span class="more-sub">
              {{ isDefaultFriend ? '由后台统一设置，不可修改' : (hasRemark ? displayName : '未设置') }}
            </span>
          </div>
          <span v-if="!isDefaultFriend" class="material-symbols-outlined more-chevron">chevron_right</span>
        </button>
        <div class="more-item switch-item">
          <div class="more-item-text">
            <span class="more-label">不看他的朋友圈</span>
            <span class="more-sub">开启后对方动态不再出现在你的朋友圈</span>
          </div>
          <button
            type="button"
            class="pulse-switch"
            :class="{ on: hideHisMoments }"
            :disabled="permSaving"
            role="switch"
            :aria-checked="hideHisMoments"
            @click="onToggleHideHisMoments(!hideHisMoments)"
          >
            <span class="pulse-switch-knob" />
          </button>
        </div>
        <div class="more-item switch-item">
          <div class="more-item-text">
            <span class="more-label">不让他看我的朋友圈</span>
            <span class="more-sub">开启后对方无法查看你的朋友圈</span>
          </div>
          <button
            type="button"
            class="pulse-switch"
            :class="{ on: rejectHisMoments }"
            :disabled="permSaving"
            role="switch"
            :aria-checked="rejectHisMoments"
            @click="onToggleRejectHisMoments(!rejectHisMoments)"
          >
            <span class="pulse-switch-knob" />
          </button>
        </div>
        <button type="button" class="more-cancel" @click="closeMore">关闭</button>
      </div>
    </van-popup>
    <ShareContactCard
      v-if="profile"
      v-model:show="shareVisible"
      :card="{ cardType: 'user', userId: profile.userId, nickname: displayName, avatarUrl: profile.avatarUrl, pulseId: profile.pulseId }"
    />

    <div v-if="remarkEditVisible" class="dialog-mask" @click.self="closeRemarkEdit">
      <div class="dialog">
        <h3 class="dialog-title">设置备注</h3>
        <label class="dialog-label">备注名</label>
        <input
          v-model="remarkDraft"
          class="dialog-input"
          maxlength="64"
          placeholder="输入备注名（可留空）"
        />
        <div class="dialog-actions">
          <button type="button" class="dialog-btn ghost" @click="closeRemarkEdit">取消</button>
          <button type="button" class="dialog-btn primary" :disabled="remarkSaving" @click="saveRemark">
            {{ remarkSaving ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.contact-detail-page {
  min-height: 100vh;
  background: var(--pulse-page-bg, var(--pulse-bg));
  padding-bottom: 32px;
}

.hero-section {
  position: relative;
  height: 397px;
  width: 100%;
  overflow: hidden;
}

.hero-bg {
  position: absolute;
  inset: 0;
  background-color: #1a1f3a;
  background-image:
    radial-gradient(circle at 78% 18%, rgba(75, 142, 255, 0.42), transparent 38%),
    radial-gradient(circle at 18% 58%, rgba(113, 82, 198, 0.34), transparent 42%),
    linear-gradient(145deg, #18213a 0%, #242044 52%, var(--pulse-bg) 100%);
  background-size: cover;
  background-position: center;
}

.hero-gradient {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, var(--pulse-bg), rgba(18, 19, 23, 0.2), transparent);
}

.hero-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 20;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  padding-top: var(--pulse-header-pad-top);
}

.hero-btn {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: var(--pulse-nav-bg, rgba(30, 31, 35, 0.4));
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: var(--pulse-primary, var(--pulse-text));
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.15s;
}

.hero-btn:active {
  transform: scale(0.9);
}

.hero-info {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 10;
  padding: 0 16px 24px;
}

.hero-avatar {
  display: block;
  width: 88px;
  height: 88px;
  margin-bottom: 14px;
  border: 3px solid rgba(255, 255, 255, 0.72);
  border-radius: 22px;
  object-fit: cover;
  background: var(--pulse-surface-highest);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.3);
}

.hero-avatar.initials {
  display: grid;
  place-items: center;
  color: var(--pulse-primary);
  font-size: 34px;
  font-weight: 700;
}

.profile-name-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 4px;
}

.profile-name {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
  line-height: 34px;
  color: var(--pulse-text);
}

.profile-tag {
  flex: none;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
}

.profile-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--pulse-text);
  opacity: 0.8;
}

.profile-nickname {
  margin-top: 6px;
  font-size: 13px;
  color: rgba(227, 226, 231, 0.72);
}

.profile-region {
  margin-top: 8px;
  font-size: 13px;
  color: var(--pulse-text);
  opacity: 0.75;
}

.profile-personal-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 6px;
  font-size: 13px;
  color: var(--pulse-text);
  opacity: 0.75;
}

.profile-signature {
  margin-top: 4px;
  font-size: 13px;
  line-height: 1.4;
  color: var(--pulse-text);
  opacity: 0.65;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.meta-primary {
  color: var(--pulse-primary);
}

.meta-copy {
  display: inline-grid;
  width: 24px;
  height: 24px;
  margin-left: -4px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 7px;
  background: color-mix(in srgb, var(--pulse-primary) 12%, transparent);
  color: var(--pulse-primary);
}

.meta-copy .material-symbols-outlined {
  font-size: 15px;
}

.meta-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--pulse-outline-variant);
}

.content-section {
  padding: 24px 16px 0;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.action-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px 8px;
  border: none;
  border-radius: 12px;
  background: var(--pulse-surface-high);
  color: var(--pulse-text);
  cursor: pointer;
  transition: background 0.2s, opacity 0.2s;
}

.action-card:active {
  opacity: 0.8;
}

.action-card.primary {
  background: var(--pulse-primary-container);
  color: var(--pulse-on-primary-container);
}

.action-card .material-symbols-outlined {
  font-size: 24px;
  margin-bottom: 8px;
}

.action-label {
  font-size: 13px;
  font-weight: 500;
}

.info-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.info-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.info-card:active {
  background: rgba(52, 53, 57, 0.8);
}

.info-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.info-icon {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.info-icon.green {
  background: rgba(4, 195, 57, 0.2);
  color: var(--pulse-secondary);
}

.info-icon.blue {
  background: rgba(173, 198, 255, 0.2);
  color: var(--pulse-primary);
}

.source-icon-svg {
  width: 24px;
  height: 24px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.info-icon.purple {
  background: rgba(186, 156, 255, 0.2);
  color: #c4a8ff;
}

.moments-card {
  flex-direction: column;
  align-items: stretch;
  gap: 14px;
  padding: 18px 16px;
}

.moments-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.moments-text {
  min-width: 0;
  flex: 1;
}

.moments-text .info-sub {
  margin-top: 4px;
}

.moments-preview {
  display: flex;
  align-items: center;
  gap: 8px;
}

.moments-thumb {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--pulse-surface-high);
  flex-shrink: 0;
}

.moments-thumb img,
.moments-thumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.info-title {
  margin: 0;
  font-size: 17px;
  line-height: 24px;
  color: var(--pulse-text);
}

.info-sub {
  margin: 2px 0 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--pulse-text-secondary);
}

.source-card {
  cursor: default;
}

.source-card:active {
  transform: none;
}

.source-text {
  font-weight: 500;
  font-size: 12px;
  line-height: 1.45;
  white-space: normal;
}

.info-arrow {
  font-size: 22px;
  color: var(--pulse-outline-variant);
  transition: color 0.2s;
}

.danger-zone {
  padding-top: 16px;
  border-top: 1px solid rgba(65, 71, 85, 0.2);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.danger-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--pulse-text);
  font-size: 15px;
  cursor: pointer;
  transition: background 0.2s;
}

.danger-item:active {
  background: var(--pulse-surface-low);
}

.danger-item.delete {
  color: var(--pulse-error);
}

.danger-item.delete:active {
  background: rgba(147, 0, 10, 0.1);
}

.danger-item .material-symbols-outlined {
  font-size: 22px;
  color: var(--pulse-outline-variant);
}

.danger-item.delete .material-symbols-outlined {
  color: var(--pulse-error);
}

.loading-state {
  text-align: center;
  padding: 48px;
  color: var(--pulse-text-secondary);
}

.action-card:disabled {
  opacity: 0.55;
  cursor: default;
}

.dialog-mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.dialog {
  width: 100%;
  max-width: 360px;
  background: var(--pulse-surface-container);
  border-radius: 16px;
  padding: 20px;
}

.dialog-title {
  margin: 0 0 16px;
  font-size: 17px;
  font-weight: 600;
  color: var(--pulse-text);
}

.dialog-label {
  display: block;
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--pulse-text-secondary);
}

.dialog-textarea,
.dialog-input {
  width: 100%;
  box-sizing: border-box;
  margin-bottom: 14px;
  padding: 12px 14px;
  border: none;
  border-radius: 10px;
  background: var(--pulse-surface-high);
  color: var(--pulse-text);
  font-size: 15px;
  outline: none;
  resize: none;
}

.dialog-actions {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}

.dialog-btn {
  flex: 1;
  border: none;
  border-radius: 10px;
  padding: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.dialog-btn.ghost {
  background: var(--pulse-surface-high);
  color: var(--pulse-text-secondary);
}

.dialog-btn.primary {
  background: var(--pulse-primary-container);
  color: var(--pulse-on-primary-container);
}

.dialog-btn:disabled {
  opacity: 0.6;
}

.more-sheet {
  padding: 8px 16px 12px;
  background: var(--pulse-surface-container);
  color: var(--pulse-text);
}

.more-title {
  text-align: center;
  font-size: 13px;
  color: var(--pulse-text-secondary);
  padding: 10px 0 6px;
}

.more-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 4px;
  border: none;
  border-bottom: 1px solid var(--pulse-divider);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.more-item.switch-item {
  cursor: default;
}

.more-item-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.more-label {
  font-size: 16px;
  font-weight: 500;
  color: var(--pulse-text);
}

.more-sub {
  font-size: 12px;
  color: var(--pulse-text-secondary);
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.more-chevron {
  font-size: 22px;
  color: var(--pulse-outline);
}

.more-cancel {
  width: 100%;
  margin-top: 8px;
  padding: 14px;
  border: none;
  border-radius: 12px;
  background: var(--pulse-surface-high);
  color: var(--pulse-text-secondary);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.hero-header-actions { display: flex; align-items: center; gap: 12px; }

:global(:root[data-theme='light'] .pulse-switch:not(.on)) {
  background: #c8d8e4;
}

.pulse-switch {
  flex-shrink: 0;
  width: 46px;
  height: 28px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  padding: 2px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.pulse-switch.on {
  background: var(--pulse-primary-container);
}

.pulse-switch:disabled {
  opacity: 0.55;
  cursor: default;
}

.pulse-switch-knob {
  display: block;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  transition: transform 0.2s ease;
}

.pulse-switch.on .pulse-switch-knob {
  transform: translateX(18px);
}
</style>

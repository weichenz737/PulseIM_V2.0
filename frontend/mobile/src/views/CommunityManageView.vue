<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { showConfirmDialog, showDialog, showLoadingToast, closeToast, showToast } from 'vant'
import { useRoute, useRouter } from 'vue-router'
import {
  communityDetail,
  fetchCommunityDashboard,
  fetchCommunityManagePosts,
  fetchCommunityManageReports,
  fetchCommunityMemberRemovalReasons,
  fetchCommunityMembers,
  fetchCommunityJoinRequests,
  fetchCommunityLeaveRequests,
  reviewCommunityLeaveRequest,
  transferCommunityOwner,
  dissolveCommunity,
  moderateCommunityPost,
  moderateCommunityReportedPost,
  reviewCommunityJoinRequest,
  setCommunityMemberAdmin,
  setCommunityMemberPermissions,
  setCommunityMemberStatus,
  updateCommunity,
  type Community,
  type CommunityDashboard,
  type CommunityMemberRemovalReason,
  type CommunityMember,
  type CommunityPost,
  type CommunityManageReport,
  type CommunityJoinRequest,
  type CommunityLeaveRequest,
} from '@/api/community'
import CommunityChoicePicker from '@/components/CommunityChoicePicker.vue'
import { uploadChatFile, resolveAvatarUrl, resolveFileUrl } from '@/api/file'
import { fetchNicknameConfig } from '@/api/nicknameConfig'
import { useUserStore } from '@/stores/user'
import { smartBack } from '@/utils/navBack'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const communityId = Number(route.params.id)
const community = ref<Community>()
const dashboard = ref<CommunityDashboard>()
const members = ref<CommunityMember[]>([])
const contentPosts = ref<CommunityPost[]>([])
const reportItems = ref<CommunityManageReport[]>([])
const joinRequests = ref<CommunityJoinRequest[]>([])
const leaveRequests = ref<CommunityLeaveRequest[]>([])
const loading = ref(true)
const refreshing = ref(false)
const activeTab = ref<'overview' | 'members' | 'content' | 'reports' | 'settings'>('overview')
const keyword = ref('')
const memberStatus = ref('')
const contentKeyword = ref('')
const contentStartDate = ref('')
const contentEndDate = ref('')
const contentSort = ref<'LATEST' | 'LIKE_COUNT' | 'COMMENT_COUNT' | 'FORWARD_COUNT'>('LATEST')
const datePickerVisible = ref(false)
const datePickerField = ref<'start' | 'end'>('start')
const datePickerMinDate = new Date(1970, 0, 1)
const sortPickerVisible = ref(false)
const datePickerMaxDate = new Date()
const postModePickerVisible = ref(false)
const joinReviewPickerVisible = ref(false)
const leaveReviewPickerVisible = ref(false)
const memberLoading = ref(false)
const saving = ref(false)
const avatarInput = ref<HTMLInputElement | null>(null)
const permissionVisible = ref(false)
const permissionTarget = ref<CommunityMember>()
const permissionDraft = ref<string[]>([])
const removeMemberVisible = ref(false)
const removeMemberTarget = ref<CommunityMember>()
const removalReasons = ref<CommunityMemberRemovalReason[]>([])
const selectedRemovalReason = ref('')
const removalReasonDetail = ref('')
const removalReasonLoading = ref(false)
const removingMember = ref(false)
const actionSheetVisible = ref(false)
const actionSheetActions = ref<Array<{ name: string }>>([])
let actionSheetResolve: ((value: string | null) => void) | null = null

const edit = reactive({ name: '', avatar: '', description: '', announcement: '', rules: '', postMode: 'ALL', joinReviewRequired: false, leaveReviewRequired: false })
const communityNicknameMaxLength = ref(30)
const postModeOptions = [
  { value: 'ALL', label: '成员直接发布', description: '成员发布的动态会立即展示', icon: 'edit_note' },
  { value: 'REVIEW', label: '发布需要审核', description: '管理员审核通过后动态才会展示', icon: 'fact_check' },
  { value: 'ADMIN_ONLY', label: '仅管理员发布', description: '只有圈主和管理员可以发布动态', icon: 'admin_panel_settings' },
] as const
const joinReviewOptions = [
  { value: 'false', label: '无需审核', description: '用户确认后可以直接加入圈子', icon: 'person_add' },
  { value: 'true', label: '需要审核', description: '圈主或管理员通过后用户才能加入', icon: 'how_to_reg' },
] as const
const leaveReviewOptions = [
  { value: 'false', label: '无需审核', description: '成员确认后可以直接退出圈子', icon: 'logout' },
  { value: 'true', label: '需要审核', description: '圈主或管理员通过后成员才会退出', icon: 'approval' },
] as const
const selectedPostMode = computed(() => postModeOptions.find((item) => item.value === edit.postMode) || postModeOptions[0])
const selectedJoinReview = computed(() => joinReviewOptions.find((item) => item.value === String(edit.joinReviewRequired)) || joinReviewOptions[0])
const selectedLeaveReview = computed(() => leaveReviewOptions.find((item) => item.value === String(edit.leaveReviewRequired)) || leaveReviewOptions[0])
const isOwner = computed(() => community.value?.my_role === 'OWNER')
const myMember = computed(() => members.value.find((member) => String(member.user_id) === String(userStore.userId)))
const canManageMembers = computed(() => isOwner.value || (community.value?.my_role === 'ADMIN' && parsePermissions(myMember.value?.permissions).includes('MEMBERS')))
const canManageContent = computed(() => isOwner.value || (community.value?.my_role === 'ADMIN' && parsePermissions(myMember.value?.permissions).includes('CONTENT')))
const canManageReports = computed(() => isOwner.value || community.value?.my_role === 'ADMIN')
const pendingContentCount = computed(() => contentPosts.value.filter((post) => post.status === 'PENDING').length)
const pendingReportCount = computed(() => reportItems.value.length)
const contentSortOptions = [
  { value: 'LATEST', label: '最新发布', icon: 'schedule' },
  { value: 'LIKE_COUNT', label: '点赞数最多', icon: 'favorite' },
  { value: 'COMMENT_COUNT', label: '评论数最多', icon: 'chat_bubble' },
  { value: 'FORWARD_COUNT', label: '转发数最多', icon: 'repeat' },
] as const
const selectedContentSort = computed(() => contentSortOptions.find((item) => item.value === contentSort.value) || contentSortOptions[0])
const activeDateValue = computed(() => datePickerField.value === 'start' ? contentStartDate.value : contentEndDate.value)
const datePickerDefaultDate = computed(() => {
  const value = activeDateValue.value
  if (value) {
    const date = new Date(`${value}T12:00:00`)
    if (!Number.isNaN(date.getTime())) return date
  }
  return new Date()
})

const stats = computed(() => [
  { label: '总成员', value: dashboard.value?.member_count ?? 0, icon: 'group', detailType: 'TOTAL_MEMBERS' },
  { label: '今日新增', value: dashboard.value?.today_new ?? 0, icon: 'person_add', detailType: 'TODAY_NEW' },
  { label: '累计加入', value: dashboard.value?.cumulative_join ?? 0, icon: 'trending_up', detailType: 'CUMULATIVE_JOIN' },
  { label: '累计退出', value: dashboard.value?.cumulative_exit ?? 0, icon: 'trending_down', detailType: 'CUMULATIVE_EXIT' },
  { label: '活跃人数', value: dashboard.value?.active_members ?? 0, icon: 'bolt', detailType: 'ACTIVE_MEMBERS' },
  { label: '动态数量', value: dashboard.value?.post_total ?? 0, icon: 'article', detailType: 'POSTS' },
  { label: '评论数量', value: dashboard.value?.comment_total ?? 0, icon: 'chat_bubble', detailType: undefined },
  { label: '点赞数量', value: dashboard.value?.like_total ?? 0, icon: 'favorite', detailType: undefined },
])

const revenueStats = computed(() => [
  { label: '累计收入', value: formatAmount(dashboard.value?.income_total ?? 0), icon: 'payments', detailType: 'INCOME_TOTAL' },
  { label: '今日收入', value: formatAmount(dashboard.value?.income_today ?? 0), icon: 'today', detailType: 'INCOME_TODAY' },
  { label: '可提现金额', value: formatAmount(dashboard.value?.withdrawable ?? 0), icon: 'account_balance_wallet', detailType: undefined },
  { label: '订单数量', value: dashboard.value?.order_count ?? 0, icon: 'receipt_long', detailType: 'ORDERS' },
])

function parsePermissions(raw?: string) {
  return String(raw || '').split(',').map((item) => item.trim()).filter(Boolean)
}

function formatAmount(value: number) {
  return `${(Number(value || 0) / 100).toFixed(2)} PLU`
}

function roleLabel(role: string) {
  return role === 'OWNER' ? '圈主' : role === 'ADMIN' ? '管理员' : '成员'
}

function statusLabel(status: string) {
  return status === 'MUTED' ? '已禁言' : status === 'REMOVED' ? '已移除' : '正常'
}

function postStatusLabel(status: string) {
  if (status === 'PENDING') return '待审核'
  if (status === 'PUBLISHED') return '已发布'
  if (status === 'BLOCKED') return '已屏蔽'
  if (status === 'DELETED') return '已删除'
  return '未知状态'
}

function openActionSheet(actions: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    actionSheetResolve = resolve
    actionSheetActions.value = actions.map((name) => ({ name }))
    actionSheetVisible.value = true
  })
}

function onActionSheetSelect(action: { name?: string }) {
  actionSheetVisible.value = false
  const resolve = actionSheetResolve
  actionSheetResolve = null
  resolve?.(action.name || null)
}

function onActionSheetCancel() {
  actionSheetVisible.value = false
  const resolve = actionSheetResolve
  actionSheetResolve = null
  resolve?.(null)
}

async function load(silent = false) {
  if (!silent) loading.value = true
  try {
    const detail = await communityDetail(communityId)
    community.value = detail
    edit.name = detail.pending_name_review ? (detail.pending_name || detail.name || '') : (detail.name || '')
    edit.avatar = detail.pending_avatar_review ? (detail.pending_avatar || '') : (detail.avatar || '')
    edit.description = detail.description || ''
    edit.announcement = detail.announcement || ''
    edit.rules = detail.rules || ''
    edit.postMode = detail.post_mode || 'ALL'
    edit.joinReviewRequired = Boolean(detail.join_review_required)
    edit.leaveReviewRequired = Boolean(detail.leave_review_required)
    dashboard.value = await fetchCommunityDashboard(communityId)
    await loadMembers()
    await loadJoinRequests()
    await loadLeaveRequests()
    if (canManageContent.value) await loadContent()
    if (canManageReports.value) await loadReports()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '管理数据加载失败')
  } finally {
    if (!silent) loading.value = false
  }
}

async function onPullRefresh() {
  refreshing.value = true
  try {
    await load(true)
  } finally {
    refreshing.value = false
  }
}

async function loadContent() {
  try {
    contentPosts.value = await fetchCommunityManagePosts(communityId, {
      keyword: contentKeyword.value.trim() || undefined,
      startDate: contentStartDate.value || undefined,
      endDate: contentEndDate.value || undefined,
      sort: contentSort.value,
      page: 1,
      size: 200,
    })
  } catch (e) {
    showToast(e instanceof Error ? e.message : '动态加载失败')
  }
}

async function applyContentFilters() {
  if (contentStartDate.value && contentEndDate.value && contentStartDate.value > contentEndDate.value) {
    showToast('开始日期不能晚于结束日期')
    return
  }
  await loadContent()
}

function openDatePicker(field: 'start' | 'end') {
  datePickerField.value = field
  datePickerVisible.value = true
}

function formatFilterDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function onDateConfirm(date: Date) {
  const value = formatFilterDate(date)
  if (datePickerField.value === 'start') contentStartDate.value = value
  else contentEndDate.value = value
  datePickerVisible.value = false
  void applyContentFilters()
}

function selectContentSort(value: typeof contentSort.value) {
  contentSort.value = value
  sortPickerVisible.value = false
  void applyContentFilters()
}

async function loadReports() {
  try {
    reportItems.value = await fetchCommunityManageReports(communityId)
  } catch (e) {
    showToast(e instanceof Error ? e.message : '举报动态加载失败')
  }
}

async function loadMembers() {
  memberLoading.value = true
  try {
    members.value = await fetchCommunityMembers(communityId, keyword.value.trim(), memberStatus.value)
  } catch (e) {
    showToast(e instanceof Error ? e.message : '成员加载失败')
  } finally {
    memberLoading.value = false
  }
}

async function loadJoinRequests() {
  try {
    joinRequests.value = await fetchCommunityJoinRequests(communityId)
  } catch {
    joinRequests.value = []
  }
}

async function loadLeaveRequests() {
  try { leaveRequests.value = await fetchCommunityLeaveRequests(communityId) } catch { leaveRequests.value = [] }
}

async function reviewLeave(request: CommunityLeaveRequest, status: 'APPROVED' | 'REJECTED') {
  try {
    await showConfirmDialog({ title: status === 'APPROVED' ? '同意退出申请' : '拒绝退出申请', message: `${request.nickname}：${request.reason}` })
    const reason = window.prompt('审核备注（可不填）') || ''
    await reviewCommunityLeaveRequest(communityId, request.id, status, reason)
    showToast('退出申请已处理')
    await Promise.all([loadLeaveRequests(), loadMembers()])
  } catch { /* cancelled */ }
}

async function reviewJoin(request: CommunityJoinRequest, status: 'APPROVED' | 'REJECTED') {
  try {
    if (status === 'REJECTED') await showConfirmDialog({ title: '拒绝加入申请', message: `确定拒绝 ${request.nickname} 的加入申请吗？` })
    await reviewCommunityJoinRequest(communityId, request.id, status)
    showToast(status === 'APPROVED' ? '已通过加入申请' : '已拒绝加入申请')
    await loadJoinRequests()
  } catch {
    // cancelled
  }
}

function openDataDetail(type?: string) {
  if (type) void router.push(`/communities/${communityId}/manage/data/${type}`)
}

function openPost(post: CommunityPost) {
  void router.push(`/communities/${communityId}/posts/${post.id}`)
}

function goBack() {
  smartBack(router, `/communities/${communityId}`)
}

function openAvatarPicker() {
  if (!isOwner.value) return
  avatarInput.value?.click()
}

async function onAvatarSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) return showToast('请选择图片')
  if (file.size > 20 * 1024 * 1024) return showToast('图片不能超过20MB')
  showLoadingToast({ message: '上传头像…', forbidClick: true })
  try {
    const uploaded = await uploadChatFile(file)
    edit.avatar = uploaded.url
    closeToast()
  } catch (e) {
    closeToast()
    showToast(e instanceof Error ? e.message : '头像上传失败')
  }
}

async function saveSettings() {
  if (!isOwner.value || saving.value) return
  saving.value = true
  try {
    const result = await updateCommunity(communityId, { ...edit })
    showToast(result.profileReviewPending ? '设置已保存，名称或头像等待后台审核' : '资料已保存')
    await load()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '保存失败')
  } finally {
    saving.value = false
  }
}

async function memberAction(member: CommunityMember) {
  if (member.role === 'OWNER' || !canManageMembers.value) return
  const actions = [member.status === 'MUTED' ? '解除禁言' : '禁言', '移除成员']
  if (isOwner.value) actions.unshift(member.role === 'ADMIN' ? '取消管理员' : '设为管理员')
  if (isOwner.value && member.role === 'ADMIN') actions.splice(1, 0, '配置管理员权限')
  try {
    const selected = await openActionSheet(actions)
    if (selected === '配置管理员权限') return openPermissions(member)
    if (selected === '设为管理员' || selected === '取消管理员') {
      await setCommunityMemberAdmin(communityId, member.id, selected === '设为管理员')
      showToast('管理员设置已更新')
    } else if (selected === '禁言' || selected === '解除禁言') {
      await setCommunityMemberStatus(communityId, member.id, selected === '禁言' ? 'MUTED' : 'ACTIVE')
      showToast('成员状态已更新')
    } else if (selected === '移除成员') {
      await openRemoveMemberDialog(member)
    }
    if (selected !== '移除成员') await loadMembers()
  } catch {
    // cancelled
  }
}

async function openRemoveMemberDialog(member: CommunityMember) {
  removeMemberTarget.value = member
  selectedRemovalReason.value = ''
  removalReasonDetail.value = ''
  removeMemberVisible.value = true
  if (removalReasons.value.length) return
  removalReasonLoading.value = true
  try {
    removalReasons.value = await fetchCommunityMemberRemovalReasons()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '移除原因加载失败')
  } finally {
    removalReasonLoading.value = false
  }
}

async function submitRemoveMember() {
  const target = removeMemberTarget.value
  if (!target || removingMember.value) return
  if (removalReasonLoading.value) return
  const selected = removalReasons.value.find((item) => item.code === selectedRemovalReason.value)
  if (!selected) return showToast('请选择移除原因')
  removingMember.value = true
  try {
    await setCommunityMemberStatus(communityId, target.id, 'REMOVED', '', selected.code, removalReasonDetail.value.trim())
    removeMemberVisible.value = false
    showToast('成员已移除')
    await loadMembers()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '移除成员失败')
  } finally {
    removingMember.value = false
  }
}

async function transferOwner() {
  const candidates = members.value.filter((member) => member.role !== 'OWNER' && member.status === 'ACTIVE')
  if (!candidates.length) return showToast('暂无可转让的成员')
  try {
    const selected = await openActionSheet(candidates.map((member) => `转让给 ${member.nickname}`))
    const target = candidates.find((member) => `转让给 ${member.nickname}` === selected)
    if (!target) return
    await showConfirmDialog({ title: '转让圈主', message: `转让后 ${target.nickname} 将成为新圈主，你将变为管理员。确定继续吗？` })
    const reason = window.prompt('请输入转让原因') || ''
    if (!reason.trim()) return showToast('请填写转让原因')
    await transferCommunityOwner(communityId, target.user_id, reason)
    showToast('圈主已转让')
    await load()
  } catch { /* cancelled */ }
}

async function dissolve() {
  try {
    await showConfirmDialog({ title: '解散圈子', message: '解散后所有成员将退出，圈子内容不再可访问。该操作不可撤销。', confirmButtonText: '确认解散' })
    const reason = window.prompt('请输入解散原因') || ''
    if (!reason.trim()) return showToast('请填写解散原因')
    await dissolveCommunity(communityId, reason)
    showToast('圈子已解散')
    void router.replace('/communities')
  } catch { /* cancelled */ }
}

function openPermissions(member: CommunityMember) {
  permissionTarget.value = member
  permissionDraft.value = parsePermissions(member.permissions)
  permissionVisible.value = true
}

async function savePermissions() {
  if (!permissionTarget.value) return
  try {
    await setCommunityMemberPermissions(communityId, permissionTarget.value.id, permissionDraft.value)
    permissionVisible.value = false
    showToast('管理员权限已更新')
    await loadMembers()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '权限保存失败')
  }
}

async function moderatePost(post: CommunityPost, status: 'PUBLISHED' | 'BLOCKED' | 'DELETED') {
  if (
    status === 'DELETED'
    && community.value?.my_role === 'ADMIN'
    && String(post.userId) !== String(userStore.userId || '')
    && (post.authorRole === 'OWNER' || post.authorRole === 'ADMIN')
  ) {
    await showDialog({
      title: '无法删除',
      message: post.authorRole === 'OWNER' ? '管理员不能删除圈主的动态。' : '管理员不能删除其他管理员的动态。',
    })
    return
  }
  try {
    const actionLabel = status === 'PUBLISHED' ? '通过审核' : status === 'BLOCKED' ? '屏蔽动态' : '删除动态'
    await showConfirmDialog({
      title: actionLabel,
      message: status === 'PUBLISHED' ? '通过后，这条动态会立即在圈子内展示。' : `确定${actionLabel}吗？`,
      confirmButtonText: status === 'PUBLISHED' ? '通过' : '确定',
    })
    await moderateCommunityPost(post.id, status)
    if (status === 'DELETED') {
      contentPosts.value = contentPosts.value.filter((item) => item.id !== post.id)
    } else {
      const index = contentPosts.value.findIndex((item) => item.id === post.id)
      if (index >= 0) contentPosts.value[index] = { ...contentPosts.value[index], status }
    }
    showToast(status === 'PUBLISHED' ? '动态已通过审核' : status === 'BLOCKED' ? '动态已屏蔽' : '动态已删除')
  } catch {
    // cancelled
  }
}

async function moderateReport(report: CommunityManageReport, status: 'BLOCKED' | 'DELETED' = 'DELETED') {
  if (!report.post_id) return showToast('被举报动态已不存在')
  const action = status === 'DELETED' ? '删除' : '屏蔽'
  try {
    await showConfirmDialog({ title: `${action}被举报动态`, message: `确定${action}这条动态并标记举报已处理吗？`, confirmButtonText: '确定' })
    await moderateCommunityReportedPost(communityId, report.id, status)
    reportItems.value = reportItems.value.filter((item) => item.id !== report.id)
    contentPosts.value = contentPosts.value.filter((item) => String(item.id) !== String(report.post_id))
    showToast(`动态已${action}，举报已处理`)
  } catch {
    // cancelled
  }
}

onMounted(() => {
  void fetchNicknameConfig().then((config) => {
    communityNicknameMaxLength.value = Number(config.communityNicknameMaxLength) || 30
  }).catch(() => undefined)
  void load()
})
</script>

<template>
  <div class="manage-page">
    <header class="page-header">
      <button type="button" class="icon-btn" aria-label="返回" @click="goBack"><span class="material-symbols-outlined">arrow_back_ios</span></button>
      <h1 class="page-title">管理中心</h1>
      <span class="header-spacer" />
    </header>

    <van-pull-refresh
      v-model="refreshing"
      class="manage-pull"
      :disabled="activeTab === 'settings' || saving"
      success-text="刷新成功"
      @refresh="onPullRefresh"
    >
      <div v-if="loading" class="state">加载中…</div>
      <template v-else>
      <section class="manage-hero">
        <div class="manage-avatar"><img v-if="community?.avatar" :src="resolveFileUrl(community.avatar)" alt="" /><span v-else>{{ community?.name?.slice(0, 1) }}</span></div>
        <div><h2>{{ community?.name }}</h2><p>{{ isOwner ? '圈主' : '管理员' }} · 管理成员、内容和圈子设置</p></div>
      </section>

      <nav class="manage-tabs">
        <button type="button" :class="{ active: activeTab === 'overview' }" @click="activeTab = 'overview'">数据中心</button>
        <button type="button" :class="{ active: activeTab === 'members' }" @click="activeTab = 'members'">成员管理<sup v-if="joinRequests.filter(item => item.status === 'PENDING').length + leaveRequests.length" class="tab-badge">{{ joinRequests.filter(item => item.status === 'PENDING').length + leaveRequests.length }}</sup></button>
        <button v-if="canManageContent" type="button" :class="{ active: activeTab === 'content' }" @click="activeTab = 'content'">内容管理<sup v-if="pendingContentCount" class="tab-badge">{{ pendingContentCount > 99 ? '99+' : pendingContentCount }}</sup></button>
        <button v-if="canManageReports" type="button" :class="{ active: activeTab === 'reports' }" @click="activeTab = 'reports'">举报处理<sup v-if="pendingReportCount" class="tab-badge">{{ pendingReportCount > 99 ? '99+' : pendingReportCount }}</sup></button>
        <button type="button" :class="{ active: activeTab === 'settings' }" @click="activeTab = 'settings'">圈子设置<sup v-if="community?.profile_review_unread_count" class="tab-badge">{{ community.profile_review_unread_count }}</sup></button>
      </nav>

      <main v-if="activeTab === 'overview'" class="manage-content">
        <section class="section-title"><h3>用户与内容</h3><span>实时数据</span></section>
        <div class="stats-grid"><button v-for="stat in stats" :key="stat.label" type="button" class="stat-card" :class="{ clickable: stat.detailType }" @click="openDataDetail(stat.detailType)"><span class="stat-icon material-symbols-outlined">{{ stat.icon }}</span><strong>{{ stat.value }}</strong><small>{{ stat.label }}</small><span v-if="stat.detailType" class="card-arrow material-symbols-outlined">chevron_right</span></button></div>
        <section class="section-title revenue-title"><h3>收益数据</h3><span>钱包余额以 PLU 计</span></section>
        <div class="revenue-grid"><button v-for="stat in revenueStats" :key="stat.label" type="button" class="revenue-card" :class="{ clickable: stat.detailType }" @click="openDataDetail(stat.detailType)"><span class="material-symbols-outlined">{{ stat.icon }}</span><div><strong>{{ stat.value }}</strong><small>{{ stat.label }}</small></div><span v-if="stat.detailType" class="revenue-arrow material-symbols-outlined">chevron_right</span></button></div>
        <p class="data-note">举报数量：{{ dashboard?.report_total || 0 }} 条 · 新成员和活跃人数按系统统计口径计算</p>
      </main>

      <main v-else-if="activeTab === 'members'" class="manage-content">
        <section v-if="joinRequests.length" class="join-review-section">
          <div class="section-title"><h3>进圈申请</h3><span>{{ joinRequests.filter(item => item.status === 'PENDING').length }} 人待审核</span></div>
          <article v-for="request in joinRequests" :key="request.id" class="join-request-card">
            <img v-if="request.avatar_url" :src="resolveAvatarUrl(request.avatar_url)" alt="" class="member-avatar" /><div v-else class="member-avatar initials">{{ request.nickname?.slice(0, 1) }}</div>
            <div class="member-info"><strong>{{ request.nickname }}</strong><small>{{ request.status === 'PENDING' ? '申请于' : '已通过，等待用户完成加入' }} {{ new Date(request.created_at).toLocaleString() }}</small></div>
            <div v-if="request.status === 'PENDING'" class="join-request-actions"><button type="button" @click="reviewJoin(request, 'APPROVED')">通过</button><button type="button" class="reject" @click="reviewJoin(request, 'REJECTED')">拒绝</button></div>
          </article>
        </section>
        <section v-if="leaveRequests.length" class="join-review-section">
          <div class="section-title"><h3>退出申请</h3><span>{{ leaveRequests.length }} 人待审核</span></div>
          <article v-for="request in leaveRequests" :key="request.id" class="join-request-card">
            <img v-if="request.avatar_url" :src="resolveAvatarUrl(request.avatar_url)" alt="" class="member-avatar" /><div v-else class="member-avatar initials">{{ request.nickname?.slice(0, 1) }}</div>
            <div class="member-info"><strong>{{ request.nickname }}</strong><small>原因：{{ request.reason }} · {{ new Date(request.created_at).toLocaleString() }}</small></div>
            <div class="join-request-actions"><button type="button" @click="reviewLeave(request, 'APPROVED')">同意</button><button type="button" class="reject" @click="reviewLeave(request, 'REJECTED')">拒绝</button></div>
          </article>
        </section>
        <div class="member-search">
          <input v-model="keyword" placeholder="搜索成员昵称或手机号" @keyup.enter="loadMembers" />
          <button v-if="keyword" type="button" class="search-clear-btn" aria-label="清除搜索" @click="keyword = ''; loadMembers()"><span class="material-symbols-outlined">cancel</span></button>
          <button type="button" @click="loadMembers">搜索</button>
        </div>
        <div class="member-filters">
          <button v-for="option in [{value:'',label:'全部'},{value:'ACTIVE',label:'正常'},{value:'MUTED',label:'已禁言'},{value:'REMOVED',label:'已移除'}]" :key="option.value" type="button" :class="{ active: memberStatus === option.value }" @click="memberStatus = option.value; loadMembers()">{{ option.label }}</button>
        </div>
        <div v-if="memberLoading" class="state compact">加载成员…</div>
        <div v-else class="member-list">
          <article v-for="member in members" :key="member.id" class="member-card" @click="memberAction(member)">
            <img v-if="member.avatar_url" :src="resolveAvatarUrl(member.avatar_url)" alt="" class="member-avatar" /><div v-else class="member-avatar initials">{{ member.nickname?.slice(0, 1) }}</div>
            <div class="member-info"><strong>{{ member.nickname }}</strong><small>{{ roleLabel(member.role) }} · {{ statusLabel(member.status) }}</small></div>
            <div class="member-actions"><button v-if="isOwner && member.role === 'ADMIN'" type="button" class="permission-btn" @click.stop="openPermissions(member)">权限</button><span class="material-symbols-outlined">more_horiz</span></div>
          </article>
          <div v-if="!members.length" class="empty">暂无成员</div>
        </div>
      </main>

      <main v-else-if="activeTab === 'content'" class="manage-content">
        <div class="content-toolbar">
          <div class="content-search">
            <input v-model="contentKeyword" placeholder="检索动态内容或作者" @keyup.enter="applyContentFilters" />
            <button v-if="contentKeyword" type="button" class="search-clear-btn" aria-label="清除搜索" @click="contentKeyword = ''; applyContentFilters()"><span class="material-symbols-outlined">cancel</span></button>
            <button type="button" @click="applyContentFilters">搜索</button>
          </div>
          <div class="content-filter-row">
            <button type="button" class="date-filter-button" @click="openDatePicker('start')"><span class="material-symbols-outlined">calendar_month</span><span><small>开始时间</small><strong>{{ contentStartDate || '不限' }}</strong></span></button>
            <span class="date-range-dash">—</span>
            <button type="button" class="date-filter-button" @click="openDatePicker('end')"><span class="material-symbols-outlined">calendar_month</span><span><small>结束时间</small><strong>{{ contentEndDate || '不限' }}</strong></span></button>
            <button type="button" class="sort-filter-button" @click="sortPickerVisible = true"><span class="material-symbols-outlined">sort</span><span><small>排序方式</small><strong>{{ selectedContentSort.label }}</strong></span><span class="material-symbols-outlined arrow">expand_more</span></button>
          </div>
          <button type="button" class="filter-reset" @click="contentKeyword = ''; contentStartDate = ''; contentEndDate = ''; contentSort = 'LATEST'; applyContentFilters()">重置</button>
        </div>
        <div class="content-list">
          <article v-for="post in contentPosts" :key="post.id" class="content-card" @click="openPost(post)">
            <div class="content-card-main"><div class="content-author"><strong>{{ post.nickname }}</strong><span class="post-status" :class="post.status.toLowerCase()">{{ postStatusLabel(post.status) }}</span></div><small>{{ post.createdAt ? new Date(post.createdAt).toLocaleString() : '' }}</small><p>{{ post.content || '媒体动态' }}</p><em>{{ post.likeCount }} 赞 · {{ post.commentCount }} 评论 · {{ post.forwardCount || 0 }} 转发</em></div>
            <div class="content-card-actions"><button v-if="post.status === 'PENDING'" type="button" class="approve" @click.stop="moderatePost(post, 'PUBLISHED')">通过</button><button type="button" @click.stop="moderatePost(post, 'BLOCKED')">屏蔽</button><button type="button" class="danger" @click.stop="moderatePost(post, 'DELETED')">删除</button></div>
          </article>
          <div v-if="!contentPosts.length" class="empty">暂无动态</div>
        </div>
      </main>

      <main v-else-if="activeTab === 'reports'" class="manage-content">
        <section class="section-title"><h3>被举报动态</h3><span>{{ reportItems.length }} 条待处理</span></section>
        <p class="data-note">这里仅显示本圈用户举报的动态或动态评论，处理后会自动从待处理列表移除。</p>
        <div class="report-list">
          <article v-for="report in reportItems" :key="report.id" class="report-card">
            <div class="report-card-head"><strong>{{ report.post_author_name || '未知用户' }}</strong><time>{{ report.created_at ? new Date(report.created_at).toLocaleString() : '' }}</time></div>
            <div class="report-reason"><span class="material-symbols-outlined">flag</span><span>{{ report.reason_name || report.reason }}</span><small>举报人：{{ report.reporter_name || '匿名用户' }}</small></div>
            <p class="report-post-content">{{ report.post_content || '媒体动态' }}</p>
            <p v-if="report.detail" class="report-detail">举报补充：{{ report.detail }}</p>
            <div class="report-card-actions">
              <button type="button" @click="report.post_id && openPost({ id: String(report.post_id) } as CommunityPost)">查看动态</button>
              <button type="button" class="block" @click="moderateReport(report, 'BLOCKED')">屏蔽动态</button>
              <button type="button" class="danger" @click="moderateReport(report, 'DELETED')">删除动态</button>
            </div>
          </article>
          <div v-if="!reportItems.length" class="empty">暂无待处理举报</div>
        </div>
      </main>

      <main v-else class="manage-content settings-content">
        <p v-if="!isOwner" class="readonly-tip">只有圈主可以修改圈子资料和发布权限。</p>
        <div class="settings-avatar-row">
          <button type="button" class="settings-avatar" aria-label="上传圈子头像" :disabled="!isOwner" @click="openAvatarPicker">
            <img v-if="edit.avatar" :src="resolveFileUrl(edit.avatar)" alt="" />
            <span v-else>{{ edit.name.slice(0, 1) }}</span>
            <i class="material-symbols-outlined">photo_camera</i>
            <b v-if="community?.pending_avatar_review" class="pending-badge">待审核</b>
          </button>
          <input ref="avatarInput" class="avatar-file-input" type="file" accept="image/*" tabindex="-1" aria-hidden="true" @change="onAvatarSelected" />
        </div>
        <label><span class="setting-label"><span>圈子名称</span><small v-if="community?.pending_name_review" class="pending-text">待审核</small></span><input v-model="edit.name" :maxlength="communityNicknameMaxLength" :disabled="!isOwner" /><small v-if="community?.pending_name_review" class="setting-help">当前线上名称：{{ community.name }}</small></label>
        <label>圈子介绍<textarea v-model="edit.description" maxlength="500" :disabled="!isOwner" /></label>
        <label class="announcement-setting">
          <span class="setting-label"><span>圈子公告</span><small>{{ edit.announcement.length }}/2000</small></span>
          <textarea
            v-model="edit.announcement"
            maxlength="2000"
            rows="4"
            placeholder="填写需要所有圈友关注的重要信息，留空则不展示"
            :disabled="!isOwner"
          />
          <small class="setting-help">保存后将显示在圈子详情顶部，较长内容会自动滚动播放。</small>
        </label>
        <label>圈子规则<textarea v-model="edit.rules" maxlength="2000" :disabled="!isOwner" /></label>
        <div class="setting-picker-group"><span>动态发布权限</span><button type="button" class="setting-picker" :disabled="!isOwner" @click="postModePickerVisible = true"><span class="setting-picker-icon material-symbols-outlined">{{ selectedPostMode.icon }}</span><span><strong>{{ selectedPostMode.label }}</strong><small>{{ selectedPostMode.description }}</small></span><i class="material-symbols-outlined">chevron_right</i></button></div>
        <div class="setting-picker-group"><span>进圈是否需要审核</span><button type="button" class="setting-picker" :disabled="!isOwner" @click="joinReviewPickerVisible = true"><span class="setting-picker-icon material-symbols-outlined">{{ selectedJoinReview.icon }}</span><span><strong>{{ selectedJoinReview.label }}</strong><small>{{ selectedJoinReview.description }}</small></span><i class="material-symbols-outlined">chevron_right</i></button></div>
        <div class="setting-picker-group"><span>退出圈子是否需要审核</span><button type="button" class="setting-picker" :disabled="!isOwner" @click="leaveReviewPickerVisible = true"><span class="setting-picker-icon material-symbols-outlined">{{ selectedLeaveReview.icon }}</span><span><strong>{{ selectedLeaveReview.label }}</strong><small>{{ selectedLeaveReview.description }}</small></span><i class="material-symbols-outlined">chevron_right</i></button></div>
        <button v-if="isOwner" type="button" class="save-btn" :disabled="saving" @click="saveSettings">{{ saving ? '保存中…' : '保存设置' }}</button>
        <section v-if="isOwner" class="danger-zone"><h3>圈主操作</h3><button type="button" @click="transferOwner"><span class="material-symbols-outlined">swap_horiz</span><span><strong>转让圈主</strong><small>将圈主身份转给一名当前成员</small></span><i class="material-symbols-outlined">chevron_right</i></button><button type="button" class="dissolve-button" @click="dissolve"><span class="material-symbols-outlined">delete_forever</span><span><strong>解散圈子</strong><small>所有成员退出，操作不可撤销</small></span><i class="material-symbols-outlined">chevron_right</i></button></section>
      </main>
      </template>
    </van-pull-refresh>

    <van-action-sheet v-model:show="actionSheetVisible" :actions="actionSheetActions" cancel-text="取消" close-on-click-action @select="onActionSheetSelect" @cancel="onActionSheetCancel" />
    <van-calendar v-model:show="datePickerVisible" teleport="body" :default-date="datePickerDefaultDate" :min-date="datePickerMinDate" :max-date="datePickerMaxDate" :title="datePickerField === 'start' ? '选择开始时间' : '选择结束时间'" color="var(--pulse-primary)" :show-confirm="false" @confirm="onDateConfirm" />
    <van-popup v-model:show="sortPickerVisible" position="bottom" round closeable teleport="body" class="sort-picker-popup">
      <section class="sort-picker-sheet">
        <div class="sort-picker-heading"><span><small>内容处理</small><strong>选择排序方式</strong></span><span class="material-symbols-outlined">sort</span></div>
        <button v-for="option in contentSortOptions" :key="option.value" type="button" class="sort-option" :class="{ selected: contentSort === option.value }" @click="selectContentSort(option.value)">
          <span class="sort-option-icon material-symbols-outlined">{{ option.icon }}</span><span>{{ option.label }}</span><span v-if="contentSort === option.value" class="material-symbols-outlined sort-check">check_circle</span>
        </button>
      </section>
    </van-popup>
    <van-popup v-model:show="permissionVisible" position="bottom" round teleport="body">
      <section class="permission-sheet"><h3>配置管理员权限</h3><p>{{ permissionTarget?.nickname }}</p><label><input v-model="permissionDraft" type="checkbox" value="CONTENT" /> 内容管理（动态、评论）</label><label><input v-model="permissionDraft" type="checkbox" value="MEMBERS" /> 成员管理（禁言、移除）</label><label><input v-model="permissionDraft" type="checkbox" value="COMMENTS" /> 评论管理</label><button type="button" class="save-btn" @click="savePermissions">保存权限</button></section>
    </van-popup>
    <van-popup v-model:show="removeMemberVisible" position="bottom" round teleport="body" :close-on-click-overlay="!removingMember">
      <section class="remove-member-sheet">
        <div class="remove-sheet-handle" />
        <header class="remove-sheet-header">
          <div>
            <span class="remove-kicker">成员管理</span>
            <h3>移除成员</h3>
          </div>
          <button type="button" class="remove-close" aria-label="关闭" :disabled="removingMember" @click="removeMemberVisible = false"><span class="material-symbols-outlined">close</span></button>
        </header>
        <div class="remove-target-card">
          <img v-if="removeMemberTarget?.avatar_url" :src="resolveAvatarUrl(removeMemberTarget.avatar_url)" alt="" class="remove-target-avatar" />
          <div v-else class="remove-target-avatar initials">{{ removeMemberTarget?.nickname?.slice(0, 1) }}</div>
          <div><strong>{{ removeMemberTarget?.nickname }}</strong><small>移除后将无法继续查看圈子内容</small></div>
          <span class="material-symbols-outlined remove-target-icon">person_remove</span>
        </div>
        <div class="remove-warning"><span class="material-symbols-outlined">info</span><span>请先选择一个原因，记录会同步到成员出入记录，方便后续追溯。</span></div>
        <div class="remove-section-heading"><strong>选择移除原因</strong><span>{{ removalReasons.length }} 个可选</span></div>
        <div v-if="removalReasonLoading" class="remove-reason-loading"><van-loading size="18px" />正在加载后台配置…</div>
        <div v-else-if="removalReasons.length" class="remove-reason-grid">
          <button v-for="reason in removalReasons" :key="reason.code" type="button" class="remove-reason-option" :class="{ selected: selectedRemovalReason === reason.code }" @click="selectedRemovalReason = reason.code">
            <span class="remove-reason-icon material-symbols-outlined">{{ selectedRemovalReason === reason.code ? 'check_circle' : 'radio_button_unchecked' }}</span>
            <span>{{ reason.name }}</span>
          </button>
        </div>
        <div v-else class="remove-reason-empty">暂未配置可用的移除原因，请联系后台管理员。</div>
        <label class="remove-detail-field"><span>补充说明 <em>选填</em></span><textarea v-model="removalReasonDetail" maxlength="200" rows="3" placeholder="补充具体情况，帮助成员理解处理原因" /></label>
        <div class="remove-sheet-footer"><button type="button" class="remove-cancel" :disabled="removingMember" @click="removeMemberVisible = false">取消</button><button type="button" class="remove-confirm" :disabled="!selectedRemovalReason || removalReasonLoading || removingMember" @click="submitRemoveMember"><van-loading v-if="removingMember" size="16px" />{{ removingMember ? '处理中…' : '确认移除' }}</button></div>
      </section>
    </van-popup>
    <CommunityChoicePicker v-model:show="postModePickerVisible" :value="edit.postMode" kicker="内容权限" title="选择发布模式" description="决定成员动态如何发布和展示，让圈子内容更易管理。" :options="postModeOptions" @select="edit.postMode = $event" />
    <CommunityChoicePicker v-model:show="joinReviewPickerVisible" :value="String(edit.joinReviewRequired)" kicker="成员权限" title="设置进圈审核" description="开启后，新的加入申请需要圈主或管理员处理。" :options="joinReviewOptions" @select="edit.joinReviewRequired = $event === 'true'" />
    <CommunityChoicePicker v-model:show="leaveReviewPickerVisible" :value="String(edit.leaveReviewRequired)" kicker="成员权限" title="设置退出审核" description="开启后，成员提交退出原因，由圈主或管理员处理。" :options="leaveReviewOptions" @select="edit.leaveReviewRequired = $event === 'true'" />
  </div>
</template>

<style scoped>
.manage-page{min-height:100%;min-height:100dvh;padding-bottom:32px;background:var(--pulse-page-bg,var(--pulse-bg));color:var(--pulse-text)}
.manage-pull{min-height:calc(100dvh - 56px - var(--pulse-header-pad-top))}
.page-header{position:sticky;top:0;z-index:20;display:flex;align-items:center;height:56px;padding:0 12px;padding-top:var(--pulse-header-pad-top);background:var(--pulse-page-bg,var(--pulse-bg))}.icon-btn,.header-spacer{width:40px;height:40px;flex:none}.icon-btn{display:grid;place-items:center;border:0;border-radius:50%;background:transparent;color:var(--pulse-primary)}.page-title{flex:1;margin:0;text-align:center;font-size:18px;color:var(--pulse-primary)}
.manage-hero{display:flex;align-items:center;gap:12px;margin:12px 16px;padding:16px;border-radius:16px;background:var(--pulse-surface-container)}.manage-avatar{width:52px;height:52px;display:grid;place-items:center;overflow:hidden;border-radius:14px;background:var(--pulse-surface-high);color:var(--pulse-primary);font-size:20px;font-weight:700}.manage-avatar img{width:100%;height:100%;object-fit:cover}.manage-hero h2{margin:0;font-size:18px}.manage-hero p{margin:5px 0 0;color:var(--pulse-text-secondary);font-size:12px}
.manage-tabs{display:flex;gap:8px;margin:12px 16px;padding:4px;border-radius:14px;background:var(--pulse-surface-container)}.manage-tabs button{flex:1;padding:9px 4px;border:0;border-radius:11px;background:transparent;color:var(--pulse-text-secondary);font:inherit;font-size:13px}.manage-tabs button.active{background:var(--pulse-primary);color:var(--pulse-on-primary)}.manage-content{padding:0 16px}.section-title{display:flex;align-items:center;justify-content:space-between;margin:18px 0 10px}.section-title h3{margin:0;font-size:15px}.section-title span{color:var(--pulse-text-secondary);font-size:12px}.stats-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.stat-card{display:flex;flex-direction:column;align-items:center;gap:4px;padding:12px 4px;border-radius:13px;background:var(--pulse-surface-container)}.stat-card strong{font-size:18px}.stat-card small{color:var(--pulse-text-secondary);font-size:11px;white-space:nowrap}.stat-icon{font-size:18px;color:var(--pulse-primary)}.revenue-title{margin-top:22px}.revenue-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.revenue-card{display:flex;align-items:center;gap:10px;padding:14px;border-radius:13px;background:var(--pulse-surface-container)}.revenue-card>.material-symbols-outlined{color:var(--pulse-primary)}.revenue-card strong,.revenue-card small{display:block}.revenue-card strong{font-size:15px}.revenue-card small{margin-top:3px;color:var(--pulse-text-secondary);font-size:11px}.data-note,.readonly-tip{margin:14px 0;color:var(--pulse-text-secondary);font-size:12px;line-height:1.5}
.member-search{display:flex;gap:8px}.member-search input{min-width:0;flex:1;height:42px;padding:0 12px;border:1px solid var(--pulse-outline-variant);border-radius:12px;background:var(--pulse-surface-container);color:var(--pulse-text);outline:0}.member-search button,.permission-btn{padding:0 12px;border:0;border-radius:12px;background:var(--pulse-primary);color:var(--pulse-on-primary);font:inherit}.member-list{display:flex;flex-direction:column;gap:8px;margin-top:12px}.member-card{display:flex;align-items:center;gap:10px;padding:11px 12px;border-radius:14px;background:var(--pulse-surface-container)}.member-avatar{width:42px;height:42px;flex:none;border-radius:50%;object-fit:cover;background:var(--pulse-surface-high)}.member-avatar.initials{display:grid;place-items:center;color:var(--pulse-primary);font-weight:700}.member-info{min-width:0;flex:1}.member-info strong,.member-info small{display:block}.member-info strong{font-size:14px}.member-info small{margin-top:3px;color:var(--pulse-text-secondary);font-size:12px}.member-actions{display:flex;align-items:center;gap:8px;color:var(--pulse-text-secondary)}.permission-btn{height:30px;padding:0 9px;font-size:12px}.empty,.state{text-align:center;padding:48px;color:var(--pulse-text-secondary)}.state.compact{padding:32px}
.content-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:14px 0 10px}.content-search{display:flex;min-width:220px;flex:1}.content-search input{min-width:0;flex:1;margin:0;padding:9px 11px;border:1px solid var(--pulse-outline-variant);border-radius:10px 0 0 10px;outline:0;background:var(--pulse-surface-container);color:var(--pulse-text);font-size:12px}.content-search button,.filter-reset{padding:9px 11px;border:0;border-radius:0 10px 10px 0;background:var(--pulse-primary);color:var(--pulse-on-primary);font-size:12px}.content-date-filters{display:flex;gap:6px}.content-date-filters label{display:flex;align-items:center;gap:4px;margin:0;color:var(--pulse-text-secondary);font-size:11px}.content-date-filters input{width:122px;margin:0;padding:8px;border:1px solid var(--pulse-outline-variant);border-radius:9px;background:var(--pulse-surface-container);color:var(--pulse-text);font-size:11px}.content-sort{display:flex;align-items:center;gap:5px;color:var(--pulse-text-secondary);font-size:11px}.content-sort select{padding:8px 7px;border:1px solid var(--pulse-outline-variant);border-radius:9px;background:var(--pulse-surface-container);color:var(--pulse-text);font-size:11px}.filter-reset{border-radius:10px;background:var(--pulse-surface-high);color:var(--pulse-primary)}.content-list{display:flex;flex-direction:column;gap:8px}.content-card{display:flex;gap:12px;padding:13px;border-radius:14px;background:var(--pulse-surface-container)}.content-card-main{min-width:0;flex:1}.content-card-main strong,.content-card-main small{display:block}.content-card-main small{margin-top:3px;color:var(--pulse-text-secondary);font-size:11px}.content-card-main p{margin:8px 0;overflow:hidden;line-height:1.45;text-overflow:ellipsis;white-space:nowrap}.content-card-main em{color:var(--pulse-text-secondary);font-size:11px;font-style:normal}.content-card-actions{display:flex;flex-direction:column;gap:6px}.content-card-actions button{min-width:48px;padding:6px;border:1px solid var(--pulse-outline-variant);border-radius:8px;background:transparent;color:var(--pulse-primary);font-size:12px}.content-card-actions button.danger{color:var(--pulse-error,var(--pulse-primary))}
.report-list{display:flex;flex-direction:column;gap:9px}.report-card{padding:13px;border-radius:14px;background:var(--pulse-surface-container)}.report-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.report-card-head strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}.report-card-head time{flex:none;color:var(--pulse-text-secondary);font-size:10px}.report-reason{display:flex;align-items:center;gap:5px;margin-top:8px;color:var(--pulse-danger,#d94b4b);font-size:12px;font-weight:650}.report-reason .material-symbols-outlined{font-size:16px}.report-reason small{margin-left:auto;color:var(--pulse-text-secondary);font-size:10px;font-weight:400}.report-post-content{margin:9px 0 0;overflow:hidden;color:var(--pulse-text);font-size:13px;line-height:1.5;text-overflow:ellipsis;white-space:nowrap}.report-detail{margin:6px 0 0;color:var(--pulse-text-secondary);font-size:11px;line-height:1.5}.report-card-actions{display:flex;justify-content:flex-end;gap:7px;margin-top:11px}.report-card-actions button{padding:6px 9px;border:1px solid var(--pulse-outline-variant);border-radius:8px;background:transparent;color:var(--pulse-primary);font:inherit;font-size:11px}.report-card-actions button.block{color:#d98200}.report-card-actions button.danger{color:var(--pulse-danger,#d94b4b)}
.content-author{display:flex;align-items:center;gap:7px}.content-author strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.post-status{flex:none;padding:2px 6px;border-radius:7px;background:var(--pulse-surface-high);color:var(--pulse-text-secondary);font-size:10px}.post-status.pending{background:color-mix(in srgb,var(--pulse-primary) 13%,var(--pulse-surface-high));color:var(--pulse-primary)}.post-status.published{background:color-mix(in srgb,var(--pulse-secondary) 12%,var(--pulse-surface-high));color:var(--pulse-secondary)}.post-status.blocked{background:color-mix(in srgb,var(--pulse-danger) 10%,var(--pulse-surface-high));color:var(--pulse-danger)}.content-card-actions button.approve{border-color:color-mix(in srgb,var(--pulse-primary) 45%,var(--pulse-outline-variant));background:color-mix(in srgb,var(--pulse-primary) 10%,transparent);color:var(--pulse-primary)}
.settings-content label{display:block;margin:14px 0;color:var(--pulse-text-secondary);font-size:13px}.settings-content input,.settings-content textarea,.settings-content select{display:block;width:100%;box-sizing:border-box;margin-top:7px;padding:12px;border:1px solid var(--pulse-outline-variant);border-radius:12px;background:var(--pulse-surface-container);color:var(--pulse-text);font:inherit;outline:0}.settings-content textarea{min-height:100px;resize:none}.settings-content :disabled{opacity:.55}.settings-avatar-row{display:flex;align-items:center;gap:12px;margin:4px 0 20px}.settings-avatar-row>div{display:flex;flex-direction:column;gap:4px}.settings-avatar-row small{color:var(--pulse-text-secondary);font-size:12px}.settings-avatar{position:relative;width:58px;height:58px;padding:0;overflow:hidden;border:0;border-radius:16px;background:var(--pulse-surface-high);color:var(--pulse-primary);font-size:22px;font-weight:700}.settings-avatar img{width:100%;height:100%;object-fit:cover}.settings-avatar i{position:absolute;right:3px;bottom:3px;width:20px;height:20px;display:grid;place-items:center;border-radius:50%;background:var(--pulse-primary);color:var(--pulse-on-primary);font-size:13px}.save-btn{width:100%;height:46px;margin-top:14px;border:0;border-radius:13px;background:var(--pulse-primary);color:var(--pulse-on-primary);font:inherit}.save-btn:disabled{opacity:.55}.permission-sheet{padding:24px 18px calc(20px + env(safe-area-inset-bottom,0px));background:var(--pulse-surface-container);color:var(--pulse-text)}.permission-sheet h3{margin:0;font-size:18px}.permission-sheet p{margin:6px 0 18px;color:var(--pulse-text-secondary);font-size:13px}.permission-sheet label{display:flex;align-items:center;gap:10px;margin:16px 0;font-size:14px}.permission-sheet input{accent-color:var(--pulse-primary)}
.remove-member-sheet{max-height:90dvh;box-sizing:border-box;padding:10px 18px calc(16px + env(safe-area-inset-bottom,0px));overflow-y:auto;background:var(--pulse-surface-container);color:var(--pulse-text)}.remove-sheet-handle{width:38px;height:4px;margin:0 auto 15px;border-radius:999px;background:var(--pulse-outline-variant)}.remove-sheet-header{display:flex;align-items:flex-start;justify-content:space-between}.remove-kicker{color:var(--pulse-danger,#d94b4b);font-size:11px;font-weight:700;letter-spacing:.08em}.remove-sheet-header h3{margin:4px 0 0;font-size:21px;letter-spacing:-.02em}.remove-close{display:grid;width:34px;height:34px;place-items:center;padding:0;border:0;border-radius:50%;background:var(--pulse-surface-high);color:var(--pulse-text-secondary)}.remove-close .material-symbols-outlined{font-size:18px}.remove-target-card{display:flex;align-items:center;gap:11px;margin-top:18px;padding:12px;border:1px solid color-mix(in srgb,var(--pulse-danger,#d94b4b) 18%,var(--pulse-outline-variant));border-radius:16px;background:color-mix(in srgb,var(--pulse-danger,#d94b4b) 5%,var(--pulse-surface-high))}.remove-target-avatar{width:44px;height:44px;flex:0 0 44px;border-radius:14px;object-fit:cover;background:var(--pulse-surface-container)}.remove-target-avatar.initials{display:grid;place-items:center;color:var(--pulse-primary);font-weight:750}.remove-target-card>div{display:flex;min-width:0;flex:1;flex-direction:column;gap:4px}.remove-target-card strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}.remove-target-card small{color:var(--pulse-text-secondary);font-size:11px}.remove-target-icon{color:var(--pulse-danger,#d94b4b);font-size:22px}.remove-warning{display:flex;align-items:flex-start;gap:7px;margin-top:12px;color:var(--pulse-text-secondary);font-size:11px;line-height:1.5}.remove-warning .material-symbols-outlined{flex:none;color:#d98200;font-size:16px}.remove-section-heading{display:flex;align-items:center;justify-content:space-between;margin:22px 0 10px}.remove-section-heading strong{font-size:14px}.remove-section-heading span{color:var(--pulse-text-secondary);font-size:11px}.remove-reason-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.remove-reason-option{display:flex;min-height:48px;align-items:center;gap:8px;padding:9px 10px;border:1px solid var(--pulse-outline-variant);border-radius:13px;background:var(--pulse-surface-high);color:var(--pulse-text);font:inherit;font-size:12px;text-align:left;transition:border-color .18s ease,background .18s ease,transform .18s ease}.remove-reason-option:active{transform:scale(.98)}.remove-reason-option.selected{border-color:color-mix(in srgb,var(--pulse-primary) 72%,var(--pulse-outline-variant));background:color-mix(in srgb,var(--pulse-primary) 11%,var(--pulse-surface-high));color:var(--pulse-primary);font-weight:650}.remove-reason-icon{flex:none;color:var(--pulse-outline);font-size:18px}.remove-reason-option.selected .remove-reason-icon{color:var(--pulse-primary)}.remove-reason-loading,.remove-reason-empty{display:flex;min-height:58px;align-items:center;justify-content:center;gap:8px;border-radius:13px;background:var(--pulse-surface-high);color:var(--pulse-text-secondary);font-size:12px}.remove-detail-field{display:block;margin-top:17px;color:var(--pulse-text);font-size:13px;font-weight:600}.remove-detail-field span{display:flex;align-items:center;justify-content:space-between}.remove-detail-field em{color:var(--pulse-text-secondary);font-size:11px;font-style:normal;font-weight:400}.remove-detail-field textarea{display:block;width:100%;box-sizing:border-box;margin-top:8px;padding:11px 12px;border:1px solid var(--pulse-outline-variant);border-radius:13px;outline:0;background:var(--pulse-surface-high);color:var(--pulse-text);font:inherit;font-size:13px;line-height:1.5;resize:none}.remove-detail-field textarea:focus{border-color:color-mix(in srgb,var(--pulse-primary) 70%,var(--pulse-outline-variant))}.remove-detail-field textarea::placeholder{color:var(--pulse-text-secondary)}.remove-sheet-footer{display:flex;gap:9px;margin-top:18px}.remove-sheet-footer button{height:46px;border-radius:13px;font:inherit;font-size:14px;font-weight:700}.remove-cancel{width:34%;border:1px solid var(--pulse-outline-variant);background:var(--pulse-surface-high);color:var(--pulse-text-secondary)}.remove-confirm{display:flex;flex:1;align-items:center;justify-content:center;gap:7px;border:0;background:var(--pulse-danger,#d94b4b);color:#fff;box-shadow:0 9px 20px color-mix(in srgb,var(--pulse-danger,#d94b4b) 22%,transparent)}.remove-confirm:disabled{opacity:.42;box-shadow:none}
.settings-avatar-row{justify-content:center;gap:0;margin:8px 0 24px}.settings-content .avatar-file-input{display:none}.settings-avatar{width:76px;height:76px;border-radius:50%;font-size:26px}.settings-avatar i{right:4px;bottom:4px;width:24px;height:24px;border:2px solid var(--pulse-page-bg,var(--pulse-bg));font-size:14px}
.announcement-setting{padding:13px;border:1px solid color-mix(in srgb,var(--pulse-primary) 18%,var(--pulse-outline-variant));border-radius:16px;background:color-mix(in srgb,var(--pulse-primary) 6%,var(--pulse-surface-container))}.settings-content .announcement-setting textarea{margin-top:9px;background:var(--pulse-surface-high)}.setting-label{display:flex;align-items:center;justify-content:space-between;color:var(--pulse-text);font-weight:600}.setting-label small,.settings-content .setting-help{color:var(--pulse-text-secondary);font-size:11px;font-weight:400}.settings-content .setting-help{display:block;margin-top:7px;line-height:1.5}
button{font:inherit;cursor:pointer}
.stat-card,.revenue-card{position:relative;border:0;color:var(--pulse-text);font:inherit;text-align:inherit}.stat-card.clickable:active,.revenue-card.clickable:active{transform:scale(.98)}.card-arrow{position:absolute;top:5px;right:4px;color:var(--pulse-text-secondary);font-size:13px}.revenue-card>div{min-width:0;flex:1}.revenue-arrow{margin-left:auto;color:var(--pulse-text-secondary)!important;font-size:16px!important}
.member-filters{display:flex;gap:7px;margin:10px 0 0;overflow-x:auto}.member-filters button{flex:none;padding:7px 13px;border:1px solid var(--pulse-outline-variant);border-radius:999px;background:var(--pulse-surface-container);color:var(--pulse-text-secondary);font:inherit;font-size:12px}.member-filters button.active{border-color:var(--pulse-primary);background:color-mix(in srgb,var(--pulse-primary) 12%,var(--pulse-surface-container));color:var(--pulse-primary)}
.pending-badge{position:absolute;left:50%;bottom:-1px;z-index:2;padding:2px 7px;border-radius:999px;background:#d98200;color:#fff;font-size:9px;font-weight:700;white-space:nowrap;transform:translateX(-50%)}.pending-text{padding:3px 7px;border-radius:999px;background:color-mix(in srgb,#d98200 14%,transparent);color:#d98200!important;font-weight:650!important}
.setting-picker-group{display:block;margin:14px 0;color:var(--pulse-text-secondary);font-size:13px}.setting-picker{display:flex;width:100%;align-items:center;gap:11px;margin-top:7px;padding:11px 12px;border:1px solid var(--pulse-outline-variant);border-radius:14px;background:var(--pulse-surface-container);color:var(--pulse-text);text-align:left}.setting-picker-icon{display:grid;width:40px;height:40px;flex:0 0 40px;place-items:center;border-radius:12px;background:color-mix(in srgb,var(--pulse-primary) 13%,transparent);color:var(--pulse-primary)}.setting-picker>span:nth-child(2){display:flex;min-width:0;flex:1;flex-direction:column;gap:3px}.setting-picker strong{font-size:14px}.setting-picker small{overflow:hidden;color:var(--pulse-text-secondary);font-size:11px;text-overflow:ellipsis;white-space:nowrap}.setting-picker>i{color:var(--pulse-text-secondary);font-size:20px}
.join-review-section{margin-bottom:16px}.join-request-card{display:flex;align-items:center;gap:9px;margin-bottom:8px;padding:10px;border-radius:14px;background:var(--pulse-surface-container)}.join-request-actions{display:flex;flex-direction:column;gap:5px}.join-request-actions button{padding:5px 9px;border:0;border-radius:8px;background:var(--pulse-primary);color:var(--pulse-on-primary);font-size:11px}.join-request-actions button.reject{background:color-mix(in srgb,var(--pulse-danger,#d84a4a) 12%,var(--pulse-surface-high));color:var(--pulse-danger,#d84a4a)}
.manage-tabs button{position:relative}.tab-badge{position:absolute;top:1px;right:2px;display:grid;min-width:15px;height:15px;box-sizing:border-box;place-items:center;padding:0 4px;border-radius:999px;background:var(--pulse-danger,#df4242);color:#fff;font-size:9px;font-style:normal;font-weight:700;line-height:1}
.danger-zone{margin:28px 0 8px;padding-top:16px;border-top:1px solid var(--pulse-outline-variant)}.danger-zone h3{margin:0 0 10px;color:var(--pulse-text);font-size:14px}.danger-zone button{display:flex;width:100%;align-items:center;gap:10px;margin-top:8px;padding:12px;border:1px solid var(--pulse-outline-variant);border-radius:14px;background:var(--pulse-surface-container);color:var(--pulse-text);text-align:left}.danger-zone button>span:first-child{color:var(--pulse-primary)}.danger-zone button>span:nth-child(2){display:flex;min-width:0;flex:1;flex-direction:column;gap:3px}.danger-zone button strong{font-size:13px}.danger-zone button small{color:var(--pulse-text-secondary);font-size:11px}.danger-zone button>i{color:var(--pulse-text-secondary)}.danger-zone .dissolve-button{border-color:color-mix(in srgb,var(--pulse-danger,#df4242) 35%,var(--pulse-outline-variant))}.danger-zone .dissolve-button>span:first-child,.danger-zone .dissolve-button strong{color:var(--pulse-danger,#df4242)}
.revenue-card strong{white-space:nowrap}
.manage-tabs{overflow-x:auto;scrollbar-width:none}.manage-tabs::-webkit-scrollbar{display:none}.manage-tabs button{flex:0 0 auto;min-width:68px;white-space:nowrap;padding-left:10px;padding-right:10px}
.content-toolbar{align-items:stretch;gap:10px;padding:12px;border:1px solid color-mix(in srgb,var(--pulse-outline-variant) 72%,transparent);border-radius:16px;background:var(--pulse-surface-container)}.content-search{width:100%;min-width:0;flex:0 0 100%}.content-search input{height:42px;min-width:0;flex:1 1 auto;border-color:transparent;border-radius:11px 0 0 11px;background:var(--pulse-surface-high);font-size:13px}.content-search button{width:58px;min-width:58px;flex:0 0 58px;padding:0;border-radius:0 11px 11px 0;font-weight:650;white-space:nowrap;word-break:keep-all;writing-mode:horizontal-tb}.content-filter-row{display:grid;grid-template-columns:minmax(0,1fr) 12px minmax(0,1fr);align-items:center;gap:7px}.date-range-dash{color:var(--pulse-text-secondary);font-size:12px;text-align:center}.date-filter-button,.sort-filter-button{display:flex;min-width:0;align-items:center;gap:8px;padding:9px 10px;border:1px solid var(--pulse-outline-variant);border-radius:12px;background:var(--pulse-surface-high);color:var(--pulse-text);text-align:left}.date-filter-button>.material-symbols-outlined,.sort-filter-button>.material-symbols-outlined:first-child{color:var(--pulse-primary);font-size:19px}.date-filter-button>span:nth-child(2),.sort-filter-button>span:nth-child(2){display:flex;min-width:0;flex:1;flex-direction:column;gap:2px}.date-filter-button small,.sort-filter-button small{color:var(--pulse-text-secondary);font-size:10px}.date-filter-button strong,.sort-filter-button strong{overflow:hidden;font-size:12px;font-weight:650;text-overflow:ellipsis;white-space:nowrap}.sort-filter-button{grid-column:1 / -1;width:100%}.sort-filter-button .arrow{margin-left:auto;color:var(--pulse-text-secondary);font-size:18px}.filter-reset{align-self:flex-end;padding:7px 13px;border:1px solid var(--pulse-outline-variant);font-size:12px}
.sort-picker-popup{background:var(--pulse-surface-container);color:var(--pulse-text)}.sort-picker-sheet{padding:24px 16px calc(18px + env(safe-area-inset-bottom,0px))}.sort-picker-heading{display:flex;align-items:center;justify-content:space-between;margin:0 36px 16px 2px}.sort-picker-heading span:first-child{display:flex;flex-direction:column;gap:4px}.sort-picker-heading small{color:var(--pulse-text-secondary);font-size:11px}.sort-picker-heading strong{font-size:19px}.sort-picker-heading>.material-symbols-outlined{display:grid;width:38px;height:38px;place-items:center;border-radius:12px;background:color-mix(in srgb,var(--pulse-primary) 13%,transparent);color:var(--pulse-primary)}.sort-option{display:flex;width:100%;align-items:center;gap:11px;margin-top:8px;padding:13px 12px;border:1px solid var(--pulse-outline-variant);border-radius:13px;background:var(--pulse-surface-high);color:var(--pulse-text);text-align:left}.sort-option.selected{border-color:var(--pulse-primary);background:color-mix(in srgb,var(--pulse-primary) 10%,var(--pulse-surface-high))}.sort-option-icon{display:grid;width:32px;height:32px;place-items:center;border-radius:10px;background:color-mix(in srgb,var(--pulse-primary) 13%,transparent);color:var(--pulse-primary);font-size:18px}.sort-option>span:nth-child(2){flex:1;font-size:14px}.sort-check{color:var(--pulse-primary);font-size:20px}
</style>

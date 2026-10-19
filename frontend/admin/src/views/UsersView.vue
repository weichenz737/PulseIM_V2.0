<script setup lang="ts">
import { formatTime } from '@/utils/datetime'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from '@/utils/elementFeedback'
import type { FormInstance, FormRules, TableInstance } from 'element-plus'
import {
  adjustUserWallet,
  createUser,
  deleteUser,
  deleteUsers,
  fetchOwnedCommunities,
  fetchOwnedGroups,
  fetchUser,
  fetchUsers,
  resetUserPassword,
  updateUser,
  updateUserStatus,
  type AdminUser,
  type CreateUserPayload,
  type OwnedCommunity,
  type OwnedGroup,
  type OwnerTransfer,
  type UpdateUserPayload,
} from '@/api/users'
import { resolveAvatarUrl, uploadAdminAvatar } from '@/api/files'
import AdminAvatar from '@/components/AdminAvatar.vue'
import type { UploadRequestOptions } from 'element-plus'
import { useAdminStore } from '@/stores/admin'
import QrCodeBlock from '@/components/QrCodeBlock.vue'
import { userQrPayload } from '@/utils/qrcode'

const route = useRoute()
const router = useRouter()
const adminStore = useAdminStore()
const loading = ref(false)
const deleting = ref(false)
const users = ref<AdminUser[]>([])
const total = ref(0)
const avatarUploading = ref(false)
const tableRef = ref<TableInstance>()
const selectedRows = ref<AdminUser[]>([])

const query = reactive({
  keyword: '',
  status: '' as number | '',
  online: '' as boolean | '',
  activeToday: '' as boolean | '',
  createdFrom: '' as string,
  createdTo: '' as string,
  sortBy: 'online' as string,
  sortOrder: 'desc' as 'asc' | 'desc',
  page: 1,
  size: 20,
})

const createdRange = computed({
  get(): [string, string] | null {
    if (query.createdFrom && query.createdTo) return [query.createdFrom, query.createdTo]
    return null
  },
  set(v: [string, string] | null) {
    if (v && v.length === 2) {
      query.createdFrom = v[0] || ''
      query.createdTo = v[1] || ''
    } else {
      query.createdFrom = ''
      query.createdTo = ''
    }
  },
})

const editVisible = ref(false)
const createVisible = ref(false)
const passwordVisible = ref(false)
const detailVisible = ref(false)
const detailLoading = ref(false)
const detailUser = ref<AdminUser | null>(null)
const detailUserQrPayload = computed(() => {
  const pulseId = detailUser.value?.pulseId?.trim()
  return pulseId ? userQrPayload(pulseId) : ''
})
const saving = ref(false)
const currentUser = ref<AdminUser | null>(null)
const banVisible = ref(false)
const banTarget = ref<AdminUser | null>(null)
const banSaving = ref(false)
const banForm = reactive({
  mode: 'permanent' as 'permanent' | 'days',
  days: 7,
  reason: '',
})

const walletVisible = ref(false)
const walletSaving = ref(false)
const walletTarget = ref<AdminUser | null>(null)
const walletForm = reactive({
  direction: 'CREDIT' as 'CREDIT' | 'DEBIT',
  amount: '',
  remark: '',
})

function yuan(cents?: number) {
  return `¥${((Number(cents) || 0) / 100).toFixed(2)}`
}

function openWalletAdjust(row: AdminUser, direction: 'CREDIT' | 'DEBIT') {
  walletTarget.value = row
  walletForm.direction = direction
  walletForm.amount = ''
  walletForm.remark = ''
  walletVisible.value = true
}

async function submitWalletAdjust() {
  if (!walletTarget.value) return
  const amountYuan = Number(walletForm.amount)
  const cents = Math.round(amountYuan * 100)
  if (!Number.isFinite(amountYuan) || amountYuan <= 0 || cents <= 0) {
    ElMessage.warning('请输入大于0的金额')
    return
  }
  if (walletForm.direction === 'DEBIT' && cents > Number(walletTarget.value.walletBalance || 0)) {
    ElMessage.warning('扣款金额不能超过当前余额')
    return
  }
  walletSaving.value = true
  try {
    const result = await adjustUserWallet(walletTarget.value.id, {
      direction: walletForm.direction,
      amount: cents,
      remark: walletForm.remark.trim() || undefined,
    })
    ElMessage.success(
      `${walletForm.direction === 'CREDIT' ? '充值' : '扣款'}成功，当前余额 ${yuan(result.balanceAfter)}`,
    )
    walletVisible.value = false
    await loadUsers()
    if (detailVisible.value && detailUser.value?.id === walletTarget.value.id) {
      detailUser.value = await fetchUser(walletTarget.value.id)
    }
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '余额调整失败')
  } finally {
    walletSaving.value = false
  }
}

const transferVisible = ref(false)
const transferLoading = ref(false)
const transferDeleting = ref(false)
const transferUser = ref<AdminUser | null>(null)
const ownedGroups = ref<OwnedGroup[]>([])
const ownedCommunities = ref<OwnedCommunity[]>([])
const deleteCommunitiesOnSubmit = ref(false)
/** conversationId -> newOwnerId */
const transferSelections = ref<Record<number, number | undefined>>({})

const editFormRef = ref<FormInstance>()
const createFormRef = ref<FormInstance>()
const passwordFormRef = ref<FormInstance>()

const editForm = reactive<UpdateUserPayload>({
  nickname: '',
  avatarUrl: '',
  gender: '',
  region: '',
  signature: '',
  birthday: '',
  friendVerifyRequired: true,
  groupInviteVerify: false,
  addByPhone: true,
  addByPulseId: true,
  addByGroup: true,
  addByQrcode: true,
  addByCard: true,
  addByDeletedChat: true,
  searchByPhone: true,
  searchByPulseId: true,
})

const createForm = reactive<CreateUserPayload>({
  phone: '',
  password: '',
  nickname: '',
  avatarUrl: '',
  gender: '',
  region: '',
  signature: '',
})

const passwordForm = reactive({
  password: '',
  confirmPassword: '',
})

const editRules: FormRules = {
  nickname: [{ required: true, message: '请输入昵称', trigger: 'blur' }],
}

const createRules: FormRules = {
  phone: [
    { required: true, message: '请输入手机号', trigger: 'blur' },
    { pattern: /^1\d{10}$/, message: '手机号格式不正确', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 32, message: '密码长度需为 6-32 位', trigger: 'blur' },
  ],
  nickname: [{ required: true, message: '请输入昵称', trigger: 'blur' }],
}

const passwordRules: FormRules = {
  password: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, max: 32, message: '密码长度需为 6-32 位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (value !== passwordForm.password) {
          callback(new Error('两次输入的密码不一致'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
}

function genderLabel(g?: string) {
  if (g === 'male') return '男'
  if (g === 'female') return '女'
  if (g === 'other') return '其他'
  return g || '—'
}

function enabledFriendAddMethods(row: AdminUser) {
  return [
    row.addByPhone !== false && '手机号',
    row.addByPulseId !== false && 'PulseID',
    row.addByGroup !== false && '群聊',
    row.addByQrcode !== false && '二维码',
    row.addByCard !== false && '名片',
    row.addByDeletedChat !== false && '已删除聊天',
  ].filter((item): item is string => Boolean(item))
}

function enabledFriendSearchMethods(row: AdminUser) {
  return [
    row.searchByPhone !== false && '手机号',
    row.searchByPulseId !== false && 'PulseID',
  ].filter((item): item is string => Boolean(item))
}

function friendPermissionTooltip(row: AdminUser) {
  const addMethods = enabledFriendAddMethods(row)
  const searchMethods = enabledFriendSearchMethods(row)
  return [
    `添加好友：${row.friendVerifyRequired === false ? '直接添加' : '需要验证'}`,
    `允许添加方式：${addMethods.join('、') || '均关闭'}`,
    `允许搜索方式：${searchMethods.join('、') || '均关闭'}`,
    `群邀请：${row.groupInviteVerify ? '需要确认' : '直接入群'}`,
  ].join('\n')
}

function avatarSrc(url?: string) {
  return resolveAvatarUrl(url) || undefined
}

async function handleAvatarUpload(
  options: UploadRequestOptions,
  target: 'create' | 'edit',
) {
  const raw = options.file as File
  if (!raw.type.startsWith('image/')) {
    ElMessage.error('仅支持图片文件')
    options.onError?.(new Error('仅支持图片文件') as never)
    return
  }
  if (raw.size > 5 * 1024 * 1024) {
    ElMessage.error('头像不能超过 5MB')
    options.onError?.(new Error('头像不能超过 5MB') as never)
    return
  }
  avatarUploading.value = true
  try {
    const uploaded = await uploadAdminAvatar(raw)
    if (target === 'create') {
      createForm.avatarUrl = uploaded.url
    } else {
      editForm.avatarUrl = uploaded.url
    }
    ElMessage.success('头像上传成功')
    options.onSuccess?.(uploaded as never)
  } catch (e) {
    const msg = e instanceof Error ? e.message : '上传失败'
    ElMessage.error(msg)
    options.onError?.(new Error(msg) as never)
  } finally {
    avatarUploading.value = false
  }
}

function clearAvatar(target: 'create' | 'edit') {
  if (target === 'create') {
    createForm.avatarUrl = ''
  } else {
    editForm.avatarUrl = ''
  }
}

function uploadCreateAvatar(options: UploadRequestOptions) {
  return handleAvatarUpload(options, 'create')
}

function uploadEditAvatar(options: UploadRequestOptions) {
  return handleAvatarUpload(options, 'edit')
}

async function loadUsers() {
  loading.value = true
  selectedRows.value = []
  try {
    const data = await fetchUsers({
      page: query.page,
      size: query.size,
      keyword: query.keyword.trim(),
      status: query.status,
      online: query.online,
      activeToday: query.activeToday,
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    })
    users.value = data.list
    total.value = data.total
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载用户失败')
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  query.page = 1
  loadUsers()
}

function handleReset() {
  query.keyword = ''
  query.status = ''
  query.online = ''
  query.activeToday = ''
  query.createdFrom = ''
  query.createdTo = ''
  query.sortBy = 'online'
  query.sortOrder = 'desc'
  query.page = 1
  loadUsers()
}

function onSortPresetChange() {
  query.page = 1
  loadUsers()
}

function handleSortChange(payload: { prop: string; order: string | null }) {
  if (!payload.order) {
    query.sortBy = 'online'
    query.sortOrder = 'desc'
  } else {
    query.sortBy = payload.prop === 'lastOnlineAt' ? 'lastOnlineAt' : 'createdAt'
    query.sortOrder = payload.order === 'ascending' ? 'asc' : 'desc'
  }
  query.page = 1
  loadUsers()
}

function openCreate() {
  Object.assign(createForm, {
    phone: '',
    password: '',
    nickname: '',
    avatarUrl: '',
    gender: '',
    region: '',
    signature: '',
  })
  createVisible.value = true
}

function openEdit(row: AdminUser) {
  currentUser.value = row
  Object.assign(editForm, {
    nickname: row.nickname || '',
    avatarUrl: row.avatarUrl || '',
    gender: row.gender || '',
    region: row.region || '',
    signature: row.signature || '',
    birthday: row.birthday || '',
    friendVerifyRequired: row.friendVerifyRequired ?? true,
    groupInviteVerify: row.groupInviteVerify ?? false,
    addByPhone: row.addByPhone ?? true,
    addByPulseId: row.addByPulseId ?? true,
    addByGroup: row.addByGroup ?? true,
    addByQrcode: row.addByQrcode ?? true,
    addByCard: row.addByCard ?? true,
    addByDeletedChat: row.addByDeletedChat ?? true,
    searchByPhone: row.searchByPhone ?? true,
    searchByPulseId: row.searchByPulseId ?? true,
  })
  editVisible.value = true
}

async function openDetail(row: AdminUser) {
  detailVisible.value = true
  detailLoading.value = true
  detailUser.value = row
  try {
    detailUser.value = await fetchUser(row.id)
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载详情失败')
  } finally {
    detailLoading.value = false
  }
}

function goUserRelation(path: string) {
  if (!detailUser.value) return
  const id = detailUser.value.id
  detailVisible.value = false
  router.push({ path, query: { userId: String(id) } })
}

function goUserLoginLogs() {
  if (!detailUser.value) return
  const id = detailUser.value.id
  detailVisible.value = false
  router.push({ path: '/login-logs', query: { userId: String(id) } })
}

function goUserBalanceRecords() {
  if (!detailUser.value) return
  const id = detailUser.value.id
  detailVisible.value = false
  router.push({ path: '/user-balance-records', query: { userId: String(id) } })
}

function openEditFromDetail() {
  if (!detailUser.value) return
  const row = detailUser.value
  detailVisible.value = false
  openEdit(row)
}

function openPassword(row: AdminUser) {
  currentUser.value = row
  passwordForm.password = ''
  passwordForm.confirmPassword = ''
  passwordVisible.value = true
}

async function submitCreate() {
  const valid = await createFormRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    await createUser({
      phone: createForm.phone.trim(),
      password: createForm.password,
      nickname: createForm.nickname.trim(),
      avatarUrl: createForm.avatarUrl?.trim() || undefined,
      gender: createForm.gender || undefined,
      region: createForm.region?.trim() || undefined,
      signature: createForm.signature?.trim() || undefined,
    })
    ElMessage.success('用户创建成功')
    createVisible.value = false
    await loadUsers()
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '创建失败')
  } finally {
    saving.value = false
  }
}

async function submitEdit() {
  if (!currentUser.value) return
  const valid = await editFormRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    await updateUser(currentUser.value.id, {
      nickname: editForm.nickname?.trim(),
      avatarUrl: editForm.avatarUrl?.trim() || '',
      gender: editForm.gender || '',
      region: editForm.region?.trim() || '',
      signature: editForm.signature?.trim() || '',
      birthday: editForm.birthday || '',
      friendVerifyRequired: editForm.friendVerifyRequired,
      groupInviteVerify: editForm.groupInviteVerify,
      addByPhone: editForm.addByPhone,
      addByPulseId: editForm.addByPulseId,
      addByGroup: editForm.addByGroup,
      addByQrcode: editForm.addByQrcode,
      addByCard: editForm.addByCard,
      addByDeletedChat: editForm.addByDeletedChat,
      searchByPhone: editForm.searchByPhone,
      searchByPulseId: editForm.searchByPulseId,
    })
    ElMessage.success('资料已更新')
    editVisible.value = false
    await loadUsers()
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '更新失败')
  } finally {
    saving.value = false
  }
}

async function submitPassword() {
  if (!currentUser.value) return
  const valid = await passwordFormRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    await resetUserPassword(currentUser.value.id, passwordForm.password)
    ElMessage.success('密码已重置')
    passwordVisible.value = false
    if (detailVisible.value && detailUser.value?.id === currentUser.value.id) {
      detailUser.value = await fetchUser(currentUser.value.id)
    }
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '重置失败')
  } finally {
    saving.value = false
  }
}

async function toggleStatus(row: AdminUser) {
  if (row.status === 1) {
    banTarget.value = row
    banForm.mode = 'permanent'
    banForm.days = 7
    banForm.reason = ''
    banVisible.value = true
    return
  }
  try {
    await ElMessageBox.confirm(`确定要解除「${row.nickname}」的封禁吗？`, '解除封禁', {
      confirmButtonText: '启用',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await updateUserStatus(row.id, { status: 1 })
    ElMessage.success('已解除封禁')
    await loadUsers()
    if (detailVisible.value && detailUser.value?.id === row.id) {
      detailUser.value = await fetchUser(row.id)
    }
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(e instanceof Error ? e.message : '启用失败')
  }
}

async function submitBan() {
  if (!banTarget.value) return
  if (banForm.mode === 'days') {
    const days = Number(banForm.days)
    if (!Number.isFinite(days) || days < 1 || days > 3650) {
      ElMessage.warning('请输入 1-3650 的封禁天数')
      return
    }
  }
  banSaving.value = true
  try {
    await updateUserStatus(banTarget.value.id, {
      status: 0,
      banDays: banForm.mode === 'permanent' ? 0 : Number(banForm.days),
      banReason: banForm.reason.trim() || undefined,
    })
    ElMessage.success(banForm.mode === 'permanent' ? '已永久封禁' : `已封禁 ${banForm.days} 天`)
    banVisible.value = false
    await loadUsers()
    if (detailVisible.value && detailUser.value?.id === banTarget.value.id) {
      detailUser.value = await fetchUser(banTarget.value.id)
    }
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '封禁失败')
  } finally {
    banSaving.value = false
  }
}

function statusLabel(row: AdminUser) {
  if (row.status === 1) return '正常'
  if (row.banPermanent || !row.banUntil) return '永久封禁'
  return '限时封禁'
}

function banUntilText(row: AdminUser) {
  if (row.status === 1) return ''
  if (row.banPermanent || !row.banUntil) return '永久'
  return formatTime(row.banUntil)
}

async function handleDelete(row: AdminUser) {
  try {
    transferLoading.value = true
    const [groups, communities] = await Promise.all([
      fetchOwnedGroups(row.id),
      fetchOwnedCommunities(row.id),
    ])
    transferLoading.value = false

    if (communities.length) {
      const ownership = [
        groups.length ? `${groups.length} 个群的群主` : '',
        `${communities.length} 个圈子的圈主`,
      ].filter(Boolean).join('，同时是')
      const names = communities
        .map((community) => `「${community.name || `圈子#${community.communityId}`}」`)
        .join('、')
      try {
        await ElMessageBox.confirm(
          `用户「${row.nickname}」${groups.length ? `是${ownership}（圈子包括${names}）` : `是${names}的圈主`}。${groups.length ? '删除前需要为群选择新群主；仅剩一人的群会自动解散。' : ''}是否连同圈子、圈内内容、订单和收益一起永久删除？如果保留圈子，请先到“圈子列表”点击“更换圈主”，完成转让后再删除用户。`,
          groups.length ? '删除用户 · 群主/圈主确认' : '删除用户 · 圈主确认',
          {
            confirmButtonText: groups.length ? '继续处理并删除' : '删除用户及圈子',
            cancelButtonText: '先更换圈主',
            type: 'warning',
            confirmButtonClass: 'el-button--danger',
          },
        )
      } catch {
        ElMessage.info('请先到“圈子列表”完成圈主转让，再删除该用户')
        await router.push({ name: 'Communities' })
        return
      }
      deleteCommunitiesOnSubmit.value = true
    } else {
      deleteCommunitiesOnSubmit.value = false
    }
    ownedCommunities.value = communities

    if (!groups.length) {
      if (!communities.length) {
        await ElMessageBox.confirm(
          `确定永久删除用户「${row.nickname}」（${row.phone}）吗？相关好友、朋友圈等数据也会一并清理，且不可恢复。`,
          '删除用户',
          {
            confirmButtonText: '删除',
            cancelButtonText: '取消',
            type: 'warning',
            confirmButtonClass: 'el-button--danger',
          },
        )
      }
      await deleteUser(row.id, undefined, deleteCommunitiesOnSubmit.value)
      ElMessage.success('用户已删除')
      ownedCommunities.value = []
      deleteCommunitiesOnSubmit.value = false
      if (users.value.length <= 1 && query.page > 1) {
        query.page -= 1
      }
      await loadUsers()
      return
    }

    transferUser.value = row
    ownedGroups.value = groups
    const selections: Record<number, number | undefined> = {}
    for (const g of groups) {
      selections[g.conversationId] = undefined
    }
    transferSelections.value = selections
    transferVisible.value = true
  } catch (e) {
    transferLoading.value = false
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(e instanceof Error ? e.message : '删除失败')
  }
}

function candidateLabel(c: { nickname?: string; phone?: string; userId: number }) {
  const name = c.nickname || '未命名'
  const phone = c.phone ? `（${c.phone}）` : ''
  return `${name}${phone}`
}

async function confirmDeleteWithTransfers() {
  if (!transferUser.value) return
  const needTransfer = ownedGroups.value.filter((g) => !g.mustDissolve)
  const transfers: OwnerTransfer[] = []
  for (const g of needTransfer) {
    const newOwnerId = transferSelections.value[g.conversationId]
    if (!newOwnerId) {
      ElMessage.warning(`请为群「${g.title || g.conversationId}」选择新群主`)
      return
    }
    transfers.push({ conversationId: g.conversationId, newOwnerId })
  }

  const dissolveCount = ownedGroups.value.filter((g) => g.mustDissolve).length
  const tips: string[] = [
    `确定永久删除用户「${transferUser.value.nickname}」吗？`,
  ]
  if (needTransfer.length) {
    tips.push(`将为 ${needTransfer.length} 个群转让群主。`)
  }
  if (dissolveCount) {
    tips.push(`另有 ${dissolveCount} 个仅剩群主的群将自动解散。`)
  }
  if (deleteCommunitiesOnSubmit.value && ownedCommunities.value.length) {
    tips.push(`同时删除 ${ownedCommunities.value.length} 个圈子及其内容、订单和收益。`)
  }
  tips.push('相关数据会一并清理，且不可恢复。')

  try {
    await ElMessageBox.confirm(tips.join(''), '确认删除', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
      confirmButtonClass: 'el-button--danger',
    })
    transferDeleting.value = true
    await deleteUser(transferUser.value.id, transfers, deleteCommunitiesOnSubmit.value)
    ElMessage.success('用户已删除')
    transferVisible.value = false
    transferUser.value = null
    ownedGroups.value = []
    ownedCommunities.value = []
    deleteCommunitiesOnSubmit.value = false
    if (users.value.length <= 1 && query.page > 1) {
      query.page -= 1
    }
    await loadUsers()
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(e instanceof Error ? e.message : '删除失败')
  } finally {
    transferDeleting.value = false
  }
}

function onSelectionChange(rows: AdminUser[]) {
  selectedRows.value = rows
}

function clearSelection() {
  tableRef.value?.clearSelection()
  selectedRows.value = []
}

async function handleBatchDelete() {
  if (!selectedRows.value.length) {
    ElMessage.warning('请先勾选要删除的用户')
    return
  }
  // 单选时走和行内删除完全相同的处理流程，允许选择“删除圈子”或先去转让圈主。
  // 直接调用批量接口无法携带每个用户的圈子确认和群主转让信息。
  if (selectedRows.value.length === 1) {
    await handleDelete(selectedRows.value[0])
    return
  }
  const rows = [...selectedRows.value]
  let ownership: Array<{
    row: AdminUser
    groups: Awaited<ReturnType<typeof fetchOwnedGroups>>
    communities: Awaited<ReturnType<typeof fetchOwnedCommunities>>
  }>
  try {
    transferLoading.value = true
    ownership = await Promise.all(rows.map(async (row) => {
      const [groups, communities] = await Promise.all([
        fetchOwnedGroups(row.id),
        fetchOwnedCommunities(row.id),
      ])
      return { row, groups, communities }
    }))
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '读取用户关联数据失败')
    return
  } finally {
    transferLoading.value = false
  }
  const protectedUsers = ownership.filter(({ groups, communities }) => groups.length || communities.length)
  if (protectedUsers.length) {
    const details = protectedUsers.map(({ row, groups, communities }) => {
      const parts = []
      if (groups.length) parts.push(`${groups.length} 个群主关系`)
      if (communities.length) parts.push(`${communities.length} 个圈主关系`)
      return `「${row.nickname}」：${parts.join('、')}`
    }).join('\n')
    await ElMessageBox.alert(
      `以下用户存在需要单独确认的关联关系，批量删除无法替你选择删除圈子或转让群主：\n\n${details}\n\n请取消当前选择后，逐个点击用户行内的删除按钮处理。`,
      '无法直接批量删除',
      { confirmButtonText: '知道了', type: 'warning' },
    )
    return
  }
  const ids = rows.map((r) => r.id)
  const count = ids.length
  try {
    await ElMessageBox.confirm(
      `确定永久删除选中的 ${count} 个用户吗？相关数据会一并清理，且不可恢复。`,
      '批量删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      },
    )
    deleting.value = true
    const n = await deleteUsers(ids)
    ElMessage.success(`已删除 ${n} 个用户`)
    clearSelection()
    if (users.value.length <= count && query.page > 1) {
      query.page -= 1
    }
    await loadUsers()
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(e instanceof Error ? e.message : '删除失败')
  } finally {
    deleting.value = false
  }
}


function formatLastOnline(row: AdminUser) {
  if (row.online) return '当前在线'
  return formatTime(row.lastOnlineAt)
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制')
  } catch {
    ElMessage.error('复制失败')
  }
}

function applyRouteQuery() {
  const q = route.query
  if (q.status === '0' || q.status === '1') {
    query.status = Number(q.status)
  } else {
    query.status = ''
  }
  if (q.online === 'true' || q.online === '1') {
    query.online = true
  } else if (q.online === 'false' || q.online === '0') {
    query.online = false
  } else {
    query.online = ''
  }
  if (q.activeToday === 'true' || q.activeToday === '1') {
    query.activeToday = true
  } else {
    query.activeToday = ''
  }
  const ymd = /^\d{4}-\d{2}-\d{2}$/
  query.createdFrom = typeof q.createdFrom === 'string' && ymd.test(q.createdFrom) ? q.createdFrom : ''
  query.createdTo = typeof q.createdTo === 'string' && ymd.test(q.createdTo) ? q.createdTo : ''
  const sortBy = typeof q.sortBy === 'string' ? q.sortBy.trim() : ''
  if (sortBy === 'online' || sortBy === 'lastOnlineAt' || sortBy === 'createdAt') {
    query.sortBy = sortBy
  } else if (query.createdFrom || query.activeToday === true) {
    query.sortBy = query.createdFrom ? 'createdAt' : 'lastOnlineAt'
  } else {
    query.sortBy = 'online'
  }
  if (q.sortOrder === 'asc' || q.sortOrder === 'desc') {
    query.sortOrder = q.sortOrder
  } else if (query.sortBy !== 'online') {
    query.sortOrder = 'desc'
  }
  query.page = 1
}

onMounted(() => {
  applyRouteQuery()
  loadUsers()
})

watch(
  () => route.fullPath,
  () => {
    if (route.path !== '/users' && !route.path.endsWith('/users')) return
    applyRouteQuery()
    loadUsers()
  },
)
</script>

<template>
  <div class="users-page">
    <el-card shadow="never" class="toolbar-card">
      <el-form :inline="true" @submit.prevent="handleSearch">
        <el-form-item label="关键词">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="手机号 / 昵称 / PulseID"
            style="width: 220px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" clearable placeholder="全部" style="width: 120px">
            <el-option label="正常" :value="1" />
            <el-option label="封禁" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item label="在线">
          <el-select v-model="query.online" clearable placeholder="全部" style="width: 120px">
            <el-option label="在线" :value="true" />
            <el-option label="离线" :value="false" />
          </el-select>
        </el-form-item>
        <el-form-item label="活跃">
          <el-select v-model="query.activeToday" clearable placeholder="全部" style="width: 130px">
            <el-option label="今日活跃" :value="true" />
          </el-select>
        </el-form-item>
        <el-form-item label="注册日期">
          <el-date-picker
            v-model="createdRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            start-placeholder="开始"
            end-placeholder="结束"
            style="width: 240px"
          />
        </el-form-item>
        <el-form-item label="排序">
          <el-select v-model="query.sortBy" style="width: 140px" @change="onSortPresetChange">
            <el-option label="在线优先" value="online" />
            <el-option label="最后在线时间" value="lastOnlineAt" />
            <el-option label="注册时间" value="createdAt" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="query.sortBy !== 'online'" label="方向">
          <el-select v-model="query.sortOrder" style="width: 110px" @change="onSortPresetChange">
            <el-option label="从新到旧" value="desc" />
            <el-option label="从旧到新" value="asc" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
          <el-button type="success" @click="openCreate">新建用户</el-button>
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
      </div>
      <el-table
        class="users-table"
        ref="tableRef"
        v-loading="loading"
        :data="users"
        stripe
        row-key="id"
        empty-text="暂无用户"
        @sort-change="handleSortChange"
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="48" />
        <el-table-column label="用户" min-width="150">
          <template #default="{ row }">
            <div class="user-cell">
              <AdminAvatar :size="36" :url="avatarSrc(row.avatarUrl)">
                {{ (row.nickname || '?').slice(0, 1) }}
              </AdminAvatar>
              <div class="user-meta">
                <div class="nickname">{{ row.nickname || '—' }}</div>
                <div class="sub">PulseID {{ row.pulseId || '—' }}</div>
                <el-button class="user-detail-link" link type="primary" @click="openDetail(row)">
                  查看详情
                </el-button>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="phone" label="手机号" min-width="112" />
        <el-table-column label="钱包余额" min-width="110">
          <template #default="{ row }">{{ yuan(row.walletBalance) }}</template>
        </el-table-column>
        <el-table-column label="安全码" min-width="88">
          <template #default="{ row }">
            <el-tag v-if="row.securityCodeEnabled" type="warning">{{ row.securityCode || '已开启' }}</el-tag>
            <span v-else>未开启</span>
          </template>
        </el-table-column>
        <el-table-column label="性别" min-width="58">
          <template #default="{ row }">{{ genderLabel(row.gender) }}</template>
        </el-table-column>
        <el-table-column prop="region" label="地区" min-width="78" show-overflow-tooltip>
          <template #default="{ row }">{{ row.region || '—' }}</template>
        </el-table-column>
        <el-table-column label="在线" min-width="68">
          <template #default="{ row }">
            <el-tag :type="row.online ? 'success' : 'info'" size="small" effect="plain">
              {{ row.online ? '在线' : '离线' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          label="最后在线时间"
          prop="lastOnlineAt"
          min-width="132"
          sortable="custom"
        >
          <template #default="{ row }">{{ formatLastOnline(row) }}</template>
        </el-table-column>
        <el-table-column label="状态" min-width="96">
          <template #default="{ row }">
            <div class="status-cell">
              <el-tag :type="row.status === 1 ? 'success' : 'danger'" size="small">
                {{ statusLabel(row) }}
              </el-tag>
              <div v-if="row.status !== 1" class="status-sub">
                {{ banUntilText(row) === '永久' ? '永久' : `至 ${banUntilText(row)}` }}
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="朋友权限" min-width="145">
          <template #default="{ row }">
            <el-tooltip
              :content="friendPermissionTooltip(row)"
              placement="top"
              effect="dark"
            >
              <div class="friend-permission-cell">
                <div class="friend-permission-primary">
                  <el-tag
                    :type="row.friendVerifyRequired === false ? 'success' : 'warning'"
                    size="small"
                    effect="plain"
                  >
                    {{ row.friendVerifyRequired === false ? '直接添加' : '需验证' }}
                  </el-tag>
                  <span>{{ row.groupInviteVerify ? '入群需确认' : '直接入群' }}</span>
                </div>
                <div class="friend-permission-sub">
                  添加：{{ enabledFriendAddMethods(row).join('、') || '均关闭' }}
                </div>
                <div class="friend-permission-sub">
                  搜索：{{ enabledFriendSearchMethods(row).join('、') || '均关闭' }}
                </div>
              </div>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column
          label="注册时间"
          prop="createdAt"
          min-width="132"
          sortable="custom"
        >
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" min-width="292" align="right" header-align="right">
          <template #default="{ row }">
            <div class="row-actions">
              <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
              <el-button link type="warning" @click="openPassword(row)">重置密码</el-button>
              <el-button link type="success" @click="openWalletAdjust(row, 'CREDIT')">充余额</el-button>
              <el-button link type="warning" @click="openWalletAdjust(row, 'DEBIT')">扣余额</el-button>
              <el-button
                link
                :type="row.status === 1 ? 'danger' : 'success'"
                @click="toggleStatus(row)"
              >
                {{ row.status === 1 ? '封禁' : '解封' }}
              </el-button>
              <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
            </div>
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
          @current-change="loadUsers"
          @size-change="() => { query.page = 1; loadUsers() }"
        />
      </div>
    </el-card>

    <el-dialog v-model="detailVisible" title="用户详情" width="min(960px, 92vw)" destroy-on-close>
      <div v-loading="detailLoading" class="detail-panel">
        <template v-if="detailUser">
          <div class="detail-header">
            <AdminAvatar shape="circle" :size="72" :url="avatarSrc(detailUser.avatarUrl)">
              {{ (detailUser.nickname || '?').slice(0, 1) }}
            </AdminAvatar>
            <div class="detail-header-meta">
              <div class="detail-name">{{ detailUser.nickname || '—' }}</div>
              <div class="detail-sub">PulseID {{ detailUser.pulseId || '—' }}</div>
              <div class="detail-tags">
                <el-tag :type="detailUser.online ? 'success' : 'info'" size="small" effect="plain">
                  {{ detailUser.online ? '在线' : '离线' }}
                </el-tag>
                <el-tag :type="detailUser.status === 1 ? 'success' : 'danger'" size="small">
                  {{ statusLabel(detailUser) }}
                </el-tag>
              </div>
            </div>
          </div>
          <el-descriptions :column="2" border class="detail-desc">
            <el-descriptions-item label="PulseID">{{ detailUser.pulseId || '—' }}</el-descriptions-item>
            <el-descriptions-item label="钱包余额">{{ yuan(detailUser.walletBalance) }}</el-descriptions-item>
            <el-descriptions-item label="手机号">{{ detailUser.phone || '—' }}</el-descriptions-item>
            <el-descriptions-item label="安全码">
              {{ detailUser.securityCodeEnabled ? (detailUser.securityCode || '已开启') : '未开启' }}
            </el-descriptions-item>
            <el-descriptions-item label="登录密码" :span="2">
              <div class="password-row">
                <el-input
                  :model-value="detailUser.password || ''"
                  :placeholder="detailUser.password ? '' : '暂无明文（历史账号需重置后可见）'"
                  type="password"
                  show-password
                  readonly
                  style="max-width: 280px"
                />
                <el-button
                  v-if="detailUser.password"
                  link
                  type="primary"
                  @click="copyText(detailUser.password!)"
                >复制</el-button>
                <el-button link type="warning" @click="openPassword(detailUser)">重置</el-button>
              </div>
            </el-descriptions-item>
            <el-descriptions-item label="性别">{{ genderLabel(detailUser.gender) }}</el-descriptions-item>
            <el-descriptions-item label="生日">{{ detailUser.birthday || '—' }}</el-descriptions-item>
            <el-descriptions-item label="地区" :span="2">{{ detailUser.region || '—' }}</el-descriptions-item>
            <el-descriptions-item label="签名" :span="2">{{ detailUser.signature || '—' }}</el-descriptions-item>
            <el-descriptions-item label="最后在线时间">{{ formatLastOnline(detailUser) }}</el-descriptions-item>
            <el-descriptions-item label="注册时间">{{ formatTime(detailUser.createdAt) }}</el-descriptions-item>
            <el-descriptions-item label="更新时间">{{ formatTime(detailUser.updatedAt) }}</el-descriptions-item>
            <el-descriptions-item label="封禁状态">
              <template v-if="detailUser.status === 1">正常</template>
              <template v-else>
                {{ statusLabel(detailUser) }}
                <span v-if="banUntilText(detailUser) !== '永久'">（至 {{ banUntilText(detailUser) }}）</span>
              </template>
            </el-descriptions-item>
            <el-descriptions-item label="封禁原因">
              {{ detailUser.status !== 1 ? (detailUser.banReason || '—') : '—' }}
            </el-descriptions-item>
            <el-descriptions-item label="加好友验证">
              {{ detailUser.friendVerifyRequired === false ? '无需验证' : '需要验证' }}
            </el-descriptions-item>
            <el-descriptions-item label="入群邀请验证">
              {{ detailUser.groupInviteVerify ? '需要确认' : '无需确认' }}
            </el-descriptions-item>
            <el-descriptions-item label="允许添加方式" :span="2">
              {{
                [
                  detailUser.addByPhone !== false && '手机号',
                  detailUser.addByPulseId !== false && 'PulseID',
                  detailUser.addByGroup !== false && '群聊',
                  detailUser.addByQrcode !== false && '二维码',
                  detailUser.addByCard !== false && '名片',
                  detailUser.addByDeletedChat !== false && '已删除聊天',
                ].filter(Boolean).join('、') || '均不允许'
              }}
            </el-descriptions-item>
          </el-descriptions>
          <QrCodeBlock
            v-if="detailUserQrPayload"
            title="个人二维码"
            :payload="detailUserQrPayload"
            :filename="`user-${detailUser.pulseId}`"
          />
          <div class="quick-links">
            <div class="quick-links-title">快速查看</div>
            <div class="quick-links-row">
              <el-button @click="goUserRelation('/user-friends')">好友</el-button>
              <el-button @click="goUserRelation('/user-blocks')">黑名单</el-button>
              <el-button @click="goUserRelation('/user-favorites')">收藏</el-button>
              <el-button @click="goUserRelation('/user-friend-delete-logs')">删友记录</el-button>
              <el-button @click="goUserRelation('/user-phone-change-logs')">手机号修改记录</el-button>
              <el-button
                v-if="adminStore.hasPermission('user_balance_records')"
                type="primary"
                @click="goUserBalanceRecords"
              >余额记录</el-button>
              <el-button
                v-if="adminStore.hasPermission('user_login_logs')"
                @click="goUserLoginLogs"
              >登录日志</el-button>
            </div>
          </div>
        </template>
      </div>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
        <el-button type="primary" :disabled="!detailUser" @click="openEditFromDetail">编辑</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="banVisible"
      :title="banTarget ? `封禁用户 · ${banTarget.nickname || banTarget.phone}` : '封禁用户'"
      width="460px"
      destroy-on-close
    >
      <el-form label-width="88px">
        <el-form-item label="封禁方式">
          <el-radio-group v-model="banForm.mode">
            <el-radio value="permanent">永久封禁</el-radio>
            <el-radio value="days">限时封禁</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="banForm.mode === 'days'" label="封禁天数">
          <el-input-number v-model="banForm.days" :min="1" :max="3650" :step="1" />
          <span class="ban-hint">天（1-3650）</span>
        </el-form-item>
        <el-form-item label="封禁原因">
          <el-input
            v-model="banForm.reason"
            type="textarea"
            :rows="2"
            maxlength="256"
            show-word-limit
            placeholder="可选"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="banVisible = false">取消</el-button>
        <el-button type="danger" :loading="banSaving" @click="submitBan">确认封禁</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="createVisible" title="新建用户" width="480px" destroy-on-close>
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-width="88px">
        <el-form-item label="手机号" prop="phone">
          <el-input v-model="createForm.phone" maxlength="11" placeholder="11 位手机号" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="createForm.password" type="password" show-password placeholder="6-32 位" />
        </el-form-item>
        <el-form-item label="昵称" prop="nickname">
              <el-input v-model="createForm.nickname" maxlength="64" />
        </el-form-item>
        <el-form-item label="头像">
          <div class="avatar-editor">
            <AdminAvatar shape="circle" :size="64" :url="avatarSrc(createForm.avatarUrl)">
              {{ (createForm.nickname || '?').slice(0, 1) }}
            </AdminAvatar>
            <div class="avatar-actions">
              <el-upload
                :show-file-list="false"
                accept="image/jpeg,image/png,image/gif,image/webp,image/bmp,.jpg,.jpeg,.png,.gif,.webp,.bmp"
                :http-request="uploadCreateAvatar"
                :disabled="avatarUploading"
              >
                <el-button :loading="avatarUploading" size="small">选择图片</el-button>
              </el-upload>
              <el-button
                v-if="createForm.avatarUrl"
                size="small"
                text
                type="danger"
                @click="clearAvatar('create')"
              >
                清除
              </el-button>
              <div class="avatar-hint">支持 jpg/png/gif/webp，不超过 5MB</div>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="性别">
          <el-select v-model="createForm.gender" clearable placeholder="请选择" style="width: 100%">
            <el-option label="男" value="male" />
            <el-option label="女" value="female" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item label="地区">
          <el-input v-model="createForm.region" maxlength="64" />
        </el-form-item>
        <el-form-item label="签名">
          <el-input v-model="createForm.signature" type="textarea" :rows="2" maxlength="120" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editVisible" title="编辑用户" width="480px" destroy-on-close>
      <el-form ref="editFormRef" :model="editForm" :rules="editRules" label-width="88px">
        <el-form-item label="昵称" prop="nickname">
              <el-input v-model="editForm.nickname" maxlength="64" />
        </el-form-item>
        <el-form-item label="头像">
          <div class="avatar-editor">
            <AdminAvatar shape="circle" :size="64" :url="avatarSrc(editForm.avatarUrl)">
              {{ (editForm.nickname || '?').slice(0, 1) }}
            </AdminAvatar>
            <div class="avatar-actions">
              <el-upload
                :show-file-list="false"
                accept="image/jpeg,image/png,image/gif,image/webp,image/bmp,.jpg,.jpeg,.png,.gif,.webp,.bmp"
                :http-request="uploadEditAvatar"
                :disabled="avatarUploading"
              >
                <el-button :loading="avatarUploading" size="small">选择图片</el-button>
              </el-upload>
              <el-button
                v-if="editForm.avatarUrl"
                size="small"
                text
                type="danger"
                @click="clearAvatar('edit')"
              >
                清除
              </el-button>
              <div class="avatar-hint">支持 jpg/png/gif/webp，不超过 5MB</div>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="性别">
          <el-select v-model="editForm.gender" clearable placeholder="请选择" style="width: 100%">
            <el-option label="男" value="male" />
            <el-option label="女" value="female" />
            <el-option label="其他" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item label="生日">
          <el-date-picker
            v-model="editForm.birthday"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择日期"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="地区">
          <el-input v-model="editForm.region" maxlength="64" />
        </el-form-item>
        <el-form-item label="签名">
          <el-input v-model="editForm.signature" type="textarea" :rows="2" maxlength="120" />
        </el-form-item>
        <el-divider content-position="left">朋友权限</el-divider>
        <el-form-item label="好友验证">
          <el-switch
            v-model="editForm.friendVerifyRequired"
            active-text="需要验证"
            inactive-text="直接添加"
          />
        </el-form-item>
        <el-form-item label="入群邀请">
          <el-switch
            v-model="editForm.groupInviteVerify"
            active-text="需要确认"
            inactive-text="直接入群"
          />
        </el-form-item>
        <el-form-item label="添加方式">
          <div class="permission-grid">
            <el-checkbox v-model="editForm.addByPhone">手机号</el-checkbox>
            <el-checkbox v-model="editForm.addByPulseId">PulseID</el-checkbox>
            <el-checkbox v-model="editForm.addByGroup">群聊</el-checkbox>
            <el-checkbox v-model="editForm.addByQrcode">二维码</el-checkbox>
            <el-checkbox v-model="editForm.addByCard">名片</el-checkbox>
            <el-checkbox v-model="editForm.addByDeletedChat">已删除聊天</el-checkbox>
          </div>
        </el-form-item>
        <el-form-item label="允许搜索">
          <div class="permission-grid">
            <el-checkbox v-model="editForm.searchByPhone">手机号</el-checkbox>
            <el-checkbox v-model="editForm.searchByPulseId">PulseID</el-checkbox>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="passwordVisible" title="重置密码" width="420px" destroy-on-close>
      <el-form ref="passwordFormRef" :model="passwordForm" :rules="passwordRules" label-width="96px">
        <el-form-item label="新密码" prop="password">
          <el-input v-model="passwordForm.password" type="password" show-password />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input v-model="passwordForm.confirmPassword" type="password" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="passwordVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitPassword">确认重置</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="walletVisible"
      :title="walletForm.direction === 'CREDIT' ? '充值余额' : '扣除余额'"
      width="420px"
      destroy-on-close
      :close-on-click-modal="false"
    >
      <el-alert
        :title="`${walletTarget?.nickname || '用户'} 当前余额：${yuan(walletTarget?.walletBalance)}`"
        type="info"
        :closable="false"
        style="margin-bottom: 18px"
      />
      <el-form label-width="78px" @submit.prevent="submitWalletAdjust">
        <el-form-item label="操作类型">
          <el-radio-group v-model="walletForm.direction">
            <el-radio-button value="CREDIT">充余额</el-radio-button>
            <el-radio-button value="DEBIT">扣余额</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="金额">
          <el-input v-model="walletForm.amount" type="number" min="0.01" step="0.01" placeholder="请输入金额">
            <template #prepend>¥</template>
          </el-input>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="walletForm.remark" maxlength="200" show-word-limit placeholder="选填，将展示在用户收支明细中" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="walletVisible = false">取消</el-button>
        <el-button
          :type="walletForm.direction === 'CREDIT' ? 'success' : 'warning'"
          :loading="walletSaving"
          @click="submitWalletAdjust"
        >确认{{ walletForm.direction === 'CREDIT' ? '充值' : '扣款' }}</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="transferVisible"
      :title="ownedCommunities.length ? '删除用户 · 群主/圈主处理' : '删除用户 · 群主处理'"
      width="560px"
      destroy-on-close
      :close-on-click-modal="false"
    >
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        style="margin-bottom: 16px"
        :title="`用户「${transferUser?.nickname || ''}」是以下群的群主，删除前请为每个群指定新群主。仅剩一人的群将自动解散。${ownedCommunities.length ? '圈子已选择连同用户一起删除。' : ''}`"
      />
      <el-alert
        v-if="ownedCommunities.length"
        type="error"
        :closable="false"
        show-icon
        style="margin-bottom: 16px"
        :title="`已确认同时删除 ${ownedCommunities.length} 个社区圈子及其内容、订单和收益。`"
      />
      <div v-for="g in ownedGroups" :key="g.conversationId" class="transfer-group">
        <div class="transfer-group-head">
          <div class="title">{{ g.title || '未命名群聊' }}</div>
          <div class="sub">群 ID {{ g.conversationId }} · {{ g.memberCount ?? 0 }} 人</div>
        </div>
        <el-tag v-if="g.mustDissolve" type="info" size="small" effect="plain">仅剩群主，将自动解散</el-tag>
        <el-select
          v-else
          v-model="transferSelections[g.conversationId]"
          filterable
          placeholder="选择新群主"
          style="width: 100%"
        >
          <el-option
            v-for="c in g.candidates || []"
            :key="c.userId"
            :label="candidateLabel(c)"
            :value="c.userId"
          />
        </el-select>
      </div>
      <template #footer>
        <el-button @click="transferVisible = false">取消</el-button>
        <el-button type="danger" :loading="transferDeleting" @click="confirmDeleteWithTransfers">
          确认删除
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.users-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.batch-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
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

.user-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-meta .nickname {
  font-weight: 600;
  color: #303133;
  line-height: 1.3;
}

.user-meta .sub {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

.user-detail-link {
  height: auto;
  padding: 2px 0 0;
  font-size: 12px;
}

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.avatar-editor {
  display: flex;
  align-items: center;
  gap: 16px;
}

.avatar-editor :deep(.el-avatar) {
  flex-shrink: 0;
  width: 64px !important;
  height: 64px !important;
  border-radius: 50% !important;
  overflow: hidden;
  background: #e5e7eb;
}

.avatar-editor :deep(.el-avatar > img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.avatar-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.avatar-hint {
  width: 100%;
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
}

.detail-panel {
  min-height: 180px;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.detail-header :deep(.el-avatar) {
  flex-shrink: 0;
  border-radius: 50% !important;
  overflow: hidden;
  background: #e5e7eb;
}

.detail-header :deep(.el-avatar > img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.detail-header-meta {
  min-width: 0;
}

.detail-name {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
  line-height: 1.3;
}

.detail-sub {
  margin-top: 4px;
  font-size: 13px;
  color: #909399;
}

.detail-tags {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.detail-desc {
  width: 100%;
}

.quick-links {
  margin-top: 18px;
}

.quick-links-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 10px;
}

.quick-links-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.password-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.status-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.status-sub {
  font-size: 12px;
  color: #909399;
  line-height: 1.3;
}

.ban-hint {
  margin-left: 8px;
  font-size: 13px;
  color: #909399;
}

.permission-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(110px, 1fr));
  width: 100%;
}

.friend-permission-cell {
  min-width: 0;
  cursor: default;
}

.friend-permission-primary {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  color: var(--el-text-color-regular);
  font-size: 12px;
}

.friend-permission-sub {
  overflow: hidden;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  white-space: nowrap;
}

.row-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.users-table :deep(.el-scrollbar__bar.is-horizontal) {
  display: none;
}

.transfer-group {
  padding: 12px 0;
  border-bottom: 1px solid #f0f0f0;
}

.transfer-group:last-child {
  border-bottom: none;
}

.transfer-group-head {
  margin-bottom: 8px;
}

.transfer-group .title {
  font-weight: 600;
  color: #303133;
  line-height: 1.3;
}

.transfer-group .sub {
  margin-top: 2px;
  font-size: 12px;
  color: #909399;
}
</style>

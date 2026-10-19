<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Expand, Fold } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from '@/utils/elementFeedback'
import type { FormInstance, FormRules, UploadRequestOptions } from 'element-plus'
import { useAdminStore } from '@/stores/admin'
import { changeAdminPassword } from '@/api/auth'
import { resolveAvatarUrl, uploadAdminAvatar } from '@/api/files'
import AdminAvatar from '@/components/AdminAvatar.vue'

const route = useRoute()
const router = useRouter()
const adminStore = useAdminStore()

const passwordVisible = ref(false)
const passwordSaving = ref(false)
const avatarUploading = ref(false)
const refreshing = ref(false)
const refreshKey = ref(0)
const asideCollapsed = ref(false)
const passwordFormRef = ref<FormInstance>()
const mainScrollRef = ref<HTMLElement>()
const mainRef = ref<HTMLElement>()

const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const passwordRules: FormRules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, max: 32, message: '新密码长度需为 6-32 位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (value !== passwordForm.newPassword) {
          callback(new Error('两次输入的密码不一致'))
        } else {
          callback()
        }
      },
      trigger: 'blur',
    },
  ],
}

const pageTitle = computed(() => {
  if (route.name === 'CommunityMemberRemovalReasons') return '移除原因配置'
  if (route.name === 'Dashboard') return '控制台'
  if (route.name === 'Users') return '用户列表'
  if (route.name === 'DefaultFriend') return '用户默认好友'
  if (route.name === 'UserFriends') return '用户好友'
  if (route.name === 'UserBlocks') return '用户黑名单'
  if (route.name === 'UserFavorites') return '用户收藏'
  if (route.name === 'UserBalanceRecords') return '用户余额记录'
  if (route.name === 'UserFriendDeleteLogs') return '删友记录'
  if (route.name === 'UserPhoneChangeLogs') return '手机号修改记录'
  if (route.name === 'UserDeletionLogs') return '用户注销记录'
  if (route.name === 'LoginLogs') return '用户登录日志'
  if (route.name === 'Groups') return '群聊列表'
  if (route.name === 'GroupMemberEvents') return '出入记录'
  if (route.name === 'GroupOwnerTransfers') return '群主转让记录'
  if (route.name === 'GroupOperationLogs') return '群操作记录'
  if (route.name === 'GroupDissolveLogs') return '群解散记录'
  if (route.name === 'PrivateMessages') return '私聊记录'
  if (route.name === 'GroupMessages') return '群聊记录'
  if (route.name === 'CallLogs') return '通话记录'
  if (route.name === 'PrivateRedPackets') return '单聊红包记录'
  if (route.name === 'GroupRedPackets') return '群聊红包记录'
  if (route.name === 'PrivateTransfers') return '单聊转账记录'
  if (route.name === 'GroupTransfers') return '群聊转账记录'
  if (route.name === 'Moments') return '动态列表'
  if (route.name === 'Communities') return '圈子管理'
  if (route.name === 'CommunityOrders') return '圈子订单'
  if (route.name === 'CommunityIncome') return '圈主收益明细'
  if (route.name === 'CommunityProfileReviews') return '圈子资料变更审核'
  if (route.name === 'CommunityDissolveLogs') return '圈子解散记录'
  if (route.name === 'CommunityOwnerTransferLogs') return '圈主转移记录'
  if (route.name === 'CommunityMemberEvents') return '圈子成员出入记录'
  if (route.name === 'CommunityTopics') return '圈子主题管理'
  if (route.name === 'CommunityRevenue') return '圈子收益配置'
  if (route.name === 'CommunityContent') return '圈子内容审核'
  if (route.name === 'CommunityReports') return '圈子举报管理'
  if (route.name === 'CommunityStats') return '圈子数据统计'
  if (route.name === 'Admins') return '管理员列表'
  if (route.name === 'SystemTexts') return '文本配置'
  if (route.name === 'AccountDeletionAgreement') return '注销协议'
  if (route.name === 'CommunityAgreements' || route.name === 'CommunityJoinAgreement') return '圈子协议'
  if (route.name === 'MapConfig') return '地图配置'
  if (route.name === 'AmountConfig') return '金额配置'
  if (route.name === 'ClientLoginMethods') return '客户端登录方式'
  if (route.name === 'ClientRegister') return '客户端注册开关'
  if (route.name === 'ClientWallet') return '客户端钱包开关'
  if (route.name === 'AppVersion') return 'App 版本管理'
  if (route.name === 'CallRingtone') return '来电铃声'
  if (route.name === 'SensitiveWords') return '敏感词屏蔽'
  if (route.name === 'NicknameConfig') return '昵称长度配置'
  if (route.name === 'ContainerConfig') return '系统容器配置'
  if (route.name === 'HelpFaqs') return '相关问题'
  if (route.name === 'UserFeedback') return '用户反馈'
  if (route.name === 'AdminLoginLogs') return '管理员登录日志'
  if (route.name === 'AdminOperationLogs') return '管理员操作日志'
  return 'Pulse 管理后台'
})

function can(code: string) {
  return adminStore.hasPermission(code)
}

function toggleAside() {
  asideCollapsed.value = !asideCollapsed.value
}

const showUserMgmt = computed(
  () =>
    can('users') ||
    can('user_friends') ||
    can('user_default_friend') ||
    can('user_blocks') ||
    can('user_favorites') ||
    can('user_friend_delete_logs') ||
    can('user_phone_change_logs') ||
    can('user_deletion_logs') ||
    can('user_balance_records') ||
    can('user_login_logs'),
)
const showGroupMgmt = computed(
  () =>
    can('groups') ||
    can('group_member_events') ||
    can('group_owner_transfers') ||
    can('group_operation_logs'),
)
const showChatMgmt = computed(
  () => can('messages') || can('call_logs'),
)
const showMomentMgmt = computed(() => can('moments'))
const showCommunityMgmt = computed(
  () => can('communities') || can('community_topics') || can('community_content') || can('community_reports'),
)
const showAdminMgmt = computed(() => can('admins'))
const showSystemMgmt = computed(
  () =>
    can('system_texts') ||
    can('map_config') ||
    can('amount_config') ||
    can('call_ringtone') ||
    can('app_version') ||
    can('sensitive_words') ||
    can('nickname_config') ||
    can('help_faqs') ||
    can('user_feedback') ||
    can('client_login_methods') ||
    can('client_register') ||
    can('client_wallet') ||
    can('container_config'),
)
const showLogMgmt = computed(
  () => can('admin_login_logs') || can('admin_operation_logs'),
)

const avatarSrc = computed(() => resolveAvatarUrl(adminStore.avatarUrl) || undefined)
const pageRefreshKey = computed(() => `${route.fullPath}:${refreshKey.value}`)

onMounted(() => {
  if (adminStore.isLoggedIn) {
    adminStore.refreshProfile().catch(() => {
      /* ignore */
    })
  }
})

watch(
  () => route.path,
  async (path, previousPath) => {
    if (path === previousPath) return
    await nextTick()
    mainScrollRef.value?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    mainRef.value?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    document.scrollingElement?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  },
  { flush: 'post' },
)

function openPasswordDialog() {
  passwordForm.oldPassword = ''
  passwordForm.newPassword = ''
  passwordForm.confirmPassword = ''
  passwordVisible.value = true
}

async function submitPassword() {
  const valid = await passwordFormRef.value?.validate().catch(() => false)
  if (!valid) return
  passwordSaving.value = true
  try {
    await changeAdminPassword({
      oldPassword: passwordForm.oldPassword,
      newPassword: passwordForm.newPassword,
    })
    ElMessage.success('密码已修改，请重新登录')
    passwordVisible.value = false
    adminStore.logout()
    router.push('/login')
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '修改密码失败')
  } finally {
    passwordSaving.value = false
  }
}

async function uploadAvatar(options: UploadRequestOptions) {
  const file = options.file as File
  if (!file.type.startsWith('image/')) {
    ElMessage.error('请选择图片文件')
    return
  }
  avatarUploading.value = true
  try {
    const uploaded = await uploadAdminAvatar(file)
    await adminStore.updateProfile({ avatarUrl: uploaded.url })
    ElMessage.success('头像已更新')
    options.onSuccess?.(uploaded)
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '上传失败')
    options.onError?.(e as Parameters<NonNullable<typeof options.onError>>[0])
  } finally {
    avatarUploading.value = false
  }
}

async function handleLogout() {
  try {
    await ElMessageBox.confirm('确定要退出登录吗？', '退出登录', {
      confirmButtonText: '退出',
      cancelButtonText: '取消',
      type: 'warning',
      confirmButtonClass: 'el-button--danger',
    })
    adminStore.logout()
    router.push('/login')
  } catch {
    /* cancelled */
  }
}

function onUserCommand(cmd: string | number | object) {
  const c = String(cmd)
  if (c === 'password') openPasswordDialog()
  if (c === 'logout') handleLogout()
}

function refreshCurrentPage() {
  refreshing.value = true
  refreshKey.value += 1
  window.setTimeout(() => {
    refreshing.value = false
  }, 450)
}
</script>

<template>
  <el-container class="admin-layout">
    <el-aside :width="asideCollapsed ? '80px' : '220px'" class="admin-aside">
      <div class="aside-scroll">
        <div class="brand" :class="{ 'is-collapsed': asideCollapsed }">
          <span class="brand-logo">P</span>
          <span class="brand-text">Pulse Admin</span>
          <button
            type="button"
            class="aside-toggle"
            :title="asideCollapsed ? '展开菜单' : '收起菜单'"
            :aria-label="asideCollapsed ? '展开菜单' : '收起菜单'"
            @click="toggleAside"
          >
            <el-icon><Expand v-if="asideCollapsed" /><Fold v-else /></el-icon>
          </button>
        </div>
        <el-menu
          class="admin-menu"
          :default-active="route.path"
          :default-openeds="['user-mgmt', 'group-mgmt', 'chat-mgmt', 'moment-mgmt', 'admin-mgmt', 'system-mgmt', 'log-mgmt']"
          :collapse="asideCollapsed"
          :collapse-transition="false"
          router
          background-color="#1c1c1e"
          text-color="#a1a1aa"
          active-text-color="#3b82f6"
        >
        <el-menu-item index="/dashboard">
          <el-icon><Odometer /></el-icon>
          <span>控制台</span>
        </el-menu-item>
        <el-sub-menu v-if="showUserMgmt" index="user-mgmt">
          <template #title>
            <el-icon><User /></el-icon>
            <span>用户管理</span>
          </template>
          <el-menu-item v-if="can('users')" index="/users">
            <el-icon><List /></el-icon>
            <span>用户列表</span>
          </el-menu-item>
          <el-menu-item v-if="can('user_friends')" index="/user-friends">
            <el-icon><UserFilled /></el-icon>
            <span>用户好友</span>
          </el-menu-item>
          <el-menu-item v-if="can('user_default_friend')" index="/default-friend">
            <el-icon><UserFilled /></el-icon>
            <span>用户默认好友</span>
          </el-menu-item>
          <el-menu-item v-if="can('user_blocks')" index="/user-blocks">
            <el-icon><CircleClose /></el-icon>
            <span>用户黑名单</span>
          </el-menu-item>
          <el-menu-item v-if="can('user_favorites')" index="/user-favorites">
            <el-icon><Star /></el-icon>
            <span>用户收藏</span>
          </el-menu-item>
          <el-menu-item v-if="can('user_friend_delete_logs')" index="/user-friend-delete-logs">
            <el-icon><Remove /></el-icon>
            <span>删友记录</span>
          </el-menu-item>
          <el-menu-item v-if="can('user_phone_change_logs')" index="/user-phone-change-logs">
            <el-icon><Tickets /></el-icon>
            <span>手机号修改记录</span>
          </el-menu-item>
          <el-menu-item v-if="can('user_deletion_logs')" index="/user-deletion-logs">
            <el-icon><Tickets /></el-icon>
            <span>用户注销记录</span>
          </el-menu-item>
          <el-menu-item v-if="can('user_login_logs')" index="/login-logs">
            <el-icon><Tickets /></el-icon>
            <span>用户登录日志</span>
          </el-menu-item>
          <el-menu-item v-if="can('user_balance_records')" index="/user-balance-records">
            <el-icon><Tickets /></el-icon>
            <span>用户余额记录</span>
          </el-menu-item>
        </el-sub-menu>
        <el-sub-menu v-if="showGroupMgmt" index="group-mgmt">
          <template #title>
            <el-icon><ChatDotRound /></el-icon>
            <span>群聊管理</span>
          </template>
          <el-menu-item v-if="can('groups')" index="/groups">
            <el-icon><List /></el-icon>
            <span>群聊列表</span>
          </el-menu-item>
          <el-menu-item v-if="can('group_member_events')" index="/group-member-events">
            <el-icon><Tickets /></el-icon>
            <span>出入记录</span>
          </el-menu-item>
          <el-menu-item v-if="can('group_owner_transfers')" index="/group-owner-transfers">
            <el-icon><Switch /></el-icon>
            <span>群主转让记录</span>
          </el-menu-item>
          <el-menu-item v-if="can('group_operation_logs')" index="/group-operation-logs">
            <el-icon><Document /></el-icon>
            <span>群操作记录</span>
          </el-menu-item>
          <el-menu-item v-if="can('group_member_events')" index="/group-dissolve-logs">
            <el-icon><Delete /></el-icon>
            <span>群解散记录</span>
          </el-menu-item>
        </el-sub-menu>
        <el-sub-menu v-if="showChatMgmt" index="chat-mgmt">
          <template #title>
            <el-icon><ChatLineRound /></el-icon>
            <span>聊天记录</span>
          </template>
          <el-menu-item v-if="can('messages')" index="/private-messages">
            <el-icon><ChatDotSquare /></el-icon>
            <span>私聊记录</span>
          </el-menu-item>
          <el-menu-item v-if="can('messages')" index="/group-messages">
            <el-icon><ChatLineSquare /></el-icon>
            <span>群聊记录</span>
          </el-menu-item>
          <el-menu-item v-if="can('call_logs')" index="/call-logs">
            <el-icon><Phone /></el-icon>
            <span>通话记录</span>
          </el-menu-item>
        </el-sub-menu>
        <el-sub-menu v-if="can('messages')" index="red-packet-records">
          <template #title>
            <el-icon><Tickets /></el-icon>
            <span>红包记录</span>
          </template>
          <el-menu-item index="/private-red-packets">
            <el-icon><Tickets /></el-icon>
            <span>单聊红包记录</span>
          </el-menu-item>
          <el-menu-item index="/group-red-packets">
            <el-icon><Tickets /></el-icon>
            <span>群聊红包记录</span>
          </el-menu-item>
        </el-sub-menu>
        <el-sub-menu v-if="can('messages')" index="transfer-records">
          <template #title>
            <el-icon><Switch /></el-icon>
            <span>转账记录</span>
          </template>
          <el-menu-item index="/private-transfers">
            <el-icon><Tickets /></el-icon>
            <span>单聊转账记录</span>
          </el-menu-item>
          <el-menu-item index="/group-transfers">
            <el-icon><Tickets /></el-icon>
            <span>群聊转账记录</span>
          </el-menu-item>
        </el-sub-menu>
        <el-sub-menu v-if="showMomentMgmt" index="moment-mgmt">
          <template #title>
            <el-icon><Picture /></el-icon>
            <span>动态管理</span>
          </template>
          <el-menu-item v-if="can('moments')" index="/moments">
            <el-icon><List /></el-icon>
            <span>动态列表</span>
          </el-menu-item>
        </el-sub-menu>
        <el-sub-menu v-if="showCommunityMgmt" index="community-mgmt">
          <el-menu-item v-if="can('communities')" index="/community-member-removal-reasons"><el-icon><Remove /></el-icon><span>移除原因配置</span></el-menu-item>
          <template #title><el-icon><Connection /></el-icon><span>圈子管理</span></template>
          <el-menu-item v-if="can('communities')" index="/communities"><el-icon><List /></el-icon><span>圈子审核与列表</span></el-menu-item>
          <el-menu-item v-if="can('communities')" index="/community-orders"><el-icon><Tickets /></el-icon><span>圈子订单</span></el-menu-item>
          <el-menu-item v-if="can('communities')" index="/community-income"><el-icon><Money /></el-icon><span>圈主收益明细</span></el-menu-item>
          <el-menu-item v-if="can('communities')" index="/community-profile-reviews"><el-icon><Edit /></el-icon><span>圈子资料变更审核</span></el-menu-item>
          <el-menu-item v-if="can('communities')" index="/community-dissolve-logs"><el-icon><Delete /></el-icon><span>圈子解散记录</span></el-menu-item>
          <el-menu-item v-if="can('communities')" index="/community-owner-transfer-logs"><el-icon><Switch /></el-icon><span>圈主转移记录</span></el-menu-item>
          <el-menu-item v-if="can('communities')" index="/community-member-events"><el-icon><Tickets /></el-icon><span>圈子成员出入记录</span></el-menu-item>
          <el-menu-item v-if="can('community_topics')" index="/community-topics"><el-icon><CollectionTag /></el-icon><span>圈子主题管理</span></el-menu-item>
          <el-menu-item v-if="can('communities')" index="/community-revenue"><el-icon><Money /></el-icon><span>收益配置</span></el-menu-item>
          <el-menu-item v-if="can('community_content')" index="/community-content"><el-icon><Document /></el-icon><span>内容审核</span></el-menu-item>
          <el-menu-item v-if="can('community_reports')" index="/community-reports"><el-icon><Warning /></el-icon><span>举报管理</span></el-menu-item>
          <el-menu-item v-if="can('communities')" index="/community-stats"><el-icon><DataAnalysis /></el-icon><span>数据统计</span></el-menu-item>
        </el-sub-menu>
        <el-sub-menu v-if="showAdminMgmt" index="admin-mgmt">
          <template #title>
            <el-icon><UserFilled /></el-icon>
            <span>管理员管理</span>
          </template>
          <el-menu-item index="/admins">
            <el-icon><List /></el-icon>
            <span>管理员列表</span>
          </el-menu-item>
        </el-sub-menu>
        <el-sub-menu v-if="showSystemMgmt" index="system-mgmt">
          <template #title>
            <el-icon><Setting /></el-icon>
            <span>系统配置</span>
          </template>
          <el-menu-item v-if="can('system_texts')" index="/system-texts">
            <el-icon><Document /></el-icon>
            <span>文本配置</span>
          </el-menu-item>
          <el-menu-item v-if="can('system_texts')" index="/community-agreements">
            <el-icon><DocumentChecked /></el-icon>
            <span>圈子协议</span>
          </el-menu-item>
          <el-menu-item v-if="can('system_texts')" index="/account-deletion-agreement">
            <el-icon><DocumentChecked /></el-icon>
            <span>注销协议</span>
          </el-menu-item>
          <el-menu-item v-if="can('map_config')" index="/map-config">
            <el-icon><Location /></el-icon>
            <span>地图配置</span>
          </el-menu-item>
          <el-menu-item v-if="can('file_config')" index="/file-config">
            <el-icon><FolderOpened /></el-icon>
            <span>文件参数</span>
          </el-menu-item>
          <el-menu-item v-if="can('container_config')" index="/container-config">
            <el-icon><Setting /></el-icon>
            <span>系统容器配置</span>
          </el-menu-item>
          <el-menu-item v-if="can('amount_config')" index="/amount-config">
            <el-icon><Money /></el-icon>
            <span>金额配置</span>
          </el-menu-item>
          <el-menu-item v-if="can('client_login_methods')" index="/client-login-methods">
            <el-icon><Connection /></el-icon>
            <span>客户端登录方式</span>
          </el-menu-item>
          <el-menu-item v-if="can('client_register')" index="/client-register">
            <el-icon><UserFilled /></el-icon>
            <span>客户端注册开关</span>
          </el-menu-item>
          <el-menu-item v-if="can('client_wallet')" index="/client-wallet">
            <el-icon><Money /></el-icon>
            <span>客户端钱包开关</span>
          </el-menu-item>
          <el-menu-item v-if="can('app_version') || can('system_texts')" index="/app-version">
            <el-icon><Upload /></el-icon>
            <span>App 版本管理</span>
          </el-menu-item>
          <el-menu-item v-if="can('call_ringtone')" index="/call-ringtone">
            <el-icon><Bell /></el-icon>
            <span>来电铃声</span>
          </el-menu-item>
          <el-menu-item v-if="can('sensitive_words')" index="/sensitive-words">
            <el-icon><Warning /></el-icon>
            <span>敏感词屏蔽</span>
          </el-menu-item>
          <el-menu-item v-if="can('nickname_config')" index="/nickname-config">
            <el-icon><UserFilled /></el-icon>
            <span>昵称长度配置</span>
          </el-menu-item>
          <el-menu-item v-if="can('help_faqs')" index="/help-faqs">
            <el-icon><QuestionFilled /></el-icon>
            <span>相关问题</span>
          </el-menu-item>
          <el-menu-item v-if="can('user_feedback')" index="/user-feedback">
            <el-icon><ChatDotSquare /></el-icon>
            <span>用户反馈</span>
          </el-menu-item>
        </el-sub-menu>
        <el-sub-menu v-if="showLogMgmt" index="log-mgmt">
          <template #title>
            <el-icon><Document /></el-icon>
            <span>日志管理</span>
          </template>
          <el-menu-item v-if="can('admin_login_logs')" index="/admin-login-logs">
            <el-icon><Tickets /></el-icon>
            <span>管理员登录日志</span>
          </el-menu-item>
          <el-menu-item v-if="can('admin_operation_logs')" index="/admin-operation-logs">
            <el-icon><Notebook /></el-icon>
            <span>管理员操作日志</span>
          </el-menu-item>
        </el-sub-menu>
        </el-menu>
      </div>
    </el-aside>

    <el-container class="admin-workspace">
      <el-header class="admin-header">
        <h2 class="page-title">{{ pageTitle }}</h2>
        <div class="header-right">
          <el-tooltip content="刷新当前页面" placement="bottom">
            <el-button
              class="refresh-button"
              :disabled="refreshing"
              circle
              @click="refreshCurrentPage"
            >
              <el-icon :class="{ 'is-spinning': refreshing }"><Refresh /></el-icon>
            </el-button>
          </el-tooltip>
          <el-dropdown trigger="click" @command="onUserCommand">
            <button type="button" class="user-entry" :disabled="avatarUploading">
              <AdminAvatar :size="36" :url="avatarSrc" class="user-avatar">
                {{ (adminStore.displayName || '管').slice(0, 1) }}
              </AdminAvatar>
              <div class="user-meta">
                <span class="user-name">{{ adminStore.displayName }}</span>
                <span class="user-account">{{ adminStore.username || '管理员' }}</span>
              </div>
              <el-icon class="user-caret"><ArrowDown /></el-icon>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item disabled>
                  <span class="dropdown-hint">账号 {{ adminStore.username || '—' }}</span>
                </el-dropdown-item>
                <el-dropdown-item divided>
                  <el-upload
                    :show-file-list="false"
                    accept="image/jpeg,image/png,image/gif,image/webp,image/bmp,.jpg,.jpeg,.png,.gif,.webp,.bmp"
                    :http-request="uploadAvatar"
                    :disabled="avatarUploading"
                  >
                    <span class="upload-item">{{ avatarUploading ? '上传中…' : '更换头像' }}</span>
                  </el-upload>
                </el-dropdown-item>
                <el-dropdown-item command="password">修改密码</el-dropdown-item>
                <el-dropdown-item divided command="logout">
                  <span class="logout-item">退出登录</span>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main class="admin-main">
        <div ref="mainScrollRef" class="admin-main-scroll">
          <div ref="mainRef" class="admin-page">
            <router-view :key="pageRefreshKey" />
          </div>
        </div>
      </el-main>
    </el-container>

    <el-dialog
      v-model="passwordVisible"
      title="修改密码"
      width="420px"
      destroy-on-close
      :close-on-click-modal="false"
    >
      <el-form
        ref="passwordFormRef"
        :model="passwordForm"
        :rules="passwordRules"
        label-width="96px"
      >
        <el-form-item label="原密码" prop="oldPassword">
          <el-input
            v-model="passwordForm.oldPassword"
            type="password"
            show-password
            autocomplete="current-password"
          />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input
            v-model="passwordForm.newPassword"
            type="password"
            show-password
            autocomplete="new-password"
          />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input
            v-model="passwordForm.confirmPassword"
            type="password"
            show-password
            autocomplete="new-password"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="passwordVisible = false">取消</el-button>
        <el-button type="primary" :loading="passwordSaving" @click="submitPassword">确认修改</el-button>
      </template>
    </el-dialog>
  </el-container>
</template>

<style scoped>
.admin-layout {
  height: 100vh;
  min-height: 100vh;
  overflow: hidden;
  background: #f5f7fa;
}

.admin-aside {
  height: 100%;
  overflow: hidden;
  background: #1c1c1e;
  border-right: 1px solid #2c2c2e;
  transition: width 0.24s cubic-bezier(0.4, 0, 0.2, 1);
}

.aside-scroll {
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.24) transparent;
}

.aside-scroll::-webkit-scrollbar {
  width: 6px;
}

.aside-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.aside-scroll::-webkit-scrollbar-thumb {
  border: 1px solid transparent;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
  background-clip: padding-box;
}

.aside-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.38);
  background-clip: padding-box;
}

.admin-workspace {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.brand {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 60px;
  padding: 0 16px;
  overflow: hidden;
  white-space: nowrap;
  border-bottom: 1px solid #2c2c2e;
  transition: padding 0.24s cubic-bezier(0.4, 0, 0.2, 1);
}

.brand.is-collapsed {
  justify-content: flex-start;
  padding: 0 8px;
}

.brand.is-collapsed .brand-logo {
  margin-left: 0;
}

.brand-logo {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: #3b82f6;
  color: #fff;
  display: flex;
  flex: 0 0 32px;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}

.brand-text {
  display: block;
  flex: 1 1 auto;
  min-width: 0;
  max-width: 120px;
  overflow: hidden;
  color: #fff;
  font-weight: 600;
  font-size: 15px;
  text-overflow: clip;
  white-space: nowrap;
  opacity: 1;
  transition: max-width 0.16s ease, opacity 0.1s ease;
}

.brand.is-collapsed .brand-text {
  max-width: 0;
  opacity: 0;
  pointer-events: none;
}

.aside-toggle {
  display: inline-flex;
  flex: 0 0 28px;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-left: auto;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 7px;
  color: #a1a1aa;
  background: transparent;
  cursor: pointer;
  transition: color 0.15s, background 0.15s, border-color 0.15s;
}

.aside-toggle:hover {
  border-color: #3a3a3c;
  color: #fff;
  background: #2c2c2e;
}

.brand.is-collapsed .aside-toggle {
  position: absolute;
  right: 4px;
  width: 20px;
  height: 20px;
}

.admin-menu {
  min-height: calc(100% - 60px);
  border-right: 0;
}

.admin-menu :deep(.el-menu--collapse) {
  width: 100%;
}

.admin-menu :deep(.el-menu-item),
.admin-menu :deep(.el-sub-menu__title) {
  box-sizing: border-box;
  display: flex;
  align-items: center;
}

.admin-menu :deep(.el-menu-item > .el-icon),
.admin-menu :deep(.el-sub-menu__title > .el-icon) {
  flex: 0 0 24px;
  margin-right: 10px;
}

.admin-menu :deep(.el-menu--collapse > .el-menu-item),
.admin-menu :deep(.el-menu--collapse > .el-sub-menu > .el-sub-menu__title) {
  justify-content: center;
  padding: 0 !important;
}

.admin-menu :deep(.el-menu--collapse .el-menu-item > span),
.admin-menu :deep(.el-menu--collapse .el-sub-menu__title > span) {
  display: none;
}

.admin-menu :deep(.el-menu--collapse .el-menu-item > .el-icon),
.admin-menu :deep(.el-menu--collapse .el-sub-menu__title > .el-icon) {
  flex: 0 0 24px;
  margin: 0;
}

.admin-menu :deep(.el-menu--collapse .el-sub-menu__icon-arrow) {
  display: none;
}

.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  height: 60px;
  padding: 0 24px;
}

.page-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.refresh-button {
  flex-shrink: 0;
}

.refresh-button .is-spinning {
  animation: refresh-spin 0.8s linear infinite;
}

@keyframes refresh-spin {
  to {
    transform: rotate(360deg);
  }
}

.user-entry {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  border: 1px solid transparent;
  background: #f5f7fa;
  border-radius: 999px;
  padding: 4px 12px 4px 4px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.user-entry:hover {
  background: #eef2f7;
  border-color: #e4e7ed;
}

.user-avatar {
  background: #3b82f6;
  color: #fff;
  flex-shrink: 0;
}

.user-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  line-height: 1.2;
}

.user-name {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-account {
  font-size: 11px;
  color: #909399;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-caret {
  color: #909399;
  font-size: 12px;
}

.dropdown-hint {
  color: #909399;
  font-size: 12px;
}

.upload-item {
  display: block;
  width: 100%;
  color: inherit;
}

.logout-item {
  color: #f56c6c;
}

.admin-main {
  min-height: 0;
  overflow: hidden;
  padding: 24px;
}

.admin-main-scroll {
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: thin;
}

.admin-page {
  min-height: 100%;
}
</style>

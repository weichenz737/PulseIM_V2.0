import { createRouter, createWebHistory } from 'vue-router'
import { getToken } from '@/api/http'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.path !== from.path) return { top: 0, left: 0 }
    return false
  },
  routes: [
    {
      path: '/login',
      name: 'AdminLogin',
      component: () => import('@/views/LoginView.vue'),
      meta: { guest: true },
    },
    {
      path: '/',
      component: () => import('@/layouts/AdminLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          redirect: '/dashboard',
        },
        {
          path: 'dashboard',
          name: 'Dashboard',
          component: () => import('@/views/DashboardView.vue'),
        },
        {
          path: 'users',
          name: 'Users',
          component: () => import('@/views/UsersView.vue'),
          meta: { permission: 'users' },
        },
        {
          path: 'default-friend',
          name: 'DefaultFriend',
          component: () => import('@/views/DefaultFriendView.vue'),
          meta: { permission: 'user_default_friend' },
        },
        {
          path: 'user-friends',
          name: 'UserFriends',
          component: () => import('@/views/UserFriendsView.vue'),
          meta: { permission: 'user_friends' },
        },
        {
          path: 'user-blocks',
          name: 'UserBlocks',
          component: () => import('@/views/UserBlocksView.vue'),
          meta: { permission: 'user_blocks' },
        },
        {
          path: 'user-favorites',
          name: 'UserFavorites',
          component: () => import('@/views/UserFavoritesView.vue'),
          meta: { permission: 'user_favorites' },
        },
        {
          path: 'user-balance-records',
          name: 'UserBalanceRecords',
          component: () => import('@/views/UserBalanceRecordsView.vue'),
          meta: { permission: 'user_balance_records' },
        },
        {
          path: 'user-friend-delete-logs',
          name: 'UserFriendDeleteLogs',
          component: () => import('@/views/UserFriendDeleteLogsView.vue'),
          meta: { permission: 'user_friend_delete_logs' },
        },
        {
          path: 'user-phone-change-logs',
          name: 'UserPhoneChangeLogs',
          component: () => import('@/views/UserPhoneChangeLogsView.vue'),
          meta: { permission: 'user_phone_change_logs' },
        },
        {
          path: 'user-deletion-logs',
          name: 'UserDeletionLogs',
          component: () => import('@/views/UserDeletionLogsView.vue'),
          meta: { permission: 'user_deletion_logs' },
        },
        {
          path: 'login-logs',
          name: 'LoginLogs',
          component: () => import('@/views/LoginLogsView.vue'),
          meta: { permission: 'user_login_logs' },
        },
        {
          path: 'groups',
          name: 'Groups',
          component: () => import('@/views/GroupsView.vue'),
          meta: { permission: 'groups' },
        },
        {
          path: 'group-member-events',
          name: 'GroupMemberEvents',
          component: () => import('@/views/GroupMemberEventsView.vue'),
          meta: { permission: 'group_member_events' },
        },
        {
          path: 'group-owner-transfers',
          name: 'GroupOwnerTransfers',
          component: () => import('@/views/GroupOwnerTransfersView.vue'),
          meta: { permission: 'group_owner_transfers' },
        },
        {
          path: 'group-operation-logs',
          name: 'GroupOperationLogs',
          component: () => import('@/views/GroupOperationLogsView.vue'),
          meta: { permission: 'group_operation_logs' },
        },
        {
          path: 'group-dissolve-logs',
          name: 'GroupDissolveLogs',
          component: () => import('@/views/GroupDissolveLogsView.vue'),
          meta: { permission: 'group_member_events' },
        },
        {
          path: 'private-messages',
          name: 'PrivateMessages',
          component: () => import('@/views/MessageRecordsView.vue'),
          meta: { conversationType: 1, permission: 'messages' },
        },
        {
          path: 'group-messages',
          name: 'GroupMessages',
          component: () => import('@/views/MessageRecordsView.vue'),
          meta: { conversationType: 2, permission: 'messages' },
        },
        {
          path: 'call-logs',
          name: 'CallLogs',
          component: () => import('@/views/CallLogsView.vue'),
          meta: { permission: 'call_logs' },
        },
        {
          path: 'private-red-packets', name: 'PrivateRedPackets',
          component: () => import('@/views/MoneyRecordsView.vue'),
          meta: { permission: 'messages', kind: 'red', conversationType: 1 },
        },
        {
          path: 'group-red-packets', name: 'GroupRedPackets',
          component: () => import('@/views/MoneyRecordsView.vue'),
          meta: { permission: 'messages', kind: 'red', conversationType: 2 },
        },
        {
          path: 'private-transfers', name: 'PrivateTransfers',
          component: () => import('@/views/MoneyRecordsView.vue'),
          meta: { permission: 'messages', kind: 'transfer', conversationType: 1 },
        },
        {
          path: 'group-transfers', name: 'GroupTransfers',
          component: () => import('@/views/MoneyRecordsView.vue'),
          meta: { permission: 'messages', kind: 'transfer', conversationType: 2 },
        },
        {
          path: 'moments',
          name: 'Moments',
          component: () => import('@/views/MomentsView.vue'),
          meta: { permission: 'moments' },
        },
        { path: 'communities', name: 'Communities', component: () => import('@/views/CommunitiesView.vue'), meta: { permission: 'communities' } },
        { path: 'community-orders', name: 'CommunityOrders', component: () => import('@/views/CommunityFinanceView.vue'), meta: { permission: 'communities', financeTab: 'orders' } },
        { path: 'community-income', name: 'CommunityIncome', component: () => import('@/views/CommunityFinanceView.vue'), meta: { permission: 'communities', financeTab: 'income' } },
        { path: 'community-profile-reviews', name: 'CommunityProfileReviews', component: () => import('@/views/CommunityProfileReviewsView.vue'), meta: { permission: 'communities' } },
        { path: 'community-dissolve-logs', name: 'CommunityDissolveLogs', component: () => import('@/views/CommunityAuditLogsView.vue'), meta: { permission: 'communities', logType: 'DISSOLVE' } },
        { path: 'community-owner-transfer-logs', name: 'CommunityOwnerTransferLogs', component: () => import('@/views/CommunityAuditLogsView.vue'), meta: { permission: 'communities', logType: 'TRANSFER' } },
        { path: 'community-member-events', name: 'CommunityMemberEvents', component: () => import('@/views/CommunityAuditLogsView.vue'), meta: { permission: 'communities', logType: 'MEMBER' } },
        { path: 'community-topics', name: 'CommunityTopics', component: () => import('@/views/CommunityTopicsView.vue'), meta: { permission: 'community_topics' } },
        { path: 'community-revenue', name: 'CommunityRevenue', component: () => import('@/views/CommunityRevenueView.vue'), meta: { permission: 'communities' } },
        { path: 'community-content', name: 'CommunityContent', component: () => import('@/views/CommunityContentView.vue'), meta: { permission: 'community_content' } },
        { path: 'community-reports', name: 'CommunityReports', component: () => import('@/views/CommunityReportsView.vue'), meta: { permission: 'community_reports' } },
        { path: 'community-member-removal-reasons', name: 'CommunityMemberRemovalReasons', component: () => import('@/views/CommunityReportsView.vue'), meta: { permission: 'communities' } },
        { path: 'community-stats', name: 'CommunityStats', component: () => import('@/views/CommunityStatsView.vue'), meta: { permission: 'communities' } },
        {
          path: 'admins',
          name: 'Admins',
          component: () => import('@/views/AdminsView.vue'),
          meta: { permission: 'admins' },
        },
        {
          path: 'system-texts',
          name: 'SystemTexts',
          component: () => import('@/views/SystemTextsView.vue'),
          meta: { permission: 'system_texts' },
        },
        {
          path: 'community-agreements',
          name: 'CommunityAgreements',
          component: () => import('@/views/CommunityAgreementsView.vue'),
          meta: { permission: 'system_texts' },
        },
        {
          path: 'account-deletion-agreement',
          name: 'AccountDeletionAgreement',
          component: () => import('@/views/AccountDeletionAgreementView.vue'),
          meta: { permission: 'system_texts' },
        },
        {
          path: 'community-join-agreement',
          name: 'CommunityJoinAgreement',
          redirect: '/community-agreements',
          meta: { permission: 'system_texts' },
        },
        {
          path: 'map-config',
          name: 'MapConfig',
          component: () => import('@/views/MapConfigView.vue'),
          meta: { permission: 'map_config' },
        },
        {
          path: 'file-config',
          name: 'FileConfig',
          component: () => import('@/views/FileConfigView.vue'),
          meta: { permission: 'file_config' },
        },
        {
          path: 'container-config',
          name: 'ContainerConfig',
          component: () => import('@/views/ContainerConfigView.vue'),
          meta: { permission: 'container_config' },
        },
        {
          path: 'amount-config',
          name: 'AmountConfig',
          component: () => import('@/views/AmountConfigView.vue'),
          meta: { permission: 'amount_config' },
        },
        {
          path: 'client-login-methods',
          name: 'ClientLoginMethods',
          component: () => import('@/views/ClientAccessConfigView.vue'),
          meta: { permission: 'client_login_methods' },
        },
        {
          path: 'client-register',
          name: 'ClientRegister',
          component: () => import('@/views/ClientAccessConfigView.vue'),
          meta: { permission: 'client_register' },
        },
        {
          path: 'client-wallet',
          name: 'ClientWallet',
          component: () => import('@/views/ClientAccessConfigView.vue'),
          meta: { permission: 'client_wallet' },
        },
        {
          path: 'app-version',
          name: 'AppVersion',
          component: () => import('@/views/AppVersionView.vue'),
          meta: { permission: 'app_version' },
        },
        {
          path: 'call-ringtone',
          name: 'CallRingtone',
          component: () => import('@/views/CallRingtoneConfigView.vue'),
          meta: { permission: 'call_ringtone' },
        },
        {
          path: 'sensitive-words',
          name: 'SensitiveWords',
          component: () => import('@/views/SensitiveWordsView.vue'),
          meta: { permission: 'sensitive_words' },
        },
        {
          path: 'nickname-config',
          name: 'NicknameConfig',
          component: () => import('@/views/NicknameConfigView.vue'),
          meta: { permission: 'nickname_config' },
        },
        {
          path: 'help-faqs',
          name: 'HelpFaqs',
          component: () => import('@/views/HelpFaqsView.vue'),
          meta: { permission: 'help_faqs' },
        },
        {
          path: 'user-feedback',
          name: 'UserFeedback',
          component: () => import('@/views/UserFeedbackView.vue'),
          meta: { permission: 'user_feedback' },
        },
        {
          path: 'admin-login-logs',
          name: 'AdminLoginLogs',
          component: () => import('@/views/AdminLoginLogsView.vue'),
          meta: { permission: 'admin_login_logs' },
        },
        {
          path: 'admin-operation-logs',
          name: 'AdminOperationLogs',
          component: () => import('@/views/AdminOperationLogsView.vue'),
          meta: { permission: 'admin_operation_logs' },
        },
      ],
    },
  ],
})

router.beforeEach(async (to, _from, next) => {
  const token = getToken()

  if (to.meta.requiresAuth && !token) {
    next({ name: 'AdminLogin', query: { redirect: to.fullPath } })
    return
  }

  if (to.meta.guest && token) {
    next({ name: 'Dashboard' })
    return
  }

  const permission = typeof to.meta.permission === 'string' ? to.meta.permission : ''
  if (token && permission) {
    const { useAdminStore } = await import('@/stores/admin')
    const adminStore = useAdminStore()
    // Refresh when the cached profile does not contain the requested module.
    // This also upgrades stale sessions after new permissions are added.
    if (!adminStore.superAdmin && !adminStore.hasPermission(permission)) {
      try {
        await adminStore.refreshProfile()
      } catch {
        /* ignore */
      }
    }
    if (!adminStore.hasPermission(permission)) {
      next({ name: 'Dashboard' })
      return
    }
  }

  next()
})

export default router

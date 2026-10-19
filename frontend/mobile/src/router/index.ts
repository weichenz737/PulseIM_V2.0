import { createRouter, createWebHistory } from 'vue-router'
import { getToken } from '@/api/http'
import { isNativeApp } from '@/native/platform'
import {
  consumeExplicitBackTransition,
  routeTransitionDirection,
} from '@/router/transition'
// This is a primary home-screen action. Keeping its small component in the
// entry graph avoids a visible lazy-chunk gap on the first tap.
import AddFriendView from '@/views/AddFriendView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/app/messages',
    },
    {
      path: '/messages',
      redirect: '/app/messages',
    },
    {
      path: '/login',
      name: 'Login',
      component: () => import('@/views/LoginView.vue'),
      meta: { guest: true },
    },
    {
      path: '/forgot-password',
      name: 'ForgotPassword',
      component: () => import('@/views/ForgotPasswordView.vue'),
      meta: { guest: true },
    },
    {
      path: '/register',
      name: 'Register',
      component: () => import('@/views/RegisterView.vue'),
      meta: { guest: true },
    },
    {
      path: '/register/code',
      name: 'RegisterCode',
      component: () => import('@/views/RegisterCodeView.vue'),
      meta: { guest: true },
    },
    {
      path: '/register/profile',
      name: 'RegisterProfile',
      component: () => import('@/views/RegisterProfileView.vue'),
      meta: { guest: true },
    },
    {
      path: '/app',
      component: () => import('@/layouts/MainLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          redirect: '/app/messages',
        },
        {
          path: 'messages',
          name: 'Messages',
          component: () => import('@/views/MessagesView.vue'),
          meta: { keepAlive: true },
        },
        {
          path: 'contacts',
          name: 'Contacts',
          component: () => import('@/views/ContactsView.vue'),
          meta: { keepAlive: true },
        },
        {
          path: 'discover',
          name: 'Discover',
          component: () => import('@/views/DiscoverView.vue'),
          meta: { keepAlive: true },
        },
        {
          path: 'me',
          name: 'Me',
          component: () => import('@/views/MeView.vue'),
          meta: { keepAlive: true },
        },
      ],
    },
    {
      path: '/chat/:id',
      name: 'Chat',
      component: () => import('@/views/ChatView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/messages' },
    },
    {
      path: '/chat/:id/location',
      name: 'LocationPicker',
      component: () => import('@/views/LocationPickerView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/messages' },
    },
    {
      path: '/chat/:id/live-location',
      name: 'LiveLocation',
      component: () => import('@/views/LiveLocationView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/messages' },
    },
    {
      path: '/search',
      name: 'Search',
      component: () => import('@/views/SearchView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/messages' },
    },
    {
      path: '/contacts/add',
      name: 'AddFriend',
      component: AddFriendView,
      meta: { requiresAuth: true, backFallback: '/app/messages', keepAlive: true },
    },
    {
      path: '/group/add',
      name: 'AddGroup',
      component: () => import('@/views/AddGroupView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/messages' },
    },
    {
      path: '/contacts/new-friends',
      name: 'NewFriends',
      component: () => import('@/views/NewFriendsView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/contacts' },
    },
    {
      path: '/contacts/group-notifications',
      alias: '/contacts/group-invites',
      name: 'GroupNotifications',
      component: () => import('@/views/GroupInvitesView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/contacts' },
    },
    {
      path: '/contacts/blocked',
      name: 'BlockedList',
      component: () => import('@/views/BlockedListView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/contacts' },
    },
    {
      path: '/contacts/groups',
      name: 'GroupsList',
      component: () => import('@/views/GroupsListView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/contacts' },
    },
    {
      path: '/contacts/:userId/common-groups',
      name: 'CommonGroups',
      component: () => import('@/views/CommonGroupsView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/contacts' },
    },
    {
      path: '/contacts/:userId/moments',
      name: 'UserMoments',
      component: () => import('@/views/UserMomentsView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/discover' },
    },
    {
      path: '/group/create',
      name: 'CreateGroup',
      component: () => import('@/views/CreateGroupView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/contacts' },
    },
    {
      path: '/group/:id/profile',
      name: 'GroupProfile',
      component: () => import('@/views/GroupProfileView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/messages' },
    },
    {
      path: '/group/:id',
      name: 'GroupInfo',
      component: () => import('@/views/GroupInfoView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/messages', keepAlive: true },
    },
    {
      path: '/group/:id/manage',
      name: 'GroupManage',
      component: () => import('@/views/GroupManageView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/messages' },
    },
    {
      path: '/group/:id/join-requests',
      name: 'GroupJoinRequests',
      component: () => import('@/views/GroupJoinRequestsView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/messages' },
    },
    {
      path: '/chat/:id/settings',
      name: 'ChatSettings',
      component: () => import('@/views/ChatSettingsView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/messages', keepAlive: true },
    },
    {
      path: '/chat/:id/important-messages',
      name: 'ImportantMessageSettings',
      component: () => import('@/views/ImportantMessageSettingsView.vue'),
      meta: { requiresAuth: true, backFallback: '/chat/:id/settings' },
    },
    {
      path: '/chat/:id/forward/:msgId',
      name: 'ForwardDetail',
      component: () => import('@/views/ForwardDetailView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/messages' },
    },
    {
      path: '/favorites',
      name: 'Favorites',
      component: () => import('@/views/FavoritesView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/me', keepAlive: true },
    },
    {
      path: '/wallet',
      name: 'Wallet',
      component: () => import('@/views/WalletView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/me', keepAlive: true },
    },
    {
      path: '/wallet/transactions/:id',
      name: 'WalletTransactionDetail',
      component: () => import('@/views/WalletTransactionDetailView.vue'),
      meta: { requiresAuth: true, backFallback: '/wallet' },
    },
    {
      path: '/chat/:id/red-packet',
      name: 'SendRedPacket',
      component: () => import('@/views/PaymentComposeView.vue'),
      meta: { requiresAuth: true, mode: 'red-packet', backFallback: '/app/messages' },
    },
    {
      path: '/chat/:id/transfer',
      name: 'SendTransfer',
      component: () => import('@/views/PaymentComposeView.vue'),
      meta: { requiresAuth: true, mode: 'transfer', backFallback: '/app/messages' },
    },
    {
      path: '/favorites/community/:id',
      name: 'CommunityFavoriteDetail',
      component: () => import('@/views/CommunityFavoriteDetailView.vue'),
      meta: { requiresAuth: true, backFallback: '/favorites' },
    },
    {
      path: '/favorites/:id',
      name: 'FavoriteDetail',
      component: () => import('@/views/FavoriteDetailView.vue'),
      meta: { requiresAuth: true, backFallback: '/favorites' },
    },
    {
      path: '/chat/:id/search',
      name: 'ChatHistorySearch',
      component: () => import('@/views/ChatHistorySearchView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/messages' },
    },
    {
      path: '/scan',
      name: 'Scan',
      component: () => import('@/views/ScanView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/discover' },
    },
    { path: '/communities', name: 'Communities', component: () => import('@/views/CommunitiesView.vue'), meta: { requiresAuth: true, backFallback: '/app/discover' } },
    { path: '/communities/notifications', name: 'CommunityNotifications', component: () => import('@/views/CommunityNotificationsView.vue'), meta: { requiresAuth: true, backFallback: '/communities' } },
    { path: '/communities/create', name: 'CommunityCreate', component: () => import('@/views/CommunityCreateView.vue'), meta: { requiresAuth: true, backFallback: '/communities' } },
    { path: '/communities/:id/posts/:postId', name: 'CommunityPostDetail', component: () => import('@/views/CommunityPostDetailView.vue'), meta: { requiresAuth: true, backFallback: '/communities/:id' } },
    { path: '/communities/:id/compose', name: 'CommunityCompose', component: () => import('@/views/MomentsComposeView.vue'), meta: { requiresAuth: true, backFallback: '/communities' } },
    { path: '/communities/:id/manage', name: 'CommunityManage', component: () => import('@/views/CommunityManageView.vue'), meta: { requiresAuth: true, backFallback: '/communities/:id' } },
    { path: '/communities/:id/manage/data/:type', name: 'CommunityManageData', component: () => import('@/views/CommunityManageDataView.vue'), meta: { requiresAuth: true, backFallback: '/communities/:id/manage' } },
    { path: '/communities/:id', name: 'CommunityDetail', component: () => import('@/views/CommunityDetailView.vue'), meta: { requiresAuth: true, backFallback: '/communities' } },
    {
      path: '/contacts/:userId',
      name: 'ContactDetail',
      component: () => import('@/views/ContactDetailView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/contacts', keepAlive: true },
    },
    {
      path: '/user/:userId',
      name: 'UserDetail',
      component: () => import('@/views/ContactDetailView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/contacts', keepAlive: true },
    },
    {
      path: '/moments',
      name: 'Moments',
      component: () => import('@/views/MomentsView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/discover' },
    },
    {
      path: '/moments/notifications',
      name: 'MomentsNotifications',
      component: () => import('@/views/MomentsNotificationsView.vue'),
      meta: { requiresAuth: true, backFallback: '/moments' },
    },
    {
      path: '/moments/compose',
      name: 'MomentsCompose',
      component: () => import('@/views/MomentsComposeView.vue'),
      meta: { requiresAuth: true, backFallback: '/moments' },
    },
    {
      path: '/profile/edit',
      name: 'EditProfile',
      component: () => import('@/views/EditProfileView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/me' },
    },
    {
      path: '/account/switch',
      name: 'AccountSwitch',
      component: () => import('@/views/AccountSwitchView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/me' },
    },
    {
      path: '/settings',
      name: 'Settings',
      component: () => import('@/views/SettingsView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/me', keepAlive: true },
    },
    {
      path: '/settings/general',
      name: 'GeneralSettings',
      component: () => import('@/views/GeneralSettingsView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/me', keepAlive: true },
    },
    {
      path: '/settings/notifications',
      name: 'NotificationSettings',
      component: () => import('@/views/NotificationSettingsView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/me', keepAlive: true },
    },
    {
      path: '/settings/font-size',
      name: 'FontSizeSettings',
      component: () => import('@/views/FontSizeSettingsView.vue'),
      meta: { requiresAuth: true, backFallback: '/settings/general' },
    },
    {
      path: '/settings/ringtone',
      name: 'RingtoneSettings',
      component: () => import('@/views/RingtoneSettingsView.vue'),
      meta: { requiresAuth: true, backFallback: '/settings/general' },
    },
    {
      path: '/settings/storage',
      name: 'StorageManagement',
      component: () => import('@/views/StorageManagementView.vue'),
      meta: { requiresAuth: true, nativeOnly: true, backFallback: '/app/me' },
    },
    {
      path: '/settings/storage/chat-files',
      name: 'StorageChatFiles',
      component: () => import('@/views/StorageChatFilesEntryView.vue'),
      meta: { requiresAuth: true, nativeOnly: true, backFallback: '/settings/storage' },
    },
    {
      path: '/settings/storage/chat-records',
      name: 'StorageChatRecords',
      component: () => import('@/views/StorageChatFilesView.vue'),
      meta: { requiresAuth: true, nativeOnly: true, backFallback: '/settings/storage' },
    },
    {
      path: '/settings/storage/conversations/:id/files',
      name: 'StorageConversationFiles',
      component: () => import('@/views/StorageConversationFilesView.vue'),
      meta: { requiresAuth: true, nativeOnly: true, backFallback: '/settings/storage/chat-files' },
    },
    {
      path: '/settings/storage/all-files',
      name: 'StorageAllFiles',
      component: () => import('@/views/StorageAllFilesView.vue'),
      meta: { requiresAuth: true, nativeOnly: true, backFallback: '/settings/storage/chat-files' },
    },
    {
      path: '/settings/storage/other-data',
      name: 'StorageOtherData',
      component: () => import('@/views/StorageOtherDataView.vue'),
      meta: { requiresAuth: true, nativeOnly: true, backFallback: '/settings/storage' },
    },
    {
      path: '/settings/security',
      name: 'AccountSecurity',
      component: () => import('@/views/AccountSecurityView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/me', keepAlive: true },
    },
    {
      path: '/settings/security/phone',
      name: 'ChangePhone',
      component: () => import('@/views/ChangePhoneView.vue'),
      meta: { requiresAuth: true, backFallback: '/settings/security' },
    },
    {
      path: '/settings/security/password',
      name: 'ChangePassword',
      component: () => import('@/views/ChangePasswordView.vue'),
      meta: { requiresAuth: true, backFallback: '/settings/security' },
    },
    {
      path: '/settings/friends',
      name: 'FriendPermission',
      component: () => import('@/views/FriendPermissionView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/me', keepAlive: true },
    },
    {
      path: '/help',
      name: 'HelpFeedback',
      component: () => import('@/views/HelpFeedbackView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/me' },
    },
    {
      path: '/about',
      name: 'AboutPulse',
      component: () => import('@/views/AboutPulseView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/me' },
    },
    {
      path: '/help/questions/:id',
      name: 'HelpQuestionDetail',
      component: () => import('@/views/HelpQuestionDetailView.vue'),
      meta: { requiresAuth: true, backFallback: '/help' },
    },
    {
      path: '/me/moments',
      name: 'MyMoments',
      component: () => import('@/views/MyMomentsListView.vue'),
      meta: { requiresAuth: true, backFallback: '/app/me' },
    },
    {
      path: '/me/moments/:id',
      name: 'MyMomentDetail',
      component: () => import('@/views/MyMomentDetailView.vue'),
      meta: { requiresAuth: true, backFallback: '/me/moments' },
    },
    {
      path: '/settings/friends/moments-hide',
      name: 'MomentsHideList',
      component: () => import('@/views/MomentsPermissionListView.vue'),
      meta: { requiresAuth: true, backFallback: '/settings/friends' },
    },
    {
      path: '/settings/friends/moments-reject',
      name: 'MomentsRejectList',
      component: () => import('@/views/MomentsPermissionListView.vue'),
      meta: { requiresAuth: true, backFallback: '/settings/friends' },
    },
  ],
})

const CHUNK_RECOVERY_KEY = 'pulse_chunk_recovery_at'
router.onError((error) => {
  const message = String(error instanceof Error ? error.message : error)
  const isChunkFailure =
    /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk \d+ failed/i.test(
      message,
  )
  if (!isChunkFailure) return
  const now = Date.now()
  try {
    const lastRecovery = Number(sessionStorage.getItem(CHUNK_RECOVERY_KEY) || 0)
    if (now - lastRecovery < 30_000) return
    sessionStorage.setItem(CHUNK_RECOVERY_KEY, String(now))
  } catch {
    // Storage can be unavailable in restricted WebViews; reloading still repairs stale chunks.
  }
  window.location.reload()
})

let lastHistoryPosition = Number(window.history.state?.position ?? 0)

router.beforeEach((to, _from, next) => {
  const nextPosition = Number(window.history.state?.position ?? lastHistoryPosition)
  const explicitBack = consumeExplicitBackTransition()
  if (explicitBack || nextPosition < lastHistoryPosition) {
    routeTransitionDirection.value = 'back'
  } else {
    routeTransitionDirection.value = 'forward'
  }
  const token = getToken()

  if (to.meta.requiresAuth && !token) {
    next({ name: 'Login', query: { redirect: to.fullPath } })
    return
  }

  if (to.matched.some((record) => record.meta.nativeOnly) && !isNativeApp) {
    next({ name: 'Me' })
    return
  }

  const isAddingAccount = to.query.addAccount === '1'
  if (
    to.meta.guest &&
    token &&
    !isAddingAccount &&
    (to.name === 'Login' || to.name === 'Register' || to.name === 'ForgotPassword')
  ) {
    const redirect = typeof to.query.redirect === 'string' ? to.query.redirect : ''
    if (redirect.startsWith('/') && !redirect.startsWith('//')) {
      next(redirect)
    } else {
      next({ name: 'Messages' })
    }
    return
  }

  next()
})

router.afterEach(() => {
  lastHistoryPosition = Number(window.history.state?.position ?? lastHistoryPosition)
})

export default router

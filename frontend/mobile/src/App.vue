<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useUserStore } from '@/stores/user'
import { useConversationInboxStore } from '@/stores/conversationInbox'
import { useFriendRequestStore } from '@/stores/friendRequest'
import { useDiscoverStore } from '@/stores/discover'
import { useVoiceCallStore } from '@/stores/voiceCall'
import VoiceCallOverlay from '@/components/VoiceCallOverlay.vue'
import GroupCallOverlay from '@/components/GroupCallOverlay.vue'
import { useGroupCallStore } from '@/stores/groupCall'
import MediaVideoOverlay from '@/components/MediaVideoOverlay.vue'
import MediaActionOverlay from '@/components/MediaActionOverlay.vue'
import FilePreviewOverlay from '@/components/FilePreviewOverlay.vue'
import LockScreenOverlay from '@/components/LockScreenOverlay.vue'
import { useLockScreenStore } from '@/stores/lockScreen'
import { closeMediaVideoPreview } from '@/composables/useMediaVideoPreview'
import { closeMediaActions } from '@/composables/useMediaActions'
import { closeFilePreview } from '@/composables/useFilePreview'
import { useRouter } from 'vue-router'
import { showDialog } from 'vant'
import { fetchUserProfile } from '@/api/contact'
import { reportOnlineLog } from '@/api/auth'
import { onWsMessage } from '@/im/ws'
import {
  bindCallRingtoneUnlock,
  prefetchCallRingtones,
  stopCallRingtone,
  warmLocalCallRingtone,
} from '@/utils/callRingtone'
import { prefetchIceServers } from '@/api/call'
import { routeTransitionDirection } from '@/router/transition'
import { fetchLatestAppVersion, type AppVersionInfo } from '@/api/appVersion'
import { getAppInfo, onAppStateChange } from '@/native/app'
import {
  cancelDownload,
  downloadAndInstall,
  getDownloadState,
  onDownloadProgress,
  type DownloadProgress,
} from '@/native/updater'
import { absoluteApiUrl } from '@/config/endpoints'
import { isNativeApp } from '@/native'
import {
  ensureNotificationPermission,
  onNotificationAction,
  registerActionTypes,
} from '@/native/localNotifications'
import {
  CALL_ACTION_ANSWER,
  CALL_ACTION_REJECT,
  CALL_QUICK_ACTION_TYPE,
} from '@/native/callNotification'
import { downloadProgressText } from '@/utils/downloadProgress'

const userStore = useUserStore()
const inbox = useConversationInboxStore()
const friendRequest = useFriendRequestStore()
const discover = useDiscoverStore()
const voiceCall = useVoiceCallStore()
const groupCall = useGroupCallStore()
const lockScreen = useLockScreenStore()
const router = useRouter()
let sessionEventUnsubscribe: (() => void) | null = null
let handlingSessionEvent = false

function handleSessionEvent(payload: unknown) {
  if (handlingSessionEvent || !payload || typeof payload !== 'object') return
  const message = payload as Record<string, unknown>
  const command = String(message.cmd || message.type || message.event || '')
  if (!['SESSION_REVOKED', 'DEVICE_REVOKED', 'FORCE_LOGOUT', 'TOKEN_REVOKED', 'AUTH_REVOKED', 'KICK'].includes(command)) return
  handleForcedLogout(String(message.reason || (command === 'KICK' ? 'KICK' : '')))
}

function handleForcedLogout(reason = '') {
  if (handlingSessionEvent || !userStore.isLoggedIn) return
  handlingSessionEvent = true
  userStore.clearLocalSession()
  void router.replace({ name: 'Login' })
  void showDialog({
    title: '已退出登录',
    message: reason === 'account_banned'
      ? '你的账号已被封禁，当前会话已退出。'
      : reason === 'KICK'
      ? '该设备已在其他位置重新登录，当前会话已退出。'
      : '此设备已被另一端退出登录，请重新登录。',
    confirmButtonText: '知道了',
  }).catch(() => {})
}

function onAuthRevoked(event: Event) {
  const detail = (event as CustomEvent<{ reason?: string }>).detail
  handleForcedLogout(String(detail?.reason || 'auth_revoked'))
}
// A zero-duration CSS transition still spans multiple Vue render frames.
// Android WebView may clear its compositor between those frames, exposing a
// white surface. Disable Transition's CSS lifecycle entirely on native
// Android so route replacement is committed atomically.
const disableRouteTransitions = isNativeApp && /Android/i.test(navigator.userAgent)
const nativeRouteAnimation = ref<'' | 'forward' | 'back'>('')
let nativeRouteAnimationTimer: number | null = null
// Keep frequently revisited, lightweight pages alive so returning restores the
// rendered page and scroll/form state immediately. Resource-heavy realtime
// pages (chat, camera, payment, live location) intentionally stay uncached.
const cachedRootPages = [
  'MainLayout',
  'ChatSettingsView',
  'GroupInfoView',
  'AddFriendView',
  'ContactDetailView',
  'SettingsView',
  'GeneralSettingsView',
  'AccountSecurityView',
  'FriendPermissionView',
  'FavoritesView',
  'WalletView',
]
const routeLoading = ref(false)
let routeLoadingTimer: number | null = null

function routeComponentKey(route: any) {
  if (route.path.startsWith('/app/')) return 'MainLayout'
  if (route.meta.keepAlive) {
    return `${String(route.name || route.path)}:${String(route.params.id || '')}`
  }
  return route.fullPath
}
let lastOnlineReportAt = 0
const ONLINE_REPORT_DEDUPE_MS = 10_000
let commonRouteChunksWarmed = false
let commonRouteWarmTimer: number | null = null
const availableVersion = ref<AppVersionInfo | null>(null)
const updateInProgress = ref(false)
const updateCanceling = ref(false)
const updateStatus = ref('')
const updateDownloadProgress = ref<DownloadProgress | null>(null)
const UPDATE_CHECK_INTERVAL_MS = 60_000
const DOWNLOAD_VERSION_KEY = 'pulse:update-download-version'
const DISMISSED_VERSION_KEY = 'pulse:update-dismissed-version'
let updateCheckTimer: number | null = null
let updateProgressListener: { remove: () => Promise<void> } | null = null
let appStateListener: { remove: () => Promise<void> } | null = null

function beginRouteLoading() {
  if (routeTransitionDirection.value === 'back') {
    finishRouteLoading()
    return
  }
  if (routeLoadingTimer !== null) window.clearTimeout(routeLoadingTimer)
  routeLoadingTimer = window.setTimeout(() => {
    routeLoading.value = true
    routeLoadingTimer = null
  }, 90)
}

function finishRouteLoading() {
  if (routeLoadingTimer !== null) {
    window.clearTimeout(routeLoadingTimer)
    routeLoadingTimer = null
  }
  routeLoading.value = false
}

function playNativeRouteAnimation() {
  if (!disableRouteTransitions) return
  nativeRouteAnimation.value = ''
  if (nativeRouteAnimationTimer !== null) {
    window.clearTimeout(nativeRouteAnimationTimer)
    nativeRouteAnimationTimer = null
  }
  void nextTick(() => {
    window.requestAnimationFrame(() => {
      nativeRouteAnimation.value = routeTransitionDirection.value
      nativeRouteAnimationTimer = window.setTimeout(() => {
        nativeRouteAnimation.value = ''
        nativeRouteAnimationTimer = null
      }, 160)
    })
  })
}

router.beforeEach(() => {
  beginRouteLoading()
  return true
})
router.onError(finishRouteLoading)

function stopOrphanedCallRingtone() {
  if (voiceCall.uiState === 'idle' && groupCall.state === 'idle') {
    stopCallRingtone()
  }
}

watch(
  () => [voiceCall.uiState, groupCall.state],
  stopOrphanedCallRingtone,
  { immediate: true },
)

function resetUpdateState(clearDownloadMarker = false) {
  updateInProgress.value = false
  updateCanceling.value = false
  updateStatus.value = ''
  updateDownloadProgress.value = null
  if (clearDownloadMarker) localStorage.removeItem(DOWNLOAD_VERSION_KEY)
}

function isActiveDownload(progress: DownloadProgress) {
  return ['pending', 'running', 'paused', 'permission_required', 'installing'].includes(progress.status)
}

async function checkForUpdate() {
  if (!isNativeApp) return
  try {
    const [current, latest] = await Promise.all([getAppInfo(), fetchLatestAppVersion()])
    if (!latest.enabled || latest.versionCode <= Number(current.build || 1)) {
      availableVersion.value = null
      resetUpdateState(true)
      return
    }

    const dismissedVersion = Number(sessionStorage.getItem(DISMISSED_VERSION_KEY) || 0)
    if (!latest.forceUpdate && dismissedVersion === latest.versionCode) return
    availableVersion.value = latest

    const downloadVersion = Number(localStorage.getItem(DOWNLOAD_VERSION_KEY) || 0)
    if (downloadVersion !== latest.versionCode) {
      resetUpdateState(downloadVersion > 0)
      return
    }

    const progress = await getDownloadState()
    if (progress.downloadId < 0 || !isActiveDownload(progress)) {
      resetUpdateState(true)
      return
    }
    updateDownloadProgress.value = progress
    updateStatus.value = downloadProgressText(progress)
    updateInProgress.value = true
  } catch {
    /* Do not block app startup when the version service is temporarily unavailable. */
  }
}

async function installUpdate() {
  const version = availableVersion.value
  if (!version?.apkUrl || updateInProgress.value) return
  localStorage.setItem(DOWNLOAD_VERSION_KEY, String(version.versionCode))
  updateInProgress.value = true
  updateDownloadProgress.value = null
  updateStatus.value = '正在启动下载，请稍候…'
  try {
    await downloadAndInstall(
      absoluteApiUrl(version.apkUrl),
      version.apkName || `Pulse-${version.versionName}.apk`,
    )
    updateStatus.value = '安装包正在下载，完成后请按系统提示安装'
  } catch (error) {
    updateStatus.value = error instanceof Error
      ? `下载启动失败：${error.message}`
      : '下载启动失败，请检查网络后重试'
    updateInProgress.value = false
    localStorage.removeItem(DOWNLOAD_VERSION_KEY)
  }
}

async function cancelUpdate() {
  const version = availableVersion.value
  if (!version || version.forceUpdate || !updateInProgress.value || updateCanceling.value) return
  updateCanceling.value = true
  try {
    await cancelDownload()
    localStorage.removeItem(DOWNLOAD_VERSION_KEY)
    sessionStorage.setItem(DISMISSED_VERSION_KEY, String(version.versionCode))
    availableVersion.value = null
    resetUpdateState()
  } catch (error) {
    updateStatus.value = error instanceof Error
      ? `取消更新失败：${error.message}`
      : '取消更新失败，请稍后重试'
    updateCanceling.value = false
  }
}

function dismissUpdate() {
  const version = availableVersion.value
  if (!version || version.forceUpdate || updateInProgress.value) return
  sessionStorage.setItem(DISMISSED_VERSION_KEY, String(version.versionCode))
  availableVersion.value = null
  resetUpdateState()
}

function reportSystemEntry() {
  if (!userStore.isLoggedIn || document.visibilityState === 'hidden') return
  const now = Date.now()
  if (now - lastOnlineReportAt < ONLINE_REPORT_DEDUPE_MS) return
  lastOnlineReportAt = now
  void reportOnlineLog().catch(() => {
    // 失败后允许下一次前台恢复重试。
    lastOnlineReportAt = 0
  })
}

function onVisibilityChange() {
  stopOrphanedCallRingtone()
  if (document.visibilityState === 'visible') {
    reportSystemEntry()
    if (userStore.isLoggedIn) void discover.refreshAll()
    void checkForUpdate()
  }
}

function onAccountSwitched() {
  friendRequest.bump(0)
  discover.clearMomentsBadge()
  discover.clearInteractionBadge()
  void friendRequest.refresh()
  void discover.refreshAll()
}

function warmCommonRouteChunks() {
  if (!userStore.isLoggedIn || commonRouteChunksWarmed) return
  commonRouteChunksWarmed = true
  const warm = () => {
    commonRouteWarmTimer = null
    void Promise.allSettled([
      import('@/layouts/MainLayout.vue'),
      import('@/views/MessagesView.vue'),
      import('@/views/ContactsView.vue'),
      import('@/views/DiscoverView.vue'),
      import('@/views/MeView.vue'),
      import('@/views/ChatView.vue'),
      import('@/views/SearchView.vue'),
      import('@/views/SettingsView.vue'),
    ])
  }
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(warm, { timeout: 2500 })
  } else {
    commonRouteWarmTimer = window.setTimeout(warm, 1200)
  }
}

async function refreshMyProfile() {
  if (!userStore.isLoggedIn) return
  try {
    const me = await fetchUserProfile()
    userStore.setUserInfo({
      userId: me.userId,
      pulseId: me.pulseId,
      nickname: me.nickname,
      avatar: me.avatarUrl,
    })
  } catch {
    /* ignore */
  }
}

onMounted(() => {
  sessionEventUnsubscribe = onWsMessage(handleSessionEvent)
  window.addEventListener('pulse:account-switched', onAccountSwitched)
  window.addEventListener('pulse:auth-revoked', onAuthRevoked)
  userStore.restoreSession()
  reportSystemEntry()
  void refreshMyProfile()
  inbox.startWsBridge()
  friendRequest.startWsBridge()
  discover.startPolling()
  voiceCall.startBridge()
  groupCall.startBridge()
  bindCallRingtoneUnlock()
  warmLocalCallRingtone()
  document.addEventListener('visibilitychange', onVisibilityChange)
  if (userStore.isLoggedIn) {
    warmCommonRouteChunks()
    void prefetchCallRingtones()
    prefetchIceServers()
  }
  void checkForUpdate()
  if (isNativeApp) {
    // Android 13+ 的通知权限必须在前台申请；放在启动时申请，
    // 避免后台收到消息时才请求（系统不允许后台弹权限框）导致一直收不到通知。
    void ensureNotificationPermission().catch(() => {})
    // 通话快捷窗口：来电通知带“接听/拒绝”按钮
    void registerActionTypes([
      {
        id: CALL_QUICK_ACTION_TYPE,
        actions: [
          { id: CALL_ACTION_ANSWER, title: '接听' },
          { id: CALL_ACTION_REJECT, title: '拒绝' },
        ],
      },
    ]).catch(() => {})
    void onNotificationAction(({ actionId, notification }) => {
      const extra = (notification?.extra || {}) as Record<string, unknown>
      const callId = String(extra.callId || '')
      if (!callId) return
      const group = !!extra.group
      if (actionId === CALL_ACTION_ANSWER) {
        if (group) void groupCall.accept()
        else void voiceCall.acceptIncoming()
      } else if (actionId === CALL_ACTION_REJECT) {
        if (group) groupCall.reject()
        else voiceCall.rejectIncoming()
      }
    }).catch(() => {})
    updateCheckTimer = window.setInterval(() => void checkForUpdate(), UPDATE_CHECK_INTERVAL_MS)
    void onAppStateChange(({ isActive }) => {
      if (isActive) {
        reportSystemEntry()
        if (userStore.isLoggedIn) void discover.refreshAll()
        void checkForUpdate()
      }
    }).then((handle) => {
      appStateListener = handle
    })
    void onDownloadProgress((progress) => {
      const version = availableVersion.value
      const trackedVersion = Number(localStorage.getItem(DOWNLOAD_VERSION_KEY) || 0)
      if (!version || trackedVersion !== version.versionCode) return
      updateDownloadProgress.value = progress
      updateStatus.value = downloadProgressText(progress)
      updateInProgress.value = isActiveDownload(progress)
      if (progress.status === 'failed' || progress.status === 'install_failed') {
        localStorage.removeItem(DOWNLOAD_VERSION_KEY)
      }
    }).then((handle) => {
      updateProgressListener = handle
    })
  }
})

onUnmounted(() => {
  if (commonRouteWarmTimer !== null) window.clearTimeout(commonRouteWarmTimer)
  if (updateCheckTimer !== null) window.clearInterval(updateCheckTimer)
  if (nativeRouteAnimationTimer !== null) window.clearTimeout(nativeRouteAnimationTimer)
  finishRouteLoading()
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('pulse:account-switched', onAccountSwitched)
  window.removeEventListener('pulse:auth-revoked', onAuthRevoked)
  stopCallRingtone()
  void updateProgressListener?.remove()
  void appStateListener?.remove()
  sessionEventUnsubscribe?.()
  sessionEventUnsubscribe = null
})

watch(
  () => userStore.isLoggedIn,
  (ok, prev) => {
    if (ok && !prev) {
      warmCommonRouteChunks()
      reportSystemEntry()
      void refreshMyProfile()
      warmLocalCallRingtone()
      void prefetchCallRingtones()
      prefetchIceServers()
    }
  },
)

router.afterEach(() => {
  finishRouteLoading()
  closeMediaVideoPreview()
  closeMediaActions()
  closeFilePreview()
  playNativeRouteAnimation()
})
</script>

<template>
  <div
    class="app-root"
    :class="nativeRouteAnimation ? `native-route-${nativeRouteAnimation}` : ''"
  >
    <router-view v-slot="{ Component, route }">
      <transition
        :name="`page-${routeTransitionDirection}`"
        :css="!disableRouteTransitions"
      >
        <keep-alive :include="cachedRootPages" :max="14">
          <component :is="Component" :key="routeComponentKey(route)" class="route-page" />
        </keep-alive>
      </transition>
    </router-view>
    <VoiceCallOverlay />
    <GroupCallOverlay />
    <MediaVideoOverlay />
    <MediaActionOverlay />
    <FilePreviewOverlay />
    <LockScreenOverlay v-if="isNativeApp && lockScreen.isLocked" />
    <Teleport to="body">
      <div v-if="availableVersion" class="forced-update-mask">
        <section class="forced-update-card" role="dialog" aria-modal="true" aria-labelledby="update-title">
          <button
            v-if="!availableVersion.forceUpdate && !updateInProgress"
            type="button"
            class="forced-update-close"
            aria-label="稍后提醒"
            @click="dismissUpdate"
          >×</button>
          <div class="forced-update-icon">↑</div>
          <span class="forced-update-badge">{{ availableVersion.forceUpdate ? '重要更新' : '发现新版本' }}</span>
          <h2 id="update-title">PulseIM v{{ availableVersion.versionName }}</h2>
          <p class="forced-update-intro">新版本已准备好，更新后即可体验最新优化。</p>
          <p class="forced-update-notes">{{ availableVersion.releaseNotes || '本次更新包含功能优化和稳定性提升。' }}</p>
          <p v-if="updateStatus" class="forced-update-status">{{ updateStatus }}</p>
          <div v-if="updateDownloadProgress?.totalBytes" class="forced-update-progress">
            <span :style="{ width: `${updateDownloadProgress.percent}%` }" />
          </div>
          <button type="button" class="forced-update-primary" :disabled="updateInProgress" @click="installUpdate">
            {{ updateInProgress ? '正在更新…' : '立即更新' }}
          </button>
          <button
            v-if="!availableVersion.forceUpdate && updateInProgress"
            type="button"
            class="forced-update-cancel"
            :disabled="updateCanceling"
            @click="cancelUpdate"
          >{{ updateCanceling ? '正在取消…' : '取消更新' }}</button>
          <button
            v-if="!availableVersion.forceUpdate && !updateInProgress"
            type="button"
            class="forced-update-later"
            @click="dismissUpdate"
          >稍后提醒</button>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.app-root {
  position: relative;
  isolation: isolate;
  height: 100%;
  height: 100dvh;
  max-height: 100dvh;
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-y: contain;
  background: var(--pulse-page-bg, var(--pulse-bg));
}

:global(:root[data-theme='light']) .app-root {
  background: var(--pulse-list-page-bg, var(--pulse-page-bg));
}

.route-page {
  width: 100%;
  min-height: 100%;
  min-height: 100dvh;
  background-color: var(--pulse-page-bg, var(--pulse-bg));
}

/* Keep Android navigation feedback, but avoid transform/3D route layers.
   The stable shell background remains visible for the whole short fade. */
.native-route-forward > .route-page,
.native-route-forward > :deep(.route-page),
.native-route-back > .route-page,
.native-route-back > :deep(.route-page) {
  animation: native-route-fade-in 160ms ease-out;
}

@keyframes native-route-fade-in {
  from { opacity: 0.94; }
  to { opacity: 1; }
}

.route-loading-mask {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: grid;
  place-items: center;
  /* A slow or stalled route chunk must never make the whole application look
     like it has been covered by a dark filter. */
  background: transparent;
  color: var(--pulse-text-secondary);
  pointer-events: none;
}

.route-loading-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border: 1px solid var(--pulse-border);
  border-radius: 14px;
  background: var(--pulse-surface-container);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.16);
  font-size: 14px;
}

.route-loading-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--pulse-outline-variant);
  border-top-color: var(--pulse-primary);
  border-radius: 50%;
  animation: route-loading-spin 0.7s linear infinite;
}

@keyframes route-loading-spin {
  to { transform: rotate(360deg); }
}

.forced-update-mask{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:24px;background:rgba(5,9,18,.76);backdrop-filter:blur(8px)}
.forced-update-card{position:relative;width:min(368px,100%);padding:28px 24px 20px;border:1px solid color-mix(in srgb,var(--pulse-primary) 24%,transparent);border-radius:24px;background:linear-gradient(155deg,var(--pulse-surface-container-high),var(--pulse-surface-container));color:var(--pulse-text);box-shadow:0 24px 70px rgba(0,0,0,.42);text-align:center}
.forced-update-icon{display:grid;place-items:center;width:58px;height:58px;margin:0 auto 12px;border-radius:18px;background:linear-gradient(145deg,#35b8ff,#087ed7);color:#fff;font-size:32px;font-weight:300;box-shadow:0 10px 24px rgba(8,126,215,.32)}
.forced-update-badge{display:inline-block;margin-bottom:8px;color:var(--pulse-primary);font-size:12px;font-weight:700;letter-spacing:.08em}
.forced-update-card h2{margin:0 0 10px;font-size:22px}.forced-update-card p{white-space:pre-wrap;line-height:1.6;color:var(--pulse-text-secondary)}
.forced-update-card .forced-update-intro{margin:0 0 10px;color:var(--pulse-text)}
.forced-update-notes{max-height:120px;margin:0;padding:12px;border-radius:12px;background:color-mix(in srgb,var(--pulse-text) 5%,transparent);overflow:auto;text-align:left;font-size:14px}
.forced-update-card .forced-update-status{margin:14px 0 0;padding:10px 12px;border-radius:10px;background:var(--pulse-surface-container-high,rgba(127,127,127,.12));color:var(--pulse-primary);font-size:13px}
.forced-update-progress{height:6px;margin-top:10px;overflow:hidden;border-radius:999px;background:var(--pulse-surface-container-high,rgba(127,127,127,.18))}
.forced-update-progress span{display:block;height:100%;border-radius:inherit;background:var(--pulse-primary);transition:width .25s ease}
.forced-update-primary{width:100%;height:48px;margin-top:16px;border:0;border-radius:14px;background:linear-gradient(135deg,#159cff,#087ed7);color:#fff;font-size:16px;font-weight:700;box-shadow:0 8px 20px rgba(8,126,215,.24)}
.forced-update-primary:disabled{opacity:.72}
.forced-update-cancel{width:100%;height:38px;margin-top:4px;border:0;background:transparent;color:var(--pulse-text-secondary);font-weight:600}
.forced-update-cancel:disabled{opacity:.55}
.forced-update-later{width:100%;height:38px;border:0;background:transparent;color:var(--pulse-text-secondary);font-weight:600}
.forced-update-close{position:absolute;top:12px;right:14px;width:34px;height:34px;border:0;border-radius:50%;background:color-mix(in srgb,var(--pulse-text) 7%,transparent);color:var(--pulse-text-secondary);font-size:24px;line-height:1}

.page-forward-enter-active,
.page-forward-leave-active,
.page-back-enter-active,
.page-back-leave-active {
  position: absolute;
  inset: 0;
  width: 100%;
  transition:
    transform 220ms cubic-bezier(0.2, 0.72, 0.2, 1);
  will-change: transform;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

/* Android WebView can briefly clear a hardware-composited 3D route layer to
   white while swapping lazy-loaded pages. Keep navigation atomic there; the
   native shell already provides immediate touch feedback. */
:global(:root.capacitor-native[data-platform='android']) .page-forward-enter-active,
:global(:root.capacitor-native[data-platform='android']) .page-forward-leave-active,
:global(:root.capacitor-native[data-platform='android']) .page-back-enter-active,
:global(:root.capacitor-native[data-platform='android']) .page-back-leave-active {
  transition: none;
  will-change: auto;
}

:global(:root.capacitor-native[data-platform='android']) .page-forward-enter-from,
:global(:root.capacitor-native[data-platform='android']) .page-forward-leave-to,
:global(:root.capacitor-native[data-platform='android']) .page-back-enter-from,
:global(:root.capacitor-native[data-platform='android']) .page-back-leave-to {
  transform: none;
}

.page-forward-enter-from {
  transform: translate3d(18%, 0, 0);
}

.page-forward-leave-to {
  transform: translate3d(-5%, 0, 0);
}

.page-back-enter-from {
  transform: translate3d(-5%, 0, 0);
}

.page-back-leave-to {
  transform: translate3d(100%, 0, 0);
}

@media (prefers-reduced-motion: reduce) {
  .page-forward-enter-active,
  .page-forward-leave-active,
  .page-back-enter-active,
  .page-back-leave-active {
    transition-duration: 1ms;
  }
}
</style>

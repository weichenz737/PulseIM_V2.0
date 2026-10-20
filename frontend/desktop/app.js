import {
  clearDesktopSession,
  DESKTOP_AUTH_EXPIRED_MESSAGE,
  isDesktopAuthError,
  fetchDesktopContacts,
  fetchDesktopConversations,
  fetchDesktopMapConfig,
  fetchDesktopClientAccessConfig,
  fetchDesktopFriendRequests,
  updateDesktopFriendRemark,
  fetchDesktopGroupNotifications,
  fetchDesktopMessages,
  fetchDesktopBurnSetting,
  updateDesktopBurnSetting,
  fetchDesktopAutoDeleteSetting,
  updateDesktopAutoDeleteSetting,
  viewDesktopBurnMedia,
  fetchDesktopConversationReadStates,
  fetchDesktopGroupDetail,
  updateDesktopGroupTitle,
  updateDesktopGroupNotice,
  updateDesktopGroupWelcome,
  fetchDesktopGroupScheduledMessages,
  createDesktopGroupScheduledMessage,
  updateDesktopGroupScheduledMessage,
  cancelDesktopGroupScheduledMessage,
  setDesktopJoinVerifyRequired,
  setDesktopGroupMemberFriendAllowed,
  setDesktopGroupMemberRole,
  setDesktopGroupMuteAll,
  setDesktopGroupMemberSpeakMuted,
  addDesktopGroupMembers,
  removeDesktopGroupMember,
  transferDesktopGroupOwner,
  leaveDesktopGroup,
  dissolveDesktopGroup,
  fetchDesktopPrivacy,
  searchDesktopMessages,
  recallDesktopMessage,
  deleteDesktopMessages,
  forwardDesktopMessages,
  addDesktopFavorite,
  fetchDesktopFavorites,
  fetchDesktopFavorite,
  fetchDesktopWallet,
  fetchDesktopWalletAmountConfig,
  fetchDesktopWalletTransactions,
  fetchDesktopWalletTransaction,
  setDesktopPaymentPassword,
  deleteDesktopFavorite,
  fetchDesktopProfile,
  fetchDesktopAccountSecurity,
  fetchDesktopSystemText,
  deleteDesktopAccount,
  changeDesktopAccountPassword,
  changeDesktopAccountPhone,
  setDesktopSecurityCodeEnabled,
  refreshDesktopSecurityCode,
  fetchDesktopHelpQuestions,
  submitDesktopFeedback,
  fetchDesktopDeviceSessions,
  revokeDesktopDevice,
  revokeDesktopOtherDevices,
  clearRememberedLogin,
  fetchDesktopUserProfile,
  fetchDesktopUserMoments,
  fetchDesktopCommonGroups,
  getRememberedLogin,
  getDesktopToken,
  refreshDesktopToken,
  getDesktopDeviceId,
  loginDesktop,
  registerDesktop,
  startDesktopQrLogin,
  pollDesktopQrLogin,
  logoutDesktop,
  markDesktopConversationRead,
  markDesktopConversationUnread,
  markAllDesktopConversationsRead,
  updateDesktopConversationSettings,
  removeDesktopConversation,
  deleteDesktopPrivateConversation,
  clearDesktopGroupHistory,
  deleteDesktopFriend,
  blockDesktopUser,
  unblockDesktopUser,
  acceptDesktopFriendRequest,
  acceptDesktopGroupInvite,
  rejectDesktopGroupInvite,
  approveDesktopGroupJoinRequest,
  rejectDesktopGroupJoinRequest,
  openDesktopPrivateConversation,
  createDesktopGroupConversation,
  searchDesktopGroups,
  formatDesktopGroupPulseId,
  fetchDesktopGroupPreview,
  joinDesktopGroup,
  setDesktopGroupSearchMode,
  setDesktopGroupMemberInviteAllowed,
  fetchDesktopImportantNotificationSetting,
  updateDesktopImportantNotificationSetting,
  rejectDesktopFriendRequest,
  readCachedProfile,
  saveDesktopSession,
  searchDesktop,
  resetDesktopPassword,
  resolveDesktopAvatarUrl,
  resolveDesktopFileUrl,
  syncDesktopMediaToken,
  saveRememberedLogin,
  sendDesktopSmsCode,
  setRememberLogin,
  sendDesktopFriendRequest,
  sendDesktopTextMessage,
  fetchDesktopFileMetadata,
  uploadDesktopFile,
  forwardDesktopFavorite,
  sendDesktopRedPacket,
  fetchDesktopRedPacket,
  receiveDesktopRedPacket,
  fetchDesktopTransfer,
  receiveDesktopTransfer,
  sendDesktopTransfer,
  updateDesktopLiveLocation,
  leaveDesktopLiveLocation,
  endDesktopLiveLocation,
  updateDesktopProfile,
  fetchDesktopMoments,
  fetchDesktopMoment,
  fetchDesktopMomentInteractions,
  publishDesktopMoment,
  toggleDesktopMomentLike,
  toggleDesktopMomentFavorite,
  addDesktopMomentComment,
  deleteDesktopMoment,
  markDesktopMomentsSeen,
  markDesktopMomentInteractionsRead,
  fetchDesktopPrivacySettings,
  updateDesktopPrivacySettings,
  fetchDesktopMomentsHideUsers,
  fetchDesktopMomentsRejectUsers,
  updateDesktopFriendMomentsPermission,
} from './src/desktopApi.ts'
import {
  connectDesktopWs,
  disconnectDesktopWs,
  isDesktopWsReady,
  onDesktopWsMessage,
  sendDesktopChatMessageAwaitAck,
} from './src/desktopWs.ts'
import {
  clearDesktopFileCache,
  deleteDesktopCachedFile,
  fetchDesktopCachedFileBlob,
  getDesktopCachedFileBlob,
  getDesktopFileCacheUsage,
  markDesktopFileCacheInUse,
} from './src/desktopFileCache.ts'
import { desktopCall } from './src/desktopCall.ts'
import { friendTagStyle } from '../mobile/src/utils/friendTagColor.ts'
import { loadDesktopBaiduMap } from './src/desktopMap.ts'
import {
  readLockScreenConfig,
  readLockScreenLocked,
  clearLockScreenConfig,
  saveLockScreenConfig,
  verifyLockScreenPassword,
  writeLockScreenLocked,
} from '../shared/lockScreen.ts'
import { fetchResumableBlob } from '../shared/resumableDownload.ts'
import QRCode from 'qrcode'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

let desktopPdfWorker = null
let desktopPdfWorkerWarmupScheduled = false

function ensureDesktopPdfWorker() {
  if (desktopPdfWorker) return
  try {
    // Vite bundles this worker as a local Electron/web asset. Keeping a real
    // worker port avoids PDF.js falling back to a dynamic import of the .mjs
    // URL, which is rejected by servers that still serve .mjs as octet-stream.
    desktopPdfWorker = new PdfWorker()
    GlobalWorkerOptions.workerPort = desktopPdfWorker
  } catch {
    // Keep workerSrc as the final fallback for older browsers/builds.
    desktopPdfWorker = null
  }
}

function scheduleDesktopPdfWorkerWarmup() {
  if (desktopPdfWorker || desktopPdfWorkerWarmupScheduled || desktopModuleDisposed || !state.authenticated) return
  desktopPdfWorkerWarmupScheduled = true
  const warmup = () => {
    desktopPdfWorkerWarmupScheduled = false
    if (desktopModuleDisposed || !state.authenticated) return
    ensureDesktopPdfWorker()
  }
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(warmup, { timeout: 1200 })
  } else {
    window.setTimeout(warmup, 300)
  }
}

window.pulseDesktop?.onQuitRequested?.(() => {
  void logoutDesktop().finally(() => {
    window.pulseDesktop?.notifyQuitReady?.()
  })
})

function desktopLegacyRoot() {
  return document.querySelector('#desktop-legacy-root')
}

function ensureDesktopRenderRoots() {
  const legacyRoot = desktopLegacyRoot()
  if (!(legacyRoot instanceof HTMLElement)) return null

  const ensureDirectChild = (parent, id, tagName = 'div') => {
    let element = [...parent.children].find((child) => child.id === id)
    if (!(element instanceof HTMLElement)) {
      element = document.createElement(tagName)
      element.id = id
      parent.append(element)
    }
    return element
  }

  const pageRoot = ensureDirectChild(legacyRoot, 'desktop-page-root')
  let shellRoot = [...pageRoot.children].find((child) => child.id === 'desktop-shell-root')
  if (!(shellRoot instanceof HTMLElement)) {
    // Clear the pre-componentization page markup once when the new stable
    // shell is introduced. Modals and media live outside this root.
    pageRoot.replaceChildren()
    shellRoot = ensureDirectChild(pageRoot, 'desktop-shell-root')
  }
  shellRoot.className = 'desktop-shell'
  const loginRoot = ensureDirectChild(pageRoot, 'desktop-login-root')
  const sidebarRoot = ensureDirectChild(shellRoot, 'desktop-sidebar-root', 'aside')
  const workspaceRoot = ensureDirectChild(shellRoot, 'desktop-workspace-root', 'main')
  let topbarRoot = [...workspaceRoot.children].find((child) => child.id === 'desktop-topbar-root')
  if (!(topbarRoot instanceof HTMLElement)) {
    workspaceRoot.replaceChildren()
    topbarRoot = ensureDirectChild(workspaceRoot, 'desktop-topbar-root', 'header')
  }
  const bodyRoot = ensureDirectChild(workspaceRoot, 'desktop-body-root')
  sidebarRoot.classList.add('sidebar')
  workspaceRoot.classList.add('workspace')
  topbarRoot.classList.add('topbar')
  bodyRoot.classList.add('workspace-body')

  return {
    legacyRoot,
    pageRoot,
    loginRoot,
    shellRoot,
    sidebarRoot,
    workspaceRoot,
    topbarRoot,
    bodyRoot,
    modalRoot: ensureDirectChild(legacyRoot, 'desktop-modal-root'),
    overlayRoot: ensureDirectChild(legacyRoot, 'desktop-overlay-root'),
    toastRoot: ensureDirectChild(legacyRoot, 'desktop-toast-root'),
    callRoot: ensureDirectChild(legacyRoot, 'desktop-call-root'),
  }
}

function desktopRenderRoot(id) {
  const roots = ensureDesktopRenderRoots()
  return roots?.[id] || null
}

const desktopMarkupCache = {
  loginRoot: null,
  login: null,
  sidebarRoot: null,
  sidebar: null,
  topbarRoot: null,
  topbar: null,
  bodyRoot: null,
  body: null,
  pageHeadingRoot: null,
  pageHeading: null,
  pageContentRoot: null,
  pageContent: null,
  messageHeadingRoot: null,
  messageHeading: null,
  messageConversationRoot: null,
  messageConversation: null,
  messageChatRoot: null,
  messageChat: null,
  messageContextRoot: null,
  messageContext: null,
  modalRoot: null,
  modal: null,
  modalBodyRoot: null,
  modalBody: null,
  overlayRoot: null,
  overlay: null,
  toastRoot: null,
  toast: null,
}

function writeDesktopRegion(root, markup, region) {
  if (!(root instanceof HTMLElement)) return false
  const rootKey = `${region}Root`
  const markupKey = region
  const changed = desktopMarkupCache[rootKey] !== root || desktopMarkupCache[markupKey] !== markup
  if (!changed) return false
  root.innerHTML = markup
  desktopMarkupCache[rootKey] = root
  desktopMarkupCache[markupKey] = markup
  return true
}

function setDesktopRegionVisibility(root, visible) {
  if (!(root instanceof HTMLElement)) return
  root.hidden = !visible
  root.setAttribute('aria-hidden', visible ? 'false' : 'true')
}

function getDesktopMessageRegionRoots(bodyRoot) {
  if (!(bodyRoot instanceof HTMLElement)) return null
  const pageRoot = bodyRoot.querySelector('[data-desktop-message-page]')
  const workspaceRoot = bodyRoot.querySelector('[data-desktop-message-workspace]')
  const headingRoot = bodyRoot.querySelector('[data-desktop-message-heading]')
  const conversationRoot = bodyRoot.querySelector('[data-desktop-message-conversation]')
  const chatRoot = bodyRoot.querySelector('[data-desktop-message-chat]')
  const contextRoot = bodyRoot.querySelector('[data-desktop-message-context]')
  if (!(pageRoot instanceof HTMLElement)
    || !(workspaceRoot instanceof HTMLElement)
    || !(headingRoot instanceof HTMLElement)
    || !(conversationRoot instanceof HTMLElement)
    || !(chatRoot instanceof HTMLElement)
    || !(contextRoot instanceof HTMLElement)) return null
  return { pageRoot, workspaceRoot, headingRoot, conversationRoot, chatRoot, contextRoot }
}

function getDesktopPageRegionRoots(bodyRoot) {
  if (!(bodyRoot instanceof HTMLElement)) return null
  const pageRoot = bodyRoot.querySelector('[data-desktop-page-shell]')
  const headingRoot = bodyRoot.querySelector('[data-desktop-page-heading]')
  const contentRoot = bodyRoot.querySelector('[data-desktop-page-content]')
  if (!(pageRoot instanceof HTMLElement)
    || !(headingRoot instanceof HTMLElement)
    || !(contentRoot instanceof HTMLElement)) return null
  return { pageRoot, headingRoot, contentRoot }
}

function splitDesktopPageMarkup(markup) {
  if (!markup) return { frameMarkup: '', headingMarkup: '', contentMarkup: '', hasRegions: false }
  const template = document.createElement('template')
  template.innerHTML = markup
  const pageRoot = template.content.querySelector('.page')
  if (!(pageRoot instanceof HTMLElement)) return { frameMarkup: markup, headingMarkup: '', contentMarkup: '', hasRegions: false }
  const heading = [...pageRoot.children].find((child) => child.classList.contains('page-heading'))
  const headingMarkup = heading instanceof HTMLElement ? heading.outerHTML : ''
  heading?.remove()
  const contentMarkup = pageRoot.innerHTML
  pageRoot.replaceChildren()
  pageRoot.dataset.desktopPageShell = 'true'
  const headingRoot = document.createElement('div')
  headingRoot.className = 'desktop-page-region'
  headingRoot.dataset.desktopPageHeading = 'true'
  const contentRoot = document.createElement('div')
  contentRoot.className = 'desktop-page-region'
  contentRoot.dataset.desktopPageContent = 'true'
  pageRoot.append(headingRoot, contentRoot)
  return { frameMarkup: template.innerHTML, headingMarkup, contentMarkup, hasRegions: true }
}

function getDesktopModalRegionRoots(modalRoot) {
  if (!(modalRoot instanceof HTMLElement)) return null
  const headerRoot = modalRoot.querySelector('[data-desktop-modal-header]')
  const bodyRoot = modalRoot.querySelector('[data-desktop-modal-body]')
  if (!(headerRoot instanceof HTMLElement) || !(bodyRoot instanceof HTMLElement)) return null
  return { headerRoot, bodyRoot }
}

function splitDesktopModalMarkup(markup) {
  if (!markup) return { frameMarkup: '', bodyMarkup: '' }
  const template = document.createElement('template')
  template.innerHTML = markup
  const bodyRoot = template.content.querySelector('[data-desktop-modal-body]')
  if (!(bodyRoot instanceof HTMLElement)) return { frameMarkup: markup, bodyMarkup: '' }
  const bodyMarkup = bodyRoot.innerHTML
  bodyRoot.replaceChildren()
  return { frameMarkup: template.innerHTML, bodyMarkup }
}

function bindDesktopEventsWithoutRebindingStableRegions(roots, {
  loginChanged,
  sidebarChanged,
  topbarChanged,
  bodyChanged,
  pageHeadingChanged,
  pageContentChanged,
  messageHeadingChanged,
  messageConversationChanged,
  messageChatChanged,
  messageContextChanged,
  modalChanged,
  modalHeaderChanged,
  modalBodyChanged,
  overlayChanged,
} = {}) {
  const detached = []
  const detachIfStable = (root, changed) => {
    if (changed || !(root instanceof HTMLElement) || !root.isConnected) return
    const parent = root.parentElement
    if (!parent) return
    const nextSibling = root.nextSibling
    root.remove()
    detached.push({ root, parent, nextSibling })
  }

  // bindEvents() still contains the existing element-level handlers. Hide
  // unchanged stable regions while it scans the document so a page refresh
  // cannot attach duplicate handlers to an unchanged modal or popup.
  detachIfStable(roots?.loginRoot, loginChanged)
  detachIfStable(roots?.sidebarRoot, sidebarChanged)
  detachIfStable(roots?.topbarRoot, topbarChanged)
  const hasMessageRegions = roots?.messageHeadingRoot instanceof HTMLElement
    && roots?.messageConversationRoot instanceof HTMLElement
    && roots?.messageChatRoot instanceof HTMLElement
    && roots?.messageContextRoot instanceof HTMLElement
  const hasPageRegions = roots?.pageHeadingRoot instanceof HTMLElement
    && roots?.pageContentRoot instanceof HTMLElement
  if (hasMessageRegions && !bodyChanged) {
    detachIfStable(roots.messageHeadingRoot, messageHeadingChanged)
    detachIfStable(roots.messageConversationRoot, messageConversationChanged)
    detachIfStable(roots.messageChatRoot, messageChatChanged)
    detachIfStable(roots.messageContextRoot, messageContextChanged)
  } else if (hasPageRegions && !bodyChanged) {
    detachIfStable(roots.pageHeadingRoot, pageHeadingChanged)
    detachIfStable(roots.pageContentRoot, pageContentChanged)
  } else {
    detachIfStable(roots?.bodyRoot, bodyChanged)
  }
  const hasModalRegions = roots?.modalHeaderRoot instanceof HTMLElement
    && roots?.modalBodyRoot instanceof HTMLElement
  if (hasModalRegions && !modalChanged) {
    detachIfStable(roots.modalHeaderRoot, modalHeaderChanged)
    detachIfStable(roots.modalBodyRoot, modalBodyChanged)
  } else {
    detachIfStable(roots?.modalRoot, modalChanged)
  }
  detachIfStable(roots?.overlayRoot, overlayChanged)
  detachIfStable(roots?.callRoot, overlayChanged)
  try {
    bindEvents()
  } finally {
    detached.reverse().forEach(({ root, parent, nextSibling }) => {
      if (nextSibling?.parentNode === parent) parent.insertBefore(root, nextSibling)
      else parent.append(root)
    })
  }
}

if (window.pulseDesktop) document.documentElement.dataset.electron = 'true'
syncDesktopMediaToken(getDesktopToken())
debugDesktopMedia('renderer-loaded')
const initialRememberedLogin = getRememberedLogin()
let lastDesktopShellBadge = -1
const DESKTOP_SIDEBAR_COLLAPSED_KEY = 'pulse_desktop_sidebar_collapsed'
const DESKTOP_NOTIFICATION_DISMISSALS_KEY = 'pulse_desktop_notification_dismissals'
const DESKTOP_ACCOUNT_SECURITY_CODE = '1234'
const DESKTOP_MESSAGE_CLIPBOARD_MIME = 'application/x-pulse-message'
const DESKTOP_MESSAGE_CLIPBOARD_VERSION = 1
let desktopQrPollTimer = null
let desktopQrExpiryTimer = null
let desktopQrFlowId = 0
let desktopQrImageRevision = 0
let desktopQrRenderedImageRevision = 0
const DESKTOP_QR_REFRESH_ANIMATION_MS = 850
let desktopNavigationHistory = []
let desktopCurrentNavigation = null
let restoringDesktopNavigation = false
let desktopCallOverlaySignature = ''
let desktopCallActionBound = false
let desktopCallActionRoot = null
let desktopCopiedMessagePayload = null
let desktopClipboardPasteBusy = false
let desktopPendingFilePreviewRevision = 0
let desktopLocationPickerRuntime = {
  BMap: null,
  map: null,
  mapElement: null,
  marker: null,
  geocoder: null,
  localSearch: null,
  searchTimer: null,
  searchSequence: 0,
  initSequence: 0,
  initPromise: null,
  composing: false,
  locationFallback: false,
}

function readDesktopSidebarCollapsed() {
  try {
    return localStorage.getItem(DESKTOP_SIDEBAR_COLLAPSED_KEY) === 'true'
  } catch {
    return false
  }
}

function saveDesktopSidebarCollapsed(collapsed) {
  try {
    localStorage.setItem(DESKTOP_SIDEBAR_COLLAPSED_KEY, String(Boolean(collapsed)))
  } catch {
    /* ignore storage failures */
  }
}

function desktopNotificationDismissalsStorageKey(userId = '') {
  return `${DESKTOP_NOTIFICATION_DISMISSALS_KEY}:${String(userId || readCachedProfile()?.userId || 'anonymous')}`
}

function readDesktopNotificationDismissals(userId = '') {
  try {
    const raw = JSON.parse(localStorage.getItem(desktopNotificationDismissalsStorageKey(userId)) || '[]')
    return new Set(Array.isArray(raw) ? raw.map((item) => String(item || '')).filter(Boolean) : [])
  } catch {
    return new Set()
  }
}

function saveDesktopNotificationDismissals(ids) {
  try {
    localStorage.setItem(
      desktopNotificationDismissalsStorageKey(state.profile?.userId),
      JSON.stringify([...ids].slice(-500)),
    )
  } catch {
    /* ignore storage failures */
  }
}

function desktopNotificationDismissalId(type, id) {
  return `${String(type || '')}:${String(id || '')}`
}

function isDesktopNotificationDismissed(type, id) {
  return state.notificationDismissedIds.has(desktopNotificationDismissalId(type, id))
}

function filterDesktopNotificationsByDismissals() {
  state.friendRequests = (state.friendRequests || []).filter((item) => !isDesktopNotificationDismissed('friend', item.id))
  const groups = state.groupNotifications || { invites: [], joinRequests: [], events: [] }
  state.groupNotifications = {
    ...groups,
    invites: (groups.invites || []).filter((item) => !isDesktopNotificationDismissed('group-invite', item.id)),
    joinRequests: (groups.joinRequests || []).filter((item) => !isDesktopNotificationDismissed('group-join', item.id)),
    events: (groups.events || []).filter((item) => !isDesktopNotificationDismissed('group-event', item.id)),
  }
  state.momentInteractions = (state.momentInteractions || []).filter((item) => !isDesktopNotificationDismissed('moment', item.id))
}

function desktopVisibleNotificationCounts() {
  const friendPending = (state.friendRequests || []).filter((item) => item.direction !== 'outgoing' && Number(item.status || 0) === 0).length
  const groups = state.groupNotifications || { invites: [], joinRequests: [], events: [] }
  const groupPending = [...(groups.invites || []), ...(groups.joinRequests || [])]
    .filter((item) => Number(item.status || 0) === 0).length
  const momentUnread = (state.momentInteractions || []).filter((item) => !item.isRead).length
  return { friendPending, groupPending, momentUnread }
}

function syncDesktopNotificationCountsFromState() {
  const counts = desktopVisibleNotificationCounts()
  state.friendPendingCount = counts.friendPending
  state.groupPendingCount = counts.groupPending
  state.momentInteractionUnreadCount = counts.momentUnread
  state.notificationCount = counts.friendPending + counts.groupPending + counts.momentUnread
  updateDesktopNotificationBadgeDom()
  updateDesktopContactsBadgeDom()
  updateDesktopMomentsBadgeDom()
  updateDesktopMomentReminderDom()
  syncDesktopShellBadge()
}

function syncDesktopNativeTheme(theme) {
  if (typeof window.pulseDesktop?.setTheme !== 'function') return
  void window.pulseDesktop.setTheme(theme).catch(() => {})
}

try {
  localStorage.removeItem('pulse_desktop_theme')
} catch {
  /* storage may be unavailable before login */
}

const state = {
  page: 'messages',
  sidebarCollapsed: readDesktopSidebarCollapsed(),
  settingsSection: 'profile',
  profileMenuOpen: false,
  profileEditing: false,
  profileDraft: null,
  profileAvatarUploading: false,
  profileAvatarFile: null,
  profileAvatarPreviewUrl: '',
  profileAvatarOriginalUrl: '',
  recalledEditHiddenIds: new Set(),
  contactView: 'grid',
  selectedConversation: 0,
  contactQuery: '',
  contactMoreOpen: false,
  contactOnlineOnly: false,
  contactRefreshing: false,
  globalRefreshing: false,
  globalSearchQuery: '',
  groupQuery: '',
  fileSection: 'all',
  fileCategory: 'all',
  fileQuery: '',
  fileSort: 'time',
  fileItems: [],
  fileLoading: false,
  fileLoaded: false,
  fileError: '',
  toast: '',
  authenticated: Boolean(getDesktopToken()),
  loading: false,
  loadingMessages: false,
  loadingMessagesConversationId: '',
  sendingMessage: false,
  loginBusy: false,
  loginMode: 'password',
  clientAccess: {
    phoneLoginEnabled: true,
    qrLoginEnabled: true,
    registerEnabled: true,
    walletEnabled: true,
  },
  clientAccessLoaded: false,
  clientAccessLoading: false,
  qrLoginBusy: false,
  qrLoginTicket: '',
  qrLoginImage: '',
  qrLoginExpiresAt: '',
  qrLoginStatus: '',
  qrLoginError: '',
  loginError: '',
  loginNotice: '',
  profile: readCachedProfile() || { nickname: '', userId: '', signature: '' },
  messagesByConversation: {},
  // Keep relationship changes locally in sync with the mobile client. The
  // server remains authoritative, while these sets make a block/delete take
  // effect before the next realtime reconciliation round-trip completes.
  blockedUserIds: new Set(),
  blockedByPeerUserIds: new Set(),
  deletedFriendUserIds: new Set(),
  readStatesByConversation: {},
  groupDetailsByConversation: {},
  groupScheduledMessagesByConversation: {},
  scheduledDialog: null,
  groupDetailLoadingConversationId: '',
  groupInfoLoading: false,
  groupInfoError: '',
  groupInfoBusy: '',
  groupInfoScrollTop: 0,
  contactProfileScrollTop: 0,
  groupInfoFocusMembers: false,
  groupInfoAddOpen: false,
  groupInfoAddSelected: new Set(),
  groupSearchQuery: '',
  groupSearchResults: [],
  groupSearchBusy: false,
  groupSearchError: '',
  importantNotificationSetting: {
    atAll: true,
    mentionMe: true,
    replyMe: true,
    announcement: true,
    followedMemberIds: [],
  },
  importantNotificationLoading: false,
  importantNotificationBusy: false,
  showMentionPicker: false,
  mentionDraft: null,
  pendingMentions: [],
  pendingAtAll: false,
  mentionJumpIds: [],
  readReceiptsEnabled: true,
  dataSource: getDesktopToken() ? 'loading' : 'error',
  modal: '',
  modalBusy: false,
  modalError: '',
  modalQuery: '',
  modalResults: null,
  modalContactLimit: 3,
  modalProfile: null,
  modalProfileMoments: [],
  modalProfileMomentsLoading: false,
  modalProfileMomentsError: '',
  modalProfileCommonGroups: [],
  modalProfileCommonGroupsLoading: false,
  modalProfileCommonGroupsError: '',
  locationPicker: {
    loading: true,
    locating: false,
    searching: false,
    error: '',
    keyword: '',
    results: [],
    nearby: [],
    selected: null,
  },
  locationPickerMode: 'chat',
  inputDialog: null,
  contactProfileExpanded: false,
  modalMode: 'conversation',
  searchMode: 'global',
  groupCreateTitle: '',
  groupCreateSelected: new Set(),
  friendRequests: [],
  groupNotifications: { invites: [], joinRequests: [], events: [] },
  momentInteractions: [],
  notificationDismissedIds: readDesktopNotificationDismissals(),
  momentInteractionUnreadCount: 0,
  notificationCount: 0,
  friendPendingCount: 0,
  groupPendingCount: 0,
  notificationView: 'all',
  loginView: 'login',
  loginPhone: initialRememberedLogin?.phone || '',
  loginPassword: initialRememberedLogin?.password || '',
  loginSecurityCode: '',
  loginSecurityCodeRequired: false,
  rememberLogin: Boolean(initialRememberedLogin),
  registerStep: 1,
  registerPhone: '',
  registerCode: '',
  registerNickname: '',
  registerPassword: '',
  registerConfirmPassword: '',
  registerBusy: false,
  registerCountdown: 0,
  registerError: '',
  registerNotice: '',
  resetBusy: false,
  resetError: '',
  resetNotice: '',
  resetPhone: '',
  resetCode: '',
  resetPassword: '',
  resetConfirmPassword: '',
  resetCountdown: 0,
  messageMenu: null,
  fileMenu: null,
  momentMenu: null,
  momentMediaMenu: null,
  mediaPreview: null,
  mediaActionBusy: '',
  filePreview: null,
  forwardDetail: null,
  mediaEditor: null,
  mediaForward: null,
  mediaForwardTargets: new Set(),
  messageSelection: new Set(),
  messageMultiMode: false,
  messageForwardIds: [],
  messageForwardTargets: new Set(),
  messageForwardMode: 'merge',
  favoriteForwardIds: [],
  favoriteForwardTargets: new Set(),
  favoriteForwardFromSelection: false,
  replyTarget: null,
  conversationMenu: null,
  confirmDialog: null,
  deviceSessions: [],
  currentDeviceId: '',
  deviceLoading: false,
  deviceError: '',
  devicesLoaded: false,
  deviceMenuId: '',
  accountSecurity: { phone: '', securityCodeEnabled: false, securityCode: '' },
  accountSecurityLoaded: false,
  accountSecurityLoading: false,
  accountSecurityError: '',
  securityCodeVisible: false,
  securityCodeBusy: false,
  lockScreenLocked: readLockScreenLocked(String(readCachedProfile()?.userId || '')),
  lockScreenBusy: false,
  lockScreenError: '',
  lockScreenPassword: '',
  lockScreenPasswordConfirm: '',
  lockScreenPasswordHint: '',
  accountDeletionAgreement: { title: '账号注销协议', content: '' },
  accountDeletionAgreementLoading: false,
  accountDeletionBalance: 0,
  accountDeletionAgreed: false,
  accountDeletionError: '',
  helpQuestions: [],
  helpLoading: false,
  helpError: '',
  helpQuery: '',
  feedbackContent: '',
  feedbackBusy: false,
  storageUsage: { local: 0, cache: 0, total: 0, quota: 0 },
  storageLoading: false,
  storageError: '',
  storageUpdatedAt: '',
  messageSearchQuery: '',
  sharedContentCountsByConversation: {},
  sharedContentCountsLoadingConversationId: '',
  sharedContentFilter: '',
  sharedContentMessages: [],
  sharedContentLoading: false,
  sharedContentError: '',
  sharedContentMenu: null,
  favorites: [],
  favoritesLoading: false,
  favoritesLoaded: false,
  favoriteOrganizing: false,
  favoriteSelection: new Set(),
  favoriteDetail: null,
  favoriteDetailLoading: false,
  walletSummary: { balance: 0, hasPaymentPassword: false },
  walletAmountConfig: { redPacketMaxCents: 20000, transferMaxCents: 1000000 },
  walletTransactions: [],
  walletLoading: false,
  walletError: '',
  walletType: '',
  walletFrom: '',
  walletTo: '',
  walletPasswordDialog: false,
  walletPasswordBusy: false,
  walletPasswordError: '',
  walletOldPassword: '',
  walletNewPassword: '',
  walletConfirmPassword: '',
  redPacketDetail: null,
  redPacketDetailLoading: false,
  redPacketReceiving: false,
  redPacketError: '',
  transferDetail: null,
  transferDetailLoading: false,
  transferReceiving: false,
  transferError: '',
  receiveSuccessVisible: false,
  receiveSuccessKind: 'redpacket',
  receiveSuccessAmount: '',
  walletDetail: null,
  walletDetailLoading: false,
  scrollChatToBottom: false,
  chatScrollTopByConversation: {},
  chatAtLatestByConversation: {},
  chatOpenedByConversation: {},
  composerText: '',
  conversationSettingsById: {},
  chatSettingsLoading: false,
  chatSettingsSaving: false,
  chatSettingsConversationId: '',
  chatSettingsError: '',
  burnClock: Date.now(),
  showEmojiPanel: false,
  showPlusMenu: false,
  showHomePlusMenu: false,
  recordingVoice: false,
  voiceRecordBusy: false,
  voiceRecordSeconds: 0,
  uploadingFile: false,
  pendingDroppedFile: null,
  pendingDroppedFileConversationId: '',
  pendingDroppedFilePreviewUrl: '',
  pendingDroppedFileDimensions: null,
  fileDragActive: false,
  liveLocationActive: false,
  liveLocationConversationId: '',
  liveLocationWatchId: null,
  moments: [],
  momentsLoaded: false,
  momentsLoading: false,
  momentsError: '',
  friendMomentsProfile: null,
  momentCommentOpenId: '',
  momentCommentText: '',
  momentReplyCommentId: '',
  momentReplyNickname: '',
  momentDetail: null,
  momentPublishBusy: false,
  momentDraftText: '',
  momentDraftDirty: false,
  momentVisibility: 0,
  momentVisibleUserIds: new Set(),
  momentMentionUserIds: new Set(),
  momentLocation: null,
  momentMentionQuery: '',
  momentMentionOpen: false,
  momentMentionTokenStart: -1,
  momentFiles: [],
  momentFileNames: [],
  privacySettings: {
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
    momentsVisibleRange: 'all',
    momentsStrangerTen: false,
    hideOnlineStatus: false,
    readReceiptEnabled: true,
  },
  privacyLoaded: false,
  privacyLoading: false,
  privacySaving: false,
  privacyError: '',
  privacyListMode: '',
  privacyListUsers: [],
  privacyListSelected: new Set(),
  privacyListLoading: false,
}

let resetSmsTimer = null
let registerSmsTimer = null
let inputDialogResolver = null
let walletPasswordResolver = null
let receiveSuccessTimer = null
let desktopSearchDebounceTimer = null
let desktopSearchRequestId = 0

let stopDesktopWs = null
let desktopWsToken = ''
let notificationPollTimer = null
let desktopNotificationSummaryBusy = false
let realtimeFallbackTimer = null
let realtimeFallbackBusy = false
let desktopMessageCatchupTimer = null
let desktopMessageCatchupBusy = false
let readStatePollTimer = null
let readStatePollConversationId = ''
let desktopMomentInteractionPollTimer = null
let desktopMomentInteractionPollBusy = false
let desktopMomentPollTimer = null
let desktopMomentPollBusy = false
let desktopDeviceSessionTimer = null
let desktopDeviceSessionCheckBusy = false
const DESKTOP_DEVICE_SESSION_POLL_MS = 5_000
const DESKTOP_REALTIME_FALLBACK_POLL_MS = 3_000
const DESKTOP_MESSAGE_CATCHUP_POLL_MS = 1_200
const DESKTOP_MOMENT_INTERACTION_POLL_MS = 2_000
const DESKTOP_MOMENT_POLL_MS = 3_000
let messageMenuDismissBound = false
let messageMenuDismissHandler = null
let desktopExpiryTimer = null
const desktopReadMarkInFlight = new Set()
const desktopReadMarkQueued = new Set()
const desktopUnreadSyncByConversation = new Map()
let desktopCallActionHandler = null
let stopDesktopCallChange = null
let stopDesktopCallNotice = null
let stopDesktopNotificationClick = null
let stopDesktopShortcut = null
let desktopModuleDisposed = false
const loadedDesktopAvatarUrls = new Set()
const desktopMediaBlobUrls = new Map()
// Reuse media that is already loaded by the chat or preview instead of
// issuing a second authenticated download for copy/save/edit actions.
const desktopMediaBlobs = new Map()
const desktopMediaBlobCategories = new Map()
const desktopMediaBlobLoading = new Map()
const desktopMemoryClearPending = new Set()
const desktopFileMetadataLoading = new Map()
const desktopMomentPreviewUrls = new WeakMap()
let desktopFilePreviewRequestId = 0
let desktopFilePreviewObjectUrl = ''
let desktopFilePreviewPdfDocument = null
let desktopFilePreviewPdfLoadingTask = null
let desktopFilePreviewPdfGeneration = 0
let desktopFilePreviewPdfView = {
  zoom: 1,
  panX: 0,
  panY: 0,
  root: null,
  stage: null,
  baseWidth: 0,
  baseHeight: 0,
}
const DESKTOP_PDF_MIN_ZOOM = 0.5
const DESKTOP_PDF_MAX_ZOOM = 4
const DESKTOP_PDF_ZOOM_STEP = 0.1
const DESKTOP_PDF_LOAD_TIMEOUT_MS = 120000
const DESKTOP_MEDIA_PLACEHOLDER = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1"%3E%3C/svg%3E'

function withDesktopTimeout(promise, timeoutMs, message) {
  let timer = 0
  return new Promise((resolve, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), timeoutMs)
    promise.then(resolve, reject)
  }).finally(() => {
    if (timer) window.clearTimeout(timer)
  })
}

function desktopMediaRenderSource(source) {
  const cached = desktopMediaBlobUrls.get(source)
  if (cached) return cached
  // Local files selected from the browser already have a usable object URL.
  // Never replace that real image with the 1x1 protected-media placeholder.
  if (/^(blob:|data:)/i.test(String(source || ''))) return source
  // The packaged Electron shell injects the current Bearer token into
  // protected media requests at the main-process boundary. Let its native
  // <img>/<video>/<audio> request start immediately instead of painting a
  // 1x1 placeholder while the secondary Blob/cache path is warming up.
  if (window.pulseDesktop?.mediaRequest && isDesktopProtectedMediaUrl(source)) return source
  return DESKTOP_MEDIA_PLACEHOLDER
}

function publishDesktopMediaBlobUrl(source, blob) {
  const url = String(source || '').trim()
  if (!url || !blob?.size) return ''
  const existing = desktopMediaBlobUrls.get(url)
  if (existing) return existing
  const objectUrl = URL.createObjectURL(blob)
  desktopMediaBlobUrls.set(url, objectUrl)
  return objectUrl
}

function forgetDesktopMediaBlob(source) {
  const url = String(source || '').trim()
  if (!url) return
  const objectUrl = desktopMediaBlobUrls.get(url)
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
    desktopMediaBlobUrls.delete(url)
  }
  desktopMediaBlobs.delete(url)
  desktopMediaBlobCategories.delete(url)
  // A failed thumbnail must be retried if this message is rendered again.
  for (const key of desktopInlineImagePreloadStates.keys()) {
    if (key.endsWith(`::${url}`)) desktopInlineImagePreloadStates.delete(key)
  }
}

function invalidateDesktopCachedMedia(fileId, category, variant) {
  const id = String(fileId || '').trim()
  if (id && category === 'image') void deleteDesktopCachedFile(id, category, variant)
}

function desktopNativeMediaResponseBlob(response) {
  const contentType = response?.contentType || 'application/octet-stream'
  const rawBytes = response?.bodyBytes
  let bytes = null
  if (rawBytes instanceof Uint8Array) {
    bytes = rawBytes
  } else if (rawBytes instanceof ArrayBuffer) {
    bytes = new Uint8Array(rawBytes)
  } else if (ArrayBuffer.isView(rawBytes)) {
    bytes = new Uint8Array(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength)
  } else if (Array.isArray(rawBytes)) {
    bytes = Uint8Array.from(rawBytes)
  } else if (rawBytes?.type === 'Buffer' && Array.isArray(rawBytes.data)) {
    bytes = Uint8Array.from(rawBytes.data)
  }
  if (bytes) return new Blob([bytes], { type: contentType })

  return new Blob([], { type: contentType })
}

function desktopMomentMediaMarkup(url, type, name = '', originalUrl = '', fileId = '') {
  const normalizedFileId = String(fileId || '').trim()
  const source = String((url || normalizedFileId) ? (url || desktopFileDownloadUrl(normalizedFileId, 'thumb')) : '').trim()
  if (!source) return ''
  const original = String(originalUrl || (normalizedFileId ? desktopFileDownloadUrl(normalizedFileId) : '')).trim()
  const previewSource = original && original !== source ? original : ''
  const safeSource = escapeHtml(source)
  const fileAttribute = normalizedFileId ? ` data-file-id="${escapeHtml(normalizedFileId)}"` : ''
  const mediaAttributes = `data-moment-media-preview="${safeSource}"${previewSource ? ` data-moment-media-original-url="${escapeHtml(previewSource)}"` : ''}${fileAttribute} data-moment-media-type="${type === 'video' ? 'video' : 'image'}" data-moment-media-name="${escapeHtml(name || (type === 'video' ? '朋友圈视频' : '朋友圈图片'))}" tabindex="0" role="button"`
  const protectedAttributes = `${fileAttribute} data-file-category="${type === 'video' ? 'video' : 'image'}" data-file-variant="thumb"`
  if (isDesktopProtectedMediaUrl(source)) {
    if (type === 'video') {
      return `<div class="desktop-moment-media-tile" ${mediaAttributes}><video data-protected-media-src="${safeSource}"${protectedAttributes} preload="metadata" playsinline></video><span class="desktop-moment-video-mark">${icon('video')}</span></div>`
    }
    return `<div class="desktop-moment-media-tile" ${mediaAttributes}><img src="${desktopMediaRenderSource(source)}" data-protected-media-src="${safeSource}"${protectedAttributes} alt="" loading="lazy" decoding="async" /></div>`
  }
  return type === 'video'
    ? `<div class="desktop-moment-media-tile" ${mediaAttributes}><video src="${safeSource}" preload="metadata" playsinline></video><span class="desktop-moment-video-mark">${icon('video')}</span></div>`
    : `<div class="desktop-moment-media-tile" ${mediaAttributes}><img src="${safeSource}" alt="" loading="lazy" decoding="async" /></div>`
}

function desktopMomentLocalPreviewUrl(file) {
  if (!file) return ''
  const cached = desktopMomentPreviewUrls.get(file)
  if (cached) return cached
  const url = URL.createObjectURL(file)
  desktopMomentPreviewUrls.set(file, url)
  return url
}

function debugDesktopMedia(message) {
  try {
    window.pulseDesktop?.mediaDebug?.(String(message || ''))
  } catch {
    // Diagnostics must never affect rendering.
  }
}

function isDesktopWalletEnabled() {
  return state.clientAccess.walletEnabled !== false
}

function desktopShellBadgeCount() {
  if (!state.authenticated || state.dataSource !== 'remote') return 0
  const messageCount = conversations.reduce((total, conversation) => total + Math.max(0, Number(conversation.unread || 0)), 0)
  return Math.min(999, messageCount + Math.max(0, Number(state.notificationCount || 0)))
}

function syncDesktopShellBadge() {
  const count = desktopShellBadgeCount()
  if (count === lastDesktopShellBadge) return
  lastDesktopShellBadge = count
  void window.pulseDesktop?.setBadge?.(count)
}

function desktopNotificationText(message) {
  if (desktopIsBurnMessage(message)) return '[阅后即焚消息]'
  const type = Number(message?.msgType || 0)
  if (type === 1) return '[图片]'
  if (type === 2) return '[文件]'
  if (type === 3) return '[语音]'
  const text = desktopPreviewText(message?.content, type).replace(/\s+/g, ' ').trim()
  return text.slice(0, 120) || '你有一条新消息'
}

function notifyDesktopMessage(conversation, message) {
  if (message?.mine || isDesktopSystemMessage(message)) return
  const body = desktopNotificationText(message)
  void window.pulseDesktop?.showNotification?.({
    title: conversation?.name || 'Pulse',
    body,
    conversationId: String(conversation?.id || ''),
    messageId: String(message?.id || message?.msgId || ''),
  })
  if (!window.pulseDesktop?.showNotification) showToast(`${conversation?.name || 'Pulse'}：${body}`)
}

let conversations = []

const desktopFileCategoryExtensions = {
  document: new Set(['pdf', 'doc', 'docx', 'txt', 'rtf', 'md', 'pages', 'odt']),
  spreadsheet: new Set(['xls', 'xlsx', 'csv', 'ods', 'numbers']),
  presentation: new Set(['ppt', 'pptx', 'key', 'odp']),
  archive: new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz']),
  audio: new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'flac', 'webm']),
  application: new Set(['exe', 'apk', 'msi', 'dmg', 'app', 'ipa', 'deb', 'rpm']),
}

function desktopFileExtension(name, contentType = '') {
  const lowerName = String(name || '').split('?')[0].toLowerCase()
  const matches = lowerName.match(/[a-z0-9]+/g) || []
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const candidate = matches[index]
    if (Object.values(desktopFileCategoryExtensions).some((extensions) => extensions.has(candidate))) return candidate
  }
  const contentExtension = String(contentType || '').split('/')[1]?.split(';')[0]?.toLowerCase() || ''
  return contentExtension && contentExtension !== 'octet-stream' ? contentExtension : (matches.at(-1) || '')
}

function desktopFileCategory(name, contentType = '', messageType = 2) {
  if (Number(messageType) === 3 || String(contentType).toLowerCase().startsWith('audio/')) return 'audio'
  const extension = desktopFileExtension(name, contentType)
  const matched = Object.entries(desktopFileCategoryExtensions).find(([, extensions]) => extensions.has(extension))
  return matched?.[0] || 'other'
}

function desktopFileNameFromUrl(value) {
  const raw = String(value || '').split('?')[0].split('#')[0]
  const lastSegment = raw.slice(raw.lastIndexOf('/') + 1)
  try {
    return decodeURIComponent(lastSegment) || '\u6587\u4ef6'
  } catch {
    return lastSegment || '\u6587\u4ef6'
  }
}

function desktopFileListSize(value) {
  const size = Number(value || 0)
  if (!Number.isFinite(size) || size <= 0) return '\u672a\u77e5\u5927\u5c0f'
  const units = ['B', 'KB', 'MB', 'GB']
  const unitIndex = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1)
  const amount = size / (1024 ** unitIndex)
  return `${amount >= 10 || unitIndex === 0 ? amount.toFixed(0) : amount.toFixed(1)}${units[unitIndex]}`
}

function desktopFileSizeValue(item) {
  if (Number.isFinite(Number(item?.sizeBytes)) && Number(item.sizeBytes) > 0) return Number(item.sizeBytes)
  const match = String(item?.size || '').trim().match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)?$/i)
  if (!match) return 0
  const units = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 }
  return Number(match[1]) * (units[String(match[2] || 'B').toUpperCase()] || 1)
}

function desktopFileDayStart(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 0
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function desktopFileTimeLabel(value) {
  const timestamp = Number(value || 0)
  if (!timestamp) return ''
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  const dayDiff = Math.floor((desktopFileDayStart(Date.now()) - desktopFileDayStart(date)) / 86400000)
  if (dayDiff === 0) return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (dayDiff === 1) return '\u6628\u5929'
  if (dayDiff === 2) return '\u524d\u5929'
  const now = new Date()
  const weekStart = desktopFileDayStart(now) - ((now.getDay() + 6) % 7) * 86400000
  if (timestamp >= weekStart) return `\u5468${['\u65e5', '\u4e00', '\u4e8c', '\u4e09', '\u56db', '\u4e94', '\u516d'][date.getDay()]}`
  return `${date.getMonth() + 1}\u6708${date.getDate()}\u65e5`
}

function desktopFileGroup(value) {
  const timestamp = Number(value || 0)
  if (!timestamp) return 'older'
  const today = desktopFileDayStart(Date.now())
  const day = desktopFileDayStart(timestamp)
  if (day === today) return 'today'
  const weekStart = today - ((new Date().getDay() + 6) % 7) * 86400000
  return day >= weekStart ? 'week' : 'older'
}

function desktopFileItemFromMessage(message, conversation) {
  const type = Number(message?.msgType || 0)
  if (message?.recalled || desktopIsBurnMessage(message) || (type !== 2 && type !== 3)) return null
  const file = parseDesktopFile(message.content)
  if (!file?.url) return null
  const name = String(file.name || desktopFileNameFromUrl(file.url) || '\u6587\u4ef6')
  const contentType = String(file.contentType || '')
  const extension = desktopFileExtension(name, contentType)
  const isVideo = contentType.toLowerCase().startsWith('video/') || (type !== 3 && ['mp4', 'mov', 'webm', 'm4v', '3gp'].includes(extension))
  if (isVideo) return null
  const dateMs = desktopTimestamp(message.createdAt || message.sendTimeMs)
  const sizeBytes = Number(file.size || file.originalSize || 0)
  return {
    id: `${conversation?.id || message.conversationId || 'conversation'}:${message.id || message.clientMsgId || `${name}:${dateMs}`}`,
    messageId: String(message.id || message.clientMsgId || ''),
    conversationId: String(conversation?.id || message.conversationId || ''),
    url: String(file.url),
    name,
    ext: (extension || String(contentType.split('/')[1] || '')).toUpperCase(),
    category: desktopFileCategory(name, contentType, type),
    sender: message.mine ? (state.profile.nickname || '\u6211') : (message.fromNickname || conversation?.name || '\u672a\u77e5\u7528\u6237'),
    chat: conversation?.name || '\u804a\u5929',
    size: desktopFileListSize(sizeBytes),
    sizeBytes,
    date: dateMs,
    time: desktopFileTimeLabel(dateMs),
    group: desktopFileGroup(dateMs),
    recent: dateMs > Date.now() - 7 * 86400000,
  }
}

let contacts = []

const iconPaths = {
  refresh: '<path d="M20 11a8 8 0 0 0-14.8-3.7L3 9"/><path d="M3 4v5h5M4 13a8 8 0 0 0 14.8 3.7L21 15"/><path d="M21 20v-5h-5"/>',
  chat: '<path d="M5 5.2h14a2 2 0 0 1 2 2v7.2a2 2 0 0 1-2 2H10l-5.4 3.6v-3.6H5a2 2 0 0 1-2-2V7.2a2 2 0 0 1 2-2Z"/><path d="M7.5 9.7h9M7.5 13h6"/>',
  contacts: '<circle cx="12" cy="8" r="3.1"/><path d="M5.4 19c.6-2.8 3-4.4 6.6-4.4s6 1.6 6.6 4.4"/><path d="M18 5.8a3 3 0 0 1 0 4.5M19 14.6a4.8 4.8 0 0 1 2.1 2.5"/>',
  discover: '<circle cx="12" cy="12" r="8.8"/><path d="m15.8 8.2-1.6 4.8-4.8 1.6 1.6-4.8 4.8-1.6Z"/>',
  person: '<circle cx="12" cy="8" r="3.2"/><path d="M5.4 19c.6-2.8 3-4.4 6.6-4.4s6 1.6 6.6 4.4"/>',
  smartphone: '<rect x="6.5" y="2.8" width="11" height="18.4" rx="2"/><path d="M10 5.8h4M11 18.2h2"/>',
  language: '<circle cx="12" cy="12" r="9"/><path d="M3.5 12h17M12 3c2.2 2.4 3.3 5.4 3.3 9s-1.1 6.6-3.3 9c-2.2-2.4-3.3-5.4-3.3-9S9.8 5.4 12 3Z"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.4"/><path d="m16 16 4.3 4.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  bell: '<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/>',
  'bell-off': '<path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/><path d="m4 4 16 16"/>',
  more: '<circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none"/>',
  save: '<path d="M17 3H7a2 2 0 0 0-2 2v16l7-4 7 4V5a2 2 0 0 0-2-2Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  settings: '<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="m19.4 15 .1.1a1.7 1.7 0 0 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 0 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 0 1-2.4-2.4l.1-.1A1.7 1.7 0 0 0 6.2 12a1.7 1.7 0 0 0-1.2-2.9h-.2a1.7 1.7 0 0 1 0-3.4H5A1.7 1.7 0 0 0 6.2 3l-.1-.1a1.7 1.7 0 0 1 2.4-2.4l.1.1A1.7 1.7 0 0 0 11.5 1h.2a1.7 1.7 0 0 1 3.4 0v.2A1.7 1.7 0 0 0 18 2.4l.1-.1a1.7 1.7 0 0 1 2.4 2.4l-.1.1A1.7 1.7 0 0 0 19.2 10h.2a1.7 1.7 0 0 1 0 3.4h-.2a1.7 1.7 0 0 0 .2 1.6Z" transform="translate(-3.5 3.5) scale(.71)"/>',
  sun: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M19.5 15.5A8.2 8.2 0 0 1 8.5 4.2a8.5 8.5 0 1 0 11 11.3Z"/>',
  phone: '<path d="M6.6 3.8 9.2 7 7.6 9.1a14.6 14.6 0 0 0 7.3 7.3l2.1-1.6 3.2 2.6-1.3 2.6c-.5 1-1.6 1.5-2.7 1.2C8.5 19 5 15.5 2.8 7.8c-.3-1.1.2-2.2 1.2-2.7l2.6-1.3Z"/>',
  unsupported: '<circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.8 1.9c-1 .7-1.6 1-1.6 2.4M12 16.5h.1"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
  eye: '<path d="M2.8 12s3.2-5.2 9.2-5.2S21.2 12 21.2 12s-3.2 5.2-9.2 5.2S2.8 12 2.8 12Z"/><circle cx="12" cy="12" r="2.4"/>',
  paperclip: '<path d="m20 11-7.9 7.9a5 5 0 0 1-7.1-7.1l8.1-8.1a3.5 3.5 0 0 1 5 5L10 16.8a2 2 0 0 1-2.8-2.8l7.1-7.1"/>',
  smile: '<circle cx="12" cy="12" r="8.8"/><path d="M8.5 14.5a4.2 4.2 0 0 0 7 0M9 9.5h.1M15 9.5h.1"/>',
  send: '<path d="m21 3-7.2 18-3.8-7L3 10 21 3Z"/><path d="M10 14 21 3"/>',
  mic: '<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-5 3.5 3 2.5-2 5 4"/>',
  location: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="11" r="2"/><path d="M13 10h5M13 14h4"/>',
  gift: '<path d="M20 12v8H4v-8M2 8h20v4H2zM12 8v12M12 8H8.5a2.5 2.5 0 1 1 2.5-2.5V8ZM12 8h3.5A2.5 2.5 0 1 0 13 5.5V8Z"/>',
  money: '<circle cx="12" cy="12" r="9"/><path d="M14.5 8.5c-.6-.5-1.4-.8-2.4-.8-1.5 0-2.5.7-2.5 1.8 0 2.7 5 1.2 5 4 0 1.1-1 1.8-2.6 1.8-1 0-1.9-.3-2.6-.9M12 6v12"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5"/>',
  'sidebar-toggle': '<path d="M5 4v16M9 4v16M18 8l-4 4 4 4"/>',
  arrow: '<path d="m9 6 6 6-6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  'lock-open': '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M16 10V7a4 4 0 0 0-7.5-1.8"/>',
  lightbulb: '<path d="M9 18h6M10 21h4M8.3 14.5A6 6 0 1 1 15.7 14.5c-.9.8-1.4 1.7-1.6 2.5H9.9c-.2-.8-.7-1.7-1.6-2.5Z"/>',
  edit: '<path d="m4 16.5-.8 4.3 4.3-.8L19 8.5 15.5 5 4 16.5Z"/><path d="m13.8 6.7 3.5 3.5"/>',
  group: '<circle cx="9" cy="9" r="3"/><path d="M3.5 19c.5-2.7 2.4-4 5.5-4s5 1.3 5.5 4M16 6.3a2.7 2.7 0 0 1 0 5.4M17 15c1.8.5 3 1.8 3.5 4"/>',
  bookmark: '<path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-3.5L6 21V4.5Z"/>',
  'switch-account': '<path d="M4 7h13l-2.5-2.5M20 17H7l2.5 2.5"/><path d="M17 7v3M7 14v3"/>',
  logout: '<path d="M10 5H6.5A2.5 2.5 0 0 0 4 7.5v9A2.5 2.5 0 0 0 6.5 19H10"/><path d="M13 12h8M17 8l4 4-4 4"/>',
  folder: '<path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-10Z"/>',
  file: '<path d="M6 3h8l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5M8 12h8M8 16h6"/>',
  sheet: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  slide: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M12 5v14M4 9h16"/>',
  archive: '<path d="M4 8h16v11H4z"/><path d="M3 5h18v3H3zM9 12h6"/>',
  audio: '<path d="M5 10v4h3l5 4V6l-5 4H5Z"/><path d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10"/>',
  link: '<path d="m10 13.8 4.2-4.2a3.5 3.5 0 0 1 5 5l-2.1 2.1a3.5 3.5 0 0 1-5 0"/><path d="m14 10.2-4.2 4.2a3.5 3.5 0 0 1-5-5l2.1-2.1a3.5 3.5 0 0 1 5 0"/>',
  app: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 8h3v3H8zM13 8h3v3h-3zM8 13h3v3H8zM13 13h3v3h-3z"/>',
  grid: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  cloud: '<path d="M7.2 18.5h9.4a4.4 4.4 0 0 0 .8-8.7A5.6 5.6 0 0 0 6.6 8.5a5 5 0 0 0 .6 10Z"/>',
  download: '<path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M5 20h14"/>',
  shield: '<path d="M12 3 19 6v5.2c0 4.2-2.8 7.9-7 9.8-4.2-1.9-7-5.6-7-9.8V6l7-3Z"/><path d="m9 12 2 2 4-4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.8 1.9c-1 .7-1.6 1-1.6 2.4M12 16.5h.1"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6.5 7l.7 13h9.6l.7-13M9 7V4h6v3"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
}

function icon(name, className = '') {
  return `<svg class="ui-icon ${className}" viewBox="0 0 24 24" aria-hidden="true">${iconPaths[name] || iconPaths.more}</svg>`
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character])
}

function avatar(person, extra = '') {
  const initials = person.initials || person.name?.slice(0, 1) || person.nickname?.slice(0, 1) || '?'
  const image = resolveDesktopAvatarUrl(person.avatarUrl || person.avatar_url || person.avatar)
  const protectedImage = Boolean(image && isDesktopProtectedMediaUrl(image))
  const imageLoaded = Boolean(image && !protectedImage && loadedDesktopAvatarUrls.has(image))
  const fallback = `<span class="avatar-fallback">${escapeHtml(initials)}</span>`
  const imageSource = protectedImage ? desktopMediaRenderSource(image) : image
  const protectedSource = protectedImage ? ` data-protected-media-src="${escapeHtml(image)}"` : ''
  const imageMarkup = image
    ? `<img class="avatar-image${imageLoaded ? ' is-loaded' : ''}" src="${escapeHtml(imageSource)}"${protectedSource} alt="" loading="eager" decoding="sync" />`
    : ''
  return `<div class="avatar avatar-${person.tone || 'blue'} ${extra}">${imageMarkup}${fallback}</div>`
}

function setDesktopAvatarFallbackVisible(image, visible) {
  const fallback = image.nextElementSibling
  if (fallback instanceof HTMLElement && fallback.classList.contains('avatar-fallback')) {
    fallback.hidden = !visible
  }
}

function bindDesktopAvatarImages() {
  document.querySelectorAll('.avatar-image').forEach((element) => {
    const image = element
    if (!(image instanceof HTMLImageElement) || image.dataset.protectedMediaSrc || image.dataset.avatarBound === '1') return
    image.dataset.avatarBound = '1'
    const fallback = image.nextElementSibling
    const showFallback = () => {
      image.hidden = true
      image.classList.remove('is-loaded')
      setDesktopAvatarFallbackVisible(image, true)
      if (fallback instanceof HTMLElement) fallback.hidden = false
    }
    const showImage = () => {
      const url = image.currentSrc || image.src
      if (url) loadedDesktopAvatarUrls.add(url)
      image.hidden = false
      image.classList.add('is-loaded')
      setDesktopAvatarFallbackVisible(image, false)
      if (fallback instanceof HTMLElement) fallback.hidden = true
    }
    image.addEventListener('load', showImage, { once: true })
    image.addEventListener('error', showFallback, { once: true })
    if (image.complete) {
      if (image.naturalWidth > 0) showImage()
      else showFallback()
    }
  })
}

function desktopFriendTag(item, fallback = '') {
  const candidates = [
    item?.tag,
    item?.friendTag,
    item?.friend_tag,
    item?.defaultFriendTag,
    item?.default_friend_tag,
    item?.friendLabel,
    item?.label,
    item?.relation?.tag,
    item?.friend?.tag,
  ]
  for (const candidate of candidates) {
    const value = String(candidate == null ? '' : candidate).trim()
    if (value) return value
  }
  return String(fallback || '').trim()
}

function desktopContactTag(item) {
  const candidates = [
    item?.tag,
    item?.friendTag,
    item?.friend_tag,
    item?.defaultFriendTag,
    item?.default_friend_tag,
    item?.friendLabel,
    item?.label,
    item?.relation?.tag,
    item?.friend?.tag,
  ]
  for (const candidate of candidates) {
    const value = String(candidate == null ? '' : candidate).trim()
    if (value && value !== '好友') return value
  }
  return ''
}

function renderDesktopFriendTag(tag, seed, className = 'contact-tag') {
  const value = String(tag || '').trim()
  if (!value) return ''
  const tone = friendTagStyle(seed)
  const style = tone
    ? ` style="background:${escapeHtml(tone.background)};color:${escapeHtml(tone.color)}"`
    : ''
  return `<span class="${escapeHtml(className)}"${style}>${escapeHtml(value)}</span>`
}

function renderDesktopConversationTag(tag, seed = '') {
  return renderDesktopFriendTag(tag, seed, 'conversation-item-tag')
}

function renderDesktopConversationName(name) {
  return '<span class="conversation-name-viewport"><span class="conversation-name-text">' + escapeHtml(name || '') + '</span></span>'
}

function formatDesktopConversationPreview(preview, mine = false) {
  const value = String(preview || '').trim()
  if (!mine || !value) return value
  return /^我[：:]\s*/.test(value) ? value : `我：${value}`
}

function mapRemoteConversation(item) {
  const name = item.title || '会话'
  const group = item.type === 'group' || Number(item.type) === 2
  return {
    id: String(item.id),
    name,
    initials: (String(item.remark || '').trim() || name).slice(0, 1),
    tone: group ? 'violet' : 'blue',
    preview: desktopPreviewText(item.lastMsgPreview, item.lastMsgType),
    time: formatRemoteTime(item.lastMsgTime),
    lastMsgTimeMs: desktopTimestamp(item.lastMsgTime),
    unread: Number(item.unreadCount || 0),
    mentionUnread: Boolean(item.mentionUnread),
    online: Boolean(item.online),
    onlineHidden: Boolean(item.onlineHidden),
    tag: desktopFriendTag(item, group ? '群聊' : '好友'),
    type: group ? 'group' : 'personal',
    peerUserId: item.peerUserId ? String(item.peerUserId) : '',
    avatarUrl: resolveDesktopAvatarUrl(item.avatarUrl || item.avatar_url || item.avatar || ''),
    fileTransferAssistant: Boolean(item.fileTransferAssistant),
    pinned: Boolean(item.pinned),
    mute: Boolean(item.mute),
  }
}

function isGroupConversation(item) {
  const type = String(item?.type || '').toLowerCase()
  const tag = String(item?.tag || '')
  return type === 'group'
    || type === '2'
    || tag.includes('群聊')
    || item?.name?.includes('设计组')
}

function mapRemoteContact(item) {
  const originalName = item.nickname || '用户'
  const remark = String(item.remark || '').trim()
  const name = String(item.displayName || remark || originalName).trim() || originalName
  const tag = desktopContactTag(item)
  return {
    userId: String(item.userId),
    nickname: originalName,
    displayName: name,
    remark,
    name,
    initials: name.slice(0, 1),
    tone: ['blue', 'violet', 'orange', 'green', 'cyan', 'pink'][Number(item.userId || 0) % 6],
    onlineHidden: Boolean(item.onlineHidden),
    birthday: String(item.birthday || '').trim(),
    signature: String(item.signature || '').trim(),
    meta: name !== originalName
      ? originalName
      : `Pulse ID ${item.pulseId || item.userId}`,
    status: item.online ? '在线' : '最近活跃',
    tag,
    fileTransferAssistant: Boolean(item.fileTransferAssistant),
    avatarUrl: resolveDesktopAvatarUrl(item.avatarUrl || item.avatar_url || item.avatar || ''),
  }
}

// The conversation endpoint may contain an older cached avatar while the
// contacts endpoint already has the current profile avatar. Use the contact
// record as the source of truth for personal conversations.
function applyDesktopContactAvatars(mappedConversations, mappedContacts) {
  const avatarByUserId = new Map(
    (mappedContacts || [])
      .filter((item) => item?.userId && item.avatarUrl)
      .map((item) => [String(item.userId), resolveDesktopAvatarUrl(item.avatarUrl)]),
  )
  return (mappedConversations || []).map((conversation) => {
    if (conversation?.type !== 'personal' || !conversation.peerUserId) return conversation
    const avatarUrl = avatarByUserId.get(String(conversation.peerUserId))
    return avatarUrl && avatarUrl !== conversation.avatarUrl
      ? { ...conversation, avatarUrl }
      : conversation
  })
}

async function refreshDesktopConversationAvatar(conversation) {
  if (state.dataSource !== 'remote' || conversation?.type !== 'personal' || !conversation.peerUserId) return
  try {
    const profile = await fetchDesktopUserProfile(String(conversation.peerUserId))
    rememberDesktopContactRelation(profile)
    const avatarUrl = resolveDesktopAvatarUrl(profile?.avatarUrl || '')
    if (!avatarUrl || avatarUrl === conversation.avatarUrl) return
    conversation.avatarUrl = avatarUrl
    const contact = contacts.find((item) => String(contactUserId(item)) === String(conversation.peerUserId))
    if (contact) contact.avatarUrl = avatarUrl
    if (conversations[state.selectedConversation] === conversation) requestDesktopRender()
  } catch {
    // The contacts/conversations endpoints remain the fallback source.
  }
}

function isDesktopFileTransferAssistant(item) {
  const assistantName = String.fromCodePoint(0x6587, 0x4ef6, 0x4f20, 0x8f93, 0x52a9, 0x624b)
  return Boolean(item?.fileTransferAssistant)
    || String(item?.name || '').trim() === assistantName
    || String(item?.nickname || '').trim() === assistantName
    || String(item?.remark || '').trim() === assistantName
}

function formatRemoteTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function desktopFileDownloadUrl(fileId, variant = 'original') {
  const id = String(fileId || '').trim()
  if (!id) return ''
  const query = variant && variant !== 'original' ? `?variant=${encodeURIComponent(variant)}` : ''
  return resolveDesktopFileUrl(`/v1/files/${encodeURIComponent(id)}/download${query}`)
}

function desktopFileDocumentPreviewUrl(fileId) {
  const id = String(fileId || '').trim()
  if (!id) return ''
  return resolveDesktopFileUrl(`/v1/files/${encodeURIComponent(id)}/preview`)
}

function normalizeDesktopFilePayload(fileId, value = {}) {
  const raw = value && typeof value === 'object' ? value : {}
  const id = String(fileId || raw.fileId || raw.file_id || '').trim()
  if (!id) return { ...raw }
  const originalUrl = String(raw.originalUrl || raw.original_url || raw.downloadUrl || raw.download_url || raw.url || desktopFileDownloadUrl(id) || '')
  const thumbObjectKey = raw.thumbObjectKey || raw.thumb_object_key || ''
  const previewObjectKey = raw.previewObjectKey || raw.preview_object_key || ''
  const thumbUrl = String(raw.thumbUrl || raw.thumb_url || (thumbObjectKey ? desktopFileDownloadUrl(id, 'thumb') : '') || '')
  const previewUrl = String(raw.previewUrl || raw.preview_url || (previewObjectKey ? desktopFileDownloadUrl(id, 'preview') : '') || '')
  return {
    ...raw,
    fileId: id,
    objectKey: String(raw.objectKey || raw.object_key || ''),
    thumbObjectKey: String(thumbObjectKey),
    previewObjectKey: String(previewObjectKey),
    name: String(raw.name || raw.filename || raw.originalName || raw.original_name || '文件'),
    size: Number(raw.size || raw.originalSize || raw.original_size || 0),
    originalSize: Number(raw.originalSize || raw.original_size || raw.size || 0),
    contentType: String(raw.contentType || raw.content_type || raw.mimeType || raw.mime_type || raw.type || 'application/octet-stream'),
    url: originalUrl,
    originalUrl,
    downloadUrl: String(raw.downloadUrl || raw.download_url || originalUrl),
    thumbUrl,
    previewUrl,
  }
}

const DESKTOP_IMAGE_FILE_PATTERN = /\.(?:jpe?g|png|gif|webp|heic|heif|bmp|tiff?|avif)(?:[?#]|$)/i
const DESKTOP_VIDEO_FILE_PATTERN = /\.(?:mp4|webm|mov|m4v|3gp|mkv|avi|wmv|flv|ogv|ts|mts|m2ts)(?:[?#]|$)/i

function desktopFileLooksLikeImage(value) {
  return DESKTOP_IMAGE_FILE_PATTERN.test(String(value || ''))
}

function desktopFileLooksLikeVideo(value) {
  return DESKTOP_VIDEO_FILE_PATTERN.test(String(value || ''))
}

function desktopFileHasRendition(file) {
  return Boolean(file?.thumbUrl || file?.previewUrl || file?.thumbObjectKey || file?.previewObjectKey)
}

function desktopFileMetadataIsComplete(messageType, file) {
  const type = Number(messageType || 0)
  // Images and videos are not complete until their lightweight rendition is
  // present. The original object is uploaded first, while thumbnails/video
  // previews are generated asynchronously in the background.
  if (type === 1 || type === 2) return desktopFileHasRendition(file)
  return Boolean(file?.objectKey || file?.sha256)
}

function inferDesktopMessageType(content, file = null) {
  const raw = desktopContentString(content).trim()
  if (raw.startsWith('__PULSE_LIVE_LOCATION__')) return 6

  const filePayload = file && typeof file === 'object' ? file : parseDesktopFile(raw)
  if (filePayload?.fileId || filePayload?.url) {
    const contentType = String(filePayload.contentType || filePayload.type || '').toLowerCase()
    const fileName = `${String(filePayload.url || '')} ${String(filePayload.name || '')}`
    if (contentType.startsWith('image/') || desktopFileLooksLikeImage(fileName)) return 1
    if (contentType.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|amr|opus|flac)(\?|$)/i.test(fileName)) return 3
    if (contentType.startsWith('video/') || desktopFileLooksLikeVideo(fileName)) return 2
    // A fileId-only message is still a file message while metadata is loading.
    // This avoids painting an empty text bubble and lets hydration promote an
    // image/video to its actual media type as soon as metadata arrives.
    return 2
  }

  const payload = parseDesktopJson(raw)
  if (!payload || Array.isArray(payload)) return 0
  if (Array.isArray(payload.items)) return 4
  if (payload.cardType || payload.userId || payload.communityId) return 5
  const kind = String(payload.kind || payload.type || payload.event || '').toLowerCase()
  if (['user', 'group', 'community', 'contact', 'card'].includes(kind)) return 5
  if (Number.isFinite(Number(payload.latitude ?? payload.lat))
    && Number.isFinite(Number(payload.longitude ?? payload.lng ?? payload.lon))) return 6
  if (kind.includes('red_packet') || payload.packetType || payload.packetNo || payload.businessNo && kind.includes('packet')) return 7
  if (kind.includes('transfer') || payload.transferNo || (payload.receiverId != null && payload.amount != null)) return 8
  return 0
}

function mapRemoteMessage(item) {
  const rawId = item.id ?? item.msgId ?? item.msg_id ?? item.clientMsgId ?? item.client_msg_id ?? ''
  const createdAt = item.createdAt || item.created_at || (item.sendTime ? new Date(Number(item.sendTime)).toISOString() : '')
  const rawContent = desktopContentString(
    item.rawContent
      ?? item.raw_content
      ?? item.originalContent
      ?? item.original_content
      ?? item.content
      ?? '',
  )
  // History responses are not consistent across backend/client versions:
  // some return `file:<id>`, while others keep the file id inside JSON
  // content (or inside a nested `file` object). Recover all of those forms
  // before deciding whether metadata hydration should be scheduled.
  const rawMsgType = item.msgType ?? item.msg_type ?? item.messageType ?? item.message_type
  const numericMsgType = Number(rawMsgType)
  const hasExplicitType = rawMsgType != null && rawMsgType !== ''
    && Number.isInteger(numericMsgType) && numericMsgType >= 0 && numericMsgType <= 10
  const explicitMsgType = hasExplicitType ? numericMsgType : 0
  const parsedFile = !hasExplicitType || [1, 2, 3].includes(explicitMsgType)
    ? parseDesktopFile(rawContent)
    : null
  const contentFileId = rawContent.startsWith('file:') ? rawContent.slice('file:'.length).trim() : ''
  const rawFile = item.file || item.attachment || item.fileMetadata || item.file_metadata || {}
  const fileId = hasExplicitType && explicitMsgType === 0
    ? ''
    : String(item.fileId || item.file_id || rawFile.fileId || rawFile.file_id || parsedFile?.fileId || parsedFile?.file_id || contentFileId || '').trim()
  const filePayload = {
    ...(parsedFile && typeof parsedFile === 'object' ? parsedFile : {}),
    ...(rawFile && typeof rawFile === 'object' ? rawFile : {}),
  }
  const file = fileId ? normalizeDesktopFilePayload(fileId, filePayload) : null
  const content = fileId ? JSON.stringify(file) : rawContent
  const msgType = hasExplicitType ? explicitMsgType : inferDesktopMessageType(rawContent, file)
  const explicitlyLoaded = Boolean(item.fileMetadataLoaded || item.file_metadata_loaded)
  const hasFileDescriptor = Boolean(
    file?.objectKey
      || file?.sha256
      || file?.thumbUrl
      || file?.previewUrl
      || file?.thumbObjectKey
      || file?.previewObjectKey
      || item.objectKey
      || item.sha256,
  )
  const fileMetadataLoaded = Boolean(
    fileId
      && (explicitlyLoaded || (hasFileDescriptor && desktopFileMetadataIsComplete(msgType, file))),
  )
  const fromUserId = item.fromUserId ?? item.from_user_id ?? item.senderId ?? item.sender_id ?? ''
  return {
    id: String(rawId),
    clientMsgId: item.clientMsgId || item.client_msg_id ? String(item.clientMsgId || item.client_msg_id) : '',
    fromUserId: String(fromUserId),
    fromNickname: item.fromNickname || item.from_nickname || '',
    fromAvatarUrl: resolveDesktopAvatarUrl(item.fromAvatarUrl || item.from_avatar_url || item.avatarUrl || ''),
    content,
    rawContent,
    msgType,
    conversationId: String(item.conversationId || item.conversation_id || item.chatId || item.chat_id || ''),
    mine: String(fromUserId) === String(state.profile.userId || ''),
    createdAt,
    sendTimeMs: Number(item.sendTimeMs || item.send_time_ms || item.sendTime || item.send_time || (createdAt ? Date.parse(createdAt) : 0)) || 0,
    time: formatRemoteTime(createdAt),
    recalled: Boolean(item.recalled || item.isRecalled || item.is_recalled),
    replyToMsgId: item.replyToMsgId || item.reply_to_msg_id ? String(item.replyToMsgId || item.reply_to_msg_id) : '',
    replyToContent: desktopContentString(item.replyToContent || item.reply_to_content || ''),
    replyToMsgType: Number(item.replyToMsgType || item.reply_to_msg_type || 0) || 0,
    replyToNickname: item.replyToNickname || item.reply_to_nickname || '',
    replyToRecalled: Boolean(item.replyToRecalled || item.reply_to_recalled),
    mentionUserIds: Array.isArray(item.mentionUserIds) ? item.mentionUserIds.map((id) => String(id)) : [],
    atAll: Boolean(item.atAll),
    mentionedMe: Boolean(item.mentionedMe),
    burnAfterRead: desktopBurnAfterReadValue(item),
    burnSeconds: Number(item.burnSeconds || 0) || 0,
    burnReadAt: item.burnReadAt || '',
    burnExpiresAt: item.burnExpiresAt || '',
    autoDeleteExpiresAt: item.autoDeleteExpiresAt || '',
    fileId,
    file,
    fileMetadataLoaded,
  }
}

function desktopBurnAfterReadValue(value) {
  const raw = value?.burnAfterRead ?? value?.burn_after_read
  return raw === true || raw === 1 || String(raw || '').trim().toLowerCase() === 'true'
    || Number(value?.burnSeconds || value?.burn_seconds || 0) > 0
    || Boolean(value?.burnReadAt || value?.burn_read_at || value?.burnExpiresAt || value?.burn_expires_at)
}

function mergeMessage(conversationId, message) {
  const messages = state.messagesByConversation[conversationId] || []
  const index = messages.findIndex((item) => (
    (message.id && item.id === message.id)
    || (message.clientMsgId && item.clientMsgId === message.clientMsgId)
  ))
  if (index < 0) {
    state.messagesByConversation[conversationId] = [...messages, message]
    invalidateSharedContentCounts(conversationId)
    scheduleDesktopFileMetadataHydration(conversationId, message)
    return false
  }
  const current = messages[index]
  const keepLoadedFile = Boolean(
    current?.fileMetadataLoaded
      && !message?.fileMetadataLoaded
      && current.fileId
      && String(current.fileId) === String(message?.fileId || ''),
  )
  state.messagesByConversation[conversationId] = messages.map((item, itemIndex) => (
    itemIndex === index
      ? {
          ...item,
          ...message,
          id: message.id || item.id,
          burnAfterRead: Boolean(message.burnAfterRead || item.burnAfterRead),
          burnSeconds: message.burnSeconds || item.burnSeconds || 0,
          burnReadAt: message.burnReadAt || item.burnReadAt || '',
          burnExpiresAt: message.burnExpiresAt || item.burnExpiresAt || '',
          autoDeleteExpiresAt: message.autoDeleteExpiresAt || item.autoDeleteExpiresAt || '',
          ...(keepLoadedFile
            ? { content: item.content, file: item.file, fileMetadataLoaded: true }
            : {}),
        }
      : item
  ))
  invalidateSharedContentCounts(conversationId)
  scheduleDesktopFileMetadataHydration(conversationId, message)
  return true
}

function desktopMessageVisualSignature(message) {
  return JSON.stringify({
    content: message?.content || '',
    msgType: Number(message?.msgType || 0),
    fileId: message?.fileId || '',
    fileMetadataLoaded: Boolean(message?.fileMetadataLoaded),
    recalled: Boolean(message?.recalled),
    replyToMsgId: message?.replyToMsgId || '',
    replyToContent: message?.replyToContent || '',
    replyToMsgType: Number(message?.replyToMsgType || 0),
  })
}

function scheduleDesktopFileMetadataHydration(conversationId, message) {
  const fileId = String(message?.fileId || '').trim()
  if (!fileId || message?.fileMetadataLoaded || desktopFileMetadataLoading.has(fileId)) return
  desktopFileMetadataLoading.set(fileId, true)
  void fetchDesktopFileMetadata(fileId)
    .then((metadata) => {
      const enriched = mapRemoteMessage({
        ...message,
        fileId,
        file: metadata,
        content: JSON.stringify(metadata),
      })
      mergeMessage(conversationId, { ...enriched, fileMetadataLoaded: true })
      // File metadata arrives after the message row has already been painted.
      // Update only that bubble so hydration never rebuilds the whole desktop
      // shell while the user is typing or looking at the chat stream.
      refreshDesktopHydratedMessageDom(conversationId, enriched.id)
    })
    .catch(() => {
      // The message bubble remains usable with fileId-only metadata; a later
      // history refresh can retry without breaking the chat stream.
    })
    .finally(() => desktopFileMetadataLoading.delete(fileId))
}

function scheduleDesktopFileMetadataHydrationForMessages(conversationId, messages) {
  ;(Array.isArray(messages) ? messages : []).forEach((message) => {
    scheduleDesktopFileMetadataHydration(conversationId, message)
  })
}

function currentMessages(selected) {
  return state.messagesByConversation[selected?.id] || []
}

function countSharedContentMessages(messages) {
  return messages.reduce((counts, message) => {
    if (message?.recalled) return counts
    if (Number(message?.msgType || 0) === 1 || desktopIsBurnMedia(message)) counts.media += 1
    if (Number(message?.msgType || 0) === 2 && !desktopIsBurnMedia(message)) counts.file += 1
    return counts
  }, { media: 0, file: 0 })
}

function sharedContentCountsFor(selected) {
  const id = String(selected?.id || '')
  return id ? state.sharedContentCountsByConversation[id] || null : null
}

function invalidateSharedContentCounts(conversationId) {
  const id = String(conversationId || '')
  if (!id) return
  delete state.sharedContentCountsByConversation[id]
  const selected = conversations[state.selectedConversation]
  // 新消息只需要让共享内容计数失效；不要在输入过程中为了两个计数
  // 重新创建整个聊天页面。
  if (String(selected?.id || '') === id) void loadDesktopSharedContentCounts(selected, true, false)
}

  async function loadDesktopSharedContentCounts(selected, force = false, renderWhenDone = true) {
  const id = String(selected?.id || '')
  if (!id) return
  if (!force && state.sharedContentCountsByConversation[id]) return
  if (state.sharedContentCountsLoadingConversationId === id) return

  state.sharedContentCountsLoadingConversationId = id
  if (renderWhenDone && String(conversations[state.selectedConversation]?.id || '') === id) requestDesktopRender()
  try {
    if (state.dataSource !== 'remote') return
    const [media, files] = await Promise.all([
      searchDesktopMessages(id, '', { filter: 'media' }),
      searchDesktopMessages(id, '', { filter: 'file' }),
    ])
    state.sharedContentCountsByConversation[id] = {
      media: media.length,
      file: files.length,
    }
  } catch {
    state.sharedContentCountsByConversation[id] = { media: null, file: null }
  } finally {
    if (state.sharedContentCountsLoadingConversationId === id) {
      state.sharedContentCountsLoadingConversationId = ''
    }
    if (renderWhenDone && String(conversations[state.selectedConversation]?.id || '') === id) requestDesktopRender()
  }
}

function currentDesktopGroupDetail(selected) {
  return state.groupDetailsByConversation[String(selected?.id || '')] || null
}

function desktopMentionCandidates(selected) {
  const detail = currentDesktopGroupDetail(selected)
  const me = String(state.profile.userId || '')
  return (detail?.members || []).filter((member) => String(member.userId) !== me)
}

function desktopCanMentionAll(selected) {
  const detail = currentDesktopGroupDetail(selected)
  return Boolean(detail?.owner || detail?.admin)
}

async function loadDesktopGroupDetail(selected, force = false, renderWhenDone = true) {
  if (!selected?.id || selected.type !== 'group') return null
  if (state.dataSource !== 'remote') return null
  const id = String(selected.id)
  if (!force && state.groupDetailsByConversation[id]) return state.groupDetailsByConversation[id]
  if (state.groupDetailLoadingConversationId === id) {
    await new Promise((resolve) => {
      const startedAt = Date.now()
      const waitForGroupDetail = () => {
        if (state.groupDetailLoadingConversationId !== id || Date.now() - startedAt >= 3000) {
          resolve()
          return
        }
        window.setTimeout(waitForGroupDetail, 40)
      }
      waitForGroupDetail()
    })
    return state.groupDetailsByConversation[id] || null
  }
  state.groupDetailLoadingConversationId = id
  try {
    const detail = await fetchDesktopGroupDetail(id)
    state.groupDetailsByConversation[id] = detail
    return detail
  } catch {
    return null
  } finally {
    if (state.groupDetailLoadingConversationId === id) state.groupDetailLoadingConversationId = ''
    if (renderWhenDone && String(conversations[state.selectedConversation]?.id || '') === id) {
      // @成员面板正在等待群成员时需要立即补齐列表；其他后台同步尊重
      // 输入/滚动保护，避免消息页被重建。
      if (state.showMentionPicker) render()
      else requestDesktopRender()
    }
  }
}

function desktopGroupIsManager(detail) {
  return Boolean(detail?.owner || detail?.admin)
}

function desktopGroupCanSend(selected) {
  if (selected?.type !== 'group') return true
  const detail = currentDesktopGroupDetail(selected)
  return !detail || desktopGroupIsManager(detail) || (!detail.muteAll && !detail.speakMuted)
}

function desktopGroupMuteReason(selected) {
  const detail = currentDesktopGroupDetail(selected)
  if (!detail || selected?.type !== 'group' || desktopGroupIsManager(detail)) return ''
  if (detail.speakMuted) return '\u4f60\u5df2\u88ab\u7ba1\u7406\u5458\u7981\u8a00\uff0c\u6682\u65f6\u65e0\u6cd5\u53d1\u9001\u6d88\u606f'
  if (detail.muteAll) return '\u7fa4\u804a\u5df2\u5f00\u542f\u5168\u5458\u7981\u8a00\uff0c\u4ec5\u7fa4\u4e3b\u548c\u7ba1\u7406\u5458\u53ef\u53d1\u8a00'
  return ''
}

function rememberDesktopContactRelation(profile) {
  const userId = String(profile?.userId || '')
  if (!userId) return
  const blocked = Boolean(profile?.blocked) || profile?.friendStatus === 'blocked'
  const blockedByPeer = Boolean(profile?.blockedByPeer) || profile?.friendStatus === 'blocked_by_peer'
  if (blocked) state.blockedUserIds.add(userId)
  else state.blockedUserIds.delete(userId)
  if (blockedByPeer) state.blockedByPeerUserIds.add(userId)
  else state.blockedByPeerUserIds.delete(userId)
  if (profile?.friendStatus === 'friend' || profile?.friend === true || blocked || blockedByPeer) {
    state.deletedFriendUserIds.delete(userId)
  }
}

function desktopPersonalChatBlockReason(selected) {
  if (selected?.type !== 'personal' || selected?.fileTransferAssistant) return ''
  const userId = String(selected?.peerUserId || '')
  if (!userId || state.deletedFriendUserIds.has(userId)) return '对方不是你好友，无法发送消息'
  if (state.blockedUserIds.has(userId)) return '已拉黑对方，无法发送消息'
  if (state.blockedByPeerUserIds.has(userId)) return '您已被对方拉入黑名单'
  return ''
}

function desktopChatBlockReason(selected) {
  return desktopPersonalChatBlockReason(selected) || desktopGroupMuteReason(selected)
}

function ensureDesktopCanSend(selected) {
  const reason = desktopChatBlockReason(selected)
  if (reason) showToast(reason)
  return !reason
}

function hideDesktopPrivateConversationForRelation(userId) {
  const targetUserId = String(userId || '')
  if (!targetUserId) return
  const removed = conversations.filter((item) => item.type === 'personal' && String(item.peerUserId || '') === targetUserId)
  if (!removed.length) return
  const selectedId = String(conversations[state.selectedConversation]?.id || '')
  conversations = conversations.filter((item) => !(item.type === 'personal' && String(item.peerUserId || '') === targetUserId))
  const selectedIndex = conversations.findIndex((item) => String(item.id || '') === selectedId)
  state.selectedConversation = selectedIndex >= 0
    ? selectedIndex
    : Math.max(0, Math.min(state.selectedConversation, conversations.length - 1))
  state.conversationMenu = null
  clearPendingDesktopFile()
  clearDesktopMessageSelection()
}

function syncDesktopRelationAfterMutation() {
  if (state.dataSource === 'remote') {
    void pollDesktopRealtimeFallback()
    void refreshNotificationSummary()
  }
}

async function openDesktopGroupInfo({ focusMembers = false } = {}) {
  const selected = conversations[state.selectedConversation]
  if (!selected?.id || !isGroupConversation(selected)) return
  const existingGroupInfoModal = state.modal === 'group-info'
    ? document.querySelector('.desktop-group-info-modal')
    : null
  if (existingGroupInfoModal instanceof HTMLElement) {
    state.groupInfoScrollTop = existingGroupInfoModal.scrollTop
  }
  state.modal = 'group-info'
  state.groupInfoLoading = true
  state.groupInfoError = ''
  if (!(existingGroupInfoModal instanceof HTMLElement)) state.groupInfoScrollTop = 0
  state.groupInfoFocusMembers = Boolean(focusMembers)
  state.groupInfoAddOpen = false
  state.groupInfoAddSelected = new Set()
  render()
  try {
    const detail = await fetchDesktopGroupDetail(String(selected.id))
    state.groupDetailsByConversation[String(selected.id)] = detail
    selected.name = detail.groupRemark || detail.title || selected.name
    selected.initials = selected.name.slice(0, 1)
    selected.pinned = Boolean(detail.pinned)
    selected.mute = Boolean(detail.mute)
    if (desktopGroupIsManager(detail)) await loadDesktopGroupScheduledMessages(String(selected.id), false)
  } catch (error) {
    state.groupInfoError = error instanceof Error ? error.message : '\u7fa4\u804a\u8d44\u6599\u52a0\u8f7d\u5931\u8d25'
  } finally {
    state.groupInfoLoading = false
    requestDesktopRender()
    if (state.groupInfoFocusMembers) {
      window.requestAnimationFrame(() => {
        document.querySelector('[data-group-info-members]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }
}

function groupInfoDetail() {
  return currentDesktopGroupDetail(conversations[state.selectedConversation])
}

function groupInfoScheduledMessages() {
  const selected = conversations[state.selectedConversation]
  return state.groupScheduledMessagesByConversation[String(selected?.id || '')] || []
}

function desktopLocalDateTimeValue(value) {
  const date = value ? new Date(value) : new Date(Date.now() + 10 * 60 * 1000)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function desktopScheduledContentLabel(row) {
  if (Number(row?.msgType) === 0) return String(row?.content || '')
  try { return JSON.parse(row?.content || '{}').name || '已上传文件' } catch { return '已上传文件' }
}

function desktopScheduledTypeLabel(type) {
  return Number(type) === 1 ? '图片/视频' : Number(type) === 2 ? '文件' : Number(type) === 3 ? '音频/语音' : '文字'
}

function desktopScheduledStatusLabel(status) {
  return ({ PENDING: '待发送', SENDING: '发送中', SENT: '已发送', FAILED: '失败' })[status] || status || ''
}

async function loadDesktopGroupScheduledMessages(conversationId, renderWhenDone = true) {
  if (state.dataSource !== 'remote' || !conversationId) return []
  try {
    const rows = await fetchDesktopGroupScheduledMessages(String(conversationId))
    state.groupScheduledMessagesByConversation[String(conversationId)] = rows
    return rows
  } catch (error) {
    showToast(error instanceof Error ? error.message : '定时消息加载失败')
    return []
  } finally {
    if (renderWhenDone && state.modal === 'group-info') render()
  }
}

function chooseDesktopGroupScheduleFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '*/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      try {
        const uploaded = await uploadDesktopFile(file)
        resolve(JSON.stringify({
          fileId: uploaded.fileId,
          objectKey: uploaded.objectKey || undefined,
          thumbObjectKey: uploaded.thumbObjectKey || undefined,
          url: uploaded.url,
          originalUrl: uploaded.originalUrl || undefined,
          name: uploaded.name || file.name,
          size: uploaded.size || file.size,
          originalSize: uploaded.originalSize,
          contentType: uploaded.contentType || file.type || 'application/octet-stream',
        }))
      } catch (error) {
        showToast(error instanceof Error ? error.message : '文件上传失败')
        resolve(null)
      }
    }
    input.click()
  })
}

function parseDesktopScheduledFile(content) {
  try {
    const value = JSON.parse(String(content || ''))
    return value && typeof value === 'object' ? value : null
  } catch {
    return null
  }
}

function desktopScheduledUiType(row) {
  const file = parseDesktopScheduledFile(row?.content)
  const contentType = String(file?.contentType || '').toLowerCase()
  if (Number(row?.msgType) === 0) return 0
  if (Number(row?.msgType) === 3 || contentType.startsWith('audio/')) return 3
  if (Number(row?.msgType) === 1 || contentType.startsWith('video/')) return 1
  return 2
}

async function openDesktopScheduledDialog(row = null) {
  const selected = conversations[state.selectedConversation]
  const detail = groupInfoDetail()
  if (!selected?.id || !detail || !desktopGroupIsManager(detail)) return showToast('仅群主或管理员可设置定时消息')
  const existing = row || {}
  state.scheduledDialog = {
    id: String(existing.id || ''),
    msgType: desktopScheduledUiType(existing),
    content: String(existing.content || ''),
    sendAt: desktopLocalDateTimeValue(existing.sendAt),
    uploading: false,
    error: '',
  }
  state.modal = 'group-scheduled'
  state.modalBusy = false
  render()
}

function handleDesktopScheduledTypeChange(event) {
  if (!state.scheduledDialog) return
  const nextType = Number(event.currentTarget.value) || 0
  const previousType = state.scheduledDialog.msgType
  if ((nextType === 0) !== (previousType === 0)) state.scheduledDialog.content = ''
  state.scheduledDialog.msgType = nextType
  state.scheduledDialog.error = ''
  render()
}

async function handleDesktopScheduledFileChange(event) {
  const input = event.currentTarget
  const file = input?.files?.[0]
  if (input) input.value = ''
  if (!file || !state.scheduledDialog) return
  state.scheduledDialog.uploading = true
  state.scheduledDialog.error = ''
  render()
  try {
    const uploaded = await uploadDesktopFile(file)
    const contentType = String(uploaded.contentType || file.type || 'application/octet-stream').toLowerCase()
    if (state.scheduledDialog.msgType === 1 && !contentType.startsWith('image/') && !contentType.startsWith('video/')) throw new Error('图片或视频消息只能选择图片、视频文件')
    if (state.scheduledDialog.msgType === 3 && !contentType.startsWith('audio/')) throw new Error('音频或语音消息只能选择音频文件')
    if (contentType.startsWith('image/') || contentType.startsWith('video/')) state.scheduledDialog.msgType = 1
    else if (contentType.startsWith('audio/')) state.scheduledDialog.msgType = 3
    state.scheduledDialog.content = JSON.stringify({
      fileId: uploaded.fileId,
      objectKey: uploaded.objectKey || undefined,
      thumbObjectKey: uploaded.thumbObjectKey || undefined,
      url: uploaded.url,
      originalUrl: uploaded.originalUrl || undefined,
      name: uploaded.name || file.name,
      size: uploaded.size || file.size,
      originalSize: uploaded.originalSize,
      contentType,
    })
  } catch (error) {
    state.scheduledDialog.error = error instanceof Error ? error.message : '文件上传失败'
  } finally {
    state.scheduledDialog.uploading = false
    render()
  }
}

async function saveDesktopScheduledDialog() {
  const dialog = state.scheduledDialog
  const selected = conversations[state.selectedConversation]
  if (!dialog || !selected?.id || dialog.uploading || state.modalBusy) return
  const content = String(dialog.content || '').trim()
  const file = parseDesktopScheduledFile(content)
  if (dialog.msgType === 0 && !content) {
    dialog.error = '请输入文字内容'
    render()
    return
  }
  if (dialog.msgType !== 0 && !file?.url) {
    dialog.error = '请先选择并上传文件'
    render()
    return
  }
  const when = new Date(String(dialog.sendAt || ''))
  if (!String(dialog.sendAt || '') || Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
    dialog.error = '发送时间必须晚于当前时间'
    render()
    return
  }
  const contentType = String(file?.contentType || '').toLowerCase()
  if (dialog.msgType === 1 && !contentType.startsWith('image/') && !contentType.startsWith('video/')) {
    dialog.error = '图片或视频消息只能选择图片、视频文件'
    state.modalBusy = false
    render()
    return
  }
  if (dialog.msgType === 3 && !contentType.startsWith('audio/')) {
    dialog.error = '音频或语音消息只能选择音频文件'
    state.modalBusy = false
    render()
    return
  }
  const msgType = dialog.msgType === 0 ? 0 : dialog.msgType === 3 || contentType.startsWith('audio/') ? 3 : contentType.startsWith('image/') ? 1 : 2
  const payload = { msgType, content, sendAt: when.toISOString() }
  state.modalBusy = true
  dialog.error = ''
  render()
  try {
    let saved
    if (state.dataSource === 'remote') {
      saved = dialog.id
        ? await updateDesktopGroupScheduledMessage(String(selected.id), dialog.id, payload)
        : await createDesktopGroupScheduledMessage(String(selected.id), payload)
    } else {
      throw new Error('在线数据未加载，暂不支持保存定时消息')
    }
    const id = String(selected.id)
    const rows = [...groupInfoScheduledMessages()]
    const index = rows.findIndex((item) => String(item.id) === String(saved?.id || dialog.id))
    if (index >= 0) rows[index] = saved
    else rows.push(saved)
    state.groupScheduledMessagesByConversation[id] = rows
    showToast(dialog.id ? '定时消息已修改' : '定时消息已创建')
    state.scheduledDialog = null
    state.modal = 'group-info'
  } catch (error) {
    dialog.error = error instanceof Error ? error.message : '定时消息保存失败'
  } finally {
    state.modalBusy = false
  }
  render()
}

async function deleteDesktopScheduledMessage(row) {
  const selected = conversations[state.selectedConversation]
  if (!selected?.id || !row?.id) return
  if (!window.confirm('删除后不会再发送，确定删除该定时消息？')) return
  try {
    if (state.dataSource === 'remote') await cancelDesktopGroupScheduledMessage(String(selected.id), String(row.id))
    state.groupScheduledMessagesByConversation[String(selected.id)] = groupInfoScheduledMessages().filter((item) => String(item.id) !== String(row.id))
    showToast('定时消息已删除')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '删除失败')
  }
  render()
}

async function editDesktopGroupField(field) {
  const selected = conversations[state.selectedConversation]
  const detail = groupInfoDetail()
  if (!selected?.id || !detail || !desktopGroupIsManager(detail)) return showToast('\u4ec5\u7fa4\u4e3b\u6216\u7ba1\u7406\u5458\u53ef\u4fee\u6539\u7fa4\u8d44\u6599')
  const isTitle = field === 'title'
  const isWelcome = field === 'welcome'
  const result = await openDesktopInputDialog({ title: isTitle ? '\u7f16\u8f91\u7fa4\u540d\u79f0' : isWelcome ? '\u7fa4\u804a\u6b22\u8fce\u8bed' : '\u7f16\u8f91\u7fa4\u516c\u544a', subtitle: isWelcome ? '\u65b0\u6210\u5458\u5165\u7fa4\u540e\u81ea\u52a8\u53d1\u9001\uff0c\u6309\u672c\u6b21\u8bbe\u7f6e\u4eba\u8eab\u4efd\u53d1\u9001' : '\u7fa4\u4fe1\u606f\u5c06\u540c\u6b65\u5230\u7fa4\u5185\u6210\u5458', fields: [{ name: 'value', label: isTitle ? '\u7fa4\u540d\u79f0' : isWelcome ? '\u6b22\u8fce\u8bed' : '\u7fa4\u516c\u544a', value: isTitle ? detail.title : isWelcome ? detail.welcomeMessage : detail.notice, maxlength: isTitle ? 40 : isWelcome ? 2000 : 500, required: isTitle }], validate: (values) => isTitle && !String(values.value || '').trim() ? '\u7fa4\u540d\u79f0\u4e0d\u80fd\u4e3a\u7a7a' : '' })
  state.modal = 'group-info'
  if (!result) return
  const value = String(result.value || '').trim()
  try {
    if (state.dataSource === 'remote') await (isTitle ? updateDesktopGroupTitle(String(selected.id), value) : isWelcome ? updateDesktopGroupWelcome(String(selected.id), value) : updateDesktopGroupNotice(String(selected.id), value))
    if (isTitle) { detail.title = value; selected.name = detail.groupRemark || value; selected.initials = selected.name.slice(0, 1) } else if (isWelcome) detail.welcomeMessage = value; else detail.notice = value
    showToast(isTitle ? '\u7fa4\u540d\u79f0\u5df2\u66f4\u65b0' : isWelcome ? (value ? (detail.welcomeMessage ? '\u7fa4\u804a\u6b22\u8fce\u8bed\u5df2\u4fdd\u5b58' : '\u7fa4\u804a\u6b22\u8fce\u8bed\u5df2\u6e05\u7a7a') : '\u7fa4\u804a\u6b22\u8fce\u8bed\u5df2\u6e05\u7a7a') : '\u7fa4\u516c\u544a\u5df2\u66f4\u65b0')
  } catch (error) { showToast(error instanceof Error ? error.message : '\u7fa4\u8d44\u6599\u66f4\u65b0\u5931\u8d25') }
  render()
}

async function editDesktopGroupNickname() {
  const selected = conversations[state.selectedConversation]
  const detail = groupInfoDetail()
  if (!selected?.id || !detail) return
  const result = await openDesktopInputDialog({ title: '\u8bbe\u7f6e\u6211\u5728\u672c\u7fa4\u7684\u6635\u79f0', subtitle: '\u53ea\u5728\u8be5\u7fa4\u4e2d\u5c55\u793a', fields: [{ name: 'value', label: '\u7fa4\u6635\u79f0', value: detail.myGroupNickname || '', maxlength: 40 }] })
  state.modal = 'group-info'
  if (!result) return
  const value = String(result.value || '').trim()
  try { if (state.dataSource === 'remote') await updateDesktopConversationSettings(String(selected.id), { groupNickname: value }); detail.myGroupNickname = value; showToast('\u7fa4\u6635\u79f0\u5df2\u4fdd\u5b58') } catch (error) { showToast(error instanceof Error ? error.message : '\u7fa4\u6635\u79f0\u4fdd\u5b58\u5931\u8d25') }
  render()
}

async function editDesktopGroupRemark() {
  const selected = conversations[state.selectedConversation]
  const detail = groupInfoDetail()
  if (!selected?.id || !detail) return
  const result = await openDesktopInputDialog({ title: '设置群备注', subtitle: '群备注仅对你自己可见', fields: [{ name: 'value', label: '群备注', value: detail.groupRemark || '', maxlength: 64, placeholder: '输入群备注（可留空）' }] })
  if (!result) return
  state.modal = 'group-info'
  const value = String(result.value || '').trim()
  try {
    if (state.dataSource === 'remote') await updateDesktopConversationSettings(String(selected.id), { groupRemark: value })
    detail.groupRemark = value
    selected.groupRemark = value
    selected.name = value || detail.title
    selected.initials = selected.name.slice(0, 1)
    showToast(value ? '群备注已保存' : '已清除群备注')
  } catch (error) { showToast(error instanceof Error ? error.message : '群备注保存失败') }
  render()
}

function desktopGroupSearchModeLabel(mode) {
  if (Number(mode) === 1) return '\u4e0d\u5141\u8bb8\u88ab\u641c\u7d22'
  if (Number(mode) === 2) return '\u53ef\u901a\u8fc7\u7fa4\u53f7\u641c\u7d22'
  return '\u53ef\u901a\u8fc7\u7fa4\u53f7\u53ca\u5173\u952e\u8bcd\u641c\u7d22'
}

async function editDesktopGroupSearchMode() {
  const selected = conversations[state.selectedConversation]
  const detail = groupInfoDetail()
  if (!selected?.id || !detail || !detail.owner) return showToast('\u4ec5\u7fa4\u4e3b\u53ef\u8bbe\u7f6e\u7fa4\u641c\u7d22\u65b9\u5f0f')
  const result = await openDesktopInputDialog({
    title: '\u7fa4\u641c\u7d22\u65b9\u5f0f',
    subtitle: '\u8bbe\u7f6e\u5176\u4ed6\u7528\u6237\u5982\u4f55\u627e\u5230\u8fd9\u4e2a\u7fa4\u804a',
    fields: [{
      name: 'value',
      label: '\u641c\u7d22\u65b9\u5f0f',
      value: String(detail.searchMode || 3),
      options: [
        { value: '1', label: '\u4e0d\u5141\u8bb8\u88ab\u641c\u7d22' },
        { value: '2', label: '\u53ef\u901a\u8fc7\u7fa4\u53f7\u641c\u7d22' },
        { value: '3', label: '\u53ef\u901a\u8fc7\u7fa4\u53f7\u53ca\u5173\u952e\u8bcd\u641c\u7d22' },
      ],
    }],
  })
  state.modal = 'group-info'
  if (!result) return
  const mode = Number(result.value)
  if (![1, 2, 3].includes(mode)) return
  try {
    if (state.dataSource === 'remote') await setDesktopGroupSearchMode(String(selected.id), mode)
    detail.searchMode = mode
    showToast('\u7fa4\u641c\u7d22\u65b9\u5f0f\u5df2\u66f4\u65b0')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '\u7fa4\u641c\u7d22\u65b9\u5f0f\u4fdd\u5b58\u5931\u8d25')
  }
  render()
}

async function copyDesktopValue(value, label = '\u5185\u5bb9') {
  const text = String(value || '').trim()
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    showToast(`${label}\u5df2\u590d\u5236`)
  } catch {
    showToast(`\u5fae\u4fe1\u606f\u590d\u5236\u5931\u8d25\uff0c\u8bf7\u624b\u52a8\u8bb0\u5f55${text}`)
  }
}

async function openDesktopImportantSettings() {
  const selected = conversations[state.selectedConversation]
  const detail = groupInfoDetail()
  if (!selected?.id || !detail) return
  state.modal = 'important-notifications'
  state.importantNotificationLoading = true
  state.importantNotificationBusy = false
  state.importantNotificationSetting = { atAll: true, mentionMe: true, replyMe: true, announcement: true, followedMemberIds: [] }
  render()
  try {
    if (state.dataSource === 'remote') state.importantNotificationSetting = await fetchDesktopImportantNotificationSetting(String(selected.id))
  } catch (error) {
    showToast(error instanceof Error ? error.message : '\u91cd\u8981\u6d88\u606f\u8bbe\u7f6e\u52a0\u8f7d\u5931\u8d25')
  } finally {
    state.importantNotificationLoading = false
    render()
  }
}

async function saveDesktopImportantSettings() {
  const selected = conversations[state.selectedConversation]
  if (!selected?.id || state.importantNotificationBusy) return
  state.importantNotificationBusy = true
  render()
  try {
    if (state.dataSource === 'remote') await updateDesktopImportantNotificationSetting(String(selected.id), state.importantNotificationSetting)
    showToast('\u91cd\u8981\u6d88\u606f\u8bbe\u7f6e\u5df2\u4fdd\u5b58')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '\u91cd\u8981\u6d88\u606f\u8bbe\u7f6e\u4fdd\u5b58\u5931\u8d25')
  } finally {
    state.importantNotificationBusy = false
    render()
  }
}

function toggleDesktopImportantOption(key, checked) {
  state.importantNotificationSetting = { ...state.importantNotificationSetting, [key]: checked }
  void saveDesktopImportantSettings()
}

function toggleDesktopFollowedMember(userId) {
  const current = new Set(state.importantNotificationSetting.followedMemberIds || [])
  const id = String(userId)
  if (current.has(id)) current.delete(id)
  else current.add(id)
  state.importantNotificationSetting = { ...state.importantNotificationSetting, followedMemberIds: [...current] }
  void saveDesktopImportantSettings()
}

async function toggleDesktopGroupSetting(setting, checked) {
  const selected = conversations[state.selectedConversation]
  const detail = groupInfoDetail()
  if (!selected?.id || !detail) return
  if (['muteAll', 'joinVerifyRequired', 'allowMemberAddFriend', 'memberInviteAllowed'].includes(setting) && !desktopGroupIsManager(detail)) return showToast('\u4ec5\u7fa4\u4e3b\u6216\u7ba1\u7406\u5458\u53ef\u8bbe\u7f6e')
  const previous = detail[setting]
  detail[setting] = checked
  try {
    if (state.dataSource === 'remote') {
      if (setting === 'pinned' || setting === 'mute') await updateDesktopConversationSettings(String(selected.id), { [setting]: checked })
      else if (setting === 'muteAll') await setDesktopGroupMuteAll(String(selected.id), checked)
      else if (setting === 'joinVerifyRequired') await setDesktopJoinVerifyRequired(String(selected.id), checked)
      else if (setting === 'memberInviteAllowed') await setDesktopGroupMemberInviteAllowed(String(selected.id), checked)
      else await setDesktopGroupMemberFriendAllowed(String(selected.id), checked)
    }
    if (setting === 'pinned' || setting === 'mute') selected[setting] = checked
    showToast(checked ? '设置已开启' : '设置已关闭')
  } catch (error) { detail[setting] = previous; showToast(error instanceof Error ? error.message : '\u7fa4\u8bbe\u7f6e\u4fdd\u5b58\u5931\u8d25') }
  render()
}

function desktopGroupMemberAction(action, userId, nickname) {
  const detail = groupInfoDetail()
  const member = detail?.members.find((item) => String(item.userId) === String(userId))
  if (!detail || !member || member.role === 'owner' || String(userId) === String(state.profile.userId || '')) return showToast('\u65e0\u6743\u64cd\u4f5c\u8be5\u7fa4\u6210\u5458')
  if ((action === 'transfer' || action === 'admin') && !detail.owner) return showToast('\u4ec5\u7fa4\u4e3b\u53ef\u64cd\u4f5c')
  if ((action === 'remove' || action === 'mute') && !detail.owner && (member.role !== 'member' || !detail.admin)) return showToast('\u65e0\u6743\u64cd\u4f5c\u8be5\u7fa4\u6210\u5458')
  state.confirmDialog = { type: 'group-action', action, userId: String(userId), nickname, conversationId: String(conversations[state.selectedConversation].id) }
  state.modal = 'confirm'
  render()
}

async function executeDesktopGroupAction(dialog) {
  const selected = conversations[state.selectedConversation]
  const detail = groupInfoDetail()
  if (!selected?.id || !detail) return
  try {
    if (dialog.action === 'admin') { const member = detail.members.find((item) => String(item.userId) === String(dialog.userId)); if (state.dataSource === 'remote') await setDesktopGroupMemberRole(String(selected.id), dialog.userId, member?.role === 'admin' ? 'member' : 'admin'); if (member) { member.role = member.role === 'admin' ? 'member' : 'admin'; member.admin = member.role === 'admin' } }
    else if (dialog.action === 'mute') { const member = detail.members.find((item) => String(item.userId) === String(dialog.userId)); if (state.dataSource === 'remote') await setDesktopGroupMemberSpeakMuted(String(selected.id), dialog.userId, !member?.speakMuted); if (member) member.speakMuted = !member.speakMuted }
    else if (dialog.action === 'remove') { if (state.dataSource === 'remote') await removeDesktopGroupMember(String(selected.id), dialog.userId); detail.members = detail.members.filter((member) => String(member.userId) !== String(dialog.userId)); detail.memberCount = detail.members.length }
    else if (dialog.action === 'transfer') { if (state.dataSource === 'remote') await transferDesktopGroupOwner(String(selected.id), dialog.userId); detail.members.forEach((member) => { member.owner = String(member.userId) === String(dialog.userId); member.role = member.owner ? 'owner' : member.role === 'owner' ? 'member' : member.role; member.admin = member.owner || member.role === 'admin' }); detail.owner = false; detail.admin = false }
    else if (dialog.action === 'leave') { if (state.dataSource === 'remote') await leaveDesktopGroup(String(selected.id)); conversations = conversations.filter((item) => String(item.id) !== String(selected.id)); state.modal = ''; render(); return }
    else if (dialog.action === 'dissolve') { if (state.dataSource === 'remote') await dissolveDesktopGroup(String(selected.id)); conversations = conversations.filter((item) => String(item.id) !== String(selected.id)); state.modal = ''; render(); return }
    showToast('\u7fa4\u64cd\u4f5c\u5df2\u5b8c\u6210')
    state.modal = 'group-info'
    if (state.dataSource === 'remote') await openDesktopGroupInfo()
    else render()
  } catch (error) { showToast(error instanceof Error ? error.message : '\u7fa4\u64cd\u4f5c\u5931\u8d25') }
}

function toggleDesktopGroupAddMember(userId) {
  const next = new Set(state.groupInfoAddSelected)
  if (next.has(String(userId))) next.delete(String(userId)); else next.add(String(userId))
  state.groupInfoAddSelected = next
  render()
}

async function addDesktopGroupMembersFromInfo() {
  const selected = conversations[state.selectedConversation]
  const ids = [...state.groupInfoAddSelected]
  if (!selected?.id || !ids.length) return showToast('\u8bf7\u5148\u9009\u62e9\u6210\u5458')
  try { if (state.dataSource === 'remote') await addDesktopGroupMembers(String(selected.id), ids); state.groupInfoAddOpen = false; state.groupInfoAddSelected = new Set(); showToast('\u6210\u5458\u5df2\u6dfb\u52a0'); await openDesktopGroupInfo() } catch (error) { showToast(error instanceof Error ? error.message : '\u6dfb\u52a0\u6210\u5458\u5931\u8d25') }
}

function clearPendingDesktopMentions() {
  state.pendingMentions = []
  state.pendingAtAll = false
}

function resolveDesktopOutgoingMentions(text) {
  if (state.pendingAtAll && text.includes('@全体成员')) return { mentionUserIds: [], atAll: true }
  const ids = (state.pendingMentions || [])
    .filter((mention) => text.includes(`@${mention.nickname}`))
    .map((mention) => String(mention.userId))
  return { mentionUserIds: [...new Set(ids)], atAll: false }
}

function focusDesktopComposer(position) {
  const textarea = document.querySelector('[data-message-composer]')
  if (!(textarea instanceof HTMLTextAreaElement)) return
  textarea.focus()
  const caret = Math.max(0, Math.min(Number(position) || 0, textarea.value.length))
  textarea.setSelectionRange(caret, caret)
}

function insertDesktopMentionToken(token) {
  const textarea = document.querySelector('[data-message-composer]')
  // 成员面板打开后输入框会被重绘，不能再依赖旧 textarea 的 value/selection。
  // 保存打开面板时的文本和光标，确保第一次点成员就能正确插入。
  const draft = state.mentionDraft
  const current = draft?.text != null
    ? String(draft.text)
    : textarea instanceof HTMLTextAreaElement
      ? textarea.value
      : String(state.composerText || '')
  const start = draft?.start != null
    ? Number(draft.start)
    : textarea instanceof HTMLTextAreaElement
      ? textarea.selectionStart
      : current.length
  const end = draft?.end != null
    ? Number(draft.end)
    : textarea instanceof HTMLTextAreaElement
      ? textarea.selectionEnd
      : start
  const before = current.slice(0, start)
  const after = current.slice(end)
  // 输入 @ 后打开成员面板时，部分 Chromium/输入法组合事件会让原始
  // @ 仍然留在 textarea DOM 中；插入 token 前把这个触发符消费掉，
  // 避免点击成员后出现 @@昵称。
  const triggerRemovedBefore = before.endsWith('@') ? before.slice(0, -1) : before
  const needsSpace = triggerRemovedBefore.length > 0 && !/\s$/.test(triggerRemovedBefore)
  const next = `${triggerRemovedBefore}${needsSpace ? ' ' : ''}${token} ${after}`
  state.composerText = next
  state.showMentionPicker = false
  state.mentionDraft = null
  const caret = triggerRemovedBefore.length + (needsSpace ? 1 : 0) + token.length + 1
  // 选择成员时不要整页重绘：点击按钮会先让 textarea 失焦，整页重绘会
  // 重新创建输入框，首次点击时可能把刚插入的内容恢复成旧值或空值。
  // 直接更新当前 textarea，并只移除成员面板，下一次正常重绘再使用 state 中的文本。
  const picker = document.querySelector('.desktop-mention-picker')
  if (picker instanceof HTMLElement) picker.remove()
  if (textarea instanceof HTMLTextAreaElement) {
    textarea.value = next
    textarea.focus()
    try { textarea.setSelectionRange(caret, caret) } catch { /* ignore IME controls */ }
    return
  }
  render()
  focusDesktopComposer(caret)
}

function openDesktopMentionPicker(anchor = null) {
  const selected = conversations[state.selectedConversation]
  if (!selected || selected.type !== 'group') return
  if (anchor) {
    state.mentionDraft = {
      text: String(anchor.text || ''),
      start: Number(anchor.start || 0),
      end: Number(anchor.end ?? anchor.start ?? 0),
    }
  } else {
    const textarea = document.querySelector('[data-message-composer]')
    const text = textarea instanceof HTMLTextAreaElement ? textarea.value : String(state.composerText || '')
    const start = textarea instanceof HTMLTextAreaElement ? textarea.selectionStart : text.length
    const end = textarea instanceof HTMLTextAreaElement ? textarea.selectionEnd : start
    state.mentionDraft = { text, start, end }
  }
  if (!currentDesktopGroupDetail(selected)) void loadDesktopGroupDetail(selected)
  state.showEmojiPanel = false
  state.showPlusMenu = false
  state.showMentionPicker = true
  render()
  const draft = state.mentionDraft
  const typedTrigger = draft?.text?.[Math.max(0, Number(draft.start || 0) - 1)] === '@'
  const caret = draft?.start != null
    ? Math.max(0, Number(draft.start) - (typedTrigger ? 1 : 0))
    : String(state.composerText || '').length
  focusDesktopComposer(caret)
}

function pickDesktopAtAll() {
  const selected = conversations[state.selectedConversation]
  if (!desktopCanMentionAll(selected)) {
    showToast('仅群主或管理员可@全体成员')
    return
  }
  state.pendingAtAll = true
  state.pendingMentions = []
  insertDesktopMentionToken('@全体成员')
}

function pickDesktopMentionMember(member) {
  const userId = String(member?.userId || '')
  const nickname = String(member?.nickname || '用户').trim() || '用户'
  if (!userId) return
  if (!(state.pendingMentions || []).some((item) => String(item.userId) === userId)) {
    state.pendingMentions = [...(state.pendingMentions || []), { userId, nickname }]
  }
  state.pendingAtAll = false
  insertDesktopMentionToken(`@${nickname}`)
}

function desktopTextParts(content) {
  const raw = String(content || '')
  if (!raw) return [{ text: '' }]
  const parts = []
  const mentionPattern = /(@全体成员|@[^\s@]+)/g
  let last = 0
  let match
  while ((match = mentionPattern.exec(raw))) {
    const token = match[0]
    const atIndex = token.indexOf('@')
    const start = match.index + Math.max(0, atIndex)
    if (start > last) parts.push({ text: raw.slice(last, start) })
    parts.push({ text: raw.slice(start, match.index + token.length), mention: true })
    last = match.index + token.length
  }
  if (last < raw.length) parts.push({ text: raw.slice(last) })
  return parts.length ? parts : [{ text: raw }]
}

function renderDesktopTextContent(content) {
  return desktopTextParts(content).map((part) => {
    const text = escapeHtml(part.text).replace(/\n/g, '<br />')
    return part.mention ? `<span class="message-mention">${text}</span>` : text
  }).join('')
}

function addDesktopMentionJump(message) {
  if (!message?.mentionedMe || message.mine || !message.id) return
  if (!state.mentionJumpIds.includes(String(message.id))) state.mentionJumpIds = [...state.mentionJumpIds, String(message.id)]
}

function jumpToNextDesktopMention() {
  const [id, ...rest] = state.mentionJumpIds
  if (!id) return
  state.mentionJumpIds = rest
  render()
  const stream = document.querySelector('.chat-stream')
  const target = [...(stream?.querySelectorAll('[data-message-id]') || [])].find((item) => item.dataset.messageId === id)
  if (!target) {
    showToast('这条@消息暂未加载，请重新打开会话')
    return
  }
  target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  target.classList.add('mention-jump-highlight')
  window.setTimeout(() => target.classList.remove('mention-jump-highlight'), 1300)
  render()
}

function desktopTimestamp(value) {
  if (!value) return 0
  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 0) return numeric < 10_000_000_000 ? numeric * 1000 : numeric
  const parsed = Date.parse(String(value))
  return Number.isFinite(parsed) ? parsed : 0
}

function desktopMessageExpiry(message) {
  const burn = desktopTimestamp(message?.burnExpiresAt)
  const autoDelete = desktopTimestamp(message?.autoDeleteExpiresAt)
  if (!burn && !autoDelete) return { at: 0, kind: '' }
  if (!burn || (autoDelete && autoDelete < burn)) return { at: autoDelete, kind: 'auto' }
  return { at: burn, kind: 'burn' }
}

function desktopIsBurnMessage(message) {
  return desktopBurnAfterReadValue(message)
}

function desktopBurnMediaAttribute(message) {
  return desktopIsBurnMessage(message) ? ' data-burn-media="true"' : ''
}

function desktopIsBurnMedia(message) {
  if (!message) return false
  if (Number(message.msgType) === 1) return true
  if (Number(message.msgType) !== 2) return false
  const file = parseDesktopFile(message.content)
  return String(file?.contentType || '').startsWith('video/') || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(String(file?.url || ''))
}

function desktopIsBurnMediaLocked(message) {
  return desktopIsBurnMessage(message) && desktopIsBurnMedia(message) && !message.mine && !message.burnReadAt
}

function desktopExpiryLabel(message) {
  const expiry = desktopMessageExpiry(message)
  if (expiry.kind === 'auto') return ''
  if (!expiry.at) return desktopIsBurnMessage(message) ? '阅后即焚' : ''
  const remaining = Math.max(0, Math.ceil((expiry.at - state.burnClock) / 1000))
  if (remaining <= 0) return expiry.kind === 'burn' ? '正在销毁' : '正在自动删除'
  if (remaining < 60) return `${expiry.kind === 'burn' ? '阅后即焚' : '自动删除'} · ${remaining} 秒`
  const minutes = Math.ceil(remaining / 60)
  return `${expiry.kind === 'burn' ? '阅后即焚' : '自动删除'} · ${minutes} 分钟`
}

function removeExpiredDesktopMessages() {
  const now = state.burnClock
  const changedConversationIds = new Set()
  let changed = false
  Object.keys(state.messagesByConversation).forEach((conversationId) => {
    const messages = state.messagesByConversation[conversationId] || []
    const remaining = messages.filter((message) => {
      const expiry = desktopMessageExpiry(message)
      const keep = !expiry.at || expiry.at > now
      if (!keep) {
        changed = true
        changedConversationIds.add(String(conversationId))
      }
      return keep
    })
    if (remaining.length !== messages.length) state.messagesByConversation[conversationId] = remaining
  })
  changedConversationIds.forEach((conversationId) => refreshDesktopConversationPreview(conversationId))
  return changed
}

function startDesktopExpiryTimer() {
  if (desktopExpiryTimer !== null) return
  desktopExpiryTimer = window.setInterval(() => {
    state.burnClock = Date.now()
    const changed = removeExpiredDesktopMessages()
    if (changed) {
      requestDesktopRender()
      return
    }
    // 阅后即焚/自动删除的倒计时只更新可见文案，不整页重建，避免图片每秒闪烁。
    const labels = document.querySelectorAll('[data-expiry-label]')
    if (!labels.length) return
    labels.forEach((el) => {
      const conversationId = el.getAttribute('data-conversation-id') || ''
      const messageId = el.getAttribute('data-message-id') || ''
      const messages = state.messagesByConversation[conversationId] || []
      const message = messages.find((item) => String(item.id) === String(messageId))
      if (message) el.textContent = desktopExpiryLabel(message)
    })
  }, 250)
}

function stopDesktopExpiryTimer() {
  if (desktopExpiryTimer !== null) window.clearInterval(desktopExpiryTimer)
  desktopExpiryTimer = null
}

function defaultDesktopConversationSettings(conversationId) {
  return {
    conversationId: String(conversationId || ''),
    burnEnabled: false,
    burnSeconds: 15,
    autoDeleteEnabled: false,
    autoDeleteSeconds: 86400,
    peerAutoDeleteEnabled: false,
    peerAutoDeleteSeconds: 86400,
  }
}

const DESKTOP_BURN_SECONDS_OPTIONS = [5, 15, 30]

function desktopBurnOptionsMarkup(settings, disabled) {
  const supported = DESKTOP_BURN_SECONDS_OPTIONS.includes(Number(settings.burnSeconds))
  const options = DESKTOP_BURN_SECONDS_OPTIONS.map((seconds) =>
    `<option value="${seconds}" ${Number(settings.burnSeconds) === seconds ? 'selected' : ''}>${seconds}秒</option>`).join('')
  const legacy = settings.burnEnabled && !supported
    ? `<small class="desktop-burn-legacy">当前旧设置：${escapeHtml(desktopDurationLabel(settings.burnSeconds, 'burn'))}，请选择新的时间</small>`
    : ''
  return `<label class="desktop-setting-select ${settings.burnEnabled ? '' : 'is-disabled'}"><span>销毁时间</span><select data-chat-burn-select ${!settings.burnEnabled || disabled ? 'disabled' : ''}>${legacy ? '<option value="" selected disabled>旧设置</option>' : ''}${options}</select></label>${legacy}`
}

function desktopConversationSettings(selected) {
  const id = String(selected?.id || '')
  return state.conversationSettingsById[id] || defaultDesktopConversationSettings(id)
}

function desktopDurationLabel(seconds, kind = 'auto') {
  const value = Math.max(0, Number(seconds) || 0)
  if (kind === 'burn') {
    if (value <= 0) return '阅读后立即销毁'
    if (value < 60) return `阅读后${value}秒`
    const minutes = Math.floor(value / 60)
    const remainder = value % 60
    return remainder ? `阅读后${minutes}分${remainder}秒` : `阅读后${minutes}分钟`
  }
  if (value % 2592000 === 0) return `${value / 2592000}个月`
  if (value % 86400 === 0) return `${value / 86400}天`
  if (value % 3600 === 0) return `${value / 3600}小时`
  return `${Math.max(1, Math.round(value / 60))}分钟`
}

async function loadDesktopConversationSettings(selected, force = false) {
  const id = String(selected?.id || '')
  if (!id) return defaultDesktopConversationSettings(id)
  if (selected.type === 'group') {
    const settings = defaultDesktopConversationSettings(id)
    state.conversationSettingsById[id] = settings
    return settings
  }
  if (!force && state.conversationSettingsById[id]) return state.conversationSettingsById[id]
  const base = defaultDesktopConversationSettings(id)
  const [burnResult, autoResult] = await Promise.allSettled([
    fetchDesktopBurnSetting(id),
    fetchDesktopAutoDeleteSetting(id),
  ])
  const burn = burnResult.status === 'fulfilled' ? burnResult.value : null
  const auto = autoResult.status === 'fulfilled' ? autoResult.value : null
  const settings = {
    ...base,
    burnEnabled: Boolean(burn?.enabled),
    burnSeconds: Math.min(300, Math.max(0, Number(burn?.burnSeconds ?? burn?.ttlSeconds) || 0)),
    autoDeleteEnabled: Boolean(auto?.enabled),
    autoDeleteSeconds: Math.max(60, Number(auto?.ttlSeconds) || 86400),
    peerAutoDeleteEnabled: Boolean(auto?.peerEnabled),
    peerAutoDeleteSeconds: Math.max(60, Number(auto?.peerTtlSeconds) || 86400),
  }
  state.conversationSettingsById[id] = settings
  return settings
}

async function openDesktopChatSettings() {
  const selected = conversations[state.selectedConversation]
  if (!selected?.id) return
  const inline = state.page === 'messages'
  state.modal = inline ? '' : 'chat-settings'
  if (inline) state.contactProfileExpanded = true
  state.chatSettingsConversationId = String(selected.id)
  state.chatSettingsLoading = true
  state.chatSettingsError = ''
  render()
  try {
    await loadDesktopConversationSettings(selected, true)
  } catch (error) {
    state.chatSettingsError = error instanceof Error ? error.message : '聊天设置加载失败'
  } finally {
    state.chatSettingsLoading = false
    render()
  }
}

async function saveDesktopBurnSetting(enabled, burnSeconds) {
  const selected = conversations[state.selectedConversation]
  if (!selected?.id || selected.type === 'group' || state.chatSettingsSaving) return
  const id = String(selected.id)
  const current = desktopConversationSettings(selected)
  const nextSeconds = DESKTOP_BURN_SECONDS_OPTIONS.includes(Number(burnSeconds)) ? Number(burnSeconds) : 15
  const next = { ...current, burnEnabled: Boolean(enabled), burnSeconds: nextSeconds }
  state.conversationSettingsById[id] = next
  state.chatSettingsSaving = true
  render()
  try {
    const result = await updateDesktopBurnSetting(id, { enabled: next.burnEnabled, burnSeconds: next.burnSeconds })
    state.conversationSettingsById[id] = { ...next, burnEnabled: Boolean(result?.enabled ?? next.burnEnabled), burnSeconds: Number(result?.burnSeconds ?? next.burnSeconds) }
    showToast(next.burnEnabled ? `已开启阅后即焚，${desktopDurationLabel(next.burnSeconds, 'burn')}` : '已关闭阅后即焚')
  } catch (error) {
    state.conversationSettingsById[id] = current
    showToast(error instanceof Error ? error.message : '阅后即焚设置失败')
  } finally {
    state.chatSettingsSaving = false
    render()
  }
}

async function saveDesktopAutoDeleteSetting(enabled, ttlSeconds) {
  const selected = conversations[state.selectedConversation]
  if (!selected?.id || selected.type === 'group' || state.chatSettingsSaving) return
  const id = String(selected.id)
  const current = desktopConversationSettings(selected)
  const next = { ...current, autoDeleteEnabled: Boolean(enabled), autoDeleteSeconds: Math.max(60, Number(ttlSeconds) || 86400) }
  state.conversationSettingsById[id] = next
  state.chatSettingsSaving = true
  render()
  try {
    const result = await updateDesktopAutoDeleteSetting(id, { enabled: next.autoDeleteEnabled, ttlSeconds: next.autoDeleteSeconds })
    state.conversationSettingsById[id] = { ...next, autoDeleteEnabled: Boolean(result?.enabled ?? next.autoDeleteEnabled), autoDeleteSeconds: Number(result?.ttlSeconds ?? next.autoDeleteSeconds) }
    showToast(next.autoDeleteEnabled ? `已开启自动删除记录，双方发送的新消息，都会在${desktopDurationLabel(next.autoDeleteSeconds)}后从双方的聊天记录中删除` : '已关闭自动删除记录')
  } catch (error) {
    state.conversationSettingsById[id] = current
    showToast(error instanceof Error ? error.message : '自动删除设置失败')
  } finally {
    state.chatSettingsSaving = false
    render()
  }
}

function conversationScrollKey(selected, index = state.selectedConversation) {
  return String(selected?.id || selected?.peerUserId || `local-${index}`)
}

function readStateFor(selected) {
  return state.readStatesByConversation[String(selected?.id || '')] || null
}

function messageSendTimeMs(message) {
  return Number(message.sendTimeMs || (message.createdAt ? Date.parse(message.createdAt) : 0)) || 0
}

function isMessageCoveredByRead(selected, message, lastReadMsgId, lastReadSendTime) {
  if (!lastReadMsgId && !(lastReadSendTime > 0)) return false
  if (lastReadMsgId && message.id === String(lastReadMsgId)) return true
  const messageTime = messageSendTimeMs(message)
  if (messageTime > 0 && lastReadSendTime > 0) return messageTime <= lastReadSendTime
  if (lastReadMsgId) {
    const messages = currentMessages(selected)
    const messageIndex = messages.findIndex((item) => item.id === message.id)
    const readIndex = messages.findIndex((item) => item.id === String(lastReadMsgId))
    if (messageIndex >= 0 && readIndex >= 0) return messageIndex <= readIndex
  }
  return false
}

function messageReadLabel(selected, message) {
  if (isDesktopFileTransferAssistant(selected)) return ''
  if (!message.mine || !state.readReceiptsEnabled) return ''
  const readState = readStateFor(selected)
  if (!readState || readState.readReceiptEnabled === false) return ''
  const isGroup = selected.type === 'group' || Number(readState.conversationType) === 2
  if (!isGroup) {
    return isMessageCoveredByRead(selected, message, readState.peerLastReadMsgId, Number(readState.peerLastReadSendTime || 0)) ? '已读' : '未读'
  }
  const me = String(state.profile.userId || '')
  const count = (readState.members || []).filter((member) => String(member.userId) !== me)
    .filter((member) => isMessageCoveredByRead(selected, message, member.lastReadMsgId, Number(member.lastReadSendTime || 0))).length
  return count > 0 ? `已读 ${count}` : '未读'
}

function renderMessageReadStatus(selected, message) {
  const label = messageReadLabel(selected, message)
  if (!label) return ''
  const readState = readStateFor(selected)
  const isGroup = selected.type === 'group' || Number(readState?.conversationType) === 2
  const shape = isGroup ? 'message-read-status-group' : 'message-read-status-circle'
  return `<span class="message-read-status ${shape} ${label.startsWith('已读') ? 'is-read' : 'is-unread'}" role="img" aria-label="${label}">${isGroup ? label : ''}</span>`
}

function updateDesktopReadStatusDom(conversationId) {
  const selected = conversations.find((item) => String(item.id || '') === String(conversationId || ''))
  if (!selected || state.page !== 'messages') return
  const stream = [...document.querySelectorAll('.chat-stream')]
    .find((item) => String(item.dataset.conversationId || '') === String(conversationId || ''))
  if (!(stream instanceof HTMLElement)) return

  currentMessages(selected).forEach((message) => {
    if (!message.mine) return
    const row = [...stream.querySelectorAll('[data-message-id]')]
      .find((item) => String(item.dataset.messageId || '') === String(message.id || ''))
    const time = row?.querySelector('time')
    if (!(time instanceof HTMLElement)) return
    const label = messageReadLabel(selected, message)
    let status = time.querySelector('.message-read-status')
    if (!label) {
      status?.remove()
      return
    }
    if (!(status instanceof HTMLElement)) {
      status = document.createElement('span')
      status.className = 'message-read-status'
      time.append(' ')
      time.append(status)
    }
    const readState = readStateFor(selected)
    const isGroup = selected.type === 'group' || Number(readState?.conversationType) === 2
    const isRead = String(label).trim() === '已读' || String(label).trim().startsWith('已读 ')
    status.className = [
      'message-read-status',
      isGroup ? 'message-read-status-group' : 'message-read-status-circle',
      isRead ? 'is-read' : 'is-unread',
    ].join(' ')
    status.setAttribute('role', 'img')
    status.setAttribute('aria-label', label)
    status.textContent = label
  })
}

function applyReadReceipt(payload) {
  const conversationId = String(payload.conversationId || '')
  if (!conversationId) return
  const previous = state.readStatesByConversation[conversationId] || { conversationId, members: [] }
  const fromUserId = String(payload.fromUserId || payload.userId || payload.senderId || '')
  const lastReadMsgId = String(payload.lastReadMsgId || '').trim()
  const lastReadSendTime = Number(payload.lastReadSendTime || 0)
  const members = [...(previous.members || [])]
  const index = members.findIndex((member) => String(member.userId) === fromUserId)
  const nextMember = { userId: fromUserId, lastReadMsgId, lastReadSendTime }
  if (index >= 0) members[index] = { ...members[index], ...nextMember }
  else if (fromUserId) members.push(nextMember)
  const isSelfReceipt = fromUserId !== '' && fromUserId === String(state.profile.userId || '')
  state.readStatesByConversation[conversationId] = mergeReadState(previous, {
    conversationId,
    myLastReadMsgId: isSelfReceipt ? lastReadMsgId : '',
    myLastReadSendTime: isSelfReceipt ? lastReadSendTime : 0,
    peerLastReadMsgId: !isSelfReceipt ? lastReadMsgId : '',
    peerLastReadSendTime: !isSelfReceipt ? lastReadSendTime : 0,
    members,
  })
  if (isSelfReceipt) {
    const conversation = conversations.find((item) => String(item.id) === conversationId)
    if (conversation) {
      conversation.unread = 0
      clearDesktopLatestJumpUnread(conversationId)
      updateDesktopConversationFilterBadges()
      syncDesktopShellBadge()
    }
  }
  // The server emits READ_RECEIPT before the surrounding transaction commits.
  // Do not immediately refetch here: that request can observe the old
  // watermark and overwrite this fresh WebSocket update until the next reload.
  if (String(conversations[state.selectedConversation]?.id) === conversationId) {
    if (desktopReadStateSignature(previous) !== desktopReadStateSignature(state.readStatesByConversation[conversationId])) {
      updateDesktopReadStatusDom(conversationId)
    }
    return
  }
  if (isSelfReceipt) {
    const conversation = conversations.find((item) => String(item.id) === conversationId)
    if (conversation) updateDesktopConversationListRow(conversation)
  }
}

function preferredReadWatermark(currentId, currentTime, nextId, nextTime) {
  const currentMs = Number(currentTime || 0)
  const nextMs = Number(nextTime || 0)
  if (nextMs > currentMs) return { id: String(nextId || ''), time: nextMs }
  if (currentMs > nextMs) return { id: String(currentId || ''), time: currentMs }
  return {
    id: String(nextId || currentId || ''),
    time: nextMs || currentMs,
  }
}

function mergeReadState(current, incoming) {
  const previous = current || { conversationId: String(incoming?.conversationId || ''), members: [] }
  const next = incoming || {}
  const my = preferredReadWatermark(
    previous.myLastReadMsgId,
    previous.myLastReadSendTime,
    next.myLastReadMsgId,
    next.myLastReadSendTime,
  )
  const peer = preferredReadWatermark(
    previous.peerLastReadMsgId,
    previous.peerLastReadSendTime,
    next.peerLastReadMsgId,
    next.peerLastReadSendTime,
  )
  const previousMembers = new Map((previous.members || []).map((member) => [String(member.userId), member]))
  for (const member of next.members || []) {
    const id = String(member.userId || '')
    if (!id) continue
    const old = previousMembers.get(id)
    const watermark = preferredReadWatermark(old?.lastReadMsgId, old?.lastReadSendTime, member.lastReadMsgId, member.lastReadSendTime)
    previousMembers.set(id, { ...old, ...member, lastReadMsgId: watermark.id, lastReadSendTime: watermark.time })
  }
  return {
    ...previous,
    ...next,
    conversationId: String(next.conversationId || previous.conversationId || ''),
    myLastReadMsgId: my.id,
    myLastReadSendTime: my.time,
    peerLastReadMsgId: peer.id,
    peerLastReadSendTime: peer.time,
    members: [...previousMembers.values()],
  }
}

function desktopReadStateSignature(state) {
  if (!state) return ''
  const members = (state.members || [])
    .map((member) => `${member.userId}:${member.lastReadMsgId || ''}:${member.lastReadSendTime || 0}:${member.lastReadAt || ''}`)
    .sort()
    .join('|')
  return [
    state.conversationId || '',
    state.readReceiptEnabled !== false,
    state.myLastReadMsgId || '',
    state.myLastReadSendTime || 0,
    state.peerLastReadMsgId || '',
    state.peerLastReadSendTime || 0,
    members,
  ].join('::')
}

function desktopConversationSignature(items) {
  return JSON.stringify((items || []).map((item) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    tag: item.tag,
    preview: item.preview,
    time: item.time,
    unread: item.unread,
    mentionUnread: item.mentionUnread,
    pinned: item.pinned,
    mute: item.mute,
    peerUserId: item.peerUserId,
    avatarUrl: item.avatarUrl,
  })))
}

function desktopContactSignature(items) {
  return JSON.stringify((items || []).map((item) => ({
    userId: item.userId,
    name: item.name,
    remark: item.remark,
    tag: item.tag,
    birthday: item.birthday,
    signature: item.signature,
    avatarUrl: item.avatarUrl,
  })))
}

function desktopMessagesSignature(items) {
  return JSON.stringify((items || []).map((item) => ({
    id: item.id,
    clientMsgId: item.clientMsgId,
    fromUserId: item.fromUserId,
    content: item.content,
    msgType: item.msgType,
    time: item.time,
    createdAt: item.createdAt,
    recalled: item.recalled,
    replyToMsgId: item.replyToMsgId,
    replyToContent: item.replyToContent,
    replyToMsgType: item.replyToMsgType,
    mentionUserIds: item.mentionUserIds,
    atAll: item.atAll,
    mentionedMe: item.mentionedMe,
    burnAfterRead: item.burnAfterRead,
    burnSeconds: item.burnSeconds,
    burnReadAt: item.burnReadAt,
    burnExpiresAt: item.burnExpiresAt,
    autoDeleteExpiresAt: item.autoDeleteExpiresAt,
  })))
}

function stopDesktopReadStatePolling() {
  if (readStatePollTimer !== null) window.clearInterval(readStatePollTimer)
  readStatePollTimer = null
  readStatePollConversationId = ''
}

function startDesktopReadStatePolling(conversationId) {
  const id = String(conversationId || '')
  if (state.dataSource !== 'remote' || !id) {
    stopDesktopReadStatePolling()
    return
  }
  if (readStatePollConversationId === id && readStatePollTimer !== null) return
  stopDesktopReadStatePolling()
  readStatePollConversationId = id
  let pollBusy = false
  const poll = async () => {
    if (readStatePollConversationId !== id || state.dataSource !== 'remote' || !getDesktopToken()) return
    if (pollBusy) return
    pollBusy = true
    try {
      const fresh = await fetchDesktopConversationReadStates(id)
      const previous = state.readStatesByConversation[id]
      const merged = mergeReadState(previous, fresh)
      state.readStatesByConversation[id] = merged
      // This poll fires every 1.5s; an unconditional render rebuilds the whole
      // DOM (and re-binds every protected image), which is what makes chat
      // images appear to never load. Only re-render when the watermark moved.
      if (String(conversations[state.selectedConversation]?.id || '') === id
        && desktopReadStateSignature(previous) !== desktopReadStateSignature(merged)) updateDesktopReadStatusDom(id)
    } catch {
      // The WebSocket remains the fast path; polling retries on the next tick.
    } finally {
      pollBusy = false
    }
  }
  void poll()
  readStatePollTimer = window.setInterval(() => { void poll() }, 1000)
}

function isDesktopProtectedMediaUrl(value) {
  try {
    const parsed = new URL(String(value || ''), window.location.href)
    // Chat files are private fileId resources. Keep the historical raw-file
    // route for old messages, but also treat the new download/preview routes
    // as protected so fullscreen media never bypasses auth or CacheStorage.
    return /\/api\/v1\/files\/(?:raw\/|[^/]+\/(?:download|preview)(?:\/|$))/i.test(parsed.pathname)
  } catch {
    return false
  }
}

function waitForDesktopImageReady(image, source = '') {
  return new Promise((resolve, reject) => {
    let settled = false
    let timeoutId = null
    const cleanup = () => {
      image.removeEventListener('load', onLoad)
      image.removeEventListener('error', onError)
      if (timeoutId !== null) window.clearTimeout(timeoutId)
    }
    const finish = (error = null) => {
      if (settled) return
      settled = true
      cleanup()
      if (error) reject(error)
      else resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }
    const onLoad = () => {
      if (image.naturalWidth > 1 && image.naturalHeight > 1) finish()
      else finish(new Error('image loaded as a placeholder'))
    }
    const onError = () => finish(new Error(`image decode failed${source ? `: ${source}` : ''}`))
    image.addEventListener('load', onLoad)
    image.addEventListener('error', onError)
    if (typeof image.decode === 'function') {
      image.decode().then(onLoad).catch(() => {
        // decode() can reject while the newly assigned src is still loading.
        // Let the load/error events decide; only accept an already decoded image
        // here when Chromium has exposed real dimensions.
        if (image.complete && image.naturalWidth > 1 && image.naturalHeight > 1) onLoad()
      })
    }
    // A newly created Image starts with complete=true and zero dimensions.
    // Treating that initial state as a load makes every blob URL look broken.
    if (image.complete && image.naturalWidth > 1 && image.naturalHeight > 1) queueMicrotask(onLoad)
    timeoutId = window.setTimeout(() => {
      finish(new Error(`image load timed out${source ? `: ${source}` : ''}`))
    }, 30000)
  })
}

async function decodeDesktopBlobUrl(blobUrl, source) {
  const image = new Image()
  image.decoding = 'async'
  image.src = blobUrl
  return waitForDesktopImageReady(image, source)
}

function waitForDesktopVideoReady(video, source = '') {
  return new Promise((resolve, reject) => {
    let settled = false
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onReady)
      video.removeEventListener('error', onError)
    }
    const finish = (error = null) => {
      if (settled) return
      settled = true
      cleanup()
      if (error) reject(error)
      else resolve({ width: video.videoWidth, height: video.videoHeight })
    }
    const onReady = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) finish()
      else finish(new Error('video loaded without dimensions'))
    }
    const onError = () => finish(new Error(`video decode failed${source ? `: ${source}` : ''}`))
    video.addEventListener('loadedmetadata', onReady)
    video.addEventListener('error', onError)
    if (video.readyState >= 1) queueMicrotask(onReady)
  })
}

function waitForDesktopAudioReady(audio, source = '') {
  return new Promise((resolve, reject) => {
    let settled = false
    const cleanup = () => {
      audio.removeEventListener('loadedmetadata', onReady)
      audio.removeEventListener('canplay', onReady)
      audio.removeEventListener('error', onError)
    }
    const finish = (error = null) => {
      if (settled) return
      settled = true
      cleanup()
      if (error) reject(error)
      else resolve({ width: 0, height: 0 })
    }
    const onReady = () => finish()
    const onError = () => finish(new Error(`audio decode failed${source ? `: ${source}` : ''}`))
    audio.addEventListener('loadedmetadata', onReady)
    audio.addEventListener('canplay', onReady)
    audio.addEventListener('error', onError)
    if (audio.readyState >= 1) queueMicrotask(onReady)
  })
}

async function decodeDesktopProtectedBlobUrl(blobUrl, source, type) {
  if (type === 'video') {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.src = blobUrl
    video.load()
    return waitForDesktopVideoReady(video, source)
  }
  if (type === 'audio') {
    const audio = document.createElement('audio')
    audio.preload = 'metadata'
    audio.src = blobUrl
    audio.load()
    return waitForDesktopAudioReady(audio, source)
  }
  return decodeDesktopBlobUrl(blobUrl, source)
}

async function applyDesktopBlobToImage(element, blobUrl, source) {
  if (!element.isConnected) return null
  element.loading = 'eager'
  element.decoding = 'async'
  element.src = blobUrl
  // The visible element may still carry the previous 1x1 placeholder request
  // when its src is replaced, and Chromium can deliver that old request's
  // completion state to the new load cycle. Probe the already authenticated
  // Blob URL in a fresh Image instead; once it decodes, reveal the visible
  // element immediately instead of letting the placeholder node gate it.
  const dimensions = await decodeDesktopBlobUrl(blobUrl, source)
  if (!element.isConnected) return dimensions
  element.classList.remove('is-load-failed')
  element.classList.add('is-loaded')
  setDesktopAvatarFallbackVisible(element, false)
  const link = element.closest('[data-protected-media-link]')
  if (link instanceof HTMLAnchorElement) link.href = blobUrl
  fitDesktopMediaEditorSurface()
  return dimensions
}

async function applyDesktopBlobToVideo(element, blobUrl, source) {
  if (!element.isConnected) return null
  element.preload = 'metadata'
  element.playsInline = true
  element.src = blobUrl
  element.load()
  const dimensions = await waitForDesktopVideoReady(element, source)
  if (!element.isConnected) return dimensions
  element.classList.remove('is-load-failed')
  element.classList.add('is-loaded')
  return dimensions
}

async function applyDesktopBlobToAudio(element, blobUrl, source) {
  if (!element.isConnected) return null
  element.preload = 'metadata'
  element.src = blobUrl
  element.load()
  const dimensions = await waitForDesktopAudioReady(element, source)
  if (!element.isConnected) return dimensions
  element.classList.remove('is-load-failed')
  element.classList.add('is-loaded')
  return dimensions
}

async function applyDesktopBlobToMedia(element, blobUrl, source) {
  if (element instanceof HTMLVideoElement) return applyDesktopBlobToVideo(element, blobUrl, source)
  if (element instanceof HTMLAudioElement) return applyDesktopBlobToAudio(element, blobUrl, source)
  return applyDesktopBlobToImage(element, blobUrl, source)
}

async function retryDesktopProtectedMediaFallback(element, source) {
  const fallback = String(element.dataset.protectedMediaFallbackSrc || '').trim()
  if (!fallback || fallback === source || element.dataset.mediaFallbackTried === '1') return false
  element.dataset.mediaFallbackTried = '1'
  element.dataset.protectedMediaSrc = fallback
  element.dataset.fileVariant = element.dataset.protectedMediaFallbackVariant === 'preview' ? 'preview' : 'original'
  delete element.dataset.mediaBound
  delete element.dataset.mediaLoadState
  await loadDesktopProtectedMedia(element)
  return true
}

async function loadDesktopProtectedMedia(element) {
  if (!(element instanceof HTMLImageElement) && !(element instanceof HTMLVideoElement) && !(element instanceof HTMLAudioElement)) return
  const source = String(element.dataset.protectedMediaSrc || '').trim()
  if (!source) return
  if (element.dataset.mediaBound === '1') {
    // A failed request used to leave mediaBound set forever. On a later
    // render/re-entry, retry an element that is still showing the placeholder;
    // keep active and successfully decoded requests deduplicated.
    const stillLoading = element.dataset.mediaLoadState === 'loading'
    const alreadyLoaded = element.dataset.mediaLoadState === 'loaded' || element.classList.contains('is-loaded')
    if (stillLoading || alreadyLoaded) return
    delete element.dataset.mediaBound
  }
  element.dataset.mediaBound = '1'
  element.dataset.mediaLoadState = 'loading'
  const fileId = String(element.dataset.fileId || '').trim()
  const category = element.dataset.fileCategory === 'video'
    ? 'video'
    : element.dataset.fileCategory === 'audio'
      ? 'audio'
      : element.dataset.fileCategory === 'file'
        ? 'file'
        : 'image'
  const variant = element.dataset.fileVariant === 'original'
    ? 'original'
    : element.dataset.fileVariant === 'preview' ? 'preview' : 'thumb'
  debugDesktopMedia(`load-start path=${new URL(source, window.location.href).pathname}`)
  const cached = desktopMediaBlobUrls.get(source)
  if (cached) {
    try {
      const dimensions = await applyDesktopBlobToMedia(element, cached, source)
      element.dataset.mediaLoadState = 'loaded'
      debugDesktopMedia(`load-success width=${dimensions?.width || 0} height=${dimensions?.height || 0} path=${new URL(source, window.location.href).pathname}`)
    } catch {
      // A cached object URL can outlive the renderer's image decoder. Drop it
      // so the next render performs one clean native download.
      forgetDesktopMediaBlob(source)
      invalidateDesktopCachedMedia(fileId, category, variant)
      element.dataset.mediaLoadState = 'failed'
      if (await retryDesktopProtectedMediaFallback(element, source)) return
      element.classList.add('is-load-failed')
      debugDesktopMedia(`load-failed cached path=${new URL(source, window.location.href).pathname}`)
    }
    return
  }
  // Inline image preloading can finish before the DOM binding gets a chance
  // to run. Reuse that authenticated Blob immediately; otherwise the element
  // can remain on the 1x1 placeholder because the preload state suppresses a
  // second scheduling attempt.
  const preloadedBlob = desktopMediaBlobs.get(source)
  if (preloadedBlob) {
    const blobUrl = publishDesktopMediaBlobUrl(source, preloadedBlob)
    try {
      const dimensions = await applyDesktopBlobToMedia(element, blobUrl, source)
      element.dataset.mediaLoadState = 'loaded'
      debugDesktopMedia(`load-success width=${dimensions?.width || 0} height=${dimensions?.height || 0} path=${new URL(source, window.location.href).pathname}`)
    } catch {
      forgetDesktopMediaBlob(source)
      invalidateDesktopCachedMedia(fileId, category, variant)
      element.dataset.mediaLoadState = 'failed'
      if (await retryDesktopProtectedMediaFallback(element, source)) return
      element.classList.add('is-load-failed')
      debugDesktopMedia(`load-failed preloaded path=${new URL(source, window.location.href).pathname}`)
    }
    return
  }
  let request = desktopMediaBlobLoading.get(source)
  if (!request) {
    // This callback is already owned by desktopMediaBlobLoading. Waiting for
    // that same entry inside fetchDesktopProtectedBlob would make the request
    // await itself before the first network byte is fetched.
    const loadBlob = () => fetchDesktopProtectedBlob(source, category, false)
    request = (fileId
      ? fetchDesktopCachedFileBlob(fileId, category, variant, loadBlob)
      : loadBlob())
      .then((blob) => {
        desktopMediaBlobs.set(source, blob)
        const blobUrl = URL.createObjectURL(blob)
        const type = element instanceof HTMLVideoElement ? 'video' : element instanceof HTMLAudioElement ? 'audio' : 'image'
        return decodeDesktopProtectedBlobUrl(blobUrl, source, type).then((dimensions) => {
          if (desktopMemoryClearPending.delete(source)) {
            // Keep this object URL alive for the current element, but do not
            // publish it as reusable renderer memory after a clear.
            desktopMediaBlobs.delete(source)
            desktopMediaBlobCategories.delete(source)
          } else {
            desktopMediaBlobUrls.set(source, blobUrl)
          }
          debugDesktopMedia(`blob-decoded width=${dimensions.width} height=${dimensions.height} path=${new URL(source, window.location.href).pathname}`)
          return blobUrl
        }).catch((error) => {
          URL.revokeObjectURL(blobUrl)
          // fetchDesktopProtectedBlob stores the response before decoding it.
          // If decoding rejects a 1x1/error rendition, remove that Blob too;
          // otherwise every later chat entry reuses the same bad placeholder.
          forgetDesktopMediaBlob(source)
          invalidateDesktopCachedMedia(fileId, category, variant)
          throw error
        })
      })
      .finally(() => {
        desktopMediaBlobLoading.delete(source)
        if (desktopMemoryClearPending.has(source) && !desktopMediaBlobs.has(source)) desktopMemoryClearPending.delete(source)
      })
    desktopMediaBlobLoading.set(source, request)
  }
  try {
    const blobUrl = await request
    const dimensions = await applyDesktopBlobToMedia(element, blobUrl, source)
    element.dataset.mediaLoadState = 'loaded'
    debugDesktopMedia(`load-success width=${dimensions?.width || 0} height=${dimensions?.height || 0} path=${new URL(source, window.location.href).pathname}`)
  } catch {
    // Keep the placeholder for protected files so Chromium does not issue a
    // second unauthenticated request and replace it with a broken-image icon.
    if (!isDesktopProtectedMediaUrl(source)) element.src = source
    invalidateDesktopCachedMedia(fileId, category, variant)
    element.dataset.mediaLoadState = 'failed'
    if (await retryDesktopProtectedMediaFallback(element, source)) return
    setDesktopAvatarFallbackVisible(element, true)
    element.classList.add('is-load-failed')
    debugDesktopMedia(`load-failed path=${new URL(source, window.location.href).pathname}`)
  }
}

async function fetchDesktopProtectedBlob(source, category = 'other', joinActiveLoad = true) {
  const url = String(source || '').trim()
  if (!url) throw new Error('文件地址为空')
  if (category !== 'other' || !desktopMediaBlobCategories.has(url)) {
    desktopMediaBlobCategories.set(url, category)
  }
  const cachedBlob = desktopMediaBlobs.get(url)
  if (cachedBlob) return cachedBlob
  // A visible protected media element may already be downloading this URL.
  // Wait for that request instead of starting a second authenticated download
  // when the user immediately chooses Copy.
  const loading = joinActiveLoad ? desktopMediaBlobLoading.get(url) : null
  if (loading) {
    try {
      await loading
      const loadedBlob = desktopMediaBlobs.get(url)
      if (loadedBlob) return loadedBlob
    } catch {
      // Retry below if the initial render request failed.
    }
  }
  const cachedBlobUrl = desktopMediaBlobUrls.get(url)
  if (cachedBlobUrl) {
    try {
      const cached = await fetch(cachedBlobUrl)
      if (cached.ok) {
        const blob = await cached.blob()
        desktopMediaBlobs.set(url, blob)
        return blob
      }
    } catch {
      // Fall through to a fresh authenticated request below.
    }
  }
  if (/^(blob:|data:)/i.test(url)) return fetch(url).then((response) => response.blob())
  const headers = {}
  const token = getDesktopToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const nativeMediaRequest = window.pulseDesktop?.mediaRequest
  const request = typeof nativeMediaRequest === 'function'
    ? async (requestHeaders) => {
      const nativeResponse = await nativeMediaRequest({
        url,
        headers: Object.fromEntries(requestHeaders.entries()),
      })
      const blob = desktopNativeMediaResponseBlob(nativeResponse)
      const responseHeaders = new Headers(nativeResponse?.headers || {})
      if (!responseHeaders.has('Content-Type')) responseHeaders.set('Content-Type', nativeResponse?.contentType || blob.type || 'application/octet-stream')
      if (!responseHeaders.has('Content-Length')) responseHeaders.set('Content-Length', String(blob.size))
      return new Response(blob, { status: nativeResponse?.status || 502, headers: responseHeaders })
    }
    : undefined
  const blob = await fetchResumableBlob({
    key: `desktop:${category}:${url}`,
    url,
    headers,
    refreshToken: async (force = false) => force ? refreshDesktopToken() : getDesktopToken(),
    request,
  })
  desktopMediaBlobs.set(url, blob)
  // A direct preload has no media-loading promise that can flush the pending
  // clear later. The visible-media path handles this just before publishing
  // its object URL, so it can keep the active element readable.
  if (desktopMemoryClearPending.has(url) && !desktopMediaBlobLoading.has(url)) {
    desktopMemoryClearPending.delete(url)
    desktopMediaBlobs.delete(url)
    const objectUrl = desktopMediaBlobUrls.get(url)
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl)
      desktopMediaBlobUrls.delete(url)
    }
    desktopMediaBlobCategories.delete(url)
  }
  return blob
}

function clearDesktopMemoryCache(kind = '') {
  const categoryMatches = (category) => !kind || kind === 'all' || category === kind
  for (const [url, category] of desktopMediaBlobCategories.entries()) {
    if (!categoryMatches(category)) continue
    if (desktopMediaBlobLoading.has(url)) {
      desktopMemoryClearPending.add(url)
      continue
    }
    const objectUrl = desktopMediaBlobUrls.get(url)
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl)
      desktopMediaBlobUrls.delete(url)
    }
    desktopMediaBlobs.delete(url)
    desktopMediaBlobCategories.delete(url)
  }
  document.querySelectorAll('[data-protected-media-src]').forEach((element) => {
    const category = element.dataset.fileCategory || 'image'
    if (!categoryMatches(category)) return
    const fileId = String(element.dataset.fileId || '').trim()
    const variant = element.dataset.fileVariant === 'original'
      ? 'original'
      : element.dataset.fileVariant === 'preview' ? 'preview' : 'thumb'
    if (fileId && desktopInlineMediaCounts.has(`${fileId}::${variant}`)) return
    delete element.dataset.mediaBound
    element.classList.remove('is-load-failed')
    if (element instanceof HTMLImageElement) element.src = DESKTOP_MEDIA_PLACEHOLDER
  })
  bindDesktopProtectedMedia()
}

function handleDesktopCacheCleared(event) {
  const detail = event instanceof CustomEvent ? event.detail || {} : {}
  clearDesktopMemoryCache(String(detail.kind || ''))
}

async function preloadDesktopProtectedMedia(source, type = 'image', fileId = '', variant = 'original') {
  const url = String(source || '').trim()
  if (!url || !isDesktopProtectedMediaUrl(url) || desktopMediaBlobUrls.has(url)) return
  // The caller uses this helper immediately before opening the preview/editor.
  // Do not decode the full image once in a detached element and then decode it
  // again in the visible preview. Fetch the authenticated bytes and publish an
  // object URL first; the mounted preview element will decode asynchronously.
  const category = type === 'video' ? 'video' : type === 'audio' ? 'audio' : 'image'
  const loader = () => fetchDesktopProtectedBlob(url, category, false)
  const blob = fileId
    ? await fetchDesktopCachedFileBlob(fileId, category, variant, loader)
    : await loader()
  if (!blob?.size) throw new Error('媒体加载失败')
  if (!desktopMediaBlobUrls.has(url)) desktopMediaBlobUrls.set(url, URL.createObjectURL(blob))
}

function desktopFilePreviewKind(file) {
  const name = String(file?.name || file?.url || '').toLowerCase()
  const contentType = String(file?.contentType || '').toLowerCase()
  const extension = name.split('?')[0].split('#')[0].split('.').pop() || ''
  if (contentType.startsWith('image/') || /^(jpg|jpeg|png|gif|webp|heic|heif)$/.test(extension)) return 'image'
  if (contentType.startsWith('video/') || /^(mp4|webm|mov|m4v|3gp)$/.test(extension)) return 'video'
  if (contentType.startsWith('audio/') || /^(mp3|wav|m4a|aac|ogg|amr|opus|flac)$/.test(extension)) return 'audio'
  if (contentType === 'application/pdf' || extension === 'pdf') return 'pdf'
  if (/^(doc|docx|docm|dot|dotx|dotm|rtf|wps|wpt|xls|xlsx|xlsm|xlt|xltx|xltm|csv|et|ppt|pptx|pptm|pps|ppsx|ppsm|pot|potx|potm|dpt|dps|odt|ods|odp)$/.test(extension)) return 'pdf'
  if (contentType.startsWith('text/') || /^(txt|md|markdown|json|log|xml|yaml|yml|ini|conf|csv)$/.test(extension)) return 'text'
  return 'unsupported'
}

function desktopDocumentPreviewUrl(source) {
  const value = String(source || '').trim()
  const queryIndex = value.search(/[?#]/)
  const path = queryIndex >= 0 ? value.slice(0, queryIndex) : value
  const suffix = queryIndex >= 0 ? value.slice(queryIndex) : ''
  const marker = '/files/raw/'
  const markerIndex = path.lastIndexOf(marker)
  if (markerIndex < 0) return value
  const filename = path.slice(markerIndex + marker.length)
  if (!filename || filename.includes('/')) return value
  return `${path.slice(0, markerIndex)}/files/preview/${encodeURIComponent(filename)}${suffix}`
}

function resetDesktopPdfPreviewView() {
  desktopFilePreviewPdfView = {
    zoom: 1,
    panX: 0,
    panY: 0,
    root: null,
    stage: null,
    baseWidth: 0,
    baseHeight: 0,
  }
}

function destroyDesktopPdfPreview() {
  desktopFilePreviewPdfGeneration += 1
  const loadingTask = desktopFilePreviewPdfLoadingTask
  desktopFilePreviewPdfLoadingTask = null
  if (loadingTask) void loadingTask.destroy().catch(() => {})
  const pdf = desktopFilePreviewPdfDocument
  desktopFilePreviewPdfDocument = null
  if (pdf) void pdf.destroy().catch(() => {})
  resetDesktopPdfPreviewView()
}

function releaseDesktopFilePreviewUrl() {
  if (desktopFilePreviewObjectUrl) {
    URL.revokeObjectURL(desktopFilePreviewObjectUrl)
    desktopFilePreviewObjectUrl = ''
  }
  destroyDesktopPdfPreview()
}

function markDesktopPreviewCacheInUse(preview, inUse) {
  const fileId = String(preview?.fileId || '').trim()
  if (!fileId) return
  if (preview?.kind) {
    markDesktopFileCacheInUse(fileId, preview?.cacheVariant || 'original', inUse)
    return
  }
  markDesktopFileCacheInUse(fileId, 'preview', inUse)
  markDesktopFileCacheInUse(fileId, 'original', inUse)
}

function openDesktopFilePreview(file) {
  if (file?.burnAfterRead || file?.burnMedia) {
    showToast('阅后即焚文件不能复制或保存')
    return
  }
  const kind = desktopFilePreviewKind(file)
  const fileId = String(file?.fileId || '').trim()
  const rawSource = resolveDesktopFileUrl(file?.url || file?.originalUrl || (fileId ? desktopFileDownloadUrl(fileId) : ''))
  const renditionSource = resolveDesktopFileUrl(file?.previewUrl || file?.preview_url || '')
  const fileName = String(file?.name || file?.url || '').toLowerCase()
  const contentType = String(file?.contentType || '').toLowerCase()
  const isOriginalPdf = contentType === 'application/pdf' || /\.pdf(?:[?#]|$)/.test(fileName)
  // Raw PDFs already support HTTP range requests. Avoid routing them through
  // the document-preview endpoint, which needlessly resolves and copies the
  // same PDF before PDF.js can start reading it. Office files still use the
  // conversion endpoint.
  // The desktop browser cannot stream the protected original directly from a
  // native <video>. When a server-side rendition exists, use that small
  // preview for playback so clicking a video does not download the whole
  // original before the player can start.
  const videoSource = kind === 'video' && renditionSource
    ? renditionSource
    : rawSource
  const source = kind === 'pdf' && !isOriginalPdf
    ? (fileId ? desktopFileDocumentPreviewUrl(fileId) : desktopDocumentPreviewUrl(rawSource))
    : videoSource
  if (!source) {
    showToast('当前文件没有可预览的地址')
    return
  }
  markDesktopPreviewCacheInUse(state.filePreview, false)
  releaseDesktopFilePreviewUrl()
  const requestId = ++desktopFilePreviewRequestId
  const descriptor = {
    url: source,
    name: String(file?.name || '文件'),
    size: Number(file?.size || 0),
    contentType: String(file?.contentType || ''),
    fileId,
    cacheVariant: kind === 'pdf' && !isOriginalPdf || kind === 'video' && renditionSource ? 'preview' : 'original',
    kind,
    loading: true,
    error: '',
    previewUrl: '',
    text: '',
    blob: null,
  }
  state.filePreview = descriptor
  markDesktopPreviewCacheInUse(descriptor, true)
  state.modal = 'file-preview'
  // 打开新文件时允许强制替换一次预览 DOM；预览打开后，后台轮询
  // 会继续触发 render()，由 render() 顶部的保护逻辑避免反复重建媒体节点。
  render(true)
  void (async () => {
    try {
      // PDF.js can stream the document directly and request byte ranges. The
      // The original PDF stays on the HTTP endpoint so PDF.js can issue byte
      // range requests and show the first page without a full-file copy.
      if (kind === 'pdf') {
        if (descriptor.fileId) {
          const cached = await getDesktopCachedFileBlob(descriptor.fileId, 'file', descriptor.cacheVariant)
          if (requestId !== desktopFilePreviewRequestId || state.filePreview !== descriptor) return
          if (cached) descriptor.blob = cached
        }
        descriptor.loading = false
        render(true)
        return
      }
      const category = kind === 'video' ? 'video' : kind === 'audio' ? 'audio' : kind === 'unsupported' ? 'file' : 'image'
      const blob = descriptor.fileId
        ? await fetchDesktopCachedFileBlob(descriptor.fileId, category, descriptor.cacheVariant, () => fetchDesktopProtectedBlob(source, category, false))
        : await fetchDesktopProtectedBlob(source, category)
      if (requestId !== desktopFilePreviewRequestId || state.filePreview !== descriptor) return
      const previewUrl = URL.createObjectURL(blob)
      desktopFilePreviewObjectUrl = previewUrl
      descriptor.previewUrl = previewUrl
      descriptor.text = descriptor.kind === 'text' ? await blob.text() : ''
      descriptor.blob = blob
      descriptor.loading = false
      render(true)
    } catch (error) {
      if (requestId !== desktopFilePreviewRequestId || state.filePreview !== descriptor) return
      descriptor.loading = false
      descriptor.error = error instanceof Error ? error.message : '文件预览加载失败'
      render(true)
    }
  })()
}

function renderDesktopFilePreviewModal() {
  const preview = state.filePreview
  if (!preview) return ''
  const body = preview.loading
    ? '<div class="desktop-file-preview-empty"><span class="ui-icon">⟳</span><p>正在加载文件…</p></div>'
    : preview.error
      ? `<div class="desktop-file-preview-empty"><span class="ui-icon">!</span><p>${escapeHtml(preview.error)}</p></div>`
      : preview.kind === 'image'
        ? `<div class="desktop-file-preview-media-wrap"><img class="desktop-file-preview-media" src="${escapeHtml(preview.previewUrl)}" alt="${escapeHtml(preview.name)}" /></div>`
        : preview.kind === 'video'
          ? `<div class="desktop-file-preview-media-wrap"><video class="desktop-file-preview-media" src="${escapeHtml(preview.previewUrl)}" controls autoplay playsinline></video></div>`
            : preview.kind === 'audio'
              ? `<div class="desktop-file-preview-media-wrap"><audio class="desktop-file-preview-audio" src="${escapeHtml(preview.previewUrl)}" controls autoplay></audio></div>`
              : preview.kind === 'pdf'
               ? `<div class="desktop-file-preview-pdf-shell"><div class="desktop-file-preview-pdf-toolbar"><span>滚轮滚动 · Ctrl+滚轮缩放</span><div><button class="btn" type="button" data-desktop-pdf-zoom="out" aria-label="缩小">−</button><strong data-desktop-pdf-zoom-level>100%</strong><button class="btn" type="button" data-desktop-pdf-zoom="in" aria-label="放大">+</button><button class="btn" type="button" data-desktop-pdf-zoom="reset">适应窗口</button></div></div><div class="desktop-file-preview-pdf" data-desktop-pdf-root><div class="desktop-file-preview-empty"><span class="ui-icon">⟳</span><p>正在渲染 PDF…</p></div></div></div>`
              : preview.kind === 'text'
                ? `<pre class="desktop-file-preview-text">${escapeHtml(preview.text || '文件内容为空')}</pre>`
                : '<div class="desktop-file-preview-empty"><span class="ui-icon">▣</span><p>该文件暂不支持在线预览，请另存后打开。</p></div>'
  const download = preview.blob || preview.kind === 'pdf'
    ? `<button class="btn" type="button" data-file-preview-download>${icon('download')} 另存为</button>`
    : ''
  return modalFrame(
    preview.name,
    preview.kind === 'unsupported' ? '文件预览' : `${preview.kind === 'pdf' ? 'PDF' : preview.kind} 预览`,
    `<div class="desktop-file-preview-body">${body}</div><div class="desktop-modal-actions desktop-file-preview-actions">${download}<button class="btn btn-primary" type="button" data-modal-close>关闭</button></div>`,
    'desktop-file-preview-modal',
  )
}

async function renderDesktopPdfPage(pdf, pageNumber, stage, root, preview, generation, pageWidth) {
  if (generation !== desktopFilePreviewPdfGeneration || state.filePreview !== preview || state.modal !== 'file-preview') return false
  const page = await pdf.getPage(pageNumber)
  const baseViewport = page.getViewport({ scale: 1 })
  const scale = Math.min(1.35, Math.max(0.65, pageWidth / baseViewport.width))
  const viewport = page.getViewport({ scale })
  const outputScale = Math.min(window.devicePixelRatio || 1, 1.5)
  const wrapper = document.createElement('div')
  wrapper.className = 'desktop-file-preview-pdf-page'
  wrapper.style.width = `${Math.ceil(viewport.width)}px`
  wrapper.style.height = `${Math.ceil(viewport.height)}px`
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width * outputScale)
  canvas.height = Math.ceil(viewport.height * outputScale)
  canvas.style.width = `${Math.ceil(viewport.width)}px`
  canvas.style.height = `${Math.ceil(viewport.height)}px`
  wrapper.appendChild(canvas)
  stage.appendChild(wrapper)
  desktopFilePreviewPdfView.baseHeight += Math.ceil(viewport.height) + 10
  updateDesktopPdfPreviewView()
  const context = canvas.getContext('2d')
  if (!context) throw new Error('PDF 画布初始化失败')
  await page.render({
    canvasContext: context,
    viewport,
    transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
  }).promise
  page.cleanup?.()
  return true
}

async function renderDesktopPdfPagesInBackground(pdf, stage, root, preview, generation, pageWidth) {
  for (let pageNumber = 2; pageNumber <= pdf.numPages; pageNumber += 1) {
    if (generation !== desktopFilePreviewPdfGeneration || state.filePreview !== preview || state.modal !== 'file-preview') return
    await new Promise((resolve) => window.requestAnimationFrame(resolve))
    try {
      await renderDesktopPdfPage(pdf, pageNumber, stage, root, preview, generation, pageWidth)
    } catch {
      // The first page remains usable even if a later page is malformed.
      return
    }
  }
}

async function mountDesktopPdfPreview() {
  const preview = state.filePreview
  const root = document.querySelector('[data-desktop-pdf-root]')
  if (!preview || preview.kind !== 'pdf' || preview.loading || (!preview.blob && !preview.url) || !(root instanceof HTMLElement)) return
  const generation = ++desktopFilePreviewPdfGeneration
  const stage = document.createElement('div')
  stage.className = 'desktop-file-preview-pdf-stage'
  stage.style.width = `${Math.max(320, root.clientWidth - 24)}px`
  stage.style.height = '1px'
  root.replaceChildren(stage)
  desktopFilePreviewPdfView.root = root
  desktopFilePreviewPdfView.stage = stage
  desktopFilePreviewPdfView.baseWidth = Math.max(320, root.clientWidth - 24)
  desktopFilePreviewPdfView.baseHeight = 1
  bindDesktopPdfInteractions(root)
  let loadingTask = null
  try {
    ensureDesktopPdfWorker()
    const documentSource = preview.blob
      ? { data: new Uint8Array(await preview.blob.arrayBuffer()) }
      : desktopPdfDocumentOptions(preview.url)
    if (generation !== desktopFilePreviewPdfGeneration || state.filePreview !== preview || state.modal !== 'file-preview') return
    loadingTask = getDocument(documentSource)
    desktopFilePreviewPdfLoadingTask = loadingTask
    const pdf = await withDesktopTimeout(
      loadingTask.promise,
      DESKTOP_PDF_LOAD_TIMEOUT_MS,
      'PDF 引擎加载超时，请刷新后重试',
    )
    if (generation !== desktopFilePreviewPdfGeneration || state.filePreview !== preview || state.modal !== 'file-preview') {
      void pdf.destroy().catch(() => {})
      return
    }
    desktopFilePreviewPdfDocument = pdf
    const pageWidth = Math.max(320, root.clientWidth - 24)
    await renderDesktopPdfPage(pdf, 1, stage, root, preview, generation, pageWidth)
    if (!preview.blob && preview.fileId) {
      void fetchDesktopCachedFileBlob(
        preview.fileId,
        'file',
        preview.cacheVariant || 'original',
        () => fetchDesktopProtectedBlob(preview.url, 'file', false),
      ).catch(() => undefined)
    }
    // Let the browser paint page one and return control to the user before
    // rendering the rest of a long document.
    void renderDesktopPdfPagesInBackground(pdf, stage, root, preview, generation, pageWidth)
  } catch (error) {
    if (desktopFilePreviewPdfLoadingTask === loadingTask) desktopFilePreviewPdfLoadingTask = null
    if (loadingTask) void loadingTask.destroy().catch(() => {})
    if (generation !== desktopFilePreviewPdfGeneration || state.filePreview !== preview) return
    root.innerHTML = `<div class="desktop-file-preview-empty"><span class="ui-icon">!</span><p>${escapeHtml(error instanceof Error ? error.message : 'PDF 渲染失败，请下载后查看。')}</p></div>`
  }
}

function desktopPdfDocumentOptions(url) {
  const token = getDesktopToken()
  const options = {
    url,
    withCredentials: true,
    disableAutoFetch: true,
    disableStream: false,
    rangeChunkSize: 512 * 1024,
  }
  if (token) options.httpHeaders = { Authorization: `Bearer ${token}` }
  return options
}

function updateDesktopPdfPreviewView() {
  const view = desktopFilePreviewPdfView
  const root = view.root
  const stage = view.stage
  if (!(root instanceof HTMLElement) || !(stage instanceof HTMLElement)) return
  if (view.baseWidth > 0) stage.style.width = `${Math.ceil(view.baseWidth)}px`
  if (view.baseHeight > 0) stage.style.height = `${Math.ceil(view.baseHeight)}px`
  stage.style.transform = `translate3d(${view.panX}px, ${view.panY}px, 0) scale(${view.zoom})`
  root.classList.toggle('is-zoomed', view.zoom !== 1)
  const level = root.parentElement?.querySelector('[data-desktop-pdf-zoom-level]')
  if (level instanceof HTMLElement) level.textContent = `${Math.round(view.zoom * 100)}%`
}

function setDesktopPdfPreviewZoom(nextZoom, anchorX = null, anchorY = null) {
  const view = desktopFilePreviewPdfView
  const root = view.root
  if (!(root instanceof HTMLElement)) return
  const next = Math.min(DESKTOP_PDF_MAX_ZOOM, Math.max(DESKTOP_PDF_MIN_ZOOM, nextZoom))
  if (next === view.zoom) return
  if (next === 1) {
    view.zoom = 1
    view.panX = 0
    view.panY = 0
    updateDesktopPdfPreviewView()
    return
  }
  const rect = root.getBoundingClientRect()
  const x = (anchorX == null ? rect.width / 2 : anchorX) + root.scrollLeft
  const y = (anchorY == null ? rect.height / 2 : anchorY) + root.scrollTop
  const ratio = next / view.zoom
  view.panX += (x - rect.width / 2 - view.panX) * (1 - ratio)
  view.panY += (y - view.panY) * (1 - ratio)
  view.zoom = next
  updateDesktopPdfPreviewView()
}

function bindDesktopPdfInteractions(root) {
  if (!(root instanceof HTMLElement) || root.dataset.pdfInteractionsBound === 'true') return
  root.dataset.pdfInteractionsBound = 'true'
  root.addEventListener('wheel', (event) => {
    const deltaY = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
    if (!event.ctrlKey) {
      // Keep the PDF itself as the scroll owner. Depending on the modal's flex
      // layout Chromium may otherwise send the wheel to the outer modal/body.
      const maxScrollTop = Math.max(0, root.scrollHeight - root.clientHeight)
      if (maxScrollTop > 0) {
        event.preventDefault()
        root.scrollTop = Math.max(0, Math.min(maxScrollTop, root.scrollTop + deltaY))
      }
      return
    }
    event.preventDefault()
    const rect = root.getBoundingClientRect()
    const step = deltaY < 0 ? DESKTOP_PDF_ZOOM_STEP : -DESKTOP_PDF_ZOOM_STEP
    setDesktopPdfPreviewZoom(
      desktopFilePreviewPdfView.zoom + step,
      event.clientX - rect.left,
      event.clientY - rect.top,
    )
  }, { passive: false })
  root.addEventListener('dblclick', () => {
    root.scrollTop = 0
    root.scrollLeft = 0
    setDesktopPdfPreviewZoom(1)
  })
  const shell = root.parentElement
  shell?.querySelectorAll('[data-desktop-pdf-zoom]').forEach((button) => button.addEventListener('click', () => {
    const action = button.dataset.desktopPdfZoom
    if (action === 'reset') {
      desktopFilePreviewPdfView.zoom = 1
      desktopFilePreviewPdfView.panX = 0
      desktopFilePreviewPdfView.panY = 0
      root.scrollTop = 0
      root.scrollLeft = 0
      updateDesktopPdfPreviewView()
      return
    }
    setDesktopPdfPreviewZoom(
      desktopFilePreviewPdfView.zoom + (action === 'in' ? DESKTOP_PDF_ZOOM_STEP : -DESKTOP_PDF_ZOOM_STEP),
    )
  }))
  updateDesktopPdfPreviewView()
}

async function openDesktopProtectedFile(file) {
  const source = resolveDesktopFileUrl(file?.originalUrl || file?.url || (file?.fileId ? desktopFileDownloadUrl(file.fileId) : ''))
  if (!source) {
    showToast('当前文件没有可打开的地址')
    return
  }
  // Open the blank window during the user gesture so Chromium/Electron does
  // not block it after the authenticated Blob request finishes.
  const popup = window.open('', '_blank')
  try {
    if (popup) popup.document.title = file?.name || 'Pulse 文件'
    showToast('正在打开文件…')
    const category = desktopFilePreviewKind(file) === 'video'
      ? 'video'
      : desktopFilePreviewKind(file) === 'audio'
        ? 'audio'
        : desktopFilePreviewKind(file) === 'unsupported'
          ? 'file'
          : 'image'
    const blob = file?.fileId
      ? await fetchDesktopCachedFileBlob(String(file.fileId), category, 'original', () => fetchDesktopProtectedBlob(source, category, false))
      : await fetchDesktopProtectedBlob(source, category)
    const blobUrl = URL.createObjectURL(blob)
    if (popup && !popup.closed) {
      popup.location.replace(blobUrl)
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 120000)
      return
    }
    const link = document.createElement('a')
    link.href = blobUrl
    link.target = '_blank'
    link.rel = 'noreferrer'
    link.download = file?.name || ''
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 120000)
  } catch (error) {
    popup?.close()
    showToast(error instanceof Error ? error.message : '文件打开失败')
  }
}

const desktopInlineMediaUsage = new Map()
const desktopInlineMediaCounts = new Map()
const desktopInlineImagePreloadStates = new Map()
let desktopProtectedMediaObserver = null
let desktopProtectedMediaBindScheduled = false

function scheduleDesktopInlineImagePreload(fileId, source, variant = 'thumb') {
  const id = String(fileId || '').trim()
  const url = String(source || '').trim()
  if (!id || !url || !isDesktopProtectedMediaUrl(url)) return
  const safeVariant = variant === 'preview' ? 'preview' : variant === 'original' ? 'original' : 'thumb'
  const key = `${id}::${safeVariant}::${url}`
  const preloadState = desktopInlineImagePreloadStates.get(key)
  if (preloadState === 'pending' || preloadState === 'loaded' || desktopMediaBlobUrls.has(url)) return
  desktopInlineImagePreloadStates.set(key, 'pending')
  void fetchDesktopCachedFileBlob(id, 'image', safeVariant, () => fetchDesktopProtectedBlob(url, 'image', false))
    .then((blob) => {
      if (!blob?.size) throw new Error('图片为空')
      const blobUrl = URL.createObjectURL(blob)
      return decodeDesktopProtectedBlobUrl(blobUrl, url, 'image').then(() => {
        desktopMediaBlobs.set(url, blob)
        desktopMediaBlobCategories.set(url, 'image')
        desktopInlineImagePreloadStates.set(key, 'loaded')
        if (!desktopMediaBlobUrls.has(url)) desktopMediaBlobUrls.set(url, blobUrl)
        else URL.revokeObjectURL(blobUrl)
        // The preload is deliberately independent of DOM binding. Once the
        // authenticated bytes arrive, bind whichever image element is visible.
        bindDesktopProtectedMedia()
      }).catch((error) => {
        URL.revokeObjectURL(blobUrl)
        throw error
      })
    })
    .catch(() => {
      desktopInlineImagePreloadStates.set(key, 'failed')
      forgetDesktopMediaBlob(url)
      invalidateDesktopCachedMedia(id, 'image', safeVariant)
    })
}

function setDesktopInlineMediaUsage(element, inUse) {
  const previous = desktopInlineMediaUsage.get(element) || ''
  const fileId = String(element?.dataset?.fileId || '').trim()
  const variant = element?.dataset?.fileVariant === 'preview'
    ? 'preview'
    : element?.dataset?.fileVariant === 'original' ? 'original' : 'thumb'
  const next = inUse && fileId ? `${fileId}::${variant}` : ''
  if (previous === next) return
  if (previous) {
    const count = Math.max(0, Number(desktopInlineMediaCounts.get(previous) || 0) - 1)
    if (count) desktopInlineMediaCounts.set(previous, count)
    else {
      desktopInlineMediaCounts.delete(previous)
      const [oldFileId, oldVariant] = previous.split('::')
      markDesktopFileCacheInUse(oldFileId, oldVariant, false)
    }
  }
  if (next) {
    const count = Number(desktopInlineMediaCounts.get(next) || 0) + 1
    desktopInlineMediaCounts.set(next, count)
    if (count === 1) markDesktopFileCacheInUse(fileId, variant, true)
    desktopInlineMediaUsage.set(element, next)
  } else {
    desktopInlineMediaUsage.delete(element)
  }
}

function bindDesktopInlineMediaUsage(element) {
  if (!(element instanceof HTMLVideoElement) && !(element instanceof HTMLAudioElement)) return
  if (element.dataset.cacheUsageBound === '1') return
  element.dataset.cacheUsageBound = '1'
  const markPlaying = () => setDesktopInlineMediaUsage(element, true)
  const markStopped = () => setDesktopInlineMediaUsage(element, false)
  element.addEventListener('play', markPlaying)
  element.addEventListener('playing', markPlaying)
  element.addEventListener('pause', markStopped)
  element.addEventListener('ended', markStopped)
  element.addEventListener('emptied', markStopped)
  if (!element.paused) markPlaying()
}

function releaseDetachedDesktopInlineMediaUsage() {
  for (const element of desktopInlineMediaUsage.keys()) {
    if (!document.contains(element)) setDesktopInlineMediaUsage(element, false)
  }
}

function bindDesktopProtectedMedia() {
  releaseDetachedDesktopInlineMediaUsage()
  const elements = [...document.querySelectorAll('[data-protected-media-src]')]
  debugDesktopMedia(`bind count=${elements.length}`)
  elements.forEach((element) => {
    bindDesktopInlineMediaUsage(element)
    void loadDesktopProtectedMedia(element)
  })
}

function scheduleDesktopProtectedMediaBind() {
  if (desktopProtectedMediaBindScheduled) return
  desktopProtectedMediaBindScheduled = true
  window.requestAnimationFrame(() => {
    desktopProtectedMediaBindScheduled = false
    bindDesktopProtectedMedia()
  })
}

function ensureDesktopProtectedMediaObserver() {
  if (desktopProtectedMediaObserver || typeof MutationObserver !== 'function' || !document.body) return
  desktopProtectedMediaObserver = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.addedNodes.length > 0)) scheduleDesktopProtectedMediaBind()
  })
  desktopProtectedMediaObserver.observe(document.body, { childList: true, subtree: true })
  scheduleDesktopProtectedMediaBind()
}

function updateDesktopConversationNameOverflow() {
  const update = () => {
    document.querySelectorAll('.conversation-name-viewport').forEach((element) => {
      if (!(element instanceof HTMLElement)) return
      const text = element.querySelector('.conversation-name-text')
      const item = element.closest('.conversation-item')
      const isGroup = item instanceof HTMLElement && item.dataset.conversationType === 'group'
      const label = text?.textContent?.trim() || ''
      const fontSize = text instanceof HTMLElement
        ? Number.parseFloat(window.getComputedStyle(text).fontSize) || 14
        : 14
      const estimatedWidth = isGroup
        ? Array.from(label).reduce((total, char) => total + (/[\u0000-\u00ff]/.test(char) ? fontSize * 0.62 : fontSize), 0)
        : 0
      const textWidth = text instanceof HTMLElement
        ? Math.max(text.scrollWidth, Math.ceil(text.getBoundingClientRect().width))
        : 0
      const naturalWidth = Math.max(element.scrollWidth, textWidth, estimatedWidth)
      const availableWidth = element.clientWidth
      const overflow = availableWidth > 0 && naturalWidth > availableWidth + 1
      element.classList.toggle('is-overflowing', overflow)
      if (overflow) element.style.setProperty('--conversation-name-shift', `${Math.ceil(naturalWidth - availableWidth + 24)}px`)
      else element.style.removeProperty('--conversation-name-shift')
    })
  }
  update()
  // Re-measure after the browser finishes the current layout pass so long
  // names also start scrolling when the list width changes during render.
  window.requestAnimationFrame(() => {
    update()
    window.setTimeout(update, 120)
  })
  if (document.fonts?.ready) void document.fonts.ready.then(update).catch(() => {})
}

function updateDesktopConversationDecorationsDom() {
  document.querySelectorAll('[data-conversation]').forEach((element) => {
    if (!(element instanceof HTMLElement)) return
    const index = Number(element.dataset.conversation)
    const conversation = conversations[index]
    const nameLine = element.querySelector('.conversation-line')
    if (!conversation || !(nameLine instanceof HTMLElement)) return
    nameLine.querySelector('.conversation-item-tag')?.remove()
    const title = nameLine.querySelector('strong')
    const tag = renderDesktopConversationTag(conversation.fileTransferAssistant ? '' : conversation.tag, conversation.peerUserId || conversation.name)
    if (title && tag) title.insertAdjacentHTML('beforeend', tag)
  })

  const selected = conversations[state.selectedConversation]
  const headerName = document.querySelector('.chat-title h2')
  if (!(headerName instanceof HTMLElement)) return
  headerName.querySelector('.chat-header-tag')?.remove()
  headerName.querySelector('.chat-header-tag-divider')?.remove()
  const tag = selected?.fileTransferAssistant ? '' : String(selected?.tag || '').trim()
  const tagMarkup = renderDesktopFriendTag(tag, selected?.peerUserId || selected?.name || '', 'chat-header-tag')
  if (tagMarkup) {
    const nameText = headerName.querySelector('.chat-title-name-text')
    if (nameText) nameText.insertAdjacentHTML('afterend', tagMarkup)
    else headerName.insertAdjacentHTML('beforeend', tagMarkup)
  }
}

function updateDesktopNotificationBadgeDom() {
  const button = document.querySelector('.topbar [data-action="notifications"]')
  if (!(button instanceof HTMLElement)) return
  const count = Number(state.notificationCount || 0)
  const label = count ? `通知，${count} 条待处理` : '通知'
  button.setAttribute('aria-label', label)
  button.setAttribute('title', label)
  const marker = button.querySelector('i')
  if (count && !marker) button.insertAdjacentHTML('beforeend', '<i></i>')
  if (!count) marker?.remove()
}

function desktopMomentInteractionBadgeLabel(count) {
  const value = Math.max(0, Number(count || 0))
  return value > 0 ? (value > 99 ? '99+' : String(value)) : ''
}

function updateDesktopMomentsBadgeDom() {
  const nav = document.querySelector('.sidebar .nav-item[data-page="moments"]')
  if (!(nav instanceof HTMLElement)) return
  const label = desktopMomentInteractionBadgeLabel(state.momentInteractionUnreadCount)
  const badge = nav.querySelector('.nav-badge')
  if (!label) {
    badge?.remove()
    return
  }
  if (badge) badge.textContent = label
  else nav.insertAdjacentHTML('beforeend', `<span class="nav-badge">${label}</span>`)
}

function updateDesktopContactsBadgeDom() {
  const nav = document.querySelector('.sidebar .nav-item[data-page="contacts"]')
  const contactBadgeCount = Math.max(0, Number(state.friendPendingCount || 0) + Number(state.groupPendingCount || 0))
  if (nav instanceof HTMLElement) {
    const badge = nav.querySelector('.nav-badge')
    if (contactBadgeCount <= 0) badge?.remove()
    else {
      const label = contactBadgeCount > 99 ? '99+' : String(contactBadgeCount)
      if (badge) badge.textContent = label
      else nav.insertAdjacentHTML('beforeend', `<span class="nav-badge">${label}</span>`)
    }
  }

  const friendButton = document.querySelector('[data-action="new-friends"]')
  if (friendButton instanceof HTMLElement) {
    const label = friendButton.querySelector('[data-quick-notification-summary="friends"]')
    if (label) label.textContent = contactNotificationSummary(state.friendPendingCount, '好友申请')
    syncQuickActionBadge(friendButton, state.friendPendingCount)
  }
  const groupButton = document.querySelector('[data-action="group-notifications"]')
  if (groupButton instanceof HTMLElement) {
    const label = groupButton.querySelector('[data-quick-notification-summary="groups"]')
    if (label) label.textContent = contactNotificationSummary(state.groupPendingCount, '群通知')
    syncQuickActionBadge(groupButton, state.groupPendingCount)
  }
}

function contactNotificationSummary(count, label) {
  const value = Math.max(0, Number(count || 0))
  return value > 0 ? `${value} 个待处理${label}` : `暂无待处理${label}`
}

function syncQuickActionBadge(button, count) {
  const value = Math.max(0, Number(count || 0))
  const existing = button.querySelector('.quick-action-badge')
  if (value <= 0) {
    existing?.remove()
    return
  }
  const label = value > 99 ? '99+' : String(value)
  if (existing) existing.textContent = label
  else button.insertAdjacentHTML('beforeend', `<i class="quick-action-badge">${label}</i>`)
}

async function refreshNotificationSummary() {
  if (state.dataSource !== 'remote' || desktopNotificationSummaryBusy) return
  desktopNotificationSummaryBusy = true
  try {
    const [friendResult, groupResult, momentResult] = await Promise.allSettled([
      fetchDesktopFriendRequests(),
      fetchDesktopGroupNotifications(),
      fetchDesktopMomentInteractions(),
    ])
  const friendItems = friendResult.status === 'fulfilled'
    ? friendResult.value.list.filter((item) => !isDesktopNotificationDismissed('friend', item.id))
    : []
  const groupItems = groupResult.status === 'fulfilled' ? groupResult.value : { invites: [], joinRequests: [], events: [] }
  const groupInvites = groupItems.invites.filter((item) => !isDesktopNotificationDismissed('group-invite', item.id))
  const groupJoinRequests = groupItems.joinRequests.filter((item) => !isDesktopNotificationDismissed('group-join', item.id))
  const groupEvents = groupItems.events.filter((item) => !isDesktopNotificationDismissed('group-event', item.id))
  const momentItems = momentResult.status === 'fulfilled'
    ? momentResult.value.filter((item) => !isDesktopNotificationDismissed('moment', item.id))
    : []
  const friendCount = friendItems.filter((item) => item.direction !== 'outgoing' && Number(item.status || 0) === 0).length
  const groupCount = [...groupInvites, ...groupJoinRequests].filter((item) => Number(item.status || 0) === 0).length
  const momentCount = momentItems.filter((item) => !item.isRead).length
  const nextCount = friendCount + groupCount + momentCount
  const previousMomentSignature = (state.momentInteractions || []).map((item) => `${item.id}:${item.isRead ? 1 : 0}:${item.postId}`).join('|')
  const nextMomentSignature = momentItems.map((item) => `${item.id}:${item.isRead ? 1 : 0}:${item.postId}`).join('|')
  const changed = state.friendPendingCount !== friendCount
    || state.groupPendingCount !== groupCount
    || state.momentInteractionUnreadCount !== momentCount
    || state.notificationCount !== nextCount
    || previousMomentSignature !== nextMomentSignature
  state.momentInteractions = momentItems
  state.friendRequests = friendItems
  state.groupNotifications = { invites: groupInvites, joinRequests: groupJoinRequests, events: groupEvents }
  state.friendPendingCount = friendCount
  state.groupPendingCount = groupCount
  state.momentInteractionUnreadCount = momentCount
  state.notificationCount = nextCount
    if (changed) {
      updateDesktopNotificationBadgeDom()
      updateDesktopContactsBadgeDom()
      updateDesktopMomentsBadgeDom()
      updateDesktopMomentReminderDom()
      syncDesktopShellBadge()
    }
  } finally {
    desktopNotificationSummaryBusy = false
  }
}

function desktopMomentInteractionSignature(items) {
  return (items || []).map((item) => `${item.id}:${item.isRead ? 1 : 0}:${item.postId}:${item.type}:${item.createdAt}`).join('|')
}

async function pollDesktopMomentInteractions() {
  if (desktopMomentInteractionPollBusy || document.hidden || state.dataSource !== 'remote' || !state.authenticated || !getDesktopToken()) return
  desktopMomentInteractionPollBusy = true
  try {
    const items = (await fetchDesktopMomentInteractions())
      .filter((item) => !isDesktopNotificationDismissed('moment', item.id))
    const changed = desktopMomentInteractionSignature(state.momentInteractions) !== desktopMomentInteractionSignature(items)
    if (!changed) return
    state.momentInteractions = items
    syncDesktopNotificationCountsFromState()
  } catch {
    // The regular summary poll will retry all notification sources.
  } finally {
    desktopMomentInteractionPollBusy = false
  }
}

function stopDesktopMomentInteractionPolling() {
  if (desktopMomentInteractionPollTimer !== null) window.clearInterval(desktopMomentInteractionPollTimer)
  desktopMomentInteractionPollTimer = null
  desktopMomentInteractionPollBusy = false
}

function startDesktopMomentInteractionPolling() {
  stopDesktopMomentInteractionPolling()
  if (state.dataSource !== 'remote' || !state.authenticated || !getDesktopToken()) return
  void pollDesktopMomentInteractions()
  desktopMomentInteractionPollTimer = window.setInterval(() => {
    void pollDesktopMomentInteractions()
  }, DESKTOP_MOMENT_INTERACTION_POLL_MS)
}

function desktopMomentSnapshotSignature(item) {
  return JSON.stringify({
    id: item?.id,
    likeCount: item?.likeCount,
    commentCount: item?.commentCount,
    likedByMe: Boolean(item?.likedByMe),
    likeNicknames: item?.likeNicknames || [],
    comments: (item?.comments || []).map((comment) => ({
      id: comment.id,
      nickname: comment.nickname,
      content: comment.content,
      replyToCommentId: comment.replyToCommentId,
      replyToNickname: comment.replyToNickname,
    })),
  })
}

function syncDesktopMomentSnapshot(items) {
  const nextItems = Array.isArray(items) ? items : []
  const previousItems = state.moments || []
  const previousById = new Map(previousItems.map((item) => [String(item.id), item]))
  const structureChanged = previousItems.length !== nextItems.length
    || previousItems.some((item, index) => String(item.id) !== String(nextItems[index]?.id || ''))
  state.moments = nextItems
  if (structureChanged) {
    if (state.page === 'moments') render()
    return
  }
  nextItems.forEach((item) => {
    const previous = previousById.get(String(item.id))
    if (!previous || desktopMomentSnapshotSignature(previous) !== desktopMomentSnapshotSignature(item)) {
      updateDesktopMomentCardDom(item)
    }
  })
}

async function pollDesktopMoments() {
  if (desktopMomentPollBusy || document.hidden || state.dataSource !== 'remote' || !state.authenticated || !getDesktopToken()) return
  if (state.page !== 'moments' || state.friendMomentsProfile || !state.momentsLoaded || state.momentsLoading) return
  desktopMomentPollBusy = true
  try {
    syncDesktopMomentSnapshot(await fetchDesktopMoments())
  } catch {
    // Keep the current feed visible and retry on the next interval.
  } finally {
    desktopMomentPollBusy = false
  }
}

function stopDesktopMomentPolling() {
  if (desktopMomentPollTimer !== null) window.clearInterval(desktopMomentPollTimer)
  desktopMomentPollTimer = null
  desktopMomentPollBusy = false
}

function startDesktopMomentPolling() {
  stopDesktopMomentPolling()
  if (state.dataSource !== 'remote' || !state.authenticated || !getDesktopToken()) return
  desktopMomentPollTimer = window.setInterval(() => {
    void pollDesktopMoments()
  }, DESKTOP_MOMENT_POLL_MS)
}

function normalizeDesktopPushPayload(payload) {
  const root = payload && typeof payload === 'object' ? payload : {}
  const merged = { ...root }
  for (let depth = 0; depth < 3; depth += 1) {
    const nestedValue = merged.message ?? merged.payload ?? merged.data
    let nested = null
    if (nestedValue && typeof nestedValue === 'object' && !Array.isArray(nestedValue)) nested = nestedValue
    else if (typeof nestedValue === 'string') {
      try {
        const parsed = JSON.parse(nestedValue)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) nested = parsed
      } catch {
        // Ignore non-JSON wrapper fields.
      }
    }
    if (!nested) break
    Object.assign(merged, nested)
  }
  const value = (...keys) => {
    for (const key of keys) {
      if (merged[key] !== undefined && merged[key] !== null) return merged[key]
    }
    return ''
  }
  const command = String(merged.cmd || merged.type || merged.event || '').trim().toUpperCase()
  return {
    ...merged,
    ...(command ? { cmd: command } : {}),
    id: value('id', 'msgId', 'msg_id', 'messageId', 'message_id'),
    msgId: value('msgId', 'msg_id', 'id', 'messageId', 'message_id'),
    conversationId: value('conversationId', 'conversation_id', 'chatId', 'chat_id'),
    fromUserId: value('fromUserId', 'from_user_id', 'senderId', 'sender_id', 'userId', 'user_id'),
    lastReadMsgId: value('lastReadMsgId', 'last_read_msg_id'),
    lastReadSendTime: value('lastReadSendTime', 'last_read_send_time'),
    fromNickname: value('fromNickname', 'from_nickname', 'senderNickname', 'sender_nickname'),
    fromAvatarUrl: value('fromAvatarUrl', 'from_avatar_url', 'senderAvatarUrl', 'sender_avatar_url', 'avatarUrl', 'avatar_url'),
    toUserId: value('toUserId', 'to_user_id', 'receiverId', 'receiver_id'),
    msgType: value('msgType', 'msg_type', 'messageType', 'message_type'),
    content: value('content', 'text', 'body'),
    clientMsgId: value('clientMsgId', 'client_msg_id'),
    sendTime: value('sendTime', 'send_time', 'createdAt', 'created_at'),
  }
}

function isDesktopChatAtLatest(conversationId) {
  const stream = [...document.querySelectorAll('.chat-stream')]
    .find((item) => String(item.dataset.conversationId || '') === String(conversationId))
  if (stream) return isDesktopChatStreamAtLatest(stream)
  return Boolean(state.chatAtLatestByConversation[String(conversationId)])
}

function isDesktopChatStreamAtLatest(stream, threshold = 48) {
  if (!(stream instanceof HTMLElement)) return false
  return stream.scrollHeight - stream.scrollTop - stream.clientHeight <= threshold
}

function scrollDesktopChatStreamToLatest(stream, conversationId) {
  if (!(stream instanceof HTMLElement)) return
  const id = String(conversationId || stream.dataset.conversationId || '')
  let cleanedUp = false
  const timers = []
  const mediaListeners = []
  let resizeObserver = null
  const apply = () => {
    if (cleanedUp || !stream.isConnected) return
    stream.scrollTop = Math.max(0, stream.scrollHeight - stream.clientHeight)
    if (id) state.chatScrollTopByConversation[id] = stream.scrollTop
  }
  const shouldKeepLatest = () => Boolean(
    state.chatAtLatestByConversation[id] || isDesktopChatStreamAtLatest(stream, 64),
  )
  const resyncAfterLayoutChange = () => {
    if (cleanedUp || !stream.isConnected) return
    if (shouldKeepLatest()) apply()
  }
  const cleanup = () => {
    if (cleanedUp) return
    cleanedUp = true
    timers.forEach((timer) => window.clearTimeout(timer))
    mediaListeners.forEach(({ element, event, handler }) => element.removeEventListener(event, handler))
    resizeObserver?.disconnect()
  }
  apply()
  // Images, font metrics and the newly inserted row can change scrollHeight
  // after appendChild. Re-apply on the next frames and when protected media
  // finishes decoding, so media messages do not stop above the real bottom.
  window.requestAnimationFrame(() => {
    apply()
    window.requestAnimationFrame(apply)
  })
  ;[0, 80, 240, 600, 1200, 2400, 4800].forEach((delay) => {
    timers.push(window.setTimeout(resyncAfterLayoutChange, delay))
  })
  stream.querySelectorAll('img, video, audio').forEach((element) => {
    ;['load', 'loadedmetadata', 'durationchange', 'canplay'].forEach((event) => {
      const handler = resyncAfterLayoutChange
      element.addEventListener(event, handler)
      mediaListeners.push({ element, event, handler })
    })
  })
  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(resyncAfterLayoutChange)
    stream.querySelectorAll('[data-message-id], img, video, audio').forEach((element) => resizeObserver.observe(element))
  }
  timers.push(window.setTimeout(cleanup, 8000))
}

function clearDesktopLatestJumpUnread(conversationId) {
  const id = String(conversationId || '')
  if (!id) return
  document.querySelectorAll('[data-jump-latest]').forEach((element) => {
    if (String(element.dataset.jumpConversation || '') !== id) return
    element.classList.remove('has-new-message', 'is-visible')
    element.querySelector('.jump-latest-count')?.remove()
  })
}

function syncDesktopLatestJumpDom(conversationId, visible = null) {
  const id = String(conversationId || '')
  if (!id) return
  const conversation = conversations.find((item) => String(item.id || '') === id)
  const unread = Math.max(0, Number(conversation?.unread || 0))
  document.querySelectorAll('[data-jump-latest]').forEach((element) => {
    if (String(element.dataset.jumpConversation || '') !== id) return
    const count = element.querySelector('.jump-latest-count')
    element.classList.toggle('has-new-message', unread > 0)
    if (unread > 0) {
      const label = count || document.createElement('span')
      label.className = 'jump-latest-count'
      label.textContent = `${unread > 99 ? '99+' : unread} 条新消息`
      if (!count) element.prepend(label)
    } else {
      count?.remove()
    }
    if (typeof visible === 'boolean') element.classList.toggle('is-visible', visible)
  })
}

function desktopUnreadSyncRecord(conversationId) {
  const id = String(conversationId || '')
  if (!id) return null
  let record = desktopUnreadSyncByConversation.get(id)
  if (!record) {
    record = { pendingIncoming: 0, readPending: false, readAt: 0 }
    desktopUnreadSyncByConversation.set(id, record)
  }
  return record
}

function noteDesktopIncomingUnread(conversationId) {
  const record = desktopUnreadSyncRecord(conversationId)
  if (record) record.pendingIncoming += 1
}

function noteDesktopConversationRead(conversationId) {
  const record = desktopUnreadSyncRecord(conversationId)
  if (!record) return
  record.pendingIncoming = 0
  record.readPending = true
  record.readAt = Date.now()
}

function reconcileDesktopUnreadSnapshot(mapped, current, wsReady) {
  if (!wsReady || !mapped || !current) return mapped
  const record = desktopUnreadSyncByConversation.get(String(mapped.id || ''))
  if (!record) return mapped
  const remoteUnread = Math.max(0, Number(mapped.unread || 0))
  const localUnread = Math.max(0, Number(current.unread || 0))

  // A new push can arrive after the local read request but before the server
  // list query sees it. In that window the older remote zero must not erase
  // the fresh local increment.
  if (record.pendingIncoming > 0 && remoteUnread < localUnread) {
    return { ...mapped, unread: localUnread }
  }

  // The read endpoint emits its WebSocket receipt before the transaction is
  // visible to the conversation-list query. Keep the local zero until the
  // next list response catches up, otherwise the badge briefly reappears.
  if (record.readPending) {
    if (remoteUnread <= localUnread) {
      record.readPending = false
    } else if (Date.now() - record.readAt < 15_000) {
      return { ...mapped, unread: localUnread }
    } else {
      record.readPending = false
    }
  }

  // A push increments the local count before the server-side unread counter
  // is committed. Do not let that older snapshot erase a just-arrived badge.
  if (record.pendingIncoming > 0) {
    if (remoteUnread >= localUnread) {
      record.pendingIncoming = 0
      return mapped
    }
    return { ...mapped, unread: localUnread }
  }
  return mapped
}

function markDesktopConversationLatestRead(conversationId) {
  const id = String(conversationId || '')
  if (!id) return
  state.chatAtLatestByConversation[id] = true
  clearDesktopLatestJumpUnread(id)
  const conversation = conversations.find((item) => String(item.id || '') === id)
  if (!conversation || Number(conversation.unread || 0) <= 0) return
  noteDesktopConversationRead(id)
  conversation.unread = 0
  updateDesktopConversationListRow(conversation)
  updateDesktopConversationFilterBadges()
  syncDesktopShellBadge()
  queueDesktopConversationRead(id)
}

function queueDesktopConversationRead(conversationId) {
  const id = String(conversationId || '')
  if (!id || state.dataSource !== 'remote' || !getDesktopToken()) return
  if (desktopReadMarkInFlight.has(id)) {
    desktopReadMarkQueued.add(id)
    return
  }
  desktopReadMarkInFlight.add(id)
  void markDesktopConversationRead(id)
    .then((readReceipt) => {
      if (readReceipt && typeof readReceipt === 'object') {
        applyReadReceipt({
          ...readReceipt,
          conversationId: id,
          fromUserId: String(state.profile.userId || ''),
        })
      }
    })
    .catch(() => {
      // The local unread state is already cleared; the next latest event retries.
    })
    .finally(() => {
      desktopReadMarkInFlight.delete(id)
      if (desktopReadMarkQueued.delete(id) && state.chatAtLatestByConversation[id]) {
        queueDesktopConversationRead(id)
      }
    })
}

function updateDesktopIncomingAvatar(conversation, message) {
  if (!conversation || message?.mine) return
  const senderId = String(message.fromUserId || '')
  const avatarUrl = resolveDesktopAvatarUrl(message.fromAvatarUrl || '')
  if (!senderId || !avatarUrl) return
  const contact = contacts.find((item) => String(contactUserId(item)) === senderId)
  if (contact) contact.avatarUrl = avatarUrl
  if (conversation.type === 'personal' && String(conversation.peerUserId || '') === senderId) {
    conversation.avatarUrl = avatarUrl
  }
}

let presenceRenderTimer = null
let presenceRenderPending = false
let desktopRenderDeferredWhileComposing = false
let desktopRenderFrame = null
let desktopChatScrollIdleTimer = null
let desktopChatScrollActive = false

function isDesktopComposerEditing() {
  const active = document.activeElement
  return active instanceof HTMLTextAreaElement && active.matches('[data-message-composer]')
}

function isDesktopChatScrolling() {
  return desktopChatScrollActive
}

function markDesktopChatScrolling() {
  desktopChatScrollActive = true
  if (desktopChatScrollIdleTimer !== null) window.clearTimeout(desktopChatScrollIdleTimer)
  desktopChatScrollIdleTimer = window.setTimeout(() => {
    desktopChatScrollIdleTimer = null
    desktopChatScrollActive = false
    flushDesktopDeferredRender()
  }, 180)
}

/**
 * 异步同步统一通过一帧合并整页渲染，避免多个后台事件连续重建 DOM。
 * 用户输入或滚动期间继续延后，等交互结束后再补一次。
 */
function requestDesktopRender() {
  if (isDesktopComposerEditing() || isDesktopChatScrolling()) {
    desktopRenderDeferredWhileComposing = true
    return
  }
  if (desktopRenderFrame !== null) return
  desktopRenderFrame = window.requestAnimationFrame(() => {
    desktopRenderFrame = null
    if (isDesktopComposerEditing() || isDesktopChatScrolling()) {
      desktopRenderDeferredWhileComposing = true
      return
    }
    render()
  })
}

function flushDesktopDeferredRender() {
  if (!desktopRenderDeferredWhileComposing || isDesktopComposerEditing()) return
  desktopRenderDeferredWhileComposing = false
  requestDesktopRender()
}

function scheduleDesktopPresenceRender() {
  presenceRenderPending = true
  if (presenceRenderTimer !== null) return
  // 好友端断线重连会在短时间内产生多次上下线事件；合并成一次重绘，
  // 避免电脑端每 1~2 秒整页重建（图片/视频跟着闪烁）。
  presenceRenderTimer = window.setTimeout(() => {
    presenceRenderTimer = null
    if (presenceRenderPending) {
      presenceRenderPending = false
      render()
    }
  }, 1200)
}

/** 为增量插入的消息行绑定与 render() 一致的事件。 */
function updateDesktopPresenceDom(userId, online, onlineHidden = false) {
  const id = String(userId || '')
  if (!id) return

  const conversationIndex = conversations.findIndex((item) => String(item.peerUserId || '') === id)
  if (conversationIndex >= 0) {
    const item = document.querySelector(`[data-conversation="${conversationIndex}"]`)
    item?.querySelectorAll('.online-dot').forEach((dot) => {
      dot.classList.toggle('offline', !online)
      dot.classList.toggle('is-hidden', onlineHidden)
    })
  }

  document.querySelectorAll(`[data-contact-user-id="${CSS.escape(id)}"] .contact-status`).forEach((status) => {
    status.classList.toggle('is-online', online)
    status.classList.toggle('is-hidden', onlineHidden)
  })

  const selected = conversations[state.selectedConversation]
  if (state.page !== 'messages' || String(selected?.peerUserId || '') !== id) return
  document.querySelectorAll('.chat-header .online-dot').forEach((dot) => {
    dot.classList.toggle('offline', !online)
    dot.classList.toggle('is-hidden', onlineHidden)
  })
  const status = document.querySelector('.chat-header .status-green, .chat-header .status-gray')
  if (status) {
    status.classList.toggle('is-hidden', onlineHidden)
    status.textContent = online ? '在线' : '离线'
    status.classList.toggle('status-green', online)
    status.classList.toggle('status-gray', !online)
  }
}

function syncDesktopPresenceVisibility() {
  document.querySelectorAll('[data-conversation]').forEach((element) => {
    const index = Number(element.dataset.conversation)
    const conversation = conversations[index]
    const hidden = Boolean(conversation?.onlineHidden)
    element.querySelectorAll('.online-dot').forEach((dot) => dot.classList.toggle('is-hidden', hidden))
  })
  document.querySelectorAll('[data-contact-user-id]').forEach((element) => {
    const userId = String(element.dataset.contactUserId || '')
    const contact = contacts.find((item) => String(contactUserId(item)) === userId)
    element.querySelectorAll('.contact-status').forEach((status) => status.classList.toggle('is-hidden', Boolean(contact?.onlineHidden)))
  })
  const selected = conversations[state.selectedConversation]
  const hidden = Boolean(selected?.onlineHidden)
  document.querySelectorAll('.chat-header .online-dot, .chat-header .status-green, .chat-header .status-gray')
    .forEach((element) => element.classList.toggle('is-hidden', hidden))
  const headerStatus = document.querySelector('.chat-header .status-green, .chat-header .status-gray')
  headerStatus?.parentElement?.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE && String(node.textContent || '').includes('·')) {
      node.textContent = hidden ? '' : ' · '
    }
  })
  document.querySelectorAll('.profile-context p').forEach((element) => {
    if (!(element instanceof HTMLElement)) return
    if (hidden) element.textContent = 'Pulse 联系人'
    else if (selected?.online) element.textContent = '在线，随时可以聊天'
    else element.textContent = '最近活跃于昨天'
  })
}

function bindDesktopIncrementalMessageRow(row) {
  if (!row) return
  row.querySelectorAll('[data-message-menu]').forEach((element) => element.addEventListener('contextmenu', (event) => {
    event.preventDefault()
    if (state.messageMultiMode) return
    const conversation = conversations[state.selectedConversation]
    const message = currentMessages(conversation).find((item) => item.id === element.dataset.messageId)
    if (!conversation?.id || !message) return
    const position = getMessageMenuPosition(event, message)
    document.documentElement.style.setProperty('--message-menu-left', `${position.left}px`)
    document.documentElement.style.setProperty('--message-menu-top', `${position.top}px`)
    state.messageMenu = { conversationId: conversation.id, messageId: element.dataset.messageId, ...position }
    render()
  }))
  row.querySelectorAll('[data-message-action]').forEach((element) => element.addEventListener('click', () => {
    void handleMessageAction(element.dataset.messageAction, element.dataset.messageId)
  }))
  row.querySelectorAll('[data-message-reply]').forEach((element) => element.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    void scrollToDesktopMessageWithHistory(element.dataset.replyToMessageId)
  }))
  row.querySelectorAll('[data-message-select-toggle]').forEach((element) => element.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    toggleDesktopMessageSelection(element.dataset.messageSelectToggle)
  }))
  row.querySelectorAll('[data-message-multi-selectable]').forEach((element) => element.addEventListener('click', (event) => {
    if (!state.messageMultiMode) return
    if (event.target instanceof Element && event.target.closest('[data-message-select-toggle]')) return
    handleDesktopMessageMultiInteraction(event, element)
  }, true))
  row.querySelectorAll('[data-red-packet-no]').forEach((element) => element.addEventListener('click', (event) => {
    event.stopPropagation()
    void openDesktopRedPacket(element.dataset.redPacketNo)
  }))
  row.querySelectorAll('[data-transfer-no]').forEach((element) => element.addEventListener('click', (event) => {
    event.stopPropagation()
    void openDesktopTransfer(element.dataset.transferNo)
  }))
  row.querySelectorAll('[data-burn-view]').forEach((element) => element.addEventListener('click', async (event) => {
    event.preventDefault()
    event.stopPropagation()
    const selected = conversations[state.selectedConversation]
    const messageId = element.dataset.burnView || ''
    if (!selected?.id || !messageId) return
    try {
      const result = await viewDesktopBurnMedia(String(selected.id), messageId)
      const messages = currentMessages(selected)
      state.messagesByConversation[selected.id] = messages.map((message) => String(message.id) === messageId
        ? { ...message, burnReadAt: result.burnReadAt, burnExpiresAt: result.burnExpiresAt }
        : message)
      render()
    } catch {
      showToast('阅后即焚图片加载失败')
    }
  }))
}

/**
 * Bind media actions for a newly inserted/replaced message bubble.
 * Full renders bind these through the page event pass, but hydrated media is
 * patched in place and therefore needs its own small, idempotent binding.
 */
function bindDesktopMessageMediaInteractions(root = document) {
  if (!root || typeof root.querySelectorAll !== 'function') return
  root.querySelectorAll('[data-chat-media-preview]').forEach((element) => {
    if (!(element instanceof HTMLElement) || element.dataset.mediaInteractionBound === '1') return
    element.dataset.mediaInteractionBound = '1'
    const descriptor = () => {
      const type = element.dataset.chatMediaType === 'video' ? 'video' : 'image'
      const previewUrl = element.dataset.chatMediaUrl || ''
      const mediumUrl = element.dataset.chatMediaPreviewUrl || previewUrl
      const originalUrl = element.dataset.chatMediaOriginalUrl || ''
      return {
        url: mediumUrl,
        originalUrl,
        fileId: element.dataset.fileId || '',
        type,
        name: element.dataset.chatMediaName || (type === 'video' ? '聊天视频' : '聊天图片'),
        burnAfterRead: element.dataset.burnMedia === 'true',
      }
    }
    element.addEventListener('click', (event) => {
      if (handleDesktopMessageMultiInteraction(event, element)) return
      event.preventDefault()
      event.stopPropagation()
      openDesktopMediaPreview(descriptor())
    })
  })
  root.querySelectorAll('[data-desktop-file-preview]').forEach((element) => {
    if (!(element instanceof HTMLElement) || element.dataset.mediaInteractionBound === '1') return
    element.dataset.mediaInteractionBound = '1'
    element.addEventListener('click', (event) => {
      if (handleDesktopMessageMultiInteraction(event, element)) return
      event.preventDefault()
      event.stopPropagation()
      openDesktopFilePreview({
        url: element.dataset.fileUrl || '',
        previewUrl: element.dataset.filePreviewUrl || '',
        originalUrl: element.dataset.fileOriginalUrl || '',
        fileId: element.dataset.fileId || '',
        name: element.dataset.fileName || '文件',
        size: Number(element.dataset.fileSize || 0),
        contentType: element.dataset.fileType || 'application/octet-stream',
        burnAfterRead: element.dataset.burnMedia === 'true',
      })
    })
  })
}

/** 元数据补齐后只刷新对应气泡，保持输入框、侧栏和聊天滚动状态不变。 */
function refreshDesktopHydratedMessageDom(conversationId, messageId) {
  if (state.page !== 'messages' || document.hidden) return false
  const conversationKey = String(conversationId || '')
  const targetMessageId = String(messageId || '')
  if (!conversationKey || !targetMessageId) return false
  const stream = [...document.querySelectorAll('.chat-stream')]
    .find((element) => String(element.dataset.conversationId || '') === conversationKey)
  if (!(stream instanceof HTMLElement)) return false
  const selected = conversations[state.selectedConversation]
  if (!selected || String(selected.id || '') !== conversationKey) return false
  const row = [...stream.querySelectorAll('.message-row[data-message-id]')]
    .find((element) => String(element.getAttribute('data-message-id') || '') === targetMessageId)
  const message = currentMessages(selected)
    .find((item) => String(item.id || '') === targetMessageId)
  const bubble = row?.querySelector('.message-bubble')
  if (!(row instanceof HTMLElement) || !(bubble instanceof HTMLElement) || !message) return false

  const wasAtLatest = isDesktopChatStreamAtLatest(stream)
  const previousScrollTop = stream.scrollTop
  bubble.innerHTML = renderDesktopMessageContent(message)
  bindDesktopMessageMediaInteractions(bubble)
  bindDesktopProtectedMedia()
  if (wasAtLatest || state.scrollChatToBottom) scrollDesktopChatStreamToLatest(stream, conversationKey)
  else stream.scrollTop = previousScrollTop
  state.chatAtLatestByConversation[conversationKey] = isDesktopChatStreamAtLatest(stream)
  return true
}

/** 新消息到达时把消息行追加到当前会话，避免整页重绘闪烁。 */
function appendDesktopIncomingMessage(conversation, mapped) {
  const stream = document.querySelector('.chat-stream')
  if (!(stream instanceof HTMLElement)) return false
  if (String(stream.dataset.conversationId || '') !== String(conversation.id)) return false
  const selected = conversations[state.selectedConversation]
  if (!selected) return false
  const conversationId = String(conversation.id || '')
  const messageId = String(mapped?.id || '')
  if (messageId) {
    const existing = [...stream.querySelectorAll('[data-message-id]')]
      .some((item) => String(item.getAttribute('data-message-id') || '') === messageId)
    if (existing) {
      if (state.scrollChatToBottom) scrollDesktopChatStreamToLatest(stream, conversationId)
      state.chatAtLatestByConversation[conversationId] = isDesktopChatStreamAtLatest(stream)
      return true
    }
  }
  const wasAtLatest = isDesktopChatStreamAtLatest(stream)
    || Boolean(state.chatAtLatestByConversation[conversationId])
  const container = document.createElement('div')
  container.innerHTML = renderDesktopMessageRow(selected, mapped)
  const row = container.firstElementChild
  if (!row) return false
  stream.appendChild(row)
  bindDesktopIncrementalMessageRow(row)
  bindDesktopProtectedMedia()
  const followLatest = wasAtLatest || state.scrollChatToBottom
  if (followLatest) {
    scrollDesktopChatStreamToLatest(stream, conversationId)
    clearDesktopLatestJumpUnread(conversationId)
  }
  state.chatAtLatestByConversation[conversationId] = followLatest
  if (!followLatest) syncDesktopLatestJumpDom(conversationId, true)
  return true
}

/** 新消息到达时只更新侧边栏会话项（预览/时间/未读），不整页重建。 */
function updateDesktopConversationListRow(conversation) {
  const index = conversations.findIndex((item) => String(item.id) === String(conversation.id))
  const element = document.querySelector(`[data-conversation="${index}"]`)
  if (!(element instanceof HTMLElement)) return
  const copy = element.querySelector('.conversation-copy')
  if (!copy) return
  if (conversation.fileTransferAssistant) conversation.tag = ''
  const nameLine = copy.querySelector('.conversation-line')
  const title = nameLine?.querySelector('strong')
  const existingName = title?.querySelector('.conversation-name-text')?.textContent?.trim() || ''
  const existingTag = title?.querySelector('.conversation-item-tag')?.textContent?.trim() || ''
  const nextTag = conversation.tag || ''
  const hasPin = Boolean(title?.querySelector('.conversation-pin'))
  const needsTitleUpdate = !title
    || existingName !== String(conversation.name || '').trim()
    || existingTag !== String(nextTag).trim()
    || hasPin !== Boolean(conversation.pinned)
  // Update only the changing fields. Replacing the whole .conversation-copy
  // recreates the marquee node and makes a long group name jump back to zero
  // whenever a new message changes its preview or unread count.
  if (needsTitleUpdate && title) {
    title.innerHTML = `${conversation.pinned ? `<span class="conversation-pin" title="已置顶">${icon('bookmark')}</span>` : ''}${renderDesktopConversationName(conversation.name)}${renderDesktopConversationTag(nextTag, conversation.peerUserId || conversation.name)}`
    updateDesktopConversationNameOverflow()
  }
  const time = nameLine?.querySelector('time')
  if (time) time.textContent = String(conversation.time || '')
  const previewLine = copy.querySelector('.conversation-preview')
  const preview = previewLine?.firstElementChild
  if (preview) preview.textContent = String(conversation.preview || '')
  previewLine?.querySelector('.mention-unread-badge')?.remove()
  previewLine?.querySelector('.unread-badge')?.remove()
  if (conversation.mentionUnread) previewLine?.insertAdjacentHTML('beforeend', '<i class="mention-unread-badge">@</i>')
  if (Number(conversation.unread || 0) > 0) previewLine?.insertAdjacentHTML('beforeend', `<i class="unread-badge">${Number(conversation.unread)}</i>`)
}

function syncRemoteMessage(payload) {
  const normalized = normalizeDesktopPushPayload(payload)
  const command = String(normalized.cmd || normalized.type || normalized.event || '').toUpperCase()
  const forcedLogoutCommands = new Set(['KICK', 'DEVICE_REVOKED', 'SESSION_REVOKED', 'FORCE_LOGOUT', 'TOKEN_REVOKED', 'AUTH_REVOKED'])
  if ((command === 'AUTH_ACK' && normalized.success === false) || forcedLogoutCommands.has(command)) {
    const message = command === 'KICK'
      ? '账号已在其他设备登录，桌面端已退出当前会话'
      : '该电脑已被移动端退出登录'
    forceDesktopRemoteLogout(message)
    return
  }
  if (command === 'BURN_STARTED') {
    const conversationId = String(normalized.conversationId || '')
    const messageId = String(normalized.msgId || normalized.id || '')
    const messages = state.messagesByConversation[conversationId] || []
    const index = messages.findIndex((message) => String(message.id) === messageId)
    if (index >= 0) {
      state.messagesByConversation[conversationId] = messages.map((message, itemIndex) => itemIndex === index
        ? { ...message, burnReadAt: message.burnReadAt || new Date().toISOString(), burnExpiresAt: normalized.burnExpiresAt || message.burnExpiresAt }
        : message)
      requestDesktopRender()
    }
    return
  }
  if (command === 'BURN_EXPIRED') {
    const conversationId = String(normalized.conversationId || '')
    const messageId = String(normalized.msgId || normalized.id || '')
    if (conversationId && messageId) {
      const messages = state.messagesByConversation[conversationId] || []
      const expired = messages.find((message) => String(message.id) === messageId)
      state.messagesByConversation[conversationId] = messages.filter((message) => String(message.id) !== messageId)
      refreshDesktopConversationPreview(conversationId, expired)
      if (desktopIsBurnMessage(expired)) {
        const conversation = conversations.find((item) => String(item.id) === conversationId)
        if (conversation) conversation.lastMsgTimeMs = Math.max(
          conversation.lastMsgTimeMs || 0, desktopMessageTimeMs(expired))
      }
      if (String(conversations[state.selectedConversation]?.id) === conversationId) requestDesktopRender()
    }
    return
  }
  if (command === 'RECALL_MSG') {
    const conversationId = String(normalized.conversationId || '')
    const messageId = String(normalized.msgId || normalized.id || '')
    if (conversationId && messageId) {
      const messages = state.messagesByConversation[conversationId] || []
      state.messagesByConversation[conversationId] = messages.map((message) => (
        message.id === messageId ? { ...message, recalled: true, content: '' } : message
      ))
      refreshDesktopConversationPreview(conversationId)
      if (String(conversations[state.selectedConversation]?.id) === conversationId) requestDesktopRender()
    }
    return
  }
  if (['READ_RECEIPT', 'READ_RECEIPT_PUSH', 'MESSAGE_READ', 'MESSAGE_READ_RECEIPT'].includes(command)) {
    applyReadReceipt(normalized)
    return
  }
  if (command === 'FRIEND_REQUEST') {
    const action = String(normalized.action || '')
    if (typeof normalized.pendingCount === 'number') {
      state.friendPendingCount = normalized.pendingCount
      state.notificationCount = normalized.pendingCount
    } else if (action === 'request') {
      state.friendPendingCount += 1
      state.notificationCount += 1
    }
    if (action === 'request') showToast(`${payload.fromNickname || payload.nickname || '有人'} 请求添加你为好友`)
    else if (action === 'accepted') showToast(`${payload.fromNickname || payload.nickname || '对方'} 已同意你的好友申请`)
    else if (action === 'rejected') showToast('好友申请已被拒绝')
    void refreshNotificationSummary()
    return
  }
  if (command === 'PRESENCE') {
    const userId = String(normalized.userId || '')
    if (!userId) return
    const online = Boolean(normalized.online) && !Boolean(normalized.onlineHidden)
    const hidden = Boolean(normalized.onlineHidden)
    const contact = contacts.find((item) => String(contactUserId(item)) === userId)
    const prevOnline = contact?.online
    const prevHidden = contact?.onlineHidden
    if (contact) {
      contact.online = online
      contact.onlineHidden = hidden
      contact.status = online ? '在线' : '最近活跃'
    }
    conversations.forEach((conversation) => {
      if (conversation.type === 'personal' && String(conversation.peerUserId || '') === userId) {
        conversation.online = online
      }
    })
    if (prevOnline !== online || prevHidden !== hidden) updateDesktopPresenceDom(userId, online, hidden)
    return
  }
  const conversationId = String(normalized.conversationId || '')
  if (!conversationId) return
  const conversation = conversations.find((item) => String(item.id) === conversationId)
  if (!conversation) {
    void loadRemoteData()
    return
  }
  const messageId = String(normalized.id || normalized.msgId || normalized.clientMsgId || '')
  if (!messageId) return
  const mapped = mapRemoteMessage({
    ...normalized,
    id: messageId,
    createdAt: normalized.createdAt || (normalized.sendTime ? new Date(Number(normalized.sendTime)).toISOString() : undefined),
    fromUserId: normalized.fromUserId || '',
    content: normalized.content || '',
    burnAfterRead: normalized.burnAfterRead,
    burnSeconds: normalized.burnSeconds,
    burnReadAt: normalized.burnReadAt,
    burnExpiresAt: normalized.burnExpiresAt,
    autoDeleteExpiresAt: normalized.autoDeleteExpiresAt,
  })
  updateDesktopIncomingAvatar(conversation, mapped)
  const activeConversation = conversations[state.selectedConversation]
  const isActiveChat = String(activeConversation?.id || '') === conversationId && state.page === 'messages'
  const activeStream = isActiveChat
    ? [...document.querySelectorAll('.chat-stream')]
      .find((item) => String(item.dataset.conversationId || '') === conversationId)
    : null
  const wasVisible = activeStream
    ? [...activeStream.querySelectorAll('[data-message-id]')]
      .some((item) => String(item.dataset.messageId || '') === messageId)
    : false
  const existingMessage = (state.messagesByConversation[conversationId] || []).find((item) => (
    (messageId && String(item.id || '') === messageId)
      || (mapped.clientMsgId && String(item.clientMsgId || '') === mapped.clientMsgId)
  ))
  const merged = mergeMessage(conversationId, mapped)
  const mergedMessage = (state.messagesByConversation[conversationId] || []).find((item) => (
    (messageId && String(item.id || '') === messageId)
      || (mapped.clientMsgId && String(item.clientMsgId || '') === mapped.clientMsgId)
  ))
  const visibleMessageChanged = Boolean(
    wasVisible
      && existingMessage
      && mergedMessage
      && desktopMessageVisualSignature(existingMessage) !== desktopMessageVisualSignature(mergedMessage),
  )
  if (mapped.mentionedMe && !mapped.mine && conversation.type === 'group') {
    if (isActiveChat) addDesktopMentionJump(mapped)
    else conversation.mentionUnread = true
  }
  if (merged) {
    // The same message can arrive after a history request has already put it
    // in memory. Keep the live preview fresh and repair the DOM when that
    // request finished before the push handler ran.
    conversation.preview = formatDesktopConversationPreview(desktopMessagePreview(mapped), mapped.mine) || conversation.preview
    conversation.time = mapped.time || '刚刚'
    if (isActiveChat && !document.hidden && !wasVisible && appendDesktopIncomingMessage(conversation, mapped)) {
      updateDesktopConversationListRow(conversation)
      return
    }
    updateDesktopConversationListRow(conversation)
    if (isActiveChat && visibleMessageChanged) refreshDesktopHydratedMessageDom(conversationId, messageId)
    if (isActiveChat && mapped.mentionedMe) requestDesktopRender()
    return
  }
  const unread = !mapped.mine && (
    !isActiveChat || document.hidden || !document.hasFocus() || !isDesktopChatAtLatest(conversationId)
  )
  if (unread) {
    notifyDesktopMessage(conversation, mapped)
    conversation.unread = Number(conversation.unread || 0) + 1
    noteDesktopIncomingUnread(conversationId)
  } else if (!mapped.mine) {
    noteDesktopConversationRead(conversationId)
    conversation.unread = 0
    queueDesktopConversationRead(conversationId)
  }
  syncDesktopLatestJumpDom(conversationId)
  // 增量更新会话列表时不会走 render()，侧边栏导航和系统任务栏角标都要立即同步。
  updateDesktopConversationFilterBadges()
  syncDesktopShellBadge()
  conversation.preview = formatDesktopConversationPreview(desktopMessagePreview(mapped), mapped.mine) || conversation.preview
  conversation.time = '刚刚'
  // 正在查看该会话时增量插入消息行；否则只更新侧边栏项，均避免整页重绘闪烁。
  if (isActiveChat && !document.hidden && appendDesktopIncomingMessage(conversation, mapped)) {
    updateDesktopConversationListRow(conversation)
    return
  }
  if (!isActiveChat) {
    updateDesktopConversationListRow(conversation)
    return
  }
  requestDesktopRender()
}

function stopDesktopDeviceSessionMonitor() {
  if (desktopDeviceSessionTimer !== null) window.clearInterval(desktopDeviceSessionTimer)
  desktopDeviceSessionTimer = null
}

function forceDesktopRemoteLogout(message = '该电脑已被移动端退出登录') {
  if (!getDesktopToken() && !state.authenticated) return
  stopDesktopDeviceSessionMonitor()
  stopDesktopWsConnection()
  clearDesktopSession()
  desktopUnreadSyncByConversation.clear()
  state.authenticated = false
  state.dataSource = 'error'
  state.loading = false
  state.loginError = ''
  resetDesktopSocialState()
  render()
  showToast(message)
}

async function checkDesktopDeviceSession() {
  if (desktopDeviceSessionCheckBusy || !state.authenticated || state.dataSource !== 'remote' || !getDesktopToken()) return
  desktopDeviceSessionCheckBusy = true
  try {
    const result = await fetchDesktopDeviceSessions()
    if (!getDesktopToken()) {
      forceDesktopRemoteLogout()
      return
    }
    const deviceId = getDesktopDeviceId()
    const currentDeviceStillActive = Array.isArray(result?.list)
      && result.list.some((device) => String(device.deviceId || '') === String(deviceId))
    if (!currentDeviceStillActive) forceDesktopRemoteLogout()
  } catch {
    // A revoked device receives 401; desktopApi clears the stale token after refresh fails.
    // Transient network errors keep the current session and let the next check retry.
    if (!getDesktopToken()) forceDesktopRemoteLogout()
  } finally {
    desktopDeviceSessionCheckBusy = false
  }
}

function startDesktopDeviceSessionMonitor() {
  stopDesktopDeviceSessionMonitor()
  if (!getDesktopToken() || !state.authenticated || state.dataSource !== 'remote') return
  void checkDesktopDeviceSession()
  desktopDeviceSessionTimer = window.setInterval(() => {
    void checkDesktopDeviceSession()
  }, DESKTOP_DEVICE_SESSION_POLL_MS)
}

function startDesktopWs() {
  const token = getDesktopToken()
  if (!token) return
  if (desktopWsToken === token) return
  stopDesktopWs?.()
  stopDesktopWs = onDesktopWsMessage(syncRemoteMessage)
  desktopWsToken = token
  connectDesktopWs(token)
  if (notificationPollTimer !== null) window.clearInterval(notificationPollTimer)
  notificationPollTimer = window.setInterval(() => {
    if (!document.hidden) void refreshNotificationSummary()
  }, 15_000)
  startDesktopMomentInteractionPolling()
  startDesktopMomentPolling()
  startDesktopRealtimeFallback()
  startDesktopMessageCatchup()
}

function stopDesktopMessageCatchup() {
  if (desktopMessageCatchupTimer !== null) window.clearInterval(desktopMessageCatchupTimer)
  desktopMessageCatchupTimer = null
  desktopMessageCatchupBusy = false
}

function desktopMessageCatchupCursor(messages) {
  const latest = (messages || []).reduce((current, message) => (
    desktopMessageTimeMs(message) > desktopMessageTimeMs(current) ? message : current
  ), null)
  const latestMs = desktopMessageTimeMs(latest)
  // Keep a small overlap because several messages can share the same
  // millisecond. syncRemoteMessage/mergeMessage removes the overlap safely.
  return latestMs > 2_000 ? new Date(latestMs - 1_000).toISOString() : ''
}

/**
 * HTTP catch-up is intentionally kept even while WebSocket reports OPEN.
 * A proxy can leave a socket open while dropping an individual push frame;
 * this closes the gap without requiring the user to refresh the desktop.
 */
async function pollDesktopMessageCatchup() {
  if (
    desktopMessageCatchupBusy ||
    !state.authenticated ||
    state.dataSource !== 'remote' ||
    !getDesktopToken()
  ) return
  const selected = conversations[state.selectedConversation]
  if (!selected?.id) return
  desktopMessageCatchupBusy = true
  try {
    const conversationId = String(selected.id)
    const localMessages = state.messagesByConversation[conversationId] || []
    const after = desktopMessageCatchupCursor(localMessages)
    const remoteMessages = await fetchDesktopMessages(conversationId, 200, after ? { after } : {})
    const knownIds = new Set(localMessages.map((message) => String(message.id || '')).filter(Boolean))
    const knownClientIds = new Set(localMessages.map((message) => String(message.clientMsgId || '')).filter(Boolean))
    remoteMessages.forEach((remoteMessage) => {
      const id = String(remoteMessage.id ?? remoteMessage.msgId ?? '')
      const clientMsgId = String(remoteMessage.clientMsgId || '')
      if ((id && knownIds.has(id)) || (clientMsgId && knownClientIds.has(clientMsgId))) return
      if (id) knownIds.add(id)
      if (clientMsgId) knownClientIds.add(clientMsgId)
      syncRemoteMessage({ ...remoteMessage, cmd: 'PUSH_MSG', type: 'message' })
    })
  } catch {
    // WebSocket and the next catch-up round remain available on transient errors.
  } finally {
    desktopMessageCatchupBusy = false
  }
}

function startDesktopMessageCatchup() {
  stopDesktopMessageCatchup()
  if (!getDesktopToken()) return
  void pollDesktopMessageCatchup()
  desktopMessageCatchupTimer = window.setInterval(() => {
    void pollDesktopMessageCatchup()
  }, DESKTOP_MESSAGE_CATCHUP_POLL_MS)
}

function stopDesktopRealtimeFallback() {
  if (realtimeFallbackTimer !== null) window.clearInterval(realtimeFallbackTimer)
  realtimeFallbackTimer = null
  realtimeFallbackBusy = false
}

/**
 * WebSocket 是实时首选，但不能成为消息可靠性的唯一来源。
 * 连接断开、系统休眠或代理丢帧时，用已落库的 HTTP 数据在几秒内补齐。
 */
async function pollDesktopRealtimeFallback() {
  if (
    realtimeFallbackBusy ||
    !state.authenticated ||
    state.dataSource !== 'remote' ||
    !getDesktopToken()
  ) return

  realtimeFallbackBusy = true
  try {
    const wsReady = isDesktopWsReady()
    const selectedBefore = String(conversations[state.selectedConversation]?.id || '')
    const [remoteConversations, remoteContacts] = await Promise.all([
      fetchDesktopConversations('all'),
      fetchDesktopContacts(),
    ])
    const mappedContacts = remoteContacts?.list
      ? remoteContacts.list.filter((item) => !isDesktopFileTransferAssistant(item)).map(mapRemoteContact)
      : contacts
    let mappedConversations = applyDesktopContactAvatars(
      remoteConversations.map(mapRemoteConversation),
      mappedContacts,
    )

    // Do not let a request that started while the socket was down overwrite
    // newer WebSocket state after the connection has recovered.
    if (!wsReady && isDesktopWsReady()) return

    mappedConversations = mappedConversations.map((mapped) => {
      const current = conversations.find((item) => String(item.id) === String(mapped.id))
      return reconcileDesktopUnreadSnapshot(mapped, current, wsReady)
    })

    // Rebuilding the list arrays alone is cheap; the expensive part is the
    // full render(). Keep the previous objects and only render when the data
    // actually changed so protected images are not re-bound every 5 seconds.
    const conversationsChanged = desktopConversationSignature(mappedConversations) !== desktopConversationSignature(conversations)
    const contactsChanged = desktopContactSignature(mappedContacts) !== desktopContactSignature(contacts)
    mappedContacts.forEach((mapped) => {
      const current = contacts.find((item) => String(contactUserId(item)) === String(contactUserId(mapped)))
      if (!current || (current.online === mapped.online && current.onlineHidden === mapped.onlineHidden)) return
      current.online = mapped.online
      current.status = mapped.online ? '在线' : '最近活跃'
      current.onlineHidden = Boolean(mapped.onlineHidden)
      updateDesktopPresenceDom(contactUserId(mapped), Boolean(mapped.online), Boolean(mapped.onlineHidden))
    })
    mappedConversations.forEach((mapped) => {
      const current = conversations.find((item) => String(item.id) === String(mapped.id))
      if (!current || (current.online === mapped.online && current.onlineHidden === mapped.onlineHidden)) return
      current.online = mapped.online
      current.onlineHidden = Boolean(mapped.onlineHidden)
      updateDesktopPresenceDom(mapped.peerUserId, Boolean(mapped.online), Boolean(mapped.onlineHidden))
    })
    if (conversationsChanged) {
      conversations = mappedConversations
      const selectedIndex = conversations.findIndex((item) => String(item.id) === selectedBefore)
      state.selectedConversation = selectedIndex >= 0
        ? selectedIndex
        : Math.max(0, Math.min(state.selectedConversation, conversations.length - 1))
      conversations.forEach((conversation) => {
        if (Object.prototype.hasOwnProperty.call(state.messagesByConversation, String(conversation.id))) {
          refreshDesktopConversationPreview(conversation.id)
        }
      })
    }
    if (contactsChanged) contacts = mappedContacts

    let messagesChanged = false
    const selected = conversations[state.selectedConversation]
    if (selected?.id) {
      startDesktopReadStatePolling(selected.id)
      // A healthy WebSocket already pushes messages in real time; only the
      // HTTP catch-up (while the socket is down) needs to refetch them.
      if (!wsReady) {
        const remoteMessages = await fetchDesktopMessages(selected.id, 200)
        const mappedMessages = remoteMessages.map(mapRemoteMessage)
        messagesChanged = desktopMessagesSignature(mappedMessages) !== desktopMessagesSignature(state.messagesByConversation[selected.id] || [])
      if (messagesChanged) {
        state.messagesByConversation[selected.id] = mappedMessages
        scheduleDesktopFileMetadataHydrationForMessages(selected.id, mappedMessages)
        refreshDesktopConversationPreview(selected.id)
      }
      }
    }
    const shouldRefreshVisiblePage = state.page === 'messages' || state.page === 'contacts' || state.page === 'groups'
    if (shouldRefreshVisiblePage && (conversationsChanged || contactsChanged || messagesChanged)) requestDesktopRender()
  } catch {
    // 下一轮继续尝试；实时连接恢复后仍由 WebSocket 负责低延迟推送。
  } finally {
    realtimeFallbackBusy = false
  }
}

function startDesktopRealtimeFallback() {
  stopDesktopRealtimeFallback()
  if (!getDesktopToken()) return
  void pollDesktopRealtimeFallback()
  realtimeFallbackTimer = window.setInterval(() => {
    // 会话列表是未读数和任务栏角标的最终兜底。即使 WS 仍显示 OPEN，
    // 代理也可能只丢掉某一条私聊推送，因此仍需定期对账。
    void pollDesktopRealtimeFallback()
  }, DESKTOP_REALTIME_FALLBACK_POLL_MS)
}

function stopDesktopQrLogin() {
  desktopQrFlowId += 1
  if (desktopQrPollTimer !== null) window.clearInterval(desktopQrPollTimer)
  if (desktopQrExpiryTimer !== null) window.clearInterval(desktopQrExpiryTimer)
  desktopQrPollTimer = null
  desktopQrExpiryTimer = null
}

function qrLoginRemainingSeconds() {
  if (!state.qrLoginExpiresAt) return 0
  const expires = new Date(state.qrLoginExpiresAt).getTime()
  if (!Number.isFinite(expires)) return 0
  return Math.max(0, Math.ceil((expires - Date.now()) / 1000))
}

function waitForDesktopQrRefresh(flowId, startedAt) {
  const remaining = Math.max(0, DESKTOP_QR_REFRESH_ANIMATION_MS - (Date.now() - startedAt))
  if (!remaining) return Promise.resolve(flowId === desktopQrFlowId)
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(flowId === desktopQrFlowId), remaining)
  })
}

async function pollDesktopQrLoginStatus(flowId, ticket) {
  if (flowId !== desktopQrFlowId || !ticket || state.authenticated) return
  try {
    const result = await pollDesktopQrLogin(ticket)
    if (flowId !== desktopQrFlowId) return
    if (result.status === 'EXPIRED') {
      stopDesktopQrLogin()
      state.qrLoginStatus = 'expired'
      state.qrLoginError = '二维码已失效，请手动刷新'
      render()
      return
    }
    if (result.status !== 'CONFIRMED' || !result.login?.token) return
    stopDesktopQrLogin()
    saveDesktopSession(result.login.token, {
      userId: String(result.login.userId),
      pulseId: result.login.pulseId,
      nickname: result.login.nickname,
      avatarUrl: result.login.avatarUrl,
      phone: result.login.phone,
    }, true)
    state.qrLoginStatus = 'confirmed'
    state.authenticated = true
    state.profile = {
      ...state.profile,
      ...result.login,
      userId: String(result.login.userId),
      avatarUrl: result.login.avatarUrl,
    }
    await loadRemoteData()
  } catch (error) {
    if (flowId !== desktopQrFlowId) return
    state.qrLoginStatus = 'error'
    state.qrLoginError = error instanceof Error ? error.message : '二维码登录状态获取失败'
    stopDesktopQrLogin()
  } finally {
    if (flowId === desktopQrFlowId) render()
  }
}

async function beginDesktopQrLogin() {
  if (!state.clientAccess.qrLoginEnabled) {
    state.loginMode = state.clientAccess.phoneLoginEnabled ? 'password' : 'qr'
    state.loginError = '电脑端扫码登录已关闭'
    render()
    return
  }
  stopDesktopQrLogin()
  const flowId = desktopQrFlowId
  const refreshStartedAt = Date.now()
  state.loginMode = 'qr'
  state.qrLoginBusy = true
  state.qrLoginTicket = ''
  state.qrLoginImage = ''
  state.qrLoginExpiresAt = ''
  state.qrLoginStatus = 'loading'
  state.qrLoginError = ''
  render()
  try {
    const result = await startDesktopQrLogin()
    if (flowId !== desktopQrFlowId) return
    state.qrLoginTicket = result.ticket
    state.qrLoginExpiresAt = result.expiresAt
    state.qrLoginStatus = 'waiting'
    state.qrLoginImage = await QRCode.toDataURL(result.payload, {
      width: 236,
      margin: 2,
      color: { dark: '#163b64', light: '#ffffff' },
    })
    desktopQrImageRevision += 1
    if (!await waitForDesktopQrRefresh(flowId, refreshStartedAt)) return
    state.qrLoginBusy = false
    render()
    desktopQrPollTimer = window.setInterval(() => {
      void pollDesktopQrLoginStatus(flowId, result.ticket)
    }, 1500)
    desktopQrExpiryTimer = window.setInterval(() => {
      if (flowId !== desktopQrFlowId) return
      if (qrLoginRemainingSeconds() <= 0) {
        stopDesktopQrLogin()
        state.qrLoginStatus = 'expired'
        state.qrLoginError = '二维码已失效，请手动刷新'
      }
      render()
    }, 1000)
  } catch (error) {
    if (flowId !== desktopQrFlowId) return
    if (!await waitForDesktopQrRefresh(flowId, refreshStartedAt)) return
    state.qrLoginBusy = false
    state.qrLoginStatus = 'error'
    state.qrLoginError = error instanceof Error ? error.message : '二维码生成失败，请重试'
    render()
  }
}

function stopDesktopWsConnection() {
  stopDesktopRealtimeFallback()
  stopDesktopMessageCatchup()
  stopDesktopMomentInteractionPolling()
  stopDesktopMomentPolling()
  stopDesktopReadStatePolling()
  stopDesktopDeviceSessionMonitor()
  desktopCall.hangup()
  stopDesktopWs?.()
  stopDesktopWs = null
  desktopWsToken = ''
  disconnectDesktopWs()
  if (notificationPollTimer !== null) window.clearInterval(notificationPollTimer)
  notificationPollTimer = null
  desktopNotificationSummaryBusy = false
}

function switchDesktopAccount() {
  stopDesktopWsConnection()
  stopDesktopQrLogin()
  writeLockScreenLocked(desktopLockScreenUserId(), false)
  state.lockScreenLocked = false
  state.lockScreenError = ''
  state.loginView = 'login'
  state.loginMode = 'password'
  state.loginSecurityCodeRequired = false
  state.loginSecurityCode = ''
  state.loginError = ''
  state.loginNotice = ''
  void logoutDesktop().finally(() => {
    state.authenticated = false
    state.dataSource = 'error'
    resetDesktopSocialState()
    state.loading = false
    render()
    startDesktopQrLoginIfRequired()
  })
}

function requestSwitchDesktopAccount() {
  state.confirmDialog = { type: 'switch-account' }
  state.modal = 'confirm'
  render()
}

function requestLogoutDesktop() {
  state.confirmDialog = { type: 'logout' }
  state.modal = 'confirm'
  render()
}

function performDesktopLogout() {
  stopDesktopWsConnection()
  writeLockScreenLocked(desktopLockScreenUserId(), false)
  state.lockScreenLocked = false
  state.lockScreenError = ''
  void logoutDesktop().finally(() => {
    desktopNavigationHistory = []
    desktopCurrentNavigation = null
    state.authenticated = false
    state.dataSource = 'error'
    resetDesktopSocialState()
    state.loginView = 'login'
    state.loginMode = 'password'
    state.loginError = ''
    render()
    startDesktopQrLoginIfRequired()
  })
}

function dataSourceLabel() {
  if (state.dataSource === 'remote') return '已连接真实数据'
  if (state.dataSource === 'loading') return '正在同步在线数据'
  if (state.dataSource === 'error') return '在线数据加载失败'
  return '未连接在线数据'
}

function navItem(key, label, iconName, badge = '') {
  return `<button class="nav-item ${state.page === key ? 'active' : ''}" data-page="${key}">
    <span class="nav-icon">${icon(iconName)}</span><span class="nav-text">${label}</span>${badge ? `<span class="nav-badge">${badge}</span>` : ''}
  </button>`
}

function desktopNavigationSnapshot() {
  return {
    page: String(state.page || 'messages'),
    settingsSection: state.page === 'settings' ? String(state.settingsSection || 'profile') : '',
  }
}

function desktopNavigationKey(snapshot) {
  return `${snapshot.page}:${snapshot.settingsSection}`
}

function syncDesktopNavigationHistory() {
  const nextNavigation = desktopNavigationSnapshot()
  if (!restoringDesktopNavigation && desktopCurrentNavigation && desktopNavigationKey(desktopCurrentNavigation) !== desktopNavigationKey(nextNavigation)) {
    desktopNavigationHistory.push(desktopCurrentNavigation)
  }
  desktopCurrentNavigation = nextNavigation
}

function loadDesktopPageData(page) {
  if (page === 'favorites') void loadFavorites()
  if (page === 'wallet' && isDesktopWalletEnabled()) void loadWallet()
  if (page === 'moments') {
    void loadMoments()
    void refreshNotificationSummary()
  }
  if (page === 'files' && state.dataSource === 'remote') void loadDesktopFiles()
  if (page === 'settings') {
    if (state.settingsSection === 'friend-permission') void loadPrivacySettings()
    else if (state.settingsSection === 'account-security') void loadDesktopAccountSecurity(true)
    else if (state.settingsSection === 'storage') void loadDesktopStorage()
    else if (state.settingsSection === 'help') void loadDesktopHelp()
    else void loadDesktopDevices()
  }
}

function navigateDesktopBack() {
  const previousNavigation = desktopNavigationHistory.pop()
  if (!previousNavigation) return
  restoringDesktopNavigation = true
  state.page = previousNavigation.page
  if (state.page === 'settings') state.settingsSection = previousNavigation.settingsSection || 'profile'
  state.profileMenuOpen = false
  state.messageMenu = null
  state.fileMenu = null
  state.sharedContentMenu = null
  state.momentMenu = null
  render()
  restoringDesktopNavigation = false
  loadDesktopPageData(state.page)
}

function render(force = false) {
  if (desktopModuleDisposed) return
  // 文件预览中的媒体节点（尤其是 PDF iframe 和视频）不能随着后台
  // 消息/会话轮询反复重建，否则会出现持续闪烁、重新加载和播放中断。
  // 打开新文件、加载完成/失败时由调用方使用 render(true) 更新一次。
  if (!force && state.modal === 'file-preview' && document.querySelector('.desktop-file-preview-modal')) return
  // The location modal owns a live Baidu map instance. Replacing its DOM while
  // background polling is running destroys the map and immediately creates it
  // again, which looks like continuous redraw and also disables the location
  // action while the new instance is loading. Location-specific handlers close
  // the modal before calling render, so it is safe to defer unrelated renders.
  if (!force && state.modal === 'location' && document.querySelector('#desktop-location-map')) return
  const roots = ensureDesktopRenderRoots()
  if (!roots) return
  bindDesktopCallActions()
  const composerHadFocus = document.activeElement instanceof HTMLElement
    && document.activeElement.matches?.('[data-message-composer]')
  const composerHadSelection = composerHadFocus
    ? document.activeElement.selectionStart ?? null
    : null
  const previousChatStream = document.querySelector('.chat-stream')
  const previousWorkspaceBody = document.querySelector('.workspace-body')
  const previousWorkspaceScrollTop = previousWorkspaceBody instanceof HTMLElement ? previousWorkspaceBody.scrollTop : 0
  const activeControl = document.activeElement instanceof HTMLInputElement
    || document.activeElement instanceof HTMLTextAreaElement
    || document.activeElement instanceof HTMLSelectElement
    ? document.activeElement
    : null
  const activeControlSelector = activeControl
    ? activeControl.id
      ? `#${CSS.escape(activeControl.id)}`
      : activeControl.matches('[data-message-composer]')
        ? '[data-message-composer]'
        : activeControl.matches('[data-help-query]')
          ? '[data-help-query]'
          : activeControl.matches('[data-wallet-type]')
            ? '[data-wallet-type]'
            : activeControl.matches('[data-wallet-from]')
              ? '[data-wallet-from]'
              : activeControl.matches('[data-wallet-to]')
                ? '[data-wallet-to]'
                : activeControl.matches('[data-file-sort]')
                  ? '[data-file-sort]'
                  : activeControl.matches('[data-moment-content]')
                    ? '[data-moment-content]'
                    : activeControl.name
                      ? `[name="${CSS.escape(activeControl.name)}"]`
                      : ''
    : ''
  const activeControlValue = activeControl && activeControl.type !== 'file' ? activeControl.value : null
  const activeControlSelectionStart = activeControl && 'selectionStart' in activeControl ? activeControl.selectionStart : null
  const activeControlSelectionEnd = activeControl && 'selectionEnd' in activeControl ? activeControl.selectionEnd : null
  const previousChatScrollTop = previousChatStream?.scrollTop ?? 0
  const previousChatConversationId = previousChatStream?.dataset.conversationId || ''
  const previousChatWasAtLatest = previousChatStream instanceof HTMLElement
    ? isDesktopChatStreamAtLatest(previousChatStream)
    : Boolean(state.chatAtLatestByConversation[String(previousChatConversationId || '')])
  if (previousChatConversationId) state.chatScrollTopByConversation[previousChatConversationId] = previousChatScrollTop
  const previousGroupInfoModal = state.modal === 'group-info'
    ? document.querySelector('.desktop-group-info-modal')
    : null
  if (previousGroupInfoModal instanceof HTMLElement) {
    state.groupInfoScrollTop = previousGroupInfoModal.scrollTop
  }
  const previousContactProfileModal = document.querySelector('.desktop-contact-profile-modal')
  if (previousContactProfileModal instanceof HTMLElement) {
    state.contactProfileScrollTop = previousContactProfileModal.scrollTop
  }
  document.documentElement.dataset.theme = 'light'
  syncDesktopNativeTheme('light')
  if (!state.authenticated) {
    const loginChanged = writeDesktopRegion(roots.loginRoot, renderLogin(), 'login')
    const sidebarChanged = writeDesktopRegion(roots.sidebarRoot, '', 'sidebar')
    const topbarChanged = writeDesktopRegion(roots.topbarRoot, '', 'topbar')
    const bodyChanged = writeDesktopRegion(roots.bodyRoot, '', 'body')
    setDesktopRegionVisibility(roots.loginRoot, true)
    setDesktopRegionVisibility(roots.shellRoot, false)
    const modalChanged = writeDesktopRegion(roots.modalRoot, '', 'modal')
    const overlayChanged = writeDesktopRegion(roots.overlayRoot, '', 'overlay')
    roots.modalHeaderRoot = null
    roots.modalBodyRoot = null
    writeDesktopRegion(roots.toastRoot, '', 'toast')
    roots.callRoot.replaceChildren()
    if (loginChanged || sidebarChanged || topbarChanged || bodyChanged || modalChanged || overlayChanged) {
      bindDesktopEventsWithoutRebindingStableRegions(roots, {
        loginChanged,
        sidebarChanged,
        topbarChanged,
        bodyChanged,
        modalChanged,
        overlayChanged,
      })
    }
    syncDesktopShellBadge()
    return
  }
  syncDesktopNavigationHistory()
  const sidebarMarkup = renderSidebar()
  roots.sidebarRoot.className = `sidebar${state.sidebarCollapsed ? ' is-collapsed' : ''}`
  roots.topbarRoot.className = 'topbar'
  roots.bodyRoot.className = `workspace-body${state.page === 'files' ? ' is-files-page' : ''}`
  const topbarMarkup = renderTopbar()
  const isMessagesPage = state.page === 'messages'
  const renderedPageMarkup = isMessagesPage ? '' : renderPage()
  const pageParts = isMessagesPage ? null : splitDesktopPageMarkup(renderedPageMarkup)
  const bodyMarkup = isMessagesPage
    ? `<section class="page page-messages" data-desktop-message-page>
        <div class="desktop-message-region" data-desktop-message-heading></div>
        <div class="message-workspace" data-desktop-message-workspace>
          <div class="desktop-message-region" data-desktop-message-conversation></div>
          <div class="desktop-message-region" data-desktop-message-chat></div>
          <div class="desktop-message-region" data-desktop-message-context></div>
        </div>
      </section>`
    : pageParts?.frameMarkup || renderedPageMarkup
  setDesktopRegionVisibility(roots.loginRoot, false)
  setDesktopRegionVisibility(roots.shellRoot, true)
  const modalParts = splitDesktopModalMarkup(state.modal ? renderModal() : '')
  const overlayMarkup = `
    ${state.page === 'messages' && state.messageMenu ? renderMessageMenu(desktopSelectedConversation()) : ''}
    ${state.momentMenu ? renderMomentMenu() : ''}
    ${state.momentMediaMenu ? renderDesktopMediaContextMenu() : ''}
    ${state.sharedContentMenu ? renderDesktopSharedContentMenu() : ''}
    ${state.mediaPreview ? renderDesktopMediaPreview() : ''}
    ${state.receiveSuccessVisible ? renderDesktopReceiveSuccess() : ''}
    ${state.lockScreenLocked ? renderDesktopLockScreen() : ''}`
  const loginChanged = writeDesktopRegion(roots.loginRoot, '', 'login')
  const sidebarChanged = writeDesktopRegion(roots.sidebarRoot, sidebarMarkup, 'sidebar')
  const topbarChanged = writeDesktopRegion(roots.topbarRoot, topbarMarkup, 'topbar')
  const bodyChanged = writeDesktopRegion(roots.bodyRoot, bodyMarkup, 'body')
  let messageHeadingChanged = false
  let messageConversationChanged = false
  let messageChatChanged = false
  let messageContextChanged = false
  let pageHeadingChanged = false
  let pageContentChanged = false
  roots.pageHeadingRoot = null
  roots.pageContentRoot = null
  roots.messageHeadingRoot = null
  roots.messageConversationRoot = null
  roots.messageChatRoot = null
  roots.messageContextRoot = null
  if (isMessagesPage) {
    const messageRegions = getDesktopMessageRegionRoots(roots.bodyRoot)
    if (messageRegions) {
      roots.messageHeadingRoot = messageRegions.headingRoot
      roots.messageConversationRoot = messageRegions.conversationRoot
      roots.messageChatRoot = messageRegions.chatRoot
      roots.messageContextRoot = messageRegions.contextRoot
      const selected = desktopSelectedConversation()
      messageRegions.workspaceRoot.className = `message-workspace${selected.fileTransferAssistant ? ' is-file-transfer-assistant' : ''}`
      messageHeadingChanged = writeDesktopRegion(messageRegions.headingRoot, renderMessagesHeading(), 'messageHeading')
      messageConversationChanged = writeDesktopRegion(messageRegions.conversationRoot, renderConversationPanel(), 'messageConversation')
      messageChatChanged = writeDesktopRegion(messageRegions.chatRoot, renderChatPanel(selected), 'messageChat')
      messageContextChanged = writeDesktopRegion(
        messageRegions.contextRoot,
        selected.fileTransferAssistant ? '' : renderContextPanel(selected),
        'messageContext',
      )
    }
  } else if (pageParts?.hasRegions) {
    const pageRegions = getDesktopPageRegionRoots(roots.bodyRoot)
    if (pageRegions) {
      roots.pageHeadingRoot = pageRegions.headingRoot
      roots.pageContentRoot = pageRegions.contentRoot
      pageHeadingChanged = writeDesktopRegion(pageRegions.headingRoot, pageParts.headingMarkup, 'pageHeading')
      pageContentChanged = writeDesktopRegion(pageRegions.contentRoot, pageParts.contentMarkup, 'pageContent')
    }
  }
  const modalChanged = writeDesktopRegion(roots.modalRoot, modalParts.frameMarkup, 'modal')
  let modalHeaderChanged = false
  let modalBodyChanged = false
  const modalRegions = getDesktopModalRegionRoots(roots.modalRoot)
  if (modalRegions) {
    roots.modalHeaderRoot = modalRegions.headerRoot
    roots.modalBodyRoot = modalRegions.bodyRoot
    modalHeaderChanged = modalChanged
    modalBodyChanged = writeDesktopRegion(modalRegions.bodyRoot, modalParts.bodyMarkup, 'modalBody')
  } else {
    roots.modalHeaderRoot = null
    roots.modalBodyRoot = null
  }
  const overlayChanged = writeDesktopRegion(roots.overlayRoot, overlayMarkup, 'overlay')
  if (loginChanged || sidebarChanged || topbarChanged || bodyChanged || pageHeadingChanged || pageContentChanged
    || messageHeadingChanged || messageConversationChanged || messageChatChanged || messageContextChanged
    || modalChanged || modalHeaderChanged || modalBodyChanged || overlayChanged) {
    bindDesktopEventsWithoutRebindingStableRegions(roots, {
      loginChanged,
      sidebarChanged,
      topbarChanged,
      bodyChanged,
      pageHeadingChanged,
      pageContentChanged,
      messageHeadingChanged,
      messageConversationChanged,
      messageChatChanged,
      messageContextChanged,
      modalChanged,
      modalHeaderChanged,
      modalBodyChanged,
      overlayChanged,
    })
  }
  // Keep this unconditional: message rows can be preserved by the region
  // renderer even when their parent region did not report a markup change.
  // The loader is idempotent and only fetches elements not bound yet.
  bindDesktopProtectedMedia()
  if ((modalChanged || modalBodyChanged) && state.modal === 'file-preview') void mountDesktopPdfPreview()
  positionDesktopConversationPlusMenu()
  updateDesktopConversationDecorationsDom()
  updateDesktopConversationNameOverflow()
  syncDesktopPresenceVisibility()
  if (state.modal === 'group-info') {
    const groupInfoScrollTop = Number(state.groupInfoScrollTop || 0)
    window.requestAnimationFrame(() => {
      const groupInfoModal = document.querySelector('.desktop-group-info-modal')
      if (groupInfoModal instanceof HTMLElement) groupInfoModal.scrollTop = groupInfoScrollTop
    })
  }
  if (state.modal === 'contact') {
    const contactProfileScrollTop = Number(state.contactProfileScrollTop || 0)
    window.requestAnimationFrame(() => {
      const contactProfileModal = document.querySelector('.desktop-contact-profile-modal')
      if (contactProfileModal instanceof HTMLElement) contactProfileModal.scrollTop = contactProfileScrollTop
    })
  }
  if (state.modal === 'location') ensureDesktopLocationPickerMap()
  else if (desktopLocationPickerRuntime.map || desktopLocationPickerRuntime.initPromise) disposeDesktopLocationPickerMap()
  syncDesktopCallOverlay()
  const nextChatStream = document.querySelector('.chat-stream')
  const nextWorkspaceBody = document.querySelector('.workspace-body')
  if (nextWorkspaceBody instanceof HTMLElement) nextWorkspaceBody.scrollTop = previousWorkspaceScrollTop
  const activeConversationId = conversationScrollKey(conversations[state.selectedConversation])
  if (nextChatStream) {
    const savedScrollTop = Number(state.chatScrollTopByConversation[activeConversationId] || 0)
    const sameConversation = previousChatConversationId === activeConversationId
    const followLatest = state.scrollChatToBottom || (sameConversation && previousChatWasAtLatest)
    if (followLatest) {
      scrollDesktopChatStreamToLatest(nextChatStream, activeConversationId)
    } else {
      nextChatStream.scrollTop = sameConversation ? previousChatScrollTop : savedScrollTop
    }
    const atLatest = nextChatStream.scrollHeight - nextChatStream.scrollTop - nextChatStream.clientHeight < 32
    state.chatAtLatestByConversation[activeConversationId] = atLatest
    syncDesktopLatestJumpDom(activeConversationId, !atLatest)
  }
  state.scrollChatToBottom = false
  if (activeControlSelector) {
    window.requestAnimationFrame(() => {
      const nextControl = document.querySelector(activeControlSelector)
      if (!(nextControl instanceof HTMLInputElement) && !(nextControl instanceof HTMLTextAreaElement) && !(nextControl instanceof HTMLSelectElement)) return
       const nextControlValue = nextControl.matches('[data-message-composer]')
         ? String(state.composerText || '')
         : activeControlValue
       if (nextControlValue !== null && nextControl.type !== 'file' && nextControl.value !== nextControlValue) nextControl.value = nextControlValue
      nextControl.focus({ preventScroll: true })
      if ('setSelectionRange' in nextControl && activeControlSelectionStart != null) {
        try { nextControl.setSelectionRange(activeControlSelectionStart, activeControlSelectionEnd ?? activeControlSelectionStart) } catch { /* ignore IME controls */ }
      }
    })
  }
  if (composerHadFocus) {
    // 周期性的列表刷新会重建输入框；若用户正在输入则恢复焦点与光标位置，
    // 避免打字被打断。
    const textarea = document.querySelector('[data-message-composer]')
    if (textarea instanceof HTMLTextAreaElement) {
      textarea.focus()
      const cursor = composerHadSelection != null ? composerHadSelection : textarea.value.length
      try {
        textarea.setSelectionRange(cursor, cursor)
      } catch {
        // 部分输入法下 setSelectionRange 可能抛错
      }
    }
  }
  syncDesktopShellBadge()
}

function renderLoginAccessNotice(title, message) {
  return `<main class="desktop-login-shell">
    <section class="login-card">
      <div class="brand-lockup login-brand"><div class="brand-mark"><span></span><span></span><span></span></div><div class="brand-copy"><strong>Pulse</strong><small>同步每一刻</small></div></div>
      <div class="login-heading"><span class="eyebrow">PULSE DESKTOP</span><h1>${title}</h1><p>${message}</p></div>
      <div class="login-notice">${icon('shield')} 请联系管理员调整电脑端访问配置。</div>
      <div class="login-footer"><button type="button" data-action="back-to-login">返回登录</button></div>
    </section>
  </main>`
}

function renderLogin() {
  if (!state.clientAccessLoaded) {
    return renderLoginAccessNotice('正在读取登录配置', '正在确认当前电脑端可用的登录方式，请稍候。')
  }
  if (!state.clientAccess.phoneLoginEnabled && !state.clientAccess.qrLoginEnabled) {
    return renderLoginAccessNotice('电脑端登录已关闭', '当前没有可用的电脑端登录方式。')
  }
  if (state.loginView === 'register') return renderRegister()
  if (state.loginView === 'forgot') return renderForgotPassword()
  if (state.loginMode === 'qr') {
    const qrImageEntering = Boolean(state.qrLoginImage && desktopQrImageRevision !== desktopQrRenderedImageRevision)
    if (state.qrLoginImage) desktopQrRenderedImageRevision = desktopQrImageRevision
    const remaining = qrLoginRemainingSeconds()
    const statusText = state.qrLoginStatus === 'loading'
      ? '正在生成二维码…'
      : state.qrLoginStatus === 'confirmed'
        ? '手机已确认，正在登录…'
        : state.qrLoginStatus === 'expired'
          ? '二维码已失效，请手动刷新'
          : '请使用已登录的 Pulse 手机扫码'
    return `<main class="desktop-login-shell">
      <section class="login-card">
        <div class="brand-lockup login-brand"><div class="brand-mark"><span></span><span></span><span></span></div><div class="brand-copy"><strong>Pulse</strong><small>同步每一刻</small></div></div>
        <div class="login-heading"><span class="eyebrow">PULSE DESKTOP</span><h1>扫码登录电脑端</h1><p>打开手机 Pulse，扫一扫下方二维码即可登录当前电脑。</p></div>
        <div class="login-method-tabs">${state.clientAccess.phoneLoginEnabled ? '<button type="button" data-action="login-password">密码登录</button>' : ''}${state.clientAccess.qrLoginEnabled ? '<button type="button" class="active">扫码登录</button>' : ''}</div>
        <div class="desktop-qr-login">
          <div class="desktop-qr-frame${state.qrLoginBusy ? ' is-refreshing' : ''}" aria-busy="${state.qrLoginBusy ? 'true' : 'false'}">${state.qrLoginImage ? `<img class="desktop-qr-image${qrImageEntering ? ' is-entering' : ''}" src="${escapeHtml(state.qrLoginImage)}" alt="电脑端登录二维码" />` : `<span class="desktop-qr-placeholder${state.qrLoginBusy ? ' is-loading' : ''}">${state.qrLoginBusy ? '<span class="desktop-qr-loading-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>生成中…</span>' : '二维码暂不可用'}</span>`}</div>
          <strong>${statusText}</strong>
          ${state.qrLoginStatus === 'waiting' && remaining > 0 ? `<span class="desktop-qr-countdown">二维码有效期还剩 ${remaining} 秒</span>` : ''}
          ${state.qrLoginError ? `<div class="login-error">${escapeHtml(state.qrLoginError)}</div>` : ''}
          <button type="button" class="btn btn-primary login-submit${state.qrLoginBusy ? ' is-refreshing' : ''}" data-action="refresh-qr-login" ${state.qrLoginBusy ? 'disabled' : ''}>${state.qrLoginBusy ? '请稍候…' : '刷新二维码'} ${icon('refresh', state.qrLoginBusy ? 'is-spinning' : '')}</button>
        </div>
        <div class="login-footer"><span>${icon('shield')} 二维码 2 分钟内有效，过期后需手动刷新</span>${state.clientAccess.phoneLoginEnabled ? '<button data-action="login-password">返回密码登录</button>' : ''}</div>
      </section>
      <div class="login-decoration"><div class="hero-orb hero-orb-one"></div><div class="hero-orb hero-orb-two"></div><div class="hero-pattern"></div><div><span class="hero-label">ONE SPACE, EVERY CONNECTION</span><h2>让每一次<br /><em>回应自然发生</em></h2><p>把对话、联系人和兴趣，收进一个安静而有秩序的桌面空间。</p></div></div>
    </main>`
  }
  return `<main class="desktop-login-shell">
    <section class="login-card">
      <div class="brand-lockup login-brand"><div class="brand-mark"><span></span><span></span><span></span></div><div class="brand-copy"><strong>Pulse</strong><small>同步每一刻</small></div></div>
      <div class="login-heading"><span class="eyebrow">PULSE DESKTOP</span><h1>在桌面上，继续你的连接</h1><p>登录 Pulse，消息、联系人和工作空间会在你的设备间保持同步。</p></div>
      <div class="login-method-tabs"><button type="button" class="active">密码登录</button>${state.clientAccess.qrLoginEnabled ? '<button type="button" data-action="login-qr">扫码登录</button>' : ''}</div>
       <form class="login-form" data-login-form novalidate>
        <label><span>手机号</span><input name="phone" type="tel" autocomplete="username" value="${escapeHtml(state.loginPhone)}" placeholder="请输入手机号" /></label>
        <label><span>密码</span><input name="password" type="password" autocomplete="current-password" value="${escapeHtml(state.loginPassword)}" placeholder="请输入密码" /></label>
        ${state.loginSecurityCodeRequired ? '<label><span>安全码</span><input name="securityCode" type="text" inputmode="text" autocomplete="one-time-code" maxlength="6" value="' + escapeHtml(state.loginSecurityCode) + '" placeholder="请输入 6 位安全码" /></label>' : ''}
        <div class="login-options"><label class="remember-option"><input name="rememberLogin" type="checkbox" ${state.rememberLogin ? 'checked' : ''} /><span>记住密码</span></label><button type="button" class="login-link" data-action="forgot-password">忘记密码？</button></div>
        ${state.loginError ? `<div class="login-error">${escapeHtml(state.loginError)}</div>` : ''}
        ${state.loginNotice ? `<div class="login-notice">${escapeHtml(state.loginNotice)}</div>` : ''}
        <button class="btn btn-primary login-submit" type="submit" ${state.loginBusy ? 'disabled' : ''}>${state.loginBusy ? '登录中…' : '登录 Pulse'} ${icon('arrow')}</button>
      </form>
      <div class="login-footer"><span>${icon('shield')} 登录成功后保存在本机</span>${state.clientAccess.registerEnabled ? '<div class="login-footer-actions"><button data-action="register">注册新账号</button></div>' : ''}</div>
    </section>
    <div class="login-decoration"><div class="hero-orb hero-orb-one"></div><div class="hero-orb hero-orb-two"></div><div class="hero-pattern"></div><div><span class="hero-label">ONE SPACE, EVERY CONNECTION</span><h2>让每一次<br /><em>回应自然发生</em></h2><p>把对话、联系人和兴趣，收进一个安静而有秩序的桌面空间。</p></div></div>
  </main>`
}

function renderRegister() {
  if (!state.clientAccess.registerEnabled) {
    return renderLoginAccessNotice('电脑端注册已关闭', '管理员已关闭 Windows 网页端和 EXE 的注册入口。')
  }
  const step = Math.min(3, Math.max(1, Number(state.registerStep) || 1))
  const stepTitles = ['验证手机号', '输入验证码', '完善资料']
  const stepTitle = stepTitles[step - 1]
  const progress = `${step}/3`
  let form = ''

  if (step === 1) {
    form = `<form class="login-form" data-register-phone-form novalidate>
      <label><span>手机号</span><input name="registerPhone" type="tel" inputmode="numeric" maxlength="11" autocomplete="tel" value="${escapeHtml(state.registerPhone)}" placeholder="请输入手机号" /></label>
      ${state.registerError ? `<div class="login-error">${escapeHtml(state.registerError)}</div>` : ''}
      ${state.registerNotice ? `<div class="login-notice">${escapeHtml(state.registerNotice)}</div>` : ''}
      <button class="btn btn-primary login-submit" type="submit" ${state.registerBusy ? 'disabled' : ''}>${state.registerBusy ? '发送中…' : '继续'} ${icon('arrow')}</button>
    </form>`
  } else if (step === 2) {
    form = `<form class="login-form" data-register-code-form novalidate>
      <label><span>验证码</span><div class="code-field"><input name="registerCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" value="${escapeHtml(state.registerCode)}" placeholder="请输入验证码" /><button type="button" class="code-button" data-action="send-register-code" ${state.registerCountdown > 0 || state.registerBusy ? 'disabled' : ''}>${state.registerCountdown > 0 ? `${state.registerCountdown}s 后重发` : '重新发送'}</button></div></label>
      <small class="register-phone-hint">验证码已发送至 ${escapeHtml(state.registerPhone)}</small>
      ${state.registerError ? `<div class="login-error">${escapeHtml(state.registerError)}</div>` : ''}
      ${state.registerNotice ? `<div class="login-notice">${escapeHtml(state.registerNotice)}</div>` : ''}
      <button class="btn btn-primary login-submit" type="submit" ${state.registerBusy ? 'disabled' : ''}>下一步 ${icon('arrow')}</button>
    </form>`
  } else {
    form = `<form class="login-form" data-register-profile-form novalidate>
      <label><span>昵称</span><input name="registerNickname" type="text" maxlength="30" autocomplete="nickname" value="${escapeHtml(state.registerNickname)}" placeholder="请输入昵称" /></label>
      <label><span>登录密码</span><input name="registerPassword" type="password" minlength="6" autocomplete="new-password" placeholder="至少 6 位" /></label>
      <label><span>确认密码</span><input name="registerConfirmPassword" type="password" minlength="6" autocomplete="new-password" placeholder="再次输入密码" /></label>
      <label class="remember-option"><input name="rememberLogin" type="checkbox" ${state.rememberLogin ? 'checked' : ''} /><span>记住密码</span></label>
      ${state.registerError ? `<div class="login-error">${escapeHtml(state.registerError)}</div>` : ''}
      ${state.registerNotice ? `<div class="login-notice">${escapeHtml(state.registerNotice)}</div>` : ''}
      <button class="btn btn-primary login-submit" type="submit" ${state.registerBusy ? 'disabled' : ''}>${state.registerBusy ? '注册中…' : '完成注册'} ${icon('check')}</button>
    </form>`
  }

  return `<main class="desktop-login-shell">
    <section class="login-card">
      <div class="brand-lockup login-brand"><div class="brand-mark"><span></span><span></span><span></span></div><div class="brand-copy"><strong>Pulse</strong><small>同步每一刻</small></div></div>
      <div class="login-heading"><span class="eyebrow">PULSE DESKTOP · ${progress}</span><h1>${stepTitle}</h1><p>${step === 1 ? '使用手机号创建你的 Pulse 账号。' : step === 2 ? '输入短信验证码，确认手机号属于你。' : '设置昵称和密码，完成注册后即可使用电脑端。'}</p></div>
      <div class="register-progress" aria-label="注册进度">${stepTitles.map((title, index) => `<span class="${index + 1 <= step ? 'active' : ''}"><i>${index + 1}</i>${title}</span>`).join('')}</div>
      ${form}
      <div class="login-footer"><span>${icon('shield')} 注册成功后自动登录</span><div class="login-footer-actions">${step > 1 ? '<button data-action="register-back-step">上一步</button>' : ''}<button data-action="back-to-login">已有账号？登录</button></div></div>
    </section>
    <div class="login-decoration"><div class="hero-orb hero-orb-one"></div><div class="hero-orb hero-orb-two"></div><div class="hero-pattern"></div><div><span class="hero-label">ONE SPACE, EVERY CONNECTION</span><h2>让每一次<br /><em>回应自然发生</em></h2><p>把对话、联系人和兴趣，收进一个安静而有秩序的桌面空间。</p></div></div>
  </main>`
}

async function loadDesktopClientAccessConfig() {
  if (state.clientAccessLoading || state.clientAccessLoaded) return
  state.clientAccessLoading = true
  try {
    const config = await fetchDesktopClientAccessConfig()
    state.clientAccess = {
      phoneLoginEnabled: config.phoneLoginEnabled !== false,
      qrLoginEnabled: config.qrLoginEnabled !== false,
      registerEnabled: config.registerEnabled !== false,
      walletEnabled: config.walletEnabled !== false,
    }
  } catch {
    // A temporary config request failure should not lock every client out.
    state.clientAccess = {
      phoneLoginEnabled: true,
      qrLoginEnabled: true,
      registerEnabled: true,
      walletEnabled: true,
    }
  } finally {
    state.clientAccessLoaded = true
    state.clientAccessLoading = false
    if (!state.clientAccess.phoneLoginEnabled && state.clientAccess.qrLoginEnabled) {
      state.loginMode = 'qr'
    } else if (state.clientAccess.phoneLoginEnabled && !state.clientAccess.qrLoginEnabled) {
      state.loginMode = 'password'
    }
    render()
    if (!state.authenticated) startDesktopQrLoginIfRequired()
  }
}

function startDesktopQrLoginIfRequired() {
  if (
    state.authenticated
    || !state.clientAccessLoaded
    || state.loginView !== 'login'
    || state.clientAccess.phoneLoginEnabled
    || !state.clientAccess.qrLoginEnabled
  ) return
  state.loginMode = 'qr'
  void beginDesktopQrLogin()
}

function renderForgotPassword() {
  if (!state.clientAccess.phoneLoginEnabled) {
    return renderLoginAccessNotice('电脑端手机号登录已关闭', '当前无法使用电脑端手机号登录或找回密码。')
  }
  return `<main class="desktop-login-shell">
    <section class="login-card">
      <div class="brand-lockup login-brand"><div class="brand-mark"><span></span><span></span><span></span></div><div class="brand-copy"><strong>Pulse</strong><small>同步每一刻</small></div></div>
      <div class="login-heading"><span class="eyebrow">ACCOUNT RECOVERY</span><h1>重置你的密码</h1><p>使用注册手机号验证身份，设置一个新的登录密码。</p></div>
       <form class="login-form" data-forgot-form novalidate>
        <label><span>手机号</span><input name="resetPhone" type="tel" inputmode="numeric" maxlength="11" autocomplete="username" placeholder="请输入注册手机号" value="${escapeHtml(state.resetPhone)}" /></label>
        <label class="code-field"><span>验证码</span><input name="resetCode" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="请输入验证码" value="${escapeHtml(state.resetCode)}" /><button type="button" class="code-button" data-action="send-reset-code" ${state.resetCountdown > 0 || state.resetBusy ? 'disabled' : ''}>${state.resetCountdown > 0 ? `${state.resetCountdown}s 后重发` : '发送验证码'}</button></label>
        <label><span>新密码</span><input name="resetPassword" type="password" autocomplete="new-password" placeholder="至少 6 位" /></label>
        <label><span>确认新密码</span><input name="resetConfirmPassword" type="password" autocomplete="new-password" placeholder="再次输入新密码" /></label>
        ${state.resetError ? `<div class="login-error">${escapeHtml(state.resetError)}</div>` : ''}
        ${state.resetNotice ? `<div class="login-notice">${escapeHtml(state.resetNotice)}</div>` : ''}
        <button class="btn btn-primary login-submit" type="submit" ${state.resetBusy ? 'disabled' : ''}>${state.resetBusy ? '重置中…' : '重置密码'} ${icon('check')}</button>
      </form>
      <div class="login-footer"><span>${icon('shield')} 重置成功后请使用新密码登录</span><button type="button" data-action="back-to-login">返回登录</button></div>
    </section>
    <div class="login-decoration"><div class="hero-orb hero-orb-one"></div><div class="hero-orb hero-orb-two"></div><div class="hero-pattern"></div><div><span class="hero-label">SAFE ACCOUNT RECOVERY</span><h2>找回访问<br /><em>继续保持连接</em></h2><p>验证码只用于本次密码重置，Pulse 不会保存你的明文密码。</p></div></div>
  </main>`
}

async function loadRemoteData() {
  if (!state.authenticated || state.loading) return
  // Warm the local PDF worker while the normal account data is hydrating, so
  // opening the first PDF does not also pay the worker startup cost.
  scheduleDesktopPdfWorkerWarmup()
  // Start realtime presence/message delivery before HTTP hydration. A single
  // slow or failed data request must not leave an otherwise valid login absent
  // from the server's online presence set.
  startDesktopWs()
  const hadRemoteData = state.dataSource === 'remote'
  const previousConversationSignature = desktopConversationSignature(conversations)
  const previousContactSignature = desktopContactSignature(contacts)
  const previousProfileSignature = JSON.stringify({
    nickname: state.profile.nickname || '',
    signature: state.profile.signature || '',
    avatarUrl: state.profile.avatarUrl || '',
    phone: state.profile.phone || '',
  })
  let remoteDataChanged = false
  state.loading = true
  state.dataSource = hadRemoteData ? 'remote' : 'loading'
  if (!hadRemoteData) requestDesktopRender()
  try {
    const [remoteConversations, remoteContacts, profile] = await Promise.all([
      fetchDesktopConversations('all'),
      fetchDesktopContacts(),
      fetchDesktopProfile(),
    ])
    const conversationMap = new Map(remoteConversations.map((item) => [String(item.id), item]))
    if (remoteContacts.list?.length) {
      const nextContacts = remoteContacts.list
        .filter((item) => !isDesktopFileTransferAssistant(item))
        .map(mapRemoteContact)
      remoteDataChanged = remoteDataChanged
        || desktopContactSignature(nextContacts) !== previousContactSignature
      contacts = nextContacts
    }
    if (conversationMap.size) {
      const nextConversations = applyDesktopContactAvatars(
        [...conversationMap.values()].map(mapRemoteConversation),
        contacts,
      )
      remoteDataChanged = remoteDataChanged
        || desktopConversationSignature(nextConversations) !== previousConversationSignature
      conversations = nextConversations
    }
    if (profile) {
      state.profile = { ...state.profile, ...profile, userId: String(profile.userId) }
      saveDesktopSession(getDesktopToken() || '', state.profile)
      remoteDataChanged = remoteDataChanged || JSON.stringify({
        nickname: state.profile.nickname || '',
        signature: state.profile.signature || '',
        avatarUrl: state.profile.avatarUrl || '',
        phone: state.profile.phone || '',
      }) !== previousProfileSignature
    }
    state.notificationDismissedIds = readDesktopNotificationDismissals(state.profile.userId)
    state.dataSource = 'remote'
    state.fileItems = []
    state.fileLoaded = false
    state.fileError = ''
    state.loginError = ''
    try {
      const privacy = await fetchDesktopPrivacy()
      state.readReceiptsEnabled = privacy.readReceiptEnabled !== false
    } catch {
      state.readReceiptsEnabled = true
    }
    startDesktopDeviceSessionMonitor()
    void refreshNotificationSummary()
    void loadDesktopDevices()
  } catch (error) {
    if (!getDesktopToken()) {
      state.authenticated = false
      stopDesktopWsConnection()
    }
    state.dataSource = hadRemoteData && getDesktopToken() ? 'remote' : 'error'
    if (!hadRemoteData) {
      conversations = []
      contacts = []
    }
    state.loginError = error instanceof Error ? error.message : '暂时无法加载在线数据'
  } finally {
    state.loading = false
    if (!hadRemoteData || remoteDataChanged || state.dataSource !== 'remote') requestDesktopRender()
    if (state.authenticated && state.dataSource === 'remote') {
      void refreshDesktopConversationAvatar(conversations[state.selectedConversation])
    }
    if (state.authenticated && state.dataSource === 'remote' && state.page === 'files') void loadDesktopFiles()
    if (state.authenticated) void loadSelectedMessages()
    if (state.authenticated && state.dataSource === 'remote' && state.page === 'moments') void loadMoments()
    if (state.authenticated && state.dataSource === 'remote' && state.page === 'settings' && state.settingsSection === 'friend-permission') void loadPrivacySettings()
  }
}

async function refreshDesktopCurrentPageData() {
  if (state.dataSource !== 'remote') return
  await refreshNotificationSummary()
  if (state.page === 'favorites') {
    state.favoritesLoaded = false
    await loadFavorites()
    return
  }
  if (state.page === 'wallet') {
    await loadWallet()
    return
  }
  if (state.page === 'moments' || state.page === 'discover') {
    await loadMoments(true)
    return
  }
  if (state.page === 'files') {
    state.fileLoaded = false
    await loadDesktopFiles(true)
    return
  }
  if (state.page === 'settings') {
    if (state.settingsSection === 'friend-permission') await loadPrivacySettings(true)
    else if (state.settingsSection === 'account-security') await loadDesktopAccountSecurity(true)
    else if (state.settingsSection === 'storage') await loadDesktopStorage()
    else if (state.settingsSection === 'help') await loadDesktopHelp()
    else await loadDesktopDevices(true)
    return
  }
  if (state.page === 'contacts' || state.page === 'groups') return
  await loadSelectedMessages()
}

async function refreshDesktopData() {
  if (!state.authenticated || state.globalRefreshing) return
  state.globalRefreshing = true
  syncDesktopRefreshButtonDom()
  try {
    if (state.dataSource === 'remote') {
      await loadRemoteData()
      if (state.dataSource !== 'remote') throw new Error(state.loginError || '刷新失败，请稍后重试')
      await refreshDesktopCurrentPageData()
      showToast('页面数据已刷新')
    } else {
      showToast('当前未连接在线数据')
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : '刷新失败，请稍后重试')
  } finally {
    state.globalRefreshing = false
    syncDesktopRefreshButtonDom()
  }
}

function momentIsMine(item) {
  return item?.mine === true || String(item?.userId || '') === String(state.profile.userId || '')
}

function resetDesktopSocialState() {
  state.blockedUserIds = new Set()
  state.blockedByPeerUserIds = new Set()
  state.deletedFriendUserIds = new Set()
  state.sharedContentCountsByConversation = {}
  state.sharedContentCountsLoadingConversationId = ''
  state.moments = []
  state.momentsLoaded = false
  state.momentsLoading = false
  state.momentsError = ''
  state.friendMomentsProfile = null
  state.momentCommentOpenId = ''
  state.momentCommentText = ''
  state.momentVisibleUserIds = new Set()
  state.momentMentionUserIds = new Set()
  state.momentMentionQuery = ''
  state.momentMentionOpen = false
  state.momentMentionTokenStart = -1
  state.momentInteractions = []
  state.momentInteractionUnreadCount = 0
  state.privacyLoaded = false
  state.privacyLoading = false
  state.privacyError = ''
  state.privacyListMode = ''
  state.privacyListUsers = []
  state.privacyListSelected = new Set()
}

function momentVisibilityLabel(value) {
  if (Number(value) === 1) return '仅自己'
  if (Number(value) === 2) return '部分可见'
  return ''
}

function momentTime(value) {
  if (!value) return '刚刚'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '刚刚'
  const diff = Date.now() - date.getTime()
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.max(1, Math.floor(diff / 60000))} 分钟前`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`
  if (date.toDateString() === new Date(Date.now() - 86400000).toDateString()) return '昨天'
  return `${date.getMonth() + 1}月${date.getDate()}日 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}

function momentMediaType(item, index, url) {
  return item?.mediaTypes?.[index] === 'video' || /\.(mp4|webm|mov|m4v|mkv|3gp)(\?|$)/i.test(url || '') ? 'video' : 'image'
}

function mapMomentContact(item) {
  const name = item.nickname || item.name || '用户'
  return { ...item, userId: String(item.userId || ''), name, initials: name.slice(0, 1), tone: item.tone || ['blue', 'violet', 'orange', 'green', 'cyan', 'pink'][Number(item.userId || 0) % 6], avatarUrl: item.avatarUrl || '' }
}

function momentMentionLabel() {
  const names = contacts
    .map(mapMomentContact)
    .filter((user) => state.momentMentionUserIds.has(String(user.userId)))
    .map((user) => user.name)
  if (!names.length) return ''
  if (names.length <= 2) return names.join('\u3001')
  return `${names.slice(0, 2).join('\u3001')} \u7b49 ${names.length} \u4eba`
}

function momentVisiblePreviewLabel() {
  const names = contacts
    .map(mapMomentContact)
    .filter((user) => state.momentVisibleUserIds.has(String(user.userId)))
    .map((user) => user.name)
  if (!names.length) return '\u8bf7\u9009\u62e9\u53ef\u89c1\u597d\u53cb'
  if (names.length <= 3) return names.join('\u3001')
  return `${names.slice(0, 3).join('\u3001')} \u7b49 ${names.length} \u4eba`
}

function momentMentionContext(text, cursor) {
  const prefix = String(text || '').slice(0, Math.max(0, Number(cursor) || 0))
  const match = prefix.match(/(?:^|[^\s@])@([^\s@]*)$/)
  if (!match) return null
  return { query: match[1] || '', start: prefix.length - (match[1] || '').length - 1 }
}

function momentMentionCandidates() {
  const query = String(state.momentMentionQuery || '').trim().toLowerCase()
  return contacts
    .map(mapMomentContact)
    .filter((user) => !query || `${user.name} ${user.meta || ''}`.toLowerCase().includes(query))
    .slice(0, 8)
}

function renderMomentMentionMenu() {
  const menu = document.querySelector('[data-moment-mention-menu]')
  if (!menu) return
  const users = momentMentionCandidates()
  const visible = state.momentMentionOpen && users.length > 0
  menu.hidden = !visible
  menu.innerHTML = visible
    ? users.map((user) => `<button type="button" class="desktop-moment-mention-option" data-moment-mention-suggestion="${escapeHtml(user.userId)}"><span>${avatar(user, 'avatar-small')}</span><span><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.meta || user.tag || '')}</small></span></button>`).join('')
    : ''
}

function selectMomentMention(userId) {
  const input = document.querySelector('[data-moment-content]')
  const user = contacts.map(mapMomentContact).find((item) => String(item.userId) === String(userId))
  if (!input || !user || state.momentMentionTokenStart < 0) return
  const cursor = Number(input.selectionStart || 0)
  const before = input.value.slice(0, state.momentMentionTokenStart)
  const insert = `@${user.name} `
  state.momentDraftText = `${before}${insert}${input.value.slice(cursor)}`
  state.momentDraftDirty = true
  state.momentMentionUserIds = new Set([...state.momentMentionUserIds, String(user.userId)])
  state.momentMentionQuery = ''
  state.momentMentionOpen = false
  state.momentMentionTokenStart = -1
  render()
  const nextInput = document.querySelector('[data-moment-content]')
  const nextCursor = before.length + insert.length
  nextInput?.focus()
  nextInput?.setSelectionRange(nextCursor, nextCursor)
}

const DESKTOP_MOMENT_DRAFT_KEY = 'pulse_desktop_moment_draft'

function saveDesktopMomentDraft() {
  try {
    if (!String(state.momentDraftText || '').trim() && state.momentFiles.length === 0 && !state.momentLocation) {
      localStorage.removeItem(DESKTOP_MOMENT_DRAFT_KEY)
      state.momentDraftDirty = false
      return
    }
    localStorage.setItem(DESKTOP_MOMENT_DRAFT_KEY, JSON.stringify({
      text: state.momentDraftText,
      visibility: Number(state.momentVisibility || 0),
      location: state.momentLocation,
    }))
    state.momentDraftDirty = false
  } catch {
    // 草稿保存失败不影响编辑
  }
}

function restoreDesktopMomentDraft() {
  try {
    const raw = localStorage.getItem(DESKTOP_MOMENT_DRAFT_KEY)
    if (!raw) return
    const draft = JSON.parse(raw)
    if (!draft || typeof draft.text !== 'string') return
    if (!String(state.momentDraftText || '').trim() && state.momentFiles.length === 0 && !state.momentLocation) {
      state.momentDraftText = draft.text
      if (typeof draft.visibility === 'number') state.momentVisibility = draft.visibility
      if (draft.location?.name && Number.isFinite(Number(draft.location.latitude)) && Number.isFinite(Number(draft.location.longitude))) {
        state.momentLocation = {
          name: String(draft.location.name),
          address: String(draft.location.address || ''),
          latitude: Number(draft.location.latitude),
          longitude: Number(draft.location.longitude),
        }
      }
      state.momentDraftDirty = false
    }
  } catch {
    // 草稿损坏时忽略
  }
}

function clearDesktopMomentDraft() {
  try {
    localStorage.removeItem(DESKTOP_MOMENT_DRAFT_KEY)
  } catch {
    // best effort
  }
}

function discardDesktopMomentEditor() {
  state.momentDraftText = ''
  state.momentVisibility = 0
  state.momentVisibleUserIds = new Set()
  state.momentMentionUserIds = new Set()
  state.momentLocation = null
  state.momentMentionQuery = ''
  state.momentMentionOpen = false
  state.momentMentionTokenStart = -1
  state.momentFiles = []
  state.momentFileNames = []
  state.momentDraftDirty = false
  clearDesktopMomentDraft()
}

async function loadMoments(force = false) {
  if (!state.authenticated) return
  restoreDesktopMomentDraft()
  if (state.dataSource !== 'remote') return
  if (state.momentsLoading || (state.momentsLoaded && !force)) return
  state.momentsLoading = true
  state.momentsError = ''
  if (state.page === 'moments') render()
  try {
    state.moments = await fetchDesktopMoments()
    state.momentsLoaded = true
    void markDesktopMomentsSeen().catch(() => {})
  } catch (error) {
    state.momentsError = error instanceof Error ? error.message : '朋友圈加载失败'
  } finally {
    state.momentsLoading = false
    if (state.page === 'moments') render()
  }
}

async function openFriendMomentsPage(profile) {
  const userId = String(profile?.userId || '')
  if (!userId) return
  state.friendMomentsProfile = { ...profile, userId }
  state.modal = ''
  state.modalError = ''
  state.momentDetail = null
  state.momentCommentOpenId = ''
  state.momentCommentText = ''
  state.moments = []
  state.momentsLoaded = false
  state.momentsLoading = true
  state.momentsError = ''
  state.page = 'moments'
  render()
  try {
    if (state.dataSource !== 'remote') {
      state.momentsLoaded = true
      return
    }
    state.moments = await fetchDesktopUserMoments(userId)
    state.momentsLoaded = true
  } catch (error) {
    state.momentsError = error instanceof Error ? error.message : '好友朋友圈加载失败'
  } finally {
    state.momentsLoading = false
    if (state.page === 'moments' && String(state.friendMomentsProfile?.userId || '') === userId) render()
  }
}

async function publishMoment() {
  const content = String(state.momentDraftText || '').trim()
  if (!content && !state.momentFiles.length) return showToast('写点内容或添加一张图片吧')
  if (Number(state.momentVisibility) === 2 && state.momentVisibleUserIds.size === 0) return showToast('请选择可见好友')
  if (state.momentPublishBusy) return
  state.momentPublishBusy = true
  render()
  try {
    if (state.dataSource !== 'remote') throw new Error('在线数据未加载，暂不能发布动态')
    const uploaded = []
    for (const file of state.momentFiles) uploaded.push(await uploadDesktopFile(file))
    const mediaFileIds = uploaded.map((file) => String(file.fileId || '').trim())
    if (mediaFileIds.some((fileId) => !fileId)) throw new Error('媒体上传成功但未返回 fileId')
    const item = await publishDesktopMoment({
      content,
      images: uploaded.map((file) => desktopFileDownloadUrl(file.fileId, 'thumb')),
      originalImages: uploaded.map((file) => file.originalUrl || file.url),
      mediaTypes: uploaded.map((file) => file.contentType.startsWith('video/') ? 'video' : 'image'),
      mediaFileIds,
      visibility: Number(state.momentVisibility || 0),
      mentionUserIds: [...state.momentMentionUserIds],
      visibleUserIds: [...state.momentVisibleUserIds],
      locationName: state.momentLocation?.name,
      locationAddress: state.momentLocation?.address,
      latitude: state.momentLocation?.latitude,
      longitude: state.momentLocation?.longitude,
    })
    state.moments = [item, ...state.moments]
    state.momentDraftText = ''
    state.momentDraftDirty = false
    state.momentVisibility = 0
    state.momentVisibleUserIds = new Set()
    state.momentMentionUserIds = new Set()
    state.momentLocation = null
    state.momentMentionQuery = ''
    state.momentMentionOpen = false
    state.momentMentionTokenStart = -1
    state.momentFiles = []
    clearDesktopMomentDraft()
    state.momentFileNames = []
    showToast('动态已发布')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '发布失败')
  } finally {
    state.momentPublishBusy = false
    render()
  }
}

async function toggleMomentLike(id) {
  const index = state.moments.findIndex((item) => String(item.id) === String(id))
  const current = state.moments[index]
  if (!current) return
  if (state.dataSource !== 'remote') return showToast('在线数据未加载，暂不能点赞')
  try {
    state.moments[index] = await toggleDesktopMomentLike(String(id))
    updateDesktopMomentCardDom(state.moments[index])
  } catch (error) {
    showToast(error instanceof Error ? error.message : '点赞失败')
  }
}

async function toggleMomentFavorite(id) {
  const index = state.moments.findIndex((item) => String(item.id) === String(id))
  const current = state.moments[index]
  if (!current) return
  const wasFavorited = Boolean(current.favoritedByMe)
  state.momentMenu = null
  if (state.dataSource !== 'remote') return showToast('在线数据未加载，暂不能收藏')
  try {
    state.moments[index] = await toggleDesktopMomentFavorite(String(id))
    state.favoritesLoaded = false
    showToast(wasFavorited ? '已取消收藏' : '已收藏')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '收藏失败')
  }
}

async function removeMoment(id, skipConfirm = false) {
  const item = state.moments.find((moment) => String(moment.id) === String(id))
  if (!item || !momentIsMine(item)) return
  if (!skipConfirm) {
    state.confirmDialog = { type: 'delete-moment', momentId: String(id) }
    state.modal = 'confirm'
    render()
    return
  }
  try {
    if (state.dataSource === 'remote') await deleteDesktopMoment(String(id))
    state.moments = state.moments.filter((moment) => String(moment.id) !== String(id))
    showToast('动态已删除')
    render()
  } catch (error) {
    showToast(error instanceof Error ? error.message : '删除失败')
  }
}

function openMomentDetail(id) {
  const item = state.moments.find((moment) => String(moment.id) === String(id))
  if (!item) return
  state.momentDetail = item
  state.modal = 'moment-detail'
  state.modalError = ''
  render()
}

async function submitMomentComment(id) {
  const content = String(state.momentCommentText || '').trim()
  const item = state.moments.find((moment) => String(moment.id) === String(id))
  if (!content || !item) return
  if (state.dataSource !== 'remote') return showToast('在线数据未加载，暂不能评论')
  try {
    const replyToCommentId = state.momentReplyCommentId || undefined
    const comment = await addDesktopMomentComment(String(id), content, replyToCommentId)
    item.comments = [...(item.comments || []), comment]
    item.commentCount = Number(item.commentCount || 0) + 1
    state.momentCommentText = ''
    state.momentReplyCommentId = ''
    state.momentReplyNickname = ''
    updateDesktopMomentCardDom(item)
    const input = document.querySelector(`[data-moment-id="${String(id).replace(/"/g, '\\"')}"] [data-moment-comment-input]`)
    if (input instanceof HTMLInputElement) input.value = ''
  } catch (error) {
    showToast(error instanceof Error ? error.message : '评论失败')
  }
}

async function loadPrivacySettings(force = false) {
  if (!state.authenticated) return
  if (state.dataSource !== 'remote') return
  if (state.privacyLoading || (state.privacyLoaded && !force)) return
  state.privacyLoading = true
  state.privacyError = ''
  render()
  try {
    state.privacySettings = await fetchDesktopPrivacySettings()
    state.privacyLoaded = true
    state.readReceiptsEnabled = state.privacySettings.readReceiptEnabled !== false
  } catch (error) {
    state.privacyError = error instanceof Error ? error.message : '朋友权限加载失败'
  } finally {
    state.privacyLoading = false
    render()
  }
}

async function patchPrivacySetting(key, value) {
  const previous = state.privacySettings[key]
  state.privacySettings = { ...state.privacySettings, [key]: value }
  state.privacySaving = true
  render()
  try {
    if (state.dataSource === 'remote') state.privacySettings = await updateDesktopPrivacySettings({ [key]: value })
    if (key === 'readReceiptEnabled') state.readReceiptsEnabled = state.privacySettings.readReceiptEnabled !== false
    showToast('设置已保存')
  } catch (error) {
    state.privacySettings = { ...state.privacySettings, [key]: previous }
    showToast(error instanceof Error ? error.message : '保存失败')
  } finally {
    state.privacySaving = false
    render()
  }
}

async function openPrivacyListModal(mode) {
  state.privacyListMode = mode === 'reject' ? 'reject' : 'hide'
  state.privacyListUsers = []
  state.privacyListSelected = new Set()
  state.privacyListLoading = true
  state.modal = 'privacy-list'
  render()
  try {
    const users = state.dataSource === 'remote' ? (state.privacyListMode === 'reject' ? await fetchDesktopMomentsRejectUsers() : await fetchDesktopMomentsHideUsers()) : []
    state.privacyListUsers = users.map(mapMomentContact)
    state.privacyListSelected = new Set(state.privacyListUsers.map((user) => String(user.userId)))
  } catch (error) {
    state.modalError = error instanceof Error ? error.message : '名单加载失败'
  } finally {
    state.privacyListLoading = false
    render()
  }
}

async function togglePrivacyListContact(userId) {
  const id = String(userId || '')
  const selected = new Set(state.privacyListSelected)
  const nextValue = !selected.has(id)
  if (nextValue) selected.add(id)
  else selected.delete(id)
  state.privacyListSelected = selected
  render()
  if (state.dataSource !== 'remote') return
  try {
    await updateDesktopFriendMomentsPermission(id, state.privacyListMode === 'reject' ? { rejectHisMoments: nextValue } : { hideHisMoments: nextValue })
    render()
  } catch (error) {
    const rollback = new Set(state.privacyListSelected)
    if (nextValue) rollback.delete(id)
    else rollback.add(id)
    state.privacyListSelected = rollback
    showToast(error instanceof Error ? error.message : '名单保存失败')
  }
}

async function loadDesktopDevices(force = false) {
  if (state.dataSource !== 'remote' || state.deviceLoading || (state.devicesLoaded && !force)) return
  state.deviceLoading = true
  state.deviceError = ''
  render()
  try {
    const result = await fetchDesktopDeviceSessions()
    state.deviceSessions = Array.isArray(result?.list) ? result.list : []
    state.currentDeviceId = String(result?.currentDeviceId || '')
    state.devicesLoaded = true
  } catch (error) {
    state.deviceError = error instanceof Error ? error.message : '设备列表加载失败'
  } finally {
    state.deviceLoading = false
    render()
  }
}

function maskDesktopPhone(phone) {
  const value = String(phone || '')
  return /^1\d{10}$/.test(value) ? `${value.slice(0, 3)}****${value.slice(-4)}` : value || '未绑定'
}

function desktopLockScreenUserId() {
  return String(state.profile?.userId || '').trim()
}

function desktopLockScreenConfig() {
  return readLockScreenConfig(desktopLockScreenUserId())
}

function desktopHasLockScreenPassword() {
  return Boolean(desktopLockScreenConfig()?.passwordHash)
}

function focusDesktopLockScreenInput(selector) {
  window.setTimeout(() => document.querySelector(selector)?.focus(), 0)
}

function openDesktopLockPasswordSettings() {
  if (!desktopLockScreenUserId()) {
    showToast('当前账号信息不可用')
    return
  }
  const config = desktopLockScreenConfig()
  state.lockScreenPassword = ''
  state.lockScreenPasswordConfirm = ''
  state.lockScreenPasswordHint = config?.hint || ''
  state.lockScreenError = ''
  state.lockScreenBusy = false
  state.modal = 'lock-password'
  render()
  focusDesktopLockScreenInput('[data-lock-screen-password]')
}

async function saveDesktopLockPassword(event) {
  event.preventDefault()
  if (state.lockScreenBusy) return
  const data = new FormData(event.currentTarget)
  const password = String(data.get('password') || '').trim()
  const confirm = String(data.get('confirmPassword') || '').trim()
  const hint = String(data.get('hint') || '').trim()
  state.lockScreenPassword = password
  state.lockScreenPasswordConfirm = confirm
  state.lockScreenPasswordHint = hint
  if (password.length < 4 || password.length > 64) {
    state.lockScreenError = '锁屏密码需为 4-64 位'
    render()
    focusDesktopLockScreenInput('[data-lock-screen-password]')
    return
  }
  if (password !== confirm) {
    state.lockScreenError = '两次输入的密码不一致'
    render()
    focusDesktopLockScreenInput('[data-lock-screen-password-confirm]')
    return
  }
  state.lockScreenBusy = true
  state.lockScreenError = ''
  render()
  try {
    await saveLockScreenConfig(desktopLockScreenUserId(), password, hint)
    state.modal = ''
    state.lockScreenPassword = ''
    state.lockScreenPasswordConfirm = ''
    state.lockScreenPasswordHint = ''
    showToast('锁屏密码已设置')
  } catch (error) {
    state.lockScreenError = error instanceof Error ? error.message : '锁屏密码设置失败'
  } finally {
    state.lockScreenBusy = false
    render()
  }
}

function requestDisableDesktopLockPassword() {
  if (!desktopHasLockScreenPassword()) return
  state.confirmDialog = { type: 'disable-lock-screen' }
  state.modal = 'confirm'
  render()
}

function disableDesktopLockPassword() {
  clearLockScreenConfig(desktopLockScreenUserId())
  writeLockScreenLocked(desktopLockScreenUserId(), false)
  state.lockScreenLocked = false
  state.lockScreenError = ''
  showToast('锁屏密码已关闭')
  render()
}

function lockDesktopApplication() {
  if (!desktopHasLockScreenPassword()) {
    state.profileMenuOpen = false
    state.page = 'settings'
    state.settingsSection = 'account-security'
    state.profileEditing = false
    state.profileDraft = null
    render()
    openDesktopLockPasswordSettings()
    return
  }
  state.lockScreenLocked = true
  writeLockScreenLocked(desktopLockScreenUserId(), true)
  state.profileMenuOpen = false
  state.modal = ''
  state.messageMenu = null
  state.conversationMenu = null
  state.fileMenu = null
  state.sharedContentMenu = null
  state.momentMenu = null
  state.momentMediaMenu = null
  state.showEmojiPanel = false
  state.showMentionPicker = false
  state.showHomePlusMenu = false
  render()
  focusDesktopLockScreenInput('[data-desktop-lock-password]')
}

async function unlockDesktopApplication(event) {
  event.preventDefault()
  const data = new FormData(event.currentTarget)
  const password = String(data.get('password') || '')
  if (!password) return
  const valid = await verifyLockScreenPassword(password, desktopLockScreenConfig())
  if (!valid) {
    state.lockScreenError = '密码错误，请重试'
    render()
    focusDesktopLockScreenInput('[data-desktop-lock-password]')
    return
  }
  state.lockScreenLocked = false
  writeLockScreenLocked(desktopLockScreenUserId(), false)
  state.lockScreenError = ''
  render()
}

function renderDesktopLockScreen() {
  const config = desktopLockScreenConfig()
  const hint = config?.hint || '暂未设置密码提示'
  return `<div class="desktop-lock-screen" role="dialog" aria-modal="true" aria-labelledby="desktop-lock-screen-title">
    <section class="desktop-lock-card">
      <div class="desktop-lock-icon" aria-hidden="true">${icon('lock')}</div>
      <div class="eyebrow">账号已锁定</div>
      <h1 id="desktop-lock-screen-title">Pulse 已锁定</h1>
      <p class="desktop-lock-account">${escapeHtml(state.profile.nickname || '当前账号')}</p>
      <div class="desktop-lock-hint">${icon('lightbulb')}<span>密码提示：${escapeHtml(hint)}</span></div>
      <form class="desktop-lock-form" data-desktop-unlock-form novalidate>
        <input data-desktop-lock-password name="password" type="password" autocomplete="current-password" placeholder="请输入锁屏密码" aria-label="锁屏密码" />
        <button type="submit">解锁</button>
      </form>
      ${state.lockScreenError ? `<p class="desktop-lock-error">${escapeHtml(state.lockScreenError)}</p>` : ''}
      <button type="button" class="desktop-lock-logout" data-action="lock-screen-logout">退出登录</button>
    </section>
  </div>`
}

function renderDesktopLockPasswordModal() {
  const hasPassword = desktopHasLockScreenPassword()
  const body = `<form class="desktop-modal-form desktop-lock-password-form" data-desktop-lock-screen-form novalidate>
    <p class="desktop-modal-hint">锁屏密码仅保存在当前电脑，用于保护当前登录会话。退出登录后仍保留；卸载重装软件后会清除，需重新设置。</p>
    <label class="desktop-input-dialog-field"><span>锁屏密码</span><input data-lock-screen-password name="password" type="password" autocomplete="new-password" maxlength="64" value="${escapeHtml(state.lockScreenPassword)}" placeholder="请输入 4-64 位密码" /></label>
    <label class="desktop-input-dialog-field"><span>确认密码</span><input data-lock-screen-password-confirm name="confirmPassword" type="password" autocomplete="new-password" maxlength="64" value="${escapeHtml(state.lockScreenPasswordConfirm)}" placeholder="请再次输入锁屏密码" /></label>
    <label class="desktop-input-dialog-field"><span>密码提示（可选）</span><input name="hint" type="text" maxlength="120" value="${escapeHtml(state.lockScreenPasswordHint)}" placeholder="例如：我最喜欢的颜色" /></label>
    ${state.lockScreenError ? `<div class="login-error">${escapeHtml(state.lockScreenError)}</div>` : ''}
    <div class="desktop-modal-actions"><button class="btn" type="button" data-modal-close>取消</button><button class="btn btn-primary" type="submit" ${state.lockScreenBusy ? 'disabled' : ''}>${state.lockScreenBusy ? '保存中…' : hasPassword ? '保存修改' : '保存锁屏密码'}</button></div>
  </form>`
  return modalFrame(hasPassword ? '修改锁屏密码' : '设置锁屏密码', '开启后可从顶部快速锁定电脑端。', body)
}

async function loadDesktopAccountSecurity(force = false) {
  if (state.accountSecurityLoading) return
  if (!force && state.accountSecurityLoaded) return
  state.accountSecurityLoading = true
  state.accountSecurityError = ''
  render()
  try {
    if (state.dataSource === 'remote') {
      const [security, devices] = await Promise.all([fetchDesktopAccountSecurity(), fetchDesktopDeviceSessions()])
      state.accountSecurity = {
        phone: security.phone || '',
        securityCodeEnabled: Boolean(security.securityCodeEnabled),
        securityCode: security.securityCode || '',
      }
      state.deviceSessions = Array.isArray(devices?.list) ? devices.list : []
      state.currentDeviceId = String(devices?.currentDeviceId || '')
      state.devicesLoaded = true
      state.deviceError = ''
    } else {
      state.accountSecurity = { phone: state.profile.phone || '', securityCodeEnabled: false, securityCode: '' }
    }
    state.accountSecurityLoaded = true
  } catch (error) {
    state.accountSecurityError = error instanceof Error ? error.message : '账号安全信息加载失败'
  } finally {
    state.accountSecurityLoading = false
    render()
  }
}

async function openDesktopAccountDeletion() {
  if (state.accountDeletionAgreementLoading) return
  if (state.dataSource !== 'remote') {
    showToast('请先登录在线账户后再注销账号')
    return
  }
  state.accountDeletionAgreementLoading = true
  state.accountDeletionError = ''
  state.accountDeletionAgreed = false
  state.modal = 'account-deletion-agreement'
  render()
  try {
    const [wallet, agreement] = await Promise.all([
      fetchDesktopWallet(),
      fetchDesktopSystemText('account_deletion_agreement'),
    ])
    state.accountDeletionBalance = Number(wallet?.balance || 0)
    state.accountDeletionAgreement = {
      title: agreement?.title || '账号注销协议',
      content: agreement?.content || '暂未配置账号注销协议，请联系管理员。',
    }
  } catch (error) {
    state.accountDeletionError = error instanceof Error ? error.message : '注销信息加载失败'
  } finally {
    state.accountDeletionAgreementLoading = false
    render()
  }
}

function continueDesktopAccountDeletion() {
  if (!state.accountDeletionAgreed) {
    showToast('请先阅读并同意注销协议')
    return
  }
  state.modal = 'confirm'
  state.confirmDialog = { type: 'delete-account' }
  render()
}

async function executeDesktopAccountDeletion() {
  try {
    await deleteDesktopAccount('account_deletion_agreement')
    showToast('账号已注销')
    clearDesktopSession()
    state.confirmDialog = null
    state.modal = ''
    state.authenticated = false
    state.dataSource = 'remote'
    render()
  } catch (error) {
    showToast(error instanceof Error ? error.message : '注销账号失败')
  }
}

async function openDesktopChangePhoneDialog() {
  if (state.dataSource !== 'remote') {
    showToast('请先登录在线账户后再修改手机号')
    return
  }
  const result = await openDesktopInputDialog({
    title: '修改手机号',
    subtitle: '验证码固定为 1234，修改成功后需要重新登录。',
    fields: [
      { name: 'newPhone', label: '新手机号', type: 'tel', inputmode: 'numeric', maxlength: 11, placeholder: '请输入新手机号', required: true },
      { name: 'code', label: '验证码（固定 1234）', inputmode: 'numeric', maxlength: 4, value: DESKTOP_ACCOUNT_SECURITY_CODE, placeholder: '请输入 1234', required: true },
    ],
    validate: (values) => {
      if (!/^1\d{10}$/.test(String(values.newPhone || '').trim())) return '请输入正确的手机号'
      if (String(values.code || '').trim() !== DESKTOP_ACCOUNT_SECURITY_CODE) return '验证码错误，请输入 1234'
      return ''
    },
  })
  if (!result) return
  const newPhone = String(result.newPhone || '').trim()
  try {
    await changeDesktopAccountPhone({ newPhone, code: DESKTOP_ACCOUNT_SECURITY_CODE })
    state.accountSecurity = { ...state.accountSecurity, phone: newPhone }
    state.profile = { ...state.profile, phone: newPhone }
    showToast('手机号修改成功，请重新登录')
    performDesktopLogout()
  } catch (error) {
    showToast(error instanceof Error ? error.message : '手机号修改失败')
  }
}

async function openDesktopChangePasswordDialog() {
  if (state.dataSource !== 'remote') {
    showToast('请先登录在线账户后再修改密码')
    return
  }
  const result = await openDesktopInputDialog({
    title: '修改密码',
    subtitle: '验证码固定为 1234，修改成功后需要重新登录。',
    fields: [
      { name: 'oldPassword', label: '当前密码', type: 'password', autocomplete: 'current-password', placeholder: '请输入当前密码', required: true },
      { name: 'newPassword', label: '新密码', type: 'password', autocomplete: 'new-password', placeholder: '请输入 6-32 位新密码', required: true },
      { name: 'confirmPassword', label: '确认新密码', type: 'password', autocomplete: 'new-password', placeholder: '请再次输入新密码', required: true },
      { name: 'code', label: '验证码（固定 1234）', inputmode: 'numeric', maxlength: 4, value: DESKTOP_ACCOUNT_SECURITY_CODE, placeholder: '请输入 1234', required: true },
    ],
    validate: (values) => {
      const oldPassword = String(values.oldPassword || '')
      const newPassword = String(values.newPassword || '')
      if (!oldPassword) return '请输入当前密码'
      if (newPassword.length < 6 || newPassword.length > 32) return '新密码长度需为 6-32 位'
      if (newPassword !== String(values.confirmPassword || '')) return '两次输入的新密码不一致'
      if (oldPassword === newPassword) return '新密码不能与当前密码相同'
      if (String(values.code || '').trim() !== DESKTOP_ACCOUNT_SECURITY_CODE) return '验证码错误，请输入 1234'
      return ''
    },
  })
  if (!result) return
  try {
    await changeDesktopAccountPassword({
      oldPassword: String(result.oldPassword || ''),
      newPassword: String(result.newPassword || ''),
      code: DESKTOP_ACCOUNT_SECURITY_CODE,
    })
    showToast('密码修改成功，请重新登录')
    performDesktopLogout()
  } catch (error) {
    showToast(error instanceof Error ? error.message : '密码修改失败')
  }
}

async function toggleDesktopSecurityCode(enabled) {
  if (state.securityCodeBusy) return
  const previous = { ...state.accountSecurity }
  state.accountSecurity = { ...state.accountSecurity, securityCodeEnabled: Boolean(enabled) }
  state.securityCodeBusy = true
  render()
  try {
    if (state.dataSource === 'remote') state.accountSecurity = await setDesktopSecurityCodeEnabled(Boolean(enabled))
    state.securityCodeVisible = false
    showToast(enabled ? '安全码已开启' : '安全码已关闭')
  } catch (error) {
    state.accountSecurity = previous
    showToast(error instanceof Error ? error.message : '安全码设置失败')
  } finally {
    state.securityCodeBusy = false
    render()
  }
}

async function refreshDesktopSecurityCodeValue() {
  if (state.securityCodeBusy) return
  state.securityCodeBusy = true
  render()
  try {
    if (state.dataSource === 'remote') state.accountSecurity = await refreshDesktopSecurityCode()
    else state.accountSecurity = { ...state.accountSecurity, securityCodeEnabled: true, securityCode: 'PULSE6' }
    state.securityCodeVisible = true
    showToast('安全码已更新，其他设备需重新验证')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '安全码更新失败')
  } finally {
    state.securityCodeBusy = false
    render()
  }
}

function desktopStorageBytes(storage) {
  let bytes = 0
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (!key) continue
    bytes += new Blob([key, storage.getItem(key) || '']).size
  }
  return bytes
}

async function loadDesktopStorage() {
  if (state.storageLoading) return
  state.storageLoading = true
  state.storageError = ''
  render()
  try {
    const local = desktopStorageBytes(localStorage) + desktopStorageBytes(sessionStorage)
    const cacheUsage = await getDesktopFileCacheUsage()
    const estimate = await navigator.storage?.estimate()
    state.storageUsage = {
      local,
      cache: cacheUsage.total,
      image: cacheUsage.image,
      video: cacheUsage.video,
      file: cacheUsage.file,
      audio: cacheUsage.audio,
      quota: Number(estimate?.quota || 0),
      total: cacheUsage.total,
    }
    state.storageUpdatedAt = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } catch (error) {
    state.storageError = error instanceof Error ? error.message : '存储空间读取失败'
  } finally {
    state.storageLoading = false
    render()
  }
}

async function clearDesktopStorage(kind = '') {
  if (state.storageLoading) return
  state.storageLoading = true
  render()
  try {
    await clearDesktopFileCache(kind || undefined)
    showToast('聊天文件缓存已清除，消息、服务器文件和另存为文件已保留')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '缓存清理失败')
  } finally {
    state.storageLoading = false
    await loadDesktopStorage()
  }
}

function requestClearDesktopStorage(kind = '') {
  if (state.storageLoading) return
  state.confirmDialog = { type: 'clear-storage', kind }
  state.modal = 'confirm'
  render()
}

async function loadDesktopHelp() {
  if (state.helpLoading) return
  if (state.dataSource !== 'remote') {
    state.helpQuestions = []
    state.helpError = '在线数据未加载，暂不能获取帮助内容'
    return
  }
  state.helpLoading = true
  state.helpError = ''
  render()
  try {
    state.helpQuestions = await fetchDesktopHelpQuestions()
  } catch (error) {
    state.helpError = error instanceof Error ? error.message : '帮助内容加载失败'
  } finally {
    state.helpLoading = false
    render()
  }
}

async function submitDesktopFeedbackForm() {
  const content = String(state.feedbackContent || '').trim()
  if (content.length < 2) return showToast('问题描述至少输入 2 个字')
  if (state.feedbackBusy) return
  state.feedbackBusy = true
  render()
  try {
    if (state.dataSource === 'remote') await submitDesktopFeedback(content)
    state.feedbackContent = ''
    showToast('反馈已提交，感谢你的帮助')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '反馈提交失败')
  } finally {
    state.feedbackBusy = false
    render()
  }
}

function deviceIconName(device) {
  const platform = String(device?.platform || '').toLowerCase()
  if (platform === 'windows' || platform === 'macos' || platform === 'linux') return 'grid'
  if (platform === 'android' || platform === 'ios') return 'smartphone'
  if (platform === 'web') return 'language'
  return 'person'
}

function deviceLoginLabel(device) {
  const loginAt = formatRemoteTime(device?.loginAt)
  return loginAt ? `登录时间 · ${loginAt}` : '登录时间未知'
}

function deviceLoginTimeValue(value) {
  const time = value ? Date.parse(value) : NaN
  return Number.isNaN(time) ? 0 : time
}

function desktopDeviceLabel(device) {
  return String(device?.name || '未知设备').trim() || '未知设备'
}

function displayDesktopDeviceSessions() {
  const sorted = [...state.deviceSessions]
    .filter((device) => String(device?.deviceId || '').trim())
    .sort((a, b) => deviceLoginTimeValue(b.loginAt) - deviceLoginTimeValue(a.loginAt))
  const currentIds = new Set(
    state.deviceSessions
      .filter((device) => device?.current || String(device?.deviceId || '') === String(state.currentDeviceId || ''))
      .map((device) => String(device.deviceId || '')),
  )
  const groups = new Map()
  const groupedPlatforms = new Set(['android', 'ios', 'windows', 'windows_web', 'web'])

  for (const device of sorted) {
    const deviceId = String(device.deviceId || '').trim()
    const platform = String(device.platform || '').toLowerCase()
    const label = desktopDeviceLabel(device)
    // 同一平台和设备名称可能因旧版本更新产生多个 device_id；页面只展示一行，
    // 同时保留所有底层 ID，退出时一起吊销，避免刷新后重复出现。
    const deviceKey = groupedPlatforms.has(platform)
      ? `${platform}|${label.toLowerCase()}`
      : `${platform}|${deviceId}`
    const existing = groups.get(deviceKey)
    if (existing) {
      existing.deviceIds.push(deviceId)
      existing.current = Boolean(existing.current || currentIds.has(deviceId))
      existing.trusted = Boolean(existing.trusted || device.trusted)
      existing.online = Boolean(existing.online || device.online)
      continue
    }
    groups.set(deviceKey, {
      ...device,
      deviceId,
      deviceKey,
      deviceIds: [deviceId],
      current: currentIds.has(deviceId),
      name: label,
    })
  }
  return [...groups.values()]
}

function isCurrentDesktopDevice(device) {
  return Boolean(device?.current)
    || (Boolean(state.currentDeviceId) && String(device?.deviceId || '') === state.currentDeviceId)
}

function renderDeviceRows() {
  if (state.dataSource !== 'remote') {
    return '<div class="device-empty">登录后将显示你在其他设备上的会话。</div>'
  }
  if (state.deviceLoading && !state.devicesLoaded) {
    return '<div class="device-empty">正在同步设备列表…</div>'
  }
  if (state.deviceError && !state.devicesLoaded) {
    return `<div class="device-empty device-error"><span>${escapeHtml(state.deviceError)}</span></div>`
  }
  const devices = displayDesktopDeviceSessions()
  if (!devices.length) {
    return '<div class="device-empty">暂无可管理的登录设备，请重新登录后再试。</div>'
  }
  return devices.map((device) => {
    const current = isCurrentDesktopDevice(device)
    const menuOpen = !current && state.deviceMenuId === device.deviceKey
    const title = desktopDeviceLabel(device)
    return `<div class="device-row ${current ? 'is-current' : ''}">
      <span class="device-icon">${icon(deviceIconName(device))}</span>
      <span class="device-copy"><strong>${escapeHtml(title)}${current ? ' · 本设备' : ''}</strong><small>${escapeHtml(deviceLoginLabel(device))}${device.trusted ? ' · 已验证' : ''}</small></span>
      ${current ? '<i class="device-current">当前设备</i>' : ''}
      ${current ? '' : menuOpen
        ? `<button type="button" class="device-row-action is-exit" data-device-revoke="${escapeHtml(device.deviceKey)}" aria-label="退出此设备">退出</button>`
        : `<button type="button" class="device-row-action" data-device-menu="${escapeHtml(device.deviceKey)}" aria-label="设备操作" aria-expanded="${menuOpen ? 'true' : 'false'}">${icon('more')}</button>`}
    </div>`
  }).join('')
}

function requestRevokeDevice(deviceId) {
  const device = displayDesktopDeviceSessions().find((item) => item.deviceKey === deviceId || item.deviceIds.includes(deviceId))
  if (!device || isCurrentDesktopDevice(device)) {
    showToast('当前设备请使用退出登录')
    return
  }
  state.deviceMenuId = ''
  state.confirmDialog = { type: 'revoke-device', deviceId: device.deviceKey, deviceName: desktopDeviceLabel(device) }
  state.modal = 'confirm'
  render()
}

async function revokeDeviceSession(deviceId) {
  if (!deviceId || state.deviceLoading) return
  const device = displayDesktopDeviceSessions().find((item) => item.deviceKey === deviceId || item.deviceIds.includes(deviceId))
  if (!device || isCurrentDesktopDevice(device)) return
  state.deviceLoading = true
  render()
  try {
    await Promise.all(device.deviceIds.map((item) => revokeDesktopDevice(item)))
    showToast('设备已退出登录')
    state.devicesLoaded = false
    state.deviceLoading = false
    await loadDesktopDevices(true)
  } catch (error) {
    state.deviceError = error instanceof Error ? error.message : '设备退出失败'
  } finally {
    state.deviceLoading = false
    render()
  }
}

async function revokeOtherDeviceSessions() {
  if (state.deviceLoading) return
  state.deviceLoading = true
  render()
  try {
    const result = await revokeDesktopOtherDevices()
    showToast(Number(result?.count || 0) ? `已退出 ${result.count} 台其他设备` : '没有其他登录设备')
    state.devicesLoaded = false
    state.deviceLoading = false
    await loadDesktopDevices(true)
  } catch (error) {
    state.deviceError = error instanceof Error ? error.message : '设备退出失败'
  } finally {
    state.deviceLoading = false
    render()
  }
}

async function loadDesktopFiles(force = false) {
  if (!state.authenticated || state.dataSource !== 'remote' || state.fileLoading) return
  if (state.fileLoaded && !force) return
  const sourceConversations = conversations.filter((conversation) => conversation?.id)
  state.fileLoading = true
  state.fileError = ''
  render()
  try {
    const results = await Promise.allSettled(sourceConversations.map(async (conversation) => {
      const messages = await fetchDesktopMessages(String(conversation.id), 200)
      return messages
        .map(mapRemoteMessage)
        .map((message) => desktopFileItemFromMessage(message, conversation))
        .filter(Boolean)
    }))
    const items = results.flatMap((result) => result.status === 'fulfilled' ? result.value : [])
    const failures = results.filter((result) => result.status === 'rejected').length
    const uniqueItems = new Map(items.map((item) => [item.id, item]))
    state.fileItems = [...uniqueItems.values()]
    state.fileLoaded = true
    if (!state.fileItems.length && failures === results.length && results.length > 0) {
      throw results.find((result) => result.status === 'rejected')?.reason || new Error('鏂囦欢鍒楄〃鍔犺浇澶辫触')
    }
    if (failures > 0 && state.fileItems.length > 0) {
      state.fileError = `閮ㄥ垎鑱婂ぉ鏂囦欢鏆傛椂鏃犳硶鍔犺浇（${failures}）`
    }
  } catch (error) {
    state.fileItems = []
    state.fileLoaded = false
    state.fileError = error instanceof Error ? error.message : '鏂囦欢鍒楄〃鍔犺浇澶辫触'
  } finally {
    state.fileLoading = false
    render()
  }
}

async function loadSelectedMessages() {
  const selected = conversations[state.selectedConversation]
  if (!state.authenticated || !selected?.id) return
  if (state.dataSource !== 'remote') {
    stopDesktopReadStatePolling()
    void loadDesktopSharedContentCounts(selected)
    return
  }
  startDesktopReadStatePolling(selected.id)
  if (state.loadingMessages && state.loadingMessagesConversationId === String(selected.id)) return
  const conversationKey = String(selected.id)
  const firstOpen = !state.chatOpenedByConversation[conversationKey]
  state.chatOpenedByConversation[conversationKey] = true
  const shouldOpenAtLatest = firstOpen || state.scrollChatToBottom || Number(selected.unread || 0) > 0
  const hadUnread = Number(selected.unread || 0) > 0
  const previousMessagesSignature = desktopMessagesSignature(state.messagesByConversation[selected.id] || [])
  let messagesChanged = false
  state.loadingMessages = true
  state.loadingMessagesConversationId = String(selected.id)
  try {
    const remoteMessages = await fetchDesktopMessages(selected.id)
    const nextMessages = remoteMessages.map(mapRemoteMessage)
    messagesChanged = desktopMessagesSignature(nextMessages) !== previousMessagesSignature
    state.messagesByConversation[selected.id] = nextMessages
    scheduleDesktopFileMetadataHydrationForMessages(selected.id, nextMessages)
    refreshDesktopConversationPreview(selected.id)
    void loadDesktopSharedContentCounts(selected, true, false)
    state.mentionJumpIds = selected.mentionUnread && selected.type === 'group'
      ? state.messagesByConversation[selected.id]
        .filter((message) => message.mentionedMe && !message.mine && message.id)
        .map((message) => String(message.id))
      : []
    selected.mentionUnread = false
    state.burnClock = Date.now()
    removeExpiredDesktopMessages()
    void loadDesktopConversationSettings(selected)
    try {
      state.readStatesByConversation[selected.id] = mergeReadState(
        state.readStatesByConversation[selected.id],
        await fetchDesktopConversationReadStates(selected.id),
      )
    } catch {
      delete state.readStatesByConversation[selected.id]
    }
    try {
      const readReceipt = await markDesktopConversationRead(selected.id)
      if (readReceipt && typeof readReceipt === 'object') {
        applyReadReceipt({
          ...readReceipt,
          conversationId: selected.id,
          fromUserId: String(state.profile.userId || ''),
        })
      }
    } catch {
      // 即使已读回执网络失败，当前会话也应立即清除本地未读角标。
    }
    selected.unread = 0
    if (selected.type === 'group') void loadDesktopGroupDetail(selected, false, false)
  } catch {
    // Keep the visual prototype messages available while the server is offline.
  } finally {
    if (state.loadingMessagesConversationId === String(selected.id)) {
      state.loadingMessages = false
      state.loadingMessagesConversationId = ''
    }
    const stillSelected = String(conversations[state.selectedConversation]?.id) === String(selected.id)
    if (shouldOpenAtLatest && stillSelected) state.scrollChatToBottom = true
    if (stillSelected && (messagesChanged || hadUnread || shouldOpenAtLatest)) requestDesktopRender()
  }
}

async function loadFavorites() {
  if (state.dataSource !== 'remote' || state.favoritesLoading || state.favoritesLoaded) return
  state.favoritesLoading = true
  render()
  try {
    state.favorites = await fetchDesktopFavorites()
    state.favoritesLoaded = true
  } catch (error) {
    showToast(error instanceof Error ? error.message : '收藏加载失败')
  } finally {
    state.favoritesLoading = false
    render()
  }
}

function walletYuan(cents) {
  return `¥${(Number(cents || 0) / 100).toFixed(2)}`
}

function walletTradeLabel(type) {
  return type === 'RED_PACKET' ? '红包' : type === 'TRANSFER' ? '转账' : '余额调整'
}

function walletTradeIcon(type) {
  return type === 'RED_PACKET' ? 'gift' : type === 'TRANSFER' ? 'money' : 'settings'
}

function walletFormatTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value || '')
  return date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}

async function loadWallet() {
  if (!isDesktopWalletEnabled()) return
  if (state.dataSource !== 'remote') {
    state.walletSummary = { balance: 0, hasPaymentPassword: false }
    state.walletTransactions = []
    state.walletError = '在线数据未加载，暂不能获取钱包数据'
    return
  }
  if (state.walletLoading) return
  state.walletLoading = true
  state.walletError = ''
  render()
  try {
    const params = {
      type: state.walletType || undefined,
      from: state.walletFrom ? `${state.walletFrom}T00:00:00+08:00` : undefined,
      to: state.walletTo ? `${state.walletTo}T23:59:59+08:00` : undefined,
    }
    const [summary, transactions, amountConfig] = await Promise.all([
      fetchDesktopWallet(),
      fetchDesktopWalletTransactions(params),
      fetchDesktopWalletAmountConfig(),
    ])
    state.walletSummary = summary
    state.walletTransactions = transactions
    state.walletAmountConfig = amountConfig
  } catch (error) {
    state.walletError = error instanceof Error ? error.message : '钱包加载失败'
  } finally {
    state.walletLoading = false
    render()
  }
}

function resetWalletFilters() {
  state.walletType = ''
  state.walletFrom = ''
  state.walletTo = ''
  void loadWallet()
}

async function submitDesktopPaymentPassword() {
  if (state.walletPasswordBusy) return
  const oldPassword = state.walletOldPassword.trim()
  const password = state.walletNewPassword.trim()
  const confirmPassword = state.walletConfirmPassword.trim()
  if (state.walletSummary.hasPaymentPassword && !/^\d{6}$/.test(oldPassword)) {
    state.walletPasswordError = '请输入原支付密码（6位数字）'
    render()
    return
  }
  if (!/^\d{6}$/.test(password)) {
    state.walletPasswordError = '支付密码必须是6位数字'
    render()
    return
  }
  if (password !== confirmPassword) {
    state.walletPasswordError = '两次输入的支付密码不一致'
    render()
    return
  }
  state.walletPasswordBusy = true
  state.walletPasswordError = ''
  try {
    await setDesktopPaymentPassword(password, state.walletSummary.hasPaymentPassword ? oldPassword : undefined)
    state.walletSummary = { ...state.walletSummary, hasPaymentPassword: true }
    state.walletPasswordDialog = false
    state.walletOldPassword = ''
    state.walletNewPassword = ''
    state.walletConfirmPassword = ''
    showToast('支付密码已设置')
    const resolver = walletPasswordResolver
    walletPasswordResolver = null
    resolver?.(true)
  } catch (error) {
    state.walletPasswordError = error instanceof Error ? error.message : '支付密码设置失败'
  } finally {
    state.walletPasswordBusy = false
    render()
  }
}

function openDesktopWalletPasswordDialog() {
  if (walletPasswordResolver) return Promise.resolve(false)
  return new Promise((resolve) => {
    walletPasswordResolver = resolve
    state.walletPasswordDialog = true
    state.walletPasswordError = ''
    state.walletOldPassword = ''
    state.walletNewPassword = ''
    state.walletConfirmPassword = ''
    state.modal = 'wallet-password'
    render()
  })
}

function desktopRedPacketCanReceive(packet) {
  if (!packet || state.redPacketReceiving) return false
  const currentUserId = String(state.profile.userId || '')
  const packetType = String(packet.packet_type ?? packet.packetType ?? '')
  const status = String(packet.status || '')
  const receives = Array.isArray(packet.receives) ? packet.receives : []
  const receivedByMe = Boolean(packet.receivedByMe)
    || receives.some((item) => String(item.user_id ?? item.userId) === currentUserId)
  if (status !== 'ACTIVE' || receivedByMe) return false
  const senderIsMe = String(packet.sender_id ?? packet.senderId) === currentUserId
  const conversationType = Number(packet.conversation_type ?? packet.conversationType)
  const senderCanReceive = conversationType === 2 && (packetType === 'NORMAL' || packetType === 'LUCKY')
  const targetUserId = String(packet.target_user_id ?? packet.targetUserId ?? '')
  const exclusiveAllowsMe = packetType !== 'EXCLUSIVE' || targetUserId === currentUserId
  return (!senderIsMe || senderCanReceive) && exclusiveAllowsMe
}

function desktopRedPacketReceivedByMe(packet) {
  const currentUserId = String(state.profile.userId || '')
  const receives = Array.isArray(packet?.receives) ? packet.receives : []
  return receives.find((item) => String(item.user_id ?? item.userId) === currentUserId)
    || Boolean(packet?.receivedByMe)
}

function desktopBusinessUserName(userId, fallback = '用户') {
  return String(userId || '') === String(state.profile.userId || '')
    ? '我'
    : String(fallback || '用户')
}

function renderDesktopRedPacketModal() {
  if (state.redPacketDetailLoading) {
    return modalFrame('红包详情', '正在加载红包信息', '<div class="desktop-modal-hint">正在加载…</div>')
  }
  if (state.redPacketError) {
    return modalFrame('红包详情', '红包信息', `<div class="desktop-modal-empty"><div class="login-error">${escapeHtml(state.redPacketError)}</div></div>`)
  }
  const packet = state.redPacketDetail
  if (!packet) return modalFrame('红包详情', '红包信息', '<div class="desktop-modal-empty">红包不存在</div>')
  const packetType = String(packet.packet_type ?? packet.packetType ?? '')
  const packetTypeLabels = { NORMAL: '普通红包', LUCKY: '拼手气红包', EXCLUSIVE: '专属红包', PRIVATE: '私聊红包' }
  const totalAmount = Number(packet.total_amount ?? packet.totalAmount ?? 0)
  const receivedAmount = Number(packet.received_amount ?? packet.receivedAmount ?? 0)
  const receivedByMe = desktopRedPacketReceivedByMe(packet)
  const mine = receivedByMe && typeof receivedByMe === 'object' ? Number(receivedByMe.amount || 0) : 0
  const receives = Array.isArray(packet.receives) ? packet.receives : []
  const receiverRows = receives.length
    ? receives.map((item) => {
      const receiverId = String(item.user_id ?? item.userId ?? '')
      const isMe = receiverId === String(state.profile.userId || '')
      const name = desktopBusinessUserName(receiverId, item.nickname || item.user_name)
      const identity = isMe ? '本人领取' : '领取人'
      return `<div class="desktop-redpacket-receiver ${isMe ? 'is-me' : ''}"><span><strong>${escapeHtml(name)}</strong><small>${identity}</small></span><strong>${walletYuan(item.amount)}</strong></div>`
    }).join('')
    : '<div class="desktop-modal-hint">还没有人领取</div>'
  const canReceive = desktopRedPacketCanReceive(packet)
  const action = canReceive
    ? `<button class="btn btn-primary" type="button" data-red-packet-receive ${state.redPacketReceiving ? 'disabled' : ''}>${state.redPacketReceiving ? '领取中…' : '领取红包'}</button>`
    : `<span class="desktop-redpacket-status">${receivedByMe ? `已领取${mine ? ` · ${walletYuan(mine)}` : ''}` : packet.status === 'FINISHED' ? '红包已领完' : packet.status === 'EXPIRED' ? '红包已过期' : '当前不可领取'}</span>`
  const senderId = String(packet.sender_id ?? packet.senderId ?? '')
  const senderName = desktopBusinessUserName(senderId, packet.sender_name || '好友')
  const body = `<div class="desktop-redpacket-detail"><div class="desktop-redpacket-cover"><strong>${escapeHtml(senderName)}的${escapeHtml(packetTypeLabels[packetType] || '红包')}</strong><p>${escapeHtml(String(packet.greeting || '恭喜发财，大吉大利'))}</p><b>${walletYuan(totalAmount)}</b><small>已领取 ${walletYuan(receivedAmount)}</small></div><div class="desktop-redpacket-summary"><span>${escapeHtml(packetTypeLabels[packetType] || '红包')}</span><span>${Number(packet.received_count || packet.receivedCount || 0)}/${Number(packet.total_count || packet.totalCount || 0)} 个</span></div><div class="desktop-redpacket-receivers">${receiverRows}</div><div class="desktop-modal-actions">${action}</div></div>`
  return modalFrame('红包详情', '查看红包并领取', body)
}

async function openDesktopRedPacket(packetNo) {
  // The desktop wallet switch only hides wallet/send entry points. Incoming
  // red packets remain actionable so users can still receive them in chat.
  if (!packetNo || state.dataSource !== 'remote') return
  state.redPacketDetail = null
  state.redPacketDetailLoading = true
  state.redPacketReceiving = false
  state.redPacketError = ''
  state.modal = 'redpacket-detail'
  render()
  try {
    state.redPacketDetail = await fetchDesktopRedPacket(String(packetNo))
  } catch (error) {
    state.redPacketError = error instanceof Error ? error.message : '红包详情加载失败'
  } finally {
    state.redPacketDetailLoading = false
    render()
  }
}

async function receiveDesktopRedPacketFlow() {
  const packet = state.redPacketDetail
  const packetNo = String(packet?.packet_no ?? packet?.packetNo ?? '')
  if (!packetNo || !desktopRedPacketCanReceive(packet)) return
  state.redPacketReceiving = true
  render()
  try {
    state.redPacketDetail = await receiveDesktopRedPacket(packetNo)
    await loadSelectedMessages()
    const received = desktopRedPacketReceivedByMe(state.redPacketDetail)
    showDesktopReceiveSuccess('redpacket', received && typeof received === 'object' ? walletYuan(received.amount) : '')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '红包领取失败')
  } finally {
    state.redPacketReceiving = false
    if (!state.receiveSuccessVisible) render()
  }
}

function desktopTransferCanReceive(transfer) {
  if (!transfer || state.transferReceiving) return false
  return String(transfer.status || '') === 'PENDING'
    && String(transfer.receiver_id ?? transfer.receiverId ?? '') === String(state.profile.userId || '')
}

function renderDesktopTransferModal() {
  if (state.transferDetailLoading) {
    return modalFrame('转账详情', '正在加载转账信息', '<div class="desktop-modal-hint">正在加载…</div>')
  }
  if (state.transferError) {
    return modalFrame('转账详情', '转账信息', `<div class="desktop-modal-empty"><div class="login-error">${escapeHtml(state.transferError)}</div></div>`)
  }
  const transfer = state.transferDetail
  if (!transfer) return modalFrame('转账详情', '转账信息', '<div class="desktop-modal-empty">转账不存在</div>')
  const currentUserId = String(state.profile.userId || '')
  const senderIsMe = String(transfer.sender_id ?? transfer.senderId ?? '') === currentUserId
  const receiverIsMe = String(transfer.receiver_id ?? transfer.receiverId ?? '') === currentUserId
  const status = String(transfer.status || '').toUpperCase()
  const received = status === 'RECEIVED'
  const expired = status === 'EXPIRED'
  const senderName = desktopBusinessUserName(transfer.sender_id ?? transfer.senderId, transfer.sender_name || '好友')
  const receiverName = desktopBusinessUserName(transfer.receiver_id ?? transfer.receiverId, transfer.receiver_name || '收款人')
  const title = senderIsMe ? `我向${receiverName}转账` : `${senderName}向你转账`
  const canReceive = desktopTransferCanReceive(transfer)
  const action = canReceive
    ? `<button class="btn btn-primary" type="button" data-transfer-receive ${state.transferReceiving ? 'disabled' : ''}>${state.transferReceiving ? '处理中…' : '收款'}</button>`
    : `<span class="desktop-transfer-status">${received ? '已收款，款项已存入零钱' : expired ? '转账已过期' : '待收款'}</span>`
  const participants = `<div class="desktop-transfer-participants"><div><span>转出方</span><strong>${escapeHtml(senderName)}</strong></div><i>${icon('arrow')}</i><div><span>收款方</span><strong>${escapeHtml(receiverName)}</strong></div></div>`
  const body = `<div class="desktop-transfer-detail"><div class="desktop-transfer-cover"><strong>${escapeHtml(title)}</strong><b>${walletYuan(transfer.amount)}</b><p>${escapeHtml(String(transfer.remark || '转账'))}</p></div>${participants}${received ? '<div class="desktop-transfer-received">✓ 已收款，款项已存入零钱</div>' : ''}<div class="desktop-transfer-meta"><span>转账状态</span><strong>${received ? '已收款' : expired ? '已过期' : '待收款'}</strong></div><div class="desktop-modal-actions">${action}</div></div>`
  return modalFrame('转账详情', '查看转账并收款', body)
}

async function openDesktopTransfer(transferNo) {
  // Keep incoming transfers available when the desktop wallet/send entry is off.
  if (!transferNo || state.dataSource !== 'remote') return
  state.transferDetail = null
  state.transferDetailLoading = true
  state.transferReceiving = false
  state.transferError = ''
  state.modal = 'transfer-detail'
  render()
  try {
    state.transferDetail = await fetchDesktopTransfer(String(transferNo))
  } catch (error) {
    state.transferError = error instanceof Error ? error.message : '转账详情加载失败'
  } finally {
    state.transferDetailLoading = false
    render()
  }
}

async function receiveDesktopTransferFlow() {
  const transfer = state.transferDetail
  const transferNo = String(transfer?.transfer_no ?? transfer?.transferNo ?? '')
  if (!transferNo || !desktopTransferCanReceive(transfer)) return
  state.transferReceiving = true
  render()
  try {
    state.transferDetail = await receiveDesktopTransfer(transferNo)
    await loadSelectedMessages()
    showDesktopReceiveSuccess('transfer', walletYuan(state.transferDetail.amount))
  } catch (error) {
    showToast(error instanceof Error ? error.message : '转账收款失败')
  } finally {
    state.transferReceiving = false
    if (!state.receiveSuccessVisible) render()
  }
}

function showDesktopReceiveSuccess(kind, amount = '') {
  if (receiveSuccessTimer) window.clearTimeout(receiveSuccessTimer)
  state.receiveSuccessKind = kind === 'transfer' ? 'transfer' : 'redpacket'
  state.receiveSuccessAmount = String(amount || '')
  state.receiveSuccessVisible = true
  render()
  receiveSuccessTimer = window.setTimeout(() => {
    state.receiveSuccessVisible = false
    receiveSuccessTimer = null
    render()
  }, 1850)
}

function renderDesktopReceiveSuccess() {
  const transfer = state.receiveSuccessKind === 'transfer'
  const particles = Array.from({ length: 10 }, (_, index) => `<i style="--particle-index:${index + 1}"></i>`).join('')
  return `<div class="desktop-receive-success-layer ${transfer ? 'transfer' : 'redpacket'}" role="status" aria-live="polite"><div class="desktop-receive-success-rays" aria-hidden="true"></div><div class="desktop-receive-success-particles" aria-hidden="true">${particles}</div><div class="desktop-receive-success-card"><div class="desktop-receive-success-icon">${icon(transfer ? 'money' : 'gift')}</div><strong>${transfer ? '收款成功' : '领取成功'}</strong>${state.receiveSuccessAmount ? `<b>${escapeHtml(state.receiveSuccessAmount)}</b>` : ''}<small>${transfer ? '款项已存入零钱' : '红包已存入零钱'}</small></div></div>`
}

async function openWalletTransactionDetail(id) {
  if (!id) return
  state.walletDetailLoading = true
  state.walletDetail = null
  state.modal = 'wallet-detail'
  render()
  try {
    state.walletDetail = state.dataSource === 'remote'
      ? await fetchDesktopWalletTransaction(id)
      : state.walletTransactions.find((item) => String(item.id) === String(id)) || null
  } catch (error) {
    state.walletError = error instanceof Error ? error.message : '交易详情加载失败'
  } finally {
    state.walletDetailLoading = false
    render()
  }
}

async function searchCurrentConversation() {
  const selected = conversations[state.selectedConversation]
  if (!selected?.id) return
  const result = await openDesktopInputDialog({
    title: '搜索当前聊天',
    subtitle: `在“${selected.name}”中查找消息`,
    fields: [{ name: 'keyword', label: '关键词', value: state.messageSearchQuery, placeholder: '输入要查找的内容', type: 'search' }],
  })
  if (!result) return
  state.messageSearchQuery = String(result.keyword || '').trim()
  if (!state.messageSearchQuery) {
    void loadSelectedMessages()
    return
  }
  if (state.dataSource !== 'remote') {
  const matches = currentMessages(selected).filter((message) => message.content.toLowerCase().includes(state.messageSearchQuery.toLowerCase()))
    state.messagesByConversation[selected.id] = matches
    render()
    showToast(`找到 ${matches.length} 条消息`)
    return
  }
  state.loadingMessages = true
  render()
  try {
    const result = await searchDesktopMessages(selected.id, state.messageSearchQuery)
    const mappedMessages = result.map(mapRemoteMessage)
    state.messagesByConversation[selected.id] = mappedMessages
    scheduleDesktopFileMetadataHydrationForMessages(selected.id, mappedMessages)
    showToast(`找到 ${result.length} 条消息`)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '消息搜索失败')
  } finally {
    state.loadingMessages = false
    render()
  }
}

function sharedContentLabel(filter) {
  return filter === 'file' ? '共享文件' : '共享图片与视频'
}

function isDesktopSharedContentMessage(message, filter) {
  const type = Number(message?.msgType || 0)
  if (filter === 'media') return type === 1 || desktopIsBurnMedia(message)
  if (filter === 'file') return type === 2 && !desktopIsBurnMedia(message)
  return false
}

async function openDesktopSharedContent(filter) {
  const selected = conversations[state.selectedConversation]
  const normalizedFilter = filter === 'file' ? 'file' : 'media'
  if (!selected?.id) return

  state.sharedContentFilter = normalizedFilter
  state.sharedContentMessages = []
  state.sharedContentLoading = true
  state.sharedContentError = ''
  state.sharedContentMenu = null
  state.modal = 'shared-content'
  render()

  try {
    if (state.dataSource !== 'remote') {
      state.sharedContentMessages = currentMessages(selected).filter((message) => (
        isDesktopSharedContentMessage(message, normalizedFilter)
      ))
      const counts = countSharedContentMessages(currentMessages(selected))
      state.sharedContentCountsByConversation[String(selected.id)] = counts
      return
    }
    const result = await searchDesktopMessages(selected.id, '', { filter: normalizedFilter })
    state.sharedContentMessages = result.map(mapRemoteMessage)
    const counts = state.sharedContentCountsByConversation[String(selected.id)] || { media: null, file: null }
    state.sharedContentCountsByConversation[String(selected.id)] = {
      ...counts,
      [normalizedFilter]: result.length,
    }
  } catch (error) {
    state.sharedContentError = error instanceof Error ? error.message : `${sharedContentLabel(normalizedFilter)}加载失败`
  } finally {
    state.sharedContentLoading = false
    render()
  }
}

function getDesktopSharedContentMenuPosition(event) {
  const menuWidth = 184
  const menuHeight = 164
  const gap = 8
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight
  const x = Number(event.clientX || 0)
  const y = Number(event.clientY || 0)
  const left = x + gap + menuWidth <= viewportWidth - 8 ? x + gap : x - menuWidth - gap
  const top = y + gap + menuHeight <= viewportHeight - 8 ? y + gap : y - menuHeight - gap
  return {
    left: Math.max(8, Math.min(left, viewportWidth - menuWidth - 8)),
    top: Math.max(8, Math.min(top, viewportHeight - menuHeight - 8)),
  }
}

function renderDesktopSharedContentMenu() {
  const menu = state.sharedContentMenu
  if (!menu || state.sharedContentFilter !== 'file') return ''
  const left = Math.max(8, Number(menu.left || 0))
  const top = Math.max(8, Number(menu.top || 0))
  const item = (action, label, extra = '') => `<button type="button" data-shared-content-action="${action}" data-shared-content-message-id="${escapeHtml(menu.messageId)}"${extra}>${label}</button>`
  return `<div class="file-context-menu desktop-shared-content-context-menu" data-shared-content-menu style="left:${left}px;top:${top}px" role="menu" aria-label="共享文件操作">
    ${item('forward', `${icon('share')}转发`)}
    ${item('download', `${icon('download')}下载到本地`)}
    ${item('delete', `${icon('close')}删除`, ' class="danger"')}
  </div>`
}

function desktopSharedContentMessage(messageId) {
  const id = String(messageId || '')
  return (state.sharedContentMessages || []).find((message) => String(message.id) === id) || null
}

function openDesktopSharedContentFile(message) {
  if (desktopIsBurnMessage(message)) {
    showToast('阅后即焚文件不能复制或保存')
    return
  }
  const file = parseDesktopFile(message?.content)
  if (!file?.url && !file?.fileId) {
    showToast('文件地址无效')
    return
  }
  openDesktopFilePreview({
    url: resolveDesktopFileUrl(file.originalUrl || file.url || desktopFileDownloadUrl(file.fileId)),
    fileId: file.fileId || message?.fileId || '',
    name: file.name || '文件',
    size: Number(file.size || 0),
    contentType: file.contentType || 'application/octet-stream',
  })
}

async function downloadDesktopSharedContentFile(message) {
  if (desktopIsBurnMessage(message)) throw new Error('阅后即焚文件不能复制或保存')
  const file = parseDesktopFile(message?.content)
  if (!file?.url && !file?.fileId) throw new Error('文件地址无效')
  const source = resolveDesktopFileUrl(file.originalUrl || file.url || desktopFileDownloadUrl(file.fileId))
  const blob = file.fileId
    ? await fetchDesktopCachedFileBlob(String(file.fileId), 'file', 'original', () => fetchDesktopProtectedBlob(source, 'file', false))
    : await fetchDesktopProtectedBlob(source, 'file')
  await saveDesktopBlobAs(blob, file.name || '文件')
}

async function handleDesktopSharedContentAction(action, messageId) {
  const selected = conversations[state.selectedConversation]
  const message = desktopSharedContentMessage(messageId)
  state.sharedContentMenu = null
  if (!selected?.id || !message) return
  if (desktopIsBurnMessage(message) && action !== 'delete') {
    showToast('阅后即焚消息不能复制、保存或转发')
    render()
    return
  }
  render()
  if (action === 'forward') {
    openDesktopMessageForward([message.id])
    return
  }
  if (action === 'download') {
    try {
      await downloadDesktopSharedContentFile(message)
      showToast('文件已下载到本地')
    } catch (error) {
      if (error?.name !== 'AbortError') showToast(error instanceof Error ? error.message : '文件下载失败')
    }
    return
  }
  if (action === 'delete') {
    beginDesktopMessageDelete([message.id], 'self')
  }
}

function normalizeDesktopMessageIds(value) {
  const values = Array.isArray(value) ? value : [value]
  return [...new Set(values.map((item) => String(item || '')).filter(Boolean))]
}

function clearDesktopMessageSelection() {
  state.messageSelection = new Set()
  state.messageMultiMode = false
}

function toggleDesktopMessageSelection(messageId) {
  const id = String(messageId || '')
  if (!id) return
  const next = new Set(state.messageSelection)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  state.messageSelection = next
  render()
}

function handleDesktopMessageMultiInteraction(event, element) {
  if (!state.messageMultiMode) return false
  const row = element?.closest?.('[data-message-multi-selectable]')
  if (!row) return false
  if (event.__pulseMessageMultiHandled) return true
  event.__pulseMessageMultiHandled = true
  event.preventDefault()
  event.stopPropagation()
  toggleDesktopMessageSelection(row.dataset.messageId)
  return true
}

function desktopMessageRowAtY(stream, clientY) {
  const rows = [...stream.querySelectorAll('[data-message-multi-selectable]')]
  let closest = null
  let closestDistance = Number.POSITIVE_INFINITY
  rows.forEach((row) => {
    const rect = row.getBoundingClientRect()
    const distance = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0
    if (distance < closestDistance) {
      closest = row
      closestDistance = distance
    }
  })
  if (!closest || closestDistance > 18) return null
  return closest
}

function beginDesktopMessageDelete(messageIds, mode = 'self') {
  const selected = conversations[state.selectedConversation]
  const ids = normalizeDesktopMessageIds(messageIds)
  if (!selected?.id || !ids.length) return
  state.messageMenu = null
  state.fileMenu = null
  state.confirmDialog = {
    type: 'delete-message',
    messageIds: ids,
    mode,
    conversationId: String(selected.id),
  }
  state.modal = 'confirm'
  render()
}

function openDesktopMessageForward(messageIds) {
  const selected = conversations[state.selectedConversation]
  const ids = normalizeDesktopMessageIds(messageIds)
  if (!selected?.id || !ids.length) return
  if (state.dataSource !== 'remote') {
    showToast('在线数据未加载，暂不支持转发到服务器')
    return
  }
  state.messageMenu = null
  state.messageForwardIds = ids
  state.messageForwardTargets = new Set()
  state.messageForwardMode = ids.length > 1 ? 'merge' : 'separate'
  state.modalError = ''
  state.modal = 'message-forward'
  render()
}

async function submitDesktopMessageForward() {
  const selected = conversations[state.selectedConversation]
  const targets = [...state.messageForwardTargets]
  const ids = normalizeDesktopMessageIds(state.messageForwardIds)
  if (!selected?.id || !ids.length || !targets.length) {
    state.modalError = '请至少选择一个转发会话'
    render()
    return
  }
  state.modalBusy = true
  state.modalError = ''
  render()
  try {
    const result = await forwardDesktopMessages(selected.id, targets, ids, state.messageForwardMode)
    resetModal()
    showToast(`已转发 ${Number(result?.count || ids.length)} 条消息`)
  } catch (error) {
    state.modalBusy = false
    state.modalError = error instanceof Error ? error.message : '消息转发失败'
    render()
  }
}

async function deleteDesktopMessageSelection(selected, messages, mode, messageIds = []) {
  const ids = messageIds.length
    ? normalizeDesktopMessageIds(messageIds)
    : messages.map((message) => String(message.id))
  if (!ids.length) return
  if (state.dataSource === 'remote') await deleteDesktopMessages(selected.id, ids, mode)
  state.messagesByConversation[selected.id] = currentMessages(selected).filter((message) => !ids.includes(String(message.id)))
  state.fileItems = state.fileItems.filter((item) => (
    String(item.conversationId || '') !== String(selected.id) || !ids.includes(String(item.messageId || ''))
  ))
  invalidateSharedContentCounts(selected.id)
  refreshDesktopConversationPreview(selected.id)
  clearDesktopMessageSelection()
  showToast(mode === 'both' ? '已双向删除消息' : '已删除消息')
}

async function handleMessageAction(action, messageId, confirmed = false) {
  const selected = conversations[state.selectedConversation]
  if (!selected?.id) return
  const ids = normalizeDesktopMessageIds(messageId)
  const messages = currentMessages(selected).filter((item) => ids.includes(String(item.id)))
  const message = messages[0]
  dismissDesktopMessageMenu()

  if (action === 'multi-select') {
    state.messageMultiMode = true
    state.messageSelection = new Set(ids)
    render()
    return
  }
  if (action === 'forward') {
    openDesktopMessageForward(ids)
    return
  }
  if (action === 'quote') {
    if (!message) return
    state.replyTarget = message
    render()
    setTimeout(() => document.querySelector('[data-message-composer]')?.focus(), 0)
    return
  }
  if ((action === 'delete' || action === 'delete-self' || action === 'delete-both') && ids.length) {
    const mode = action === 'delete-both' ? 'both' : 'self'
    if (!confirmed) {
      beginDesktopMessageDelete(ids, mode)
      return
    }
    try {
      await deleteDesktopMessageSelection(selected, messages, mode, ids)
    } catch (error) {
      showToast(error instanceof Error ? error.message : '消息删除失败')
    } finally {
      render()
    }
    return
  }
  if (!message) return
  if (action === 'edit-image') {
    const image = desktopMessageImageInfo(message)
    if (!image) return
    const editUrl = image.originalUrl || image.url
    state.mediaActionBusy = 'edit'
    state.mediaPreview = {
      ...image,
      url: editUrl,
      usingOriginal: Boolean(image.originalUrl),
      type: 'image',
      conversationId: String(selected.id),
      messageId: String(message.id || ''),
    }
    state.mediaEditor = createDesktopMediaEditor()
    render()
    try {
      await preloadDesktopProtectedMedia(editUrl, 'image')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '图片加载失败')
    } finally {
      state.mediaActionBusy = ''
      if (state.mediaPreview) render()
    }
    return
  }
  if (action === 'copy' && desktopIsBurnMessage(message)) {
    showToast('阅后即焚消息不能复制')
    return
  }
  if (action === 'save-as') {
    showToast('正在准备保存…')
    render()
    void saveDesktopMessageMediaAs(message)
    return
  }
  if (action === 'copy') {
    // Close the custom message menu before waiting for the protected media
    // request, otherwise it remains visible until the download completes.
    showToast('正在复制…')
    render()
    const payload = desktopMessageClipboardPayload(message)
    try {
      await copyDesktopMessageToClipboard(message)
      const attachment = payload.kind === 'attachment' ? payload.attachment : null
      const label = attachment?.type === 'video' ? '视频' : attachment?.type === 'image' ? '图片' : attachment?.type === 'audio' ? '语音' : attachment ? '文件' : '消息'
      showToast(`${label}已复制，可在输入框粘贴`)
    } catch {
      showToast('复制失败，请手动选择文字')
    }
    return
  }
  if (state.dataSource !== 'remote') {
    if (action === 'recall') {
      mergeMessage(selected.id, { ...message, recalled: true })
      refreshDesktopConversationPreview(selected.id)
      showToast('消息已撤回')
    }
    render()
    return
  }
  try {
    if (action === 'recall') {
      const recalled = await recallDesktopMessage(selected.id, message.id)
      const recalledMessage = mapRemoteMessage({ ...recalled, id: message.id })
      mergeMessage(selected.id, { ...recalledMessage, recalled: true, content: message.content, msgType: message.msgType, mine: message.mine })
      refreshDesktopConversationPreview(selected.id)
      showToast('消息已撤回')
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : '消息操作失败')
  } finally {
    render()
  }
}

async function removeFavorite(favoriteId) {
  if (!favoriteId || state.favoritesLoading) return
  state.favoritesLoading = true
  try {
    const id = String(favoriteId)
    await deleteDesktopFavorite(id)
    state.favorites = state.favorites.filter((item) => String(item.id) !== id)
    state.favoriteSelection.delete(String(favoriteId))
    showToast('已取消收藏')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '取消收藏失败')
  } finally {
    state.favoritesLoading = false
    render()
  }
}

function requestRemoveFavorite(favoriteId) {
  if (!favoriteId || state.favoritesLoading) return
  state.confirmDialog = { type: 'delete-favorite', favoriteId: String(favoriteId) }
  state.modal = 'confirm'
  render()
}

function toggleDesktopFavoriteSelection(favoriteId) {
  if (!state.favoriteOrganizing || state.favoritesLoading || !favoriteId) return
  const id = String(favoriteId)
  const next = new Set(state.favoriteSelection)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  state.favoriteSelection = next
  render()
}

function toggleAllDesktopFavoriteSelection() {
  if (!state.favoriteOrganizing || state.favoritesLoading) return
  const ids = state.favorites.map((item) => String(item.id))
  const allSelected = ids.length > 0 && ids.every((id) => state.favoriteSelection.has(id))
  state.favoriteSelection = allSelected ? new Set() : new Set(ids)
  render()
}

function requestDeleteSelectedFavorites() {
  const favoriteIds = state.favorites
    .map((item) => String(item.id))
    .filter((id) => state.favoriteSelection.has(id))
  if (!favoriteIds.length || state.favoritesLoading) {
    showToast('请选择要删除的收藏')
    return
  }
  state.confirmDialog = { type: 'delete-favorites', favoriteIds }
  state.modal = 'confirm'
  render()
}

async function removeSelectedFavorites(favoriteIds) {
  const ids = [...new Set((favoriteIds || []).map((id) => String(id)).filter(Boolean))]
  if (!ids.length || state.favoritesLoading) return
  state.favoritesLoading = true
  try {
    const results = await Promise.allSettled(ids.map((id) => deleteDesktopFavorite(id)))
    const succeeded = ids.filter((_, index) => results[index]?.status === 'fulfilled')
    const failed = ids.filter((_, index) => results[index]?.status === 'rejected')
    if (succeeded.length) {
      const succeededSet = new Set(succeeded)
      state.favorites = state.favorites.filter((item) => !succeededSet.has(String(item.id)))
    }
    state.favoriteSelection = new Set(failed)
    if (!failed.length) {
      state.favoriteOrganizing = false
      showToast(`已删除 ${succeeded.length} 条收藏`)
    } else {
      showToast(succeeded.length ? '部分收藏删除失败' : '收藏删除失败')
    }
  } finally {
    state.favoritesLoading = false
    render()
  }
}

function openDesktopFavoriteForward(favoriteIds = null) {
  const fromSelection = favoriteIds === null
  const ids = fromSelection
    ? state.favorites
      .map((item) => String(item.id))
      .filter((id) => state.favoriteSelection.has(id))
    : [...new Set(favoriteIds.map((id) => String(id)).filter(Boolean))]
  if (!ids.length || state.favoritesLoading) {
    showToast('请选择要转发的收藏')
    return
  }
  if (state.dataSource !== 'remote') {
    showToast('在线数据未加载，暂不支持转发收藏到服务器')
    return
  }
  state.favoriteForwardIds = ids
  state.favoriteForwardTargets = new Set()
  state.favoriteForwardFromSelection = fromSelection
  state.modalError = ''
  state.modalBusy = false
  state.modal = 'favorite-forward'
  render()
}

async function submitDesktopFavoriteForward() {
  const favoriteIds = [...new Set((state.favoriteForwardIds || []).map((id) => String(id)).filter(Boolean))]
  const targets = [...state.favoriteForwardTargets]
  if (!favoriteIds.length || !targets.length) {
    state.modalError = '请至少选择一个转发会话'
    render()
    return
  }
  state.modalBusy = true
  state.modalError = ''
  render()
  try {
    const operations = favoriteIds.flatMap((favoriteId) => targets.map((targetId) => ({
      favoriteId,
      promise: forwardDesktopFavorite(favoriteId, targetId),
    })))
    const results = await Promise.allSettled(operations.map((operation) => operation.promise))
    const succeededCount = results.filter((result) => result.status === 'fulfilled').length
    const failedCount = results.length - succeededCount
    const failedFavoriteIds = new Set(
      operations
        .filter((_, index) => results[index]?.status === 'rejected')
        .map((operation) => operation.favoriteId),
    )
    const fromSelection = state.favoriteForwardFromSelection
    if (fromSelection) state.favoriteSelection = failedFavoriteIds
    resetModal()
    if (!failedCount) {
      if (fromSelection) state.favoriteOrganizing = false
      showToast(`已转发 ${favoriteIds.length} 条收藏`)
    } else {
      showToast(`已转发 ${succeededCount} 条，${failedCount} 条失败`)
    }
  } catch (error) {
    state.modalBusy = false
    state.modalError = error instanceof Error ? error.message : '收藏转发失败'
    render()
  }
}

async function openFavoriteDetail(favoriteId) {
  if (!favoriteId || state.favoriteDetailLoading) return
  state.modal = 'favorite-detail'
  state.modalError = ''
  state.favoriteDetail = null
  state.favoriteDetailLoading = true
  render()
  try {
    state.favoriteDetail = await fetchDesktopFavorite(String(favoriteId))
  } catch (error) {
    state.modalError = error instanceof Error ? error.message : '收藏详情加载失败'
  } finally {
    state.favoriteDetailLoading = false
    render()
  }
}

function openFavoriteConversation() {
  const item = state.favoriteDetail
  if (Number(item?.msgType || 0) === 10) {
    const postId = String(item?.msgId || '').replace(/^moment:/, '')
    if (!postId) return
    state.modal = ''
    state.favoriteDetail = null
    state.page = 'moments'
    state.momentMenu = null
    const cached = state.moments.find((moment) => String(moment.id) === postId)
    if (cached) {
      state.momentDetail = cached
      state.modal = 'moment-detail'
      render()
      return
    }
    state.modalBusy = true
    render()
    void fetchDesktopMoment(postId).then((moment) => {
      state.momentDetail = moment
      state.modal = 'moment-detail'
    }).catch((error) => {
      showToast(error instanceof Error ? error.message : '朋友圈动态加载失败')
    }).finally(() => {
      state.modalBusy = false
      render()
    })
    return
  }
  if (!item?.conversationId) return
  const index = conversations.findIndex((conversation) => String(conversation.id) === String(item.conversationId))
  if (index < 0) {
    showToast('原会话尚未出现在列表中')
    return
  }
  state.modal = ''
  state.favoriteDetail = null
  state.page = 'messages'
  state.selectedConversation = index
  state.scrollChatToBottom = false
  render()
  void loadSelectedMessages()
}

async function openDesktopConversationClearDialog() {
  const selected = conversations[state.selectedConversation]
  if (!selected?.id) return

  let canClearForEveryone = selected.type !== 'group'
  if (selected.type === 'group') {
    const detail = await loadDesktopGroupDetail(selected)
    const currentUserId = String(state.profile?.userId || '')
    canClearForEveryone = Boolean(
      detail?.owner
      || detail?.myRole === 'owner'
      || (detail?.ownerId != null && String(detail.ownerId) === currentUserId),
    )
  }

  state.confirmDialog = {
    type: canClearForEveryone ? 'choose-conversation-clear' : 'clear-conversation',
    conversationId: String(selected.id),
    scope: canClearForEveryone ? undefined : 'self',
    conversationName: selected.name,
    group: selected.type === 'group',
  }
  state.modal = 'confirm'
  render()
}

function chooseDesktopConversationClearScope(scope) {
  const dialog = state.confirmDialog
  if (!dialog) return
  state.confirmDialog = {
    ...dialog,
    type: 'clear-conversation',
    scope: scope === 'both' ? 'both' : 'self',
  }
  state.modal = 'confirm'
  render()
}

async function executeDesktopConversationClear(dialog) {
  const conversationId = String(dialog?.conversationId || '')
  const conversation = conversations.find((item) => String(item.id || '') === conversationId)
  if (!conversationId || !conversation) return
  const scope = dialog?.scope === 'both' ? 'both' : 'self'

  try {
    if (state.dataSource === 'remote') {
      if (conversation.type === 'group') await clearDesktopGroupHistory(conversationId, scope)
      else await deleteDesktopPrivateConversation(conversationId, scope)
    }
    state.messagesByConversation[conversationId] = []
    state.fileItems = state.fileItems.filter((item) => String(item.conversationId || '') !== conversationId)
    state.sharedContentCountsByConversation[conversationId] = { media: 0, file: 0 }
    state.chatScrollTopByConversation[conversationId] = 0
    state.chatAtLatestByConversation[conversationId] = true
    conversation.preview = ''
    conversation.time = ''
    conversation.unread = 0
    conversation.mentionUnread = false
    updateDesktopConversationListRow(conversation)
    showToast(scope === 'both' ? '已双向清除聊天记录' : '已单向清除聊天记录')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '清除聊天记录失败')
  } finally {
    render()
  }
}

async function markAllDesktopConversationsReadFlow() {
  try {
    if (state.dataSource === 'remote') await markAllDesktopConversationsRead()
    conversations.forEach((conversation) => {
      conversation.unread = 0
      conversation.mentionUnread = false
    })
    state.scrollChatToBottom = false
    showToast('全部会话已读')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '全部已读失败')
  } finally {
    render()
  }
}

async function handleConversationAction(indexValue, action, confirmed = false) {
  const index = Number(indexValue)
  const conversation = conversations[index]
  if (!conversation) return
  if (action === 'remove' && !confirmed) {
    state.conversationMenu = null
    state.confirmDialog = { type: 'delete-conversation', index, conversationId: String(conversation.id || '') }
    state.modal = 'confirm'
    render()
    return
  }
  const previous = { ...conversation }
  const wasSelected = state.selectedConversation === index
  state.conversationMenu = null
  state.messageMenu = null
  const conversationId = String(conversation.id || '')
  try {
    if (action === 'remove') {
      if (state.dataSource === 'remote' && conversationId) await removeDesktopConversation(conversationId)
      conversations = conversations.filter((_, itemIndex) => itemIndex !== index)
      if (conversations.length === 0) {
        state.selectedConversation = 0
      } else if (wasSelected) {
        state.selectedConversation = Math.min(index, conversations.length - 1)
      } else if (state.selectedConversation > index) {
        state.selectedConversation -= 1
      }
      showToast('已删除该聊天')
    } else if (action === 'read' || action === 'unread') {
      const unread = action === 'unread'
      if (state.dataSource === 'remote' && conversationId) {
        if (unread) await markDesktopConversationUnread(conversationId)
        else await markDesktopConversationRead(conversationId)
      }
      conversation.unread = unread ? 1 : 0
      showToast(unread ? '已设为未读' : '已设为已读')
    } else if (action === 'mute' || action === 'unmute') {
      const muted = action === 'mute'
      if (state.dataSource === 'remote' && conversationId) await updateDesktopConversationSettings(conversationId, { mute: muted })
      conversation.mute = muted
      showToast(muted ? '\u6d88\u606f\u514d\u6253\u6270\u5df2\u5f00\u542f' : '\u6d88\u606f\u514d\u6253\u6270\u5df2\u5173\u95ed')
    } else if (action === 'pin' || action === 'unpin') {
      const pinned = action === 'pin'
      if (state.dataSource === 'remote' && conversationId) await updateDesktopConversationSettings(conversationId, { pinned })
      conversation.pinned = pinned
      showToast(pinned ? '已置顶' : '已取消置顶')
    }
  } catch (error) {
    Object.assign(conversation, previous)
    showToast(error instanceof Error ? error.message : '会话操作失败')
  } finally {
    render()
    if (state.page === 'messages' && conversations[state.selectedConversation]?.id && conversations[state.selectedConversation].id !== previous.id) void loadSelectedMessages()
  }
}

async function sendCurrentMessageLegacy() {
  const textarea = document.querySelector('[data-message-composer]')
  const selected = conversations[state.selectedConversation]
  const content = textarea?.value?.trim() || ''
  if (!textarea || !content || !selected?.id) return

  if (state.dataSource !== 'remote') {
    textarea.value = ''
    showToast('在线数据未加载，暂不能发送消息')
    return
  }

  textarea.value = ''
  await sendDesktopTypedMessage(content, 0, content, { mentionUserIds: [], atAll: false })
}

function parseDesktopJson(content) {
  if (content && typeof content === 'object') return content
  if (!content || typeof content !== 'string') return null
  try {
    const value = JSON.parse(content.trim())
    if (typeof value === 'string' && value.trim() !== content.trim()) {
      try {
        const nested = JSON.parse(value)
        return nested && typeof nested === 'object' ? nested : value
      } catch {
        return value
      }
    }
    return value && typeof value === 'object' ? value : null
  } catch {
    return null
  }
}

function desktopContentString(content) {
  if (content == null) return ''
  if (typeof content === 'string') return content
  try {
    return JSON.stringify(content)
  } catch {
    return String(content)
  }
}

function parseDesktopLocation(content) {
  const value = parseDesktopJson(content)
  if (!value) return null
  const source = value.location && typeof value.location === 'object' ? value.location : value
  const latitude = Number(source.latitude ?? source.lat)
  const longitude = Number(source.longitude ?? source.lng ?? source.lon)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null
  const name = String(source.name || source.address || '位置信息')
  const address = String(source.address || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`)
  return { latitude, longitude, name, address }
}

function parseDesktopFile(content) {
  if (!content) return null
  const rawContent = typeof content === 'string' ? content.trim() : ''
  if (/^file:/i.test(rawContent)) {
    const fileId = rawContent.slice(rawContent.indexOf(':') + 1).trim()
    return fileId ? normalizeDesktopFilePayload(fileId) : null
  }
  const parsed = parseDesktopJson(content)
  const payload = parsed?.file && typeof parsed.file === 'object' ? parsed.file : parsed
  if (payload?.fileId) return normalizeDesktopFilePayload(String(payload.fileId), payload)
  if (payload?.url) return { ...payload, url: String(payload.url) }
  if (parsed?.url) return parsed
  if (/^(https?:\/\/|\/|data:|blob:)/i.test(rawContent)) return { url: rawContent, name: '文件' }
  return null
}

/**
 * Resolve an attachment from HTTP, WebSocket and older client payloads.
 * A message may carry fileId/file separately, embed it as file:<id>, or put
 * the complete file JSON in content. Keep the separate file object preferred
 * so a lightweight push cannot downgrade hydrated media to a 1px placeholder.
 */
function desktopMessageAttachment(message, content = '') {
  const parsed = parseDesktopFile(content)
  const rawFile = [message?.file, message?.attachment, message?.fileMetadata, message?.file_metadata]
    .find((value) => value && typeof value === 'object' && !Array.isArray(value)) || {}
  const rawContent = desktopContentString(content).trim()
  const embeddedId = rawContent.startsWith('file:') ? rawContent.slice(5).trim() : ''
  const fileId = String(
    message?.fileId
      || message?.file_id
      || rawFile.fileId
      || rawFile.file_id
      || parsed?.fileId
      || parsed?.file_id
      || embeddedId
      || '',
  ).trim()
  if (!fileId && !parsed && !Object.keys(rawFile).length) return null
  const payload = { ...(parsed || {}), ...rawFile }
  return fileId ? normalizeDesktopFilePayload(fileId, payload) : payload
}

function desktopReplyMessageType(message, replyTarget = null) {
  if (message?.replyToRecalled) return -1
  if (message?.replyToMsgType != null) {
    const explicitType = Number(message.replyToMsgType)
    if (Number.isInteger(explicitType) && explicitType >= 0 && explicitType <= 10) return explicitType
  }
  const targetType = Number(replyTarget?.msgType || 0)
  if (targetType > 0) return targetType
  const content = desktopReplyContent(message, replyTarget)
  if (content.startsWith('__PULSE_LIVE_LOCATION__')) return 6
  const file = parseDesktopFile(content)
  if (file?.url) {
    const contentType = String(file.contentType || '').toLowerCase()
    const fileUrl = String(file.url || file.name || '')
    if (contentType.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif)(\?|$)/i.test(fileUrl)) return 1
    if (contentType.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|amr)(\?|$)/i.test(fileUrl)) return 3
    return 2
  }
  const payload = parseDesktopJson(content)
  if (!payload) return 0
  if (Array.isArray(payload.items)) return 4
  if (payload.cardType || payload.userId || payload.communityId) return 5
  if (Number.isFinite(Number(payload.latitude ?? payload.lat)) && Number.isFinite(Number(payload.longitude ?? payload.lng ?? payload.lon))) return 6
  const kind = String(payload.kind || payload.type || '').toLowerCase()
  if (kind.includes('red_packet') || payload.packetType || payload.packetNo) return 7
  if (kind.includes('transfer') || payload.transferNo || (payload.receiverId != null && payload.amount != null)) return 8
  return 0
}

function desktopReplyPreview(message, replyTarget = null) {
  if (message?.replyToRecalled) return '消息已撤回'
  const content = desktopReplyContent(message, replyTarget)
  const type = desktopReplyMessageType(message, replyTarget)
  if (!content) return '原消息'
  if (type === 0) return content
  return desktopMessagePreview({ content, msgType: type })
}

function desktopReplyMedia(message, replyTarget = null) {
  if (message?.replyToRecalled) return null
  const type = desktopReplyMessageType(message, replyTarget)
  if (type !== 1 && type !== 2) return null
  const file = parseDesktopFile(desktopReplyContent(message, replyTarget))
  if (!file?.url) return null
  const fileId = String(file.fileId || '').trim()
  // Reply previews are still an automatic render path. For protected files
  // they may use only the lightweight thumbnail; never promote a fileId-only
  // reply to the original download endpoint here.
  const previewSource = file.thumbUrl
    || (type === 1 ? file.previewUrl : '')
    || (fileId && file.thumbObjectKey ? desktopFileDownloadUrl(fileId, 'thumb') : '')
    || (fileId ? '' : file.url)
  if (!previewSource) return null
  const url = resolveDesktopFileUrl(previewSource)
  const contentType = String(file.contentType || '').toLowerCase()
  const isVideo = type === 2 && (contentType.startsWith('video/') || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url))
  const isImage = type === 1 || contentType.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif)(\?|$)/i.test(url)
  return { url, isImage, isVideo, name: file.name || '' }
}

function desktopReplyContent(message, replyTarget = null) {
  const content = desktopContentString(message?.replyToContent)
  return content || desktopContentString(replyTarget?.content)
}

function formatDesktopFileSize(value) {
  const size = Number(value || 0)
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function desktopFileTransferMeta(file) {
  const name = String(file?.name || '')
  const type = String(file?.type || '').toLowerCase()
  const isImage = type.startsWith('image/') || desktopFileLooksLikeImage(name)
  const isVideo = type.startsWith('video/') || desktopFileLooksLikeVideo(name)
  return {
    isImage,
    isVideo,
    msgType: isImage ? 1 : 2,
    max: isVideo ? 80 * 1024 * 1024 : 20 * 1024 * 1024,
    label: isVideo ? '视频' : isImage ? '图片' : '文件',
    icon: isVideo ? 'video' : isImage ? 'image' : 'folder',
  }
}

function desktopLocalImageSourceCandidates(fileId, file = {}) {
  const id = String(fileId || file?.fileId || '').trim()
  const values = [
    file?.thumbUrl,
    file?.previewUrl,
    file?.originalUrl,
    file?.downloadUrl,
    id ? desktopFileDownloadUrl(id, 'thumb') : '',
    id ? desktopFileDownloadUrl(id, 'preview') : '',
    id ? desktopFileDownloadUrl(id, 'original') : '',
  ]
  return [...new Set(values
    .map((value) => resolveDesktopFileUrl(value))
    .filter((value) => value && !/^(blob:|data:)/i.test(value)))]
}

function registerDesktopLocalImagePreview(fileId, file, previewUrl) {
  const localUrl = String(previewUrl || '').trim()
  if (!localUrl || !/^blob:/i.test(localUrl)) return []
  const sources = desktopLocalImageSourceCandidates(fileId, file)
  sources.forEach((source) => {
    desktopMediaBlobUrls.set(source, localUrl)
    desktopMediaBlobCategories.set(source, 'image')
  })
  return sources
}

function unregisterDesktopLocalImagePreview(sources, previewUrl) {
  const localUrl = String(previewUrl || '').trim()
  ;(sources || []).forEach((source) => {
    if (desktopMediaBlobUrls.get(source) !== localUrl) return
    desktopMediaBlobUrls.delete(source)
    desktopMediaBlobCategories.delete(source)
  })
}

function clearPendingDesktopFile(options = {}) {
  state.pendingDroppedFile = null
  state.pendingDroppedFileConversationId = ''
  desktopPendingFilePreviewRevision += 1
  releasePendingDesktopFilePreview(options.preservePreviewUrl || '')
  state.fileDragActive = false
}

function releasePendingDesktopFilePreview(preservePreviewUrl = '') {
  const previewUrl = String(state.pendingDroppedFilePreviewUrl || '')
  if (previewUrl && previewUrl !== String(preservePreviewUrl || '').trim()
    && previewUrl.startsWith('blob:') && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(previewUrl)
  }
  state.pendingDroppedFilePreviewUrl = ''
  state.pendingDroppedFileDimensions = null
}

function desktopClipboardMediaFile(event) {
  const clipboardData = event?.clipboardData
  if (!clipboardData) return null
  const fileItem = Array.from(clipboardData.items || []).find((item) => item.kind === 'file')
  const mediaFile = fileItem?.getAsFile?.() || Array.from(clipboardData.files || [])[0]
  if (!mediaFile) return null
  const type = String(mediaFile.type || fileItem?.type || 'application/octet-stream')
  const subtype = type.split('/')[1]?.split(';')[0]?.toLowerCase() || 'png'
  const extension = subtype === 'jpeg' ? 'jpg' : subtype.replace(/[^a-z0-9]+/g, '') || 'png'
  const prefix = type.startsWith('video/') ? 'clipboard-video' : type.startsWith('image/') ? 'clipboard-image' : 'clipboard-file'
  const filename = String(mediaFile.name || `${prefix}-${Date.now()}.${extension}`)
  return new File([mediaFile], filename, { type })
}

function setPendingDesktopFile(file) {
  const selected = conversations[state.selectedConversation]
  if (!file || !selected?.id) return
  const meta = desktopFileTransferMeta(file)
  if (Number(file.size || 0) > meta.max) {
    showToast(`${meta.label}不能超过 ${meta.isVideo ? '80MB' : '20MB'}`)
    return
  }
  desktopPendingFilePreviewRevision += 1
  const previewRevision = desktopPendingFilePreviewRevision
  releasePendingDesktopFilePreview()
  state.pendingDroppedFile = file
  state.pendingDroppedFileConversationId = String(selected.id)
  state.pendingDroppedFilePreviewUrl = meta.isImage && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
    ? URL.createObjectURL(file)
    : ''
  state.pendingDroppedFileDimensions = null
  state.fileDragActive = false
  state.showPlusMenu = false
  state.showEmojiPanel = false
  render()

  const previewUrl = state.pendingDroppedFilePreviewUrl
  if (!meta.isImage || !previewUrl || typeof Image === 'undefined') return
  const image = new Image()
  image.onload = () => {
    if (previewRevision !== desktopPendingFilePreviewRevision || state.pendingDroppedFile !== file) return
    state.pendingDroppedFileDimensions = {
      width: Number(image.naturalWidth || image.width || 0),
      height: Number(image.naturalHeight || image.height || 0),
    }
    requestDesktopRender()
  }
  image.src = previewUrl
}

function insertDesktopComposerText(value) {
  const textarea = document.querySelector('[data-message-composer]')
  if (!(textarea instanceof HTMLTextAreaElement)) return false
  const text = String(value || '')
  const start = Number.isFinite(textarea.selectionStart) ? textarea.selectionStart : textarea.value.length
  const end = Number.isFinite(textarea.selectionEnd) ? textarea.selectionEnd : start
  textarea.setRangeText(text, start, end, 'end')
  state.composerText = textarea.value
  textarea.focus()
  return true
}

function desktopClipboardPayloadFromEvent(event) {
  const clipboardData = event?.clipboardData
  if (!clipboardData) return null
  const structured = parseDesktopMessageClipboardPayload(clipboardData.getData(DESKTOP_MESSAGE_CLIPBOARD_MIME))
  if (structured) return structured

  // Some Electron/Chromium versions strip custom MIME types from paste
  // events. Match the last in-app copy by its plain-text fallback in that
  // case, without hijacking unrelated text copied from another application.
  const copied = desktopCopiedMessagePayload
  if (!copied) return null
  const plainText = clipboardData.getData('text/plain')
  if (plainText && plainText === copied.plainText) return copied
  return null
}

async function pasteDesktopClipboardAttachment(payload) {
  const attachment = payload?.attachment
  if (!attachment?.url || desktopClipboardPasteBusy) return
  desktopClipboardPasteBusy = true
  const label = attachment.type === 'video' ? '视频' : attachment.type === 'image' ? '图片' : attachment.type === 'audio' ? '语音' : '文件'
  try {
    showToast(`正在准备${label}…`)
    const blob = await fetchDesktopProtectedBlob(attachment.url)
    const contentType = String(attachment.contentType || blob.type || 'application/octet-stream')
    const filename = String(attachment.filename || attachment.name || `pulse_${label}`)
    const file = new File([blob], filename, { type: contentType })
    clearPendingDesktopFile()
    setPendingDesktopFile(file)
    showToast(`${label}已粘贴，请点击发送`)
  } catch {
    const fallback = String(payload.plainText || attachment.name || `[${label}]`)
    insertDesktopComposerText(fallback)
    showToast(`${label}暂时无法下载，已粘贴为文本`)
  } finally {
    desktopClipboardPasteBusy = false
  }
}

function handleDesktopComposerPaste(event) {
  const file = desktopClipboardMediaFile(event)
  if (file) {
    event.preventDefault()
    event.stopPropagation()
    clearPendingDesktopFile()
    setPendingDesktopFile(file)
    showToast(`${desktopFileTransferMeta(file).label}已粘贴，请点击发送`)
    return
  }

  const payload = desktopClipboardPayloadFromEvent(event)
  if (!payload) return
  event.preventDefault()
  event.stopPropagation()
  if (payload.kind === 'text') {
    insertDesktopComposerText(payload.text)
    return
  }
  void pasteDesktopClipboardAttachment(payload)
}

function renderDesktopPendingFile(selected) {
  const file = state.pendingDroppedFile
  if (!file || String(state.pendingDroppedFileConversationId) !== String(selected?.id || '')) return ''
  const meta = desktopFileTransferMeta(file)
  const previewUrl = meta.isImage ? String(state.pendingDroppedFilePreviewUrl || '') : ''
  const dimensions = state.pendingDroppedFileDimensions
  const dimensionText = dimensions?.width && dimensions?.height
    ? `${dimensions.width} × ${dimensions.height}`
    : '正在读取尺寸…'
  const imagePreview = previewUrl
    ? `<span class="desktop-pending-image-preview"><img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(file.name || '待发送图片')}" draggable="false" /></span>`
    : `<span class="desktop-pending-file-icon">${icon(meta.icon)}</span>`
  const fileDetails = meta.isImage
    ? `<small>图片 · ${escapeHtml(dimensionText)} · ${escapeHtml(formatDesktopFileSize(file.size))}</small><span>发送前可确认图片内容</span>`
    : `<small>${escapeHtml(meta.label)} · ${escapeHtml(formatDesktopFileSize(file.size))}</small>`
  return `<div class="desktop-pending-file${meta.isImage ? ' desktop-pending-image' : ''}" data-pending-dropped-file>
    ${imagePreview}
    <span class="desktop-pending-file-copy"><strong>${escapeHtml(file.name || meta.label)}</strong>${fileDetails}</span>
    <span class="desktop-pending-file-actions"><button type="button" class="desktop-pending-file-cancel" data-action="cancel-dropped-file">取消</button><button type="button" class="desktop-pending-file-send" data-action="send-dropped-file">发送${meta.isImage ? '图片' : ''}</button></span>
  </div>`
}

function desktopMessagePreview(message) {
  if (desktopIsBurnMessage(message)) return '[阅后即焚消息]'
  const type = Number(message?.msgType || 0)
  if (String(message?.content || '').startsWith('__PULSE_LIVE_LOCATION__')) return '[实时位置共享]'
  if (type === 1) return '[图片]'
  if (type === 2) {
    const file = parseDesktopFile(message.content)
    return file?.contentType?.startsWith('video/') ? `[视频] ${file.name || ''}`.trim() : `[文件] ${file?.name || ''}`.trim()
  }
  if (type === 3) return '[语音]'
  if (type === 4) return '[聊天记录]'
  if (type === 5) return '[名片]'
  if (type === 6) return '[位置]'
  if (type === 7) return '[红包]'
  if (type === 8) return '[转账]'
  if (type === 9) return desktopSystemMessageText(message?.content, null, message)
  return desktopPreviewText(message?.content, 0)
}

function desktopMessageCanBeConversationPreview(message) {
  if (!message || message.recalled || message.deleted || message.deletedForMe || message.hidden) return false
  const expiry = desktopMessageExpiry(message)
  return !expiry.at || expiry.at > Date.now()
}

function refreshDesktopConversationPreview(conversationId, expiredBurnMessage = null) {
  const id = String(conversationId || '')
  const conversation = conversations.find((item) => String(item.id || '') === id)
  if (!conversation) return
  const messages = (state.messagesByConversation[id] || [])
    .filter(desktopMessageCanBeConversationPreview)
    .sort((left, right) => desktopMessageTimeMs(left) - desktopMessageTimeMs(right))
  const latest = messages[messages.length - 1]
  const expiredWasLatest = desktopIsBurnMessage(expiredBurnMessage)
    && (!latest || desktopMessageTimeMs(expiredBurnMessage) >= desktopMessageTimeMs(latest))
  const keepBurnTombstone = conversation.preview === '[阅后即焚消息已销毁]'
    && (!latest || desktopMessageTimeMs(latest) <= Number(conversation.lastMsgTimeMs || 0))
  conversation.preview = expiredWasLatest || keepBurnTombstone
    ? '[阅后即焚消息已销毁]'
    : latest ? formatDesktopConversationPreview(desktopMessagePreview(latest), latest.mine) : ''
  conversation.time = latest?.time || ''
  updateDesktopConversationListRow(conversation)
}

function desktopPreviewText(content, msgType = null) {
  const raw = String(content || '').trim()
  if (!raw) return ''
  if (msgType != null && Number(msgType) === 0) return raw
  const type = Number(msgType || 0)
  if (type > 0 && type !== 9) return desktopMessagePreview({ content: raw, msgType: type })
  const looksLikeJson = raw.startsWith('{') || /^\[\s*(?:\{|\[|"|-?\d|true|false|null)/.test(raw)
  if (!looksLikeJson) return raw
  const payload = parseDesktopJson(raw)
  if (!payload) return raw.startsWith('{') ? '[结构化消息]' : raw
  if (Array.isArray(payload)) return '[聊天记录]'
  if (payload.text || payload.message) return String(payload.text || payload.message)
  if (Array.isArray(payload.items) || payload.title || payload.sourceTitle) return '[聊天记录]'
  const kind = String(payload.kind || payload.type || payload.event || '').toLowerCase()
  const mediaType = String(payload.mediaType || payload.media_type || payload.callType || '').toLowerCase()
  if (kind.includes('video') || mediaType === 'video') return `[视频通话] ${String(payload.resultText || '通话消息')}`
  if (kind.includes('voice') || kind.includes('audio') || payload.callId || payload.call_id) return `[语音通话] ${String(payload.resultText || '通话消息')}`
  if (payload.url || payload.originalUrl) {
    const contentType = String(payload.contentType || payload.mimeType || '').toLowerCase()
    if (contentType.startsWith('image/')) return '[图片]'
    if (contentType.startsWith('video/')) return '[视频]'
    if (contentType.startsWith('audio/')) return '[语音]'
    return `[文件] ${String(payload.name || '')}`.trim()
  }
  if (payload.packetType || kind.includes('red_packet') || payload.packetNo) return '[红包]'
  if (payload.transferNo || kind.includes('transfer')) return '[转账]'
  if (payload.cardType || payload.userId || payload.communityId) return '[名片]'
  if (payload.latitude != null || payload.lat != null) return '[位置]'
  return '[结构化消息]'
}

function desktopFavoritePreview(item) {
  const type = Number(item?.msgType || 0)
  if (type === 10) return desktopPreviewText(item?.content, type) || '[朋友圈动态]'
  if (type === 1 || type === 3) {
    const file = parseDesktopFile(item?.content)
    const label = type === 1 ? '图片' : '语音'
    return file?.name ? `[${label}] ${file.name}` : `[${label}]`
  }
    const preview = desktopMessagePreview(item)
  return preview || '消息内容为空'
}

function renderDesktopFavoriteMomentContent(item) {
  const text = String(item?.content || '').trim()
  const images = Array.isArray(item?.images) ? item.images : []
  const mediaTypes = Array.isArray(item?.mediaTypes) ? item.mediaTypes : []
  const fileIds = Array.isArray(item?.mediaFileIds) ? item.mediaFileIds.map(String) : []
  const mediaCount = Math.max(images.length, fileIds.length)
  const media = Array.from({ length: mediaCount }, (_, index) => {
    const source = resolveDesktopFileUrl(String(images[index] || ''))
    const type = String(mediaTypes[index] || '').toLowerCase() === 'video' ? 'video' : 'image'
    return desktopMomentMediaMarkup(source, type, type === 'video' ? '朋友圈视频' : '朋友圈图片', '', fileIds[index] || '')
  }).join('')
  return `${text ? `<div class="favorite-detail-text">${escapeHtml(text)}</div>` : ''}${media ? `<div class="desktop-moment-detail-media favorite-detail-media${images.length === 1 ? ' single' : ''}">${media}</div>` : ''}`
}

function desktopFavoriteTypeLabel(item) {
  const labels = { 1: '图片', 2: '文件', 3: '语音', 5: '名片', 6: '位置', 7: '红包', 8: '转账', 10: '朋友圈动态' }
  return labels[Number(item?.msgType || 0)] || '消息'
}

function desktopFavoriteIcon(item) {
  const icons = { 1: 'image', 2: 'folder', 3: 'mic', 5: 'person', 6: 'location', 7: 'gift', 8: 'money', 10: 'discover' }
  return icons[Number(item?.msgType || 0)] || 'chat'
}

function desktopForwardCardOf(messageOrContent) {
  const content = messageOrContent && typeof messageOrContent === 'object' && !Array.isArray(messageOrContent) && Object.prototype.hasOwnProperty.call(messageOrContent, 'content')
    ? messageOrContent.content
    : messageOrContent
  const card = parseDesktopJson(content)
  if (!card || !Array.isArray(card.items)) return null
  return {
    ...card,
    items: card.items.filter((item) => item && typeof item === 'object'),
  }
}

function desktopForwardItemMessage(item, parentMessage, index) {
  const sendTime = Number(item?.sendTime || item?.send_time || 0)
  const rawSendTime = Number.isFinite(sendTime) && sendTime > 0 ? sendTime : 0
  const createdAt = item?.createdAt || (rawSendTime > 0
    ? new Date(rawSendTime < 10000000000 ? rawSendTime * 1000 : rawSendTime).toISOString()
    : '')
  const msgType = Number(item?.msgType || item?.msg_type || 0) || 0
  return {
    id: String(item?.msgId || item?.id || `${parentMessage?.id || 'forward'}:item:${index}`),
    fromUserId: String(item?.fromUserId || item?.from_user_id || ''),
    fromNickname: String(item?.fromNickname || item?.from_nickname || item?.nickname || '用户'),
    fromAvatarUrl: resolveDesktopAvatarUrl(item?.fromAvatarUrl || item?.from_avatar_url || item?.avatarUrl || ''),
    content: desktopContentString(item?.content || ''),
    msgType,
    createdAt,
    sendTimeMs: rawSendTime ? (rawSendTime < 10000000000 ? rawSendTime * 1000 : rawSendTime) : (createdAt ? Date.parse(createdAt) : 0),
    time: formatRemoteTime(createdAt),
    mine: false,
    recalled: Boolean(item?.recalled),
    burnAfterRead: desktopBurnAfterReadValue(item),
    burnReadAt: item?.burnReadAt || '',
    burnExpiresAt: item?.burnExpiresAt || '',
    autoDeleteExpiresAt: item?.autoDeleteExpiresAt || '',
  }
}

function renderDesktopForwardOriginalContent(item, parentMessage, index) {
  const message = desktopForwardItemMessage(item, parentMessage, index)
  if (Number(message.msgType) === 4) {
    const nested = desktopForwardCardOf(message)
    const nestedCount = Number(nested?.count || nested?.items?.length || 0)
    const nestedTitle = String(nested?.title || nested?.sourceTitle || '聊天记录')
    return `<div class="typed-card typed-forward-nested-card"><span class="typed-message-icon">${icon('chat')}</span><span><strong>${escapeHtml(nestedTitle)}</strong><small>${nestedCount > 0 ? `${nestedCount} 条消息` : '聊天记录'}</small></span></div>`
  }
  return renderDesktopMessageContent(message)
}

function canReeditDesktopRecalledMessage(message) {
  return Boolean(message?.recalled && message?.mine && Number(message?.msgType || 0) === 0 && message?.content && !state.recalledEditHiddenIds.has(String(message.id)))
}

function renderDesktopForwardDetailModal() {
  const detail = state.forwardDetail
  const card = detail?.card || desktopForwardCardOf(detail?.message)
  if (!card) return modalFrame('聊天记录', '无法读取这条合并转发消息。', '<div class="desktop-modal-empty">聊天记录内容暂时无法读取</div>')
  const parentMessage = detail.message || { id: 'forward-detail' }
  const declaredCount = Number(card.count)
  const count = Number.isFinite(declaredCount) && declaredCount > 0 ? declaredCount : card.items.length
  const sourceTitle = String(card.sourceTitle || '')
  const rows = card.items.map((item, index) => {
    const message = desktopForwardItemMessage(item, parentMessage, index)
    const sender = message.fromNickname || '用户'
    return `<article class="desktop-forward-detail-item"><div class="desktop-forward-detail-meta"><strong>${escapeHtml(sender)}</strong><time>${escapeHtml(message.time || '—')}</time></div><div class="desktop-forward-detail-message">${renderDesktopForwardOriginalContent(item, parentMessage, index)}</div></article>`
  }).join('')
  const body = `<div class="desktop-forward-detail"><div class="desktop-forward-detail-summary"><strong>${count > 0 ? `共 ${count} 条原消息` : '原消息'}</strong><span>${sourceTitle ? `来自 ${escapeHtml(sourceTitle)}` : '按原消息类型显示文本、媒体、文件、名片和位置'}</span></div><div class="desktop-forward-detail-list">${rows || '<div class="desktop-modal-empty">这条聊天记录没有可显示的原消息</div>'}</div><div class="desktop-modal-actions"><button class="btn" type="button" data-modal-close>关闭</button></div></div>`
  return modalFrame(String(card.title || '聊天记录'), `${sourceTitle ? `来自 ${sourceTitle} · ` : ''}${count} 条消息`, body, 'desktop-forward-detail-modal')
}

function openDesktopForwardDetail(message) {
  if (!message || state.messageMultiMode || Number(message.msgType) !== 4) return
  const card = desktopForwardCardOf(message)
  if (!card) {
    showToast('聊天记录内容暂时无法读取')
    return
  }
  state.forwardDetail = { message, card }
  state.modal = 'forward-detail'
  render()
}

function renderDesktopMessageContent(message) {
  if (message.recalled) {
    const editButton = canReeditDesktopRecalledMessage(message)
      ? `<button type="button" class="message-reedit-button" data-message-reedit="${escapeHtml(String(message.id))}">重新编辑</button>`
      : ''
    return `<span class="message-recalled-copy">${message.mine ? '你撤回了一条消息' : '这条消息已被撤回'}</span>${editButton}`
  }
  const content = String(message.content || message.rawContent || '')
  const numericType = Number(message.msgType)
  const hasExplicitType = message.msgType != null && message.msgType !== ''
    && Number.isInteger(numericType) && numericType >= 0 && numericType <= 10
  const file = hasExplicitType && numericType === 0
    ? null
    : desktopMessageAttachment(message, content)
  const type = hasExplicitType ? numericType : inferDesktopMessageType(message.rawContent || content, file)
  if (content.startsWith('__PULSE_LIVE_LOCATION__')) {
    const location = parseDesktopLocation(content.slice('__PULSE_LIVE_LOCATION__'.length).trim())
    if (!location) return `<div class="typed-location-card typed-location-invalid typed-live-location-card"><span class="typed-location-pin">${icon('location')}</span><span class="typed-location-meta"><strong>位置共享</strong><small>实时位置共享</small></span></div>`
    const query = `${location.latitude.toFixed(6)},${location.longitude.toFixed(6)}`
    const mapUrl = `https://api.map.baidu.com/marker?${new URLSearchParams({ location: query, title: location.name, content: location.address, output: 'html', src: 'webapp.PulseIM' }).toString()}`
    return `<a class="typed-location-card typed-live-location-card" href="${escapeHtml(mapUrl)}" target="_blank" rel="noreferrer"><span class="typed-location-map"><span class="typed-location-pin">${icon('location')}</span><i></i><i></i><i></i></span><span class="typed-location-meta"><strong>${escapeHtml(location.name)}</strong><small>实时位置共享 · ${escapeHtml(location.address)}</small></span></a>`
  }
  if (desktopIsBurnMediaLocked(message)) {
    const label = type === 1 ? '点击查看图片' : '点击查看视频'
    return `<button type="button" class="typed-burn-locked" data-burn-view="${escapeHtml(message.id)}"><span class="typed-message-icon">${icon('lock')}</span><span><strong>${label}</strong><small>查看后开始倒计时</small></span></button>`
  }
  if (type === 1) {
    if (!file?.url) return escapeHtml(desktopMessagePreview(message))
    const fileId = String(file.fileId || '').trim()
    const originalUrl = resolveDesktopFileUrl(file.originalUrl || file.url || (fileId ? desktopFileDownloadUrl(fileId) : ''))
    // The send ack and WebSocket push can contain only fileId. Use a rendition
    // when it exists, but fall back to the protected original so a missing
    // asynchronous thumbnail cannot become a 1x1 horizontal placeholder.
    const hasThumb = Boolean(file.thumbUrl || file.thumbObjectKey)
    const hasPreview = Boolean(file.previewUrl || file.previewObjectKey)
    const imageSource = file.thumbUrl
      || (hasThumb && fileId ? desktopFileDownloadUrl(fileId, 'thumb') : '')
      || file.previewUrl
      || (hasPreview && fileId ? desktopFileDownloadUrl(fileId, 'preview') : '')
      || originalUrl
    if (!imageSource) {
      return `<a class="typed-file typed-image-file" data-desktop-file-preview data-file-url="${escapeHtml(originalUrl)}" data-file-original-url="${escapeHtml(originalUrl)}" data-file-id="${escapeHtml(fileId)}" data-file-name="${escapeHtml(file.name || '图片')}" data-file-size="${escapeHtml(String(file.size || ''))}" data-file-type="${escapeHtml(file.contentType || 'image/*')}"${desktopBurnMediaAttribute(message)} href="${escapeHtml(originalUrl)}" target="_blank" rel="noreferrer"><span class="typed-message-icon">${icon('image')}</span><span><strong>${escapeHtml(file.name || '图片')}</strong><small>${file.size ? formatDesktopFileSize(file.size) : '点击查看图片'}</small></span></a>`
    }
    const imageVariant = file.thumbUrl || hasThumb ? 'thumb' : file.previewUrl || hasPreview ? 'preview' : 'original'
    const imageUrl = resolveDesktopFileUrl(imageSource)
    const previewUrl = resolveDesktopFileUrl(file.previewUrl || imageUrl)
    const originalAttribute = originalUrl && originalUrl !== imageUrl ? ` data-chat-media-original-url="${escapeHtml(originalUrl)}"` : ''
    const fallbackAttribute = originalUrl && originalUrl !== imageUrl ? ` data-protected-media-fallback-src="${escapeHtml(originalUrl)}" data-protected-media-fallback-variant="original"` : ''
    const fileIdAttribute = fileId ? ` data-file-id="${escapeHtml(fileId)}"` : ''
    const placeholder = desktopMediaRenderSource(imageUrl)
    scheduleDesktopInlineImagePreload(fileId, imageUrl, imageVariant)
    return `<a class="typed-image-link" data-chat-media-preview data-chat-media-type="image" data-chat-media-url="${escapeHtml(imageUrl)}" data-chat-media-preview-url="${escapeHtml(previewUrl)}"${originalAttribute}${fileIdAttribute} data-chat-media-name="${escapeHtml(file.name || '图片')}"${desktopBurnMediaAttribute(message)} data-protected-media-link href="${escapeHtml(imageUrl)}" target="_blank" rel="noreferrer"><img class="typed-image" src="${placeholder}" data-protected-media-src="${escapeHtml(imageUrl)}"${fallbackAttribute} data-file-id="${escapeHtml(fileId)}" data-file-category="image" data-file-variant="${imageVariant}" alt="${escapeHtml(file.name || '图片')}" decoding="async" loading="eager" /></a>`
  }
  if (type === 2) {
    if (!file?.url) return escapeHtml(desktopMessagePreview(message))
    const fileId = String(file.fileId || '').trim()
    const fileUrl = resolveDesktopFileUrl(file.originalUrl || file.url || (fileId ? desktopFileDownloadUrl(fileId) : ''))
    // Video renditions are generated asynchronously. Metadata may therefore
    // contain only the original at first; that original is still a valid
    // protected video preview and keeps the message from becoming a bar.
    const hasThumb = Boolean(file.thumbUrl || file.thumbObjectKey)
    const hasPreview = Boolean(file.previewUrl || file.previewObjectKey)
    const previewUrl = resolveDesktopFileUrl(file.previewUrl || (hasPreview && fileId ? desktopFileDownloadUrl(fileId, 'preview') : (!fileId ? file.url : '')))
    const originalUrl = fileUrl
    const originalAttribute = originalUrl && originalUrl !== previewUrl ? ` data-chat-media-original-url="${escapeHtml(originalUrl)}"` : ''
    const fileIdAttribute = fileId ? ` data-file-id="${escapeHtml(fileId)}"` : ''
    const contentType = String(file.contentType || '').toLowerCase()
    const isImage = contentType.startsWith('image/') || desktopFileLooksLikeImage(`${fileUrl} ${String(file.name || '')}`)
    if (isImage) {
      const imageSource = file.thumbUrl
        || (hasThumb && fileId ? desktopFileDownloadUrl(fileId, 'thumb') : '')
        || file.previewUrl
        || (hasPreview && fileId ? desktopFileDownloadUrl(fileId, 'preview') : '')
        || fileUrl
      if (!imageSource) {
        return `<a class="typed-file typed-image-file" data-desktop-file-preview data-file-url="${escapeHtml(fileUrl)}" data-file-original-url="${escapeHtml(fileUrl)}" data-file-id="${escapeHtml(fileId)}" data-file-name="${escapeHtml(file.name || '图片')}" data-file-size="${escapeHtml(String(file.size || ''))}" data-file-type="${escapeHtml(file.contentType || 'image/*')}"${desktopBurnMediaAttribute(message)} href="${escapeHtml(fileUrl)}" target="_blank" rel="noreferrer"><span class="typed-message-icon">${icon('image')}</span><span><strong>${escapeHtml(file.name || '图片')}</strong><small>${file.size ? formatDesktopFileSize(file.size) : '点击查看图片'}</small></span></a>`
      }
      const imageVariant = file.thumbUrl || hasThumb ? 'thumb' : file.previewUrl || hasPreview ? 'preview' : 'original'
      const imageUrl = resolveDesktopFileUrl(imageSource)
      const imagePreviewUrl = previewUrl || imageUrl
      const imageOriginalUrl = originalUrl || fileUrl
      const imageOriginalAttribute = imageOriginalUrl && imageOriginalUrl !== imageUrl ? ` data-chat-media-original-url="${escapeHtml(imageOriginalUrl)}"` : ''
      const imageFallbackAttribute = imageOriginalUrl && imageOriginalUrl !== imageUrl ? ` data-protected-media-fallback-src="${escapeHtml(imageOriginalUrl)}" data-protected-media-fallback-variant="original"` : ''
      const placeholder = desktopMediaRenderSource(imageUrl)
      scheduleDesktopInlineImagePreload(fileId, imageUrl, imageVariant)
      return `<a class="typed-image-link" data-chat-media-preview data-chat-media-type="image" data-chat-media-url="${escapeHtml(imageUrl)}" data-chat-media-preview-url="${escapeHtml(imagePreviewUrl)}"${imageOriginalAttribute}${fileIdAttribute} data-chat-media-name="${escapeHtml(file.name || '图片')}"${desktopBurnMediaAttribute(message)} data-protected-media-link href="${escapeHtml(imageUrl)}" target="_blank" rel="noreferrer"><img class="typed-image" src="${placeholder}" data-protected-media-src="${escapeHtml(imageUrl)}"${imageFallbackAttribute} data-file-id="${escapeHtml(fileId)}" data-file-category="image" data-file-variant="${imageVariant}" alt="${escapeHtml(file.name || '图片')}" decoding="async" loading="eager" /></a>`
    }
    const isVideo = String(file.contentType || '').startsWith('video/') || desktopFileLooksLikeVideo(`${fileUrl} ${originalUrl} ${String(file.name || '')}`)
    if (isVideo && previewUrl) {
      // The web page cannot attach Authorization to Chromium's native video
      // element. Use the same authenticated Blob-preview action as the blue
      // filename link for the large red player area, so a click never gets
      // stuck on a 0:00/1x1 placeholder.
      return `<div class="typed-video-preview-wrap"><a class="typed-video-preview-link" data-desktop-file-preview data-file-url="${escapeHtml(fileUrl)}" data-file-preview-url="${escapeHtml(previewUrl)}" data-file-original-url="${escapeHtml(originalUrl || fileUrl)}" data-file-id="${escapeHtml(fileId)}" data-file-name="${escapeHtml(file.name || '视频')}" data-file-size="${escapeHtml(String(file.size || ''))}" data-file-type="${escapeHtml(file.contentType || 'video/mp4')}"${desktopBurnMediaAttribute(message)} href="${escapeHtml(fileUrl)}" target="_blank" rel="noreferrer" aria-label="点击播放视频"><span class="typed-video-preview-mark">▶</span><span class="typed-video-preview-hint">点击播放</span></a><a class="typed-file-name" data-desktop-file-preview data-file-url="${escapeHtml(fileUrl)}" data-file-preview-url="${escapeHtml(previewUrl)}" data-file-original-url="${escapeHtml(originalUrl || fileUrl)}" data-file-id="${escapeHtml(fileId)}" data-file-name="${escapeHtml(file.name || '视频')}" data-file-type="${escapeHtml(file.contentType || 'video/mp4')}"${desktopBurnMediaAttribute(message)} href="${escapeHtml(fileUrl)}" target="_blank" rel="noreferrer">${escapeHtml(file.name || '视频')}</a></div>`
    }
    if (isVideo) {
      return `<div class="typed-video-preview-wrap"><a class="typed-video-preview-link" data-desktop-file-preview data-file-url="${escapeHtml(fileUrl)}" data-file-preview-url="${escapeHtml(previewUrl)}" data-file-original-url="${escapeHtml(originalUrl || fileUrl)}" data-file-id="${escapeHtml(fileId)}" data-file-name="${escapeHtml(file.name || '视频')}" data-file-size="${escapeHtml(String(file.size || ''))}" data-file-type="${escapeHtml(file.contentType || 'video/mp4')}"${desktopBurnMediaAttribute(message)} href="${escapeHtml(fileUrl)}" target="_blank" rel="noreferrer" aria-label="点击播放视频"><span class="typed-video-preview-mark">▶</span><span class="typed-video-preview-hint">点击播放</span></a><a class="typed-file-name" data-desktop-file-preview data-file-url="${escapeHtml(fileUrl)}" data-file-preview-url="${escapeHtml(previewUrl)}" data-file-original-url="${escapeHtml(originalUrl || fileUrl)}" data-file-id="${escapeHtml(fileId)}" data-file-name="${escapeHtml(file.name || '视频')}" data-file-type="${escapeHtml(file.contentType || 'video/mp4')}"${desktopBurnMediaAttribute(message)} href="${escapeHtml(fileUrl)}" target="_blank" rel="noreferrer">${escapeHtml(file.name || '视频')}</a></div>`
    }
    return isVideo
      ? `<a class="typed-file typed-video-file" data-desktop-file-preview data-file-url="${escapeHtml(fileUrl)}" data-file-original-url="${escapeHtml(originalUrl || fileUrl)}" data-file-id="${escapeHtml(fileId)}" data-file-name="${escapeHtml(file.name || '视频')}" data-file-size="${escapeHtml(String(file.size || ''))}" data-file-type="${escapeHtml(file.contentType || 'video/mp4')}"${desktopBurnMediaAttribute(message)} href="${escapeHtml(fileUrl)}" target="_blank" rel="noreferrer"><span class="typed-message-icon">${icon('video')}</span><span><strong>${escapeHtml(file.name || '视频')}</strong><small>${file.size ? formatDesktopFileSize(file.size) : '点击播放'}</small></span></a>`
      : `<a class="typed-file" data-desktop-file-preview data-file-url="${escapeHtml(fileUrl)}" data-file-original-url="${escapeHtml(originalUrl || fileUrl)}" data-file-id="${escapeHtml(fileId)}" data-file-name="${escapeHtml(file.name || '文件')}" data-file-size="${escapeHtml(String(file.size || ''))}" data-file-type="${escapeHtml(file.contentType || 'application/octet-stream')}"${desktopBurnMediaAttribute(message)} href="${escapeHtml(fileUrl)}" target="_blank" rel="noreferrer"><span class="typed-message-icon">${icon('folder')}</span><span><strong>${escapeHtml(file.name || '文件')}</strong><small>${file.size ? formatDesktopFileSize(file.size) : '点击预览'}</small></span></a>`
  }
  if (type === 3) {
    if (!file?.url) return escapeHtml(desktopMessagePreview(message))
    const fileUrl = resolveDesktopFileUrl(file.url)
      const audioSource = isDesktopProtectedMediaUrl(fileUrl) ? desktopMediaRenderSource(fileUrl) : fileUrl
      return `<div class="typed-audio"><span class="typed-message-icon">${icon('mic')}</span><audio controls preload="none" src="${escapeHtml(audioSource)}" data-protected-media-src="${escapeHtml(fileUrl)}" data-file-id="${escapeHtml(file.fileId || '')}" data-file-category="audio" data-file-variant="original" aria-label="语音消息"></audio></div>`
  }
  if (type === 4) {
    const card = desktopForwardCardOf(message)
    const title = String(card?.title || card?.sourceTitle || '聊天记录')
    const declaredCount = Number(card?.count)
    const itemCount = Array.isArray(card?.items) ? card.items.length : 0
    const count = Number.isFinite(declaredCount) && declaredCount > 0 ? declaredCount : itemCount
    return `<button type="button" class="typed-card typed-forward-card" data-forward-detail="${escapeHtml(message.id)}"><span class="typed-message-icon">${icon('chat')}</span><span><strong>${escapeHtml(title)}</strong><small>${count > 0 ? `${count} 条消息` : '聊天记录'} · 点击查看</small></span></button>`
  }
  if (type === 5) {
    const card = parseDesktopJson(content) || {}
    const cardType = String(card.cardType || card.type || '').toLowerCase()
    const label = cardType === 'group' ? '群名片' : cardType === 'community' ? '圈子名片' : '个人名片'
    return `<div class="typed-card"><span class="typed-card-avatar">${escapeHtml(String(card.nickname || '?').slice(0, 1))}</span><span><strong>${escapeHtml(card.nickname || '名片')}</strong><small>${label}</small></span></div>`
  }
  if (type === 6) {
    const location = parseDesktopLocation(content)
    if (!location) return `<div class="typed-location-card typed-location-invalid"><span class="typed-location-pin">${icon('location')}</span><span class="typed-location-meta"><strong>位置信息</strong><small>位置数据暂时无法读取</small></span></div>`
    const query = `${location.latitude.toFixed(6)},${location.longitude.toFixed(6)}`
    const mapUrl = `https://api.map.baidu.com/marker?${new URLSearchParams({ location: query, title: location.name, content: location.address, output: 'html', src: 'webapp.PulseIM' }).toString()}`
    return `<a class="typed-location-card" href="${escapeHtml(mapUrl)}" target="_blank" rel="noreferrer"><span class="typed-location-map"><span class="typed-location-pin">${icon('location')}</span><i></i><i></i><i></i></span><span class="typed-location-meta"><strong>${escapeHtml(location.name)}</strong><small>${escapeHtml(location.address)}</small></span></a>`
  }
  if (type === 7 || type === 8) {
    const business = parseDesktopJson(content) || {}
    if (type === 7) {
      const packetTypeLabels = { NORMAL: '普通红包', LUCKY: '拼手气红包', EXCLUSIVE: '专属红包', PRIVATE: '红包' }
      const packetLabel = packetTypeLabels[String(business.packetType || '')] || '红包'
      const greeting = String(business.greeting || '恭喜发财，大吉大利')
      const packetNo = String(business.businessNo || business.packetNo || '')
      return packetNo
        ? `<button type="button" class="typed-business redpacket" data-red-packet-no="${escapeHtml(packetNo)}"><span class="typed-message-icon">${icon('gift')}</span><span><strong>${escapeHtml(packetLabel)}</strong><small>${escapeHtml(greeting)}</small></span></button>`
        : `<div class="typed-business redpacket"><span class="typed-message-icon">${icon('gift')}</span><span><strong>${escapeHtml(packetLabel)}</strong><small>${escapeHtml(greeting)}</small></span></div>`
    }
    const amount = Number(business.amount || 0) > 0 ? walletYuan(business.amount) : ''
    const remark = String(business.remark || '')
    const transferNo = String(business.businessNo || business.transferNo || '')
    const transferCard = `<span class="typed-message-icon">${icon('money')}</span><span><strong>转账${amount ? ` ${escapeHtml(amount)}` : ''}</strong><small>${escapeHtml(remark || '等待收款')}</small></span>`
    return transferNo
      ? `<button type="button" class="typed-business transfer" data-transfer-no="${escapeHtml(transferNo)}">${transferCard}</button>`
      : `<div class="typed-business transfer">${transferCard}</div>`
  }
  if (type === 10) {
    return `<div class="typed-card"><span class="typed-message-icon">${icon('discover')}</span><span><strong>朋友圈动态</strong><small>${escapeHtml(desktopPreviewText(content, 0))}</small></span></div>`
  }
  return renderDesktopTextContent(desktopPreviewText(content, 0))
}

function desktopMessageImageInfo(message) {
  if (!message || message.recalled || desktopIsBurnMessage(message)) return null
  const type = Number(message.msgType || 0)
  if (type !== 1 && type !== 2) return null

  const file = parseDesktopFile(message.content)
  if (!file?.url) return null
  const fileUrl = resolveDesktopFileUrl(file.url)
  const originalUrl = file.originalUrl ? resolveDesktopFileUrl(file.originalUrl) : ''
  const contentType = String(file.contentType || '').toLowerCase()
  const isImage = type === 1
    || contentType.startsWith('image/')
    || /\.(jpe?g|png|gif|webp|heic|heif)(\?|$)/i.test(`${fileUrl} ${String(file.name || '')}`)
  return isImage
    ? { url: fileUrl, originalUrl: originalUrl && originalUrl !== fileUrl ? originalUrl : '', name: String(file.name || '聊天图片') }
    : null
}

function desktopMessageMediaDownloadInfo(message) {
  if (!message || message.recalled || desktopIsBurnMessage(message)) return null
  const type = Number(message.msgType || 0)
  if (type !== 1 && type !== 2) return null

  const file = parseDesktopFile(message.content)
  if (!file?.url) return null
  const fileUrl = resolveDesktopFileUrl(file.url)
  if (!fileUrl) return null
  const originalUrl = file.originalUrl ? resolveDesktopFileUrl(file.originalUrl) : ''
  const mediaUrl = originalUrl && originalUrl !== fileUrl ? originalUrl : fileUrl

  const contentType = String(file.contentType || '').toLowerCase()
  const fileName = String(file.name || '').trim()
  const urlName = desktopFileNameFromUrl(file.url)
  const isVideo = contentType.startsWith('video/') || /\.(mp4|webm|mov|m4v|3gp)(\?|$)/i.test(`${fileUrl} ${mediaUrl}`)
  if (type === 2 && !isVideo) return null

  let filename = fileName && fileName !== '文件' ? fileName : urlName
  if (!filename || filename === '文件') filename = type === 1 ? `pulse_image_${Date.now()}` : `pulse_video_${Date.now()}`
  if (!/\.[a-z0-9]{2,8}$/i.test(filename)) {
    const subtype = contentType.split('/')[1]?.split(';')[0] || ''
    if (subtype && subtype !== 'octet-stream') filename += `.${subtype}`
  }

  return { url: mediaUrl, previewUrl: fileUrl, originalUrl, filename, type: isVideo ? 'video' : 'image' }
}

function desktopMessageMediaCopyInfo(message) {
  const media = desktopMessageMediaDownloadInfo(message)
  if (!media) return null
  return { ...media, name: media.filename }
}

function desktopMessageClipboardText(message) {
  const type = Number(message?.msgType || 0)
  if (type === 0) return String(message?.content || '') || '[消息]'
  return desktopMessagePreview(message) || '[消息]'
}

function desktopMessageClipboardAttachmentInfo(message) {
  if (!message || message.recalled || desktopIsBurnMessage(message)) return null
  const file = parseDesktopFile(message.content)
  if (!file?.url) return null

  const fileUrl = resolveDesktopFileUrl(file.url)
  if (!fileUrl) return null
  const originalUrl = file.originalUrl ? resolveDesktopFileUrl(file.originalUrl) : ''
  const contentType = String(file.contentType || '').toLowerCase()
  const fileName = String(file.name || '').trim()
  const urlName = desktopFileNameFromUrl(file.url)
  const messageType = Number(message.msgType || 0)
  const imageLike = messageType === 1
    || contentType.startsWith('image/')
    || /\.(jpe?g|png|gif|webp|heic|heif)(\?|$)/i.test(`${fileUrl} ${fileName}`)
  const videoLike = contentType.startsWith('video/')
    || /\.(mp4|webm|mov|m4v|3gp)(\?|$)/i.test(`${fileUrl} ${originalUrl} ${fileName}`)
  const audioLike = messageType === 3
    || contentType.startsWith('audio/')
    || /\.(mp3|wav|ogg|m4a|aac|amr|opus)(\?|$)/i.test(`${fileUrl} ${fileName}`)
  const type = imageLike ? 'image' : videoLike ? 'video' : audioLike ? 'audio' : 'file'
  let filename = fileName && fileName !== '文件' ? fileName : urlName
  if (!filename || filename === '文件') filename = `pulse_${type}_${Date.now()}`
  if (!/\.[a-z0-9]{2,8}$/i.test(filename)) {
    const subtype = contentType.split('/')[1]?.split(';')[0] || ''
    if (subtype && subtype !== 'octet-stream') filename += `.${subtype}`
  }

  return {
    url: originalUrl && originalUrl !== fileUrl ? originalUrl : fileUrl,
    previewUrl: fileUrl,
    originalUrl,
    filename,
    name: filename,
    contentType: contentType || 'application/octet-stream',
    size: Number(file.size || file.originalSize || 0),
    type,
  }
}

function desktopMessageClipboardPayload(message) {
  const attachment = desktopMessageClipboardAttachmentInfo(message)
  const plainText = desktopMessageClipboardText(message)
  return attachment
    ? { version: DESKTOP_MESSAGE_CLIPBOARD_VERSION, kind: 'attachment', attachment, plainText }
    : { version: DESKTOP_MESSAGE_CLIPBOARD_VERSION, kind: 'text', text: plainText, plainText }
}

function parseDesktopMessageClipboardPayload(value) {
  if (!value) return null
  let payload = value
  if (typeof value === 'string') {
    try {
      payload = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (!payload || Number(payload.version) !== DESKTOP_MESSAGE_CLIPBOARD_VERSION) return null
  if (payload.kind === 'text' && typeof payload.text === 'string') {
    return { ...payload, plainText: String(payload.plainText || payload.text) }
  }
  const attachment = payload.kind === 'attachment' ? payload.attachment : null
  if (!attachment || typeof attachment !== 'object' || !attachment.url) return null
  return {
    ...payload,
    plainText: String(payload.plainText || attachment.name || '[文件]'),
    attachment: {
      ...attachment,
      url: String(attachment.url),
      name: String(attachment.name || attachment.filename || '文件'),
      filename: String(attachment.filename || attachment.name || '文件'),
      type: String(attachment.type || 'file'),
      contentType: String(attachment.contentType || 'application/octet-stream'),
    },
  }
}

async function copyDesktopMessageToClipboard(message) {
  if (desktopIsBurnMessage(message)) throw new Error('阅后即焚消息不能复制')
  const payload = desktopMessageClipboardPayload(message)
  desktopCopiedMessagePayload = { ...payload, copiedAt: Date.now() }
  const plainText = String(payload.plainText || payload.text || '[消息]')
  const serialized = JSON.stringify(payload)
  let blob = null

  if (payload.kind === 'attachment' && (payload.attachment.type === 'image' || payload.attachment.type === 'video')) {
    try {
      // Copy the image currently shown in the chat. The original URL is kept
      // in the clipboard metadata for in-app paste, but fetching it here
      // makes a normal Copy operation wait for the full original unnecessarily.
      const copyUrl = payload.attachment.type === 'image'
        ? (payload.attachment.previewUrl || payload.attachment.url)
        : payload.attachment.url
      blob = await fetchDesktopProtectedBlob(copyUrl)
    } catch {
      // The metadata representation can still restore the attachment in this app.
    }
  }

  // In Electron, writing a multi-representation ClipboardItem first can wait
  // on Chromium's custom-format negotiation and then fall back to a second
  // clipboard write. The native path is immediate once the bytes are cached.
  if (blob && payload.kind === 'attachment' && payload.attachment.type === 'image' && window.pulseDesktop?.copyImageToClipboard) {
    await copyDesktopBlob(blob)
    return payload
  }

  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    try {
      const representations = {
        [DESKTOP_MESSAGE_CLIPBOARD_MIME]: new Blob([serialized], { type: DESKTOP_MESSAGE_CLIPBOARD_MIME }),
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
      }
      if (blob && payload.attachment.type === 'image') representations[blob.type || 'image/png'] = blob
      await navigator.clipboard.write([new ClipboardItem(representations)])
      return payload
    } catch {
      // Custom clipboard formats are not supported by every Chromium build.
    }
  }

  if (blob && payload.kind === 'attachment' && payload.attachment.type === 'image') {
    try {
      await copyDesktopBlob(blob)
      return payload
    } catch {
      // Fall through to a readable text representation.
    }
  }
  await copyDesktopText(plainText)
  return payload
}

async function saveDesktopMessageMediaAs(message) {
  const media = desktopMessageMediaDownloadInfo(message)
  if (!media) {
    showToast('仅支持保存图片或视频')
    return
  }

  const desktopShell = window.pulseDesktop
  if (desktopShell?.chooseSavePath && desktopShell?.downloadFileToPath) {
    try {
      const choice = await desktopShell.chooseSavePath({ filename: media.filename })
      if (!choice || choice.canceled || !choice.filePath) return
      showToast('正在下载…')
      const token = getDesktopToken()
      const result = await desktopShell.downloadFileToPath({
        filePath: choice.filePath,
        url: media.url,
        authorization: token ? `Bearer ${token}` : '',
      })
      if (!result?.ok) throw new Error(result?.error || '下载失败')
      showToast('已保存到本地')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '下载失败')
    }
    return
  }

  // Browser fallback: use the native file picker when available.
  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: media.filename })
      showToast('正在下载…')
      const headers = {}
      const token = getDesktopToken()
      if (token) headers.Authorization = `Bearer ${token}`
      const response = await fetch(media.url, { credentials: 'include', headers })
      if (!response.ok) throw new Error(`下载失败（${response.status}）`)
      const blob = await response.blob()
      try {
        const writable = await handle.createWritable()
        await writable.write(blob)
        await writable.close()
        showToast('已保存到本地')
      } catch (error) {
        if (error?.name === 'AbortError') throw error
        // Some browser/Electron contexts expose the picker but reject the
        // writable handle. Download the fetched bytes instead of surfacing
        // the platform error.
        const blobUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = blobUrl
        link.download = media.filename
        link.rel = 'noreferrer'
        document.body.append(link)
        link.click()
        link.remove()
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
        showToast('已开始下载')
      }
    } catch (error) {
      if (error?.name !== 'AbortError') showToast(error instanceof Error ? error.message : '下载失败')
    }
    return
  }

  try {
    const headers = {}
    const token = getDesktopToken()
    if (token) headers.Authorization = `Bearer ${token}`
    const response = await fetch(media.url, { credentials: 'include', headers })
    if (!response.ok) throw new Error(`下载失败（${response.status}）`)
    const blobUrl = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = media.filename
    link.rel = 'noreferrer'
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
    showToast('已开始下载')
  } catch {
    // Cross-origin file servers may reject a renderer fetch. Keep the browser
    // download fallback so the media can still be saved by the desktop shell.
    const link = document.createElement('a')
    link.href = media.url
    link.download = media.filename
    link.rel = 'noreferrer'
    document.body.append(link)
    link.click()
    link.remove()
    showToast('已开始下载')
  }
}

function syncDesktopComposerTransientDom() {
  if (!state.replyTarget) document.querySelector('.message-reply-composer')?.remove()
  if (!state.showMentionPicker) document.querySelector('.desktop-mention-picker')?.remove()
  if (!state.showEmojiPanel) document.querySelector('.desktop-emoji-panel')?.remove()
  if (!state.showPlusMenu) document.querySelector('.desktop-plus-menu')?.remove()
  if (!state.pendingDroppedFile) document.querySelector('[data-pending-dropped-file]')?.remove()
}

function syncDesktopComposerBusyDom() {
  const selected = conversations[state.selectedConversation]
  const blockReason = desktopChatBlockReason(selected)
  const busy = Boolean(state.sendingMessage || state.uploadingFile)
  const textarea = document.querySelector('[data-message-composer]')
  if (textarea instanceof HTMLTextAreaElement) {
    textarea.disabled = busy || Boolean(blockReason)
    textarea.placeholder = blockReason || '写下你的消息…'
  }
  const sendButton = document.querySelector('[data-action="send"]')
  if (sendButton instanceof HTMLButtonElement) {
    sendButton.disabled = Boolean(state.sendingMessage || blockReason)
  }
  const hint = document.querySelector('.composer-hint')
  if (hint instanceof HTMLElement) {
    hint.textContent = `Enter 发送 · Shift + Enter 换行${state.uploadingFile ? ' · 正在上传…' : ''}`
  }
}

function syncDesktopVoiceDom() {
  const button = document.querySelector('[data-action="voice-record"]')
  if (!(button instanceof HTMLButtonElement)) return
  const busy = Boolean(state.voiceRecordBusy)
  const recording = Boolean(state.recordingVoice)
  button.classList.toggle('is-recording', recording)
  button.classList.toggle('is-busy', busy)
  button.setAttribute('aria-label', recording ? '停止录音' : busy ? '正在请求麦克风' : '语音消息')
  button.setAttribute('title', recording ? '停止录音' : busy ? '正在请求麦克风' : '点击录制语音消息')
  const label = button.querySelector('.composer-voice-label')
  if (label) {
    label.textContent = busy
      ? '正在准备语音…'
      : recording
        ? `正在录音 ${state.voiceRecordSeconds} 秒 · 点击停止`
        : '语音消息'
  }
}

function syncDesktopSentMessageDom(conversation, mapped) {
  if (state.page !== 'messages' || document.hidden) return false
  if (!appendDesktopIncomingMessage(conversation, mapped)) return false
  updateDesktopConversationListRow(conversation)
  updateDesktopConversationFilterBadges()
  syncDesktopShellBadge()
  state.scrollChatToBottom = false
  return true
}

function syncDesktopRefreshButtonDom() {
  const button = document.querySelector('[data-action="global-refresh"]')
  if (!(button instanceof HTMLButtonElement)) return
  button.disabled = Boolean(state.globalRefreshing)
  button.classList.toggle('is-refreshing', Boolean(state.globalRefreshing))
  const label = state.globalRefreshing ? '正在刷新数据' : '刷新数据'
  button.setAttribute('aria-label', label)
  button.setAttribute('title', state.globalRefreshing ? '正在刷新当前页面数据' : '刷新当前页面数据')
}

async function sendDesktopTypedMessage(content, msgType = 0, preview = '', mentionPayload = { mentionUserIds: [], atAll: false }, fileId = '', filePayload = null) {
  const selected = conversations[state.selectedConversation]
  if (!selected?.id || state.dataSource !== 'remote') {
    showToast('在线数据未加载，暂不能发送')
    return false
  }
  const chatBlockReason = desktopChatBlockReason(selected)
  if (chatBlockReason) {
    showToast(chatBlockReason)
    return false
  }
  if (state.sendingMessage) return false
  const clientMsgId = `desktop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const replyTarget = msgType === 0 ? state.replyTarget : null
  const replyToMsgId = String(replyTarget?.id || '')
  let messageDomSynced = false
  state.sendingMessage = true
  syncDesktopComposerBusyDom()
  try {
    const normalizedFileId = String(fileId || '').trim()
    const wireContent = normalizedFileId ? `file:${normalizedFileId}` : content
    const ack = await sendDesktopChatMessageAwaitAck({
      conversationId: selected.id,
      toUserId: selected.peerUserId || undefined,
      content: wireContent,
      fileId: normalizedFileId || undefined,
      clientMsgId,
      msgType,
      replyToMsgId: replyToMsgId || undefined,
      mentionUserIds: msgType === 0 ? mentionPayload.mentionUserIds : [],
      atAll: msgType === 0 ? mentionPayload.atAll : false,
    }, getDesktopToken() || '')
    const message = {
      ...ack,
      id: ack.msgId || ack.id || clientMsgId,
      conversationId: selected.id,
      fromUserId: state.profile.userId,
      toUserId: selected.peerUserId || '',
      content: wireContent,
      fileId: normalizedFileId || undefined,
      msgType,
    }
    const mapped = mapRemoteMessage({
      ...message,
      clientMsgId,
      msgType,
      fileId: normalizedFileId || message.fileId || undefined,
      replyToMsgId: message.replyToMsgId || replyToMsgId,
      replyToContent: message.replyToContent || replyTarget?.content || '',
      replyToMsgType: message.replyToMsgType || replyTarget?.msgType || 0,
      replyToNickname: message.replyToNickname || replyTarget?.fromNickname || '',
      replyToRecalled: message.replyToRecalled || replyTarget?.recalled || false,
      file: filePayload || message.file || undefined,
    })
    // A freshly uploaded video contains the original object immediately, but
    // its thumb/preview may still be generated asynchronously. Keep the
    // completeness flag from mapRemoteMessage so metadata hydration can run.
    const mappedWithLocalFile = mapped
    mergeMessage(selected.id, mappedWithLocalFile)
    if (replyToMsgId) state.replyTarget = null
    selected.preview = formatDesktopConversationPreview(desktopPreviewText(preview || content, msgType), true)
    selected.time = '刚刚'
    state.scrollChatToBottom = true
    messageDomSynced = syncDesktopSentMessageDom(selected, mappedWithLocalFile)
    return true
  } catch (error) {
    if (!getDesktopToken()) {
      state.authenticated = false
      state.dataSource = 'error'
      stopDesktopWsConnection()
    }
    showToast(error instanceof Error ? error.message : '消息发送失败')
    return false
  } finally {
    state.sendingMessage = false
    syncDesktopComposerBusyDom()
    syncDesktopComposerTransientDom()
    if (!messageDomSynced) requestDesktopRender()
  }
}

async function sendCurrentMessage() {
  if (state.sendingMessage || state.uploadingFile) return
  const textarea = document.querySelector('[data-message-composer]')
  const content = textarea?.value?.trim() || ''
  const selected = conversations[state.selectedConversation]
  const pendingFile = state.pendingDroppedFile
    && String(state.pendingDroppedFileConversationId) === String(selected?.id || '')
    ? state.pendingDroppedFile
    : null
  if (!textarea || !selected?.id || (!content && !pendingFile)) return
  const chatBlockReason = desktopChatBlockReason(selected)
  if (chatBlockReason) {
    showToast(chatBlockReason)
    return
  }
  const mentionPayload = selected?.type === 'group'
    ? resolveDesktopOutgoingMentions(content)
    : { mentionUserIds: [], atAll: false }
  textarea.value = ''
  state.composerText = ''
  state.showEmojiPanel = false
  state.showPlusMenu = false
  state.showMentionPicker = false
  clearPendingDesktopMentions()
  syncDesktopComposerTransientDom()
  // Text and attachments are separate message types on the server. Keep
  // both in the same composer action so clicking Send or pressing Enter
  // cannot drop a selected attachment.
  let textSent = true
  if (content) {
    textSent = await sendDesktopTypedMessage(content, 0, content, mentionPayload)
    if (!textSent) {
      // Keep a selected image and the accompanying text available for a
      // retry when the text half of a mixed send fails.
      textarea.value = content
      state.composerText = content
    }
  }
  if (pendingFile && textSent) {
    const pendingPreviewUrl = String(state.pendingDroppedFilePreviewUrl || '')
    const fileSent = await sendDesktopFile(pendingFile, { localPreviewUrl: pendingPreviewUrl })
    if (fileSent) {
      clearPendingDesktopFile({ preservePreviewUrl: pendingPreviewUrl })
      syncDesktopComposerTransientDom()
    }
  }
  // 发送后仍恢复输入框焦点，便于连续输入下一条消息。
  window.setTimeout(() => {
    document.querySelector('[data-message-composer]')?.focus()
  }, 0)
}

async function sendDesktopFile(file, options = {}) {
  if (!file) return false
  const selected = conversations[state.selectedConversation]
  const chatBlockReason = desktopChatBlockReason(selected)
  if (chatBlockReason) {
    showToast(chatBlockReason)
    return false
  }
  const meta = desktopFileTransferMeta(file)
  if (file.size > meta.max) {
    showToast(`${meta.label}不能超过 ${meta.isVideo ? '80MB' : '20MB'}`)
    return false
  }
  const msgType = meta.msgType
  const localPreviewUrl = meta.isImage ? String(options.localPreviewUrl || '').trim() : ''
  let localImageSources = []
  state.uploadingFile = true
  syncDesktopComposerBusyDom()
  try {
    const uploaded = await uploadDesktopFile(file)
    if (!uploaded.fileId) throw new Error('文件上传成功但未返回 fileId')
    // Transfer ownership of the pending local object URL to the sent message
    // before its DOM is painted. The message can therefore render immediately
    // without waiting for the protected server rendition to download.
    localImageSources = registerDesktopLocalImagePreview(uploaded.fileId, uploaded, localPreviewUrl)
    const payload = JSON.stringify({
      fileId: uploaded.fileId,
      objectKey: uploaded.objectKey,
      thumbObjectKey: uploaded.thumbObjectKey,
      previewObjectKey: uploaded.previewObjectKey,
      url: uploaded.url,
      originalUrl: uploaded.originalUrl,
      thumbUrl: uploaded.thumbUrl,
      previewUrl: uploaded.previewUrl,
      name: uploaded.name || file.name,
      size: uploaded.size,
      originalSize: uploaded.originalSize,
      contentType: uploaded.contentType || file.type,
      downloadUrl: uploaded.downloadUrl,
      sha256: uploaded.sha256,
      width: uploaded.width,
      height: uploaded.height,
      durationMs: uploaded.durationMs,
      localPreviewUrl: localPreviewUrl || undefined,
    })
    const sent = await sendDesktopTypedMessage(payload, msgType, msgType === 1 ? '[图片]' : `[文件] ${file.name}`, { mentionUserIds: [], atAll: false }, uploaded.fileId, uploaded)
    if (state.dataSource === 'remote') {
      state.fileLoaded = false
      if (state.page === 'files') void loadDesktopFiles(true)
    }
    return sent
  } catch (error) {
    unregisterDesktopLocalImagePreview(localImageSources, localPreviewUrl)
    showToast(error instanceof Error ? error.message : '文件发送失败')
    return false
  } finally {
    state.uploadingFile = false
    syncDesktopComposerBusyDom()
    syncDesktopComposerTransientDom()
  }
}

function desktopLocationPickerDefaultState() {
  return {
    loading: true,
    locating: false,
    searching: false,
    error: '',
    keyword: '',
    results: [],
    nearby: [],
    selected: null,
  }
}

function disposeDesktopLocationPickerMap() {
  const runtime = desktopLocationPickerRuntime
  if (runtime.searchTimer) window.clearTimeout(runtime.searchTimer)
  runtime.searchTimer = null
  runtime.searchSequence += 1
  runtime.initSequence += 1
  runtime.initPromise = null
  runtime.localSearch = null
  runtime.geocoder = null
  if (runtime.map?.clearOverlays) runtime.map.clearOverlays()
  runtime.map = null
  runtime.mapElement = null
  runtime.marker = null
  runtime.locationFallback = false
}

function renderDesktopLocationResults() {
  const picker = state.locationPicker
  if (picker.searching) return '<div class="desktop-location-state">正在搜索地点…</div>'
  if (!picker.results.length) return ''
  return `<div class="desktop-location-result-list">${picker.results.map((item, index) => `<button type="button" class="desktop-location-place" data-location-result="${index}"><span class="desktop-location-place-icon">${icon('location')}</span><span><strong>${escapeHtml(item.title || '选择的位置')}</strong><small>${escapeHtml(item.address || '暂无详细地址')}</small></span>${icon('arrow')}</button>`).join('')}</div>`
}

function desktopLocationPickerIsSelected(item) {
  const selected = state.locationPicker.selected
  if (!selected || !item?.point) return false
  return Math.abs(Number(item.point.lat) - Number(selected.latitude)) < 0.000001
    && Math.abs(Number(item.point.lng) - Number(selected.longitude)) < 0.000001
}

function renderDesktopLocationNearby() {
  const picker = state.locationPicker
  if (picker.results.length) return ''
  if (picker.nearby.length) {
    return `<section class="desktop-location-nearby"><h3>附近位置</h3>${picker.nearby.map((item, index) => `<button type="button" class="desktop-location-place ${desktopLocationPickerIsSelected(item) ? 'is-selected' : ''}" data-location-nearby="${index}"><span class="desktop-location-place-icon">${icon(desktopLocationPickerIsSelected(item) ? 'check' : 'location')}</span><span><strong>${escapeHtml(item.title || '选择的位置')}</strong><small>${escapeHtml(item.address || '暂无详细地址')}</small></span></button>`).join('')}</section>`
  }
  return '<div class="desktop-location-hint">点击地图选择位置，或搜索一个地点。</div>'
}

function renderDesktopLocationSelected() {
  const selected = state.locationPicker.selected
  if (!selected) return '<span class="desktop-location-selected-placeholder">尚未选择位置</span>'
  return `<span class="desktop-location-selected-icon">${icon('location')}</span><span class="desktop-location-selected-copy"><strong>${escapeHtml(selected.name || '选择的位置')}</strong><small>${escapeHtml(selected.address || '')}</small></span>`
}

function updateDesktopLocationPickerPanels() {
  const momentMode = state.locationPickerMode === 'moment'
  const results = document.querySelector('[data-location-results]')
  if (results) results.innerHTML = renderDesktopLocationResults()
  const nearby = document.querySelector('[data-location-nearby]')
  if (nearby) nearby.innerHTML = renderDesktopLocationNearby()
  const selected = document.querySelector('[data-location-selected]')
  if (selected) selected.innerHTML = renderDesktopLocationSelected()
  const send = document.querySelector('[data-location-send]')
  if (send instanceof HTMLButtonElement) {
    send.disabled = !state.locationPicker.selected || state.modalBusy || state.sendingMessage
    send.textContent = state.modalBusy ? (momentMode ? '保存中…' : '发送中…') : (momentMode ? '使用此位置' : '发送位置')
  }
  const query = document.querySelector('[data-location-query]')
  if (query instanceof HTMLInputElement && query.value !== state.locationPicker.keyword) query.value = state.locationPicker.keyword
  const current = document.querySelector('[data-location-current]')
  if (current instanceof HTMLButtonElement) {
    current.disabled = state.locationPicker.locating || state.locationPicker.loading || state.modalBusy
    current.innerHTML = `${icon('location')} ${state.locationPicker.locating ? '正在定位…' : (momentMode ? '使用当前位置' : '发送当前位置')}`
  }
}

function updateDesktopLocationPickerMapState() {
  const mapState = document.querySelector('[data-location-map-state]')
  if (!(mapState instanceof HTMLElement)) return
  const picker = state.locationPicker
  mapState.hidden = !picker.loading && !picker.error
  mapState.classList.toggle('is-error', Boolean(picker.error))
  mapState.innerHTML = picker.error
    ? `<span>${icon('location')}</span><strong>${escapeHtml(picker.error)}</strong><small>可以关闭后重试</small>`
    : `<span class="desktop-location-spinner">${icon('refresh')}</span><strong>正在加载百度地图…</strong>`
}

function enableDesktopLocationPickerFallback(mapElement, title = '当前网页使用浏览器定位') {
  const runtime = desktopLocationPickerRuntime
  runtime.BMap = null
  runtime.map = null
  runtime.mapElement = mapElement
  runtime.marker = null
  runtime.geocoder = null
  runtime.localSearch = null
  runtime.locationFallback = true
  mapElement.innerHTML = `<div class="desktop-location-map-fallback"><span class="desktop-location-fallback-icon">⌖</span><strong>${escapeHtml(title)}</strong><small>地图不可用时仍可获取当前位置</small></div>`
  state.locationPicker.loading = false
  state.locationPicker.error = ''
  updateDesktopLocationPickerMapState()
  updateDesktopLocationPickerPanels()
}

function setDesktopLocationPickerMarker(point, zoom = 17) {
  const runtime = desktopLocationPickerRuntime
  if (!runtime.map || !runtime.BMap || !point) return
  if (runtime.marker) runtime.map.removeOverlay(runtime.marker)
  runtime.marker = new runtime.BMap.Marker(point)
  runtime.map.addOverlay(runtime.marker)
  runtime.map.centerAndZoom(point, zoom)
}

function applyDesktopLocationPickerSelection(item, point = item?.point) {
  if (!item || !point) return
  state.locationPicker.selected = {
    latitude: Number(point.lat),
    longitude: Number(point.lng),
    name: String(item.title || item.name || '选择的位置'),
    address: String(item.address || item.name || '暂无详细地址'),
  }
  state.locationPicker.results = []
  state.locationPicker.keyword = ''
  state.locationPicker.searching = false
  setDesktopLocationPickerMarker(point)
  updateDesktopLocationPickerPanels()
}

function reverseDesktopLocationPicker(point, fallbackName = '选择的位置', sendAfterResolve = false) {
  const runtime = desktopLocationPickerRuntime
  if (!point || !runtime.geocoder) return
  runtime.searchSequence += 1
  state.locationPicker.results = []
  state.locationPicker.keyword = ''
  state.locationPicker.searching = false
  setDesktopLocationPickerMarker(point)
  runtime.geocoder.getLocation(point, (result) => {
    if (state.modal !== 'location') return
    const address = String(result?.address || '').trim()
    const component = result?.addressComponents || {}
    const pois = Array.isArray(result?.surroundingPois)
      ? result.surroundingPois.filter((item) => item?.point).slice(0, 10)
      : []
    const fallbackPlace = { point, title: component.street || fallbackName, address: address || fallbackName }
    state.locationPicker.nearby = pois.length ? pois : [fallbackPlace]
    const poi = state.locationPicker.nearby[0]
    const selectedPoint = poi?.point || point
    state.locationPicker.selected = {
      latitude: Number(selectedPoint.lat),
      longitude: Number(selectedPoint.lng),
      name: String(poi?.title || component.street || fallbackName),
      address: String(poi?.address || address || fallbackName),
    }
    setDesktopLocationPickerMarker(selectedPoint)
    updateDesktopLocationPickerPanels()
    if (sendAfterResolve) void completeDesktopLocationPickerSelection()
  }, { poiRadius: 1500, numPois: 10 })
}

function locateDesktopLocationPicker(sendAfterResolve = false) {
  sendAfterResolve = sendAfterResolve === true
  const runtime = desktopLocationPickerRuntime
  if (!navigator.geolocation && (runtime.locationFallback || !runtime.BMap?.Geolocation)) return showToast('当前设备不支持定位')
  if (!runtime.locationFallback && (!runtime.BMap || !runtime.map)) return showToast('地图还在加载，请稍候')
  const requestedMapElement = runtime.mapElement
  state.locationPicker.locating = true
  updateDesktopLocationPickerPanels()
  let locationRequestFinished = false
  let baiduLocationTimer = null
  let cityLocationTimer = null
  let nativeLocationFinished = !navigator.geolocation
  let baiduLocationFinished = false

  const clearLocationTimers = () => {
    if (baiduLocationTimer) window.clearTimeout(baiduLocationTimer)
    if (cityLocationTimer) window.clearTimeout(cityLocationTimer)
    baiduLocationTimer = null
    cityLocationTimer = null
  }

  const claimLocationRequest = () => {
    if (locationRequestFinished) return false
    locationRequestFinished = true
    clearLocationTimers()
    return true
  }

  const handlePosition = (position) => {
    if (state.modal !== 'location' || desktopLocationPickerRuntime.mapElement !== requestedMapElement) return
    if (!claimLocationRequest()) return
    state.locationPicker.locating = false
    if (runtime.locationFallback) {
      const latitude = Number(position.coords.latitude)
      const longitude = Number(position.coords.longitude)
      const point = { lat: latitude, lng: longitude }
      state.locationPicker.nearby = [{ point, title: '当前位置', address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}` }]
      state.locationPicker.selected = { latitude, longitude, name: '当前位置', address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}` }
      updateDesktopLocationPickerPanels()
      if (sendAfterResolve) void completeDesktopLocationPickerSelection()
      return
    }
    const gps = new runtime.BMap.Point(position.coords.longitude, position.coords.latitude)
    const converter = new runtime.BMap.Convertor()
    converter.translate([gps], 1, 5, (data) => {
      const point = data?.status === 0 && data.points?.[0] ? data.points[0] : gps
      reverseDesktopLocationPicker(point, '当前位置', sendAfterResolve)
    })
  }

  const handleFailure = (provider = 'native') => {
    if (state.modal !== 'location' || desktopLocationPickerRuntime.mapElement !== requestedMapElement) return
    if (provider === 'baidu') baiduLocationFinished = true
    else nativeLocationFinished = true
    // Electron's file:// renderer and the browser provider can have very
    // different results. Wait for both providers before showing an error so
    // a slow provider cannot hide a fast successful fallback.
    if (!nativeLocationFinished || !baiduLocationFinished) return
    if (!claimLocationRequest()) return
    state.locationPicker.locating = false

    // A desktop without a GPS/Wi-Fi location provider may still be located
    // to a city through Baidu's network estimate. Keep the picker usable, but
    // label the result clearly so an approximate point is never mistaken for
    // an exact device position.
    if (!runtime.locationFallback && runtime.BMap?.LocalCity) {
      let cityEstimateFinished = false
      const failCityEstimate = () => {
        if (cityEstimateFinished) return
        cityEstimateFinished = true
        if (cityLocationTimer) window.clearTimeout(cityLocationTimer)
        cityLocationTimer = null
        updateDesktopLocationPickerPanels()
        showToast('定位失败，请开启定位权限或在地图上选点')
      }
      try {
        const localCity = new runtime.BMap.LocalCity()
        cityLocationTimer = window.setTimeout(failCityEstimate, 10_000)
        localCity.get((result) => {
          if (state.modal !== 'location' || desktopLocationPickerRuntime.mapElement !== requestedMapElement) return
          const cityName = String(result?.name || '').trim()
          const completeEstimate = (point) => {
            if (!point || cityEstimateFinished) return
            cityEstimateFinished = true
            if (cityLocationTimer) window.clearTimeout(cityLocationTimer)
            cityLocationTimer = null
            const item = {
              point,
              title: cityName ? `${cityName}（网络估算）` : '当前位置（网络估算）',
              address: '未获取到电脑精确定位，请在地图上点击确认',
            }
            state.locationPicker.nearby = [item]
            applyDesktopLocationPickerSelection(item, point)
            updateDesktopLocationPickerPanels()
            showToast('未获取到精确位置，已定位到城市中心，请在地图上确认')
          }
          if (result?.center) {
            completeEstimate(result.center)
            return
          }
          if (cityName && runtime.geocoder?.getPoint) {
            runtime.geocoder.getPoint(cityName, (point) => completeEstimate(point))
            return
          }
          updateDesktopLocationPickerPanels()
          failCityEstimate()
        })
        return
      } catch {
        // Fall through to the normal failure message.
      }
    }
    updateDesktopLocationPickerPanels()
    showToast('定位失败，请开启定位权限或在地图上选点')
  }

  // Run the native Windows/browser provider and Baidu's adapter in parallel.
  // The Electron file:// renderer can wait for a location provider that is not
  // available on the computer, while Baidu can often resolve the desktop much
  // sooner through its network adapter.
  const tryBaiduLocation = () => {
    if (locationRequestFinished) return
    if (runtime.locationFallback || !runtime.BMap?.Geolocation) {
      handleFailure('baidu')
      return
    }
    try {
      const geolocation = new runtime.BMap.Geolocation()
      baiduLocationTimer = window.setTimeout(() => handleFailure('baidu'), 8_000)
      geolocation.getCurrentPosition(function (result) {
        if (baiduLocationTimer) window.clearTimeout(baiduLocationTimer)
        baiduLocationTimer = null
        if (locationRequestFinished) return
        if (this.getStatus?.() === 0 && result?.point) {
          baiduLocationFinished = true
          if (!claimLocationRequest()) return
          state.locationPicker.locating = false
          reverseDesktopLocationPicker(result.point, '当前位置', sendAfterResolve)
          return
        }
        handleFailure('baidu')
      }, { enableHighAccuracy: false, timeout: 8_000, maximumAge: 30_000 })
    } catch {
      handleFailure('baidu')
    }
  }

  // Starting both immediately keeps the fast provider responsive while still
  // preserving the more accurate native result when it is available first.
  tryBaiduLocation()
  if (navigator.geolocation) {
    try {
      navigator.geolocation.getCurrentPosition(handlePosition, () => handleFailure('native'), {
        enableHighAccuracy: false,
        timeout: 8_000,
        maximumAge: 30_000,
      })
    } catch {
      handleFailure('native')
    }
  }
}

function searchDesktopLocationPicker() {
  const runtime = desktopLocationPickerRuntime
  const query = String(state.locationPicker.keyword || '').trim()
  const sequence = ++runtime.searchSequence
  if (!query || !runtime.BMap || !runtime.map) {
    state.locationPicker.searching = false
    state.locationPicker.results = []
    updateDesktopLocationPickerPanels()
    return
  }
  state.locationPicker.searching = true
  updateDesktopLocationPickerPanels()
  const search = new runtime.BMap.LocalSearch(runtime.map, { pageCapacity: 8 })
  runtime.localSearch = search
  search.setSearchCompleteCallback((searchResult) => {
    if (sequence !== runtime.searchSequence || state.modal !== 'location' || query !== String(state.locationPicker.keyword || '').trim()) return
    const items = []
    const count = Number(searchResult?.getCurrentNumPois?.() || 0)
    for (let index = 0; index < count; index += 1) {
      const poi = searchResult.getPoi(index)
      if (poi?.point) items.push(poi)
    }
    state.locationPicker.searching = false
    state.locationPicker.results = items
    updateDesktopLocationPickerPanels()
  })
  search.search(query)
}

function scheduleDesktopLocationSearch() {
  const runtime = desktopLocationPickerRuntime
  if (runtime.composing) return
  if (runtime.searchTimer) window.clearTimeout(runtime.searchTimer)
  if (!String(state.locationPicker.keyword || '').trim()) {
    runtime.searchSequence += 1
    state.locationPicker.searching = false
    state.locationPicker.results = []
    updateDesktopLocationPickerPanels()
    return
  }
  runtime.searchTimer = window.setTimeout(() => searchDesktopLocationPicker(), 350)
}

function ensureDesktopLocationPickerMap() {
  if (state.modal !== 'location') return
  const mapElement = document.querySelector('#desktop-location-map')
  if (!(mapElement instanceof HTMLElement)) return
  const runtime = desktopLocationPickerRuntime
  if ((runtime.map || runtime.locationFallback) && runtime.mapElement === mapElement) return
  if (runtime.initPromise) return
  if (runtime.mapElement && runtime.mapElement !== mapElement) disposeDesktopLocationPickerMap()
  const requestedElement = mapElement
  const initSequence = ++runtime.initSequence
  runtime.initPromise = (async () => {
    try {
      // Electron 的渲染页是 file://，但主进程会为百度地图请求补上
      // 与桌面网页一致的 Referer。这样 EXE 也可以使用完整的地图选点、
      // 地点搜索和反向地理编码；只有地图服务确实不可用时才进入兜底。
      const config = await fetchDesktopMapConfig()
      if (initSequence !== runtime.initSequence) return
      if (!config.configured || !config.ak) throw new Error('地图AK尚未配置，请联系管理员')
      const BMap = await loadDesktopBaiduMap(config.ak)
      if (initSequence !== runtime.initSequence) return
      if (state.modal !== 'location') return
      const currentElement = document.querySelector('#desktop-location-map')
      if (currentElement !== requestedElement || !(currentElement instanceof HTMLElement)) {
        window.setTimeout(() => {
          if (initSequence === runtime.initSequence) ensureDesktopLocationPickerMap()
        }, 0)
        return
      }
      runtime.BMap = BMap
      runtime.mapElement = currentElement
      runtime.map = new BMap.Map(currentElement, { enableMapClick: false })
      const selected = state.locationPicker.selected
      const initial = selected
        ? new BMap.Point(selected.longitude, selected.latitude)
        : new BMap.Point(116.404, 39.915)
      runtime.map.centerAndZoom(initial, selected ? 17 : 12)
      runtime.map.enableScrollWheelZoom(true)
      runtime.geocoder = new BMap.Geocoder()
      runtime.map.addEventListener('click', (event) => reverseDesktopLocationPicker(event.point))
      if (selected) setDesktopLocationPickerMarker(initial)
      state.locationPicker.loading = false
      state.locationPicker.error = ''
      updateDesktopLocationPickerMapState()
      updateDesktopLocationPickerPanels()
      if (String(state.locationPicker.keyword || '').trim()) searchDesktopLocationPicker()
    } catch (error) {
      if (state.modal !== 'location') return
      enableDesktopLocationPickerFallback(requestedElement, '地图暂不可用，可定位当前位置')
    } finally {
      if (initSequence === runtime.initSequence) runtime.initPromise = null
    }
  })()
}

async function sendDesktopSelectedLocation() {
  const selected = state.locationPicker.selected
  const conversation = conversations[state.selectedConversation]
  if (!selected || state.modalBusy || !ensureDesktopCanSend(conversation)) return
  state.modalBusy = true
  updateDesktopLocationPickerPanels()
  const payload = JSON.stringify(selected)
  const sent = await sendDesktopTypedMessage(payload, 6, `[位置] ${selected.name}`)
  state.modalBusy = false
  if (!sent) {
    updateDesktopLocationPickerPanels()
    return
  }
  disposeDesktopLocationPickerMap()
  state.locationPicker = desktopLocationPickerDefaultState()
  state.modal = ''
  state.modalError = ''
  render()
}

function completeDesktopLocationPickerSelection() {
  if (state.locationPickerMode !== 'moment') {
    return sendDesktopSelectedLocation()
  }
  const selected = state.locationPicker.selected
  if (!selected || state.modalBusy) return
  state.momentLocation = { ...selected }
  disposeDesktopLocationPickerMap()
  state.locationPicker = desktopLocationPickerDefaultState()
  state.locationPickerMode = 'chat'
  state.modal = ''
  state.modalError = ''
  state.modalBusy = false
  state.momentDraftDirty = true
  render()
}

function openDesktopLocationPicker(mode = 'chat') {
  const selected = conversations[state.selectedConversation]
  const momentMode = mode === 'moment'
  if (!momentMode && !selected?.id) return
  disposeDesktopLocationPickerMap()
  state.showPlusMenu = false
  state.locationPicker = desktopLocationPickerDefaultState()
  state.locationPickerMode = momentMode ? 'moment' : 'chat'
  if (momentMode && state.momentLocation) state.locationPicker.selected = { ...state.momentLocation }
  state.modalBusy = false
  state.modalError = ''
  state.modal = 'location'
  render(true)
}

async function toggleDesktopLiveLocation() {
  const selected = conversations[state.selectedConversation]
  if (!selected?.id) return
  if (state.liveLocationActive && state.liveLocationConversationId === String(selected.id)) {
    await stopDesktopLiveLocation(true)
    return
  }
  if (!navigator.geolocation) return showToast('当前设备不支持定位')
  showToast('正在开启实时位置共享…')
  const onPosition = async (position) => {
    try {
      const live = await updateDesktopLiveLocation(String(selected.id), {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        heading: position.coords.heading || undefined,
        start: !state.liveLocationActive,
      })
      if (!state.liveLocationActive) {
        state.liveLocationActive = true
        state.liveLocationConversationId = String(selected.id)
        await sendDesktopTypedMessage(`__PULSE_LIVE_LOCATION__:${live.sessionId || ''}`, 0, '[实时位置共享]')
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : '实时位置更新失败')
    }
  }
  state.liveLocationWatchId = navigator.geolocation.watchPosition(onPosition, () => showToast('实时定位失败，请检查浏览器权限'), { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 })
}

async function stopDesktopLiveLocation(endSession = false) {
  const conversationId = String(state.liveLocationConversationId || '')
  if (state.liveLocationWatchId != null) navigator.geolocation.clearWatch(state.liveLocationWatchId)
  state.liveLocationWatchId = null
  if (conversationId) {
    try {
      if (endSession) await endDesktopLiveLocation(conversationId)
      else await leaveDesktopLiveLocation(conversationId)
    } catch {
      // The server may already have ended the session.
    }
  }
  state.liveLocationActive = false
  state.liveLocationConversationId = ''
  showToast('已结束实时位置共享')
}

let desktopVoiceRecorder = null
let desktopVoiceChunks = []
let desktopVoiceStartedAt = 0
let desktopVoiceTimer = null

function stopDesktopVoiceTimer() {
  if (desktopVoiceTimer !== null) window.clearInterval(desktopVoiceTimer)
  desktopVoiceTimer = null
}

function startDesktopVoiceTimer() {
  stopDesktopVoiceTimer()
  desktopVoiceTimer = window.setInterval(() => {
    if (!state.recordingVoice || !desktopVoiceStartedAt) return
    state.voiceRecordSeconds = Math.floor((Date.now() - desktopVoiceStartedAt) / 1000)
    const button = document.querySelector('[data-action="voice-record"]')
    const label = button?.querySelector('.composer-voice-label')
    if (label) label.textContent = `正在录音 ${state.voiceRecordSeconds} 秒 · 点击停止`
  }, 500)
}

async function toggleDesktopVoiceRecord() {
  if (state.recordingVoice) {
    desktopVoiceRecorder?.stop()
    return
  }
  if (state.voiceRecordBusy) return
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return showToast('当前环境不支持录音')
  state.voiceRecordBusy = true
  syncDesktopVoiceDom()
  syncDesktopComposerBusyDom()
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    desktopVoiceChunks = []
    const mimeType = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
    ].find((type) => typeof MediaRecorder.isTypeSupported !== 'function' || MediaRecorder.isTypeSupported(type))
    desktopVoiceRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    desktopVoiceRecorder.ondataavailable = (event) => { if (event.data.size) desktopVoiceChunks.push(event.data) }
    desktopVoiceRecorder.onstop = async () => {
      const recorder = desktopVoiceRecorder
      stream.getTracks().forEach((track) => track.stop())
      desktopVoiceRecorder = null
      stopDesktopVoiceTimer()
      state.recordingVoice = false
      state.voiceRecordBusy = false
      syncDesktopVoiceDom()
      syncDesktopComposerBusyDom()
      const blob = new Blob(desktopVoiceChunks, { type: recorder?.mimeType || 'audio/webm' })
      if (blob.size < 200) return
      state.uploadingFile = true
      syncDesktopComposerBusyDom()
      try {
        const durationMs = Date.now() - desktopVoiceStartedAt
        const uploaded = await uploadDesktopFile(new File([blob], `voice_${Date.now()}.webm`, { type: blob.type || 'audio/webm' }), { durationMs })
        if (!uploaded.fileId) throw new Error('语音上传成功但未返回 fileId')
        await sendDesktopTypedMessage(JSON.stringify({
          fileId: uploaded.fileId,
          objectKey: uploaded.objectKey,
          name: uploaded.name,
          size: uploaded.size,
          contentType: uploaded.contentType,
          durationMs: uploaded.durationMs || durationMs,
        }), 3, '[语音]', { mentionUserIds: [], atAll: false }, uploaded.fileId)
      } catch (error) {
        showToast(error instanceof Error ? error.message : '语音发送失败')
      } finally {
        state.uploadingFile = false
        syncDesktopComposerBusyDom()
        syncDesktopComposerTransientDom()
      }
    }
    desktopVoiceStartedAt = Date.now()
    state.voiceRecordSeconds = 0
    state.voiceRecordBusy = false
    state.recordingVoice = true
    desktopVoiceRecorder.start(200)
    startDesktopVoiceTimer()
    syncDesktopVoiceDom()
    syncDesktopComposerBusyDom()
  } catch {
    stopDesktopVoiceTimer()
    state.voiceRecordBusy = false
    state.recordingVoice = false
    showToast('无法使用麦克风，请检查浏览器权限')
    syncDesktopVoiceDom()
    syncDesktopComposerBusyDom()
  }
}

function desktopFileIconName(category) {
  return ({
    document: 'file',
    spreadsheet: 'sheet',
    presentation: 'slide',
    archive: 'archive',
    audio: 'audio',
    application: 'app',
  })[category] || 'file'
}

function desktopFileCategoryLabel(category) {
  return ({
    sender: '发送人',
    chat: '聊天',
    document: '文稿',
    spreadsheet: '表格',
    presentation: '幻灯片',
    archive: '压缩文件',
    audio: '音频',
    application: '应用程序',
    other: '其他',
  })[category] || '文件'
}

function renderDesktopFileIcon(item) {
  return `<span class="wechat-file-icon is-${escapeHtml(item.category)}">${icon(desktopFileIconName(item.category))}<b>${escapeHtml(item.ext || '')}</b></span>`
}

function desktopFileSourceItems() {
  return state.fileItems
}

function desktopFileById(fileId) {
  return desktopFileSourceItems().find((item) => String(item.id) === String(fileId || ''))
}

function desktopFileConversationIndex(file) {
  return conversations.findIndex((conversation) => String(conversation.id || '') === String(file?.conversationId || ''))
}

function getDesktopFileMenuPosition(event, file) {
  const rect = event.currentTarget?.getBoundingClientRect?.()
  const menuWidth = 208
  const menuHeight = 384
  const gap = 2
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight
  const preferredLeft = Number(event.clientX || 0) || rect?.right || 0
  const preferredTop = Number(event.clientY || 0) || rect?.top || 0
  const left = preferredLeft + menuWidth <= viewportWidth - 8
    ? preferredLeft + gap
    : preferredLeft - menuWidth - gap
  const top = preferredTop + menuHeight <= viewportHeight - 8
    ? preferredTop
    : preferredTop - menuHeight
  return {
    fileId: String(file?.id || ''),
    left: Math.max(8, Math.min(left, viewportWidth - menuWidth - 8)),
    top: Math.max(8, Math.min(top, viewportHeight - menuHeight - 8)),
  }
}

function renderFileContextMenu() {
  const file = desktopFileById(state.fileMenu?.fileId)
  if (!file || !state.fileMenu) return ''
  const left = Math.max(8, Number(state.fileMenu.left || 0))
  const top = Math.max(8, Number(state.fileMenu.top || 0))
  const item = (action, label, extra = '') => `<button type="button" data-file-action="${action}" data-file-id="${escapeHtml(file.id)}" role="menuitem"${extra}>${label}</button>`
  return `<div class="file-context-menu" data-file-menu style="left:${left}px;top:${top}px" role="menu" aria-label="文件操作">
    ${item('locate', '定位到聊天位置')}
    <div class="file-context-menu-separator" role="separator"></div>
    ${item('copy', '复制')}
    ${item('save-as', '另存为...')}
    <div class="file-context-menu-separator" role="separator"></div>
    ${item('forward', '转发...')}
    ${item('favorite', '收藏')}
    ${item('multi-select', '多选')}
    <div class="file-context-menu-separator" role="separator"></div>
    ${item('edit', '编辑')}
    ${item('show-in-folder', '在文件夹中显示')}
    <div class="file-context-menu-separator" role="separator"></div>
    ${item('delete', '删除', ' class="danger"')}
  </div>`
}

function desktopMessageTimeMs(message) {
  const sendTime = Number(message?.sendTimeMs || message?.sendTime || 0)
  if (Number.isFinite(sendTime) && sendTime > 0) return sendTime < 10000000000 ? sendTime * 1000 : sendTime
  const parsed = Date.parse(String(message?.createdAt || ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function findDesktopMessageElement(messageId) {
  const stream = document.querySelector('.chat-stream')
  if (!stream) return null
  const normalizedId = String(messageId || '')
  return [...stream.querySelectorAll('[data-message-id]')]
    .find((element) => String(element.dataset.messageId || '') === normalizedId) || null
}

function mergeDesktopMessageHistory(conversationId, values) {
  const messagesById = new Map((state.messagesByConversation[conversationId] || []).map((message) => [String(message.id), message]))
  values.map(mapRemoteMessage).forEach((message) => {
    if (message.id) messagesById.set(String(message.id), message)
  })
  state.messagesByConversation[conversationId] = [...messagesById.values()].sort((left, right) => (
    desktopMessageTimeMs(left) - desktopMessageTimeMs(right)
  ))
  scheduleDesktopFileMetadataHydrationForMessages(conversationId, state.messagesByConversation[conversationId])
}

async function loadDesktopHistoryUntilMessage(conversationId, messageId) {
  const targetId = String(messageId || '')
  const pageSize = 200
  const maxPages = 20
  for (let page = 0; page < maxPages; page += 1) {
    const current = state.messagesByConversation[conversationId] || []
    if (current.some((message) => String(message.id) === targetId)) return true
    const oldest = current
      .map(desktopMessageTimeMs)
      .filter((value) => value > 0)
      .sort((left, right) => left - right)[0]
    if (!oldest) return false
    const before = new Date(oldest).toISOString()
    const fetched = await fetchDesktopMessages(conversationId, pageSize, { before })
    if (!fetched.length) return false
    mergeDesktopMessageHistory(conversationId, fetched)
    const nextOldest = (state.messagesByConversation[conversationId] || [])
      .map(desktopMessageTimeMs)
      .filter((value) => value > 0)
      .sort((left, right) => left - right)[0]
    if (!nextOldest || nextOldest >= oldest) return false
  }
  return (state.messagesByConversation[conversationId] || []).some((message) => String(message.id) === targetId)
}

async function scrollToDesktopMessageWithHistory(messageId) {
  const targetId = String(messageId || '').trim()
  if (!targetId) return false
  let target = findDesktopMessageElement(targetId)
  if (!target) {
    const selected = conversations[state.selectedConversation]
    if (state.dataSource === 'remote' && selected?.id) {
      try {
        state.loadingMessages = true
        render()
        await loadDesktopHistoryUntilMessage(String(selected.id), targetId)
        state.loadingMessages = false
        render()
        await new Promise((resolve) => window.setTimeout(resolve, 0))
        target = findDesktopMessageElement(targetId)
      } catch {
        state.loadingMessages = false
        render()
      }
    }
  }
  if (!target) {
    showToast('鍘熸秷鎭笉鍦ㄥ綋鍓嶅姞杞藉垪琛ㄤ腑')
    return false
  }
  target.scrollIntoView({ block: 'center', behavior: 'smooth' })
  target.classList.add('file-message-target')
  window.setTimeout(() => target.classList.remove('file-message-target'), 1500)
  return true
}

async function scrollToDesktopMessage(messageId) {
  const target = [...document.querySelectorAll('[data-message-menu]')]
    .find((element) => String(element.dataset.messageId || '') === String(messageId || ''))
  if (!target) {
    const selected = conversations[state.selectedConversation]
    if (state.dataSource === 'remote' && selected?.id) {
      try {
        state.loadingMessages = true
        render()
        const remoteMessages = await fetchDesktopMessages(String(selected.id), 200)
        const mappedMessages = remoteMessages.map(mapRemoteMessage)
        state.messagesByConversation[selected.id] = mappedMessages
        scheduleDesktopFileMetadataHydrationForMessages(selected.id, mappedMessages)
        state.loadingMessages = false
        render()
        window.setTimeout(() => { void scrollToDesktopMessage(messageId) }, 0)
        return false
      } catch {
        state.loadingMessages = false
        render()
      }
    }
    showToast('原消息不在当前加载列表中')
    return false
  }
  target.scrollIntoView({ block: 'center', behavior: 'smooth' })
  target.classList.add('file-message-target')
  window.setTimeout(() => target.classList.remove('file-message-target'), 1500)
  return true
}

function openDesktopFileChat(file, multiSelect = false) {
  const index = desktopFileConversationIndex(file)
  if (index < 0 || !file?.messageId) {
    showToast('当前文件没有可定位的聊天记录')
    return
  }
  state.fileMenu = null
  state.messageMenu = null
  state.page = 'messages'
  state.selectedConversation = index
  state.messageSearchQuery = ''
  state.messageMultiMode = multiSelect
  state.messageSelection = multiSelect ? new Set([String(file.messageId)]) : new Set()
  state.scrollChatToBottom = false
  render()
  const finish = () => window.setTimeout(() => scrollToDesktopMessage(file.messageId), 0)
  if (state.dataSource === 'remote') void loadSelectedMessages().then(finish)
  else finish()
}

async function copyDesktopFile(file) {
  const value = file.url ? resolveDesktopFileUrl(file.url) : String(file.name || '')
  try {
    await navigator.clipboard.writeText(value)
    showToast(file.url ? '文件链接已复制' : '文件名已复制')
  } catch {
    showToast('复制失败，请手动选择文件名')
  }
}

async function saveDesktopFileAs(file) {
  if (!file?.url) {
    showToast('当前文件没有可下载地址')
    return
  }
  const url = resolveDesktopFileUrl(file.url)
  const filename = file.name || '文件'
  if (!url) {
    showToast('当前文件没有可下载地址')
    return
  }

  const desktopShell = window.pulseDesktop
  if (desktopShell?.chooseSavePath && desktopShell?.downloadFileToPath) {
    try {
      const choice = await desktopShell.chooseSavePath({ filename })
      if (!choice || choice.canceled || !choice.filePath) return
      showToast('正在下载…')
      const token = getDesktopToken()
      const result = await desktopShell.downloadFileToPath({
        filePath: choice.filePath,
        url,
        authorization: token ? `Bearer ${token}` : '',
      })
      if (!result?.ok) throw new Error(result?.error || '下载失败')
      showToast('已保存到本地')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '下载失败')
    }
    return
  }

  try {
    let token = getDesktopToken()
    const fetchFile = () => {
      const headers = {}
      if (token) headers.Authorization = `Bearer ${token}`
      return fetch(url, { credentials: 'include', headers })
    }
    let response = await fetchFile()
    if (response.status === 401 && token) {
      token = await refreshDesktopToken()
      if (token) response = await fetchFile()
    }
    if (!response.ok) throw new Error(`下载失败（${response.status}）`)
    const blob = await response.blob()

    if (typeof window.showSaveFilePicker === 'function') {
      const handle = await window.showSaveFilePicker({ suggestedName: filename })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      showToast('已保存到本地')
      return
    }

    const blobUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = filename
    link.rel = 'noreferrer'
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
    showToast('已开始下载')
  } catch (error) {
    if (error?.name !== 'AbortError') showToast(error instanceof Error ? error.message : '下载失败')
  }
}

function beginDesktopFileDelete(file) {
  const index = desktopFileConversationIndex(file)
  if (state.dataSource !== 'remote' || index < 0 || !file?.messageId) {
    showToast('在线数据未加载，暂不支持删除文件')
    return
  }
  state.selectedConversation = index
  beginDesktopMessageDelete([file.messageId], 'self')
}

async function handleDesktopFileAction(action, fileId) {
  const file = desktopFileById(fileId)
  if (!file) return
  state.fileMenu = null
  if (action === 'locate') {
    openDesktopFileChat(file)
    return
  }
  if (action === 'copy') {
    render()
    await copyDesktopFile(file)
    return
  }
  if (action === 'save-as') {
    await saveDesktopFileAs(file)
    return
  }
  if (action === 'forward') {
    const index = desktopFileConversationIndex(file)
    if (index < 0 || !file.messageId) {
      showToast('当前文件没有可转发的聊天记录')
      return
    }
    state.selectedConversation = index
    openDesktopMessageForward([file.messageId])
    return
  }
  if (action === 'favorite') {
    if (state.dataSource !== 'remote' || !file.messageId || !file.conversationId) {
      showToast('在线数据未加载，暂不支持保存文件收藏')
      return
    }
    try {
      await addDesktopFavorite(file.conversationId, file.messageId)
      state.favoritesLoaded = false
      showToast('文件已收藏')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '文件收藏失败')
    }
    return
  }
  if (action === 'multi-select') {
    openDesktopFileChat(file, true)
    return
  }
  if (action === 'edit') {
    showToast('文件消息暂不支持编辑')
    return
  }
  if (action === 'show-in-folder') {
    showToast('文件下载后可在浏览器下载目录中查看')
    return
  }
  if (action === 'delete') beginDesktopFileDelete(file)
}

function renderDesktopFileGroup(title, rows) {
  if (!rows.length) return ''
  return `<section class="wechat-file-group"><h2>${title}</h2><div class="wechat-file-list">${rows.map((item) => `<button type="button" class="wechat-file-row" data-action="open-file" data-file-id="${escapeHtml(item.id)}">
    ${renderDesktopFileIcon(item)}
    <span class="wechat-file-copy"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.sender)} <i>|</i> ${escapeHtml(item.chat)}</small>${item.downloadStatus ? `<span class="wechat-file-download-state"><b>${escapeHtml(item.downloadStatus)}</b><small>${escapeHtml(item.expires || '')}</small></span>` : ''}</span>
    <span class="wechat-file-meta"><time>${escapeHtml(item.time)}</time><small>${escapeHtml(item.size)}</small></span>
  </button>`).join('')}</div></section>`
}

function renderFiles() {
  const query = state.fileQuery.trim().toLowerCase()
  const category = state.fileCategory || 'all'
  const section = state.fileSection || 'all'
  const sourceFiles = state.fileItems
  const categoryItems = [
    ['document', '文稿', 'file'],
    ['spreadsheet', '表格', 'sheet'],
    ['presentation', '幻灯片', 'slide'],
    ['archive', '压缩文件', 'archive'],
    ['audio', '音频', 'audio'],
    ['application', '应用程序', 'app'],
    ['other', '其他', 'help'],
  ]
  const title = section === 'recent' ? '最近使用' : category === 'all' ? '全部' : desktopFileCategoryLabel(category)
  const filtered = sourceFiles
    .filter((item) => section !== 'recent' || item.recent === true || item.group === 'today')
    .filter((item) => category === 'all' || category === 'sender' || category === 'chat' || item.category === category)
    .filter((item) => !query || `${item.name} ${item.sender} ${item.chat}`.toLowerCase().includes(query))
    .sort((a, b) => {
      if (state.fileSort === 'name') return a.name.localeCompare(b.name, 'zh-CN')
      if (state.fileSort === 'size') return desktopFileSizeValue(b) - desktopFileSizeValue(a)
      return Number(b.date || 0) - Number(a.date || 0)
    })
  const today = filtered.filter((item) => item.group === 'today')
  const thisWeek = filtered.filter((item) => item.group === 'week')
  const sourceGroups = category === 'sender' || category === 'chat'
    ? [...new Set(filtered.map((item) => item[category]))].map((label) => renderDesktopFileGroup(label, filtered.filter((item) => item[category] === label))).join('')
    : renderDesktopFileGroup('今天', today) + renderDesktopFileGroup('本周', thisWeek) + renderDesktopFileGroup('更早', filtered.filter((item) => item.group === 'older'))
  const emptyContent = state.fileError
    ? `<div class="wechat-files-empty is-error">${icon('folder')}<strong>文件数据加载失败</strong><small>${escapeHtml(state.fileError)}</small></div>`
    : `<div class="wechat-files-empty">${icon('folder')}<strong>没有找到文件</strong><small>试试搜索其他关键词或切换分类</small></div>`
  const content = state.dataSource === 'remote' && state.fileLoading
    ? `<div class="wechat-files-empty is-loading">${icon('folder')}<strong>正在加载文件</strong><small>正在从消息中同步附件</small></div>`
    : filtered.length ? sourceGroups : emptyContent
  return `<section class="page page-files"><div class="wechat-files-shell">
    <aside class="wechat-files-sidebar">
      <div class="wechat-files-sidebar-title">文件管理</div>
      <nav class="wechat-files-nav">
        <button type="button" class="wechat-files-nav-item ${section === 'all' && category === 'all' ? 'active' : ''}" data-file-section="all">${icon('folder')}<span>全部</span></button>
        <button type="button" class="wechat-files-nav-item ${section === 'recent' ? 'active' : ''}" data-file-section="recent">${icon('grid')}<span>最近使用</span></button>
      </nav>
      <div class="wechat-files-label">文件来源</div>
      <nav class="wechat-files-nav">
        <button type="button" class="wechat-files-nav-item ${category === 'sender' ? 'active' : ''}" data-file-category="sender">${icon('person')}<span>发送人</span></button>
        <button type="button" class="wechat-files-nav-item ${category === 'chat' ? 'active' : ''}" data-file-category="chat">${icon('chat')}<span>聊天</span></button>
      </nav>
      <div class="wechat-files-label">文件类型</div>
      <nav class="wechat-files-nav wechat-files-type-nav">${categoryItems.map(([key, label, iconName]) => `<button type="button" class="wechat-files-nav-item ${category === key ? 'active' : ''}" data-file-category="${key}">${icon(iconName)}<span>${label}</span></button>`).join('')}</nav>
      <button type="button" class="wechat-files-settings" data-action="files-settings">${icon('settings')}<span>文件自动下载设置</span>${icon('arrow')}</button>
    </aside>
    <main class="wechat-files-main">
      <header class="wechat-files-main-header"><h1>${title}</h1><div class="wechat-files-main-actions"><label class="wechat-files-search">${icon('search')}<input id="file-search" value="${escapeHtml(state.fileQuery)}" placeholder="搜索文件" /></label><label class="wechat-files-sort"><span>按</span><select data-file-sort><option value="time" ${state.fileSort === 'time' ? 'selected' : ''}>最新时间</option><option value="name" ${state.fileSort === 'name' ? 'selected' : ''}>文件名</option><option value="size" ${state.fileSort === 'size' ? 'selected' : ''}>文件大小</option></select>${icon('arrow')}</label></div></header>
      <div class="wechat-files-content">${content}</div>
    </main>
  </div>${renderFileContextMenu()}</section>`
}

function renderSidebar() {
  return `<div class="brand-lockup">
    <button type="button" class="sidebar-collapse-toggle" data-action="toggle-sidebar" aria-expanded="${state.sidebarCollapsed ? 'false' : 'true'}" aria-label="${state.sidebarCollapsed ? '展开侧栏' : '收起侧栏'}" title="${state.sidebarCollapsed ? '展开侧栏' : '收起侧栏'}">${icon('sidebar-toggle')}</button>
    <div class="brand-mark"><span></span><span></span><span></span></div>
    <div class="brand-copy"><strong>Pulse</strong><small>同步每一刻</small></div>
  </div>
  <div class="sidebar-nav-stack">
  <div class="sidebar-label">主空间</div>
  <nav class="main-nav">
    ${navItem('messages', '消息', 'chat', String(conversations.reduce((sum, item) => sum + Number(item.unread || 0), 0) || ''))}
    ${navItem('contacts', '联系人', 'contacts', String((Number(state.friendPendingCount || 0) + Number(state.groupPendingCount || 0)) || ''))}
    ${navItem('moments', '朋友圈', 'discover', desktopMomentInteractionBadgeLabel(state.momentInteractionUnreadCount))}
  </nav>
  <div class="sidebar-label sidebar-label-spaced">快捷入口</div>
  <nav class="main-nav secondary-nav">
    <button class="nav-item ${state.page === 'favorites' ? 'active' : ''}" data-page="favorites"><span class="nav-icon">${icon('bookmark')}</span><span class="nav-text">收藏</span></button>
    ${isDesktopWalletEnabled() ? `<button class="nav-item ${state.page === 'wallet' ? 'active' : ''}" data-page="wallet"><span class="nav-icon">${icon('money')}</span><span class="nav-text">钱包</span></button>` : ''}
    <button class="nav-item ${state.page === 'files' ? 'active' : ''}" data-page="files"><span class="nav-icon">${icon('folder')}</span><span class="nav-text">文件</span></button>
    <button class="nav-item ${state.page === 'settings' ? 'active' : ''}" data-page="settings"><span class="nav-icon">${icon('settings')}</span><span class="nav-text">设置</span></button>
  </nav>
  </div>
  <div class="sidebar-grow"></div>
  <div class="windows-card">
    <div class="windows-card-icon">${icon('download')}</div>
    <div><strong>Pulse for Windows</strong><span>${dataSourceLabel()}</span></div>
    <button data-action="download" aria-label="下载 Pulse for Windows" title="下载 Pulse for Windows">${icon('arrow', 'windows-card-arrow')}<span class="windows-card-download-icon">${icon('download')}</span></button>
  </div>
  <button class="sidebar-profile" data-page="settings">
    ${avatar({ initials: state.profile.nickname?.slice(0, 1) || '我', tone: 'blue', avatarUrl: state.profile.avatarUrl }, 'avatar-small')}<span><strong>${escapeHtml(state.profile.nickname || '当前账户')}</strong><small>在线</small></span>${icon('more')}
  </button>`
}

function renderTopbar() {
  const titles = { messages: '消息', contacts: '联系人', groups: '\u7fa4\u804a', moments: '朋友圈', discover: '发现', settings: '个人中心', favorites: '收藏', wallet: '钱包', files: '文件' }
  const notificationCount = Number(state.notificationCount || 0)
  const initials = state.profile.nickname?.slice(0, 1) || '我'
  // Keep the top-right avatar on the same protected-media path as the
  // conversation list. A plain img cannot attach the bearer token in the web
  // build, so an uploaded avatar silently falls back to the wrong image.
  const avatarMarkup = avatar({
    initials,
    name: state.profile.nickname || '当前账户',
    tone: 'blue',
    avatarUrl: state.profile.avatarUrl,
  }, 'top-avatar-content')
  const canGoBack = desktopNavigationHistory.length > 0
  const isMessageHome = state.page === 'messages'
  return `<div class="topbar-leading${isMessageHome ? ' is-message-home' : ''}">
       <button type="button" class="top-back-btn" data-action="navigate-back" ${canGoBack ? '' : 'disabled'} aria-label="返回上一页" title="返回上一页">${icon('arrow', 'back-icon')}</button>
    <div class="breadcrumb"><span>Pulse</span><b>/</b><strong>${titles[state.page] || '消息'}</strong></div>
    </div>
    <div class="topbar-actions">
      <label class="global-search">${icon('search')}<input id="global-search" value="${escapeHtml(state.globalSearchQuery || '')}" placeholder="搜索联系人、群聊、聊天记录" /><kbd>⌘ K</kbd></label>
      <button class="top-icon-btn" data-action="notifications" aria-label="通知${notificationCount ? `，${notificationCount} 条待处理` : ''}" title="通知${notificationCount ? `，${notificationCount} 条待处理` : ''}">${icon('bell')}${notificationCount ? '<i></i>' : ''}</button>
      <button type="button" class="top-icon-btn top-refresh-btn${state.globalRefreshing ? ' is-refreshing' : ''}" data-action="global-refresh" aria-label="刷新数据" title="刷新当前页面数据" ${state.globalRefreshing ? 'disabled' : ''}>${icon('refresh')}</button>
      <button type="button" class="top-icon-btn top-lock-btn" data-action="lock-screen" aria-label="锁定 Pulse" title="锁定 Pulse">${icon('lock')}</button>
      <div class="profile-menu ${state.profileMenuOpen ? 'is-open' : ''}">
        <button class="top-avatar" data-action="toggle-profile-menu" aria-label="打开账户菜单" aria-expanded="${state.profileMenuOpen ? 'true' : 'false'}" aria-haspopup="menu">${avatarMarkup}</button>
        ${state.profileMenuOpen ? `<div class="profile-dropdown" role="menu">
          <div class="profile-dropdown-summary">${avatar({ initials, name: state.profile.nickname || '当前账户', tone: 'blue', avatarUrl: state.profile.avatarUrl }, 'avatar-small')}<div><strong>${escapeHtml(state.profile.nickname || '当前账户')}</strong><small>在线</small></div></div>
          <div class="profile-dropdown-divider"></div>
          <button type="button" class="profile-dropdown-item" data-action="edit-profile" role="menuitem">${icon('person')}<span><strong>个人资料</strong><small>查看和编辑账号信息</small></span></button>
          <button type="button" class="profile-dropdown-item" data-action="switch-account" role="menuitem">${icon('switch-account')}<span><strong>切换账号</strong><small>登录其他账号</small></span></button>
          <button type="button" class="profile-dropdown-item is-danger" data-action="logout" role="menuitem">${icon('logout')}<span><strong>退出登录</strong><small>退出当前账号</small></span></button>
        </div>` : ''}
      </div>
     </div>`
}

function pageHeading(eyebrow, title, description, actions = '') {
  return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${description}</p></div><div class="heading-actions">${actions}</div></div>`
}

function button(label, action, kind = 'secondary', iconName = '') {
  return `<button class="btn btn-${kind}" data-action="${action}">${iconName ? icon(iconName) : ''}<span>${label}</span></button>`
}

function renderPage() {
  if (state.page === 'contacts') return renderContacts()
  if (state.page === 'groups') return renderGroups()
  if (state.page === 'moments' || state.page === 'discover') return renderDiscover()
  if (state.page === 'settings') return renderSettings()
  if (state.page === 'favorites') return renderDesktopFavorites()
  if (state.page === 'wallet') return renderWallet()
  if (state.page === 'files') return renderFiles()
  return renderMessages()
}

function renderWallet() {
  const summary = state.walletSummary || { balance: 0, hasPaymentPassword: false }
  const typeOptions = [
    ['', '全部类型'],
    ['RED_PACKET', '红包'],
    ['TRANSFER', '转账'],
    ['ADMIN_ADJUST', '余额调整'],
  ]
  const rows = state.walletTransactions || []
  return `<section class="page page-wallet">
    ${pageHeading('安全管理', '我的钱包', '查看余额、收支明细与支付安全设置。')}
    <div class="wallet-layout">
      <section class="wallet-balance-card">
        <div class="wallet-card-top"><span>${icon('money')} 钱包余额（元）</span><span class="wallet-status ${summary.hasPaymentPassword ? 'is-ready' : ''}">${summary.hasPaymentPassword ? '支付密码已设置' : '尚未设置支付密码'}</span></div>
        <strong class="wallet-balance-amount">${walletYuan(summary.balance)}</strong>
        <div class="wallet-balance-actions"><button class="btn btn-primary" data-action="wallet-password">${icon('settings')}支付设置</button><span>余额单位：分</span></div>
      </section>
      <section class="wallet-summary-grid"><div><span>${icon('arrow')}</span><small>本次筛选收入</small><strong>${walletYuan(rows.filter((item) => item.direction === 'IN').reduce((sum, item) => sum + Number(item.amount || 0), 0))}</strong></div><div><span>${icon('send')}</span><small>本次筛选支出</small><strong>${walletYuan(rows.filter((item) => item.direction === 'OUT').reduce((sum, item) => sum + Number(item.amount || 0), 0))}</strong></div><div><span>${icon('chat')}</span><small>交易笔数</small><strong>${rows.length}</strong></div></section>
    </div>
    <section class="wallet-card wallet-transactions-card">
      <div class="wallet-section-heading"><div><h2>收支明细</h2><p>与移动端钱包同步的红包、转账和余额调整记录。</p></div></div>
      <div class="wallet-filters"><label><span>交易类型</span><select data-wallet-type>${typeOptions.map(([value, label]) => `<option value="${value}" ${state.walletType === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label><span>开始日期</span><input type="date" data-wallet-from value="${escapeHtml(state.walletFrom)}" /></label><label><span>结束日期</span><input type="date" data-wallet-to value="${escapeHtml(state.walletTo)}" /></label><button class="btn" data-action="wallet-reset">重置筛选</button></div>
      ${state.walletError ? `<div class="wallet-error">${escapeHtml(state.walletError)}</div>` : ''}
      ${state.walletLoading ? '<div class="desktop-modal-hint">正在加载钱包明细…</div>' : rows.length ? `<div class="wallet-transaction-list">${rows.map((item) => `<button class="wallet-transaction-row" data-wallet-transaction="${escapeHtml(String(item.id))}"><span class="wallet-transaction-icon ${item.direction === 'IN' ? 'is-in' : 'is-out'}">${icon(walletTradeIcon(item.trade_type))}</span><span class="wallet-transaction-copy"><strong>${walletTradeLabel(item.trade_type)}</strong><small>${escapeHtml(item.remark || item.counterparty_name || item.trade_no || '钱包交易')}</small><time>${escapeHtml(walletFormatTime(item.created_at))}</time></span><strong class="wallet-transaction-amount ${item.direction === 'IN' ? 'is-in' : 'is-out'}">${item.direction === 'IN' ? '+' : '-'}${walletYuan(item.amount)}</strong>${icon('arrow')}</button>`).join('')}</div>` : '<div class="wallet-empty">暂无收支记录</div>'}
    </section>
  </section>`
}

function positionDesktopConversationPlusMenu() {
  const menu = document.querySelector('.desktop-conversation-home-plus-menu')
  const trigger = document.querySelector('.desktop-conversation-plus-wrap > [data-action="toggle-home-plus"]')
  if (!(menu instanceof HTMLElement) || !(trigger instanceof HTMLElement)) return
  const triggerRect = trigger.getBoundingClientRect()
  const menuWidth = menu.offsetWidth
  const menuHeight = menu.offsetHeight
  const gap = 8
  const preferredLeft = triggerRect.left
  const left = Math.min(Math.max(8, preferredLeft), Math.max(8, window.innerWidth - menuWidth - 8))
  const preferredTop = triggerRect.bottom + gap
  const top = preferredTop + menuHeight <= window.innerHeight - 8
    ? preferredTop
    : Math.max(8, triggerRect.top - menuHeight - gap)
  menu.style.left = `${Math.round(left)}px`
  menu.style.top = `${Math.round(top)}px`
}

function renderDesktopHomePlusMenu(placement = '') {
  const placementClass = placement === 'conversation' ? ' desktop-conversation-home-plus-menu' : ''
  return `<div class="desktop-home-plus-menu${placementClass}" data-home-plus-menu><button type="button" data-action="add-contact"><span>${icon('person')}</span><small>添加好友</small></button><button type="button" data-action="new-message"><span>${icon('chat')}</span><small>创建聊天</small></button><button type="button" data-action="new-group"><span>${icon('group')}</span><small>发起群聊</small></button><button type="button" data-action="add-group"><span>${icon('group')}</span><small>添加群聊</small></button></div>`
}

function renderGroups() {
  const groups = conversations
    .filter((item) => isGroupConversation(item))
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)))
  const query = state.groupQuery.trim().toLowerCase()
  const visible = groups.filter((item) => {
    if (!query) return true
    return String(item.name || '').toLowerCase().includes(query)
      || String(item.preview || '').toLowerCase().includes(query)
  })
  const emptyText = groups.length ? '\u6ca1\u6709\u627e\u5230\u5339\u914d\u7684\u7fa4\u804a' : '\u6682\u65e0\u7fa4\u804a'
  return `<section class="page page-groups">
    ${pageHeading('联系人', '群聊', '管理你加入的所有群聊，选择后可进入对应群聊。', `<button class="btn" data-page="contacts">${icon('arrow', 'back-icon')}<span>返回联系人</span></button>`)}
    <div class="groups-toolbar">
      <label class="wide-search group-search">${icon('search')}<input id="group-search" value="${escapeHtml(state.groupQuery)}" placeholder="搜索群聊" /></label>
      <div class="toolbar-meta"><span>${groups.length} 个群聊</span></div>
    </div>
    <section class="groups-card panel-surface">
      <div class="groups-card-heading"><div><h2>我的群聊</h2><p>所有已加入的群聊都在这里</p></div><span class="groups-count">${groups.length}</span></div>
      ${visible.length ? `<div class="group-list">${visible.map((item) => {
        const index = conversations.indexOf(item)
        return `<button class="group-list-item" data-group-conversation="${index}">
          <span class="group-list-avatar">${avatar(item)}</span>
          <span class="group-list-copy"><span class="group-list-title"><strong>${escapeHtml(item.name)}</strong>${item.pinned ? `<span class="group-pinned">${icon('bookmark')}</span>` : ''}</span><small>${escapeHtml(item.preview || '暂无消息')}</small></span>
          <span class="group-list-meta"><time>${escapeHtml(item.time || '')}</time>${item.unread ? `<i class="unread-badge">${item.unread > 99 ? '99+' : item.unread}</i>` : ''}</span>
          ${icon('arrow')}
        </button>`
      }).join('')}</div>` : `<div class="groups-empty"><span class="groups-empty-icon">${icon('group')}</span><strong>${emptyText}</strong><small>${groups.length ? '换个关键词试试' : '加入或创建群聊后，它们会显示在这里'}</small></div>`}
    </section>
  </section>`
}

function desktopSelectedConversation() {
  return conversations[state.selectedConversation] || conversations[0] || {
    id: '',
    name: '暂无会话',
    initials: '—',
    tone: 'blue',
    preview: '',
    time: '',
    unread: 0,
    online: false,
    tag: '',
    type: 'personal',
  }
}

function renderMessagesHeading() {
  const totalUnread = conversations
    .filter((item) => !item.mute)
    .reduce((sum, item) => sum + Number(item.unread || 0), 0)
  return pageHeading('你的通讯空间', '消息 <span class="heading-count">${totalUnread}</span>', '保持连接，继续每一个重要对话。', `${button('新建消息', 'new-message', 'primary', 'edit')}<span class="desktop-home-plus-wrap"><button class="btn btn-icon-only" type="button" data-action="toggle-home-plus" aria-label="更多新建选项" title="更多新建选项">${icon('plus')}</button>${state.showHomePlusMenu ? renderDesktopHomePlusMenu() : ''}</span>`)
}

function renderMessages() {
  const selected = desktopSelectedConversation()
  return `<section class="page page-messages">
    ${renderMessagesHeading()}
    <div class="message-workspace${selected.fileTransferAssistant ? ' is-file-transfer-assistant' : ''}">
      ${renderConversationPanel()}
      ${renderChatPanel(selected)}
      ${selected.fileTransferAssistant ? '' : renderContextPanel(selected)}
    </div>
  </section>`
}

function renderConversationPanel() {
  const visible = desktopVisibleConversationIndexes().map((index) => conversations[index])
  return `<section class="conversation-panel panel-surface">
    <div class="panel-title-row"><div><h2>最近对话</h2><span>${conversations.length} 个会话</span></div><div class="conversation-panel-actions"><button class="subtle-icon-btn desktop-read-all-btn" type="button" data-action="mark-all-read" aria-label="全部已读" title="全部已读">${icon('check')}</button><span class="desktop-home-plus-wrap desktop-conversation-plus-wrap"><button class="subtle-icon-btn" type="button" data-action="toggle-home-plus" aria-label="更多新建选项" title="更多新建选项">${icon('plus')}</button>${state.showHomePlusMenu ? renderDesktopHomePlusMenu('conversation') : ''}</span></div></div>
    <label class="panel-search">${icon('search')}<input id="conversation-search" value="${escapeHtml(state.contactQuery)}" placeholder="搜索会话" /></label>
    <div class="conversation-list">${visible.length ? visible.map((item) => renderConversation(item)).join('') : '<div class="empty-state">没有找到相关会话</div>'}</div>
    ${renderConversationMenu()}
  </section>`
}

function desktopVisibleConversationIndexes() {
  const query = state.contactQuery.trim().toLowerCase()
  return conversations
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !query || item.name.toLowerCase().includes(query) || item.preview.toLowerCase().includes(query))
    .sort((left, right) => Number(Boolean(right.item.pinned)) - Number(Boolean(left.item.pinned)))
    .map(({ index }) => index)
}

function updateDesktopConversationFilterBadges() {
  const total = conversations
    .filter((item) => !item.mute)
    .reduce((sum, item) => sum + Math.max(0, Number(item.unread || 0)), 0)
  const headingCount = document.querySelector('.page-messages .heading-count')
  if (headingCount) headingCount.textContent = String(total)
  const nav = document.querySelector('.nav-item[data-page="messages"]')
  const navBadge = nav?.querySelector('.nav-badge')
  if (nav && total <= 0) navBadge?.remove()
  else if (nav && total > 0 && navBadge) navBadge.textContent = total > 99 ? '99+' : String(total)
  else if (nav && total > 0) nav.insertAdjacentHTML('beforeend', `<span class="nav-badge">${total > 99 ? '99+' : total}</span>`)
}

function renderConversation(item) {
  const index = conversations.indexOf(item)
  const conversationType = isGroupConversation(item) ? 'group' : (item.type || '')
  return `<button class="conversation-item ${index === state.selectedConversation ? 'selected' : ''}" data-conversation="${index}" data-conversation-type="${escapeHtml(conversationType)}" data-conversation-peer="${escapeHtml(item.peerUserId || '')}">
    <span class="avatar-wrap">${avatar(item)}${item.type === 'personal' && !item.fileTransferAssistant ? `<i class="online-dot${item.online ? '' : ' offline'}"></i>` : ''}${item.mute ? `<span class="conversation-mute" title="消息免打扰" aria-label="消息免打扰">${icon('bell-off')}</span>` : ''}</span>
     <span class="conversation-copy"><span class="conversation-line"><strong>${item.pinned ? `<span class="conversation-pin" title="已置顶">${icon('bookmark')}</span>` : ''}${renderDesktopConversationName(item.name)}</strong><time>${escapeHtml(item.time)}</time></span><span class="conversation-line conversation-preview"><span>${escapeHtml(item.preview)}</span>${item.mentionUnread ? '<i class="mention-unread-badge">@</i>' : ''}${item.unread ? `<i class="unread-badge">${item.unread}</i>` : ''}</span></span>
  </button>`
}

function renderConversationMenuLegacy() {
  const index = Number(state.conversationMenu?.index)
  const conversation = conversations[index]
  if (!conversation || !state.conversationMenu) return ''
  const readAction = Number(conversation.unread || 0) > 0 ? 'read' : 'unread'
  const readLabel = readAction === 'read' ? '设为已读' : '设为未读'
  const left = Math.max(8, Number(state.conversationMenu.left || 0))
  const top = Math.max(8, Number(state.conversationMenu.top || 0))
  return `<div class="conversation-context-menu" data-conversation-menu style="left:${left}px;top:${top}px" role="menu">
    <button data-conversation-action="remove" data-conversation-index="${index}" role="menuitem" class="danger">${icon('close')}删除</button>
    <button data-conversation-action="${readAction}" data-conversation-index="${index}" role="menuitem">${icon('check')}${readLabel}</button>
    <button data-conversation-action="${conversation.pinned ? 'unpin' : 'pin'}" data-conversation-index="${index}" role="menuitem">${icon('bookmark')}${conversation.pinned ? '取消置顶' : '置顶'}</button>
  </div>`
}

function renderConversationMenu() {
  const index = Number(state.conversationMenu?.index)
  const conversation = conversations[index]
  if (!conversation || !state.conversationMenu) return ''
  const readAction = Number(conversation.unread || 0) > 0 ? 'read' : 'unread'
  const readLabel = readAction === 'read' ? '\u6807\u8bb0\u4e3a\u5df2\u8bfb' : '\u6807\u8bb0\u4e3a\u672a\u8bfb'
  const muteAction = conversation.mute ? 'unmute' : 'mute'
  const muteLabel = conversation.mute ? '\u5173\u95ed\u6d88\u606f\u514d\u6253\u6270' : '\u6d88\u606f\u514d\u6253\u6270'
  const left = Math.max(8, Number(state.conversationMenu.left || 0))
  const top = Math.max(8, Number(state.conversationMenu.top || 0))
  return `<div class="conversation-context-menu" data-conversation-menu style="left:${left}px;top:${top}px" role="menu">
    <button data-conversation-action="${muteAction}" data-conversation-index="${index}" role="menuitem">${muteLabel}</button>
    <button data-conversation-action="remove" data-conversation-index="${index}" role="menuitem" class="danger">\u5220\u9664</button>
    <button data-conversation-action="${readAction}" data-conversation-index="${index}" role="menuitem">${readLabel}</button>
    <button data-conversation-action="${conversation.pinned ? 'unpin' : 'pin'}" data-conversation-index="${index}" role="menuitem">${conversation.pinned ? '\u53d6\u6d88\u7f6e\u9876' : '\u7f6e\u9876'}</button>
  </div>`
}

function renderChatPanelLegacy(selected) {
  const group = selected.type === 'group' || selected.name.includes('设计组')
  const remoteMessages = currentMessages(selected)
  const messageStream = remoteMessages.length
    ? remoteMessages.map((message) => `<div class="message-row ${message.mine ? 'message-out' : 'message-in'}">${message.mine ? '' : `<div class="message-avatar">${avatar(selected, 'avatar-tiny')}</div>`}<div>${message.fromNickname && !message.mine ? `<span class="message-sender">${escapeHtml(message.fromNickname)}</span>` : ''}<div class="message-bubble ${message.recalled ? 'message-recalled' : ''}">${renderDesktopMessageContent(message)}</div><time>${escapeHtml(message.time || '')}${message.mine ? ` <span class="read-check">${icon('check')}</span>` : ''}</time></div></div>`).join('')
    : '<div class="chat-empty">暂无消息</div>'
  return `<section class="chat-panel panel-surface">
    <div class="chat-header"><div class="chat-title"><span class="avatar-wrap">${avatar(selected)}${selected.type === 'personal' && !selected.fileTransferAssistant ? `<i class="online-dot${selected.online ? '' : ' offline'}"></i>` : ''}</span><div><h2>${selected.name}</h2><p>${selected.type === 'personal' && !selected.fileTransferAssistant ? `<span class="${selected.online ? 'status-green' : 'status-gray'}">${selected.online ? '在线' : '离线'}</span> · ` : ''}${group ? '8 位成员' : 'Pulse 联系人'}</p></div></div><div class="chat-actions"><button class="subtle-icon-btn">${icon('phone')}</button><button class="subtle-icon-btn">${icon('video')}</button><button class="subtle-icon-btn">${icon('search')}</button><button class="subtle-icon-btn">${icon('more')}</button></div></div>
    <div class="chat-security">${icon('lock')} 端到端加密 · 仅你和${selected.name}可以阅读</div>
    <div class="chat-stream" data-conversation-id="${escapeHtml(selected.id)}">
      <div class="day-divider"><span>${state.loadingMessages ? '正在同步' : '今天'}</span></div>
      ${messageStream}
      
    </div>
    <div class="composer"><div class="composer-tools"><button>${icon('paperclip')}</button><button>${icon('smile')}</button><button>${icon('folder')}</button><span class="composer-hint">Enter 发送 · Shift + Enter 换行</span></div><textarea data-message-composer placeholder="写下你的消息…" value="${escapeHtml(state.composerText)}"></textarea><div class="composer-bottom"><span>${icon('lock')} 私密对话</span><button class="send-button" data-action="send">${icon('send')}</button></div></div>
  </section>`
}

function getMessageMenuPosition(event, message) {
  const selected = conversations[state.selectedConversation]
  const actionCount = 5 + (desktopMessageMediaDownloadInfo(message) ? 1 : 0) + (message.recalled ? 0 : 1) + (message.mine && !message.recalled ? 1 : 0) + (selected?.type === 'group' ? 0 : 1)
  const menuWidth = 164
  const menuHeight = 12 + actionCount * 31
  const gap = 8
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight
  const preferredLeft = event.clientX + gap
  const preferredTop = event.clientY + gap
  const left = preferredLeft + menuWidth <= viewportWidth - 8
    ? preferredLeft
    : event.clientX - menuWidth - gap
  const top = preferredTop + menuHeight <= viewportHeight - 8
    ? preferredTop
    : event.clientY - menuHeight - gap

  return {
    left: Math.max(8, Math.min(left, viewportWidth - menuWidth - 8)),
    top: Math.max(8, Math.min(top, viewportHeight - menuHeight - 8)),
  }
}

function getMomentMenuPosition(event) {
  const menuWidth = 168
  const menuHeight = 48
  const gap = 8
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight
  const preferredLeft = Number(event.clientX || 0) + gap
  const preferredTop = Number(event.clientY || 0) + gap
  const left = preferredLeft + menuWidth <= viewportWidth - 8
    ? preferredLeft
    : Number(event.clientX || 0) - menuWidth - gap
  const top = preferredTop + menuHeight <= viewportHeight - 8
    ? preferredTop
    : Number(event.clientY || 0) - menuHeight - gap
  return {
    left: Math.max(8, Math.min(left, viewportWidth - menuWidth - 8)),
    top: Math.max(8, Math.min(top, viewportHeight - menuHeight - 8)),
  }
}

function renderMomentMenu() {
  const momentId = String(state.momentMenu?.momentId || '')
  const item = state.moments.find((moment) => String(moment.id) === momentId)
  if (!state.momentMenu || !item) return ''
  const label = item.favoritedByMe ? '取消收藏' : '收藏'
  const left = Math.max(8, Number(state.momentMenu.left || 0))
  const top = Math.max(8, Number(state.momentMenu.top || 0))
  return `<div class="conversation-context-menu" data-moment-menu style="left:${left}px;top:${top}px" role="menu" aria-label="朋友圈操作"><button type="button" data-moment-action="favorite" data-moment-id="${escapeHtml(momentId)}" role="menuitem">${icon('bookmark')}${label}</button></div>`
}

function desktopMediaMenuPosition(event, height = 186) {
  const menuWidth = 178
  const gap = 8
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight
  const x = Number(event.clientX || 0)
  const y = Number(event.clientY || 0)
  return {
    left: Math.max(8, Math.min(x + gap + menuWidth <= viewportWidth - 8 ? x + gap : x - menuWidth - gap, viewportWidth - menuWidth - 8)),
    top: Math.max(8, Math.min(y + gap + height <= viewportHeight - 8 ? y + gap : y - height - gap, viewportHeight - height - 8)),
  }
}

const DESKTOP_MEDIA_EDITOR_VIEWBOX = 1000
const DESKTOP_MEDIA_EDITOR_COLOR = '#ff3b30'

function createDesktopMediaEditor() {
  return {
    rotation: 0,
    filter: 'none',
    tool: 'brush',
    annotations: [],
    crop: null,
    history: [],
  }
}

function cloneDesktopMediaEditorAnnotation(annotation) {
  if (!annotation) return null
  if (annotation.type === 'brush') {
    return {
      type: 'brush',
      points: Array.isArray(annotation.points)
        ? annotation.points.map((point) => ({ x: Number(point.x || 0), y: Number(point.y || 0) }))
        : [],
    }
  }
  return {
    type: annotation.type === 'ellipse' ? 'ellipse' : 'rect',
    x: Number(annotation.x || 0),
    y: Number(annotation.y || 0),
    width: Number(annotation.width || 0),
    height: Number(annotation.height || 0),
  }
}

function snapshotDesktopMediaEditor(editor) {
  return {
    rotation: Number(editor?.rotation || 0),
    filter: editor?.filter === 'grayscale' ? 'grayscale' : 'none',
    annotations: Array.isArray(editor?.annotations)
      ? editor.annotations.map(cloneDesktopMediaEditorAnnotation).filter(Boolean)
      : [],
    crop: editor?.crop
      ? desktopMediaEditorShape(
        { x: Number(editor.crop.x || 0), y: Number(editor.crop.y || 0) },
        { x: Number(editor.crop.x || 0) + Number(editor.crop.width || 0), y: Number(editor.crop.y || 0) + Number(editor.crop.height || 0) },
      )
      : null,
  }
}

function commitDesktopMediaEditorChange(nextEditor) {
  const editor = state.mediaEditor
  if (!editor) return
  state.mediaEditor = {
    ...nextEditor,
    history: [...(Array.isArray(editor.history) ? editor.history : []), snapshotDesktopMediaEditor(editor)],
  }
  render()
}

function undoDesktopMediaEditor() {
  const editor = state.mediaEditor
  const history = Array.isArray(editor?.history) ? editor.history : []
  const previous = history[history.length - 1]
  if (!editor || !previous) return
  state.mediaEditor = {
    ...previous,
    tool: editor.tool || 'brush',
    history: history.slice(0, -1),
  }
  render()
}

function desktopMediaEditorShape(start, end) {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  }
}

function desktopMediaEditorPath(points) {
  return points.map((point, index) => `${index ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')
}

function renderDesktopMediaEditorAnnotations(editor) {
  const annotations = Array.isArray(editor?.annotations) ? editor.annotations : []
  return annotations.map((annotation, index) => {
    if (annotation.type === 'brush') {
      const points = Array.isArray(annotation.points) ? annotation.points : []
      if (!points.length) return ''
      return `<path data-media-editor-annotation="${index}" d="${desktopMediaEditorPath(points)}" fill="none" stroke="${DESKTOP_MEDIA_EDITOR_COLOR}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />`
    }
    const shape = desktopMediaEditorShape(
      { x: Number(annotation.x || 0), y: Number(annotation.y || 0) },
      { x: Number(annotation.x || 0) + Number(annotation.width || 0), y: Number(annotation.y || 0) + Number(annotation.height || 0) },
    )
    if (annotation.type === 'ellipse') {
      return `<ellipse data-media-editor-annotation="${index}" cx="${(shape.x + shape.width / 2).toFixed(2)}" cy="${(shape.y + shape.height / 2).toFixed(2)}" rx="${(shape.width / 2).toFixed(2)}" ry="${(shape.height / 2).toFixed(2)}" fill="${DESKTOP_MEDIA_EDITOR_COLOR}" fill-opacity=".1" stroke="${DESKTOP_MEDIA_EDITOR_COLOR}" stroke-width="6" vector-effect="non-scaling-stroke" />`
    }
    return `<rect data-media-editor-annotation="${index}" x="${shape.x.toFixed(2)}" y="${shape.y.toFixed(2)}" width="${shape.width.toFixed(2)}" height="${shape.height.toFixed(2)}" fill="${DESKTOP_MEDIA_EDITOR_COLOR}" fill-opacity=".1" stroke="${DESKTOP_MEDIA_EDITOR_COLOR}" stroke-width="6" vector-effect="non-scaling-stroke" />`
  }).join('')
}

function renderDesktopMediaEditorCrop(editor) {
  if (!editor?.crop) return ''
  const crop = desktopMediaEditorShape(
    { x: Number(editor.crop.x || 0), y: Number(editor.crop.y || 0) },
    { x: Number(editor.crop.x || 0) + Number(editor.crop.width || 0), y: Number(editor.crop.y || 0) + Number(editor.crop.height || 0) },
  )
  const hole = `M ${crop.x.toFixed(2)} ${crop.y.toFixed(2)} H ${(crop.x + crop.width).toFixed(2)} V ${(crop.y + crop.height).toFixed(2)} H ${crop.x.toFixed(2)} Z`
  return `<path d="M 0 0 H ${DESKTOP_MEDIA_EDITOR_VIEWBOX} V ${DESKTOP_MEDIA_EDITOR_VIEWBOX} H 0 Z ${hole}" fill="#000" fill-opacity=".48" fill-rule="evenodd" pointer-events="none" /><rect data-media-editor-crop x="${crop.x.toFixed(2)}" y="${crop.y.toFixed(2)}" width="${crop.width.toFixed(2)}" height="${crop.height.toFixed(2)}" fill="none" stroke="#fff" stroke-width="4" stroke-dasharray="12 8" vector-effect="non-scaling-stroke" pointer-events="none" />`
}

function desktopMediaEditorPoint(event, canvas) {
  const matrix = canvas.getScreenCTM?.()
  if (matrix) {
    const point = canvas.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const local = point.matrixTransform(matrix.inverse())
    return {
      x: Math.max(0, Math.min(DESKTOP_MEDIA_EDITOR_VIEWBOX, local.x)),
      y: Math.max(0, Math.min(DESKTOP_MEDIA_EDITOR_VIEWBOX, local.y)),
    }
  }
  const bounds = canvas.getBoundingClientRect()
  return {
    x: Math.max(0, Math.min(DESKTOP_MEDIA_EDITOR_VIEWBOX, ((event.clientX - bounds.left) / bounds.width) * DESKTOP_MEDIA_EDITOR_VIEWBOX)),
    y: Math.max(0, Math.min(DESKTOP_MEDIA_EDITOR_VIEWBOX, ((event.clientY - bounds.top) / bounds.height) * DESKTOP_MEDIA_EDITOR_VIEWBOX)),
  }
}

function fitDesktopMediaEditorSurface() {
  const surface = document.querySelector('[data-media-editor-surface]')
  const image = document.querySelector('[data-media-editor-image]')
  const stage = surface?.closest('.desktop-media-preview-stage')
  if (!(surface instanceof HTMLElement) || !(image instanceof HTMLImageElement) || !(stage instanceof HTMLElement)) return
  const naturalWidth = Number(image.naturalWidth || 0)
  const naturalHeight = Number(image.naturalHeight || 0)
  if (!naturalWidth || !naturalHeight) return
  // Protected media starts with a transparent 1×1 placeholder while the
  // authenticated blob is being fetched. Do not lock the editor surface to
  // that placeholder size; the real image load will call this again.
  if (image.dataset.protectedMediaSrc && image.getAttribute('src') === DESKTOP_MEDIA_PLACEHOLDER) return
  const stageStyle = window.getComputedStyle(stage)
  const availableWidth = Math.max(1, stage.clientWidth - parseFloat(stageStyle.paddingLeft || '0') - parseFloat(stageStyle.paddingRight || '0'))
  const availableHeight = Math.max(1, stage.clientHeight - parseFloat(stageStyle.paddingTop || '0') - parseFloat(stageStyle.paddingBottom || '0'))
  const rotation = Number(state.mediaEditor?.rotation || 0)
  const quarterTurn = Math.abs(rotation % 180) === 90
  const visualWidth = quarterTurn ? naturalHeight : naturalWidth
  const visualHeight = quarterTurn ? naturalWidth : naturalHeight
  const scale = Math.min(1, availableWidth / visualWidth, availableHeight / visualHeight)
  const width = Math.max(1, Math.floor(naturalWidth * scale))
  const height = Math.max(1, Math.floor(naturalHeight * scale))
  surface.style.width = `${width}px`
  surface.style.height = `${height}px`
  surface.style.maxWidth = 'none'
  surface.style.maxHeight = 'none'
  image.style.width = '100%'
  image.style.height = '100%'
  image.style.maxWidth = 'none'
  image.style.maxHeight = 'none'
}

function bindDesktopMediaEditorCanvas() {
  const canvas = document.querySelector('[data-media-editor-canvas]')
  if (!(canvas instanceof SVGSVGElement)) return
  const image = document.querySelector('[data-media-editor-image]')
  if (image instanceof HTMLImageElement) {
    image.addEventListener('load', fitDesktopMediaEditorSurface)
    if (image.complete && image.getAttribute('src') !== DESKTOP_MEDIA_PLACEHOLDER) fitDesktopMediaEditorSurface()
    window.requestAnimationFrame(fitDesktopMediaEditorSurface)
  }
  let drawing = null

  const removeDraft = () => {
    drawing?.element?.remove()
    drawing = null
  }

  const updateDraft = (event) => {
    if (!drawing) return
    const point = desktopMediaEditorPoint(event, canvas)
    drawing.current = point
    if (drawing.tool === 'brush') {
      drawing.points.push(point)
      drawing.element.setAttribute('d', desktopMediaEditorPath(drawing.points))
      return
    }
    const shape = desktopMediaEditorShape(drawing.start, point)
    if (drawing.tool === 'ellipse') {
      drawing.element.setAttribute('cx', String(shape.x + shape.width / 2))
      drawing.element.setAttribute('cy', String(shape.y + shape.height / 2))
      drawing.element.setAttribute('rx', String(shape.width / 2))
      drawing.element.setAttribute('ry', String(shape.height / 2))
    } else {
      drawing.element.setAttribute('x', String(shape.x))
      drawing.element.setAttribute('y', String(shape.y))
      drawing.element.setAttribute('width', String(shape.width))
      drawing.element.setAttribute('height', String(shape.height))
    }
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0 || !state.mediaEditor) return
    event.preventDefault()
    const tool = state.mediaEditor.tool || 'brush'
    const point = desktopMediaEditorPoint(event, canvas)
    const namespace = 'http://www.w3.org/2000/svg'
    const element = document.createElementNS(namespace, tool === 'brush' ? 'path' : tool === 'ellipse' ? 'ellipse' : 'rect')
    const isCrop = tool === 'crop'
    element.setAttribute('fill', tool === 'brush' || isCrop ? 'none' : DESKTOP_MEDIA_EDITOR_COLOR)
    element.setAttribute('fill-opacity', tool === 'brush' || isCrop ? '0' : '.1')
    element.setAttribute('stroke', isCrop ? '#fff' : DESKTOP_MEDIA_EDITOR_COLOR)
    element.setAttribute('stroke-width', isCrop ? '4' : '6')
    if (isCrop) element.setAttribute('stroke-dasharray', '12 8')
    element.setAttribute('stroke-linecap', 'round')
    element.setAttribute('stroke-linejoin', 'round')
    element.setAttribute('vector-effect', 'non-scaling-stroke')
    element.style.pointerEvents = 'none'
    canvas.append(element)
    drawing = {
      tool,
      start: point,
      current: point,
      points: [point],
      element,
    }
    updateDraft(event)
    canvas.setPointerCapture?.(event.pointerId)
  })
  canvas.addEventListener('pointermove', updateDraft)
  const finish = (event) => {
    if (!drawing) return
    const completed = drawing
    drawing = null
    canvas.releasePointerCapture?.(event.pointerId)
    const shape = desktopMediaEditorShape(completed.start, completed.current)
    const tooSmall = completed.tool !== 'brush' && shape.width < 4 && shape.height < 4
    const tooShort = completed.tool === 'brush' && completed.points.length < 2
    if (tooSmall || tooShort || !state.mediaEditor) {
      completed.element.remove()
      return
    }
    const editor = state.mediaEditor
    const history = [...(Array.isArray(editor.history) ? editor.history : []), snapshotDesktopMediaEditor(editor)]
    if (completed.tool === 'crop') {
      state.mediaEditor = { ...editor, crop: shape, history }
      render()
      return
    }
    const annotation = completed.tool === 'brush'
      ? { type: 'brush', points: completed.points }
      : { type: completed.tool === 'ellipse' ? 'ellipse' : 'rect', ...shape }
    state.mediaEditor = {
      ...editor,
      annotations: [...(Array.isArray(editor.annotations) ? editor.annotations : []), annotation],
      history,
    }
    render()
  }
  canvas.addEventListener('pointerup', finish)
  canvas.addEventListener('pointercancel', removeDraft)
}

function drawDesktopMediaEditorAnnotations(context, annotations, width, height) {
  const scaleX = width / DESKTOP_MEDIA_EDITOR_VIEWBOX
  const scaleY = height / DESKTOP_MEDIA_EDITOR_VIEWBOX
  const strokeWidth = Math.max(4, Math.min(width, height) * 0.006)
  context.save()
  context.strokeStyle = DESKTOP_MEDIA_EDITOR_COLOR
  context.fillStyle = DESKTOP_MEDIA_EDITOR_COLOR
  context.lineWidth = strokeWidth
  context.lineCap = 'round'
  context.lineJoin = 'round'
  for (const annotation of Array.isArray(annotations) ? annotations : []) {
    if (annotation.type === 'brush') {
      const points = Array.isArray(annotation.points) ? annotation.points : []
      if (!points.length) continue
      context.beginPath()
      points.forEach((point, index) => {
        const x = Number(point.x || 0) * scaleX
        const y = Number(point.y || 0) * scaleY
        if (index === 0) context.moveTo(x, y)
        else context.lineTo(x, y)
      })
      context.stroke()
      continue
    }
    const x = Number(annotation.x || 0) * scaleX
    const y = Number(annotation.y || 0) * scaleY
    const annotationWidth = Number(annotation.width || 0) * scaleX
    const annotationHeight = Number(annotation.height || 0) * scaleY
    context.globalAlpha = 0.1
    if (annotation.type === 'ellipse') {
      context.beginPath()
      context.ellipse(x + annotationWidth / 2, y + annotationHeight / 2, Math.abs(annotationWidth / 2), Math.abs(annotationHeight / 2), 0, 0, Math.PI * 2)
      context.fill()
      context.globalAlpha = 1
      context.stroke()
    } else {
      context.fillRect(x, y, annotationWidth, annotationHeight)
      context.globalAlpha = 1
      context.strokeRect(x, y, annotationWidth, annotationHeight)
    }
  }
  context.restore()
}

function openDesktopMediaPreview(descriptor) {
  const url = String(descriptor?.url || '').trim()
  if (!url) return
  const originalUrl = String(descriptor?.originalUrl || '').trim()
  markDesktopPreviewCacheInUse(state.mediaPreview, false)
  state.momentMenu = null
  state.momentMediaMenu = null
  state.mediaPreview = {
    url,
    originalUrl: originalUrl && originalUrl !== url ? originalUrl : '',
    usingOriginal: Boolean(descriptor?.usingOriginal),
    type: descriptor?.type === 'video' ? 'video' : 'image',
    name: descriptor?.name || (descriptor?.type === 'video' ? '朋友圈视频' : '朋友圈图片'),
    fileId: String(descriptor?.fileId || ''),
    momentId: String(descriptor?.momentId || ''),
    burnAfterRead: Boolean(descriptor?.burnAfterRead),
  }
  markDesktopPreviewCacheInUse(state.mediaPreview, true)
  state.mediaEditor = null
  state.mediaActionBusy = ''
  render()
}

function dismissDesktopMessageMenu() {
  state.messageMenu = null
  document.querySelectorAll('[data-message-menu-panel]').forEach((element) => element.remove())
}

function dismissDesktopMediaContextMenu() {
  state.momentMediaMenu = null
  document.querySelectorAll('[data-media-context-menu]').forEach((element) => element.remove())
}

async function loadDesktopOriginalMedia() {
  const preview = state.mediaPreview
  if (!preview?.originalUrl || preview.burnAfterRead || state.mediaEditor || state.mediaActionBusy) return
  markDesktopFileCacheInUse(String(preview.fileId || ''), 'original', true)
  state.mediaActionBusy = 'original'
  render()
  let previewUpdated = false
  try {
    await preloadDesktopProtectedMedia(preview.originalUrl, preview.type, preview.fileId, 'original')
    if (state.mediaPreview !== preview) return
    markDesktopFileCacheInUse(String(preview.fileId || ''), 'preview', false)
    state.mediaPreview = { ...preview, url: preview.originalUrl, usingOriginal: true }
    previewUpdated = true
  } catch (error) {
    markDesktopFileCacheInUse(String(preview.fileId || ''), 'original', false)
    if (state.mediaPreview === preview) showToast(error instanceof Error ? error.message : '原图加载失败')
  } finally {
    if (previewUpdated || state.mediaPreview === preview) {
      state.mediaActionBusy = ''
      render()
    }
  }
}

function closeDesktopMediaPreview() {
  markDesktopPreviewCacheInUse(state.mediaPreview, false)
  state.mediaPreview = null
  state.mediaEditor = null
  state.mediaActionBusy = ''
  state.momentMediaMenu = null
  render()
}

function renderDesktopMediaContextMenu() {
  const menu = state.momentMediaMenu
  if (!menu) return ''
  const left = Math.max(8, Number(menu.left || 0))
  const top = Math.max(8, Number(menu.top || 0))
  const disabled = state.mediaActionBusy ? ' disabled aria-disabled="true"' : ''
  if (menu.burnAfterRead) {
    return `<div class="desktop-media-context-menu" data-media-context-menu style="left:${left}px;top:${top}px" role="menu"><button type="button" disabled aria-disabled="true">${icon('lock')}阅后即焚消息不可复制</button></div>`
  }
  return `<div class="desktop-media-context-menu" data-media-context-menu style="left:${left}px;top:${top}px" role="menu"><button type="button" data-media-action="copy"${disabled}>${icon('edit')}复制</button><button type="button" data-media-action="favorite"${disabled}>${icon('bookmark')}收藏</button><button type="button" data-media-action="forward"${disabled}>${icon('share')}转发</button><button type="button" data-media-action="save"${disabled}>${icon('download')}另存为</button>${menu.type !== 'video' ? `<button type="button" data-media-action="edit"${disabled}>${icon('edit')}编辑图片</button>` : ''}</div>`
}

function renderDesktopMediaEditorImage(preview, editor, source) {
  const protectedAttributes = isDesktopProtectedMediaUrl(preview.url)
    ? ` data-protected-media-src="${escapeHtml(preview.url)}" data-file-id="${escapeHtml(preview.fileId || '')}" data-file-category="image" data-file-variant="preview"`
    : ''
  if (!editor) {
    return `<img class="desktop-media-preview-image" data-media-editor-image src="${escapeHtml(source)}"${protectedAttributes} alt="${escapeHtml(preview.name)}" />`
  }
  const filter = editor.filter === 'grayscale' ? 'grayscale(1)' : 'none'
  return `<div class="desktop-media-editor-surface" data-media-editor-surface style="transform:rotate(${Number(editor.rotation || 0)}deg)"><img class="desktop-media-preview-image" data-media-editor-image src="${escapeHtml(source)}"${protectedAttributes} alt="${escapeHtml(preview.name)}" style="filter:${filter}" /><svg class="desktop-media-editor-canvas" data-media-editor-canvas viewBox="0 0 ${DESKTOP_MEDIA_EDITOR_VIEWBOX} ${DESKTOP_MEDIA_EDITOR_VIEWBOX}" preserveAspectRatio="none" aria-label="图片编辑画布">${renderDesktopMediaEditorCrop(editor)}${renderDesktopMediaEditorAnnotations(editor)}</svg></div>`
}

function renderDesktopMediaPreview() {
  const preview = state.mediaPreview
  if (!preview) return ''
  const burnMedia = Boolean(preview.burnAfterRead)
  const editor = state.mediaEditor
  const mediaBusy = String(state.mediaActionBusy || '')
  const protectedUrl = isDesktopProtectedMediaUrl(preview.url)
  const source = protectedUrl ? desktopMediaRenderSource(preview.url) : preview.url
  const media = preview.type === 'video'
     ? `<video class="desktop-media-preview-video" src="${escapeHtml(source)}"${protectedUrl ? ` data-protected-media-src="${escapeHtml(preview.url)}" data-file-id="${escapeHtml(preview.fileId || '')}" data-file-category="video" data-file-variant="preview"` : ''} controls autoplay playsinline></video>`
    : renderDesktopMediaEditorImage(preview, editor, source)
  const editorHistory = Array.isArray(editor?.history) ? editor.history : []
  const originalButton = !burnMedia && !editor && preview.originalUrl && !preview.usingOriginal
    ? `<button type="button" class="btn" data-media-preview-original${mediaBusy ? ' disabled aria-disabled="true"' : ''}>${icon(preview.type === 'video' ? 'video' : 'image')}查看原${preview.type === 'video' ? '视频' : '图'}</button>`
    : ''
  const editorDisabled = mediaBusy ? ' disabled aria-disabled="true"' : ''
  const editorTools = editor
    ? `<div class="desktop-media-editor-tools"><span class="desktop-media-editor-label">标注</span><button type="button" class="btn${editor.tool === 'brush' ? ' is-active' : ''}" data-media-editor-tool="brush"${editorDisabled}>画笔</button><button type="button" class="btn${editor.tool === 'rect' ? ' is-active' : ''}" data-media-editor-tool="rect"${editorDisabled}>方框</button><button type="button" class="btn${editor.tool === 'ellipse' ? ' is-active' : ''}" data-media-editor-tool="ellipse"${editorDisabled}>圆圈</button><button type="button" class="btn${editor.tool === 'crop' ? ' is-active' : ''}" data-media-editor-tool="crop"${editorDisabled}>裁剪</button><button type="button" class="btn" data-media-editor-undo${editorHistory.length ? '' : ' disabled'}${editorDisabled}>撤回上一步</button><button type="button" class="btn" data-media-editor-rotate${editorDisabled}>旋转 90°</button><button type="button" class="btn" data-media-editor-filter${editorDisabled}>${editor.filter === 'grayscale' ? '恢复原色' : '黑白'}</button><button type="button" class="btn" data-media-editor-cancel${editorDisabled}>取消编辑</button><button type="button" class="btn btn-primary" data-media-editor-save${editorDisabled}>复制编辑图</button></div>`
    : ''
  const previewLabel = burnMedia ? '阅后即焚媒体' : editor ? '图片编辑' : preview.type === 'video' ? (preview.usingOriginal ? '原视频' : '视频预览') : (preview.usingOriginal ? '原图' : '图片预览')
  const busyLabel = mediaBusy === 'original' ? '正在加载原图…' : mediaBusy === 'edit' ? '正在准备编辑…' : mediaBusy === 'copy' ? '正在复制…' : mediaBusy === 'save' ? '正在保存…' : previewLabel
  const disabled = mediaBusy ? ' disabled aria-disabled="true"' : ''
  return `<div class="desktop-media-preview-backdrop" data-media-preview-backdrop${mediaBusy ? ' aria-busy="true"' : ''}><div class="desktop-media-preview-dialog" role="dialog" aria-label="媒体预览"><button type="button" class="desktop-media-preview-close" data-media-preview-close aria-label="关闭">${icon('close')}</button><div class="desktop-media-preview-stage">${media}</div><div class="desktop-media-preview-toolbar"><strong>${escapeHtml(preview.name)}</strong><span>${busyLabel}</span><div>${originalButton}${!burnMedia && preview.type === 'image' && !editor ? `<button type="button" class="btn" data-media-preview-edit${disabled}>${icon('edit')}编辑</button>` : ''}${!burnMedia ? `<button type="button" class="btn" data-media-preview-save${disabled}>${icon('download')}另存为</button>` : ''}</div></div>${editorTools}</div></div>`
}

async function copyDesktopText(value) {
  const text = String(value || '')
  if (!text) throw new Error('empty-copy')
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return
    }
  } catch {
    // Clipboard permissions can be unavailable in the Electron renderer.
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.append(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  if (!copied) throw new Error('copy-failed')
}

async function copyDesktopMedia(menu) {
  if (menu?.burnAfterRead) throw new Error('阅后即焚消息不能复制')
  // A context menu opened on the chat/moments thumbnail should copy that
  // already-rendered image. The explicit "查看原图" preview updates menu.url
  // to the original URL when the user really wants the original bytes.
  const blob = await fetchDesktopProtectedBlob(menu.url || menu.originalUrl)
  if (menu.type !== 'video') {
    try {
      await copyDesktopBlob(blob)
      return
    } catch {
      // Some browser contexts do not grant image clipboard permission. Fall
      // back to copying the source address in that case.
    }
  } else if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    try {
      await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'video/mp4']: blob })])
      return
    } catch {
      // Some Chromium builds only allow text on the clipboard. Fall back to
      // the source address instead of reporting a misleading copy failure.
    }
  }
  await copyDesktopText(menu.url)
}

async function saveDesktopBlobAs(blob, filename) {
  const desktopShell = window.pulseDesktop
  if (desktopShell?.chooseSavePath && desktopShell?.writeBytesToPath) {
    const choice = await desktopShell.chooseSavePath({ filename })
    if (!choice || choice.canceled || !choice.filePath) return false
    const result = await desktopShell.writeBytesToPath({
      filePath: choice.filePath,
      data: await blob.arrayBuffer(),
    })
    if (!result?.ok) throw new Error(result?.error || '保存失败')
    return true
  }

  if (typeof window.showSaveFilePicker === 'function') {
    const handle = await window.showSaveFilePicker({ suggestedName: filename })
    try {
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return true
    } catch (error) {
      // A browser/Electron context may expose showSaveFilePicker but reject
      // createWritable. Continue with the normal download fallback instead of
      // surfacing the platform error shown by the old implementation.
      if (error?.name === 'AbortError') throw error
    }
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noreferrer'
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1200)
  return true
}

async function copyDesktopBlob(blob) {
  const desktopShell = window.pulseDesktop
  if (desktopShell?.copyImageToClipboard) {
    const result = await desktopShell.copyImageToClipboard({ data: await blob.arrayBuffer() })
    if (result?.ok) return
    throw new Error(result?.error || '复制图片失败')
  }
  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    await navigator.clipboard.write([new ClipboardItem({ [blob.type || 'image/png']: blob })])
    return
  }
  throw new Error('clipboard-unavailable')
}

async function saveDesktopMomentMedia(menu) {
  if (menu?.burnAfterRead) throw new Error('阅后即焚消息不能保存')
  const blob = await fetchDesktopProtectedBlob(menu.originalUrl || menu.url)
  const extension = menu.type === 'video' ? 'mp4' : 'png'
  const filename = /\.[a-z0-9]{2,8}$/i.test(menu.name || '') ? menu.name : `${menu.name || '朋友圈媒体'}.${extension}`
  const saved = await saveDesktopBlobAs(blob, filename)
  return { saved, copied: false }
}

async function saveDesktopCurrentMedia(menu) {
  const preview = state.mediaPreview
  if (menu?.burnAfterRead || preview?.burnAfterRead) throw new Error('阅后即焚消息不能保存')
  const sameMedia = preview && menu && [preview.url, preview.originalUrl].filter(Boolean).some((url) => (
    String(url) === String(menu.url) || String(url) === String(menu.originalUrl || '')
  ))
  if (sameMedia && state.mediaEditor && preview.type === 'image') {
    return saveEditedDesktopMomentImage()
  }
  return saveDesktopMomentMedia(menu)
}

async function copyDesktopCurrentMedia(menu) {
  const preview = state.mediaPreview
  if (menu?.burnAfterRead || preview?.burnAfterRead) throw new Error('阅后即焚消息不能复制')
  const sameMedia = preview && menu && [preview.url, preview.originalUrl].filter(Boolean).some((url) => (
    String(url) === String(menu.url) || String(url) === String(menu.originalUrl || '')
  ))
  if (sameMedia && state.mediaEditor && preview.type === 'image') {
    return copyEditedDesktopMomentImage()
  }
  await copyDesktopMedia(menu)
}

function openDesktopMediaForward(menu) {
  if (menu?.burnAfterRead) {
    showToast('阅后即焚消息不能转发')
    return
  }
  if (!menu || menu.url.startsWith('blob:')) {
    showToast('发布前的本地预览暂不支持转发')
    return
  }
  state.momentMediaMenu = null
  state.mediaForward = { ...menu }
  state.mediaForwardTargets = new Set()
  state.modalError = ''
  state.modal = 'media-forward'
  render()
}

async function submitDesktopMediaForward() {
  const media = state.mediaForward
  const targets = [...state.mediaForwardTargets]
  if (!media || !targets.length) {
    state.modalError = '请至少选择一个转发会话'
    render()
    return
  }
  state.modalBusy = true
  render()
  try {
    const content = JSON.stringify({ url: media.url, name: media.name, contentType: media.type === 'video' ? 'video/mp4' : 'image/png' })
    for (const conversationId of targets) {
      const clientMsgId = `desktop_media_forward_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const fileId = String(media.fileId || '').trim()
      if (fileId && getDesktopToken()) {
        await sendDesktopChatMessageAwaitAck({
          conversationId,
          content: `file:${fileId}`,
          fileId,
          msgType: media.type === 'video' ? 2 : 1,
          clientMsgId,
        }, getDesktopToken() || '')
      } else {
        // Keep old moment-media forwarding compatible; chat attachments use
        // the fileId branch above and never place bytes in the WS frame.
        await sendDesktopTextMessage({ conversationId, content, msgType: media.type === 'video' ? 2 : 1, clientMsgId })
      }
    }
    resetModal()
    showToast(`已转发到 ${targets.length} 个会话`)
  } catch (error) {
    state.modalBusy = false
    state.modalError = error instanceof Error ? error.message : '媒体转发失败'
    render()
  }
}

async function buildEditedDesktopMomentImageBlob() {
  const preview = state.mediaPreview
  const editor = state.mediaEditor
  if (!preview || preview.type !== 'image' || !editor) return null
  const image = document.querySelector('[data-media-editor-image]')
  if (!(image instanceof HTMLImageElement) || !image.naturalWidth) return null
  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = image.naturalWidth
  sourceCanvas.height = image.naturalHeight
  const sourceContext = sourceCanvas.getContext('2d')
  if (!sourceContext) return null
  if (editor.filter === 'grayscale') sourceContext.filter = 'grayscale(1)'
  sourceContext.drawImage(image, 0, 0)
  sourceContext.filter = 'none'
  drawDesktopMediaEditorAnnotations(sourceContext, editor.annotations, sourceCanvas.width, sourceCanvas.height)

  let outputCanvas = sourceCanvas
  if (editor.crop) {
    const crop = desktopMediaEditorShape(
      { x: Number(editor.crop.x || 0), y: Number(editor.crop.y || 0) },
      { x: Number(editor.crop.x || 0) + Number(editor.crop.width || 0), y: Number(editor.crop.y || 0) + Number(editor.crop.height || 0) },
    )
    const cropX = Math.max(0, Math.min(sourceCanvas.width - 1, Math.round((crop.x / DESKTOP_MEDIA_EDITOR_VIEWBOX) * sourceCanvas.width)))
    const cropY = Math.max(0, Math.min(sourceCanvas.height - 1, Math.round((crop.y / DESKTOP_MEDIA_EDITOR_VIEWBOX) * sourceCanvas.height)))
    const cropWidth = Math.max(1, Math.min(sourceCanvas.width - cropX, Math.round((crop.width / DESKTOP_MEDIA_EDITOR_VIEWBOX) * sourceCanvas.width)))
    const cropHeight = Math.max(1, Math.min(sourceCanvas.height - cropY, Math.round((crop.height / DESKTOP_MEDIA_EDITOR_VIEWBOX) * sourceCanvas.height)))
    const cropCanvas = document.createElement('canvas')
    cropCanvas.width = cropWidth
    cropCanvas.height = cropHeight
    const cropContext = cropCanvas.getContext('2d')
    if (!cropContext) return null
    cropContext.drawImage(sourceCanvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)
    outputCanvas = cropCanvas
  }

  const rotation = Number(editor.rotation || 0)
  const quarterTurn = Math.abs(rotation % 180) === 90
  const canvas = document.createElement('canvas')
  canvas.width = quarterTurn ? outputCanvas.height : outputCanvas.width
  canvas.height = quarterTurn ? outputCanvas.width : outputCanvas.height
  const context = canvas.getContext('2d')
  if (!context) return null
  context.translate(canvas.width / 2, canvas.height / 2)
  context.rotate((rotation * Math.PI) / 180)
  context.drawImage(outputCanvas, -outputCanvas.width / 2, -outputCanvas.height / 2)
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  return blob || null
}

async function saveEditedDesktopMomentImage() {
  const preview = state.mediaPreview
  if (preview?.burnAfterRead) throw new Error('阅后即焚消息不能保存')
  const blob = await buildEditedDesktopMomentImageBlob()
  if (!preview || !blob) return { saved: false, copied: false }

  const saved = await saveDesktopBlobAs(blob, `${String(preview.name || '朋友圈图片').replace(/\.[^.]+$/, '')}_edited.png`)
  return { saved, copied: false }
}

async function copyEditedDesktopMomentImage() {
  if (state.mediaPreview?.burnAfterRead) throw new Error('阅后即焚消息不能复制')
  const blob = await buildEditedDesktopMomentImageBlob()
  if (!blob) throw new Error('图片还没有加载完成')
  await copyDesktopBlob(blob)
  return { saved: false, copied: true }
}

function renderMessageMenu(selected) {
  if (!state.messageMenu || String(state.messageMenu.conversationId) !== String(selected.id)) return ''
  const message = currentMessages(selected).find((item) => item.id === state.messageMenu.messageId)
  if (!message) return ''
  const saveAction = desktopMessageMediaDownloadInfo(message)
    ? `<button data-message-action="save-as" data-message-id="${escapeHtml(message.id)}">${icon('download')}另存为...</button>`
    : ''
  const editAction = desktopMessageImageInfo(message)
    ? `<button data-message-action="edit-image" data-message-id="${escapeHtml(message.id)}">${icon('edit')}编辑图片</button>`
    : ''
  return `<div class="message-context-menu" data-message-menu-panel>${editAction}${saveAction}<button data-message-action="copy" data-message-id="${escapeHtml(message.id)}">${icon('edit')}复制</button><button data-message-action="forward" data-message-id="${escapeHtml(message.id)}">${icon('share')}转发</button><button data-message-action="multi-select" data-message-id="${escapeHtml(message.id)}">${icon('grid')}多选</button><button data-message-action="quote" data-message-id="${escapeHtml(message.id)}">${icon('chat')}引用（回复）</button>${message.mine && !message.recalled ? `<button data-message-action="recall" data-message-id="${escapeHtml(message.id)}">${icon('arrow')}撤回</button>` : ''}<button class="danger" data-message-action="delete-self" data-message-id="${escapeHtml(message.id)}">${icon('close')}单向删除</button>${selected.type === 'group' ? '' : `<button class="danger" data-message-action="delete-both" data-message-id="${escapeHtml(message.id)}">${icon('close')}双向删除</button>`}</div>`
}

function renderChatPanelLegacy2(selected) {
  const group = selected.type === 'group' || selected.name.includes('设计组')
  const remoteMessages = currentMessages(selected)
  const messageStream = remoteMessages.length
    ? remoteMessages.map((message) => `<div class="message-row ${message.mine ? 'message-out' : 'message-in'}" data-message-menu data-message-id="${escapeHtml(message.id)}">${message.mine ? '' : `<div class="message-avatar">${avatar(selected, 'avatar-tiny')}</div>`}<div>${message.fromNickname && !message.mine ? `<span class="message-sender">${escapeHtml(message.fromNickname)}</span>` : ''}<div class="message-bubble ${message.recalled ? 'message-recalled' : ''}">${renderDesktopMessageContent(message)}</div><time>${escapeHtml(message.time || '')}${message.mine ? ` ${renderMessageReadStatus(selected, message)}` : ''}</time></div></div>`).join('')
    : '<div class="chat-empty">暂无消息</div>'
  return `<section class="chat-panel panel-surface">
    <div class="chat-header"><div class="chat-title"><span class="avatar-wrap">${avatar(selected)}${selected.type === 'personal' && !selected.fileTransferAssistant ? `<i class="online-dot${selected.online ? '' : ' offline'}"></i>` : ''}</span><div><h2>${escapeHtml(selected.name)}</h2><p>${selected.type === 'personal' && !selected.fileTransferAssistant ? `<span class="${selected.online ? 'status-green' : 'status-gray'}">${selected.online ? '在线' : '离线'}</span> · ` : ''}${group ? '群聊' : 'Pulse 联系人'}</p></div></div><div class="chat-actions"><button class="subtle-icon-btn" data-action="search-chat" aria-label="搜索聊天">${icon('search')}</button><button class="subtle-icon-btn" data-action="more" aria-label="更多">${icon('more')}</button></div></div>
    <div class="chat-security">${icon('lock')} 端到端加密 · 仅你和 ${escapeHtml(selected.name)} 可以阅读</div>
    <div class="chat-stream" data-conversation-id="${escapeHtml(conversationScrollKey(selected))}">
      <div class="day-divider"><span>${state.loadingMessages ? '正在同步' : (state.messageSearchQuery ? `搜索：${escapeHtml(state.messageSearchQuery)}` : '今天')}</span></div>
      ${messageStream}
      
    </div>
    <button class="jump-latest-btn" data-action="jump-latest" data-jump-latest data-jump-conversation="${escapeHtml(conversationScrollKey(selected))}" aria-label="回到最新消息" title="回到最新消息">${icon('arrow')}</button>
    ${renderMessageMenu(selected)}
    <div class="composer"><div class="composer-tools"><button data-action="attach-file" aria-label="发送文件">${icon('paperclip')}</button><button data-action="insert-emoji" aria-label="表情">${icon('smile')}</button><button data-action="attach-file" aria-label="发送文件">${icon('folder')}</button><span class="composer-hint">Enter 发送 · Shift + Enter 换行</span></div><textarea data-message-composer placeholder="写下你的消息…" value="${escapeHtml(state.composerText)}"></textarea><div class="composer-bottom"><span>${icon('lock')} 私密对话</span><button class="send-button" data-action="send">${icon('send')}</button></div></div>
  </section>`
}

function renderDesktopPlusMenu() {
  const actions = [
    ['send-photo', '图片', 'image'],
    ['send-video', '视频', 'video'],
    ['send-file', '文件', 'folder'],
    ...(isDesktopWalletEnabled() ? [['send-redpacket', '红包', 'gift'], ['send-transfer', '转账', 'money']] : []),
  ]
  return `<div class="desktop-plus-menu">${actions.map(([action, label, iconName]) => `<button type="button" data-action="${action}"><span>${icon(iconName)}</span><small>${label}</small></button>`).join('')}</div>`
}

function renderDesktopComposerActions() {
  const actions = [
    ['send-photo', '图片', 'image'],
    ['send-video', '视频', 'video'],
    ['send-file', '文件', 'folder'],
    ...(isDesktopWalletEnabled() ? [['send-redpacket', '红包', 'gift'], ['send-transfer', '转账', 'money']] : []),
  ]
  return `<span class="desktop-composer-actions">${actions.map(([action, label, iconName]) => `<button type="button" data-action="${action}" aria-label="${label}" title="${label}">${icon(iconName)}</button>`).join('')}</span>`
}

function renderChatPanelDraft(selected) {
  const group = selected.type === 'group' || selected.name.includes('设计组')
  const remoteMessages = currentMessages(selected)
  const messageStream = remoteMessages.length
    ? remoteMessages.map((message) => `<div class="message-row ${message.mine ? 'message-out' : 'message-in'}" data-message-menu data-message-id="${escapeHtml(message.id)}">${message.mine ? '' : `<div class="message-avatar">${avatar(selected, 'avatar-tiny')}</div>`}<div>${message.fromNickname && !message.mine ? `<span class="message-sender">${escapeHtml(message.fromNickname)}</span>` : ''}<div class="message-bubble ${message.recalled ? 'message-recalled' : ''}">${renderDesktopMessageContent(message)}</div><time>${escapeHtml(message.time || '')}${message.mine ? ` ${renderMessageReadStatus(selected, message)}` : ''}</time></div></div>`).join('')
    : '<div class="chat-empty">暂无消息</div>'
  return `<section class="chat-panel panel-surface">
    <div class="chat-header"><div class="chat-title"><span class="avatar-wrap">${avatar(selected)}${selected.type === 'personal' && !selected.fileTransferAssistant ? `<i class="online-dot${selected.online ? '' : ' offline'}"></i>` : ''}</span><div><h2>${escapeHtml(selected.name)}</h2><p>${selected.type === 'personal' && !selected.fileTransferAssistant ? `<span class="${selected.online ? 'status-green' : 'status-gray'}">${selected.online ? '在线' : '离线'}</span> · ` : ''}${group ? '群聊' : 'Pulse 联系人'}</p></div></div><div class="chat-actions"><button class="subtle-icon-btn" data-action="search-chat" aria-label="搜索聊天">${icon('search')}</button><button class="subtle-icon-btn" data-action="more" aria-label="更多">${icon('more')}</button></div></div>
    <div class="chat-security">${icon('lock')} 端到端加密 · 仅你和 ${escapeHtml(selected.name)} 可以阅读</div>
    <div class="chat-stream" data-conversation-id="${escapeHtml(selected.id)}">
      <div class="day-divider"><span>${state.loadingMessages ? '正在同步' : (state.messageSearchQuery ? `搜索：${escapeHtml(state.messageSearchQuery)}` : '今天')}</span></div>
      ${messageStream}
      
    </div>
    <button class="jump-latest-btn" data-action="jump-latest" data-jump-latest data-jump-conversation="${escapeHtml(conversationScrollKey(selected))}" aria-label="回到最新消息" title="回到最新消息">${icon('arrow')}</button>
    ${renderMessageMenu(selected)}
    <div class="composer ${state.recordingVoice ? 'is-recording' : ''}">
      ${state.showPlusMenu ? renderDesktopPlusMenu() : ''}
      <div class="composer-tools">
        <button type="button" data-action="toggle-plus" aria-label="更多消息类型">${icon('plus')}</button>
        <button type="button" data-action="toggle-emoji" aria-label="表情">${icon('smile')}</button>
        <button type="button" class="composer-voice-button ${state.recordingVoice ? 'is-recording' : ''}" data-action="voice-record" aria-label="录音">${icon('mic')}<span>${state.recordingVoice ? '停止录音' : '语音'}</span></button>
        <span class="composer-hint">Enter 发送 · Shift + Enter 换行${state.uploadingFile ? ' · 正在上传…' : ''}</span>
      </div>
      ${state.showEmojiPanel ? `<div class="desktop-emoji-panel">${['😀','😂','😍','👍','👏','🎉','❤️','🔥','😄','😢','🤔','🙏','😎','✨','🌹','💯'].map((emoji) => `<button type="button" data-emoji="${emoji}">${emoji}</button>`).join('')}</div>` : ''}
      <textarea data-message-composer placeholder="写下你的消息…" ${state.sendingMessage || state.uploadingFile ? 'disabled' : ''}></textarea>
      <div class="composer-bottom"><span>${icon('lock')} 私密对话</span><button class="send-button" data-action="send" ${state.sendingMessage ? 'disabled' : ''}>${icon('send')}</button></div>
      <input id="desktop-file-input" class="desktop-hidden-file" type="file" accept="*/*" />
    </div>
  </section>`
}

function renderContextPanelLegacy(selected) {
  const isGroup = isGroupConversation(selected)
  const groupDetail = isGroup ? currentDesktopGroupDetail(selected) : null
  const profileTitle = isGroup ? '群聊资料' : '联系人资料'
  const profileSubtitle = isGroup ? '群聊会话' : (selected.online ? '在线，随时可以聊天' : '最近活跃于昨天')
  const profileAction = isGroup ? '群成员' : '资料'
  const groupMembers = groupDetail?.members || []
  const groupMemberList = state.groupDetailLoadingConversationId === String(selected?.id || '')
    ? '<div class="desktop-modal-hint">正在加载群成员…</div>'
    : groupMembers.length
      ? `<div class="group-members-list">${groupMembers.map((member) => {
        const memberId = String(member.userId || '')
        const isMe = memberId === String(state.profile.userId || '')
        const isOwner = Boolean(member.owner) || member.role === 'owner'
        const isAdmin = isOwner || Boolean(member.admin) || member.role === 'admin'
        const role = isOwner ? '群主' : isAdmin ? '管理员' : '普通成员'
        const roleClass = isOwner ? 'is-owner' : isAdmin ? 'is-admin' : 'is-member'
        const memberPerson = { name: member.nickname || '群成员', initials: (member.nickname || '群').slice(0, 1), avatarUrl: member.avatarUrl || '', tone: isOwner ? 'orange' : isAdmin ? 'violet' : 'blue' }
        return `<div class="group-member-row"><span class="group-member-avatar">${avatar(memberPerson, 'avatar-small')}</span><span class="group-member-copy"><strong>${escapeHtml(member.nickname || '群成员')}</strong><small class="group-member-role ${roleClass}">${role}${isMe ? '（我）' : ''}</small></span>${member.speakMuted ? `<span class="group-member-muted" title="已被禁言">${icon('volume-off')}</span>` : ''}</div>`
      }).join('')}</div>`
      : '<div class="desktop-modal-hint">暂无群成员信息</div>'
  const groupMembersCard = isGroup
    ? `<div class="context-card group-members-context"><div class="context-card-label"><span>群成员</span><span class="group-member-count">${groupDetail?.memberCount ?? groupMembers.length} 人</span></div>${groupMemberList}</div>`
    : ''
  if (isGroup && !groupDetail && !state.groupDetailLoadingConversationId) void loadDesktopGroupDetail(selected)
  return `<aside class="context-panel">
    <div class="context-card profile-context"><div class="context-card-label">${profileTitle} <button>${icon('more')}</button></div><div class="profile-context-main">${avatar(selected, 'avatar-large')}<h3>${selected.name}</h3><p>${profileSubtitle}</p>${renderDesktopFriendTag(selected.tag, !isGroup ? (selected.peerUserId || selected.name) : '', 'profile-tag')}</div><div class="profile-actions"><button>${icon('phone')}<span>语音</span></button><button>${icon('video')}<span>视频</span></button><button type="button" ${isGroup ? 'data-action="group-info" data-group-info-focus="members" aria-label="查看群成员" title="查看群成员"' : ''}>${icon('person')}<span>${profileAction}</span></button></div></div>
    <div class="context-card"><div class="context-card-label"><span>共享内容</span><button>${icon('arrow')}</button></div><div class="shared-grid"><button class="shared-tile"><span class="shared-preview shared-image"></span><strong>3 张图片</strong></button><button class="shared-tile"><span class="shared-preview shared-file">${icon('folder')}</span><strong>6 个文件</strong></button></div></div>
    ${groupMembersCard}
    <div class="context-card context-list"><button><span class="list-icon">${icon('settings')}</span><span><strong>聊天设置</strong><small>通知、置顶与隐私</small></span>${icon('arrow')}</button></div>
  </aside>`
}

function renderContextPanel(selected) {
  const counts = sharedContentCountsFor(selected)
  const countsLoading = state.sharedContentCountsLoadingConversationId === String(selected?.id || '')
  const mediaLabel = countsLoading ? '…' : counts?.media == null ? '—' : `${counts.media} 项媒体`
  const fileLabel = countsLoading ? '…' : counts?.file == null ? '—' : `${counts.file} 个文件`
  const context = renderContextPanelLegacy(selected)
    .replace(/(<div class="shared-grid">[\s\S]*?<strong>)[^<]*(<\/strong>)/, `$1${escapeHtml(mediaLabel)}$2`)
    .replace(/(<span class="shared-preview shared-file">[\s\S]*?<strong>)[^<]*(<\/strong>)/, `$1${escapeHtml(fileLabel)}$2`)
    .replace(/<div class="context-card context-list">[\s\S]*?<\/div>\s*<\/aside>/, '</aside>')
  return context.replace('</aside>', `${renderDesktopChatSettingsPanel(selected)}</aside>`)
}

function renderDesktopChatSettingsPanel(selected) {
  const settings = desktopConversationSettings(selected)
  const group = selected?.type === 'group'
  if (group) return ''
  const disabled = group || state.chatSettingsSaving || state.chatSettingsLoading
  const loading = state.chatSettingsLoading && state.chatSettingsConversationId === String(selected?.id || '')
  const autoOptions = [
    [86400, '\u0031\u5929'], [259200, '\u0033\u5929'], [604800, '\u0037\u5929'], [1209600, '\u0031\u0034\u5929'],
    [2592000, '\u0031\u4e2a\u6708'], [7776000, '\u0033\u4e2a\u6708'], [15552000, '\u0036\u4e2a\u6708'], [31536000, '\u0031\u5e74'],
  ]
  const autoOptionMarkup = autoOptions.map(([value, label]) => `<option value="${value}" ${Number(settings.autoDeleteSeconds) === value ? 'selected' : ''}>${label}</option>`).join('')
  const body = loading
    ? '<div class="desktop-modal-hint">\u6b63\u5728\u52a0\u8f7d\u804a\u5929\u8bbe\u7f6e\u2026</div>'
    : `<div class="desktop-chat-settings">
        ${group ? '<div class="desktop-settings-note">\u9605\u540e\u5373\u711a\u548c\u81ea\u52a8\u5220\u9664\u8bb0\u5f55\u4ec5\u652f\u6301\u597d\u53cb\u79c1\u804a\u3002</div>' : ''}
        <section class="desktop-chat-setting-card"><div class="desktop-chat-setting-heading"><span class="desktop-setting-icon">${icon('shield')}</span><span><strong>\u9605\u540e\u5373\u711a</strong><small>\u5bf9\u65b9\u9605\u8bfb\u6d88\u606f\u540e\u5f00\u59cb\u5012\u8ba1\u65f6\uff0c\u5230\u671f\u540e\u53cc\u65b9\u4e0d\u53ef\u89c1\u3002</small></span><label class="desktop-switch"><input type="checkbox" data-chat-burn-toggle ${settings.burnEnabled ? 'checked' : ''} ${disabled ? 'disabled' : ''} /><i></i></label></div>${desktopBurnOptionsMarkup(settings, disabled)}</section>
        <section class="desktop-chat-setting-card"><div class="desktop-chat-setting-heading"><span class="desktop-setting-icon">${icon('close')}</span><span><strong>\u81ea\u52a8\u5220\u9664\u8bb0\u5f55</strong><small>\u4ece\u6d88\u606f\u53d1\u9001\u65f6\u5f00\u59cb\u8ba1\u65f6\uff0c\u5373\u4f7f\u672a\u8bfb\u4e5f\u4f1a\u81ea\u52a8\u5220\u9664\u3002</small></span><label class="desktop-switch"><input type="checkbox" data-chat-auto-delete-toggle ${settings.autoDeleteEnabled ? 'checked' : ''} ${disabled ? 'disabled' : ''} /><i></i></label></div><label class="desktop-setting-select ${settings.autoDeleteEnabled ? '' : 'is-disabled'}"><span>\u5220\u9664\u65f6\u95f4</span><select data-chat-auto-delete-select ${!settings.autoDeleteEnabled || disabled ? 'disabled' : ''}>${autoOptionMarkup}</select></label>${settings.peerAutoDeleteEnabled ? `<div class="desktop-peer-setting">\u5bf9\u65b9\u5df2\u5f00\u542f\u81ea\u52a8\u5220\u9664\uff1a${escapeHtml(desktopDurationLabel(settings.peerAutoDeleteSeconds))}</div>` : ''}</section>
        ${state.chatSettingsError ? `<div class="login-error">${escapeHtml(state.chatSettingsError)}</div>` : ''}
      </div>`
  return `<section class="context-card context-settings-card"><div class="context-card-label"><span>\u804a\u5929\u8bbe\u7f6e</span><button type="button" data-action="chat-settings" aria-label="\u6253\u5f00\u804a\u5929\u8bbe\u7f6e" title="\u6253\u5f00\u804a\u5929\u8bbe\u7f6e">${icon('arrow')}</button></div>${body}</section>`
}

function contactIsOnline(contact) {
  return Boolean(contact?.online) || String(contact?.status || '') === '\u5728\u7ebf'
}

function renderContactMoreMenu() {
  const onlineOnlyLabel = state.contactOnlineOnly
    ? '\u663e\u793a\u5168\u90e8\u8054\u7cfb\u4eba'
    : '\u53ea\u770b\u5728\u7ebf\u8054\u7cfb\u4eba'
  const onlineOnlyHint = state.contactOnlineOnly
    ? '\u5df2\u9690\u85cf\u79bb\u7ebf\u8054\u7cfb\u4eba'
    : '\u4ec5\u4fdd\u7559\u5f53\u524d\u5728\u7ebf\u8054\u7cfb\u4eba'
  return '<div class="contact-more-menu" data-contact-more-menu role="menu" aria-label="\u8054\u7cfb\u4eba\u66f4\u591a\u64cd\u4f5c">' +
    '<button type="button" data-action="toggle-contact-online-only" role="menuitemcheckbox" aria-checked="' + String(state.contactOnlineOnly) + '">' +
      '<span class="contact-more-icon">' + icon('contacts') + '</span>' +
      '<span><strong>' + onlineOnlyLabel + '</strong><small>' + onlineOnlyHint + '</small></span>' +
      '<span class="contact-more-check">' + (state.contactOnlineOnly ? icon('check') : '') + '</span>' +
    '</button>' +
  '</div>'
}

async function refreshDesktopContacts() {
  if (state.contactRefreshing) return
  state.contactMoreOpen = false
  if (state.dataSource !== 'remote') {
    showToast('\u6f14\u793a\u6570\u636e\u4e0d\u9700\u8981\u540c\u6b65')
    return
  }
  state.contactRefreshing = true
  render()
  try {
    const result = await fetchDesktopContacts()
    contacts = Array.isArray(result?.list)
      ? result.list.filter((item) => !isDesktopFileTransferAssistant(item)).map(mapRemoteContact)
      : []
    showToast('\u8054\u7cfb\u4eba\u5df2\u5237\u65b0\uff0c\u5171 ' + contacts.length + ' \u4f4d')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '\u8054\u7cfb\u4eba\u5237\u65b0\u5931\u8d25')
  } finally {
    state.contactRefreshing = false
    render()
  }
}

function renderContactCard(item) {
  const tag = desktopContactTag(item)
  const birthday = String(item.birthday || '').trim()
  const signature = String(item.signature || '').trim()
  const profileDetails = [
    birthday ? `\u751f\u65e5\uff1a${birthday}` : '',
    signature,
  ].filter(Boolean)
  return '<button class="contact-card" data-action="open-contact" data-user-id="' + escapeHtml(contactUserId(item)) + '" data-contact-user-id="' + escapeHtml(contactUserId(item)) + '">' +
    '<span class="contact-card-head">' + avatar(item, 'avatar-medium') + '<i class="contact-status ' + (contactIsOnline(item) ? 'is-online' : '') + '"></i></span>' +
    '<span class="contact-card-body"><strong><span class="contact-name">' + escapeHtml(item.name || '') + '</span>' + renderDesktopFriendTag(tag, contactUserId(item) || item.name, 'contact-tag') + '</strong><small>' + escapeHtml(item.meta || '') + '</small>' + profileDetails.map((detail) => '<small class="contact-card-detail">' + escapeHtml(detail) + '</small>').join('') + '</span>' +
    '<span class="contact-card-arrow">' + icon('arrow') + '</span></button>'
}

function renderContacts() {
  const query = state.contactQuery.trim().toLowerCase()
  const filteredContacts = contacts.filter((item) => {
    if (state.contactOnlineOnly && !contactIsOnline(item)) return false
    if (!query) return true
    /*
    return \`${item.name || ''} ${item.meta || ''} ${item.tag || ''}\`.toLowerCase().includes(query)
    */
    return [item.name || '', item.meta || '', item.tag || '', item.birthday || '', item.signature || ''].join(' ').toLowerCase().includes(query)
  })
  const onlineCount = contacts.filter(contactIsOnline).length
  /*
  const contactCards = filteredContacts.length
    ? filteredContacts.map((item) => \`<button class="contact-card" data-action="open-contact" data-user-id="${escapeHtml(contactUserId(item))}"><span class="contact-card-head">${avatar(item, 'avatar-medium')}<i class="contact-status ${contactIsOnline(item) ? 'is-online' : ''}"></i></span><span class="contact-card-body"><strong>${item.name}</strong><small>${item.meta}</small><span class="contact-tag">${item.tag}</span></span><span class="contact-card-arrow">${icon('arrow')}</span></button>\`).join('')
    : '<div class="contacts-empty"><strong>\u6ca1\u6709\u627e\u5230\u5339\u914d\u7684\u8054\u7cfb\u4eba</strong><small>\u8bd5\u8bd5\u66f4\u6362\u641c\u7d22\u8bcd\uff0c\u6216\u5173\u95ed\u201c\u53ea\u770b\u5728\u7ebf\u8054\u7cfb\u4eba\u201d\u3002</small></div>'
  */
  const contactCards = filteredContacts.length
    ? filteredContacts.map(renderContactCard).join('')
    : '<div class="contacts-empty"><strong>\u6ca1\u6709\u627e\u5230\u5339\u914d\u7684\u8054\u7cfb\u4eba</strong><small>\u8bd5\u8bd5\u66f4\u6362\u641c\u7d22\u8bcd\uff0c\u6216\u5173\u95ed\u201c\u53ea\u770b\u5728\u7ebf\u8054\u7cfb\u4eba\u201d\u3002</small></div>'
  return '<section class="page page-contacts">' +
    pageHeading('\u4fdd\u6301\u8fde\u63a5', '\u8054\u7cfb\u4eba', '\u627e\u5230\u4f60\u8ba4\u8bc6\u7684\u4eba\uff0c\u4e5f\u53d1\u73b0\u65b0\u7684\u8fde\u63a5\u3002', button('\u6dfb\u52a0\u8054\u7cfb\u4eba', 'add-contact', 'primary', 'plus')) +
    '<div class="contact-toolbar">' +
      '<label class="wide-search">' + icon('search') + '<input id="contact-search" value="' + escapeHtml(state.contactQuery) + '" placeholder="\u641c\u7d22\u59d3\u540d\u6216 Pulse ID" /></label>' +
      '<div class="toolbar-meta"><span><i class="online-dot"></i> ' + onlineCount + ' \u4f4d\u8054\u7cfb\u4eba\u5728\u7ebf</span>' +
        '<span class="contact-more-wrap"><button type="button" class="subtle-icon-btn" data-action="toggle-contact-more" data-contact-more-toggle aria-haspopup="menu" aria-expanded="' + String(state.contactMoreOpen) + '" aria-label="\u66f4\u591a\u8054\u7cfb\u4eba\u64cd\u4f5c" title="\u66f4\u591a\u8054\u7cfb\u4eba\u64cd\u4f5c">' + icon('more') + '</button>' +
        (state.contactMoreOpen ? renderContactMoreMenu() : '') + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="quick-actions">' +
      '<button data-action="new-friends"><span class="quick-icon quick-blue">' + icon('contacts') + '</span><span><strong>\u65b0\u7684\u670b\u53cb</strong><small data-quick-notification-summary="friends">' + contactNotificationSummary(state.friendPendingCount, '\u597d\u53cb\u7533\u8bf7') + '</small></span>' + (state.friendPendingCount ? '<i class="quick-action-badge">' + (state.friendPendingCount > 99 ? '99+' : state.friendPendingCount) + '</i>' : '') + icon('arrow') + '</button>' +
      '<button data-action="group-notifications"><span class="quick-icon quick-blue">' + icon('bell') + '</span><span><strong>\u7fa4\u901a\u77e5</strong><small data-quick-notification-summary="groups">' + contactNotificationSummary(state.groupPendingCount, '\u7fa4\u901a\u77e5') + '</small></span>' + (state.groupPendingCount ? '<i class="quick-action-badge">' + (state.groupPendingCount > 99 ? '99+' : state.groupPendingCount) + '</i>' : '') + icon('arrow') + '</button>' +
      '<button data-action="groups"><span class="quick-icon quick-violet">' + icon('group') + '</span><span><strong>\u67e5\u770b\u7fa4\u804a\u5217\u8868</strong><small>\u67e5\u770b\u6240\u6709\u7fa4\u804a\u4f1a\u8bdd</small></span>' + icon('arrow') + '</button>' +
    '</div>' +
    '<div class="section-title-row"><div><h2>\u6211\u7684\u8054\u7cfb\u4eba</h2><span>\u5171 ' + contacts.length + ' \u4f4d\u8054\u7cfb\u4eba</span></div><div class="view-switch" role="group" aria-label="\u8054\u7cfb\u4eba\u663e\u793a\u65b9\u5f0f">' +
      '<button class="' + (state.contactView === 'grid' ? 'active' : '') + '" data-contact-view="grid" aria-label="\u5361\u7247\u89c6\u56fe" title="\u5361\u7247\u89c6\u56fe">' + icon('grid') + '</button>' +
      '<button class="' + (state.contactView === 'list' ? 'active' : '') + '" data-contact-view="list" aria-label="\u5217\u8868\u89c6\u56fe" title="\u5217\u8868\u89c6\u56fe">' + icon('contacts') + '</button>' +
    '</div></div>' +
    '<div class="contacts-grid ' + (state.contactView === 'list' ? 'is-list' : '') + (state.contactOnlineOnly ? ' is-online-only' : '') + '">' + contactCards + '</div>' +
  '</section>'
  return `<section class="page page-contacts">
    ${pageHeading('保持连接', '联系人', '找到你认识的人，也发现新的连接。', `${button('添加联系人', 'add-contact', 'primary', 'plus')}`)}
    <div class="contact-toolbar"><label class="wide-search">${icon('search')}<input id="contact-search" value="${escapeHtml(state.contactQuery)}" placeholder="搜索姓名或 Pulse ID" /></label><div class="toolbar-meta"><span><i class="online-dot"></i> 8 位联系人在线</span><button class="subtle-icon-btn">${icon('more')}</button></div></div>
    <div class="quick-actions"><button data-action="new-friends"><span class="quick-icon quick-blue">${icon('contacts')}</span><span><strong>新的朋友</strong><small data-quick-notification-summary="friends">${contactNotificationSummary(state.friendPendingCount, '好友申请')}</small></span>${state.friendPendingCount ? `<i class="quick-action-badge">${state.friendPendingCount > 99 ? '99+' : state.friendPendingCount}</i>` : ''}${icon('arrow')}</button><button data-action="group-notifications"><span class="quick-icon quick-blue">${icon('bell')}</span><span><strong>群通知</strong><small data-quick-notification-summary="groups">${contactNotificationSummary(state.groupPendingCount, '群通知')}</small></span>${state.groupPendingCount ? `<i class="quick-action-badge">${state.groupPendingCount > 99 ? '99+' : state.groupPendingCount}</i>` : ''}${icon('arrow')}</button><button data-action="groups"><span class="quick-icon quick-violet">${icon('group')}</span><span><strong>查看群聊列表</strong><small>查看所有群聊会话</small></span>${icon('arrow')}</button></div>
    <div class="section-title-row"><div><h2>我的联系人</h2><span>共 ${contacts.length} 位联系人</span></div><div class="view-switch" role="group" aria-label="联系人显示方式"><button class="${state.contactView === 'grid' ? 'active' : ''}" data-contact-view="grid" aria-label="卡片视图" title="卡片视图">${icon('grid')}</button><button class="${state.contactView === 'list' ? 'active' : ''}" data-contact-view="list" aria-label="列表视图" title="列表视图">${icon('contacts')}</button></div></div>
    <div class="contacts-grid ${state.contactView === 'list' ? 'is-list' : ''}">${contacts.filter((item) => !state.contactQuery.trim() || item.name.includes(state.contactQuery.trim()) || item.meta.includes(state.contactQuery.trim())).map((item) => `<button class="contact-card" data-action="open-contact" data-user-id="${escapeHtml(contactUserId(item))}" data-contact-user-id="${escapeHtml(contactUserId(item))}"><span class="contact-card-head">${avatar(item, 'avatar-medium')}<i class="contact-status ${item.status === '在线' ? 'is-online' : ''}"></i></span><span class="contact-card-body"><strong>${item.name}</strong><small>${item.meta}</small><span class="contact-tag">${item.tag}</span></span><span class="contact-card-arrow">${icon('arrow')}</span></button>`).join('')}</div>
  </section>`
}

function renderDiscover() {
  const friendProfile = state.friendMomentsProfile
  const items = state.moments
  const rangeLabels = { 0: '好友可见', 1: '仅自己', 2: '部分可见' }
  const mediaMarkup = (item) => {
    const media = (item.images || []).slice(0, 9)
    if (!media.length) return ''
    return `<div class="desktop-moment-media ${media.length === 1 ? 'single' : ''}">${media.map((url, index) => {
      const type = momentMediaType(item, index, url)
      return desktopMomentMediaMarkup(url, type, type === 'video' ? '朋友圈视频' : '朋友圈图片', item.originalImages?.[index] || '', item.mediaFileIds?.[index] || '')
    }).join('')}</div>`
  }
  const commentMarkup = (item) => {
    const comments = (item.comments || []).slice(-4)
    const list = comments.map((comment) => {
      const reply = comment.replyToNickname
        ? ` <span class="desktop-moment-comment-reply">回复 ${escapeHtml(comment.replyToNickname)}</span>`
        : ''
      return `<div class="desktop-moment-comment"><div class="desktop-moment-comment-main"><strong>${escapeHtml(comment.nickname || '用户')}</strong>${reply}<span>${escapeHtml(comment.content || '')}</span></div><button type="button" class="desktop-moment-comment-reply-btn" data-moment-comment-reply="${escapeHtml(comment.id)}" data-moment-comment-name="${escapeHtml(comment.nickname || '用户')}" data-moment-comment-reply-moment="${escapeHtml(item.id)}">回复</button></div>`
    }).join('')
    // 评论列表默认展示；输入框在点击"评论"按钮后才展开。
    const commentBoxOpen = state.momentCommentOpenId === String(item.id)
    const placeholder = state.momentReplyNickname ? `回复 @${state.momentReplyNickname}` : '说点什么…'
    const submitLabel = state.momentReplyNickname ? '回复' : '发送'
    const form = commentBoxOpen
      ? `<form data-moment-comment-form data-moment-id="${escapeHtml(item.id)}"><input data-moment-comment-input placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(state.momentCommentText)}" maxlength="500" /><button class="btn btn-primary" type="submit">${submitLabel}</button></form>`
      : ''
    return `<div class="desktop-moment-comments">${list || '<span class="desktop-moment-comments-empty">还没有评论，来留下第一条吧。</span>'}${form}</div>`
  }
  const feed = state.momentsLoading
    ? '<div class="desktop-moments-state">正在加载朋友圈…</div>'
    : state.momentsError
      ? `<div class="desktop-moments-state"><strong>朋友圈暂时无法加载</strong><span>${escapeHtml(state.momentsError)}</span></div>`
      : items.length
        ? items.map((item) => {
          const tone = item.tone || ['blue', 'violet', 'orange', 'green', 'cyan', 'pink'][Number(item.userId || 0) % 6]
          const profile = { ...item, name: item.nickname, initials: item.nickname?.slice(0, 1), tone }
          const authorAvatar = item.userId && !momentIsMine(item)
            ? `<button type="button" class="desktop-moment-avatar-link" data-view-contact="${escapeHtml(item.userId)}" aria-label="查看${escapeHtml(item.nickname || '好友')}资料">${avatar(profile, 'avatar-medium')}</button>`
            : avatar(profile, 'avatar-medium')
          const visibility = momentVisibilityLabel(item.visibility)
          return `<article class="desktop-moment-card" data-moment-card="${escapeHtml(item.id)}">
            <div class="desktop-moment-head">${authorAvatar}<div class="desktop-moment-author"><strong>${escapeHtml(item.nickname || '用户')}</strong><span>${escapeHtml(momentTime(item.createdAt))}${item.locationName ? ` · ${escapeHtml(item.locationName)}` : ''}</span></div>${momentIsMine(item) ? `<button class="subtle-icon-btn" data-moment-delete="${escapeHtml(item.id)}" title="删除动态">${icon('more')}</button>` : ''}</div>
            ${item.content ? `<p class="desktop-moment-copy">${escapeHtml(item.content)}</p>` : ''}
            ${visibility ? `<span class="desktop-moment-visibility">${rangeLabels[item.visibility] || visibility}</span>` : ''}
             ${mediaMarkup(item)}
             <div class="desktop-moment-detail-link"><button class="desktop-moment-action" data-moment-detail="${escapeHtml(item.id)}">\u8be6\u60c5</button></div>
            <div class="desktop-moment-foot"><span>${escapeHtml(momentTime(item.createdAt))}</span><div><button class="desktop-moment-action ${item.likedByMe ? 'liked' : ''}" data-moment-like="${escapeHtml(item.id)}">♡ <b>${Number(item.likeCount || 0)}</b></button><button class="desktop-moment-action" data-moment-comment-toggle="${escapeHtml(item.id)}">◌ <b>${Number(item.commentCount || 0)}</b></button></div></div>
            ${item.likeNicknames?.length ? `<div class="desktop-moment-likes">♡ ${item.likeNicknames.slice(0, 5).map((name) => escapeHtml(name)).join('、')}</div>` : ''}
            ${commentMarkup(item)}
          </article>`
        }).join('')
        : '<div class="desktop-moments-state"><strong>还没有朋友圈动态</strong><span>发布第一条动态，和朋友分享此刻。</span></div>'

  const friendName = String(friendProfile?.displayName || friendProfile?.remark || friendProfile?.nickname || '好友').trim() || '好友'
  const heading = friendProfile
    ? pageHeading('好友朋友圈', `${escapeHtml(friendName)}的朋友圈`, `查看${escapeHtml(friendName)}公开的动态内容。`, button('返回消息', 'navigate-back', 'secondary', 'arrow'))
    : pageHeading('和朋友分享此刻', '朋友圈', '发布动态、查看朋友近况，并管理每条内容的可见范围。')
  const composer = friendProfile
    ? `<section class="desktop-friend-moments-header">${avatar({ ...friendProfile, name: friendName, initials: friendName.slice(0, 1), tone: 'blue' }, 'avatar-medium')}<div><strong>${escapeHtml(friendName)}的朋友圈</strong><span>仅显示对方允许你查看的公开动态</span></div></section>`
    : `<section class="desktop-moment-composer">
          <div class="desktop-moment-composer-head">${avatar({ initials: state.profile.nickname?.slice(0, 1) || '我', tone: 'blue', avatarUrl: state.profile.avatarUrl }, 'avatar-medium')}<div><strong>分享新动态</strong><span>这一刻，想和朋友说点什么？</span></div></div>
          <form data-moment-form><textarea data-moment-content maxlength="1000" placeholder="记录你的想法…">${escapeHtml(state.momentDraftText)}</textarea><div class="desktop-moment-composer-foot"><div class="desktop-moment-compose-tools"><label class="moment-file-label">${icon('image')} 添加图片/视频<input id="desktop-moment-files" type="file" accept="image/*,video/*" multiple /></label><button type="button" class="moment-location-button" data-action="moment-location-picker" title="添加位置">${icon('location')} <span>${escapeHtml(state.momentLocation?.name || '所在位置')}</span></button><select data-moment-visibility aria-label="动态可见范围"><option value="0" ${Number(state.momentVisibility) === 0 ? 'selected' : ''}>好友可见</option><option value="1" ${Number(state.momentVisibility) === 1 ? 'selected' : ''}>仅自己</option><option value="2" ${Number(state.momentVisibility) === 2 ? 'selected' : ''}>部分可见</option></select></div><div class="desktop-moment-publish-actions"><button type="button" class="btn" data-moment-save-draft title="保存为草稿，下次进入自动恢复">${icon('save')} 存草稿</button><button class="btn btn-primary" type="submit" ${state.momentPublishBusy ? 'disabled' : ''}>${state.momentPublishBusy ? '发布中…' : '发布'} ${icon('send')}</button></div></div><div class="desktop-moment-visibility-preview"><span>${icon('eye')}</span><div><strong>可见范围预览</strong><small>${Number(state.momentVisibility) === 1 ? '仅自己可见' : Number(state.momentVisibility) === 2 ? `部分可见 · ${escapeHtml(momentVisiblePreviewLabel())}` : '发布后好友可以看到这条动态'}</small></div></div>${renderDesktopMomentComposePreviews()}</form>
        </section>`
  return `<section class="page page-moments page-discover">
    ${heading}
    <div class="desktop-moments-layout">
      <div class="desktop-moments-main">
        ${composer}
        ${friendProfile ? '' : renderDesktopMomentReminderCard()}
        <div class="desktop-moments-feed">${feed}</div>
      </div>
    </div>
  </section>`
}

function renderSettingsLegacy() {
  const profile = state.profile
  return `<section class="page page-settings ${profileEditing ? 'is-profile-editing' : ''}">
    ${pageHeading('管理你的 Pulse', '个人中心', '资料、偏好与安全设置都在这里。', `${button('编辑资料', 'edit-profile', 'secondary', 'edit')}`)}
    <div class="settings-layout"><aside class="settings-menu"><div class="settings-profile-mini">${avatar({ initials: profile.nickname?.slice(0, 1) || '我', tone: 'blue', avatarUrl: profile.avatarUrl }, 'avatar-medium')}<div><strong>${escapeHtml(profile.nickname || '当前账户')}</strong><small>PulseID ${escapeHtml(profile.pulseId || profile.userId || '-')}</small></div>${icon('arrow')}</div><div class="settings-menu-label">账户</div><button class="settings-nav active">${icon('person')}个人资料</button><button class="settings-nav">${icon('bell')}消息通知<span class="setting-dot"></span></button><button class="settings-nav">${icon('shield')}账号与安全</button><div class="settings-menu-label">偏好</div><button class="settings-nav">${icon('chat')}聊天设置</button><button class="settings-nav">${icon('download')}存储空间</button><div class="settings-menu-label">其他</div><button class="settings-nav">${icon('help')}帮助与反馈</button></aside><div class="settings-content"><div class="settings-card profile-edit-card"><div class="settings-card-heading"><div><h2>个人资料</h2><p>这些信息会展示给你的联系人。</p></div><span class="privacy-pill">${icon('lock')} 仅联系人可见</span></div><div class="profile-edit-main">${avatar({ initials: profile.nickname?.slice(0, 1) || '我', tone: 'blue', avatarUrl: profile.avatarUrl }, 'avatar-xl')}<div><h3>${escapeHtml(profile.nickname || '当前账户')}</h3><p>${escapeHtml(profile.signature || '暂无个性签名')}</p><button class="text-button" data-action="change-avatar">更换头像 ${icon('arrow')}</button></div></div><form class="form-grid" data-profile-form><label><span>昵称</span><input name="nickname" value="${escapeHtml(profile.nickname || '')}" /></label><label><span>Pulse ID</span><input value="${escapeHtml(profile.pulseId || profile.userId || '')}" disabled /></label><label class="full"><span>个性签名</span><input name="signature" value="${escapeHtml(profile.signature || '')}" /></label><button class="btn btn-primary" type="submit">保存资料 ${icon('check')}</button></form></div><div class="settings-card session-card"><div class="settings-card-heading"><div><h2>已登录设备</h2><p>你可以在这里查看最近的登录设备。</p></div><span class="safe-label">${icon('shield')} 账户安全</span></div><div class="device-row"><span class="device-icon">${icon('grid')}</span><span><strong>Windows 客户端 · 本设备</strong><small>本地桌面 · 刚刚活跃</small></span><i class="device-current">当前设备</i><button>${icon('more')}</button></div><div class="device-row"><span class="device-icon">${icon('person')}</span><span><strong>其他设备</strong><small>由移动端同步的登录会话</small></span><button>${icon('more')}</button></div></div><button class="logout-button" data-action="logout">退出当前账户</button></div></div>
  </section>`
}

function privacySwitch(key, label, description = '') {
  const checked = Boolean(state.privacySettings[key])
  return `<div class="desktop-privacy-row"><div><strong>${label}</strong>${description ? `<small>${description}</small>` : ''}</div><label class="desktop-switch"><input type="checkbox" data-privacy-toggle="${key}" ${checked ? 'checked' : ''} ${state.privacySaving || state.privacyLoading ? 'disabled' : ''} /><i></i></label></div>`
}

function renderFriendPermissionSettings() {
  const privacy = state.privacySettings
  const rangeLabels = { all: '全部', half_year: '最近半年', month: '最近一个月', three_days: '最近三天' }
  if (state.privacyLoading && !state.privacyLoaded) {
    return `<section class="settings-card friend-permission-card"><div class="desktop-moments-state">正在加载朋友权限…</div></section>`
  }
  return `<section class="settings-card friend-permission-card">
    <div class="settings-card-heading"><div><h2>朋友权限</h2><p>管理添加你、搜索你，以及朋友圈内容的可见范围。</p></div><span class="privacy-pill">${icon('lock')} 仅自己可见</span></div>
    ${state.privacyError ? `<div class="login-error">${escapeHtml(state.privacyError)}</div>` : ''}
    <div class="desktop-privacy-section"><h3>好友与群聊</h3>${privacySwitch('friendVerifyRequired', '加我为好友时需要验证', '关闭后，对方添加你将直接成为好友')}${privacySwitch('groupInviteVerify', '拉我入群时需要验证', '开启后，好友邀请你进群需你确认')}</div>
    <div class="desktop-privacy-section"><h3>在线状态与已读回执</h3>${privacySwitch('hideOnlineStatus', '隐藏我的在线状态', '开启后，你也无法查看好友的在线状态')}${privacySwitch('readReceiptEnabled', '已读回执', '关闭后，双方都看不到对方是否已读，群聊同样生效')}</div>
    <div class="desktop-privacy-section"><h3>添加我的方式</h3>${privacySwitch('addByPhone', '手机号')}${privacySwitch('addByPulseId', 'Pulse ID')}${privacySwitch('addByGroup', '群聊')}${privacySwitch('addByQrcode', '我的二维码')}${privacySwitch('addByCard', '名片')}${privacySwitch('addByDeletedChat', '删除的联系人保留的聊天', '对方可通过仍保留的私聊记录再次添加你')}</div>
    <div class="desktop-privacy-section"><h3>可通过以下方式搜索到我</h3>${privacySwitch('searchByPhone', '手机号')}${privacySwitch('searchByPulseId', 'Pulse ID')}</div>
    <div class="desktop-privacy-section"><h3>朋友圈权限</h3>
      <button class="desktop-privacy-link" data-privacy-list="reject"><span><strong>不让他（她）看</strong><small>不让指定好友查看我的朋友圈</small></span><b>管理名单 ${icon('arrow')}</b></button>
      <button class="desktop-privacy-link" data-privacy-list="hide"><span><strong>不看他（她）</strong><small>不看指定好友的朋友圈</small></span><b>管理名单 ${icon('arrow')}</b></button>
      <label class="desktop-privacy-select"><span><strong>允许朋友查看朋友圈的范围</strong><small>当前：${rangeLabels[privacy.momentsVisibleRange] || '全部'}</small></span><select data-privacy-range ${state.privacySaving ? 'disabled' : ''}><option value="all" ${privacy.momentsVisibleRange === 'all' ? 'selected' : ''}>全部</option><option value="half_year" ${privacy.momentsVisibleRange === 'half_year' ? 'selected' : ''}>最近半年</option><option value="month" ${privacy.momentsVisibleRange === 'month' ? 'selected' : ''}>最近一个月</option><option value="three_days" ${privacy.momentsVisibleRange === 'three_days' ? 'selected' : ''}>最近三天</option></select></label>
      ${privacySwitch('momentsStrangerTen', '允许陌生人查看十条朋友圈', '非好友打开你的朋友圈时可看最近十条')}
    </div>
  </section>`
}

function formatDesktopBytes(bytes) {
  const value = Number(bytes || 0)
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const unit = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  const amount = value / (1024 ** unit)
  return `${amount >= 10 || unit === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unit]}`
}

function renderDesktopAccountSecurityPage() {
  const security = state.accountSecurity || {}
  const lockConfigured = desktopHasLockScreenPassword()
  const devices = displayDesktopDeviceSessions()
  const otherDevices = devices.filter((device) => !isCurrentDesktopDevice(device)).length
  const status = state.accountSecurityLoading ? '检查中' : security.securityCodeEnabled ? '保护中' : '建议开启'
  const code = security.securityCode
    ? state.securityCodeVisible ? security.securityCode : '••••••'
    : '未生成'
  return `<section class="page page-settings desktop-subpage page-account-security">
    ${pageHeading('账户安全', '账号与安全', '管理绑定手机号、登录设备和账号安全码。', button('返回个人资料', 'edit-profile', 'secondary', 'arrow'))}
    ${state.accountSecurityError ? `<div class="login-error">${escapeHtml(state.accountSecurityError)}</div>` : ''}
    <div class="desktop-security-hero"><span class="desktop-security-icon">${icon('shield')}</span><div><strong>账号保护</strong><p>${security.securityCodeEnabled ? '安全码已开启，陌生设备登录会受到保护。' : '开启安全码，进一步保护账号登录安全。'}</p></div><b class="desktop-security-status ${security.securityCodeEnabled ? 'is-enabled' : ''}">${status}</b></div>
    <section class="settings-card desktop-security-phone"><div class="settings-card-heading"><div><h2>当前绑定手机号</h2><p>手机号用于登录、找回密码和身份验证。</p></div><span class="safe-label">${icon('phone')} ${escapeHtml(maskDesktopPhone(security.phone || state.profile.phone))}</span></div><div class="desktop-security-actions"><button type="button" class="btn" data-action="change-phone">修改手机号</button><button type="button" class="btn" data-action="change-password">修改密码</button></div></section>
    <section class="settings-card session-card"><div class="settings-card-heading"><div><h2>已登录设备 <span class="desktop-count-pill">${devices.length}</span></h2><p>${otherDevices ? `还有 ${otherDevices} 台设备登录` : '当前仅此设备登录'}</p></div><span class="safe-label">${icon('shield')} 账户安全</span></div>${renderDeviceRows()}${otherDevices ? '<button type="button" class="device-logout-others" data-device-logout-others>退出其他设备</button>' : ''}</section>
    <section class="settings-card desktop-security-code-card"><div class="settings-card-heading"><div><h2>账号安全码</h2><p>开启后，未验证过的其他设备登录时需要输入安全码。</p></div><label class="desktop-switch"><input type="checkbox" data-security-code-toggle ${security.securityCodeEnabled ? 'checked' : ''} ${state.securityCodeBusy ? 'disabled' : ''} /><i></i></label></div>${security.securityCodeEnabled ? `<div class="desktop-security-code-value"><strong>${escapeHtml(code)}</strong><button type="button" class="subtle-icon-btn" data-security-code-visibility title="${state.securityCodeVisible ? '隐藏安全码' : '显示安全码'}">${icon(state.securityCodeVisible ? 'close' : 'shield')}</button></div><div class="desktop-security-code-actions"><button type="button" class="btn" data-security-code-copy ${security.securityCode ? '' : 'disabled'}>复制安全码</button><button type="button" class="btn btn-primary" data-security-code-refresh ${state.securityCodeBusy ? 'disabled' : ''}>${state.securityCodeBusy ? '更新中…' : '更新安全码'}</button></div><small class="desktop-settings-note">更新后，其他设备需要使用新的安全码重新验证。</small>` : '<div class="desktop-settings-note">安全码关闭中，建议开启以保护陌生设备登录。</div>'}</section>
     <section class="settings-card desktop-lock-password-card"><div class="settings-card-heading"><div><h2>锁屏密码</h2><p>${lockConfigured ? '已设置锁屏密码，点击顶部锁定按钮即可锁定电脑端。退出登录不会删除设置；卸载重装后本机锁屏密码会清除，需要重新设置。' : '设置锁屏密码后，可从顶部快速锁定电脑端。密码仅保存在本机。'}</p></div><span class="safe-label">${icon(lockConfigured ? 'lock' : 'lock-open')} ${lockConfigured ? '已设置' : '未设置'}</span></div><div class="desktop-security-actions"><button type="button" class="btn ${lockConfigured ? '' : 'btn-primary'}" data-action="lock-password-settings">${lockConfigured ? '修改锁屏密码' : '设置锁屏密码'}</button>${lockConfigured ? '<button type="button" class="btn btn-danger" data-action="lock-password-disable">关闭密码</button>' : ''}</div></section>
      <section class="settings-card desktop-account-deletion-card"><div><h2>注销账号</h2><p>注销前会显示钱包余额，余额大于 0 也可以注销，但余额将无法找回。注销后账号资料和相关数据将无法恢复。</p></div><button type="button" class="btn btn-danger" data-action="delete-account">注销账号</button></section>
  </section>`
}

function renderDesktopStoragePage() {
  const usage = state.storageUsage || { local: 0, cache: 0, total: 0, quota: 0, image: 0, video: 0, file: 0, audio: 0 }
  return `<section class="page page-settings desktop-subpage page-storage"><div class="page-heading"><div><div class="eyebrow">本机数据</div><h1>存储空间</h1><p>只统计并清理 PulseIM 聊天附件缓存，不会删除消息记录。</p></div><div class="heading-actions"><button class="btn btn-secondary" data-action="edit-profile">${icon('arrow')}<span>返回个人资料</span></button></div></div>${state.storageError ? `<div class="login-error">${escapeHtml(state.storageError)}</div>` : ''}<section class="storage-summary-card"><div class="storage-summary-icon">${icon('download')}</div><div><small>聊天缓存</small><strong>${state.storageLoading ? '计算中…' : formatDesktopBytes(usage.total)}</strong><span>${state.storageUpdatedAt ? `最近扫描 ${escapeHtml(state.storageUpdatedAt)}` : '尚未扫描'}</span></div><b>${usage.quota ? `配额 ${formatDesktopBytes(usage.quota)}` : '当前环境估算'}</b></section><div class="storage-breakdown"><section class="settings-card"><span class="storage-card-icon">${icon('image')}</span><div><strong>图片</strong><p>缩略图、普通预览和原图缓存。</p></div><b>${formatDesktopBytes(usage.image)}</b><button type="button" class="btn btn-secondary storage-clear-kind" data-storage-clear-kind="image" ${state.storageLoading ? 'disabled' : ''}>清理图片</button></section><section class="settings-card"><span class="storage-card-icon">${icon('video')}</span><div><strong>视频</strong><p>封面、压缩视频和原视频缓存。</p></div><b>${formatDesktopBytes(usage.video)}</b><button type="button" class="btn btn-secondary storage-clear-kind" data-storage-clear-kind="video" ${state.storageLoading ? 'disabled' : ''}>清理视频</button></section><section class="settings-card"><span class="storage-card-icon">${icon('folder')}</span><div><strong>文件</strong><p>PDF、Office、压缩包等缓存。</p></div><b>${formatDesktopBytes(usage.file)}</b><button type="button" class="btn btn-secondary storage-clear-kind" data-storage-clear-kind="file" ${state.storageLoading ? 'disabled' : ''}>清理文件</button></section><section class="settings-card"><span class="storage-card-icon">${icon('mic')}</span><div><strong>音频</strong><p>聊天语音缓存。</p></div><b>${formatDesktopBytes(usage.audio)}</b><button type="button" class="btn btn-secondary storage-clear-kind" data-storage-clear-kind="audio" ${state.storageLoading ? 'disabled' : ''}>清理音频</button></section></div><section class="settings-card storage-note-card"><div><h2>清理说明</h2><p>清理只删除当前电脑的聊天缓存；消息、fileId、服务器对象、收藏/转发引用和另存为文件均保留。</p></div><button type="button" class="btn btn-danger" data-storage-clear ${state.storageLoading ? 'disabled' : ''}>${icon('close')}清除全部聊天缓存</button></section></section>`
}

function renderDesktopHelpPage() {
  const keyword = String(state.helpQuery || '').trim().toLowerCase()
  const questions = (state.helpQuestions || []).filter((item) => !keyword || [item.question, item.answer, item.category].some((value) => String(value || '').toLowerCase().includes(keyword)))
  return `<section class="page page-settings desktop-subpage page-help"><div class="page-heading"><div><div class="eyebrow">支持中心</div><h1>帮助与反馈</h1><p>先查找常见问题，找不到答案时可以直接告诉我们。</p></div><div class="heading-actions"><button class="btn btn-secondary" data-action="edit-profile">${icon('arrow')}<span>返回个人资料</span></button></div></div><div class="help-layout"><section class="settings-card help-faq-card"><div class="settings-card-heading"><div><h2>常见问题</h2><p>搜索关键词快速找到答案。</p></div></div><label class="desktop-help-search">${icon('search')}<input type="search" data-help-query value="${escapeHtml(state.helpQuery)}" placeholder="搜索问题关键词" /></label>${state.helpError ? `<div class="login-error">${escapeHtml(state.helpError)}</div>` : ''}${state.helpLoading ? '<div class="desktop-modal-hint">正在加载帮助内容…</div>' : questions.length ? `<div class="desktop-faq-list">${questions.map((item) => `<details><summary>${item.category ? `<span>${escapeHtml(item.category)}</span>` : ''}<strong>${escapeHtml(item.question)}</strong>${icon('arrow')}</summary><p>${escapeHtml(item.answer || '暂无详细回答')}</p></details>`).join('')}</div>` : '<div class="desktop-modal-empty">没有找到匹配的问题</div>'}</section><section class="settings-card help-feedback-card"><div class="settings-card-heading"><div><h2>提交反馈</h2><p>描述越详细，我们越容易定位和解决问题。</p></div><span class="privacy-pill">${icon('lock')} 仅用于改进产品</span></div><textarea data-feedback-content maxlength="1000" placeholder="请详细描述遇到的问题或建议">${escapeHtml(state.feedbackContent)}</textarea><div class="feedback-form-footer"><small>${String(state.feedbackContent || '').length}/1000</small><button type="button" class="btn btn-primary" data-submit-feedback ${state.feedbackBusy ? 'disabled' : ''}>${state.feedbackBusy ? '提交中…' : '提交反馈'}</button></div></section></div></section>`
}

function renderSettings() {
  const profile = state.profile
  const initials = profile.nickname?.slice(0, 1) || '我'
  const profileEditing = Boolean(state.profileEditing)
  const profileDraft = state.profileDraft || profile
  if (state.settingsSection === 'account-security') return renderDesktopAccountSecurityPage()
  if (state.settingsSection === 'storage') return renderDesktopStoragePage()
  if (state.settingsSection === 'help') return renderDesktopHelpPage()
  if (state.settingsSection === 'friend-permission') {
    return `<section class="page page-settings page-friend-permission">
      ${pageHeading('我的设置', '朋友权限', '管理你的好友验证、添加方式和朋友圈可见范围。', button('返回个人资料', 'edit-profile', 'secondary', 'arrow'))}
      ${renderFriendPermissionSettings()}
    </section>`
  }
  const profileAction = profileEditing
    ? `<button class="btn btn-primary" type="submit" form="profile-form"><span>\u4fdd\u5b58\u8d44\u6599</span>${icon('check')}</button>`
    : button('\u7f16\u8f91\u8d44\u6599', 'start-edit-profile', 'secondary', 'edit')
  return `<section class="page page-settings">
    ${pageHeading('\u7ba1\u7406\u4f60\u7684 Pulse', '\u4e2a\u4eba\u4e2d\u5fc3', '\u8d44\u6599\u3001\u504f\u597d\u4e0e\u5b89\u5168\u8bbe\u7f6e\u90fd\u5728\u8fd9\u91cc\u3002', profileAction)}
    <div class="settings-layout">
      <div class="settings-sidebar">
      <aside class="settings-menu">
        <div class="settings-profile-mini" data-action="edit-profile">
          ${avatar({ initials, tone: 'blue', avatarUrl: profile.avatarUrl }, 'avatar-medium')}
          <div><strong>${escapeHtml(profile.nickname || '当前账户')}</strong><small>PulseID ${escapeHtml(profile.pulseId || profile.userId || '-')}</small></div>
          ${icon('arrow')}
        </div>
        <div class="settings-menu-label">\u8d26\u6237</div>
        <button type="button" class="settings-nav ${state.settingsSection === 'profile' ? 'active' : ''}" data-action="edit-profile">${icon('person')}\u4e2a\u4eba\u8d44\u6599</button>
        <button type="button" class="settings-nav" data-action="notifications">${icon('bell')}\u6d88\u606f\u901a\u77e5<span class="setting-dot"></span></button>
        <button type="button" class="settings-nav ${state.settingsSection === 'account-security' ? 'active' : ''}" data-action="account-security">${icon('shield')}\u8d26\u53f7\u4e0e\u5b89\u5168</button>
        <div class="settings-menu-label">\u504f\u597d</div>
        ${isDesktopWalletEnabled() ? `<button type="button" class="settings-nav" data-page="wallet">${icon('money')}我的钱包</button>` : ''}
        <button type="button" class="settings-nav" data-settings-section="friend-permission">${icon('group')}朋友权限</button>
        <button type="button" class="settings-nav ${state.settingsSection === 'storage' ? 'active' : ''}" data-action="storage">${icon('download')}\u5b58\u50a8\u7a7a\u95f4</button>
        <div class="settings-menu-label">\u5176\u4ed6</div>
         <button type="button" class="settings-nav ${state.settingsSection === 'help' ? 'active' : ''}" data-action="help">${icon('help')}\u5e2e\u52a9\u4e0e\u53cd\u9988</button>
       </aside>
        </div>
      <div class="settings-content">
        <div class="settings-card profile-edit-card">
          <div class="settings-card-heading"><div><h2>\u4e2a\u4eba\u8d44\u6599</h2><p>\u8fd9\u4e9b\u4fe1\u606f\u4f1a\u5c55\u793a\u7ed9\u4f60\u7684\u8054\u7cfb\u4eba\u3002</p></div><span class="privacy-pill">${icon('lock')} \u4ec5\u8054\u7cfb\u4eba\u53ef\u89c1</span></div>
          <div class="profile-edit-main">${avatar({ initials, tone: 'blue', avatarUrl: profile.avatarUrl }, 'avatar-xl')}<div><h3>${escapeHtml(profile.nickname || '当前账户')}</h3><p>${escapeHtml(profile.signature || '暂无个性签名')}</p><button type="button" class="text-button profile-avatar-button" data-action="change-avatar" ${state.profileAvatarUploading ? 'disabled aria-busy="true"' : ''}>${state.profileAvatarUploading ? '\u4e0a\u4f20\u4e2d\u2026' : '\u66f4\u6362\u5934\u50cf'} ${icon(state.profileAvatarUploading ? 'refresh' : 'arrow')}</button><small class="profile-avatar-hint">支持 JPG、PNG、WEBP，最大 20MB</small><input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/bmp" data-profile-avatar-input hidden ${state.profileAvatarUploading ? 'disabled' : ''} /></div></div>
           <form id="profile-form" class="form-grid" data-profile-form><label><span>\u6635\u79f0</span><input name="nickname" value="${escapeHtml(profileDraft.nickname || '')}" ${profileEditing ? '' : 'disabled'} /></label><label><span>Pulse ID</span><input value="${escapeHtml(profile.pulseId || profile.userId || '')}" disabled /></label><label class="full"><span>\u4e2a\u6027\u7b7e\u540d</span><input name="signature" value="${escapeHtml(profileDraft.signature || '')}" ${profileEditing ? '' : 'disabled'} /></label></form>
        </div>
         <div class="settings-card session-card">
            <div class="settings-card-heading"><div><h2>\u5df2\u767b\u5f55\u8bbe\u5907</h2><p>\u4f60\u53ef\u4ee5\u5728\u8fd9\u91cc\u67e5\u770b\u548c\u7ba1\u7406\u767b\u5f55\u4f1a\u8bdd\u3002</p></div><span class="safe-label">${icon('shield')} \u8d26\u6237\u5b89\u5168</span></div>
           ${renderDeviceRows()}
           ${displayDesktopDeviceSessions().some((device) => !isCurrentDesktopDevice(device)) ? '<button type="button" class="device-logout-others" data-device-logout-others>退出其他设备</button>' : ''}
         </div>
       </div>
    </div>
  </section>`
}

function renderFavorites() {
  return `<section class="page page-favorites">${pageHeading('稍后再看', '收藏', '把重要的消息、文件和动态留在这里。')}<div class="desktop-modal-empty">还没有收藏内容</div></section>`
}

function renderDesktopFavorites() {
  if (state.dataSource !== 'remote') return renderFavorites()
  const items = state.favorites
  const organizeLabel = state.favoriteOrganizing ? '完成整理' : '整理收藏'
  const body = state.favoritesLoading
    ? '<div class="desktop-modal-hint">正在加载收藏…</div>'
    : items.length
      ? `<div class="favorite-list">${items.map((item) => {
        const favoriteId = String(item.id)
        const preview = desktopFavoritePreview(item)
        const source = item.sourceTitle || item.fromNickname || '当前会话'
        const selected = state.favoriteSelection.has(favoriteId)
        return `<article class="favorite-item${state.favoriteOrganizing ? ' favorite-item-organizing' : ''}${selected ? ' favorite-item-selected' : ''}" data-favorite-open="${escapeHtml(favoriteId)}" data-favorite-selectable="${escapeHtml(favoriteId)}" tabindex="0" role="button" aria-selected="${selected ? 'true' : 'false'}">
          ${state.favoriteOrganizing ? `<button type="button" class="favorite-select-toggle${selected ? ' is-selected' : ''}" data-favorite-select="${escapeHtml(favoriteId)}" aria-label="${selected ? '取消选择' : '选择收藏'}" ${state.favoritesLoading ? 'disabled' : ''}>${selected ? icon('check') : ''}</button>` : ''}
          <span class="favorite-type type-message">${icon(desktopFavoriteIcon(item))}</span>
           <div><strong title="${escapeHtml(preview)}">${escapeHtml(preview)}</strong><p>来自 ${escapeHtml(source)} · ${desktopFavoriteTypeLabel(item)}</p></div>
          <time>${escapeHtml(formatRemoteTime(item.createdAt))}</time>
          ${state.favoriteOrganizing ? '' : `<button type="button" class="favorite-forward" data-favorite-forward-one="${escapeHtml(favoriteId)}" aria-label="转发收藏" title="转发收藏">${icon('share')}</button><button type="button" class="favorite-remove" data-favorite-delete="${escapeHtml(favoriteId)}" aria-label="取消收藏" title="取消收藏">${icon('close')}</button>`}
        </article>`
      }).join('')}</div>`
      : '<div class="desktop-modal-empty">还没有收藏内容</div>'
  const allSelected = items.length > 0 && items.every((item) => state.favoriteSelection.has(String(item.id)))
  const toolbar = state.favoriteOrganizing
    ? `<div class="favorite-organize-toolbar"><span>已选 ${state.favoriteSelection.size} 项</span><div><button type="button" class="btn btn-primary" data-favorite-forward-selected ${state.favoritesLoading || !state.favoriteSelection.size ? 'disabled' : ''}>${icon('share')} 转发</button><button type="button" class="btn" data-favorite-select-all ${state.favoritesLoading || !items.length ? 'disabled' : ''}>${allSelected ? '取消全选' : '全选'}</button><button type="button" class="btn btn-danger" data-favorite-delete-selected ${state.favoritesLoading || !state.favoriteSelection.size ? 'disabled' : ''}>删除选中</button></div></div>`
    : ''
  return `<section class="page page-favorites">${pageHeading('稍后再看', '收藏', '把重要的消息、文件和动态留在这里。', button(organizeLabel, 'organize', 'secondary', 'grid'))}<div class="favorite-summary"><div><span>${icon('bookmark')}</span><strong>${items.length}</strong><small>条收藏</small></div><div><span>${icon('folder')}</span><strong>${items.filter((item) => item.msgType === 2).length}</strong><small>个文件</small></div><div><span>${icon('chat')}</span><strong>${items.filter((item) => item.msgType !== 2).length}</strong><small>条消息</small></div></div>${body}${toolbar}</section>`
}

function renderFavoriteDetailModal() {
  if (state.favoriteDetailLoading) return modalFrame('收藏详情', '正在加载收藏的完整内容。', '<div class="desktop-modal-hint">正在加载收藏详情…</div>')
  if (state.modalError) return modalFrame('收藏详情', '收藏内容暂时无法打开。', `<div class="desktop-modal-empty"><div class="login-error">${escapeHtml(state.modalError)}</div></div>`)
  const item = state.favoriteDetail
  if (!item) return modalFrame('收藏详情', '收藏内容', '<div class="desktop-modal-empty">收藏内容不存在或已被删除。</div>')
  const source = item.sourceTitle || item.fromNickname || '当前会话'
  const message = { ...item, recalled: false }
  const isMoment = Number(item.msgType || 0) === 10
  const content = isMoment
    ? (renderDesktopFavoriteMomentContent(item) || `<div class="favorite-detail-text">${escapeHtml(desktopFavoritePreview(item))}</div>`)
    : (renderDesktopMessageContent(message) || `<div class="favorite-detail-text">${escapeHtml(desktopFavoritePreview(item))}</div>`)
  const body = `<div class="favorite-detail-body"><div class="favorite-detail-meta"><div><span>来源</span><strong>${escapeHtml(source)}</strong></div><div><span>类型</span><strong>${escapeHtml(desktopFavoriteTypeLabel(item))}</strong></div><div><span>收藏时间</span><strong>${escapeHtml(formatRemoteTime(item.createdAt) || '—')}</strong></div></div><div class="favorite-detail-content">${content}</div><div class="favorite-detail-actions"><button class="btn" type="button" data-modal-close>关闭</button>${isMoment ? '' : `<button class="btn" type="button" data-favorite-forward-detail="${escapeHtml(item.id)}">${icon('share')} 转发</button>`}<button class="btn btn-primary" type="button" data-favorite-open-conversation>${isMoment ? '打开朋友圈' : '打开原会话'} ${icon('arrow')}</button></div></div>`
  return modalFrame('收藏详情', '查看这条收藏的完整消息内容。', body)
}

function syncDesktopToastDom() {
  const root = desktopRenderRoot('toastRoot')
  if (!(root instanceof HTMLElement)) return
  const existing = root.querySelector('.toast')
  const message = String(state.toast || '')
  if (!message) {
    existing?.remove()
    return
  }

  const toast = existing instanceof HTMLElement ? existing : document.createElement('div')
  toast.className = 'toast'
  const dot = document.createElement('span')
  dot.className = 'toast-dot'
  toast.replaceChildren(dot, document.createTextNode(message))
  if (!existing) root.append(toast)
}

function handleDesktopAuthExpired(error) {
  if (!isDesktopAuthError(error)) return false
  clearDesktopSession()
  state.authenticated = false
  state.loading = false
  state.dataSource = 'error'
  state.loginView = 'login'
  state.loginMode = 'password'
  state.loginBusy = false
  state.loginSecurityCodeRequired = false
  state.loginSecurityCode = ''
  state.loginError = DESKTOP_AUTH_EXPIRED_MESSAGE
  state.loginNotice = ''
  state.messageMenu = null
  state.fileMenu = null
  state.momentMenu = null
  state.momentMediaMenu = null
  state.mediaActionBusy = ''
  stopDesktopWsConnection()
  state.toast = ''
  syncDesktopToastDom()
  requestDesktopRender()
  return true
}

function handleDesktopAuthExpiredEvent() {
  handleDesktopAuthExpired(new Error(DESKTOP_AUTH_EXPIRED_MESSAGE))
}

function showToast(message) {
  const text = String(message || '')
  if (text === '未登录或令牌无效' || text === DESKTOP_AUTH_EXPIRED_MESSAGE) {
    handleDesktopAuthExpired(new Error(text))
    return
  }
  state.toast = text
  syncDesktopToastDom()
  window.clearTimeout(showToast.timer)
  showToast.timer = window.setTimeout(() => {
    state.toast = ''
    syncDesktopToastDom()
  }, 2200)
}

function clearDesktopAvatarDraft() {
  if (state.profileAvatarPreviewUrl) URL.revokeObjectURL(state.profileAvatarPreviewUrl)
  state.profileAvatarFile = null
  state.profileAvatarPreviewUrl = ''
  state.profileAvatarOriginalUrl = ''
}

function discardDesktopAvatarDraft() {
  const hadPreview = Boolean(state.profileAvatarPreviewUrl)
  const originalUrl = state.profileAvatarOriginalUrl
  clearDesktopAvatarDraft()
  if (hadPreview) state.profile = { ...state.profile, avatarUrl: originalUrl }
}

function openDesktopAvatarPicker() {
  if (state.profileAvatarUploading) return
  if (state.dataSource !== 'remote') {
    showToast('请登录在线账户后上传头像')
    return
  }
  if (!state.profileEditing) {
    state.profileEditing = true
    state.profileDraft = { nickname: state.profile.nickname || '', signature: state.profile.signature || '' }
    render()
  }
  document.querySelector('[data-profile-avatar-input]')?.click()
}

async function compressDesktopAvatar(file) {
  if (!file.type.toLowerCase().startsWith('image/') || typeof createImageBitmap !== 'function') return file
  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file
  }
  const maxEdge = 1024
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    return file
  }
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
  if (!blob || blob.size >= file.size) return file
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'avatar'
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() })
}

async function handleDesktopAvatarSelected(event) {
  const input = event.currentTarget
  const file = input?.files?.[0]
  if (input) input.value = ''
  if (!file || state.profileAvatarUploading) return
  if (!file.type.toLowerCase().startsWith('image/')) {
    showToast('请选择图片文件')
    return
  }
  if (file.size > 20 * 1024 * 1024) {
    showToast('头像不能超过 20MB')
    return
  }

  if (state.profileAvatarPreviewUrl) URL.revokeObjectURL(state.profileAvatarPreviewUrl)
  const previousAvatarUrl = state.profileAvatarOriginalUrl || state.profile.avatarUrl || ''
  const previewUrl = URL.createObjectURL(file)
  state.profileAvatarOriginalUrl = previousAvatarUrl
  state.profileAvatarFile = file
  state.profileAvatarPreviewUrl = previewUrl
  state.profile = { ...state.profile, avatarUrl: previewUrl }
  render()
  showToast('头像已选择，请点击保存资料')
}

function startResetCountdown() {
  window.clearInterval(resetSmsTimer)
  state.resetCountdown = 60
  updateResetCodeButton()
  resetSmsTimer = window.setInterval(() => {
    state.resetCountdown -= 1
    if (state.resetCountdown <= 0) {
      state.resetCountdown = 0
      window.clearInterval(resetSmsTimer)
      resetSmsTimer = null
    }
    updateResetCodeButton()
  }, 1000)
}

function startRegisterCountdown() {
  window.clearInterval(registerSmsTimer)
  state.registerCountdown = 60
  updateRegisterCodeButton()
  registerSmsTimer = window.setInterval(() => {
    state.registerCountdown -= 1
    if (state.registerCountdown <= 0) {
      state.registerCountdown = 0
      window.clearInterval(registerSmsTimer)
      registerSmsTimer = null
    }
    updateRegisterCodeButton()
  }, 1000)
}

function stopRegisterCountdown() {
  window.clearInterval(registerSmsTimer)
  registerSmsTimer = null
  state.registerCountdown = 0
}

function updateRegisterCodeButton() {
  const button = document.querySelector('[data-action="send-register-code"]')
  if (!button) return
  button.textContent = state.registerCountdown > 0 ? `${state.registerCountdown}s 后重发` : '重新发送'
  button.disabled = state.registerCountdown > 0 || state.registerBusy
}

function registerDevNotice(result) {
  return result.devHint
    ? `验证码已发送（开发环境：${result.devHint.replace(/^.*?([0-9]{4,6}).*$/, '$1')}）`
    : '验证码已发送'
}

async function submitRegisterPhone(event) {
  event.preventDefault()
  if (!state.clientAccess.registerEnabled) {
    state.registerError = '电脑端注册已关闭'
    render()
    return
  }
  if (state.registerBusy) return
  const data = new FormData(event.currentTarget)
  const phone = String(data.get('registerPhone') || '').trim()
  state.registerPhone = phone
  state.registerError = ''
  state.registerNotice = ''
  if (!/^1\d{10}$/.test(phone)) {
    state.registerError = '请输入有效的 11 位手机号'
    render()
    return
  }

  state.registerBusy = true
  render()
  try {
    const result = await sendDesktopSmsCode(phone, 'register')
    state.registerStep = 2
    state.registerNotice = registerDevNotice(result)
    startRegisterCountdown()
  } catch (error) {
    state.registerError = error instanceof Error ? error.message : '验证码发送失败'
  } finally {
    state.registerBusy = false
    render()
  }
}

async function resendRegisterCode() {
  if (state.registerBusy || state.registerCountdown > 0) return
  const phone = String(state.registerPhone || '').trim()
  if (!/^1\d{10}$/.test(phone)) {
    state.registerError = '手机号无效，请返回上一步重新填写'
    render()
    return
  }
  state.registerBusy = true
  state.registerError = ''
  state.registerNotice = ''
  render()
  try {
    const result = await sendDesktopSmsCode(phone, 'register')
    state.registerNotice = registerDevNotice(result)
    startRegisterCountdown()
  } catch (error) {
    state.registerError = error instanceof Error ? error.message : '验证码发送失败'
  } finally {
    state.registerBusy = false
    render()
  }
}

function submitRegisterCode(event) {
  event.preventDefault()
  if (state.registerBusy) return
  const data = new FormData(event.currentTarget)
  const code = String(data.get('registerCode') || '').trim()
  state.registerCode = code
  state.registerError = ''
  if (!/^\d{4,6}$/.test(code)) {
    state.registerError = '请输入 4-6 位验证码'
    render()
    return
  }
  state.registerStep = 3
  render()
}

async function submitRegisterProfile(event) {
  event.preventDefault()
  if (state.registerBusy) return
  const data = new FormData(event.currentTarget)
  const nickname = String(data.get('registerNickname') || '').trim()
  const password = String(data.get('registerPassword') || '')
  const confirmPassword = String(data.get('registerConfirmPassword') || '')
  state.registerNickname = nickname
  state.registerPassword = password
  state.registerConfirmPassword = confirmPassword
  state.rememberLogin = data.get('rememberLogin') === 'on'
  setRememberLogin(state.rememberLogin)
  state.registerError = ''
  state.registerNotice = ''
  if (!nickname) {
    state.registerError = '请输入昵称'
    render()
    return
  }
  if (password.length < 6) {
    state.registerError = '密码至少 6 位'
    render()
    return
  }
  if (password !== confirmPassword) {
    state.registerError = '两次输入的密码不一致'
    render()
    return
  }

  state.registerBusy = true
  render()
  try {
    const result = await registerDesktop(
      state.registerPhone,
      state.registerCode,
      nickname,
      password,
      state.rememberLogin,
    )
    if (state.rememberLogin) saveRememberedLogin(state.registerPhone, password)
    else clearRememberedLogin()
    stopRegisterCountdown()
    state.authenticated = true
    state.loginView = 'login'
    state.profile = { ...state.profile, ...result, userId: String(result.userId), avatarUrl: result.avatarUrl }
    state.registerStep = 1
    state.registerPhone = ''
    state.registerCode = ''
    state.registerNickname = ''
    state.registerPassword = ''
    state.registerConfirmPassword = ''
    state.registerError = ''
    state.registerNotice = ''
    await loadRemoteData()
    showToast('注册成功，欢迎使用 Pulse')
  } catch (error) {
    state.registerError = error instanceof Error ? error.message : '注册失败，请稍后重试'
  } finally {
    state.registerBusy = false
    render()
  }
}

function stopResetCountdown() {
  window.clearInterval(resetSmsTimer)
  resetSmsTimer = null
  state.resetCountdown = 0
}

function updateResetCodeButton() {
  const button = document.querySelector('[data-action="send-reset-code"]')
  if (!button) return
  button.textContent = state.resetCountdown > 0 ? `${state.resetCountdown}s 后重发` : '发送验证码'
  button.disabled = state.resetCountdown > 0 || state.resetBusy
}

async function sendResetCode() {
  const input = document.querySelector('[data-forgot-form] input[name="resetPhone"]')
  const phone = String(input?.value || state.resetPhone).trim()
  if (!/^1\d{10}$/.test(phone)) {
    state.resetError = '请输入有效的 11 位手机号'
    render()
    return
  }
  state.resetPhone = phone
  state.resetError = ''
  state.resetNotice = ''
  state.resetBusy = true
  render()
  try {
    const result = await sendDesktopSmsCode(phone, 'reset')
    state.resetNotice = result.devHint ? `验证码已发送（开发环境：${result.devHint.replace(/^.*?([0-9]{4,6}).*$/, '$1')}）` : '验证码已发送'
    startResetCountdown()
  } catch (error) {
    state.resetNotice = ''
    state.resetError = error instanceof Error ? error.message : '验证码发送失败'
  } finally {
    state.resetBusy = false
    render()
  }
}

async function submitResetPassword(event) {
  event.preventDefault()
  if (state.resetBusy) return
  const form = event.currentTarget
  const data = new FormData(form)
  const phone = String(data.get('resetPhone') || '').trim()
  const code = String(data.get('resetCode') || '').trim()
  const password = String(data.get('resetPassword') || '')
  const confirmPassword = String(data.get('resetConfirmPassword') || '')
  state.resetPhone = phone
  state.resetCode = code
  state.resetError = ''
  state.resetNotice = ''
  if (!/^1\d{10}$/.test(phone)) return showToast('请输入有效手机号')
  if (!code) return showToast('请输入验证码')
  if (password.length < 6) return showToast('新密码至少 6 位')
  if (password !== confirmPassword) return showToast('两次输入的密码不一致')
  state.resetBusy = true
  render()
  try {
    await resetDesktopPassword({ phone, code, password })
    if (getRememberedLogin()?.phone === phone) {
      clearRememberedLogin()
      state.loginPhone = phone
      state.loginPassword = ''
      state.rememberLogin = false
    }
    stopResetCountdown()
    state.loginView = 'login'
    state.loginError = ''
    state.loginNotice = '密码已重置，请使用新密码登录'
    state.resetPassword = ''
    state.resetConfirmPassword = ''
    state.resetCode = ''
    showToast('密码已重置')
  } catch (error) {
    state.resetError = error instanceof Error ? error.message : '密码重置失败'
  } finally {
    state.resetBusy = false
    render()
  }
}

function cancelInputDialog() {
  const resolver = inputDialogResolver
  inputDialogResolver = null
  state.inputDialog = null
  resolver?.(null)
}

function finishInputDialog(result) {
  const resolver = inputDialogResolver
  inputDialogResolver = null
  state.inputDialog = null
  state.modal = ''
  state.groupInfoFocusMembers = false
  state.modalBusy = false
  state.modalError = ''
  resolver?.(result)
  render()
}

function openDesktopInputDialog({ title, subtitle, fields, validate }) {
  cancelInputDialog()
  return new Promise((resolve) => {
    inputDialogResolver = resolve
    state.inputDialog = {
      title,
      subtitle,
      fields: fields.map((field) => ({ ...field, value: String(field.value ?? '') })),
      values: Object.fromEntries(fields.map((field) => [field.name, String(field.value ?? '')])),
      validate,
      error: '',
    }
    state.modal = 'input'
    state.modalBusy = false
    state.modalError = ''
    render()
    window.setTimeout(() => document.querySelector('[data-input-dialog-input]')?.focus(), 0)
  })
}

function submitInputDialog(event) {
  event.preventDefault()
  const dialog = state.inputDialog
  if (!dialog) return
  const form = event.currentTarget
  const values = Object.fromEntries(dialog.fields.map((field) => {
    const input = form.elements.namedItem(field.name)
    return [field.name, String(input?.value || '')]
  }))
  const requiredField = dialog.fields.find((field) => field.required && !String(values[field.name] || '').trim())
  const error = requiredField ? `请填写${requiredField.label}` : dialog.validate?.(values)
  if (error) {
    state.inputDialog = { ...dialog, values, error }
    render()
    window.setTimeout(() => document.querySelector(`[data-input-dialog-input="${CSS.escape(requiredField?.name || dialog.fields[0]?.name || '')}"]`)?.focus(), 0)
    return
  }
  finishInputDialog(values)
}

function resetModal() {
  markDesktopPreviewCacheInUse(state.mediaPreview, false)
  markDesktopPreviewCacheInUse(state.filePreview, false)
  if (state.modal === 'location') disposeDesktopLocationPickerMap()
  if (desktopSearchDebounceTimer) {
    window.clearTimeout(desktopSearchDebounceTimer)
    desktopSearchDebounceTimer = null
  }
  desktopSearchRequestId += 1
  desktopFilePreviewRequestId += 1
  releaseDesktopFilePreviewUrl()
  if (inputDialogResolver) cancelInputDialog()
  if (walletPasswordResolver) {
    const resolver = walletPasswordResolver
    walletPasswordResolver = null
    resolver(false)
  }
  state.modal = ''
  state.scheduledDialog = null
  state.locationPicker = desktopLocationPickerDefaultState()
  state.locationPickerMode = 'chat'
  state.mediaForward = null
  state.mediaForwardTargets = new Set()
  state.mediaPreview = null
  state.filePreview = null
  state.forwardDetail = null
  state.mediaEditor = null
  state.momentMediaMenu = null
  state.modalBusy = false
  state.modalError = ''
  state.lockScreenBusy = false
  state.lockScreenError = ''
  state.lockScreenPassword = ''
  state.lockScreenPasswordConfirm = ''
  state.lockScreenPasswordHint = ''
  state.modalQuery = ''
  state.modalResults = null
  state.modalContactLimit = 3
  state.sharedContentFilter = ''
  state.sharedContentMessages = []
  state.sharedContentLoading = false
  state.sharedContentError = ''
  state.sharedContentMenu = null
  state.modalProfile = null
  state.modalProfileMoments = []
  state.modalProfileMomentsLoading = false
  state.modalProfileMomentsError = ''
  state.modalProfileCommonGroups = []
  state.modalProfileCommonGroupsLoading = false
  state.modalProfileCommonGroupsError = ''
  state.contactProfileScrollTop = 0
  state.inputDialog = null
  state.momentDetail = null
  state.modalMode = 'conversation'
  state.searchMode = 'global'
  state.groupCreateTitle = ''
  state.groupCreateSelected = new Set()
  state.groupSearchQuery = ''
  state.groupSearchResults = []
  state.groupSearchBusy = false
  state.groupSearchError = ''
  state.messageMenu = null
  state.fileMenu = null
  state.conversationMenu = null
  state.confirmDialog = null
  state.messageForwardIds = []
  state.messageForwardTargets = new Set()
  state.messageForwardMode = 'merge'
  state.favoriteForwardIds = []
  state.favoriteForwardTargets = new Set()
  state.favoriteForwardFromSelection = false
  state.walletPasswordDialog = false
  state.redPacketDetail = null
  state.redPacketDetailLoading = false
  state.redPacketReceiving = false
  state.redPacketError = ''
  state.transferDetail = null
  state.transferDetailLoading = false
  state.transferReceiving = false
  state.transferError = ''
  state.walletDetail = null
  state.favoriteDetail = null
  state.favoriteDetailLoading = false
  state.privacyListMode = ''
  state.privacyListUsers = []
  state.privacyListSelected = new Set()
  state.privacyListLoading = false
  render()
}

function modalFrame(title, subtitle, body, modalClass = '') {
  return `<div class="desktop-modal-backdrop" data-modal-backdrop>
    <section class="desktop-modal${modalClass ? ` ${modalClass}` : ''}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <header class="desktop-modal-header" data-desktop-modal-header><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p></div><button class="subtle-icon-btn" data-modal-close aria-label="关闭">${icon('close')}</button></header>
      <div data-desktop-modal-body>${body}</div>
    </section>
  </div>`
}

function renderDesktopImportantSettingsModal() {
  const detail = groupInfoDetail()
  const setting = state.importantNotificationSetting
  if (state.importantNotificationLoading) return modalFrame('\u91cd\u8981\u6d88\u606f\u4ecd\u7136\u901a\u77e5', '\u7fa4\u804a\u6d88\u606f\u4f9d\u7136\u4f1a\u53ca\u65f6\u63d0\u9192\u4f60', '<div class="desktop-modal-hint">\u6b63\u5728\u52a0\u8f7d\u8bbe\u7f6e\u2026</div>')
  const options = [
    ['atAll', '@\u5168\u4f53\u6210\u5458', '\u7fa4\u4e3b\u6216\u7ba1\u7406\u5458 @ \u5168\u4f53\u6210\u5458'],
    ['mentionMe', '\u6709\u4eba@\u6211', '\u6709\u4eba\u5728\u7fa4\u5185\u63d0\u5230\u4f60'],
    ['replyMe', '\u6709\u4eba\u56de\u590d\u6211', '\u6709\u4eba\u56de\u590d\u4f60\u53d1\u51fa\u7684\u6d88\u606f'],
    ['announcement', '\u7fa4\u516c\u544a', '\u7fa4\u4e3b\u6216\u7ba1\u7406\u5458\u53d1\u5e03\u7fa4\u516c\u544a'],
  ]
  const optionRows = options.map(([key, title, subtitle]) => `<label class="desktop-group-switch-row"><span><strong>${title}</strong><small>${subtitle}</small></span><input type="checkbox" data-important-setting="${key}" ${setting[key] ? 'checked' : ''} ${state.importantNotificationBusy ? 'disabled' : ''} /><i></i></label>`).join('')
  const followed = new Set((setting.followedMemberIds || []).map(String))
  const members = detail?.members || []
  const memberRows = members.length
    ? members.map((member) => `<label class="desktop-important-member-row"><input type="checkbox" data-important-member="${escapeHtml(member.userId)}" ${followed.has(String(member.userId)) ? 'checked' : ''} ${state.importantNotificationBusy ? 'disabled' : ''} /><span>${avatar(member, 'avatar-small')}</span><strong>${escapeHtml(member.nickname)}</strong></label>`).join('')
    : '<div class="desktop-modal-hint">\u6682\u65e0\u7fa4\u6210\u5458</div>'
  return modalFrame('\u91cd\u8981\u6d88\u606f\u4ecd\u7136\u901a\u77e5', '\u5f00\u542f\u6d88\u606f\u514d\u6253\u6270\u540e\uff0c\u4ee5\u4e0b\u6d88\u606f\u4ecd\u4f1a\u901a\u77e5', `<div class="desktop-important-settings"><div class="desktop-group-info-section">${optionRows}</div><div class="desktop-group-info-section"><div class="desktop-group-info-section-head"><strong>\u5173\u6ce8\u7fa4\u6210\u5458\u7684\u6d88\u606f</strong><span>${followed.size} \u4eba</span></div><p class="desktop-modal-hint">\u5173\u6ce8\u7684\u6210\u5458\u5728\u7fa4\u5185\u53d1\u6d88\u606f\u65f6\uff0c\u5373\u4f7f\u514d\u6253\u6270\u4e5f\u4f1a\u7ee7\u7eed\u901a\u77e5\u3002</p><div class="desktop-important-member-list">${memberRows}</div></div></div>`)
}

function renderDesktopGroupInfoModal() {
  const selected = conversations[state.selectedConversation]
  const detail = groupInfoDetail()
  if (!selected || !isGroupConversation(selected)) return ''
  if (state.groupInfoLoading && !detail) return modalFrame('\u7fa4\u804a\u8d44\u6599', '\u6b63\u5728\u52a0\u8f7d\u7fa4\u4fe1\u606f', '<div class="desktop-modal-hint">\u6b63\u5728\u52a0\u8f7d\u7fa4\u8d44\u6599\u2026</div>', 'desktop-group-info-modal')
  if (!detail) return modalFrame('\u7fa4\u804a\u8d44\u6599', '\u7fa4\u4fe1\u606f\u6682\u65f6\u4e0d\u53ef\u7528', `<div class="desktop-modal-empty">${escapeHtml(state.groupInfoError || '\u6682\u65e0\u7fa4\u8d44\u6599')}</div>`, 'desktop-group-info-modal')
  const manager = desktopGroupIsManager(detail)
  const owner = Boolean(detail.owner)
  const memberIds = new Set((detail.members || []).map((member) => String(member.userId)))
  const addable = contacts.filter((contact) => !isDesktopFileTransferAssistant(contact) && !memberIds.has(String(contact.userId || contactUserId(contact))))
  const members = (detail.members || []).map((member) => {
    const role = member.role === 'owner' ? '\u7fa4\u4e3b' : member.role === 'admin' ? '\u7ba1\u7406\u5458' : '\u6210\u5458'
    const actions = String(member.userId) === String(state.profile.userId || '') || member.role === 'owner'
      ? ''
      : `<div class="desktop-group-member-actions">
          ${owner ? `<button type="button" data-group-member-action="admin" data-group-member-id="${escapeHtml(member.userId)}" data-group-member-name="${escapeHtml(member.nickname)}">${member.role === 'admin' ? '\u53d6\u6d88\u7ba1\u7406' : '\u8bbe\u4e3a\u7ba1\u7406\u5458'}</button><button type="button" data-group-member-action="transfer" data-group-member-id="${escapeHtml(member.userId)}" data-group-member-name="${escapeHtml(member.nickname)}">\u8f6c\u8ba9\u7fa4\u4e3b</button>` : ''}
          ${manager && (owner || member.role === 'member') ? `<button type="button" data-group-member-action="mute" data-group-member-id="${escapeHtml(member.userId)}" data-group-member-name="${escapeHtml(member.nickname)}">${member.speakMuted ? '\u89e3\u9664\u7981\u8a00' : '\u7981\u8a00'}</button><button type="button" class="danger" data-group-member-action="remove" data-group-member-id="${escapeHtml(member.userId)}" data-group-member-name="${escapeHtml(member.nickname)}">\u79fb\u51fa</button>` : ''}
        </div>`
    return `<div class="desktop-group-member-row"><button type="button" class="desktop-group-member-profile" data-view-contact="${escapeHtml(member.userId)}"><span class="result-avatar">${avatar(member, 'avatar-small')}</span><span class="desktop-group-member-copy"><strong>${escapeHtml(member.nickname)}</strong><small>${role}${member.speakMuted ? ' \u00b7 \u7981\u8a00\u4e2d' : ''}</small></span></button>${actions}</div>`
  }).join('')
  const addPanel = state.groupInfoAddOpen
    ? `<div class="desktop-group-add-panel"><div class="desktop-group-add-head"><strong>\u6dfb\u52a0\u6210\u5458</strong><button type="button" data-group-info-close-add>\u53d6\u6d88</button></div>${addable.length ? addable.map((contact) => { const id = String(contact.userId || contactUserId(contact)); const checked = state.groupInfoAddSelected.has(id); return `<label class="desktop-group-add-row"><input type="checkbox" data-group-info-add-member="${escapeHtml(id)}" ${checked ? 'checked' : ''} /><span>${avatar(contact, 'avatar-small')}</span><strong>${escapeHtml(contact.name || contact.nickname || '\u7528\u6237')}</strong></label>` }).join('') : '<div class="desktop-modal-hint">\u6682\u65e0\u53ef\u6dfb\u52a0\u7684\u597d\u53cb</div>'}<button class="btn btn-primary desktop-group-add-submit" type="button" data-group-info-add-submit>\u6dfb\u52a0\u5df2\u9009\u6210\u5458</button></div>`
    : ''
  const scheduledRows = groupInfoScheduledMessages().map((row) => `<div class="desktop-group-scheduled-row"><div><strong><span class="desktop-group-scheduled-type">${escapeHtml(desktopScheduledTypeLabel(row.msgType))}</span> ${escapeHtml(desktopScheduledContentLabel(row))}</strong><small>${escapeHtml(new Date(row.sendAt).toLocaleString())} · ${escapeHtml(desktopScheduledStatusLabel(row.status))} · ${escapeHtml(row.setterNickname || '设置人')}</small>${row.lastError ? `<small class="desktop-group-scheduled-error">${escapeHtml(row.lastError)}</small>` : ''}</div>${row.status === 'PENDING' || row.status === 'FAILED' ? `<span><button type="button" data-group-schedule-edit="${escapeHtml(row.id)}">编辑</button><button type="button" class="danger" data-group-schedule-delete="${escapeHtml(row.id)}">删除</button></span>` : ''}</div>`).join('')
  const scheduledSection = manager ? `<div class="desktop-group-info-section"><div class="desktop-group-info-section-head"><strong>定时消息</strong><button type="button" class="btn btn-primary desktop-group-add-btn" data-group-schedule-new>+ 新增</button></div><p class="desktop-modal-hint">按设置人的头像和身份发送，支持文字、图片、视频和文件。</p>${scheduledRows || '<div class="desktop-modal-hint">暂无定时消息</div>'}</div>` : ''
  const body = `<div class="desktop-group-info-body">
    <div class="desktop-group-info-hero">${avatar({ name: detail.title, avatarUrl: detail.avatarUrl, tone: 'violet' }, 'avatar-large')}<div><strong>${escapeHtml(detail.title)}</strong><small>${Number(detail.memberCount || detail.members.length)} \u540d\u6210\u5458${detail.myRole ? ` \u00b7 ${detail.myRole === 'owner' ? '\u7fa4\u4e3b' : detail.myRole === 'admin' ? '\u7ba1\u7406\u5458' : '\u6210\u5458'}` : ''}</small></div></div>
    <div class="desktop-group-info-section"><div class="desktop-group-info-section-head"><strong>\u7fa4\u8d44\u6599</strong>${manager ? '<span>\u7ba1\u7406\u6743\u9650</span>' : ''}</div>
      <button class="desktop-group-info-row" type="button" data-group-info-edit="title"><span><strong>\u7fa4\u540d\u79f0</strong><small>${escapeHtml(detail.title)}</small></span>${manager ? icon('edit') : ''}</button>
      <button class="desktop-group-info-row" type="button" data-group-info-edit="notice"><span><strong>\u7fa4\u516c\u544a</strong><small>${escapeHtml(detail.notice || '\u6682\u65e0\u516c\u544a')}</small></span>${manager ? icon('edit') : ''}</button>
      ${manager ? `<button class="desktop-group-info-row" type="button" data-group-info-edit="welcome"><span><strong>群聊欢迎语</strong><small>${escapeHtml(detail.welcomeMessage || '新成员进群后自动发送，暂未设置')}</small></span>${icon('edit')}</button>` : ''}
      <button class="desktop-group-info-row" type="button" data-group-info-edit="nickname"><span><strong>\u6211\u7684\u7fa4\u6635\u79f0</strong><small>${escapeHtml(detail.myGroupNickname || '\u8ddf\u968f\u8d26\u53f7\u6635\u79f0')}</small></span>${icon('edit')}</button>
      <button class="desktop-group-info-row" type="button" data-group-info-edit="remark"><span><strong>\u7fa4\u5907\u6ce8</strong><small>${escapeHtml(detail.groupRemark || '\u4ec5\u81ea\u5df1\u53ef\u89c1\uff0c\u6682\u672a\u8bbe\u7f6e')}</small></span>${icon('edit')}</button>
      <button class="desktop-group-info-row" type="button" data-group-info-copy-pulse><span><strong>\u7fa4 PulseID</strong><small>${escapeHtml(detail.pulseId || formatDesktopGroupPulseId(detail.id))}</small></span><span class="desktop-copy-label">\u590d\u5236</span></button>
    </div>
    <div class="desktop-group-info-section"><div class="desktop-group-info-section-head"><strong>\u7fa4\u5185\u64cd\u4f5c</strong></div>
      <label class="desktop-group-switch-row"><span><strong>\u7f6e\u9876\u7fa4\u804a</strong><small>\u4ec5\u5f71\u54cd\u4f60\u81ea\u5df1</small></span><input type="checkbox" data-group-setting="pinned" ${detail.pinned ? 'checked' : ''} /><i></i></label>
      <label class="desktop-group-switch-row"><span><strong>\u6d88\u606f\u514d\u6253\u6270</strong><small>\u4ec5\u5f71\u54cd\u4f60\u81ea\u5df1</small></span><input type="checkbox" data-group-setting="mute" ${detail.mute ? 'checked' : ''} /><i></i></label>
      <button class="desktop-group-info-row" type="button" data-group-info-important><span><strong>\u91cd\u8981\u6d88\u606f\u4ecd\u7136\u901a\u77e5</strong><small>@\u5168\u4f53\u3001@\u6211\u3001\u56de\u590d\u3001\u7fa4\u516c\u544a\u548c\u5173\u6ce8\u6210\u5458</small></span>${icon('arrow')}</button>
      ${manager ? `<button class="desktop-group-info-row" type="button" data-group-info-edit="search-mode"><span><strong>\u7fa4\u641c\u7d22\u65b9\u5f0f</strong><small>${desktopGroupSearchModeLabel(detail.searchMode)}</small></span>${icon('edit')}</button><label class="desktop-group-switch-row"><span><strong>\u5168\u5458\u7981\u8a00</strong><small>\u4ec5\u7fa4\u4e3b\u548c\u7ba1\u7406\u5458\u53ef\u53d1\u8a00</small></span><input type="checkbox" data-group-setting="muteAll" ${detail.muteAll ? 'checked' : ''} /><i></i></label><label class="desktop-group-switch-row"><span><strong>\u52a0\u7fa4\u9700\u5ba1\u6838</strong><small>\u65b0\u6210\u5458\u52a0\u5165\u524d\u9700\u7ba1\u7406\u5458\u786e\u8ba4</small></span><input type="checkbox" data-group-setting="joinVerifyRequired" ${detail.joinVerifyRequired ? 'checked' : ''} /><i></i></label><label class="desktop-group-switch-row"><span><strong>\u6210\u5458\u53ef\u4e92\u52a0\u597d\u53cb</strong><small>\u5141\u8bb8\u7fa4\u6210\u5458\u4ece\u7fa4\u8d44\u6599\u4e92\u52a0\u597d\u53cb</small></span><input type="checkbox" data-group-setting="allowMemberAddFriend" ${detail.allowMemberAddFriend ? 'checked' : ''} /><i></i></label><label class="desktop-group-switch-row"><span><strong>\u5141\u8bb8\u7fa4\u6210\u5458\u9080\u8bf7\u597d\u53cb\u8fdb\u7fa4</strong><small>\u5173\u95ed\u540e\u4ec5\u7fa4\u4e3b\u548c\u7ba1\u7406\u5458\u53ef\u6dfb\u52a0\u6210\u5458</small></span><input type="checkbox" data-group-setting="memberInviteAllowed" ${detail.memberInviteAllowed ? 'checked' : ''} /><i></i></label>` : ''}
    </div>
    ${scheduledSection}
    <div class="desktop-group-info-section" data-group-info-members><div class="desktop-group-info-section-head"><strong>\u7fa4\u6210\u5458 (${detail.members.length})</strong><button type="button" class="btn btn-primary desktop-group-add-btn" data-group-info-open-add>+ \u6dfb\u52a0</button></div>${members}</div>
    ${addPanel}
    <div class="desktop-group-danger-actions">${owner ? '<button type="button" data-group-action="dissolve">\u89e3\u6563\u7fa4\u804a</button>' : '<button type="button" data-group-action="leave">\u9000\u51fa\u7fa4\u804a</button>'}</div>
  </div>`
  return modalFrame('\u7fa4\u804a\u8d44\u6599', '\u7fa4\u7ba1\u7406\u4e0e\u7fa4\u5185\u64cd\u4f5c', body, 'desktop-group-info-modal')
}

function renderDesktopSharedContentModal() {
  const filter = state.sharedContentFilter === 'file' ? 'file' : 'media'
  const title = sharedContentLabel(filter)
  const selected = conversations[state.selectedConversation]
  if (state.sharedContentLoading) {
    return modalFrame(title, `查看“${selected?.name || '当前会话'}”中的共享内容`, '<div class="desktop-modal-hint">正在加载共享内容…</div>')
  }
  if (state.sharedContentError) {
    return modalFrame(title, `查看“${selected?.name || '当前会话'}”中的共享内容`, `<div class="desktop-modal-empty"><div class="login-error">${escapeHtml(state.sharedContentError)}</div></div>`)
  }
  const messages = state.sharedContentMessages || []
  if (!messages.length) {
    return modalFrame(title, `查看“${selected?.name || '当前会话'}”中的共享内容`, `<div class="desktop-modal-empty">暂无${filter === 'file' ? '共享文件' : '共享图片或视频'}</div>`)
  }
  const body = `<div class="desktop-shared-content-list ${filter === 'media' ? 'is-media' : 'is-files'}">${messages.map((message) => `<article class="desktop-shared-content-item" data-shared-content-item data-shared-content-message-id="${escapeHtml(String(message.id))}"><div class="desktop-shared-content-meta"><strong>${escapeHtml(message.mine ? '我' : (message.fromNickname || selected?.name || '用户'))}</strong><time>${escapeHtml(message.time || '')}</time></div><div class="desktop-shared-content-preview">${renderDesktopMessageContent(message)}</div></article>`).join('')}</div>`
  return modalFrame(title, `共 ${messages.length} 项 · 点击内容可打开原文件`, body)
}

function renderDesktopLocationPickerModal() {
  const picker = state.locationPicker
  const selected = picker.selected
  const momentMode = state.locationPickerMode === 'moment'
  const title = momentMode ? '添加位置' : '发送位置'
  const subtitle = momentMode ? '搜索地点、使用当前位置，或直接点击地图选择朋友圈位置。' : '搜索地点、发送当前位置，或直接点击地图选点。'
  const currentLabel = momentMode ? '使用当前位置' : '发送当前位置'
  const sendLabel = state.modalBusy ? (momentMode ? '保存中…' : '发送中…') : (momentMode ? '使用此位置' : '发送位置')
  const body = `<div class="desktop-location-picker">
    <div class="desktop-location-toolbar">
      <form class="desktop-location-search" data-location-search-form><span>${icon('search')}</span><input data-location-query type="search" value="${escapeHtml(picker.keyword)}" placeholder="搜索地点、街道或商户" autocomplete="off" /><button type="submit" aria-label="搜索">${icon(picker.searching ? 'refresh' : 'search')}</button></form>
      <button type="button" class="desktop-location-current" data-location-current ${picker.locating || picker.loading || state.modalBusy ? 'disabled' : ''}>${icon('location')} ${picker.locating ? '正在定位…' : currentLabel}</button>
    </div>
    <div class="desktop-location-map-wrap"><div id="desktop-location-map" class="desktop-location-map"></div><div class="desktop-location-map-state ${picker.error ? 'is-error' : ''}" data-location-map-state>${picker.error ? `<span>${icon('location')}</span><strong>${escapeHtml(picker.error)}</strong><small>可以关闭后重试</small>` : `<span class="desktop-location-spinner">${icon('refresh')}</span><strong>正在加载百度地图…</strong>`}</div><button type="button" class="desktop-location-recenter" data-location-recenter aria-label="定位到当前位置" title="定位到当前位置">${icon('location')}</button></div>
    <div class="desktop-location-results" data-location-results>${renderDesktopLocationResults()}</div>
    <div class="desktop-location-nearby-wrap" data-location-nearby>${renderDesktopLocationNearby()}</div>
    <div class="desktop-location-footer"><div class="desktop-location-selected" data-location-selected>${renderDesktopLocationSelected()}</div><div class="desktop-location-actions"><button type="button" class="btn" data-modal-close>取消</button><button type="button" class="btn btn-primary" data-location-send ${!selected || state.modalBusy ? 'disabled' : ''}>${sendLabel}</button></div></div>
  </div>`
  return modalFrame(title, subtitle, body, 'desktop-location-modal')
}

function renderDesktopMediaForwardModal() {
  const targets = conversations
  const selectedTargets = state.mediaForwardTargets
  const rows = targets.length
    ? targets.map((item) => {
      const id = String(item.id || '')
      const active = selectedTargets.has(id)
      return `<button class="desktop-result-row ${active ? 'is-selected' : ''}" type="button" data-media-forward-target="${escapeHtml(id)}"><span class="result-avatar">${avatar(item, 'avatar-small')}</span><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.type === 'group' ? '群聊' : '联系人')}</small></span><span class="message-forward-check">${active ? '✓' : ''}</span></button>`
    }).join('')
    : '<div class="desktop-modal-empty">暂无可转发的会话</div>'
  const body = `<div class="desktop-modal-forward"><p class="desktop-modal-hint">选择要接收这条朋友圈媒体的会话。</p><div class="desktop-modal-results">${rows}</div>${state.modalError ? `<div class="login-error">${escapeHtml(state.modalError)}</div>` : ''}<div class="desktop-modal-actions"><button class="btn" type="button" data-modal-close>取消</button><button class="btn btn-primary" type="button" data-media-forward-submit ${state.modalBusy ? 'disabled' : ''}>${state.modalBusy ? '转发中…' : '确认转发'}</button></div></div>`
  return modalFrame('转发朋友圈媒体', '可选择一个或多个联系人、群聊。', body)
}

function renderDesktopScheduledDialog() {
  const dialog = state.scheduledDialog
  if (!dialog) return ''
  const file = parseDesktopScheduledFile(dialog.content)
  const fileUrl = file?.url ? resolveDesktopFileUrl(file.url) : ''
  const type = Number(dialog.msgType || 0)
  const preview = fileUrl && String(file?.contentType || '').startsWith('image/')
    ? `<img class="desktop-scheduled-preview-media" src="${escapeHtml(desktopMediaRenderSource(fileUrl))}" data-protected-media-src="${escapeHtml(fileUrl)}" alt="" />`
    : fileUrl && String(file?.contentType || '').startsWith('video/')
      ? `<video class="desktop-scheduled-preview-media" src="${escapeHtml(desktopMediaRenderSource(fileUrl))}" data-protected-media-src="${escapeHtml(fileUrl)}" controls muted playsinline preload="metadata"></video>`
      : fileUrl && String(file?.contentType || '').startsWith('audio/')
        ? `<audio src="${escapeHtml(desktopMediaRenderSource(fileUrl))}" data-protected-media-src="${escapeHtml(fileUrl)}" controls preload="metadata"></audio>`
        : `<span class="desktop-scheduled-preview-icon">${icon('folder')}</span>`
  const body = `<form class="desktop-modal-form desktop-scheduled-form" data-desktop-scheduled-form novalidate>
    <label class="desktop-input-dialog-field"><span>消息类型</span><select data-desktop-scheduled-type>${[['0', '文字'], ['1', '图片或视频'], ['2', '文件'], ['3', '音频或语音']].map(([value, label]) => `<option value="${value}" ${type === Number(value) ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
    ${type === 0 ? `<label class="desktop-input-dialog-field"><span>文字内容</span><textarea data-desktop-scheduled-content maxlength="20000" rows="5" placeholder="请输入要定时发送的文字">${escapeHtml(dialog.content)}</textarea></label>` : `<div class="desktop-scheduled-upload"><input type="file" data-desktop-scheduled-file hidden accept="${type === 1 ? 'image/*,video/*' : type === 3 ? 'audio/*' : '*/*'}" /><div class="desktop-scheduled-preview">${preview}<span>${escapeHtml(file?.name || '未选择文件')}</span></div><button type="button" class="btn" data-desktop-scheduled-pick ${dialog.uploading ? 'disabled' : ''}>${dialog.uploading ? '上传中…' : file?.name ? '重新选择' : '选择并上传'}</button></div>`}
    <label class="desktop-input-dialog-field"><span>发送时间</span><input data-desktop-scheduled-at type="datetime-local" value="${escapeHtml(dialog.sendAt || '')}" /></label>
    ${dialog.error ? `<div class="login-error">${escapeHtml(dialog.error)}</div>` : ''}
    <div class="desktop-modal-actions"><button class="btn" type="button" data-modal-close>取消</button><button class="btn btn-primary" type="submit" ${dialog.uploading || state.modalBusy ? 'disabled' : ''}>${state.modalBusy ? '保存中…' : '保存定时消息'}</button></div>
  </form>`
  return modalFrame(dialog.id ? '编辑定时消息' : '新增定时消息', '按设置人的头像和身份，在指定时间发送一次。', body, 'desktop-scheduled-dialog')
}

function renderModal() {
  if (state.modal === 'input') return renderInputDialog()
  if (state.modal === 'group-scheduled') return renderDesktopScheduledDialog()
  if (state.modal === 'new-message') return renderNewMessageModal()
  if (state.modal === 'add-group') return renderDesktopAddGroupModal()
  if (state.modal === 'search') return renderSearchModal()
  if (state.modal === 'contact') return renderContactModal()
  if (state.modal === 'contact-moments') return renderContactMomentsModal()
  if (state.modal === 'contact-groups') return renderContactGroupsModal()
  if (state.modal === 'notifications') return renderNotificationsModal()
  if (state.modal === 'message-forward') return renderMessageForwardModal()
  if (state.modal === 'forward-detail') return renderDesktopForwardDetailModal()
  if (state.modal === 'file-preview') return renderDesktopFilePreviewModal()
  if (state.modal === 'favorite-forward') return renderFavoriteForwardModal()
  if (state.modal === 'media-forward') return renderDesktopMediaForwardModal()
  if (state.modal === 'favorite-detail') return renderFavoriteDetailModal()
  if (state.modal === 'chat-settings') return renderChatSettingsModal()
  if (state.modal === 'lock-password') return renderDesktopLockPasswordModal()
  if (state.modal === 'account-deletion-agreement') return renderAccountDeletionAgreementModal()
  if (state.modal === 'confirm') return renderConfirmModal()
  if (state.modal === 'wallet-password') return renderWalletPasswordModal()
  if (state.modal === 'redpacket-detail') return renderDesktopRedPacketModal()
  if (state.modal === 'transfer-detail') return renderDesktopTransferModal()
  if (state.modal === 'wallet-detail') return renderWalletDetailModal()
  if (state.modal === 'moment-visibility') return renderMomentVisibilityModal()
  if (state.modal === 'moment-mentions') return renderMomentMentionsModal()
  if (state.modal === 'moment-detail') return renderMomentDetailModal()
  if (state.modal === 'privacy-list') return renderPrivacyListModal()
  if (state.modal === 'important-notifications') return renderDesktopImportantSettingsModal()
  if (state.modal === 'group-info') return renderDesktopGroupInfoModal()
  if (state.modal === 'shared-content') return renderDesktopSharedContentModal()
  if (state.modal === 'location') return renderDesktopLocationPickerModal()
  return ''
}

function renderInputDialog() {
  const dialog = state.inputDialog
  if (!dialog) return ''
  const fields = dialog.fields.filter((field) => !field.visible || field.visible(dialog.values)).map((field) => {
    const value = dialog.values[field.name] ?? field.value ?? ''
    const attributes = [
      `name="${escapeHtml(field.name)}"`,
      'data-input-dialog-input',
      field.inputmode ? `inputmode="${escapeHtml(field.inputmode)}"` : '',
      field.autocomplete ? `autocomplete="${escapeHtml(field.autocomplete)}"` : 'autocomplete="off"',
      field.maxlength ? `maxlength="${Number(field.maxlength)}"` : '',
    ].filter(Boolean).join(' ')
    const control = Array.isArray(field.options)
      ? `<select ${attributes}>${field.options.map((option) => {
        const optionValue = String(option.value ?? '')
        return `<option value="${escapeHtml(optionValue)}" ${optionValue === String(value) ? 'selected' : ''}>${escapeHtml(String(option.label ?? optionValue))}</option>`
      }).join('')}</select>`
      : `<input ${attributes} type="${escapeHtml(field.type || 'text')}" value="${escapeHtml(value)}" placeholder="${escapeHtml(field.placeholder || '')}" />`
    return `<label class="desktop-input-dialog-field"><span>${escapeHtml(field.label)}</span>${control}</label>`
  }).join('')
  const body = `<form class="desktop-modal-form desktop-input-dialog-form" data-input-dialog-form novalidate><div class="desktop-input-dialog-fields">${fields}</div>${dialog.error ? `<div class="login-error">${escapeHtml(dialog.error)}</div>` : ''}<div class="desktop-modal-actions"><button class="btn" type="button" data-modal-close>取消</button><button class="btn btn-primary" type="submit">确定</button></div></form>`
  return modalFrame(dialog.title, dialog.subtitle, body)
}

function renderMomentDetailModal() {
  const item = state.momentDetail
  if (!item) return ''
  const rangeLabels = { 0: '\u597d\u53cb\u53ef\u89c1', 1: '\u4ec5\u81ea\u5df1', 2: '\u90e8\u5206\u53ef\u89c1' }
  const media = (item.images || []).slice(0, 9)
  const mediaMarkup = media.length
    ? `<div class="desktop-moment-detail-media ${media.length === 1 ? 'single' : ''}">${media.map((url, index) => {
      const type = momentMediaType(item, index, url)
      return desktopMomentMediaMarkup(url, type, type === 'video' ? '朋友圈视频' : '朋友圈图片', item.originalImages?.[index] || '', item.mediaFileIds?.[index] || '')
    }).join('')}</div>`
    : ''
  const comments = (item.comments || []).map((comment) => `<div class="desktop-moment-detail-comment"><div class="desktop-moment-detail-comment-head"><strong>${escapeHtml(comment.nickname || '\u7528\u6237')}</strong><span>${escapeHtml(momentTime(comment.createdAt))}</span></div><p>${escapeHtml(comment.content || '')}</p></div>`).join('')
  const likes = (item.likeNicknames || []).length
    ? `<div class="desktop-moment-detail-likes"><strong>\u70b9\u8d5e ${Number(item.likeCount || 0)}</strong><span>${item.likeNicknames.map((name) => escapeHtml(name)).join('\u3001')}</span></div>`
    : `<div class="desktop-moment-detail-likes"><strong>\u70b9\u8d5e ${Number(item.likeCount || 0)}</strong><span>\u6682\u65e0\u70b9\u8d5e</span></div>`
  const body = `<div class="desktop-moment-detail">
    <div class="desktop-moment-detail-author">${avatar({ ...item, name: item.nickname, initials: item.nickname?.slice(0, 1), tone: item.tone || 'blue' }, 'avatar-medium')}<div><strong>${escapeHtml(item.nickname || '\u7528\u6237')}</strong><span>${escapeHtml(momentTime(item.createdAt))}${item.locationName ? ` · ${escapeHtml(item.locationName)}` : ''}</span></div></div>
    ${item.content ? `<p class="desktop-moment-detail-copy">${escapeHtml(item.content)}</p>` : ''}
    ${item.visibility !== undefined ? `<span class="desktop-moment-detail-visibility">${rangeLabels[item.visibility] || momentVisibilityLabel(item.visibility)}</span>` : ''}
    ${mediaMarkup}
    ${likes}
    <div class="desktop-moment-detail-comments"><div class="desktop-moment-detail-section-title">\u8bc4\u8bba ${Number(item.commentCount || 0)}</div>${comments || '<div class="desktop-moment-detail-empty">\u6682\u65e0\u8bc4\u8bba</div>'}</div>
  </div>`
  return modalFrame('\u670b\u53cb\u5708\u8be6\u60c5', '\u67e5\u770b\u8fd9\u6761\u52a8\u6001\u7684\u5b8c\u6574\u5185\u5bb9\u4e0e\u4e92\u52a8', body)
}

function renderMomentVisibilityModal() {
  const selected = state.momentVisibleUserIds
  const users = contacts.map(mapMomentContact)
  const body = `<div class="privacy-list-modal"><p class="privacy-list-tip">选择可以看到这条动态的好友，至少选择 1 位。</p><div class="privacy-list-count">已选择 ${selected.size} 位好友</div><div class="privacy-list-users">${users.length ? users.map((user) => { const id = String(user.userId); return `<label class="privacy-list-user"><input type="checkbox" data-moment-visible-contact="${escapeHtml(id)}" ${selected.has(id) ? 'checked' : ''} /><span>${avatar(user, 'avatar-small')}</span><span><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.meta || user.tag || '')}</small></span><i></i></label>` }).join('') : '<div class="desktop-modal-empty">暂无联系人</div>'}</div><button class="btn btn-primary privacy-list-done" data-modal-close>完成</button></div>`
  return modalFrame('部分可见', '设置这条朋友圈的可见好友。', body)
}

function renderMomentMentionsModal() {
  const users = contacts.map(mapMomentContact)
  const selected = state.momentMentionUserIds
  const body = `<div class="privacy-list-modal"><p class="privacy-list-tip">\u9009\u62e9\u53d1\u5e03\u540e\u9700\u8981\u63d0\u9192\u7684\u597d\u53cb\u3002</p><div class="privacy-list-count">\u5df2\u9009\u62e9 ${selected.size} \u4eba</div><div class="privacy-list-users">${users.length ? users.map((user) => { const id = String(user.userId); return `<label class="privacy-list-user"><input type="checkbox" data-moment-mention-contact="${escapeHtml(id)}" ${selected.has(id) ? 'checked' : ''} /><span>${avatar(user, 'avatar-small')}</span><span><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.meta || user.tag || '')}</small></span><i></i></label>` }).join('') : '<div class="desktop-modal-empty">\u6682\u65e0\u53ef\u63d0\u9192\u7684\u597d\u53cb</div>'}</div><button class="btn btn-primary privacy-list-done" data-modal-close>\u5b8c\u6210</button></div>`
  return modalFrame('\u63d0\u9192\u8c01\u770b', '\u9009\u62e9\u8fd9\u6761\u52a8\u6001\u4e2d\u9700\u8981\u63d0\u9192\u7684\u597d\u53cb', body)
}

function renderPrivacyListModal() {
  const reject = state.privacyListMode === 'reject'
  const title = reject ? '不让他（她）看' : '不看他（她）'
  const description = reject ? '选择后，这些好友将无法查看你的朋友圈。' : '选择后，你将不再看到这些好友的朋友圈。'
  const users = contacts.map(mapMomentContact)
  const selected = state.privacyListSelected
  const body = state.privacyListLoading
    ? '<div class="desktop-modal-hint">正在加载名单…</div>'
    : `<div class="privacy-list-modal"><p class="privacy-list-tip">${description}</p><div class="privacy-list-count">已选择 ${selected.size} 位好友</div><div class="privacy-list-users">${users.length ? users.map((user) => { const id = String(user.userId); return `<label class="privacy-list-user"><input type="checkbox" data-privacy-contact="${escapeHtml(id)}" ${selected.has(id) ? 'checked' : ''} /><span>${avatar(user, 'avatar-small')}</span><span><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.meta || user.tag || '')}</small></span><i></i></label>` }).join('') : '<div class="desktop-modal-empty">暂无联系人</div>'}</div><button class="btn btn-primary privacy-list-done" data-modal-close>完成</button></div>`
  return modalFrame(title, description, body)
}

function renderChatSettingsModal() {
  const selected = conversations[state.selectedConversation]
  const settings = desktopConversationSettings(selected)
  const group = selected?.type === 'group'
  const disabled = group || state.chatSettingsSaving || state.chatSettingsLoading
  const autoOptions = [
    [86400, '1天'], [259200, '3天'], [604800, '7天'], [1209600, '14天'],
    [2592000, '1个月'], [7776000, '3个月'], [15552000, '6个月'], [31536000, '1年'],
  ]
  const autoOptionMarkup = autoOptions.map(([value, label]) => `<option value="${value}" ${Number(settings.autoDeleteSeconds) === value ? 'selected' : ''}>${label}</option>`).join('')
  const body = state.chatSettingsLoading
    ? '<div class="desktop-modal-hint">正在加载聊天设置…</div>'
    : `<div class="desktop-chat-settings">
        ${group ? '<div class="desktop-settings-note">阅后即焚和自动删除记录仅支持好友私聊。</div>' : ''}
        <section class="desktop-chat-setting-card"><div class="desktop-chat-setting-heading"><span class="desktop-setting-icon">${icon('shield')}</span><span><strong>阅后即焚</strong><small>对方阅读消息后开始倒计时，到期后双方不可见。</small></span><label class="desktop-switch"><input type="checkbox" data-chat-burn-toggle ${settings.burnEnabled ? 'checked' : ''} ${disabled ? 'disabled' : ''} /><i></i></label></div>${desktopBurnOptionsMarkup(settings, disabled)}</section>
        <section class="desktop-chat-setting-card"><div class="desktop-chat-setting-heading"><span class="desktop-setting-icon">${icon('close')}</span><span><strong>自动删除记录</strong><small>从消息发送时开始计时，即使未读也会自动删除。</small></span><label class="desktop-switch"><input type="checkbox" data-chat-auto-delete-toggle ${settings.autoDeleteEnabled ? 'checked' : ''} ${disabled ? 'disabled' : ''} /><i></i></label></div><label class="desktop-setting-select ${settings.autoDeleteEnabled ? '' : 'is-disabled'}"><span>删除时间</span><select data-chat-auto-delete-select ${!settings.autoDeleteEnabled || disabled ? 'disabled' : ''}>${autoOptionMarkup}</select></label>${settings.peerAutoDeleteEnabled ? `<div class="desktop-peer-setting">对方已开启自动删除：${escapeHtml(desktopDurationLabel(settings.peerAutoDeleteSeconds))}</div>` : ''}</section>
        ${state.chatSettingsError ? `<div class="login-error">${escapeHtml(state.chatSettingsError)}</div>` : ''}
      </div>`
  return modalFrame('聊天设置', `${escapeHtml(selected?.name || '当前会话')} · 隐私与消息保留`, body)
}

function renderWalletPasswordModal() {
  const hasPassword = Boolean(state.walletSummary?.hasPaymentPassword)
  return modalFrame(hasPassword ? '修改支付密码' : '设置支付密码', '支付密码用于红包、转账等钱包操作。', `<form class="desktop-modal-form wallet-password-form" data-wallet-password-form><p class="wallet-password-tip">请输入6位数字支付密码${hasPassword ? '，修改前需要验证原支付密码' : ''}。</p>${hasPassword ? `<label><span>原支付密码</span><input name="oldPassword" type="password" inputmode="numeric" maxlength="6" autocomplete="current-password" value="${escapeHtml(state.walletOldPassword)}" placeholder="请输入原支付密码" /></label>` : ''}<label><span>新支付密码</span><input name="newPassword" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" value="${escapeHtml(state.walletNewPassword)}" placeholder="请输入6位数字" /></label><label><span>确认新密码</span><input name="confirmPassword" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" value="${escapeHtml(state.walletConfirmPassword)}" placeholder="请再次输入" /></label>${state.walletPasswordError ? `<div class="login-error">${escapeHtml(state.walletPasswordError)}</div>` : ''}<button class="btn btn-primary" type="submit" ${state.walletPasswordBusy ? 'disabled' : ''}>${state.walletPasswordBusy ? '提交中…' : (hasPassword ? '确认修改' : '确认设置')}</button></form>`)
}

function renderWalletDetailModal() {
  if (state.walletDetailLoading) return modalFrame('收支详情', '正在加载交易信息。', '<div class="desktop-modal-hint">正在加载…</div>')
  const item = state.walletDetail
  if (!item) return modalFrame('收支详情', '交易记录', '<div class="desktop-modal-empty">收支记录不存在</div>')
  return modalFrame('收支详情', walletTradeLabel(item.trade_type), `<div class="wallet-detail-body"><div class="wallet-detail-amount ${item.direction === 'IN' ? 'is-in' : 'is-out'}">${item.direction === 'IN' ? '+' : '-'}${walletYuan(item.amount)}</div><div class="wallet-detail-grid"><div><span>收支类型</span><strong>${item.direction === 'IN' ? '收入' : '支出'}</strong></div><div><span>交易类型</span><strong>${walletTradeLabel(item.trade_type)}</strong></div>${item.counterparty_name ? `<div><span>交易对象</span><strong>${escapeHtml(item.counterparty_name)}</strong></div>` : ''}${item.remark ? `<div><span>备注</span><strong>${escapeHtml(item.remark)}</strong></div>` : ''}<div><span>交易后余额</span><strong>${walletYuan(item.balance_after)}</strong></div><div><span>交易时间</span><strong>${escapeHtml(walletFormatTime(item.created_at))}</strong></div><div class="wallet-trade-no"><span>交易单号</span><strong>${escapeHtml(item.trade_no)}</strong></div></div></div>`)
}

function renderAccountDeletionAgreementModal() {
  const agreement = state.accountDeletionAgreement || { title: '账号注销协议', content: '' }
  const hasBalance = Number(state.accountDeletionBalance || 0) > 0
  const loading = state.accountDeletionAgreementLoading
  const body = loading
    ? '<div class="desktop-modal-hint">正在加载注销协议和钱包信息…</div>'
    : `<div class="account-deletion-modal-body"><div class="account-deletion-agreement">${escapeHtml(agreement.content || '暂未配置账号注销协议，请联系管理员。')}</div>${hasBalance ? `<div class="account-deletion-warning">钱包当前余额为 ${walletYuan(state.accountDeletionBalance)}，注销后余额将无法找回，请确认是否继续注销。</div>` : ''}${state.accountDeletionError ? `<div class="login-error">${escapeHtml(state.accountDeletionError)}</div>` : ''}<label class="account-deletion-check"><input type="checkbox" data-account-deletion-agree ${state.accountDeletionAgreed ? 'checked' : ''} /><span>我已阅读并同意《${escapeHtml(agreement.title || '账号注销协议')}》</span></label><div class="desktop-modal-actions"><button class="btn" type="button" data-modal-close>取消</button><button class="btn btn-danger" type="button" data-account-deletion-continue>同意并继续</button></div></div>`
  return modalFrame(agreement.title || '账号注销协议', '请仔细阅读协议，确认余额提示和注销风险后继续。', body)
}

function renderConfirmModal() {
  const type = state.confirmDialog?.type
  const isMessage = type === 'delete-message'
  const isNotification = type === 'delete-notification'
  const isNotificationClear = type === 'clear-notifications'
  const isSwitchAccount = type === 'switch-account'
  const isLogout = type === 'logout'
  const isDeleteAccount = type === 'delete-account'
  const isRevokeDevice = type === 'revoke-device'
  const isRevokeOthers = type === 'revoke-other-devices'
  const isMoment = type === 'delete-moment'
  const isFavorites = type === 'delete-favorites'
  const isFavorite = type === 'delete-favorite'
  const isConversationClearChoice = type === 'choose-conversation-clear'
  const isConversationClear = type === 'clear-conversation'
  const isDeleteFriend = type === 'delete-friend'
  const isBlockFriend = type === 'block-friend'
  const isUnblockFriend = type === 'unblock-friend'
  const isGroupAction = type === 'group-action'
  if (type === 'clear-storage') {
    const kind = state.confirmDialog?.kind || ''
    const labels = { image: '图片', video: '视频', audio: '音频', file: '文件' }
    const label = labels[kind] || '聊天'
    return modalFrame(`清除${label}缓存`, '只删除当前电脑的本地聊天缓存', `<div class="confirm-dialog-body"><p>确定要清除本机的${label}缓存吗？消息记录、fileId、服务器对象、收藏/转发引用和另存为文件都会保留。</p><div class="confirm-dialog-actions"><button class="btn" type="button" data-confirm-cancel>取消</button><button class="btn btn-danger" type="button" data-confirm-submit>清除缓存</button></div></div>`)
  }
  if (type === 'disable-lock-screen') {
    return modalFrame('关闭锁屏密码', '关闭后当前电脑将不再需要锁屏密码', '<div class="confirm-dialog-body"><p>确定要关闭当前电脑的锁屏密码吗？关闭后仍可随时重新设置。</p><div class="confirm-dialog-actions"><button class="btn" type="button" data-confirm-cancel>暂不关闭</button><button class="btn btn-danger" type="button" data-confirm-submit>关闭密码</button></div></div>')
  }
  if (isConversationClearChoice) {
    const groupLabel = state.confirmDialog?.group ? '群聊' : '私聊'
    const bothLabel = state.confirmDialog?.group ? '双向清除（所有成员不可见）' : '双向删除（双方不可见）'
    return modalFrame('选择清理范围', `清除“${escapeHtml(state.confirmDialog?.conversationName || groupLabel)}”的聊天记录`, `<div class="conversation-clear-options"><p>请选择${groupLabel}聊天记录的清理范围，选择后还会再次确认。</p><button type="button" class="conversation-clear-option" data-conversation-clear-scope="self"><span><strong>单向清除</strong><small>仅从我的账号清除聊天记录</small></span>${icon('arrow')}</button><button type="button" class="conversation-clear-option danger" data-conversation-clear-scope="both"><span><strong>${bothLabel}</strong><small>此操作会影响${state.confirmDialog?.group ? '群内所有成员' : '你和对方'}</small></span>${icon('arrow')}</button><div class="desktop-modal-actions"><button class="btn" type="button" data-modal-close>取消</button></div></div>`)
  }
  if (isGroupAction) {
    const labels = {
      admin: '\u66f4\u6539\u7ba1\u7406\u5458\u6743\u9650',
      mute: '\u53d8\u66f4\u8be5\u6210\u5458\u7684\u7981\u8a00\u72b6\u6001',
      remove: `\u5c06\u300c${escapeHtml(state.confirmDialog?.nickname || '\u8be5\u6210\u5458')}\u300d\u79fb\u51fa\u7fa4\u804a`,
      transfer: `\u5c06\u7fa4\u4e3b\u8f6c\u8ba9\u7ed9\u300c${escapeHtml(state.confirmDialog?.nickname || '\u8be5\u6210\u5458')}\u300d`,
      leave: '\u9000\u51fa\u5f53\u524d\u7fa4\u804a',
      dissolve: '\u89e3\u6563\u5f53\u524d\u7fa4\u804a',
    }
    return modalFrame('\u786e\u8ba4\u7fa4\u64cd\u4f5c', '\u8fd9\u9879\u64cd\u4f5c\u4f1a\u540c\u6b65\u5230\u7fa4\u5185\u6210\u5458', `<div class="confirm-dialog-body"><p>${labels[state.confirmDialog?.action] || '\u786e\u8ba4\u6267\u884c\u8be5\u64cd\u4f5c'}</p><div class="confirm-dialog-actions"><button class="btn" type="button" data-confirm-cancel>\u53d6\u6d88</button><button class="btn btn-primary" type="button" data-confirm-submit>\u786e\u8ba4</button></div></div>`)
  }
  const title = isDeleteAccount ? '确认注销账号' : isLogout ? '\u9000\u51fa\u767b\u5f55' : isSwitchAccount ? '切换账号' : isRevokeDevice || isRevokeOthers ? '退出登录设备' : isMoment ? '删除动态' : isMessage ? '删除消息' : isNotificationClear ? '清空通知' : isNotification ? '删除通知' : isDeleteFriend ? '删除好友' : isBlockFriend ? '拉黑联系人' : isUnblockFriend ? '解除拉黑' : isConversationClear ? '清除聊天记录' : isFavorites || isFavorite ? '取消收藏' : '删除会话'
  const messageMode = state.confirmDialog?.mode === 'both' ? '双向删除' : '单向删除'
  const clearMode = state.confirmDialog?.scope === 'both' ? (state.confirmDialog?.group ? '双向清除' : '双向删除') : '单向清除'
  const subtitle = isDeleteAccount ? '注销后无法恢复，系统会删除当前账号的数据' : isLogout ? '\u9000\u51fa\u540e\u9700\u8981\u91cd\u65b0\u767b\u5f55' : isSwitchAccount ? '当前账号会退出登录' : isRevokeDevice || isRevokeOthers ? '退出后，该设备需要重新登录' : isMoment ? '删除后，这条动态将从朋友圈移除' : isMessage ? `${messageMode} · 删除后将无法恢复` : isDeleteFriend ? '删除后将解除好友关系，并清空本端聊天记录' : isBlockFriend ? '拉黑后将限制对方与你联系' : isUnblockFriend ? '解除后，对方可以继续与你联系' : isConversationClear ? `${clearMode} · 清除后将无法恢复` : isNotificationClear || isNotification ? '删除后将从当前账号的通知列表中移除' : isFavorites || isFavorite ? '取消后，这条收藏将从当前列表移除' : '会话将从当前列表移除'
  const description = isDeleteAccount
    ? (Number(state.accountDeletionBalance || 0) > 0
      ? `当前钱包余额为 ${walletYuan(state.accountDeletionBalance)}，注销后余额将无法找回。仍要注销当前账号吗？`
      : '我已阅读并同意注销协议，确认注销当前账号。')
    : isLogout
    ? '\u786e\u5b9a\u8981\u9000\u51fa\u5f53\u524d\u8d26\u53f7\u5417\uff1f'
    : isSwitchAccount
    ? '确定要退出当前账号并登录其他账号吗？'
    : isRevokeDevice
      ? `确定要退出“${escapeHtml(state.confirmDialog?.deviceName || '该设备')}”吗？`
      : isRevokeOthers
        ? '确定要退出除当前设备外的所有登录设备吗？'
    : isMoment
      ? '确定要删除这条动态吗？'
    : isMessage
      ? `确定要${messageMode} ${state.confirmDialog?.messageIds?.length > 1 ? `${state.confirmDialog.messageIds.length} 条消息` : '这条消息'}吗？`
      : isNotificationClear
      ? '确定要清空全部通知吗？清空后不可恢复。'
      : isNotification
      ? '确定要删除这条通知吗？'
      : isFavorite
      ? '确定要取消收藏这条内容吗？'
    : isFavorites
      ? `确定要删除选中的 ${state.confirmDialog?.favoriteIds?.length || 0} 条收藏吗？`
      : isDeleteFriend
      ? `确定要删除好友“${escapeHtml(state.confirmDialog?.nickname || '该联系人')}”吗？`
      : isBlockFriend
      ? `确定要拉黑“${escapeHtml(state.confirmDialog?.nickname || '该联系人')}”吗？`
      : isUnblockFriend
      ? `确定要解除对“${escapeHtml(state.confirmDialog?.nickname || '该联系人')}”的拉黑吗？`
      : isConversationClear
      ? `确定要${clearMode}“${escapeHtml(state.confirmDialog?.conversationName || '当前会话')}”的聊天记录吗？`
      : '删除后，收到新消息时该会话会重新出现在列表中。'
  const cancelLabel = isDeleteAccount ? '暂不注销' : isLogout ? '\u53d6\u6d88\u9000\u51fa' : isSwitchAccount ? '取消切换' : '取消'
  const submitLabel = isDeleteAccount ? '确认注销' : isLogout ? '\u9000\u51fa\u767b\u5f55' : isSwitchAccount ? '切换账号' : isRevokeDevice || isRevokeOthers ? '退出设备' : isNotificationClear ? '全部清空' : isConversationClear ? '确认清除' : isDeleteFriend ? '删除好友' : isBlockFriend ? '拉黑' : isUnblockFriend ? '解除拉黑' : isFavorite || isFavorites ? '取消收藏' : '删除'
  const submitClass = isSwitchAccount ? 'btn btn-primary' : 'btn btn-danger'
  return modalFrame(title, subtitle, `<div class="confirm-dialog-body"><p>${description}</p><div class="confirm-dialog-actions"><button class="btn" type="button" data-confirm-cancel>${cancelLabel}</button><button class="${submitClass}" type="button" data-confirm-submit>${submitLabel}</button></div></div>`)
}

async function confirmDialogAction() {
  const dialog = state.confirmDialog
  state.confirmDialog = null
  state.modal = ''
  if (!dialog) return
  if (dialog.type === 'delete-message') await handleMessageAction(dialog.mode === 'both' ? 'delete-both' : 'delete-self', dialog.messageIds || dialog.messageId, true)
  else if (dialog.type === 'delete-notification') dismissDesktopNotification(dialog.notificationType, dialog.notificationId)
  else if (dialog.type === 'clear-notifications') clearDesktopNotifications()
    else if (dialog.type === 'clear-storage') await clearDesktopStorage(dialog.kind || '')
  else if (dialog.type === 'disable-lock-screen') disableDesktopLockPassword()
  else if (dialog.type === 'delete-moment') await removeMoment(dialog.momentId, true)
  else if (dialog.type === 'delete-favorite') await removeFavorite(dialog.favoriteId)
  else if (dialog.type === 'delete-favorites') await removeSelectedFavorites(dialog.favoriteIds)
  else if (dialog.type === 'delete-conversation') await handleConversationAction(dialog.index, 'remove', true)
  else if (dialog.type === 'clear-conversation') await executeDesktopConversationClear(dialog)
  else if (dialog.type === 'delete-friend') await executeDesktopFriendDelete(dialog)
  else if (dialog.type === 'block-friend' || dialog.type === 'unblock-friend') await executeDesktopFriendBlock(dialog)
  else if (dialog.type === 'switch-account') switchDesktopAccount()
  else if (dialog.type === 'logout') performDesktopLogout()
  else if (dialog.type === 'delete-account') await executeDesktopAccountDeletion()
  else if (dialog.type === 'revoke-device') await revokeDeviceSession(dialog.deviceId)
  else if (dialog.type === 'revoke-other-devices') await revokeOtherDeviceSessions()
  else if (dialog.type === 'group-action') await executeDesktopGroupAction(dialog)
}

function renderMessageForwardModal() {
  const selected = conversations[state.selectedConversation]
  const targets = conversations.filter((item) => String(item.id || '') !== String(selected?.id || ''))
  const selectedTargets = state.messageForwardTargets
  const targetRows = targets.length
    ? targets.map((item) => {
      const id = String(item.id || '')
      const active = selectedTargets.has(id)
      return `<button class="desktop-result-row ${active ? 'is-selected' : ''}" type="button" data-message-forward-target="${escapeHtml(id)}"><span class="result-avatar">${avatar(item, 'avatar-small')}</span><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.tag || (item.type === 'group' ? '群聊' : '联系人'))}</small></span><span class="message-forward-check">${active ? '✓' : ''}</span></button>`
    }).join('')
    : '<div class="desktop-modal-empty">暂无可转发的其他会话</div>'
  const mode = state.messageForwardIds.length > 1
    ? `<div class="desktop-forward-mode"><span>多条消息转发方式</span><button type="button" class="${state.messageForwardMode === 'merge' ? 'is-active' : ''}" data-message-forward-mode="merge">合并转发</button><button type="button" class="${state.messageForwardMode === 'separate' ? 'is-active' : ''}" data-message-forward-mode="separate">逐条转发</button></div>`
    : ''
  const body = `<div class="desktop-modal-forward"><p class="desktop-modal-hint">已选择 ${state.messageForwardIds.length} 条消息，请选择目标会话。</p><div class="desktop-modal-results">${targetRows}</div>${mode}${state.modalError ? `<div class="login-error">${escapeHtml(state.modalError)}</div>` : ''}<div class="desktop-modal-actions"><button class="btn" type="button" data-modal-close>取消</button><button class="btn btn-primary" type="button" data-message-forward-submit ${state.modalBusy ? 'disabled' : ''}>${state.modalBusy ? '转发中…' : '确认转发'}</button></div></div>`
  return modalFrame('转发消息', '选择一个或多个联系人、群聊。', body)
}

function renderFavoriteForwardModal() {
  const targets = conversations
  const selectedTargets = state.favoriteForwardTargets
  const targetRows = targets.length
    ? targets.map((item) => {
      const id = String(item.id || '')
      const active = selectedTargets.has(id)
      return `<button class="desktop-result-row ${active ? 'is-selected' : ''}" type="button" data-favorite-forward-target="${escapeHtml(id)}"><span class="result-avatar">${avatar(item, 'avatar-small')}</span><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.tag || (item.type === 'group' ? '群聊' : '联系人'))}</small></span><span class="message-forward-check">${active ? '✓' : ''}</span></button>`
    }).join('')
    : '<div class="desktop-modal-empty">暂无可转发的会话</div>'
  const body = `<div class="desktop-modal-forward"><p class="desktop-modal-hint">已选择 ${state.favoriteForwardIds.length} 条收藏，请选择一个或多个目标会话。</p><div class="desktop-modal-results">${targetRows}</div>${state.modalError ? `<div class="login-error">${escapeHtml(state.modalError)}</div>` : ''}<div class="desktop-modal-actions"><button class="btn" type="button" data-modal-close>取消</button><button class="btn btn-primary" type="button" data-favorite-forward-submit ${state.modalBusy ? 'disabled' : ''}>${state.modalBusy ? '转发中…' : '确认转发'}</button></div></div>`
  return modalFrame('转发收藏', '选择一个或多个联系人、群聊。', body)
}

function openDesktopAddGroupModal() {
  state.modal = 'add-group'
  state.groupSearchQuery = ''
  state.groupSearchResults = []
  state.groupSearchBusy = false
  state.groupSearchError = ''
  render()
}

async function runDesktopGroupSearch(keyword = state.groupSearchQuery) {
  const query = String(keyword || '').trim()
  state.groupSearchQuery = String(keyword || '')
  state.groupSearchError = ''
  if (!query) {
    state.groupSearchResults = []
    state.groupSearchBusy = false
    render()
    return
  }
  state.groupSearchBusy = true
  render()
  try {
    if (state.dataSource === 'remote') {
      state.groupSearchResults = await searchDesktopGroups(query)
    } else {
      state.groupSearchResults = conversations
        .filter((item) => isGroupConversation(item) && `${item.name} ${item.preview}`.toLowerCase().includes(query.toLowerCase()))
        .map((item) => ({ id: String(item.id), pulseId: formatDesktopGroupPulseId(item.id), title: item.name, avatarUrl: item.avatarUrl, notice: item.preview, memberCount: 0, joined: true, joinVerifyRequired: false, joinPending: false }))
    }
  } catch (error) {
    state.groupSearchResults = []
    state.groupSearchError = error instanceof Error ? error.message : '\u641c\u7d22\u7fa4\u804a\u5931\u8d25'
  } finally {
    state.groupSearchBusy = false
    render()
  }
}

async function joinDesktopSearchGroup(group) {
  if (!group?.id || state.groupSearchBusy) return
  if (group.joined) {
    const index = conversations.findIndex((item) => String(item.id) === String(group.id))
    if (index >= 0) {
      resetModal()
      state.page = 'messages'
      state.selectedConversation = index
      render()
      void loadSelectedMessages()
      return
    }
  }
  state.groupSearchBusy = true
  state.groupSearchError = ''
  render()
  try {
    if (state.dataSource === 'remote') await joinDesktopGroup(String(group.id), 'search')
    resetModal()
    showToast(group.joinVerifyRequired ? '\u5df2\u63d0\u4ea4\u52a0\u7fa4\u7533\u8bf7\uff0c\u8bf7\u7b49\u5f85\u5ba1\u6838' : '\u5df2\u52a0\u5165\u7fa4\u804a')
    void refreshDesktopData()
  } catch (error) {
    state.groupSearchBusy = false
    state.groupSearchError = error instanceof Error ? error.message : '\u52a0\u5165\u7fa4\u804a\u5931\u8d25'
    render()
  }
}

function renderDesktopAddGroupModal() {
  const results = state.groupSearchResults || []
  const rows = results.length
    ? results.map((group) => `<button type="button" class="desktop-result-row" data-desktop-group-result="${escapeHtml(group.id)}"><span class="result-avatar">${avatar({ name: group.title, avatarUrl: group.avatarUrl, tone: 'violet' }, 'avatar-small')}</span><span><strong>${escapeHtml(group.title)}</strong><small>群号 ${escapeHtml(group.pulseId)} · ${Number(group.memberCount || 0)} 人${group.ownerNickname ? ` · 群主 ${escapeHtml(group.ownerNickname)}` : ''}</small><small>${escapeHtml(group.notice || '暂无群公告')}</small></span><b>${group.joined ? '进入' : group.joinPending ? '审核中' : '加入'}</b></button>`).join('')
    : state.groupSearchQuery ? '<div class="desktop-modal-empty">没有找到可加入的群聊</div>' : '<div class="desktop-modal-hint">输入群号或群名称搜索。</div>'
  return modalFrame('\u6dfb\u52a0\u7fa4\u804a', '\u901a\u8fc7\u7fa4\u53f7\u6216\u7fa4\u540d\u79f0\u641c\u7d22\u7fa4\u804a', `<form class="desktop-modal-form" data-desktop-group-search-form><label><span>搜索群聊</span><input data-desktop-group-search-query value="${escapeHtml(state.groupSearchQuery)}" placeholder="群号或群名称" autocomplete="off" /><button class="btn btn-primary" type="submit" ${state.groupSearchBusy ? 'disabled' : ''}>${state.groupSearchBusy ? '搜索中…' : '搜索'} ${icon('search')}</button></label></form>${state.groupSearchError ? `<div class="login-error">${escapeHtml(state.groupSearchError)}</div>` : ''}<div class="desktop-modal-results">${rows}</div>`)
}

function renderNewMessageModal() {
  const groupMode = state.modalMode === 'group'
  const localContacts = contacts
    .filter((item) => !isDesktopFileTransferAssistant(item))
    .filter((item) => {
      const keyword = String(state.modalQuery || '').trim().toLowerCase()
      if (!keyword) return true
      return [item.name, item.nickname, item.remark, item.pulseId, item.userId]
        .some((value) => String(value || '').toLowerCase().includes(keyword))
    })
  const contactsResult = (state.modalResults?.contacts || (state.modalQuery ? [] : localContacts))
    .filter((item) => !groupMode || !isDesktopFileTransferAssistant(item))
  const groupsResult = state.modalResults?.groups || []
  const hasResults = contactsResult.length || groupsResult.length
  const results = hasResults
    ? `<div class="desktop-modal-results">
        ${contactsResult.length ? `<div class="desktop-modal-section-title">联系人</div>${contactsResult.map((item) => { const id = String(item.userId || ''); const selected = groupMode && state.groupCreateSelected.has(id); const action = groupMode ? `data-group-create-contact="${escapeHtml(id)}"` : `data-start-conversation="${escapeHtml(id)}"`; return `<button class="desktop-result-row ${selected ? 'is-selected' : ''}" ${action}><span class="result-avatar">${avatar({ name: item.nickname, avatarUrl: item.avatarUrl, tone: 'blue' }, 'avatar-small')}</span><span><strong>${escapeHtml(item.nickname)}</strong><small>${escapeHtml(item.subtitle || (item.online ? '在线' : '联系人'))}</small></span>${groupMode ? `<span class="message-forward-check">${selected ? '✓' : ''}</span>` : icon('arrow')}</button>` }).join('')}` : ''}
        ${!groupMode && groupsResult.length ? `<div class="desktop-modal-section-title">群组</div>${groupsResult.map((item) => `<button class="desktop-result-row" data-search-conversation="${escapeHtml(item.id)}"><span class="result-avatar">${avatar({ name: item.title, avatarUrl: item.avatarUrl, tone: 'violet' }, 'avatar-small')}</span><span><strong>${escapeHtml(item.title)}</strong><small>${item.memberCount || 0} 位成员</small></span>${icon('arrow')}</button>`).join('')}` : ''}
      </div>`
    : state.modalResults ? '<div class="desktop-modal-empty">没有找到匹配的联系人或群组</div>' : '<div class="desktop-modal-hint">输入昵称、Pulse ID 或手机号开始查找。</div>'
  const title = state.modalMode === 'group' ? '发起群聊' : '新建消息'
  const subtitle = state.modalMode === 'group' ? '选择下面的好友，或搜索其他联系人后创建群聊。' : '选择目标好友，或搜索联系人、群组后开始新的对话。'
  const groupComposer = groupMode
    ? `<section class="desktop-group-create-panel"><label><span>群聊名称</span><input data-group-create-title maxlength="32" value="${escapeHtml(state.groupCreateTitle)}" placeholder="例如：周末活动群" /></label><p>已选择 ${state.groupCreateSelected.size} 位联系人，至少选择 1 位。</p><button class="btn btn-primary" type="button" data-group-create-submit ${state.modalBusy ? 'disabled' : ''}>${state.modalBusy ? '创建中…' : '创建群聊'} ${icon('group')}</button></section>`
    : ''
  const contactHint = contacts.length && !state.modalQuery
    ? `<div class="desktop-modal-hint desktop-modal-list-hint">以下为已添加好友，可直接选择${groupMode ? '并勾选多位好友' : '开始聊天'}。</div>`
    : ''
  return modalFrame(title, subtitle, `<form class="desktop-modal-form" data-new-message-form><label><span>搜索联系人</span><input data-modal-query value="${escapeHtml(state.modalQuery)}" placeholder="昵称、Pulse ID 或手机号" autocomplete="off" /><button class="btn btn-primary" type="submit" ${state.modalBusy ? 'disabled' : ''}>${state.modalBusy ? '搜索中…' : '搜索'} ${icon('search')}</button></label>${state.modalError && !groupMode ? `<div class="login-error">${escapeHtml(state.modalError)}</div>` : ''}</form>${contactHint}${results}${groupComposer}${state.modalError && groupMode ? `<div class="login-error">${escapeHtml(state.modalError)}</div>` : ''}`)
}

function renderSearchModalLegacy() {
  const result = state.modalResults || { contacts: [], groups: [], conversations: [], messages: [] }
  const messageResults = result.conversations.length ? [] : result.messages
  const hasResults = result.contacts.length || result.groups.length || result.conversations.length || messageResults.length
  const contactLimit = Math.max(3, Number(state.modalContactLimit || 3))
  const visibleContacts = result.contacts.slice(0, contactLimit)
  const contactRows = visibleContacts.map((item) => {
    const action = item.fileTransferAssistant || item.nickname === '文件传输助手'
      ? `data-start-conversation="${escapeHtml(item.userId)}"`
      : `data-view-contact="${escapeHtml(item.userId)}"`
    return `<button class="desktop-result-row" ${action}><span class="result-avatar">${avatar({ name: item.nickname, avatarUrl: item.avatarUrl, tone: 'blue' }, 'avatar-small')}</span><span><strong>${escapeHtml(item.nickname)}</strong><small>${escapeHtml(item.subtitle || (item.online ? '在线' : '联系人'))}</small></span>${icon('arrow')}</button>`
  }).join('')
  const body = `<form class="desktop-modal-form" data-search-form><label><span>全局搜索</span><input data-modal-query value="${escapeHtml(state.modalQuery)}" placeholder="搜索联系人、会话或消息" autocomplete="off" /><button class="btn btn-primary" type="submit" ${state.modalBusy ? 'disabled' : ''}>${state.modalBusy ? '搜索中…' : '搜索'} ${icon('search')}</button></label>${state.modalError ? `<div class="login-error">${escapeHtml(state.modalError)}</div>` : ''}</form>${hasResults ? `<div class="desktop-modal-results">${result.contacts.length ? `<div class="desktop-modal-section-title">联系人</div>${contactRows}` : ''}${result.conversations.length ? `<div class="desktop-modal-section-title">会话</div>${result.conversations.map((item) => `<button class="desktop-result-row" data-search-conversation="${escapeHtml(item.conversationId)}"><span class="result-avatar">${avatar({ name: item.conversationTitle, avatarUrl: item.avatarUrl, tone: 'violet' }, 'avatar-small')}</span><span><strong>${escapeHtml(item.conversationTitle)}</strong><small>${escapeHtml(desktopPreviewText(item.preview, item.lastMsgType) || `${item.matchCount || 0} 条匹配消息`)}</small></span>${icon('arrow')}</button>`).join('')}` : ''}${messageResults.length ? `<div class="desktop-modal-section-title">消息</div>${messageResults.slice(0, 8).map((item) => `<button class="desktop-result-row" data-search-conversation="${escapeHtml(item.conversationId)}"><span class="result-avatar result-message-icon">${icon('chat')}</span><span><strong>${escapeHtml(item.conversationTitle)}</strong><small>${escapeHtml(desktopPreviewText(item.content, item.msgType))}</small></span>${icon('arrow')}</button>`).join('')}` : ''}</div>` : state.modalResults ? '<div class="desktop-modal-empty">没有找到相关内容</div>' : '<div class="desktop-modal-hint">输入关键词搜索整个 Pulse。</div>'}`
  return modalFrame('全局搜索', '搜索联系人、会话和历史消息。', body)
}

function renderSearchModal() {
  const result = state.modalResults || { contacts: [], groups: [], conversations: [], messages: [] }
  const contactOnly = state.searchMode === 'contact'
  const messageResults = result.conversations.length ? [] : result.messages
  const contactLimit = Math.max(3, Number(state.modalContactLimit || 3))
  const sections = []

  const contactResults = contactOnly
    ? result.contacts.filter((item) => !isDesktopFileTransferAssistant(item))
    : result.contacts
  if (contactResults.length) {
    const contacts = contactResults.slice(0, contactLimit).map((item) => {
      const action = item.fileTransferAssistant || item.nickname === '文件传输助手'
        ? `data-start-conversation="${escapeHtml(item.userId)}"`
        : `data-view-contact="${escapeHtml(item.userId)}"`
      return `<button class="desktop-result-row" ${action}><span class="result-avatar">${avatar({ name: item.nickname, avatarUrl: item.avatarUrl, tone: 'blue' }, 'avatar-small')}</span><span><strong>${escapeHtml(item.nickname)}</strong><small>${escapeHtml(item.subtitle || (item.online ? '在线' : '联系人'))}</small></span>${icon('arrow')}</button>`
    }).join('')
    const viewAll = contactResults.length > contactLimit
      ? '<button type="button" class="desktop-search-view-all" data-search-contact-more>查看全部</button>'
      : ''
    sections.push(`<div class="desktop-modal-section-title">联系人</div>${contacts}${viewAll}`)
  }
  if (!contactOnly && result.groups.length) {
    sections.push(`<div class="desktop-modal-section-title">群聊</div>${result.groups.map((item) => `<button class="desktop-result-row" data-search-group="${escapeHtml(item.id)}"><span class="result-avatar">${avatar({ name: item.title, avatarUrl: item.avatarUrl, tone: 'violet' }, 'avatar-small')}</span><span><strong>${escapeHtml(item.title)}</strong><small>${item.memberCount || 0} 位成员</small></span>${icon('arrow')}</button>`).join('')}`)
  }
  if (!contactOnly && result.conversations.length) {
    sections.push(`<div class="desktop-modal-section-title">聊天记录</div>${result.conversations.map((item) => `<button class="desktop-result-row" data-search-conversation="${escapeHtml(item.conversationId)}"><span class="result-avatar">${avatar({ name: item.conversationTitle, avatarUrl: item.avatarUrl, tone: 'violet' }, 'avatar-small')}</span><span><strong>${escapeHtml(item.conversationTitle)}</strong><small>${escapeHtml(desktopPreviewText(item.preview, item.latestMsgType) || `${item.matchCount || 0} 条相关聊天记录`)}</small></span>${icon('arrow')}</button>`).join('')}`)
  } else if (!contactOnly && messageResults.length) {
    sections.push(`<div class="desktop-modal-section-title">聊天记录</div>${messageResults.slice(0, 8).map((item) => `<button class="desktop-result-row" data-search-conversation="${escapeHtml(item.conversationId)}"><span class="result-avatar result-message-icon">${icon('chat')}</span><span><strong>${escapeHtml(item.conversationTitle)}</strong><small>${escapeHtml(desktopPreviewText(item.content, item.msgType))}</small></span>${icon('arrow')}</button>`).join('')}`)
  }

  const hasResults = sections.length > 0
  const title = contactOnly ? '添加好友' : '全局搜索'
  const subtitle = contactOnly ? '搜索昵称、Pulse ID 或手机号，选择联系人发送好友申请。' : '搜索联系人、群聊和聊天记录。'
  const label = contactOnly ? '查找好友' : '全局搜索'
  const placeholder = contactOnly ? '昵称、Pulse ID 或手机号' : '搜索联系人、群聊、聊天记录'
  const emptyText = contactOnly ? '没有找到可添加的联系人' : '没有找到相关内容'
  const hintText = contactOnly ? '输入昵称、Pulse ID 或手机号开始查找。' : '输入关键词搜索联系人、群聊和聊天记录。'
  const body = `<form class="desktop-modal-form" data-search-form><label><span>${label}</span><input data-modal-query value="${escapeHtml(state.modalQuery)}" placeholder="${placeholder}" autocomplete="off" /><button class="btn btn-primary" type="submit" ${state.modalBusy ? 'disabled' : ''}>${state.modalBusy ? '搜索中…' : '搜索'} ${icon('search')}</button></label>${state.modalError ? `<div class="login-error">${escapeHtml(state.modalError)}</div>` : ''}</form>${hasResults ? `<div class="desktop-modal-results">${sections.join('')}</div>` : state.modalResults ? `<div class="desktop-modal-empty">${emptyText}</div>` : `<div class="desktop-modal-hint">${hintText}</div>`}`
  return modalFrame(title, subtitle, body)
}

function desktopSearchMessagePreview(content) {
  return desktopPreviewText(content)
}

function renderContactModal() {
  const profile = state.modalProfile || {}
  const isFriend = profile.friendStatus === 'friend' || profile.friend || profile.friendStatus === 'blocked'
  const isBlocked = Boolean(profile.blocked) || profile.friendStatus === 'blocked'
  const status = isBlocked ? '已拉黑' : isFriend ? '已是联系人' : profile.friendStatus === 'pending_sent' ? '好友申请已发送' : '还不是联系人'
  const sourceLabels = {
    phone: '手机号',
    pulse_id: 'Pulse ID',
    id: 'Pulse ID',
    group: '群聊',
    qrcode: '二维码',
    qr: '二维码',
    card: '名片',
    deleted_chat: '聊天记录',
    deleted: '聊天记录',
    default_friend: '系统默认',
    admin: '管理员',
  }
  const sourceKey = String(profile.friendAddSource || '').toLowerCase()
  const sourceLabel = sourceLabels[sourceKey] || (sourceKey ? '好友验证' : '')
  const sourceTime = profile.friendSince ? formatRemoteTime(profile.friendSince) : ''
  const sourceText = sourceLabel ? `${sourceLabel}${sourceTime ? ` · ${sourceTime}成为好友` : ''}` : '暂无好友来源记录'
  const displayName = String(profile.displayName || profile.remark || profile.nickname || '用户').trim() || '用户'
  const managedDefaultFriend = sourceKey === 'default_friend' || Boolean(profile.fileTransferAssistant)
  const canDeleteFriend = isFriend
    && !managedDefaultFriend
    && String(profile.userId || '') !== String(state.profile.userId || '')
  const canBlockFriend = isFriend
    && !managedDefaultFriend
    && String(profile.userId || '') !== String(state.profile.userId || '')
  const remarkDetails = isFriend
    ? `<section class="desktop-profile-section"><div class="desktop-profile-section-title">好友设置</div>${managedDefaultFriend
      ? `<button type="button" class="desktop-profile-setting-row is-disabled" data-contact-remark-disabled><span><strong>好友备注</strong><small>平台默认好友由后台统一管理，不支持修改</small></span>${icon('lock')}</button>`
      : `<button type="button" class="desktop-profile-setting-row" data-contact-remark-edit><span><strong>好友备注</strong><small>${escapeHtml(profile.remark || '暂未设置')}</small></span>${icon('edit')}</button>`}</section>`
    : ''
  const moments = state.modalProfileMoments || []
  const momentBody = state.modalProfileMomentsLoading
    ? '<div class="desktop-profile-loading">正在加载朋友圈…</div>'
    : state.modalProfileMomentsError
      ? `<div class="desktop-profile-error">${escapeHtml(state.modalProfileMomentsError)}</div>`
      : moments.length
        ? `<div class="desktop-profile-moment-list">${moments.slice(0, 3).map((item) => `<button type="button" class="desktop-profile-moment" data-contact-moment="${escapeHtml(item.id)}"><span>${escapeHtml(item.content || '分享了一条朋友圈')}</span><small>${escapeHtml(momentTime(item.createdAt))}${item.images?.length ? ` · ${item.images.length} 张图片` : ''}</small></button>`).join('')}</div><div class="desktop-profile-section-foot">共 ${moments.length} 条动态</div>`
        : '<div class="desktop-profile-empty">暂无可见朋友圈</div>'
  const groups = state.modalProfileCommonGroups || []
  const groupBody = state.modalProfileCommonGroupsLoading
    ? '<div class="desktop-profile-loading">正在加载共同群聊…</div>'
    : state.modalProfileCommonGroupsError
      ? `<div class="desktop-profile-error">${escapeHtml(state.modalProfileCommonGroupsError)}</div>`
      : groups.length
        ? `<div class="desktop-profile-group-list">${groups.slice(0, 6).map((group) => `<button type="button" class="desktop-profile-group" data-contact-group="${escapeHtml(group.id)}"><span class="desktop-profile-group-avatar">${avatar({ name: group.title, avatarUrl: group.avatarUrl, tone: 'violet' }, 'avatar-small')}</span><span><strong>${escapeHtml(group.title)}</strong><small>${group.memberCount ? `${group.memberCount} 人` : '共同群聊'}</small></span>${icon('arrow')}</button>`).join('')}</div>${groups.length > 6 ? `<div class="desktop-profile-section-foot">还有 ${groups.length - 6} 个共同群聊</div>` : ''}`
        : '<div class="desktop-profile-empty">暂无共同群聊</div>'
  const details = `<div class="desktop-profile-details"><section class="desktop-profile-section"><div class="desktop-profile-section-title">好友来源</div><div class="desktop-profile-source">${icon('link')}<span>${escapeHtml(sourceText)}</span></div></section>${remarkDetails}<section class="desktop-profile-section desktop-profile-section-clickable" data-contact-section="moments" role="button" tabindex="0" aria-label="查看朋友圈"><div class="desktop-profile-section-heading"><div class="desktop-profile-section-title">朋友圈</div><span class="desktop-profile-section-chevron">${icon('arrow')}</span></div>${momentBody}</section><section class="desktop-profile-section desktop-profile-section-clickable" data-contact-section="groups" role="button" tabindex="0" aria-label="查看共同群聊"><div class="desktop-profile-section-heading"><div class="desktop-profile-section-title">共同群聊${profile.commonGroupCount ? ` · ${profile.commonGroupCount}` : ''}</div><span class="desktop-profile-section-chevron">${icon('arrow')}</span></div>${groupBody}</section></div>`
  return modalFrame('联系人资料', '查看资料或直接开始聊天。', `<div class="desktop-profile-modal">${avatar({ name: displayName, avatarUrl: profile.avatarUrl, tone: 'blue' }, 'avatar-xl')}<h2>${escapeHtml(displayName)}</h2>${displayName !== profile.nickname && profile.nickname ? `<p class="desktop-profile-original-name">昵称：${escapeHtml(profile.nickname)}</p>` : ''}<p class="desktop-profile-id">Pulse ID ${escapeHtml(profile.pulseId || profile.userId || '')} <button type="button" class="desktop-copy-inline" data-contact-copy-pulse="${escapeHtml(profile.pulseId || profile.userId || '')}">复制</button></p><p class="desktop-profile-signature">${escapeHtml(profile.signature || '这个人还没有填写个性签名。')}</p><span class="profile-tag">${status}</span>${details}<div class="desktop-profile-actions"><button class="btn btn-primary" data-contact-start="${escapeHtml(profile.userId || '')}">${icon('chat')} 开始聊天</button>${status === '还不是联系人' ? `<button class="btn" data-contact-add="${escapeHtml(profile.userId || '')}" ${state.modalBusy ? 'disabled' : ''}>${icon('person')} ${state.modalBusy ? '发送中…' : '添加联系人'}</button>` : ''}${canDeleteFriend ? `<button class="btn btn-danger" data-contact-delete="${escapeHtml(profile.userId || '')}">${icon('trash')} 删除好友</button>` : ''}${canBlockFriend ? `<button class="btn btn-danger" data-contact-block="${escapeHtml(profile.userId || '')}" data-contact-block-mode="${isBlocked ? 'unblock' : 'block'}">${icon('shield')} ${isBlocked ? '解除拉黑' : '拉黑'}</button>` : ''}</div>${state.modalError ? `<div class="login-error">${escapeHtml(state.modalError)}</div>` : ''}</div>`, 'desktop-contact-profile-modal')
}

function renderContactMomentsModal() {
  const profile = state.modalProfile || {}
  const moments = state.modalProfileMoments || []
  const body = state.modalProfileMomentsLoading
    ? '<div class="desktop-modal-hint">正在加载朋友圈…</div>'
    : state.modalProfileMomentsError
      ? `<div class="desktop-profile-error desktop-contact-content-state">${escapeHtml(state.modalProfileMomentsError)}</div>`
      : moments.length
        ? `<div class="desktop-contact-content-list">${moments.map((item) => `<button type="button" class="desktop-contact-content-row" data-contact-moment="${escapeHtml(item.id)}"><span class="result-avatar">${avatar({ ...item, name: item.nickname || profile.nickname || '用户', tone: 'blue' }, 'avatar-small')}</span><span><strong>${escapeHtml(item.content || '分享了一条朋友圈')}</strong><small>${escapeHtml(momentTime(item.createdAt))}${item.images?.length ? ` · ${item.images.length} 张图片` : ''}</small></span>${icon('arrow')}</button>`).join('')}</div>`
        : '<div class="desktop-modal-empty">暂无可见朋友圈</div>'
  const actions = `<div class="desktop-contact-content-actions"><button type="button" class="btn" data-contact-profile-back>${icon('arrow')} 返回联系人资料</button></div>`
  return modalFrame(`${profile.nickname || '联系人'}的朋友圈`, '查看对方公开的动态内容。', `<div class="desktop-contact-content-modal">${body}${actions}</div>`)
}

function renderContactGroupsModal() {
  const profile = state.modalProfile || {}
  const groups = state.modalProfileCommonGroups || []
  const body = state.modalProfileCommonGroupsLoading
    ? '<div class="desktop-modal-hint">正在加载共同群聊…</div>'
    : state.modalProfileCommonGroupsError
      ? `<div class="desktop-profile-error desktop-contact-content-state">${escapeHtml(state.modalProfileCommonGroupsError)}</div>`
      : groups.length
        ? `<div class="desktop-contact-content-list">${groups.map((group) => `<button type="button" class="desktop-contact-content-row" data-contact-group="${escapeHtml(group.id)}"><span class="result-avatar">${avatar({ name: group.title, avatarUrl: group.avatarUrl, tone: 'violet' }, 'avatar-small')}</span><span><strong>${escapeHtml(group.title)}</strong><small>${group.memberCount ? `${group.memberCount} 人` : '共同群聊'}</small></span>${icon('arrow')}</button>`).join('')}</div>`
        : '<div class="desktop-modal-empty">暂无共同群聊</div>'
  const actions = `<div class="desktop-contact-content-actions"><button type="button" class="btn" data-contact-profile-back>${icon('arrow')} 返回联系人资料</button></div>`
  return modalFrame(`${profile.nickname || '联系人'}的共同群聊`, '查看你们共同加入的群聊，点击即可进入会话。', `<div class="desktop-contact-content-modal">${body}${actions}</div>`)
}

function renderNotificationsModalLegacy() {
  const requests = state.friendRequests || []
  const body = requests.length ? `<div class="desktop-modal-results">${requests.map((item) => `<div class="desktop-request-row"><span class="result-avatar">${avatar({ name: item.nickname, avatarUrl: item.avatarUrl, tone: 'blue' }, 'avatar-small')}</span><span><strong>${escapeHtml(item.nickname)}</strong><small>${escapeHtml(item.message || '请求添加你为联系人')}</small></span><button class="request-action accept" data-friend-action="accept" data-request-id="${escapeHtml(item.id)}">${icon('check')}</button><button class="request-action reject" data-friend-action="reject" data-request-id="${escapeHtml(item.id)}">${icon('close')}</button></div>`).join('')}</div>` : '<div class="desktop-modal-empty">暂无新的好友申请</div>'
  return modalFrame('通知', '好友申请和账号动态会显示在这里。', `${state.modalBusy ? '<div class="desktop-modal-hint">正在同步通知…</div>' : ''}${body}`)
}

function friendRequestStatusText(item) {
  if (Number(item.status || 0) === 1) return '已通过'
  if (Number(item.status || 0) === 2) return '已拒绝'
  return item.direction === 'outgoing' ? '已发送，等待对方处理' : '等待你处理'
}

function renderDesktopNotificationDeleteAction(type, id) {
  return `<button type="button" class="request-action notification-delete-action" data-notification-delete-type="${escapeHtml(type)}" data-notification-delete-id="${escapeHtml(id)}" aria-label="删除通知" title="删除通知">${icon('trash')}</button>`
}

function renderFriendRequestRow(item) {
  const pending = Number(item.status || 0) === 0
  const incoming = item.direction !== 'outgoing'
  const actions = pending && incoming
    ? `<button class="request-action accept" data-friend-action="accept" data-request-id="${escapeHtml(item.id)}" aria-label="同意">${icon('check')}</button><button class="request-action reject" data-friend-action="reject" data-request-id="${escapeHtml(item.id)}" aria-label="拒绝">${icon('close')}</button>`
    : `<span class="request-status ${Number(item.status || 0) === 1 ? 'is-success' : ''}">${friendRequestStatusText(item)}</span>`
  return `<div class="desktop-request-row"><span class="result-avatar">${avatar({ name: item.nickname, avatarUrl: item.avatarUrl, tone: 'blue' }, 'avatar-small')}</span><span><strong>${escapeHtml(item.nickname || '用户')}</strong><small>${escapeHtml(item.message || (incoming ? '请求添加你为好友' : '你发起了好友申请'))} · ${escapeHtml(formatRemoteTime(item.createdAt))}</small></span>${actions}${renderDesktopNotificationDeleteAction('friend', item.id)}</div>`
}

function renderGroupNotificationRow(item, actionPrefix, incoming = true) {
  const pending = Number(item.status || 0) === 0
  const actions = pending
    ? actionPrefix === 'invite'
      ? `<button class="request-action accept" data-group-action="accept-invite" data-request-id="${escapeHtml(item.id)}" aria-label="同意入群">${icon('check')}</button><button class="request-action reject" data-group-action="reject-invite" data-request-id="${escapeHtml(item.id)}" aria-label="拒绝入群">${icon('close')}</button>`
      : `<button class="request-action accept" data-group-action="approve-join" data-request-id="${escapeHtml(item.id)}" data-conversation-id="${escapeHtml(item.conversationId)}" aria-label="同意入群申请">${icon('check')}</button><button class="request-action reject" data-group-action="reject-join" data-request-id="${escapeHtml(item.id)}" data-conversation-id="${escapeHtml(item.conversationId)}" aria-label="拒绝入群申请">${icon('close')}</button>`
    : `<span class="request-status">${Number(item.status || 0) === 1 ? '已处理' : '已结束'}</span>`
  const name = incoming ? item.inviterNickname || item.applicantNickname : item.applicantNickname
  const detail = actionPrefix === 'invite' ? `${name || '有人'} 邀请你加入「${item.groupTitle || '群聊'}」` : `${name || '有人'} 申请加入「${item.groupTitle || '群聊'}」`
  const message = String(item.message || detail)
    .replace(/\brole_owner\b/gi, '群主')
    .replace(/\brole_admin\b/gi, '管理员')
    .replace(/\brole_member\b/gi, '群成员')
  return `<div class="desktop-request-row"><span class="result-avatar">${avatar({ name, avatarUrl: item.applicantAvatarUrl, tone: 'violet' }, 'avatar-small')}</span><span><strong>${escapeHtml(name || '用户')}</strong><small>${escapeHtml(message)} · ${escapeHtml(formatRemoteTime(item.createdAt))}</small></span>${actions}${renderDesktopNotificationDeleteAction(actionPrefix === 'invite' ? 'group-invite' : 'group-join', item.id)}</div>`
}

function momentInteractionTypeLabel(type) {
  if (type === 'like') return '\u70b9\u8d5e\u4e86\u4f60\u7684\u670b\u53cb\u5708'
  if (type === 'mention') return '\u5728\u670b\u53cb\u5708\u4e2d\u63d0\u9192\u4e86\u4f60'
  if (type === 'reply') return '\u56de\u590d\u4e86\u4f60\u7684\u8bc4\u8bba'
  return '\u8bc4\u8bba\u4e86\u4f60\u7684\u670b\u53cb\u5708'
}

function renderMomentInteractionRow(item) {
  const summary = item.summary || item.postPreview || '\u67e5\u770b\u8fd9\u6761\u670b\u53cb\u5708\u52a8\u6001'
  return `<div role="button" tabindex="0" class="desktop-request-row desktop-moment-notification-row ${item.isRead ? '' : 'is-unread'}" data-moment-interaction="${escapeHtml(item.id)}" data-moment-interaction-post="${escapeHtml(item.postId)}"><span class="result-avatar">${avatar({ name: item.actorNickname, avatarUrl: item.actorAvatarUrl, tone: 'blue' }, 'avatar-small')}</span><span><strong>${escapeHtml(item.actorNickname || '\u7528\u6237')}</strong><small>${momentInteractionTypeLabel(item.type)} \u00b7 ${escapeHtml(summary)} \u00b7 ${escapeHtml(formatRemoteTime(item.createdAt))}</small></span>${item.isRead ? '' : '<i class="desktop-moment-notification-unread"></i>'}${renderDesktopNotificationDeleteAction('moment', item.id)}</div>`
}

function renderDesktopMomentReminderCard() {
  const allItems = state.momentInteractions || []
  const items = allItems.slice(0, 5)
  if (!items.length) return ''
  const unreadCount = allItems.filter((item) => !item.isRead).length
  const rows = items.slice(0, 4).map((item) => {
    const summary = item.summary || item.postPreview || '\u67e5\u770b\u8fd9\u6761\u670b\u53cb\u5708\u52a8\u6001'
    return `<button type="button" class="desktop-moment-reminder-row ${item.isRead ? '' : 'is-unread'}" data-moment-interaction="${escapeHtml(item.id)}" data-moment-interaction-post="${escapeHtml(item.postId)}"><span class="result-avatar">${avatar({ name: item.actorNickname, avatarUrl: item.actorAvatarUrl, tone: 'blue' }, 'avatar-small')}</span><span class="desktop-moment-reminder-copy"><strong>${escapeHtml(item.actorNickname || '\u7528\u6237')}</strong><small>${momentInteractionTypeLabel(item.type)} \u00b7 ${escapeHtml(summary)}</small></span><time>${escapeHtml(formatRemoteTime(item.createdAt))}</time>${item.isRead ? '' : '<i class="desktop-moment-reminder-unread"></i>'}</button>`
  }).join('')
  const extraCount = Math.max(0, allItems.length - 4)
  return `<section class="desktop-moment-reminders"><div class="desktop-moment-reminders-head"><div><strong>\u670b\u53cb\u5708\u63d0\u9192</strong><small>${unreadCount ? `\u6709 ${unreadCount} \u6761\u672a\u8bfb\u63d0\u9192` : '\u6700\u8fd1\u7684\u4e92\u52a8'}</small></div>${unreadCount ? `<b>${unreadCount > 99 ? '99+' : unreadCount}</b>` : ''}</div><div class="desktop-moment-reminder-list">${rows}</div>${extraCount ? `<small class="desktop-moment-reminders-more">+${extraCount} \u6761\u63d0\u9192</small>` : ''}</section>`
}

function renderDesktopMomentComposePreviews() {
  if (!state.momentFiles.length) return ''
  const previews = state.momentFiles.map((file, index) => {
    const type = String(file.type || '').startsWith('video/') ? 'video' : 'image'
    const source = desktopMomentLocalPreviewUrl(file)
    const media = type === 'video'
      ? `<video src="${escapeHtml(source)}" muted preload="metadata" playsinline></video><span class="desktop-moment-video-mark">${icon('video')}</span>`
      : `<img src="${escapeHtml(source)}" alt="${escapeHtml(file.name || '\u56fe\u7247\u9884\u89c8')}" />`
    return `<div class="desktop-moment-preview-tile"><div class="desktop-moment-media-tile" data-moment-media-preview="${escapeHtml(source)}" data-moment-media-type="${type}" data-moment-media-name="${escapeHtml(file.name || (type === 'video' ? '\u670b\u53cb\u5708\u89c6\u9891' : '\u670b\u53cb\u5708\u56fe\u7247'))}" tabindex="0" role="button">${media}</div><button type="button" class="desktop-moment-preview-remove" data-moment-file-remove="${index}" aria-label="\u79fb\u9664 ${escapeHtml(file.name || '\u5a92\u4f53')}">${icon('close')}</button><small>${escapeHtml(file.name || '\u672a\u547d\u540d\u5a92\u4f53')}</small></div>`
  }).join('')
  return `<div class="desktop-moment-preview-strip"><span class="desktop-moment-preview-label">\u53d1\u5e03\u9884\u89c8</span><div class="desktop-moment-preview-grid">${previews}</div></div>`
}

function renderDesktopMomentCommentListMarkup(item) {
  const comments = (item?.comments || []).slice(-4)
  if (!comments.length) return '<span class="desktop-moment-comments-empty">\u8fd8\u6ca1\u6709\u8bc4\u8bba\uff0c\u6765\u7559\u4e0b\u7b2c\u4e00\u6761\u5427\u3002</span>'
  return comments.map((comment) => {
    const reply = comment.replyToNickname
      ? ` <span class="desktop-moment-comment-reply">\u56de\u590d ${escapeHtml(comment.replyToNickname)}</span>`
      : ''
    return `<div class="desktop-moment-comment"><div class="desktop-moment-comment-main"><strong>${escapeHtml(comment.nickname || '\u7528\u6237')}</strong>${reply}<span>${escapeHtml(comment.content || '')}</span></div><button type="button" class="desktop-moment-comment-reply-btn" data-moment-comment-reply="${escapeHtml(comment.id)}" data-moment-comment-name="${escapeHtml(comment.nickname || '\u7528\u6237')}" data-moment-comment-reply-moment="${escapeHtml(item.id)}">\u56de\u590d</button></div>`
  }).join('')
}

function bindDesktopMomentCommentReplyButtons(container) {
  container.querySelectorAll('[data-moment-comment-reply]').forEach((element) => element.addEventListener('click', (event) => {
    event.stopPropagation()
    state.momentReplyCommentId = String(element.dataset.momentCommentReply || '')
    state.momentReplyNickname = String(element.dataset.momentCommentName || '')
    const momentId = String(element.dataset.momentCommentReplyMoment || '')
    if (momentId) state.momentCommentOpenId = momentId
    render()
    window.setTimeout(() => {
      document.querySelector('[data-moment-comment-form] [data-moment-comment-input]')?.focus()
    }, 0)
  }))
}

function bindDesktopMomentCommentForm(container) {
  container.querySelectorAll('[data-moment-comment-form]').forEach((element) => element.addEventListener('submit', (event) => {
    event.preventDefault()
    void submitMomentComment(element.dataset.momentId)
  }))
  container.querySelectorAll('[data-moment-comment-input]').forEach((element) => element.addEventListener('input', (event) => {
    state.momentCommentText = event.currentTarget.value
  }))
}

function findDesktopMomentCard(id) {
  const targetId = String(id || '')
  return [...document.querySelectorAll('[data-moment-card]')]
    .find((element) => String(element.dataset.momentCard || '') === targetId) || null
}

function updateDesktopMomentCardDom(item) {
  const card = findDesktopMomentCard(item?.id)
  if (!(card instanceof HTMLElement)) return
  const likeButton = card.querySelector('[data-moment-like]')
  if (likeButton instanceof HTMLElement) {
    likeButton.classList.toggle('liked', Boolean(item.likedByMe))
    const count = likeButton.querySelector('b')
    if (count) count.textContent = String(Number(item.likeCount || 0))
  }
  const commentButton = card.querySelector('[data-moment-comment-toggle]')
  const commentCount = commentButton?.querySelector('b')
  if (commentCount) commentCount.textContent = String(Number(item.commentCount || 0))

  const likeNames = (item.likeNicknames || []).slice(0, 5)
  const likesMarkup = likeNames.length
    ? `<div class="desktop-moment-likes">\u2661 ${likeNames.map((name) => escapeHtml(name)).join('\u3001')}</div>`
    : ''
  const currentLikes = card.querySelector('.desktop-moment-likes')
  if (currentLikes) {
    if (likesMarkup) currentLikes.outerHTML = likesMarkup
    else currentLikes.remove()
  } else if (likesMarkup) {
    card.querySelector('.desktop-moment-foot')?.insertAdjacentHTML('afterend', likesMarkup)
  }

  const comments = card.querySelector('.desktop-moment-comments')
  if (comments) {
    const form = comments.querySelector('[data-moment-comment-form]')
    const inputValue = form?.querySelector('[data-moment-comment-input]')?.value || ''
    comments.innerHTML = renderDesktopMomentCommentListMarkup(item)
      + (form ? form.outerHTML : '')
    const restoredInput = comments.querySelector('[data-moment-comment-input]')
    if (restoredInput instanceof HTMLInputElement) restoredInput.value = inputValue
    bindDesktopMomentCommentReplyButtons(comments)
    bindDesktopMomentCommentForm(comments)
  }
}

function scrollDesktopMomentIntoView(id) {
  const apply = () => {
    const card = findDesktopMomentCard(id)
    if (!(card instanceof HTMLElement)) return false
    card.scrollIntoView({ behavior: 'smooth', block: 'center' })
    card.classList.add('is-located')
    window.setTimeout(() => card.classList.remove('is-located'), 1800)
    return true
  }
  window.requestAnimationFrame(() => {
    if (apply()) return
    window.requestAnimationFrame(apply)
  })
}

function updateDesktopMomentReminderDom() {
  const main = document.querySelector('.desktop-moments-main')
  if (!(main instanceof HTMLElement)) return
  const current = main.querySelector('.desktop-moment-reminders')
  const markup = renderDesktopMomentReminderCard()
  if (current) {
    if (!markup) {
      current.remove()
      return
    }
    current.outerHTML = markup
  } else if (markup) {
    main.querySelector('.desktop-moments-feed')?.insertAdjacentHTML('beforebegin', markup)
  }
  main.querySelectorAll('.desktop-moment-reminders [data-moment-interaction]').forEach((element) => element.addEventListener('click', () => {
    void openMomentInteraction(element.dataset.momentInteraction, element.dataset.momentInteractionPost)
  }))
}

function desktopGroupEventText(item) {
  const operator = item.operatorNickname || '管理员'
  switch (item.eventType) {
    case 'kick': return `${operator} 将你移出了群聊`
    case 'dissolve': return '该群聊已被群主解散'
    case 'role_admin': return '你已被设为群管理员'
    case 'role_member': return '你的群管理员身份已被取消'
    case 'role_owner': return '你已成为新群主'
    case 'join': return item.reason || '你已加入群聊'
    default: return item.reason || '群聊状态有更新'
  }
}

function renderNotificationsModal() {
  const showFriends = state.notificationView !== 'groups'
  const showGroups = state.notificationView !== 'friends'
  const showMoments = state.notificationView === 'all'
  const requests = showFriends ? (state.friendRequests || []) : []
  const groups = state.groupNotifications || { invites: [], joinRequests: [], events: [] }
  const visibleMoments = showMoments ? state.momentInteractions : []
  const total = requests.length + (showGroups ? groups.invites.length + groups.joinRequests.length + groups.events.length : 0) + visibleMoments.length
  const sections = []
  if (visibleMoments.length) sections.push(`<div class="desktop-modal-section-title">\u670b\u53cb\u5708\u4e92\u52a8</div>${visibleMoments.map(renderMomentInteractionRow).join('')}`)
  if (requests.length) sections.push(`<div class="desktop-modal-section-title">新的朋友</div>${requests.map(renderFriendRequestRow).join('')}`)
  if (showGroups && groups.invites.length) sections.push(`<div class="desktop-modal-section-title">群聊邀请</div>${groups.invites.map((item) => renderGroupNotificationRow(item, 'invite')).join('')}`)
  if (showGroups && groups.joinRequests.length) sections.push(`<div class="desktop-modal-section-title">入群申请</div>${groups.joinRequests.map((item) => renderGroupNotificationRow(item, 'join', false)).join('')}`)
  if (showGroups && groups.events.length) sections.push(`<div class="desktop-modal-section-title">群聊动态</div>${groups.events.map((item) => `<div class="desktop-request-row"><span class="result-avatar">${icon('group')}</span><span><strong>${escapeHtml(item.groupTitle || '群聊')}</strong><small>${escapeHtml(desktopGroupEventText(item))} · ${escapeHtml(formatRemoteTime(item.createdAt))}</small></span>${renderDesktopNotificationDeleteAction('group-event', item.id)}</div>`).join('')}`)
  const toolbar = total ? `<div class="desktop-notification-toolbar"><span>共 ${total} 条通知</span><button type="button" class="btn btn-danger" data-notification-clear>${icon('trash')} 全部清空</button></div>` : ''
  const body = sections.length ? `${toolbar}<div class="desktop-modal-results">${sections.join('')}</div>` : `<div class="desktop-modal-empty">${state.notificationView === 'friends' ? '暂无新的好友申请' : state.notificationView === 'groups' ? '暂无群通知' : '暂无新的朋友、群聊或朋友圈互动通知'}</div>`
  const title = state.notificationView === 'friends' ? '新的朋友' : state.notificationView === 'groups' ? '群通知' : '消息通知'
  const subtitle = state.notificationView === 'groups' ? '群聊邀请、入群申请和群聊动态都会显示在这里。' : '好友申请、群聊邀请、入群申请和朋友圈互动都会显示在这里。'
  return modalFrame(title, subtitle, `${state.modalBusy ? '<div class="desktop-modal-hint">正在同步通知…</div>' : ''}${state.modalError ? `<div class="login-error">${escapeHtml(state.modalError)}</div>` : ''}${body}`)
}

function contactUserId(item) {
  return String(item.userId || conversations.find((conversation) => conversation.name === item.name)?.peerUserId || '')
}

function localSearch(keyword) {
  const query = keyword.toLowerCase()
  return {
    contacts: contacts.filter((item) => `${item.name} ${item.meta}`.toLowerCase().includes(query)).map((item) => ({ userId: contactUserId(item), nickname: item.name, avatarUrl: item.avatarUrl, online: item.status === '在线', subtitle: item.meta })),
    groups: conversations.filter((item) => isGroupConversation(item) && `${item.name} ${item.preview}`.toLowerCase().includes(query)).map((item) => ({ id: String(item.id), title: item.name, avatarUrl: item.avatarUrl, memberCount: 0 })),
    conversations: conversations.filter((item) => `${item.name} ${item.preview}`.toLowerCase().includes(query)).map((item) => ({ conversationId: String(item.id), conversationTitle: item.name, avatarUrl: item.avatarUrl, matchCount: 1, preview: item.preview })),
    messages: [],
  }
}

function focusDesktopSearchModalInput() {
  const input = document.querySelector('[data-search-form] [data-modal-query]')
  if (!(input instanceof HTMLInputElement)) return
  input.focus()
  const cursor = input.value.length
  input.setSelectionRange(cursor, cursor)
}

function scheduleDesktopModalSearch(keyword) {
  if (desktopSearchDebounceTimer) window.clearTimeout(desktopSearchDebounceTimer)
  const query = String(keyword || '').trim()
  state.modalQuery = String(keyword || '')
  if (!query) {
    desktopSearchRequestId += 1
    state.modalBusy = false
    state.modalError = ''
    state.modalResults = null
    state.modalContactLimit = 3
    render()
    focusDesktopSearchModalInput()
    return
  }
  desktopSearchDebounceTimer = window.setTimeout(() => {
    desktopSearchDebounceTimer = null
    void runModalSearch(query)
  }, 280)
}

async function runModalSearch(keyword) {
  const query = keyword.trim()
  state.modalQuery = query
  state.modalError = ''
  state.modalContactLimit = 3
  const requestId = ++desktopSearchRequestId
  if (!query) {
    state.modalResults = null
    state.modalBusy = false
    render()
    return
  }
  state.modalBusy = true
  render()
  focusDesktopSearchModalInput()
  try {
    const results = state.dataSource === 'remote' ? await searchDesktop(query) : localSearch(query)
    if (requestId !== desktopSearchRequestId || state.modal !== 'search' || state.modalQuery.trim() !== query) return
    state.modalResults = results
  } catch (error) {
    if (requestId !== desktopSearchRequestId || state.modal !== 'search' || state.modalQuery.trim() !== query) return
    state.modalResults = localSearch(query)
    state.modalError = error instanceof Error ? error.message : '搜索失败，已显示本地结果'
  } finally {
    if (requestId !== desktopSearchRequestId || state.modal !== 'search' || state.modalQuery.trim() !== query) return
    state.modalBusy = false
    render()
    focusDesktopSearchModalInput()
  }
}

function openNewMessageModal(mode = 'conversation') {
  state.modal = 'new-message'
  state.modalMode = mode
  state.groupCreateTitle = ''
  state.groupCreateSelected = new Set()
  state.modalError = ''
  state.modalQuery = ''
  state.modalResults = null
  state.modalContactLimit = 3
  render()
}

async function submitDesktopGroupCreate() {
  const memberIds = [...state.groupCreateSelected].filter((id) => {
    const contact = contacts.find((item) => String(contactUserId(item)) === String(id))
    return !isDesktopFileTransferAssistant(contact)
  })
  if (!memberIds.length) {
    state.modalError = '请至少选择一位联系人'
    render()
    return
  }
  const title = (String(state.groupCreateTitle || '').trim() || '新建群聊').slice(0, 32)
  state.modalBusy = true
  state.modalError = ''
  render()
  if (state.dataSource !== 'remote') {
    state.modalBusy = false
    state.modalError = '在线数据未加载，暂不支持创建群聊'
    render()
    return
  }
  try {
    await createDesktopGroupConversation(title, memberIds)
    resetModal()
    state.page = 'messages'
    await loadDesktopPageData('messages')
    showToast('群聊已创建')
  } catch (error) {
    state.modalBusy = false
    state.modalError = error instanceof Error ? error.message : '群聊创建失败'
    render()
  }
}

function openSearchModal(keyword = '', mode = 'global') {
  state.modal = 'search'
  state.searchMode = mode === 'contact' ? 'contact' : 'global'
  state.modalError = ''
  state.modalQuery = keyword.trim()
  state.modalResults = null
  state.modalContactLimit = 3
  render()
  if (state.modalQuery) void runModalSearch(state.modalQuery)
}

function isDesktopTextEntryFocused() {
  const active = document.activeElement
  return active instanceof HTMLInputElement
    || active instanceof HTMLTextAreaElement
    || active?.isContentEditable === true
}

function cycleDesktopConversation(direction) {
  if (state.page !== 'messages' || state.modal || state.messageMultiMode) return false
  const indexes = desktopVisibleConversationIndexes()
  if (!indexes.length) return false
  const currentPosition = indexes.indexOf(state.selectedConversation)
  const nextPosition = currentPosition < 0
    ? direction > 0 ? 0 : indexes.length - 1
    : Math.max(0, Math.min(indexes.length - 1, currentPosition + direction))
  const nextIndex = indexes[nextPosition]
  if (nextIndex == null || nextIndex === state.selectedConversation) return false
  const nextConversation = conversations[nextIndex]
  if (!nextConversation?.id) return false
  void selectConversationById(nextConversation.id)
  return true
}

function handleDesktopGlobalShortcut(event) {
  if (desktopModuleDisposed || state.lockScreenLocked) return
  const eventKey = String(event.key || '').toLowerCase()
  if (eventKey === 'escape' || eventKey === 'esc') {
    if (state.modal) {
      event.preventDefault()
      resetModal()
      return
    }
    if (state.messageMultiMode) {
      event.preventDefault()
      clearDesktopMessageSelection()
      render()
      return
    }
    const hasTransientUi = Boolean(
      state.messageMenu
      || state.conversationMenu
      || state.fileMenu
      || state.sharedContentMenu
      || state.momentMenu
      || state.momentMediaMenu
      || state.mediaPreview
      || state.contactMoreOpen
      || state.deviceMenuId
      || state.profileMenuOpen
      || state.showEmojiPanel
      || state.showMentionPicker
      || state.showHomePlusMenu
      || state.contactProfileExpanded,
    )
    if (!hasTransientUi) return
    event.preventDefault()
    state.messageMenu = null
    state.conversationMenu = null
    state.fileMenu = null
    state.sharedContentMenu = null
    state.momentMenu = null
    state.momentMediaMenu = null
    markDesktopPreviewCacheInUse(state.mediaPreview, false)
    state.mediaPreview = null
    state.mediaEditor = null
    state.contactMoreOpen = false
    state.deviceMenuId = ''
    state.profileMenuOpen = false
    state.showEmojiPanel = false
    state.showMentionPicker = false
    state.showHomePlusMenu = false
    state.contactProfileExpanded = false
    render()
    return
  }
  if ((eventKey === 'arrowup' || eventKey === 'arrowdown')
    && !event.ctrlKey && !event.metaKey && !event.altKey
    && !isDesktopTextEntryFocused()) {
    if (cycleDesktopConversation(eventKey === 'arrowup' ? -1 : 1)) {
      event.preventDefault()
    }
    return
  }
  if (!event.ctrlKey && !event.metaKey) return
  const key = String(event.key).toLowerCase()
  if (key === 'h') {
    event.preventDefault()
    if (window.pulseDesktop?.toggleMaximize) {
      void window.pulseDesktop.toggleMaximize()
    } else if (document.fullscreenElement) {
      void document.exitFullscreen?.()
    } else {
      void document.documentElement.requestFullscreen?.()
    }
    return
  }
  if (key === 'n') {
    event.preventDefault()
    state.modal = null
    state.fileMenu = null
    state.momentMenu = null
    state.messageMenu = null
    state.conversationMenu = null
    state.sharedContentMenu = null
    state.page = 'messages'
    state.contactQuery = ''
    render()
    void loadDesktopPageData('messages')
    return
  }
  if (key !== 'k') return
  event.preventDefault()
  if (state.modal === 'search') {
    focusDesktopSearchModalInput()
    return
  }
  openSearchModal()
  window.setTimeout(focusDesktopSearchModalInput, 0)
}

function handleDesktopNativeShortcut(payload) {
  const key = String(payload?.key || '').toLowerCase()
  if (!key || key === 'h') return
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: Boolean(payload?.command),
    metaKey: false,
    bubbles: false,
    cancelable: true,
  })
  handleDesktopGlobalShortcut(event)
}

async function openContactModal(userId) {
  const fallback = contacts.find((item) => contactUserId(item) === String(userId))
  state.modal = 'contact'
  state.contactProfileScrollTop = 0
  state.modalBusy = Boolean(state.dataSource === 'remote')
  state.modalError = ''
  state.modalProfileMoments = []
  state.modalProfileMomentsLoading = false
  state.modalProfileMomentsError = ''
  state.modalProfileCommonGroups = []
  state.modalProfileCommonGroupsLoading = false
  state.modalProfileCommonGroupsError = ''
  state.modalProfile = { userId: String(userId), nickname: fallback?.nickname || fallback?.name || '用户', remark: fallback?.remark || '', avatarUrl: fallback?.avatarUrl || '', signature: fallback?.meta || '', friendStatus: 'friend' }
  render()
  if (state.dataSource !== 'remote') return
  try {
    state.modalProfile = await fetchDesktopUserProfile(String(userId))
    rememberDesktopContactRelation(state.modalProfile)
    await loadContactProfileDetails(String(userId), state.modalProfile)
  } catch (error) {
    state.modalError = error instanceof Error ? error.message : '资料加载失败'
  } finally {
    state.modalBusy = false
    render()
  }
}

function requestDesktopFriendDelete() {
  const profile = state.modalProfile
  const userId = String(profile?.userId || '')
  if (!profile || !userId || userId === String(state.profile.userId || '')) return
  const sourceKey = String(profile.friendAddSource || '').toLowerCase()
  if (sourceKey === 'default_friend' || profile.fileTransferAssistant) {
    showToast('平台默认好友由后台统一管理，不支持删除')
    return
  }
  state.confirmDialog = {
    type: 'delete-friend',
    userId,
    nickname: String(profile.displayName || profile.remark || profile.nickname || '该联系人'),
  }
  state.modal = 'confirm'
  render()
}

async function executeDesktopFriendDelete(dialog) {
  const userId = String(dialog?.userId || '')
  if (!userId) return
  try {
    if (state.dataSource === 'remote') await deleteDesktopFriend(userId)
    state.deletedFriendUserIds.add(userId)
    state.blockedUserIds.delete(userId)
    state.blockedByPeerUserIds.delete(userId)
    contacts = contacts.filter((item) => String(contactUserId(item) || '') !== userId)
    const removedIndex = conversations.findIndex((item) => item.type === 'personal' && String(item.peerUserId || '') === userId)
    conversations = conversations.filter((item) => !(item.type === 'personal' && String(item.peerUserId || '') === userId))
    if (conversations.length === 0) state.selectedConversation = 0
    else if (removedIndex >= 0 && state.selectedConversation >= removedIndex) state.selectedConversation = Math.max(0, Math.min(state.selectedConversation - 1, conversations.length - 1))
    resetModal()
    showToast('已删除好友')
    syncDesktopRelationAfterMutation()
  } catch (error) {
    showToast(error instanceof Error ? error.message : '删除好友失败')
  }
}

function requestDesktopFriendBlock() {
  const profile = state.modalProfile
  const userId = String(profile?.userId || '')
  if (!profile || !userId || userId === String(state.profile.userId || '')) return
  const sourceKey = String(profile.friendAddSource || '').toLowerCase()
  if (sourceKey === 'default_friend' || profile.fileTransferAssistant) {
    showToast('平台默认好友由后台统一管理，不支持拉黑')
    return
  }
  const blocked = Boolean(profile.blocked) || profile.friendStatus === 'blocked'
  state.confirmDialog = {
    type: blocked ? 'unblock-friend' : 'block-friend',
    userId,
    nickname: String(profile.displayName || profile.remark || profile.nickname || '该联系人'),
  }
  state.modal = 'confirm'
  render()
}

async function executeDesktopFriendBlock(dialog) {
  const userId = String(dialog?.userId || '')
  if (!userId) return
  const blocked = dialog.type === 'block-friend'
  try {
    if (state.dataSource === 'remote') {
      if (blocked) await blockDesktopUser(userId)
      else await unblockDesktopUser(userId)
    }
    if (String(state.modalProfile?.userId || '') === userId) {
      state.modalProfile = {
        ...state.modalProfile,
        blocked,
        friendStatus: blocked ? 'blocked' : 'friend',
      }
      if (blocked) {
        state.modalProfileMoments = []
        state.modalProfileMomentsError = ''
      }
    }
    if (blocked) {
      state.blockedUserIds.add(userId)
      state.blockedByPeerUserIds.delete(userId)
      hideDesktopPrivateConversationForRelation(userId)
    } else {
      state.blockedUserIds.delete(userId)
      state.deletedFriendUserIds.delete(userId)
    }
    state.modal = 'contact'
    showToast(blocked ? '已拉黑联系人' : '已解除拉黑')
    syncDesktopRelationAfterMutation()
  } catch (error) {
    state.modal = 'contact'
    showToast(error instanceof Error ? error.message : (blocked ? '拉黑失败' : '解除拉黑失败'))
  }
}

async function loadContactProfileDetails(userId, profile) {
  const id = String(userId || '')
  if (!id || state.dataSource !== 'remote') return
  const canLoadMoments = !profile?.blocked && !profile?.blockedByPeer && !profile?.hideHisMoments
  state.modalProfileMomentsLoading = canLoadMoments
  state.modalProfileCommonGroupsLoading = true
  state.modalProfileMomentsError = ''
  state.modalProfileCommonGroupsError = ''
  render()

  const [momentsResult, groupsResult] = await Promise.allSettled([
    canLoadMoments ? fetchDesktopUserMoments(id) : Promise.resolve([]),
    fetchDesktopCommonGroups(id),
  ])
  if (String(state.modalProfile?.userId || '') !== id) return
  if (momentsResult.status === 'fulfilled') {
    state.modalProfileMoments = momentsResult.value || []
  } else {
    state.modalProfileMomentsError = momentsResult.reason instanceof Error ? momentsResult.reason.message : '朋友圈加载失败'
  }
  if (groupsResult.status === 'fulfilled') {
    state.modalProfileCommonGroups = groupsResult.value || []
  } else {
    state.modalProfileCommonGroupsError = groupsResult.reason instanceof Error ? groupsResult.reason.message : '共同群聊加载失败'
  }
  state.modalProfileMomentsLoading = false
  state.modalProfileCommonGroupsLoading = false
  render()
}

async function editDesktopFriendRemark() {
  const profile = state.modalProfile
  const userId = String(profile?.userId || '')
  if (!profile || !userId) return
  const managedDefaultFriend = String(profile.friendAddSource || '').toLowerCase() === 'default_friend'
    || Boolean(profile.fileTransferAssistant)
  if (managedDefaultFriend) {
    showToast('平台默认好友由后台统一管理，不支持修改备注')
    return
  }
  const result = await openDesktopInputDialog({
    title: '设置好友备注',
    subtitle: '备注仅对你自己可见',
    fields: [{ name: 'value', label: '备注名', value: profile.remark || '', maxlength: 64, placeholder: '输入备注名（可留空）' }],
  })
  if (!result) return
  state.modal = 'contact'
  const value = String(result.value || '').trim()
  try {
    if (state.dataSource === 'remote') await updateDesktopFriendRemark(userId, value)
    profile.remark = value
    const contact = contacts.find((item) => contactUserId(item) === userId)
    const originalName = contact?.nickname || profile.nickname || contact?.name || '用户'
    if (contact) {
      contact.nickname = originalName
      contact.remark = value
      contact.name = value || originalName
      contact.displayName = contact.name
      contact.initials = contact.name.slice(0, 1)
      contact.meta = value ? originalName : (contact.tag || `Pulse ID ${userId}`)
    }
    const conversation = conversations.find((item) => item.type === 'personal' && String(item.peerUserId || '') === userId)
    if (conversation) {
      conversation.name = value || originalName
      conversation.initials = conversation.name.slice(0, 1)
    }
    showToast(value ? '好友备注已保存' : '已清除好友备注')
  } catch (error) { showToast(error instanceof Error ? error.message : '好友备注保存失败') }
  render()
}

function openContactSection(section) {
  if (!state.modalProfile) return
  if (section === 'moments') {
    void openFriendMomentsPage(state.modalProfile)
    return
  }
  state.modal = 'contact-groups'
  state.modalError = ''
  render()
}

function backToContactProfile() {
  if (!state.modalProfile) return resetModal()
  state.modal = 'contact'
  state.modalError = ''
  render()
}

function openContactMomentDetail(momentId) {
  const item = (state.modalProfileMoments || []).find((moment) => String(moment.id) === String(momentId))
  if (!item) return
  state.momentDetail = item
  state.modal = 'moment-detail'
  state.modalError = ''
  render()
}

async function openContactGroup(groupId) {
  const id = String(groupId || '')
  if (!id) return
  if (!conversations.some((item) => String(item.id || '') === id)) {
    if (state.dataSource === 'remote') {
      await loadRemoteData()
    }
  }
  if (conversations.some((item) => String(item.id || '') === id)) {
    selectConversationById(id)
  } else {
    showToast('该群聊暂未出现在会话列表中')
  }
}

function selectConversationById(conversationId) {
  const index = conversations.findIndex((item) => String(item.id) === String(conversationId))
  if (index < 0) {
    showToast('会话尚未出现在列表中')
    return
  }
  state.page = 'messages'
  const hadUnread = Number(conversations[index]?.unread || 0) > 0
  state.scrollChatToBottom = hadUnread
  if (hadUnread) {
    conversations[index].unread = 0
    updateDesktopConversationFilterBadges()
    syncDesktopShellBadge()
  }
  state.selectedConversation = index
  clearPendingDesktopFile()
  state.messageSearchQuery = ''
  state.showMentionPicker = false
  clearPendingDesktopMentions()
  state.mentionJumpIds = []
  clearDesktopMessageSelection()
  resetModal()
  void refreshDesktopConversationAvatar(conversations[index])
  return loadSelectedMessages()
}

function openDesktopConversationAndJump(conversationId, messageId) {
  const loading = selectConversationById(conversationId)
  if (!loading || !messageId) return
  void loading.then(() => {
    window.setTimeout(() => { void scrollToDesktopMessage(messageId) }, 0)
  })
}

async function openDesktopNotificationTarget(payload = {}) {
  const conversationId = String(payload?.conversationId || '').trim()
  const messageId = String(payload?.messageId || '').trim()
  if (!conversationId) return
  if (!conversations.some((item) => String(item.id || '') === conversationId) && state.dataSource === 'remote') {
    await loadRemoteData()
  }
  openDesktopConversationAndJump(conversationId, messageId)
}

async function openDesktopConversationSearch(conversationId, keyword) {
  const query = String(keyword || '').trim()
  if (!query) {
    selectConversationById(conversationId)
    return
  }
  let index = conversations.findIndex((item) => String(item.id) === String(conversationId))
  if (index < 0 && state.dataSource === 'remote') {
    await loadRemoteData()
    index = conversations.findIndex((item) => String(item.id) === String(conversationId))
  }
  if (index < 0) {
    showToast('会话尚未出现在列表中')
    return
  }

  const selected = conversations[index]
  state.page = 'messages'
  state.selectedConversation = index
  state.messageSearchQuery = query
  state.scrollChatToBottom = false
  clearPendingDesktopFile()
  state.showMentionPicker = false
  clearPendingDesktopMentions()
  state.mentionJumpIds = []
  clearDesktopMessageSelection()
  resetModal()
  void refreshDesktopConversationAvatar(selected)

  if (state.dataSource !== 'remote') {
    state.messagesByConversation[selected.id] = currentMessages(selected)
      .filter((message) => message.content.toLowerCase().includes(query.toLowerCase()))
    render()
    return
  }

  state.loadingMessages = true
  state.loadingMessagesConversationId = String(selected.id)
  render()
  try {
    const result = await searchDesktopMessages(selected.id, query)
    if (String(conversations[state.selectedConversation]?.id) === String(selected.id) && state.messageSearchQuery === query) {
      const mappedMessages = result.map(mapRemoteMessage)
      state.messagesByConversation[selected.id] = mappedMessages
      scheduleDesktopFileMetadataHydrationForMessages(selected.id, mappedMessages)
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : '聊天记录搜索失败')
  } finally {
    if (state.loadingMessagesConversationId === String(selected.id)) {
      state.loadingMessages = false
      state.loadingMessagesConversationId = ''
    }
    render()
  }
}

async function startDesktopConversation(userId) {
  if (!userId) return
  if (state.dataSource !== 'remote') {
    const localIndex = conversations.findIndex((item) => item.peerUserId === String(userId))
    if (localIndex >= 0) {
      state.page = 'messages'
      state.scrollChatToBottom = Number(conversations[localIndex]?.unread || 0) > 0
      state.selectedConversation = localIndex
      resetModal()
      void loadSelectedMessages()
    } else {
      showToast('在线数据未加载，暂不支持创建新会话')
    }
    return
  }
  state.modalBusy = true
  render()
  try {
    const conversation = await openDesktopPrivateConversation(String(userId))
    const id = String(conversation.id)
    resetModal()
    await loadRemoteData()
    const index = conversations.findIndex((item) => String(item.id) === id)
    if (index >= 0) {
      state.scrollChatToBottom = Number(conversations[index]?.unread || 0) > 0
      state.selectedConversation = index
    }
    state.page = 'messages'
    render()
    void loadSelectedMessages()
  } catch (error) {
    state.modalBusy = false
    state.modalError = error instanceof Error ? error.message : '无法打开会话'
    render()
  }
}

async function addDesktopContact(userId) {
  if (!userId || state.modalBusy) return
  state.modalBusy = true
  state.modalError = ''
  render()
  try {
    await sendDesktopFriendRequest(userId)
    state.modalProfile = { ...state.modalProfile, friendStatus: 'pending_sent' }
    showToast('好友申请已发送')
  } catch (error) {
    state.modalError = error instanceof Error ? error.message : '好友申请发送失败'
  } finally {
    state.modalBusy = false
    render()
  }
}

async function openNotificationsModalLegacy() {
  state.modal = 'notifications'
  state.modalError = ''
  state.modalBusy = state.dataSource === 'remote'
  state.friendRequests = []
  render()
  if (state.dataSource !== 'remote') {
    state.modalBusy = false
    render()
    return
  }
  try {
    const result = await fetchDesktopFriendRequests()
    state.friendRequests = (result.list || []).filter((item) => item.direction !== 'outgoing')
  } catch (error) {
    state.modalError = error instanceof Error ? error.message : '通知加载失败'
  } finally {
    state.modalBusy = false
    render()
  }
}

async function openMomentInteraction(interactionId, postId) {
  const interaction = state.momentInteractions.find((item) => String(item.id) === String(interactionId))
  const interactionIdText = String(interactionId || '')
  const nextDismissed = new Set(state.notificationDismissedIds)
  if (interactionIdText) nextDismissed.add(desktopNotificationDismissalId('moment', interactionIdText))
  state.notificationDismissedIds = nextDismissed
  saveDesktopNotificationDismissals(nextDismissed)
  state.momentInteractions = (state.momentInteractions || []).filter((item) => String(item.id) !== interactionIdText)
  syncDesktopNotificationCountsFromState()

  if (interaction && !interaction.isRead && state.dataSource === 'remote') {
    void markDesktopMomentInteractionsRead(interaction.id).catch(() => {})
  }

  state.page = 'moments'
  state.modal = ''
  state.momentDetail = null
  state.modalBusy = false
  const cached = state.moments.find((item) => String(item.id) === String(postId))
  if (cached) {
    render()
    scrollDesktopMomentIntoView(postId)
    return
  }
  if (state.dataSource !== 'remote' || !postId) {
    render()
    showToast('\u52a8\u6001\u4e0d\u5b58\u5728')
    return
  }
  state.momentsLoading = true
  state.momentsError = ''
  render()
  try {
    state.moments = await fetchDesktopMoments()
    state.momentsLoaded = true
  } catch (error) {
    state.momentsError = error instanceof Error ? error.message : '\u52a8\u6001\u52a0\u8f7d\u5931\u8d25'
  } finally {
    state.momentsLoading = false
    render()
    if (state.moments.some((item) => String(item.id) === String(postId))) scrollDesktopMomentIntoView(postId)
  }
}

function requestDeleteDesktopNotification(type, id) {
  if (!type || !id || state.modalBusy) return
  state.confirmDialog = { type: 'delete-notification', notificationType: type, notificationId: String(id) }
  state.modal = 'confirm'
  render()
}

function requestClearDesktopNotifications() {
  const groups = state.groupNotifications || { invites: [], joinRequests: [], events: [] }
  const total = (state.friendRequests || []).length
    + (groups.invites || []).length
    + (groups.joinRequests || []).length
    + (groups.events || []).length
    + (state.momentInteractions || []).length
  if (!total || state.modalBusy) return
  state.confirmDialog = { type: 'clear-notifications' }
  state.modal = 'confirm'
  render()
}

function dismissDesktopNotification(type, id) {
  const next = new Set(state.notificationDismissedIds)
  next.add(desktopNotificationDismissalId(type, id))
  state.notificationDismissedIds = next
  saveDesktopNotificationDismissals(next)
  filterDesktopNotificationsByDismissals()
  syncDesktopNotificationCountsFromState()
  state.modal = 'notifications'
  showToast('通知已删除')
  render()
}

function clearDesktopNotifications() {
  const next = new Set(state.notificationDismissedIds)
  ;(state.friendRequests || []).forEach((item) => next.add(desktopNotificationDismissalId('friend', item.id)))
  const groups = state.groupNotifications || { invites: [], joinRequests: [], events: [] }
  ;(groups.invites || []).forEach((item) => next.add(desktopNotificationDismissalId('group-invite', item.id)))
  ;(groups.joinRequests || []).forEach((item) => next.add(desktopNotificationDismissalId('group-join', item.id)))
  ;(groups.events || []).forEach((item) => next.add(desktopNotificationDismissalId('group-event', item.id)))
  ;(state.momentInteractions || []).forEach((item) => next.add(desktopNotificationDismissalId('moment', item.id)))
  state.notificationDismissedIds = next
  saveDesktopNotificationDismissals(next)
  state.friendRequests = []
  state.groupNotifications = { invites: [], joinRequests: [], events: [] }
  state.momentInteractions = []
  syncDesktopNotificationCountsFromState()
  state.modal = 'notifications'
  showToast('通知已全部清空')
  render()
}

async function openNotificationsModal(view = 'all') {
  state.modal = 'notifications'
  state.notificationView = view
  state.modalError = ''
  state.modalBusy = state.dataSource === 'remote'
  state.friendRequests = []
  state.groupNotifications = { invites: [], joinRequests: [], events: [] }
  state.momentInteractions = []
  render()
  if (state.dataSource !== 'remote') {
    state.modalBusy = false
    render()
    return
  }
  try {
    const [friendResult, groupResult, momentResult] = await Promise.all([
      fetchDesktopFriendRequests(),
      fetchDesktopGroupNotifications(),
      fetchDesktopMomentInteractions(),
    ])
    state.friendRequests = friendResult.list || []
    state.groupNotifications = groupResult
    state.momentInteractions = momentResult || []
    filterDesktopNotificationsByDismissals()
    if (state.momentInteractions.length) {
      await markDesktopMomentInteractionsRead()
      state.momentInteractions = state.momentInteractions.map((item) => ({ ...item, isRead: true }))
    }
    syncDesktopNotificationCountsFromState()
  } catch (error) {
    state.modalError = error instanceof Error ? error.message : '通知加载失败'
  } finally {
    state.modalBusy = false
    render()
  }
}

async function handleGroupNotification(requestId, action, conversationId = '') {
  if (!requestId || state.modalBusy) return
  state.modalBusy = true
  render()
  try {
    if (action === 'accept-invite') await acceptDesktopGroupInvite(requestId)
    else if (action === 'reject-invite') await rejectDesktopGroupInvite(requestId)
    else if (action === 'approve-join') await approveDesktopGroupJoinRequest(conversationId, requestId)
    else if (action === 'reject-join') await rejectDesktopGroupJoinRequest(conversationId, requestId)
    showToast(action.startsWith('accept') || action.startsWith('approve') ? '已同意群聊申请' : '已拒绝群聊申请')
    const result = await fetchDesktopGroupNotifications()
    state.groupNotifications = result
    filterDesktopNotificationsByDismissals()
    syncDesktopNotificationCountsFromState()
    void refreshNotificationSummary()
  } catch (error) {
    state.modalError = error instanceof Error ? error.message : '群聊通知处理失败'
  } finally {
    state.modalBusy = false
    render()
  }
}

async function handleFriendRequest(requestId, action) {
  if (!requestId || state.modalBusy) return
  state.modalBusy = true
  render()
  try {
    if (action === 'accept') await acceptDesktopFriendRequest(requestId)
    else await rejectDesktopFriendRequest(requestId)
    state.friendRequests = state.friendRequests.map((item) => item.id === requestId ? { ...item, status: action === 'accept' ? 1 : 2 } : item)
    syncDesktopNotificationCountsFromState()
    void refreshNotificationSummary()
    showToast(action === 'accept' ? '已添加联系人' : '已忽略好友申请')
  } catch (error) {
    state.modalError = error instanceof Error ? error.message : '操作失败'
  } finally {
    state.modalBusy = false
    render()
  }
}

function syncContactProfile() {
  const expanded = state.contactProfileExpanded
  document.querySelector('.message-workspace')?.classList.toggle('contact-profile-expanded', expanded)
  const profileCard = document.querySelector('.profile-context')
  if (!profileCard) return
  profileCard.querySelectorAll('.profile-context-main, .profile-actions').forEach((element) => {
    element.hidden = !expanded
  })
  const toggle = profileCard.querySelector('.context-card-label button')
  if (toggle) {
    toggle.setAttribute('aria-expanded', String(expanded))
    toggle.setAttribute('aria-label', expanded ? '收起联系人资料' : '展开联系人资料')
    toggle.setAttribute('title', expanded ? '收起联系人资料' : '展开联系人资料')
  }
  /*
  const headerToggle = document.querySelector('.chat-header [data-action="more"]')
  if (headerToggle) {
    headerToggle.setAttribute('aria-expanded', String(expanded))
    headerToggle.setAttribute('aria-label', expanded ? '鏀惰捣鑱旂郴浜鸿祫鏂? : '灞曞紑鑱旂郴浜鸿祫鏂?')
    headerToggle.setAttribute('title', expanded ? '鏀惰捣鑱旂郴浜鸿祫鏂? : '灞曞紑鑱旂郴浜鸿祫鏂?')
  }
}

  */
  const headerToggle = document.querySelector('.chat-header [data-action="more"]')
  if (headerToggle) {
    headerToggle.setAttribute('aria-expanded', String(expanded))
    headerToggle.setAttribute('aria-label', expanded ? '收起联系人资料' : '展开联系人资料')
    headerToggle.setAttribute('title', expanded ? '收起联系人资料' : '展开联系人资料')
  }
}

function toggleContactProfile() {
  state.contactProfileExpanded = !state.contactProfileExpanded
  syncContactProfile()
}

async function sendDesktopRedPacketFlow() {
  const selected = conversations[state.selectedConversation]
  if (!selected?.id || state.dataSource !== 'remote') return showToast('当前没有可发送的在线会话')
  if (!ensureDesktopCanSend(selected)) return
  try {
    const [summary, amountConfig] = await Promise.all([fetchDesktopWallet(), fetchDesktopWalletAmountConfig()])
    state.walletSummary = summary
    state.walletAmountConfig = amountConfig
  } catch (error) {
    return showToast(error instanceof Error ? error.message : '钱包信息加载失败')
  }
  if (!state.walletSummary.hasPaymentPassword) {
    const configured = await openDesktopWalletPasswordDialog()
    if (!configured) return
  }
  const groupDetail = selected.type === 'group' ? await loadDesktopGroupDetail(selected) : null
  const groupMembers = (groupDetail?.members || [])
    .filter((member) => String(member.userId) !== String(state.profile.userId || ''))
  if (selected.type === 'group' && !groupMembers.length) return showToast('暂未加载到可领取红包的群成员')
  const result = await openDesktopInputDialog({
    title: '发送红包',
    subtitle: `发送给${selected.type === 'group' ? '群聊' : '好友'}“${selected.name}”`,
    fields: [
      { name: 'amount', label: '红包金额（元）', value: '1.00', placeholder: '请输入金额', inputmode: 'decimal', required: true },
      ...(selected.type === 'group' ? [{
        name: 'packetType',
        label: '红包类型',
        value: 'LUCKY',
        options: [
          { value: 'LUCKY', label: '拼手气红包' },
          { value: 'NORMAL', label: '普通红包' },
          { value: 'EXCLUSIVE', label: '专属红包' },
        ],
      }, {
        name: 'targetUserId',
        label: '专属成员（仅专属红包选择）',
        value: '',
        visible: (values) => values.packetType === 'EXCLUSIVE',
        options: [
          { value: '', label: '不指定' },
          ...groupMembers.map((member) => ({ value: String(member.userId), label: member.nickname || `用户${member.userId}` })),
        ],
      }, { name: 'count', label: '红包个数', value: '1', placeholder: '请输入个数', inputmode: 'numeric', required: true, visible: (values) => values.packetType !== 'EXCLUSIVE' }] : []),
      { name: 'greeting', label: '红包祝福语（可选）', value: '恭喜发财', placeholder: '写一句祝福', type: 'text' },
    ],
    validate: (values) => {
      const amount = Number(values.amount)
      if (!Number.isFinite(amount) || amount <= 0) return '请输入正确的红包金额'
      const maxCents = Number(state.walletAmountConfig?.redPacketMaxCents || 20000)
      if (Math.round(amount * 100) > maxCents) return `红包金额不能超过 ${walletYuan(maxCents)}`
      if (selected.type === 'group' && (!Number.isInteger(Number(values.count)) || Number(values.count) <= 0)) return '请输入正确的红包个数'
      if (selected.type === 'group' && values.packetType === 'EXCLUSIVE' && !values.targetUserId) return '请选择专属红包成员'
      return ''
    },
  })
  if (!result) return
  const amount = Math.round(Number(result.amount) * 100)
  const packetType = selected.type === 'group' ? String(result.packetType || 'LUCKY') : 'PRIVATE'
  const count = selected.type === 'group' && packetType !== 'EXCLUSIVE' ? Math.max(1, Number(result.count || 1)) : 1
  const greeting = String(result.greeting || '')
  const payment = await openDesktopInputDialog({
    title: '请输入支付密码',
    subtitle: '请输入6位数字支付密码以完成发红包',
    fields: [{ name: 'password', label: '支付密码', placeholder: '请输入6位数字', type: 'password', inputmode: 'numeric', maxlength: 6, required: true }],
    validate: (values) => /^\d{6}$/.test(values.password || '') ? '' : '支付密码必须是6位数字',
  })
  if (!payment) return
  const password = String(payment.password || '')
  try {
    await sendDesktopRedPacket({
      conversationId: String(selected.id),
      packetType,
      targetUserId: packetType === 'EXCLUSIVE' ? String(result.targetUserId || '') : undefined,
      totalAmount: amount,
      count,
      greeting,
      paymentPassword: password,
    })
    state.scrollChatToBottom = true
    await loadSelectedMessages()
    showToast('红包已发出')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '红包发送失败')
  }
}

async function sendDesktopTransferFlow() {
  const selected = conversations[state.selectedConversation]
  if (!selected?.id || state.dataSource !== 'remote') return showToast('当前没有可发送的在线会话')
  if (!ensureDesktopCanSend(selected)) return
  try {
    state.walletAmountConfig = await fetchDesktopWalletAmountConfig()
  } catch (error) {
    return showToast(error instanceof Error ? error.message : '金额配置加载失败')
  }
  const groupDetail = selected.type === 'group' ? await loadDesktopGroupDetail(selected) : null
  const groupMembers = (groupDetail?.members || [])
    .filter((member) => String(member.userId) !== String(state.profile.userId || ''))
  const defaultReceiver = selected.type === 'group'
    ? (groupMembers.length === 1 ? String(groupMembers[0].userId) : '')
    : String(selected.peerUserId || '')
  if (!defaultReceiver && selected.type !== 'group') return showToast('当前会话没有可转账的收款人')
  if (selected.type === 'group' && !groupMembers.length) return showToast('暂未加载到可转账的群成员')
  const result = await openDesktopInputDialog({
    title: '发起转账',
    subtitle: selected.type === 'group' ? `从“${selected.name}”中选择收款成员` : `转给好友“${selected.name}”`,
    fields: [
      ...(selected.type === 'group' ? [{
        name: 'receiverId',
        label: '收款成员',
        value: defaultReceiver,
        options: groupMembers.map((member) => ({ value: String(member.userId), label: member.nickname || `用户${member.userId}` })),
        required: true,
      }] : []),
      { name: 'amount', label: '转账金额（元）', value: '1.00', placeholder: '请输入金额', inputmode: 'decimal', required: true },
      { name: 'remark', label: '转账说明（可选）', value: '', placeholder: '写一句说明', type: 'text' },
      { name: 'password', label: '支付密码', placeholder: '请输入6位数字', type: 'password', inputmode: 'numeric', maxlength: 6, required: true },
    ],
    validate: (values) => {
      if (selected.type === 'group' && !values.receiverId) return '请选择收款成员'
      const amount = Number(values.amount)
      if (!Number.isFinite(amount) || amount <= 0) return '请输入正确的转账金额'
      const maxCents = Number(state.walletAmountConfig?.transferMaxCents || 1000000)
      if (Math.round(amount * 100) > maxCents) return `转账金额不能超过 ${walletYuan(maxCents)}`
      if (!/^\d{6}$/.test(values.password || '')) return '支付密码必须是6位数字'
      return ''
    },
  })
  if (!result) return
  const amount = Math.round(Number(result.amount) * 100)
  const receiverId = selected.type === 'group' ? String(result.receiverId || '') : defaultReceiver
  const remark = String(result.remark || '')
  const password = String(result.password || '')
  try {
    await sendDesktopTransfer({
      conversationId: String(selected.id),
      receiverId,
      amount,
      remark,
      paymentPassword: password,
    })
    state.scrollChatToBottom = true
    await loadSelectedMessages()
    showToast('转账已发出')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '转账发送失败')
  }
}

function desktopProfileDraftDirty() {
  if (!state.profileEditing) return false
  const draft = state.profileDraft || {}
  return String(draft.nickname || '').trim() !== String(state.profile.nickname || '').trim()
    || String(draft.signature || '') !== String(state.profile.signature || '')
    || Boolean(state.profileAvatarFile)
}

async function saveDesktopProfileForm() {
  if (state.profileAvatarUploading) {
    showToast('头像上传中，请稍候')
    return false
  }
  const draft = state.profileDraft || state.profile || {}
  const nickname = String(draft.nickname || '').trim()
  const signature = String(draft.signature || '').trim()
  if (!nickname) {
    showToast('昵称不能为空')
    return false
  }
  const avatarFile = state.profileAvatarFile
  if (avatarFile) {
    state.profileAvatarUploading = true
    render()
  }
  try {
    let uploadedAvatarUrl = ''
    if (avatarFile) {
      const avatarUpload = await uploadDesktopFile(await compressDesktopAvatar(avatarFile))
      uploadedAvatarUrl = resolveDesktopAvatarUrl(avatarUpload.url || '')
    }
    const updated = await updateDesktopProfile({
      nickname,
      signature,
      ...(uploadedAvatarUrl ? { avatarUrl: uploadedAvatarUrl } : {}),
    })
    const nextAvatarUrl = uploadedAvatarUrl || resolveDesktopAvatarUrl(updated.avatarUrl || state.profileAvatarOriginalUrl || state.profile.avatarUrl || '')
    state.profile = {
      ...state.profile,
      ...updated,
      avatarUrl: nextAvatarUrl,
      userId: String(updated.userId || state.profile.userId),
    }
    clearDesktopAvatarDraft()
    saveDesktopSession(getDesktopToken() || '', state.profile)
    state.profileEditing = false
    state.profileDraft = null
    showToast('资料已保存')
    return true
  } catch (error) {
    if (avatarFile) discardDesktopAvatarDraft()
    showToast(error instanceof Error ? error.message : '资料保存失败')
    return false
  } finally {
    state.profileAvatarUploading = false
    render()
  }
}

async function confirmDesktopProfileLeave() {
  if (!desktopProfileDraftDirty()) return true
  const shouldSave = window.confirm('资料尚未保存，是否保存？\n确定：保存当前资料\n取消：放弃修改')
  if (shouldSave) return saveDesktopProfileForm()
  discardDesktopAvatarDraft()
  state.profileEditing = false
  state.profileDraft = null
  return true
}

function bindEvents() {
  bindDesktopAvatarImages()
  document.querySelectorAll('.sidebar .nav-item').forEach((element) => {
    const label = element.querySelector('.nav-text')?.textContent?.trim()
    if (!label) return
    element.setAttribute('title', label)
    element.setAttribute('aria-label', label)
  })
  const backButton = document.querySelector('[data-action="navigate-back"]')
  backButton?.setAttribute('aria-label', 'Back')
  backButton?.setAttribute('title', 'Back')
  if (!messageMenuDismissBound) {
    messageMenuDismissHandler = (event) => {
      if (event.button !== 0) return
      const clickTarget = event.target instanceof Element ? event.target : null
      if (state.contactProfileExpanded && (!clickTarget || !clickTarget.closest('.context-panel, .chat-header [data-action="more"]'))) {
        state.contactProfileExpanded = false
        syncContactProfile()
      }
      if (state.showEmojiPanel || state.showMentionPicker) {
        const clickedComposerPicker = clickTarget?.closest(
          '.desktop-emoji-panel, .desktop-mention-picker, [data-action="toggle-emoji"], [data-action="mention"]',
        )
        if (!clickedComposerPicker) {
          state.showEmojiPanel = false
          state.showMentionPicker = false
          render()
          return
        }
      }
      if (state.profileMenuOpen && event.target instanceof Element && !event.target.closest('.profile-menu')) {
        state.profileMenuOpen = false
        render()
        return
      }
      if (state.showHomePlusMenu && (!clickTarget || !clickTarget.closest('.desktop-home-plus-wrap'))) {
        state.showHomePlusMenu = false
        render()
        return
      }
      if (!state.messageMenu && !state.conversationMenu && !state.fileMenu && !state.momentMenu && !state.momentMediaMenu && !state.sharedContentMenu && !state.contactMoreOpen && !state.deviceMenuId) return
      if (event.target instanceof Element && event.target.closest('[data-message-menu-panel], [data-conversation-menu], [data-file-menu], [data-shared-content-menu], [data-moment-menu], [data-media-context-menu], [data-contact-more-menu], [data-contact-more-toggle], [data-device-menu], [data-device-revoke]')) return
      state.messageMenu = null
      state.conversationMenu = null
      state.fileMenu = null
      state.sharedContentMenu = null
      state.momentMenu = null
      state.momentMediaMenu = null
      state.contactMoreOpen = false
      state.deviceMenuId = ''
      render()
    }
    document.addEventListener('click', messageMenuDismissHandler)
    messageMenuDismissBound = true
  }

  syncContactProfile()
  document.querySelector('.profile-actions button:last-child')?.addEventListener('click', () => {
    const selected = conversations[state.selectedConversation]
    if (!selected || selected.type === 'group') return
    if (!selected.peerUserId) {
      showToast('无法打开资料')
      return
    }
    void openContactModal(selected.peerUserId)
  })
  document.querySelector('.profile-context .context-card-label')?.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof Element) || !target.closest('button')) return
    event.preventDefault()
    event.stopImmediatePropagation()
    toggleContactProfile()
  }, true)
  document.querySelector('.profile-context .context-card-label button')?.addEventListener('click', () => {
    toggleContactProfile()
  })
  document.querySelector('.chat-header [data-action="more"]')?.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopImmediatePropagation()
    toggleContactProfile()
  }, true)
  document.querySelector('[data-login-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!state.clientAccess.phoneLoginEnabled) {
      state.loginError = '电脑端手机号登录已关闭'
      render()
      return
    }
    if (state.loginBusy) return
    const data = new FormData(event.currentTarget)
    const phone = String(data.get('phone') || '').trim()
    const password = String(data.get('password') || '')
    const securityCode = String(data.get('securityCode') || '').trim().toUpperCase()
    state.loginPhone = phone
    state.loginPassword = password
    state.loginSecurityCode = securityCode
    state.rememberLogin = data.get('rememberLogin') === 'on'
    setRememberLogin(state.rememberLogin)
    if (!state.rememberLogin) clearRememberedLogin()
    if (!phone) {
      state.loginError = '请输入手机号'
      render()
      return
    }
    if (!password) {
      state.loginError = '请输入密码'
      render()
      return
    }
    if (state.loginSecurityCodeRequired && !securityCode) {
      state.loginError = '请输入账号安全码'
      render()
      return
    }
    state.loginBusy = true
    state.loginError = ''
    state.loginNotice = ''
    render()
    try {
      const result = await loginDesktop(phone, password, state.rememberLogin, securityCode)
      if (state.rememberLogin) {
        saveRememberedLogin(phone, password)
      }
      state.authenticated = true
      state.loginSecurityCodeRequired = false
      state.loginSecurityCode = ''
      state.profile = { ...state.profile, ...result, userId: String(result.userId), avatarUrl: result.avatarUrl }
      await loadRemoteData()
    } catch (error) {
      const message = error instanceof Error ? error.message : '登录失败，请稍后重试'
      if (message.includes('SECURITY_CODE_REQUIRED')) {
        state.loginSecurityCodeRequired = true
        state.loginError = '这是新设备，请输入账号安全码'
      } else {
        state.loginError = message
      }
    } finally {
      state.loginBusy = false
      render()
    }
  })

  document.querySelector('[data-login-form] input[name="rememberLogin"]')?.addEventListener('change', (event) => {
    const checked = event.currentTarget.checked
    state.rememberLogin = checked
    setRememberLogin(checked)
    if (!checked) clearRememberedLogin()
  })

  document.querySelector('[data-register-phone-form]')?.addEventListener('submit', submitRegisterPhone)
  document.querySelector('[data-register-code-form]')?.addEventListener('submit', submitRegisterCode)
  document.querySelector('[data-register-code-form] input[name="registerCode"]')?.addEventListener('input', (event) => {
    state.registerCode = String(event.currentTarget.value || '').replace(/\D/g, '').slice(0, 6)
    event.currentTarget.value = state.registerCode
  })
  document.querySelector('[data-register-profile-form]')?.addEventListener('submit', submitRegisterProfile)
  document.querySelector('[data-register-profile-form] input[name="registerNickname"]')?.addEventListener('input', (event) => {
    state.registerNickname = event.currentTarget.value
  })
  document.querySelector('[data-register-profile-form] input[name="rememberLogin"]')?.addEventListener('change', (event) => {
    state.rememberLogin = event.currentTarget.checked
    setRememberLogin(state.rememberLogin)
  })

  document.querySelector('[data-forgot-form]')?.addEventListener('submit', submitResetPassword)
  document.querySelector('[data-forgot-form] input[name="resetPhone"]')?.addEventListener('input', (event) => {
    state.resetPhone = event.currentTarget.value
  })
  document.querySelector('[data-forgot-form] input[name="resetCode"]')?.addEventListener('input', (event) => {
    state.resetCode = event.currentTarget.value
  })

  document.querySelector('[data-profile-form]')?.addEventListener('input', (event) => {
    const input = event.target
    if (!(input instanceof HTMLInputElement) || !state.profileEditing) return
    state.profileDraft = { ...(state.profileDraft || state.profile), [input.name]: input.value }
  })
  document.querySelector('[data-profile-form]')?.addEventListener('submit', (event) => {
    event.preventDefault()
    const form = event.currentTarget
    if (form instanceof HTMLFormElement) {
      const data = new FormData(form)
      state.profileDraft = {
        ...(state.profileDraft || state.profile),
        nickname: String(data.get('nickname') || ''),
        signature: String(data.get('signature') || ''),
      }
    }
    void saveDesktopProfileForm()
  })
  document.querySelector('[data-profile-avatar-input]')?.addEventListener('change', (event) => {
    void handleDesktopAvatarSelected(event)
  })
  document.querySelectorAll('[data-device-menu]').forEach((element) => element.addEventListener('click', (event) => {
    event.stopPropagation()
    const deviceId = element.dataset.deviceMenu || ''
    state.deviceMenuId = state.deviceMenuId === deviceId ? '' : deviceId
    render()
  }))
  document.querySelectorAll('[data-device-revoke]').forEach((element) => element.addEventListener('click', (event) => {
    event.stopPropagation()
    requestRevokeDevice(element.dataset.deviceRevoke || '')
  }))
  document.querySelector('[data-device-logout-others]')?.addEventListener('click', () => {
    state.confirmDialog = { type: 'revoke-other-devices' }
    state.modal = 'confirm'
    render()
  })
  document.querySelector('[data-security-code-toggle]')?.addEventListener('change', (event) => {
    void toggleDesktopSecurityCode(Boolean(event.currentTarget.checked))
  })
  document.querySelector('[data-security-code-visibility]')?.addEventListener('click', () => {
    state.securityCodeVisible = !state.securityCodeVisible
    render()
  })
  document.querySelector('[data-security-code-copy]')?.addEventListener('click', async () => {
    const code = String(state.accountSecurity?.securityCode || '')
    if (!code) return
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard-unavailable')
      await navigator.clipboard.writeText(code)
      showToast('安全码已复制')
    } catch {
      showToast('复制失败，请手动记录安全码')
    }
  })
  document.querySelector('[data-security-code-refresh]')?.addEventListener('click', () => void refreshDesktopSecurityCodeValue())
  document.querySelector('[data-account-deletion-agree]')?.addEventListener('change', (event) => {
    state.accountDeletionAgreed = Boolean(event.currentTarget.checked)
  })
  document.querySelector('[data-account-deletion-continue]')?.addEventListener('click', continueDesktopAccountDeletion)
  document.querySelector('[data-storage-clear]')?.addEventListener('click', requestClearDesktopStorage)
  document.querySelectorAll('[data-storage-clear-kind]').forEach((element) => element.addEventListener('click', () => requestClearDesktopStorage(element.dataset.storageClearKind || '')))
  document.querySelector('[data-help-query]')?.addEventListener('input', (event) => {
    const input = event.currentTarget
    const cursor = input.selectionStart
    state.helpQuery = input.value
    render()
    const nextInput = document.querySelector('[data-help-query]')
    nextInput?.focus()
    if (cursor !== null) nextInput?.setSelectionRange(cursor, cursor)
  })
  document.querySelector('[data-feedback-content]')?.addEventListener('input', (event) => {
    state.feedbackContent = event.currentTarget.value
    const counter = document.querySelector('.feedback-form-footer small')
    if (counter) counter.textContent = `${state.feedbackContent.length}/1000`
  })
  document.querySelector('[data-submit-feedback]')?.addEventListener('click', () => void submitDesktopFeedbackForm())

  document.querySelector('[data-wallet-password-form]')?.addEventListener('submit', (event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    state.walletOldPassword = String(data.get('oldPassword') || '')
    state.walletNewPassword = String(data.get('newPassword') || '')
    state.walletConfirmPassword = String(data.get('confirmPassword') || '')
    void submitDesktopPaymentPassword()
  })
  document.querySelector('[data-wallet-type]')?.addEventListener('change', (event) => {
    state.walletType = event.currentTarget.value
    void loadWallet()
  })
  document.querySelector('[data-wallet-from]')?.addEventListener('change', (event) => {
    state.walletFrom = event.currentTarget.value
    void loadWallet()
  })
  document.querySelector('[data-wallet-to]')?.addEventListener('change', (event) => {
    state.walletTo = event.currentTarget.value
    void loadWallet()
  })
  document.querySelectorAll('[data-wallet-transaction]').forEach((element) => element.addEventListener('click', () => {
    void openWalletTransactionDetail(element.dataset.walletTransaction)
  }))

  document.querySelector('[data-chat-burn-toggle]')?.addEventListener('change', (event) => {
    const settings = desktopConversationSettings(conversations[state.selectedConversation])
    void saveDesktopBurnSetting(event.currentTarget.checked, settings.burnSeconds)
  })
  document.querySelector('[data-chat-burn-select]')?.addEventListener('change', (event) => {
    void saveDesktopBurnSetting(true, Number(event.currentTarget.value))
  })
  document.querySelector('[data-chat-auto-delete-toggle]')?.addEventListener('change', (event) => {
    const select = document.querySelector('[data-chat-auto-delete-select]')
    void saveDesktopAutoDeleteSetting(event.currentTarget.checked, Number(select?.value || 86400))
  })
  document.querySelector('[data-chat-auto-delete-select]')?.addEventListener('change', (event) => {
    void saveDesktopAutoDeleteSetting(true, Number(event.currentTarget.value || 86400))
  })
  document.querySelectorAll('[data-burn-view]').forEach((element) => element.addEventListener('click', async (event) => {
    event.preventDefault()
    event.stopPropagation()
    const selected = conversations[state.selectedConversation]
    const messageId = element.dataset.burnView || ''
    if (!selected?.id || !messageId) return
    try {
      const result = await viewDesktopBurnMedia(String(selected.id), messageId)
      const messages = currentMessages(selected)
      state.messagesByConversation[selected.id] = messages.map((message) => String(message.id) === messageId
        ? { ...message, burnReadAt: result.burnReadAt, burnExpiresAt: result.burnExpiresAt }
        : message)
      state.burnClock = Date.now()
      render()
    } catch (error) {
      showToast(error instanceof Error ? error.message : '查看失败，请稍后重试')
    }
  }))

  document.querySelector('[data-message-composer]')?.addEventListener('blur', () => {
    // 收到消息期间可能暂缓了整页同步；用户离开输入框后再补一次即可。
    window.setTimeout(flushDesktopDeferredRender, 0)
  })
  document.querySelector('[data-message-composer]')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendCurrentMessage()
    }
  })
  document.querySelector('[data-message-composer]')?.addEventListener('input', (event) => {
    const textarea = event.currentTarget
    state.composerText = textarea.value
    const selected = conversations[state.selectedConversation]
    if (selected?.type !== 'group' || !(event instanceof InputEvent) || event.inputType !== 'insertText' || event.data !== '@') return
    const caret = textarea.selectionStart ?? textarea.value.length
    const draft = { text: textarea.value, start: caret, end: textarea.selectionEnd ?? caret }
    openDesktopMentionPicker(draft)
  })
  document.querySelector('[data-message-composer]')?.addEventListener('paste', handleDesktopComposerPaste)
  const selectDesktopMentionMember = (element) => {
    const selected = conversations[state.selectedConversation]
    const member = desktopMentionCandidates(selected).find((item) => String(item.userId) === String(element.dataset.mentionMember || ''))
    if (member) pickDesktopMentionMember(member)
  }
  // pointerdown 发生在 textarea 失焦之前；阻止按钮抢焦点，避免第一次选择成员
  // 时触发 blur/render 把刚插入的 @昵称覆盖为空。保留 detail=0 的 click，支持键盘选择。
  document.querySelectorAll('[data-mention-all]').forEach((element) => {
    element.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      event.stopPropagation()
      pickDesktopAtAll()
    })
    element.addEventListener('click', (event) => {
      if (event.detail === 0) pickDesktopAtAll()
    })
  })
  document.querySelectorAll('[data-mention-member]').forEach((element) => {
    element.addEventListener('pointerdown', (event) => {
      event.preventDefault()
      event.stopPropagation()
      selectDesktopMentionMember(element)
    })
    element.addEventListener('click', (event) => {
      if (event.detail === 0) selectDesktopMentionMember(element)
    })
  })
  document.querySelectorAll('[data-emoji]').forEach((element) => element.addEventListener('click', () => {
    const textarea = document.querySelector('[data-message-composer]')
    if (!textarea) return
    textarea.value += element.dataset.emoji || ''
    state.composerText = textarea.value
    textarea.focus()
  }))
  document.querySelector('#desktop-file-input')?.addEventListener('change', (event) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (file) {
      clearPendingDesktopFile()
      setPendingDesktopFile(file)
    }
  })
  const dropZone = document.querySelector('[data-file-drop-zone]')
  if (dropZone) {
    let dragDepth = 0
    const hasFiles = (event) => Array.from(event.dataTransfer?.types || []).includes('Files')
    const setDragActive = (active) => {
      state.fileDragActive = active
      dropZone.classList.toggle('is-file-dragging', active)
    }
    dropZone.addEventListener('dragenter', (event) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      dragDepth += 1
      setDragActive(true)
    })
    dropZone.addEventListener('dragover', (event) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
      setDragActive(true)
    })
    dropZone.addEventListener('dragleave', (event) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      dragDepth = Math.max(0, dragDepth - 1)
      if (dragDepth === 0) setDragActive(false)
    })
    dropZone.addEventListener('drop', (event) => {
      if (!hasFiles(event)) return
      event.preventDefault()
      dragDepth = 0
      setDragActive(false)
      const file = event.dataTransfer?.files?.[0]
      if (file) setPendingDesktopFile(file)
    })
  }
  document.querySelectorAll('a[href*="/api/v1/files/raw/"]').forEach((element) => element.addEventListener('click', (event) => {
    if (!(element instanceof HTMLAnchorElement)) return
    if (element.matches('[data-desktop-file-preview], [data-chat-media-preview]')) return
    const href = element.getAttribute('href') || ''
    if (!href || href.startsWith('blob:')) return
    event.preventDefault()
    openDesktopFilePreview({ url: href, name: element.textContent?.trim() || '文件' })
  }))
  document.querySelectorAll('.chat-stream').forEach((stream) => {
    stream.addEventListener('click', (event) => {
      if (!state.messageMultiMode) return
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('[data-message-select-toggle]')) return
      const row = target?.closest('[data-message-multi-selectable]') || desktopMessageRowAtY(stream, event.clientY)
      if (!row) return
      handleDesktopMessageMultiInteraction(event, row)
    }, true)
    stream.addEventListener('scroll', () => {
      markDesktopChatScrolling()
      const conversationId = stream.dataset.conversationId || ''
      if (!conversationId) return
      const atLatest = stream.scrollHeight - stream.scrollTop - stream.clientHeight < 32
      state.chatScrollTopByConversation[conversationId] = stream.scrollTop
      state.chatAtLatestByConversation[conversationId] = atLatest
      if (atLatest) markDesktopConversationLatestRead(conversationId)
      if (!atLatest) syncDesktopLatestJumpDom(conversationId, true)
    })
  })

  document.querySelectorAll('[data-file-section]').forEach((element) => element.addEventListener('click', () => {
    state.fileMenu = null
    state.fileSection = element.dataset.fileSection || 'all'
    state.fileCategory = 'all'
    state.fileQuery = ''
    render()
  }))
  document.querySelectorAll('[data-file-category]').forEach((element) => element.addEventListener('click', () => {
    state.fileMenu = null
    state.fileSection = 'all'
    state.fileCategory = element.dataset.fileCategory || 'all'
    state.fileQuery = ''
    render()
  }))
  document.querySelector('#file-search')?.addEventListener('input', (event) => {
    state.fileQuery = event.currentTarget.value
    render()
    const input = document.querySelector('#file-search')
    if (input) {
      input.focus()
      input.setSelectionRange(state.fileQuery.length, state.fileQuery.length)
    }
  })
  document.querySelector('[data-file-sort]')?.addEventListener('change', (event) => {
    state.fileMenu = null
    state.fileSort = event.currentTarget.value || 'time'
    render()
  })
  document.querySelectorAll('.wechat-file-row').forEach((element) => element.addEventListener('contextmenu', (event) => {
    event.preventDefault()
    event.stopPropagation()
    const file = desktopFileById(element.dataset.fileId)
    if (!file) return
    state.messageMenu = null
    state.conversationMenu = null
    state.momentMenu = null
    state.fileMenu = getDesktopFileMenuPosition(event, file)
    render()
  }))
  document.querySelectorAll('[data-file-action]').forEach((element) => element.addEventListener('click', () => {
    void handleDesktopFileAction(element.dataset.fileAction, element.dataset.fileId)
  }))
  document.querySelectorAll('[data-shared-content-item]').forEach((element) => {
    element.addEventListener('contextmenu', (event) => {
      event.preventDefault()
      event.stopPropagation()
      const message = desktopSharedContentMessage(element.dataset.sharedContentMessageId)
      if (!message || state.sharedContentFilter !== 'file') return
      state.messageMenu = null
      state.fileMenu = null
      state.sharedContentMenu = { messageId: String(message.id), ...getDesktopSharedContentMenuPosition(event) }
      render()
    })
    element.addEventListener('click', (event) => {
      if (state.sharedContentFilter !== 'file') return
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('[data-desktop-file-preview], [data-chat-media-preview], a, button, video, audio')) return
      const message = desktopSharedContentMessage(element.dataset.sharedContentMessageId)
      if (!message) return
      event.preventDefault()
      openDesktopSharedContentFile(message)
    })
  })
  document.querySelectorAll('[data-shared-content-action]').forEach((element) => element.addEventListener('click', () => {
    void handleDesktopSharedContentAction(element.dataset.sharedContentAction, element.dataset.sharedContentMessageId)
  }))
  document.querySelectorAll('[data-moment-media-preview]').forEach((element) => {
    const descriptor = () => ({
      url: element.dataset.momentMediaPreview || '',
      originalUrl: element.dataset.momentMediaOriginalUrl || '',
      fileId: element.dataset.fileId || '',
      type: element.dataset.momentMediaType || 'image',
      name: element.dataset.momentMediaName || '',
      momentId: element.closest('[data-moment-card]')?.dataset.momentCard || state.momentDetail?.id || '',
    })
    element.addEventListener('click', (event) => {
      event.preventDefault()
      openDesktopMediaPreview(descriptor())
    })
    element.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      openDesktopMediaPreview(descriptor())
    })
    element.addEventListener('contextmenu', (event) => {
      event.preventDefault()
      event.stopPropagation()
      state.momentMenu = null
      state.momentMediaMenu = { ...descriptor(), ...desktopMediaMenuPosition(event) }
      render()
    })
  })
  document.querySelectorAll('[data-chat-media-preview]').forEach((element) => {
    const descriptor = () => {
      const type = element.dataset.chatMediaType === 'video' ? 'video' : 'image'
      const previewUrl = element.dataset.chatMediaUrl || ''
      const mediumUrl = element.dataset.chatMediaPreviewUrl || previewUrl
      const originalUrl = element.dataset.chatMediaOriginalUrl || ''
      return {
      url: mediumUrl,
      originalUrl,
      fileId: element.dataset.fileId || '',
      type,
      name: element.dataset.chatMediaName || (type === 'video' ? '聊天视频' : '聊天图片'),
      burnAfterRead: element.dataset.burnMedia === 'true',
      }
    }
    element.addEventListener('click', (event) => {
      if (handleDesktopMessageMultiInteraction(event, element)) return
      event.preventDefault()
      event.stopPropagation()
      openDesktopMediaPreview(descriptor())
    })
  })
  document.querySelectorAll('[data-moment-card]').forEach((element) => element.addEventListener('contextmenu', (event) => {
    event.preventDefault()
    event.stopPropagation()
    const momentId = String(element.dataset.momentCard || '')
    if (!state.moments.some((item) => String(item.id) === momentId)) return
    state.messageMenu = null
    state.conversationMenu = null
    state.fileMenu = null
    state.momentMenu = { momentId, ...getMomentMenuPosition(event) }
    render()
  }))
  document.querySelectorAll('[data-moment-action]').forEach((element) => element.addEventListener('click', (event) => {
    event.preventDefault()
    void toggleMomentFavorite(element.dataset.momentId)
  }))
  document.querySelectorAll('[data-media-action]').forEach((element) => element.addEventListener('click', async () => {
    const action = element.dataset.mediaAction || ''
    const menu = state.momentMediaMenu
    if (!menu || state.mediaActionBusy) return
    if (menu.burnAfterRead) {
      dismissDesktopMediaContextMenu()
      showToast('阅后即焚消息不能复制或保存')
      return
    }
    dismissDesktopMediaContextMenu()
    if (action === 'favorite') {
      if (menu.momentId) await toggleMomentFavorite(menu.momentId)
      else showToast('当前媒体无法收藏')
      return
    }
    if (action === 'forward') return openDesktopMediaForward(menu)
    if (action === 'edit') {
      const editUrl = String(menu.originalUrl || menu.url || '')
      state.mediaActionBusy = 'edit'
      state.mediaPreview = {
        url: editUrl,
        originalUrl: String(menu.originalUrl || ''),
        usingOriginal: Boolean(menu.originalUrl),
        type: menu.type,
        name: menu.name,
        momentId: menu.momentId,
      }
      state.mediaEditor = createDesktopMediaEditor()
      render()
      try {
        await preloadDesktopProtectedMedia(editUrl, menu.type)
      } catch (error) {
        showToast(error instanceof Error ? error.message : '图片加载失败')
      } finally {
        state.mediaActionBusy = ''
        if (state.mediaPreview) render()
      }
      return
    }
    // Remove the custom media menu immediately; copying/saving protected
    // media may need to wait for an authenticated download.
    state.mediaActionBusy = action === 'copy' ? 'copy' : action === 'save' ? 'save' : ''
    render()
    try {
      if (action === 'copy') {
        showToast('正在复制媒体…')
        await copyDesktopCurrentMedia(menu)
        showToast('媒体已复制')
      } else if (action === 'save') {
        showToast('正在保存媒体…')
        const result = await saveDesktopCurrentMedia(menu)
        if (result?.saved !== false) {
          showToast(result?.copied ? '编辑后的图片已保存，并已复制到剪贴板' : '媒体已保存到本地')
        }
      }
    } catch (error) {
      if (error?.name !== 'AbortError') showToast(error instanceof Error ? error.message : '媒体操作失败')
    } finally {
      state.mediaActionBusy = ''
      if (state.mediaPreview) render()
    }
  }))
  document.querySelector('[data-media-preview-backdrop]')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeDesktopMediaPreview()
  })
  document.querySelector('[data-media-preview-close]')?.addEventListener('click', closeDesktopMediaPreview)
  document.querySelector('[data-media-preview-original]')?.addEventListener('click', loadDesktopOriginalMedia)
  document.querySelector('[data-media-preview-edit]')?.addEventListener('click', async () => {
    const preview = state.mediaPreview
    if (!preview || state.mediaActionBusy) return
    if (preview.burnAfterRead) {
      showToast('阅后即焚消息不能编辑')
      return
    }
    const editUrl = preview.originalUrl || preview.url
    state.mediaActionBusy = 'edit'
    render()
    let editorOpened = false
    try {
      await preloadDesktopProtectedMedia(editUrl, preview.type)
      if (state.mediaPreview !== preview) return
      state.mediaPreview = { ...preview, url: editUrl, usingOriginal: Boolean(preview.originalUrl) }
      state.mediaEditor = createDesktopMediaEditor()
      editorOpened = true
    } catch (error) {
      showToast(error instanceof Error ? error.message : '图片加载失败')
    } finally {
      if (editorOpened || state.mediaPreview === preview) {
        state.mediaActionBusy = ''
        render()
      }
    }
  })
  document.querySelector('[data-media-preview-save]')?.addEventListener('click', async () => {
    const preview = state.mediaPreview
    if (!preview || state.mediaActionBusy) return
    if (preview.burnAfterRead) {
      showToast('阅后即焚消息不能保存')
      return
    }
    state.mediaActionBusy = 'save'
    render()
    try {
      showToast('正在保存媒体…')
      const result = await saveDesktopCurrentMedia(preview)
      if (result?.saved !== false) {
        showToast(result?.copied ? '编辑后的图片已保存，并已复制到剪贴板' : '媒体已保存到本地')
      }
    } catch (error) {
      if (error?.name !== 'AbortError') showToast(error instanceof Error ? error.message : '媒体保存失败')
    } finally {
      if (state.mediaPreview === preview) {
        state.mediaActionBusy = ''
        render()
      }
    }
  })
  document.querySelectorAll('[data-media-editor-tool]').forEach((element) => element.addEventListener('click', () => {
    const editor = state.mediaEditor
    const tool = element.dataset.mediaEditorTool || 'brush'
    if (!editor || !['brush', 'rect', 'ellipse', 'crop'].includes(tool)) return
    state.mediaEditor = { ...editor, tool }
    render()
  }))
  document.querySelector('[data-media-editor-undo]')?.addEventListener('click', undoDesktopMediaEditor)
  document.querySelector('[data-media-editor-cancel]')?.addEventListener('click', () => {
    state.mediaEditor = null
    render()
  })
  document.querySelector('[data-media-editor-rotate]')?.addEventListener('click', () => {
    const editor = state.mediaEditor
    if (!editor) return
    commitDesktopMediaEditorChange({ ...editor, rotation: Number(editor.rotation || 0) + 90 })
  })
  document.querySelector('[data-media-editor-filter]')?.addEventListener('click', () => {
    const editor = state.mediaEditor
    if (!editor) return
    commitDesktopMediaEditorChange({ ...editor, filter: editor.filter === 'grayscale' ? 'none' : 'grayscale' })
  })
  document.querySelector('[data-media-editor-save]')?.addEventListener('click', async () => {
    try {
      await copyEditedDesktopMomentImage()
      showToast('编辑后的图片已复制到剪贴板')
    } catch (error) {
      if (error?.name !== 'AbortError') showToast(error instanceof Error ? error.message : '复制编辑图片失败')
    }
  })
  bindDesktopMediaEditorCanvas()
  document.querySelector('[data-media-preview-backdrop]')?.addEventListener('contextmenu', (event) => {
    event.preventDefault()
    const preview = state.mediaPreview
    if (!preview) return
    state.momentMediaMenu = { ...preview, ...desktopMediaMenuPosition(event) }
    render()
  })
  document.querySelectorAll('[data-media-forward-target]').forEach((element) => element.addEventListener('click', () => {
    const id = String(element.dataset.mediaForwardTarget || '')
    const next = new Set(state.mediaForwardTargets)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    state.mediaForwardTargets = next
    render()
  }))
  document.querySelector('[data-media-forward-submit]')?.addEventListener('click', () => void submitDesktopMediaForward())

  document.querySelectorAll('[data-page]').forEach((element) => element.addEventListener('click', () => {
    const targetPage = String(element.dataset.page || '')
    if (targetPage === 'wallet' && !isDesktopWalletEnabled()) {
      showToast('电脑端钱包功能已关闭')
      return
    }
    if (desktopProfileDraftDirty()) {
      void confirmDesktopProfileLeave().then((ok) => {
        if (ok) element.click()
      })
      return
    }
    if (state.profileAvatarFile) discardDesktopAvatarDraft()
    state.profileMenuOpen = false
    if (targetPage === 'moments') state.friendMomentsProfile = null
    if (state.page === 'moments' && targetPage !== 'moments'
      && state.momentDraftDirty
      && (String(state.momentDraftText || '').trim() || state.momentFiles.length)) {
      // 离开朋友圈编辑时确认是否保存草稿
      const keep = window.confirm('是否保存朋友圈草稿？\n确定：保存草稿，下次进入自动恢复\n取消：不保存')
      if (keep) saveDesktopMomentDraft()
      else discardDesktopMomentEditor()
    }
    state.fileMenu = null
    state.momentMenu = null
    state.momentMediaMenu = null
    state.mediaPreview = null
    state.mediaEditor = null
    state.mediaActionBusy = ''
    state.page = targetPage
    if (state.page === 'settings') state.settingsSection = 'profile'
    if (state.page === 'files') {
      state.fileSection = 'all'
      state.fileCategory = 'all'
      state.fileQuery = ''
    }
    if (state.page !== 'messages') state.contactQuery = ''
    state.messageMenu = null
    render()
    loadDesktopPageData(state.page)
  }))
  document.querySelectorAll('[data-settings-section]').forEach((element) => element.addEventListener('click', () => {
    if (desktopProfileDraftDirty()) {
      void confirmDesktopProfileLeave().then((ok) => {
        if (ok) element.click()
      })
      return
    }
    if (state.profileAvatarFile) discardDesktopAvatarDraft()
    state.profileMenuOpen = false
    state.settingsSection = element.dataset.settingsSection || 'profile'
    state.page = 'settings'
    render()
    if (state.settingsSection === 'friend-permission') void loadPrivacySettings()
  }))
  document.querySelectorAll('[data-group-conversation]').forEach((element) => element.addEventListener('click', () => {
    const nextIndex = Number(element.dataset.groupConversation)
    if (!conversations[nextIndex]) return
    state.page = 'messages'
    state.scrollChatToBottom = Number(conversations[nextIndex].unread || 0) > 0
    state.selectedConversation = nextIndex
    clearPendingDesktopFile()
    state.messageSearchQuery = ''
    state.messageMenu = null
    state.showMentionPicker = false
    clearPendingDesktopMentions()
    state.mentionJumpIds = []
    clearDesktopMessageSelection()
    state.contactProfileExpanded = false
    render()
    void loadSelectedMessages()
  }))
  document.querySelectorAll('[data-contact-view]').forEach((element) => element.addEventListener('click', () => {
    const view = element.dataset.contactView === 'list' ? 'list' : 'grid'
    if (state.contactView === view) return
    state.contactView = view
    render()
  }))
  document.querySelectorAll('[data-conversation]').forEach((element) => element.addEventListener('click', () => {
    const nextIndex = Number(element.dataset.conversation)
    state.scrollChatToBottom = Number(conversations[nextIndex]?.unread || 0) > 0
    state.selectedConversation = nextIndex
    clearPendingDesktopFile()
    state.messageSearchQuery = ''
    state.messageMenu = null
    state.showMentionPicker = false
    clearPendingDesktopMentions()
    state.mentionJumpIds = []
    clearDesktopMessageSelection()
    state.contactProfileExpanded = false
    render()
    void loadSelectedMessages()
  }))
  document.querySelectorAll('[data-conversation]').forEach((element) => element.addEventListener('contextmenu', (event) => {
    event.preventDefault()
    const rect = element.getBoundingClientRect()
    const menuWidth = 150
    const menuHeight = 205
    const left = Math.min(event.clientX || rect.right, window.innerWidth - menuWidth - 8)
    const top = Math.min(event.clientY || rect.bottom, window.innerHeight - menuHeight - 8)
    state.messageMenu = null
    state.momentMenu = null
    state.conversationMenu = { index: Number(element.dataset.conversation), left, top }
    render()
  }))
  document.querySelector('#conversation-search')?.addEventListener('input', (event) => {
    state.contactQuery = event.target.value
    const cursor = event.target.selectionStart
    render()
    const input = document.querySelector('#conversation-search')
    input.focus()
    input.setSelectionRange(cursor, cursor)
  })
  document.querySelector('#contact-search')?.addEventListener('input', (event) => {
    state.contactQuery = event.target.value
    const cursor = event.target.selectionStart
    render()
    const input = document.querySelector('#contact-search')
    input.focus()
    input.setSelectionRange(cursor, cursor)
  })
  document.querySelector('#group-search')?.addEventListener('input', (event) => {
    state.groupQuery = event.target.value
    const cursor = event.target.selectionStart
    render()
    const input = document.querySelector('#group-search')
    input.focus()
    input.setSelectionRange(cursor, cursor)
  })

  document.querySelector('#global-search')?.addEventListener('input', (event) => {
    const keyword = String(event.currentTarget.value || '')
    state.globalSearchQuery = keyword
    if (desktopSearchDebounceTimer) window.clearTimeout(desktopSearchDebounceTimer)
    if (!keyword.trim()) return
    desktopSearchDebounceTimer = window.setTimeout(() => {
      desktopSearchDebounceTimer = null
      openSearchModal(keyword)
    }, 280)
  })
  document.querySelector('#global-search')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      state.globalSearchQuery = event.currentTarget.value || ''
      openSearchModal(event.currentTarget.value)
    }
  })
  document.querySelector('[data-modal-backdrop]')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) resetModal()
  })
  document.querySelectorAll('[data-modal-close]').forEach((element) => element.addEventListener('click', resetModal))
  document.querySelector('[data-desktop-lock-screen-form]')?.addEventListener('submit', (event) => {
    void saveDesktopLockPassword(event)
  })
  document.querySelector('[data-desktop-unlock-form]')?.addEventListener('submit', (event) => {
    void unlockDesktopApplication(event)
  })
  document.querySelector('[data-location-search-form]')?.addEventListener('submit', (event) => {
    event.preventDefault()
    if (desktopLocationPickerRuntime.searchTimer) window.clearTimeout(desktopLocationPickerRuntime.searchTimer)
    searchDesktopLocationPicker()
  })
  document.querySelector('[data-location-query]')?.addEventListener('input', (event) => {
    state.locationPicker.keyword = String(event.currentTarget.value || '')
    scheduleDesktopLocationSearch()
  })
  document.querySelector('[data-location-query]')?.addEventListener('compositionstart', () => {
    desktopLocationPickerRuntime.composing = true
    if (desktopLocationPickerRuntime.searchTimer) window.clearTimeout(desktopLocationPickerRuntime.searchTimer)
  })
  document.querySelector('[data-location-query]')?.addEventListener('compositionend', () => {
    desktopLocationPickerRuntime.composing = false
    scheduleDesktopLocationSearch()
  })
  document.querySelector('[data-location-current]')?.addEventListener('click', () => locateDesktopLocationPicker(true))
  document.querySelector('[data-location-recenter]')?.addEventListener('click', () => locateDesktopLocationPicker(false))
  document.querySelector('[data-location-send]')?.addEventListener('click', () => void completeDesktopLocationPickerSelection())
  document.querySelector('[data-location-results]')?.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-location-result]') : null
    if (!target) return
    const item = state.locationPicker.results[Number(target.dataset.locationResult)]
    if (item?.point) applyDesktopLocationPickerSelection(item)
  })
  document.querySelector('[data-location-nearby]')?.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-location-nearby]') : null
    if (!target) return
    const item = state.locationPicker.nearby[Number(target.dataset.locationNearby)]
    if (item?.point) applyDesktopLocationPickerSelection(item)
  })
  document.querySelectorAll('[data-red-packet-no]').forEach((element) => element.addEventListener('click', (event) => {
    event.stopPropagation()
    void openDesktopRedPacket(element.dataset.redPacketNo)
  }))
  document.querySelector('[data-red-packet-receive]')?.addEventListener('click', () => {
    void receiveDesktopRedPacketFlow()
  })
  document.querySelectorAll('[data-transfer-no]').forEach((element) => element.addEventListener('click', (event) => {
    event.stopPropagation()
    void openDesktopTransfer(element.dataset.transferNo)
  }))
  document.querySelector('[data-transfer-receive]')?.addEventListener('click', () => {
    void receiveDesktopTransferFlow()
  })
  document.querySelector('[data-desktop-scheduled-type]')?.addEventListener('change', handleDesktopScheduledTypeChange)
  document.querySelector('[data-desktop-scheduled-content]')?.addEventListener('input', (event) => {
    if (state.scheduledDialog) state.scheduledDialog.content = event.currentTarget.value
  })
  document.querySelector('[data-desktop-scheduled-at]')?.addEventListener('input', (event) => {
    if (state.scheduledDialog) state.scheduledDialog.sendAt = event.currentTarget.value
  })
  document.querySelector('[data-desktop-scheduled-pick]')?.addEventListener('click', () => {
    document.querySelector('[data-desktop-scheduled-file]')?.click()
  })
  document.querySelector('[data-desktop-scheduled-file]')?.addEventListener('change', (event) => {
    void handleDesktopScheduledFileChange(event)
  })
  document.querySelector('[data-desktop-scheduled-form]')?.addEventListener('submit', (event) => {
    event.preventDefault()
    void saveDesktopScheduledDialog()
  })
  document.querySelector('[data-input-dialog-form]')?.addEventListener('input', (event) => {
    const input = event.target
    if (state.inputDialog && input?.name) state.inputDialog.values[input.name] = input.value
  })
  document.querySelector('[data-input-dialog-form]')?.addEventListener('change', (event) => {
    const input = event.target
    if (state.inputDialog && input?.name) {
      state.inputDialog.values[input.name] = input.value
      if (input.name === 'packetType') render()
    }
  })
  document.querySelector('[data-input-dialog-form]')?.addEventListener('submit', submitInputDialog)
  document.querySelector('[data-confirm-cancel]')?.addEventListener('click', resetModal)
  document.querySelector('[data-confirm-submit]')?.addEventListener('click', () => {
    void confirmDialogAction()
  })
  document.querySelector('[data-new-message-form]')?.addEventListener('submit', (event) => {
    event.preventDefault()
    const input = event.currentTarget.querySelector('[data-modal-query]')
    void runModalSearch(input.value)
  })
  document.querySelectorAll('[data-group-create-contact]').forEach((element) => element.addEventListener('click', () => {
    const id = String(element.dataset.groupCreateContact || '')
    const selected = new Set(state.groupCreateSelected)
    if (selected.has(id)) selected.delete(id)
    else selected.add(id)
    state.groupCreateSelected = selected
    render()
  }))
  document.querySelector('[data-group-create-title]')?.addEventListener('input', (event) => {
    state.groupCreateTitle = event.currentTarget.value
  })
  document.querySelector('[data-group-create-submit]')?.addEventListener('click', () => {
    void submitDesktopGroupCreate()
  })
  document.querySelector('[data-desktop-group-search-form]')?.addEventListener('submit', (event) => {
    event.preventDefault()
    const input = event.currentTarget.querySelector('[data-desktop-group-search-query]')
    void runDesktopGroupSearch(input?.value || '')
  })
  document.querySelector('[data-desktop-group-search-query]')?.addEventListener('input', (event) => {
    state.groupSearchQuery = event.currentTarget.value
  })
  document.querySelectorAll('[data-desktop-group-result]').forEach((element) => element.addEventListener('click', () => {
    const group = (state.groupSearchResults || []).find((item) => String(item.id) === String(element.dataset.desktopGroupResult))
    void joinDesktopSearchGroup(group)
  }))
  document.querySelector('[data-search-form]')?.addEventListener('submit', (event) => {
    event.preventDefault()
    const input = event.currentTarget.querySelector('[data-modal-query]')
    void runModalSearch(input.value)
  })
  document.querySelector('[data-search-form] [data-modal-query]')?.addEventListener('input', (event) => {
    scheduleDesktopModalSearch(event.currentTarget.value)
  })
  document.querySelector('[data-search-contact-more]')?.addEventListener('click', () => {
    state.modalContactLimit = Number(state.modalResults?.contacts?.length || 3)
    render()
    focusDesktopSearchModalInput()
  })
  document.querySelectorAll('[data-start-conversation], [data-contact-start]').forEach((element) => element.addEventListener('click', () => {
    void startDesktopConversation(element.dataset.startConversation || element.dataset.contactStart)
  }))
  document.querySelectorAll('[data-view-contact]').forEach((element) => element.addEventListener('click', () => {
    void openContactModal(element.dataset.viewContact)
  }))
  document.querySelectorAll('[data-contact-section]').forEach((element) => {
    const open = () => openContactSection(element.dataset.contactSection)
    element.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('button, a, input, [data-contact-moment], [data-contact-group]')) return
      open()
    })
    element.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      open()
    })
  })
  document.querySelectorAll('[data-contact-profile-back]').forEach((element) => element.addEventListener('click', backToContactProfile))
  document.querySelectorAll('[data-contact-group]').forEach((element) => element.addEventListener('click', (event) => {
    event.stopPropagation()
    void openContactGroup(element.dataset.contactGroup)
  }))
  document.querySelectorAll('[data-search-group]').forEach((element) => element.addEventListener('click', () => {
    void openContactGroup(element.dataset.searchGroup)
  }))
  document.querySelectorAll('[data-search-conversation]').forEach((element) => element.addEventListener('click', () => {
    const id = element.dataset.searchConversation
    const hit = state.modalResults?.conversations?.find((item) => String(item.conversationId) === String(id))
      || state.modalResults?.messages?.find((item) => String(item.conversationId) === String(id))
    if (hit?.conversationTitle === '文件传输助手') {
      openDesktopConversationAndJump(id, hit.latestMsgId || hit.msgId || '')
      return
    }
    void openDesktopConversationSearch(id, state.modalQuery)
  }))
  document.querySelector('[data-contact-add]')?.addEventListener('click', () => {
    void addDesktopContact(document.querySelector('[data-contact-add]').dataset.contactAdd)
  })
  document.querySelector('[data-contact-copy-pulse]')?.addEventListener('click', (event) => {
    event.stopPropagation()
    void copyDesktopValue(event.currentTarget.dataset.contactCopyPulse, 'Pulse ID')
  })
  document.querySelector('[data-contact-delete]')?.addEventListener('click', () => {
    requestDesktopFriendDelete()
  })
  document.querySelector('[data-contact-block]')?.addEventListener('click', () => {
    requestDesktopFriendBlock()
  })
  document.querySelector('[data-contact-remark-edit]')?.addEventListener('click', () => {
    void editDesktopFriendRemark()
  })
  document.querySelector('[data-contact-remark-disabled]')?.addEventListener('click', () => {
    showToast('平台默认好友由后台统一管理，不支持修改备注')
  })
  document.querySelectorAll('[data-message-menu]').forEach((element) => element.addEventListener('contextmenu', (event) => {
    event.preventDefault()
    if (state.messageMultiMode) return
    const conversation = conversations[state.selectedConversation]
    const message = currentMessages(conversation).find((item) => item.id === element.dataset.messageId)
    if (!conversation?.id || !message) return
    const position = getMessageMenuPosition(event, message)
    document.documentElement.style.setProperty('--message-menu-left', `${position.left}px`)
    document.documentElement.style.setProperty('--message-menu-top', `${position.top}px`)
    state.messageMenu = {
      conversationId: conversation.id,
      messageId: element.dataset.messageId,
      ...position,
    }
    render()
  }))
  document.querySelectorAll('[data-message-action]').forEach((element) => element.addEventListener('click', () => {
    void handleMessageAction(element.dataset.messageAction, element.dataset.messageId)
  }))
  document.querySelectorAll('[data-message-reedit]').forEach((element) => element.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    const id = String(element.dataset.messageReedit || '')
    const selected = conversations[state.selectedConversation]
    const message = currentMessages(selected).find((item) => String(item.id) === id)
    if (!message || !canReeditDesktopRecalledMessage(message)) return
    state.recalledEditHiddenIds.add(id)
    state.replyTarget = null
    const composer = document.querySelector('[data-message-composer]')
    if (composer instanceof HTMLTextAreaElement) {
      composer.value = message.content || ''
      state.composerText = message.content || ''
      composer.focus()
      composer.setSelectionRange(composer.value.length, composer.value.length)
    } else {
      state.composerText = message.content || ''
    }
    render()
    window.setTimeout(() => {
      const nextComposer = document.querySelector('[data-message-composer]')
      if (nextComposer instanceof HTMLTextAreaElement) {
        nextComposer.focus()
        nextComposer.setSelectionRange(nextComposer.value.length, nextComposer.value.length)
      }
    }, 0)
  }))
  document.querySelectorAll('[data-desktop-file-preview]').forEach((element) => element.addEventListener('click', (event) => {
    if (handleDesktopMessageMultiInteraction(event, element)) return
    event.preventDefault()
    event.stopPropagation()
    openDesktopFilePreview({
      url: element.dataset.fileUrl || '',
      previewUrl: element.dataset.filePreviewUrl || '',
      originalUrl: element.dataset.fileOriginalUrl || '',
      fileId: element.dataset.fileId || '',
      name: element.dataset.fileName || '文件',
      size: Number(element.dataset.fileSize || 0),
      contentType: element.dataset.fileType || 'application/octet-stream',
      burnAfterRead: element.dataset.burnMedia === 'true',
    })
  }))
  document.querySelector('[data-file-preview-download]')?.addEventListener('click', async () => {
    const preview = state.filePreview
    if (!preview || (!preview.blob && preview.kind !== 'pdf')) return
    try {
      const blob = preview.blob || await fetchDesktopProtectedBlob(preview.url)
      await saveDesktopBlobAs(blob, preview.name || '文件')
    } catch (error) {
      if (error?.name !== 'AbortError') showToast(error instanceof Error ? error.message : '文件保存失败')
    }
  })
  document.querySelectorAll('[data-forward-detail]').forEach((element) => element.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (state.messageMultiMode) return
    const conversation = conversations[state.selectedConversation]
    const messageId = String(element.dataset.forwardDetail || '')
    const message = currentMessages(conversation).find((item) => String(item.id) === messageId)
    if (message) openDesktopForwardDetail(message)
    else showToast('聊天记录内容暂时无法读取')
  }))
  document.querySelectorAll('[data-message-reply]').forEach((element) => element.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    void scrollToDesktopMessageWithHistory(element.dataset.replyToMessageId)
  }))
  document.querySelectorAll('[data-message-select-toggle]').forEach((element) => element.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    toggleDesktopMessageSelection(element.dataset.messageSelectToggle)
  }))
  document.querySelectorAll('[data-message-multi-selectable]').forEach((element) => element.addEventListener('click', (event) => {
    if (!state.messageMultiMode) return
    if (event.target instanceof Element && event.target.closest('[data-message-select-toggle]')) return
    handleDesktopMessageMultiInteraction(event, element)
  }, true))
  document.querySelectorAll('[data-message-multi-action]').forEach((element) => element.addEventListener('click', () => {
    const action = element.dataset.messageMultiAction
    if (action === 'cancel') {
      clearDesktopMessageSelection()
      render()
      return
    }
    const ids = [...state.messageSelection]
    if (!ids.length) return
    if (action === 'forward') openDesktopMessageForward(ids)
    else void handleMessageAction(action, ids)
  }))
  document.querySelectorAll('[data-message-forward-target]').forEach((element) => element.addEventListener('click', () => {
    const id = String(element.dataset.messageForwardTarget || '')
    const next = new Set(state.messageForwardTargets)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    state.messageForwardTargets = next
    render()
  }))
  document.querySelectorAll('[data-message-forward-mode]').forEach((element) => element.addEventListener('click', () => {
    state.messageForwardMode = element.dataset.messageForwardMode === 'separate' ? 'separate' : 'merge'
    render()
  }))
  document.querySelector('[data-message-forward-submit]')?.addEventListener('click', () => {
    void submitDesktopMessageForward()
  })
  document.querySelectorAll('[data-conversation-action]').forEach((element) => element.addEventListener('click', () => {
    void handleConversationAction(element.dataset.conversationIndex, element.dataset.conversationAction)
  }))
  document.querySelectorAll('[data-conversation-clear-scope]').forEach((element) => element.addEventListener('click', () => {
    chooseDesktopConversationClearScope(element.dataset.conversationClearScope)
  }))
  document.querySelectorAll('[data-favorite-select]').forEach((element) => element.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    toggleDesktopFavoriteSelection(element.dataset.favoriteSelect)
  }))
  document.querySelectorAll('[data-favorite-select-all]').forEach((element) => element.addEventListener('click', (event) => {
    event.preventDefault()
    toggleAllDesktopFavoriteSelection()
  }))
  document.querySelectorAll('[data-favorite-forward-selected]').forEach((element) => element.addEventListener('click', (event) => {
    event.preventDefault()
    openDesktopFavoriteForward()
  }))
  document.querySelectorAll('[data-favorite-delete-selected]').forEach((element) => element.addEventListener('click', (event) => {
    event.preventDefault()
    requestDeleteSelectedFavorites()
  }))
  document.querySelectorAll('[data-favorite-forward-target]').forEach((element) => element.addEventListener('click', () => {
    const id = String(element.dataset.favoriteForwardTarget || '')
    const next = new Set(state.favoriteForwardTargets)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    state.favoriteForwardTargets = next
    render()
  }))
  document.querySelector('[data-favorite-forward-submit]')?.addEventListener('click', () => {
    void submitDesktopFavoriteForward()
  })
  document.querySelectorAll('[data-favorite-forward-one]').forEach((element) => element.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    openDesktopFavoriteForward([element.dataset.favoriteForwardOne])
  }))
  document.querySelectorAll('[data-favorite-open]').forEach((element) => element.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('[data-favorite-delete], [data-favorite-forward-one]')) return
    if (state.favoriteOrganizing) {
      event.preventDefault()
      toggleDesktopFavoriteSelection(element.dataset.favoriteOpen)
      return
    }
    void openFavoriteDetail(element.dataset.favoriteOpen)
  }))
  document.querySelectorAll('[data-favorite-delete]').forEach((element) => element.addEventListener('click', (event) => {
    event.stopPropagation()
    requestRemoveFavorite(element.dataset.favoriteDelete)
  }))
  document.querySelector('[data-favorite-forward-detail]')?.addEventListener('click', (event) => {
    event.preventDefault()
    void openDesktopFavoriteForward([event.currentTarget.dataset.favoriteForwardDetail])
  })
  document.querySelector('[data-favorite-open-conversation]')?.addEventListener('click', openFavoriteConversation)
  document.querySelector('[data-moment-form]')?.addEventListener('submit', (event) => {
    event.preventDefault()
    void publishMoment()
  })
  document.querySelector('[data-moment-save-draft]')?.addEventListener('click', () => {
    if (!String(state.momentDraftText || '').trim() && state.momentFiles.length === 0 && !state.momentLocation) {
      showToast('还没有可保存的内容')
      return
    }
    saveDesktopMomentDraft()
    showToast('草稿已保存，下次进入朋友圈自动恢复')
  })
  const momentComposerForm = document.querySelector('[data-moment-form]')
  const momentComposeTools = momentComposerForm?.querySelector('.desktop-moment-compose-tools')
  if (momentComposeTools && !momentComposeTools.querySelector('[data-action="moment-mention-picker"]')) {
    const mentionLabel = momentMentionLabel()
    momentComposeTools.insertAdjacentHTML('afterbegin', `<button type="button" class="moment-mention-button" data-action="moment-mention-picker" title="\u63d0\u9192\u8c01\u770b">${icon('person')} <span>\u0040 \u63d0\u9192\u8c01\u770b${mentionLabel ? ` \u00b7 ${escapeHtml(mentionLabel)}` : ''}</span></button>`)
  }
  const momentContent = document.querySelector('[data-moment-content]')
  if (momentContent && !momentComposerForm?.querySelector('[data-moment-mention-menu]')) {
    momentContent.insertAdjacentHTML('afterend', '<div class="desktop-moment-mention-menu" data-moment-mention-menu hidden></div>')
  }
  renderMomentMentionMenu()
  document.querySelector('[data-moment-mention-menu]')?.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-moment-mention-suggestion]') : null
    if (!target) return
    event.preventDefault()
    selectMomentMention(target.dataset.momentMentionSuggestion || '')
  })
  momentContent?.addEventListener('input', (event) => {
    state.momentDraftText = event.currentTarget.value
    state.momentDraftDirty = true
    const cursor = event.currentTarget.selectionStart || event.currentTarget.value.length
    const context = momentMentionContext(event.currentTarget.value, cursor)
    state.momentMentionQuery = context?.query || ''
    state.momentMentionOpen = Boolean(context)
    state.momentMentionTokenStart = context?.start ?? -1
    renderMomentMentionMenu()
  })
  document.querySelector('[data-moment-visibility]')?.addEventListener('change', (event) => {
    state.momentVisibility = Number(event.currentTarget.value || 0)
    state.momentDraftDirty = true
    if (state.momentVisibility === 2) {
      state.modal = 'moment-visibility'
      render()
    }
  })
  document.querySelector('#desktop-moment-files')?.addEventListener('change', (event) => {
    const existing = new Map(state.momentFiles.map((file) => [`${file.name}:${file.size}:${file.lastModified}`, file]))
    for (const file of Array.from(event.currentTarget.files || [])) {
      existing.set(`${file.name}:${file.size}:${file.lastModified}`, file)
    }
    state.momentFiles = [...existing.values()]
    state.momentFileNames = state.momentFiles.map((file) => file.name)
    state.momentDraftDirty = true
    render()
  })
  document.querySelectorAll('[data-moment-file-remove]').forEach((element) => element.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    const index = Number(element.dataset.momentFileRemove)
    if (!Number.isInteger(index) || index < 0) return
    state.momentFiles = state.momentFiles.filter((_, fileIndex) => fileIndex !== index)
    state.momentFileNames = state.momentFiles.map((file) => file.name)
    state.momentDraftDirty = true
    render()
  }))
  document.querySelectorAll('[data-moment-visible-contact]').forEach((element) => element.addEventListener('change', () => {
    const id = String(element.dataset.momentVisibleContact || '')
    const selected = new Set(state.momentVisibleUserIds)
    if (element.checked) selected.add(id)
    else selected.delete(id)
    state.momentVisibleUserIds = selected
    state.momentDraftDirty = true
    render()
  }))
  document.querySelectorAll('[data-moment-mention-contact]').forEach((element) => element.addEventListener('change', () => {
    const id = String(element.dataset.momentMentionContact || '')
    const selected = new Set(state.momentMentionUserIds)
    if (element.checked) selected.add(id)
    else selected.delete(id)
    state.momentMentionUserIds = selected
    state.momentDraftDirty = true
    render()
  }))
  document.querySelectorAll('[data-moment-like]').forEach((element) => element.addEventListener('click', () => {
    void toggleMomentLike(element.dataset.momentLike)
  }))
  document.querySelectorAll('[data-moment-detail]').forEach((element) => element.addEventListener('click', () => {
    openMomentDetail(element.dataset.momentDetail)
  }))
  document.querySelectorAll('[data-contact-moment]').forEach((element) => element.addEventListener('click', (event) => {
    event.stopPropagation()
    openContactMomentDetail(element.dataset.contactMoment)
  }))
  document.querySelectorAll('[data-moment-delete]').forEach((element) => element.addEventListener('click', () => {
    void removeMoment(element.dataset.momentDelete)
  }))
  document.querySelectorAll('[data-moment-comment-toggle]').forEach((element) => element.addEventListener('click', () => {
    const id = String(element.dataset.momentCommentToggle || '')
    const opening = state.momentCommentOpenId !== id
    state.momentCommentOpenId = opening ? id : ''
    state.momentCommentText = ''
    state.momentReplyCommentId = ''
    state.momentReplyNickname = ''
    render()
    if (opening) {
      window.setTimeout(() => {
        document.querySelector('[data-moment-comment-form] [data-moment-comment-input]')?.focus()
      }, 0)
    }
  }))
  document.querySelectorAll('[data-moment-comment-reply]').forEach((element) => element.addEventListener('click', (event) => {
    event.stopPropagation()
    state.momentReplyCommentId = String(element.dataset.momentCommentReply || '')
    state.momentReplyNickname = String(element.dataset.momentCommentName || '')
    const momentId = String(element.dataset.momentCommentReplyMoment || '')
    if (momentId) state.momentCommentOpenId = momentId
    render()
    window.setTimeout(() => {
      document.querySelector('[data-moment-comment-form] [data-moment-comment-input]')?.focus()
    }, 0)
  }))
  document.querySelectorAll('[data-moment-comment-form]').forEach((element) => element.addEventListener('submit', (event) => {
    event.preventDefault()
    void submitMomentComment(element.dataset.momentId)
  }))
  document.querySelectorAll('[data-moment-comment-input]').forEach((element) => element.addEventListener('input', (event) => {
    state.momentCommentText = event.currentTarget.value
  }))
  document.querySelectorAll('[data-privacy-toggle]').forEach((element) => element.addEventListener('change', () => {
    void patchPrivacySetting(element.dataset.privacyToggle, element.checked)
  }))
  document.querySelector('[data-privacy-range]')?.addEventListener('change', (event) => {
    void patchPrivacySetting('momentsVisibleRange', event.currentTarget.value)
  })
  document.querySelectorAll('[data-privacy-list]').forEach((element) => element.addEventListener('click', () => {
    void openPrivacyListModal(element.dataset.privacyList)
  }))
  document.querySelectorAll('[data-privacy-contact]').forEach((element) => element.addEventListener('change', () => {
    void togglePrivacyListContact(element.dataset.privacyContact)
  }))
  document.querySelector('[data-notification-clear]')?.addEventListener('click', () => {
    requestClearDesktopNotifications()
  })
  document.querySelectorAll('[data-notification-delete-type]').forEach((element) => element.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    requestDeleteDesktopNotification(element.dataset.notificationDeleteType, element.dataset.notificationDeleteId)
  }))
  document.querySelectorAll('[data-friend-action]').forEach((element) => element.addEventListener('click', () => {
    void handleFriendRequest(element.dataset.requestId, element.dataset.friendAction)
  }))
  document.querySelectorAll('[data-group-action]').forEach((element) => element.addEventListener('click', () => {
    const action = element.dataset.groupAction
    if (action === 'leave' || action === 'dissolve') {
      const selected = conversations[state.selectedConversation]
      state.confirmDialog = { type: 'group-action', action, conversationId: String(selected?.id || '') }
      state.modal = 'confirm'
      render()
      return
    }
    void handleGroupNotification(element.dataset.requestId, action, element.dataset.conversationId)
  }))
  document.querySelectorAll('[data-group-info-edit]').forEach((element) => element.addEventListener('click', () => {
    const field = element.dataset.groupInfoEdit
    if (field === 'nickname') void editDesktopGroupNickname()
    else if (field === 'remark') void editDesktopGroupRemark()
    else if (field === 'search-mode') void editDesktopGroupSearchMode()
    else if (field) void editDesktopGroupField(field)
  }))
  document.querySelector('[data-group-info-copy-pulse]')?.addEventListener('click', () => {
    const detail = groupInfoDetail()
    void copyDesktopValue(detail?.pulseId || detail?.id, '\u7fa4 PulseID')
  })
  document.querySelector('[data-group-info-important]')?.addEventListener('click', () => {
    void openDesktopImportantSettings()
  })
  document.querySelector('[data-group-schedule-new]')?.addEventListener('click', () => {
    void openDesktopScheduledDialog()
  })
  document.querySelectorAll('[data-group-schedule-edit]').forEach((element) => element.addEventListener('click', () => {
    const row = groupInfoScheduledMessages().find((item) => String(item.id) === String(element.dataset.groupScheduleEdit || ''))
    if (row) void openDesktopScheduledDialog(row)
  }))
  document.querySelectorAll('[data-group-schedule-delete]').forEach((element) => element.addEventListener('click', () => {
    const row = groupInfoScheduledMessages().find((item) => String(item.id) === String(element.dataset.groupScheduleDelete || ''))
    if (row) void deleteDesktopScheduledMessage(row)
  }))
  document.querySelectorAll('[data-group-setting]').forEach((element) => element.addEventListener('change', () => {
    void toggleDesktopGroupSetting(element.dataset.groupSetting, Boolean(element.checked))
  }))
  document.querySelectorAll('[data-important-setting]').forEach((element) => element.addEventListener('change', () => {
    toggleDesktopImportantOption(element.dataset.importantSetting, Boolean(element.checked))
  }))
  document.querySelectorAll('[data-important-member]').forEach((element) => element.addEventListener('change', () => {
    toggleDesktopFollowedMember(element.dataset.importantMember)
  }))
  document.querySelector('[data-group-info-open-add]')?.addEventListener('click', (event) => {
    event.stopPropagation()
    state.groupInfoAddOpen = true
    render()
  })
  document.querySelector('[data-group-info-close-add]')?.addEventListener('click', (event) => {
    event.stopPropagation()
    state.groupInfoAddOpen = false
    state.groupInfoAddSelected = new Set()
    render()
  })
  document.querySelectorAll('[data-group-info-add-member]').forEach((element) => element.addEventListener('change', () => {
    toggleDesktopGroupAddMember(element.dataset.groupInfoAddMember)
  }))
  document.querySelector('[data-group-info-add-submit]')?.addEventListener('click', () => {
    void addDesktopGroupMembersFromInfo()
  })
  document.querySelectorAll('[data-group-member-action]').forEach((element) => element.addEventListener('click', () => {
    desktopGroupMemberAction(element.dataset.groupMemberAction, element.dataset.groupMemberId, element.dataset.groupMemberName)
  }))
  document.querySelectorAll('[data-moment-interaction]').forEach((element) => element.addEventListener('click', () => {
    void openMomentInteraction(element.dataset.momentInteraction, element.dataset.momentInteractionPost)
  }))
  document.querySelectorAll('.shared-tile').forEach((element) => element.addEventListener('click', () => {
    void openDesktopSharedContent(element.querySelector('.shared-file') ? 'file' : 'media')
  }))
  document.querySelectorAll('.context-card').forEach((card) => {
    if (!card.querySelector('.shared-grid')) return
    card.querySelector('.context-card-label')?.addEventListener('click', () => {
      void openDesktopSharedContent('media')
    })
  })
  document.querySelectorAll('[data-action]').forEach((element) => element.addEventListener('click', () => {
      const action = element.dataset.action
      const profileNavigationActions = new Set(['navigate-back', 'edit-profile', 'account-security', 'storage', 'help', 'notifications', 'new-friends', 'group-notifications', 'files', 'groups', 'publish', 'wallet'])
      if (profileNavigationActions.has(action) && desktopProfileDraftDirty()) {
        void confirmDesktopProfileLeave().then((ok) => {
          if (ok) element.click()
        })
        return
      }
      if (action !== 'toggle-profile-menu') state.profileMenuOpen = false
      if (action !== 'toggle-home-plus') state.showHomePlusMenu = false
      if (action === 'toggle-sidebar') {
        state.sidebarCollapsed = !state.sidebarCollapsed
        saveDesktopSidebarCollapsed(state.sidebarCollapsed)
        const sidebar = element.closest('.sidebar')
        if (sidebar) sidebar.classList.toggle('is-collapsed', state.sidebarCollapsed)
        const expanded = !state.sidebarCollapsed
        element.setAttribute('aria-expanded', expanded ? 'true' : 'false')
        element.setAttribute('aria-label', expanded ? '收起侧栏' : '展开侧栏')
        element.setAttribute('title', expanded ? '收起侧栏' : '展开侧栏')
        return
      }
      if (action === 'navigate-back') {
      navigateDesktopBack()
      return
    }
    if (action === 'login-qr' || action === 'refresh-qr-login') {
      void beginDesktopQrLogin()
      return
    }
    if (action === 'login-password') {
      if (!state.clientAccess.phoneLoginEnabled) {
        state.loginError = '电脑端手机号登录已关闭'
        render()
        return
      }
      stopDesktopQrLogin()
      state.loginMode = 'password'
      state.qrLoginError = ''
      state.loginError = ''
      render()
      return
    }
    if (action === 'forgot-password') {
      state.loginView = 'forgot'
      state.loginError = ''
      state.resetError = ''
      state.resetNotice = ''
      render()
      return
    }
    if (action === 'register') {
      if (!state.clientAccess.registerEnabled) {
        state.loginError = '电脑端注册已关闭'
        render()
        return
      }
      stopDesktopQrLogin()
      stopResetCountdown()
      state.loginMode = 'password'
      state.loginView = 'register'
      state.registerStep = 1
      state.registerError = ''
      state.registerNotice = ''
      state.registerBusy = false
      render()
      return
    }
    if (action === 'register-back-step') {
      if (state.registerStep > 1) state.registerStep -= 1
      state.registerError = ''
      state.registerNotice = ''
      render()
      return
    }
    if (action === 'back-to-login') {
      stopResetCountdown()
      stopRegisterCountdown()
      state.loginView = 'login'
      state.resetError = ''
      state.resetNotice = ''
      state.registerError = ''
      state.registerNotice = ''
      render()
      startDesktopQrLoginIfRequired()
      return
    }
    if (action === 'send-reset-code') {
      void sendResetCode()
      return
    }
    if (action === 'send-register-code') {
      void resendRegisterCode()
      return
    }
    if (action === 'new-message') {
      openNewMessageModal()
      return
    }
    if (action === 'new-group') {
      openNewMessageModal('group')
      return
    }
    if (action === 'add-group') {
      openDesktopAddGroupModal()
      return
    }
    if (action === 'files') {
      state.fileMenu = null
      state.page = 'files'
      state.fileSection = 'all'
      state.fileCategory = 'all'
      state.fileQuery = ''
      render()
      if (state.dataSource === 'remote') void loadDesktopFiles()
      return
    }
    if (action === 'global-refresh') {
      void refreshDesktopData()
      return
    }
    if (action === 'lock-screen') {
      lockDesktopApplication()
      return
    }
    if (action === 'lock-screen-logout') {
      performDesktopLogout()
      return
    }
    if (action === 'lock-password-settings') {
      openDesktopLockPasswordSettings()
      return
    }
    if (action === 'lock-password-disable') {
      requestDisableDesktopLockPassword()
      return
    }
    if (action === 'mark-all-read') {
      void markAllDesktopConversationsReadFlow()
      return
    }
    if (action === 'clear-conversation') {
      void openDesktopConversationClearDialog()
      return
    }
    if (action === 'files-settings') {
      showToast('文件自动下载设置已准备好')
      return
    }
    if (action === 'open-file') {
      const sourceFiles = state.fileItems
      const file = sourceFiles.find((item) => item.id === element.dataset.fileId)
      if (!file) return
      if (file.url) openDesktopFilePreview(file)
      else showToast(`已打开 ${file.name}`)
      return
    }
    if (action === 'moment-mention-picker') {
      state.modal = 'moment-mentions'
      render()
      return
    }
    if (action === 'wallet-reset') {
      resetWalletFilters()
      return
    }
    if (action === 'wallet-password') {
      state.walletPasswordDialog = true
      state.walletPasswordError = ''
      state.walletOldPassword = ''
      state.walletNewPassword = ''
      state.walletConfirmPassword = ''
      state.modal = 'wallet-password'
      render()
      return
    }
    if (action === 'notifications' || action === 'new-friends' || action === 'group-notifications') {
      void openNotificationsModal(action === 'new-friends' ? 'friends' : action === 'group-notifications' ? 'groups' : 'all')
      return
    }
    if (action === 'add-contact') {
      openSearchModal('', 'contact')
      return
    }
    if (action === 'toggle-contact-more') {
      state.contactMoreOpen = !state.contactMoreOpen
      render()
      return
    }
    if (action === 'toggle-contact-online-only') {
      state.contactOnlineOnly = !state.contactOnlineOnly
      state.contactMoreOpen = false
      render()
      return
    }
    if (action === 'groups') {
      state.page = 'groups'
      state.groupQuery = ''
      state.messageMenu = null
      render()
      return
    }
    if (action === 'publish') {
      state.page = 'moments'
      render()
      void loadMoments()
      return
    }
    if (action === 'start-edit-profile') {
      state.page = 'settings'
      state.settingsSection = 'profile'
      state.profileEditing = true
      state.profileDraft = { nickname: state.profile.nickname || '', signature: state.profile.signature || '' }
      render()
      return
    }
    if (action === 'edit-profile') {
      if (state.profileAvatarFile) discardDesktopAvatarDraft()
      state.page = 'settings'
      state.settingsSection = 'profile'
      state.profileEditing = false
      state.profileDraft = null
      render()
      return
    }
    if (action === 'change-avatar') {
      openDesktopAvatarPicker()
      return
    }
    if (action === 'toggle-profile-menu') {
      state.profileMenuOpen = !state.profileMenuOpen
      render()
      return
    }
    if (action === 'toggle-home-plus') {
      state.showHomePlusMenu = !state.showHomePlusMenu
      render()
      return
    }
    if (action === 'chat-settings') {
      void openDesktopChatSettings()
      return
    }
    if (action === 'call-audio' || action === 'call-video') {
      void startDesktopCall(action === 'call-video' ? 'video' : 'audio')
      return
    }
    if (action === 'group-info') {
      void openDesktopGroupInfo({ focusMembers: element.dataset.groupInfoFocus === 'members' })
      return
    }
    if (action === 'change-phone') {
      void openDesktopChangePhoneDialog()
      return
    }
    if (action === 'change-password') {
      void openDesktopChangePasswordDialog()
      return
    }
    if (action === 'delete-account') {
      void openDesktopAccountDeletion()
      return
    }
    if (action === 'account-security' || action === 'storage' || action === 'help') {
      if (state.profileAvatarFile) discardDesktopAvatarDraft()
      state.page = 'settings'
      state.settingsSection = action
      state.profileEditing = false
      state.messageMenu = null
      render()
      if (action === 'account-security') void loadDesktopAccountSecurity(true)
      else if (action === 'storage') void loadDesktopStorage()
      else {
        state.helpQuery = ''
        void loadDesktopHelp()
      }
      return
    }
    if (['chat-settings', 'device-options'].includes(action)) {
      const settingsMessages = {
        'chat-settings': '\u804a\u5929\u8bbe\u7f6e\u5373\u5c06\u5f00\u653e',
        'device-options': '\u8bbe\u5907\u7ba1\u7406\u529f\u80fd\u5373\u5c06\u5f00\u653e',
      }
      showToast(settingsMessages[action])
      return
    }
    if (action === 'open-contact') {
      void openContactModal(element.dataset.userId)
      return
    }
    if (action === 'organize') {
      state.favoriteOrganizing = !state.favoriteOrganizing
      state.favoriteSelection = new Set()
      showToast(state.favoriteOrganizing ? '已进入收藏整理模式' : '已完成收藏整理')
      return
    }
    const messages = {
      'new-message': '新建消息面板将在下一版接入',
      'add-contact': '添加联系人流程已预留',
      'new-friends': '正在打开新的朋友',
      groups: '正在打开我的群组',
      publish: '发布动态编辑器已预留',
      'explore-groups': '正在打开兴趣圈子',
      'edit-profile': '资料编辑模式已开启',
      'change-phone': '修改手机号需要短信验证，请联系管理员处理',
      'change-password': '修改密码请使用登录页的找回密码流程',
      files: '文件中心已预留',
      download: 'Pulse for Windows 下载即将开始',
      notifications: '你有 2 条新通知',
      send: '消息已发送',
      logout: '退出账户前请先完成确认',
      more: '更多操作已打开',
      'open-contact': '联系人详情页已预留',
    }
    if (action === 'more') {
      toggleContactProfile()
      return
    }
    if (action === 'send') {
      void sendCurrentMessage()
      return
    }
    if (action === 'cancel-dropped-file') {
      clearPendingDesktopFile()
      render()
      return
    }
    if (action === 'send-dropped-file') {
      void sendCurrentMessage()
      return
    }
    if (action === 'search-chat') {
      void searchCurrentConversation()
      return
    }
    if (action === 'clear-message-search') {
      state.messageSearchQuery = ''
      void loadSelectedMessages()
      return
    }
    if (action === 'clear-reply') {
      state.replyTarget = null
      render()
      return
    }
    if (action === 'mention') {
      openDesktopMentionPicker()
      return
    }
    if (action === 'close-mention-picker') {
      state.showMentionPicker = false
      state.mentionDraft = null
      render()
      focusDesktopComposer(String(state.composerText || '').length)
      return
    }
    if (action === 'jump-mention') {
      jumpToNextDesktopMention()
      return
    }
    if (action === 'toggle-plus') {
      state.showPlusMenu = !state.showPlusMenu
      state.showEmojiPanel = false
      render()
      document.querySelector('[data-message-composer]')?.focus()
      return
    }
    if (action === 'toggle-emoji') {
      state.showEmojiPanel = !state.showEmojiPanel
      state.showPlusMenu = false
      render()
      document.querySelector('[data-message-composer]')?.focus()
      return
    }
    if (action === 'voice-record') {
      void toggleDesktopVoiceRecord()
      return
    }
    if (action === 'send-photo' || action === 'send-video' || action === 'send-file') {
      const input = document.querySelector('#desktop-file-input')
      if (input) {
        input.accept = action === 'send-photo' ? 'image/*' : action === 'send-video' ? 'video/*' : '*/*'
        input.value = ''
        input.click()
      }
      state.showPlusMenu = false
      return
    }
    if (action === 'moment-location-picker') {
      openDesktopLocationPicker('moment')
      return
    }
    if (action === 'send-redpacket') {
      if (!isDesktopWalletEnabled()) {
        showToast('电脑端钱包功能已关闭')
        return
      }
      state.showPlusMenu = false
      void sendDesktopRedPacketFlow()
      return
    }
    if (action === 'send-transfer') {
      if (!isDesktopWalletEnabled()) {
        showToast('电脑端钱包功能已关闭')
        return
      }
      state.showPlusMenu = false
      void sendDesktopTransferFlow()
      return
    }
    if (action === 'jump-latest') {
      const stream = document.querySelector('.chat-stream')
      const conversationId = element.dataset.jumpConversation || stream?.dataset.conversationId || ''
      if (stream && conversationId) {
        const targetTop = Math.max(0, stream.scrollHeight - stream.clientHeight)
        const conversation = conversations.find((item) => String(item.id || '') === String(conversationId))
        const hasUnread = Number(conversation?.unread || 0) > 0
        state.chatScrollTopByConversation[conversationId] = targetTop
        state.chatAtLatestByConversation[conversationId] = true
        if (hasUnread) {
          // 清除未读会触发重绘；交给 render() 直接定位到底部，避免重绘恢复旧 scrollTop。
          state.scrollChatToBottom = true
          markDesktopConversationLatestRead(conversationId)
          render()
        } else {
          stream.scrollTo({ top: targetTop, behavior: 'smooth' })
        }
        element.classList.remove('is-visible')
      }
      return
    }
    if (action === 'insert-emoji') {
      const textarea = document.querySelector('[data-message-composer]')
      if (textarea) {
        textarea.value += '🙂'
        textarea.focus()
      }
      return
    }
    if (action === 'attach-file') {
      showToast('文件发送功能即将接入')
      return
    }
    if (action === 'logout') {
      requestLogoutDesktop()
      return
    }
    if (action === 'switch-account') {
      requestSwitchDesktopAccount()
      return
    }
    showToast(messages[action] || '操作已完成')
  }))
}

function renderChatPanelBroken(selected) {
  const group = selected.type === 'group' || selected.name.includes('璁捐缁?')
  const messages = currentMessages(selected)
  const rows = messages.length
    ? messages.map((message) => renderDesktopMessageRow(selected, message)).join('')
    : '<div class="chat-empty">暂无消息</div>'
  return `<section class="chat-panel panel-surface">
    <div class="chat-header"><div class="chat-title"><span class="avatar-wrap">${avatar(selected)}${selected.type === 'personal' && !selected.fileTransferAssistant ? `<i class="online-dot${selected.online ? '' : ' offline'}"></i>` : ''}</span><div><h2>${escapeHtml(selected.name)}</h2><p>${selected.type === 'personal' && !selected.fileTransferAssistant ? `<span class="${selected.online ? 'status-green' : 'status-gray'}">${selected.online ? '在线' : '离线'}</span> · ` : ''}${group ? '群聊' : 'Pulse 联系人'}</p></div></div><div class="chat-actions"><button class="subtle-icon-btn" data-action="search-chat" aria-label="Search chat">${icon('search')}</button><button class="subtle-icon-btn" data-action="more" aria-label="More">${icon('more')}</button></div></div>
    <div class="chat-security">${icon('lock')} 端到端加密 · 仅你和 ${escapeHtml(selected.name)} 可以阅读</div>
    <div class="chat-stream" data-conversation-id="${escapeHtml(selected.id)}"><div class="day-divider"><span>${state.loadingMessages ? '正在同步' : '今天'}</span></div>${rows}</div>
    <button class="jump-latest-btn" data-action="jump-latest" data-jump-latest data-jump-conversation="${escapeHtml(conversationScrollKey(selected))}" aria-label="Jump to latest" title="Jump to latest">${icon('arrow')}</button>
    ${renderMessageMenu(selected)}
    <div class="composer ${state.recordingVoice ? 'is-recording' : ''}">
      ${state.showPlusMenu ? renderDesktopPlusMenu() : ''}
      <div class="composer-tools"><button type="button" data-action="toggle-plus" aria-label="More message types">${icon('plus')}</button><button type="button" data-action="toggle-emoji" aria-label="Emoji">${icon('smile')}</button><button type="button" class="composer-voice-button ${state.recordingVoice ? 'is-recording' : ''}" data-action="voice-record" aria-label="Voice message">${icon('mic')}<span>${state.recordingVoice ? 'Stop recording' : 'Voice'}</span></button><span class="composer-hint">Enter sends · Shift + Enter new line${state.uploadingFile ? ' · Uploading…' : ''}</span></div>
      ${state.showEmojiPanel ? `<div class="desktop-emoji-panel">${['😀','😂','😍','👍','👏','🎉','❤️','🔥','😄','😢','🤔','🙏','😎','✨','🌹','💯'].map((emoji) => `<button type="button" data-emoji="${emoji}">${emoji}</button>`).join('')}</div>` : ''}
      <textarea data-message-composer placeholder="Write a message…" ${state.sendingMessage || state.uploadingFile ? 'disabled' : ''}></textarea>
      <div class="composer-bottom"><span>${icon('lock')} 私密对话</span><button class="send-button" data-action="send" ${state.sendingMessage ? 'disabled' : ''}>${icon('send')}</button></div><input id="desktop-file-input" class="desktop-hidden-file" type="file" accept="*/*" />
    </div>
  </section>`
}

function renderChatPanelLegacyCurrent(selected) {
  const group = selected.type === 'group'
  const messages = currentMessages(selected)
  const rows = messages.length
    ? messages.map((message) => renderDesktopMessageRow(selected, message)).join('')
    : '<div class="chat-empty">暂无消息</div>'
  return `<section class="chat-panel panel-surface">
     <div class="chat-header"><div class="chat-title"><span class="avatar-wrap">${avatar(selected)}${selected.type === 'personal' && !selected.fileTransferAssistant ? `<i class="online-dot${selected.online ? '' : ' offline'}"></i>` : ''}</span><div><h2>${escapeHtml(selected.name)}</h2><p>${selected.type === 'personal' && !selected.fileTransferAssistant ? `<span class="${selected.online ? 'status-green' : 'status-gray'}">${selected.online ? '在线' : '离线'}</span> · ` : ''}${group ? '群聊' : 'Pulse 联系人'}</p></div></div><div class="chat-actions"><button class="subtle-icon-btn" data-action="search-chat" aria-label="搜索聊天" title="搜索聊天">${icon('search')}</button><button class="subtle-icon-btn" data-action="more" aria-label="更多" title="更多">${icon('more')}</button></div></div>
     <div class="chat-security">${icon('lock')} 端到端加密</div>
     <div class="chat-stream" data-conversation-id="${escapeHtml(selected.id)}"><div class="day-divider"><span>${state.loadingMessages ? '正在同步' : '今天'}</span></div>${rows}</div>
     <button class="jump-latest-btn" data-action="jump-latest" data-jump-latest data-jump-conversation="${escapeHtml(conversationScrollKey(selected))}" aria-label="回到最新消息" title="回到最新消息">${icon('arrow')}</button>
    ${renderMessageMenu(selected)}
    <div class="composer ${state.recordingVoice ? 'is-recording' : ''}">
       <div class="composer-tools">${renderDesktopComposerActions()}<button type="button" data-action="toggle-emoji" aria-label="表情" title="表情">${icon('smile')}</button><button type="button" class="composer-voice-button ${state.recordingVoice ? 'is-recording' : ''}" data-action="voice-record" aria-label="语音消息" title="${state.recordingVoice ? '停止录音' : '语音消息'}">${icon('mic')}</button><span class="composer-hint">按 Enter 发送 · Shift + Enter 换行${state.uploadingFile ? ' · 正在上传…' : ''}</span></div>
      ${state.showEmojiPanel ? `<div class="desktop-emoji-panel">${['😀','😂','😍','👍','👏','🎉','❤️','🔥','😄','😢','🤔','🙏','😎','✨','🌹','💯'].map((emoji) => `<button type="button" data-emoji="${emoji}">${emoji}</button>`).join('')}</div>` : ''}
       <textarea data-message-composer placeholder="写下你的消息…" ${state.sendingMessage || state.uploadingFile ? 'disabled' : ''}>${escapeHtml(state.composerText || '')}</textarea>
       <div class="composer-bottom"><span>${icon('lock')} 私密对话</span><button class="send-button" data-action="send" aria-label="发送消息" title="发送消息" ${state.sendingMessage ? 'disabled' : ''}>${icon('send')}</button></div><input id="desktop-file-input" class="desktop-hidden-file" type="file" accept="*/*" />
    </div>
  </section>`
}

function isDesktopSystemMessage(message) {
  return !message?.recalled && Number(message?.msgType || 0) === 9
}

function desktopSystemMessageText(content, conversation = null, message = null) {
  const raw = String(content || '').trim()
  if (!raw) return '\u6d88\u606f\u63d0\u793a'
  if (!raw.startsWith('{') && !raw.startsWith('[')) return raw

  let payload
  try {
    payload = JSON.parse(raw)
  } catch {
    return '系统消息'
  }
  if (Array.isArray(payload)) return '聊天记录'
  const currentUserId = String(state.profile.userId || '')
  const actorIsMe = payload?.actorId != null && String(payload.actorId) === currentUserId
  const ownerIsMe = payload?.ownerId != null && String(payload.ownerId) === currentUserId
  const targetIsMe = payload?.targetId != null && String(payload.targetId) === currentUserId
  const cachedGroup = conversation?.id
    ? state.groupDetailsByConversation[String(conversation.id)]
    : null
  const cachedMember = cachedGroup?.members?.find((member) => String(member.userId) === String(payload?.actorId ?? message?.fromUserId ?? ''))
  const actorRole = String(payload?.actorRole || (cachedGroup?.ownerId != null && String(cachedGroup.ownerId) === String(payload?.actorId ?? message?.fromUserId) ? 'owner' : cachedMember?.role || ''))
  const actorTitle = String(payload?.actorTitle || (actorRole === 'owner' ? '\u7fa4\u4e3b' : actorRole === 'admin' ? '\u7ba1\u7406\u5458' : actorRole === 'member' ? '\u7fa4\u6210\u5458' : ''))
  const actorName = String(payload?.actorName || message?.fromNickname || (actorIsMe ? state.profile.nickname : '\u7fa4\u6210\u5458'))
  const groupActor = conversation?.type === 'group' && actorTitle
    ? (actorIsMe ? `\u6211（${actorTitle}\u00b7${actorName}）` : `${actorTitle}\u00b7${actorName}`)
    : ''
  const actor = groupActor || (actorIsMe ? '\u4f60' : actorName)
  const owner = ownerIsMe ? '\u4f60' : String(payload?.ownerName || '\u6536\u6b3e\u4eba')
  const target = targetIsMe ? '\u4f60' : String(payload?.targetName || '\u65b0\u6210\u5458')
  const amount = Number(payload?.amount || payload?.refundAmount || 0)
  const amountText = Number.isFinite(amount) && amount > 0 ? `\uffe5${amount.toFixed(2)}` : ''

  if (payload?.kind === 'red_packet_received') {
    if (actorIsMe && ownerIsMe) return '\u4f60\u9886\u53d6\u4e86\u81ea\u5df1\u53d1\u7684\u7ea2\u5305'
    if (ownerIsMe) return `${actor}\u9886\u53d6\u4e86\u4f60\u7684\u7ea2\u5305`
    if (actorIsMe) return `\u4f60\u9886\u53d6\u4e86${owner}\u7684\u7ea2\u5305`
    return `${actor}\u9886\u53d6\u4e86${owner}\u7684\u7ea2\u5305`
  }
  if (payload?.kind === 'transfer_received') {
    if (actorIsMe) return '\u4f60\u5df2\u6536\u6b3e'
    return `${actor}\u5df2\u6536\u5230${owner}\u7684\u8f6c\u8d26`
  }
  if (payload?.kind === 'red_packet_expired') {
    return `\u7ea2\u5305\u5df2\u8fc7\u671f\uff0c\u672a\u9886\u53d6${amountText ? `\uff08${amountText}\uff09` : ''}`
  }
  if (payload?.kind === 'transfer_expired') {
    return `\u8f6c\u8d26\u5df2\u8fc7\u671f${amountText ? `\uff0c\u91d1\u989d${amountText}\u5df2\u9000\u56de` : ''}`
  }
  if (payload?.kind === 'auto_delete_setting') {
    const enabled = payload.enabled !== false
    const seconds = Number(payload.ttlSeconds || 86400)
    const duration = seconds >= 86400 ? `${Math.round(seconds / 86400)}天` : `${Math.max(1, Math.round(seconds / 3600))}小时`
    const settingActor = actorIsMe ? '我' : '对方'
    return enabled
      ? `${settingActor}开启了自动删除记录，双方发送的新消息，都会在${duration}后从双方的聊天记录中删除`
      : `${settingActor}关闭了自动删除记录`
  }
  if (payload?.kind === 'burn_setting') {
    const enabled = payload.enabled !== false
    const settingActor = actorIsMe ? '我' : String(conversation?.name || payload?.actorName || '对方')
    const seconds = Math.max(0, Number(payload?.burnSeconds ?? payload?.ttlSeconds ?? 0) || 0)
    const period = seconds <= 0 ? '立即' : `${Math.max(1, Math.round(seconds))}秒后`
    return enabled
      ? `${settingActor}开启了阅后即焚，消息将在阅读后${period}销毁`
      : `${settingActor}关闭了阅后即焚`
  }
  if (payload?.kind === 'group_action') {
    return `${actor}${String(payload?.text || '')}`
  }
  if (payload?.kind === 'group_member_join') {
    if (payload.actorId != null) return `${actor}\u9080\u8bf7${target}\u52a0\u5165\u7fa4\u804a`
    if (payload.source === 'qrcode') return `${target}\u901a\u8fc7\u626b\u63cf\u4e8c\u7ef4\u7801\u52a0\u5165\u7fa4\u804a`
    if (payload.source === 'card') return `${target}\u901a\u8fc7\u7fa4\u540d\u7247\u52a0\u5165\u7fa4\u804a`
    return `${target}\u52a0\u5165\u4e86\u7fa4\u804a`
  }
  if (payload?.kind === 'group_member_kick') return `${actor}\u5c06${target}\u79fb\u51fa\u4e86\u7fa4\u804a`
  if (payload?.kind === 'voice_call' || payload?.kind === 'video_call') {
    const callType = payload.kind === 'video_call' || String(payload.mediaType || '').toLowerCase() === 'video' ? '\u89c6\u9891' : '\u8bed\u97f3'
    return `[${callType}\u901a\u8bdd] ${payload.text || '\u901a\u8bdd\u5df2\u7ed3\u675f'}`
  }
  if (payload?.text || payload?.message) return String(payload.text || payload.message)
  return '系统消息'
}

function renderDesktopMessageRow(selected, message) {
  if (isDesktopSystemMessage(message)) {
    const text = desktopSystemMessageText(message.content, selected, message)
    return `<div class="message-system-row"><div class="message-system-tip">${escapeHtml(text)}${message.time ? `<time>${escapeHtml(message.time)}</time>` : ''}</div></div>`
  }
  const expiryLabel = desktopExpiryLabel(message)
  const messageId = String(message.id)
  const selectedForMulti = state.messageSelection.has(messageId)
  const selectionToggle = state.messageMultiMode
    ? `<button class="message-select-toggle ${selectedForMulti ? 'is-selected' : ''}" type="button" data-message-select-toggle="${escapeHtml(messageId)}" aria-label="${selectedForMulti ? '取消选择' : '选择消息'}">${selectedForMulti ? '✓' : '○'}</button>`
    : ''
  const replyTarget = message.replyToMsgId
    ? currentMessages(selected).find((item) => String(item.id) === String(message.replyToMsgId))
    : null
  if (replyTarget && !Number(message.replyToMsgType || 0)) {
    message = { ...message, replyToMsgType: Number(replyTarget.msgType || 0) }
  }
  const replyMedia = message.replyToMsgId ? desktopReplyMedia(message, replyTarget) : null
  const replyPreview = message.replyToMsgId
    ? `<button type="button" class="message-reply-preview" data-message-reply data-reply-to-message-id="${escapeHtml(message.replyToMsgId)}" title="点击定位原消息"><strong>${escapeHtml(message.replyToNickname || '引用消息')}</strong><span class="message-reply-content">${replyMedia ? (replyMedia.isVideo ? `<span class="message-reply-media-icon">${icon('video')}</span>` : `<img src="${desktopMediaRenderSource(replyMedia.url)}" data-protected-media-src="${escapeHtml(replyMedia.url)}" alt="" decoding="async" loading="eager" />`) : ''}${escapeHtml(desktopReplyPreview(message, replyTarget))}</span></button>`
    : ''
  const messageAvatar = message.mine ? selected : {
    name: message.fromNickname || selected.name,
    initials: (message.fromNickname || selected.name || '?').slice(0, 1),
    tone: selected.tone || 'blue',
    avatarUrl: message.fromAvatarUrl || selected.avatarUrl || '',
  }
    return `<div class="message-row ${message.mine ? 'message-out' : 'message-in'} ${state.messageMultiMode ? 'is-message-selectable ' : ''}${selectedForMulti ? 'is-message-selected' : ''}" data-message-menu data-message-multi-selectable data-message-id="${escapeHtml(messageId)}">${selectionToggle}${message.mine ? '' : `<div class="message-avatar">${avatar(messageAvatar, 'avatar-tiny')}</div>`}<div>${message.fromNickname && !message.mine ? `<span class="message-sender">${escapeHtml(message.fromNickname)}</span>` : ''}${replyPreview}<div class="message-bubble ${message.recalled ? 'message-recalled' : ''}">${renderDesktopMessageContent(message)}</div>${expiryLabel ? `<small class="message-expiry-status" data-expiry-label data-conversation-id="${escapeHtml(String(selected?.id || ''))}" data-message-id="${escapeHtml(messageId)}">${escapeHtml(expiryLabel)}</small>` : ''}<time>${escapeHtml(message.time || '')}${message.mine ? ` ${renderMessageReadStatus(selected, message)}` : ''}</time></div></div>`
}

function renderMessageMultiToolbar(selected) {
  if (!state.messageMultiMode) return ''
  const count = state.messageSelection.size
  return `<div class="message-multi-toolbar"><span>已选择 ${count} 条消息</span><div><button type="button" data-message-multi-action="forward" ${count ? '' : 'disabled'}>${icon('share')}转发</button><button type="button" data-message-multi-action="delete-self" ${count ? '' : 'disabled'}>${icon('close')}单向删除</button>${selected.type === 'group' ? '' : `<button type="button" data-message-multi-action="delete-both" ${count ? '' : 'disabled'}>${icon('close')}双向删除</button>`}<button type="button" data-message-multi-action="cancel">取消</button></div></div>`
}

function renderDesktopSafetyNotice(selected) {
  if (!selected || selected.type === 'group') return ''
  const settings = desktopConversationSettings(selected)
  if (!settings.burnEnabled && !settings.autoDeleteEnabled && !settings.peerAutoDeleteEnabled) return ''
  const lines = []
  if (settings.burnEnabled) lines.push(`你已开启阅后即焚：消息阅读后${settings.burnSeconds <= 0 ? '立即销毁' : `${settings.burnSeconds}秒后销毁`}`)
  if (settings.autoDeleteEnabled || settings.peerAutoDeleteEnabled) {
    const autoDeleteSeconds = [
      settings.autoDeleteEnabled ? settings.autoDeleteSeconds : 0,
      settings.peerAutoDeleteEnabled ? settings.peerAutoDeleteSeconds : 0,
    ].filter((value) => value > 0)
    const seconds = Math.min(...autoDeleteSeconds)
    lines.push(`双方发送的新消息，都会在${desktopDurationLabel(seconds)}后从双方的聊天记录中删除`)
  }
  return `<div class="desktop-safety-notice"><span class="desktop-safety-icon">${icon('shield')}</span><span><strong>${lines.join('；')}</strong><small>从发送或阅读开始计时；同时开启时，以更早到期的时间为准。</small></span></div>`
}

function renderDesktopMentionPicker(selected) {
  if (!state.showMentionPicker || selected?.type !== 'group') return ''
  const detail = currentDesktopGroupDetail(selected)
  const members = desktopMentionCandidates(selected)
  const loading = !detail && state.groupDetailLoadingConversationId === String(selected.id)
  return `<div class="desktop-mention-picker" role="dialog" aria-label="选择提醒的人">
    <div class="desktop-mention-picker-head"><div><strong>提醒成员</strong><small>选择后会插入 @ 名称</small></div><button type="button" data-action="close-mention-picker" aria-label="关闭">${icon('close')}</button></div>
    ${loading ? '<div class="desktop-mention-empty">正在加载群成员…</div>' : `${desktopCanMentionAll(selected) ? '<button type="button" class="desktop-mention-option at-all" data-mention-all><span class="desktop-mention-avatar">全</span><span><strong>@全体成员</strong><small>群主或管理员可用</small></span></button>' : ''}${members.map((member) => {
      const memberAvatar = avatar({ name: member.nickname, initials: member.nickname.slice(0, 1), tone: 'blue', avatarUrl: member.avatarUrl }, 'avatar-small')
      const role = member.owner ? '群主' : member.admin ? '管理员' : ''
      return `<button type="button" class="desktop-mention-option" data-mention-member="${escapeHtml(member.userId)}">${memberAvatar}<span><strong>@${escapeHtml(member.nickname)}</strong>${role ? `<small>${role}</small>` : ''}</span></button>`
    }).join('') || '<div class="desktop-mention-empty">暂无其他群成员</div>'}`}
  </div>`
}

function desktopCallDurationText(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function renderDesktopCallOverlay(call) {
  if (!call || call.uiState === 'idle') return ''
  const group = call.mode === 'group'
  const incoming = call.uiState === 'incoming'
  const title = group ? (call.groupTitle || '群通话') : (call.peer?.nickname || '通话')
  const mediaLabel = call.mediaType === 'video' ? '视频通话' : '语音通话'
  const remoteTiles = group
    ? call.participants.filter((member) => member.state !== 'declined').map((member) => `<div class="desktop-call-tile"><video data-call-participant="${escapeHtml(member.userId)}" autoplay playsinline></video><div class="desktop-call-tile-label">${escapeHtml(member.nickname)}</div></div>`).join('')
    : '<div class="desktop-call-remote"><video data-call-remote autoplay playsinline></video><div class="desktop-call-remote-placeholder">等待对方接通…</div></div>'
  if (incoming) {
    return `<div class="desktop-call-backdrop"><section class="desktop-call-dialog desktop-call-incoming" role="dialog" aria-modal="true" aria-label="${escapeHtml(mediaLabel)}">
      <div class="desktop-call-avatar">${avatar(group ? (call.inviter || { name: title }) : (call.peer || { name: title }), 'avatar-large')}</div>
      <span class="desktop-call-eyebrow">${group ? '群通话邀请' : '来电'}</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(mediaLabel)}邀请</p>
      <div class="desktop-call-incoming-actions"><button type="button" class="desktop-call-reject" data-call-action="reject">拒绝</button><button type="button" class="desktop-call-accept" data-call-action="accept">接听</button></div>
    </section></div>`
  }
  return `<div class="desktop-call-backdrop"><section class="desktop-call-dialog desktop-call-active ${call.mediaType === 'video' ? 'is-video' : 'is-audio'}" role="dialog" aria-modal="true" aria-label="${escapeHtml(mediaLabel)}">
    <header class="desktop-call-header"><div><span class="desktop-call-eyebrow">${group ? '群通话' : mediaLabel}</span><h2>${escapeHtml(title)}</h2><p>${call.uiState === 'connected' ? desktopCallDurationText(call.elapsedSec) : call.uiState === 'outgoing' ? '正在呼叫…' : '正在连接…'}</p></div><span class="desktop-call-status-dot"></span></header>
    <div class="desktop-call-stage ${group ? 'is-group' : ''}">${group ? remoteTiles || '<div class="desktop-call-empty">等待成员加入…</div>' : remoteTiles}<video class="desktop-call-local" data-call-local autoplay muted playsinline></video></div>
    <footer class="desktop-call-controls"><button type="button" data-call-action="mute" class="${call.muted ? 'is-active' : ''}" title="${call.muted ? '取消静音' : '静音'}">${icon('mic')}<span>${call.muted ? '取消静音' : '静音'}</span></button>${call.mediaType === 'video' ? `<button type="button" data-call-action="camera" class="${call.cameraOn ? '' : 'is-active'}" title="${call.cameraOn ? '关闭摄像头' : '打开摄像头'}">${icon('video')}<span>${call.cameraOn ? '摄像头' : '打开摄像头'}</span></button>` : ''}<button type="button" data-call-action="hangup" class="is-danger" title="挂断">${icon('phone')}<span>挂断</span></button></footer>
  </section></div>`
}

function desktopCallOverlayKey(call) {
  const participants = Array.isArray(call?.participants)
    ? call.participants.map((member) => `${member.userId}:${member.state}:${member.nickname || ''}`).join('|')
    : ''
  return [
    call?.callId || '',
    call?.mode || '',
    call?.uiState || '',
    call?.mediaType || '',
    call?.peer?.userId || '',
    call?.inviter?.userId || '',
    call?.groupTitle || '',
    participants,
  ].join('::')
}

function desktopCallStatusText(call) {
  if (call.uiState === 'connected') return desktopCallDurationText(call.elapsedSec)
  return call.uiState === 'outgoing' ? '正在呼叫…' : '正在连接…'
}

function updateDesktopCallOverlayControls(call) {
  const root = desktopRenderRoot('callRoot')
  if (!(root instanceof HTMLElement)) return

  const status = root.querySelector('.desktop-call-header p')
  if (status) status.textContent = desktopCallStatusText(call)

  const mute = root.querySelector('[data-call-action="mute"]')
  if (mute instanceof HTMLElement) {
    mute.classList.toggle('is-active', Boolean(call.muted))
    mute.setAttribute('title', call.muted ? '取消静音' : '静音')
    const label = mute.querySelector('span')
    if (label) label.textContent = call.muted ? '取消静音' : '静音'
  }

  const camera = root.querySelector('[data-call-action="camera"]')
  if (camera instanceof HTMLElement) {
    camera.classList.toggle('is-active', !call.cameraOn)
    camera.setAttribute('title', call.cameraOn ? '关闭摄像头' : '打开摄像头')
    const label = camera.querySelector('span')
    if (label) label.textContent = call.cameraOn ? '摄像头' : '打开摄像头'
  }
}

function syncDesktopCallOverlay() {
  const root = desktopRenderRoot('callRoot')
  if (!(root instanceof HTMLElement)) return
  const call = desktopCall.current

  if (!call || call.uiState === 'idle') {
    if (root.childElementCount) root.replaceChildren()
    root.removeAttribute('data-call-key')
    desktopCallOverlaySignature = ''
    return
  }

  const key = desktopCallOverlayKey(call)
  if (!root.firstElementChild || desktopCallOverlaySignature !== key) {
    root.innerHTML = renderDesktopCallOverlay(call)
    root.dataset.callKey = key
    desktopCallOverlaySignature = key
  }
  updateDesktopCallOverlayControls(call)
  bindDesktopCallMedia()
}

function bindDesktopCallActions() {
  const root = desktopLegacyRoot()
  if (!(root instanceof HTMLElement)) return
  if (desktopCallActionBound && desktopCallActionRoot === root) return
  if (desktopCallActionRoot instanceof HTMLElement && desktopCallActionHandler) {
    desktopCallActionRoot.removeEventListener('click', desktopCallActionHandler)
  }
  desktopCallActionHandler = (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-call-action]') : null
    if (!target || !root.contains(target)) return
    event.preventDefault()
    event.stopPropagation()
    const action = target.getAttribute('data-call-action')
    if (action === 'accept') desktopCall.accept()
    else if (action === 'reject') desktopCall.reject()
    else if (action === 'mute') desktopCall.toggleMute()
    else if (action === 'camera') desktopCall.toggleCamera()
    else if (action === 'hangup') desktopCall.hangup()
  }
  root.addEventListener('click', desktopCallActionHandler)
  desktopCallActionRoot = root
  desktopCallActionBound = true
}

function attachDesktopCallStream(video, stream) {
  if (!(video instanceof HTMLVideoElement)) return
  if (video.srcObject !== stream) {
    video.srcObject = stream
    if (stream) void video.play().catch(() => {})
    return
  }
  // 状态更新（例如通话计时）不应重复设置 srcObject；只有元素还没开始播放时才补一次播放。
  if (stream && video.paused && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    void video.play().catch(() => {})
  }
}

function bindDesktopCallMedia() {
  const call = desktopCall.current
  attachDesktopCallStream(document.querySelector('[data-call-local]'), call.localStream)
  attachDesktopCallStream(document.querySelector('[data-call-remote]'), call.remoteStream)
  call.participants.forEach((participant) => {
    const element = document.querySelector(`[data-call-participant="${CSS.escape(String(participant.userId))}"]`)
    attachDesktopCallStream(element, participant.stream || null)
  })
}

async function startDesktopCall(mediaType) {
  const selected = conversations[state.selectedConversation]
  if (!selected?.id) return
  if (selected.fileTransferAssistant) {
    showToast('文件传输助手不支持通话')
    return
  }
  if (selected.type !== 'group') {
    if (!selected.peerUserId) return showToast('当前会话无法发起通话')
    await desktopCall.startPrivate({ userId: String(selected.peerUserId), nickname: selected.name, avatarUrl: selected.avatarUrl || '', conversationId: String(selected.id) }, mediaType)
    return
  }
  const detail = currentDesktopGroupDetail(selected) || await loadDesktopGroupDetail(selected)
  const members = (detail?.members || []).map((member) => ({ userId: String(member.userId), nickname: member.nickname, avatarUrl: member.avatarUrl || '' }))
  await desktopCall.startGroup({ conversationId: String(selected.id), groupTitle: detail?.title || selected.name, mediaType, members })
}

function renderChatPanel(selected) {
  const group = selected.type === 'group'
  const groupMuteReason = desktopGroupMuteReason(selected)
  const personalChatBlockReason = desktopPersonalChatBlockReason(selected)
  const chatBlockReason = personalChatBlockReason || groupMuteReason
  const headerTag = selected.fileTransferAssistant
    ? ''
    : renderDesktopFriendTag(selected.tag, selected.peerUserId || selected.name, 'chat-header-tag')
  const securityAudience = group
    ? `${escapeHtml(selected.name)}\u7684\u7fa4\u6210\u5458\u53ef\u4ee5\u9605\u8bfb`
    : `\u4ec5\u4f60\u548c ${escapeHtml(selected.name)} \u53ef\u4ee5\u9605\u8bfb`
  const messages = currentMessages(selected)
  const rows = messages.length
    ? messages.map((message) => renderDesktopMessageRow(selected, message)).join('')
    : `<div class="message-row message-in"><div class="message-avatar">${avatar(selected, 'avatar-tiny')}</div><div><span class="message-sender">${escapeHtml(selected.name)}</span><div class="message-bubble">\u684c\u9762\u7aef\u804a\u5929\u5df2\u652f\u6301\u7cfb\u7edf\u6d88\u606f\u63d0\u793a\u3002</div><time>09:38</time></div></div>`
  const newMessageLabel = Number(selected.unread || 0) > 0 ? `<span class="jump-latest-count">${Number(selected.unread) > 99 ? '99+' : Number(selected.unread)} 条新消息</span>` : ''
  return `<section class="chat-panel panel-surface ${state.fileDragActive ? 'is-file-dragging' : ''}" data-file-drop-zone>
      <div class="desktop-file-drop-overlay" aria-hidden="true"><div>${icon('image')}<strong>松开鼠标添加图片或文件</strong><small>图片会先显示预览，确认后再发送</small></div></div>
      <div class="chat-header"><div class="chat-title"><span class="avatar-wrap">${avatar(selected)}${selected.type === 'personal' && !selected.fileTransferAssistant ? `<i class="online-dot${selected.online ? '' : ' offline'}"></i>` : ''}</span><div class="chat-title-copy"><h2><span class="chat-title-name-text">${escapeHtml(selected.name)}</span>${headerTag}</h2><p>${selected.type === 'personal' && !selected.fileTransferAssistant ? `<span class="${selected.online ? 'status-green' : 'status-gray'}">${selected.online ? '\u5728\u7ebf' : '\u79bb\u7ebf'}</span>` : (group ? '\u7fa4\u804a' : 'Pulse \u8054\u7cfb\u4eba')}</p></div></div><div class="chat-actions"><button class="subtle-icon-btn desktop-clear-chat-btn" data-action="clear-conversation" aria-label="清除聊天记录" title="清除聊天记录">${icon('trash')}</button>${selected.fileTransferAssistant ? '' : `<button class="subtle-icon-btn" data-action="call-audio" aria-label="\u8bed\u97f3\u901a\u8bdd" title="\u8bed\u97f3\u901a\u8bdd">${icon('phone')}</button><button class="subtle-icon-btn" data-action="call-video" aria-label="\u89c6\u9891\u901a\u8bdd" title="\u89c6\u9891\u901a\u8bdd">${icon('video')}</button>`}<button class="subtle-icon-btn" data-action="search-chat" aria-label="\u641c\u7d22\u804a\u5929" title="\u641c\u7d22\u804a\u5929">${icon('search')}</button>${group ? `<button class="subtle-icon-btn" data-action="group-info" aria-label="\u7fa4\u804a\u8d44\u6599" title="\u7fa4\u804a\u8d44\u6599">${icon('settings')}</button>` : ''}${selected.fileTransferAssistant ? '' : `<button class="subtle-icon-btn" data-action="more" aria-label="\u66f4\u591a" title="\u66f4\u591a">${icon('more')}</button>`}</div></div>
    <div class="chat-security">${icon('lock')} \u7aef\u5230\u7aef\u52a0\u5bc6 \u00b7 ${securityAudience}</div>
      <div class="chat-history">
        <div class="chat-stream" data-conversation-id="${escapeHtml(conversationScrollKey(selected))}"><div class="day-divider"><span>${state.loadingMessages ? '\u6b63\u5728\u540c\u6b65' : (state.messageSearchQuery ? `搜索：${escapeHtml(state.messageSearchQuery)}` : '\u4eca\u5929')}</span></div>${state.messageSearchQuery ? `<div class="chat-search-summary"><span>找到 ${messages.length} 条匹配消息</span><button type="button" data-action="clear-message-search">清除搜索</button></div>` : ''}${renderDesktopSafetyNotice(selected)}${rows}</div>
        ${state.mentionJumpIds.length && !state.messageMultiMode ? `<button class="jump-mention-btn" data-action="jump-mention" type="button" aria-label="定位到@我的消息"><span class="mention-jump-mark">@</span><span>${state.mentionJumpIds.length > 1 ? `${state.mentionJumpIds.length} 条@我` : '有人@我'}</span><span>${icon('arrow')}</span></button>` : ''}
        <button class="jump-latest-btn${newMessageLabel ? ' has-new-message' : ''}" data-action="jump-latest" data-jump-latest data-jump-conversation="${escapeHtml(conversationScrollKey(selected))}" aria-label="\u56de\u5230\u6700\u65b0\u6d88\u606f" title="\u56de\u5230\u6700\u65b0\u6d88\u606f">${newMessageLabel}${icon('arrow')}</button>
      </div>
     ${renderMessageMultiToolbar(selected)}
       <div class="composer ${state.recordingVoice ? 'is-recording' : ''} ${groupMuteReason ? 'is-group-muted' : ''} ${personalChatBlockReason ? 'is-chat-blocked' : ''}">
        ${state.replyTarget ? `<div class="message-reply-composer"><span>${icon('chat')}</span><div><strong>回复 ${escapeHtml(state.replyTarget.fromNickname || (state.replyTarget.mine ? '自己' : selected.name))}</strong><small>${escapeHtml(desktopMessagePreview(state.replyTarget))}</small></div><button type="button" data-action="clear-reply" aria-label="取消引用">${icon('close')}</button></div>` : ''}
        ${state.showMentionPicker ? renderDesktopMentionPicker(selected) : ''}
        ${renderDesktopPendingFile(selected)}
        <div class="composer-tools">${renderDesktopComposerActions()}${selected.type === 'group' ? '<button type="button" class="composer-mention-button" data-action="mention" aria-label="提醒成员" title="提醒成员">@</button>' : ''}<button type="button" data-action="toggle-emoji" aria-label="\u8868\u60c5" title="\u8868\u60c5">${icon('smile')}</button><button type="button" class="composer-voice-button ${state.recordingVoice ? 'is-recording' : ''} ${state.voiceRecordBusy ? 'is-busy' : ''}" data-action="voice-record" aria-label="\u8bed\u97f3\u6d88\u606f" title="${state.recordingVoice ? '\u505c\u6b62\u5f55\u97f3' : state.voiceRecordBusy ? '\u6b63\u5728\u8bf7\u6c42\u9ea6\u514b\u98ce' : '\u70b9\u51fb\u5f55\u5236\u8bed\u97f3\u6d88\u606f'}">${icon('mic')}<span class="composer-voice-label">${state.voiceRecordBusy ? '\u6b63\u5728\u51c6\u5907\u8bed\u97f3\u2026' : state.recordingVoice ? `\u6b63\u5728\u5f55\u97f3 ${state.voiceRecordSeconds} \u79d2 \u00b7 \u70b9\u51fb\u505c\u6b62` : '\u8bed\u97f3\u6d88\u606f'}</span></button><span class="composer-hint">Enter \u53d1\u9001 \u00b7 Shift + Enter \u6362\u884c${state.uploadingFile ? ' \u00b7 \u6b63\u5728\u4e0a\u4f20\u2026' : ''}</span></div>
      ${state.showEmojiPanel ? `<div class="desktop-emoji-panel">${['\ud83d\ude00','\ud83d\ude02','\ud83d\ude0d','\ud83d\udc4d','\ud83d\udc4f','\ud83c\udf89','\u2764\ufe0f','\ud83d\udd25'].map((emoji) => `<button type="button" data-emoji="${emoji}">${emoji}</button>`).join('')}</div>` : ''}
          ${chatBlockReason ? `<div class="desktop-group-muted-tip desktop-chat-blocked-tip">${icon('lock')} ${escapeHtml(chatBlockReason)}</div>` : ''}<textarea data-message-composer placeholder="${escapeHtml(chatBlockReason || '\u5199\u4e0b\u4f60\u7684\u6d88\u606f\u2026')}" ${state.sendingMessage || state.uploadingFile || chatBlockReason ? 'disabled' : ''}>${escapeHtml(state.composerText || '')}</textarea>
        <div class="composer-bottom"><span>${icon('lock')} ${group ? '\u7fa4\u804a\u6d88\u606f' : '\u79c1\u5bc6\u5bf9\u8bdd'}</span><button class="send-button" data-action="send" aria-label="\u53d1\u9001\u6d88\u606f" title="\u53d1\u9001\u6d88\u606f" ${state.sendingMessage || chatBlockReason ? 'disabled' : ''}>${icon('send')}</button></div><input id="desktop-file-input" class="desktop-hidden-file" type="file" accept="*/*" />
    </div>
  </section>`
}

stopDesktopCallChange = desktopCall.onChange(() => {
  if (state.authenticated) syncDesktopCallOverlay()
})
stopDesktopCallNotice = desktopCall.onNotice((message) => showToast(message))
desktopCall.startBridge()
startDesktopExpiryTimer()
bindDesktopCallActions()
function handleDesktopWindowResize() {
  updateDesktopConversationNameOverflow()
  positionDesktopConversationPlusMenu()
}
window.addEventListener('resize', handleDesktopWindowResize)
window.addEventListener('pulse:desktop-chat-cache-cleared', handleDesktopCacheCleared)
window.addEventListener('pulse:desktop-auth-expired', handleDesktopAuthExpiredEvent)
document.addEventListener('keydown', handleDesktopGlobalShortcut)
stopDesktopShortcut = window.pulseDesktop?.onShortcut?.(handleDesktopNativeShortcut) || null
ensureDesktopProtectedMediaObserver()
render()
void loadDesktopClientAccessConfig()
if (state.authenticated) void loadRemoteData()
stopDesktopNotificationClick = window.pulseDesktop?.onNotificationClick?.((payload) => {
  void openDesktopNotificationTarget(payload)
}) || null

function disposeDesktopModule() {
  if (desktopModuleDisposed) return
  desktopModuleDisposed = true
  if (desktopRenderFrame !== null) window.cancelAnimationFrame(desktopRenderFrame)
  desktopRenderFrame = null
  window.removeEventListener('resize', handleDesktopWindowResize)
  window.removeEventListener('pulse:desktop-chat-cache-cleared', handleDesktopCacheCleared)
  window.removeEventListener('pulse:desktop-auth-expired', handleDesktopAuthExpiredEvent)
  document.removeEventListener('keydown', handleDesktopGlobalShortcut)

  stopDesktopCallChange?.()
  stopDesktopCallChange = null
  stopDesktopCallNotice?.()
  stopDesktopCallNotice = null
  stopDesktopNotificationClick?.()
  stopDesktopNotificationClick = null
  stopDesktopShortcut?.()
  stopDesktopShortcut = null

  if (messageMenuDismissHandler) {
    document.removeEventListener('click', messageMenuDismissHandler)
    messageMenuDismissHandler = null
  }
  messageMenuDismissBound = false

  if (desktopCallActionHandler) {
    desktopCallActionRoot?.removeEventListener('click', desktopCallActionHandler)
    desktopCallActionHandler = null
  }
  desktopCallActionRoot = null
  desktopCallActionBound = false

  stopDesktopQrLogin()
  stopResetCountdown()
  stopRegisterCountdown()
  cancelInputDialog()
  stopDesktopExpiryTimer()
  stopDesktopVoiceTimer()
  if (desktopChatScrollIdleTimer !== null) window.clearTimeout(desktopChatScrollIdleTimer)
  desktopChatScrollIdleTimer = null
  desktopChatScrollActive = false
  if (desktopVoiceRecorder) {
    try { desktopVoiceRecorder.stop() } catch { /* ignore */ }
  }
  stopDesktopWsConnection()
  desktopCall.stopBridge()
  desktopProtectedMediaObserver?.disconnect()
  desktopProtectedMediaObserver = null
  if (presenceRenderTimer !== null) window.clearTimeout(presenceRenderTimer)
  presenceRenderTimer = null
  presenceRenderPending = false

  window.clearTimeout(showToast.timer)
  showToast.timer = null
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    disposeDesktopModule()
  })
}

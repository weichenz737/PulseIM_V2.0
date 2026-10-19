import {
  clearDesktopSession,
  fetchDesktopContacts,
  fetchDesktopConversations,
  fetchDesktopMapConfig,
  fetchDesktopFileConfig,
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
  fetchDesktopWalletTransactions,
  fetchDesktopWalletTransaction,
  setDesktopPaymentPassword,
  deleteDesktopFavorite,
  fetchDesktopProfile,
  fetchDesktopAccountSecurity,
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
  getDesktopDeviceId,
  loginDesktop,
  registerDesktop,
  startDesktopQrLogin,
  pollDesktopQrLogin,
  logoutDesktop,
  logoutDesktopOnPageHide,
  markDesktopConversationRead,
  markDesktopConversationUnread,
  updateDesktopConversationSettings,
  setDesktopConversationArchived,
  removeDesktopConversation,
  acceptDesktopFriendRequest,
  acceptDesktopGroupInvite,
  rejectDesktopGroupInvite,
  approveDesktopGroupJoinRequest,
  rejectDesktopGroupJoinRequest,
  openDesktopPrivateConversation,
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
  fetchDesktopMomentInteractionUnreadCount,
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
  onDesktopWsMessage,
} from './src/desktopWs.ts'
import { desktopCall } from './src/desktopCall.ts'
import { loadDesktopBaiduMap } from './src/desktopMap.ts'
import QRCode from 'qrcode'

let pageHideLogoutSent = false
window.addEventListener('pagehide', () => {
  if (pageHideLogoutSent) return
  pageHideLogoutSent = true
  logoutDesktopOnPageHide()
})
window.pulseDesktop?.onQuitRequested?.(() => {
  void logoutDesktop().finally(() => {
    window.pulseDesktop?.notifyQuitReady?.()
  })
})

const app = document.querySelector('#desktop-legacy-root')
if (window.pulseDesktop) document.documentElement.dataset.electron = 'true'
syncDesktopMediaToken(getDesktopToken())
const initialRememberedLogin = getRememberedLogin()
let lastDesktopShellBadge = -1
const DESKTOP_THEME_STORAGE_KEY = 'pulse_desktop_theme'
const DESKTOP_ACCOUNT_SECURITY_CODE = '1234'
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
}

function readDesktopTheme() {
  try {
    return localStorage.getItem(DESKTOP_THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function saveDesktopTheme(theme) {
  try {
    localStorage.setItem(DESKTOP_THEME_STORAGE_KEY, theme)
  } catch {
    /* ignore storage failures */
  }
}

function syncDesktopNativeTheme(theme) {
  if (typeof window.pulseDesktop?.setTheme !== 'function') return
  void window.pulseDesktop.setTheme(theme).catch(() => {})
}

const state = {
  page: 'messages',
  theme: readDesktopTheme(),
  settingsSection: 'profile',
  profileMenuOpen: false,
  profileEditing: false,
  profileAvatarUploading: false,
  contactView: 'grid',
  selectedConversation: 0,
  conversationFilter: '全部',
  contactQuery: '',
  contactMoreOpen: false,
  contactOnlineOnly: false,
  contactRefreshing: false,
  globalRefreshing: false,
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
  qrLoginBusy: false,
  qrLoginTicket: '',
  qrLoginImage: '',
  qrLoginExpiresAt: '',
  qrLoginStatus: '',
  qrLoginError: '',
  loginError: '',
  loginNotice: '',
  profile: readCachedProfile() || { nickname: 'Howard', userId: '1001001', signature: '让每一次连接，都有回应。' },
  messagesByConversation: {},
  readStatesByConversation: {},
  groupDetailsByConversation: {},
  groupDetailLoadingConversationId: '',
  groupInfoLoading: false,
  groupInfoError: '',
  groupInfoBusy: '',
  groupInfoFocusMembers: false,
  groupInfoAddOpen: false,
  groupInfoAddSelected: new Set(),
  showMentionPicker: false,
  pendingMentions: [],
  pendingAtAll: false,
  mentionJumpIds: [],
  readReceiptsEnabled: true,
  dataSource: getDesktopToken() ? 'loading' : 'mock',
  modal: '',
  modalBusy: false,
  modalError: '',
  modalQuery: '',
  modalResults: null,
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
  inputDialog: null,
  contactProfileExpanded: false,
  modalMode: 'conversation',
  friendRequests: [],
  groupNotifications: { invites: [], joinRequests: [], events: [] },
  momentInteractions: [],
  momentInteractionUnreadCount: 0,
  notificationCount: 0,
  friendPendingCount: 0,
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
  filePreviewMessage: null,
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
  deviceLoading: false,
  deviceError: '',
  devicesLoaded: false,
  accountSecurity: { phone: '', securityCodeEnabled: false, securityCode: '' },
  accountSecurityLoaded: false,
  accountSecurityLoading: false,
  accountSecurityError: '',
  securityCodeVisible: false,
  securityCodeBusy: false,
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
  favorites: [],
  favoritesLoading: false,
  favoritesLoaded: false,
  favoriteOrganizing: false,
  favoriteSelection: new Set(),
  favoriteDetail: null,
  favoriteDetailLoading: false,
  walletSummary: { balance: 0, hasPaymentPassword: false },
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
  composerText: '',
  conversationSettingsById: {},
  chatSettingsLoading: false,
  chatSettingsSaving: false,
  chatSettingsConversationId: '',
  chatSettingsError: '',
  burnClock: Date.now(),
  showEmojiPanel: false,
  showPlusMenu: false,
  recordingVoice: false,
  uploadingFile: false,
  pendingDroppedFile: null,
  pendingDroppedFileConversationId: '',
  fileDragActive: false,
  liveLocationActive: false,
  liveLocationConversationId: '',
  liveLocationWatchId: null,
  moments: [],
  momentsLoaded: false,
  momentsLoading: false,
  momentsError: '',
  momentCommentOpenId: '',
  momentCommentText: '',
  momentDetail: null,
  momentPublishBusy: false,
  momentDraftText: '',
  momentVisibility: 0,
  momentVisibleUserIds: new Set(),
  momentMentionUserIds: new Set(),
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

let stopDesktopWs = null
let desktopWsToken = ''
let notificationPollTimer = null
let readStatePollTimer = null
let readStatePollConversationId = ''
let desktopDeviceSessionTimer = null
let desktopDeviceSessionCheckBusy = false
const DESKTOP_DEVICE_SESSION_POLL_MS = 5_000
let messageMenuDismissBound = false
let messageMenuDismissHandler = null
let desktopExpiryTimer = null
let desktopCallActionHandler = null
let stopDesktopCallChange = null
let stopDesktopCallNotice = null
let desktopModuleDisposed = false
const loadedDesktopAvatarUrls = new Set()
const desktopMediaBlobUrls = new Map()
const desktopMediaBlobLoading = new Map()

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
  })
  if (!window.pulseDesktop?.showNotification) showToast(`${conversation?.name || 'Pulse'}：${body}`)
}

let conversations = [
  { name: '林默', initials: '林', tone: 'blue', preview: '晚上的发布会我把流程再过一遍，稍后发你。', time: '09:42', unread: 2, online: true, tag: '产品讨论' },
  { name: 'Pulse 设计组', initials: 'P', tone: 'violet', preview: '小雅：新版桌面端的视觉稿已更新', time: '昨天', unread: 0, online: false, tag: '群聊 · 8 人' },
  { name: '周亦然', initials: '周', tone: 'orange', preview: '收到，周五下午见。', time: '周二', unread: 0, online: true, tag: '好友' },
  { name: 'Pulse 官方', initials: 'P', tone: 'cyan', preview: '欢迎使用 Pulse，去完善你的个人资料吧', time: '周一', unread: 0, online: false, tag: '系统通知' },
  { name: '远山摄影社', initials: '远', tone: 'green', preview: '新的相册已上传：夏日海边', time: '6月18日', unread: 0, online: false, tag: '群聊 · 24 人' },
]

const mockWalletTransactions = [
  { id: 'demo-wallet-1', trade_no: 'DEMO202608130001', direction: 'IN', trade_type: 'TRANSFER', amount: 12800, balance_after: 256800, counterparty_name: '林默', remark: '项目资料费', created_at: '2026-08-13T09:18:00+08:00' },
  { id: 'demo-wallet-2', trade_no: 'DEMO202608120002', direction: 'OUT', trade_type: 'RED_PACKET', amount: 8800, balance_after: 244000, counterparty_name: 'Pulse 设计组', remark: '下午茶红包', created_at: '2026-08-12T16:42:00+08:00' },
  { id: 'demo-wallet-3', trade_no: 'DEMO202608100003', direction: 'IN', trade_type: 'ADMIN_ADJUST', amount: 50000, balance_after: 252800, remark: '系统奖励', created_at: '2026-08-10T10:06:00+08:00' },
]

const mockDesktopFiles = [
  { id: 'demo-file-1', name: 'DesktopCrawlerPet-1.0.0.exe', ext: 'EXE', category: 'application', sender: 'FENG', chat: '高冷单王', size: '69.4M', date: '2026-08-13', time: '15:54', group: 'today' },
  { id: 'demo-file-2', name: 'PulseIM-1.5.9.apk.1.1', ext: 'APK', category: 'application', sender: 'FENG', chat: '高冷单王', size: '39.3M', date: '2026-08-13', time: '14:53', group: 'today', downloadStatus: '未下载', expires: '将在13天后无法下载' },
  { id: 'demo-file-3', name: 'DesktopCrawlerPet-1.0.0.exe', ext: 'EXE', category: 'application', sender: 'FENG', chat: '高歌姐', size: '69.4M', date: '2026-08-13', time: '08:11', group: 'today' },
  { id: 'demo-file-4', name: '8月12日17点三支一扶报名较少岗位(4).xlsx', ext: 'X', category: 'spreadsheet', sender: '滑县导阳阳', chat: '滑县事业单位重要事情通知 2 群', size: '22.6K', date: '2026-08-12', time: '昨天', group: 'week' },
  { id: 'demo-file-5', name: '8月12日17点三支一扶报名较多岗位.xlsx', ext: 'X', category: 'spreadsheet', sender: '滑县导阳阳', chat: '滑县事业单位重要事情通知 2 群', size: '48.2K', date: '2026-08-12', time: '昨天', group: 'week' },
  { id: 'demo-file-6', name: 'PulseIM-1.5.9.apk', ext: 'APK', category: 'application', sender: 'FENG', chat: '芬达 🏅', size: '39.3M', date: '2026-08-12', time: '昨天', group: 'week' },
  { id: 'demo-file-7', name: '8月12日11点三支一扶报名较多岗位.xlsx', ext: 'X', category: 'spreadsheet', sender: '滑县导阳阳', chat: '滑县事业单位重要事情通知 2 群', size: '41.7K', date: '2026-08-11', time: '前天', group: 'week' },
  { id: 'demo-file-8', name: '新版产品使用手册.pdf', ext: 'PDF', category: 'document', sender: '小雅', chat: 'Pulse 设计组', size: '3.8M', date: '2026-08-10', time: '周一', group: 'week' },
]

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
  if (message?.recalled || (type !== 2 && type !== 3)) return null
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

let contacts = [
  { name: '林默', initials: '林', tone: 'blue', meta: '产品设计师 · 杭州', status: '在线', tag: '同事' },
  { name: '周亦然', initials: '周', tone: 'orange', meta: '摄影爱好者 · 上海', status: '刚刚活跃', tag: '好友' },
  { name: '小雅', initials: '雅', tone: 'violet', meta: 'Pulse 设计组', status: '在线', tag: '同事' },
  { name: '顾南', initials: '顾', tone: 'green', meta: '前端工程师 · 深圳', status: '昨天活跃', tag: '好友' },
  { name: '陈屿', initials: '陈', tone: 'pink', meta: '远山摄影社', status: '周一活跃', tag: '社群' },
  { name: '程心', initials: '程', tone: 'cyan', meta: '内容创作者 · 北京', status: '上周活跃', tag: '好友' },
]

const mockMoments = [
  {
    id: 'demo-moment-1', userId: '1001002', nickname: '周亦然', initials: '周', tone: 'orange', avatarUrl: '',
    content: '清晨的风把夏天吹得很近。周末去海边的人，记得带上相机。🌊', images: [], mediaTypes: [],
    visibility: 0, createdAt: '2026-08-13T08:56:00+08:00', likeCount: 24, commentCount: 8, likedByMe: false,
    likeNicknames: ['小雅', '林默'], likeUserIds: ['1001003', '1001001'], comments: [],
  },
  {
    id: 'demo-moment-2', userId: '1001003', nickname: '小雅', initials: '雅', tone: 'violet', avatarUrl: '',
    content: '今天完成了 Pulse 桌面端的第一轮视觉整理，蓝色还是很耐看。大家觉得哪一版更适合长期使用？',
    images: [], mediaTypes: [], visibility: 0, createdAt: '2026-08-12T19:24:00+08:00', likeCount: 16, commentCount: 5,
    likedByMe: false, likeNicknames: [], likeUserIds: [], comments: [],
  },
]

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
  settings: '<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="m19.4 15 .1.1a1.7 1.7 0 0 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 0 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 0 1-2.4-2.4l.1-.1A1.7 1.7 0 0 0 6.2 12a1.7 1.7 0 0 0-1.2-2.9h-.2a1.7 1.7 0 0 1 0-3.4H5A1.7 1.7 0 0 0 6.2 3l-.1-.1a1.7 1.7 0 0 1 2.4-2.4l.1.1A1.7 1.7 0 0 0 11.5 1h.2a1.7 1.7 0 0 1 3.4 0v.2A1.7 1.7 0 0 0 18 2.4l.1-.1a1.7 1.7 0 0 1 2.4 2.4l-.1.1A1.7 1.7 0 0 0 19.2 10h.2a1.7 1.7 0 0 1 0 3.4h-.2a1.7 1.7 0 0 0 .2 1.6Z" transform="translate(-3.5 3.5) scale(.71)"/>',
  sun: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M19.5 15.5A8.2 8.2 0 0 1 8.5 4.2a8.5 8.5 0 1 0 11 11.3Z"/>',
  phone: '<path d="M6.6 3.8 9.2 7 7.6 9.1a14.6 14.6 0 0 0 7.3 7.3l2.1-1.6 3.2 2.6-1.3 2.6c-.5 1-1.6 1.5-2.7 1.2C8.5 19 5 15.5 2.8 7.8c-.3-1.1.2-2.2 1.2-2.7l2.6-1.3Z"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
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
  arrow: '<path d="m9 6 6 6-6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
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
  app: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 8h3v3H8zM13 8h3v3h-3zM8 13h3v3H8zM13 13h3v3h-3z"/>',
  grid: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  cloud: '<path d="M7.2 18.5h9.4a4.4 4.4 0 0 0 .8-8.7A5.6 5.6 0 0 0 6.6 8.5a5 5 0 0 0 .6 10Z"/>',
  download: '<path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M5 20h14"/>',
  shield: '<path d="M12 3 19 6v5.2c0 4.2-2.8 7.9-7 9.8-4.2-1.9-7-5.6-7-9.8V6l7-3Z"/><path d="m9 12 2 2 4-4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.8 1.9c-1 .7-1.6 1-1.6 2.4M12 16.5h.1"/>',
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
  const image = resolveDesktopAvatarUrl(person.avatarUrl || person.avatar)
  const imageLoaded = Boolean(image && loadedDesktopAvatarUrls.has(image))
  const fallback = `<span class="avatar-fallback">${escapeHtml(initials)}</span>`
  const imageMarkup = image
    ? `<img class="avatar-image${imageLoaded ? ' is-loaded' : ''}" src="${escapeHtml(image)}" alt="" loading="eager" decoding="sync" />`
    : ''
  return `<div class="avatar avatar-${person.tone || 'blue'} ${extra}">${imageMarkup}${fallback}</div>`
}

function bindDesktopAvatarImages() {
  document.querySelectorAll('.avatar-image').forEach((element) => {
    const image = element
    if (!(image instanceof HTMLImageElement) || image.dataset.avatarBound === '1') return
    image.dataset.avatarBound = '1'
    const fallback = image.nextElementSibling
    const showFallback = () => {
      image.hidden = true
      image.classList.remove('is-loaded')
      if (fallback instanceof HTMLElement) fallback.hidden = false
    }
    const showImage = () => {
      const url = image.currentSrc || image.src
      if (url) loadedDesktopAvatarUrls.add(url)
      image.hidden = false
      image.classList.add('is-loaded')
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

function mapRemoteConversation(item) {
  const name = item.title || '会话'
  return {
    id: String(item.id),
    name,
    initials: (String(item.remark || '').trim() || name).slice(0, 1),
    tone: item.type === 'group' || Number(item.type) === 2 ? 'violet' : 'blue',
    preview: desktopPreviewText(item.lastMsgPreview, item.lastMsgType),
    time: formatRemoteTime(item.lastMsgTime),
    unread: Number(item.unreadCount || 0),
    mentionUnread: Boolean(item.mentionUnread),
    online: Boolean(item.online),
    tag: item.tag || (item.type === 'group' || Number(item.type) === 2 ? '群聊' : '好友'),
    type: item.type === 'group' || Number(item.type) === 2 ? 'group' : 'personal',
    peerUserId: item.peerUserId ? String(item.peerUserId) : '',
    avatarUrl: resolveDesktopAvatarUrl(item.avatarUrl || ''),
    fileTransferAssistant: Boolean(item.fileTransferAssistant),
    archived: Boolean(item.archived),
    pinned: Boolean(item.pinned),
    mute: Boolean(item.mute),
  }
}

function isGroupConversation(item) {
  return item?.type === 'group' || item?.tag?.includes('群聊') || item?.name?.includes('设计组')
}

function isArchivedConversation(item) {
  return Boolean(item?.archived)
}

function mapRemoteContact(item) {
  const name = item.nickname || '用户'
  const remark = String(item.remark || '').trim()
  return {
    userId: String(item.userId),
    nickname: name,
    remark,
    name: remark || name,
    initials: name.slice(0, 1),
    tone: ['blue', 'violet', 'orange', 'green', 'cyan', 'pink'][Number(item.userId || 0) % 6],
    meta: remark && item.nickname
      ? item.nickname
      : (item.tag || `Pulse ID ${item.pulseId || item.userId}`),
    status: item.online ? '在线' : '最近活跃',
    tag: item.tag || '好友',
    avatarUrl: resolveDesktopAvatarUrl(item.avatarUrl || ''),
  }
}

function isDesktopFileTransferAssistant(item) {
  const assistantName = String.fromCodePoint(0x6587, 0x4ef6, 0x4f20, 0x8f93, 0x52a9, 0x624b)
  return Boolean(item?.fileTransferAssistant)
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

function mapRemoteMessage(item) {
  const rawId = item.id ?? item.msgId ?? item.clientMsgId ?? ''
  const createdAt = item.createdAt || (item.sendTime ? new Date(Number(item.sendTime)).toISOString() : '')
  return {
    id: String(rawId),
    clientMsgId: item.clientMsgId ? String(item.clientMsgId) : '',
    fromUserId: String(item.fromUserId || item.from_user_id || ''),
    fromNickname: item.fromNickname || item.from_nickname || '',
    fromAvatarUrl: resolveDesktopAvatarUrl(item.fromAvatarUrl || item.from_avatar_url || item.avatarUrl || ''),
    content: desktopContentString(item.content || ''),
    msgType: Number(item.msgType || 0),
    conversationId: String(item.conversationId || ''),
    mine: String(item.fromUserId || '') === String(state.profile.userId || ''),
    createdAt,
    sendTimeMs: Number(item.sendTimeMs || item.sendTime || (createdAt ? Date.parse(createdAt) : 0)) || 0,
    time: formatRemoteTime(createdAt),
    recalled: Boolean(item.recalled),
    replyToMsgId: item.replyToMsgId ? String(item.replyToMsgId) : '',
    replyToContent: desktopContentString(item.replyToContent || ''),
    replyToMsgType: Number(item.replyToMsgType || 0) || 0,
    replyToNickname: item.replyToNickname || '',
    replyToRecalled: Boolean(item.replyToRecalled),
    mentionUserIds: Array.isArray(item.mentionUserIds) ? item.mentionUserIds.map((id) => String(id)) : [],
    atAll: Boolean(item.atAll),
    mentionedMe: Boolean(item.mentionedMe),
    burnAfterRead: Boolean(item.burnAfterRead),
    burnSeconds: Number(item.burnSeconds || 0) || 0,
    burnReadAt: item.burnReadAt || '',
    burnExpiresAt: item.burnExpiresAt || '',
    autoDeleteExpiresAt: item.autoDeleteExpiresAt || '',
  }
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
    return false
  }
  state.messagesByConversation[conversationId] = messages.map((item, itemIndex) => (
    itemIndex === index ? { ...item, ...message, id: message.id || item.id } : item
  ))
  invalidateSharedContentCounts(conversationId)
  return true
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
  if (String(selected?.id || '') === id) void loadDesktopSharedContentCounts(selected, true)
}

async function loadDesktopSharedContentCounts(selected, force = false) {
  const id = String(selected?.id || '')
  if (!id) return
  if (!force && state.sharedContentCountsByConversation[id]) return
  if (state.sharedContentCountsLoadingConversationId === id) return

  state.sharedContentCountsLoadingConversationId = id
  if (String(conversations[state.selectedConversation]?.id || '') === id) render()
  try {
    if (state.dataSource === 'mock') {
      state.sharedContentCountsByConversation[id] = countSharedContentMessages(currentMessages(selected))
    } else if (state.dataSource === 'remote') {
      const [media, files] = await Promise.all([
        searchDesktopMessages(id, '', { filter: 'media' }),
        searchDesktopMessages(id, '', { filter: 'file' }),
      ])
      state.sharedContentCountsByConversation[id] = {
        media: media.length,
        file: files.length,
      }
    }
  } catch {
    state.sharedContentCountsByConversation[id] = { media: null, file: null }
  } finally {
    if (state.sharedContentCountsLoadingConversationId === id) {
      state.sharedContentCountsLoadingConversationId = ''
    }
    if (String(conversations[state.selectedConversation]?.id || '') === id) render()
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

async function loadDesktopGroupDetail(selected, force = false) {
  if (!selected?.id || selected.type !== 'group') return null
  if (state.dataSource !== 'remote') {
    const detail = desktopMockGroupDetail(selected)
    state.groupDetailsByConversation[String(selected.id)] = detail
    return detail
  }
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
    if (String(conversations[state.selectedConversation]?.id || '') === id) render()
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

function desktopMockGroupDetail(selected) {
  const ownerId = String(state.profile.userId || '1001001')
  const members = [{ userId: ownerId, nickname: state.profile.nickname || '\u6211', role: 'owner' }, ...contacts.slice(0, 5).map((item, index) => ({ userId: String(item.userId || `demo-${index}`), nickname: item.name || '\u7fa4\u6210\u5458', avatarUrl: item.avatarUrl || '', role: index === 0 ? 'admin' : 'member' }))]
    .map((member) => ({ ...member, owner: member.role === 'owner', admin: member.role !== 'member', speakMuted: false }))
  return { id: String(selected.id), title: selected.name, avatarUrl: selected.avatarUrl || '', notice: '\u8bf7\u4fdd\u6301\u53cb\u597d\u4ea4\u6d41\uff0c\u5171\u540c\u7ef4\u62a4\u7fa4\u804a\u6c1b\u56f4\u3002', ownerId, owner: true, admin: true, myRole: 'owner', myGroupNickname: '', groupRemark: '', hidden: false, pinned: Boolean(selected.pinned), mute: Boolean(selected.mute), muteAll: false, joinVerifyRequired: false, allowMemberAddFriend: true, pendingJoinCount: 0, speakMuted: false, memberCount: members.length, members }
}

async function openDesktopGroupInfo({ focusMembers = false } = {}) {
  const selected = conversations[state.selectedConversation]
  if (!selected?.id || !isGroupConversation(selected)) return
  state.modal = 'group-info'
  state.groupInfoLoading = true
  state.groupInfoError = ''
  state.groupInfoFocusMembers = Boolean(focusMembers)
  state.groupInfoAddOpen = false
  state.groupInfoAddSelected = new Set()
  render()
  try {
    const detail = state.dataSource === 'remote' ? await fetchDesktopGroupDetail(String(selected.id)) : desktopMockGroupDetail(selected)
    state.groupDetailsByConversation[String(selected.id)] = detail
    selected.name = detail.groupRemark || detail.title || selected.name
    selected.initials = selected.name.slice(0, 1)
    selected.pinned = Boolean(detail.pinned)
    selected.mute = Boolean(detail.mute)
  } catch (error) {
    state.groupInfoError = error instanceof Error ? error.message : '\u7fa4\u804a\u8d44\u6599\u52a0\u8f7d\u5931\u8d25'
  } finally {
    state.groupInfoLoading = false
    render()
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

async function editDesktopGroupField(field) {
  const selected = conversations[state.selectedConversation]
  const detail = groupInfoDetail()
  if (!selected?.id || !detail || !desktopGroupIsManager(detail)) return showToast('\u4ec5\u7fa4\u4e3b\u6216\u7ba1\u7406\u5458\u53ef\u4fee\u6539\u7fa4\u8d44\u6599')
  const isTitle = field === 'title'
  const result = await openDesktopInputDialog({ title: isTitle ? '\u7f16\u8f91\u7fa4\u540d\u79f0' : '\u7f16\u8f91\u7fa4\u516c\u544a', subtitle: '\u7fa4\u4fe1\u606f\u5c06\u540c\u6b65\u5230\u7fa4\u5185\u6210\u5458', fields: [{ name: 'value', label: isTitle ? '\u7fa4\u540d\u79f0' : '\u7fa4\u516c\u544a', value: isTitle ? detail.title : detail.notice, maxlength: isTitle ? 40 : 500, required: isTitle }], validate: (values) => isTitle && !String(values.value || '').trim() ? '\u7fa4\u540d\u79f0\u4e0d\u80fd\u4e3a\u7a7a' : '' })
  state.modal = 'group-info'
  if (!result) return
  const value = String(result.value || '').trim()
  try {
    if (state.dataSource === 'remote') await (isTitle ? updateDesktopGroupTitle(String(selected.id), value) : updateDesktopGroupNotice(String(selected.id), value))
    if (isTitle) { detail.title = value; selected.name = detail.groupRemark || value; selected.initials = selected.name.slice(0, 1) } else detail.notice = value
    showToast(isTitle ? '\u7fa4\u540d\u79f0\u5df2\u66f4\u65b0' : '\u7fa4\u516c\u544a\u5df2\u66f4\u65b0')
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

async function toggleDesktopGroupSetting(setting, checked) {
  const selected = conversations[state.selectedConversation]
  const detail = groupInfoDetail()
  if (!selected?.id || !detail) return
  if (['muteAll', 'joinVerifyRequired', 'allowMemberAddFriend'].includes(setting) && !desktopGroupIsManager(detail)) return showToast('\u4ec5\u7fa4\u4e3b\u6216\u7ba1\u7406\u5458\u53ef\u8bbe\u7f6e')
  const previous = detail[setting]
  detail[setting] = checked
  try {
    if (state.dataSource === 'remote') {
      if (setting === 'pinned' || setting === 'mute') await updateDesktopConversationSettings(String(selected.id), { [setting]: checked })
      else if (setting === 'muteAll') await setDesktopGroupMuteAll(String(selected.id), checked)
      else if (setting === 'joinVerifyRequired') await setDesktopJoinVerifyRequired(String(selected.id), checked)
      else await setDesktopGroupMemberFriendAllowed(String(selected.id), checked)
    }
    if (setting === 'pinned' || setting === 'mute') selected[setting] = checked
    showToast(checked ? '\u8bbe\置\u5df2\u5f00\u542f' : '\u8bbe\u7f6e\u5df2\u5173\u95ed')
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
  const current = textarea instanceof HTMLTextAreaElement ? textarea.value : String(state.composerText || '')
  const start = textarea instanceof HTMLTextAreaElement ? textarea.selectionStart : current.length
  const end = textarea instanceof HTMLTextAreaElement ? textarea.selectionEnd : start
  const before = current.slice(0, start)
  const after = current.slice(end)
  const needsSpace = before.length > 0 && !/\s$/.test(before)
  const next = `${before}${needsSpace ? ' ' : ''}${token} ${after}`
  state.composerText = next
  state.showMentionPicker = false
  render()
  focusDesktopComposer(before.length + (needsSpace ? 1 : 0) + token.length + 1)
}

function openDesktopMentionPicker() {
  const selected = conversations[state.selectedConversation]
  if (!selected || selected.type !== 'group') return
  if (!currentDesktopGroupDetail(selected)) void loadDesktopGroupDetail(selected)
  state.showEmojiPanel = false
  state.showPlusMenu = false
  state.showMentionPicker = true
  render()
  focusDesktopComposer(String(state.composerText || '').length)
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
  return Boolean(message?.burnAfterRead)
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
  if (!expiry.at) return desktopIsBurnMessage(message) ? '阅后即焚' : ''
  const remaining = Math.max(0, Math.ceil((expiry.at - state.burnClock) / 1000))
  if (remaining <= 0) return expiry.kind === 'burn' ? '正在销毁' : '正在自动删除'
  if (remaining < 60) return `${expiry.kind === 'burn' ? '阅后即焚' : '自动删除'} · ${remaining} 秒`
  const minutes = Math.ceil(remaining / 60)
  return `${expiry.kind === 'burn' ? '阅后即焚' : '自动删除'} · ${minutes} 分钟`
}

function removeExpiredDesktopMessages() {
  const now = state.burnClock
  let changed = false
  Object.keys(state.messagesByConversation).forEach((conversationId) => {
    const messages = state.messagesByConversation[conversationId] || []
    const remaining = messages.filter((message) => {
      const expiry = desktopMessageExpiry(message)
      const keep = !expiry.at || expiry.at > now
      if (!keep) changed = true
      return keep
    })
    if (remaining.length !== messages.length) state.messagesByConversation[conversationId] = remaining
  })
  return changed
}

function startDesktopExpiryTimer() {
  if (desktopExpiryTimer !== null) return
  desktopExpiryTimer = window.setInterval(() => {
    state.burnClock = Date.now()
    const hasExpiring = Object.values(state.messagesByConversation).some((messages) => messages.some((message) => desktopMessageExpiry(message).at > 0))
    const changed = removeExpiredDesktopMessages()
    if (hasExpiring || changed) render()
  }, 1000)
}

function stopDesktopExpiryTimer() {
  if (desktopExpiryTimer !== null) window.clearInterval(desktopExpiryTimer)
  desktopExpiryTimer = null
}

function defaultDesktopConversationSettings(conversationId) {
  return {
    conversationId: String(conversationId || ''),
    burnEnabled: false,
    burnSeconds: 10,
    autoDeleteEnabled: false,
    autoDeleteSeconds: 86400,
    peerAutoDeleteEnabled: false,
    peerAutoDeleteSeconds: 86400,
  }
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
  const next = { ...current, burnEnabled: Boolean(enabled), burnSeconds: Math.min(300, Math.max(0, Number(burnSeconds) || 0)) }
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
    showToast(next.autoDeleteEnabled ? `新消息将在${desktopDurationLabel(next.autoDeleteSeconds)}后自动删除` : '已关闭自动删除记录')
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
  if (!message.mine || !state.readReceiptsEnabled) return ''
  const readState = readStateFor(selected)
  if (!readState) return ''
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
  return `<span class="message-read-status ${label.startsWith('已读') ? 'is-read' : 'is-unread'}">${label}</span>`
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
  state.readStatesByConversation[conversationId] = {
    ...previous,
    myLastReadMsgId: isSelfReceipt ? (lastReadMsgId || previous.myLastReadMsgId) : previous.myLastReadMsgId,
    myLastReadSendTime: isSelfReceipt ? (lastReadSendTime || previous.myLastReadSendTime) : previous.myLastReadSendTime,
    peerLastReadMsgId: !isSelfReceipt ? (lastReadMsgId || previous.peerLastReadMsgId) : previous.peerLastReadMsgId,
    peerLastReadSendTime: !isSelfReceipt ? (lastReadSendTime || previous.peerLastReadSendTime) : previous.peerLastReadSendTime,
    members,
  }
  if (isSelfReceipt) {
    const conversation = conversations.find((item) => String(item.id) === conversationId)
    if (conversation) conversation.unread = 0
  }
  // The server emits READ_RECEIPT before the surrounding transaction commits.
  // Do not immediately refetch here: that request can observe the old
  // watermark and overwrite this fresh WebSocket update until the next reload.
  if (String(conversations[state.selectedConversation]?.id) === conversationId) render()
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
  const poll = async () => {
    if (readStatePollConversationId !== id || state.dataSource !== 'remote' || !getDesktopToken()) return
    try {
      const fresh = await fetchDesktopConversationReadStates(id)
      state.readStatesByConversation[id] = mergeReadState(state.readStatesByConversation[id], fresh)
      if (String(conversations[state.selectedConversation]?.id || '') === id) render()
    } catch {
      // The WebSocket remains the fast path; polling retries on the next tick.
    }
  }
  void poll()
  readStatePollTimer = window.setInterval(() => { void poll() }, 1500)
}

function isDesktopProtectedMediaUrl(value) {
  try {
    const parsed = new URL(String(value || ''), window.location.href)
    return /\/api\/v1\/files\/raw\//i.test(parsed.pathname)
  } catch {
    return false
  }
}

async function loadDesktopProtectedMedia(element) {
  if (!(element instanceof HTMLImageElement)) return
  const source = String(element.dataset.protectedMediaSrc || '').trim()
  if (!source || element.dataset.mediaBound === '1') return
  element.dataset.mediaBound = '1'
  const cached = desktopMediaBlobUrls.get(source)
  if (cached) {
    element.src = cached
    element.classList.add('is-loaded')
    const link = element.closest('[data-protected-media-link]')
    if (link instanceof HTMLAnchorElement) link.href = cached
    return
  }
  let request = desktopMediaBlobLoading.get(source)
  if (!request) {
    const headers = {}
    const token = getDesktopToken()
    if (token) headers.Authorization = `Bearer ${token}`
    request = fetch(source, { headers, credentials: 'include' })
      .then((response) => {
        if (!response.ok) throw new Error(`media request failed: ${response.status}`)
        return response.blob()
      })
      .then((blob) => {
        const blobUrl = URL.createObjectURL(blob)
        desktopMediaBlobUrls.set(source, blobUrl)
        return blobUrl
      })
      .finally(() => desktopMediaBlobLoading.delete(source))
    desktopMediaBlobLoading.set(source, request)
  }
  try {
    const blobUrl = await request
    if (!element.isConnected) return
    element.src = blobUrl
    element.classList.add('is-loaded')
    const link = element.closest('[data-protected-media-link]')
    if (link instanceof HTMLAnchorElement) link.href = blobUrl
  } catch {
    // Keep the original URL as a last-resort fallback for public deployments.
    element.src = source
    element.classList.add('is-load-failed')
  }
}

function bindDesktopProtectedMedia() {
  document.querySelectorAll('[data-protected-media-src]').forEach((element) => {
    void loadDesktopProtectedMedia(element)
  })
}

async function refreshNotificationSummary() {
  if (state.dataSource !== 'remote') return
  const [friendResult, groupResult, momentResult] = await Promise.allSettled([
    fetchDesktopFriendRequests(),
    fetchDesktopGroupNotifications(),
    fetchDesktopMomentInteractionUnreadCount(),
  ])
  const friendCount = friendResult.status === 'fulfilled' ? Number(friendResult.value.pendingCount || 0) : 0
  const groupCount = groupResult.status === 'fulfilled' ? Number(groupResult.value.pendingCount || 0) : 0
  const momentCount = momentResult.status === 'fulfilled' ? Number(momentResult.value || 0) : 0
  const nextCount = friendCount + groupCount + momentCount
  const changed = state.friendPendingCount !== friendCount || state.momentInteractionUnreadCount !== momentCount || state.notificationCount !== nextCount
  state.friendPendingCount = friendCount
  state.momentInteractionUnreadCount = momentCount
  state.notificationCount = nextCount
  if (changed) render()
}

function normalizeDesktopPushPayload(payload) {
  const root = payload && typeof payload === 'object' ? payload : {}
  const nested = root.message && typeof root.message === 'object'
    ? root.message
    : (root.payload && typeof root.payload === 'object' ? root.payload : {})
  const value = (...keys) => {
    for (const key of keys) {
      if (nested[key] !== undefined && nested[key] !== null) return nested[key]
      if (root[key] !== undefined && root[key] !== null) return root[key]
    }
    return ''
  }
  return {
    ...root,
    ...nested,
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
  if (stream) return stream.scrollHeight - stream.scrollTop - stream.clientHeight < 32
  return Boolean(state.chatAtLatestByConversation[String(conversationId)])
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
    const index = messages.findIndex((message) => message.id === messageId)
    if (index >= 0) {
      state.messagesByConversation[conversationId] = messages.map((message, itemIndex) => itemIndex === index
        ? { ...message, burnReadAt: message.burnReadAt || new Date().toISOString(), burnExpiresAt: normalized.burnExpiresAt || message.burnExpiresAt }
        : message)
      render()
    }
    return
  }
  if (command === 'BURN_EXPIRED') {
    const conversationId = String(normalized.conversationId || '')
    const messageId = String(normalized.msgId || normalized.id || '')
    if (conversationId && messageId) {
      const messages = state.messagesByConversation[conversationId] || []
      state.messagesByConversation[conversationId] = messages.filter((message) => message.id !== messageId)
      if (String(conversations[state.selectedConversation]?.id) === conversationId) render()
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
      if (String(conversations[state.selectedConversation]?.id) === conversationId) render()
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
    const contact = contacts.find((item) => String(contactUserId(item)) === userId)
    if (contact) {
      contact.online = online
      contact.onlineHidden = Boolean(normalized.onlineHidden)
      contact.status = online ? '在线' : '最近活跃'
    }
    conversations.forEach((conversation) => {
      if (conversation.type === 'personal' && String(conversation.peerUserId || '') === userId) {
        conversation.online = online
      }
    })
    render()
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
  const merged = mergeMessage(conversationId, mapped)
  const activeConversation = conversations[state.selectedConversation]
  const isActiveChat = String(activeConversation?.id || '') === conversationId && state.page === 'messages'
  if (mapped.mentionedMe && !mapped.mine && conversation.type === 'group') {
    if (isActiveChat) addDesktopMentionJump(mapped)
    else conversation.mentionUnread = true
  }
  if (merged) {
    if (isActiveChat && mapped.mentionedMe) render()
    return
  }
  const unread = !isActiveChat || document.hidden || !document.hasFocus() || !isDesktopChatAtLatest(conversationId)
  if (unread) {
    notifyDesktopMessage(conversation, mapped)
    conversation.unread = Number(conversation.unread || 0) + 1
  } else {
    conversation.unread = 0
    void markDesktopConversationRead(conversationId).catch(() => {})
  }
  conversation.preview = desktopMessagePreview(mapped) || conversation.preview
  conversation.time = '刚刚'
  render()
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
  state.authenticated = false
  state.dataSource = 'mock'
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
  stopDesktopReadStatePolling()
  stopDesktopDeviceSessionMonitor()
  desktopCall.hangup()
  stopDesktopWs?.()
  stopDesktopWs = null
  desktopWsToken = ''
  disconnectDesktopWs()
  if (notificationPollTimer !== null) window.clearInterval(notificationPollTimer)
  notificationPollTimer = null
}

function switchDesktopAccount() {
  stopDesktopWsConnection()
  stopDesktopQrLogin()
  state.loginView = 'login'
  state.loginMode = 'password'
  state.loginSecurityCodeRequired = false
  state.loginSecurityCode = ''
  state.loginError = ''
  state.loginNotice = ''
  void logoutDesktop().finally(() => {
    state.authenticated = false
    state.dataSource = 'mock'
    resetDesktopSocialState()
    state.loading = false
    render()
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
  void logoutDesktop().finally(() => {
    desktopNavigationHistory = []
    desktopCurrentNavigation = null
    state.authenticated = false
    state.dataSource = 'mock'
    resetDesktopSocialState()
    state.loginError = ''
    render()
  })
}

function dataSourceLabel() {
  if (state.dataSource === 'remote') return '已连接真实数据'
  if (state.dataSource === 'loading') return '正在同步在线数据'
  if (state.dataSource === 'error') return '在线数据加载失败'
  return '当前使用演示数据'
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
  if (page === 'wallet') void loadWallet()
  if (page === 'moments') void loadMoments()
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
  state.momentMenu = null
  render()
  restoringDesktopNavigation = false
  loadDesktopPageData(state.page)
}

function render() {
  if (desktopModuleDisposed) return
  const previousChatStream = document.querySelector('.chat-stream')
  const previousChatScrollTop = previousChatStream?.scrollTop ?? 0
  const previousChatConversationId = previousChatStream?.dataset.conversationId || ''
  if (previousChatConversationId) state.chatScrollTopByConversation[previousChatConversationId] = previousChatScrollTop
  document.documentElement.dataset.theme = state.theme
  syncDesktopNativeTheme(state.theme)
  if (!state.authenticated) {
    app.innerHTML = renderLogin()
    bindEvents()
    syncDesktopShellBadge()
    return
  }
  syncDesktopNavigationHistory()
  app.innerHTML = `
    <div class="desktop-shell">
      ${renderSidebar()}
      <main class="workspace">
        ${renderTopbar()}
        <div class="workspace-body">${renderPage()}</div>
      </main>
    </div>
    ${state.toast ? `<div class="toast"><span class="toast-dot"></span>${state.toast}</div>` : ''}
  ${state.modal ? renderModal() : ''}
    ${state.momentMenu ? renderMomentMenu() : ''}
    ${state.receiveSuccessVisible ? renderDesktopReceiveSuccess() : ''}
    <div id="desktop-call-overlay-root"></div>`
  bindEvents()
  bindDesktopProtectedMedia()
  if (state.modal === 'location') ensureDesktopLocationPickerMap()
  else if (desktopLocationPickerRuntime.map || desktopLocationPickerRuntime.initPromise) disposeDesktopLocationPickerMap()
  syncDesktopCallOverlay()
  const nextChatStream = document.querySelector('.chat-stream')
  const activeConversationId = conversationScrollKey(conversations[state.selectedConversation])
  if (nextChatStream) {
    const savedScrollTop = Number(state.chatScrollTopByConversation[activeConversationId] || 0)
    const sameConversation = previousChatConversationId === activeConversationId
    if (state.scrollChatToBottom) {
      nextChatStream.scrollTop = Math.max(0, nextChatStream.scrollHeight - nextChatStream.clientHeight)
    } else {
      nextChatStream.scrollTop = sameConversation ? previousChatScrollTop : savedScrollTop
    }
    const atLatest = nextChatStream.scrollHeight - nextChatStream.scrollTop - nextChatStream.clientHeight < 32
    state.chatAtLatestByConversation[activeConversationId] = atLatest
    document.querySelector('[data-jump-latest]')?.classList.toggle('is-visible', !atLatest)
  }
  state.scrollChatToBottom = false
  syncDesktopShellBadge()
}

function renderLogin() {
  if (state.loginView === 'forgot') return renderForgotPassword()
  if (state.loginView === 'register') return renderRegister()
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
        <div class="login-method-tabs"><button type="button" data-action="login-password">密码登录</button><button type="button" class="active">扫码登录</button></div>
        <div class="desktop-qr-login">
          <div class="desktop-qr-frame${state.qrLoginBusy ? ' is-refreshing' : ''}" aria-busy="${state.qrLoginBusy ? 'true' : 'false'}">${state.qrLoginImage ? `<img class="desktop-qr-image${qrImageEntering ? ' is-entering' : ''}" src="${escapeHtml(state.qrLoginImage)}" alt="电脑端登录二维码" />` : `<span class="desktop-qr-placeholder${state.qrLoginBusy ? ' is-loading' : ''}">${state.qrLoginBusy ? '<span class="desktop-qr-loading-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>生成中…</span>' : '二维码暂不可用'}</span>`}</div>
          <strong>${statusText}</strong>
          ${state.qrLoginStatus === 'waiting' && remaining > 0 ? `<span class="desktop-qr-countdown">二维码有效期还剩 ${remaining} 秒</span>` : ''}
          ${state.qrLoginError ? `<div class="login-error">${escapeHtml(state.qrLoginError)}</div>` : ''}
          <button type="button" class="btn btn-primary login-submit${state.qrLoginBusy ? ' is-refreshing' : ''}" data-action="refresh-qr-login" ${state.qrLoginBusy ? 'disabled' : ''}>${state.qrLoginBusy ? '请稍候…' : '刷新二维码'} ${icon('refresh', state.qrLoginBusy ? 'is-spinning' : '')}</button>
        </div>
        <div class="login-footer"><span>${icon('shield')} 二维码 2 分钟内有效，过期后需手动刷新</span><button data-action="login-password">返回密码登录</button></div>
      </section>
      <div class="login-decoration"><div class="hero-orb hero-orb-one"></div><div class="hero-orb hero-orb-two"></div><div class="hero-pattern"></div><div><span class="hero-label">ONE SPACE, EVERY CONNECTION</span><h2>让每一次<br /><em>回应自然发生</em></h2><p>把对话、联系人和兴趣，收进一个安静而有秩序的桌面空间。</p></div></div>
    </main>`
  }
  return `<main class="desktop-login-shell">
    <section class="login-card">
      <div class="brand-lockup login-brand"><div class="brand-mark"><span></span><span></span><span></span></div><div class="brand-copy"><strong>Pulse</strong><small>同步每一刻</small></div></div>
      <div class="login-heading"><span class="eyebrow">PULSE DESKTOP</span><h1>在桌面上，继续你的连接</h1><p>登录 Pulse，消息、联系人和工作空间会在你的设备间保持同步。</p></div>
      <div class="login-method-tabs"><button type="button" class="active">密码登录</button><button type="button" data-action="login-qr">扫码登录</button></div>
       <form class="login-form" data-login-form novalidate>
        <label><span>手机号</span><input name="phone" type="tel" autocomplete="username" value="${escapeHtml(state.loginPhone)}" placeholder="请输入手机号" /></label>
        <label><span>密码</span><input name="password" type="password" autocomplete="current-password" value="${escapeHtml(state.loginPassword)}" placeholder="请输入密码" /></label>
        ${state.loginSecurityCodeRequired ? '<label><span>安全码</span><input name="securityCode" type="text" inputmode="text" autocomplete="one-time-code" maxlength="6" value="' + escapeHtml(state.loginSecurityCode) + '" placeholder="请输入 6 位安全码" /></label>' : ''}
        <div class="login-options"><label class="remember-option"><input name="rememberLogin" type="checkbox" ${state.rememberLogin ? 'checked' : ''} /><span>记住密码</span></label><button type="button" class="login-link" data-action="forgot-password">忘记密码？</button></div>
        ${state.loginError ? `<div class="login-error">${escapeHtml(state.loginError)}</div>` : ''}
        ${state.loginNotice ? `<div class="login-notice">${escapeHtml(state.loginNotice)}</div>` : ''}
        <button class="btn btn-primary login-submit" type="submit" ${state.loginBusy ? 'disabled' : ''}>${state.loginBusy ? '登录中…' : '登录 Pulse'} ${icon('arrow')}</button>
      </form>
      <div class="login-footer"><span>${icon('shield')} 登录成功后保存在本机</span><div class="login-footer-actions"><button data-action="register">注册新账号</button><button data-action="login-demo">使用演示数据</button></div></div>
    </section>
    <div class="login-decoration"><div class="hero-orb hero-orb-one"></div><div class="hero-orb hero-orb-two"></div><div class="hero-pattern"></div><div><span class="hero-label">ONE SPACE, EVERY CONNECTION</span><h2>让每一次<br /><em>回应自然发生</em></h2><p>把对话、联系人和兴趣，收进一个安静而有秩序的桌面空间。</p></div></div>
  </main>`
}

function renderRegister() {
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

function renderForgotPassword() {
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
  // Start realtime presence/message delivery before HTTP hydration. A single
  // slow or failed data request must not leave an otherwise valid login absent
  // from the server's online presence set.
  startDesktopWs()
  const hadRemoteData = state.dataSource === 'remote'
  state.loading = true
  state.dataSource = 'loading'
  render()
  try {
    const [remoteConversations, remoteContacts, profile, archivedConversations] = await Promise.all([
      fetchDesktopConversations('all'),
      fetchDesktopContacts(),
      fetchDesktopProfile(),
      fetchDesktopConversations('archive').catch(() => []),
    ])
    const conversationMap = new Map([...remoteConversations, ...archivedConversations].map((item) => [String(item.id), item]))
    if (conversationMap.size) conversations = [...conversationMap.values()].map(mapRemoteConversation)
    if (remoteContacts.list?.length) {
      contacts = remoteContacts.list
        .filter((item) => !isDesktopFileTransferAssistant(item))
        .map(mapRemoteContact)
    }
    if (profile) {
      state.profile = { ...state.profile, ...profile, userId: String(profile.userId) }
      saveDesktopSession(getDesktopToken() || '', state.profile)
    }
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
    state.dataSource = 'error'
    if (!hadRemoteData) {
      conversations = []
      contacts = []
    }
    state.loginError = error instanceof Error ? error.message : '暂时无法加载在线数据'
  } finally {
    state.loading = false
    render()
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
  render()
  try {
    if (state.dataSource === 'remote') {
      await loadRemoteData()
      if (state.dataSource !== 'remote') throw new Error(state.loginError || '刷新失败，请稍后重试')
      await refreshDesktopCurrentPageData()
      showToast('页面数据已刷新')
    } else {
      showToast('演示数据不需要同步')
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : '刷新失败，请稍后重试')
  } finally {
    state.globalRefreshing = false
    render()
  }
}

function momentIsMine(item) {
  return item?.mine === true || String(item?.userId || '') === String(state.profile.userId || '')
}

function resetDesktopSocialState() {
  state.sharedContentCountsByConversation = {}
  state.sharedContentCountsLoadingConversationId = ''
  state.moments = []
  state.momentsLoaded = false
  state.momentsLoading = false
  state.momentsError = ''
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

async function loadMoments(force = false) {
  if (!state.authenticated) return
  if (state.dataSource === 'mock') {
    state.moments = mockMoments
    state.momentsLoaded = true
    return
  }
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

async function publishMoment() {
  const content = String(state.momentDraftText || '').trim()
  if (!content && !state.momentFiles.length) return showToast('写点内容或添加一张图片吧')
  if (Number(state.momentVisibility) === 2 && state.momentVisibleUserIds.size === 0) return showToast('请选择可见好友')
  if (state.momentPublishBusy) return
  state.momentPublishBusy = true
  render()
  try {
    if (state.dataSource === 'remote') {
      const uploaded = []
      for (const file of state.momentFiles) uploaded.push(await uploadDesktopFile(file))
      const item = await publishDesktopMoment({
        content,
        images: uploaded.map((file) => file.url),
        originalImages: uploaded.map((file) => file.originalUrl || file.url),
        mediaTypes: uploaded.map((file) => file.contentType.startsWith('video/') ? 'video' : 'image'),
        visibility: Number(state.momentVisibility || 0),
        mentionUserIds: [...state.momentMentionUserIds],
        visibleUserIds: [...state.momentVisibleUserIds],
      })
      state.moments = [item, ...state.moments]
    } else {
      const nickname = state.profile.nickname || '我'
      state.moments = [{ id: `demo-moment-${Date.now()}`, userId: String(state.profile.userId || '1001001'), mine: true, nickname, initials: nickname.slice(0, 1), tone: 'blue', avatarUrl: state.profile.avatarUrl || '', content, images: [], mediaTypes: [], visibility: Number(state.momentVisibility || 0), createdAt: new Date().toISOString(), likeCount: 0, commentCount: 0, likedByMe: false, likeNicknames: [], likeUserIds: [], comments: [] }, ...state.moments]
    }
    state.momentDraftText = ''
    state.momentVisibility = 0
    state.momentVisibleUserIds = new Set()
    state.momentMentionUserIds = new Set()
    state.momentMentionQuery = ''
    state.momentMentionOpen = false
    state.momentMentionTokenStart = -1
    state.momentFiles = []
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
  try {
    state.moments[index] = state.dataSource === 'remote'
      ? await toggleDesktopMomentLike(String(id))
      : { ...current, likedByMe: !current.likedByMe, likeCount: Math.max(0, Number(current.likeCount || 0) + (current.likedByMe ? -1 : 1)) }
    render()
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
  try {
    state.moments[index] = state.dataSource === 'remote'
      ? await toggleDesktopMomentFavorite(String(id))
      : { ...current, favoritedByMe: !wasFavorited }
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
  try {
    const comment = state.dataSource === 'remote'
      ? await addDesktopMomentComment(String(id), content)
      : { id: `demo-comment-${Date.now()}`, userId: String(state.profile.userId || ''), nickname: state.profile.nickname || '我', content, createdAt: new Date().toISOString() }
    item.comments = [...(item.comments || []), comment]
    item.commentCount = Number(item.commentCount || 0) + 1
    state.momentCommentText = ''
    render()
  } catch (error) {
    showToast(error instanceof Error ? error.message : '评论失败')
  }
}

async function loadPrivacySettings(force = false) {
  if (!state.authenticated) return
  if (state.dataSource === 'mock') {
    state.privacyLoaded = true
    return
  }
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
    let cache = 0
    if ('caches' in window) {
      for (const name of await caches.keys()) {
        const cacheStore = await caches.open(name)
        cache += (await cacheStore.keys()).length
      }
    }
    const estimate = await navigator.storage?.estimate()
    state.storageUsage = {
      local,
      cache,
      quota: Number(estimate?.quota || 0),
      total: local + cache,
    }
    state.storageUpdatedAt = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  } catch (error) {
    state.storageError = error instanceof Error ? error.message : '存储空间读取失败'
  } finally {
    state.storageLoading = false
    render()
  }
}

async function clearDesktopStorage() {
  if (state.storageLoading) return
  state.storageLoading = true
  render()
  try {
    if ('caches' in window) await Promise.all((await caches.keys()).map((name) => caches.delete(name)))
    const protectedKeys = new Set(['pulse_token', 'pulse_user_profile', 'pulse_remember_login', 'pulse_desktop_remember_login', 'pulse_device_id', DESKTOP_THEME_STORAGE_KEY])
    const clearStorage = (storage) => {
      const removable = []
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index)
        if (key && !protectedKeys.has(key)) removable.push(key)
      }
      removable.forEach((key) => storage.removeItem(key))
    }
    clearStorage(localStorage)
    clearStorage(sessionStorage)
    showToast('可清理缓存已清除，登录状态与个人设置已保留')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '缓存清理失败')
  } finally {
    state.storageLoading = false
    await loadDesktopStorage()
  }
}

async function loadDesktopHelp() {
  if (state.helpLoading) return
  state.helpLoading = true
  state.helpError = ''
  render()
  try {
    state.helpQuestions = state.dataSource === 'remote'
      ? await fetchDesktopHelpQuestions()
      : [
          { id: 'demo-1', question: '如何修改个人资料？', answer: '打开个人中心，点击编辑资料即可修改昵称和个性签名。', category: '账号' },
          { id: 'demo-2', question: '如何管理登录设备？', answer: '在账号与安全页面可以查看并退出其他登录设备。', category: '安全' },
          { id: 'demo-3', question: '清理缓存会删除聊天记录吗？', answer: '不会。清理缓存只会删除本机临时数据，聊天记录保存在服务器。', category: '使用' },
        ]
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

function deviceActivityLabel(device) {
  const activity = formatRemoteTime(device?.lastActiveAt)
  return activity ? `最近活跃 · ${activity}` : '登录后活跃'
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
  if (!state.deviceSessions.length) {
    return '<div class="device-empty">暂无可管理的登录设备，请重新登录后再试。</div>'
  }
  return state.deviceSessions.map((device) => {
    const current = Boolean(device.current)
    const menuOpen = state.deviceMenuId === device.deviceId
    const title = device.name || '未知设备'
    return `<div class="device-row ${current ? 'is-current' : ''}">
      <span class="device-icon">${icon(deviceIconName(device))}</span>
      <span class="device-copy"><strong>${escapeHtml(title)}${current ? ' · 本设备' : ''}</strong><small>${escapeHtml(deviceActivityLabel(device))}${device.trusted ? ' · 已验证' : ''}</small></span>
      ${current ? '<i class="device-current">当前设备</i>' : ''}
      <button type="button" class="device-row-action" data-device-menu="${escapeHtml(device.deviceId)}" aria-label="设备操作" aria-expanded="${menuOpen}">${icon('more')}</button>
      ${menuOpen ? `<div class="device-actions-menu"><button type="button" data-device-revoke="${escapeHtml(device.deviceId)}" ${current ? 'disabled' : ''}>${icon('close')}${current ? '当前设备' : '退出此设备'}</button></div>` : ''}
    </div>`
  }).join('')
}

function requestRevokeDevice(deviceId) {
  const device = state.deviceSessions.find((item) => item.deviceId === deviceId)
  if (!device || device.current) {
    showToast('当前设备请使用退出登录')
    return
  }
  state.deviceMenuId = ''
  state.confirmDialog = { type: 'revoke-device', deviceId, deviceName: device.name || '该设备' }
  state.modal = 'confirm'
  render()
}

async function revokeDeviceSession(deviceId) {
  if (!deviceId || state.deviceLoading) return
  state.deviceLoading = true
  render()
  try {
    await revokeDesktopDevice(deviceId)
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
  const shouldOpenAtLatest = state.scrollChatToBottom || Number(selected.unread || 0) > 0
  state.loadingMessages = true
  state.loadingMessagesConversationId = String(selected.id)
  try {
    const remoteMessages = await fetchDesktopMessages(selected.id)
    state.messagesByConversation[selected.id] = remoteMessages.map(mapRemoteMessage)
    void loadDesktopSharedContentCounts(selected, true)
    state.mentionJumpIds = selected.mentionUnread && selected.type === 'group'
      ? state.messagesByConversation[selected.id]
        .filter((message) => message.mentionedMe && !message.mine && message.id)
        .map((message) => String(message.id))
      : []
    selected.mentionUnread = false
    state.burnClock = Date.now()
    removeExpiredDesktopMessages()
    void loadDesktopConversationSettings(selected).then(() => {
      if (String(conversations[state.selectedConversation]?.id) === String(selected.id)) render()
    })
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
        applyReadReceipt({ ...readReceipt, conversationId: selected.id })
      }
    } catch {
      // 即使已读回执网络失败，当前会话也应立即清除本地未读角标。
    }
    selected.unread = 0
    if (selected.type === 'group') void loadDesktopGroupDetail(selected)
  } catch {
    // Keep the visual prototype messages available while the server is offline.
  } finally {
    if (state.loadingMessagesConversationId === String(selected.id)) {
      state.loadingMessages = false
      state.loadingMessagesConversationId = ''
    }
    if (shouldOpenAtLatest && String(conversations[state.selectedConversation]?.id) === String(selected.id)) state.scrollChatToBottom = true
    render()
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
    if (state.dataSource === 'remote') {
      const [summary, transactions] = await Promise.all([fetchDesktopWallet(), fetchDesktopWalletTransactions(params)])
      state.walletSummary = summary
      state.walletTransactions = transactions
    } else {
      state.walletSummary = { balance: 256800, hasPaymentPassword: true }
      state.walletTransactions = mockWalletTransactions.filter((item) => {
        const typeMatch = !state.walletType || item.trade_type === state.walletType
        const fromMatch = !state.walletFrom || item.created_at.slice(0, 10) >= state.walletFrom
        const toMatch = !state.walletTo || item.created_at.slice(0, 10) <= state.walletTo
        return typeMatch && fromMatch && toMatch
      })
    }
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
    ? receives.map((item) => `<div class="desktop-redpacket-receiver"><span>${escapeHtml(String(item.nickname || item.user_name || '用户'))}</span><strong>${walletYuan(item.amount)}</strong></div>`).join('')
    : '<div class="desktop-modal-hint">还没有人领取</div>'
  const canReceive = desktopRedPacketCanReceive(packet)
  const action = canReceive
    ? `<button class="btn btn-primary" type="button" data-red-packet-receive ${state.redPacketReceiving ? 'disabled' : ''}>${state.redPacketReceiving ? '领取中…' : '领取红包'}</button>`
    : `<span class="desktop-redpacket-status">${receivedByMe ? `已领取${mine ? ` · ${walletYuan(mine)}` : ''}` : packet.status === 'FINISHED' ? '红包已领完' : packet.status === 'EXPIRED' ? '红包已过期' : '当前不可领取'}</span>`
  const body = `<div class="desktop-redpacket-detail"><div class="desktop-redpacket-cover"><strong>${escapeHtml(String(packet.sender_name || '好友'))}的${escapeHtml(packetTypeLabels[packetType] || '红包')}</strong><p>${escapeHtml(String(packet.greeting || '恭喜发财，大吉大利'))}</p><b>${walletYuan(totalAmount)}</b><small>已领取 ${walletYuan(receivedAmount)}</small></div><div class="desktop-redpacket-summary"><span>${escapeHtml(packetTypeLabels[packetType] || '红包')}</span><span>${Number(packet.received_count || packet.receivedCount || 0)}/${Number(packet.total_count || packet.totalCount || 0)} 个</span></div><div class="desktop-redpacket-receivers">${receiverRows}</div><div class="desktop-modal-actions">${action}</div></div>`
  return modalFrame('红包详情', '查看红包并领取', body)
}

async function openDesktopRedPacket(packetNo) {
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
    const received = desktopRedPacketReceivedByMe(state.redPacketDetail)
    showDesktopReceiveSuccess('redpacket', received && typeof received === 'object' ? walletYuan(received.amount) : '')
    void loadSelectedMessages()
  } catch (error) {
    showToast(error instanceof Error ? error.message : '红包领取失败')
  } finally {
    state.redPacketReceiving = false
    render()
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
  const received = String(transfer.status || '') !== 'PENDING'
  const senderName = String(transfer.sender_name || (senderIsMe ? transfer.receiver_name || '对方' : '好友'))
  const title = senderIsMe ? `我向${senderName}转账` : `${senderName}向你转账`
  const canReceive = desktopTransferCanReceive(transfer)
  const action = canReceive
    ? `<button class="btn btn-primary" type="button" data-transfer-receive ${state.transferReceiving ? 'disabled' : ''}>${state.transferReceiving ? '处理中…' : '收款'}</button>`
    : `<span class="desktop-transfer-status">${received ? '已收款，款项已存入零钱' : '待收款'}</span>`
  const body = `<div class="desktop-transfer-detail"><div class="desktop-transfer-cover"><strong>${escapeHtml(title)}</strong><b>${walletYuan(transfer.amount)}</b><p>${escapeHtml(String(transfer.remark || '转账'))}</p></div>${received ? '<div class="desktop-transfer-received">✓ 已收款，款项已存入零钱</div>' : ''}<div class="desktop-transfer-meta"><span>转账状态</span><strong>${received ? '已收款' : '待收款'}</strong></div><div class="desktop-modal-actions">${action}</div></div>`
  return modalFrame('转账详情', '查看转账并收款', body)
}

async function openDesktopTransfer(transferNo) {
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
    showDesktopReceiveSuccess('transfer', walletYuan(state.transferDetail.amount))
    void loadSelectedMessages()
  } catch (error) {
    showToast(error instanceof Error ? error.message : '转账收款失败')
  } finally {
    state.transferReceiving = false
    render()
  }
}

function showDesktopReceiveSuccess(kind, amount = '') {
  if (receiveSuccessTimer) window.clearTimeout(receiveSuccessTimer)
  state.receiveSuccessKind = kind === 'transfer' ? 'transfer' : 'redpacket'
  state.receiveSuccessAmount = String(amount || '')
  state.receiveSuccessVisible = false
  render()
  window.requestAnimationFrame(() => {
    state.receiveSuccessVisible = true
    render()
    receiveSuccessTimer = window.setTimeout(() => {
      state.receiveSuccessVisible = false
      receiveSuccessTimer = null
      render()
    }, 1850)
  })
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
    state.messagesByConversation[selected.id] = result.map(mapRemoteMessage)
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
    showToast('演示模式暂不支持转发到服务器')
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
  clearDesktopMessageSelection()
  showToast(mode === 'both' ? '已双向删除消息' : '已删除消息')
}

async function handleMessageAction(action, messageId, confirmed = false) {
  const selected = conversations[state.selectedConversation]
  if (!selected?.id) return
  const ids = normalizeDesktopMessageIds(messageId)
  const messages = currentMessages(selected).filter((item) => ids.includes(String(item.id)))
  const message = messages[0]
  state.messageMenu = null

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
  if ((action === 'copy' || action === 'favorite') && desktopIsBurnMessage(message)) {
    showToast('阅后即焚消息不能复制或收藏')
    return
  }
  if (action === 'preview') {
    render()
    openDesktopFilePreview(message)
    return
  }
  if (action === 'save-as') {
    render()
    void saveDesktopMessageMediaAs(message)
    return
  }
  if (action === 'copy') {
    try {
      await navigator.clipboard.writeText(message.content)
      showToast('消息已复制')
    } catch {
      showToast('复制失败，请手动选择文字')
    }
    return
  }
  if (state.dataSource !== 'remote') {
    if (action === 'recall') {
      mergeMessage(selected.id, { ...message, recalled: true })
      showToast('消息已撤回')
    } else if (action === 'favorite') {
      showToast('演示模式暂不保存收藏')
    }
    render()
    return
  }
  try {
    if (action === 'recall') {
      const recalled = await recallDesktopMessage(selected.id, message.id)
      mergeMessage(selected.id, mapRemoteMessage({ ...recalled, id: message.id }))
      showToast('消息已撤回')
    } else if (action === 'favorite') {
      await addDesktopFavorite(selected.id, message.id)
      state.favoritesLoaded = false
      showToast('消息已收藏')
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
    showToast('演示模式暂不支持转发收藏到服务器')
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
    if (action === 'archive') {
      const archived = !isArchivedConversation(conversation)
      if (state.dataSource === 'remote' && conversationId) await setDesktopConversationArchived(conversationId, archived)
      conversation.archived = archived
      if (archived && wasSelected) {
        const nextIndex = conversations.findIndex((item, itemIndex) => itemIndex !== index && !isArchivedConversation(item))
        if (nextIndex >= 0) state.selectedConversation = nextIndex
      }
      showToast(archived ? '已归档' : '已取消归档')
    } else if (action === 'remove') {
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
  if (state.sendingMessage) return
  const textarea = document.querySelector('[data-message-composer]')
  const selected = conversations[state.selectedConversation]
  const content = textarea?.value?.trim() || ''
  if (!textarea || !content || !selected?.id) return

  if (state.dataSource !== 'remote') {
    textarea.value = ''
     showToast('演示消息已发送')
    return
  }

  const clientMsgId = `desktop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  state.sendingMessage = true
  textarea.disabled = true
  try {
    const message = await sendDesktopTextMessage({
      conversationId: selected.id,
      toUserId: selected.peerUserId,
      content,
      clientMsgId,
    })
    mergeMessage(selected.id, mapRemoteMessage({ ...message, clientMsgId }))
  selected.preview = desktopPreviewText(content, 0)
    selected.time = 'now'
    textarea.value = ''
    state.scrollChatToBottom = true
     showToast('消息已发送')
  } catch (error) {
    if (!getDesktopToken()) {
      state.authenticated = false
      state.dataSource = 'mock'
      stopDesktopWsConnection()
    }
    showToast(error instanceof Error ? error.message : '消息发送失败')
  } finally {
    state.sendingMessage = false
    render()
  }
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
  const parsed = parseDesktopJson(content)
  const payload = parsed?.file && typeof parsed.file === 'object' ? parsed.file : parsed
  if (payload?.url) return { ...payload, url: String(payload.url) }
  if (parsed?.url) return parsed
  if (/^(https?:\/\/|\/|data:|blob:)/i.test(String(content))) return { url: String(content), name: '文件' }
  return null
}

function desktopReplyMessageType(message, replyTarget = null) {
  if (message?.replyToRecalled) return -1
  const explicitType = Number(message?.replyToMsgType || 0)
  if (explicitType > 0) return explicitType
  const targetType = Number(replyTarget?.msgType || 0)
  if (targetType > 0) return targetType
  const content = desktopContentString(message?.replyToContent)
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
  const content = desktopContentString(message?.replyToContent)
  const type = desktopReplyMessageType(message, replyTarget)
  if (!content) return '原消息'
  if (type === 0) {
    const payload = parseDesktopJson(content)
    if (payload?.text || payload?.message) return String(payload.text || payload.message)
    if (payload) return '消息'
    return content
  }
  return desktopMessagePreview({ content, msgType: type })
}

function desktopReplyMedia(message, replyTarget = null) {
  if (message?.replyToRecalled) return null
  const type = desktopReplyMessageType(message, replyTarget)
  if (type !== 1 && type !== 2) return null
  const file = parseDesktopFile(message?.replyToContent)
  if (!file?.url) return null
  const url = resolveDesktopFileUrl(file.url)
  const contentType = String(file.contentType || '').toLowerCase()
  const isVideo = type === 2 && (contentType.startsWith('video/') || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url))
  const isImage = type === 1 || contentType.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif)(\?|$)/i.test(url)
  return { url, isImage, isVideo, name: file.name || '' }
}

function formatDesktopFileSize(value) {
  const size = Number(value || 0)
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function desktopFileTransferMeta(file) {
  const name = String(file?.name || '')
  const type = String(file?.type || '')
  const isImage = type.startsWith('image/') || /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(name)
  const isVideo = type.startsWith('video/') || /\.(mp4|mov|webm|m4v|3gp)$/i.test(name)
  return {
    isImage,
    isVideo,
    msgType: isImage ? 1 : 2,
    max: isVideo ? 80 * 1024 * 1024 : 20 * 1024 * 1024,
    label: isVideo ? '视频' : isImage ? '图片' : '文件',
    icon: isVideo ? 'video' : isImage ? 'image' : 'folder',
  }
}

function clearPendingDesktopFile() {
  state.pendingDroppedFile = null
  state.pendingDroppedFileConversationId = ''
  state.fileDragActive = false
}

function setPendingDesktopFile(file) {
  const selected = conversations[state.selectedConversation]
  if (!file || !selected?.id) return
  const meta = desktopFileTransferMeta(file)
  if (Number(file.size || 0) > meta.max) {
    showToast(`${meta.label}不能超过 ${meta.isVideo ? '80MB' : '20MB'}`)
    return
  }
  state.pendingDroppedFile = file
  state.pendingDroppedFileConversationId = String(selected.id)
  state.fileDragActive = false
  state.showPlusMenu = false
  state.showEmojiPanel = false
  render()
}

function renderDesktopPendingFile(selected) {
  const file = state.pendingDroppedFile
  if (!file || String(state.pendingDroppedFileConversationId) !== String(selected?.id || '')) return ''
  const meta = desktopFileTransferMeta(file)
  return `<div class="desktop-pending-file" data-pending-dropped-file>
    <span class="desktop-pending-file-icon">${icon(meta.icon)}</span>
    <span class="desktop-pending-file-copy"><strong>${escapeHtml(file.name || meta.label)}</strong><small>${escapeHtml(meta.label)} · ${escapeHtml(formatDesktopFileSize(file.size))}</small></span>
    <span class="desktop-pending-file-actions"><button type="button" class="desktop-pending-file-cancel" data-action="cancel-dropped-file">取消</button><button type="button" class="desktop-pending-file-send" data-action="send-dropped-file">发送</button></span>
  </div>`
}

function desktopMessagePreview(message) {
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
  if (type === 9) return desktopSystemMessageText(message?.content)
  return desktopPreviewText(message?.content, 0)
}

function desktopPreviewText(content, msgType = 0) {
  const raw = String(content || '').trim()
  if (!raw) return ''
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

function desktopFavoriteTypeLabel(item) {
  const labels = { 1: '图片', 2: '文件', 3: '语音', 5: '名片', 6: '位置', 7: '红包', 8: '转账', 10: '朋友圈动态' }
  return labels[Number(item?.msgType || 0)] || '消息'
}

function desktopFavoriteIcon(item) {
  const icons = { 1: 'image', 2: 'folder', 3: 'mic', 5: 'person', 6: 'location', 7: 'gift', 8: 'money', 10: 'discover' }
  return icons[Number(item?.msgType || 0)] || 'chat'
}

function renderDesktopMessageContent(message) {
  if (message.recalled) return '<span class="message-recalled-copy">这条消息已被撤回</span>'
  const content = String(message.content || '')
  const type = Number(message.msgType || 0)
  if (content.startsWith('__PULSE_LIVE_LOCATION__')) {
    return `<div class="typed-message live-location-message"><span class="typed-message-icon">${icon('share')}</span><span><strong>实时位置共享</strong><small>点击移动端查看共享位置</small></span></div>`
  }
  if (desktopIsBurnMediaLocked(message)) {
    const label = type === 1 ? '点击查看图片' : '点击查看视频'
    return `<button type="button" class="typed-burn-locked" data-burn-view="${escapeHtml(message.id)}"><span class="typed-message-icon">${icon('lock')}</span><span><strong>${label}</strong><small>查看后开始倒计时</small></span></button>`
  }
  if (type === 1) {
    const file = parseDesktopFile(content)
    if (!file?.url) return escapeHtml(desktopMessagePreview(message))
    const fileUrl = resolveDesktopFileUrl(file.url)
    const placeholder = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='
    return `<a class="typed-image-link" data-protected-media-link href="${escapeHtml(fileUrl)}" target="_blank" rel="noreferrer"><img class="typed-image" src="${placeholder}" data-protected-media-src="${escapeHtml(fileUrl)}" alt="${escapeHtml(file.name || '图片')}" loading="lazy" /></a>`
  }
  if (type === 2) {
    const file = parseDesktopFile(content)
    if (!file?.url) return escapeHtml(desktopMessagePreview(message))
    const fileUrl = resolveDesktopFileUrl(file.url)
    const isVideo = String(file.contentType || '').startsWith('video/') || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(fileUrl)
    return isVideo
      ? `<video class="typed-video" controls preload="metadata" src="${escapeHtml(fileUrl)}"></video><a class="typed-file-name" href="${escapeHtml(fileUrl)}" target="_blank" rel="noreferrer">${escapeHtml(file.name || '视频')}</a>`
      : `<button type="button" class="typed-file" data-file-preview="${escapeHtml(message.id)}" title="点击预览文件"><span class="typed-message-icon">${icon('folder')}</span><span><strong>${escapeHtml(file.name || '文件')}</strong><small>${file.size ? formatDesktopFileSize(file.size) : '点击预览'}</small></span></button>`
  }
  if (type === 3) {
    const file = parseDesktopFile(content)
    if (!file?.url) return escapeHtml(desktopMessagePreview(message))
    const fileUrl = resolveDesktopFileUrl(file.url)
      return `<div class="typed-audio"><span class="typed-message-icon">${icon('mic')}</span><audio controls preload="none" src="${escapeHtml(fileUrl)}"></audio></div>`
  }
  if (type === 4) {
    const card = parseDesktopJson(content)
    const title = String(card?.title || card?.sourceTitle || '聊天记录')
    const count = Number(card?.count || (Array.isArray(card?.items) ? card.items.length : 0))
    return `<div class="typed-card"><span class="typed-message-icon">${icon('chat')}</span><span><strong>${escapeHtml(title)}</strong><small>${count > 0 ? `${count} 条消息` : '聊天记录'}</small></span></div>`
  }
  if (type === 5) {
    const card = parseDesktopJson(content) || {}
    return `<div class="typed-card"><span class="typed-card-avatar">${escapeHtml(String(card.nickname || '?').slice(0, 1))}</span><span><strong>${escapeHtml(card.nickname || '名片')}</strong><small>${card.cardType === 'group' ? '群名片' : '个人名片'}</small></span></div>`
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

function desktopMessageMediaDownloadInfo(message) {
  if (!message || message.recalled || desktopIsBurnMessage(message)) return null
  const type = Number(message.msgType || 0)
  if (type !== 1 && type !== 2) return null

  const file = parseDesktopFile(message.content)
  if (!file?.url) return null
  const fileUrl = resolveDesktopFileUrl(file.url)
  if (!fileUrl) return null

  const contentType = String(file.contentType || '').toLowerCase()
  const fileName = String(file.name || '').trim()
  const urlName = desktopFileNameFromUrl(file.url)
  const isVideo = contentType.startsWith('video/') || /\.(mp4|webm|mov|m4v|3gp)(\?|$)/i.test(fileUrl)

  let filename = fileName && fileName !== '文件' ? fileName : urlName
  if (!filename || filename === '文件') filename = type === 1 ? `pulse_image_${Date.now()}` : `pulse_video_${Date.now()}`
  if (!/\.[a-z0-9]{2,8}$/i.test(filename)) {
    const subtype = contentType.split('/')[1]?.split(';')[0] || ''
    if (subtype && subtype !== 'octet-stream') filename += `.${subtype}`
  }

  return { url: fileUrl, filename }
}

async function saveDesktopMessageMediaAs(message) {
  const media = desktopMessageMediaDownloadInfo(message)
  if (!media) {
    showToast('该消息暂不支持另存为')
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

async function sendDesktopTypedMessage(content, msgType = 0, preview = '', mentionPayload = { mentionUserIds: [], atAll: false }) {
  const selected = conversations[state.selectedConversation]
  if (!selected?.id || state.dataSource !== 'remote') {
    showToast(state.dataSource === 'mock' ? '演示模式不支持发送到服务器' : '在线数据未加载，暂不能发送')
    return false
  }
  if (!desktopGroupCanSend(selected)) {
    showToast(desktopGroupMuteReason(selected))
    return false
  }
  if (state.sendingMessage) return false
  const clientMsgId = `desktop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const replyTarget = msgType === 0 ? state.replyTarget : null
  const replyToMsgId = String(replyTarget?.id || '')
  state.sendingMessage = true
  try {
    const message = await sendDesktopTextMessage({
      conversationId: selected.id,
      toUserId: selected.peerUserId,
      content,
      clientMsgId,
      msgType,
      replyToMsgId: replyToMsgId || undefined,
      mentionUserIds: msgType === 0 ? mentionPayload.mentionUserIds : [],
      atAll: msgType === 0 ? mentionPayload.atAll : false,
    })
    mergeMessage(selected.id, mapRemoteMessage({
      ...message,
      clientMsgId,
      msgType,
      replyToMsgId: message.replyToMsgId || replyToMsgId,
      replyToContent: message.replyToContent || replyTarget?.content || '',
      replyToMsgType: message.replyToMsgType || replyTarget?.msgType || 0,
      replyToNickname: message.replyToNickname || replyTarget?.fromNickname || '',
      replyToRecalled: message.replyToRecalled || replyTarget?.recalled || false,
    }))
    if (replyToMsgId) state.replyTarget = null
    selected.preview = desktopPreviewText(preview || content, msgType)
    selected.time = '刚刚'
    state.scrollChatToBottom = true
    return true
  } catch (error) {
    if (!getDesktopToken()) {
      state.authenticated = false
      state.dataSource = 'mock'
      stopDesktopWsConnection()
    }
    showToast(error instanceof Error ? error.message : '消息发送失败')
    return false
  } finally {
    state.sendingMessage = false
    render()
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
  if (!desktopGroupCanSend(selected)) {
    showToast(desktopGroupMuteReason(selected))
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
  // Text and attachments are separate message types on the server. Keep
  // both in the same composer action so clicking Send or pressing Enter
  // cannot drop a selected attachment.
  let textSent = true
  if (content) {
    textSent = await sendDesktopTypedMessage(content, 0, content, mentionPayload)
  }
  if (pendingFile && textSent) {
    clearPendingDesktopFile()
    const fileSent = await sendDesktopFile(pendingFile)
    if (!fileSent) setPendingDesktopFile(pendingFile)
  }
}

async function sendDesktopFile(file) {
  if (!file) return false
  const meta = desktopFileTransferMeta(file)
  let fileConfig = null
  try {
    fileConfig = await fetchDesktopFileConfig()
  } catch {
    // 配置读取失败时退回客户端原有上限
  }
  const configuredMaxBytes = fileConfig
    ? Math.max(1, Number(fileConfig.maxSizeMb || 0)) * 1024 * 1024
    : 0
  const maxBytes = configuredMaxBytes > 0
    ? Math.min(configuredMaxBytes, meta.max)
    : meta.max
  if (file.size > maxBytes) {
    showToast(`${meta.label}不能超过 ${Math.round(maxBytes / 1024 / 1024)}MB`)
    return false
  }
  if (fileConfig && Array.isArray(fileConfig.allowedExtensions) && fileConfig.allowedExtensions.length) {
    const allowed = fileConfig.allowedExtensions.map((item) => String(item).toLowerCase().replace(/^\./, ''))
    const ext = desktopFileExtension(file.name || '', file.type || '')
    const subtype = String(file.type || '').split('/')[1]?.split(';')[0]?.trim().toLowerCase()
    const ok = Boolean(
      (ext && allowed.includes(ext)) ||
      (subtype && allowed.includes(subtype === 'jpeg' ? 'jpg' : subtype)),
    )
    if (!ok) {
      showToast(`仅支持发送 ${allowed.join('、')} 类型的文件`)
      return false
    }
  }
  const msgType = meta.msgType
  state.uploadingFile = true
  render()
  try {
    const uploaded = await uploadDesktopFile(file)
    const payload = JSON.stringify({
      url: uploaded.url,
      originalUrl: uploaded.originalUrl,
      thumbUrl: uploaded.thumbUrl,
      name: uploaded.name || file.name,
      size: uploaded.size,
      originalSize: uploaded.originalSize,
      contentType: uploaded.contentType || file.type,
    })
    const sent = await sendDesktopTypedMessage(payload, msgType, msgType === 1 ? '[图片]' : `[文件] ${file.name}`)
    if (state.dataSource === 'remote') {
      state.fileLoaded = false
      if (state.page === 'files') void loadDesktopFiles(true)
    }
    return sent
  } catch (error) {
    showToast(error instanceof Error ? error.message : '文件发送失败')
    return false
  } finally {
    state.uploadingFile = false
    render()
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
  const results = document.querySelector('[data-location-results]')
  if (results) results.innerHTML = renderDesktopLocationResults()
  const nearby = document.querySelector('[data-location-nearby]')
  if (nearby) nearby.innerHTML = renderDesktopLocationNearby()
  const selected = document.querySelector('[data-location-selected]')
  if (selected) selected.innerHTML = renderDesktopLocationSelected()
  const send = document.querySelector('[data-location-send]')
  if (send instanceof HTMLButtonElement) {
    send.disabled = !state.locationPicker.selected || state.modalBusy || state.sendingMessage
    send.textContent = state.modalBusy ? '发送中…' : '发送位置'
  }
  const query = document.querySelector('[data-location-query]')
  if (query instanceof HTMLInputElement && query.value !== state.locationPicker.keyword) query.value = state.locationPicker.keyword
  const current = document.querySelector('[data-location-current]')
  if (current instanceof HTMLButtonElement) {
    current.disabled = state.locationPicker.locating || state.locationPicker.loading || state.modalBusy
    current.innerHTML = `${icon('location')} ${state.locationPicker.locating ? '正在定位…' : '发送当前位置'}`
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
    if (sendAfterResolve) void sendDesktopSelectedLocation()
  }, { poiRadius: 1500, numPois: 10 })
}

function locateDesktopLocationPicker() {
  if (!navigator.geolocation) return showToast('当前设备不支持定位')
  const runtime = desktopLocationPickerRuntime
  if (!runtime.BMap || !runtime.map) return showToast('地图还在加载，请稍候')
  const requestedMapElement = runtime.mapElement
  state.locationPicker.locating = true
  updateDesktopLocationPickerPanels()
  navigator.geolocation.getCurrentPosition((position) => {
    if (state.modal !== 'location' || desktopLocationPickerRuntime.mapElement !== requestedMapElement) return
    state.locationPicker.locating = false
    const gps = new runtime.BMap.Point(position.coords.longitude, position.coords.latitude)
    const converter = new runtime.BMap.Convertor()
    converter.translate([gps], 1, 5, (data) => {
      const point = data?.status === 0 && data.points?.[0] ? data.points[0] : gps
      reverseDesktopLocationPicker(point, '当前位置', true)
    })
  }, () => {
    if (state.modal !== 'location' || desktopLocationPickerRuntime.mapElement !== requestedMapElement) return
    state.locationPicker.locating = false
    updateDesktopLocationPickerPanels()
    showToast('定位失败，请开启定位权限或在地图上选点')
  }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 })
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
  if (runtime.map && runtime.mapElement === mapElement) return
  if (runtime.initPromise) return
  if (runtime.map && runtime.mapElement !== mapElement) disposeDesktopLocationPickerMap()
  const requestedElement = mapElement
  const initSequence = ++runtime.initSequence
  runtime.initPromise = (async () => {
    try {
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
      state.locationPicker.loading = false
      state.locationPicker.error = error instanceof Error ? error.message : '地图初始化失败'
      updateDesktopLocationPickerMapState()
    } finally {
      if (initSequence === runtime.initSequence) runtime.initPromise = null
    }
  })()
}

async function sendDesktopSelectedLocation() {
  const selected = state.locationPicker.selected
  if (!selected || state.modalBusy) return
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

function openDesktopLocationPicker() {
  const selected = conversations[state.selectedConversation]
  if (!selected?.id) return
  disposeDesktopLocationPickerMap()
  state.showPlusMenu = false
  state.locationPicker = desktopLocationPickerDefaultState()
  state.modalBusy = false
  state.modalError = ''
  state.modal = 'location'
  render()
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
      render()
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
  render()
  showToast('已结束实时位置共享')
}

let desktopVoiceRecorder = null
let desktopVoiceChunks = []
let desktopVoiceStartedAt = 0

async function toggleDesktopVoiceRecord() {
  if (state.recordingVoice) {
    desktopVoiceRecorder?.stop()
    return
  }
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return showToast('当前环境不支持录音')
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    desktopVoiceChunks = []
    desktopVoiceRecorder = new MediaRecorder(stream)
    desktopVoiceRecorder.ondataavailable = (event) => { if (event.data.size) desktopVoiceChunks.push(event.data) }
    desktopVoiceRecorder.onstop = async () => {
      const recorder = desktopVoiceRecorder
      stream.getTracks().forEach((track) => track.stop())
      desktopVoiceRecorder = null
      state.recordingVoice = false
      const blob = new Blob(desktopVoiceChunks, { type: recorder?.mimeType || 'audio/webm' })
      if (blob.size < 200) return render()
      state.uploadingFile = true
      render()
      try {
        const uploaded = await uploadDesktopFile(new File([blob], `voice_${Date.now()}.webm`, { type: blob.type || 'audio/webm' }))
        await sendDesktopTypedMessage(JSON.stringify({ url: uploaded.url, name: uploaded.name, size: uploaded.size, contentType: uploaded.contentType, durationMs: Date.now() - desktopVoiceStartedAt }), 3, '[语音]')
      } catch (error) {
        showToast(error instanceof Error ? error.message : '语音发送失败')
      } finally {
        state.uploadingFile = false
        render()
      }
    }
    desktopVoiceStartedAt = Date.now()
    state.recordingVoice = true
    desktopVoiceRecorder.start(200)
    render()
  } catch {
    showToast('无法使用麦克风，请检查浏览器权限')
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
  return state.dataSource === 'remote' ? state.fileItems : mockDesktopFiles
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
        state.messagesByConversation[selected.id] = remoteMessages.map(mapRemoteMessage)
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

function saveDesktopFileAs(file) {
  if (!file?.url) {
    showToast('当前演示文件没有可下载地址')
    return
  }
  const link = document.createElement('a')
  link.href = resolveDesktopFileUrl(file.url)
  link.download = file.name || '文件'
  link.rel = 'noreferrer'
  document.body.append(link)
  link.click()
  link.remove()
  showToast('已开始下载文件')
}

function beginDesktopFileDelete(file) {
  const index = desktopFileConversationIndex(file)
  if (state.dataSource !== 'remote' || index < 0 || !file?.messageId) {
    showToast('演示模式暂不支持删除文件')
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
    saveDesktopFileAs(file)
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
      showToast('演示模式暂不支持保存文件收藏')
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
  const sourceFiles = state.dataSource === 'remote' ? state.fileItems : mockDesktopFiles
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
  return `<aside class="sidebar">
    <div class="brand-lockup">
      <div class="brand-mark"><span></span><span></span><span></span></div>
      <div class="brand-copy"><strong>Pulse</strong><small>同步每一刻</small></div>
    </div>
    <div class="sidebar-label">主空间</div>
    <nav class="main-nav">
      ${navItem('messages', '消息', 'chat', String(conversations.reduce((sum, item) => sum + Number(item.unread || 0), 0) || ''))}
      ${navItem('contacts', '联系人', 'contacts')}
      ${navItem('moments', '朋友圈', 'discover', state.page === 'moments' ? '' : '')}
    </nav>
    <div class="sidebar-label sidebar-label-spaced">快捷入口</div>
    <nav class="main-nav secondary-nav">
      <button class="nav-item ${state.page === 'favorites' ? 'active' : ''}" data-page="favorites"><span class="nav-icon">${icon('bookmark')}</span><span class="nav-text">收藏</span></button>
      <button class="nav-item ${state.page === 'wallet' ? 'active' : ''}" data-page="wallet"><span class="nav-icon">${icon('money')}</span><span class="nav-text">钱包</span></button>
      <button class="nav-item ${state.page === 'files' ? 'active' : ''}" data-page="files"><span class="nav-icon">${icon('folder')}</span><span class="nav-text">文件</span></button>
      <button class="nav-item" data-page="settings"><span class="nav-icon">${icon('settings')}</span><span class="nav-text">设置</span></button>
    </nav>
    <div class="sidebar-grow"></div>
    <div class="windows-card">
      <div class="windows-card-icon">${icon('download')}</div>
      <div><strong>Pulse for Windows</strong><span>${dataSourceLabel()}</span></div>
      <button data-action="download" aria-label="下载">${icon('arrow')}</button>
    </div>
    <button class="sidebar-profile" data-page="settings">
      ${avatar({ initials: state.profile.nickname?.slice(0, 1) || 'H', tone: 'blue', avatarUrl: state.profile.avatarUrl }, 'avatar-small')}<span><strong>Hi, ${escapeHtml(state.profile.nickname || 'Howard')}</strong><small>在线</small></span>${icon('more')}
    </button>
  </aside>`
}

function renderTopbar() {
  const titles = { messages: '消息', contacts: '联系人', groups: '\u7fa4\u804a', moments: '朋友圈', discover: '发现', settings: '个人中心', favorites: '收藏', wallet: '钱包', files: '文件' }
  const notificationCount = Number(state.notificationCount || 0)
  const initials = state.profile.nickname?.slice(0, 1) || 'H'
  const image = resolveDesktopAvatarUrl(state.profile.avatarUrl)
  const avatarMarkup = image
    ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" decoding="async" onerror="this.hidden=true;this.nextElementSibling.hidden=false" /><span hidden>${escapeHtml(initials)}</span>`
    : `<span>${escapeHtml(initials)}</span>`
  const canGoBack = desktopNavigationHistory.length > 0
  const isMessageHome = state.page === 'messages'
  return `<header class="topbar">
    <div class="topbar-leading${isMessageHome ? ' is-message-home' : ''}">
      <button type="button" class="top-back-btn" data-action="navigate-back" ${canGoBack ? '' : 'disabled'} aria-label="返回上一页" title="返回上一页">${icon('arrow', 'back-icon')}</button>
    <div class="breadcrumb"><span>Pulse</span><b>/</b><strong>${titles[state.page] || '消息'}</strong></div>
    </div>
    <div class="topbar-actions">
      <label class="global-search">${icon('search')}<input id="global-search" placeholder="搜索消息、联系人或文件" /><kbd>⌘ K</kbd></label>
      <button class="top-icon-btn" data-action="notifications" aria-label="通知${notificationCount ? `，${notificationCount} 条待处理` : ''}" title="通知${notificationCount ? `，${notificationCount} 条待处理` : ''}">${icon('bell')}${notificationCount ? '<i></i>' : ''}</button>
      <button class="top-icon-btn" data-theme-toggle aria-label="切换主题" title="切换主题">${icon(state.theme === 'light' ? 'moon' : 'sun')}</button>
      <button type="button" class="top-icon-btn top-refresh-btn${state.globalRefreshing ? ' is-refreshing' : ''}" data-action="global-refresh" aria-label="刷新数据" title="刷新当前页面数据" ${state.globalRefreshing ? 'disabled' : ''}>${icon('refresh')}</button>
      <div class="profile-menu ${state.profileMenuOpen ? 'is-open' : ''}">
        <button class="top-avatar" data-action="toggle-profile-menu" aria-label="打开账户菜单" aria-expanded="${state.profileMenuOpen ? 'true' : 'false'}" aria-haspopup="menu">${avatarMarkup}</button>
        ${state.profileMenuOpen ? `<div class="profile-dropdown" role="menu">
          <div class="profile-dropdown-summary">${avatar({ initials, name: state.profile.nickname || 'Howard', tone: 'blue', avatarUrl: state.profile.avatarUrl }, 'avatar-small')}<div><strong>${escapeHtml(state.profile.nickname || 'Howard')}</strong><small>在线</small></div></div>
          <div class="profile-dropdown-divider"></div>
          <button type="button" class="profile-dropdown-item" data-action="edit-profile" role="menuitem">${icon('person')}<span><strong>个人资料</strong><small>查看和编辑账号信息</small></span></button>
          <button type="button" class="profile-dropdown-item" data-action="switch-account" role="menuitem">${icon('switch-account')}<span><strong>切换账号</strong><small>登录其他账号</small></span></button>
          <button type="button" class="profile-dropdown-item is-danger" data-action="logout" role="menuitem">${icon('logout')}<span><strong>退出登录</strong><small>退出当前账号</small></span></button>
        </div>` : ''}
      </div>
    </div>
  </header>`
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

function renderGroups() {
  const groups = conversations
    .filter((item) => !isArchivedConversation(item) && isGroupConversation(item))
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

function renderMessages() {
  const selected = conversations[state.selectedConversation] || conversations[0] || {
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
  const totalUnread = conversations
    .filter((item) => !isArchivedConversation(item) && !item.mute)
    .reduce((sum, item) => sum + Number(item.unread || 0), 0)
  return `<section class="page page-messages">
    ${pageHeading('你的通讯空间', '消息 <span class="heading-count">${totalUnread}</span>', '保持连接，继续每一个重要对话。', `${button('新建消息', 'new-message', 'primary', 'edit')}${button('', 'more', 'icon-only', 'more')}`)}
    <div class="message-workspace${selected.fileTransferAssistant ? ' is-file-transfer-assistant' : ''}">
      ${renderConversationPanel()}
      ${renderChatPanel(selected)}
      ${selected.fileTransferAssistant ? '' : renderContextPanel(selected)}
    </div>
  </section>`
}

function renderConversationPanel() {
  const filters = ['全部', '个人', '群组', '归档']
  const activeFilter = filters.includes(state.conversationFilter) ? state.conversationFilter : '全部'
  const countForFilter = (filter) => conversations
    .filter((item) => {
      if (filter === '归档') return isArchivedConversation(item)
      if (isArchivedConversation(item)) return false
      if (filter === '个人') return !isGroupConversation(item)
      if (filter === '群组') return isGroupConversation(item)
      return true
    })
    .reduce((sum, item) => sum + Number(item.unread || 0), 0)
  const visible = conversations.filter((item) => {
    const byArchive = activeFilter === '归档' ? isArchivedConversation(item) : !isArchivedConversation(item)
    const byType = activeFilter === '个人'
      ? !isGroupConversation(item)
      : activeFilter === '群组'
        ? isGroupConversation(item)
        : true
    const query = state.contactQuery.trim().toLowerCase()
    return byArchive && byType && (!query || item.name.toLowerCase().includes(query) || item.preview.toLowerCase().includes(query))
  }).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)))
  return `<section class="conversation-panel panel-surface">
    <div class="panel-title-row"><div><h2>最近对话</h2><span>${conversations.length} 个会话</span></div><button class="subtle-icon-btn" data-action="new-message">${icon('plus')}</button></div>
    <label class="panel-search">${icon('search')}<input id="conversation-search" value="${escapeHtml(state.contactQuery)}" placeholder="搜索会话" /></label>
    <div class="filter-tabs">${filters.map((filter) => { const count = countForFilter(filter); return `<button class="filter-tab ${activeFilter === filter ? 'active' : ''}" data-filter="${filter}">${filter}${count > 0 ? `<i>${count > 99 ? '99+' : count}</i>` : ''}</button>` }).join('')}</div>
    <div class="conversation-list">${visible.length ? visible.map((item) => renderConversation(item)).join('') : '<div class="empty-state">没有找到相关会话</div>'}</div>
    ${renderConversationMenu()}
  </section>`
}

function renderConversation(item) {
  const index = conversations.indexOf(item)
  return `<button class="conversation-item ${index === state.selectedConversation ? 'selected' : ''}" data-conversation="${index}">
    <span class="avatar-wrap">${avatar(item)}${item.online ? '<i class="online-dot"></i>' : ''}${item.mute ? `<span class="conversation-mute" title="消息免打扰" aria-label="消息免打扰">${icon('bell-off')}</span>` : ''}</span>
     <span class="conversation-copy"><span class="conversation-line"><strong>${item.pinned ? `<span class="conversation-pin" title="已置顶">${icon('bookmark')}</span>` : ''}${item.name}</strong><time>${item.time}</time></span><span class="conversation-line conversation-preview"><span>${item.preview}</span>${item.mentionUnread ? '<i class="mention-unread-badge">@</i>' : ''}${item.unread ? `<i class="unread-badge">${item.unread}</i>` : ''}</span></span>
  </button>`
}

function renderConversationMenuLegacy() {
  const index = Number(state.conversationMenu?.index)
  const conversation = conversations[index]
  if (!conversation || !state.conversationMenu) return ''
  const readAction = Number(conversation.unread || 0) > 0 ? 'read' : 'unread'
  const readLabel = readAction === 'read' ? '设为已读' : '设为未读'
  const archiveLabel = isArchivedConversation(conversation) ? '取消归档' : '设为归档'
  const left = Math.max(8, Number(state.conversationMenu.left || 0))
  const top = Math.max(8, Number(state.conversationMenu.top || 0))
  return `<div class="conversation-context-menu" data-conversation-menu style="left:${left}px;top:${top}px" role="menu">
    <button data-conversation-action="archive" data-conversation-index="${index}" role="menuitem">${icon('close')}${archiveLabel}</button>
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
  const archiveAction = isArchivedConversation(conversation) ? 'unarchive' : 'archive'
  const archiveLabel = archiveAction === 'archive' ? '\u5f52\u6863' : '\u53d6\u6d88\u5f52\u6863'
  const muteAction = conversation.mute ? 'unmute' : 'mute'
  const muteLabel = conversation.mute ? '\u5173\u95ed\u6d88\u606f\u514d\u6253\u6270' : '\u6d88\u606f\u514d\u6253\u6270'
  const archiveMenuAction = 'archive'
  const archiveMenuLabel = isArchivedConversation(conversation) ? '\u53d6\u6d88\u5f52\u6863' : '\u5f52\u6863'
  const left = Math.max(8, Number(state.conversationMenu.left || 0))
  const top = Math.max(8, Number(state.conversationMenu.top || 0))
  return `<div class="conversation-context-menu" data-conversation-menu style="left:${left}px;top:${top}px" role="menu">
    <button data-conversation-action="${muteAction}" data-conversation-index="${index}" role="menuitem">${muteLabel}</button>
    <button data-conversation-action="${archiveMenuAction}" data-conversation-index="${index}" role="menuitem">${archiveMenuLabel}</button>
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
    : `<div class="message-row message-in"><div class="message-avatar">${avatar(selected, 'avatar-tiny')}</div><div><span class="message-sender">${escapeHtml(selected.name)}</span><div class="message-bubble">早上好！桌面端的第一版我看到了，整体很清爽。<br />侧边栏的层级可以再突出一点。</div><time>09:38</time></div></div>
       <div class="message-row message-out"><div><div class="message-bubble">收到，我把导航和常用入口重新整理了一下。<br />你更喜欢现在这种宽松一点的布局吗？</div><time>09:40 <span class="read-check">${icon('check')}</span></time></div></div>
       <div class="message-row message-in"><div class="message-avatar">${avatar(selected, 'avatar-tiny')}</div><div><span class="message-sender">${escapeHtml(selected.name)}</span><div class="message-bubble">晚上的发布会我把流程再过一遍，稍后发你。</div><time>09:42</time></div></div>`
  return `<section class="chat-panel panel-surface">
    <div class="chat-header"><div class="chat-title"><span class="avatar-wrap">${avatar(selected)}${selected.online ? '<i class="online-dot"></i>' : ''}</span><div><h2>${selected.name}</h2><p>${selected.online ? '<span class="status-green">在线</span> · ' : ''}${group ? '8 位成员' : 'Pulse 联系人'}</p></div></div><div class="chat-actions"><button class="subtle-icon-btn">${icon('phone')}</button><button class="subtle-icon-btn">${icon('video')}</button><button class="subtle-icon-btn">${icon('search')}</button><button class="subtle-icon-btn">${icon('more')}</button></div></div>
    <div class="chat-security">${icon('lock')} 端到端加密 · 仅你和${selected.name}可以阅读</div>
    <div class="chat-stream" data-conversation-id="${escapeHtml(selected.id)}">
      <div class="day-divider"><span>${state.loadingMessages ? '正在同步' : '今天'}</span></div>
      ${messageStream}
      ${state.dataSource === 'mock' ? `<div class="typing"><span></span><span></span><span></span> ${escapeHtml(selected.name)} 正在输入…</div>` : ''}
    </div>
    <div class="composer"><div class="composer-tools"><button>${icon('paperclip')}</button><button>${icon('smile')}</button><button>${icon('folder')}</button><span class="composer-hint">Enter 发送 · Shift + Enter 换行</span></div><textarea data-message-composer placeholder="写下你的消息…"></textarea><div class="composer-bottom"><span>${icon('lock')} 私密对话</span><button class="send-button" data-action="send">${icon('send')}</button></div></div>
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

function renderMessageMenu(selected) {
  if (!state.messageMenu || String(state.messageMenu.conversationId) !== String(selected.id)) return ''
  const message = currentMessages(selected).find((item) => item.id === state.messageMenu.messageId)
  if (!message) return ''
  const saveAction = desktopMessageMediaDownloadInfo(message)
    ? `<button data-message-action="save-as" data-message-id="${escapeHtml(message.id)}">${icon('download')}另存为...</button>`
    : ''
  const previewAction = desktopFilePreviewInfo(message)
    ? `<button data-message-action="preview" data-message-id="${escapeHtml(message.id)}">${icon('file')}预览</button>`
    : ''
  return `<div class="message-context-menu" data-message-menu-panel>${previewAction}${saveAction}<button data-message-action="copy" data-message-id="${escapeHtml(message.id)}">${icon('edit')}复制</button><button data-message-action="forward" data-message-id="${escapeHtml(message.id)}">${icon('share')}转发</button><button data-message-action="multi-select" data-message-id="${escapeHtml(message.id)}">${icon('grid')}多选</button>${message.recalled ? '' : `<button data-message-action="favorite" data-message-id="${escapeHtml(message.id)}">${icon('bookmark')}收藏</button>`}<button data-message-action="quote" data-message-id="${escapeHtml(message.id)}">${icon('chat')}引用（回复）</button>${message.mine && !message.recalled ? `<button data-message-action="recall" data-message-id="${escapeHtml(message.id)}">${icon('arrow')}撤回</button>` : ''}<button class="danger" data-message-action="delete-self" data-message-id="${escapeHtml(message.id)}">${icon('close')}单向删除</button>${selected.type === 'group' ? '' : `<button class="danger" data-message-action="delete-both" data-message-id="${escapeHtml(message.id)}">${icon('close')}双向删除</button>`}</div>`
}

function renderChatPanelLegacy2(selected) {
  const group = selected.type === 'group' || selected.name.includes('设计组')
  const remoteMessages = currentMessages(selected)
  const messageStream = remoteMessages.length
    ? remoteMessages.map((message) => `<div class="message-row ${message.mine ? 'message-out' : 'message-in'}" data-message-menu data-message-id="${escapeHtml(message.id)}">${message.mine ? '' : `<div class="message-avatar">${avatar(selected, 'avatar-tiny')}</div>`}<div>${message.fromNickname && !message.mine ? `<span class="message-sender">${escapeHtml(message.fromNickname)}</span>` : ''}<div class="message-bubble ${message.recalled ? 'message-recalled' : ''}">${renderDesktopMessageContent(message)}</div><time>${escapeHtml(message.time || '')}${message.mine ? ` ${renderMessageReadStatus(selected, message)}` : ''}</time></div></div>`).join('')
    : `<div class="message-row message-in"><div class="message-avatar">${avatar(selected, 'avatar-tiny')}</div><div><span class="message-sender">${escapeHtml(selected.name)}</span><div class="message-bubble">早上好！这是桌面端聊天窗口。发送消息后会和移动端保持同步。</div><time>09:38</time></div></div>`
  return `<section class="chat-panel panel-surface">
    <div class="chat-header"><div class="chat-title"><span class="avatar-wrap">${avatar(selected)}${selected.online ? '<i class="online-dot"></i>' : ''}</span><div><h2>${escapeHtml(selected.name)}</h2><p>${selected.online ? '<span class="status-green">在线</span> · ' : ''}${group ? '群聊' : 'Pulse 联系人'}</p></div></div><div class="chat-actions"><button class="subtle-icon-btn" data-action="search-chat" aria-label="搜索聊天">${icon('search')}</button><button class="subtle-icon-btn" data-action="more" aria-label="更多">${icon('more')}</button></div></div>
    <div class="chat-security">${icon('lock')} 端到端加密 · 仅你和 ${escapeHtml(selected.name)} 可以阅读</div>
    <div class="chat-stream" data-conversation-id="${escapeHtml(conversationScrollKey(selected))}">
      <div class="day-divider"><span>${state.loadingMessages ? '正在同步' : (state.messageSearchQuery ? `搜索：${escapeHtml(state.messageSearchQuery)}` : '今天')}</span></div>
      ${messageStream}
      ${state.dataSource === 'mock' ? '<div class="typing"><span></span><span></span><span></span> 对方正在输入…</div>' : ''}
    </div>
    <button class="jump-latest-btn" data-action="jump-latest" data-jump-latest data-jump-conversation="${escapeHtml(conversationScrollKey(selected))}" aria-label="回到最新消息" title="回到最新消息">${icon('arrow')}</button>
    ${renderMessageMenu(selected)}
    <div class="composer"><div class="composer-tools"><button data-action="attach-file" aria-label="发送文件">${icon('paperclip')}</button><button data-action="insert-emoji" aria-label="表情">${icon('smile')}</button><button data-action="attach-file" aria-label="发送文件">${icon('folder')}</button><span class="composer-hint">Enter 发送 · Shift + Enter 换行</span></div><textarea data-message-composer placeholder="写下你的消息…"></textarea><div class="composer-bottom"><span>${icon('lock')} 私密对话</span><button class="send-button" data-action="send">${icon('send')}</button></div></div>
  </section>`
}

function renderDesktopPlusMenu() {
  const actions = [
    ['send-photo', '图片', 'image'],
    ['send-video', '视频', 'video'],
    ['send-file', '文件', 'folder'],
    ['send-location', '位置', 'location'],
    ['send-card', '名片', 'card'],
    ['send-favorite', '收藏', 'bookmark'],
    ['send-redpacket', '红包', 'gift'],
    ['send-transfer', '转账', 'money'],
  ]
  return `<div class="desktop-plus-menu">${actions.map(([action, label, iconName]) => `<button type="button" data-action="${action}"><span>${icon(iconName)}</span><small>${label}</small></button>`).join('')}</div>`
}

function renderDesktopComposerActions() {
  const actions = [
    ['send-photo', '图片', 'image'],
    ['send-video', '视频', 'video'],
    ['send-file', '文件', 'folder'],
    ['send-location', '位置', 'location'],
    ['send-card', '名片', 'card'],
    ['send-favorite', '收藏', 'bookmark'],
    ['send-redpacket', '红包', 'gift'],
    ['send-transfer', '转账', 'money'],
  ]
  return `<span class="desktop-composer-actions">${actions.map(([action, label, iconName]) => `<button type="button" data-action="${action}" aria-label="${label}" title="${label}">${icon(iconName)}</button>`).join('')}</span>`
}

function renderChatPanelDraft(selected) {
  const group = selected.type === 'group' || selected.name.includes('设计组')
  const remoteMessages = currentMessages(selected)
  const messageStream = remoteMessages.length
    ? remoteMessages.map((message) => `<div class="message-row ${message.mine ? 'message-out' : 'message-in'}" data-message-menu data-message-id="${escapeHtml(message.id)}">${message.mine ? '' : `<div class="message-avatar">${avatar(selected, 'avatar-tiny')}</div>`}<div>${message.fromNickname && !message.mine ? `<span class="message-sender">${escapeHtml(message.fromNickname)}</span>` : ''}<div class="message-bubble ${message.recalled ? 'message-recalled' : ''}">${renderDesktopMessageContent(message)}</div><time>${escapeHtml(message.time || '')}${message.mine ? ` ${renderMessageReadStatus(selected, message)}` : ''}</time></div></div>`).join('')
    : `<div class="message-row message-in"><div class="message-avatar">${avatar(selected, 'avatar-tiny')}</div><div><span class="message-sender">${escapeHtml(selected.name)}</span><div class="message-bubble">早上好！这是桌面端聊天窗口，支持与移动端一致的消息类型。</div><time>09:38</time></div></div>`
  return `<section class="chat-panel panel-surface">
    <div class="chat-header"><div class="chat-title"><span class="avatar-wrap">${avatar(selected)}${selected.online ? '<i class="online-dot"></i>' : ''}</span><div><h2>${escapeHtml(selected.name)}</h2><p>${selected.online ? '<span class="status-green">在线</span> · ' : ''}${group ? '群聊' : 'Pulse 联系人'}</p></div></div><div class="chat-actions"><button class="subtle-icon-btn" data-action="search-chat" aria-label="搜索聊天">${icon('search')}</button><button class="subtle-icon-btn" data-action="more" aria-label="更多">${icon('more')}</button></div></div>
    <div class="chat-security">${icon('lock')} 端到端加密 · 仅你和 ${escapeHtml(selected.name)} 可以阅读</div>
    <div class="chat-stream" data-conversation-id="${escapeHtml(selected.id)}">
      <div class="day-divider"><span>${state.loadingMessages ? '正在同步' : (state.messageSearchQuery ? `搜索：${escapeHtml(state.messageSearchQuery)}` : '今天')}</span></div>
      ${messageStream}
      ${state.dataSource === 'mock' ? '<div class="typing"><span></span><span></span><span></span> 对方正在输入…</div>' : ''}
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
  const profileTitle = isGroup ? '群聊资料' : '联系人资料'
  const profileSubtitle = isGroup ? '群聊会话' : (selected.online ? '在线，随时可以聊天' : '最近活跃于昨天')
  const profileAction = isGroup ? '群成员' : '资料'
  return `<aside class="context-panel">
    <div class="context-card profile-context"><div class="context-card-label">${profileTitle} <button>${icon('more')}</button></div><div class="profile-context-main">${avatar(selected, 'avatar-large')}<h3>${selected.name}</h3><p>${profileSubtitle}</p><span class="profile-tag">${selected.tag}</span></div><div class="profile-actions"><button>${icon('phone')}<span>语音</span></button><button>${icon('video')}<span>视频</span></button><button type="button" ${isGroup ? 'data-action="group-info" data-group-info-focus="members" aria-label="查看群成员" title="查看群成员"' : ''}>${icon('person')}<span>${profileAction}</span></button></div></div>
    <div class="context-card"><div class="context-card-label"><span>共享内容</span><button>${icon('arrow')}</button></div><div class="shared-grid"><button class="shared-tile"><span class="shared-preview shared-image"></span><strong>3 张图片</strong></button><button class="shared-tile"><span class="shared-preview shared-file">${icon('folder')}</span><strong>6 个文件</strong></button></div></div>
    <div class="context-card context-list"><button><span class="list-icon">${icon('bookmark')}</span><span><strong>已收藏消息</strong><small>查看对话中的收藏</small></span>${icon('arrow')}</button><button><span class="list-icon">${icon('settings')}</span><span><strong>聊天设置</strong><small>通知、置顶与隐私</small></span>${icon('arrow')}</button></div>
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
        <section class="desktop-chat-setting-card"><div class="desktop-chat-setting-heading"><span class="desktop-setting-icon">${icon('shield')}</span><span><strong>\u9605\u540e\u5373\u711a</strong><small>\u5bf9\u65b9\u9605\u8bfb\u6d88\u606f\u540e\u5f00\u59cb\u5012\u8ba1\u65f6\uff0c\u5230\u671f\u540e\u53cc\u65b9\u4e0d\u53ef\u89c1\u3002</small></span><label class="desktop-switch"><input type="checkbox" data-chat-burn-toggle ${settings.burnEnabled ? 'checked' : ''} ${disabled ? 'disabled' : ''} /><i></i></label></div><div class="desktop-setting-control ${settings.burnEnabled ? '' : 'is-disabled'}"><input type="range" min="0" max="300" step="1" value="${settings.burnSeconds}" data-chat-burn-range ${!settings.burnEnabled || disabled ? 'disabled' : ''} /><div><span>\u7acb\u5373\u9500\u6bc1</span><strong data-burn-label>${escapeHtml(desktopDurationLabel(settings.burnSeconds, 'burn'))}</strong><span>5\u5206\u949f</span></div></div></section>
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
  return '<button class="contact-card" data-action="open-contact" data-user-id="' + escapeHtml(contactUserId(item)) + '">' +
    '<span class="contact-card-head">' + avatar(item, 'avatar-medium') + '<i class="contact-status ' + (contactIsOnline(item) ? 'is-online' : '') + '"></i></span>' +
    '<span class="contact-card-body"><strong>' + escapeHtml(item.name || '') + '</strong><small>' + escapeHtml(item.meta || '') + '</small><span class="contact-tag">' + escapeHtml(item.tag || '') + '</span></span>' +
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
    return [item.name || '', item.meta || ''].join(' ').toLowerCase().includes(query)
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
      '<button data-action="new-friends"><span class="quick-icon quick-blue">' + icon('contacts') + '</span><span><strong>\u65b0\u7684\u670b\u53cb</strong><small>' + (state.friendPendingCount ? state.friendPendingCount + ' \u4e2a\u5f85\u5904\u7406\u7533\u8bf7' : '\u6682\u65e0\u5f85\u5904\u7406\u7533\u8bf7') + '</small></span>' + icon('arrow') + '</button>' +
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
    <div class="quick-actions"><button data-action="new-friends"><span class="quick-icon quick-blue">${icon('contacts')}</span><span><strong>新的朋友</strong><small>${state.friendPendingCount ? `${state.friendPendingCount} 个待处理申请` : '暂无待处理申请'}</small></span>${icon('arrow')}</button><button data-action="groups"><span class="quick-icon quick-violet">${icon('group')}</span><span><strong>查看群聊列表</strong><small>查看所有群聊会话</small></span>${icon('arrow')}</button></div>
    <div class="section-title-row"><div><h2>我的联系人</h2><span>共 ${contacts.length} 位联系人</span></div><div class="view-switch" role="group" aria-label="联系人显示方式"><button class="${state.contactView === 'grid' ? 'active' : ''}" data-contact-view="grid" aria-label="卡片视图" title="卡片视图">${icon('grid')}</button><button class="${state.contactView === 'list' ? 'active' : ''}" data-contact-view="list" aria-label="列表视图" title="列表视图">${icon('contacts')}</button></div></div>
    <div class="contacts-grid ${state.contactView === 'list' ? 'is-list' : ''}">${contacts.filter((item) => !state.contactQuery.trim() || item.name.includes(state.contactQuery.trim()) || item.meta.includes(state.contactQuery.trim())).map((item) => `<button class="contact-card" data-action="open-contact" data-user-id="${escapeHtml(contactUserId(item))}"><span class="contact-card-head">${avatar(item, 'avatar-medium')}<i class="contact-status ${item.status === '在线' ? 'is-online' : ''}"></i></span><span class="contact-card-body"><strong>${item.name}</strong><small>${item.meta}</small><span class="contact-tag">${item.tag}</span></span><span class="contact-card-arrow">${icon('arrow')}</span></button>`).join('')}</div>
  </section>`
}

function renderDiscover() {
  const items = state.dataSource === 'remote' ? state.moments : mockMoments
  const rangeLabels = { 0: '好友可见', 1: '仅自己', 2: '部分可见' }
  const mediaMarkup = (item) => {
    const media = (item.images || []).slice(0, 9)
    if (!media.length) return ''
    return `<div class="desktop-moment-media ${media.length === 1 ? 'single' : ''}">${media.map((url, index) => {
      const type = momentMediaType(item, index, url)
      return type === 'video'
        ? `<video src="${escapeHtml(url)}" controls preload="metadata"></video>`
        : `<img src="${escapeHtml(url)}" alt="" loading="lazy" />`
    }).join('')}</div>`
  }
  const commentMarkup = (item) => {
    if (state.momentCommentOpenId !== String(item.id)) return ''
    const comments = (item.comments || []).slice(-4)
    return `<div class="desktop-moment-comments">${comments.map((comment) => `<div class="desktop-moment-comment"><strong>${escapeHtml(comment.nickname || '用户')}</strong><span>${escapeHtml(comment.content || '')}</span></div>`).join('') || '<span class="desktop-moment-comments-empty">还没有评论，来留下第一条吧。</span>'}<form data-moment-comment-form data-moment-id="${escapeHtml(item.id)}"><input data-moment-comment-input placeholder="说点什么…" value="${escapeHtml(state.momentCommentText)}" maxlength="500" /><button class="btn btn-primary" type="submit">发送</button></form></div>`
  }
  const feed = state.momentsLoading
    ? '<div class="desktop-moments-state">正在加载朋友圈…</div>'
    : state.momentsError
      ? `<div class="desktop-moments-state"><strong>朋友圈暂时无法加载</strong><span>${escapeHtml(state.momentsError)}</span></div>`
      : items.length
        ? items.map((item) => {
          const tone = item.tone || ['blue', 'violet', 'orange', 'green', 'cyan', 'pink'][Number(item.userId || 0) % 6]
          const profile = { ...item, name: item.nickname, initials: item.nickname?.slice(0, 1), tone }
          const visibility = momentVisibilityLabel(item.visibility)
          return `<article class="desktop-moment-card" data-moment-card="${escapeHtml(item.id)}">
            <div class="desktop-moment-head">${avatar(profile, 'avatar-medium')}<div class="desktop-moment-author"><strong>${escapeHtml(item.nickname || '用户')}</strong><span>${escapeHtml(momentTime(item.createdAt))}${item.locationName ? ` · ${escapeHtml(item.locationName)}` : ''}</span></div>${momentIsMine(item) ? `<button class="subtle-icon-btn" data-moment-delete="${escapeHtml(item.id)}" title="删除动态">${icon('more')}</button>` : ''}</div>
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

  return `<section class="page page-moments page-discover">
    ${pageHeading('和朋友分享此刻', '朋友圈', '发布动态、查看朋友近况，并管理每条内容的可见范围。')}
    <div class="desktop-moments-layout">
      <div class="desktop-moments-main">
        <section class="desktop-moment-composer">
          <div class="desktop-moment-composer-head">${avatar({ initials: state.profile.nickname?.slice(0, 1) || '我', tone: 'blue', avatarUrl: state.profile.avatarUrl }, 'avatar-medium')}<div><strong>分享新动态</strong><span>这一刻，想和朋友说点什么？</span></div></div>
          <form data-moment-form><textarea data-moment-content maxlength="1000" placeholder="记录你的想法…">${escapeHtml(state.momentDraftText)}</textarea><div class="desktop-moment-composer-foot"><div class="desktop-moment-compose-tools"><label class="moment-file-label">${icon('image')} 添加图片（可多选）<input id="desktop-moment-files" type="file" accept="image/*,video/*" multiple /></label><select data-moment-visibility aria-label="动态可见范围"><option value="0" ${Number(state.momentVisibility) === 0 ? 'selected' : ''}>好友可见</option><option value="1" ${Number(state.momentVisibility) === 1 ? 'selected' : ''}>仅自己</option><option value="2" ${Number(state.momentVisibility) === 2 ? 'selected' : ''}>部分可见</option></select></div><button class="btn btn-primary" type="submit" ${state.momentPublishBusy ? 'disabled' : ''}>${state.momentPublishBusy ? '发布中…' : '发布'} ${icon('send')}</button></div>${state.momentFileNames.length ? `<div class="desktop-moment-files">已选择：${state.momentFileNames.map((name, index) => `<button type="button" data-moment-file-remove="${index}" title="移除 ${escapeHtml(name)}"><span>${escapeHtml(name)}</span>${icon('close')}</button>`).join('')}</div>` : ''}</form>
        </section>
        <div class="desktop-moments-feed">${feed}</div>
      </div>
    </div>
  </section>`
}

function renderSettingsLegacy() {
  const profile = state.profile
  return `<section class="page page-settings">
    ${pageHeading('管理你的 Pulse', '个人中心', '资料、偏好与安全设置都在这里。', `${button('编辑资料', 'edit-profile', 'secondary', 'edit')}`)}
    <div class="settings-layout"><aside class="settings-menu"><div class="settings-profile-mini">${avatar({ initials: profile.nickname?.slice(0, 1) || 'H', tone: 'blue', avatarUrl: profile.avatarUrl }, 'avatar-medium')}<div><strong>${escapeHtml(profile.nickname || 'Howard')}</strong><small>PulseID ${escapeHtml(profile.pulseId || profile.userId || '1001001')}</small></div>${icon('arrow')}</div><div class="settings-menu-label">账户</div><button class="settings-nav active">${icon('person')}个人资料</button><button class="settings-nav">${icon('bell')}消息通知<span class="setting-dot"></span></button><button class="settings-nav">${icon('shield')}账号与安全</button><div class="settings-menu-label">偏好</div><button class="settings-nav">${icon('sun')}外观与主题<span class="menu-value">${state.theme === 'dark' ? '深色' : '浅色'}</span></button><button class="settings-nav">${icon('chat')}聊天设置</button><button class="settings-nav">${icon('download')}存储空间</button><div class="settings-menu-label">其他</div><button class="settings-nav">${icon('help')}帮助与反馈</button></aside><div class="settings-content"><div class="settings-card profile-edit-card"><div class="settings-card-heading"><div><h2>个人资料</h2><p>这些信息会展示给你的联系人。</p></div><span class="privacy-pill">${icon('lock')} 仅联系人可见</span></div><div class="profile-edit-main">${avatar({ initials: profile.nickname?.slice(0, 1) || 'H', tone: 'blue', avatarUrl: profile.avatarUrl }, 'avatar-xl')}<div><h3>${escapeHtml(profile.nickname || 'Howard')}</h3><p>${escapeHtml(profile.signature || '让每一次连接，都有回应。')}</p><button class="text-button" data-action="change-avatar">更换头像 ${icon('arrow')}</button></div></div><form class="form-grid" data-profile-form><label><span>昵称</span><input name="nickname" value="${escapeHtml(profile.nickname || '')}" /></label><label><span>Pulse ID</span><input value="${escapeHtml(profile.pulseId || profile.userId || '')}" disabled /></label><label class="full"><span>个性签名</span><input name="signature" value="${escapeHtml(profile.signature || '')}" /></label><button class="btn btn-primary" type="submit">保存资料 ${icon('check')}</button></form></div><div class="settings-card session-card"><div class="settings-card-heading"><div><h2>已登录设备</h2><p>你可以在这里查看最近的登录设备。</p></div><span class="safe-label">${icon('shield')} 账户安全</span></div><div class="device-row"><span class="device-icon">${icon('grid')}</span><span><strong>Windows 客户端 · 本设备</strong><small>本地桌面 · 刚刚活跃</small></span><i class="device-current">当前设备</i><button>${icon('more')}</button></div><div class="device-row"><span class="device-icon">${icon('person')}</span><span><strong>其他设备</strong><small>由移动端同步的登录会话</small></span><button>${icon('more')}</button></div></div><button class="logout-button" data-action="logout">退出当前账户</button></div></div>
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
  const otherDevices = state.deviceSessions.filter((device) => !device.current).length
  const status = state.accountSecurityLoading ? '检查中' : security.securityCodeEnabled ? '保护中' : '建议开启'
  const code = security.securityCode
    ? state.securityCodeVisible ? security.securityCode : '••••••'
    : '未生成'
  return `<section class="page page-settings desktop-subpage page-account-security">
    ${pageHeading('账户安全', '账号与安全', '管理绑定手机号、登录设备和账号安全码。', button('返回个人资料', 'edit-profile', 'secondary', 'arrow'))}
    ${state.accountSecurityError ? `<div class="login-error">${escapeHtml(state.accountSecurityError)}</div>` : ''}
    <div class="desktop-security-hero"><span class="desktop-security-icon">${icon('shield')}</span><div><strong>账号保护</strong><p>${security.securityCodeEnabled ? '安全码已开启，陌生设备登录会受到保护。' : '开启安全码，进一步保护账号登录安全。'}</p></div><b class="desktop-security-status ${security.securityCodeEnabled ? 'is-enabled' : ''}">${status}</b></div>
    <section class="settings-card desktop-security-phone"><div class="settings-card-heading"><div><h2>当前绑定手机号</h2><p>手机号用于登录、找回密码和身份验证。</p></div><span class="safe-label">${icon('phone')} ${escapeHtml(maskDesktopPhone(security.phone || state.profile.phone))}</span></div><div class="desktop-security-actions"><button type="button" class="btn" data-action="change-phone">修改手机号</button><button type="button" class="btn" data-action="change-password">修改密码</button></div></section>
    <section class="settings-card session-card"><div class="settings-card-heading"><div><h2>已登录设备 <span class="desktop-count-pill">${state.deviceSessions.length}</span></h2><p>${otherDevices ? `还有 ${otherDevices} 台设备登录` : '当前仅此设备登录'}</p></div><span class="safe-label">${icon('shield')} 账户安全</span></div>${renderDeviceRows()}${otherDevices ? '<button type="button" class="device-logout-others" data-device-logout-others>退出其他设备</button>' : ''}</section>
    <section class="settings-card desktop-security-code-card"><div class="settings-card-heading"><div><h2>账号安全码</h2><p>开启后，未验证过的其他设备登录时需要输入安全码。</p></div><label class="desktop-switch"><input type="checkbox" data-security-code-toggle ${security.securityCodeEnabled ? 'checked' : ''} ${state.securityCodeBusy ? 'disabled' : ''} /><i></i></label></div>${security.securityCodeEnabled ? `<div class="desktop-security-code-value"><strong>${escapeHtml(code)}</strong><button type="button" class="subtle-icon-btn" data-security-code-visibility title="${state.securityCodeVisible ? '隐藏安全码' : '显示安全码'}">${icon(state.securityCodeVisible ? 'close' : 'shield')}</button></div><div class="desktop-security-code-actions"><button type="button" class="btn" data-security-code-copy ${security.securityCode ? '' : 'disabled'}>复制安全码</button><button type="button" class="btn btn-primary" data-security-code-refresh ${state.securityCodeBusy ? 'disabled' : ''}>${state.securityCodeBusy ? '更新中…' : '更新安全码'}</button></div><small class="desktop-settings-note">更新后，其他设备需要使用新的安全码重新验证。</small>` : '<div class="desktop-settings-note">安全码关闭中，建议开启以保护陌生设备登录。</div>'}</section>
  </section>`
}

function renderDesktopStoragePage() {
  const usage = state.storageUsage || { local: 0, cache: 0, total: 0, quota: 0 }
  return `<section class="page page-settings desktop-subpage page-storage"><div class="page-heading"><div><div class="eyebrow">本机数据</div><h1>存储空间</h1><p>查看并清理当前电脑上的临时缓存，不会删除聊天记录。</p></div><div class="heading-actions"><button class="btn btn-secondary" data-action="edit-profile">${icon('arrow')}<span>返回个人资料</span></button></div></div>${state.storageError ? `<div class="login-error">${escapeHtml(state.storageError)}</div>` : ''}<section class="storage-summary-card"><div class="storage-summary-icon">${icon('download')}</div><div><small>可清理缓存</small><strong>${state.storageLoading ? '计算中…' : formatDesktopBytes(usage.total)}</strong><span>${state.storageUpdatedAt ? `最近扫描 ${escapeHtml(state.storageUpdatedAt)}` : '尚未扫描'}</span></div><b>${usage.quota ? `配额 ${formatDesktopBytes(usage.quota)}` : '当前环境估算'}</b></section><div class="storage-breakdown"><section class="settings-card"><span class="storage-card-icon">${icon('settings')}</span><div><strong>本地数据</strong><p>登录状态、个人设置以外的临时站点数据。</p></div><b>${formatDesktopBytes(usage.local)}</b></section><section class="settings-card"><span class="storage-card-icon">${icon('folder')}</span><div><strong>资源缓存</strong><p>页面脚本、图片和其他可重新获取的资源。</p></div><b>${formatDesktopBytes(usage.cache)}</b></section></div><section class="settings-card storage-note-card"><div><h2>清理说明</h2><p>清理缓存不会退出登录，也不会删除聊天记录、字体、主题和设备信任信息。</p></div><button type="button" class="btn btn-danger" data-storage-clear ${state.storageLoading ? 'disabled' : ''}>${icon('close')}清除全部缓存</button></section></section>`
}

function renderDesktopHelpPage() {
  const keyword = String(state.helpQuery || '').trim().toLowerCase()
  const questions = (state.helpQuestions || []).filter((item) => !keyword || [item.question, item.answer, item.category].some((value) => String(value || '').toLowerCase().includes(keyword)))
  return `<section class="page page-settings desktop-subpage page-help"><div class="page-heading"><div><div class="eyebrow">支持中心</div><h1>帮助与反馈</h1><p>先查找常见问题，找不到答案时可以直接告诉我们。</p></div><div class="heading-actions"><button class="btn btn-secondary" data-action="edit-profile">${icon('arrow')}<span>返回个人资料</span></button></div></div><div class="help-layout"><section class="settings-card help-faq-card"><div class="settings-card-heading"><div><h2>常见问题</h2><p>搜索关键词快速找到答案。</p></div></div><label class="desktop-help-search">${icon('search')}<input type="search" data-help-query value="${escapeHtml(state.helpQuery)}" placeholder="搜索问题关键词" /></label>${state.helpError ? `<div class="login-error">${escapeHtml(state.helpError)}</div>` : ''}${state.helpLoading ? '<div class="desktop-modal-hint">正在加载帮助内容…</div>' : questions.length ? `<div class="desktop-faq-list">${questions.map((item) => `<details><summary>${item.category ? `<span>${escapeHtml(item.category)}</span>` : ''}<strong>${escapeHtml(item.question)}</strong>${icon('arrow')}</summary><p>${escapeHtml(item.answer || '暂无详细回答')}</p></details>`).join('')}</div>` : '<div class="desktop-modal-empty">没有找到匹配的问题</div>'}</section><section class="settings-card help-feedback-card"><div class="settings-card-heading"><div><h2>提交反馈</h2><p>描述越详细，我们越容易定位和解决问题。</p></div><span class="privacy-pill">${icon('lock')} 仅用于改进产品</span></div><textarea data-feedback-content maxlength="1000" placeholder="请详细描述遇到的问题或建议">${escapeHtml(state.feedbackContent)}</textarea><div class="feedback-form-footer"><small>${String(state.feedbackContent || '').length}/1000</small><button type="button" class="btn btn-primary" data-submit-feedback ${state.feedbackBusy ? 'disabled' : ''}>${state.feedbackBusy ? '提交中…' : '提交反馈'}</button></div></section></div></section>`
}

function renderSettings() {
  const profile = state.profile
  const initials = profile.nickname?.slice(0, 1) || 'H'
  const profileEditing = Boolean(state.profileEditing)
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
          <div><strong>${escapeHtml(profile.nickname || 'Howard')}</strong><small>PulseID ${escapeHtml(profile.pulseId || profile.userId || '1001001')}</small></div>
          ${icon('arrow')}
        </div>
        <div class="settings-menu-label">\u8d26\u6237</div>
        <button type="button" class="settings-nav ${state.settingsSection === 'profile' ? 'active' : ''}" data-action="edit-profile">${icon('person')}\u4e2a\u4eba\u8d44\u6599</button>
        <button type="button" class="settings-nav" data-action="notifications">${icon('bell')}\u6d88\u606f\u901a\u77e5<span class="setting-dot"></span></button>
        <button type="button" class="settings-nav ${state.settingsSection === 'account-security' ? 'active' : ''}" data-action="account-security">${icon('shield')}\u8d26\u53f7\u4e0e\u5b89\u5168</button>
        <div class="settings-menu-label">\u504f\u597d</div>
        <button type="button" class="settings-nav" data-action="toggle-theme">${icon('sun')}\u5916\u89c2\u4e0e\u4e3b\u9898<span class="menu-value">${state.theme === 'dark' ? '\u6df1\u8272' : '\u6d45\u8272'}</span></button>
        <button type="button" class="settings-nav" data-page="wallet">${icon('money')}我的钱包</button>
        <button type="button" class="settings-nav" data-settings-section="friend-permission">${icon('group')}朋友权限</button>
        <button type="button" class="settings-nav ${state.settingsSection === 'storage' ? 'active' : ''}" data-action="storage">${icon('download')}\u5b58\u50a8\u7a7a\u95f4</button>
        <div class="settings-menu-label">\u5176\u4ed6</div>
         <button type="button" class="settings-nav ${state.settingsSection === 'help' ? 'active' : ''}" data-action="help">${icon('help')}\u5e2e\u52a9\u4e0e\u53cd\u9988</button>
       </aside>
        </div>
      <div class="settings-content">
        <div class="settings-card profile-edit-card">
          <div class="settings-card-heading"><div><h2>\u4e2a\u4eba\u8d44\u6599</h2><p>\u8fd9\u4e9b\u4fe1\u606f\u4f1a\u5c55\u793a\u7ed9\u4f60\u7684\u8054\u7cfb\u4eba\u3002</p></div><span class="privacy-pill">${icon('lock')} \u4ec5\u8054\u7cfb\u4eba\u53ef\u89c1</span></div>
          <div class="profile-edit-main">${avatar({ initials, tone: 'blue', avatarUrl: profile.avatarUrl }, 'avatar-xl')}<div><h3>${escapeHtml(profile.nickname || 'Howard')}</h3><p>${escapeHtml(profile.signature || '\u8ba9\u6bcf\u4e00\u6b21\u8fde\u63a5\uff0c\u90fd\u6709\u56de\u5e94\u3002')}</p><button type="button" class="text-button profile-avatar-button" data-action="change-avatar" ${state.profileAvatarUploading ? 'disabled aria-busy="true"' : ''}>${state.profileAvatarUploading ? '\u4e0a\u4f20\u4e2d\u2026' : '\u66f4\u6362\u5934\u50cf'} ${icon(state.profileAvatarUploading ? 'refresh' : 'arrow')}</button><small class="profile-avatar-hint">支持 JPG、PNG、WEBP，最大 20MB</small><input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/bmp" data-profile-avatar-input hidden ${state.profileAvatarUploading ? 'disabled' : ''} /></div></div>
           <form id="profile-form" class="form-grid" data-profile-form><label><span>\u6635\u79f0</span><input name="nickname" value="${escapeHtml(profile.nickname || '')}" ${profileEditing ? '' : 'disabled'} /></label><label><span>Pulse ID</span><input value="${escapeHtml(profile.pulseId || profile.userId || '')}" disabled /></label><label class="full"><span>\u4e2a\u6027\u7b7e\u540d</span><input name="signature" value="${escapeHtml(profile.signature || '')}" ${profileEditing ? '' : 'disabled'} /></label></form>
        </div>
         <div class="settings-card session-card">
            <div class="settings-card-heading"><div><h2>\u5df2\u767b\u5f55\u8bbe\u5907</h2><p>\u4f60\u53ef\u4ee5\u5728\u8fd9\u91cc\u67e5\u770b\u548c\u7ba1\u7406\u767b\u5f55\u4f1a\u8bdd\u3002</p></div><span class="safe-label">${icon('shield')} \u8d26\u6237\u5b89\u5168</span></div>
           ${renderDeviceRows()}
           ${state.deviceSessions.filter((device) => !device.current).length > 0 ? '<button type="button" class="device-logout-others" data-device-logout-others>退出其他设备</button>' : ''}
         </div>
       </div>
    </div>
  </section>`
}

function renderFavorites() {
  const organizeLabel = state.favoriteOrganizing ? '完成整理' : '整理收藏'
  return `<section class="page page-favorites">${pageHeading('稍后再看', '收藏', '把重要的消息、文件和动态留在这里。', button(organizeLabel, 'organize', 'secondary', 'grid'))}<div class="favorite-summary"><div><span>${icon('bookmark')}</span><strong>36</strong><small>条收藏</small></div><div><span>${icon('folder')}</span><strong>12</strong><small>个文件</small></div><div><span>${icon('chat')}</span><strong>24</strong><small>条消息</small></div></div><div class="favorite-list"><article><span class="favorite-type type-message">${icon('chat')}</span><div><strong>把重要的事，放在 Pulse 里慢慢完成。</strong><p>来自 Pulse 官方 · 消息</p></div><time>今天 09:12</time>${icon('more')}</article><article><span class="favorite-type type-file">${icon('folder')}</span><div><strong>Pulse Desktop v1 · 视觉方向</strong><p>来自 Pulse 设计组 · 文件</p></div><time>昨天 18:36</time>${icon('more')}</article><article><span class="favorite-type type-post">${icon('discover')}</span><div><strong>夏天很短，但海边一直都在。</strong><p>来自 周亦然 · 动态</p></div><time>6月18日</time>${icon('more')}</article></div></section>`
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
  const content = renderDesktopMessageContent(message) || `<div class="favorite-detail-text">${escapeHtml(desktopFavoritePreview(item))}</div>`
  const isMoment = Number(item.msgType || 0) === 10
  const body = `<div class="favorite-detail-body"><div class="favorite-detail-meta"><div><span>来源</span><strong>${escapeHtml(source)}</strong></div><div><span>类型</span><strong>${escapeHtml(desktopFavoriteTypeLabel(item))}</strong></div><div><span>收藏时间</span><strong>${escapeHtml(formatRemoteTime(item.createdAt) || '—')}</strong></div></div><div class="favorite-detail-content">${content}</div><div class="favorite-detail-actions"><button class="btn" type="button" data-modal-close>关闭</button>${isMoment ? '' : `<button class="btn" type="button" data-favorite-forward-detail="${escapeHtml(item.id)}">${icon('share')} 转发</button>`}<button class="btn btn-primary" type="button" data-favorite-open-conversation>${isMoment ? '打开朋友圈' : '打开原会话'} ${icon('arrow')}</button></div></div>`
  return modalFrame('收藏详情', '查看这条收藏的完整消息内容。', body)
}

function showToast(message) {
  state.toast = message
  render()
  window.clearTimeout(showToast.timer)
  showToast.timer = window.setTimeout(() => { state.toast = ''; render() }, 2200)
}

function openDesktopAvatarPicker() {
  if (state.profileAvatarUploading) return
  if (state.dataSource !== 'remote') {
    showToast('请登录在线账户后上传头像')
    return
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
  const maxEdge = 512
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
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
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

  const previousAvatarUrl = state.profile.avatarUrl || ''
  const previewUrl = URL.createObjectURL(file)
  state.profile = { ...state.profile, avatarUrl: previewUrl }
  state.profileAvatarUploading = true
  render()
  try {
    const avatarFile = await compressDesktopAvatar(file)
    const uploaded = await uploadDesktopFile(avatarFile)
    const updated = await updateDesktopProfile({ avatarUrl: uploaded.url })
    state.profile = {
      ...state.profile,
      ...updated,
      avatarUrl: updated.avatarUrl || uploaded.url,
      userId: String(updated.userId || state.profile.userId),
    }
    saveDesktopSession(getDesktopToken() || '', state.profile)
    showToast('头像已更新')
  } catch (error) {
    state.profile = { ...state.profile, avatarUrl: previousAvatarUrl }
    showToast(error instanceof Error ? error.message : '头像上传失败')
  } finally {
    state.profileAvatarUploading = false
    URL.revokeObjectURL(previewUrl)
    render()
  }
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
  if (state.modal === 'location') disposeDesktopLocationPickerMap()
  if (inputDialogResolver) cancelInputDialog()
  if (walletPasswordResolver) {
    const resolver = walletPasswordResolver
    walletPasswordResolver = null
    resolver(false)
  }
  state.modal = ''
  state.locationPicker = desktopLocationPickerDefaultState()
  state.modalBusy = false
  state.modalError = ''
  state.modalQuery = ''
  state.modalResults = null
  state.sharedContentFilter = ''
  state.sharedContentMessages = []
  state.sharedContentLoading = false
  state.sharedContentError = ''
  state.modalProfile = null
  state.modalProfileMoments = []
  state.modalProfileMomentsLoading = false
  state.modalProfileMomentsError = ''
  state.modalProfileCommonGroups = []
  state.modalProfileCommonGroupsLoading = false
  state.modalProfileCommonGroupsError = ''
  state.inputDialog = null
  state.momentDetail = null
  state.modalMode = 'conversation'
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
      <header class="desktop-modal-header"><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p></div><button class="subtle-icon-btn" data-modal-close aria-label="关闭">${icon('close')}</button></header>
      ${body}
    </section>
  </div>`
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
  const addable = contacts.filter((contact) => !memberIds.has(String(contact.userId || contactUserId(contact))))
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
  const body = `<div class="desktop-group-info-body">
    <div class="desktop-group-info-hero">${avatar({ name: detail.title, avatarUrl: detail.avatarUrl, tone: 'violet' }, 'avatar-large')}<div><strong>${escapeHtml(detail.title)}</strong><small>${Number(detail.memberCount || detail.members.length)} \u540d\u6210\u5458${detail.myRole ? ` \u00b7 ${detail.myRole === 'owner' ? '\u7fa4\u4e3b' : detail.myRole === 'admin' ? '\u7ba1\u7406\u5458' : '\u6210\u5458'}` : ''}</small></div></div>
    <div class="desktop-group-info-section"><div class="desktop-group-info-section-head"><strong>\u7fa4\u8d44\u6599</strong>${manager ? '<span>\u7ba1\u7406\u6743\u9650</span>' : ''}</div>
      <button class="desktop-group-info-row" type="button" data-group-info-edit="title"><span><strong>\u7fa4\u540d\u79f0</strong><small>${escapeHtml(detail.title)}</small></span>${manager ? icon('edit') : ''}</button>
      <button class="desktop-group-info-row" type="button" data-group-info-edit="notice"><span><strong>\u7fa4\u516c\u544a</strong><small>${escapeHtml(detail.notice || '\u6682\u65e0\u516c\u544a')}</small></span>${manager ? icon('edit') : ''}</button>
      <button class="desktop-group-info-row" type="button" data-group-info-edit="nickname"><span><strong>\u6211\u7684\u7fa4\u6635\u79f0</strong><small>${escapeHtml(detail.myGroupNickname || '\u8ddf\u968f\u8d26\u53f7\u6635\u79f0')}</small></span>${icon('edit')}</button>
      <button class="desktop-group-info-row" type="button" data-group-info-edit="remark"><span><strong>\u7fa4\u5907\u6ce8</strong><small>${escapeHtml(detail.groupRemark || '\u4ec5\u81ea\u5df1\u53ef\u89c1\uff0c\u6682\u672a\u8bbe\u7f6e')}</small></span>${icon('edit')}</button>
    </div>
    <div class="desktop-group-info-section"><div class="desktop-group-info-section-head"><strong>\u7fa4\u5185\u64cd\u4f5c</strong></div>
      <label class="desktop-group-switch-row"><span><strong>\u7f6e\u9876\u7fa4\u804a</strong><small>\u4ec5\u5f71\u54cd\u4f60\u81ea\u5df1</small></span><input type="checkbox" data-group-setting="pinned" ${detail.pinned ? 'checked' : ''} /><i></i></label>
      <label class="desktop-group-switch-row"><span><strong>\u6d88\u606f\u514d\u6253\u6270</strong><small>\u4ec5\u5f71\u54cd\u4f60\u81ea\u5df1</small></span><input type="checkbox" data-group-setting="mute" ${detail.mute ? 'checked' : ''} /><i></i></label>
      ${manager ? `<label class="desktop-group-switch-row"><span><strong>\u5168\u5458\u7981\u8a00</strong><small>\u4ec5\u7fa4\u4e3b\u548c\u7ba1\u7406\u5458\u53ef\u53d1\u8a00</small></span><input type="checkbox" data-group-setting="muteAll" ${detail.muteAll ? 'checked' : ''} /><i></i></label><label class="desktop-group-switch-row"><span><strong>\u52a0\u7fa4\u9700\u5ba1\u6838</strong><small>\u65b0\u6210\u5458\u52a0\u5165\u524d\u9700\u7ba1\u7406\u5458\u786e\u8ba4</small></span><input type="checkbox" data-group-setting="joinVerifyRequired" ${detail.joinVerifyRequired ? 'checked' : ''} /><i></i></label><label class="desktop-group-switch-row"><span><strong>\u6210\u5458\u53ef\u4e92\u52a0\u597d\u53cb</strong><small>\u5141\u8bb8\u7fa4\u6210\u5458\u4ece\u7fa4\u8d44\u6599\u4e92\u52a0\u597d\u53cb</small></span><input type="checkbox" data-group-setting="allowMemberAddFriend" ${detail.allowMemberAddFriend ? 'checked' : ''} /><i></i></label>` : ''}
    </div>
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
  const body = `<div class="desktop-shared-content-list ${filter === 'media' ? 'is-media' : 'is-files'}">${messages.map((message) => `<article class="desktop-shared-content-item"><div class="desktop-shared-content-meta"><strong>${escapeHtml(message.mine ? '我' : (message.fromNickname || selected?.name || '用户'))}</strong><time>${escapeHtml(message.time || '')}</time></div><div class="desktop-shared-content-preview">${renderDesktopMessageContent(message)}</div></article>`).join('')}</div>`
  return modalFrame(title, `共 ${messages.length} 项 · 点击内容可打开原文件`, body)
}

function desktopFilePreviewInfo(message) {
  if (!message || message.recalled) return null
  if (Number(message.msgType || 0) !== 2) return null
  const file = parseDesktopFile(message.content)
  if (!file?.url) return null
  const fileUrl = resolveDesktopFileUrl(file.url)
  if (!fileUrl) return null
  const contentType = String(file.contentType || '').toLowerCase()
  const ext = desktopFileExtension(file.name || '', contentType)
  const isVideo = contentType.startsWith('video/') || /\.(mp4|webm|mov|m4v|3gp)(\?|$)/i.test(fileUrl)
  if (isVideo) return null
  return { fileUrl, name: file.name || '文件', size: Number(file.size || 0), contentType, ext }
}

function renderDesktopFilePreviewModal() {
  const message = state.filePreviewMessage
  const info = desktopFilePreviewInfo(message)
  if (!info) {
    return modalFrame('文件预览', '无法预览该文件', '<div class="desktop-modal-empty">文件地址无效或消息已撤回</div>', 'desktop-file-preview-modal')
  }
  const { fileUrl, name, size, contentType, ext } = info
  const isImage = contentType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'].includes(ext)
  const isPdf = ext === 'pdf' || contentType === 'application/pdf'
  const isText = contentType.startsWith('text/') || ['txt', 'md', 'markdown', 'json', 'log', 'csv', 'xml', 'yaml', 'yml', 'ini', 'conf'].includes(ext)
  let preview
  if (isImage) {
    preview = `<div class="desktop-file-preview-media-wrap"><img class="desktop-file-preview-media" src="${escapeHtml(fileUrl)}" alt="${escapeHtml(name)}" /></div>`
  } else if (isPdf) {
    preview = `<iframe class="desktop-file-preview-frame" src="${escapeHtml(fileUrl)}" title="文件预览"></iframe>`
  } else if (isText) {
    preview = `<pre class="desktop-file-preview-text" data-desktop-file-text-preview>加载中…</pre>`
  } else {
    preview = `<div class="desktop-file-preview-empty">${icon('file')}<p>该类型暂不支持页内预览，可下载后用本地应用打开。</p></div>`
  }
  const sizeLabel = size ? formatDesktopFileSize(size) : ''
  const subtitle = [name, sizeLabel].filter(Boolean).join(' · ')
  const body = `<div class="desktop-file-preview-body">${preview}</div><div class="desktop-modal-actions desktop-file-preview-actions"><button class="btn" type="button" data-modal-close>关闭</button><button class="btn btn-primary" type="button" data-file-preview-download>${icon('download')} 下载</button></div>`
  return modalFrame('文件预览', subtitle, body, 'desktop-file-preview-modal')
}

function desktopMessageById(messageId) {
  const selected = conversations[state.selectedConversation]
  const stream = selected ? currentMessages(selected) : []
  return stream.concat(state.sharedContentMessages || []).find((item) => String(item.id) === String(messageId))
}

function openDesktopFilePreview(message) {
  if (!message) return
  state.messageMenu = null
  state.filePreviewMessage = message
  state.modal = 'file-preview'
  state.modalError = ''
  state.modalBusy = false
  render()
  void loadDesktopFileTextPreview()
}

async function loadDesktopFileTextPreview() {
  const info = desktopFilePreviewInfo(state.filePreviewMessage)
  const holder = document.querySelector('[data-desktop-file-text-preview]')
  if (!info || !holder) return
  const { fileUrl, contentType, ext } = info
  const isText = contentType.startsWith('text/') || ['txt', 'md', 'markdown', 'json', 'log', 'csv', 'xml', 'yaml', 'yml', 'ini', 'conf'].includes(ext)
  if (!isText) return
  try {
    const headers = {}
    const token = getDesktopToken()
    if (token) headers.Authorization = `Bearer ${token}`
    const response = await fetch(fileUrl, { credentials: 'include', headers })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const raw = await response.text()
    const MAX = 500 * 1024
    holder.textContent = raw.length > MAX
      ? `${raw.slice(0, MAX)}\n\n…（文件较大，仅预览前 500KB，完整内容请下载查看）`
      : raw
  } catch {
    holder.textContent = '文本预览加载失败，请下载后查看。'
  }
}

function renderDesktopLocationPickerModal() {
  const picker = state.locationPicker
  const selected = picker.selected
  const body = `<div class="desktop-location-picker">
    <div class="desktop-location-toolbar">
      <form class="desktop-location-search" data-location-search-form><span>${icon('search')}</span><input data-location-query type="search" value="${escapeHtml(picker.keyword)}" placeholder="搜索地点、街道或商户" autocomplete="off" /><button type="submit" aria-label="搜索">${icon(picker.searching ? 'refresh' : 'search')}</button></form>
      <button type="button" class="desktop-location-current" data-location-current ${picker.locating || picker.loading || state.modalBusy ? 'disabled' : ''}>${icon('location')} ${picker.locating ? '正在定位…' : '发送当前位置'}</button>
    </div>
    <div class="desktop-location-map-wrap"><div id="desktop-location-map" class="desktop-location-map"></div><div class="desktop-location-map-state ${picker.error ? 'is-error' : ''}" data-location-map-state>${picker.error ? `<span>${icon('location')}</span><strong>${escapeHtml(picker.error)}</strong><small>可以关闭后重试</small>` : `<span class="desktop-location-spinner">${icon('refresh')}</span><strong>正在加载百度地图…</strong>`}</div><button type="button" class="desktop-location-recenter" data-location-recenter aria-label="定位到当前位置" title="定位到当前位置">${icon('location')}</button></div>
    <div class="desktop-location-results" data-location-results>${renderDesktopLocationResults()}</div>
    <div class="desktop-location-nearby-wrap" data-location-nearby>${renderDesktopLocationNearby()}</div>
    <div class="desktop-location-footer"><div class="desktop-location-selected" data-location-selected>${renderDesktopLocationSelected()}</div><div class="desktop-location-actions"><button type="button" class="btn" data-modal-close>取消</button><button type="button" class="btn btn-primary" data-location-send ${!selected || state.modalBusy ? 'disabled' : ''}>${state.modalBusy ? '发送中…' : '发送位置'}</button></div></div>
  </div>`
  return modalFrame('发送位置', '搜索地点、发送当前位置，或直接点击地图选点。', body, 'desktop-location-modal')
}

function renderModal() {
  if (state.modal === 'input') return renderInputDialog()
  if (state.modal === 'new-message') return renderNewMessageModal()
  if (state.modal === 'search') return renderSearchModal()
  if (state.modal === 'contact') return renderContactModal()
  if (state.modal === 'contact-moments') return renderContactMomentsModal()
  if (state.modal === 'contact-groups') return renderContactGroupsModal()
  if (state.modal === 'notifications') return renderNotificationsModal()
  if (state.modal === 'send-card') return renderSendCardModal()
  if (state.modal === 'send-favorite') return renderSendFavoriteModal()
  if (state.modal === 'message-forward') return renderMessageForwardModal()
  if (state.modal === 'favorite-forward') return renderFavoriteForwardModal()
  if (state.modal === 'favorite-detail') return renderFavoriteDetailModal()
  if (state.modal === 'chat-settings') return renderChatSettingsModal()
  if (state.modal === 'confirm') return renderConfirmModal()
  if (state.modal === 'wallet-password') return renderWalletPasswordModal()
  if (state.modal === 'redpacket-detail') return renderDesktopRedPacketModal()
  if (state.modal === 'transfer-detail') return renderDesktopTransferModal()
  if (state.modal === 'wallet-detail') return renderWalletDetailModal()
  if (state.modal === 'moment-visibility') return renderMomentVisibilityModal()
  if (state.modal === 'moment-mentions') return renderMomentMentionsModal()
  if (state.modal === 'moment-detail') return renderMomentDetailModal()
  if (state.modal === 'privacy-list') return renderPrivacyListModal()
  if (state.modal === 'group-info') return renderDesktopGroupInfoModal()
  if (state.modal === 'shared-content') return renderDesktopSharedContentModal()
  if (state.modal === 'file-preview') return renderDesktopFilePreviewModal()
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
      return type === 'video'
        ? `<video src="${escapeHtml(url)}" controls preload="metadata"></video>`
        : `<img src="${escapeHtml(url)}" alt="" loading="lazy" />`
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
        <section class="desktop-chat-setting-card"><div class="desktop-chat-setting-heading"><span class="desktop-setting-icon">${icon('shield')}</span><span><strong>阅后即焚</strong><small>对方阅读消息后开始倒计时，到期后双方不可见。</small></span><label class="desktop-switch"><input type="checkbox" data-chat-burn-toggle ${settings.burnEnabled ? 'checked' : ''} ${disabled ? 'disabled' : ''} /><i></i></label></div><div class="desktop-setting-control ${settings.burnEnabled ? '' : 'is-disabled'}"><input type="range" min="0" max="300" step="1" value="${settings.burnSeconds}" data-chat-burn-range ${!settings.burnEnabled || disabled ? 'disabled' : ''} /><div><span>立即销毁</span><strong data-burn-label>${escapeHtml(desktopDurationLabel(settings.burnSeconds, 'burn'))}</strong><span>5分钟</span></div></div></section>
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

function renderConfirmModal() {
  const type = state.confirmDialog?.type
  const isMessage = type === 'delete-message'
  const isSwitchAccount = type === 'switch-account'
  const isLogout = type === 'logout'
  const isRevokeDevice = type === 'revoke-device'
  const isRevokeOthers = type === 'revoke-other-devices'
  const isMoment = type === 'delete-moment'
  const isFavorites = type === 'delete-favorites'
  const isFavorite = type === 'delete-favorite'
  const isGroupAction = type === 'group-action'
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
  const title = isLogout ? '\u9000\u51fa\u767b\u5f55' : isSwitchAccount ? '切换账号' : isRevokeDevice || isRevokeOthers ? '退出登录设备' : isMoment ? '删除动态' : isMessage ? '删除消息' : isFavorites || isFavorite ? '取消收藏' : '删除会话'
  const messageMode = state.confirmDialog?.mode === 'both' ? '双向删除' : '单向删除'
  const subtitle = isLogout ? '\u9000\u51fa\u540e\u9700\u8981\u91cd\u65b0\u767b\u5f55' : isSwitchAccount ? '当前账号会退出登录' : isRevokeDevice || isRevokeOthers ? '退出后，该设备需要重新登录' : isMoment ? '删除后，这条动态将从朋友圈移除' : isMessage ? `${messageMode} · 删除后将无法恢复` : isFavorites || isFavorite ? '取消后，这条收藏将从当前列表移除' : '会话将从当前列表移除'
  const description = isLogout
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
      : isFavorite
      ? '确定要取消收藏这条内容吗？'
      : isFavorites
      ? `确定要删除选中的 ${state.confirmDialog?.favoriteIds?.length || 0} 条收藏吗？`
      : '删除后，收到新消息时该会话会重新出现在列表中。'
  const cancelLabel = isLogout ? '\u53d6\u6d88\u9000\u51fa' : isSwitchAccount ? '取消切换' : '取消'
  const submitLabel = isLogout ? '\u9000\u51fa\u767b\u5f55' : isSwitchAccount ? '切换账号' : isRevokeDevice || isRevokeOthers ? '退出设备' : isFavorite || isFavorites ? '取消收藏' : '删除'
  const submitClass = isSwitchAccount ? 'btn btn-primary' : 'btn btn-danger'
  return modalFrame(title, subtitle, `<div class="confirm-dialog-body"><p>${description}</p><div class="confirm-dialog-actions"><button class="btn" type="button" data-confirm-cancel>${cancelLabel}</button><button class="${submitClass}" type="button" data-confirm-submit>${submitLabel}</button></div></div>`)
}

async function confirmDialogAction() {
  const dialog = state.confirmDialog
  state.confirmDialog = null
  state.modal = ''
  if (!dialog) return
  if (dialog.type === 'delete-message') await handleMessageAction(dialog.mode === 'both' ? 'delete-both' : 'delete-self', dialog.messageIds || dialog.messageId, true)
  else if (dialog.type === 'delete-moment') await removeMoment(dialog.momentId, true)
  else if (dialog.type === 'delete-favorite') await removeFavorite(dialog.favoriteId)
  else if (dialog.type === 'delete-favorites') await removeSelectedFavorites(dialog.favoriteIds)
  else if (dialog.type === 'delete-conversation') await handleConversationAction(dialog.index, 'remove', true)
  else if (dialog.type === 'switch-account') switchDesktopAccount()
  else if (dialog.type === 'logout') performDesktopLogout()
  else if (dialog.type === 'revoke-device') await revokeDeviceSession(dialog.deviceId)
  else if (dialog.type === 'revoke-other-devices') await revokeOtherDeviceSessions()
  else if (dialog.type === 'group-action') await executeDesktopGroupAction(dialog)
}

function renderSendCardModal() {
  const groupItems = conversations.filter((item) => item.type === 'group')
  const friendItems = contacts.filter((item) => contactUserId(item))
  const body = `<div class="desktop-modal-results"><div class="desktop-modal-section-title">联系人</div>${friendItems.length ? friendItems.map((item) => `<button class="desktop-result-row" data-send-card="user" data-card-id="${escapeHtml(contactUserId(item))}"><span class="result-avatar">${avatar(item, 'avatar-small')}</span><span><strong>${escapeHtml(item.name)}</strong><small>个人名片</small></span>${icon('arrow')}</button>`).join('') : '<div class="desktop-modal-hint">暂无联系人</div>'}<div class="desktop-modal-section-title">群聊</div>${groupItems.length ? groupItems.map((item) => `<button class="desktop-result-row" data-send-card="group" data-card-id="${escapeHtml(item.id)}"><span class="result-avatar">${avatar(item, 'avatar-small')}</span><span><strong>${escapeHtml(item.name)}</strong><small>群名片</small></span>${icon('arrow')}</button>`).join('') : '<div class="desktop-modal-hint">暂无群聊</div>'}</div>`
  return modalFrame('发送名片', '选择一个联系人或群聊发送名片。', body)
}

function renderSendFavoriteModal() {
  const items = state.favorites || []
  const body = state.favoritesLoading
    ? '<div class="desktop-modal-hint">正在加载收藏…</div>'
    : items.length
      ? `<div class="desktop-modal-results">${items.map((item) => `<button class="desktop-result-row" data-send-favorite="${escapeHtml(item.id)}"><span class="result-avatar">${icon(Number(item.msgType) === 1 ? 'image' : Number(item.msgType) === 2 ? 'folder' : 'bookmark')}</span><span><strong>${escapeHtml(item.sourceTitle || '收藏消息')}</strong><small>${escapeHtml(desktopMessagePreview(item))}</small></span>${icon('arrow')}</button>`).join('')}</div>`
      : '<div class="desktop-modal-empty">暂无可发送的收藏</div>'
  return modalFrame('发送收藏', '把移动端收藏的消息转发到当前会话。', body)
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

function renderNewMessageModal() {
  const contactsResult = state.modalResults?.contacts || []
  const groupsResult = state.modalResults?.groups || []
  const hasResults = contactsResult.length || groupsResult.length
  const results = hasResults
    ? `<div class="desktop-modal-results">
        ${contactsResult.length ? `<div class="desktop-modal-section-title">联系人</div>${contactsResult.map((item) => `<button class="desktop-result-row" data-start-conversation="${escapeHtml(item.userId)}"><span class="result-avatar">${avatar({ name: item.nickname, avatarUrl: item.avatarUrl, tone: 'blue' }, 'avatar-small')}</span><span><strong>${escapeHtml(item.nickname)}</strong><small>${escapeHtml(item.subtitle || (item.online ? '在线' : '联系人'))}</small></span>${icon('arrow')}</button>`).join('')}` : ''}
        ${groupsResult.length ? `<div class="desktop-modal-section-title">群组</div>${groupsResult.map((item) => `<button class="desktop-result-row" data-search-conversation="${escapeHtml(item.id)}"><span class="result-avatar">${avatar({ name: item.title, avatarUrl: item.avatarUrl, tone: 'violet' }, 'avatar-small')}</span><span><strong>${escapeHtml(item.title)}</strong><small>${item.memberCount || 0} 位成员</small></span>${icon('arrow')}</button>`).join('')}` : ''}
      </div>`
    : state.modalResults ? '<div class="desktop-modal-empty">没有找到匹配的联系人或群组</div>' : '<div class="desktop-modal-hint">输入昵称、Pulse ID 或手机号开始查找。</div>'
  return modalFrame('新建消息', '查找联系人或群组，立即开始新的对话。', `<form class="desktop-modal-form" data-new-message-form><label><span>搜索</span><input data-modal-query value="${escapeHtml(state.modalQuery)}" placeholder="昵称、Pulse ID 或手机号" autocomplete="off" /><button class="btn btn-primary" type="submit" ${state.modalBusy ? 'disabled' : ''}>${state.modalBusy ? '搜索中…' : '搜索'} ${icon('search')}</button></label>${state.modalError ? `<div class="login-error">${escapeHtml(state.modalError)}</div>` : ''}</form>${results}`)
}

function renderSearchModal() {
  const result = state.modalResults || { contacts: [], groups: [], conversations: [], messages: [] }
  const messageResults = result.conversations.length ? [] : result.messages
  const hasResults = result.contacts.length || result.groups.length || result.conversations.length || messageResults.length
  const contactRows = result.contacts.map((item) => {
    const action = item.fileTransferAssistant || item.nickname === '文件传输助手'
      ? `data-start-conversation="${escapeHtml(item.userId)}"`
      : `data-view-contact="${escapeHtml(item.userId)}"`
    return `<button class="desktop-result-row" ${action}><span class="result-avatar">${avatar({ name: item.nickname, avatarUrl: item.avatarUrl, tone: 'blue' }, 'avatar-small')}</span><span><strong>${escapeHtml(item.nickname)}</strong><small>${escapeHtml(item.subtitle || (item.online ? '在线' : '联系人'))}</small></span>${icon('arrow')}</button>`
  }).join('')
  const body = `<form class="desktop-modal-form" data-search-form><label><span>全局搜索</span><input data-modal-query value="${escapeHtml(state.modalQuery)}" placeholder="搜索联系人、会话或消息" autocomplete="off" /><button class="btn btn-primary" type="submit" ${state.modalBusy ? 'disabled' : ''}>${state.modalBusy ? '搜索中…' : '搜索'} ${icon('search')}</button></label>${state.modalError ? `<div class="login-error">${escapeHtml(state.modalError)}</div>` : ''}</form>${hasResults ? `<div class="desktop-modal-results">${result.contacts.length ? `<div class="desktop-modal-section-title">联系人</div>${contactRows}` : ''}${result.conversations.length ? `<div class="desktop-modal-section-title">会话</div>${result.conversations.map((item) => `<button class="desktop-result-row" data-search-conversation="${escapeHtml(item.conversationId)}"><span class="result-avatar">${avatar({ name: item.conversationTitle, avatarUrl: item.avatarUrl, tone: 'violet' }, 'avatar-small')}</span><span><strong>${escapeHtml(item.conversationTitle)}</strong><small>${escapeHtml(desktopPreviewText(item.preview, item.lastMsgType) || `${item.matchCount || 0} 条匹配消息`)}</small></span>${icon('arrow')}</button>`).join('')}` : ''}${messageResults.length ? `<div class="desktop-modal-section-title">消息</div>${messageResults.slice(0, 8).map((item) => `<button class="desktop-result-row" data-search-conversation="${escapeHtml(item.conversationId)}"><span class="result-avatar result-message-icon">${icon('chat')}</span><span><strong>${escapeHtml(item.conversationTitle)}</strong><small>${escapeHtml(desktopPreviewText(item.content, item.msgType))}</small></span>${icon('arrow')}</button>`).join('')}` : ''}</div>` : state.modalResults ? '<div class="desktop-modal-empty">没有找到相关内容</div>' : '<div class="desktop-modal-hint">输入关键词搜索整个 Pulse。</div>'}`
  return modalFrame('全局搜索', '搜索联系人、会话和历史消息。', body)
}

function desktopSearchMessagePreview(content) {
  return desktopPreviewText(content)
}

function renderContactModal() {
  const profile = state.modalProfile || {}
  const status = profile.friendStatus === 'friend' || profile.friend ? '已是联系人' : profile.friendStatus === 'pending_sent' ? '好友申请已发送' : '还不是联系人'
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
  const displayName = String(profile.remark || '').trim() || profile.nickname || '用户'
  const remarkDetails = status === '已是联系人'
    ? `<section class="desktop-profile-section"><div class="desktop-profile-section-title">好友设置</div><button type="button" class="desktop-profile-setting-row" data-contact-remark-edit><span><strong>好友备注</strong><small>${escapeHtml(profile.remark || '暂未设置')}</small></span>${icon('edit')}</button></section>`
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
  return modalFrame('联系人资料', '查看资料或直接开始聊天。', `<div class="desktop-profile-modal">${avatar({ name: displayName, avatarUrl: profile.avatarUrl, tone: 'blue' }, 'avatar-xl')}<h2>${escapeHtml(displayName)}</h2>${profile.remark && profile.nickname ? `<p class="desktop-profile-original-name">昵称：${escapeHtml(profile.nickname)}</p>` : ''}<p class="desktop-profile-id">Pulse ID ${escapeHtml(profile.pulseId || profile.userId || '')}</p><p class="desktop-profile-signature">${escapeHtml(profile.signature || '这个人还没有填写个性签名。')}</p><span class="profile-tag">${status}</span>${details}<div class="desktop-profile-actions"><button class="btn btn-primary" data-contact-start="${escapeHtml(profile.userId || '')}">${icon('chat')} 开始聊天</button>${status === '还不是联系人' ? `<button class="btn" data-contact-add="${escapeHtml(profile.userId || '')}" ${state.modalBusy ? 'disabled' : ''}>${icon('person')} ${state.modalBusy ? '发送中…' : '添加联系人'}</button>` : ''}</div>${state.modalError ? `<div class="login-error">${escapeHtml(state.modalError)}</div>` : ''}</div>`)
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

function renderFriendRequestRow(item) {
  const pending = Number(item.status || 0) === 0
  const incoming = item.direction !== 'outgoing'
  const actions = pending && incoming
    ? `<button class="request-action accept" data-friend-action="accept" data-request-id="${escapeHtml(item.id)}" aria-label="同意">${icon('check')}</button><button class="request-action reject" data-friend-action="reject" data-request-id="${escapeHtml(item.id)}" aria-label="拒绝">${icon('close')}</button>`
    : `<span class="request-status ${Number(item.status || 0) === 1 ? 'is-success' : ''}">${friendRequestStatusText(item)}</span>`
  return `<div class="desktop-request-row"><span class="result-avatar">${avatar({ name: item.nickname, avatarUrl: item.avatarUrl, tone: 'blue' }, 'avatar-small')}</span><span><strong>${escapeHtml(item.nickname || '用户')}</strong><small>${escapeHtml(item.message || (incoming ? '请求添加你为好友' : '你发起了好友申请'))} · ${escapeHtml(formatRemoteTime(item.createdAt))}</small></span>${actions}</div>`
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
  return `<div class="desktop-request-row"><span class="result-avatar">${avatar({ name, avatarUrl: item.applicantAvatarUrl, tone: 'violet' }, 'avatar-small')}</span><span><strong>${escapeHtml(name || '用户')}</strong><small>${escapeHtml(item.message || detail)} · ${escapeHtml(formatRemoteTime(item.createdAt))}</small></span>${actions}</div>`
}

function momentInteractionTypeLabel(type) {
  if (type === 'like') return '\u70b9\u8d5e\u4e86\u4f60\u7684\u670b\u53cb\u5708'
  if (type === 'mention') return '\u5728\u670b\u53cb\u5708\u4e2d\u63d0\u9192\u4e86\u4f60'
  if (type === 'reply') return '\u56de\u590d\u4e86\u4f60\u7684\u8bc4\u8bba'
  return '\u8bc4\u8bba\u4e86\u4f60\u7684\u670b\u53cb\u5708'
}

function renderMomentInteractionRow(item) {
  const summary = item.summary || item.postPreview || '\u67e5\u770b\u8fd9\u6761\u670b\u53cb\u5708\u52a8\u6001'
  return `<button type="button" class="desktop-request-row desktop-moment-notification-row ${item.isRead ? '' : 'is-unread'}" data-moment-interaction="${escapeHtml(item.id)}" data-moment-interaction-post="${escapeHtml(item.postId)}"><span class="result-avatar">${avatar({ name: item.actorNickname, avatarUrl: item.actorAvatarUrl, tone: 'blue' }, 'avatar-small')}</span><span><strong>${escapeHtml(item.actorNickname || '\u7528\u6237')}</strong><small>${momentInteractionTypeLabel(item.type)} \u00b7 ${escapeHtml(summary)} \u00b7 ${escapeHtml(formatRemoteTime(item.createdAt))}</small></span>${item.isRead ? '' : '<i class="desktop-moment-notification-unread"></i>'}</button>`
}

function renderNotificationsModal() {
  const requests = state.friendRequests || []
  const groups = state.groupNotifications || { invites: [], joinRequests: [], events: [] }
  const sections = []
  if (state.notificationView !== 'friends' && state.momentInteractions.length) sections.push(`<div class="desktop-modal-section-title">\u670b\u53cb\u5708\u4e92\u52a8</div>${state.momentInteractions.map(renderMomentInteractionRow).join('')}`)
  if (requests.length) sections.push(`<div class="desktop-modal-section-title">新的朋友</div>${requests.map(renderFriendRequestRow).join('')}`)
  if (state.notificationView !== 'friends' && groups.invites.length) sections.push(`<div class="desktop-modal-section-title">群聊邀请</div>${groups.invites.map((item) => renderGroupNotificationRow(item, 'invite')).join('')}`)
  if (state.notificationView !== 'friends' && groups.joinRequests.length) sections.push(`<div class="desktop-modal-section-title">入群申请</div>${groups.joinRequests.map((item) => renderGroupNotificationRow(item, 'join', false)).join('')}`)
  if (state.notificationView !== 'friends' && groups.events.length) sections.push(`<div class="desktop-modal-section-title">群聊动态</div>${groups.events.map((item) => `<div class="desktop-request-row"><span class="result-avatar">${icon('group')}</span><span><strong>${escapeHtml(item.groupTitle || '群聊')}</strong><small>${escapeHtml(item.operatorNickname || '群成员')} ${escapeHtml(item.eventType || '发生了新的动态')} · ${escapeHtml(formatRemoteTime(item.createdAt))}</small></span></div>`).join('')}`)
  const body = sections.length ? `<div class="desktop-modal-results">${sections.join('')}</div>` : '<div class="desktop-modal-empty">暂无新的朋友或群聊通知</div>'
  const title = state.notificationView === 'friends' ? '新的朋友' : '消息通知'
  return modalFrame(title, '好友申请、群聊邀请和入群申请都会显示在这里。', `${state.modalBusy ? '<div class="desktop-modal-hint">正在同步通知…</div>' : ''}${state.modalError ? `<div class="login-error">${escapeHtml(state.modalError)}</div>` : ''}${body}`)
}

function contactUserId(item) {
  return String(item.userId || conversations.find((conversation) => conversation.name === item.name)?.peerUserId || '')
}

function localSearch(keyword) {
  const query = keyword.toLowerCase()
  return {
    contacts: contacts.filter((item) => `${item.name} ${item.meta}`.toLowerCase().includes(query)).map((item) => ({ userId: contactUserId(item), nickname: item.name, avatarUrl: item.avatarUrl, online: item.status === '在线', subtitle: item.meta })),
    groups: [],
    conversations: conversations.filter((item) => `${item.name} ${item.preview}`.toLowerCase().includes(query)).map((item) => ({ conversationId: String(item.id), conversationTitle: item.name, avatarUrl: item.avatarUrl, matchCount: 1, preview: item.preview })),
    messages: [],
  }
}

async function runModalSearch(keyword) {
  state.modalQuery = keyword.trim()
  state.modalError = ''
  if (!state.modalQuery) {
    state.modalResults = null
    render()
    return
  }
  state.modalBusy = true
  render()
  try {
    state.modalResults = state.dataSource === 'remote' ? await searchDesktop(state.modalQuery) : localSearch(state.modalQuery)
  } catch (error) {
    state.modalResults = localSearch(state.modalQuery)
    state.modalError = error instanceof Error ? error.message : '搜索失败，已显示本地结果'
  } finally {
    state.modalBusy = false
    render()
  }
}

function openNewMessageModal(mode = 'conversation') {
  state.modal = 'new-message'
  state.modalMode = mode
  state.modalError = ''
  state.modalQuery = ''
  state.modalResults = null
  render()
}

function openSearchModal(keyword = '') {
  state.modal = 'search'
  state.modalError = ''
  state.modalQuery = keyword.trim()
  state.modalResults = null
  render()
  if (state.modalQuery) void runModalSearch(state.modalQuery)
}

async function openContactModal(userId) {
  const fallback = contacts.find((item) => contactUserId(item) === String(userId))
  state.modal = 'contact'
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
  if (state.dataSource === 'mock') {
    state.modalProfileMoments = mockMoments.filter((item) => String(item.userId) === String(userId))
    state.modalProfileCommonGroups = conversations
      .filter((item) => isGroupConversation(item) && item.id)
      .map((item) => ({ id: String(item.id), title: item.name, avatarUrl: item.avatarUrl || '', memberCount: 0 }))
    render()
    return
  }
  if (state.dataSource !== 'remote') return
  try {
    state.modalProfile = await fetchDesktopUserProfile(String(userId))
    await loadContactProfileDetails(String(userId), state.modalProfile)
  } catch (error) {
    state.modalError = error instanceof Error ? error.message : '资料加载失败'
  } finally {
    state.modalBusy = false
    render()
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
  state.modal = section === 'groups' ? 'contact-groups' : 'contact-moments'
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
  state.scrollChatToBottom = Number(conversations[index]?.unread || 0) > 0
  state.selectedConversation = index
  clearPendingDesktopFile()
  state.showMentionPicker = false
  clearPendingDesktopMentions()
  state.mentionJumpIds = []
  clearDesktopMessageSelection()
  resetModal()
  void loadSelectedMessages()
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
      showToast('演示模式暂不支持创建新会话')
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
  if (interaction && !interaction.isRead && state.dataSource === 'remote') {
    try {
      await markDesktopMomentInteractionsRead(interaction.id)
      interaction.isRead = true
      state.momentInteractionUnreadCount = Math.max(0, state.momentInteractionUnreadCount - 1)
      state.notificationCount = Math.max(0, state.notificationCount - 1)
    } catch {
      // Opening the related post should still work when marking read fails.
    }
  }
  const cached = state.moments.find((item) => String(item.id) === String(postId))
  if (cached) {
    state.page = 'moments'
    state.momentDetail = cached
    state.modal = 'moment-detail'
    render()
    return
  }
  if (state.dataSource !== 'remote' || !postId) {
    resetModal()
    showToast('\u52a8\u6001\u4e0d\u5b58\u5728')
    return
  }
  state.modal = ''
  state.page = 'moments'
  state.modalBusy = true
  render()
  try {
    state.momentDetail = await fetchDesktopMoment(String(postId))
    state.modal = 'moment-detail'
  } catch (error) {
    showToast(error instanceof Error ? error.message : '\u52a8\u6001\u52a0\u8f7d\u5931\u8d25')
  } finally {
    state.modalBusy = false
    render()
  }
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
    state.friendPendingCount = Number(friendResult.pendingCount || 0)
    if (state.momentInteractions.length) {
      await markDesktopMomentInteractionsRead()
      state.momentInteractions = state.momentInteractions.map((item) => ({ ...item, isRead: true }))
    }
    state.momentInteractionUnreadCount = 0
    state.notificationCount = state.friendPendingCount + Number(groupResult.pendingCount || 0)
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
    state.notificationCount = Math.max(0, state.notificationCount - 1)
    state.friendPendingCount = Math.max(0, state.friendPendingCount - 1)
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
    state.notificationCount = Math.max(0, state.notificationCount - 1)
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
    headerToggle.setAttribute('aria-label', expanded ? 'Collapse contact profile' : 'Expand contact profile')
    headerToggle.setAttribute('title', expanded ? 'Collapse contact profile' : 'Expand contact profile')
  }
}

function toggleContactProfile() {
  state.contactProfileExpanded = !state.contactProfileExpanded
  syncContactProfile()
}

function openSendCardModal() {
  state.showPlusMenu = false
  state.showEmojiPanel = false
  state.modal = 'send-card'
  render()
}

async function sendDesktopContactCard(cardType, cardId) {
  const selected = conversations[state.selectedConversation]
  if (!selected?.id || !cardId) return
  const item = cardType === 'group'
    ? conversations.find((conversation) => String(conversation.id) === String(cardId))
    : contacts.find((contact) => String(contactUserId(contact)) === String(cardId))
  if (!item) return
  const payload = cardType === 'group'
    ? { cardType: 'group', conversationId: String(item.id), nickname: item.name, avatarUrl: item.avatarUrl || '' }
    : { cardType: 'user', userId: String(contactUserId(item)), nickname: item.name, avatarUrl: item.avatarUrl || '', pulseId: item.pulseId || '' }
  resetModal()
  await sendDesktopTypedMessage(JSON.stringify(payload), 5, `[名片] ${item.name}`)
}

async function openSendFavoriteModal() {
  state.showPlusMenu = false
  state.showEmojiPanel = false
  state.modal = 'send-favorite'
  state.favoritesLoaded = false
  render()
  await loadFavorites()
  render()
}

async function sendDesktopFavorite(favoriteId) {
  const selected = conversations[state.selectedConversation]
  if (!selected?.id || !favoriteId) return
  try {
    await forwardDesktopFavorite(String(favoriteId), String(selected.id))
    resetModal()
    state.scrollChatToBottom = true
    await loadSelectedMessages()
    showToast('收藏已发送')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '收藏发送失败')
  }
}

async function sendDesktopRedPacketFlow() {
  const selected = conversations[state.selectedConversation]
  if (!selected?.id || state.dataSource !== 'remote') return showToast('当前没有可发送的在线会话')
  try {
    state.walletSummary = await fetchDesktopWallet()
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

function bindEvents() {
  bindDesktopAvatarImages()
  const backButton = document.querySelector('[data-action="navigate-back"]')
  backButton?.setAttribute('aria-label', 'Back')
  backButton?.setAttribute('title', 'Back')
  if (!messageMenuDismissBound) {
    messageMenuDismissHandler = (event) => {
      if (event.button !== 0) return
      const clickTarget = event.target instanceof Element ? event.target : null
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
      if (!state.messageMenu && !state.conversationMenu && !state.fileMenu && !state.momentMenu && !state.contactMoreOpen) return
      if (event.target instanceof Element && event.target.closest('[data-message-menu-panel], [data-conversation-menu], [data-file-menu], [data-moment-menu], [data-contact-more-menu], [data-contact-more-toggle]')) return
      state.messageMenu = null
      state.conversationMenu = null
      state.fileMenu = null
      state.momentMenu = null
      state.contactMoreOpen = false
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

  document.querySelector('[data-profile-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (state.profileAvatarUploading) {
      showToast('头像上传中，请稍候')
      return
    }
    const data = new FormData(event.currentTarget)
    const nickname = String(data.get('nickname') || '').trim()
    const signature = String(data.get('signature') || '').trim()
    if (!nickname) return showToast('昵称不能为空')
    try {
      const updated = await updateDesktopProfile({ nickname, signature })
      state.profile = { ...state.profile, ...updated, userId: String(updated.userId || state.profile.userId) }
      saveDesktopSession(getDesktopToken() || '', state.profile)
      state.profileEditing = false
      showToast('资料已保存')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '资料保存失败')
    }
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
  document.querySelector('[data-storage-clear]')?.addEventListener('click', () => {
    if (window.confirm('确认清除本机缓存吗？这不会退出登录。')) void clearDesktopStorage()
  })
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
    const range = document.querySelector('[data-chat-burn-range]')
    void saveDesktopBurnSetting(event.currentTarget.checked, Number(range?.value || settings.burnSeconds))
  })
  document.querySelector('[data-chat-burn-range]')?.addEventListener('input', (event) => {
    const label = document.querySelector('[data-burn-label]')
    if (label) label.textContent = desktopDurationLabel(Number(event.currentTarget.value || 0), 'burn')
  })
  document.querySelector('[data-chat-burn-range]')?.addEventListener('change', (event) => {
    const settings = desktopConversationSettings(conversations[state.selectedConversation])
    void saveDesktopBurnSetting(true, Number(event.currentTarget.value || settings.burnSeconds))
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
      state.messagesByConversation[selected.id] = messages.map((message) => message.id === messageId
        ? { ...message, burnReadAt: result.burnReadAt, burnExpiresAt: result.burnExpiresAt }
        : message)
      state.burnClock = Date.now()
      render()
    } catch (error) {
      showToast(error instanceof Error ? error.message : '查看失败，请稍后重试')
    }
  }))

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
    state.composerText = `${textarea.value.slice(0, Math.max(0, caret - 1))}${textarea.value.slice(caret)}`
    openDesktopMentionPicker()
  })
  document.querySelectorAll('[data-mention-all]').forEach((element) => element.addEventListener('click', () => {
    pickDesktopAtAll()
  }))
  document.querySelectorAll('[data-mention-member]').forEach((element) => element.addEventListener('click', () => {
    const selected = conversations[state.selectedConversation]
    const member = desktopMentionCandidates(selected).find((item) => String(item.userId) === String(element.dataset.mentionMember || ''))
    if (member) pickDesktopMentionMember(member)
  }))
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
  document.querySelectorAll('[data-send-card]').forEach((element) => element.addEventListener('click', () => {
    void sendDesktopContactCard(element.dataset.sendCard, element.dataset.cardId)
  }))
  document.querySelectorAll('[data-send-favorite]').forEach((element) => element.addEventListener('click', () => {
    void sendDesktopFavorite(element.dataset.sendFavorite)
  }))
  document.querySelectorAll('.chat-stream').forEach((stream) => stream.addEventListener('scroll', () => {
    const conversationId = stream.dataset.conversationId || ''
    if (!conversationId) return
    const atLatest = stream.scrollHeight - stream.scrollTop - stream.clientHeight < 32
    state.chatScrollTopByConversation[conversationId] = stream.scrollTop
    state.chatAtLatestByConversation[conversationId] = atLatest
    const button = document.querySelector('[data-jump-latest]')
    if (button?.dataset.jumpConversation === conversationId) button.classList.toggle('is-visible', !atLatest)
  }))

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

  document.querySelectorAll('[data-page]').forEach((element) => element.addEventListener('click', () => {
    state.fileMenu = null
    state.momentMenu = null
    state.page = element.dataset.page
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
    state.settingsSection = element.dataset.settingsSection || 'profile'
    state.page = 'settings'
    render()
    if (state.settingsSection === 'friend-permission') void loadPrivacySettings()
  }))
  document.querySelectorAll('[data-group-conversation]').forEach((element) => element.addEventListener('click', () => {
    const nextIndex = Number(element.dataset.groupConversation)
    if (!conversations[nextIndex]) return
    state.page = 'messages'
    state.conversationFilter = '全部'
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
  document.querySelectorAll('[data-filter]').forEach((element) => element.addEventListener('click', () => {
    state.conversationFilter = element.dataset.filter
    render()
  }))
  document.querySelector('[data-theme-toggle]')?.addEventListener('click', () => {
    state.theme = state.theme === 'light' ? 'dark' : 'light'
    saveDesktopTheme(state.theme)
    render()
  })
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

  document.querySelector('#global-search')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      openSearchModal(event.currentTarget.value)
    }
  })
  document.querySelector('[data-modal-backdrop]')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) resetModal()
  })
  document.querySelectorAll('[data-modal-close]').forEach((element) => element.addEventListener('click', resetModal))
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
  document.querySelector('[data-location-current]')?.addEventListener('click', locateDesktopLocationPicker)
  document.querySelector('[data-location-recenter]')?.addEventListener('click', locateDesktopLocationPicker)
  document.querySelector('[data-location-send]')?.addEventListener('click', () => void sendDesktopSelectedLocation())
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
  document.querySelector('[data-search-form]')?.addEventListener('submit', (event) => {
    event.preventDefault()
    const input = event.currentTarget.querySelector('[data-modal-query]')
    void runModalSearch(input.value)
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
  document.querySelectorAll('[data-search-conversation]').forEach((element) => element.addEventListener('click', () => {
    selectConversationById(element.dataset.searchConversation)
  }))
  document.querySelector('[data-contact-add]')?.addEventListener('click', () => {
    void addDesktopContact(document.querySelector('[data-contact-add]').dataset.contactAdd)
  })
  document.querySelector('[data-contact-remark-edit]')?.addEventListener('click', () => {
    void editDesktopFriendRemark()
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
  document.querySelectorAll('[data-file-preview]').forEach((element) => element.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    const message = desktopMessageById(element.dataset.filePreview)
    if (message) openDesktopFilePreview(message)
  }))
  document.querySelector('[data-file-preview-download]')?.addEventListener('click', () => {
    void saveDesktopMessageMediaAs(state.filePreviewMessage)
  })
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
    if (event.target instanceof Element && event.target.closest('button, input')) return
    event.preventDefault()
    event.stopPropagation()
    toggleDesktopMessageSelection(element.dataset.messageId)
  }))
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
    const cursor = event.currentTarget.selectionStart || event.currentTarget.value.length
    const context = momentMentionContext(event.currentTarget.value, cursor)
    state.momentMentionQuery = context?.query || ''
    state.momentMentionOpen = Boolean(context)
    state.momentMentionTokenStart = context?.start ?? -1
    renderMomentMentionMenu()
  })
  document.querySelector('[data-moment-visibility]')?.addEventListener('change', (event) => {
    state.momentVisibility = Number(event.currentTarget.value || 0)
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
    render()
  })
  document.querySelectorAll('[data-moment-file-remove]').forEach((element) => element.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    const index = Number(element.dataset.momentFileRemove)
    if (!Number.isInteger(index) || index < 0) return
    state.momentFiles = state.momentFiles.filter((_, fileIndex) => fileIndex !== index)
    state.momentFileNames = state.momentFiles.map((file) => file.name)
    render()
  }))
  document.querySelectorAll('[data-moment-visible-contact]').forEach((element) => element.addEventListener('change', () => {
    const id = String(element.dataset.momentVisibleContact || '')
    const selected = new Set(state.momentVisibleUserIds)
    if (element.checked) selected.add(id)
    else selected.delete(id)
    state.momentVisibleUserIds = selected
    render()
  }))
  document.querySelectorAll('[data-moment-mention-contact]').forEach((element) => element.addEventListener('change', () => {
    const id = String(element.dataset.momentMentionContact || '')
    const selected = new Set(state.momentMentionUserIds)
    if (element.checked) selected.add(id)
    else selected.delete(id)
    state.momentMentionUserIds = selected
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
    state.momentCommentOpenId = state.momentCommentOpenId === id ? '' : id
    state.momentCommentText = ''
    render()
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
    else if (field) void editDesktopGroupField(field)
  }))
  document.querySelectorAll('[data-group-setting]').forEach((element) => element.addEventListener('change', () => {
    void toggleDesktopGroupSetting(element.dataset.groupSetting, Boolean(element.checked))
  }))
  document.querySelector('[data-group-info-open-add]')?.addEventListener('click', () => {
    state.groupInfoAddOpen = true
    render()
  })
  document.querySelector('[data-group-info-close-add]')?.addEventListener('click', () => {
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
    if (action !== 'toggle-profile-menu') state.profileMenuOpen = false
    if (action === 'navigate-back') {
      navigateDesktopBack()
      return
    }
    if (action === 'login-qr' || action === 'refresh-qr-login') {
      void beginDesktopQrLogin()
      return
    }
    if (action === 'login-password') {
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
    if (action === 'files-settings') {
      showToast('文件自动下载设置已准备好')
      return
    }
    if (action === 'open-file') {
      const sourceFiles = state.dataSource === 'remote' ? state.fileItems : mockDesktopFiles
      const file = sourceFiles.find((item) => item.id === element.dataset.fileId)
      if (!file) return
      if (file.url) window.open(resolveDesktopFileUrl(file.url), '_blank', 'noopener,noreferrer')
      showToast(`已打开 ${file.name}`)
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
    if (action === 'notifications' || action === 'new-friends') {
      void openNotificationsModal(action === 'new-friends' ? 'friends' : 'all')
      return
    }
    if (action === 'add-contact') {
      openSearchModal()
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
      render()
      return
    }
    if (action === 'edit-profile') {
      state.page = 'settings'
      state.settingsSection = 'profile'
      state.profileEditing = false
      render()
      return
    }
    if (action === 'change-avatar') {
      openDesktopAvatarPicker()
      return
    }
    if (action === 'toggle-theme') {
      state.theme = state.theme === 'light' ? 'dark' : 'light'
      saveDesktopTheme(state.theme)
      render()
      return
    }
    if (action === 'toggle-profile-menu') {
      state.profileMenuOpen = !state.profileMenuOpen
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
    if (action === 'account-security' || action === 'storage' || action === 'help') {
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
    if (action === 'login-demo') {
      stopDesktopWsConnection()
      clearDesktopSession()
      state.authenticated = true
      state.dataSource = 'mock'
      resetDesktopSocialState()
      state.loginError = ''
      render()
      void loadSelectedMessages()
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
    if (action === 'send-location') {
      state.showPlusMenu = false
      openDesktopLocationPicker()
      return
    }
    if (action === 'send-card') {
      openSendCardModal()
      return
    }
    if (action === 'send-favorite') {
      void openSendFavoriteModal()
      return
    }
    if (action === 'send-redpacket') {
      state.showPlusMenu = false
      void sendDesktopRedPacketFlow()
      return
    }
    if (action === 'send-transfer') {
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
          conversation.unread = 0
          void markDesktopConversationRead(conversationId).catch(() => {})
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
    : `<div class="message-row message-in"><div class="message-avatar">${avatar(selected, 'avatar-tiny')}</div><div><span class="message-sender">${escapeHtml(selected.name)}</span><div class="message-bubble">桌面端聊天已支持移动端的图片、视频、文件、语音、位置、名片、收藏、红包和转账。</div><time>09:38</time></div></div>`
  return `<section class="chat-panel panel-surface">
    <div class="chat-header"><div class="chat-title"><span class="avatar-wrap">${avatar(selected)}${selected.online ? '<i class="online-dot"></i>' : ''}</span><div><h2>${escapeHtml(selected.name)}</h2><p>${selected.online ? '<span class="status-green">在线</span> · ' : ''}${group ? '群聊' : 'Pulse 联系人'}</p></div></div><div class="chat-actions"><button class="subtle-icon-btn" data-action="search-chat" aria-label="Search chat">${icon('search')}</button><button class="subtle-icon-btn" data-action="more" aria-label="More">${icon('more')}</button></div></div>
    <div class="chat-security">${icon('lock')} 端到端加密 · 仅你和 ${escapeHtml(selected.name)} 可以阅读</div>
    <div class="chat-stream" data-conversation-id="${escapeHtml(selected.id)}"><div class="day-divider"><span>${state.loadingMessages ? '正在同步' : '今天'}</span></div>${rows}${state.dataSource === 'mock' ? '<div class="typing"><span></span><span></span><span></span> 对方正在输入…</div>' : ''}</div>
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
    : `<div class="message-row message-in"><div class="message-avatar">${avatar(selected, 'avatar-tiny')}</div><div><span class="message-sender">${escapeHtml(selected.name)}</span><div class="message-bubble">Desktop chat supports the same message types as mobile.</div><time>09:38</time></div></div>`
  return `<section class="chat-panel panel-surface">
     <div class="chat-header"><div class="chat-title"><span class="avatar-wrap">${avatar(selected)}${selected.online ? '<i class="online-dot"></i>' : ''}</span><div><h2>${escapeHtml(selected.name)}</h2><p>${selected.online ? '<span class="status-green">在线</span> · ' : ''}${group ? '群聊' : 'Pulse 联系人'}</p></div></div><div class="chat-actions"><button class="subtle-icon-btn" data-action="search-chat" aria-label="搜索聊天" title="搜索聊天">${icon('search')}</button><button class="subtle-icon-btn" data-action="more" aria-label="更多" title="更多">${icon('more')}</button></div></div>
     <div class="chat-security">${icon('lock')} 端到端加密</div>
     <div class="chat-stream" data-conversation-id="${escapeHtml(selected.id)}"><div class="day-divider"><span>${state.loadingMessages ? '正在同步' : '今天'}</span></div>${rows}${state.dataSource === 'mock' ? '<div class="typing"><span></span><span></span><span></span> 对方正在输入…</div>' : ''}</div>
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

function desktopSystemMessageText(content) {
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
  if (payload?.text || payload?.message) return String(payload.text || payload.message)

  const currentUserId = String(state.profile.userId || '')
  const actorIsMe = payload?.actorId != null && String(payload.actorId) === currentUserId
  const ownerIsMe = payload?.ownerId != null && String(payload.ownerId) === currentUserId
  const targetIsMe = payload?.targetId != null && String(payload.targetId) === currentUserId
  const actor = actorIsMe ? '\u4f60' : String(payload?.actorName || '\u7fa4\u6210\u5458')
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
    const duration = seconds >= 86400 ? `${Math.round(seconds / 86400)}\u5929` : `${Math.max(1, Math.round(seconds / 3600))}\u5c0f\u65f6`
    return enabled ? `${actor}\u5f00\u542f\u4e86\u81ea\u52a8\u5220\u9664\uff0c\u65b0\u6d88\u606f\u5c06\u5728${duration}\u540e\u5220\u9664` : `${actor}\u5173\u95ed\u4e86\u81ea\u52a8\u5220\u9664`
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
  return '系统消息'
}

function renderDesktopMessageRow(selected, message) {
  if (isDesktopSystemMessage(message)) {
    const text = desktopSystemMessageText(message.content)
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
    ? `<button type="button" class="message-reply-preview" data-message-reply data-reply-to-message-id="${escapeHtml(message.replyToMsgId)}" title="点击定位原消息"><strong>${escapeHtml(message.replyToNickname || '引用消息')}</strong><span class="message-reply-content">${replyMedia ? (replyMedia.isVideo ? `<span class="message-reply-media-icon">${icon('video')}</span>` : `<img src="${escapeHtml(replyMedia.url)}" alt="" loading="lazy" />`) : ''}${escapeHtml(desktopReplyPreview(message))}</span></button>`
    : ''
  const messageAvatar = message.mine ? selected : {
    name: message.fromNickname || selected.name,
    initials: (message.fromNickname || selected.name || '?').slice(0, 1),
    tone: selected.tone || 'blue',
    avatarUrl: message.fromAvatarUrl || selected.avatarUrl || '',
  }
  return `<div class="message-row ${message.mine ? 'message-out' : 'message-in'} ${state.messageMultiMode ? 'is-message-selectable ' : ''}${selectedForMulti ? 'is-message-selected' : ''}" data-message-menu data-message-multi-selectable data-message-id="${escapeHtml(messageId)}">${selectionToggle}${message.mine ? '' : `<div class="message-avatar">${avatar(messageAvatar, 'avatar-tiny')}</div>`}<div>${message.fromNickname && !message.mine ? `<span class="message-sender">${escapeHtml(message.fromNickname)}</span>` : ''}${replyPreview}<div class="message-bubble ${message.recalled ? 'message-recalled' : ''}">${renderDesktopMessageContent(message)}</div>${expiryLabel ? `<small class="message-expiry-status">${escapeHtml(expiryLabel)}</small>` : ''}<time>${escapeHtml(message.time || '')}${message.mine ? ` ${renderMessageReadStatus(selected, message)}` : ''}</time></div></div>`
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
  if (settings.autoDeleteEnabled) lines.push(`你发送的新消息将在${desktopDurationLabel(settings.autoDeleteSeconds)}后自动删除`)
  if (settings.peerAutoDeleteEnabled) lines.push(`对方发送的新消息将在${desktopDurationLabel(settings.peerAutoDeleteSeconds)}后自动删除`)
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
  const root = document.querySelector('#desktop-call-overlay-root')
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
  const root = document.querySelector('#desktop-call-overlay-root')
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
  if (desktopCallActionBound || !app) return
  desktopCallActionHandler = (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-call-action]') : null
    if (!target || !app.contains(target)) return
    event.preventDefault()
    event.stopPropagation()
    const action = target.getAttribute('data-call-action')
    if (action === 'accept') desktopCall.accept()
    else if (action === 'reject') desktopCall.reject()
    else if (action === 'mute') desktopCall.toggleMute()
    else if (action === 'camera') desktopCall.toggleCamera()
    else if (action === 'hangup') desktopCall.hangup()
  }
  app.addEventListener('click', desktopCallActionHandler)
  desktopCallActionBound = true
}

function bindDesktopCallMedia() {
  const call = desktopCall.current
  const local = document.querySelector('[data-call-local]')
  if (local instanceof HTMLVideoElement) {
    local.srcObject = call.localStream
    if (call.localStream) void local.play().catch(() => {})
  }
  const remote = document.querySelector('[data-call-remote]')
  if (remote instanceof HTMLVideoElement) {
    remote.srcObject = call.remoteStream
    if (call.remoteStream) void remote.play().catch(() => {})
  }
  call.participants.forEach((participant) => {
    const element = document.querySelector(`[data-call-participant="${CSS.escape(String(participant.userId))}"]`)
    if (element instanceof HTMLVideoElement) {
      element.srcObject = participant.stream || null
      if (participant.stream) void element.play().catch(() => {})
    }
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
  const detail = currentDesktopGroupDetail(selected) || (state.dataSource === 'mock' ? desktopMockGroupDetail(selected) : await loadDesktopGroupDetail(selected))
  const members = (detail?.members || []).map((member) => ({ userId: String(member.userId), nickname: member.nickname, avatarUrl: member.avatarUrl || '' }))
  await desktopCall.startGroup({ conversationId: String(selected.id), groupTitle: detail?.title || selected.name, mediaType, members })
}

function renderChatPanel(selected) {
  const group = selected.type === 'group'
  const groupMuteReason = desktopGroupMuteReason(selected)
  const securityAudience = group
    ? `${escapeHtml(selected.name)}\u7684\u7fa4\u6210\u5458\u53ef\u4ee5\u9605\u8bfb`
    : `\u4ec5\u4f60\u548c ${escapeHtml(selected.name)} \u53ef\u4ee5\u9605\u8bfb`
  const messages = currentMessages(selected)
  const rows = messages.length
    ? messages.map((message) => renderDesktopMessageRow(selected, message)).join('')
    : `<div class="message-row message-in"><div class="message-avatar">${avatar(selected, 'avatar-tiny')}</div><div><span class="message-sender">${escapeHtml(selected.name)}</span><div class="message-bubble">\u684c\u9762\u7aef\u804a\u5929\u5df2\u652f\u6301\u7cfb\u7edf\u6d88\u606f\u63d0\u793a\u3002</div><time>09:38</time></div></div>`
  const newMessageLabel = Number(selected.unread || 0) > 0 ? `<span class="jump-latest-count">${Number(selected.unread) > 99 ? '99+' : Number(selected.unread)} 条新消息</span>` : ''
  return `<section class="chat-panel panel-surface ${state.fileDragActive ? 'is-file-dragging' : ''}" data-file-drop-zone>
      <div class="desktop-file-drop-overlay" aria-hidden="true"><div>${icon('folder')}<strong>松开鼠标即可添加文件</strong><small>添加后可选择发送或取消</small></div></div>
     <div class="chat-header"><div class="chat-title"><span class="avatar-wrap">${avatar(selected)}${selected.online ? '<i class="online-dot"></i>' : ''}</span><div><h2>${escapeHtml(selected.name)}</h2><p>${selected.online ? '<span class="status-green">\u5728\u7ebf</span> \u00b7 ' : ''}${group ? '\u7fa4\u804a' : 'Pulse \u8054\u7cfb\u4eba'}</p></div></div><div class="chat-actions">${selected.fileTransferAssistant ? '' : `<button class="subtle-icon-btn" data-action="call-audio" aria-label="\u8bed\u97f3\u901a\u8bdd" title="\u8bed\u97f3\u901a\u8bdd">${icon('phone')}</button><button class="subtle-icon-btn" data-action="call-video" aria-label="\u89c6\u9891\u901a\u8bdd" title="\u89c6\u9891\u901a\u8bdd">${icon('video')}</button>`}<button class="subtle-icon-btn" data-action="search-chat" aria-label="\u641c\u7d22\u804a\u5929" title="\u641c\u7d22\u804a\u5929">${icon('search')}</button>${group ? `<button class="subtle-icon-btn" data-action="group-info" aria-label="\u7fa4\u804a\u8d44\u6599" title="\u7fa4\u804a\u8d44\u6599">${icon('settings')}</button>` : ''}${selected.fileTransferAssistant ? '' : `<button class="subtle-icon-btn" data-action="more" aria-label="\u66f4\u591a" title="\u66f4\u591a">${icon('more')}</button>`}</div></div>
    <div class="chat-security">${icon('lock')} \u7aef\u5230\u7aef\u52a0\u5bc6 \u00b7 ${securityAudience}</div>
      <div class="chat-history">
        <div class="chat-stream" data-conversation-id="${escapeHtml(conversationScrollKey(selected))}"><div class="day-divider"><span>${state.loadingMessages ? '\u6b63\u5728\u540c\u6b65' : (state.messageSearchQuery ? `搜索：${escapeHtml(state.messageSearchQuery)}` : '\u4eca\u5929')}</span></div>${state.messageSearchQuery ? `<div class="chat-search-summary"><span>找到 ${messages.length} 条匹配消息</span><button type="button" data-action="clear-message-search">清除搜索</button></div>` : ''}${renderDesktopSafetyNotice(selected)}${rows}${state.dataSource === 'mock' ? '<div class="typing"><span></span><span></span><span></span> \u5bf9\u65b9\u6b63\u5728\u8f93\u5165\u2026</div>' : ''}</div>
        ${state.mentionJumpIds.length && !state.messageMultiMode ? `<button class="jump-mention-btn" data-action="jump-mention" type="button" aria-label="定位到@我的消息"><span class="mention-jump-mark">@</span><span>${state.mentionJumpIds.length > 1 ? `${state.mentionJumpIds.length} 条@我` : '有人@我'}</span><span>${icon('arrow')}</span></button>` : ''}
        <button class="jump-latest-btn${newMessageLabel ? ' has-new-message' : ''}" data-action="jump-latest" data-jump-latest data-jump-conversation="${escapeHtml(conversationScrollKey(selected))}" aria-label="\u56de\u5230\u6700\u65b0\u6d88\u606f" title="\u56de\u5230\u6700\u65b0\u6d88\u606f">${newMessageLabel}${icon('arrow')}</button>
      </div>
     ${renderMessageMenu(selected)}
     ${renderMessageMultiToolbar(selected)}
       <div class="composer ${state.recordingVoice ? 'is-recording' : ''} ${groupMuteReason ? 'is-group-muted' : ''}">
        ${state.replyTarget ? `<div class="message-reply-composer"><span>${icon('chat')}</span><div><strong>回复 ${escapeHtml(state.replyTarget.fromNickname || (state.replyTarget.mine ? '自己' : selected.name))}</strong><small>${escapeHtml(desktopMessagePreview(state.replyTarget))}</small></div><button type="button" data-action="clear-reply" aria-label="取消引用">${icon('close')}</button></div>` : ''}
        ${state.showMentionPicker ? renderDesktopMentionPicker(selected) : ''}
        ${renderDesktopPendingFile(selected)}
        <div class="composer-tools">${renderDesktopComposerActions()}${selected.type === 'group' ? '<button type="button" class="composer-mention-button" data-action="mention" aria-label="提醒成员" title="提醒成员">@</button>' : ''}<button type="button" data-action="toggle-emoji" aria-label="\u8868\u60c5" title="\u8868\u60c5">${icon('smile')}</button><button type="button" class="composer-voice-button ${state.recordingVoice ? 'is-recording' : ''}" data-action="voice-record" aria-label="\u8bed\u97f3\u6d88\u606f" title="${state.recordingVoice ? '\u505c\u6b62\u5f55\u97f3' : '\u8bed\u97f3\u6d88\u606f'}">${icon('mic')}</button><span class="composer-hint">Enter \u53d1\u9001 \u00b7 Shift + Enter \u6362\u884c${state.uploadingFile ? ' \u00b7 \u6b63\u5728\u4e0a\u4f20\u2026' : ''}</span></div>
      ${state.showEmojiPanel ? `<div class="desktop-emoji-panel">${['\ud83d\ude00','\ud83d\ude02','\ud83d\ude0d','\ud83d\udc4d','\ud83d\udc4f','\ud83c\udf89','\u2764\ufe0f','\ud83d\udd25'].map((emoji) => `<button type="button" data-emoji="${emoji}">${emoji}</button>`).join('')}</div>` : ''}
         ${groupMuteReason ? `<div class="desktop-group-muted-tip">${icon('lock')} ${escapeHtml(groupMuteReason)}</div>` : ''}<textarea data-message-composer placeholder="${escapeHtml(groupMuteReason || '\u5199\u4e0b\u4f60\u7684\u6d88\u606f\u2026')}" ${state.sendingMessage || state.uploadingFile || groupMuteReason ? 'disabled' : ''}>${escapeHtml(state.composerText || '')}</textarea>
       <div class="composer-bottom"><span>${icon('lock')} ${group ? '\u7fa4\u804a\u6d88\u606f' : '\u79c1\u5bc6\u5bf9\u8bdd'}</span><button class="send-button" data-action="send" aria-label="\u53d1\u9001\u6d88\u606f" title="\u53d1\u9001\u6d88\u606f" ${state.sendingMessage || groupMuteReason ? 'disabled' : ''}>${icon('send')}</button></div><input id="desktop-file-input" class="desktop-hidden-file" type="file" accept="*/*" />
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
render()
if (state.authenticated) void loadRemoteData()

function disposeDesktopModule() {
  if (desktopModuleDisposed) return
  desktopModuleDisposed = true

  stopDesktopCallChange?.()
  stopDesktopCallChange = null
  stopDesktopCallNotice?.()
  stopDesktopCallNotice = null

  if (messageMenuDismissHandler) {
    document.removeEventListener('click', messageMenuDismissHandler)
    messageMenuDismissHandler = null
  }
  messageMenuDismissBound = false

  if (desktopCallActionHandler) {
    app.removeEventListener('click', desktopCallActionHandler)
    desktopCallActionHandler = null
  }
  desktopCallActionBound = false

  stopDesktopQrLogin()
  stopResetCountdown()
  stopRegisterCountdown()
  cancelInputDialog()
  stopDesktopExpiryTimer()
  stopDesktopWsConnection()
  desktopCall.stopBridge()

  window.clearTimeout(showToast.timer)
  showToast.timer = null
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    disposeDesktopModule()
  })
}

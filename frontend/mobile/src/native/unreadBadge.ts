import type { Channel } from '@capacitor/local-notifications'
import { getAppState } from '@/native/app'
import { isAndroid } from './platform'
import { setLauncherBadgeCount } from './badge'
import { getNotificationSettings } from '@/stores/notificationSettings'
import {
  cancelNotifications,
  createChannel,
  removeAllDeliveredNotifications,
  scheduleNotifications,
} from './localNotifications'

/** 通知栏未读汇总与单条消息通知共用的分组 key（仅 Android 生效）。 */
export const UNREAD_GROUP = 'pulse_unread'
/** 汇总通知固定 id，重复调度即原位刷新，不会重复弹。 */
export const UNREAD_SUMMARY_ID = 990_001
/** 关闭预览时“你收到了 X 条消息”固定通知 id。 */
const NO_PREVIEW_NOTIFICATION_ID = 990_002

const MESSAGE_CHANNEL_ID = 'pulse_messages'
const MESSAGE_CHANNEL_VIB_ONLY = 'pulse_messages_vib'
const MESSAGE_CHANNEL_SND_ONLY = 'pulse_messages_snd'
const MESSAGE_CHANNEL_QUIET = 'pulse_messages_quiet'
const SUMMARY_CHANNEL_ID = 'pulse_unread'
const MESSAGE_NOTIFICATION_BASE = 200_000_000
const MESSAGE_NOTIFICATION_SPAN = 10_000_000
/** 通知栏最多保留的单条消息通知条数，超出后淘汰最早一条，避免刷屏。 */
const MAX_SHADE_MESSAGES = 20
/** 关闭预览时的消息计数（归零时重置）。 */
let noPreviewCount = 0

let channelsReady: Promise<void> | null = null
let summaryTimer: number | null = null
const postedMessageIds: number[] = []

function ensureChannels(): Promise<void> {
  if (!isAndroid) return Promise.resolve()
  channelsReady ??= Promise.all([
    createChannel({
      id: MESSAGE_CHANNEL_ID,
      name: '消息通知',
      description: '收到新消息时提醒',
      importance: 4,
      vibration: true,
      lights: true,
    } as Channel).catch(() => {}),
    createChannel({
      id: MESSAGE_CHANNEL_VIB_ONLY,
      name: '消息通知（仅震动）',
      description: '收到新消息时提醒（无提示音）',
      importance: 4,
      vibration: true,
      sound: 'silent',
      lights: true,
    } as Channel).catch(() => {}),
    createChannel({
      id: MESSAGE_CHANNEL_SND_ONLY,
      name: '消息通知（仅提示音）',
      description: '收到新消息时提醒（无震动）',
      importance: 4,
      vibration: false,
      lights: true,
    } as Channel).catch(() => {}),
    createChannel({
      id: MESSAGE_CHANNEL_QUIET,
      name: '消息通知（静默）',
      description: '收到新消息时提醒（无震动无提示音）',
      importance: 4,
      vibration: false,
      sound: 'silent',
      lights: true,
    } as Channel).catch(() => {}),
    createChannel({
      id: SUMMARY_CHANNEL_ID,
      name: '未读消息汇总',
      description: '展示未读消息数量（静默）',
      importance: 2,
      vibration: false,
    } as Channel).catch(() => {}),
  ]).then(() => undefined)
  return channelsReady
}

function resolveMessageChannel(settings: { vibrate: boolean; sound: boolean }): string {
  if (settings.vibrate && settings.sound) return MESSAGE_CHANNEL_ID
  if (settings.vibrate) return MESSAGE_CHANNEL_VIB_ONLY
  if (settings.sound) return MESSAGE_CHANNEL_SND_ONLY
  return MESSAGE_CHANNEL_QUIET
}

/** 简单字符串哈希，用于把消息 id 稳定映射为通知 id，保证同一条消息去重。 */
function stableHash(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

/**
 * 判断某个会话的聊天页当前是否打开。
 * 路由形如 /chat/:id 或 /group/:id（含其子页面），匹配即视为正在聊天，
 * 此时不弹本地通知，避免打断。
 */
export function isChatOpen(conversationId: string | number | undefined | null): boolean {
  const id = String(conversationId ?? '')
  if (!id) return false
  if (typeof window === 'undefined') return false
  const path = window.location.pathname || ''
  const match = path.match(/^\/(?:chat|group)\/([^/]+)/)
  if (!match) return false
  try {
    return decodeURIComponent(match[1]) === id
  } catch {
    return match[1] === id
  }
}

/**
 * 只有应用仍在前台可见时，打开的聊天页才应抑制系统通知。
 * Android 退后台时部分 WebView 不一定及时更新 visibilityState，
 * 因此原生环境再读取一次 Capacitor App 状态兜底。
 */
async function isVisibleChat(conversationId: string): Promise<boolean> {
  if (!isChatOpen(conversationId)) return false
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return false
  if (isAndroid) {
    try {
      return (await getAppState()).isActive
    } catch {
      // 插件状态读取失败时，保留 visibilityState 作为降级判断。
    }
  }
  return true
}

/**
 * 收到新消息且当前不在该会话聊天页时，按会话更新一条通知。
 * 同一会话固定使用同一个通知 id，新消息原地替换为最新内容，
 * 避免连续发消息时锁屏/通知栏只显示旧通知。
 */
export async function notifyIncomingMessage(options: {
  messageId?: string | number | null
  conversationId?: string | number | null
  title?: string
  body?: string
}): Promise<void> {
  if (!isAndroid) return
  const settings = getNotificationSettings()
  const conversationId = String(options.conversationId ?? '')
  if (!conversationId || await isVisibleChat(conversationId)) return

  // App 内消息横幅关闭：前台收到消息时不弹系统通知（消息已在 App 内展示）
  if (
    !settings.inAppBanner &&
    typeof document !== 'undefined' &&
    document.visibilityState === 'visible'
  ) {
    return
  }

  const channelId = resolveMessageChannel(settings)
  await ensureChannels()

  // 关闭消息预览：锁屏/通知栏只显示“你收到了 X 条消息”
  if (!settings.preview) {
    noPreviewCount += 1
    await scheduleNotifications([
      {
        id: NO_PREVIEW_NOTIFICATION_ID,
        title: 'Pulse',
        body: `你收到了 ${noPreviewCount} 条消息`,
        smallIcon: 'ic_stat_pulse',
        iconColor: '#3B82F6',
        channelId,
        autoCancel: true,
      },
    ]).catch(() => {
      // 未授权通知权限或系统限制：静默跳过
    })
    return
  }

  // 每条消息一条通知：以消息 id 生成稳定通知 id，同一消息重复推送做原位替换。
  const messageId = String(options.messageId ?? '')
  const key = messageId || conversationId
  const notificationId =
    MESSAGE_NOTIFICATION_BASE + (stableHash(key) % MESSAGE_NOTIFICATION_SPAN)

  // 记录该会话已在通知栏占位；超过上限时淘汰最早的一条，保持通知栏整洁。
  if (!postedMessageIds.includes(notificationId)) {
    postedMessageIds.push(notificationId)
    while (postedMessageIds.length > MAX_SHADE_MESSAGES) {
      const oldest = postedMessageIds.shift()
      if (oldest == null) break
      void cancelNotifications([{ id: oldest }]).catch(() => {})
      }
  }

  await scheduleNotifications([
    {
      id: notificationId,
      title: options.title || 'Pulse',
      body: options.body || '你收到一条新消息',
      smallIcon: 'ic_stat_pulse',
      iconColor: '#3B82F6',
      channelId,
      autoCancel: true,
    },
  ]).catch(() => {
    // 未授权通知权限或系统限制：静默跳过，不影响角标与 App 内未读数。
  })
}

/**
 * 未读总数变化时：
 * 1. 同步桌面图标角标（原生，多桌面适配）
 * 2. 归零时清空通知栏全部消息通知（消息详情通知由 notifyIncomingMessage 逐条发布）
 */
export async function syncUnreadNotifications(total: number): Promise<void> {
  const count = Math.max(0, Math.floor(Number(total) || 0))
  await setLauncherBadgeCount(count)
  if (!isAndroid) return
  // 有未读时不清空通知栏，否则刚弹出的消息通知会被立即删掉。
  if (count > 0) return

  if (summaryTimer !== null) {
    window.clearTimeout(summaryTimer)
    summaryTimer = null
  }
  noPreviewCount = 0
  await cancelNotifications([{ id: UNREAD_SUMMARY_ID }]).catch(() => {})
  await cancelNotifications([{ id: NO_PREVIEW_NOTIFICATION_ID }]).catch(() => {})
  await removeAllDeliveredNotifications().catch(() => {})
  postedMessageIds.length = 0
}

/** 登出/会话失效时清空桌面角标与通知栏（App 内未读数由调用方一并清零）。 */
export async function resetUnreadNotifications(): Promise<void> {
  await setLauncherBadgeCount(0)
  if (!isAndroid) return
  if (summaryTimer !== null) {
    window.clearTimeout(summaryTimer)
    summaryTimer = null
  }
  noPreviewCount = 0
  await cancelNotifications([{ id: UNREAD_SUMMARY_ID }]).catch(() => {})
  await cancelNotifications([{ id: NO_PREVIEW_NOTIFICATION_ID }]).catch(() => {})
  await removeAllDeliveredNotifications().catch(() => {})
  postedMessageIds.length = 0
}

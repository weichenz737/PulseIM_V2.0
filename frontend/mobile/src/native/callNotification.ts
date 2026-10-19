import type { Channel } from '@capacitor/local-notifications'
import {
  cancelNotifications,
  createChannel,
  scheduleNotifications,
} from './localNotifications'
import { isAndroid } from './platform'
import { getNotificationSettings } from '@/stores/notificationSettings'

const CALL_CHANNEL_ID = 'pulse_calls'
const CALL_NOTIFICATION_BASE = 300_000_000
const CALL_NOTIFICATION_SPAN = 1_000_000
/** 快捷接听/拒绝的动作类型 id（与 App.vue 中的监听对应）。 */
export const CALL_QUICK_ACTION_TYPE = 'pulse_call_actions'
export const CALL_ACTION_ANSWER = 'answer'
export const CALL_ACTION_REJECT = 'reject'

let channelReady: Promise<void> | null = null

function stableHash(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

function callNotificationId(callId: string, group = false): number {
  return CALL_NOTIFICATION_BASE + (stableHash((group ? 'g:' : '') + callId) % CALL_NOTIFICATION_SPAN)
}

function ensureChannel(): Promise<void> {
  if (!isAndroid) return Promise.resolve()
  channelReady ??= createChannel({
    id: CALL_CHANNEL_ID,
    name: '通话通知',
    description: '来电与未接来电提醒',
    importance: 4,
    vibration: true,
    lights: true,
  } as Channel).catch(() => {})
  return channelReady
}

/** 来电时弹通知：锁屏/后台也能看到是谁在呼叫。 */
export async function notifyIncomingCall(options: {
  callId: string
  nickname?: string
  mediaType?: 'audio' | 'video'
  group?: boolean
  title?: string
}): Promise<void> {
  if (!isAndroid) return
  const settings = getNotificationSettings()
  // 语音/视频通话通知关闭：后台不再弹通话提醒
  if (!settings.callNotify) return
  await ensureChannel()
  const group = !!options.group
  await scheduleNotifications([
    {
      id: callNotificationId(options.callId, group),
      title: options.title || options.nickname || 'Pulse',
      body: group
        ? `${options.nickname || '群成员'}邀请你加入${options.mediaType === 'video' ? '群视频' : '群语音'}`
        : options.mediaType === 'video' ? '邀请你视频通话' : '邀请你语音通话',
      smallIcon: 'ic_stat_pulse',
      iconColor: '#3B82F6',
      channelId: CALL_CHANNEL_ID,
      actionTypeId: settings.callQuick ? CALL_QUICK_ACTION_TYPE : undefined,
      extra: {
        callId: options.callId,
        mediaType: options.mediaType || 'audio',
        group,
      },
      autoCancel: true,
    },
  ]).catch(() => {
    // 未授权通知权限或系统限制：静默跳过。
  })
}

/** 通话结束/已接听时清除来电通知。群通话需传 group=true。 */
export async function clearCallNotification(callId: string, group = false): Promise<void> {
  if (!isAndroid) return
  await cancelNotifications([{ id: callNotificationId(callId, group) }]).catch(() => {})
}

/** 未接来电：把来电通知更新为“未接来电”。 */
export async function notifyMissedCall(options: {
  callId: string
  nickname?: string
  mediaType?: 'audio' | 'video'
  group?: boolean
  title?: string
}): Promise<void> {
  if (!isAndroid) return
  const settings = getNotificationSettings()
  if (!settings.callNotify) return
  await ensureChannel()
  const group = !!options.group
  await scheduleNotifications([
    {
      id: callNotificationId(options.callId, group),
      title: options.title || options.nickname || 'Pulse',
      body: group
        ? `未接${options.mediaType === 'video' ? '群视频' : '群语音'}`
        : options.mediaType === 'video' ? '未接视频通话' : '未接语音通话',
      smallIcon: 'ic_stat_pulse',
      iconColor: '#3B82F6',
      channelId: CALL_CHANNEL_ID,
      autoCancel: true,
    },
  ]).catch(() => {
    // 未授权通知权限或系统限制：静默跳过。
  })
}

import { defineStore } from 'pinia'
import { ref } from 'vue'

const PREVIEW_KEY = 'pulse_notify_preview'
const CALL_QUICK_KEY = 'pulse_notify_call_quick'
const INAPP_BANNER_KEY = 'pulse_notify_inapp_banner'
const CALL_NOTIFY_KEY = 'pulse_notify_call'
const VIBRATE_KEY = 'pulse_notify_vibrate'
const SOUND_KEY = 'pulse_notify_sound'

export interface NotificationSettings {
  /** 通知显示消息预览：关闭后锁屏/通知栏只显示“你收到了 X 条消息” */
  preview: boolean
  /** 通话快捷窗口接听：开启后来电通知带接听/拒绝按钮 */
  callQuick: boolean
  /** App 内消息横幅：关闭后前台不弹消息横幅 */
  inAppBanner: boolean
  /** 语音/视频通话通知：关闭后后台不再接收通话提醒 */
  callNotify: boolean
  /** 消息震动 */
  vibrate: boolean
  /** 消息提示音 */
  sound: boolean
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  preview: true,
  callQuick: true,
  inAppBanner: true,
  callNotify: true,
  vibrate: true,
  sound: true,
}

function readBool(key: string, def: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    if (v == null) return def
    return v === '1' || v === 'true'
  } catch {
    return def
  }
}

function writeBool(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    /* ignore */
  }
}

/** 读取当前通知设置（通知代码在模块作用域使用，需同步读取）。 */
export function getNotificationSettings(): NotificationSettings {
  return {
    preview: readBool(PREVIEW_KEY, DEFAULT_NOTIFICATION_SETTINGS.preview),
    callQuick: readBool(CALL_QUICK_KEY, DEFAULT_NOTIFICATION_SETTINGS.callQuick),
    inAppBanner: readBool(INAPP_BANNER_KEY, DEFAULT_NOTIFICATION_SETTINGS.inAppBanner),
    callNotify: readBool(CALL_NOTIFY_KEY, DEFAULT_NOTIFICATION_SETTINGS.callNotify),
    vibrate: readBool(VIBRATE_KEY, DEFAULT_NOTIFICATION_SETTINGS.vibrate),
    sound: readBool(SOUND_KEY, DEFAULT_NOTIFICATION_SETTINGS.sound),
  }
}

export const useNotificationSettingsStore = defineStore('notificationSettings', () => {
  const initial = getNotificationSettings()
  const preview = ref(initial.preview)
  const callQuick = ref(initial.callQuick)
  const inAppBanner = ref(initial.inAppBanner)
  const callNotify = ref(initial.callNotify)
  const vibrate = ref(initial.vibrate)
  const sound = ref(initial.sound)

  function setPreview(value: boolean) {
    preview.value = value
    writeBool(PREVIEW_KEY, value)
  }
  function setCallQuick(value: boolean) {
    callQuick.value = value
    writeBool(CALL_QUICK_KEY, value)
  }
  function setInAppBanner(value: boolean) {
    inAppBanner.value = value
    writeBool(INAPP_BANNER_KEY, value)
  }
  function setCallNotify(value: boolean) {
    callNotify.value = value
    writeBool(CALL_NOTIFY_KEY, value)
  }
  function setVibrate(value: boolean) {
    vibrate.value = value
    writeBool(VIBRATE_KEY, value)
  }
  function setSound(value: boolean) {
    sound.value = value
    writeBool(SOUND_KEY, value)
  }

  return {
    preview,
    callQuick,
    inAppBanner,
    callNotify,
    vibrate,
    sound,
    setPreview,
    setCallQuick,
    setInAppBanner,
    setCallNotify,
    setVibrate,
    setSound,
  }
})

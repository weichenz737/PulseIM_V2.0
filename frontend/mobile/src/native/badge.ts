import { registerPlugin } from '@capacitor/core'
import { isAndroid } from './platform'

interface PulseBadgePlugin {
  setCount(options: { count: number }): Promise<{ count: number }>
}

const PulseBadge = registerPlugin<PulseBadgePlugin>('PulseBadge')

/**
 * 更新桌面（启动器）图标角标。
 *
 * 仅 Android 生效：由原生插件按主流桌面（小米/华为/荣耀/三星/OPPO/vivo 等）
 * 分别写入角标；Web / iOS 下为安全空操作，不影响消息主流程。
 */
export async function setLauncherBadgeCount(count: number): Promise<void> {
  if (!isAndroid) return
  const safe = Math.max(0, Math.min(999, Math.floor(Number(count) || 0)))
  try {
    await PulseBadge.setCount({ count: safe })
  } catch {
    // 角标为尽力而为，失败不阻塞消息链路。
  }
}

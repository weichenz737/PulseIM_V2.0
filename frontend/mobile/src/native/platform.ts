import { Capacitor } from '@capacitor/core'

export type NativePlatform = 'android' | 'ios' | 'web'

export const nativePlatform = Capacitor.getPlatform() as NativePlatform
export const isNativeApp = Capacitor.isNativePlatform()
export const isAndroid = nativePlatform === 'android'
export const isIOS = nativePlatform === 'ios'

export function isPluginAvailable(name: string) {
  return Capacitor.isPluginAvailable(name)
}

import { registerPlugin } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { isAndroid } from './platform'

export type StatusBarTheme = 'light' | 'dark'

interface PulseSystemBarPlugin {
  apply(options: { color: string; darkIcons: boolean; backgroundColor?: string }): Promise<{
    color: string
    darkIcons: boolean
  }>
  getInsets(): Promise<{ top: number }>
}

const PulseSystemBar = registerPlugin<PulseSystemBarPlugin>('PulseSystemBar')

export function showStatusBar() {
  return StatusBar.show()
}

export function hideStatusBar() {
  return StatusBar.hide()
}

export function setStatusBarOverlay(overlay: boolean) {
  return StatusBar.setOverlaysWebView({ overlay })
}

export function setStatusBarColor(color: string) {
  return StatusBar.setBackgroundColor({ color })
}

export function setStatusBarTheme(theme: StatusBarTheme) {
  // Capacitor's Style describes icon color, not the application theme.
  // A light application theme needs dark icons and vice versa.
  return StatusBar.setStyle({ style: theme === 'light' ? Style.Dark : Style.Light })
}

export function applyNativeStatusBar(
  color: string,
  theme: StatusBarTheme,
  backgroundColor = color,
) {
  if (!isAndroid) return Promise.resolve()
  return PulseSystemBar.apply({
    color,
    darkIcons: theme === 'light',
    backgroundColor,
  }).then(() => undefined)
}

export function getNativeSafeAreaInsets() {
  if (!isAndroid) return Promise.resolve({ top: 0 })
  return PulseSystemBar.getInsets()
}

import type { PluginListenerHandle } from '@capacitor/core'
import type { Router } from 'vue-router'
import { closeDialog, showToast } from 'vant'
import { closeMediaVideoPreview, mediaVideoPreviewState } from '@/composables/useMediaVideoPreview'
import { closeFilePreview, filePreviewState } from '@/composables/useFilePreview'
import { smartBack } from '@/utils/navBack'
import { exitApp, onBackButton, setBackButtonHandlerEnabled } from './app'
import {
  onKeyboardDidHide,
  onKeyboardDidShow,
  onKeyboardWillHide,
  onKeyboardWillShow,
} from './keyboard'
import { isAndroid, isNativeApp } from './platform'
import { getOrientation, onOrientationChange, unlockOrientation } from './orientation'
import {
  applyNativeStatusBar,
  setStatusBarColor,
  setStatusBarOverlay,
  setStatusBarTheme,
  showStatusBar,
} from './statusBar'

const ROOT_ROUTES = new Set(['/app/messages', '/app/contacts', '/app/discover', '/app/me'])
const handles: PluginListenerHandle[] = []
let themeObserver: MutationObserver | null = null
let removeRouteStatusHook: (() => void) | null = null
let lastRootBackAt = 0

function isVisibleModalLayer(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element)
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false
  const rect = element.getBoundingClientRect()
  if (rect.width < 2 || rect.height < 2) return false
  if (element.classList.contains('mask')) {
    const coversViewport = rect.width >= window.innerWidth * 0.65 && rect.height >= window.innerHeight * 0.65
    if (!coversViewport || style.position !== 'fixed') return false
  }
  return true
}

function layerZIndex(element: HTMLElement): number {
  const value = Number.parseInt(window.getComputedStyle(element).zIndex || '0', 10)
  return Number.isFinite(value) ? value : 0
}

function visibleLayers(selector: string): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(isVisibleModalLayer)
}

/** Android 返回键只关闭最上层弹层；即使业务弹层处于提交中不可关闭，也要消费本次返回。 */
function closeTopmostModalLayer(): boolean {
  const layers = visibleLayers([
    '.van-popup:not(.van-toast):not(.van-notify)',
    '.van-image-preview',
    '.dialog-mask',
    '.sheet-mask',
    '.forced-update-mask',
    '.mask',
  ].join(','))
  if (!layers.length) return false

  const top = layers
    .map((element, index) => ({ element, index, zIndex: layerZIndex(element) }))
    .sort((a, b) => b.zIndex - a.zIndex || b.index - a.index)[0].element

  // 强制更新不允许绕过，但返回键也不能穿透到页面导航。
  if (top.classList.contains('forced-update-mask') || top.closest('.forced-update-mask')) return true

  if (top.classList.contains('van-dialog') || top.querySelector('.van-dialog')) {
    closeDialog()
    return true
  }

  const closeControl = top.querySelector<HTMLElement>([
    '.van-image-preview__close-icon',
    '.van-popup__close-icon',
    '.van-action-sheet__cancel',
    '.van-dialog__cancel',
    '[data-native-back-close]',
    '[aria-label="关闭"]',
    '[aria-label="取消"]',
    '.dialog-cancel',
    '.dialog-btn.ghost',
    '.close-btn',
    '.cancel-btn',
  ].join(','))
  if (closeControl) {
    closeControl.click()
    return true
  }

  if (top.classList.contains('van-popup') || top.classList.contains('van-image-preview')) {
    const topZIndex = layerZIndex(top)
    const overlay = visibleLayers('.van-overlay')
      .filter((element) => layerZIndex(element) <= topZIndex)
      .sort((a, b) => layerZIndex(b) - layerZIndex(a))[0]
    overlay?.click()
    return true
  }

  top.click()
  return true
}

function emit(name: string, detail?: unknown, cancelable = false): boolean {
  return window.dispatchEvent(new CustomEvent(name, { detail, cancelable }))
}

function syncOrientation(type: string) {
  const landscape = type.startsWith('landscape') || window.innerWidth > window.innerHeight
  document.documentElement.dataset.orientation = landscape ? 'landscape' : 'portrait'
  emit('pulse:orientation-change', { type, landscape })
}

async function syncStatusBarTheme() {
  if (!isNativeApp) return
  const lightTheme = document.documentElement.dataset.theme === 'light'
  const locationOverlay = Boolean(document.querySelector('.location-page'))
  const immersiveMoments = Boolean(document.querySelector('.moments-page'))
  // 直接读取当前页面顶部导航栏的背景色，让系统状态栏与其保持同色，
  // 渐变背景取顶部第一个色标；半透明背景回退到页面底色。
  // 地图选择页是全屏覆盖层，状态栏必须透明，才能让地图继续绘制到系统图标下方。
  const pageTopColor = resolvePageTopColor(lightTheme)
  const color = locationOverlay || immersiveMoments ? '#00000000' : pageTopColor
  // Android 15/16 ignores opaque status-bar colors and shows whatever is
  // behind the transparent bar. Keep that fallback themed as well, otherwise
  // the launch Window background can appear as a black strip above the page.
  const backgroundColor = lightTheme ? '#f7faff' : '#121317'
  // The Moments cover continues behind the system icons in both app themes,
  // so keep the icons white while that route is visible.
  const statusBarTheme = locationOverlay || immersiveMoments ? 'dark' : (lightTheme ? 'light' : 'dark')
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', color)
  document.documentElement.style.backgroundColor = color === '#00000000' ? backgroundColor : color
  await setStatusBarTheme(statusBarTheme).catch(() => {})
  await setStatusBarColor(color).catch(() => {})
  await applyNativeStatusBar(color, statusBarTheme, backgroundColor).catch(() => {})
}

function rgbToHex(parts: number[]): string {
  return '#' + parts
    .slice(0, 3)
    .map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0'))
    .join('')
}

function resolvePageTopColor(lightTheme: boolean): string {
  const candidates = [
    '.login-page',
    '.chat-header',
    '.page-header',
    '.header',
    '.top-bar',
    '.topbar',
    '.head-area',
    '.hero-header',
    '.hero-section',
    '.moments-header',
    '.wallet-header',
    '.compose-header',
    '.pay-header',
    '.messages-page',
  ]
  for (const selector of candidates) {
    const header = document.querySelector<HTMLElement>(selector)
    if (!header) continue
    const style = window.getComputedStyle(header)
    const solid = parseSolidColor(style.backgroundColor)
    if (solid) return solid
    const gradientTop = firstGradientColor(style.backgroundImage)
    if (gradientTop) return gradientTop
  }
  // 头部为半透明/无背景时，回退到路由页面根背景
  const pageRoot = document.querySelector<HTMLElement>('.route-page')
  if (pageRoot) {
    const style = window.getComputedStyle(pageRoot)
    const solid = parseSolidColor(style.backgroundColor)
    if (solid) return solid
    const gradientTop = firstGradientColor(style.backgroundImage)
    if (gradientTop) return gradientTop
  }
  return lightTheme ? '#f7faff' : '#121317'
}

function parseSolidColor(value: string): string | null {
  const match = value && value.match(/rgba?\(([^)]+)\)/)
  if (!match) return null
  const parts = match[1].split(',').map((s) => parseFloat(s.trim()))
  const alpha = parts.length > 3 ? parts[3] : 1
  if (alpha < 1 || parts.length < 3) return null
  return rgbToHex(parts)
}

function firstGradientColor(value: string): string | null {
  if (!value || !value.includes('gradient')) return null
  const match = value.match(/rgba?\([^)]+\)/)
  if (!match) return null
  const parts = match[0].replace(/^rgba?\(|\)$/g, '').split(',').map((s) => parseFloat(s.trim()))
  if (parts.length < 3) return null
  return rgbToHex(parts)
}

async function bindStatusBar() {
  await showStatusBar().catch(() => {})
  // targetSdk 35+ ignores opaque status-bar colors on recent Android.
  // Overlaying the WebView makes the safe-area header/root background visible
  // behind the system icons instead of exposing the Android theme's white area.
  await setStatusBarOverlay(true).catch(() => {})
  await syncStatusBarTheme()
  themeObserver = new MutationObserver(() => void syncStatusBarTheme())
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
}

async function bindKeyboard() {
  handles.push(
    await onKeyboardWillShow(({ keyboardHeight }) => {
      document.documentElement.classList.add('native-keyboard-open')
      document.documentElement.style.setProperty('--pulse-keyboard-height', `${keyboardHeight}px`)
      emit('pulse:native-keyboard', { visible: true, keyboardHeight })
    }),
    await onKeyboardDidShow(({ keyboardHeight }) => {
      emit('pulse:native-keyboard-settled', { visible: true, keyboardHeight })
    }),
    await onKeyboardWillHide(() => {
      document.documentElement.classList.remove('native-keyboard-open')
      document.documentElement.style.setProperty('--pulse-keyboard-height', '0px')
      emit('pulse:native-keyboard', { visible: false, keyboardHeight: 0 })
    }),
    await onKeyboardDidHide(() => {
      emit('pulse:native-keyboard-settled', { visible: false, keyboardHeight: 0 })
    }),
  )
}

async function bindOrientation() {
  await unlockOrientation().catch(() => {})
  const current = await getOrientation().catch(() => null)
  syncOrientation(current?.type || screen.orientation?.type || '')
  handles.push(
    await onOrientationChange(({ type }) => {
      syncOrientation(type)
    }),
  )
}

async function bindAndroidBack(router: Router) {
  if (!isAndroid) return
  await setBackButtonHandlerEnabled(true).catch(() => {})
  handles.push(
    await onBackButton(() => {
      if (closeTopmostModalLayer()) return

      // FilePreviewOverlay is a global layer rather than a route. It must
      // consume the first Android back press before page-level handlers run;
      // otherwise ChatView's normal back handler navigates to the home page.
      if (filePreviewState.visible) {
        closeFilePreview()
        return
      }

      const unhandled = emit('pulse:native-back', undefined, true)
      if (!unhandled) return

      if (mediaVideoPreviewState.visible) {
        closeMediaVideoPreview()
        return
      }
      const route = router.currentRoute.value
      if (!ROOT_ROUTES.has(route.path)) {
        smartBack(router)
        return
      }

      const now = Date.now()
      if (now - lastRootBackAt < 1800) {
        void exitApp()
        return
      }
      lastRootBackAt = now
      showToast('再按一次退出应用')
    }),
  )
}

export async function initializeNativeShell(router: Router) {
  document.documentElement.classList.toggle('capacitor-native', isNativeApp)
  syncOrientation(screen.orientation?.type || '')
  if (!isNativeApp) return
  removeRouteStatusHook = router.afterEach(() => {
    requestAnimationFrame(() => void syncStatusBarTheme())
  })
  await Promise.all([
    bindStatusBar(),
    bindKeyboard(),
    bindOrientation(),
    bindAndroidBack(router),
  ])
}

export async function destroyNativeShell() {
  themeObserver?.disconnect()
  themeObserver = null
  removeRouteStatusHook?.()
  removeRouteStatusHook = null
  const current = handles.splice(0)
  await Promise.all(current.map((handle) => handle.remove().catch(() => {})))
}

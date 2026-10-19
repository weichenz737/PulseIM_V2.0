import { createApp } from 'vue'
import { createPinia } from 'pinia'
import {
  Tabbar,
  TabbarItem,
  Toast,
  ActionSheet,
  Loading,
  Dialog,
  SwipeCell,
  Checkbox,
  Popup,
  ImagePreview,
  Overlay,
  Calendar,
  PullRefresh,
  Picker,
  DatePicker,
  Area,
} from 'vant'
import App from './App.vue'
import router from './router'
import { usePreferenceStore } from '@/stores/preference'
import { initializeNativeShell, isNativeApp } from '@/native'
import { initializeNativeBinaryFetch } from '@/native/binaryFetch'
import { hideSplashScreen } from '@/native/splashScreen'
import { applyNativeStatusBar, getNativeSafeAreaInsets } from '@/native/statusBar'
import { initializeImRuntime } from '@/im/runtime'
import { initializeServerOrigin } from '@/config/endpoints'
import 'vant/lib/index.css'
import './styles/global.css'

document.documentElement.classList.toggle('capacitor-native', isNativeApp)

// CapacitorHttp's patched fetch returns binary responses as text by default.
// Install the explicit arraybuffer adapter before any avatar or moment media
// request can start.
initializeNativeBinaryFetch()

/** 禁止页面缩放（含 iOS 双指捏合） */
function disablePageZoom() {
  const block = (e: Event) => {
    e.preventDefault()
  }
  document.addEventListener('gesturestart', block, { passive: false })
  document.addEventListener('gesturechange', block, { passive: false })
  document.addEventListener('gestureend', block, { passive: false })
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1) e.preventDefault()
    },
    { passive: false },
  )
}

/** 屏蔽 iOS/Safari 长按系统菜单（输入框除外）
 * 注意：不要全局 preventDefault selectstart，会在 iOS 上导致按钮/列表点不开
 */
function disableSystemCallout() {
  const isEditable = (t: EventTarget | null) => {
    if (!(t instanceof Element)) return false
    return !!t.closest('input, textarea, [contenteditable="true"]')
  }
  document.addEventListener(
    'contextmenu',
    (e) => {
      if (isEditable(e.target)) return
      e.preventDefault()
    },
    { capture: true },
  )
}

disablePageZoom()
disableSystemCallout()

/** 标记端类型，供样式按平台区分（如消息列表紧凑布局仅安卓） */
function markClientPlatform() {
  const ua = navigator.userAgent || ''
  const root = document.documentElement
  if (/Android/i.test(ua)) {
    root.dataset.platform = 'android'
    return
  }
  if (/iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1)) {
    root.dataset.platform = 'ios'
    return
  }
  root.dataset.platform = 'other'
}

markClientPlatform()

/**
 * Set the native backdrop before the first route is mounted. Android 15/16
 * renders the status bar transparently, so a stale launch-window color can
 * otherwise remain visible as a black strip while the JS shell is starting.
 */
function syncInitialNativeBackground() {
  if (!isNativeApp) return
  const color = '#f7faff'
  document.documentElement.style.backgroundColor = color
  void applyNativeStatusBar(color, 'light', color).catch(() => {})
}

syncInitialNativeBackground()

/**
 * 安卓系统「字体大小/显示大小」会把 WebView 里的 px 一起放大。
 * 用探针测实际渲染高度，整体 zoom 回设计稿比例，避免整机看起来偏大。
 */
function compensateAndroidFontScale() {
  if (document.documentElement.dataset.platform !== 'android') return
  try {
    const probe = document.createElement('div')
    probe.setAttribute('aria-hidden', 'true')
    probe.style.cssText =
      'position:absolute;left:-99999px;top:0;margin:0;padding:0;border:0;visibility:hidden;pointer-events:none;font-size:100px;line-height:100px;font-family:sans-serif;'
    probe.textContent = '汉A'
    document.documentElement.appendChild(probe)
    const h = probe.getBoundingClientRect().height || 0
    probe.remove()
    if (h <= 0) return
    const scale = h / 100
    // 略放大才补偿；上限避免缩太狠
    if (scale > 1.06) {
      const zoom = Math.max(0.78, Math.min(1, 1 / scale))
      document.documentElement.style.zoom = String(Number(zoom.toFixed(4)))
      document.documentElement.dataset.androidFontScale = scale.toFixed(2)
    }
  } catch {
    /* ignore */
  }
}

compensateAndroidFontScale()

/**
 * 校准顶部安全区：部分安卓机浏览器已把布局避开状态栏，却仍回报 safe-area-inset-top，
 * 再叠加 CSS 就会顶空白过大。写入 --pulse-safe-top 供各页统一使用。
 *
 * 注意：软键盘弹起会触发 resize / visualViewport.resize，此时切勿重算，
 * 否则会把错误的安全区写进 CSS 变量，导致所有页面顶栏一起下移。
 */
let lockedSafeTopPx: number | null = null

function isSoftKeyboardOpen(): boolean {
  const vv = window.visualViewport
  if (!vv) return false
  // 可视高度明显小于布局高度，或 visualViewport 被顶起
  return window.innerHeight - vv.height > 80 || vv.offsetTop > 24
}

function computeSafeAreaTopPx(): number {
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:absolute;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top, 0px);'
  document.documentElement.appendChild(probe)
  let reported = parseFloat(getComputedStyle(probe).paddingTop) || 0
  probe.remove()

  // Capacitor controls edge-to-edge layout. Trust the WebView inset and skip
  // browser-only status-bar heuristics based on screen.availHeight.
  if (isNativeApp) {
    // Native Android reports the real inset asynchronously through the plugin.
    // Do not inject a guessed 24px value here: on non-edge-to-edge devices it
    // is an extra blank band, and on the first route swap it can expose the
    // WebView/decor background between two differently sized layers.
    return Math.max(0, Math.min(reported, 59))
  }

  // 启发式：可视高度已接近 availHeight（未延伸进状态栏），却仍有较大 inset → 视为重复留白
  const screenH = window.screen?.height || 0
  const availH = window.screen?.availHeight || screenH
  const statusGuess = Math.max(0, screenH - availH)
  const layoutH = window.innerHeight
  if (
    reported >= 20 &&
    statusGuess >= 16 &&
    Math.abs(layoutH - availH) <= 12 &&
    reported >= statusGuess - 8
  ) {
    reported = 0
  }

  // 异常偏大时限幅（动态岛约 59）
  return Math.max(0, Math.min(reported, 59))
}

function syncSafeAreaTopVar(force = false) {
  if (!force && isSoftKeyboardOpen()) return
  if (!force && lockedSafeTopPx !== null) {
    document.documentElement.style.setProperty('--pulse-safe-top', `${lockedSafeTopPx}px`)
    return
  }
  const reported = Math.round(computeSafeAreaTopPx())
  lockedSafeTopPx = reported
  document.documentElement.style.setProperty('--pulse-safe-top', `${reported}px`)
}

syncSafeAreaTopVar(true)
if (isNativeApp) {
  void getNativeSafeAreaInsets()
    .then(({ top }) => {
      const nativeTop = Math.round(Math.max(0, Math.min(Number(top) || 0, 59)))
      if (nativeTop <= 0) return
      lockedSafeTopPx = nativeTop
      document.documentElement.style.setProperty('--pulse-safe-top', `${nativeTop}px`)
    })
    .catch(() => {
      // Keep the CSS environment value when the optional native probe fails.
    })
}
window.addEventListener('resize', () => syncSafeAreaTopVar(false))
window.addEventListener('orientationchange', () => {
  lockedSafeTopPx = null
  window.setTimeout(() => syncSafeAreaTopVar(true), 280)
})
// 不在 visualViewport.resize 上重算安全区（键盘开合会误伤全局顶栏）

/**
 * Keep the application shell aligned with the part of the WebView that is
 * actually visible above the soft keyboard. Native Android normally resizes
 * the WebView, but fullscreen/edge-to-edge devices can keep the CSS viewport
 * at its old height. The native keyboard plugin exposes the IME height in a
 * CSS variable; browsers expose the same boundary through visualViewport.
 * Keeping this at the shell level makes every form page behave consistently.
 */
function viewportLayoutHeight(): number {
  return Math.max(1, Math.round(Math.max(window.innerHeight, document.documentElement.clientHeight || 0)))
}

function setKeyboardBaseViewportHeight(height: number) {
  keyboardBaseViewportHeight = Math.max(1, Math.round(height))
  document.documentElement.style.setProperty(
    '--pulse-keyboard-base-height',
    `${keyboardBaseViewportHeight}px`,
  )
}

// Keep a closed-keyboard baseline. Never replace it while the IME animation
// is in progress: on some Android WebViews adjustResize fires before the
// keyboard plugin event, while others report the plugin event first.
let keyboardBaseViewportHeight = viewportLayoutHeight()
setKeyboardBaseViewportHeight(keyboardBaseViewportHeight)
let keyboardViewportRaf = 0

function isEditableTarget(target: Element | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLElement && target.isContentEditable
}

function syncKeyboardViewport() {
  keyboardViewportRaf = 0
  const root = document.documentElement
  const visualViewport = window.visualViewport
  const nativeKeyboardOpen = root.classList.contains('native-keyboard-open')
  const activeEditable = isEditableTarget(document.activeElement)
  const layoutHeight = viewportLayoutHeight()
  const visualBottom = visualViewport
    ? Math.round(visualViewport.offsetTop + visualViewport.height)
    : layoutHeight
  const layoutDrop = Math.max(0, keyboardBaseViewportHeight - layoutHeight)
  const visualDrop = Math.max(0, keyboardBaseViewportHeight - visualBottom)
  const keyboardHeight = Number.parseFloat(
    getComputedStyle(root).getPropertyValue('--pulse-keyboard-height'),
  ) || 0
  const keyboardOpen = nativeKeyboardOpen || keyboardHeight > 48 || layoutDrop > 80 || visualDrop > 80

  // During keyboard hide Android can clear the native class while the WebView
  // is still shortened. Do not record that shortened height as the next
  // closed-keyboard baseline.
  if (!keyboardOpen && !activeEditable) {
    setKeyboardBaseViewportHeight(layoutHeight)
    root.classList.remove('pulse-keyboard-open')
    root.style.removeProperty('--pulse-viewport-height')
    root.style.setProperty('--pulse-keyboard-offset', '0px')
    return
  }

  if (!keyboardOpen) {
    if (!nativeKeyboardOpen) {
      root.classList.remove('pulse-keyboard-open')
      root.style.removeProperty('--pulse-viewport-height')
    }
    root.style.setProperty('--pulse-keyboard-offset', '0px')
    return
  }

  const nativeLayoutAlreadyResized = nativeKeyboardOpen && layoutDrop > 48
  const bothViewportsResized = nativeKeyboardOpen && layoutDrop > 48 && visualDrop > 48
  const nativeVisibleHeight = nativeKeyboardOpen && keyboardHeight > 0 && !nativeLayoutAlreadyResized
    ? Math.max(1, keyboardBaseViewportHeight - keyboardHeight)
    : 0
  const visibleHeight = nativeLayoutAlreadyResized
    ? (bothViewportsResized ? Math.max(layoutHeight, visualBottom) : layoutHeight)
    : nativeVisibleHeight > 0
      ? nativeVisibleHeight
      : Math.min(layoutHeight, visualBottom)
  const keyboardOffset = nativeLayoutAlreadyResized
    ? 0
    : Math.max(keyboardHeight, Math.max(0, keyboardBaseViewportHeight - visualBottom))

  root.classList.add('pulse-keyboard-open')
  root.style.setProperty('--pulse-viewport-height', `${visibleHeight}px`)
  root.style.setProperty('--pulse-keyboard-offset', `${Math.round(keyboardOffset)}px`)
}

function scheduleKeyboardViewport() {
  if (keyboardViewportRaf) return
  keyboardViewportRaf = window.requestAnimationFrame(syncKeyboardViewport)
}

function scheduleKeyboardViewportAfterNativeHide() {
  scheduleKeyboardViewport()
  // Android vendors do not finish adjustResize/visualViewport restoration at
  // the same time as the native keyboard hide callback. Recheck after the
  // hide animation so a focused textarea cannot leave the page at the old
  // keyboard height.
  for (const delay of [80, 180, 360, 600]) {
    window.setTimeout(scheduleKeyboardViewport, delay)
  }
}

function onNativeKeyboardViewportEvent(event: Event) {
  scheduleKeyboardViewport()
  const visible = (event as CustomEvent<{ visible?: boolean }>).detail?.visible
  if (visible === false) scheduleKeyboardViewportAfterNativeHide()
}

document.addEventListener('focusin', (event) => {
  if (isEditableTarget(event.target as Element | null)) {
    // Keep the full-height baseline captured while the keyboard is closed.
    // On Android adjustResize can run before focusin reaches the WebView;
    // sampling innerHeight here would capture the already-shortened height
    // and subtract the IME a second time.
    scheduleKeyboardViewport()
  }
}, true)
document.addEventListener('focusout', scheduleKeyboardViewport, true)
window.addEventListener('resize', scheduleKeyboardViewport)
window.addEventListener('orientationchange', () => {
  if (
    !document.documentElement.classList.contains('native-keyboard-open')
    && !isEditableTarget(document.activeElement)
  ) {
    setKeyboardBaseViewportHeight(viewportLayoutHeight())
  }
  scheduleKeyboardViewport()
})
window.visualViewport?.addEventListener('resize', scheduleKeyboardViewport)
window.visualViewport?.addEventListener('scroll', scheduleKeyboardViewport)
window.addEventListener('pulse:native-keyboard', onNativeKeyboardViewportEvent)
window.addEventListener('pulse:native-keyboard-settled', onNativeKeyboardViewportEvent)
syncKeyboardViewport()

const app = createApp(App)
const pinia = createPinia()

function reportRuntimeError(source: string, reason: unknown) {
  console.error(`[Pulse Runtime] ${source}`, reason)
  window.dispatchEvent(
    new CustomEvent('pulse:runtime-error', {
      detail: {
        source,
        message: reason instanceof Error ? reason.message : String(reason || 'unknown'),
      },
    }),
  )
}

app.config.errorHandler = (error, _instance, info) => {
  reportRuntimeError(`vue:${info}`, error)
}

window.addEventListener('error', (event) => {
  reportRuntimeError('window', event.error || event.message)
})
window.addEventListener('unhandledrejection', (event) => {
  reportRuntimeError('promise', event.reason)
})

app.use(pinia)
app.use(router)
app.use(Tabbar)
app.use(TabbarItem)
app.use(Toast)
app.use(ActionSheet)
app.use(Loading)
app.use(Dialog)
app.use(SwipeCell)
app.use(Checkbox)
app.use(Popup)
app.use(ImagePreview)
app.use(Overlay)
app.use(Calendar)
app.use(PullRefresh)
app.use(Picker)
app.use(DatePicker)
app.use(Area)
usePreferenceStore(pinia).init()

async function startApp() {
  await initializeServerOrigin().catch((error) => {
    reportRuntimeError('server-discovery', error)
  })
  app.mount('#app')
  void finishNativeLaunch()
  void initializeImRuntime()
}

async function finishNativeLaunch() {
  if (!isNativeApp) return
  try {
    // The native splash must never depend on an optional plugin callback.
    // Some Android WebViews can leave a plugin listener promise pending while
    // the web app itself is already usable.
    await Promise.race([
      router.isReady(),
      new Promise<void>((resolve) => window.setTimeout(resolve, 2500)),
    ]).catch((error) => {
      reportRuntimeError('router-ready', error)
    })
    // Finish the first status-bar/background sync before removing the native
    // splash.  Otherwise the old Activity decor color can remain as a dark
    // strip above the freshly rendered light or dark page on some devices.
    await Promise.race([
      initializeNativeShell(router),
      new Promise<void>((resolve) => window.setTimeout(resolve, 1200)),
    ]).catch((error) => {
      reportRuntimeError('native-shell', error)
    })
    // 等待 Vue 首屏布局和 WebView 合成各完成一帧，再淡出原生启动页。
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
  } finally {
    await hideSplashScreen(220).catch(() => {})
  }
}

void startApp()

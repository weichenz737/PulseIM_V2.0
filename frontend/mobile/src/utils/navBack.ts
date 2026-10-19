import type { Router, RouteLocationNormalizedLoaded } from 'vue-router'
import { closeDialog } from 'vant'
import { markRouteTransitionBack } from '@/router/transition'

const AUTH_PREFIXES = ['/login', '/register', '/forgot-password']

function normalizePath(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const u = raw.startsWith('http') ? new URL(raw) : new URL(raw, window.location.origin)
    if (u.origin !== window.location.origin) return null
    return `${u.pathname}${u.search}${u.hash}`
  } catch {
    return raw.startsWith('/') ? raw : null
  }
}

function isAuthPath(path: string) {
  return AUTH_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))
}

function fallbackOf(route: RouteLocationNormalizedLoaded, explicit?: string) {
  if (explicit) return explicit
  const meta = route.meta?.backFallback
  if (typeof meta === 'string' && meta.startsWith('/')) return meta
  const p = route.path
  if (p.startsWith('/moments')) return '/app/discover'
  if (p.includes('/moments')) return '/app/discover'
  if (p.startsWith('/me/')) return '/app/me'
  if (p.startsWith('/favorites')) return '/app/me'
  if (p.startsWith('/chat') || p.startsWith('/group')) return '/app/messages'
  if (p.startsWith('/contacts') || p.startsWith('/user')) return '/app/contacts'
  if (p.startsWith('/settings') || p.startsWith('/profile')) return '/app/me'
  if (p.startsWith('/search') || p.startsWith('/scan')) return '/app/messages'
  return '/app/messages'
}

function isVisibleBackLayer(element: HTMLElement): boolean {
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

function backLayerZIndex(element: HTMLElement): number {
  const value = Number.parseInt(window.getComputedStyle(element).zIndex || '0', 10)
  return Number.isFinite(value) ? value : 0
}

/** 页面顶部返回按钮也要先关闭弹层，避免直接跳走；原生聊天页保持自己的返回处理。 */
function closeTopmostPageLayer(): boolean {
  const layers = Array.from(document.querySelectorAll<HTMLElement>([
    '.van-popup:not(.van-toast):not(.van-notify)',
    '.van-image-preview',
    '.dialog-mask',
    '.sheet-mask',
    '.forced-update-mask',
    '.mask',
  ].join(','))).filter(isVisibleBackLayer)
  if (!layers.length) return false

  const top = layers
    .map((element, index) => ({ element, index, zIndex: backLayerZIndex(element) }))
    .sort((a, b) => b.zIndex - a.zIndex || b.index - a.index)[0].element

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
    const topZIndex = backLayerZIndex(top)
    const overlay = Array.from(document.querySelectorAll<HTMLElement>('.van-overlay'))
      .filter(isVisibleBackLayer)
      .filter((element) => backLayerZIndex(element) <= topZIndex)
      .sort((a, b) => backLayerZIndex(b) - backLayerZIndex(a))[0]
    overlay?.click()
    return true
  }

  top.click()
  return true
}

/**
 * 应用内返回：仅当历史栈上一页仍是本站且非登录/注册页时 back，
 * 否则 replace 到兜底页（解决浏览器历史进入 / 登录后 replace 导致无法返回）。
 */
export function smartBack(router: Router, fallback?: string) {
  const route = router.currentRoute.value
  // ChatView 有独立的返回栈、键盘和多选处理，不能把这里的通用逻辑带进去。
  if (!/^\/chat\/[^/]+$/.test(route.path) && closeTopmostPageLayer()) return

  markRouteTransitionBack()
  const dest = fallbackOf(route, fallback)
  const here = route.fullPath
  const state = window.history.state as { back?: string | null } | null
  const backPath = normalizePath(state?.back ?? undefined)

  if (backPath && !isAuthPath(backPath) && backPath !== here) {
    router.back()
    return
  }

  void router.replace(dest)
}

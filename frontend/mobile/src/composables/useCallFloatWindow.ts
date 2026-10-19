import { computed, ref, watch, type Ref } from 'vue'

export interface CallFloatWindowOptions {
  /** 通话是否进行中（非 idle） */
  visible: Ref<boolean>
  /** 是否允许收起为悬浮窗（一般为非来电中） */
  canMinimize: Ref<boolean>
  /** 视频浮窗尺寸（宽），语音条用另一套 */
  isVideo: Ref<boolean>
  /** 默认贴右侧时的边距 */
  margin?: number
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function floatSize(isVideo: boolean) {
  if (isVideo) return { w: 112, h: Math.round((112 * 4) / 3) }
  return { w: 210, h: 72 }
}

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  return !!target.closest(
    'button, a, input, textarea, select, .act, .minimize-call, .call-swipe, .swipe-actions, .local-video.as-pip, .remote-video.as-pip',
  )
}

/**
 * 通话悬浮窗：最小化、左划/左缘右滑收起、拖拽吸附左右（类微信）。
 * 注意：不使用 history.pushState/back，避免与 Vue Router 抢历史栈导致 WS 反复重连、通话接不通。
 */
export function useCallFloatWindow(opts: CallFloatWindowOptions) {
  const margin = opts.margin ?? 14
  const minimized = ref(false)
  const pos = ref({ x: 0, y: 0 })
  const dragging = ref(false)

  let dragMoved = false
  let dragStartX = 0
  let dragStartY = 0
  let originX = 0
  let originY = 0
  let pointerId: number | null = null

  let edgeTracking = false
  let edgeFromLeft = false
  let edgeStartX = 0
  let edgeStartY = 0

  function defaultPos() {
    const { w, h } = floatSize(opts.isVideo.value)
    const vw = window.innerWidth || 360
    const vh = window.innerHeight || 640
    const safeTop =
      56 +
      (Number.parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--pulse-safe-top') || '0',
        10,
      ) || 0)
    return {
      x: Math.max(margin, vw - w - margin),
      y: clamp(safeTop + 20, margin, Math.max(margin, vh - h - margin)),
    }
  }

  function snapToEdge(x: number, y: number) {
    const { w, h } = floatSize(opts.isVideo.value)
    const vw = window.innerWidth || 360
    const vh = window.innerHeight || 640
    const mid = x + w / 2
    const nextX = mid < vw / 2 ? margin : Math.max(margin, vw - w - margin)
    const nextY = clamp(y, margin, Math.max(margin, vh - h - margin))
    return { x: nextX, y: nextY }
  }

  function ensureDefaultPos() {
    if (!pos.value.x && !pos.value.y) {
      pos.value = defaultPos()
    } else {
      pos.value = snapToEdge(pos.value.x, pos.value.y)
    }
  }

  function minimize() {
    if (!opts.canMinimize.value || minimized.value) return
    ensureDefaultPos()
    minimized.value = true
  }

  function expand() {
    if (!minimized.value) return
    minimized.value = false
  }

  function onFloatPointerDown(e: PointerEvent) {
    if (!minimized.value) return
    const el = e.currentTarget as HTMLElement | null
    if (!el) return
    pointerId = e.pointerId
    el.setPointerCapture?.(e.pointerId)
    dragging.value = true
    dragMoved = false
    dragStartX = e.clientX
    dragStartY = e.clientY
    originX = pos.value.x
    originY = pos.value.y
  }

  function onFloatPointerMove(e: PointerEvent) {
    if (!dragging.value || (pointerId != null && e.pointerId !== pointerId)) return
    const dx = e.clientX - dragStartX
    const dy = e.clientY - dragStartY
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragMoved = true
    const { w, h } = floatSize(opts.isVideo.value)
    const vw = window.innerWidth || 360
    const vh = window.innerHeight || 640
    pos.value = {
      x: clamp(originX + dx, 0, Math.max(0, vw - w)),
      y: clamp(originY + dy, 0, Math.max(0, vh - h)),
    }
  }

  function onFloatPointerUp(e: PointerEvent) {
    if (!dragging.value || (pointerId != null && e.pointerId !== pointerId)) return
    dragging.value = false
    pointerId = null
    pos.value = snapToEdge(pos.value.x, pos.value.y)
    if (dragMoved) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  function onFloatClick(e: MouseEvent) {
    if (dragMoved) {
      e.preventDefault()
      e.stopPropagation()
      dragMoved = false
      return
    }
    expand()
  }

  function beginEdgeTrack(clientX: number, clientY: number, target: EventTarget | null) {
    if (minimized.value || !opts.canMinimize.value || !opts.visible.value) return false
    if (isInteractiveTarget(target)) return false
    edgeTracking = true
    edgeFromLeft = clientX <= 48
    edgeStartX = clientX
    edgeStartY = clientY
    return true
  }

  function moveEdgeTrack(clientX: number, clientY: number, e?: Event) {
    if (!edgeTracking) return
    const dx = clientX - edgeStartX
    const dy = Math.abs(clientY - edgeStartY)
    if (dy > 72) {
      edgeTracking = false
      return
    }
    // 左划收起：安卓避开系统左缘返回手势，全屏任意处左划即可
    if (dx < -64 && dy < 56) {
      edgeTracking = false
      minimize()
      e?.preventDefault?.()
      return
    }
    // 左缘右滑收起（保留微信式）
    if (edgeFromLeft && dx > 52 && dy < 48) {
      edgeTracking = false
      minimize()
      e?.preventDefault?.()
      return
    }
    // 明显反向/无效则取消
    if (dx > 90 && !edgeFromLeft) {
      edgeTracking = false
    }
  }

  /** 绑在全屏通话层：左划 / 左缘右滑 → 悬浮窗 */
  function onOverlayTouchStart(e: TouchEvent) {
    const t = e.touches[0]
    if (!t) return
    beginEdgeTrack(t.clientX, t.clientY, e.target)
  }

  function onOverlayTouchMove(e: TouchEvent) {
    const t = e.touches[0]
    if (!t) return
    moveEdgeTrack(t.clientX, t.clientY, e)
  }

  function onOverlayTouchEnd() {
    edgeTracking = false
  }

  /** 安卓部分 WebView 触控更认 pointer 事件 */
  function onOverlayPointerDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    beginEdgeTrack(e.clientX, e.clientY, e.target)
  }

  function onOverlayPointerMove(e: PointerEvent) {
    if (!edgeTracking) return
    moveEdgeTrack(e.clientX, e.clientY, e)
  }

  function onOverlayPointerUp() {
    edgeTracking = false
  }

  const floatStyle = computed(() => ({
    left: `${pos.value.x}px`,
    top: `${pos.value.y}px`,
    right: 'auto',
    bottom: 'auto',
    touchAction: 'none' as const,
    transition: dragging.value ? 'none' : 'left 0.22s ease, top 0.22s ease',
  }))

  watch(
    () => opts.visible.value,
    (show) => {
      if (!show) minimized.value = false
    },
  )

  watch(
    () => opts.canMinimize.value,
    (ok) => {
      if (!ok) minimized.value = false
    },
  )

  watch(
    () => opts.isVideo.value,
    () => {
      if (minimized.value) pos.value = snapToEdge(pos.value.x, pos.value.y)
    },
  )

  return {
    minimized,
    dragging,
    floatStyle,
    minimize,
    expand,
    onFloatPointerDown,
    onFloatPointerMove,
    onFloatPointerUp,
    onFloatClick,
    onOverlayTouchStart,
    onOverlayTouchMove,
    onOverlayTouchEnd,
    onOverlayPointerDown,
    onOverlayPointerMove,
    onOverlayPointerUp,
  }
}

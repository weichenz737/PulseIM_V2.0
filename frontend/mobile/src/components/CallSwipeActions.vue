<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

withDefaults(
  defineProps<{
    acceptIcon?: string
    acceptLabel?: string
    rejectLabel?: string
  }>(),
  {
    acceptIcon: 'call',
    acceptLabel: '接听',
    rejectLabel: '拒绝',
  },
)

const emit = defineEmits<{
  accept: []
  reject: []
}>()

type Side = 'accept' | 'reject'

const THRESHOLD = 72
const MAX_DRAG = 110

const dragSide = ref<Side | null>(null)
const dragY = ref(0)
const firing = ref(false)
const acceptPulse = ref(false)
const rejectPulse = ref(false)

let startY = 0
let activePointer: number | null = null
let fired = false

const acceptOffset = computed(() => (dragSide.value === 'accept' ? dragY.value : 0))
const rejectOffset = computed(() => (dragSide.value === 'reject' ? dragY.value : 0))
const acceptProgress = computed(() => Math.min(1, acceptOffset.value / THRESHOLD))
const rejectProgress = computed(() => Math.min(1, rejectOffset.value / THRESHOLD))

function onPointerDown(side: Side, e: PointerEvent) {
  if (firing.value) return
  const el = e.currentTarget as HTMLElement
  el.setPointerCapture?.(e.pointerId)
  activePointer = e.pointerId
  dragSide.value = side
  startY = e.clientY
  dragY.value = 0
  fired = false
}

function onPointerMove(e: PointerEvent) {
  if (activePointer == null || e.pointerId !== activePointer || !dragSide.value || fired) return
  const dy = startY - e.clientY
  dragY.value = Math.max(0, Math.min(MAX_DRAG, dy))
  if (dragY.value >= THRESHOLD) {
    fire(dragSide.value)
  }
}

function onPointerUp(e: PointerEvent) {
  if (activePointer == null || e.pointerId !== activePointer) return
  const side = dragSide.value
  const y = dragY.value
  activePointer = null
  if (!fired && side && y >= THRESHOLD * 0.85) {
    fire(side)
    return
  }
  if (!fired) {
    // 轻点也可用：几乎没拖动时当作点击
    if (side && y < 8) {
      fire(side)
      return
    }
    resetDrag()
  }
}

function onPointerCancel() {
  activePointer = null
  if (!fired) resetDrag()
}

function fire(side: Side) {
  if (fired || firing.value) return
  fired = true
  firing.value = true
  dragY.value = MAX_DRAG
  if (side === 'accept') acceptPulse.value = true
  else rejectPulse.value = true
  try {
    navigator.vibrate?.(side === 'accept' ? [18, 40, 18] : [40])
  } catch {
    /* ignore */
  }
  // iOS：必须同步 emit，不能 setTimeout，否则 getUserMedia 会丢手势失败
  if (side === 'accept') emit('accept')
  else emit('reject')
  window.setTimeout(() => {
    firing.value = false
    acceptPulse.value = false
    rejectPulse.value = false
    resetDrag()
  }, 420)
}

function resetDrag() {
  dragSide.value = null
  dragY.value = 0
}

onBeforeUnmount(() => {
  activePointer = null
})
</script>

<template>
  <div class="swipe-actions" :class="{ locking: firing }">
    <div
      class="swipe-col reject"
      :class="{ dragging: dragSide === 'reject', armed: rejectProgress >= 1, pulse: rejectPulse }"
      :style="{ '--p': String(rejectProgress) }"
    >
      <div class="guide" aria-hidden="true">
        <span class="material-symbols-outlined chev">keyboard_arrow_up</span>
        <span class="material-symbols-outlined chev delay">keyboard_arrow_up</span>
        <span class="material-symbols-outlined chev delay2">keyboard_arrow_up</span>
      </div>
      <div class="track">
        <div class="glow" />
        <button
          type="button"
          class="puck"
          :style="{ transform: `translate3d(0, ${-rejectOffset}px, 0) scale(${1 + rejectProgress * 0.08})` }"
          aria-label="上滑拒绝"
          @pointerdown="onPointerDown('reject', $event)"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerCancel"
        >
          <span class="ring" />
          <span class="ring late" />
          <span class="material-symbols-outlined filled ico">call_end</span>
        </button>
      </div>
      <span class="hint">上滑{{ rejectLabel }}</span>
    </div>

    <div
      class="swipe-col accept"
      :class="{ dragging: dragSide === 'accept', armed: acceptProgress >= 1, pulse: acceptPulse }"
      :style="{ '--p': String(acceptProgress) }"
    >
      <div class="guide" aria-hidden="true">
        <span class="material-symbols-outlined chev">keyboard_arrow_up</span>
        <span class="material-symbols-outlined chev delay">keyboard_arrow_up</span>
        <span class="material-symbols-outlined chev delay2">keyboard_arrow_up</span>
      </div>
      <div class="track">
        <div class="glow" />
        <button
          type="button"
          class="puck"
          :style="{ transform: `translate3d(0, ${-acceptOffset}px, 0) scale(${1 + acceptProgress * 0.08})` }"
          :aria-label="`上滑${acceptLabel}`"
          @pointerdown="onPointerDown('accept', $event)"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerCancel"
        >
          <span class="ring" />
          <span class="ring late" />
          <span class="material-symbols-outlined filled ico">{{ acceptIcon }}</span>
        </button>
      </div>
      <span class="hint">上滑{{ acceptLabel }}</span>
    </div>
  </div>
</template>

<style scoped>
.swipe-actions {
  display: flex;
  justify-content: center;
  align-items: flex-end;
  gap: min(22vw, 88px);
  padding: 8px 12px 18px;
  width: 100%;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.swipe-actions.locking {
  pointer-events: none;
}

.swipe-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 88px;
  --accent: #ff3b30;
  --accent-soft: rgba(255, 59, 48, 0.45);
}

.swipe-col.accept {
  --accent: #34c759;
  --accent-soft: rgba(52, 199, 89, 0.45);
}

.guide {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 42px;
  margin-bottom: 2px;
  opacity: 0.85;
  pointer-events: none;
}

.chev {
  font-size: 22px;
  line-height: 12px;
  color: var(--accent);
  animation: chevRise 1.35s ease-in-out infinite;
  opacity: 0;
}

.chev.delay {
  animation-delay: 0.18s;
}

.chev.delay2 {
  animation-delay: 0.36s;
}

.swipe-col.dragging .chev,
.swipe-col.armed .chev {
  animation: none;
  opacity: calc(0.25 + var(--p) * 0.75);
}

.track {
  position: relative;
  width: 76px;
  height: 76px;
  display: grid;
  place-items: center;
}

.glow {
  position: absolute;
  inset: -10px;
  border-radius: 50%;
  background: radial-gradient(circle, var(--accent-soft), transparent 68%);
  opacity: calc(0.35 + var(--p) * 0.65);
  transform: scale(calc(0.92 + var(--p) * 0.28));
  transition: opacity 0.12s ease, transform 0.12s ease;
  pointer-events: none;
}

.puck {
  position: relative;
  z-index: 1;
  width: 72px;
  height: 72px;
  border: none;
  border-radius: 50%;
  padding: 0;
  cursor: grab;
  color: #fff;
  background: var(--accent);
  box-shadow:
    0 10px 28px rgba(0, 0, 0, 0.35),
    0 0 0 0 var(--accent-soft);
  display: grid;
  place-items: center;
  touch-action: none;
  transition:
    box-shadow 0.2s ease,
    filter 0.2s ease,
    background 0.15s ease;
  will-change: transform;
}

.swipe-col.dragging .puck {
  cursor: grabbing;
  transition: none;
  box-shadow:
    0 14px 32px rgba(0, 0, 0, 0.4),
    0 0 0 calc(6px * var(--p)) var(--accent-soft);
  filter: brightness(calc(1 + var(--p) * 0.12));
}

.swipe-col.armed .puck,
.swipe-col.pulse .puck {
  box-shadow:
    0 0 0 10px var(--accent-soft),
    0 16px 36px rgba(0, 0, 0, 0.45);
  filter: brightness(1.15);
}

.ico {
  font-size: 30px;
  line-height: 1;
  position: relative;
  z-index: 2;
}

.ring {
  position: absolute;
  inset: -2px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.55);
  animation: ringPulse 2s ease-out infinite;
  pointer-events: none;
}

.ring.late {
  animation-delay: 0.7s;
}

.swipe-col.dragging .ring,
.swipe-col.armed .ring {
  animation: none;
  opacity: calc(0.2 + var(--p) * 0.8);
  transform: scale(calc(1 + var(--p) * 0.35));
}

.hint {
  margin-top: 12px;
  font-size: 12px;
  letter-spacing: 0.04em;
  color: rgba(255, 255, 255, 0.72);
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.35);
}

.swipe-col.armed .hint {
  color: #fff;
  font-weight: 600;
}

@keyframes chevRise {
  0% {
    opacity: 0;
    transform: translateY(10px);
  }
  35% {
    opacity: 0.95;
  }
  100% {
    opacity: 0;
    transform: translateY(-14px);
  }
}

@keyframes ringPulse {
  0% {
    opacity: 0.7;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(1.55);
  }
}

@media (prefers-reduced-motion: reduce) {
  .chev,
  .ring {
    animation: none !important;
    opacity: 0.7;
  }
}
</style>

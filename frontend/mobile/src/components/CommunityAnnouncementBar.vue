<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  text?: string
}>()

const viewportRef = ref<HTMLElement | null>(null)
const textRef = ref<HTMLElement | null>(null)
const overflowing = ref(false)
const reduceMotion = ref(false)
let resizeObserver: ResizeObserver | null = null
let motionQuery: MediaQueryList | null = null

const normalizedText = computed(() => String(props.text || '').trim())
const shouldScroll = computed(() => overflowing.value && !reduceMotion.value)
const duration = computed(() => `${Math.min(90, Math.max(12, normalizedText.value.length * 0.2))}s`)

function measure() {
  const viewport = viewportRef.value
  const text = textRef.value
  if (!viewport || !text) {
    overflowing.value = false
    return
  }
  overflowing.value = text.scrollWidth > viewport.clientWidth + 2
}

function syncMotionPreference(event?: MediaQueryListEvent) {
  reduceMotion.value = event?.matches ?? motionQuery?.matches ?? false
}

watch(normalizedText, () => {
  void nextTick(measure)
})

onMounted(() => {
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  syncMotionPreference()
  motionQuery.addEventListener?.('change', syncMotionPreference)
  resizeObserver = new ResizeObserver(measure)
  if (viewportRef.value) resizeObserver.observe(viewportRef.value)
  void nextTick(measure)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  motionQuery?.removeEventListener?.('change', syncMotionPreference)
})
</script>

<template>
  <aside
    v-if="normalizedText"
    class="announcement-bar"
    role="note"
    :aria-label="`圈子公告：${normalizedText}`"
  >
    <span class="announcement-icon material-symbols-outlined" aria-hidden="true">campaign</span>
    <strong aria-hidden="true">公告</strong>
    <span class="announcement-divider" aria-hidden="true" />
    <div ref="viewportRef" class="announcement-viewport">
      <div
        class="announcement-track"
        :class="{ scrolling: shouldScroll }"
        :style="{ '--announcement-duration': duration }"
        aria-hidden="true"
      >
        <span ref="textRef" class="announcement-text" :title="overflowing && !shouldScroll ? normalizedText : undefined">
          {{ normalizedText }}
        </span>
        <span v-if="shouldScroll" class="announcement-text announcement-copy">{{ normalizedText }}</span>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.announcement-bar {
  position: relative;
  min-height: 48px;
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 11px 14px 0;
  padding: 0 14px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--pulse-primary) 20%, var(--pulse-divider));
  border-radius: 16px;
  background:
    linear-gradient(100deg, color-mix(in srgb, var(--pulse-primary) 13%, var(--pulse-surface-container)), var(--pulse-surface-container));
  color: var(--pulse-text);
  box-shadow: 0 7px 22px color-mix(in srgb, var(--pulse-text) 5%, transparent);
}

.announcement-bar::after {
  content: '';
  position: absolute;
  top: -23px;
  right: -18px;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--pulse-primary) 9%, transparent);
  pointer-events: none;
}

.announcement-icon {
  position: relative;
  z-index: 1;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  background: color-mix(in srgb, var(--pulse-primary) 14%, var(--pulse-surface-high));
  color: var(--pulse-primary);
  font-size: 18px;
  font-variation-settings: 'FILL' 1;
}

.announcement-bar > strong {
  flex: 0 0 auto;
  color: var(--pulse-primary);
  font-size: 12px;
  letter-spacing: .06em;
}

.announcement-divider {
  width: 1px;
  height: 17px;
  flex: 0 0 1px;
  background: var(--pulse-divider);
}

.announcement-viewport {
  min-width: 0;
  flex: 1;
  box-sizing: border-box;
  padding-left: 3px;
  overflow: hidden;
  -webkit-mask-image: linear-gradient(90deg, var(--pulse-text) 0, var(--pulse-text) calc(100% - 7px), transparent 100%);
  mask-image: linear-gradient(90deg, var(--pulse-text) 0, var(--pulse-text) calc(100% - 7px), transparent 100%);
}

.announcement-track {
  width: 100%;
  min-width: 0;
  color: var(--pulse-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.announcement-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.announcement-track.scrolling {
  width: max-content;
  display: flex;
  gap: 40px;
  animation: announcement-scroll var(--announcement-duration) linear infinite;
  will-change: transform;
}

.announcement-track.scrolling .announcement-text {
  max-width: none;
  overflow: visible;
  text-overflow: clip;
}

.announcement-track.scrolling:hover,
.announcement-track.scrolling:focus-within {
  animation-play-state: paused;
}

@keyframes announcement-scroll {
  from { transform: translateX(0); }
  to { transform: translateX(calc(-50% - 20px)); }
}

@media (prefers-reduced-motion: reduce) {
  .announcement-track.scrolling {
    width: 100%;
    display: block;
    animation: none;
    transform: none;
  }

  .announcement-track.scrolling .announcement-copy { display: none; }
  .announcement-track.scrolling .announcement-text { overflow: hidden; text-overflow: ellipsis; }
}

@media (max-width: 360px) {
  .announcement-bar { margin-inline: 10px; padding-inline: 11px; gap: 7px; }
}
</style>

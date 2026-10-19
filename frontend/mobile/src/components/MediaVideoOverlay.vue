<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  mediaVideoPreviewState,
  closeMediaVideoPreview,
  bindMediaVideoEl,
  waitForMediaVideoRendition,
  retryMediaVideoFromCache,
} from '@/composables/useMediaVideoPreview'
import { openMediaActions } from '@/composables/useMediaActions'

const videoEl = ref<HTMLVideoElement | null>(null)
const videoReady = ref(false)
let longPressTimer: number | null = null

function cancelLongPress() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
}

function onVideoTouchStart() {
  if (!mediaVideoPreviewState.allowActions) return
  cancelLongPress()
  longPressTimer = window.setTimeout(() => {
    void openMediaActions({
      url: mediaVideoPreviewState.src,
      kind: 'video',
      fileId: mediaVideoPreviewState.fileId,
    })
  }, 600)
}

function onVideoTouchEnd() {
  cancelLongPress()
}

function onVideoContextMenu(e: Event) {
  if (!mediaVideoPreviewState.allowActions) return
  e.preventDefault()
  cancelLongPress()
  void openMediaActions({
    url: mediaVideoPreviewState.src,
    kind: 'video',
    fileId: mediaVideoPreviewState.fileId,
  })
}

async function onVideoError() {
  videoReady.value = false
  // The direct <video> request cannot attach the Axios Bearer header. Try an
  // authenticated cached Blob immediately; waiting for rendition polling
  // first made existing videos take several seconds before they could open.
  if (await retryMediaVideoFromCache()) return
  if (await waitForMediaVideoRendition()) return
  mediaVideoPreviewState.src = ''
  mediaVideoPreviewState.loading = false
}

function onVideoReady() {
  videoReady.value = true
}

watch(
  videoEl,
  (el) => {
    bindMediaVideoEl(el)
  },
  { flush: 'sync' },
)

watch(
  () => mediaVideoPreviewState.visible,
  (v) => {
    if (!v) {
      bindMediaVideoEl(null)
      videoReady.value = false
    }
  },
)

watch(
  () => mediaVideoPreviewState.src,
  () => { videoReady.value = false },
)

/** 立即关闭，并用透明挡板吞掉随后落到「发布」等按钮上的穿透点击 */
function swallowGhostClick() {
  const blocker = document.createElement('div')
  blocker.setAttribute('data-mvp-ghost-blocker', '1')
  blocker.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;background:transparent;touch-action:none;'
  const remove = () => {
    blocker.removeEventListener('pointerdown', stop, true)
    blocker.removeEventListener('click', stop, true)
    blocker.removeEventListener('touchend', stop, true)
    blocker.remove()
  }
  const stop = (ev: Event) => {
    ev.preventDefault()
    ev.stopPropagation()
    remove()
  }
  blocker.addEventListener('pointerdown', stop, true)
  blocker.addEventListener('click', stop, true)
  blocker.addEventListener('touchend', stop, true)
  document.body.appendChild(blocker)
  window.setTimeout(remove, 400)
}

function onClose(e?: Event) {
  e?.preventDefault?.()
  e?.stopPropagation?.()
  if (!mediaVideoPreviewState.visible) return
  cancelLongPress()
  closeMediaVideoPreview()
  swallowGhostClick()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="mediaVideoPreviewState.visible"
      class="mvp-root"
      role="dialog"
      aria-modal="true"
    >
      <div class="mvp-mask" @click.stop.prevent="onClose" />

      <div class="mvp-chrome">
        <button type="button" class="mvp-close" @click.stop.prevent="onClose">关闭</button>
      </div>

      <div class="mvp-stage">
        <div v-if="mediaVideoPreviewState.loading" class="mvp-loading">加载中…</div>
        <video
          v-else-if="mediaVideoPreviewState.src"
          :key="mediaVideoPreviewState.src"
          ref="videoEl"
          class="mvp-video"
          :class="{ ready: videoReady }"
          :src="mediaVideoPreviewState.src"
          crossorigin="use-credentials"
          controls
          playsinline
          webkit-playsinline
          preload="auto"
          controlslist="nofullscreen"
          x5-playsinline="true"
          x5-video-player-type="h5"
          x5-video-player-fullscreen="false"
          @loadeddata="onVideoReady"
          @canplay="onVideoReady"
          @playing="onVideoReady"
          @touchstart.passive="onVideoTouchStart"
          @touchmove.passive="onVideoTouchEnd"
          @touchend.passive="onVideoTouchEnd"
          @touchcancel.passive="onVideoTouchEnd"
          @contextmenu.prevent="onVideoContextMenu"
          @error="onVideoError"
        />
        <p v-if="mediaVideoPreviewState.allowActions && mediaVideoPreviewState.src" class="mvp-longpress-hint">
          长按视频可保存或转发
        </p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.mvp-root {
  position: fixed;
  inset: 0;
  z-index: 20000;
  display: flex;
  flex-direction: column;
  background: #000;
}

.mvp-mask {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: #000;
}

.mvp-chrome {
  position: relative;
  z-index: 3;
  flex: 0 0 auto;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: calc(var(--pulse-safe-top, 0px) + 8px) 12px 8px;
  background: rgba(0, 0, 0, 0.72);
}

.mvp-close {
  min-width: 64px;
  height: 36px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.mvp-close:active {
  background: rgba(255, 255, 255, 0.3);
}

.mvp-stage {
  position: relative;
  z-index: 1;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px 20px;
  box-sizing: border-box;
}

.mvp-loading {
  color: #fff;
  font-size: 14px;
}

.mvp-video {
  width: 100%;
  max-width: 720px;
  max-height: 100%;
  background: #000;
  border-radius: 4px;
  -webkit-touch-callout: none;
  user-select: none;
}

.mvp-video:not(.ready) {
  visibility: hidden;
}

.mvp-longpress-hint {
  position: absolute;
  left: 50%;
  bottom: 6px;
  transform: translateX(-50%);
  margin: 0;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  color: rgba(255, 255, 255, 0.75);
  font-size: 11px;
  pointer-events: none;
  z-index: 2;
}
</style>

<script setup lang="ts">
import { ref, watch, computed, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { useVoiceCallStore } from '@/stores/voiceCall'
import { useCallFloatWindow } from '@/composables/useCallFloatWindow'
import CallSwipeActions from '@/components/CallSwipeActions.vue'
import { resolveAvatarUrl } from '@/api/file'
import {
  unlockCallRingtoneAudio,
  keepCallRingtoneAlive,
  startCallRingtone,
  isCallRingtonePlaying,
  promoteCallAudioSession,
} from '@/utils/callRingtone'

const call = useVoiceCallStore()
const {
  uiState,
  peer,
  muted,
  cameraOn,
  cameraFacing,
  speakerOn,
  statusText,
  elapsedSec,
  remoteStream,
  localStream,
  visible,
  isVideo,
} = storeToRefs(call)

const flipping = ref(false)
const localVideoIsMain = ref(false)
const peerAvatarUrl = computed(() => resolveAvatarUrl(peer.value?.avatarUrl || ''))

const audioRef = ref<HTMLAudioElement | null>(null)
const remoteVideoRef = ref<HTMLVideoElement | null>(null)
const localVideoRef = ref<HTMLVideoElement | null>(null)

const canMinimize = computed(
  () =>
    visible.value &&
    (uiState.value === 'outgoing' ||
      uiState.value === 'connecting' ||
      uiState.value === 'connected'),
)

const {
  minimized,
  dragging,
  floatStyle,
  minimize,
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
} = useCallFloatWindow({
  visible,
  canMinimize,
  isVideo,
})

const durationText = computed(() => {
  const s = elapsedSec.value
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
})

const headline = computed(() => {
  if (uiState.value === 'connected') return durationText.value
  return statusText.value || (isVideo.value ? '视频通话' : '语音通话')
})

const showRemoteVideo = computed(
  () => isVideo.value && !!remoteStream.value && uiState.value === 'connected',
)

const showLocalPreview = computed(
  () => isVideo.value && cameraOn.value && !!localStream.value && uiState.value !== 'incoming',
)

const canFlipCamera = computed(
  () =>
    isVideo.value &&
    showLocalPreview.value &&
    (uiState.value === 'outgoing' ||
      uiState.value === 'connecting' ||
      uiState.value === 'connected'),
)

/** iOS 来电/呼出：一碰屏幕就解锁并补播（手势链内最稳） */
function onIncomingTouchUnlock() {
  if (uiState.value !== 'incoming' && uiState.value !== 'outgoing') return
  promoteCallAudioSession('playback')
  unlockCallRingtoneAudio()
  void keepCallRingtoneAlive()
  // Incoming calls may need a gesture retry. Never start outgoing ringback
  // here: Android may still be acquiring microphone/camera audio focus.
  if (!isCallRingtonePlaying() && uiState.value === 'incoming') void startCallRingtone()
}

async function onFlipCamera() {
  if (flipping.value || !canFlipCamera.value) return
  flipping.value = true
  try {
    await call.flipCamera()
  } finally {
    flipping.value = false
  }
}

watch(
  [remoteStream, remoteVideoRef],
  ([stream]) => {
    const audioEl = audioRef.value
    if (audioEl) {
      if (isVideo.value && uiState.value === 'connected') {
        audioEl.srcObject = null
      } else {
        audioEl.srcObject = stream
        if (stream) {
          void audioEl.play().catch(() => {})
        }
      }
    }
    const videoEl = remoteVideoRef.value
    if (videoEl) {
      videoEl.srcObject = stream
      if (stream) {
        void videoEl.play().catch(() => {})
      }
    }
  },
  { flush: 'post' },
)

const canSwapVideos = computed(
  () =>
    isVideo.value &&
    uiState.value === 'connected' &&
    showRemoteVideo.value &&
    showLocalPreview.value &&
    cameraOn.value,
)

watch(visible, (show) => {
  if (!show) localVideoIsMain.value = false
})

watch([isVideo, uiState, showRemoteVideo, cameraOn], () => {
  if (!canSwapVideos.value) localVideoIsMain.value = false
})

watch(
  [localStream, localVideoRef],
  ([stream]) => {
    const el = localVideoRef.value
    if (!el) return
    el.srcObject = stream
    if (stream) {
      void el.play().catch(() => {})
    }
  },
  { flush: 'post' },
)

watch([isVideo, uiState, remoteStream], () => {
  const audioEl = audioRef.value
  const stream = remoteStream.value
  if (!audioEl) return
  if (isVideo.value && uiState.value === 'connected') {
    audioEl.srcObject = null
    return
  }
  if (audioEl.srcObject !== stream) {
    audioEl.srcObject = stream
    if (stream) void audioEl.play().catch(() => {})
  }
})

watch(speakerOn, (on) => {
  const audioEl = audioRef.value
  if (audioEl) {
    audioEl.volume = on ? 1 : 0.35
    audioEl.muted = false
  }
  const videoEl = remoteVideoRef.value
  if (videoEl) {
    videoEl.volume = on ? 1 : 0.35
    videoEl.muted = false
  }
})

onBeforeUnmount(() => {
  if (audioRef.value) audioRef.value.srcObject = null
  if (remoteVideoRef.value) remoteVideoRef.value.srcObject = null
  if (localVideoRef.value) localVideoRef.value.srcObject = null
})
</script>

<template>
  <Teleport to="body">
    <audio v-if="visible" ref="audioRef" autoplay playsinline class="hidden-audio" />

    <button
      v-if="visible && minimized"
      type="button"
      class="call-float"
      :class="{ audio: !isVideo, dragging }"
      :style="floatStyle"
      :aria-label="isVideo ? '恢复视频通话' : '恢复语音通话'"
      @pointerdown="onFloatPointerDown"
      @pointermove="onFloatPointerMove"
      @pointerup="onFloatPointerUp"
      @pointercancel="onFloatPointerUp"
      @click="onFloatClick"
    >
      <video
        v-if="isVideo && showRemoteVideo"
        ref="remoteVideoRef"
        class="float-video"
        autoplay
        playsinline
      />
      <img v-else-if="peerAvatarUrl" :src="peerAvatarUrl" class="float-avatar" alt="" />
      <span v-else class="float-avatar initials">{{ (peer?.nickname || '?').slice(0, 1) }}</span>
      <span v-if="!isVideo" class="float-audio-meta">
        <strong>{{ peer?.nickname || '语音通话' }}</strong>
        <small>{{ headline }}</small>
      </span>
      <span v-if="isVideo" class="float-time">{{ headline }}</span>
      <span class="float-restore material-symbols-outlined">open_in_full</span>
    </button>

    <div
      v-if="visible && !minimized"
      class="call-overlay"
      :class="{ video: isVideo }"
      @touchstart="onIncomingTouchUnlock(); onOverlayTouchStart($event)"
      @touchmove="onOverlayTouchMove"
      @touchend="onOverlayTouchEnd"
      @touchcancel="onOverlayTouchEnd"
      @pointerdown="onIncomingTouchUnlock(); onOverlayPointerDown($event)"
      @pointermove="onOverlayPointerMove"
      @pointerup="onOverlayPointerUp"
      @pointercancel="onOverlayPointerUp"
    >
      <template v-if="isVideo">
        <video
          ref="remoteVideoRef"
          class="remote-video"
          :class="{
            visible: showRemoteVideo,
            'as-main': !localVideoIsMain,
            'as-pip': localVideoIsMain,
            swappable: localVideoIsMain && canSwapVideos,
          }"
          autoplay
          playsinline
          @click="localVideoIsMain && canSwapVideos && (localVideoIsMain = false)"
        />
        <div v-if="!showRemoteVideo" class="call-bg" />
        <video
          v-show="showLocalPreview"
          ref="localVideoRef"
          class="local-video"
          :class="{
            mirror: cameraFacing === 'user',
            'as-main': localVideoIsMain,
            'as-pip': !localVideoIsMain,
            swappable: !localVideoIsMain && canSwapVideos,
          }"
          autoplay
          playsinline
          muted
          @click="!localVideoIsMain && canSwapVideos && (localVideoIsMain = true)"
        />
      </template>
      <div v-else class="call-bg" />

      <button
        v-if="canMinimize"
        type="button"
        class="minimize-call"
        aria-label="最小化通话"
        @click="minimize"
      >
        <span class="material-symbols-outlined">picture_in_picture_alt</span>
      </button>

      <div class="call-body">
        <div class="peer-block" :class="{ compact: showRemoteVideo }">
          <template v-if="!showRemoteVideo">
            <img
              v-if="peerAvatarUrl"
              :src="peerAvatarUrl"
              class="peer-avatar"
              alt=""
            />
            <div v-else class="peer-avatar initials">
              {{ (peer?.nickname || '?').slice(0, 1) }}
            </div>
          </template>
          <h2 class="peer-name">{{ peer?.nickname || '用户' }}</h2>
          <p class="call-status">{{ headline }}</p>
        </div>

        <div class="actions" :class="{ incoming: uiState === 'incoming' }">
          <CallSwipeActions
            v-if="uiState === 'incoming'"
            :accept-icon="isVideo ? 'videocam' : 'call'"
            accept-label="接听"
            reject-label="拒绝"
            @accept="call.acceptIncoming()"
            @reject="call.rejectIncoming()"
          />

          <template v-else>
            <button
              type="button"
              class="act"
              :class="{ on: muted }"
              @click="call.toggleMute()"
            >
              <span class="material-symbols-outlined filled">{{
                muted ? 'mic_off' : 'mic'
              }}</span>
              <span class="act-label">{{ muted ? '已静音' : '静音' }}</span>
            </button>
            <button
              v-if="isVideo"
              type="button"
              class="act"
              :class="{ on: !cameraOn }"
              @click="call.toggleCamera()"
            >
              <span class="material-symbols-outlined filled">{{
                cameraOn ? 'videocam' : 'videocam_off'
              }}</span>
              <span class="act-label">{{ cameraOn ? '摄像头' : '已关闭' }}</span>
            </button>
            <button
              v-if="canFlipCamera"
              type="button"
              class="act"
              :disabled="flipping"
              @click="onFlipCamera"
            >
              <span class="material-symbols-outlined filled">cameraswitch</span>
              <span class="act-label">翻转</span>
            </button>
            <button
              v-if="!isVideo"
              type="button"
              class="act"
              :class="{ on: !speakerOn }"
              @click="call.toggleSpeaker()"
            >
              <span class="material-symbols-outlined filled">{{
                speakerOn ? 'volume_up' : 'volume_down'
              }}</span>
              <span class="act-label">扬声器</span>
            </button>
            <button type="button" class="act hangup" @click="call.hangup()">
              <span class="material-symbols-outlined filled">call_end</span>
              <span class="act-label">挂断</span>
            </button>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.call-overlay {
  position: fixed;
  inset: 0;
  z-index: 4000;
  display: flex;
  flex-direction: column;
  color: #fff;
  background: var(--pulse-bg);
  /* 水平手势交给 JS（左划收起），避免安卓浏览器吞掉 */
  touch-action: pan-y;
}

.minimize-call {
  position: absolute;
  top: calc(16px + env(safe-area-inset-top));
  left: 16px;
  z-index: 4;
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: #fff;
  background: rgba(20, 21, 25, 0.55);
  backdrop-filter: blur(8px);
}

.call-float {
  position: fixed;
  z-index: 4000;
  width: 112px;
  aspect-ratio: 3 / 4;
  padding: 0;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 14px;
  color: #fff;
  background: #15161a;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.4);
  transition: box-shadow 0.15s ease, transform 0.15s ease;
  user-select: none;
  -webkit-user-select: none;
}

.call-float.dragging {
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.5);
  transform: scale(1.03);
  transition: none;
}

.call-float.audio {
  width: 210px;
  height: 72px;
  aspect-ratio: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 38px 10px 10px;
}

.call-float.audio .float-avatar {
  flex: 0 0 52px;
  width: 52px;
  height: 52px;
  border-radius: 50%;
}

.call-float.audio .float-avatar.initials {
  font-size: 22px;
}

.float-audio-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  text-align: left;
}

.float-audio-meta strong,
.float-audio-meta small {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.float-audio-meta strong {
  font-size: 14px;
}

.float-audio-meta small {
  color: rgba(255, 255, 255, 0.72);
  font-size: 12px;
}

.float-time {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 6px 8px 8px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-align: center;
  background: linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.55));
  pointer-events: none;
}

.float-video,
.float-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}

.float-avatar {
  display: grid;
  place-items: center;
}

.float-avatar.initials {
  font-size: 34px;
  background: #34363d;
}

.float-restore {
  position: absolute;
  right: 6px;
  bottom: 6px;
  padding: 4px;
  border-radius: 50%;
  font-size: 17px;
  background: rgba(0, 0, 0, 0.55);
  pointer-events: none;
}

.call-float.audio .float-restore {
  bottom: auto;
  top: 50%;
  transform: translateY(-50%);
}

.call-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 50% 20%, rgba(75, 142, 255, 0.35), transparent 55%),
    linear-gradient(180deg, #1a1c24 0%, var(--pulse-bg) 100%);
}

.remote-video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: var(--pulse-bg);
  opacity: 0;
  transition: opacity 0.2s ease;
  image-rendering: auto;
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
  transform: translateZ(0);
}

.remote-video.visible {
  opacity: 1;
}

.remote-video.as-pip {
  inset: auto 16px auto auto;
  top: calc(16px + var(--pulse-safe-top, 0px));
  width: 108px;
  height: 160px;
  z-index: 2;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}

.local-video {
  position: absolute;
  top: calc(16px + var(--pulse-safe-top, 0px));
  right: 16px;
  width: 108px;
  height: 160px;
  object-fit: cover;
  border-radius: 12px;
  background: var(--pulse-surface-low);
  border: 1px solid rgba(255, 255, 255, 0.18);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  z-index: 2;
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
}

.local-video.as-main {
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.remote-video.swappable,
.local-video.swappable {
  cursor: pointer;
  touch-action: manipulation;
}

.local-video.mirror {
  transform: scaleX(-1);
}

.call-body {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: calc(36px + var(--pulse-safe-top)) 24px calc(40px + env(safe-area-inset-bottom, 0px));
  pointer-events: none;
}

.call-body .actions,
.call-body .peer-block {
  pointer-events: auto;
}

.peer-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 48px;
}

.peer-block.compact {
  margin-top: 12px;
  align-items: flex-start;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.55);
}

.peer-avatar {
  width: 112px;
  height: 112px;
  border-radius: 50%;
  object-fit: cover;
  border: 3px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
}

.peer-avatar.initials {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--pulse-surface-highest);
  font-size: 40px;
  font-weight: 600;
}

.peer-name {
  margin: 20px 0 8px;
  font-size: 24px;
  font-weight: 600;
}

.peer-block.compact .peer-name {
  margin: 0 0 4px;
  font-size: 18px;
}

.call-status {
  margin: 0;
  font-size: 15px;
  color: rgba(255, 255, 255, 0.7);
}

.peer-block.compact .call-status {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
}

.actions {
  display: flex;
  justify-content: center;
  gap: 28px;
  padding-bottom: 24px;
  flex-wrap: wrap;
}

.actions.incoming {
  padding-bottom: 8px;
  width: 100%;
}

.act {
  border: none;
  background: transparent;
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  padding: 0;
}

.act .material-symbols-outlined {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
}

.call-overlay.video .act .material-symbols-outlined {
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(8px);
}

.act.on .material-symbols-outlined {
  background: rgba(255, 255, 255, 0.28);
}

.act.accept .material-symbols-outlined {
  background: #34c759;
}

.act.reject .material-symbols-outlined,
.act.hangup .material-symbols-outlined {
  background: #ff3b30;
}

.act:disabled {
  opacity: 0.55;
  pointer-events: none;
}

.act-label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.75);
}

.hidden-audio {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}
</style>

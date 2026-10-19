<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useGroupCallStore, type GroupCallMember } from '@/stores/groupCall'
import { useCallFloatWindow } from '@/composables/useCallFloatWindow'
import CallSwipeActions from '@/components/CallSwipeActions.vue'
import { resolveAvatarUrl } from '@/api/file'

const call = useGroupCallStore()
const {
  visible,
  state,
  groupTitle,
  participants,
  availableMembers,
  localStream,
  muted,
  cameraOn,
  elapsedSec,
  isVideo,
} = storeToRefs(call)

const localVideo = ref<HTMLVideoElement | null>(null)
const floatLocalVideo = ref<HTMLVideoElement | null>(null)
const showInvite = ref(false)
const selected = ref<string[]>([])
const callAvatarUrl = (url?: string) => resolveAvatarUrl(url || '')

const duration = computed(
  () =>
    `${String(Math.floor(elapsedSec.value / 60)).padStart(2, '0')}:${String(elapsedSec.value % 60).padStart(2, '0')}`,
)

const statusLine = computed(() => {
  if (state.value === 'incoming') return '邀请你加入群通话'
  if (state.value === 'connected') return duration.value
  return '正在连接群通话…'
})

const candidates = computed(() => {
  const current = new Set(participants.value.map((p) => p.userId))
  return availableMembers.value.filter((m) => !current.has(m.userId))
})

const canMinimize = computed(
  () => visible.value && (state.value === 'connecting' || state.value === 'connected'),
)

const floatPeer = computed(() => {
  const connected = participants.value.find((p) => p.state === 'connected' && p.stream)
  if (connected) return connected
  return participants.value[0] || null
})

const memberCountText = computed(() => {
  const n = participants.value.filter((p) => p.state === 'connected').length + 1
  return `${n}人`
})

function hasLiveCamera(stream?: MediaStream | null) {
  if (!stream) return false
  return stream.getVideoTracks().some(
    (t) => t.readyState !== 'ended' && t.enabled && !t.muted,
  )
}

const cameraSortTick = ref(0)
let cameraSortTimer: ReturnType<typeof setInterval> | null = null

watch(
  [visible, isVideo],
  ([vis, video]) => {
    if (cameraSortTimer) {
      clearInterval(cameraSortTimer)
      cameraSortTimer = null
    }
    if (vis && video) {
      cameraSortTimer = setInterval(() => {
        cameraSortTick.value += 1
      }, 1500)
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  if (cameraSortTimer) clearInterval(cameraSortTimer)
})

/** 已连接且开摄像头的优先靠前 */
const sortedParticipants = computed(() => {
  void cameraSortTick.value
  const rank = (p: { state: string; stream?: MediaStream; userId: string }) => {
    const connected = p.state === 'connected'
    const cam = isVideo.value && hasLiveCamera(p.stream)
    if (connected && cam) return 0
    if (connected) return 1
    if (p.state === 'connecting') return 2
    if (p.state === 'ringing') return 3
    if (p.state === 'invited') return 4
    return 5
  }
  return [...participants.value].sort((a, b) => {
    const d = rank(a) - rank(b)
    if (d !== 0) return d
    return String(a.userId).localeCompare(String(b.userId))
  })
})

const videoTileCount = computed(
  () => sortedParticipants.value.length + (state.value === 'incoming' ? 0 : 1),
)

const videoGridClass = computed(() => {
  const n = videoTileCount.value
  if (n <= 1) return 'cols-1'
  if (n <= 4) return 'cols-2'
  return 'cols-3'
})

function memberStateText(st: string) {
  if (st === 'connected') return '通话中'
  if (st === 'connecting') return '连接中'
  if (st === 'ringing') return '响铃中'
  if (st === 'declined') return '已拒绝'
  return '等待中'
}

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

watch(
  [localStream, localVideo, floatLocalVideo, minimized],
  ([stream]) => {
    const targets = [localVideo.value, floatLocalVideo.value]
    for (const el of targets) {
      if (!el) continue
      if (el.srcObject !== stream) el.srcObject = stream
      if (stream) void el.play().catch(() => {})
    }
  },
  { flush: 'post' },
)

// 远端成员 stream 到位后强制绑到 video（避免 ref 回调只触发一次导致黑屏）
watch(
  () => participants.value.map((p) => `${p.userId}:${p.state}:${p.stream?.id || ''}`).join('|'),
  () => {
    if (!isVideo.value || minimized.value) return
    // next tick 等 DOM 更新
    requestAnimationFrame(() => {
      participants.value.forEach((p) => {
        if (!p.stream) return
        const nodes = document.querySelectorAll(`[data-group-video="${p.userId}"]`)
        nodes.forEach((node) => {
          const video = node as HTMLVideoElement
          if (video.srcObject !== p.stream) video.srcObject = p.stream || null
          void video.play().catch(() => {})
        })
      })
    })
  },
)

function toggle(id: string) {
  selected.value = selected.value.includes(id)
    ? selected.value.filter((x) => x !== id)
    : [...selected.value, id]
}

function invite() {
  const members = candidates.value.filter((m) => selected.value.includes(m.userId)) as GroupCallMember[]
  call.inviteMembers(members)
  selected.value = []
  showInvite.value = false
}

function bindRemoteVideo(el: unknown, stream?: MediaStream) {
  if (!el || !stream) return
  const video = el as HTMLVideoElement
  if (video.srcObject !== stream) video.srcObject = stream
  void video.play().catch(() => {})
}

function bindRemoteAudio(el: unknown, stream?: MediaStream) {
  if (!el || !stream) return
  const audio = el as HTMLAudioElement
  if (audio.srcObject !== stream) audio.srcObject = stream
  void audio.play().catch(() => {})
}
</script>

<template>
  <Teleport to="body">
    <!-- 音频始终挂载，最小化时也继续播 -->
    <template v-if="visible">
      <audio
        v-for="p in participants.filter((item) => !!item.stream)"
        :key="`audio-${p.userId}`"
        :ref="(el) => bindRemoteAudio(el, p.stream)"
        autoplay
        playsinline
        class="remote-audio"
      />
    </template>

    <button
      v-if="visible && minimized"
      type="button"
      class="group-float"
      :class="{ audio: !isVideo, dragging }"
      :style="floatStyle"
      :aria-label="isVideo ? '恢复群视频通话' : '恢复群语音通话'"
      @pointerdown="onFloatPointerDown"
      @pointermove="onFloatPointerMove"
      @pointerup="onFloatPointerUp"
      @pointercancel="onFloatPointerUp"
      @click="onFloatClick"
    >
      <template v-if="isVideo">
        <video
          v-if="floatPeer?.stream"
          :ref="(el) => bindRemoteVideo(el, floatPeer?.stream)"
          class="float-video"
          autoplay
          muted
          playsinline
        />
        <video
          v-else-if="localStream && state !== 'incoming'"
          ref="floatLocalVideo"
          class="float-video mirror"
          autoplay
          muted
          playsinline
        />
        <img v-else-if="callAvatarUrl(floatPeer?.avatarUrl)" :src="callAvatarUrl(floatPeer?.avatarUrl)" class="float-avatar" alt="" />
        <span v-else class="float-avatar initials">{{ (groupTitle || '群').slice(0, 1) }}</span>
        <span class="float-time">{{ statusLine }} · {{ memberCountText }}</span>
      </template>
      <template v-else>
        <span class="float-avatar icon">
          <span class="material-symbols-outlined">{{ isVideo ? 'videocam' : 'call' }}</span>
        </span>
        <span class="float-audio-meta">
          <strong>{{ groupTitle || '群通话' }}</strong>
          <small>{{ statusLine }} · {{ memberCountText }}</small>
        </span>
      </template>
      <span class="float-restore material-symbols-outlined">open_in_full</span>
    </button>

    <div
      v-if="visible && !minimized"
      class="group-call"
      @touchstart="onOverlayTouchStart"
      @touchmove="onOverlayTouchMove"
      @touchend="onOverlayTouchEnd"
      @touchcancel="onOverlayTouchEnd"
      @pointerdown="onOverlayPointerDown"
      @pointermove="onOverlayPointerMove"
      @pointerup="onOverlayPointerUp"
      @pointercancel="onOverlayPointerUp"
    >
      <div class="top">
        <button
          v-if="canMinimize"
          type="button"
          class="minimize-call"
          aria-label="最小化群通话"
          @click="minimize"
        >
          <span class="material-symbols-outlined">picture_in_picture_alt</span>
        </button>
        <span class="material-symbols-outlined media-icon">{{ isVideo ? 'videocam' : 'call' }}</span>
        <div class="top-meta">
          <strong>{{ groupTitle || '群聊' }}</strong>
          <small>{{ statusLine }} · {{ memberCountText }}</small>
        </div>
      </div>

      <div
        class="members"
        :class="[isVideo ? 'video-grid' : 'audio-grid', isVideo ? videoGridClass : '']"
      >
        <div v-if="state !== 'incoming'" class="member self">
          <div class="tile">
            <video
              v-if="isVideo"
              ref="localVideo"
              class="avatar video mirror"
              autoplay
              muted
              playsinline
            />
            <span v-else class="avatar"><span class="material-symbols-outlined">person</span></span>
            <div class="tile-meta">
              <small>我</small>
            </div>
          </div>
        </div>
        <div v-for="p in sortedParticipants" :key="p.userId" class="member">
          <div class="tile">
            <video
              v-if="isVideo && p.stream"
              :data-group-video="p.userId"
              :ref="(el) => bindRemoteVideo(el, p.stream)"
              class="avatar video"
              autoplay
              muted
              playsinline
            />
            <img v-else-if="callAvatarUrl(p.avatarUrl)" :src="callAvatarUrl(p.avatarUrl)" class="avatar" alt="" />
            <span v-else class="avatar">{{ p.nickname.slice(0, 1) }}</span>
            <div class="tile-meta">
              <small>{{ p.nickname }}</small>
              <em>{{ memberStateText(p.state) }}</em>
            </div>
          </div>
        </div>
      </div>

      <div v-if="state === 'incoming'" class="actions incoming">
        <CallSwipeActions
          :accept-icon="isVideo ? 'videocam' : 'call'"
          accept-label="加入"
          reject-label="拒绝"
          @accept="call.accept()"
          @reject="call.reject()"
        />
      </div>
      <div v-else class="actions">
        <button type="button" class="round" :class="{ on: muted }" @click="call.toggleMute()">
          <span class="material-symbols-outlined">{{ muted ? 'mic_off' : 'mic' }}</span>
          <small>静音</small>
        </button>
        <button
          v-if="isVideo"
          type="button"
          class="round"
          :class="{ on: !cameraOn }"
          @click="call.toggleCamera()"
        >
          <span class="material-symbols-outlined">{{ cameraOn ? 'videocam' : 'videocam_off' }}</span>
          <small>摄像头</small>
        </button>
        <button
          v-if="candidates.length"
          type="button"
          class="round"
          @click="showInvite = true"
        >
          <span class="material-symbols-outlined">person_add</span>
          <small>邀请</small>
        </button>
        <button type="button" class="round reject" @click="call.leave()">
          <span class="material-symbols-outlined">call_end</span>
          <small>挂断</small>
        </button>
      </div>
    </div>

    <van-popup
      v-model:show="showInvite"
      position="bottom"
      round
      teleport="body"
      :z-index="4300"
      class="invite-sheet"
    >
      <header>
        <button @click="showInvite = false">取消</button>
        <strong>邀请群成员</strong>
        <button :disabled="!selected.length" @click="invite">邀请</button>
      </header>
      <button
        v-for="m in candidates"
        :key="m.userId"
        class="candidate"
        @click="toggle(m.userId)"
      >
        <img v-if="callAvatarUrl(m.avatarUrl)" :src="callAvatarUrl(m.avatarUrl)" alt="" />
        <span v-else class="fallback">{{ m.nickname.slice(0, 1) }}</span>
        <span>{{ m.nickname }}</span>
        <span class="check" :class="{ checked: selected.includes(m.userId) }">✓</span>
      </button>
    </van-popup>
  </Teleport>
</template>

<style scoped>
.group-call {
  position: fixed;
  inset: 0;
  z-index: 4100;
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: 100dvh;
  overflow: hidden;
  padding: calc(12px + env(safe-area-inset-top)) 12px 0;
  color: #fff;
  background: linear-gradient(160deg, #243248, #0d1118 55%);
  touch-action: pan-y;
}

.minimize-call {
  flex: 0 0 40px;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: #fff;
  background: rgba(20, 21, 25, 0.55);
  backdrop-filter: blur(8px);
}

.minimize-call .material-symbols-outlined {
  font-size: 20px;
}

.top {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  margin-bottom: 10px;
  z-index: 2;
}

.top .media-icon {
  flex: 0 0 auto;
  font-size: 24px;
  line-height: 1;
  opacity: 0.9;
}

.top-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.top strong {
  font-size: 17px;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.top small {
  color: #aeb7c4;
  font-size: 12px;
}

.members {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  padding-bottom: 8px;
}

.members.audio-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px 10px;
  align-content: start;
}

.members.video-grid {
  display: grid;
  gap: 8px;
  align-content: start;
}

.members.video-grid.cols-1 {
  grid-template-columns: minmax(0, 1fr);
}

.members.video-grid.cols-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.members.video-grid.cols-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.member {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.tile {
  position: relative;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}

.video-grid .tile {
  overflow: hidden;
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.35);
  aspect-ratio: 3 / 4;
}

.cols-1.video-grid .tile {
  aspect-ratio: 3 / 4;
  max-height: min(62vh, 520px);
  margin: 0 auto;
  width: min(100%, 360px);
}

.avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  object-fit: cover;
  background: #455267;
  font-size: 26px;
}

.video-grid .avatar {
  width: 100%;
  height: 100%;
  border-radius: 0;
}

.video-grid .avatar.video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  aspect-ratio: auto;
  object-fit: cover;
  background: #05070a;
  transform: translateZ(0);
  backface-visibility: hidden;
}

.video-grid .avatar.video.mirror {
  transform: scaleX(-1);
}

.tile-meta {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 100%;
  margin-top: 8px;
  min-width: 0;
}

.video-grid .tile-meta {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
  margin: 0;
  padding: 18px 8px 8px;
  align-items: flex-start;
  background: linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.72));
  pointer-events: none;
}

.tile-meta small,
.tile-meta em {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tile-meta small {
  font-size: 13px;
  font-weight: 600;
}

.tile-meta em {
  font-size: 11px;
  font-style: normal;
  color: #aeb7c4;
}

.video-grid .tile-meta em {
  color: rgba(255, 255, 255, 0.78);
}

.actions {
  flex: 0 0 auto;
  position: relative;
  z-index: 3;
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 16px 18px;
  padding: 12px 8px calc(14px + env(safe-area-inset-bottom));
  /* Keep the footer seamless with the call canvas. The old near-black
     gradient stacked over the page background and looked like a bottom
     shadow, especially above Android's navigation safe area. */
  background: transparent;
}

.actions.incoming {
  width: 100%;
  padding-top: 8px;
}

.round {
  border: 0;
  background: transparent;
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.round > span:first-child {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: #364153;
  font-size: 24px;
}

.round small {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.86);
}

.round.reject > span:first-child {
  background: #f04444;
}

.round.on > span:first-child {
  background: #697586;
}

.group-float {
  position: fixed;
  z-index: 4100;
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

.group-float.dragging {
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.5);
  transform: scale(1.03);
  transition: none;
}

.group-float.audio {
  width: 210px;
  height: 72px;
  aspect-ratio: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 38px 10px 10px;
}

.float-video,
.float-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
}

.float-video.mirror {
  transform: scaleX(-1);
}

.float-avatar {
  display: grid;
  place-items: center;
  background: #34363d;
}

.float-avatar.initials {
  font-size: 34px;
}

.float-avatar.icon {
  flex: 0 0 52px;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: #364153;
}

.float-avatar.icon .material-symbols-outlined {
  font-size: 26px;
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
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: center;
  background: linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.55));
  pointer-events: none;
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

.group-float.audio .float-restore {
  bottom: auto;
  top: 50%;
  transform: translateY(-50%);
}

.remote-audio {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.invite-sheet {
  max-height: 72vh;
  padding-bottom: env(safe-area-inset-bottom);
  overflow: auto;
  color: var(--pulse-text);
  background: var(--pulse-surface-container);
}

.invite-sheet header {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  justify-content: space-between;
  padding: 18px;
  color: #fff;
  background: var(--pulse-surface-high);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.invite-sheet header button {
  border: 0;
  background: none;
  color: #69a7ff;
}

.invite-sheet header button:first-child {
  color: var(--pulse-text-secondary);
}

.invite-sheet header button:disabled {
  color: #626d7c;
}

.candidate {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 18px;
  border: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.055);
  color: var(--pulse-text);
  background: var(--pulse-surface-container);
  text-align: left;
}

.candidate:active {
  background: #2a3443;
}

.candidate img,
.fallback {
  flex: 0 0 44px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid rgba(255, 255, 255, 0.16);
}

.fallback {
  display: grid;
  place-items: center;
  color: #fff;
  background: linear-gradient(145deg, #5478d8, #7656c7);
  font-size: 17px;
  font-weight: 600;
}

.check {
  margin-left: auto;
  width: 22px;
  height: 22px;
  border: 1px solid #697586;
  border-radius: 50%;
  color: transparent;
  text-align: center;
}

.check.checked {
  color: #fff;
  background: #4389ef;
  border-color: #4389ef;
}
</style>

<style>
.van-popup.invite-sheet {
  color: var(--pulse-text) !important;
  background: var(--pulse-surface-container) !important;
}
.van-popup.invite-sheet header {
  color: #fff !important;
  background: var(--pulse-surface-high) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
}
.van-popup.invite-sheet .candidate {
  color: var(--pulse-text) !important;
  background: var(--pulse-surface-container) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.055) !important;
}
.van-popup.invite-sheet .fallback {
  color: #fff !important;
  background: linear-gradient(145deg, #5478d8, #7656c7) !important;
}
</style>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { getMapConfig } from '@/api/map'
import {
  fetchLiveLocation,
  endLiveLocation,
  leaveLiveLocation,
  updateLiveLocation,
  type LiveLocationParticipant,
} from '@/api/conversation'
import { sendTextMessage } from '@/api/message'
import { loadBaiduMap } from '@/utils/baiduMap'
import UserAvatar from '@/components/UserAvatar.vue'

defineOptions({ name: 'LiveLocationView' })

const route = useRoute()
const router = useRouter()
// Keep the sharing target stable while the geolocation watcher continues in the background.
// `useRoute()` is reactive, so reading route.params.id later can otherwise become "undefined"
// after the user leaves this page and make the heartbeat call an invalid API URL.
const conversationId = String(route.params.id || '')
const conversationTitle = computed(() => String(route.query.title || (route.query.type === 'group' ? '群聊' : '好友')))
const mapEl = ref<HTMLElement | null>(null)
const loading = ref(true)
const mapError = ref('')
const sharing = ref(false)
const isInitiator = ref(false)
const locating = ref(false)
const participants = ref<LiveLocationParticipant[]>([])
const statusText = ref('等待开始共享')

let BMap: any
let map: any
let watchId: number | null = null
let pollTimer: number | null = null
let lastUploadAt = 0
let uploadInFlight = false
let announceNewSession = false
const overlays: any[] = []

type LiveLocationRuntime = Window & {
  __pulseLiveLocationWatchId?: number
  __pulseLiveLocationHeartbeatId?: number
  __pulseLiveLocationConversationId?: string
  __pulseLiveLocationAnnouncedConversationId?: string
  __pulseLiveLocationLastPosition?: GeolocationPosition
}

function liveRuntime(): LiveLocationRuntime {
  return window as LiveLocationRuntime
}

const otherCount = computed(() => participants.value.filter((item) => !item.mine).length)
const actionLabel = computed(() => {
  if (locating.value) return '正在获取位置…'
  if (participants.value.length && !sharing.value) return '加入实时位置共享'
  return '开始共享实时位置'
})

function clearOverlays() {
  if (!map) return
  overlays.splice(0).forEach((overlay) => map.removeOverlay(overlay))
}

function renderParticipants(center = false) {
  if (!map || !BMap) return
  clearOverlays()
  const points: any[] = []
  participants.value.forEach((item) => {
    const point = new BMap.Point(Number(item.longitude), Number(item.latitude))
    points.push(point)
    const marker = new BMap.Marker(point)
    const label = new BMap.Label(item.mine ? '我' : (item.nickname || '成员'), {
      offset: new BMap.Size(18, -18),
    })
    label.setStyle({
      color: '#fff',
      background: item.mine ? '#16a765' : '#3478f6',
      border: '0',
      borderRadius: '12px',
      padding: '4px 9px',
      fontSize: '12px',
      boxShadow: '0 3px 10px rgba(0,0,0,.22)',
    })
    marker.setLabel(label)
    map.addOverlay(marker)
    overlays.push(marker)
  })
  if (!points.length) return
  if (center || points.length > 1) map.setViewport(points, { margins: [90, 50, 210, 50] })
  else map.centerAndZoom(points[0], 17)
}

async function refreshState(center = false) {
  try {
    const wasSharing = sharing.value
    const state = await fetchLiveLocation(conversationId)
    participants.value = state.participants || []
    isInitiator.value = !!state.initiator || participants.value.some(
      (item) => item.mine && item.userId === state.initiatorId,
    )
    sharing.value = participants.value.some((item) => item.mine)
    if (wasSharing && !sharing.value) clearLocalSharing()
    statusText.value = sharing.value
      ? `${participants.value.length} 人正在共享位置`
      : participants.value.length
        ? `${participants.value.length} 人正在共享，点击加入`
        : '暂无成员共享实时位置'
    renderParticipants(center)
    return state.active
  } catch (error) {
    if (!participants.value.length) statusText.value = error instanceof Error ? error.message : '状态同步失败'
    return null
  }
}

function uploadPosition(position: GeolocationPosition, force = false) {
  if (!BMap || uploadInFlight) return
  const now = Date.now()
  if (!force && now - lastUploadAt < 2500) return
  lastUploadAt = now
  uploadInFlight = true
  const gps = new BMap.Point(position.coords.longitude, position.coords.latitude)
  const converter = new BMap.Convertor()
  converter.translate([gps], 1, 5, async (data: any) => {
    const runtime = liveRuntime()
    const shouldAnnounce = announceNewSession
      && runtime.__pulseLiveLocationAnnouncedConversationId !== conversationId
    if (shouldAnnounce) runtime.__pulseLiveLocationAnnouncedConversationId = conversationId
    const point = data?.status === 0 && data.points?.[0] ? data.points[0] : gps
    try {
      const state = await updateLiveLocation(conversationId, {
        latitude: Number(point.lat),
        longitude: Number(point.lng),
        accuracy: position.coords.accuracy,
        heading: position.coords.heading ?? undefined,
        start: shouldAnnounce,
      })
      locating.value = false
      sharing.value = true
      participants.value = state.participants || []
      isInitiator.value = !!state.initiator || participants.value.some(
        (item) => item.mine && item.userId === state.initiatorId,
      )
      statusText.value = `${participants.value.length} 人正在共享位置`
      renderParticipants(force)
      if (shouldAnnounce) {
        announceNewSession = false
        void sendTextMessage({
          conversationId,
          content: `__PULSE_LIVE_LOCATION__:${state.sessionId || ''}`,
          clientMsgId: `live-location-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          msgType: 0,
        })
      }
    } catch (error) {
      if (shouldAnnounce) delete runtime.__pulseLiveLocationAnnouncedConversationId
      locating.value = false
      showToast(error instanceof Error ? error.message : '位置更新失败')
    } finally {
      uploadInFlight = false
    }
  })
}

function startSharing() {
  if (locating.value || watchId != null) return
  if (!navigator.geolocation) {
    showToast('当前设备不支持定位')
    return
  }
  const runtime = liveRuntime()
  announceNewSession = route.query.entry === 'start' && participants.value.length === 0
  if (runtime.__pulseLiveLocationWatchId != null) {
    if (runtime.__pulseLiveLocationConversationId === conversationId) {
      watchId = runtime.__pulseLiveLocationWatchId
      sharing.value = true
      locating.value = false
      statusText.value = `${participants.value.length || 1} 人正在共享位置`
      return
    }
    navigator.geolocation.clearWatch(runtime.__pulseLiveLocationWatchId)
    if (runtime.__pulseLiveLocationHeartbeatId != null) {
      window.clearInterval(runtime.__pulseLiveLocationHeartbeatId)
    }
    if (runtime.__pulseLiveLocationConversationId) {
      void leaveLiveLocation(runtime.__pulseLiveLocationConversationId)
    }
  }
  delete runtime.__pulseLiveLocationAnnouncedConversationId
  locating.value = true
  statusText.value = '正在获取你的位置…'
  watchId = navigator.geolocation.watchPosition(
    (position) => {
      runtime.__pulseLiveLocationLastPosition = position
      uploadPosition(position, !sharing.value)
    },
    (error) => {
      locating.value = false
      statusText.value = '无法获取位置'
      showToast(error.code === 1 ? '请开启定位权限后重试' : '定位失败，请稍后重试')
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 },
  )
  runtime.__pulseLiveLocationWatchId = watchId
  runtime.__pulseLiveLocationConversationId = conversationId
  runtime.__pulseLiveLocationHeartbeatId = window.setInterval(() => {
    const lastPosition = runtime.__pulseLiveLocationLastPosition
    if (lastPosition) uploadPosition(lastPosition, true)
  }, 15_000)
}

function clearLocalSharing() {
  const runtime = liveRuntime()
  const activeWatchId = runtime.__pulseLiveLocationWatchId ?? watchId
  if (activeWatchId != null) navigator.geolocation.clearWatch(activeWatchId)
  if (runtime.__pulseLiveLocationHeartbeatId != null) window.clearInterval(runtime.__pulseLiveLocationHeartbeatId)
  watchId = null
  delete runtime.__pulseLiveLocationWatchId
  delete runtime.__pulseLiveLocationHeartbeatId
  delete runtime.__pulseLiveLocationConversationId
  delete runtime.__pulseLiveLocationAnnouncedConversationId
  delete runtime.__pulseLiveLocationLastPosition
  sharing.value = false
}

async function stopSharing(endSession = false) {
  try {
    await showConfirmDialog({
      title: endSession ? '结束位置共享？' : '退出位置共享？',
      message: endSession ? '结束后，所有成员都将退出本次位置共享。' : '退出后，你将不再共享自己的位置。',
      confirmButtonText: endSession ? '结束共享' : '退出共享',
      confirmButtonColor: '#e5484d',
    })
  } catch { return }
  clearLocalSharing()
  try {
    if (endSession) await endLiveLocation(conversationId)
    else await leaveLiveLocation(conversationId)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '操作失败')
  }
  await refreshState(true)
}

function goBack() {
  router.back()
}

function focusParticipant(item: LiveLocationParticipant) {
  if (!map || !BMap) return
  map.centerAndZoom(new BMap.Point(item.longitude, item.latitude), 18)
}

onMounted(async () => {
  try {
    const config = await getMapConfig()
    if (!config.configured || !config.ak) throw new Error('地图尚未配置，请联系管理员')
    BMap = await loadBaiduMap(config.ak)
    await nextTick()
    map = new BMap.Map(mapEl.value, { enableMapClick: false })
    map.centerAndZoom(new BMap.Point(116.404, 39.915), 12)
    map.enableScrollWheelZoom(true)
    const active = await refreshState(true)
    const expectedSessionId = String(route.query.session || '')
    const currentState = await fetchLiveLocation(conversationId)
    const sessionMismatch = expectedSessionId && currentState.sessionId !== expectedSessionId
    if ((active === false || sessionMismatch) && route.query.entry !== 'start') {
      showToast('位置共享已结束')
      router.back()
      return
    }
    if (sharing.value) startSharing()
    pollTimer = window.setInterval(() => void refreshState(), 3000)
  } catch (error) {
    mapError.value = error instanceof Error ? error.message : '实时地图加载失败'
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => {
  if (pollTimer != null) window.clearInterval(pollTimer)
  clearOverlays()
  map = null
})
</script>

<template>
  <main class="live-page">
    <div ref="mapEl" class="live-map" />
    <div v-if="loading || mapError" class="map-state">
      <span class="material-symbols-outlined">{{ mapError ? 'location_off' : 'progress_activity' }}</span>
      <p>{{ mapError || '正在加载实时地图…' }}</p>
    </div>

    <header class="live-header">
      <button type="button" class="round-btn" aria-label="返回" @click="goBack">
        <span class="material-symbols-outlined">arrow_back</span>
      </button>
      <div class="header-copy">
        <strong>实时位置</strong>
        <span>{{ conversationTitle }}</span>
      </div>
      <button type="button" class="round-btn" aria-label="查看全部成员" @click="renderParticipants(true)">
        <span class="material-symbols-outlined">center_focus_strong</span>
      </button>
    </header>

    <section class="live-sheet">
      <div class="sheet-handle" />
      <div class="status-row">
        <div class="pulse-dot" :class="{ active: sharing }"><i /></div>
        <div><strong>{{ statusText }}</strong><small>位置仅对当前聊天中的成员可见</small></div>
      </div>

      <div v-if="participants.length" class="people-strip">
        <button v-for="item in participants" :key="item.userId" type="button" @click="focusParticipant(item)">
          <UserAvatar
            :src="item.avatarUrl"
            :user-id="item.userId"
            :name="item.nickname"
            :size="42"
          />
          <strong>{{ item.mine ? '我' : item.nickname }}</strong>
        </button>
      </div>

      <button v-if="!sharing" type="button" class="primary-action" :disabled="locating || !!mapError" @click="startSharing">
        <span class="material-symbols-outlined">share_location</span>{{ actionLabel }}
      </button>
      <template v-else>
        <button v-if="isInitiator" type="button" class="end-session-action" @click="stopSharing(true)">
          <span class="material-symbols-outlined">stop_circle</span>结束位置共享
        </button>
        <button type="button" class="stop-action" @click="stopSharing(false)">
          <span class="material-symbols-outlined">logout</span>{{ isInitiator ? '仅退出共享' : '退出位置共享' }}
        </button>
      </template>
      <p v-if="sharing" class="sharing-tip">已持续更新 · 另有 {{ otherCount }} 位成员参与</p>
    </section>
  </main>
</template>

<style scoped>
.live-page {
  --live-surface: rgba(255, 255, 255, 0.94);
  --live-solid: #fff;
  --live-text: #17201b;
  --live-muted: #6d7771;
  --live-border: rgba(21, 47, 34, 0.1);
  --live-shadow: 0 18px 48px rgba(19, 42, 30, 0.18);
  position: relative; width: 100%; height: 100vh; height: 100dvh; overflow: hidden;
  background: #dfe7e1; color: var(--live-text);
}
.live-map { position: absolute; inset: 0; }
.map-state { position: absolute; inset: 0; z-index: 8; display: grid; place-content: center; justify-items: center; gap: 10px; background: #e8efea; color: #68766e; }
.map-state .material-symbols-outlined { font-size: 42px; }
.map-state p { margin: 0; }
.live-header { position: absolute; z-index: 10; top: calc(12px + env(safe-area-inset-top)); left: 14px; right: 14px; display: grid; grid-template-columns: 44px 1fr 44px; align-items: center; gap: 10px; }
.round-btn { width: 44px; height: 44px; display: grid; place-items: center; border: 1px solid var(--live-border); border-radius: 50%; background: var(--live-surface); color: var(--live-text); box-shadow: 0 6px 20px rgba(0,0,0,.12); backdrop-filter: blur(18px); }
.header-copy { min-width: 0; padding: 8px 16px; border: 1px solid var(--live-border); border-radius: 22px; background: var(--live-surface); text-align: center; box-shadow: 0 6px 20px rgba(0,0,0,.1); backdrop-filter: blur(18px); }
.header-copy strong,.header-copy span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.header-copy strong { font-size: 16px; }
.header-copy span { margin-top: 2px; color: var(--live-muted); font-size: 11px; }
.live-sheet { position: absolute; z-index: 10; right: 12px; bottom: calc(12px + env(safe-area-inset-bottom)); left: 12px; padding: 8px 18px 18px; border: 1px solid var(--live-border); border-radius: 26px; background: var(--live-surface); box-shadow: var(--live-shadow); backdrop-filter: blur(24px); }
.sheet-handle { width: 38px; height: 4px; margin: 0 auto 14px; border-radius: 9px; background: var(--live-border); }
.status-row { display: flex; align-items: center; gap: 12px; }
.status-row > div:last-child { min-width: 0; }
.status-row strong,.status-row small { display: block; }
.status-row strong { font-size: 16px; }
.status-row small { margin-top: 4px; color: var(--live-muted); font-size: 12px; }
.pulse-dot { position: relative; width: 38px; height: 38px; flex: 0 0 38px; display: grid; place-items: center; border-radius: 50%; background: rgba(80, 91, 85, .12); }
.pulse-dot i { width: 12px; height: 12px; border-radius: 50%; background: #8b9590; }
.pulse-dot.active { background: rgba(22, 167, 101, .14); }
.pulse-dot.active i { background: #16a765; box-shadow: 0 0 0 0 rgba(22,167,101,.4); animation: live-pulse 1.8s infinite; }
.people-strip { display: flex; gap: 14px; margin: 16px -4px 14px; overflow-x: auto; scrollbar-width: none; }
.people-strip button { min-width: 52px; padding: 0; border: 0; background: transparent; color: var(--live-text); }
.people-strip img,.people-strip span { width: 46px; height: 46px; margin: auto; display: grid; place-items: center; border: 2px solid var(--live-solid); border-radius: 50%; background: #3478f6; color: white; object-fit: cover; box-shadow: 0 3px 10px rgba(0,0,0,.16); }
.people-strip strong { display: block; max-width: 66px; margin-top: 5px; overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.primary-action,.stop-action { width: 100%; height: 50px; display: flex; align-items: center; justify-content: center; gap: 8px; border: 0; border-radius: 15px; color: #fff; font-size: 15px; font-weight: 700; }
.primary-action { background: linear-gradient(135deg, #21bd72, #079854); box-shadow: 0 8px 22px rgba(7,152,84,.25); }
.primary-action:disabled { opacity: .5; }
.stop-action { background: rgba(229, 72, 77, .12); color: #d83d43; }
.end-session-action { width: 100%; height: 50px; margin-bottom: 10px; display: flex; align-items: center; justify-content: center; gap: 8px; border: 0; border-radius: 15px; background: #e5484d; color: #fff; font-size: 15px; font-weight: 700; box-shadow: 0 8px 20px rgba(229,72,77,.2); }
.sharing-tip { margin: 10px 0 -2px; color: var(--live-muted); font-size: 11px; text-align: center; }
@keyframes live-pulse { 70% { box-shadow: 0 0 0 9px rgba(22,167,101,0); } 100% { box-shadow: 0 0 0 0 rgba(22,167,101,0); } }
:global(:root[data-theme='dark'] .live-page) { --live-surface: rgba(24, 28, 26, .94); --live-solid: #1a1e1c; --live-text: #f0f4f1; --live-muted: #a1aaa5; --live-border: rgba(255,255,255,.1); --live-shadow: 0 18px 52px rgba(0,0,0,.42); background: #171d19; }
:global(:root[data-theme='dark'] .live-map) { filter: none; }
:global(:root[data-theme='dark'] .map-state) { background: #171d19; color: #a1aaa5; }
:global(:root[data-theme='dark'] .stop-action) { background: rgba(255, 92, 98, .14); color: #ff8589; }
</style>

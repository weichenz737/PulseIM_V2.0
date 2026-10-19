import { getToken, refreshTokenIfNeeded } from '@/api/http'
import { nativeApp, nativeNetwork, isNativeApp } from '@/native'
import '@/api/message'
import { flushMessageOutbox } from './messageOutbox'
import {
  connectWs,
  isWsAuthed,
  onWsConnectionChange,
  reconnectWs,
  updateWsRuntimeState,
  updateWsToken,
} from './ws'

interface Removable {
  remove(): Promise<void>
}

let initialized = false
let appActive = true
let online = navigator.onLine
let refreshTimer: number | null = null
let lastSyncAt = 0
const handles: Removable[] = []

async function refreshSessionAndConnect(forceTokenRefresh = false) {
  if (!online || !appActive) return
  const refreshed = await refreshTokenIfNeeded(forceTokenRefresh)
  const token = refreshed || getToken()
  if (!token) return
  // 只替换断线后使用的 token；已有鉴权连接无需因 token 刷新而断开重连。
  updateWsToken(token, false)
  // Token 刷新不应每分钟主动重连一次。频繁重连会先清掉在线键，
  // 也会让好友端反复收到下线/上线状态；只有实时连接确实未鉴权时才重连。
  if (!isWsAuthed()) reconnectWs(token)
  await flushMessageOutbox()
}

function requestOfflineSync() {
  const now = Date.now()
  if (now - lastSyncAt < 1000) return
  lastSyncAt = now
  window.dispatchEvent(new CustomEvent('pulse:offline-sync', { detail: { at: now } }))
}

async function applyNetworkStatus(connected: boolean) {
  const wasOffline = !online
  online = connected
  updateWsRuntimeState({ online })
  window.dispatchEvent(new CustomEvent('pulse:network-status', { detail: { online } }))
  if (online && wasOffline) await refreshSessionAndConnect()
}

async function applyAppState(active: boolean) {
  const resumed = !appActive && active
  appActive = active
  updateWsRuntimeState({ active })
  if (resumed) await refreshSessionAndConnect()
}

export async function initializeImRuntime() {
  if (initialized) return
  initialized = true

  const status = await nativeNetwork.getNetworkStatus().catch(() => ({
    connected: navigator.onLine,
    connectionType: 'unknown' as const,
  }))
  online = status.connected
  appActive = document.visibilityState !== 'hidden'
  updateWsRuntimeState({ online, active: appActive })

  const networkHandle = await nativeNetwork
    .onNetworkStatusChange(({ connected }) => {
      void applyNetworkStatus(connected)
    })
    .catch(() => null)
  if (networkHandle) handles.push(networkHandle)

  if (isNativeApp) {
    const appStateHandle = await nativeApp
      .onAppStateChange(({ isActive }) => {
        void applyAppState(isActive)
      })
      .catch(() => null)
    if (appStateHandle) handles.push(appStateHandle)
  }

  const browserOnline = () => void applyNetworkStatus(true)
  const browserOffline = () => void applyNetworkStatus(false)
  const visibility = () => void applyAppState(document.visibilityState !== 'hidden')
  const tokenUpdated = (event: Event) => {
    const token = String((event as CustomEvent<{ token?: string }>).detail?.token || '')
    if (token) updateWsToken(token)
  }
  window.addEventListener('online', browserOnline)
  window.addEventListener('offline', browserOffline)
  document.addEventListener('visibilitychange', visibility)
  window.addEventListener('pulse:token-updated', tokenUpdated)

  onWsConnectionChange((state) => {
    if (state !== 'connected') return
    void flushMessageOutbox()
    requestOfflineSync()
  })

  refreshTimer = window.setInterval(() => {
    if (online && appActive) void refreshSessionAndConnect()
  }, 60_000)

  const token = getToken()
  if (token) connectWs(token)
  if (online && appActive) void refreshSessionAndConnect()

  window.addEventListener(
    'beforeunload',
    () => {
      window.removeEventListener('online', browserOnline)
      window.removeEventListener('offline', browserOffline)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('pulse:token-updated', tokenUpdated)
      if (refreshTimer !== null) window.clearInterval(refreshTimer)
      handles.splice(0).forEach((handle) => void handle.remove())
    },
    { once: true },
  )
}

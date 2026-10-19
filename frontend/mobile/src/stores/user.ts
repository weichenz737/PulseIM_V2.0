import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { clearToken, getToken, isTokenExpired, refreshTokenIfNeeded, setToken } from '@/api/http'
import { clearDeviceId, login as loginApi, logout as logoutApi, type LoginPayload, type LoginResult } from '@/api/auth'
import { resolveAvatarUrl } from '@/api/file'
import { connectWs, disconnectWs } from '@/im/ws'
import { resetUnreadNotifications } from '@/native/unreadBadge'
import { useConversationInboxStore } from './conversationInbox'
import { clearChatWarmCache } from './chatWarmCache'
import { clearChatDrafts } from './chatDraft'
import {
  listSavedAccounts,
  removeSavedAccount,
  updateSavedAccountToken,
  upsertSavedAccount,
  type SavedAccount,
} from './accounts'

const PROFILE_KEY = 'pulse_user_profile'

interface StoredProfile {
  userId: string
  pulseId?: string
  nickname: string
  avatar: string
  phone?: string
  region?: string
  signature?: string
}

function migrateProfileFromSession(): void {
  try {
    if (localStorage.getItem(PROFILE_KEY)) {
      sessionStorage.removeItem(PROFILE_KEY)
      return
    }
    const legacy = sessionStorage.getItem(PROFILE_KEY)
    if (!legacy) return
    localStorage.setItem(PROFILE_KEY, legacy)
    sessionStorage.removeItem(PROFILE_KEY)
  } catch {
    // ignore
  }
}

function readProfile(): StoredProfile | null {
  migrateProfileFromSession()
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    return raw ? (JSON.parse(raw) as StoredProfile) : null
  } catch {
    return null
  }
}

function writeProfile(p: StoredProfile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(p))
  try {
    sessionStorage.removeItem(PROFILE_KEY)
  } catch {
    // ignore
  }
}

function clearProfile() {
  try {
    sessionStorage.removeItem(PROFILE_KEY)
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(PROFILE_KEY)
  } catch {
    // ignore
  }
}

/** 从 JWT payload 解析 uid（不校验签名，仅用于展示侧判断） */
export function parseUserIdFromToken(token: string | null | undefined): string {
  if (!token) return ''
  try {
    const part = token.split('.')[1]
    if (!part) return ''
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')))
    const uid = json.uid ?? json.sub
    return uid != null ? String(uid) : ''
  } catch {
    return ''
  }
}

export const useUserStore = defineStore('user', () => {
  const saved = readProfile()
  const token = ref<string | null>(getToken())
  const userId = ref<string>(saved?.userId || parseUserIdFromToken(token.value) || '')
  const pulseId = ref<string>(saved?.pulseId || '')
  const nickname = ref<string>(saved?.nickname || '')
  const avatar = ref<string>(resolveAvatarUrl(saved?.avatar || ''))
  const phone = ref<string>(saved?.phone || '')
  const region = ref<string>(saved?.region || '')
  const signature = ref<string>(saved?.signature || '')

  function persistCurrentAccount() {
    if (!token.value || !userId.value) return
    const persistAvatar =
      avatar.value.startsWith('blob:') || avatar.value.startsWith('data:') ? '' : avatar.value
    let deviceId = ''
    try {
      deviceId = localStorage.getItem('pulse_device_id') || ''
    } catch {
      // Device ID persistence is best effort.
    }
    upsertSavedAccount({
      userId: userId.value,
      pulseId: pulseId.value || undefined,
      nickname: nickname.value,
      avatar: persistAvatar,
      phone: phone.value || undefined,
      region: region.value || undefined,
      signature: signature.value || undefined,
      deviceId: deviceId || undefined,
      token: token.value,
    })
  }

  function resetAccountScopedState(unreadCount = 0) {
    const inbox = useConversationInboxStore()
    inbox.stopWsBridge()
    inbox.startWsBridge()
    // 先恢复目标账号上次已知的未读数，消息列表加载完成后会用服务端数据校正。
    inbox.setUnreadTotal(unreadCount)
    clearChatWarmCache()
    clearChatDrafts()
    window.dispatchEvent(new CustomEvent('pulse:account-switched', {
      detail: { userId: userId.value },
    }))
  }

  window.addEventListener('pulse:token-updated', (event) => {
    const next = String(
      (event as CustomEvent<{ token?: string }>).detail?.token || '',
    ).trim()
    if (next) {
      token.value = next
      updateSavedAccountToken(userId.value, next)
    }
  })

  const isLoggedIn = computed(() => !!token.value)

  function setUserInfo(info: Partial<LoginResult> & { region?: string; signature?: string }) {
    const previousUserId = userId.value
    const nextToken = String(info.token || '').trim()
    if (nextToken && !info.userId) {
      const uid = parseUserIdFromToken(nextToken)
      if (uid) userId.value = uid
    }
    if (info.userId != null && info.userId !== '') {
      userId.value = String(info.userId)
    }
    if (info.pulseId !== undefined) pulseId.value = String(info.pulseId || '')
    if (info.nickname !== undefined) nickname.value = String(info.nickname || '')
    if (info.phone !== undefined) phone.value = String(info.phone || '')
    if (info.region !== undefined) region.value = String(info.region || '')
    if (info.signature !== undefined) signature.value = String(info.signature || '')
    if (info.avatar !== undefined) {
      const next = resolveAvatarUrl(String(info.avatar).trim())
      // 资料接口是头像状态的权威来源。空串表示用户已清除头像，
      // null 也表示新账号没有头像；必须清掉本地旧默认图/旧头像，
      // 交给头像组件显示昵称首字母。
      avatar.value = next
    }
    if (nextToken) {
      token.value = nextToken
      // 资料字段先于事件更新，避免新增账号时把旧账号的 Token 覆盖掉。
      setToken(nextToken)
      connectWs(nextToken)
      if (previousUserId && previousUserId !== userId.value) {
        const savedAccount = listSavedAccounts().find((account) => account.userId === userId.value)
        resetAccountScopedState(savedAccount?.unreadCount ?? 0)
      }
    }

    if (userId.value) {
      const persistAvatar =
        avatar.value.startsWith('blob:') || avatar.value.startsWith('data:') ? '' : avatar.value
      writeProfile({
        userId: userId.value,
        pulseId: pulseId.value,
        nickname: nickname.value,
        avatar: persistAvatar,
        phone: phone.value || undefined,
        region: region.value || undefined,
        signature: signature.value || undefined,
      })
      persistCurrentAccount()
    }
  }

  function activateSavedAccount(account: SavedAccount): boolean {
    if (!account.token || isTokenExpired(account.token)) return false
    const previousUserId = userId.value
    disconnectWs()
    token.value = account.token
    userId.value = account.userId
    pulseId.value = account.pulseId || ''
    nickname.value = account.nickname || ''
    avatar.value = resolveAvatarUrl(account.avatar || '')
    phone.value = account.phone || ''
    region.value = account.region || ''
    signature.value = account.signature || ''
    if (account.deviceId) {
      try {
        localStorage.setItem('pulse_device_id', account.deviceId)
      } catch {
        // Device ID persistence is best effort.
      }
    } else {
      clearDeviceId()
    }
    writeProfile({
      userId: userId.value,
      pulseId: pulseId.value,
      nickname: nickname.value,
      avatar: avatar.value,
      phone: phone.value || undefined,
      region: region.value || undefined,
      signature: signature.value || undefined,
    })
    setToken(account.token)
    connectWs(account.token)
    if (previousUserId !== account.userId) resetAccountScopedState(account.unreadCount ?? 0)
    return true
  }

  async function login(payload: LoginPayload) {
    const result = await loginApi(payload)
    setUserInfo(result)
    return result
  }

  function logout() {
    const currentUserId = userId.value
    logoutApi().catch(() => {
      /* ignore */
    })
    removeSavedAccount(currentUserId)
    disconnectWs()
    useConversationInboxStore().setUnreadTotal(0)
    void resetUnreadNotifications()
    token.value = null
    userId.value = ''
    pulseId.value = ''
    nickname.value = ''
    avatar.value = ''
    phone.value = ''
    region.value = ''
    signature.value = ''
    clearToken()
    clearProfile()
    clearDeviceId()
    clearChatDrafts()
  }

  function clearLocalSession() {
    disconnectWs()
    useConversationInboxStore().setUnreadTotal(0)
    void resetUnreadNotifications()
    token.value = null
    userId.value = ''
    pulseId.value = ''
    nickname.value = ''
    avatar.value = ''
    phone.value = ''
    region.value = ''
    signature.value = ''
    clearToken()
    clearProfile()
    clearDeviceId()
    clearChatDrafts()
  }

  function prepareForAccountLogin() {
    // Keep the active session alive while the user is entering another account.
    // This makes the back button from the login/register flow return safely.
    persistCurrentAccount()
    // Auth endpoints generate a fresh ID for the account being added. The
    // current account's ID is already stored in its saved-account record.
    clearDeviceId()
  }

  function restoreSession() {
    const savedToken = getToken()
    if (!savedToken) {
      token.value = null
      return
    }
    token.value = savedToken
    // 强制刷新一次：让后端同时下发附件专用 HttpOnly Cookie，
    // 老会话（localStorage 里已有 token、尚无 Cookie）无需重新登录即可加载图片/视频
    void refreshTokenIfNeeded(true)
    const profile = readProfile()
    if (profile?.userId) {
      userId.value = profile.userId
      pulseId.value = profile.pulseId || ''
      nickname.value = profile.nickname || ''
      avatar.value = resolveAvatarUrl(profile.avatar || '')
      phone.value = profile.phone || ''
      region.value = profile.region || ''
      signature.value = profile.signature || ''
    } else if (!userId.value) {
      userId.value = parseUserIdFromToken(savedToken)
    }
    persistCurrentAccount()
    const savedAccount = listSavedAccounts().find((account) => account.userId === userId.value)
    useConversationInboxStore().setUnreadTotal(savedAccount?.unreadCount ?? 0)
    // 刷新后也必须重连 IM，否则 Redis 无在线标记，好友会一直显示离线
    connectWs(savedToken)
  }

  return {
    token,
    userId,
    pulseId,
    nickname,
    avatar,
    phone,
    region,
    signature,
    isLoggedIn,
    setUserInfo,
    login,
    activateSavedAccount,
    clearLocalSession,
    prepareForAccountLogin,
    saveCurrentAccount: persistCurrentAccount,
    getSavedAccounts: listSavedAccounts,
    logout,
    restoreSession,
  }
})

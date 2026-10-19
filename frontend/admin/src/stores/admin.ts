import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { clearToken, getToken, setToken } from '@/api/http'
import {
  adminLogin,
  fetchAdminProfile,
  updateAdminProfile,
  type AdminLoginPayload,
  type AdminLoginResult,
  type AdminProfile,
} from '@/api/auth'

const ADMIN_INFO_KEY = 'pulse_admin_info'

function loadSavedInfo(): AdminProfile {
  try {
    const raw = localStorage.getItem(ADMIN_INFO_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as AdminProfile
  } catch {
    return {}
  }
}

function saveInfo(info: AdminProfile) {
  localStorage.setItem(
    ADMIN_INFO_KEY,
    JSON.stringify({
      userId: info.userId || '',
      username: info.username || '',
      nickname: info.nickname || '',
      avatarUrl: info.avatarUrl || '',
      superAdmin: !!info.superAdmin,
      permissions: info.permissions || [],
    }),
  )
}

export const useAdminStore = defineStore('admin', () => {
  const saved = loadSavedInfo()
  const token = ref<string | null>(getToken())
  const userId = ref(saved.userId || '')
  const username = ref(saved.username || '')
  const nickname = ref(saved.nickname || '')
  const avatarUrl = ref(saved.avatarUrl || '')
  const superAdmin = ref(!!saved.superAdmin)
  const permissions = ref<string[]>(saved.permissions || [])

  const isLoggedIn = computed(() => !!token.value)
  const displayName = computed(() => nickname.value || username.value || '管理员')

  function hasPermission(code: string) {
    if (!code) return true
    if (superAdmin.value) return true
    return permissions.value.includes(code)
  }

  function setAdminInfo(info: Partial<AdminLoginResult | AdminProfile>) {
    if (info.token) {
      token.value = info.token
      setToken(info.token)
    }
    if (info.userId !== undefined) userId.value = info.userId || ''
    if (info.username !== undefined) username.value = info.username || ''
    if (info.nickname !== undefined) nickname.value = info.nickname || ''
    if (info.avatarUrl !== undefined) avatarUrl.value = info.avatarUrl || ''
    if (info.superAdmin !== undefined) superAdmin.value = !!info.superAdmin
    if (info.permissions !== undefined) permissions.value = info.permissions || []
    saveInfo({
      userId: userId.value,
      username: username.value,
      nickname: nickname.value,
      avatarUrl: avatarUrl.value,
      superAdmin: superAdmin.value,
      permissions: permissions.value,
    })
  }

  async function login(payload: AdminLoginPayload) {
    const result = await adminLogin(payload)
    setAdminInfo(result)
    return result
  }

  async function refreshProfile() {
    if (!token.value) return
    const profile = await fetchAdminProfile()
    setAdminInfo(profile)
    return profile
  }

  async function updateProfile(payload: { nickname?: string; avatarUrl?: string }) {
    const profile = await updateAdminProfile(payload)
    setAdminInfo(profile)
    return profile
  }

  function logout() {
    token.value = null
    userId.value = ''
    username.value = ''
    nickname.value = ''
    avatarUrl.value = ''
    superAdmin.value = false
    permissions.value = []
    clearToken()
    localStorage.removeItem(ADMIN_INFO_KEY)
  }

  return {
    token,
    userId,
    username,
    nickname,
    avatarUrl,
    superAdmin,
    permissions,
    displayName,
    isLoggedIn,
    hasPermission,
    setAdminInfo,
    login,
    refreshProfile,
    updateProfile,
    logout,
  }
})

import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useUserStore } from './user'
import {
  readLockScreenConfig,
  readLockScreenLocked,
  clearLockScreenConfig,
  saveLockScreenConfig,
  verifyLockScreenPassword,
  writeLockScreenLocked,
} from '../../../shared/lockScreen'
import { isNativeApp } from '@/native/platform'

export const useLockScreenStore = defineStore('lockScreen', () => {
  const userStore = useUserStore()
  const locked = ref(false)
  const revision = ref(0)

  function syncForUser(userId = userStore.userId): void {
    locked.value = isNativeApp && Boolean(userId) && readLockScreenLocked(userId)
    revision.value += 1
  }

  watch(() => userStore.userId, (userId) => syncForUser(userId), { immediate: true })

  const config = computed(() => {
    revision.value
    return isNativeApp ? readLockScreenConfig(userStore.userId) : null
  })
  const hasPassword = computed(() => Boolean(config.value?.passwordHash))
  const passwordHint = computed(() => config.value?.hint || '')

  async function setPassword(password: string, hint: string): Promise<void> {
    if (!isNativeApp) throw new Error('网页端不支持锁屏密码')
    await saveLockScreenConfig(userStore.userId, password, hint)
    writeLockScreenLocked(userStore.userId, false)
    locked.value = false
    revision.value += 1
  }

  function clearPassword(): void {
    if (!isNativeApp) return
    const userId = userStore.userId
    clearLockScreenConfig(userId)
    writeLockScreenLocked(userId, false)
    locked.value = false
    revision.value += 1
  }

  function lock(): boolean {
    if (!isNativeApp || !hasPassword.value || !userStore.userId) return false
    locked.value = true
    writeLockScreenLocked(userStore.userId, true)
    return true
  }

  async function unlock(password: string): Promise<boolean> {
    if (!isNativeApp) return false
    const userId = userStore.userId
    const ok = await verifyLockScreenPassword(password, readLockScreenConfig(userId))
    if (!ok) return false
    locked.value = false
    writeLockScreenLocked(userId, false)
    return true
  }

  return {
    isLocked: locked,
    hasPassword,
    passwordHint,
    setPassword,
    clearPassword,
    lock,
    unlock,
  }
})

<script setup lang="ts">
defineOptions({ name: 'AccountSwitchView' })
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { isTokenExpired } from '@/api/http'
import { resolveAvatarUrl } from '@/api/file'
import { useUserStore } from '@/stores/user'
import { getCachedAccountAvatar, loadCachedAccountAvatar } from '@/stores/avatarCache'
import { smartBack } from '@/utils/navBack'
import type { SavedAccount } from '@/stores/accounts'
import { useRegisterStore } from '@/stores/register'
import { refreshSavedAccountBadges } from '@/api/savedAccountBadge'

const router = useRouter()
const userStore = useUserStore()
const registerStore = useRegisterStore()
const accounts = ref<SavedAccount[]>([])
const switchingUserId = ref('')
const brokenAvatarIds = ref<Set<string>>(new Set())
const accountAvatarUrls = ref<Record<string, string>>({})

const currentUserId = computed(() => userStore.userId)

function refreshAccounts() {
  userStore.saveCurrentAccount()
  accounts.value = userStore.getSavedAccounts()
  void warmAccountAvatars(accounts.value)
  // 已登录账号在后台期间不会经过 MainLayout 的实时角标同步；进入切换页时
  // 使用各自的 Token 补齐服务端最新角标，并持久化到该账号记录。
  void refreshSavedAccountBadges(accounts.value)
}

async function warmAccountAvatars(list: SavedAccount[]) {
  await Promise.all(list.map(async (account) => {
    const source = resolveAvatarUrl(account.avatar || '')
    if (!source) return
    const stable = getCachedAccountAvatar(account.userId, source)
    if (stable) {
      accountAvatarUrls.value = { ...accountAvatarUrls.value, [account.userId]: stable }
      return
    }
    const cached = await loadCachedAccountAvatar(account.userId, source, account.token)
    if (cached) accountAvatarUrls.value = { ...accountAvatarUrls.value, [account.userId]: cached }
  }))
}

function onSavedAccountUpdated(event: Event) {
  const userId = String(
    (event as CustomEvent<{ userId?: string }>).detail?.userId || '',
  )
  if (!userId || accounts.value.some((account) => account.userId === userId)) {
    accounts.value = userStore.getSavedAccounts()
    void warmAccountAvatars(accounts.value)
  }
}

onMounted(() => {
  refreshAccounts()
  window.addEventListener('pulse:saved-account-updated', onSavedAccountUpdated)
})

onUnmounted(() => {
  window.removeEventListener('pulse:saved-account-updated', onSavedAccountUpdated)
})

function avatarFor(account: SavedAccount) {
  if (brokenAvatarIds.value.has(account.userId)) return ''
  const source = resolveAvatarUrl(account.avatar || '')
  return accountAvatarUrls.value[account.userId]
    || getCachedAccountAvatar(account.userId, source)
    || source
}

function avatarInitial(account: SavedAccount) {
  return (account.nickname || '用').slice(0, 1)
}

function accountIdentifier(account: SavedAccount) {
  if (account.phone) {
    return /^1\d{10}$/.test(account.phone)
      ? `${account.phone.slice(0, 3)}****${account.phone.slice(-4)}`
      : account.phone
  }
  return account.pulseId ? `PulseID ${account.pulseId}` : `账号 ${account.userId}`
}

function accountBadgeCount(account: SavedAccount) {
  // 两个字段可能来自不同的同步时机：badgeCount 是总角标，
  // unreadCount 是消息列表刚校正的未读数。取较大值，避免旧的总角标
  // 为 0 时把已经同步到的消息未读角标遮掉。
  return Math.max(
    0,
    Math.floor(Math.max(Number(account.badgeCount) || 0, Number(account.unreadCount) || 0)),
  )
}

function unreadBadge(account: SavedAccount) {
  const value = accountBadgeCount(account)
  return value > 99 ? '99+' : String(value)
}

function markAvatarBroken(userId: string) {
  const next = new Set(brokenAvatarIds.value)
  next.add(userId)
  brokenAvatarIds.value = next
}

function goBack() {
  smartBack(router, '/app/me')
}

function startAccountLogin(phone?: string) {
  // 新账号流程不能复用上一次未完成注册留下的头像草稿。
  registerStore.reset()
  userStore.prepareForAccountLogin()
  const query: Record<string, string> = {
    addAccount: '1',
    returnTo: '/account/switch',
  }
  if (phone) query.phone = phone
  void router.push({ name: 'Login', query })
}

function addAccount() {
  startAccountLogin()
}

async function selectAccount(account: SavedAccount) {
  if (switchingUserId.value || account.userId === currentUserId.value) return
  if (isTokenExpired(account.token)) {
    startAccountLogin(account.phone)
    return
  }

  try {
    await showConfirmDialog({
      title: '切换账号',
      message: `确认切换到“${account.nickname || accountIdentifier(account)}”吗？`,
      cancelButtonText: '取消',
      confirmButtonText: '切换',
    })
  } catch {
    return
  }

  switchingUserId.value = account.userId
  try {
    if (!userStore.activateSavedAccount(account)) {
      startAccountLogin(account.phone)
      return
    }
    showToast('已切换账号')
    await router.replace('/app/messages')
  } finally {
    switchingUserId.value = ''
  }
}
</script>

<template>
  <div class="account-switch-page">
    <header class="page-header">
      <button type="button" class="back-btn" aria-label="返回" @click="goBack">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <h1 class="page-title">切换账号</h1>
      <div class="header-spacer" />
    </header>

    <main class="main-content">
      <p class="page-hint">选择已登录的账号，或添加一个新账号</p>

      <section class="account-list" aria-label="账号列表">
        <button
          v-for="account in accounts"
          :key="account.userId"
          type="button"
          class="account-item"
          :class="{ active: account.userId === currentUserId }"
          :disabled="!!switchingUserId"
          @click="selectAccount(account)"
        >
          <div class="account-avatar">
            <img
              v-if="avatarFor(account)"
              :src="avatarFor(account)"
              :alt="`${account.nickname || '账号'}头像`"
              @error="markAvatarBroken(account.userId)"
            />
            <span v-else>{{ avatarInitial(account) }}</span>
          </div>
          <div class="account-info">
            <strong>{{ account.nickname || 'Pulse 用户' }}</strong>
            <span>{{ accountIdentifier(account) }}</span>
          </div>
          <span class="account-state">
            <span v-if="accountBadgeCount(account)" class="unread-badge">{{ unreadBadge(account) }}</span>
            <span v-if="account.userId === currentUserId" class="current-badge">当前账号</span>
            <span v-else class="material-symbols-outlined account-arrow">chevron_right</span>
          </span>
        </button>

        <button type="button" class="add-account-item" @click="addAccount">
          <span class="add-account-icon">
            <span class="material-symbols-outlined">add</span>
          </span>
          <span class="add-account-text">
            <strong>新增账号</strong>
            <small>登录已有账号或注册新账号</small>
          </span>
          <span class="material-symbols-outlined account-arrow">chevron_right</span>
        </button>
      </section>

      <p class="storage-hint">已登录账号仅保存在本设备，切换账号不会退出其他账号。</p>
    </main>
  </div>
</template>

<style scoped>
.account-switch-page {
  min-height: 100%;
  background: var(--pulse-page-bg, var(--pulse-bg));
}

.page-header {
  display: flex;
  align-items: center;
  height: 64px;
  padding: var(--pulse-header-pad-top) 16px 0;
  box-sizing: border-box;
}

.back-btn {
  width: 40px;
  height: 40px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--pulse-text);
  display: grid;
  place-items: center;
}

.back-btn:active {
  background: var(--pulse-pressed);
}

.page-title {
  flex: 1;
  margin: 0;
  text-align: center;
  font-size: calc(var(--pulse-content-font-size, 15px) + 3px);
  font-weight: 600;
  color: var(--pulse-text);
}

.header-spacer {
  width: 40px;
}

.main-content {
  padding: 24px 16px 32px;
}

.page-hint,
.storage-hint {
  margin: 0 4px 12px;
  color: var(--pulse-text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.account-list {
  overflow: hidden;
  border: 1px solid var(--pulse-border);
  border-radius: var(--pulse-radius-lg, 16px);
  background: var(--pulse-surface-container);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

.account-item,
.add-account-item {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 76px;
  padding: 12px 16px;
  border: 0;
  border-bottom: 1px solid var(--pulse-divider);
  background: transparent;
  color: var(--pulse-text);
  text-align: left;
  font: inherit;
}

.account-item:active,
.add-account-item:active {
  background: var(--pulse-pressed);
}

.account-item:disabled {
  opacity: 0.72;
}

.account-item.active {
  background: color-mix(in srgb, var(--pulse-primary) 7%, transparent);
}

.account-item:last-child,
.add-account-item:last-child {
  border-bottom: 0;
}

.account-avatar {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 50%;
  background: var(--pulse-surface-highest);
  color: var(--pulse-primary);
  display: grid;
  place-items: center;
  font-size: 20px;
  font-weight: 700;
}

.account-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.account-info,
.add-account-text {
  min-width: 0;
  flex: 1;
  margin-left: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.account-info strong,
.add-account-text strong {
  overflow: hidden;
  color: var(--pulse-text);
  font-size: 15px;
  line-height: 20px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.account-info span,
.add-account-text small {
  overflow: hidden;
  color: var(--pulse-text-secondary);
  font-size: 12px;
  line-height: 16px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.current-badge {
  flex-shrink: 0;
  padding: 4px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--pulse-primary) 14%, transparent);
  color: var(--pulse-primary);
  font-size: 11px;
}

.account-state {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin-left: 12px;
}

.unread-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  box-sizing: border-box;
  border-radius: 999px;
  background: var(--pulse-danger, #ef4444);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
}

.account-arrow {
  flex-shrink: 0;
  color: var(--pulse-text-secondary);
  font-size: 21px;
}

.add-account-icon {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border: 1px dashed var(--pulse-primary);
  border-radius: 50%;
  color: var(--pulse-primary);
  display: grid;
  place-items: center;
}

.add-account-icon .material-symbols-outlined {
  font-size: 24px;
}

.storage-hint {
  margin-top: 16px;
  text-align: center;
  font-size: 12px;
}
</style>

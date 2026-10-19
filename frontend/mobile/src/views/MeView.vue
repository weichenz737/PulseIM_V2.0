<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { useUserStore } from '@/stores/user'
import { usePreferenceStore } from '@/stores/preference'
import { fetchUserProfile } from '@/api/contact'
import { userQrPayload } from '@/utils/qrcode'
import { isNativeApp, nativeClipboard } from '@/native'
import QrCodeCard from '@/components/QrCodeCard.vue'
import QrPreviewModal from '@/components/QrPreviewModal.vue'
import UserAvatar from '@/components/UserAvatar.vue'

const router = useRouter()
const userStore = useUserStore()
const preferenceStore = usePreferenceStore()
const previewVisible = ref(false)
const refreshing = ref(false)
const mePageRef = ref<HTMLElement | null>(null)
let mePageSlot: HTMLElement | null = null
let lastMeScrollTop: number | null = null

const region = computed(() => userStore.region)
const signature = computed(() => userStore.signature)

const ME_RETURN_ENTRY_KEY = 'pulse_me_return_entry'
const ME_SCROLL_TOP_KEY = 'pulse_me_scroll_top'

function meScrollStorageKey() {
  return `${ME_SCROLL_TOP_KEY}:${userStore.userId || 'anonymous'}`
}

function pageSlotElement() {
  const current = mePageRef.value?.closest<HTMLElement>('.page-slot')
  if (current) mePageSlot = current
  return current || mePageSlot
}

function onMePageScroll() {
  const pageSlot = pageSlotElement()
  if (!pageSlot) return
  rememberMeScroll(pageSlot.scrollTop)
}

function bindMePageScroll() {
  const pageSlot = pageSlotElement()
  if (!pageSlot) return
  pageSlot.removeEventListener('scroll', onMePageScroll)
  pageSlot.addEventListener('scroll', onMePageScroll, { passive: true })
}

function unbindMePageScroll() {
  mePageSlot?.removeEventListener('scroll', onMePageScroll)
}

function rememberMeScroll(top?: number) {
  const pageSlot = pageSlotElement()
  const nextTop = top ?? lastMeScrollTop ?? pageSlot?.scrollTop
  if (!Number.isFinite(nextTop)) return
  lastMeScrollTop = Math.max(0, Number(nextTop))
  try {
    sessionStorage.setItem(meScrollStorageKey(), String(lastMeScrollTop))
  } catch {
    // Ignore storage failures; navigation should still work normally.
  }
}

function hasRememberedMeScroll() {
  try {
    return sessionStorage.getItem(meScrollStorageKey()) !== null
  } catch {
    return false
  }
}

function restoreMeScroll() {
  let raw: string | null = null
  try {
    raw = sessionStorage.getItem(meScrollStorageKey())
  } catch {
    return
  }
  if (raw === null) return
  const top = Number(raw)
  if (!Number.isFinite(top) || top < 0) return
  lastMeScrollTop = top

  void nextTick(() => {
    const restore = () => {
      const pageSlot = pageSlotElement()
      if (pageSlot) {
        pageSlot.scrollTop = top
        lastMeScrollTop = pageSlot.scrollTop === top ? top : lastMeScrollTop
      }
    }
    restore()
    window.requestAnimationFrame(() => {
      restore()
      window.requestAnimationFrame(restore)
    })
  })
}

function rememberMeEntry(entry: string) {
  try {
    sessionStorage.setItem(ME_RETURN_ENTRY_KEY, entry)
  } catch {
    // Ignore storage failures; navigation should still work normally.
  }
}

function settingEntryKey(item: SettingItem): string {
  return `setting:${item.icon}`
}

function openSettingItem(item: SettingItem) {
  rememberMeEntry(settingEntryKey(item))
  item.action()
}

function restoreMeEntry() {
  let entry = ''
  try {
    entry = sessionStorage.getItem(ME_RETURN_ENTRY_KEY) || ''
    sessionStorage.removeItem(ME_RETURN_ENTRY_KEY)
  } catch {
    return
  }
  if (!entry) return

  void nextTick(() => {
    window.requestAnimationFrame(() => {
      const target = mePageRef.value?.querySelector<HTMLElement>(`[data-me-entry="${entry}"]`)
      target?.scrollIntoView({ behavior: 'auto', block: 'center' })
    })
  })
}

interface SettingItem {
  icon: string
  label: string
  sub?: string
  extra?: string
  action: () => unknown
  /** 仅原生端显示（网页端无系统通知能力） */
  nativeOnly?: boolean
}

const displayPulseId = computed(() => {
  if (userStore.pulseId && /^\d{7}$/.test(userStore.pulseId)) return userStore.pulseId
  if (userStore.userId) {
    const n = Number(userStore.userId)
    if (Number.isFinite(n) && n > 0) return String(1_000_000 + n).padStart(7, '0').slice(-7)
  }
  return '—'
})

const qrPayload = computed(() =>
  displayPulseId.value !== '—' ? userQrPayload(displayPulseId.value) : '',
)

const settingGroups: { items: SettingItem[] }[] = [
  {
    items: [
      { icon: 'groups_3', label: '我的圈子', action: () => router.push('/communities') },
      { icon: 'account_balance_wallet', label: '我的钱包', action: () => router.push('/wallet') },
      { icon: 'bookmark', label: '我的收藏', action: () => router.push('/favorites') },
      { icon: 'shield', label: '账号与安全', action: () => router.push('/settings/security') },
      { icon: 'photo', label: '朋友圈', action: () => router.push('/me/moments') },
      { icon: 'group', label: '朋友权限', action: () => router.push('/settings/friends') },
    ],
  },
  {
    items: [
      {
        icon: 'bell',
        label: '消息通知',
        action: () => router.push('/settings/notifications'),
        nativeOnly: true,
      },
      { icon: 'tune', label: '通用', action: () => router.push('/settings/general') },
      { icon: 'storage', label: '存储空间', sub: '管理缓存与离线数据', action: () => router.push('/settings/storage') },
    ],
  },
  {
    items: [
      { icon: 'help', label: '帮助与反馈', sub: '常见问题与意见反馈', action: () => router.push('/help') },
      { icon: 'info', label: '关于 Pulse', action: () => router.push('/about') },
    ],
  },
]

function visibleItems(group: { items: SettingItem[] }): SettingItem[] {
  return group.items.filter((item) =>
    (isNativeApp || !item.nativeOnly) && (isNativeApp || item.icon !== 'storage'),
  )
}

onMounted(() => {
  void loadProfile()
  bindMePageScroll()
  if (!hasRememberedMeScroll()) restoreMeEntry()
})

onActivated(() => {
  bindMePageScroll()
  restoreMeScroll()
})

onDeactivated(() => {
  rememberMeScroll()
  unbindMePageScroll()
})

onBeforeUnmount(() => {
  rememberMeScroll()
  unbindMePageScroll()
})

onBeforeRouteLeave(() => {
  const pageSlot = pageSlotElement()
  rememberMeScroll(pageSlot?.scrollTop)
})

async function loadProfile() {
  try {
    const p = await fetchUserProfile()
    userStore.setUserInfo({
      userId: p.userId,
      pulseId: p.pulseId,
      nickname: p.nickname,
      avatar: p.avatarUrl,
      region: p.region || '',
      signature: p.signature || '',
    })
  } catch {
    // ignore
  }
}

async function copyPulseId() {
  const value = displayPulseId.value
  if (!value || value === '—') return
  try {
    if (isNativeApp) {
      await nativeClipboard.writeText(value)
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
    } else {
      throw new Error('clipboard-unavailable')
    }
    showToast('PulseID 已复制')
  } catch {
    showToast('当前环境不支持复制，请手动记录')
  }
}

async function onPullRefresh() {
  refreshing.value = true
  try {
    await loadProfile()
  } finally {
    refreshing.value = false
  }
}

function goEditProfile() {
  rememberMeEntry('profile')
  router.push('/profile/edit')
}

function goSwitchAccount() {
  router.push('/account/switch')
}

async function onThemeToggle() {
  const nextTheme = preferenceStore.isLightTheme ? 'dark' : 'light'
  const label = nextTheme === 'light' ? '白日模式' : '夜间模式'
  try {
    await showConfirmDialog({
      title: `切换为${label}`,
      message: `确认切换为${label}吗？`,
      cancelButtonText: '取消',
      confirmButtonText: '确认切换',
    })
    preferenceStore.setTheme(nextTheme)
  } catch {
    /* cancelled */
  }
}

async function handleLogout() {
  try {
    await showConfirmDialog({
      title: '退出登录',
      message: '确定要退出当前账号吗？',
      confirmButtonText: '退出',
      confirmButtonColor: '#ee0a24',
    })
    userStore.logout()
    await router.replace('/login')
  } catch {
    // User cancelled.
  }
}
</script>

<template>
  <div ref="mePageRef" class="me-page">
    <header class="page-header tab-home-header">
      <h1 class="page-title">我的</h1>
      <button
        type="button"
        class="theme-btn"
        :aria-label="preferenceStore.isLightTheme ? '切换为夜间模式' : '切换为白日模式'"
        @click="onThemeToggle"
      >
        <span class="material-symbols-outlined">{{ preferenceStore.isLightTheme ? 'dark_mode' : 'light_mode' }}</span>
      </button>
    </header>

    <main class="main-content">
      <van-pull-refresh
        v-model="refreshing"
        class="list-pull"
        pulling-text="下拉刷新"
        loosing-text="释放刷新"
        loading-text="刷新中..."
        @refresh="onPullRefresh"
      >
      <div class="profile-card" data-me-entry="profile" @click="goEditProfile">
        <UserAvatar
          :src="userStore.avatar"
          :user-id="userStore.userId"
          :name="userStore.nickname || '用'"
          :size="64"
          class="profile-avatar"
        />
        <div class="profile-info">
          <div class="profile-name">{{ userStore.nickname || 'Pulse 用户' }}</div>
          <div class="profile-id-row">
            <div class="profile-id">PulseID: {{ displayPulseId }}</div>
            <button type="button" class="profile-copy-btn" aria-label="复制 PulseID" @click.stop="copyPulseId">
              <span class="material-symbols-outlined">content_copy</span>
            </button>
          </div>
          <div class="profile-meta" :class="{ 'is-placeholder': !region }" :aria-hidden="!region">
            {{ region }}
          </div>
          <div class="profile-signature" :class="{ 'is-placeholder': !signature }" :aria-hidden="!signature">
            {{ signature }}
          </div>
        </div>
        <svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </div>

      <button type="button" class="switch-account-btn" @click="goSwitchAccount">
        <span class="material-symbols-outlined">switch_account</span>
        <span>切换账号</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>

      <section v-if="qrPayload" class="qr-card">
        <QrCodeCard
          :payload="qrPayload"
          :size="128"
          :title="userStore.nickname || '我的二维码'"
          :subtitle="`PulseID ${displayPulseId}`"
          :filename="`pulse-${displayPulseId}.png`"
          @preview="previewVisible = true"
        />
        <p class="qr-tip">点击二维码可放大预览</p>
      </section>

      <div class="groups">
        <section v-for="(group, gi) in settingGroups" :key="gi" class="setting-group">
          <div
            v-for="(item, ii) in visibleItems(group)"
            :key="item.label"
            class="setting-item"
            :class="{ 'has-divider': ii < visibleItems(group).length - 1 }"
            :data-me-entry="settingEntryKey(item)"
            role="button"
            tabindex="0"
            @click="openSettingItem(item)"
            @keydown.enter.prevent="openSettingItem(item)"
          >
            <div class="item-left">
              <span class="item-icon" :data-icon="item.icon">
                <svg v-if="item.icon === 'groups_3'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <circle cx="12" cy="8" r="3"/><circle cx="5.5" cy="10" r="2.25"/><circle cx="18.5" cy="10" r="2.25"/><path d="M7 19v-1.25A4.75 4.75 0 0 1 11.75 13h.5A4.75 4.75 0 0 1 17 17.75V19"/><path d="M2 19v-.75A3.25 3.25 0 0 1 5.25 15H7"/><path d="M22 19v-.75A3.25 3.25 0 0 0 18.75 15H17"/>
                </svg>
                <svg v-else-if="item.icon === 'account_balance_wallet'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M4 6.5h14a2 2 0 0 1 2 2V19H4a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3h12"/><path d="M20 10.5h-5a2.5 2.5 0 0 0 0 5h5"/><circle cx="15" cy="13" r=".7" fill="currentColor" stroke="none"/>
                </svg>
                <svg v-else-if="item.icon === 'shield'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                <svg v-else-if="item.icon === 'group'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                <svg v-else-if="item.icon === 'bell'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                <svg v-else-if="item.icon === 'tune'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>
                </svg>
                <svg v-else-if="item.icon === 'storage'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                </svg>
                <svg v-else-if="item.icon === 'help'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <svg v-else-if="item.icon === 'bookmark'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                </svg>
                <svg v-else-if="item.icon === 'photo'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
                </svg>
                <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
              </span>
              <div class="item-text">
                <span class="item-label">{{ item.label }}</span>
                <span v-if="item.sub && item.icon !== 'storage' && item.icon !== 'help'" class="item-sub">{{ item.sub }}</span>
              </div>
            </div>
            <div class="item-right">
              <span v-if="item.extra" class="item-extra">{{ item.extra }}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </div>
          </div>
        </section>
      </div>

      <button type="button" class="logout-btn" @click="handleLogout">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        退出登录
      </button>

      <p class="brand-footer">Pulse Communications</p>
      </van-pull-refresh>
    </main>

    <QrPreviewModal
      :show="previewVisible"
      :payload="qrPayload"
      :title="userStore.nickname || '我的二维码'"
      :filename="`pulse-${displayPulseId}.png`"
      @close="previewVisible = false"
    />
  </div>
</template>

<style scoped>
.me-page {
  min-height: 100%;
  background: var(--pulse-page-bg, var(--pulse-bg));
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  padding-top: var(--pulse-header-pad-top);
}

.page-title {
  margin: 0;
  text-align: left;
  font-size: calc(var(--pulse-content-font-size, 15px) + 3px);
  font-weight: 600;
  color: var(--pulse-text);
}

.theme-btn {
  width: 40px;
  height: 40px;
  margin-left: auto;
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--pulse-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 50%;
  position: relative;
  z-index: 2;
}

.theme-btn:active {
  background: var(--pulse-pressed);
}

.theme-btn .material-symbols-outlined {
  font-size: 22px;
}

.main-content {
  padding: 8px 16px 24px;
}

.profile-card {
  display: flex;
  align-items: center;
  gap: 16px;
  height: 148px;
  min-height: 148px;
  padding: 18px 20px;
  box-sizing: border-box;
  margin-top: 0;
  margin-bottom: 8px;
  background: var(--pulse-surface-container);
  border: 1px solid var(--pulse-border);
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  transition: background 0.2s;
}

.profile-card:active {
  background: var(--pulse-surface-high);
}

.switch-account-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  margin: 0 0 8px;
  padding: 10px 16px;
  border: 1px solid var(--pulse-border);
  border-radius: 14px;
  background: var(--pulse-surface-container);
  color: var(--pulse-primary);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 5px 16px rgba(0, 0, 0, 0.05);
}

.switch-account-btn:active {
  background: var(--pulse-pressed);
  transform: scale(0.98);
}

.switch-account-btn .material-symbols-outlined {
  font-size: 20px;
}

.profile-avatar {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  display: block;
}

.profile-avatar.initials {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: calc(var(--pulse-content-font-size, 15px) + 5px);
  font-weight: 700;
  color: var(--pulse-primary);
  background: var(--pulse-surface-highest);
}

.profile-info {
  flex: 1;
  min-width: 0;
  height: auto;
  max-height: 110px;
  overflow: hidden;
}

.profile-name {
  height: 22px;
  line-height: 22px;
  font-size: calc(var(--pulse-content-font-size, 15px) + 3px);
  font-weight: 600;
  color: var(--pulse-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.profile-id {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--pulse-text-secondary);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.profile-id-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  height: 20px;
  margin-top: 4px;
}

.profile-copy-btn {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  padding: 2px 4px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--pulse-primary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.profile-copy-btn:active {
  background: var(--pulse-pressed);
}

.profile-copy-btn .material-symbols-outlined {
  font-size: 16px;
}

.profile-meta {
  flex-shrink: 0;
  height: 18px;
  line-height: 18px;
  margin-top: 6px;
  font-size: 13px;
  color: var(--pulse-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.profile-signature {
  flex-shrink: 0;
  height: 36px;
  line-height: 18px;
  margin-top: 4px;
  font-size: 13px;
  color: var(--pulse-outline);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.profile-meta.is-placeholder,
.profile-signature.is-placeholder {
  display: none;
}

.chevron {
  flex-shrink: 0;
  color: var(--pulse-text-secondary);
}

.qr-card {
  margin-top: 8px;
  padding: 14px 16px 12px;
  background: var(--pulse-surface-container);
  border: 1px solid var(--pulse-border);
  border-radius: var(--pulse-radius-lg, 16px);
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

.qr-tip {
  margin: 8px 0 0;
  text-align: center;
  font-size: 12px;
  color: var(--pulse-outline);
}

.groups {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}

.setting-group {
  background: var(--pulse-surface-container);
  border: 1px solid var(--pulse-border);
  border-radius: var(--pulse-radius-lg, 16px);
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  cursor: pointer;
  transition: background 0.2s, transform 0.1s;
}

.setting-item:active {
  background: var(--pulse-pressed);
  transform: scale(0.98);
}

.setting-item.has-divider {
  border-bottom: 0.5px solid var(--pulse-divider);
}

.item-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.item-icon {
  color: var(--pulse-primary);
  display: flex;
}

.item-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-label {
  font-size: calc(var(--pulse-content-font-size, 15px) + 1px);
  line-height: 1.35;
  color: var(--pulse-text);
}

.item-sub {
  color: var(--pulse-text-secondary);
  font-size: 12px;
  line-height: 1.35;
}

.item-right {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--pulse-text-secondary);
}

.item-extra {
  font-size: 13px;
  font-weight: 500;
}

.logout-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  width: 100%;
  margin-top: 32px;
  padding: 16px 24px;
  border: 1px solid var(--pulse-border);
  border-radius: var(--pulse-radius-lg, 16px);
  background: var(--pulse-surface-container);
  color: var(--pulse-error);
  font-size: calc(var(--pulse-content-font-size, 15px) + 1px);
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  transition: transform 0.15s;
}

.logout-btn:active {
  transform: scale(0.98);
}

.brand-footer {
  margin: 32px 0 0;
  text-align: center;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--pulse-outline);
  opacity: 0.4;
}
</style>

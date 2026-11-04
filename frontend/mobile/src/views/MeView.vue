<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { useUserStore } from '@/stores/user'
import { fetchUserProfile } from '@/api/contact'
import { userQrPayload } from '@/utils/qrcode'
import { isNativeApp, nativeClipboard } from '@/native'
import QrPreviewModal from '@/components/QrPreviewModal.vue'
import UserAvatar from '@/components/UserAvatar.vue'

const router = useRouter()
const userStore = useUserStore()
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
      { icon: 'photo', label: '朋友圈', action: () => router.push('/me/moments') },
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
    <header class="pulse-page-nav page-header tab-home-header home-tab-header">
      <h1 class="page-title">我的</h1>
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
              <AppIcon name="content_copy"  />
            </button>
          </div>
          <div class="profile-meta" :class="{ 'is-placeholder': !region }" :aria-hidden="!region">
            {{ region }}
          </div>
          <div class="profile-signature" :class="{ 'is-placeholder': !signature }" :aria-hidden="!signature">
            {{ signature }}
          </div>
        </div>
        <AppIcon name="chevronRight" :size="16" class="chevron" />
        <button
          v-if="qrPayload"
          type="button"
          class="profile-qr-btn"
          aria-label="展示我的二维码"
          title="我的二维码"
          @click.stop="previewVisible = true"
        >
          <span class="material-symbols-outlined" aria-hidden="true">qr_code_2</span>
        </button>
      </div>

      <button type="button" class="switch-account-btn" @click="goSwitchAccount">
        <span class="material-symbols-outlined">switch_account</span>
        <span>切换账号</span>
        <AppIcon name="chevronRight" :size="16" />
      </button>

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
                <AppIcon :name="item.icon" />
              </span>
              <div class="item-text">
                <span class="item-label">{{ item.label }}</span>
                <span v-if="item.sub && item.icon !== 'storage' && item.icon !== 'help'" class="item-sub">{{ item.sub }}</span>
              </div>
            </div>
            <div class="item-right">
              <span v-if="item.extra" class="item-extra">{{ item.extra }}</span>
              <AppIcon name="chevronRight" :size="16" />
            </div>
          </div>
        </section>
      </div>

      <button type="button" class="logout-btn" @click="handleLogout">
        <AppIcon name="logout" :size="20" />
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

.main-content {
  padding: 8px 16px 24px;
}

.profile-card {
  position: relative;
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

.profile-qr-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--pulse-primary);
  cursor: pointer;
}

.profile-qr-btn .material-symbols-outlined {
  font-size: 25px;
}

.profile-qr-btn:active {
  background: var(--pulse-pressed);
}

.profile-qr-btn:focus-visible {
  outline: 2px solid var(--pulse-primary);
  outline-offset: -2px;
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
  font-size: var(--pulse-font-body);
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
  line-height: calc(22px * var(--pulse-font-scale, 1));
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
  font-size: var(--pulse-font-small);
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
  font-size: var(--pulse-font-caption);
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
  line-height: calc(18px * var(--pulse-font-scale, 1));
  margin-top: 6px;
  font-size: var(--pulse-font-small);
  color: var(--pulse-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.profile-signature {
  flex-shrink: 0;
  height: 36px;
  line-height: calc(18px * var(--pulse-font-scale, 1));
  margin-top: 4px;
  font-size: var(--pulse-font-small);
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
  font-size: var(--pulse-font-caption);
  line-height: 1.35;
}

.item-right {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--pulse-text-secondary);
}

.item-extra {
  font-size: var(--pulse-font-small);
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
  font-size: var(--pulse-font-caption);
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--pulse-outline);
  opacity: 0.4;
}
</style>

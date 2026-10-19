<script setup lang="ts">
defineOptions({ name: 'SettingsView' })
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { useUserStore } from '@/stores/user'
import { smartBack } from '@/utils/navBack'
import { isNativeApp } from '@/native'
import UserAvatar from '@/components/UserAvatar.vue'

const router = useRouter()
const userStore = useUserStore()

interface SettingItem {
  icon: string
  label: string
  sub?: string
  extra?: string
  path?: string
  action?: () => void
}

const settingGroups = computed<{ items: SettingItem[] }[]>(() => {
  const groups: { items: SettingItem[] }[] = [
    {
      items: [
        { icon: 'shield', label: '账号与安全', path: '/settings/security' },
        { icon: 'photo', label: '朋友圈', path: '/me/moments' },
        { icon: 'group', label: '朋友权限', path: '/settings/friends' },
      ],
    },
    {
      items: [
        { icon: 'bell', label: '消息通知', action: () => showToast('即将完善') },
        {
          icon: 'tune',
          label: '通用',
          path: '/settings/general',
        },
        { icon: 'storage', label: '存储空间', sub: '管理缓存与离线数据', path: '/settings/storage' },
      ],
    },
    {
      items: [
        { icon: 'help', label: '帮助与反馈', sub: '常见问题与意见反馈', path: '/help' },
        { icon: 'info', label: '关于 Pulse', action: () => router.push('/about') },
      ],
    },
  ]
  return isNativeApp
    ? groups
    : groups.map((group) => ({ items: group.items.filter((item) => item.icon !== 'storage') }))
})

function onSettingClick(item: SettingItem) {
  if (item.path) {
    router.push(item.path)
    return
  }
  item.action?.()
}

function goBack() {
  smartBack(router)
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
  <div class="settings-page">
    <header class="page-header">
      <button type="button" class="back-btn" @click="goBack">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 18l-6-6 6-6"/>
        </svg>
      </button>
      <h1 class="page-title">设置</h1>
      <div class="header-spacer" />
    </header>

    <main class="main-content">
      <div class="profile-card">
        <UserAvatar
          :src="userStore.avatar"
          :user-id="userStore.userId"
          :name="userStore.nickname || '用'"
          :size="64"
          class="profile-avatar"
        />
        <div class="profile-info">
          <div class="profile-name">{{ userStore.nickname || 'Pulse 用户' }}</div>
          <div class="profile-id">ID: {{ userStore.userId || '—' }}</div>
        </div>
      </div>

      <div class="groups">
        <section v-for="(group, gi) in settingGroups" :key="gi" class="setting-group">
          <div
            v-for="(item, ii) in group.items"
            :key="item.label"
            class="setting-item"
            :class="{ 'has-divider': ii < group.items.length - 1 }"
            @click="onSettingClick(item)"
          >
            <div class="item-left">
              <span class="item-icon">
                <svg v-if="item.icon === 'shield'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                <svg v-else-if="item.icon === 'group'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 0v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                <svg v-else-if="item.icon === 'photo'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
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
    </main>
  </div>
</template>

<style scoped>
.settings-page {
  min-height: 100vh;
  background: var(--pulse-page-bg, var(--pulse-bg));
}

.page-header {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  padding: 0 16px;
  padding-top: var(--pulse-header-pad-top);
  background: rgba(18, 19, 23, 0.8);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.back-btn {
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  color: var(--pulse-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 50%;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--pulse-primary);
}

.header-spacer {
  width: 40px;
}

.main-content {
  padding: 24px 16px 32px;
  max-width: 640px;
  margin: 0 auto;
}

.profile-card {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 24px;
  margin-bottom: 24px;
  background: var(--pulse-surface-container);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--pulse-radius);
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
  font-size: 24px;
  font-weight: 700;
  color: var(--pulse-primary);
  background: var(--pulse-surface-highest);
}

.profile-name {
  font-size: 20px;
  font-weight: 600;
  color: var(--pulse-text);
}

.profile-id {
  margin-top: 4px;
  font-size: 13px;
  font-weight: 500;
  color: var(--pulse-text-secondary);
}

.groups {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setting-group {
  background: var(--pulse-surface-container);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--pulse-radius);
  overflow: hidden;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px;
  cursor: pointer;
  transition: background 0.2s;
}

.setting-item:active {
  background: rgba(255, 255, 255, 0.05);
}

.setting-item.has-divider {
  border-bottom: 0.5px solid rgba(255, 255, 255, 0.1);
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
  font-size: 17px;
  color: var(--pulse-text);
}

.item-sub {
  font-size: 11px;
  font-weight: 600;
  color: var(--pulse-text-secondary);
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
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--pulse-radius);
  background: var(--pulse-surface-container);
  color: var(--pulse-error);
  font-size: 20px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s;
}

.logout-btn:active {
  transform: scale(0.98);
}
</style>

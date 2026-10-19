<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { showToast } from 'vant'
import { useDiscoverStore } from '@/stores/discover'
import UserAvatar from '@/components/UserAvatar.vue'
import {
  COMMUNITY_NOTIFICATIONS_UPDATED_EVENT,
  fetchCommunityNotificationUnreadCount,
} from '@/api/communityNotifications'

const router = useRouter()
const discover = useDiscoverStore()
const { momentsCount, momentsAvatars, interactionUnread } = storeToRefs(discover)
const communityUnread = ref(0)

const momentsUpdate = computed(() => ({
  count: momentsCount.value + interactionUnread.value,
  avatars: momentsAvatars.value,
}))

onMounted(() => {
  discover.startPolling()
  void discover.refreshAll()
  void refreshCommunityUnread()
  window.addEventListener(COMMUNITY_NOTIFICATIONS_UPDATED_EVENT, onCommunityNotificationsUpdated)
})

onActivated(() => {
  void discover.refreshAll()
  void refreshCommunityUnread()
})

onBeforeUnmount(() => {
  window.removeEventListener(COMMUNITY_NOTIFICATIONS_UPDATED_EVENT, onCommunityNotificationsUpdated)
})

async function refreshCommunityUnread(): Promise<void> {
  try {
    communityUnread.value = await fetchCommunityNotificationUnreadCount()
  } catch {
    // 角标刷新失败不阻断发现页其他功能，下次激活时会自动重试。
  }
}

function onCommunityNotificationsUpdated(event: Event): void {
  const count = Number((event as CustomEvent<{ unreadCount?: number }>).detail?.unreadCount)
  if (Number.isFinite(count)) communityUnread.value = Math.max(0, Math.floor(count))
  void refreshCommunityUnread()
}

async function goMoments() {
  try {
    await router.push('/moments')
  } catch (e) {
    // Vue Router 会把“重复导航”等也当成 reject，忽略这些
    const msg = e instanceof Error ? e.message : String(e)
    if (/Avoided redundant navigation|Navigation cancelled|Navigation aborted/i.test(msg)) {
      return
    }
    console.error('[moments] navigate failed', e)
    showToast('无法打开朋友圈')
  }
}

function goScan() {
  void router.push({ name: 'Scan' })
}

function goCommunities() { void router.push('/communities') }

</script>

<template>
  <div class="discover-page">
    <header class="page-header tab-home-header">
      <h1 class="page-title">发现</h1>
    </header>

    <main class="main-content">
      <section class="menu-card">
        <button type="button" class="menu-item has-divider" @click="goMoments">
          <div class="menu-icon" style="background: rgba(75, 142, 255, 0.15)">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </div>
          <div class="menu-info">
            <div class="menu-title">朋友圈</div>
            <div class="menu-desc">分享生活点滴</div>
          </div>

          <div v-if="momentsUpdate.count > 0" class="moments-hint">
            <div class="moments-avatars">
              <div
                v-for="(a, idx) in momentsUpdate.avatars"
                :key="a.userId || idx"
                class="moments-avatar"
                :style="{ zIndex: momentsUpdate.avatars.length - idx }"
              >
                <UserAvatar :src="a.avatarUrl" :user-id="a.userId" :name="a.nickname" :size="32" />
              </div>
            </div>
            <span class="moments-count">{{ momentsUpdate.count }}</span>
          </div>

          <svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>

        <button type="button" class="menu-item" @click="goScan">
          <div class="menu-icon" style="background: rgba(66, 227, 85, 0.12)">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M3 7V5a2 2 0 0 1 2-2h2" />
              <path d="M17 3h2a2 2 0 0 1 2 2v2" />
              <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
              <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
              <line x1="7" y1="12" x2="17" y2="12" />
            </svg>
          </div>
          <div class="menu-info">
            <div class="menu-title">扫一扫</div>
            <div class="menu-desc">扫描二维码</div>
          </div>
          <svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
        <button type="button" class="menu-item" @click="goCommunities">
          <div class="menu-icon community-menu-icon"><span class="material-symbols-outlined">diversity_3</span></div>
          <div class="menu-info"><div class="menu-title">圈子</div><div class="menu-desc">发现兴趣社区</div></div>
          <span v-if="communityUnread > 0" class="community-count" aria-label="圈子未读消息">
            {{ communityUnread > 99 ? '99+' : communityUnread }}
          </span>
          <svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6" /></svg>
        </button>
      </section>
    </main>
  </div>
</template>

<style scoped>
.discover-page {
  min-height: 100%;
  background: var(--pulse-page-bg, var(--pulse-bg));
}

.page-header {
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
  padding: 0 16px;
}

.menu-card {
  background: var(--pulse-surface-container);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--pulse-radius);
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}

.menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  font: inherit;
  color: inherit;
  -webkit-tap-highlight-color: transparent;
  transition: background 0.2s, transform 0.1s;
}

.menu-item:active {
  background: var(--pulse-surface-high);
  transform: scale(0.99);
}

.menu-item.has-divider {
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.menu-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--pulse-radius);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--pulse-primary);
}

.community-menu-icon {
  background: color-mix(in srgb, var(--pulse-primary) 14%, transparent);
}

.menu-info {
  flex: 1;
  min-width: 0;
}

.menu-title {
  font-size: calc(var(--pulse-content-font-size, 15px) + 1px);
  line-height: 22px;
  font-weight: 400;
  color: var(--pulse-text);
}

.menu-desc {
  margin-top: 2px;
  font-size: 11px;
  font-weight: 600;
  color: var(--pulse-text-secondary);
}

.moments-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin-right: 4px;
}

.moments-avatars {
  display: flex;
  align-items: center;
  flex-direction: row-reverse;
}

.moments-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  overflow: hidden;
  background: transparent;
  border: 0;
  margin-left: -8px;
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 700;
  color: var(--pulse-primary);
}

.moments-avatars .moments-avatar:last-child {
  margin-left: 0;
}

.moments-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.moments-count {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: #ff5447;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
}

.community-count {
  min-width: 19px;
  height: 19px;
  flex: none;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--pulse-danger, #ff5447);
  color: #fff;
  font-size: 10px;
  font-weight: 750;
  line-height: 19px;
  text-align: center;
  box-shadow: 0 3px 9px color-mix(in srgb, var(--pulse-danger, #ff5447) 28%, transparent);
}

.chevron {
  flex-shrink: 0;
  color: var(--pulse-outline);
  opacity: 0.7;
}
</style>

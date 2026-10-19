<script setup lang="ts">
import { ref, watch, computed, onMounted, onActivated, onDeactivated } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useFriendRequestStore } from '@/stores/friendRequest'
import { useConversationInboxStore } from '@/stores/conversationInbox'
import { useDiscoverStore } from '@/stores/discover'
import { fetchMyGroupNotifications } from '@/api/conversation'
import { useUserStore } from '@/stores/user'
import { updateSavedAccountBadgeCount } from '@/stores/accounts'

defineOptions({ name: 'MainLayout' })

const route = useRoute()
const router = useRouter()
const friendRequest = useFriendRequestStore()
const inbox = useConversationInboxStore()
const discover = useDiscoverStore()
const userStore = useUserStore()
const { pendingCount } = storeToRefs(friendRequest)
const { unreadTotal } = storeToRefs(inbox)
const { momentsCount, interactionUnread } = storeToRefs(discover)
const groupNotificationCount = ref(0)
const tabbarActive = ref(true)

// MainLayout is cached by App.vue. A teleported node is outside that cached
// subtree visually, so explicitly hide it whenever the layout is deactivated.
onActivated(() => {
  tabbarActive.value = true
})
onDeactivated(() => {
  tabbarActive.value = false
})

const tabs = [
  { path: '/app/messages', label: '消息', key: 'chat' },
  { path: '/app/contacts', label: '联系人', key: 'group' },
  { path: '/app/discover', label: '发现', key: 'explore' },
  { path: '/app/me', label: '我的', key: 'person' },
] as const

const activeIndex = ref(0)

function syncFromRoute(path: string) {
  const idx = tabs.findIndex((t) => path.startsWith(t.path))
  activeIndex.value = idx >= 0 ? idx : 0
}

syncFromRoute(route.path)
watch(
  () => route.path,
  (path) => {
    syncFromRoute(path)
    if (path.startsWith('/app/contacts') || path.startsWith('/contacts/group-')) {
      void refreshGroupNotificationCount()
    }
  },
)

function goTab(index: number) {
  const target = tabs[index]
  if (target && route.path !== target.path) {
    router.push(target.path)
  }
}

const safeBottom = computed(() => 'var(--pulse-safe-bottom, env(safe-area-inset-bottom, 0px))')

function formatBadge(n: number) {
  if (n <= 0) return ''
  return n > 99 ? '99+' : String(n)
}

const messagesBadge = computed(() => formatBadge(unreadTotal.value))
const contactsBadge = computed(() =>
  formatBadge(pendingCount.value + groupNotificationCount.value),
)
const discoverBadge = computed(() =>
  formatBadge(momentsCount.value + interactionUnread.value),
)
const totalBadgeCount = computed(() =>
  Math.max(
    0,
    Number(unreadTotal.value || 0) +
      Number(pendingCount.value || 0) +
      Number(groupNotificationCount.value || 0) +
      Number(momentsCount.value || 0) +
      Number(interactionUnread.value || 0),
  ),
)

watch(
  () => [userStore.userId, totalBadgeCount.value] as const,
  ([userId, count]) => {
    if (userId) updateSavedAccountBadgeCount(userId, count)
  },
  { immediate: true },
)

async function refreshGroupNotificationCount() {
  try {
    const data = await fetchMyGroupNotifications()
    groupNotificationCount.value = data.pendingCount
  } catch {
    /* 角标失败不影响主流程 */
  }
}

watch(
  () => userStore.userId,
  (userId, previousUserId) => {
    if (!userId || userId === previousUserId) return
    // MainLayout 会被缓存，账号切换后必须清掉旧账号的群通知数再重新拉取。
    groupNotificationCount.value = 0
    void refreshGroupNotificationCount()
  },
)

onMounted(() => {
  discover.startPolling()
  void friendRequest.refresh()
  void refreshGroupNotificationCount()
})
</script>

<template>
  <div class="main-layout">
    <div class="page-slot">
      <router-view v-slot="{ Component, route: r }">
        <keep-alive>
          <component :is="Component" v-if="r.meta.keepAlive" :key="`${String(r.name)}:${userStore.userId}`" />
        </keep-alive>
        <component :is="Component" v-if="!r.meta.keepAlive" :key="r.fullPath" />
      </router-view>
    </div>

    <Teleport to="body">
      <div v-if="tabbarActive && (activeIndex === 1 || activeIndex === 3)" class="pulse-tabbar-backdrop" aria-hidden="true" />
      <nav v-if="tabbarActive" class="pulse-tabbar">
        <div class="tabbar-row">
        <button
          v-for="(tab, index) in tabs"
          :key="tab.key"
          type="button"
          class="tab-item"
          :class="{ active: activeIndex === index }"
          @click="goTab(index)"
        >
          <!-- 消息 -->
          <span v-if="tab.key === 'chat'" class="tab-icon-wrap">
            <svg class="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                v-if="activeIndex === index"
                d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8.4L4 20.5V6a2 2 0 0 1 2-2zm3.5 5.25h9a.75.75 0 0 0 0-1.5h-9a.75.75 0 0 0 0 1.5zm0 3.5h7a.75.75 0 0 0 0-1.5h-7a.75.75 0 0 0 0 1.5z"
                fill="currentColor"
              />
              <path
                v-else
                d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8.4L4 20.5V6a2 2 0 0 1 2-2z"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linejoin="round"
              />
              <path
                v-if="activeIndex !== index"
                d="M7.5 9h9M7.5 12.5h7"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
              />
            </svg>
            <span v-if="messagesBadge" class="tab-badge">{{ messagesBadge }}</span>
          </span>

          <!-- 联系人 -->
          <span v-else-if="tab.key === 'group'" class="tab-icon-wrap">
            <svg class="tab-icon contacts-tab-icon" viewBox="0 0 24 24" aria-hidden="true">
              <g
                fill="none"
                stroke="currentColor"
                :stroke-width="activeIndex === index ? 2 : 1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="9.25" />
                <circle
                  cx="12"
                  cy="8.7"
                  r="3"
                  :fill="activeIndex === index ? 'currentColor' : 'none'"
                />
                <path
                  d="M6.7 18.1c.65-2.65 2.55-4.15 5.3-4.15s4.65 1.5 5.3 4.15"
                  :fill="activeIndex === index ? 'currentColor' : 'none'"
                />
              </g>
            </svg>
            <span v-if="contactsBadge" class="tab-badge">{{ contactsBadge }}</span>
          </span>

          <!-- 发现 -->
          <span v-else-if="tab.key === 'explore'" class="tab-icon-wrap">
            <svg class="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                v-if="activeIndex === index"
                d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm4.1 5.2-1.6 5.1-5.1 1.6 1.6-5.1 5.1-1.6z"
                fill="currentColor"
              />
              <g v-else fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="m15.8 8.2-1.5 4.8-4.8 1.5 1.5-4.8 4.8-1.5z" />
              </g>
            </svg>
            <span v-if="discoverBadge" class="tab-badge">{{ discoverBadge }}</span>
          </span>

          <!-- 我的 -->
          <span v-else class="tab-icon-wrap">
            <svg class="tab-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                v-if="activeIndex === index"
                d="M12 12a4.25 4.25 0 1 0 0-8.5A4.25 4.25 0 0 0 12 12zm0 1.75c-3.85 0-7 2.15-7 4.75V20h14v-1.5c0-2.6-3.15-4.75-7-4.75z"
                fill="currentColor"
              />
              <g v-else fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="8" r="3.4" />
                <path d="M5.5 19c.55-2.55 3.15-4.25 6.5-4.25S18 16.45 18.5 19" />
              </g>
            </svg>
          </span>

          <span class="tab-label">{{ tab.label }}</span>
        </button>
        </div>
        <div class="tabbar-safe" :style="{ height: safeBottom }" />
      </nav>
    </Teleport>
  </div>
</template>

<style scoped>
.main-layout {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: 100%;
  overflow: hidden;
  background: var(--pulse-page-bg, var(--pulse-bg));
}

.page-slot {
  flex: 1;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-y: contain;
  /* 与底部导航拉开间距，避免列表贴边 */
  padding-bottom: calc(72px + var(--pulse-safe-bottom, 0px));
}

.pulse-tabbar-backdrop {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 49;
  height: calc(72px + var(--pulse-safe-bottom, 0px));
  pointer-events: none;
  background: var(--pulse-page-bg, var(--pulse-bg));
}

.pulse-tabbar {
  /*
   * Keep the tab bar outside the routed page's transform/transition layer.
   * Android WebView can otherwise briefly resolve an absolute descendant
   * against the entering page at y=0 while restoring a kept-alive layout.
   */
  position: fixed;
  right: max(14px, var(--pulse-safe-right, 0px));
  bottom: 6px;
  left: max(14px, var(--pulse-safe-left, 0px));
  z-index: 50;
  display: flex;
  flex-direction: column;
  margin: 0;
  overflow: hidden;
  border: 1px solid var(--pulse-tabbar-border);
  border-radius: 26px;
  background: var(--pulse-tabbar-bg);
  box-shadow:
    0 8px 24px var(--pulse-tabbar-shadow),
    0 2px 6px rgba(0, 0, 0, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(24px) saturate(150%);
  -webkit-backdrop-filter: blur(24px) saturate(150%);
}

.tabbar-row {
  display: flex;
  align-items: center;
  gap: 2px;
  min-height: 56px;
  height: 56px;
  padding: 3px 4px;
  box-sizing: border-box;
}

.tabbar-safe {
  flex-shrink: 0;
  width: 100%;
  max-height: 24px;
  min-height: 0;
  pointer-events: none;
}

.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  height: 100%;
  min-height: 0;
  padding: 2px;
  border: none;
  border-radius: 19px;
  background: transparent;
  color: var(--pulse-text-secondary);
  cursor: pointer;
  transition:
    color 0.2s ease,
    background-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.12s ease;
  -webkit-tap-highlight-color: transparent;
}

.tab-item:active {
  transform: scale(0.95);
}

.tab-item.active {
  color: var(--pulse-primary);
  background: var(--pulse-tabbar-active-bg);
  box-shadow: inset 0 0 0 1px var(--pulse-tabbar-active-ring);
}

.tab-item.active .tab-label {
  font-weight: 700;
}

.tab-icon {
  width: 27px;
  height: 27px;
  display: block;
}

.tab-icon-wrap {
  position: relative;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.tab-badge {
  position: absolute;
  top: -6px;
  right: -10px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: #ff6b6b;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
}

.tab-label {
  font-size: 12px;
  line-height: 15px;
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

:global(:root[data-theme='light']) .pulse-tabbar {
  box-shadow:
    0 8px 22px var(--pulse-tabbar-shadow),
    0 2px 5px rgba(39, 72, 102, 0.08),
    inset 0 1px 0 #fff;
}

:global(:root[data-theme='light']) .tab-item {
  color: #435666;
}

:global(:root[data-theme='light']) .tab-item.active {
  color: #087ed7;
}

@media (max-width: 340px) {
  .pulse-tabbar {
    right: max(8px, var(--pulse-safe-right, 0px));
    left: max(8px, var(--pulse-safe-left, 0px));
  }

  .tab-label {
    font-size: 11px;
  }
}
</style>

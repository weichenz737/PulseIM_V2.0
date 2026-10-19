<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import {
  fetchMomentInteractions,
  markMomentInteractionsRead,
  type MomentInteractionItem,
} from '@/api/moments'
import { useDiscoverStore } from '@/stores/discover'
import { smartBack } from '@/utils/navBack'

const router = useRouter()
const discover = useDiscoverStore()

const loading = ref(true)
const refreshing = ref(false)
const list = ref<MomentInteractionItem[]>([])

onMounted(() => {
  void load(true)
})

async function load(markRead: boolean) {
  loading.value = true
  try {
    list.value = await fetchMomentInteractions()
    if (markRead) {
      await markMomentInteractionsRead()
      discover.clearInteractionBadge()
    }
  } catch (e) {
    showToast(e instanceof Error ? e.message : '加载失败')
  } finally {
    loading.value = false
  }
}

async function onPullRefresh() {
  refreshing.value = true
  try {
    list.value = await fetchMomentInteractions()
    await markMomentInteractionsRead()
    discover.clearInteractionBadge()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '刷新失败')
  } finally {
    refreshing.value = false
  }
}

function goBack() {
  smartBack(router, '/moments')
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 3600000) return `${Math.max(1, Math.floor(diff / 60000))} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  if (diff < 172800000) return '昨天'
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

function typeIcon(type: string): string {
  if (type === 'like') return 'favorite'
  if (type === 'mention') return 'alternate_email'
  return 'chat_bubble'
}

async function openItem(item: MomentInteractionItem) {
  if (!item.isRead) {
    try {
      await markMomentInteractionsRead(item.id)
      item.isRead = true
      void discover.refreshInteractions()
    } catch {
      /* ignore */
    }
  }
  if (!item.postId) {
    showToast('动态不存在')
    return
  }
  await router.push({ path: '/moments', query: { postId: item.postId } })
}
</script>

<template>
  <div class="notif-page">
    <header class="page-header glass-header">
      <button type="button" class="icon-btn" @click="goBack">
        <span class="material-symbols-outlined">arrow_back_ios</span>
      </button>
      <h1 class="page-title">消息</h1>
      <span class="header-spacer" />
    </header>

    <main class="page-main">
      <van-pull-refresh
        v-model="refreshing"
        class="list-pull"
        pulling-text="下拉刷新"
        loosing-text="释放刷新"
        loading-text="刷新中..."
        @refresh="onPullRefresh"
      >
        <div v-if="loading" class="state">加载中...</div>
        <div v-else-if="list.length === 0" class="state">暂无消息</div>
        <div v-else class="notif-list">
          <button
            v-for="item in list"
            :key="item.id"
            type="button"
            class="notif-item"
            :class="{ unread: !item.isRead }"
            @click="openItem(item)"
          >
            <div v-if="item.actorAvatarUrl" class="avatar">
              <img :src="item.actorAvatarUrl" :alt="item.actorNickname" />
            </div>
            <div v-else class="avatar initials">{{ (item.actorNickname || '?').slice(0, 1) }}</div>
            <div class="notif-body">
              <div class="notif-top">
                <span class="name">{{ item.actorNickname }}</span>
                <span class="time">{{ formatTime(item.createdAt) }}</span>
              </div>
              <div class="notif-summary">
                <span class="material-symbols-outlined type-ico">{{ typeIcon(item.type) }}</span>
                <span class="summary-text">{{ item.summary }}</span>
              </div>
              <div v-if="item.postPreview" class="post-preview">{{ item.postPreview }}</div>
            </div>
          </button>
        </div>
      </van-pull-refresh>
    </main>
  </div>
</template>

<style scoped>
.notif-page {
  min-height: 100vh;
  background: var(--pulse-page-bg, var(--pulse-bg));
  color: var(--pulse-text);
}

.page-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 8px;
  padding-top: var(--pulse-header-pad-top);
  box-sizing: content-box;
  background: var(--pulse-page-bg, var(--pulse-bg));
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.page-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.header-spacer,
.icon-btn {
  width: 40px;
  height: 40px;
}

.icon-btn {
  border: none;
  background: transparent;
  color: var(--pulse-text);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  cursor: pointer;
}

.page-main {
  padding-bottom: 24px;
}

.list-pull {
  min-height: 60vh;
}

.state {
  padding: 48px 16px;
  text-align: center;
  color: var(--pulse-text-secondary, #8a8b90);
  font-size: 14px;
}

.notif-list {
  display: flex;
  flex-direction: column;
}

.notif-item {
  display: flex;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.notif-item.unread {
  background: rgba(76, 139, 245, 0.08);
}

.notif-item:active {
  background: rgba(52, 53, 57, 0.55);
}

.avatar {
  width: 44px;
  height: 44px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--pulse-surface-high);
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar.initials {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  background: #3d5a80;
}

.notif-body {
  flex: 1;
  min-width: 0;
}

.notif-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.name {
  font-size: 15px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.time {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--pulse-text-secondary, #8a8b90);
}

.notif-summary {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  margin-top: 4px;
  font-size: 13px;
  color: var(--pulse-text-secondary, #a0a1a6);
  line-height: 1.4;
}

.type-ico {
  font-size: 16px;
  line-height: 1.2;
  flex-shrink: 0;
}

.summary-text {
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.post-preview {
  margin-top: 6px;
  padding: 6px 8px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
  font-size: 12px;
  color: var(--pulse-text-secondary, #8a8b90);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

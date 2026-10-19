<script setup lang="ts">
import { onActivated, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { communityTopics, listCommunities, myCommunities, type Community } from '@/api/community'
import { resolveFileUrl } from '@/api/file'
import {
  COMMUNITY_NOTIFICATIONS_UPDATED_EVENT,
  fetchCommunityNotificationUnreadCount,
} from '@/api/communityNotifications'

const router = useRouter()
type CommunityTab = 'discover' | 'joined' | 'created'
const COMMUNITY_TAB_STORAGE_KEY = 'pulse_communities_active_tab'

function storedCommunityTab(): CommunityTab {
  if (typeof window === 'undefined') return 'discover'
  const value = window.sessionStorage.getItem(COMMUNITY_TAB_STORAGE_KEY)
  return value === 'joined' || value === 'created' ? value : 'discover'
}

const activeTab = ref<CommunityTab>(storedCommunityTab())
const keyword = ref('')
const items = ref<Community[]>([])
const topics = ref<{ id: number; name: string }[]>([])
const topicId = ref<number>()
const loading = ref(false)
const refreshing = ref(false)
const notificationUnread = ref(0)
const reviewCommunity = ref<Community>()

async function load(silent = false) {
  if (!silent) loading.value = true
  try {
    if (activeTab.value === 'discover') {
      items.value = (await listCommunities({ keyword: keyword.value || undefined, topicId: topicId.value })).items || []
    } else {
      const mine = await myCommunities()
      items.value = mine.filter((community) => activeTab.value === 'created'
        ? community.my_role === 'OWNER'
        : community.my_role !== 'OWNER')
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : '加载失败')
  } finally {
    if (!silent) loading.value = false
  }
}

async function loadTopics() {
  try {
    topics.value = await communityTopics()
  } catch (error) {
    showToast(error instanceof Error ? error.message : '主题加载失败')
  }
}

async function onPullRefresh() {
  refreshing.value = true
  try {
    await Promise.all([load(true), loadTopics(), refreshNotificationUnread()])
  } finally {
    refreshing.value = false
  }
}

async function selectTab(value: CommunityTab) {
  activeTab.value = value
  window.sessionStorage.setItem(COMMUNITY_TAB_STORAGE_KEY, value)
  await load()
}

onMounted(async () => {
  window.addEventListener(COMMUNITY_NOTIFICATIONS_UPDATED_EVENT, onNotificationsUpdated)
  void refreshNotificationUnread()
  await loadTopics()
  await load()
})

onActivated(() => {
  void refreshNotificationUnread()
})

onBeforeUnmount(() => {
  window.removeEventListener(COMMUNITY_NOTIFICATIONS_UPDATED_EVENT, onNotificationsUpdated)
})

async function refreshNotificationUnread(): Promise<void> {
  try {
    notificationUnread.value = await fetchCommunityNotificationUnreadCount()
  } catch {
    // 角标属于辅助信息，失败时保留当前值并在下次激活时重试。
  }
}

function onNotificationsUpdated(event: Event): void {
  const count = Number((event as CustomEvent<{ unreadCount?: number }>).detail?.unreadCount)
  if (Number.isFinite(count)) notificationUnread.value = Math.max(0, Math.floor(count))
  void refreshNotificationUnread()
}

function openCommunity(community: Community): void {
  window.sessionStorage.setItem(COMMUNITY_TAB_STORAGE_KEY, activeTab.value)
  if (activeTab.value !== 'discover' && community.status !== 'APPROVED') {
    reviewCommunity.value = community
    return
  }
  void router.push(`/communities/${community.id}`)
}

function emptyText(): string {
  if (activeTab.value === 'joined') return '暂无加入的圈子'
  if (activeTab.value === 'created') return '暂无创建的圈子'
  return '暂无可发现的圈子'
}

function reviewStatusTitle(status: string): string {
  if (status === 'PENDING') return '圈子正在审核中'
  if (status === 'REJECTED') return '圈子审核未通过'
  if (status === 'CLOSED') return '圈子已被关闭'
  return '圈子审核状态'
}
</script>

<template>
  <div class="page communities-page">
    <header class="page-header">
      <div class="header-side header-left">
        <button type="button" class="icon-btn" aria-label="返回" @click="router.back()"><span class="material-symbols-outlined">arrow_back_ios</span></button>
      </div>
      <h1 class="page-title">圈子</h1>
      <div class="header-side header-actions">
        <button
          type="button"
          class="icon-btn notification-btn"
          :aria-label="notificationUnread > 0 ? `圈子消息，${notificationUnread} 条未读` : '圈子消息'"
          @click="router.push('/communities/notifications')"
        >
          <span class="material-symbols-outlined">notifications</span>
          <span v-if="notificationUnread > 0" class="notification-badge">
            {{ notificationUnread > 99 ? '99+' : notificationUnread }}
          </span>
        </button>
        <button type="button" class="icon-btn" aria-label="创建圈子" @click="router.push('/communities/create')"><span class="material-symbols-outlined">add</span></button>
      </div>
    </header>
    <van-pull-refresh v-model="refreshing" class="community-pull" success-text="刷新成功" @refresh="onPullRefresh">
      <nav class="community-tabs">
        <button :class="{ on: activeTab === 'discover' }" @click="selectTab('discover')">发现圈子</button>
        <button :class="{ on: activeTab === 'joined' }" @click="selectTab('joined')">我加入的</button>
        <button :class="{ on: activeTab === 'created' }" @click="selectTab('created')">我创建的</button>
      </nav>
      <div v-if="activeTab === 'discover'" class="search">
        <input v-model="keyword" placeholder="搜索圈子、主题或圈主" @keyup.enter="load()">
        <button v-if="keyword" type="button" class="search-clear-btn" aria-label="清除搜索" @click="keyword = ''; load()"><span class="material-symbols-outlined">cancel</span></button>
        <button @click="load()">搜索</button>
      </div>
      <div v-if="activeTab === 'discover'" class="chips"><button :class="{ on: !topicId }" @click="topicId = undefined; load()">全部</button><button v-for="topic in topics" :key="topic.id" :class="{ on: topicId === topic.id }" @click="topicId = topic.id; load()">{{ topic.name }}</button></div>
      <main>
        <button v-for="community in items" :key="community.id" class="card" @click="openCommunity(community)">
          <div class="avatar"><img v-if="community.avatar" :src="resolveFileUrl(community.avatar)"><span v-else>{{ community.name[0] }}</span></div>
          <div class="info"><b>{{ community.name }}</b><small>{{ community.topic || '其他' }} · {{ community.member_count }} 成员 · {{ community.post_count }} 动态</small><p>{{ community.description || '暂无介绍' }}</p><em v-if="activeTab !== 'discover'">{{ community.status === 'PENDING' ? '审核中' : community.status === 'REJECTED' ? '已拒绝' : community.status === 'CLOSED' ? '已关闭' : community.my_role === 'OWNER' ? '我创建的' : community.my_role === 'ADMIN' ? '管理员' : '已加入' }}</em></div>
          <strong>{{ community.type === 'PAID' ? `${(community.price / 100).toFixed(2)} PLU` : '免费' }}</strong>
        </button>
        <div v-if="loading || !items.length" class="empty">{{ loading ? '加载中…' : emptyText() }}</div>
      </main>
    </van-pull-refresh>
    <van-popup :show="!!reviewCommunity" position="bottom" round closeable @update:show="reviewCommunity = undefined">
      <section v-if="reviewCommunity" class="review-popup">
        <span class="review-icon material-symbols-outlined">
          {{ reviewCommunity.status === 'PENDING' ? 'hourglass_top' : reviewCommunity.status === 'REJECTED' ? 'error' : 'lock' }}
        </span>
        <h2>{{ reviewStatusTitle(reviewCommunity.status) }}</h2>
        <p v-if="reviewCommunity.status === 'PENDING'">后台正在审核圈子资料，审核通过后才能进入圈子详情和发布内容。</p>
        <p v-else-if="reviewCommunity.status === 'REJECTED'">{{ reviewCommunity.reject_reason || '圈子资料暂未通过审核，请修改后重新提交。' }}</p>
        <p v-else>该圈子当前未开启，暂时无法进入圈子详情。</p>
        <button type="button" class="review-close" @click="reviewCommunity = undefined">我知道了</button>
      </section>
    </van-popup>
  </div>
</template>

<style scoped>
.page{min-height:100%;background:var(--pulse-page-bg,var(--pulse-bg));color:var(--pulse-text)}
button{border:0;background:none;color:inherit;font:inherit}
.page-header{position:sticky;top:0;z-index:20;display:grid;grid-template-columns:80px minmax(0,1fr) 80px;align-items:center;height:56px;padding:0 8px;padding-top:var(--pulse-header-pad-top);background:var(--pulse-page-bg,var(--pulse-bg))}
.header-side{display:flex;width:80px;align-items:center}.header-left{grid-column:1;justify-content:flex-start}.header-actions{grid-column:3;justify-content:flex-end}
.icon-btn,.header-spacer{width:40px;height:40px;flex:none}.icon-btn{display:grid;place-items:center;border-radius:50%;color:var(--pulse-primary)}.icon-btn .material-symbols-outlined{font-size:22px}
.page-title{grid-column:2;min-width:0;margin:0;text-align:center;font-size:18px;font-weight:600;color:var(--pulse-primary)}
.notification-btn{position:relative}.notification-badge{position:absolute;top:1px;right:0;min-width:17px;height:17px;padding:0 4px;border:2px solid var(--pulse-page-bg,var(--pulse-bg));border-radius:999px;background:var(--pulse-danger,#ff5447);color:#fff;font-size:9px;font-weight:750;line-height:13px;text-align:center;box-sizing:border-box}
.community-tabs{display:flex;height:48px;background:var(--pulse-page-bg,var(--pulse-bg));border-bottom:1px solid var(--pulse-outline-variant)}.community-tabs button{position:relative;flex:1;padding:0;font-size:14px;color:var(--pulse-text-secondary)}.community-tabs button.on{color:var(--pulse-primary);font-weight:600}.community-tabs button.on::after{content:"";position:absolute;left:25%;right:25%;bottom:0;height:2px;border-radius:2px;background:var(--pulse-primary)}
.community-pull{min-height:calc(100dvh - 56px - var(--pulse-header-pad-top))}
.search{display:flex;gap:8px;padding:12px 16px}.search input{flex:1;border:0;border-radius:12px;padding:11px;background:var(--pulse-surface-high);color:var(--pulse-text)}.search button{color:var(--pulse-primary)}.chips{display:flex;gap:8px;overflow:auto;padding:0 16px 12px}.chips button{white-space:nowrap;padding:6px 12px;border-radius:16px;background:var(--pulse-surface-high)}.chips .on{background:var(--pulse-primary);color:var(--pulse-on-primary)}
main{padding:12px 16px 0}.card{width:100%;display:flex;align-items:flex-start;gap:12px;min-width:0;text-align:left;padding:14px;margin-bottom:10px;border-radius:16px;background:var(--pulse-surface-container)}.avatar{width:52px;height:52px;flex:none;border-radius:14px;overflow:hidden;display:grid;place-items:center;background:var(--pulse-surface-high);color:var(--pulse-primary);font-size:20px}.avatar img{width:100%;height:100%;object-fit:cover}.info{flex:1;min-width:0}.info b,.info small,.info p{display:block;min-width:0}.info b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.info small,.info p{color:var(--pulse-text-secondary);font-size:12px;margin:4px 0}.info p{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.info em,.card>strong{color:var(--pulse-primary);font-size:12px;font-style:normal}.card>strong{flex:none;max-width:31%;margin-left:auto;padding-top:2px;overflow:hidden;text-align:right;text-overflow:ellipsis;white-space:nowrap}.empty{text-align:center;padding:48px;color:var(--pulse-text-secondary)}
.review-popup{padding:36px 24px calc(24px + var(--pulse-safe-bottom));text-align:center}.review-icon{display:grid;width:58px;height:58px;margin:0 auto 14px;place-items:center;border-radius:18px;background:color-mix(in srgb,var(--pulse-primary) 13%,var(--pulse-surface-high));color:var(--pulse-primary);font-size:30px}.review-popup h2{margin:0;font-size:19px}.review-popup p{margin:10px 0 22px;color:var(--pulse-text-secondary);font-size:13px;line-height:1.7}.review-close{width:100%;height:44px;border-radius:14px;background:var(--pulse-primary);color:var(--pulse-on-primary);font-weight:650}
</style>

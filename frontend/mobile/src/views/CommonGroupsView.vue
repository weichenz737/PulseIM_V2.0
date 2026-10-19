<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { smartBack } from '@/utils/navBack'
import { showToast } from 'vant'
import { fetchCommonGroups, type CommonGroupItem } from '@/api/contact'
import UserAvatar from '@/components/UserAvatar.vue'

const route = useRoute()
const router = useRouter()
const userId = computed(() => String(route.params.userId || ''))
const loading = ref(true)
const refreshing = ref(false)
const list = ref<CommonGroupItem[]>([])
const peerName = computed(() => String(route.query.name || '对方'))

onMounted(() => {
  void load()
})

async function load(silent = false) {
  if (!silent) loading.value = true
  try {
    list.value = await fetchCommonGroups(userId.value)
  } catch (e) {
    if (!silent) showToast(e instanceof Error ? e.message : '加载失败')
  } finally {
    loading.value = false
  }
}

async function onPullRefresh() {
  refreshing.value = true
  try {
    await load(true)
  } finally {
    refreshing.value = false
  }
}

function goBack() {
  smartBack(router)
}

function openGroup(item: CommonGroupItem) {
  router.push({
    path: `/chat/${item.id}`,
    query: {
      title: item.title,
      type: 'group',
      avatar: item.avatarUrl || '',
    },
  })
}

</script>

<template>
  <div class="common-groups-page">
    <header class="page-header">
      <button type="button" class="icon-btn" @click="goBack">
        <span class="material-symbols-outlined">arrow_back_ios</span>
      </button>
      <h1 class="page-title">共同群聊</h1>
      <div class="header-spacer" />
    </header>

    <p class="page-sub">与 {{ peerName }} 共同加入的群</p>

    <van-pull-refresh
      v-model="refreshing"
      class="list-pull"
      pulling-text="下拉刷新"
      loosing-text="释放刷新"
      loading-text="刷新中..."
      @refresh="onPullRefresh"
    >
      <div v-if="loading" class="state">加载中...</div>
      <div v-else-if="!list.length" class="state">暂无共同群聊</div>
      <ul v-else class="group-list">
        <li
          v-for="item in list"
          :key="item.id"
          class="group-item"
          @click="openGroup(item)"
        >
          <UserAvatar
            :src="item.avatarUrl"
            :user-id="item.id"
            kind="group"
            :name="item.title"
            class="group-avatar"
          />
          <div class="group-meta">
            <div class="group-title">{{ item.title }}</div>
            <div class="group-sub">{{ item.memberCount }} 人</div>
          </div>
          <span class="material-symbols-outlined chevron">chevron_right</span>
        </li>
      </ul>
    </van-pull-refresh>
  </div>
</template>

<style scoped>
.common-groups-page {
  min-height: 100%;
  min-height: 100dvh;
  background: var(--pulse-page-bg, var(--pulse-bg));
  color: var(--pulse-text);
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 8px;
  padding-top: var(--pulse-header-pad-top);
}

.icon-btn {
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  color: var(--pulse-text);
  display: flex;
  align-items: center;
  justify-content: center;
}

.page-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}

.header-spacer {
  width: 40px;
}

.page-sub {
  margin: 0 16px 12px;
  font-size: 13px;
  color: var(--pulse-text-secondary);
}

.list-pull {
  min-height: calc(100dvh - 120px);
}

.state {
  padding: 48px 16px;
  text-align: center;
  color: var(--pulse-text-secondary);
  font-size: 14px;
}

.group-list {
  list-style: none;
  margin: 0;
  padding: 0 12px 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.group-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--pulse-surface-container);
  cursor: pointer;
}

.group-item:active {
  background: var(--pulse-surface-high);
}

.group-avatar {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  object-fit: cover;
  background: var(--pulse-surface-high);
  flex-shrink: 0;
}

.group-avatar.initials {
  display: grid;
  place-items: center;
  font-size: 18px;
  font-weight: 700;
  color: var(--pulse-text);
}

.group-meta {
  flex: 1;
  min-width: 0;
}

.group-title {
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.group-sub {
  margin-top: 2px;
  font-size: 12px;
  color: var(--pulse-text-secondary);
}

.chevron {
  color: var(--pulse-text-secondary);
  font-size: 20px;
}
</style>

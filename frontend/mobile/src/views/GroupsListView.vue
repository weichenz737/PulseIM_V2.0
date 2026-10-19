<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { smartBack } from '@/utils/navBack'
import { showToast } from 'vant'
import { fetchMyGroups, type ConversationItem } from '@/api/conversation'
import UserAvatar from '@/components/UserAvatar.vue'

const router = useRouter()
const loading = ref(true)
const refreshing = ref(false)
const groups = ref<ConversationItem[]>([])
const keyword = ref('')

const filteredGroups = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  let list = groups.value.filter((g) => g.type === 'group')
  if (kw) {
    list = list.filter(
      (g) =>
        g.name.toLowerCase().includes(kw) ||
        (g.preview || '').toLowerCase().includes(kw),
    )
  }
  return [...list].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
    return 0
  })
})

onMounted(() => {
  void load()
})

async function load(silent = false) {
  if (!silent) loading.value = true
  try {
    groups.value = await fetchMyGroups()
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

function goCreate() {
  router.push('/group/create')
}

function openGroup(item: ConversationItem) {
  router.push({
    path: `/chat/${item.id}`,
    query: {
      title: item.name,
      type: 'group',
      avatar: item.avatar || '',
    },
  })
}

function openGroupInfo(item: ConversationItem, e: Event) {
  e.stopPropagation()
  router.push(`/group/${item.id}`)
}

</script>

<template>
  <div class="groups-page">
    <header class="page-header">
      <button type="button" class="icon-btn" @click="goBack">
        <span class="material-symbols-outlined">arrow_back_ios</span>
      </button>
      <h1 class="page-title">群聊</h1>
      <button type="button" class="icon-btn" aria-label="发起群聊" @click="goCreate">
        <span class="material-symbols-outlined">group_add</span>
      </button>
    </header>

    <div class="search-box">
      <span class="material-symbols-outlined search-icon">search</span>
      <input
        v-model="keyword"
            type="text"
        enterkeyhint="search"
        placeholder="搜索群名称"
        autocomplete="off"
      />
      <button
        v-if="keyword"
        type="button"
        class="search-clear-btn"
        aria-label="清除"
        @click="keyword = ''"
      >
        <span class="material-symbols-outlined">cancel</span>
      </button>
    </div>

    <van-pull-refresh
      v-model="refreshing"
      class="list-pull"
      pulling-text="下拉刷新"
      loosing-text="释放刷新"
      loading-text="刷新中..."
      @refresh="onPullRefresh"
    >
      <div v-if="loading" class="state">加载中...</div>

      <div v-else-if="!groups.length" class="empty-wrap">
        <div class="empty-icon">
          <span class="material-symbols-outlined">groups</span>
        </div>
        <p class="empty-title">暂无群聊</p>
        <p class="empty-sub">创建群聊，邀请好友一起交流</p>
        <button type="button" class="create-btn" @click="goCreate">发起群聊</button>
      </div>

      <div v-else-if="!filteredGroups.length" class="state">未找到相关群聊</div>

      <ul v-else class="group-list">
        <li
          v-for="item in filteredGroups"
          :key="item.id"
          class="group-item"
          @click="openGroup(item)"
        >
          <div class="avatar-wrap">
            <UserAvatar
              :src="item.avatar"
              :user-id="item.id"
              kind="group"
              :name="item.name"
              class="avatar"
            />
            <span v-if="item.unread > 0" class="unread-badge">
              {{ item.unread > 99 ? '99+' : item.unread }}
            </span>
          </div>
          <div class="group-meta">
            <div class="title-row">
              <span class="group-title">{{ item.name }}</span>
              <span v-if="item.pinned" class="pin-tag">置顶</span>
              <span v-if="item.time" class="time">{{ item.time }}</span>
            </div>
            <div class="preview-row">
              <span class="preview">{{ item.preview || '暂无消息' }}</span>
              <button
                type="button"
                class="info-btn"
                aria-label="群资料"
                @click="openGroupInfo(item, $event)"
              >
                <span class="material-symbols-outlined">info</span>
              </button>
            </div>
          </div>
        </li>
      </ul>
    </van-pull-refresh>
  </div>
</template>

<style scoped>
.groups-page {
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
  cursor: pointer;
}

.page-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 16px 12px;
  padding: 10px 12px;
  background: var(--pulse-surface-container);
  border-radius: var(--pulse-radius, 12px);
  border: 1px solid var(--pulse-border, rgba(65, 71, 85, 0.2));
}

.search-icon {
  font-size: 20px;
  color: var(--pulse-text-secondary);
}

.search-box input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent !important;
  color: var(--pulse-text);
  font-size: 15px;
}

.search-box input::placeholder {
  color: var(--pulse-text-secondary);
}

.clear-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--pulse-text-secondary);
  display: grid;
  place-items: center;
  cursor: pointer;
}

.clear-btn .material-symbols-outlined {
  font-size: 18px;
}

.list-pull {
  min-height: calc(100dvh - 140px);
}

.state {
  padding: 48px 16px;
  text-align: center;
  color: var(--pulse-text-secondary);
  font-size: 14px;
}

.empty-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 56px 24px 32px;
  text-align: center;
}

.empty-icon {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: var(--pulse-surface-container);
  color: var(--pulse-text-secondary);
  display: grid;
  place-items: center;
  margin-bottom: 16px;
}

.empty-icon .material-symbols-outlined {
  font-size: 32px;
}

.empty-title {
  margin: 0 0 6px;
  font-size: 16px;
  font-weight: 600;
}

.empty-sub {
  margin: 0 0 20px;
  font-size: 13px;
  color: var(--pulse-text-secondary);
}

.create-btn {
  height: 40px;
  padding: 0 22px;
  border: none;
  border-radius: 20px;
  background: #3b82f6;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.group-list {
  list-style: none;
  margin: 0;
  padding: 0 12px 32px;
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

.avatar-wrap {
  position: relative;
  flex-shrink: 0;
}

.avatar {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  object-fit: cover;
  background: var(--pulse-surface-high);
  display: block;
}

.avatar.initials {
  display: grid;
  place-items: center;
  font-size: 18px;
  font-weight: 700;
  color: var(--pulse-text);
}

.unread-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: #ef4444;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
}

.group-meta {
  flex: 1;
  min-width: 0;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.group-title {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pin-tag {
  flex-shrink: 0;
  font-size: 11px;
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.12);
  padding: 1px 6px;
  border-radius: 4px;
}

.time {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--pulse-text-secondary);
}

.preview-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.preview {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--pulse-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.info-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--pulse-text-secondary);
  display: grid;
  place-items: center;
  cursor: pointer;
}

.info-btn .material-symbols-outlined {
  font-size: 18px;
}
</style>

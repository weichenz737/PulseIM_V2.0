<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { smartBack } from '@/utils/navBack'
import { showConfirmDialog, showToast } from 'vant'
import {
  fetchBlockedUsers,
  unblockUser,
  type ContactItem,
} from '@/api/contact'
import UserAvatar from '@/components/UserAvatar.vue'

const router = useRouter()
const loading = ref(true)
const refreshing = ref(false)
const list = ref<ContactItem[]>([])

onMounted(() => {
  void load()
})

async function load() {
  loading.value = true
  try {
    list.value = await fetchBlockedUsers()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '加载失败')
  } finally {
    loading.value = false
  }
}

async function onPullRefresh() {
  refreshing.value = true
  try {
    list.value = await fetchBlockedUsers()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '刷新失败')
  } finally {
    refreshing.value = false
  }
}

function goBack() {
  smartBack(router)
}

function openProfile(item: ContactItem) {
  router.push(`/contacts/${item.userId}`)
}

function displayName(item: ContactItem) {
  return item.displayName?.trim() || item.remark?.trim() || item.nickname || '用户'
}

function displayId(item: ContactItem) {
  return item.pulseId || item.userId
}

async function onUnblock(item: ContactItem) {
  try {
    await showConfirmDialog({
      title: '移出黑名单',
      message: `确定将「${displayName(item)}」移出黑名单？`,
      confirmButtonText: '移出',
    })
  } catch {
    return
  }
  try {
    await unblockUser(item.userId)
    list.value = list.value.filter((x) => x.userId !== item.userId)
    showToast('已移出黑名单')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '操作失败')
  }
}
</script>

<template>
  <div class="blocked-page">
    <header class="page-header">
      <button type="button" class="icon-btn" @click="goBack">
        <span class="material-symbols-outlined">arrow_back_ios</span>
      </button>
      <h1 class="page-title">黑名单</h1>
      <div class="header-spacer" />
    </header>

    <p class="page-tip">拉黑后双方无法互看朋友圈；会话从你的消息列表隐藏，聊天记录不会清空。备注与朋友圈权限仍可设置，取消拉黑后记录仍在。</p>

    <van-pull-refresh
      v-model="refreshing"
      class="list-pull"
      pulling-text="下拉刷新"
      loosing-text="释放刷新"
      loading-text="刷新中..."
      @refresh="onPullRefresh"
    >
    <div v-if="loading" class="state">加载中...</div>
    <div v-else-if="!list.length" class="state">暂无黑名单用户</div>
    <ul v-else class="block-list">
      <li v-for="item in list" :key="item.userId" class="block-item">
        <button type="button" class="user-main" @click="openProfile(item)">
          <UserAvatar
            :src="item.avatarUrl"
            :user-id="item.userId"
            :name="displayName(item)"
            class="avatar"
          />
          <div class="user-meta">
            <div class="name-row">
              <span class="name">{{ displayName(item) }}</span>
            </div>
            <div v-if="item.remark?.trim()" class="meta-line">昵称：{{ item.nickname || '用户' }}</div>
            <div class="meta-line">PulseID：{{ displayId(item) }}</div>
          </div>
        </button>
        <button type="button" class="unblock-btn" @click="onUnblock(item)">移出</button>
      </li>
    </ul>
    </van-pull-refresh>
  </div>
</template>

<style scoped>
.blocked-page {
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

.page-tip {
  margin: 0 16px 16px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--pulse-text-secondary);
}

.state {
  padding: 48px 16px;
  text-align: center;
  color: var(--pulse-text-secondary);
  font-size: 14px;
}

.block-list {
  list-style: none;
  margin: 0;
  padding: 0 12px 32px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.block-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 14px;
  background: var(--pulse-surface-container);
}

.user-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  border: none;
  background: transparent;
  color: inherit;
  padding: 0;
  text-align: left;
  cursor: pointer;
}

.avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--pulse-surface-high);
  flex-shrink: 0;
}

.avatar.initials {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  color: var(--pulse-primary);
}

.user-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.name {
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.meta-line {
  font-size: 12px;
  color: var(--pulse-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.unblock-btn {
  flex-shrink: 0;
  border: none;
  border-radius: 999px;
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 600;
  color: var(--pulse-primary);
  background: rgba(173, 198, 255, 0.12);
  cursor: pointer;
}

.unblock-btn:active {
  opacity: 0.85;
}
</style>

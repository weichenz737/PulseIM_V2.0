<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { smartBack } from '@/utils/navBack'
import { showConfirmDialog, showToast } from 'vant'
import {
  fetchMomentsHideUsers,
  fetchMomentsRejectUsers,
  updateFriendMomentsPermission,
  type ContactItem,
} from '@/api/contact'
import UserAvatar from '@/components/UserAvatar.vue'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const list = ref<ContactItem[]>([])

const mode = computed(() =>
  route.name === 'MomentsRejectList' || String(route.path).includes('moments-reject')
    ? 'reject'
    : 'hide',
)

const pageTitle = computed(() =>
  mode.value === 'reject' ? '不让他（她）看' : '不看他（她）',
)

const pageTip = computed(() =>
  mode.value === 'reject'
    ? '以下好友无法查看你的朋友圈。可在对方资料页开关中调整。'
    : '你不会看到以下好友的朋友圈。可在对方资料页开关中调整。',
)

const emptyText = computed(() =>
  mode.value === 'reject' ? '暂无不让看的好友' : '暂无不看的好友',
)

onMounted(() => {
  void load()
})

watch(mode, () => {
  void load()
})

async function load() {
  loading.value = true
  try {
    list.value =
      mode.value === 'reject' ? await fetchMomentsRejectUsers() : await fetchMomentsHideUsers()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '加载失败')
  } finally {
    loading.value = false
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

async function onRemove(item: ContactItem) {
  const name = displayName(item)
  try {
    await showConfirmDialog({
      title: mode.value === 'reject' ? '允许对方查看' : '恢复查看',
      message:
        mode.value === 'reject'
          ? `确定允许「${name}」查看你的朋友圈？`
          : `确定恢复查看「${name}」的朋友圈？`,
      confirmButtonText: '确定',
    })
  } catch {
    return
  }
  try {
    if (mode.value === 'reject') {
      await updateFriendMomentsPermission(item.userId, { rejectHisMoments: false })
    } else {
      await updateFriendMomentsPermission(item.userId, { hideHisMoments: false })
    }
    list.value = list.value.filter((x) => x.userId !== item.userId)
    showToast('已更新')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '操作失败')
  }
}
</script>

<template>
  <div class="perm-list-page">
    <header class="page-header">
      <button type="button" class="icon-btn" @click="goBack">
        <span class="material-symbols-outlined">arrow_back_ios</span>
      </button>
      <h1 class="page-title">{{ pageTitle }}</h1>
      <div class="header-spacer" />
    </header>

    <p class="page-tip">{{ pageTip }}</p>

    <div v-if="loading" class="state">加载中...</div>
    <div v-else-if="!list.length" class="state">{{ emptyText }}</div>
    <ul v-else class="user-list">
      <li v-for="item in list" :key="item.userId" class="user-item">
        <button type="button" class="user-main" @click="openProfile(item)">
          <UserAvatar
            :src="item.avatarUrl"
            :user-id="item.userId"
            :name="displayName(item)"
            class="avatar"
          />
          <div class="user-meta">
            <div class="name">{{ displayName(item) }}</div>
            <div v-if="item.remark?.trim()" class="meta-line">昵称：{{ item.nickname || '用户' }}</div>
            <div class="meta-line">PulseID：{{ displayId(item) }}</div>
          </div>
        </button>
        <button type="button" class="remove-btn" @click="onRemove(item)">移除</button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.perm-list-page {
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

.user-list {
  list-style: none;
  margin: 0;
  padding: 0 12px 32px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.user-item {
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
  color: var(--pulse-text-secondary);
}

.user-meta {
  min-width: 0;
  flex: 1;
}

.name {
  font-size: 16px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta-line {
  margin-top: 2px;
  font-size: 12px;
  color: var(--pulse-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remove-btn {
  flex-shrink: 0;
  border: none;
  border-radius: 8px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--pulse-primary);
  font-size: 13px;
  cursor: pointer;
}

.remove-btn:active {
  background: rgba(255, 255, 255, 0.14);
}
</style>

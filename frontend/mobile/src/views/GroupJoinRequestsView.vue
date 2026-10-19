<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { smartBack } from '@/utils/navBack'
import { showConfirmDialog, showToast } from 'vant'
import {
  fetchGroupJoinRequests,
  approveGroupJoinRequest,
  rejectGroupJoinRequest,
  type GroupJoinRequestItem,
} from '@/api/conversation'

const route = useRoute()
const router = useRouter()
const conversationId = computed(() => route.params.id as string)

const loading = ref(true)
const list = ref<GroupJoinRequestItem[]>([])

onMounted(reload)

async function reload() {
  loading.value = true
  try {
    list.value = await fetchGroupJoinRequests(conversationId.value)
  } catch (e) {
    showToast(e instanceof Error ? e.message : '加载失败')
    router.back()
  } finally {
    loading.value = false
  }
}

function goBack() {
  smartBack(router)
}

function initials(name: string) {
  return (name || '?').slice(0, 1)
}

function sourceLabel(source?: string) {
  switch ((source || '').toLowerCase()) {
    case 'invite':
      return '成员邀请'
    case 'qrcode':
      return '扫码'
    case 'card':
      return '群名片'
    default:
      return '申请加入'
  }
}

function formatTime(value?: string) {
  if (!value) return ''
  return value.replace('T', ' ').slice(0, 16)
}

async function onApprove(item: GroupJoinRequestItem) {
  try {
    await showConfirmDialog({
      title: '同意加群',
      message: `同意「${item.applicantNickname}」加入本群？`,
      confirmButtonText: '同意',
    })
  } catch {
    return
  }
  try {
    await approveGroupJoinRequest(conversationId.value, item.id)
    showToast('已同意')
    await reload()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '操作失败')
  }
}

async function onReject(item: GroupJoinRequestItem) {
  try {
    await showConfirmDialog({
      title: '拒绝加群',
      message: `拒绝「${item.applicantNickname}」的加群申请？`,
      confirmButtonText: '拒绝',
      confirmButtonColor: '#ff5447',
    })
  } catch {
    return
  }
  try {
    await rejectGroupJoinRequest(conversationId.value, item.id)
    showToast('已拒绝')
    await reload()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '操作失败')
  }
}
</script>

<template>
  <div class="join-req-page">
    <header class="page-header">
      <button type="button" class="icon-btn" @click="goBack">
        <span class="material-symbols-outlined">arrow_back_ios</span>
      </button>
      <h1 class="page-title">加群申请</h1>
      <span class="spacer" />
    </header>

    <div v-if="loading" class="loading-state">加载中...</div>

    <div v-else-if="list.length === 0" class="empty-state">暂无待审核申请</div>

    <div v-else class="list">
      <div v-for="item in list" :key="item.id" class="card">
        <div class="row">
          <div class="avatar">
            <img v-if="item.applicantAvatarUrl" :src="item.applicantAvatarUrl" :alt="item.applicantNickname" />
            <span v-else>{{ initials(item.applicantNickname) }}</span>
          </div>
          <div class="body">
            <div class="nick">{{ item.applicantNickname }}</div>
            <div class="meta">
              {{ sourceLabel(item.source) }}
              <template v-if="item.inviterNickname"> · 邀请人 {{ item.inviterNickname }}</template>
            </div>
            <div v-if="item.message" class="message">验证信息：{{ item.message }}</div>
            <div v-if="item.createdAt" class="time">{{ formatTime(item.createdAt) }}</div>
          </div>
        </div>
        <div class="actions">
          <button type="button" class="btn reject" @click="onReject(item)">拒绝</button>
          <button type="button" class="btn approve" @click="onApprove(item)">同意</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.join-req-page {
  min-height: 100%;
  background: var(--pulse-page-bg, var(--pulse-bg));
  color: var(--pulse-text);
}

.page-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  height: 56px;
  padding: 0 8px;
  /* 强制与页面背景一致，覆盖全局浅色主题的渐变与旧的深色半透明背景 */
  background: var(--pulse-page-bg, var(--pulse-bg)) !important;
}

.icon-btn {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--pulse-text);
  display: grid;
  place-items: center;
  cursor: pointer;
}

.page-title {
  flex: 1;
  margin: 0;
  text-align: center;
  font-size: 17px;
  font-weight: 700;
}

.spacer {
  width: 40px;
}

.loading-state,
.empty-state {
  padding: 48px 16px;
  text-align: center;
  color: var(--pulse-outline);
}

.list {
  padding: 12px 16px 32px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card {
  background: var(--pulse-surface-container);
  border-radius: 14px;
  padding: 14px;
}

.row {
  display: flex;
  gap: 12px;
}

.avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--pulse-surface-high);
  display: grid;
  place-items: center;
  overflow: hidden;
  flex-shrink: 0;
  font-weight: 700;
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.body {
  flex: 1;
  min-width: 0;
}

.nick {
  font-size: 16px;
  font-weight: 600;
}

.meta,
.time {
  margin-top: 4px;
  font-size: 12px;
  color: var(--pulse-outline);
}

.message {
  margin-top: 8px;
  font-size: 13px;
  color: #c8c7ce;
  line-height: 1.4;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 12px;
}

.btn {
  min-width: 72px;
  height: 34px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.btn.reject {
  background: var(--pulse-surface-high);
  color: var(--pulse-text);
}

.btn.approve {
  background: #3b82f6;
  color: #fff;
}
</style>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { smartBack } from '@/utils/navBack'
import { showConfirmDialog, showToast } from 'vant'
import {
  acceptGroupInvite,
  approveGroupJoinRequest,
  fetchMyGroupNotifications,
  rejectGroupInvite,
  rejectGroupJoinRequest,
  type GroupJoinRequestItem,
  type GroupNotificationEvent,
} from '@/api/conversation'
import {
  dismissMobileNotification,
  isMobileNotificationDismissed,
} from '@/utils/notificationDismissals'

const router = useRouter()
const loading = ref(true)
const refreshing = ref(false)
const list = ref<GroupJoinRequestItem[]>([])
const joinRequests = ref<GroupJoinRequestItem[]>([])
const events = ref<GroupNotificationEvent[]>([])
const actingId = ref('')
const deletingId = ref('')

async function load() {
  try {
    const data = await fetchMyGroupNotifications()
    list.value = data.invites.filter(
      (item) => !isMobileNotificationDismissed('group-invite', item.id, item.createdAt),
    )
    joinRequests.value = data.joinRequests.filter(
      (item) => !isMobileNotificationDismissed('group-join', item.id, item.createdAt),
    )
    events.value = data.events.filter(
      (item) => !isMobileNotificationDismissed('group-event', item.id, item.createdAt),
    )
  } catch {
    list.value = []
    joinRequests.value = []
    events.value = []
  }
}

function initials(name?: string) {
  return (name || '?').slice(0, 1)
}

function eventIcon(type: string) {
  if (type === 'kick') return 'person_remove'
  if (type === 'dissolve') return 'group_off'
  if (type === 'role_admin' || type === 'role_owner') return 'admin_panel_settings'
  if (type === 'role_member') return 'person'
  return 'group_add'
}

function eventText(item: GroupNotificationEvent) {
  switch (item.eventType) {
    case 'kick':
      return `${item.operatorNickname || '管理员'} 将你移出了群聊`
    case 'dissolve':
      return '该群聊已被群主解散'
    case 'role_admin':
      return '你已被设为群管理员'
    case 'role_member':
      return '你的群管理员身份已被取消'
    case 'role_owner':
      return '你已成为新群主'
    case 'join':
      return item.reason || '你已加入群聊'
    default:
      return item.reason || '群聊状态有更新'
  }
}

function formatTime(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(date)
}

function inviteStatus(item: GroupJoinRequestItem) {
  if (item.status === 1) return '已同意'
  if (item.status === 2) return '已拒绝'
  return '待处理'
}

onMounted(async () => {
  loading.value = true
  try {
    await load()
  } finally {
    loading.value = false
  }
})

async function onPullRefresh() {
  refreshing.value = true
  try {
    await load()
  } finally {
    refreshing.value = false
  }
}

function goBack() {
  smartBack(router)
}

async function onAccept(item: GroupJoinRequestItem) {
  if (actingId.value) return
  actingId.value = item.id
  try {
    await acceptGroupInvite(item.id)
    showToast('已加入群聊')
    await load()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '操作失败')
  } finally {
    actingId.value = ''
  }
}

async function onReject(item: GroupJoinRequestItem) {
  try {
    await showConfirmDialog({
      title: '拒绝群邀请',
      message: `确定拒绝加入「${item.groupTitle || '群聊'}」吗？`,
    })
  } catch {
    return
  }
  if (actingId.value) return
  actingId.value = item.id
  try {
    await rejectGroupInvite(item.id)
    showToast('已拒绝')
    await load()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '操作失败')
  } finally {
    actingId.value = ''
  }
}

async function onAcceptJoin(item: GroupJoinRequestItem) {
  if (actingId.value) return
  actingId.value = item.id
  try {
    await approveGroupJoinRequest(item.conversationId, item.id)
    showToast('已同意')
    await load()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '操作失败')
  } finally {
    actingId.value = ''
  }
}

async function onRejectJoin(item: GroupJoinRequestItem) {
  try {
    await showConfirmDialog({
      title: '拒绝加群申请',
      message: `确定拒绝 ${item.applicantNickname || '该用户'} 加入「${item.groupTitle || '群聊'}」吗？`,
    })
  } catch {
    return
  }
  if (actingId.value) return
  actingId.value = item.id
  try {
    await rejectGroupJoinRequest(item.conversationId, item.id)
    showToast('已拒绝')
    await load()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '操作失败')
  } finally {
    actingId.value = ''
  }
}

async function onDelete(type: string, id: string, label: string): Promise<void> {
  try {
    await showConfirmDialog({
      title: '删除群通知',
      message: `确定删除${label}吗？`,
      confirmButtonText: '删除',
      confirmButtonColor: '#ff5447',
    })
  } catch {
    return
  }
  if (deletingId.value) return
  deletingId.value = id
  try {
    dismissMobileNotification(type, id)
    if (type === 'group-invite') list.value = list.value.filter((item) => item.id !== id)
    else if (type === 'group-join') joinRequests.value = joinRequests.value.filter((item) => item.id !== id)
    else events.value = events.value.filter((item) => item.id !== id)
    showToast('已删除')
  } finally {
    deletingId.value = ''
  }
}
</script>

<template>
  <div class="group-invites-page">
    <header class="page-header glass-header">
      <button type="button" class="icon-btn" @click="goBack">
        <span class="material-symbols-outlined">arrow_back_ios</span>
      </button>
      <h1 class="page-title">群通知</h1>
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
        <div v-else-if="!list.length && !joinRequests.length && !events.length" class="state">暂无群通知</div>
        <div v-else class="req-list">
          <div v-if="joinRequests.length" class="list-title">加群申请</div>
          <van-swipe-cell v-for="item in joinRequests" :key="`join_${item.id}`" class="request-swipe">
            <div class="req-item">
              <div class="req-main">
                <div class="avatar">
                  <img
                    v-if="item.applicantAvatarUrl"
                    :src="item.applicantAvatarUrl"
                    :alt="item.applicantNickname"
                  />
                  <span v-else class="avatar-initials">{{ initials(item.applicantNickname) }}</span>
                </div>
                <div class="req-info">
                  <div class="req-name">{{ item.applicantNickname || '用户' }}</div>
                  <div class="req-msg">
                    申请加入「{{ item.groupTitle || '群聊' }}」
                    <template v-if="item.message">：{{ item.message }}</template>
                  </div>
                  <div v-if="item.createdAt" class="req-time">{{ formatTime(item.createdAt) }}</div>
                </div>
              </div>
              <div class="req-actions">
                <button
                  type="button"
                  class="btn reject"
                  :disabled="actingId === item.id"
                  @click="onRejectJoin(item)"
                >
                  拒绝
                </button>
                <button
                  type="button"
                  class="btn accept"
                  :disabled="actingId === item.id"
                  @click="onAcceptJoin(item)"
                >
                  同意
                </button>
              </div>
            </div>
            <template #right>
              <button
                type="button"
                class="notification-delete"
                :disabled="deletingId === item.id"
                @click.stop="onDelete('group-join', item.id, `「${item.groupTitle || '群聊'}」的加群申请`)"
              >
                <span class="material-symbols-outlined">delete</span>
                <span>删除</span>
              </button>
            </template>
          </van-swipe-cell>
          <div v-if="list.length" class="list-title">邀请记录</div>
          <van-swipe-cell v-for="item in list" :key="item.id" class="request-swipe">
            <div class="req-item">
              <div class="req-main">
                <div class="avatar initials">群</div>
                <div class="req-info">
                  <div class="req-name">{{ item.groupTitle || '群聊' }}</div>
                  <div class="req-msg">
                    {{ item.inviterNickname || '好友' }} 邀请你加入群聊
                  </div>
                  <div v-if="item.status !== 0" class="invite-result">{{ inviteStatus(item) }}</div>
                </div>
              </div>
              <div v-if="item.status === 0" class="req-actions">
                <button
                  type="button"
                  class="btn reject"
                  :disabled="actingId === item.id"
                  @click="onReject(item)"
                >
                  拒绝
                </button>
                <button
                  type="button"
                  class="btn accept"
                  :disabled="actingId === item.id"
                  @click="onAccept(item)"
                >
                  同意
                </button>
              </div>
            </div>
            <template #right>
              <button
                type="button"
                class="notification-delete"
                :disabled="deletingId === item.id"
                @click.stop="onDelete('group-invite', item.id, `加入「${item.groupTitle || '群聊'}」的邀请`)"
              >
                <span class="material-symbols-outlined">delete</span>
                <span>删除</span>
              </button>
            </template>
          </van-swipe-cell>
          <div v-if="events.length" class="list-title">群通知</div>
          <van-swipe-cell v-for="item in events" :key="`event_${item.id}`" class="request-swipe">
            <div class="req-item notice-item">
              <div class="req-main">
                <div class="avatar notice-avatar">
                  <span class="material-symbols-outlined">{{ eventIcon(item.eventType) }}</span>
                </div>
                <div class="req-info">
                  <div class="req-name">
                    {{ item.groupTitle || '群聊' }}
                    <time>{{ formatTime(item.createdAt) }}</time>
                  </div>
                  <div class="req-msg">{{ eventText(item) }}</div>
                </div>
              </div>
            </div>
            <template #right>
              <button
                type="button"
                class="notification-delete"
                :disabled="deletingId === item.id"
                @click.stop="onDelete('group-event', item.id, `「${item.groupTitle || '群聊'}」的群聊动态`)"
              >
                <span class="material-symbols-outlined">delete</span>
                <span>删除</span>
              </button>
            </template>
          </van-swipe-cell>
        </div>
      </van-pull-refresh>
    </main>
  </div>
</template>

<style scoped>
.group-invites-page {
  min-height: 100vh;
  background: var(--pulse-page-bg, var(--pulse-bg));
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
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.icon-btn {
  border: none;
  background: transparent;
  color: var(--pulse-text);
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.header-spacer {
  width: 40px;
  height: 40px;
}

.page-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--pulse-text);
}

.page-main {
  padding: 8px 0 32px;
}

.state {
  padding: 48px 16px;
  text-align: center;
  color: var(--pulse-text-secondary);
  font-size: 14px;
}

.req-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 0.5px solid rgba(255, 255, 255, 0.06);
}

.request-swipe {
  border-bottom: 0.5px solid rgba(255, 255, 255, 0.06);
}

.notification-delete {
  display: flex;
  width: 76px;
  height: 100%;
  min-height: 68px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  border: none;
  background: #ff5447;
  color: #fff;
  font: inherit;
  font-size: 12px;
}

.notification-delete .material-symbols-outlined {
  font-size: 20px;
}

.notification-delete:disabled {
  opacity: 0.6;
}

.list-title {
  padding: 14px 16px 6px;
  color: var(--pulse-text-secondary);
  font-size: 12px;
}

.notice-avatar {
  background: linear-gradient(145deg, #596f9e, #6e54a2);
}

.notice-avatar .material-symbols-outlined {
  font-size: 23px;
}

.req-name time {
  float: right;
  margin-left: 8px;
  color: var(--pulse-text-secondary);
  font-size: 11px;
  font-weight: 400;
}

.req-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  overflow: hidden;
  background: var(--pulse-primary-container);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  color: #fff;
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.avatar-initials {
  color: #fff;
  font-weight: 600;
}

.req-info {
  flex: 1;
  min-width: 0;
}

.req-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--pulse-text);
}

.req-msg {
  margin-top: 2px;
  font-size: 13px;
  color: var(--pulse-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.req-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.invite-result {
  margin-top: 4px;
  color: #6fa8ff;
  font-size: 12px;
}

.req-time {
  margin-top: 3px;
  color: var(--pulse-text-secondary);
  font-size: 11px;
}

.btn {
  border: none;
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.btn.accept {
  background: var(--pulse-primary-container);
  color: var(--pulse-on-primary-container);
}

.btn.reject {
  background: var(--pulse-surface-high);
  color: var(--pulse-text-secondary);
}

.btn:disabled {
  opacity: 0.6;
}
</style>

<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import { smartBack } from '@/utils/navBack'
import { showConfirmDialog, showToast } from 'vant'
import { storeToRefs } from 'pinia'
import {
  acceptFriendRequest,
  addFriend,
  rejectFriendRequest,
  type FriendRequestItem,
} from '@/api/contact'
import { useFriendRequestStore } from '@/stores/friendRequest'
import UserAvatar from '@/components/UserAvatar.vue'

const router = useRouter()
const friendRequest = useFriendRequestStore()
const { list: storeList } = storeToRefs(friendRequest)
const loading = ref(true)
const refreshing = ref(false)
const acceptVisible = ref(false)
const acceptTarget = ref<FriendRequestItem | null>(null)
const acceptRemark = ref('')
const accepting = ref(false)
const resendingId = ref('')
const deletingId = ref('')

const list = computed(() => storeList.value)
const empty = computed(() => list.value.length === 0)

onMounted(async () => {
  friendRequest.startWsBridge()
  loading.value = true
  try {
    await friendRequest.refresh()
  } finally {
    loading.value = false
  }
})

async function onPullRefresh() {
  refreshing.value = true
  try {
    await friendRequest.refresh()
  } finally {
    refreshing.value = false
  }
}

watch(
  () => friendRequest.revision,
  () => {
    // 列表由 store.refresh 更新
  },
)

function goBack() {
  smartBack(router)
}

function openProfile(item: FriendRequestItem) {
  const uid = item.direction === 'incoming' ? item.fromUserId : item.toUserId
  router.push(`/contacts/${uid}`)
}

async function onResend(item: FriendRequestItem) {
  if (resendingId.value) return
  resendingId.value = item.id
  try {
    await addFriend(item.toUserId, {
      message: item.message?.trim() || undefined,
      remark: item.remark?.trim() || undefined,
    })
    showToast('好友申请已重新发送')
    await friendRequest.refresh()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '操作失败')
  } finally {
    resendingId.value = ''
  }
}

function openAccept(item: FriendRequestItem) {
  acceptTarget.value = item
  acceptRemark.value = ''
  acceptVisible.value = true
}

function closeAccept() {
  acceptVisible.value = false
  acceptTarget.value = null
}

async function confirmAccept() {
  if (!acceptTarget.value || accepting.value) return
  accepting.value = true
  try {
    await acceptFriendRequest(acceptTarget.value.id, acceptRemark.value.trim() || undefined)
    showToast('已添加好友')
    closeAccept()
    await friendRequest.refresh()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '操作失败')
  } finally {
    accepting.value = false
  }
}

async function onReject(item: FriendRequestItem) {
  try {
    await showConfirmDialog({ title: '拒绝申请', message: `确定拒绝「${item.nickname}」吗？` })
  } catch {
    return
  }
  try {
    await rejectFriendRequest(item.id)
    showToast('已拒绝')
    await friendRequest.refresh()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '操作失败')
  }
}

async function onDelete(item: FriendRequestItem) {
  try {
    await showConfirmDialog({
      title: '删除好友通知',
      message: `确定删除「${item.nickname}」的好友申请记录吗？`,
      confirmButtonText: '删除',
      confirmButtonColor: '#ff5447',
    })
  } catch {
    return
  }
  if (deletingId.value) return
  deletingId.value = item.id
  try {
    friendRequest.dismissRequest(item)
    showToast('已删除')
  } finally {
    deletingId.value = ''
  }
}

function statusText(item: FriendRequestItem) {
  if (item.status === 1) return '已添加'
  if (item.status === 2) return '已拒绝'
  if (item.direction === 'outgoing') return '等待验证'
  return ''
}
</script>

<template>
  <div class="new-friends-page">
    <header class="page-header glass-header">
      <button type="button" class="icon-btn" @click="goBack">
        <span class="material-symbols-outlined">arrow_back_ios</span>
      </button>
      <h1 class="page-title">新的朋友</h1>
      <button type="button" class="icon-btn" @click="router.push('/contacts/add')">
        <span class="material-symbols-outlined">person_add</span>
      </button>
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
        <div v-else-if="empty" class="state">暂无好友申请</div>
        <div v-else class="req-list">
          <van-swipe-cell v-for="item in list" :key="item.id" class="request-swipe">
            <div class="req-item">
              <button type="button" class="req-main" @click="openProfile(item)">
                <UserAvatar
                  :src="item.avatarUrl"
                  :user-id="item.direction === 'incoming' ? item.fromUserId : item.toUserId"
                  :name="item.nickname"
                  class="avatar"
                />
                <div class="req-info">
                  <div class="req-name">{{ item.nickname }}</div>
                  <div class="req-msg">
                    {{
                      item.message ||
                      (item.direction === 'outgoing' ? '你已申请添加对方' : '请求添加你为好友')
                    }}
                  </div>
                </div>
              </button>
              <div class="req-actions">
                <template v-if="item.status === 0 && item.direction === 'incoming'">
                  <button type="button" class="btn reject" @click="onReject(item)">拒绝</button>
                  <button type="button" class="btn accept" @click="openAccept(item)">同意</button>
                </template>
                <button
                  v-else-if="item.status === 0 && item.direction === 'outgoing'"
                  type="button"
                  class="btn reject"
                  :disabled="resendingId === item.id"
                  @click="onResend(item)"
                >
                  再次申请
                </button>
                <span v-else class="status">{{ statusText(item) }}</span>
              </div>
            </div>
            <template #right>
              <button
                type="button"
                class="notification-delete"
                :disabled="deletingId === item.id"
                @click.stop="onDelete(item)"
              >
                <span class="material-symbols-outlined">delete</span>
                <span>删除</span>
              </button>
            </template>
          </van-swipe-cell>
        </div>
      </van-pull-refresh>
    </main>

    <div v-if="acceptVisible" class="dialog-mask" @click.self="closeAccept">
      <div class="dialog">
        <h3 class="dialog-title">通过好友申请</h3>
        <p class="dialog-sub">可给「{{ acceptTarget?.nickname }}」设置备注名</p>
        <input
          v-model="acceptRemark"
          class="dialog-input"
          maxlength="64"
          placeholder="备注名（可选）"
        />
        <div class="dialog-actions">
          <button type="button" class="dialog-btn ghost" @click="closeAccept">取消</button>
          <button type="button" class="dialog-btn primary" :disabled="accepting" @click="confirmAccept">
            {{ accepting ? '处理中...' : '通过' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.new-friends-page {
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

.req-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  border: none;
  background: transparent;
  padding: 0;
  text-align: left;
  cursor: pointer;
  color: inherit;
}

.avatar {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  overflow: hidden;
  background: var(--pulse-surface-highest);
  flex-shrink: 0;
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
  font-weight: 600;
  color: var(--pulse-text);
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

.status {
  font-size: 13px;
  color: var(--pulse-outline);
}

.dialog-mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.dialog {
  width: 100%;
  max-width: 340px;
  background: var(--pulse-surface-container);
  border-radius: 16px;
  padding: 20px;
}

.dialog-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--pulse-text);
}

.dialog-sub {
  margin: 8px 0 16px;
  font-size: 13px;
  color: var(--pulse-text-secondary);
}

.dialog-input {
  width: 100%;
  box-sizing: border-box;
  padding: 12px 14px;
  border: none;
  border-radius: 10px;
  background: var(--pulse-surface-high);
  color: var(--pulse-text);
  font-size: 15px;
  outline: none;
}

.dialog-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}

.dialog-btn {
  flex: 1;
  border: none;
  border-radius: 10px;
  padding: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.dialog-btn.ghost {
  background: var(--pulse-surface-high);
  color: var(--pulse-text-secondary);
}

.dialog-btn.primary {
  background: var(--pulse-primary-container);
  color: var(--pulse-on-primary-container);
}

.dialog-btn:disabled {
  opacity: 0.6;
}
</style>

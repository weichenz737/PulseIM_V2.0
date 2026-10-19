import { defineStore } from 'pinia'
import { ref } from 'vue'
import { showToast } from 'vant'
import { onWsMessage } from '@/im/ws'
import { fetchFriendRequests, type FriendRequestItem } from '@/api/contact'
import {
  dismissMobileNotification,
  isMobileNotificationDismissed,
} from '@/utils/notificationDismissals'

export const useFriendRequestStore = defineStore('friendRequest', () => {
  const pendingCount = ref(0)
  const revision = ref(0)
  const list = ref<FriendRequestItem[]>([])
  let unsub: (() => void) | null = null
  let started = false
  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null

  function bump(count?: number) {
    if (typeof count === 'number' && count >= 0) {
      pendingCount.value = count
    }
    revision.value += 1
  }

  async function refresh() {
    try {
      const res = await fetchFriendRequests()
      const hiddenPendingCount = res.list.filter(
        (item) =>
          item.direction === 'incoming' &&
          item.status === 0 &&
          isMobileNotificationDismissed('friend', item.id, item.createdAt),
      ).length
      list.value = res.list.filter((item) => !isMobileNotificationDismissed('friend', item.id, item.createdAt))
      pendingCount.value = Math.max(0, res.pendingCount - hiddenPendingCount)
      revision.value += 1
    } catch {
      // ignore transient errors
    }
  }

  function dismissRequest(item: FriendRequestItem) {
    dismissMobileNotification('friend', item.id)
    list.value = list.value.filter((request) => request.id !== item.id)
    if (item.direction === 'incoming' && item.status === 0) {
      pendingCount.value = Math.max(0, pendingCount.value - 1)
    }
    revision.value += 1
  }

  function scheduleRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => {
      void refresh()
    }, 200)
  }

  function startWsBridge() {
    if (started) return
    started = true
    unsub = onWsMessage((data) => {
      const msg = data as Record<string, unknown>
      const cmd = String(msg.cmd ?? '')
      const type = String(msg.type ?? '')
      const event = String(msg.event ?? '')
      if (cmd !== 'FRIEND_REQUEST' && type !== 'friend_request' && event !== 'friend_request') return

      const action = String(msg.action ?? '')
      if (typeof msg.pendingCount === 'number') {
        pendingCount.value = msg.pendingCount
      } else if (action === 'request') {
        pendingCount.value += 1
      } else if (action === 'accepted' || action === 'rejected' || action === 'became_friends') {
        // 本端待处理数以服务端刷新为准
      }
      revision.value += 1
      scheduleRefresh()

      if (action === 'request') {
        const name = String(msg.fromNickname || '有人')
        showToast(`${name} 请求添加你为好友`)
      } else if (action === 'accepted') {
        const name = String(msg.fromNickname || '对方')
        showToast(`${name} 已同意你的好友申请`)
      } else if (action === 'rejected') {
        showToast('好友申请已被拒绝')
      }
    })
    void refresh()
    // WS 不稳定时兜底轮询，保证发起方能尽快看到「已通过」
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = setInterval(() => {
      if (document.hidden) return
      void refresh()
    }, 15_000)
  }

  function stopWsBridge() {
    unsub?.()
    unsub = null
    started = false
    if (refreshTimer) {
      clearTimeout(refreshTimer)
      refreshTimer = null
    }
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  return {
    pendingCount,
    revision,
    list,
    bump,
    refresh,
    dismissRequest,
    startWsBridge,
    stopWsBridge,
  }
})

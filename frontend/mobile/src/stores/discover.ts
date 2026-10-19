import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  fetchMomentInteractionUnreadCount,
  fetchMomentsUpdates,
  type MomentsUpdate,
} from '@/api/moments'

export const useDiscoverStore = defineStore('discover', () => {
  const momentsCount = ref(0)
  const momentsAvatars = ref<MomentsUpdate['avatars']>([])
  /** 朋友圈互动消息未读（点赞/评论/回复/@） */
  const interactionUnread = ref(0)
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let started = false
  let refreshTask: Promise<void> | null = null

  async function refreshMoments() {
    try {
      const data = await fetchMomentsUpdates()
      momentsCount.value = data.count || 0
      momentsAvatars.value = data.avatars || []
    } catch {
      // keep previous
    }
  }

  async function refreshInteractions() {
    try {
      interactionUnread.value = await fetchMomentInteractionUnreadCount()
    } catch {
      // keep previous
    }
  }

  async function refreshAll() {
    if (refreshTask) return refreshTask
    refreshTask = Promise.all([refreshMoments(), refreshInteractions()])
      .then(() => undefined)
      .finally(() => {
        refreshTask = null
      })
    return refreshTask
  }

  function clearMomentsBadge() {
    momentsCount.value = 0
    momentsAvatars.value = []
  }

  function clearInteractionBadge() {
    interactionUnread.value = 0
  }

  function startPolling() {
    if (started) return
    started = true
    void refreshAll()
    pollTimer = setInterval(() => {
      if (document.hidden || !navigator.onLine) return
      void refreshAll()
    }, 30_000)
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    started = false
  }

  return {
    momentsCount,
    momentsAvatars,
    interactionUnread,
    refreshMoments,
    refreshInteractions,
    refreshAll,
    clearMomentsBadge,
    clearInteractionBadge,
    startPolling,
    stopPolling,
  }
})

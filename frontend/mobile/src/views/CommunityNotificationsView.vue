<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import {
  deleteCommunityNotification,
  fetchCommunityNotifications,
  markCommunityNotificationsRead,
  type CommunityNotification,
} from '@/api/communityNotifications'
import { smartBack } from '@/utils/navBack'

type NotificationFilter = 'ALL' | 'INTERACTION' | 'MANAGEMENT'

const router = useRouter()
const loading = ref(true)
const refreshing = ref(false)
const selectedFilter = ref<NotificationFilter>('ALL')
const notifications = ref<CommunityNotification[]>([])
const deletingId = ref<string | null>(null)

const reportReasonLabels: Record<string, string> = {
  PORN: '\u8272\u60c5\u4f4e\u4fd7',
  FRAUD: '\u6b3a\u8bc8\u8bc8\u9a97',
  AD: '\u5e7f\u544a\u9a9a\u6270',
  VIOLENCE: '\u66b4\u529b\u8840\u8165',
  ILLEGAL: '\u8fdd\u6cd5\u8fdd\u89c4',
  OTHER: '\u5176\u4ed6',
}

const managementTypes = new Set([
  'ADMIN_SET',
  'ADMIN_UNSET',
  'MEMBER_REMOVED',
  'POST_PINNED',
  'POST_UNPINNED',
  'POST_DELETED',
  'MEMBER_MUTED',
  'JOIN_APPROVED',
  'JOIN_REJECTED',
  'PROFILE_APPROVED',
  'PROFILE_REJECTED',
  'LEAVE_APPROVED',
  'LEAVE_REJECTED',
  'OWNER_TRANSFERRED',
  'REPORT_CREATED',
])

const unreadSnapshot = computed(() => notifications.value.filter((item) => item.unread).length)
const filteredNotifications = computed(() => {
  if (selectedFilter.value === 'ALL') return notifications.value
  if (selectedFilter.value === 'MANAGEMENT') {
    return notifications.value.filter((item) => managementTypes.has(item.type))
  }
  return notifications.value.filter((item) => !managementTypes.has(item.type))
})

const filters = computed<Array<{ key: NotificationFilter; label: string; count: number }>>(() => [
  { key: 'ALL', label: '全部', count: notifications.value.filter((item) => item.unread).length },
  {
    key: 'INTERACTION',
    label: '互动消息',
    count: notifications.value.filter((item) => !managementTypes.has(item.type) && item.unread).length,
  },
  {
    key: 'MANAGEMENT',
    label: '圈子管理',
    count: notifications.value.filter((item) => managementTypes.has(item.type) && item.unread).length,
  },
])

async function clearUnreadNotifications(): Promise<void> {
  if (!notifications.value.some((item) => item.unread)) return
  try {
    await markCommunityNotificationsRead()
    const readAt = new Date().toISOString()
    notifications.value = notifications.value.map((item) =>
      item.unread ? { ...item, unread: false, readAt } : item,
    )
  } catch {
    // 保留未读状态，下次进入或刷新时继续同步。
  }
}

onMounted(() => {
  void loadNotifications()
})

async function loadNotifications(): Promise<void> {
  loading.value = true
  try {
    const items = await fetchCommunityNotifications()
    notifications.value = items
    await clearUnreadNotifications()
  } catch (error) {
    showToast(error instanceof Error ? error.message : '圈子消息加载失败')
  } finally {
    loading.value = false
  }
}

async function refreshNotifications(): Promise<void> {
  refreshing.value = true
  try {
    const items = await fetchCommunityNotifications()
    notifications.value = items
    await clearUnreadNotifications()
  } catch (error) {
    showToast(error instanceof Error ? error.message : '刷新失败，请稍后重试')
  } finally {
    refreshing.value = false
  }
}

function notificationLabel(item: CommunityNotification): string {
  const community = item.communityName ? `“${item.communityName}”` : '该圈子'
  if (item.type === 'ADMIN_SET') {
    return item.actorNickname ? `将你设为${community}管理员` : `你已成为${community}管理员`
  }
  if (item.type === 'ADMIN_UNSET') {
    return item.actorNickname
      ? `取消了你在${community}的管理员身份`
      : `你在${community}的管理员身份已被取消`
  }
  if (item.type === 'MEMBER_REMOVED') {
    return item.actorNickname ? `将你移出了${community}` : `你已被移出${community}`
  }
  if (item.type === 'MEMBER_MUTED') {
    return item.actorNickname ? `将你在${community}禁言` : `你已在${community}被禁言`
  }

  const actorFallback = item.actorNickname ? '' : '有人'
  const labels: Record<string, string> = {
    LIKE: `${actorFallback}赞了你的动态`,
    COMMENT: `${actorFallback}评论了你的动态`,
    REPLY: `${actorFallback}回复了你的评论`,
    COMMENT_LIKE: `${actorFallback}赞了你的评论`,
    POST_PINNED: `${actorFallback}置顶了你的动态`,
    POST_UNPINNED: `${actorFallback}取消置顶了你的动态`,
    POST_DELETED: `${actorFallback}删除了你的动态`,
    JOIN_APPROVED: '你的进圈申请已通过',
    JOIN_REJECTED: '你的进圈申请未通过',
    PROFILE_APPROVED: '圈子名称或头像审核已通过',
    PROFILE_REJECTED: '圈子名称或头像审核未通过',
    LEAVE_APPROVED: '你的退出圈子申请已通过',
    LEAVE_REJECTED: '你的退出圈子申请未通过',
    OWNER_TRANSFERRED: '你已成为圈主',
    REPORT_CREATED: `${actorFallback}举报了一条圈子动态`,
  }
  return labels[item.type] || item.title || '圈子通知'
}

function notificationContent(item: CommunityNotification): string {
  if (item.type !== 'REPORT_CREATED' || !item.content) return item.content
  return item.content.replace(/(原因\s*[:：]\s*)([A-Z0-9_]+)/g, (_match, prefix: string, code: string) => {
    return `${prefix}${reportReasonLabels[code] || code}`
  })
}

async function deleteNotification(item: CommunityNotification): Promise<void> {
  if (deletingId.value) return
  deletingId.value = item.id
  try {
    await deleteCommunityNotification(item.id)
    notifications.value = notifications.value.filter((notification) => notification.id !== item.id)
    showToast('已删除')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '删除失败')
  } finally {
    deletingId.value = null
  }
}

function notificationIcon(type: string): string {
  const icons: Record<string, string> = {
    LIKE: 'favorite',
    COMMENT: 'chat_bubble',
    REPLY: 'reply',
    COMMENT_LIKE: 'thumb_up',
    ADMIN_SET: 'admin_panel_settings',
    ADMIN_UNSET: 'manage_accounts',
    MEMBER_REMOVED: 'person_remove',
    POST_PINNED: 'keep',
    POST_UNPINNED: 'keep_off',
    POST_DELETED: 'delete',
    MEMBER_MUTED: 'voice_over_off',
    JOIN_APPROVED: 'how_to_reg',
    JOIN_REJECTED: 'person_cancel',
    PROFILE_APPROVED: 'verified',
    PROFILE_REJECTED: 'new_releases',
    LEAVE_APPROVED: 'logout',
    LEAVE_REJECTED: 'undo',
    OWNER_TRANSFERRED: 'workspace_premium',
    REPORT_CREATED: 'flag',
  }
  return icons[type] || 'notifications'
}

function notificationTone(type: string): string {
  if (type === 'LIKE' || type === 'COMMENT_LIKE') return 'like'
  if (managementTypes.has(type)) return 'management'
  return 'interaction'
}

function actorRoleLabel(role?: string): string {
  if (role === 'OWNER') return '圈主'
  if (role === 'ADMIN') return '管理员'
  if (role === 'MEMBER') return '圈友'
  return ''
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const elapsed = Math.max(0, now.getTime() - date.getTime())
  if (elapsed < 60_000) return '刚刚'
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} 分钟前`
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} 小时前`
  const clock = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  if (elapsed < 172_800_000) return `昨天 ${clock}`
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日 ${clock}`
  }
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

function initials(name: string): string {
  return (name.trim() || '圈').slice(0, 1)
}

async function openNotification(item: CommunityNotification): Promise<void> {
  if (item.type !== 'POST_DELETED' && item.postId && item.communityId) {
    await router.push({
      path: `/communities/${item.communityId}/posts/${item.postId}`,
      query: item.commentId ? { commentId: item.commentId } : undefined,
    })
    return
  }
  if (item.communityId) {
    await router.push(`/communities/${item.communityId}`)
    return
  }
  showToast('这条消息暂无可查看的详情')
}

function goBack(): void {
  smartBack(router, '/communities')
}
</script>

<template>
  <div class="notifications-page">
    <header class="notifications-header">
      <button type="button" class="header-button" aria-label="返回圈子" @click="goBack">
        <span class="material-symbols-outlined">arrow_back_ios</span>
      </button>
      <h1>圈子消息</h1>
      <span class="header-button header-placeholder" />
    </header>

    <main class="notifications-main">
      <section class="overview-card" aria-label="圈子消息概览">
        <div class="overview-icon">
          <span class="material-symbols-outlined">forum</span>
        </div>
        <div class="overview-copy">
          <strong>{{ unreadSnapshot > 0 ? `${unreadSnapshot} 条新消息` : '消息已全部查看' }}</strong>
          <span>动态互动和圈子身份变化都会显示在这里</span>
        </div>
      </section>

      <nav class="filter-tabs" aria-label="消息分类">
        <button
          v-for="filter in filters"
          :key="filter.key"
          type="button"
          :class="{ active: selectedFilter === filter.key }"
          @click="selectedFilter = filter.key"
        >
          <span>{{ filter.label }}</span>
          <em v-if="filter.count > 0">{{ filter.count > 99 ? '99+' : filter.count }}</em>
        </button>
      </nav>

      <van-pull-refresh
        v-model="refreshing"
        class="notifications-refresh"
        pulling-text="下拉刷新"
        loosing-text="释放刷新"
        loading-text="正在刷新…"
        @refresh="refreshNotifications"
      >
        <div v-if="loading" class="page-state">
          <span class="loading-orbit" />
          <p>正在加载圈子消息…</p>
        </div>

        <div v-else-if="filteredNotifications.length === 0" class="page-state empty-state">
          <span class="material-symbols-outlined">notifications_none</span>
          <strong>{{ notifications.length ? '这个分类暂时没有消息' : '暂无圈子消息' }}</strong>
          <p>有人与你互动或圈子身份变化时，会第一时间通知你</p>
        </div>

        <section v-else class="notification-list" aria-label="圈子消息列表">
          <van-swipe-cell v-for="item in filteredNotifications" :key="item.id" class="notification-swipe">
            <button
              type="button"
              class="notification-card"
              :class="{ unread: item.unread }"
              @click="openNotification(item)"
            >
              <span v-if="item.actorAvatar" class="notification-avatar">
                <img :src="item.actorAvatar" :alt="item.actorNickname || '用户头像'">
              </span>
              <span v-else-if="item.actorNickname" class="notification-avatar avatar-initials">
                {{ initials(item.actorNickname) }}
              </span>
              <span v-else class="notification-avatar avatar-icon" :class="notificationTone(item.type)">
                <span class="material-symbols-outlined">{{ notificationIcon(item.type) }}</span>
              </span>

              <span class="notification-body">
                <span class="notification-heading">
                  <span class="notification-action">
                    <b v-if="item.actorNickname">{{ item.actorNickname }}</b>
                    <span>{{ notificationLabel(item) }}</span>
                  </span>
                  <time>{{ formatTime(item.createdAt) }}</time>
                </span>

                <span v-if="item.content" class="notification-content">{{ notificationContent(item) }}</span>

                <span v-if="item.postExcerpt" class="post-excerpt">
                  <span class="material-symbols-outlined">article</span>
                  <span>{{ item.postExcerpt }}</span>
                </span>

                <span class="notification-meta">
                  <span class="notification-context">
                    <span v-if="actorRoleLabel(item.actorRole)" class="actor-role">
                      {{ actorRoleLabel(item.actorRole) }}
                    </span>
                    <span v-if="item.communityName" class="community-name">
                      <span class="material-symbols-outlined">diversity_3</span>
                      {{ item.communityName }}
                    </span>
                  </span>
                  <span v-if="item.postId" class="view-detail">
                    查看动态
                    <span class="material-symbols-outlined">chevron_right</span>
                  </span>
                </span>
              </span>

              <span v-if="item.unread" class="unread-dot" aria-label="未读" />
            </button>
            <template #right>
              <button
                type="button"
                class="notification-delete"
                :disabled="deletingId === item.id"
                @click.stop="deleteNotification(item)"
              >
                <span class="material-symbols-outlined">delete</span>
                <span>删除</span>
              </button>
            </template>
          </van-swipe-cell>
        </section>
      </van-pull-refresh>
    </main>
  </div>
</template>

<style scoped>
.notifications-page {
  --notification-shadow: 0 14px 34px rgba(0, 0, 0, 0.18);
  --notification-unread-bg: color-mix(in srgb, var(--pulse-primary) 9%, var(--pulse-surface-container));
  min-height: 100dvh;
  background: var(--pulse-list-page-bg, var(--pulse-page-bg, var(--pulse-bg)));
  color: var(--pulse-text);
}

:global(:root[data-theme='light']) .notifications-page {
  --notification-shadow: 0 12px 30px rgba(34, 91, 132, 0.1);
  --notification-unread-bg: color-mix(in srgb, var(--pulse-primary) 8%, #fff);
}

:global(:root[data-theme='light']) .notifications-header {
  background: var(--pulse-list-page-bg, var(--pulse-page-bg)) !important;
  border-bottom-color: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.notifications-header {
  position: sticky;
  top: 0;
  z-index: 30;
  display: grid;
  grid-template-columns: 44px 1fr 44px;
  align-items: center;
  height: calc(var(--pulse-header-bar-height, 52px) + var(--pulse-header-pad-top));
  min-height: calc(var(--pulse-header-bar-height, 52px) + var(--pulse-header-pad-top));
  padding: var(--pulse-header-pad-top) 10px 0;
  background: var(--pulse-list-page-bg, var(--pulse-page-bg, var(--pulse-bg)));
  border-bottom: 1px solid color-mix(in srgb, var(--pulse-outline-variant) 42%, transparent);
  backdrop-filter: blur(18px) saturate(1.25);
  -webkit-backdrop-filter: blur(18px) saturate(1.25);
}

.notifications-header h1 {
  margin: 0;
  text-align: center;
  font-size: 18px;
  font-weight: 650;
  letter-spacing: 0.01em;
}

.header-button {
  display: grid;
  width: 40px;
  height: 40px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--pulse-primary);
}

.header-button:active {
  background: var(--pulse-pressed);
}

.header-button .material-symbols-outlined {
  font-size: 22px;
}

.header-placeholder {
  pointer-events: none;
}

.notifications-main {
  width: min(100%, 720px);
  margin: 0 auto;
  padding: 16px 14px calc(28px + var(--pulse-safe-bottom));
}

.overview-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 13px;
  overflow: hidden;
  padding: 17px;
  border: 1px solid color-mix(in srgb, var(--pulse-primary) 22%, var(--pulse-outline-variant));
  border-radius: 20px;
  background:
    radial-gradient(circle at 92% 5%, color-mix(in srgb, var(--pulse-primary) 18%, transparent), transparent 42%),
    linear-gradient(145deg, var(--pulse-surface-container), color-mix(in srgb, var(--pulse-surface-high) 62%, var(--pulse-surface-container)));
  box-shadow: var(--notification-shadow);
}

.overview-icon {
  display: grid;
  width: 48px;
  height: 48px;
  flex: none;
  place-items: center;
  border-radius: 16px;
  background: var(--pulse-primary-gradient);
  color: var(--pulse-on-primary);
  box-shadow: 0 8px 20px color-mix(in srgb, var(--pulse-primary) 28%, transparent);
}

.overview-icon .material-symbols-outlined {
  font-size: 25px;
}

.overview-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.overview-copy strong {
  font-size: 16px;
  font-weight: 700;
}

.overview-copy span {
  color: var(--pulse-text-secondary);
  font-size: 12px;
  line-height: 1.45;
}

.filter-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
  margin: 16px 0 12px;
  padding: 4px;
  border: 1px solid color-mix(in srgb, var(--pulse-outline-variant) 56%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--pulse-surface-container) 84%, transparent);
}

.filter-tabs button {
  display: flex;
  min-width: 0;
  height: 38px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 7px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--pulse-text-secondary);
  font: inherit;
  font-size: 13px;
  font-weight: 550;
  transition: background 160ms ease, color 160ms ease, box-shadow 160ms ease;
}

.filter-tabs button.active {
  background: var(--pulse-surface-high);
  color: var(--pulse-primary);
  box-shadow: 0 3px 10px color-mix(in srgb, var(--pulse-text) 7%, transparent);
}

.filter-tabs em {
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--pulse-primary) 14%, transparent);
  color: var(--pulse-primary);
  font-size: 10px;
  font-style: normal;
  line-height: 17px;
}

.notifications-refresh {
  min-height: 54vh;
}

.notification-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.notification-swipe {
  overflow: visible;
  border-radius: 17px;
}

.notification-swipe :deep(.van-swipe-cell__wrapper) {
  border-radius: 17px;
}

.notification-swipe :deep(.van-swipe-cell__right) {
  display: flex;
  align-items: stretch;
}

.notification-delete {
  display: flex;
  width: 76px;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 0;
  background: var(--pulse-danger, #ef4444);
  color: #fff;
  font: inherit;
  font-size: 12px;
}

.notification-delete .material-symbols-outlined {
  font-size: 18px;
}

.notification-delete:disabled {
  opacity: .65;
}

.notification-card {
  position: relative;
  display: flex;
  width: 100%;
  align-items: flex-start;
  gap: 12px;
  padding: 15px 14px;
  border: 1px solid color-mix(in srgb, var(--pulse-outline-variant) 54%, transparent);
  border-radius: 17px;
  background: var(--pulse-surface-container);
  color: inherit;
  text-align: left;
  box-shadow: 0 5px 18px color-mix(in srgb, var(--pulse-text) 5%, transparent);
  transition: transform 120ms ease, background 120ms ease;
}

.notification-card.unread {
  border-color: color-mix(in srgb, var(--pulse-primary) 30%, var(--pulse-outline-variant));
  background: var(--notification-unread-bg);
}

.notification-card:active {
  transform: scale(0.986);
  background: var(--pulse-surface-high);
}

.notification-avatar {
  display: grid;
  width: 46px;
  height: 46px;
  flex: none;
  overflow: hidden;
  place-items: center;
  border-radius: 15px;
  background: var(--pulse-surface-highest);
}

.notification-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-initials {
  background: linear-gradient(145deg, var(--pulse-primary-container), var(--pulse-primary));
  color: var(--pulse-on-primary-container);
  font-size: 17px;
  font-weight: 700;
}

.avatar-icon {
  color: var(--pulse-primary);
}

.avatar-icon.like {
  background: color-mix(in srgb, var(--pulse-danger) 14%, var(--pulse-surface-container));
  color: var(--pulse-danger);
}

.avatar-icon.management {
  background: color-mix(in srgb, var(--pulse-secondary) 15%, var(--pulse-surface-container));
  color: var(--pulse-secondary);
}

.avatar-icon .material-symbols-outlined {
  font-size: 23px;
}

.notification-body {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}

.notification-heading {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: 9px;
}

.notification-action {
  min-width: 0;
  font-size: 14px;
  line-height: 1.45;
}

.notification-action b {
  margin-right: 5px;
  font-weight: 700;
}

.notification-heading time {
  flex: none;
  color: var(--pulse-text-secondary);
  font-size: 10px;
  line-height: 20px;
  white-space: nowrap;
}

.notification-content {
  display: -webkit-box;
  overflow: hidden;
  margin-top: 6px;
  color: var(--pulse-text-secondary);
  font-size: 12px;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.post-excerpt {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 7px 9px;
  border-left: 2px solid color-mix(in srgb, var(--pulse-primary) 55%, transparent);
  border-radius: 4px 9px 9px 4px;
  background: color-mix(in srgb, var(--pulse-surface-high) 74%, transparent);
  color: var(--pulse-text-secondary);
  font-size: 11px;
  line-height: 1.45;
}

.post-excerpt > .material-symbols-outlined {
  flex: none;
  color: var(--pulse-primary);
  font-size: 15px;
}

.post-excerpt > span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notification-meta {
  display: flex;
  min-height: 21px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 9px;
}

.community-name,
.view-detail {
  display: flex;
  min-width: 0;
  align-items: center;
  color: var(--pulse-text-secondary);
  font-size: 11px;
}

.notification-context {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
}

.actor-role {
  flex: none;
  padding: 2px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--pulse-primary) 12%, transparent);
  color: var(--pulse-primary);
  font-size: 9px;
  font-weight: 650;
  line-height: 15px;
}

.community-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.community-name .material-symbols-outlined {
  margin-right: 4px;
  font-size: 14px;
}

.view-detail {
  flex: none;
  color: var(--pulse-primary);
}

.view-detail .material-symbols-outlined {
  font-size: 16px;
}

.unread-dot {
  position: absolute;
  top: 13px;
  left: 7px;
  width: 7px;
  height: 7px;
  border: 2px solid var(--pulse-surface-container);
  border-radius: 50%;
  background: var(--pulse-danger);
  box-sizing: content-box;
}

.page-state {
  display: flex;
  min-height: 300px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  padding: 42px 18px;
  color: var(--pulse-text-secondary);
  text-align: center;
}

.page-state p {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.6;
}

.empty-state > .material-symbols-outlined {
  margin-bottom: 13px;
  color: var(--pulse-outline);
  font-size: 50px;
  font-variation-settings: 'wght' 250;
}

.empty-state strong {
  color: var(--pulse-text);
  font-size: 15px;
}

.loading-orbit {
  width: 28px;
  height: 28px;
  border: 3px solid color-mix(in srgb, var(--pulse-primary) 18%, transparent);
  border-top-color: var(--pulse-primary);
  border-radius: 50%;
  animation: orbit 780ms linear infinite;
}

@keyframes orbit {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .loading-orbit { animation-duration: 1.8s; }
  .notification-card,
  .filter-tabs button { transition: none; }
}
</style>

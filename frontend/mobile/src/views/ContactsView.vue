<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { onActivated, onDeactivated } from 'vue'
import { useRouter } from 'vue-router'
import { fetchContacts, type ContactItem } from '@/api/contact'
import UserAvatar from '@/components/UserAvatar.vue'
import { fetchMyGroupNotifications } from '@/api/conversation'
import { useFriendRequestStore } from '@/stores/friendRequest'
import { storeToRefs } from 'pinia'
import { nameFirstLetter, compareLetters, compareNamesZh } from '@/utils/nameLetter'
import { friendTagStyle } from '@/utils/friendTagColor'
import { useUserStore } from '@/stores/user'
import { readListSnapshot, writeListSnapshot } from '@/utils/listSnapshot'

const router = useRouter()
const friendRequest = useFriendRequestStore()
const { pendingCount } = storeToRefs(friendRequest)
const userStore = useUserStore()
const initialSnapshot = readListSnapshot<ContactItem>('contacts', String(userStore.userId || ''))
const contacts = ref<ContactItem[]>(initialSnapshot || [])
watch(contacts, (items) => {
  writeListSnapshot('contacts', String(userStore.userId || ''), items)
}, { deep: true })
const groupInviteCount = ref(0)
const hasGroupNotifications = ref(false)
const loading = ref(initialSnapshot === null)
const refreshing = ref(false)
let onlineTimer: ReturnType<typeof setInterval> | null = null
let hasMounted = false
let lastContactsLoadAt = 0
let contactsLoadTask: Promise<void> | null = null

function displayName(c: ContactItem) {
  return c.displayName?.trim() || c.remark?.trim() || c.nickname || '用户'
}

function hasRemark(c: ContactItem) {
  return !!c.remark?.trim()
}

function isFileTransferAssistant(c: ContactItem) {
  if (c.nickname === String.fromCodePoint(0x6587, 0x4ef6, 0x4f20, 0x8f93, 0x52a9, 0x624b)) return true
  return !!c.fileTransferAssistant || c.nickname === '文件传输助手'
}

const groupedContacts = computed(() => {
  const map = new Map<string, ContactItem[]>()
  for (const c of contacts.value) {
    const letter = nameFirstLetter(displayName(c))
    if (!map.has(letter)) map.set(letter, [])
    map.get(letter)!.push(c)
  }
  return [...map.entries()]
    .sort(([a], [b]) => compareLetters(a, b))
    .map(([letter, list]) => ({
      letter,
      list: [...list].sort((a, b) => compareNamesZh(displayName(a), displayName(b))),
    }))
})

const indexLetters = computed(() => groupedContacts.value.map((g) => g.letter))

async function loadContacts(_silent = false) {
  if (contactsLoadTask) return contactsLoadTask
  const task = (async () => {
  try {
    contacts.value = (await fetchContacts()).filter((contact) => !isFileTransferAssistant(contact))
    lastContactsLoadAt = Date.now()
  } catch {
    // Connection feedback is shown only on the messages page.
  } finally {
    loading.value = false
  }
  })()
  contactsLoadTask = task
  try {
    await task
  } finally {
    if (contactsLoadTask === task) contactsLoadTask = null
  }
}

async function loadGroupInviteCount(silent = false) {
  try {
    const data = await fetchMyGroupNotifications()
    groupInviteCount.value = data.pendingCount
    hasGroupNotifications.value = data.invites.length > 0 || data.events.length > 0
  } catch {
    if (!silent) {
      groupInviteCount.value = 0
      hasGroupNotifications.value = false
    }
  }
}

async function onPullRefresh() {
  refreshing.value = true
  try {
    await Promise.all([
      loadContacts(true),
      friendRequest.refresh(),
      loadGroupInviteCount(true),
    ])
  } finally {
    refreshing.value = false
  }
}

function startOnlinePoll() {
  stopOnlinePoll()
  // 首屏 12 秒内 1.5s 轮询一次，尽快刷新对方在线（尤其 iOS 刷新后）
  let ticks = 0
  onlineTimer = setInterval(() => {
    ticks += 1
    void loadContacts(true)
    if (ticks >= 8 && onlineTimer) {
      clearInterval(onlineTimer)
      onlineTimer = setInterval(() => {
        void loadContacts(true)
      }, 5000)
    }
  }, 1500)
}

function stopOnlinePoll() {
  if (onlineTimer) {
    clearInterval(onlineTimer)
    onlineTimer = null
  }
}

function onPresence(e: Event) {
  const d = (e as CustomEvent<{ userId?: string | number; online?: boolean; onlineHidden?: boolean }>).detail
  if (!d || d.userId === undefined) return
  const userId = String(d.userId)
  contacts.value = contacts.value.map((c) =>
    c.userId === userId
      ? { ...c, online: !!d.online, onlineHidden: !!d.onlineHidden }
      : c,
  )
}

onMounted(async () => {
  hasMounted = true
  friendRequest.startWsBridge()
  window.addEventListener('pulse:presence', onPresence)
  await Promise.all([
    loadContacts(),
    friendRequest.refresh(),
    loadGroupInviteCount(true),
  ])
  startOnlinePoll()
})

onActivated(() => {
  void friendRequest.refresh()
  if (hasMounted && Date.now() - lastContactsLoadAt > 2000) {
    void loadContacts(true)
  }
  void loadGroupInviteCount(true)
  startOnlinePoll()
})

onDeactivated(() => {
  stopOnlinePoll()
})

onUnmounted(() => {
  stopOnlinePoll()
  window.removeEventListener('pulse:presence', onPresence)
})

watch(
  () => friendRequest.revision,
  () => {
    // 收到申请推送后刷新联系人（同意后好友列表会变）
    void loadContacts()
  },
)

function goAddFriend() {
  router.push('/contacts/add')
}

function goNewFriends() {
  router.push('/contacts/new-friends')
}

function goGroupInvites() {
  router.push('/contacts/group-notifications')
}

function goGroups() {
  router.push('/contacts/groups')
}

function goSearch() {
  router.push('/search')
}

function openContact(userId: string) {
  router.push(`/contacts/${userId}`)
}

function scrollToLetter(letter: string) {
  const el = document.getElementById(`section-${letter}`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <div class="contacts-page">
    <header class="pulse-page-nav page-header tab-home-header home-tab-header">
      <h1 class="page-title">联系人</h1>
      <button type="button" class="icon-btn" aria-label="添加好友" @click="goAddFriend">
        <AppIcon name="person_add" />
      </button>
    </header>

    <div class="search-entry" @click="goSearch">
      <AppIcon name="search" :size="20" />
      <span>搜索</span>
    </div>

    <van-pull-refresh
      v-model="refreshing"
      class="contacts-pull list-pull"
      pulling-text="下拉刷新"
      loosing-text="释放刷新"
      loading-text="刷新中..."
      @refresh="onPullRefresh"
    >
    <div v-if="loading" class="loading-state">加载中...</div>

    <div v-else class="contact-sections">
      <div class="quick-sections">
        <div class="section-item" @click="goNewFriends">
          <div class="section-icon new-friend">
            <AppIcon name="person_add" />
          </div>
          <span class="section-label">新的朋友</span>
          <span v-if="pendingCount > 0" class="pending-badge">{{ pendingCount > 99 ? '99+' : pendingCount }}</span>
          <AppIcon name="chevronRight" class="chevron" :size="16" />
        </div>
        <div class="section-item" @click="goGroupInvites">
          <div class="section-icon group-invite">
            <AppIcon name="group_add" />
          </div>
          <span class="section-label">群通知</span>
          <span v-if="groupInviteCount > 0" class="pending-badge">{{ groupInviteCount > 99 ? '99+' : groupInviteCount }}</span>
          <AppIcon name="chevronRight" class="chevron" :size="16" />
        </div>
        <div class="section-item" @click="goGroups">
          <div class="section-icon group">
            <AppIcon name="group" />
          </div>
          <span class="section-label">群聊</span>
          <AppIcon name="chevronRight" class="chevron" :size="16" />
        </div>
      </div>

      <div v-if="!groupedContacts.length" class="empty-friends">
        暂无联系人，去添加好友吧
      </div>

      <div v-for="group in groupedContacts" :key="group.letter" :id="`section-${group.letter}`" class="letter-group">
        <div class="letter-label">{{ group.letter }}</div>
        <div
          v-for="contact in group.list"
          :key="contact.userId"
          class="contact-item"
          @click="openContact(contact.userId)"
        >
          <div class="avatar-wrap">
            <UserAvatar
              :src="contact.avatarUrl"
              :user-id="contact.userId"
              :name="displayName(contact)"
              :initial-name="contact.nickname"
              :size="42"
            />
            <span class="online-dot" :class="{ online: contact.online }" />
          </div>
          <div class="contact-text">
            <div class="contact-name-row">
              <span class="contact-name">{{ displayName(contact) }}</span>
              <span
                v-if="contact.tag && !isFileTransferAssistant(contact)"
                class="contact-tag"
                :style="friendTagStyle(contact.userId)"
              >{{ contact.tag }}</span>
            </div>
            <span
              v-if="hasRemark(contact) && contact.friendAddSource !== 'default_friend'"
              class="contact-sub"
            >昵称：{{ contact.nickname }}</span>
          </div>
        </div>
      </div>
    </div>
    </van-pull-refresh>

    <aside v-if="indexLetters.length" class="index-bar">
      <button
        v-for="letter in indexLetters"
        :key="letter"
        type="button"
        class="index-letter"
        @click="scrollToLetter(letter)"
      >
        {{ letter }}
      </button>
    </aside>
  </div>
</template>

<style scoped>
.contacts-page {
  min-height: 100%;
  background: var(--pulse-page-bg, var(--pulse-bg));
  position: relative;
}

.contacts-pull {
  background: var(--pulse-page-bg, var(--pulse-bg));
  min-height: calc(100dvh - 180px);
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  padding-top: var(--pulse-header-pad-top);
}

.page-title {
  margin: 0;
  font-size: calc(var(--pulse-content-font-size, 15px) + 3px);
  font-weight: 600;
  color: var(--pulse-text);
}

.icon-btn {
  width: 40px;
  height: 40px;
  border: none;
  background: var(--pulse-surface-high);
  border-radius: var(--pulse-radius);
  color: var(--pulse-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.15s;
}

.icon-btn:active {
  transform: scale(0.95);
}

.search-entry {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 16px 8px;
  padding: 12px 16px;
  background: var(--pulse-surface-high);
  border-radius: var(--pulse-radius);
  color: var(--pulse-text-secondary);
  font-size: var(--pulse-content-font-size, 15px);
  cursor: pointer;
  border: 1px solid rgba(65, 71, 85, 0.2);
}

.quick-sections {
  margin: 0 12px 10px;
  overflow: hidden;
  border: 1px solid var(--pulse-border);
  border-radius: 16px;
  background: var(--pulse-surface-container);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.24);
}

.section-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.2s;
}

.section-item:active {
  background: var(--pulse-surface-low);
}

.section-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--pulse-radius);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.section-icon.new-friend {
  background: rgba(75, 142, 255, 0.2);
  color: var(--pulse-primary);
}

.section-icon.group-invite {
  background: rgba(255, 171, 64, 0.18);
  color: #ffab40;
}

.section-icon.group {
  background: rgba(66, 227, 85, 0.15);
  color: var(--pulse-secondary);
}

.section-label {
  flex: 1;
  font-size: calc(var(--pulse-content-font-size, 15px) + 1px);
  font-weight: 400;
  color: var(--pulse-text);
}

.empty-friends {
  padding: 28px 16px;
  text-align: center;
  font-size: var(--pulse-font-body);
  color: var(--pulse-text-secondary);
}

.pending-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: #ff6b6b;
  color: #fff;
  font-size: var(--pulse-font-caption);
  font-weight: 700;
  line-height: calc(18px * var(--pulse-font-scale, 1));
  text-align: center;
}

.chevron {
  flex-shrink: 0;
  color: var(--pulse-text-secondary);
}

.letter-group {
  margin: 0 12px 10px;
  overflow: hidden;
  border: 1px solid var(--pulse-border);
  border-radius: 16px;
  background: var(--pulse-surface-container);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.24);
}

.letter-label {
  padding: 8px 16px 8px 18px;
  font-size: var(--pulse-font-small);
  font-weight: 500;
  color: var(--pulse-primary);
  background: var(--pulse-page-bg, var(--pulse-bg));
}

.contact-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.2s;
}

.contact-item:active {
  background: var(--pulse-surface-low);
}

.avatar-wrap {
  position: relative;
  flex-shrink: 0;
}

.online-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  z-index: 1;
  background: var(--pulse-outline);
  border: 2px solid var(--pulse-bg);
}

.online-dot.online {
  background: var(--pulse-secondary);
}

.contact-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.contact-name-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.contact-name {
  font-size: var(--pulse-content-font-size, 15px);
  font-weight: 500;
  color: var(--pulse-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.contact-tag {
  flex: 0 1 auto;
  max-width: 100%;
  box-sizing: border-box;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: var(--pulse-font-caption);
  font-weight: 600;
  line-height: calc(16px * var(--pulse-font-scale, 1));
  white-space: normal;
  overflow-wrap: anywhere;
}

.contact-sub {
  font-size: var(--pulse-font-caption);
  color: var(--pulse-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.loading-state {
  text-align: center;
  padding: 48px;
  color: var(--pulse-text-secondary);
}

.index-bar {
  position: fixed;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 0;
}

.index-letter {
  border: none;
  background: transparent;
  font-size: var(--pulse-font-caption);
  font-weight: 500;
  color: var(--pulse-outline);
  padding: 2px 4px;
  cursor: pointer;
  line-height: 1;
}

.index-letter:active {
  color: var(--pulse-primary);
  font-weight: 700;
}
</style>

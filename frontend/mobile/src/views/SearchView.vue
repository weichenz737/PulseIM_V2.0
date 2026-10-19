<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { smartBack } from '@/utils/navBack'
import { showToast } from 'vant'
import { openPrivateConversation } from '@/api/conversation'
import UserAvatar from '@/components/UserAvatar.vue'
import {
  globalSearch,
  type SearchContactHit,
  type SearchGroupHit,
  type SearchConversationHit,
} from '@/api/search'

const router = useRouter()
const keyword = ref('')
const loading = ref(false)
const searched = ref(false)
const contacts = ref<SearchContactHit[]>([])
const groups = ref<SearchGroupHit[]>([])
const conversations = ref<SearchConversationHit[]>([])
const contactLimit = ref(3)
const FILE_TRANSFER_ASSISTANT_NAME = '文件传输助手'

function isFileTransferSearch(value: string) {
  return value.trim().toLocaleLowerCase() === FILE_TRANSFER_ASSISTANT_NAME.toLocaleLowerCase()
}

function isFileTransferAssistantContact(c: SearchContactHit) {
  return c.fileTransferAssistant || c.nickname === FILE_TRANSFER_ASSISTANT_NAME
}

const systemAssistants = computed(() => contacts.value.filter(isFileTransferAssistantContact))
const regularContacts = computed(() => contacts.value.filter((c) => !isFileTransferAssistantContact(c)))
const visibleContacts = computed(() => regularContacts.value.slice(0, contactLimit.value))

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let searchVersion = 0

watch(keyword, () => {
  if (debounceTimer) clearTimeout(debounceTimer)
  const version = ++searchVersion
  const q = keyword.value.trim()
  if (!q) {
    contacts.value = []
    groups.value = []
    conversations.value = []
    searched.value = false
    loading.value = false
    contactLimit.value = 3
    return
  }
  debounceTimer = setTimeout(() => {
    void doSearch(version)
  }, 280)
})

async function doSearch(version = searchVersion) {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  const q = keyword.value.trim()
  if (!q) return
  loading.value = true
  searched.value = true
  contactLimit.value = 3
  try {
    const res = await globalSearch(q)
    // 输入继续变化时，旧请求的结果不能覆盖当前关键词，也不能把结果
    // 在新请求完成前短暂清空，避免 Android WebView 上列表闪烁。
    if (version !== searchVersion || q !== keyword.value.trim()) return
    if (isFileTransferSearch(q)) {
      // 文件传输助手是系统会话，搜索它时不混入普通好友、群聊和聊天记录。
      contacts.value = res.contacts.filter(isFileTransferAssistantContact).slice(0, 1)
      groups.value = []
      conversations.value = []
    } else {
      contacts.value = res.contacts
      groups.value = res.groups
      conversations.value = res.conversations
    }
  } catch (e) {
    if (version !== searchVersion || q !== keyword.value.trim()) return
    contacts.value = []
    groups.value = []
    conversations.value = []
    showToast(e instanceof Error ? e.message : '搜索失败')
  } finally {
    if (version === searchVersion && q === keyword.value.trim()) loading.value = false
  }
}

function onSearchKeyup(event: KeyboardEvent) {
  event.preventDefault()
  void doSearch()
}

function clearKeyword() {
  keyword.value = ''
}

function goBack() {
  smartBack(router)
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function highlight(text: string): string {
  const q = keyword.value.trim()
  if (!q || !text) return escapeHtml(text || '')
  const lower = text.toLowerCase()
  const ql = q.toLowerCase()
  let out = ''
  let i = 0
  while (i < text.length) {
    const idx = lower.indexOf(ql, i)
    if (idx < 0) {
      out += escapeHtml(text.slice(i))
      break
    }
    out += escapeHtml(text.slice(i, idx))
    out += `<mark>${escapeHtml(text.slice(idx, idx + q.length))}</mark>`
    i = idx + q.length
  }
  return out
}

function initials(name?: string) {
  return (name || '?').slice(0, 1)
}

function formatTime(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const hm = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (d.toDateString() === now.toDateString()) return hm
  const y = new Date(now)
  y.setDate(now.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return `昨天 ${hm}`
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`
}

async function openContact(c: SearchContactHit) {
  if (isFileTransferAssistantContact(c)) {
    try {
      const conversation = await openPrivateConversation(c.userId)
      await router.push({
        path: `/chat/${conversation.id}`,
        query: {
          title: conversation.name,
          type: conversation.type,
          avatar: conversation.avatar,
          peerUserId: conversation.peerUserId || c.userId,
          fileTransferAssistant: '1',
        },
      })
    } catch (e) {
      showToast(e instanceof Error ? e.message : '无法打开文件传输助手')
    }
    return
  }
  router.push(`/contacts/${c.userId}`)
}

function openGroup(g: SearchGroupHit) {
  router.push({
    path: `/chat/${g.id}`,
    query: { title: g.title, type: 'group', avatar: g.avatarUrl || '' },
  })
}

/** 进入该会话的聊天记录搜索，展示全部相关命中 */
function openConversationHits(c: SearchConversationHit) {
  if (c.conversationTitle === FILE_TRANSFER_ASSISTANT_NAME) {
    router.push({
      path: `/chat/${c.conversationId}`,
      query: {
        title: c.conversationTitle,
        type: c.conversationType === 2 ? 'group' : 'personal',
        avatar: c.avatarUrl || '',
      },
    })
    return
  }
  router.push({
    path: `/chat/${c.conversationId}/search`,
    query: {
      title: c.conversationTitle,
      type: c.conversationType === 2 ? 'group' : 'personal',
      avatar: c.avatarUrl || '',
      scope: 'messages',
      q: keyword.value.trim(),
    },
  })
}
</script>

<template>
  <div class="search-page">
    <header class="top-row">
      <button type="button" class="back-link" @click="goBack">
        <span class="material-symbols-outlined">arrow_back</span>
        返回
      </button>
    </header>

    <div class="search-bar-wrap">
      <div class="search-bar">
        <span class="material-symbols-outlined search-ico">search</span>
        <input
          v-model="keyword"
          type="text"
          class="search-input"
          placeholder="搜索联系人、群聊、聊天记录"
          autofocus
          enterkeyhint="search"
          @keyup.enter="onSearchKeyup"
        />
        <button v-if="keyword" type="button" class="search-clear-btn" aria-label="清除搜索" @click="clearKeyword">
          <span class="material-symbols-outlined">cancel</span>
        </button>
      </div>
    </div>

    <main class="main">
      <div v-if="!keyword.trim()" class="hint">输入关键词搜索已添加的联系人、群聊和聊天记录</div>
      <div
        v-else-if="loading && !contacts.length && !groups.length && !conversations.length"
        class="hint"
      >搜索中...</div>
      <div
        v-else-if="searched && !contacts.length && !groups.length && !conversations.length"
        class="hint"
      >
        未找到相关结果
      </div>

      <template v-else-if="searched">
        <section v-if="systemAssistants.length" class="section">
          <div class="section-head">
            <h2 class="section-title">系统服务</h2>
          </div>
          <button
            v-for="c in systemAssistants"
            :key="c.userId"
            type="button"
            class="card contact-card"
            @click="openContact(c)"
          >
            <div class="avatar-wrap">
              <UserAvatar :src="c.avatarUrl" :user-id="c.userId" :name="c.nickname" class="avatar" />
            </div>
            <div class="meta">
              <div class="name" v-html="highlight(c.nickname)" />
              <div class="sub">系统助手</div>
            </div>
          </button>
        </section>

        <section v-if="regularContacts.length" class="section">
          <div class="section-head">
            <h2 class="section-title">联系人</h2>
            <button
              v-if="regularContacts.length > contactLimit"
              type="button"
              class="view-all"
              @click="contactLimit = regularContacts.length"
            >
              查看全部
            </button>
          </div>
          <button
            v-for="c in visibleContacts"
            :key="c.userId"
            type="button"
            class="card contact-card"
            @click="openContact(c)"
          >
            <div class="avatar-wrap">
              <UserAvatar :src="c.avatarUrl" :user-id="c.userId" :name="c.nickname" class="avatar" />
              <span v-if="c.online" class="online-dot" />
            </div>
            <div class="meta">
              <div class="name" v-html="highlight(c.nickname)" />
              <div class="sub">{{ c.subtitle || '好友' }}</div>
            </div>
          </button>
        </section>

        <section v-if="groups.length" class="section">
          <div class="section-head">
            <h2 class="section-title">群聊</h2>
          </div>
          <button
            v-for="g in groups"
            :key="g.id"
            type="button"
            class="card group-card"
            @click="openGroup(g)"
          >
            <UserAvatar
              :src="g.avatarUrl"
              :user-id="g.id"
              kind="group"
              :name="g.title"
              class="group-avatar"
            />
            <div class="meta">
              <div class="name" v-html="highlight(g.title)" />
              <div class="sub">{{ g.memberCount }} 位成员</div>
            </div>
            <span class="material-symbols-outlined chevron">chevron_right</span>
          </button>
        </section>

        <section v-if="conversations.length" class="section">
          <div class="section-head">
            <h2 class="section-title">聊天记录</h2>
          </div>
          <div class="history-card">
            <button
              v-for="(c, idx) in conversations"
              :key="c.conversationId"
              type="button"
              class="conv-hit"
              :class="{ border: idx < conversations.length - 1 }"
              @click="openConversationHits(c)"
            >
              <img
                v-if="c.avatarUrl"
                :src="c.avatarUrl"
                :alt="c.conversationTitle"
                class="conv-avatar"
                :class="{ group: c.conversationType === 2 }"
              />
              <div
                v-else
                class="conv-avatar initials"
                :class="{ group: c.conversationType === 2 }"
              >
                {{ initials(c.conversationTitle) }}
              </div>
              <div class="conv-meta">
                <div class="conv-top">
                  <span class="conv-name">{{ c.conversationTitle }}</span>
                  <span class="conv-time">{{ formatTime(c.createdAt) }}</span>
                </div>
                <p class="conv-count">
                  包含 {{ c.matchCount }} 条相关聊天记录
                </p>
                <p v-if="c.preview" class="conv-preview" v-html="highlight(c.preview)" />
              </div>
              <span class="material-symbols-outlined chevron">chevron_right</span>
            </button>
          </div>
        </section>

        <div class="footer-end">
          <div class="brand">Pulse</div>
          <div class="end-text">没有更多搜索结果了</div>
        </div>
      </template>
    </main>
  </div>
</template>

<style scoped>
.search-page {
  min-height: 100vh;
  background: var(--pulse-page-bg, var(--pulse-bg));
  color: var(--pulse-text);
}

.top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px 0;
  padding-top: var(--pulse-header-pad-top);
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  border: none;
  background: transparent;
  color: var(--pulse-text-secondary);
  font-size: 15px;
  cursor: pointer;
  padding: 6px 0;
}

.back-link .material-symbols-outlined {
  font-size: 20px;
}

.search-bar-wrap {
  padding: 10px 16px 8px;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 14px;
  border-radius: 14px;
  background: var(--pulse-surface-high);
  border: 1px solid var(--pulse-border, transparent);
}

.search-ico {
  font-size: 22px;
  color: var(--pulse-text-secondary);
}

.search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--pulse-text);
  font-size: 15px;
}

.clear-btn {
  border: none;
  background: transparent;
  color: var(--pulse-text-secondary);
  display: grid;
  place-items: center;
  padding: 0;
  cursor: pointer;
}

.clear-btn .material-symbols-outlined {
  font-size: 18px;
}

.main {
  padding: 8px 16px 40px;
}

.hint {
  text-align: center;
  padding: 48px 16px;
  color: var(--pulse-text-secondary);
  font-size: 14px;
}

.section {
  margin-bottom: 22px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  padding: 0 2px;
}

.section-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--pulse-text-secondary);
  letter-spacing: 0.02em;
}

.view-all {
  border: none;
  background: transparent;
  color: var(--pulse-primary);
  font-size: 13px;
  cursor: pointer;
  padding: 0;
}

.card {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  margin-bottom: 10px;
  border: none;
  border-radius: 14px;
  background: var(--pulse-surface-container);
  border: 1px solid var(--pulse-border, transparent);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.card:active {
  background: var(--pulse-surface-low);
}

.avatar-wrap {
  position: relative;
  flex-shrink: 0;
}

.avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--pulse-surface-highest);
  display: block;
}

.avatar.initials {
  display: grid;
  place-items: center;
  font-weight: 700;
  color: var(--pulse-primary);
}

.online-dot {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  z-index: 1;
  background: #3dd68c;
  border: 2px solid var(--pulse-surface-container);
}

.group-avatar {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  object-fit: cover;
  background: var(--pulse-primary);
  flex-shrink: 0;
  display: grid;
  place-items: center;
  color: #fff;
}

.group-avatar.placeholder .material-symbols-outlined {
  font-size: 24px;
}

.meta {
  flex: 1;
  min-width: 0;
}

.name {
  font-size: 15px;
  font-weight: 650;
  color: var(--pulse-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sub {
  margin-top: 3px;
  font-size: 12px;
  color: var(--pulse-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chevron {
  color: var(--pulse-outline);
  font-size: 22px;
  flex-shrink: 0;
}

.history-card {
  border-radius: 14px;
  background: var(--pulse-surface-container);
  border: 1px solid var(--pulse-border, transparent);
  overflow: hidden;
}

.conv-hit {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.conv-hit.border {
  border-bottom: 1px solid var(--pulse-divider, rgba(255, 255, 255, 0.06));
}

.conv-hit:active {
  background: var(--pulse-pressed, rgba(255, 255, 255, 0.03));
}

.conv-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--pulse-surface-highest);
  flex-shrink: 0;
  display: grid;
  place-items: center;
  font-weight: 700;
  color: var(--pulse-primary);
}

.conv-avatar.group {
  border-radius: 12px;
}

.conv-meta {
  flex: 1;
  min-width: 0;
}

.conv-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.conv-name {
  font-size: 15px;
  font-weight: 650;
  color: var(--pulse-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conv-time {
  font-size: 11px;
  color: var(--pulse-text-secondary);
  flex-shrink: 0;
}

.conv-count {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--pulse-text-secondary);
}

.conv-preview {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--pulse-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.footer-end {
  padding: 28px 0 12px;
  text-align: center;
}

.brand {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: var(--pulse-outline);
}

.end-text {
  margin-top: 6px;
  font-size: 12px;
  color: var(--pulse-outline);
}

:deep(mark) {
  background: transparent;
  color: var(--pulse-primary);
  font-weight: 700;
  padding: 0;
}
</style>

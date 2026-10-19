<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast, showLoadingToast, closeToast } from 'vant'
import { fetchContacts, type ContactItem } from '@/api/contact'
import { createGroupConversation } from '@/api/conversation'
import { useUserStore } from '@/stores/user'
import { smartBack } from '@/utils/navBack'
import UserAvatar from '@/components/UserAvatar.vue'

const router = useRouter()
const userStore = useUserStore()

const contacts = ref<ContactItem[]>([])
const loading = ref(true)
const selected = ref<Set<string>>(new Set())
const groupName = ref('')
const keyword = ref('')
const submitting = ref(false)

const selectedCount = computed(() => selected.value.size)

function displayName(c: ContactItem) {
  return c.displayName?.trim() || c.remark?.trim() || c.nickname || '用户'
}

const filteredContacts = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  const available = contacts.value.filter((c) => !c.fileTransferAssistant)
  if (!kw) return available
  return available.filter((c) => {
    const name = displayName(c).toLowerCase()
    const nick = (c.nickname || '').toLowerCase()
    const pulseId = (c.pulseId || '').toLowerCase()
    return name.includes(kw) || nick.includes(kw) || pulseId.includes(kw)
  })
})

const defaultTitle = computed(() => {
  const names = contacts.value
    .filter((c) => selected.value.has(c.userId))
    .map((c) => displayName(c))
    .slice(0, 3)
  if (names.length === 0) return ''
  const me = userStore.nickname || '我'
  return `${me}、${names.join('、')}${selected.value.size > 3 ? '…' : ''}`
})

onMounted(async () => {
  window.addEventListener('pulse:native-back', onNativeBack)
  try {
    contacts.value = await fetchContacts()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '联系人加载失败')
  } finally {
    loading.value = false
  }
})

onUnmounted(() => {
  window.removeEventListener('pulse:native-back', onNativeBack)
})

function goBack() {
  if (selected.value.size) {
    selected.value = new Set()
    return
  }
  smartBack(router)
}

function onNativeBack(event: Event) {
  if (!selected.value.size) return
  selected.value = new Set()
  event.preventDefault()
}

function toggle(userId: string) {
  const next = new Set(selected.value)
  if (next.has(userId)) next.delete(userId)
  else next.add(userId)
  selected.value = next
}

function isSelected(userId: string) {
  return selected.value.has(userId)
}

async function submit() {
  if (selectedCount.value < 1) {
    showToast('请至少选择一位好友')
    return
  }
  const title = (groupName.value.trim() || defaultTitle.value || '新建群聊').slice(0, 32)
  submitting.value = true
  showLoadingToast({ message: '创建中...', forbidClick: true })
  try {
    const conv = await createGroupConversation(title, [...selected.value])
    closeToast()
    router.replace({
      path: `/chat/${conv.id}`,
      query: {
        title: conv.name,
        avatar: conv.avatar || '',
        online: 'false',
        type: 'group',
      },
    })
  } catch (e) {
    closeToast()
    showToast(e instanceof Error ? e.message : '创建失败')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="create-group-page">
    <header class="page-header glass-header">
      <button type="button" class="icon-btn" @click="goBack">
        <span class="material-symbols-outlined">arrow_back</span>
      </button>
      <h1 class="page-title">发起群聊</h1>
      <button
        type="button"
        class="done-btn"
        :disabled="selectedCount < 1 || submitting"
        @click="submit"
      >
        完成({{ selectedCount }})
      </button>
    </header>

    <div class="name-row">
      <input
        v-model="groupName"
        class="name-input"
        type="text"
        maxlength="32"
        :placeholder="defaultTitle || '群名称（可选）'"
      />
    </div>

    <div class="search-row">
      <span class="material-symbols-outlined search-icon">search</span>
      <input
        v-model="keyword"
        type="text"
        enterkeyhint="search"
        placeholder="搜索好友"
        autocomplete="off"
      />
      <button
        v-if="keyword"
        type="button"
        class="search-clear-btn"
        aria-label="清除搜索"
        @click="keyword = ''"
      >
        <span class="material-symbols-outlined">cancel</span>
      </button>
    </div>

    <div v-if="loading" class="loading-state">加载联系人...</div>
    <div v-else class="contact-list">
      <p class="hint">选择好友加入群聊</p>
      <button
        v-for="c in filteredContacts"
        :key="c.userId"
        type="button"
        class="contact-row"
        @click="toggle(c.userId)"
      >
        <span class="check" :class="{ on: isSelected(c.userId) }">
          <span v-if="isSelected(c.userId)" class="material-symbols-outlined">check</span>
        </span>
        <div class="avatar">
          <UserAvatar
            :src="c.avatarUrl"
            :user-id="c.userId"
            :name="displayName(c)"
            :size="44"
          />
        </div>
        <div class="name-block">
          <span class="name">{{ displayName(c) }}</span>
          <span v-if="c.remark?.trim()" class="sub">昵称：{{ c.nickname }}</span>
        </div>
      </button>
      <div v-if="contacts.length === 0" class="empty">暂无好友，请先添加好友</div>
      <div v-else-if="filteredContacts.length === 0" class="empty">未找到相关好友</div>
    </div>
  </div>
</template>

<style scoped>
.create-group-page {
  min-height: 100%;
  background: var(--pulse-page-bg, var(--pulse-bg));
  color: var(--pulse-text);
  padding-bottom: 40px;
}

.page-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 56px;
  padding: 0 12px;
  padding-top: var(--pulse-header-pad-top);
  background: rgba(18, 19, 23, 0.88);
  backdrop-filter: blur(16px);
}

.icon-btn {
  border: none;
  background: transparent;
  color: var(--pulse-primary);
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.page-title {
  flex: 1;
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.done-btn {
  border: none;
  border-radius: 999px;
  padding: 8px 14px;
  background: var(--pulse-primary-container);
  color: var(--pulse-on-primary-container);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.done-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.name-row {
  padding: 12px 16px 0;
}

.name-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid rgba(65, 71, 85, 0.35);
  border-radius: 12px;
  background: var(--pulse-surface-high);
  color: var(--pulse-text);
  padding: 12px 14px;
  font-size: 15px;
  outline: none;
}

.search-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 16px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--pulse-surface-high);
  border: 1px solid rgba(65, 71, 85, 0.35);
}

.search-icon {
  font-size: 20px;
  color: var(--pulse-outline);
}

.search-row input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: var(--pulse-text);
  font-size: 15px;
}

.search-row input::placeholder {
  color: var(--pulse-outline);
}

.hint {
  margin: 0 16px 8px;
  font-size: 13px;
  color: var(--pulse-text-secondary);
}

.contact-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.contact-row:active {
  background: var(--pulse-surface-low);
}

.check {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1.5px solid var(--pulse-outline);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.check.on {
  border-color: var(--pulse-primary-container);
  background: var(--pulse-primary-container);
  color: var(--pulse-on-primary-container);
}

.check .material-symbols-outlined {
  font-size: 16px;
  font-variation-settings: 'FILL' 1;
}

.avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--pulse-surface-highest);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--pulse-primary);
  font-weight: 700;
  flex-shrink: 0;
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.name-block {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.name {
  font-size: 16px;
  font-weight: 500;
}

.sub {
  font-size: 12px;
  color: var(--pulse-outline);
}

.loading-state,
.empty {
  text-align: center;
  padding: 48px 16px;
  color: var(--pulse-text-secondary);
  font-size: 14px;
}
</style>

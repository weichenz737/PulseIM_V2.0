<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { smartBack } from '@/utils/navBack'
import { showConfirmDialog, showToast } from 'vant'
import {
  fetchConversations,
  fetchGroupDetail,
  updateConversationSettings,
  fetchBurnSetting,
  updateBurnSetting,
  fetchAutoDeleteSetting,
  updateAutoDeleteSetting,
  setConversationArchived,
  deletePrivateConversation,
  clearGroupHistory,
  type ConversationItem,
} from '@/api/conversation'

defineOptions({ name: 'ChatSettingsView' })

const route = useRoute()
const router = useRouter()
const conversationId = computed(() => route.params.id as string)
const title = computed(() => (route.query.title as string) || '聊天设置')
const queryPeerUserId = computed(() => (route.query.peerUserId as string) || '')
const queryAvatar = computed(() => (route.query.avatar as string) || '')

const loading = ref(true)
const item = ref<ConversationItem | null>(null)
const pinned = ref(false)
const muted = ref(false)
const burnEnabled = ref(false)
const burnSeconds = ref(10)
const savedBurnSeconds = ref(10)
const burnSaving = ref(false)
const showDeleteSheet = ref(false)
const autoDeleteEnabled = ref(false)
const autoDeleteSeconds = ref(86400)
const autoDeleteSaving = ref(false)
const showAutoDeleteSheet = ref(false)
const groupOwner = ref(false)

const autoDeleteOptions = [
  { name: '1天', seconds: 86400 },
  { name: '7天', seconds: 604800 },
  { name: '一个月', seconds: 2592000 },
  { name: '自定义（更多时间选项）', seconds: 0 },
]
const moreAutoDeleteOptions = [
  { name: '3天', seconds: 259200 }, { name: '14天', seconds: 1209600 },
  { name: '3个月', seconds: 7776000 }, { name: '6个月', seconds: 15552000 },
  { name: '一年', seconds: 31536000 },
]
const showMoreAutoDeleteSheet = ref(false)

function notifyConversationChanged(patch: Record<string, unknown>) {
  window.dispatchEvent(new CustomEvent('pulse:conversation-settings-updated', {
    detail: { id: conversationId.value, ...patch },
  }))
}
const autoDeleteLabel = computed(() => {
  const hit = [...autoDeleteOptions, ...moreAutoDeleteOptions].find(x => x.seconds === autoDeleteSeconds.value)
  return hit?.name || `${Math.round(autoDeleteSeconds.value / 86400)}天`
})

const burnTimeLabel = computed(() => {
  const seconds = burnSeconds.value
  if (seconds <= 0) return '阅读后立即销毁'
  if (seconds < 60) return `阅读后${seconds}秒`
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return remainder ? `阅读后${minutes}分${remainder}秒` : `阅读后${minutes}分钟`
})

const displayName = computed(() => item.value?.name || title.value)
const displayAvatar = computed(() => item.value?.avatar || queryAvatar.value || '')
const peerUserId = computed(() => item.value?.peerUserId || queryPeerUserId.value || '')
const isGroup = computed(() => item.value?.type === 'group' || route.query.type === 'group')
const isFileTransferAssistant = computed(() =>
  !isGroup.value && (
    route.query.fileTransferAssistant === '1' ||
    !!item.value?.fileTransferAssistant ||
    displayName.value === '文件传输助手'
  ),
)

onMounted(async () => {
  try {
    const [all, archived] = await Promise.all([
      fetchConversations('all'),
      fetchConversations('archive'),
    ])
    const found = [...all, ...archived].find((c) => c.id === conversationId.value)
    if (found) {
      item.value = found
      pinned.value = !!found.pinned
      muted.value = !!found.mute
    } else {
      pinned.value = route.query.pinned === 'true'
      muted.value = route.query.mute === 'true'
    }
    if (!isGroup.value && !isFileTransferAssistant.value) {
      try {
        const setting = await fetchBurnSetting(conversationId.value)
        burnEnabled.value = !!setting.enabled
        burnSeconds.value = Math.min(300, Math.max(0, Number(setting.ttlSeconds) || 0))
        savedBurnSeconds.value = burnSeconds.value
      } catch {
        // Keep the safe default when an older server has no setting yet.
      }
      try {
        const setting = await fetchAutoDeleteSetting(conversationId.value)
        autoDeleteEnabled.value = !!setting.enabled
        autoDeleteSeconds.value = Number(setting.ttlSeconds) || 86400
      } catch { /* older server */ }
    } else if (isGroup.value) {
      try {
        const detail = await fetchGroupDetail(conversationId.value)
        groupOwner.value = !!detail.owner
      } catch {
        // If group role lookup fails, keep the safe member behavior: self only.
        groupOwner.value = false
      }
    }
  } catch {
    pinned.value = route.query.pinned === 'true'
    muted.value = route.query.mute === 'true'
  } finally {
    loading.value = false
  }
})

function goBack() {
  smartBack(router)
}

function openPeerProfile() {
  if (isGroup.value) {
    showToast('请从群聊进入群资料')
    return
  }
  if (!peerUserId.value) {
    showToast('无法打开资料')
    return
  }
  router.push(`/contacts/${peerUserId.value}`)
}

function initials(name: string) {
  return (name || '?').slice(0, 1)
}

function openSearchHistory() {
  router.push({
    path: `/chat/${conversationId.value}/search`,
    query: {
      title: displayName.value,
      type: item.value?.type || (route.query.type as string) || 'personal',
      peerUserId: peerUserId.value,
      avatar: displayAvatar.value,
    },
  })
}

async function onPinnedChange() {
  try {
    await updateConversationSettings(conversationId.value, { pinned: pinned.value })
    notifyConversationChanged({ pinned: pinned.value })
    showToast(pinned.value ? '已置顶' : '已取消置顶')
  } catch (e) {
    pinned.value = !pinned.value
    showToast(e instanceof Error ? e.message : '设置失败')
  }
}

async function onMuteChange() {
  try {
    await updateConversationSettings(conversationId.value, { mute: muted.value })
    notifyConversationChanged({ mute: muted.value })
    showToast(muted.value ? '已开启免打扰' : '已关闭免打扰')
  } catch (e) {
    muted.value = !muted.value
    showToast(e instanceof Error ? e.message : '设置失败')
  }
}

function openImportantMessageSettings() {
  if (!isGroup.value) return
  router.push(`/chat/${conversationId.value}/important-messages`)
}

async function onArchive() {
  try {
    await showConfirmDialog({
      title: '确认归档聊天？',
      message: '归档后，该聊天会移至消息首页的“归档”列表中。',
      confirmButtonText: '确认归档',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }

  try {
    await setConversationArchived(conversationId.value, true)
    notifyConversationChanged({ archived: true })
    showToast('已归档')
    router.replace('/app/messages')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '归档失败')
  }
}

function onRemove() {
  if (isFileTransferAssistant.value) {
    void deleteFileTransferAssistant()
    return
  }
  if (isGroup.value && !groupOwner.value) {
    void onDeleteScopeSelect({ name: '单向清除' })
    return
  }
  showDeleteSheet.value = true
}

async function deleteFileTransferAssistant() {
  try {
    await showConfirmDialog({
      title: '确认删除聊天？',
      message: '文件传输助手的聊天记录将从你的账号中删除。',
      confirmButtonText: '确认删除',
      confirmButtonColor: '#ee0a24',
      cancelButtonText: '取消',
    })
    await deletePrivateConversation(conversationId.value, 'self')
    notifyConversationChanged({ removed: true })
    showToast('已删除聊天')
    router.replace('/app/messages')
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e || '')
    if (/cancel/i.test(message)) return
    showToast(message || '删除失败')
  }
}

async function saveBurnSetting(nextEnabled: boolean, nextSeconds: number, previousSeconds: number) {
  if (burnSaving.value) return
  burnSaving.value = true
  try {
    await updateBurnSetting(conversationId.value, {
      enabled: nextEnabled,
      ttlSeconds: nextSeconds,
    })
    burnEnabled.value = nextEnabled
    burnSeconds.value = nextSeconds
    savedBurnSeconds.value = nextSeconds
    window.dispatchEvent(new CustomEvent('pulse:burn-setting-updated', {
      detail: {
        conversationId: conversationId.value,
        enabled: nextEnabled,
        burnSeconds: nextSeconds,
      },
    }))
    showToast(nextEnabled ? `已开启，${burnTimeLabel.value}` : '已关闭阅后即焚')
  } catch (e) {
    burnSeconds.value = previousSeconds
    showToast(e instanceof Error ? e.message : '阅后即焚设置失败')
  } finally {
    burnSaving.value = false
  }
}

function onBurnToggleClick() {
  if (!burnEnabled.value) {
    void saveBurnSetting(true, burnSeconds.value, savedBurnSeconds.value)
    return
  }
  void saveBurnSetting(false, burnSeconds.value, savedBurnSeconds.value)
}

function onBurnTimeInput(event: Event) {
  burnSeconds.value = Number((event.target as HTMLInputElement).value)
}

function onBurnTimeChange(event: Event) {
  const previousSeconds = savedBurnSeconds.value
  const nextSeconds = Number((event.target as HTMLInputElement).value)
  burnSeconds.value = nextSeconds
  if (burnEnabled.value) {
    void saveBurnSetting(true, nextSeconds, previousSeconds)
  }
}

async function saveAutoDelete(enabled: boolean, seconds = autoDeleteSeconds.value) {
  if (autoDeleteSaving.value) return
  const oldEnabled = autoDeleteEnabled.value
  const oldSeconds = autoDeleteSeconds.value
  autoDeleteEnabled.value = enabled
  autoDeleteSeconds.value = seconds
  autoDeleteSaving.value = true
  try {
    await updateAutoDeleteSetting(conversationId.value, { enabled, ttlSeconds: seconds })
    window.dispatchEvent(new CustomEvent('pulse:auto-delete-setting-updated', {
      detail: { conversationId: conversationId.value },
    }))
    showToast(enabled ? `已开启自动删除记录，双方发送的新消息，都会在${autoDeleteLabel.value}后从双方的聊天记录中删除` : '已关闭自动删除记录')
  } catch (e) {
    autoDeleteEnabled.value = oldEnabled; autoDeleteSeconds.value = oldSeconds
    showToast(e instanceof Error ? e.message : '自动删除设置失败')
  } finally { autoDeleteSaving.value = false }
}

function chooseAutoDelete(action: { name?: string; seconds?: number }) {
  showAutoDeleteSheet.value = false
  if (!action.seconds) { showMoreAutoDeleteSheet.value = true; return }
  void saveAutoDelete(true, action.seconds)
}

function chooseMoreAutoDelete(action: { seconds?: number }) {
  showMoreAutoDeleteSheet.value = false
  if (action.seconds) void saveAutoDelete(true, action.seconds)
}

function onAutoDeleteToggle() {
  if (autoDeleteEnabled.value) void saveAutoDelete(false)
  else showAutoDeleteSheet.value = true
}

async function onDeleteScopeSelect(action: { name?: string }) {
  showDeleteSheet.value = false
  const both = action.name === '双向删除' || action.name === '双向清除'
  const scope = both ? 'both' : 'self'
  try {
    await showConfirmDialog({
      title: scope === 'both' ? (isGroup.value ? '确认双向清除？' : '确认双向删除？') : (isGroup.value ? '确认清除聊天记录？' : '确认单向删除？'),
      message:
        scope === 'both'
          ? (isGroup.value ? '所有群成员当前可见的聊天记录都将被清除，此操作无法撤销。' : '双方的聊天记录都将被删除，此操作无法撤销。')
          : (isGroup.value ? '聊天记录将仅从你的账号中清除，其他成员仍可查看。' : '聊天记录将仅从你的账号中删除，此操作无法撤销。'),
      confirmButtonText: isGroup.value ? '确认清除' : '确认删除',
      confirmButtonColor: '#ee0a24',
    })
    if (isGroup.value) await clearGroupHistory(conversationId.value, scope)
    else await deletePrivateConversation(conversationId.value, scope)
    notifyConversationChanged({ removed: true })
    showToast(isGroup.value
      ? (scope === 'both' ? '已双向清除群聊记录' : '已单向清除群聊记录')
      : (scope === 'both' ? '已双向删除聊天' : '已单向删除聊天'))
    router.replace('/app/messages')
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e || '')
    if (/cancel/i.test(message)) return
    showToast(message || '删除失败')
  }
}
</script>

<template>
  <div class="settings-page">
    <header class="page-header">
      <button type="button" class="icon-btn" @click="goBack">
        <span class="material-symbols-outlined">arrow_back_ios</span>
      </button>
      <h1 class="page-title">聊天设置</h1>
      <span class="spacer" />
    </header>

    <div v-if="loading" class="loading-state">加载中...</div>

    <template v-else>
      <section v-if="!isFileTransferAssistant" class="card hero">
        <button type="button" class="hero-user" @click="openPeerProfile">
          <img
            v-if="displayAvatar"
            :src="displayAvatar"
            :alt="displayName"
            class="hero-avatar"
          />
          <div v-else class="hero-avatar initials">{{ initials(displayName) }}</div>
          <div class="hero-text">
            <div class="hero-name">{{ displayName }}</div>
            <div class="hero-sub">{{ isGroup ? '群聊' : '查看好友资料' }}</div>
          </div>
          <span v-if="!isGroup" class="material-symbols-outlined hero-chevron">chevron_right</span>
        </button>
      </section>

      <section class="card">
        <button type="button" class="menu-row" @click="openSearchHistory">
          <span class="menu-label">查找聊天记录</span>
          <span class="material-symbols-outlined chevron">chevron_right</span>
        </button>
        <div class="menu-row">
          <span class="menu-label">置顶聊天</span>
          <label class="switch">
            <input v-model="pinned" type="checkbox" @change="onPinnedChange" />
            <span class="slider" />
          </label>
        </div>
        <div v-if="!isFileTransferAssistant" class="menu-row">
          <span class="menu-label">消息免打扰</span>
          <label class="switch">
            <input v-model="muted" type="checkbox" @change="onMuteChange" />
            <span class="slider" />
          </label>
        </div>
        <button v-if="isGroup" type="button" class="menu-row" @click="openImportantMessageSettings">
          <span class="menu-label">重要消息仍然通知</span>
          <span class="material-symbols-outlined chevron">chevron_right</span>
        </button>
      </section>

      <section v-if="!isGroup && !isFileTransferAssistant" class="card burn-card">
        <div class="menu-row burn-switch-row">
          <div class="burn-heading">
            <span class="menu-label">阅后即焚</span>
            <span class="burn-current">{{ burnEnabled ? burnTimeLabel : '已关闭' }}</span>
          </div>
          <label class="switch">
            <input
              :checked="burnEnabled"
              type="checkbox"
              :disabled="burnSaving"
              @click.prevent.stop="onBurnToggleClick"
            />
            <span class="slider" />
          </label>
        </div>
        <div class="burn-time" :class="{ disabled: !burnEnabled }">
          <input
            class="burn-range"
            type="range"
            min="0"
            max="300"
            step="1"
            :value="burnSeconds"
            :disabled="!burnEnabled || burnSaving"
            :style="{ '--burn-progress': `${(burnSeconds / 300) * 100}%` }"
            aria-label="阅后即焚时间"
            @input="onBurnTimeInput"
            @change="onBurnTimeChange"
          />
          <div class="burn-labels">
            <span>立即销毁</span>
            <span>5分钟</span>
          </div>
        </div>
      </section>

      <section v-if="!isGroup && !isFileTransferAssistant" class="card">
        <div class="menu-row">
          <div class="burn-heading">
            <span class="menu-label">自动删除记录</span>
            <span class="burn-current">{{ autoDeleteEnabled ? autoDeleteLabel : '已关闭' }}</span>
          </div>
          <button
            type="button"
            class="switch switch-button"
            :class="{ active: autoDeleteEnabled }"
            :aria-pressed="autoDeleteEnabled"
            :disabled="autoDeleteSaving"
            @click.stop="onAutoDeleteToggle"
          >
            <span class="slider" />
          </button>
        </div>
        <button v-if="autoDeleteEnabled" type="button" class="menu-row" :disabled="autoDeleteSaving" @click="showAutoDeleteSheet = true">
          <span class="menu-label">删除时间</span>
          <span class="menu-value">{{ autoDeleteLabel }}</span>
          <span class="material-symbols-outlined chevron">chevron_right</span>
        </button>
      </section>

      <section v-if="!isFileTransferAssistant" class="card">
        <button type="button" class="menu-row" @click="onArchive">
          <span class="menu-label">归档聊天</span>
          <span class="material-symbols-outlined chevron">chevron_right</span>
        </button>
        <button type="button" class="menu-row danger" @click="onRemove">
          <span class="menu-label">删除聊天</span>
        </button>
      </section>

      <section v-else class="card">
        <button type="button" class="menu-row danger" @click="onRemove">
          <span class="menu-label">删除聊天</span>
        </button>
      </section>
    </template>
    <van-action-sheet
      v-if="!isFileTransferAssistant"
      v-model:show="showDeleteSheet"
      :title="isGroup ? '清除聊天记录' : '删除聊天'"
      :actions="isGroup
        ? [
          { name: '单向清除', subname: '仅从我的账号清除群聊记录' },
          { name: '双向清除', subname: '同时清除所有成员可见记录', color: '#ee0a24' },
        ]
        : [
          { name: '单向删除', subname: '仅从我的账号删除聊天记录' },
          { name: '双向删除', subname: '同时删除我和对方的聊天记录', color: '#ee0a24' },
        ]"
      cancel-text="取消"
      close-on-click-action
      @select="onDeleteScopeSelect"
    />
    <van-action-sheet v-if="!isFileTransferAssistant" v-model:show="showAutoDeleteSheet" title="自动删除时间"
      :actions="autoDeleteOptions" cancel-text="取消" @select="chooseAutoDelete" />
    <van-action-sheet v-if="!isFileTransferAssistant" v-model:show="showMoreAutoDeleteSheet" title="更多时间选项"
      :actions="moreAutoDeleteOptions" cancel-text="取消" @select="chooseMoreAutoDelete" />
  </div>
</template>

<style scoped>
.settings-page {
  min-height: 100%;
  background: var(--pulse-page-bg, var(--pulse-bg));
  color: var(--pulse-text);
  padding-bottom: 48px;
}

.page-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  height: 56px;
  padding: 0 12px;
  padding-top: var(--pulse-header-pad-top);
  background: var(--pulse-page-bg, var(--pulse-bg));
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
  text-align: center;
  font-size: 18px;
  font-weight: 600;
  color: var(--pulse-primary);
}

.spacer {
  width: 40px;
}

.card {
  margin: 16px;
  background: var(--pulse-surface-container);
  border-radius: 12px;
  overflow: hidden;
}

.hero {
  padding: 0;
}

.hero-user {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.hero-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  background: var(--pulse-surface-highest);
}

.hero-avatar.initials {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 700;
  color: var(--pulse-primary);
}

.hero-text {
  flex: 1;
  min-width: 0;
}

.hero-name {
  font-size: 18px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hero-sub {
  margin-top: 4px;
  font-size: 13px;
  color: var(--pulse-text-secondary);
}

.hero-chevron {
  color: var(--pulse-outline);
  font-size: 22px;
  flex-shrink: 0;
}

.menu-row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.menu-row:last-child {
  border-bottom: none;
}

.menu-row.danger .menu-label {
  color: var(--pulse-error);
}

.menu-label {
  font-size: 15px;
}

.burn-switch-row {
  cursor: default;
}

.burn-heading {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.burn-current {
  color: var(--pulse-text-secondary);
  font-size: 12px;
}

.burn-time {
  padding: 14px 16px 18px;
  transition: opacity 0.2s;
}

.burn-time.disabled {
  opacity: 0.45;
}

.burn-range {
  --burn-track: rgba(255, 255, 255, 0.2);
  --burn-fill: #2aa3f0;
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 28px;
  margin: 0;
  background:
    radial-gradient(circle, var(--burn-fill) 0 3px, transparent 3.2px) left center / 6px 6px no-repeat,
    linear-gradient(var(--burn-fill), var(--burn-fill)) 3px center / 9px 6px no-repeat,
    radial-gradient(circle, var(--burn-track) 0 3px, transparent 3.2px) right center / 6px 6px no-repeat,
    linear-gradient(
      90deg,
      var(--burn-fill) 0%,
      var(--burn-fill) var(--burn-progress, 0%),
      transparent var(--burn-progress, 0%),
      transparent 100%
    ) center / calc(100% - 18px) 6px no-repeat,
    linear-gradient(var(--burn-track), var(--burn-track)) center / calc(100% - 6px) 6px no-repeat;
  accent-color: #087ed7;
  cursor: pointer;
}

:global(:root[data-theme='light']) .burn-range {
  --burn-track: #cbd5df;
}

.burn-range:focus {
  outline: none;
}

.burn-range::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 999px;
  background: transparent;
  border: 1px solid transparent;
}

:global(:root[data-theme='light']) .burn-range::-webkit-slider-runnable-track {
  background: transparent;
  border-color: transparent;
}

.burn-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  margin-top: -7px;
  border-radius: 50%;
  background: #087ed7;
  border: 2px solid #ffffff;
  box-shadow: 0 2px 8px rgba(8, 126, 215, 0.35);
}

.burn-range::-moz-range-track {
  height: 6px;
  border-radius: 999px;
  background: var(--burn-track);
  border: 1px solid var(--burn-track);
}

:global(:root[data-theme='light']) .burn-range::-moz-range-track {
  background: #cbd5df;
  border-color: #cbd5df;
}

.burn-range::-moz-range-progress {
  height: 6px;
  border-radius: 999px;
  background: linear-gradient(90deg, #087ed7, #2aa3f0);
}

.burn-range::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #087ed7;
  border: 2px solid #ffffff;
  box-shadow: 0 2px 8px rgba(8, 126, 215, 0.35);
}

.burn-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 2px;
  color: var(--pulse-text-secondary);
  font-size: 10px;
  text-align: center;
}

.burn-labels span:first-child {
  text-align: left;
}

.burn-labels span:last-child {
  text-align: right;
}

.chevron {
  color: var(--pulse-outline);
  font-size: 20px;
}

.switch {
  position: relative;
  width: 46px;
  height: 26px;
  flex-shrink: 0;
}

.switch-button {
  padding: 0;
  border: 0;
  background: transparent;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: var(--pulse-outline-variant, #c8d5e3);
  transition: 0.2s;
  cursor: pointer;
}

.slider::before {
  content: '';
  position: absolute;
  width: 20px;
  height: 20px;
  left: 3px;
  top: 3px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  transition: 0.2s;
}

.switch input:checked + .slider {
  background: var(--pulse-primary-container);
}

.switch.active .slider {
  background: var(--pulse-primary-container);
}

.switch input:checked + .slider::before {
  transform: translateX(20px);
}

.switch.active .slider::before {
  transform: translateX(20px);
}

.loading-state {
  text-align: center;
  padding: 48px 16px;
  color: var(--pulse-text-secondary);
}
</style>

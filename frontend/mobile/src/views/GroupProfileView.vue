<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { smartBack } from '@/utils/navBack'
import { showToast, showLoadingToast, closeToast } from 'vant'
import { fetchGroupPreview, formatGroupPulseId, joinGroup, type GroupPreview } from '@/api/conversation'

const route = useRoute()
const router = useRouter()
const conversationId = computed(() => route.params.id as string)

const loading = ref(true)
const joining = ref(false)
const preview = ref<GroupPreview | null>(null)
const showVerifyDialog = ref(false)
const verifyMessage = ref('')

onMounted(async () => {
  await reload()
})

async function reload() {
  loading.value = true
  try {
    preview.value = await fetchGroupPreview(conversationId.value)
  } catch (e) {
    preview.value = {
      id: conversationId.value,
      pulseId: formatGroupPulseId(conversationId.value),
      title: (route.query.title as string) || '群聊',
      avatarUrl: (route.query.avatar as string) || '',
      notice: '暂无群简介',
      memberCount: 0,
      joined: false,
      joinVerifyRequired: false,
      joinPending: false,
      ownerNickname: '',
    }
    showToast(e instanceof Error ? e.message : '加载失败')
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

function enterChat() {
  if (!preview.value) return
  router.replace({
    path: `/chat/${conversationId.value}`,
    query: {
      title: preview.value.title,
      type: 'group',
      avatar: preview.value.avatarUrl || '',
    },
  })
}

function openGroupManage() {
  router.push(`/group/${conversationId.value}`)
}

function onJoin() {
  if (joining.value || !preview.value) return
  if (preview.value.joinPending) {
    showToast('已提交申请，请等待审核')
    return
  }
  if (preview.value.joinVerifyRequired) {
    verifyMessage.value = ''
    showVerifyDialog.value = true
    return
  }
  void doJoin()
}

async function confirmVerifyJoin() {
  showVerifyDialog.value = false
  await doJoin(verifyMessage.value.trim())
}

async function doJoin(message?: string) {
  if (joining.value || !preview.value) return
  joining.value = true
  showLoadingToast({
    message: preview.value.joinVerifyRequired ? '提交中...' : '加入中...',
    forbidClick: true,
    duration: 0,
  })
  try {
    const source = (route.query.source as string) || 'card'
    const result = await joinGroup(conversationId.value, source, message || undefined)
    closeToast()
    if (result.pending) {
      showToast(result.message || '已提交加群申请，等待审核')
      if (preview.value) preview.value.joinPending = true
      return
    }
    const conv = result.conversation
    showToast('已加入群聊')
    router.replace({
      path: `/chat/${conv?.id || conversationId.value}`,
      query: {
        title: conv?.name || preview.value.title,
        type: 'group',
        avatar: conv?.avatar || preview.value.avatarUrl || '',
      },
    })
  } catch (e) {
    closeToast()
    showToast(e instanceof Error ? e.message : '加入失败')
  } finally {
    joining.value = false
  }
}
</script>

<template>
  <div class="group-profile-page">
    <header class="page-header">
      <button type="button" class="icon-btn" @click="goBack">
        <span class="material-symbols-outlined">arrow_back</span>
      </button>
      <h1 class="page-title">群简介</h1>
      <span class="spacer" />
    </header>

    <div v-if="loading" class="loading-state">加载中...</div>

    <main v-else-if="preview" class="main-content">
      <section class="hero">
        <div class="avatar">
          <img v-if="preview.avatarUrl" :src="preview.avatarUrl" :alt="preview.title" />
          <span v-else>{{ initials(preview.title) }}</span>
        </div>
        <h2 class="title">{{ preview.title }}</h2>
        <p class="meta">
          <span>{{ preview.memberCount }} 名成员</span>
          <span v-if="preview.ownerNickname" class="dot">·</span>
          <span v-if="preview.ownerNickname">群主 {{ preview.ownerNickname }}</span>
        </p>
        <p v-if="!preview.joined && preview.joinVerifyRequired" class="verify-tip">
          该群开启了加群审核
        </p>
      </section>

      <section class="card">
        <div class="card-label">群公告</div>
        <p class="card-text">{{ preview.notice || '暂无公告' }}</p>
      </section>

      <div class="actions">
        <button
          v-if="preview.joined"
          type="button"
          class="primary-btn"
          @click="enterChat"
        >
          进入群聊
        </button>
        <button
          v-else
          type="button"
          class="primary-btn"
          :disabled="joining || preview.joinPending"
          @click="onJoin"
        >
          {{ preview.joinPending ? '等待审核中' : preview.joinVerifyRequired ? '申请加群' : '加入群聊' }}
        </button>
        <button
          v-if="preview.joined"
          type="button"
          class="ghost-btn"
          @click="openGroupManage"
        >
          群聊设置
        </button>
      </div>
    </main>

    <div v-if="showVerifyDialog" class="dialog-mask" @click="showVerifyDialog = false">
      <div class="dialog" @click.stop>
        <h3>申请加群</h3>
        <p class="dialog-tip">该群开启了加群审核，可填写验证信息</p>
        <textarea
          v-model="verifyMessage"
          maxlength="64"
          rows="3"
          placeholder="验证信息（可选）"
        />
        <div class="dialog-actions">
          <button type="button" class="dialog-cancel" @click="showVerifyDialog = false">取消</button>
          <button type="button" class="dialog-ok" @click="confirmVerifyJoin">提交申请</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.group-profile-page {
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
  background: rgba(18, 19, 23, 0.88);
  backdrop-filter: blur(16px);
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

.loading-state {
  padding: 48px 16px;
  text-align: center;
  color: var(--pulse-outline);
}

.main-content {
  padding: 24px 16px 40px;
}

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  margin-bottom: 20px;
}

.avatar {
  width: 72px;
  height: 72px;
  border-radius: 18px;
  background: var(--pulse-surface-high);
  display: grid;
  place-items: center;
  overflow: hidden;
  font-size: 28px;
  font-weight: 700;
}

.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.title {
  margin: 14px 0 6px;
  font-size: 22px;
  font-weight: 700;
}

.meta {
  margin: 0;
  color: var(--pulse-outline);
  font-size: 13px;
}

.dot {
  margin: 0 4px;
}

.verify-tip {
  margin: 10px 0 0;
  font-size: 13px;
  color: #f0b429;
}

.card {
  background: var(--pulse-surface-container);
  border-radius: 14px;
  padding: 14px 16px;
  margin-bottom: 20px;
}

.card-label {
  font-size: 12px;
  color: var(--pulse-outline);
  margin-bottom: 8px;
}

.card-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--pulse-text);
  white-space: pre-wrap;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.primary-btn,
.ghost-btn {
  height: 44px;
  border-radius: 12px;
  border: none;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}

.primary-btn {
  background: #3b82f6;
  color: #fff;
}

.primary-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.ghost-btn {
  background: var(--pulse-surface-high);
  color: var(--pulse-text);
}

.dialog-mask {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(0, 0, 0, 0.55);
  display: grid;
  place-items: center;
  padding: 24px;
}

.dialog {
  width: 100%;
  max-width: 340px;
  background: var(--pulse-surface-container);
  border-radius: 16px;
  padding: 18px 16px 14px;
}

.dialog h3 {
  margin: 0 0 8px;
  font-size: 17px;
  text-align: center;
}

.dialog-tip {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--pulse-outline);
  text-align: center;
}

.dialog textarea {
  width: 100%;
  box-sizing: border-box;
  border: none;
  border-radius: 10px;
  background: var(--pulse-page-bg, var(--pulse-bg));
  color: var(--pulse-text);
  padding: 10px 12px;
  resize: none;
  font-size: 14px;
  outline: none;
}

.dialog-actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}

.dialog-cancel,
.dialog-ok {
  flex: 1;
  height: 40px;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.dialog-cancel {
  background: var(--pulse-surface-high);
  color: var(--pulse-text);
}

.dialog-ok {
  background: #3b82f6;
  color: #fff;
}
</style>

<script setup lang="ts">
defineOptions({ name: 'AddFriendView' })
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { searchUserByPhone, type UserSearchResult } from '@/api/contact'
import { useUserStore } from '@/stores/user'
import { smartBack } from '@/utils/navBack'
import { userQrPayload } from '@/utils/qrcode'
import QrPreviewModal from '@/components/QrPreviewModal.vue'
import UserAvatar from '@/components/UserAvatar.vue'

const router = useRouter()
const userStore = useUserStore()
const phone = ref('')
const searching = ref(false)
const result = ref<UserSearchResult | null>(null)
const qrPreviewVisible = ref(false)

const myId = computed(() => {
  if (userStore.pulseId && /^\d{7}$/.test(userStore.pulseId)) return userStore.pulseId
  if (userStore.userId) {
    const n = Number(userStore.userId)
    if (Number.isFinite(n) && n > 0) return String(1_000_000 + n).padStart(7, '0').slice(-7)
  }
  return '—'
})

const qrPayload = computed(() =>
  myId.value !== '—' ? userQrPayload(myId.value) : '',
)

async function handleSearch() {
  const p = phone.value.trim()
  if (!p) {
    showToast('请输入手机号或 ID')
    return
  }
  const isPulseId = /^\d{7}$/.test(p)
  const isPhone = /^1\d{10}$/.test(p)
  if (!isPulseId && !isPhone && p.length < 11) {
    showToast('请输入有效手机号或 7 位 ID')
    return
  }
  searching.value = true
  result.value = null
  try {
    result.value = await searchUserByPhone(p)
    if (!result.value) {
      showToast('未找到该用户，或对方关闭了搜索')
    }
  } catch (e) {
    showToast(e instanceof Error ? e.message : '搜索失败')
  } finally {
    searching.value = false
  }
}

function goBack() {
  smartBack(router)
}

function openProfile(userId: string) {
  const q = phone.value.trim()
  const source = /^\d{7}$/.test(q) ? 'pulse_id' : 'phone'
  router.push({ path: `/contacts/${userId}`, query: { source } })
}

async function copyMyId() {
  if (!myId.value || myId.value === '—') return
  try {
    await navigator.clipboard.writeText(myId.value)
    showToast('PulseID 已复制')
  } catch {
    showToast('当前环境不支持复制，请手动记录')
  }
}
</script>

<template>
  <div class="add-friend-page">
    <div class="bg-glow" />

    <header class="page-header glass-header">
      <div class="header-left">
        <button type="button" class="icon-btn" @click="goBack">
          <span class="material-symbols-outlined">arrow_back_ios</span>
        </button>
        <h1 class="page-title">添加好友</h1>
      </div>
    </header>

    <main class="page-main">
      <section class="search-section">
        <div class="search-wrap">
          <span class="material-symbols-outlined search-icon">search</span>
          <input
            v-model="phone"
            type="tel"
            maxlength="11"
            placeholder="手机号 / ID"
            class="search-input"
            @keyup.enter="handleSearch"
          />
          <button v-if="phone" type="button" class="search-clear-btn" aria-label="清除搜索" @click="phone = ''">
            <span class="material-symbols-outlined">cancel</span>
          </button>
        </div>
        <div class="my-id-row">
          <span class="my-id-label">我的 PulseID:</span>
          <span class="my-id-value">{{ myId }}</span>
          <button type="button" class="copy-btn" @click="copyMyId">
            <span class="material-symbols-outlined">content_copy</span>
          </button>
        </div>
        <button
          type="button"
          class="search-btn"
          :disabled="searching"
          @click="handleSearch"
        >
          {{ searching ? '搜索中...' : '搜索' }}
        </button>
      </section>

      <section class="qr-section">
        <div class="qr-card glass-card" @click="qrPreviewVisible = true">
          <div class="qr-glow" />
          <div class="qr-content">
            <div class="qr-icon-wrap">
              <span class="material-symbols-outlined filled">qr_code_2</span>
            </div>
            <div>
              <h2 class="qr-title">我的二维码</h2>
              <p class="qr-sub">展示二维码，让对方扫一扫</p>
            </div>
          </div>
          <span class="material-symbols-outlined qr-arrow">chevron_right</span>
        </div>
      </section>

      <section class="bento-grid">
        <div class="scan-card glass-card" @click="router.push('/scan')">
          <div class="scan-icon-wrap">
            <span class="material-symbols-outlined">center_focus_weak</span>
          </div>
          <div>
            <h3 class="scan-title">扫一扫</h3>
            <p class="scan-sub">扫描二维码名片</p>
          </div>
        </div>
      </section>

      <section class="info-section">
        <p class="info-text">
          你可以通过搜索对方手机号或扫描二维码来添加好友，确保对方也已开启相应的搜索权限。
        </p>
      </section>

      <div v-if="result" class="search-result glass-card" @click="openProfile(result.userId)">
        <UserAvatar
          :src="result.avatarUrl"
          :user-id="result.userId"
          :name="result.nickname"
          class="result-avatar"
        />
        <div class="result-info">
          <div class="result-name">{{ result.nickname }}</div>
          <div class="result-phone">{{ result.phone }}</div>
        </div>
        <span class="view-label">查看</span>
      </div>
    </main>

    <QrPreviewModal
      :show="qrPreviewVisible"
      :payload="qrPayload"
      :title="userStore.nickname || '我的二维码'"
      :filename="`pulse-${myId}.png`"
      @close="qrPreviewVisible = false"
    />
  </div>
</template>

<style scoped>
.add-friend-page {
  min-height: 100vh;
  background: var(--pulse-page-bg, var(--pulse-bg));
  position: relative;
  overflow-x: hidden;
}

.bg-glow {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  opacity: 0.2;
}

.bg-glow::before,
.bg-glow::after {
  content: '';
  position: absolute;
  width: 256px;
  height: 256px;
  border-radius: 50%;
  filter: blur(120px);
}

.bg-glow::before {
  top: 25%;
  left: 0;
  background: var(--pulse-primary);
}

.bg-glow::after {
  bottom: 25%;
  right: 0;
  background: var(--pulse-secondary);
}

.page-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  padding: 0 16px;
  padding-top: var(--pulse-header-pad-top);
  box-sizing: content-box;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.icon-btn {
  border: none;
  background: transparent;
  color: var(--pulse-text);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 8px;
  transition: transform 0.15s;
}

.icon-btn:active {
  transform: scale(0.95);
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 25px;
  color: var(--pulse-text);
}

.page-main {
  position: relative;
  z-index: 1;
  padding: 96px 16px 48px;
  max-width: 672px;
  margin: 0 auto;
}

.search-section {
  margin-bottom: 24px;
}

.search-wrap {
  position: relative;
}

.search-icon {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 22px;
  color: var(--pulse-outline);
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 16px 48px 16px 48px;
  border: none;
  border-radius: 12px;
  background: var(--pulse-surface-high);
  color: var(--pulse-text);
  font-size: 17px;
  outline: none;
  transition: box-shadow 0.3s;
}

.search-clear-btn {
  position: absolute;
  top: 50%;
  right: 12px;
  transform: translateY(-50%);
}

.search-input::placeholder {
  color: var(--pulse-outline);
}

.search-input:focus {
  box-shadow: 0 0 0 2px rgba(173, 198, 255, 0.5);
}

.my-id-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 16px;
}

.my-id-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--pulse-text-secondary);
}

.my-id-value {
  font-size: 13px;
  font-weight: 700;
  color: var(--pulse-primary);
}

.copy-btn {
  border: none;
  background: transparent;
  color: var(--pulse-primary);
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 0;
}

.copy-btn .material-symbols-outlined {
  font-size: 18px;
}

.search-btn {
  width: 100%;
  margin-top: 12px;
  padding: 14px;
  border: none;
  border-radius: 12px;
  background: var(--pulse-primary-container);
  color: var(--pulse-on-primary-container);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}

.search-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.qr-section {
  margin-bottom: 32px;
}

.qr-card {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px;
  border-radius: 12px;
  cursor: pointer;
  overflow: hidden;
  transition: transform 0.15s;
}

.qr-card:active {
  transform: scale(0.98);
}

.qr-glow {
  position: absolute;
  right: -32px;
  top: -32px;
  width: 128px;
  height: 128px;
  background: rgba(173, 198, 255, 0.1);
  border-radius: 50%;
  filter: blur(48px);
}

.qr-content {
  display: flex;
  align-items: center;
  gap: 16px;
  position: relative;
  z-index: 1;
}

.qr-icon-wrap {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(173, 198, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--pulse-primary);
}

.qr-icon-wrap .material-symbols-outlined {
  font-size: 28px;
}

.qr-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--pulse-text);
}

.qr-sub {
  margin: 4px 0 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--pulse-text-secondary);
}

.qr-arrow {
  font-size: 22px;
  color: var(--pulse-outline);
  position: relative;
  z-index: 1;
}

.bento-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-bottom: 32px;
}

.scan-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 24px;
  border-radius: 12px;
  text-align: center;
  aspect-ratio: 1;
  cursor: pointer;
  transition: transform 0.15s;
}

.scan-card:active {
  transform: scale(0.95);
}

.scan-icon-wrap {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: rgba(66, 227, 85, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--pulse-secondary);
  transition: background 0.2s;
}

.scan-card:active .scan-icon-wrap {
  background: rgba(66, 227, 85, 0.2);
}

.scan-icon-wrap .material-symbols-outlined {
  font-size: 28px;
}

.scan-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--pulse-text);
}

.scan-sub {
  margin: 4px 0 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--pulse-text-secondary);
}

.info-section {
  text-align: center;
}

.info-text {
  margin: 0;
  padding: 0 24px;
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
  color: var(--pulse-outline);
}

.search-result {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 24px;
  padding: 14px 16px;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.2s;
}

.search-result:active {
  background: rgba(52, 53, 57, 0.8);
}

.result-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--pulse-surface-highest);
  flex-shrink: 0;
}

.result-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.result-avatar.initials {
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  color: var(--pulse-text);
}

.result-info {
  flex: 1;
  min-width: 0;
}

.result-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--pulse-text);
}

.result-phone {
  font-size: 13px;
  color: var(--pulse-text-secondary);
  margin-top: 2px;
}

.view-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--pulse-primary);
  flex-shrink: 0;
}
</style>

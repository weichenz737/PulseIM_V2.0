<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import RegisterProgress from '@/components/RegisterProgress.vue'
import IconPhone from '@/components/icons/IconPhone.vue'
import { useRegisterStore } from '@/stores/register'
import { sendSmsCode } from '@/api/auth'
import { compressAvatarFile } from '@/utils/media'

const router = useRouter()
const route = useRoute()
const registerStore = useRegisterStore()

const phone = ref(registerStore.phone)
const avatarPreview = ref(registerStore.avatar)
const sending = ref(false)

async function onAvatarChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  if (!file.type.startsWith('image/')) {
    showToast('请选择图片文件')
    return
  }

  const avatarFile = await compressAvatarFile(file)
  const reader = new FileReader()
  reader.onload = () => {
    const result = reader.result as string
    avatarPreview.value = result
    registerStore.setAvatar(result, avatarFile)
  }
  reader.readAsDataURL(avatarFile)
}

async function handleContinue() {
  if (!phone.value.trim() || phone.value.trim().length < 11) {
    showToast('请输入有效手机号')
    return
  }

  registerStore.setPhone(phone.value.trim())

  sending.value = true
  try {
    await sendSmsCode(phone.value.trim(), 'register')
    showToast('验证码已发送（开发环境固定 1234）')
    router.push({ path: '/register/code', query: accountFlowQuery() })
  } catch (e) {
    showToast((e as Error).message || '发送失败')
  } finally {
    sending.value = false
  }
}

function goLogin() {
  router.push({ path: '/login', query: accountFlowQuery() })
}

function accountFlowQuery(): Record<string, string> {
  const query: Record<string, string> = {}
  if (route.query.addAccount === '1') {
    query.addAccount = '1'
    if (typeof route.query.returnTo === 'string') query.returnTo = route.query.returnTo
  }
  return query
}
</script>

<template>
  <div class="register-page">
    <main class="register-panel">
      <header class="register-header">
        <h1 class="title">加入 Pulse</h1>
        <p class="step-text">第 1 步，共 3 步</p>
        <RegisterProgress :percent="33" />
      </header>

      <div class="avatar-section">
        <label class="avatar-upload">
          <input type="file" accept="image/*" hidden @change="onAvatarChange" />
          <div class="avatar-circle" :class="{ filled: !!avatarPreview }">
            <img v-if="avatarPreview" :src="avatarPreview" alt="头像" class="avatar-img" />
            <svg v-else width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 5v14M5 12h14" stroke-linecap="round"/>
            </svg>
          </div>
          <span class="upload-text">上传头像</span>
        </label>
      </div>

      <div class="form-section">
        <div class="field-group">
          <label class="field-label">手机号</label>
          <div class="field">
            <span class="field-icon"><IconPhone /></span>
            <input
              v-model="phone"
              type="tel"
              maxlength="11"
              placeholder="请输入手机号"
              class="field-input"
            />
          </div>
        </div>

        <button type="button" class="primary-btn" :disabled="sending" @click="handleContinue">
          继续
        </button>
      </div>

      <footer class="login-hint">
        已有账号？
        <a href="javascript:void(0)" @click="goLogin">登录</a>
      </footer>
    </main>
  </div>
</template>

<style scoped>
.register-page {
  min-height: 100vh;
  background: var(--pulse-page-bg, var(--pulse-bg));
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.register-panel {
  width: 100%;
  max-width: 480px;
  background: rgba(28, 28, 30, 0.7);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 0.5px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--pulse-radius);
  padding: 32px 24px;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.35);
}

.register-header {
  text-align: center;
  margin-bottom: 32px;
}

.title {
  margin: 0 0 4px;
  font-size: 34px;
  font-weight: 700;
  line-height: 41px;
  letter-spacing: -0.02em;
  color: var(--pulse-text);
}

.step-text {
  margin: 0 0 24px;
  font-size: 15px;
  color: var(--pulse-text-secondary);
}

.avatar-section {
  display: flex;
  justify-content: center;
  margin-bottom: 32px;
}

.avatar-upload {
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
}

.avatar-circle {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  border: 2px dashed var(--pulse-outline-variant);
  background: var(--pulse-surface-high);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: var(--pulse-outline);
  transition: border-color 0.2s;
}

.avatar-circle:hover {
  border-color: var(--pulse-primary-container);
  color: var(--pulse-primary-container);
}

.avatar-circle.filled {
  border-style: solid;
  border-color: var(--pulse-primary-container);
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.upload-text {
  margin-top: 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--pulse-primary);
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--pulse-text-secondary);
  padding-left: 4px;
}

.field {
  position: relative;
}

.field-icon {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  color: var(--pulse-outline);
  display: flex;
}

.field-icon :deep(svg) {
  width: 20px;
  height: 20px;
}

.field-input {
  width: 100%;
  height: 48px;
  padding: 0 16px 0 48px;
  background: var(--pulse-surface-low);
  border: none;
  border-radius: 8px;
  color: var(--pulse-text);
  font-size: 15px;
  outline: none;
  transition: box-shadow 0.2s;
}

.field-input:focus {
  box-shadow: 0 0 0 2px rgba(75, 142, 255, 0.2);
}

.field-input::placeholder {
  color: var(--pulse-outline-variant);
}

.primary-btn {
  width: 100%;
  height: 48px;
  border: none;
  border-radius: 8px;
  background: var(--pulse-primary-container);
  color: var(--pulse-on-primary-container);
  font-size: 20px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(75, 142, 255, 0.2);
  transition: transform 0.15s, opacity 0.15s;
}

.primary-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.primary-btn:disabled {
  opacity: 0.7;
}

.login-hint {
  margin-top: 32px;
  text-align: center;
  font-size: 13px;
  font-weight: 500;
  color: var(--pulse-text-secondary);
}

.login-hint a {
  color: var(--pulse-primary);
  font-weight: 700;
}
</style>

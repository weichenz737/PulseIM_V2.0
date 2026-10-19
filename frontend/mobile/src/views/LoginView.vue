<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { showToast, showLoadingToast, closeToast } from 'vant'
import PulseLogo from '@/components/PulseLogo.vue'
import IconPhone from '@/components/icons/IconPhone.vue'
import IconLock from '@/components/icons/IconLock.vue'
import LegalTextDialog from '@/components/LegalTextDialog.vue'
import { useUserStore } from '@/stores/user'
import { sendSmsCode } from '@/api/auth'
import type { SystemTextKey } from '@/api/systemText'

const REMEMBER_KEY = 'pulse_remember_login'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const activeTab = ref<'password' | 'code'>('password')
const phone = ref('')
const password = ref('')
const showPassword = ref(false)
const code = ref('')
const securityCode = ref('')
const securityCodeRequired = ref(false)
const rememberPassword = ref(false)
const loading = ref(false)
const smsCountdown = ref(0)
const legalDialog = ref<InstanceType<typeof LegalTextDialog>>()
let smsTimer: ReturnType<typeof setInterval> | null = null

function loadRemembered() {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY)
    if (!raw) return
    const data = JSON.parse(raw) as { phone?: string; password?: string }
    if (data.phone) phone.value = String(data.phone)
    if (data.password) {
      password.value = String(data.password)
      rememberPassword.value = true
    }
  } catch {
    localStorage.removeItem(REMEMBER_KEY)
  }
}

function persistRemembered() {
  if (rememberPassword.value && phone.value.trim() && password.value) {
    localStorage.setItem(
      REMEMBER_KEY,
      JSON.stringify({
        phone: phone.value.trim(),
        password: password.value,
      }),
    )
  } else {
    localStorage.removeItem(REMEMBER_KEY)
  }
}

onMounted(() => {
  loadRemembered()
  const qPhone = route.query.phone
  if (typeof qPhone === 'string' && qPhone.trim()) {
    phone.value = qPhone.trim()
  }
})

onUnmounted(() => {
  if (smsTimer) {
    clearInterval(smsTimer)
    smsTimer = null
  }
})

async function handleSendSms() {
  if (!phone.value.trim() || phone.value.trim().length < 11) {
    showToast('请输入有效手机号')
    return
  }
  if (smsCountdown.value > 0) return
  try {
    await sendSmsCode(phone.value.trim(), 'login')
    showToast('验证码已发送（开发环境固定 1234）')
    smsCountdown.value = 60
    smsTimer = setInterval(() => {
      smsCountdown.value -= 1
      if (smsCountdown.value <= 0 && smsTimer) {
        clearInterval(smsTimer)
        smsTimer = null
      }
    }, 1000)
  } catch (e) {
    showToast((e as Error).message || '发送失败')
  }
}

async function handleLogin() {
  if (!phone.value.trim()) {
    showToast('请输入手机号')
    return
  }

  if (activeTab.value === 'password' && !password.value) {
    showToast('请输入密码')
    return
  }

  if (activeTab.value === 'code' && !code.value) {
    showToast('请输入验证码')
    return
  }

  loading.value = true
  showLoadingToast({ message: '登录中...', forbidClick: true })

  try {
    await userStore.login({
      phone: phone.value.trim(),
      password: activeTab.value === 'password' ? password.value : undefined,
      code: activeTab.value === 'code' ? code.value : undefined,
      loginType: activeTab.value,
      securityCode:
        activeTab.value === 'password'
          ? securityCode.value.trim().toUpperCase() || undefined
          : undefined,
    })
    if (activeTab.value === 'password') {
      persistRemembered()
    }
    closeToast()
    showToast('登录成功')
    const returnTo = safeLocalPath(route.query.returnTo)
    const redirect = safeLocalPath(route.query.redirect)
    const target = returnTo || redirect || '/app/messages'
    // Capacitor serves bundled files from a local origin. A hard navigation to
    // /app/messages bypasses Vue Router and produces a blank native WebView.
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    await router.replace(target)
  } catch (e) {
    closeToast()
    const message = (e as Error)?.message || ''
    if (message.includes('SECURITY_CODE_REQUIRED')) {
      securityCodeRequired.value = true
      showToast('这是新设备，请输入账号安全码')
      return
    }
    showToast((e as Error)?.message || '登录失败，请检查账号信息')
  } finally {
    loading.value = false
  }
}

function goRegister() {
  const query: Record<string, string> = {}
  if (route.query.addAccount === '1') {
    query.addAccount = '1'
    if (typeof route.query.returnTo === 'string') query.returnTo = route.query.returnTo
  }
  router.push({ path: '/register', query })
}

function goForgotPassword() {
  router.push({
    path: '/forgot-password',
    query: phone.value.trim() ? { phone: phone.value.trim() } : undefined,
  })
}

function onRememberChange() {
  if (!rememberPassword.value) {
    localStorage.removeItem(REMEMBER_KEY)
  }
}

function openLegalText(key: SystemTextKey) {
  legalDialog.value?.open(key)
}

function safeLocalPath(value: unknown) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : ''
}
</script>

<template>
  <div class="login-page">
    <main class="login-main">
      <header class="login-header">
        <PulseLogo />
        <h1 class="title">欢迎回来</h1>
        <p class="subtitle">Pulse 团队极速沟通</p>
      </header>

      <section class="login-card">
        <div class="tabs">
          <div class="tab-slider" :class="{ code: activeTab === 'code' }" />
          <button
            type="button"
            class="tab"
            :class="{ active: activeTab === 'password' }"
            @click="activeTab = 'password'"
          >
            密码
          </button>
          <button
            type="button"
            class="tab"
            :class="{ active: activeTab === 'code' }"
            @click="activeTab = 'code'"
          >
            验证码
          </button>
        </div>

        <div class="form">
          <div class="field-group">
            <label class="field-label">手机号</label>
            <div class="field glass-focus">
              <span class="field-icon"><IconPhone /></span>
              <input
                v-model="phone"
                type="tel"
                name="username"
                maxlength="11"
                placeholder="请输入手机号"
                class="field-input"
                autocomplete="username"
                inputmode="numeric"
              />
            </div>
          </div>

          <div v-if="activeTab === 'password'" class="field-group">
            <label class="field-label">密码</label>
            <div class="field glass-focus">
              <span class="field-icon"><IconLock /></span>
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                name="password"
                placeholder="••••••••"
                class="field-input"
                autocomplete="current-password"
              />
              <button
                type="button"
                class="password-toggle"
                :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                @click="showPassword = !showPassword"
              >
                <span class="material-symbols-outlined">{{ showPassword ? 'visibility_off' : 'visibility' }}</span>
              </button>
            </div>
            <div class="password-extra-row">
              <label class="remember-row">
                <input
                  v-model="rememberPassword"
                  type="checkbox"
                  class="remember-check"
                  @change="onRememberChange"
                />
                <span>记住密码</span>
              </label>
              <a class="forgot-link" href="javascript:void(0)" @click="goForgotPassword">
                忘记密码？
              </a>
            </div>
          </div>

          <div v-else class="field-group">
            <label class="field-label">验证码</label>
            <div class="field glass-focus">
              <span class="field-icon"><IconLock /></span>
              <input
                v-model="code"
                type="text"
                maxlength="6"
                placeholder="输入4位验证码"
                class="field-input code-input"
              />
              <button
                type="button"
                class="sms-btn"
                :disabled="smsCountdown > 0"
                @click="handleSendSms"
              >
                {{ smsCountdown > 0 ? `${smsCountdown}s` : '发送验证码' }}
              </button>
            </div>
          </div>

          <div v-if="securityCodeRequired && activeTab === 'password'" class="field-group">
            <label class="field-label">安全码</label>
            <div class="field glass-focus">
              <span class="field-icon material-symbols-outlined">shield_lock</span>
              <input
                v-model="securityCode"
                class="field-input"
                maxlength="6"
                autocomplete="one-time-code"
                placeholder="请输入 6 位安全码"
                @input="securityCode = securityCode.toUpperCase().replace(/[^A-Z0-9]/g, '')"
              />
            </div>
          </div>

          <button type="button" class="login-btn" :disabled="loading" @click="handleLogin">
            <span>登录</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 12h14M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      </section>

      <footer class="login-footer">
        <p class="register-hint">
          没有账号？
          <a href="javascript:void(0)" @click="goRegister">注册</a>
        </p>
        <div class="legal-links">
          <a href="javascript:void(0)" @click="openLegalText('privacy_policy')">隐私政策</a>
          <a href="javascript:void(0)" @click="openLegalText('service_terms')">服务条款</a>
        </div>
      </footer>
    </main>
    <LegalTextDialog ref="legalDialog" />
  </div>
</template>

<style scoped>
.login-page {
  width: 100%;
  height: 100%;
  min-height: 100%;
  min-height: 100dvh;
  overflow-y: auto;
  background-color: var(--pulse-bg);
  background: radial-gradient(circle at 50% 90%, var(--pulse-surface-low) 0%, var(--pulse-bg) 60%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: calc(32px + var(--pulse-safe-top)) 16px calc(32px + var(--pulse-safe-bottom));
}

.login-main {
  width: 100%;
  max-width: 420px;
  animation: fadeIn 0.8s ease-out forwards;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.login-header :deep(.pulse-logo) {
  margin: 0 auto 16px;
}

.title {
  margin: 0 0 4px;
  font-size: 34px;
  font-weight: 700;
  line-height: 41px;
  letter-spacing: -0.02em;
  color: var(--pulse-text);
}

.subtitle {
  margin: 0;
  font-size: 15px;
  line-height: 20px;
  color: var(--pulse-text-secondary);
}

.login-card {
  background: rgba(30, 31, 35, 0.6);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-radius: 32px;
  padding: 32px;
  border: 1px solid rgba(65, 71, 85, 0.3);
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
}

.tabs {
  position: relative;
  display: flex;
  padding: 4px;
  margin-bottom: 24px;
  height: 48px;
  background: var(--pulse-surface-highest);
  border-radius: 12px;
}

.tab-slider {
  position: absolute;
  top: 4px;
  left: 4px;
  width: calc(50% - 4px);
  height: calc(100% - 8px);
  background: var(--pulse-surface-bright, var(--pulse-surface-bright));
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  transition: transform 0.3s ease-out;
}

.tab-slider.code {
  transform: translateX(100%);
}

.tab {
  position: relative;
  z-index: 1;
  flex: 1;
  border: none;
  background: transparent;
  color: var(--pulse-text-secondary);
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
  cursor: pointer;
  transition: color 0.2s;
}

.tab.active {
  color: var(--pulse-text);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.password-extra-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
  padding: 0 4px;
}

.field-label {
  font-size: 11px;
  font-weight: 600;
  line-height: 13px;
  color: var(--pulse-text-secondary);
  padding-left: 4px;
}

.field {
  position: relative;
  background: var(--pulse-surface-low);
  border: 1px solid rgba(65, 71, 85, 0.5);
  border-radius: var(--pulse-radius-lg);
  transition: box-shadow 0.2s, border-color 0.2s;
}

.field.glass-focus:focus-within {
  box-shadow: 0 0 0 2px rgba(173, 198, 255, 0.3);
  border-color: var(--pulse-primary);
}

.field-icon {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  color: var(--pulse-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.field-icon :deep(svg) {
  width: 20px;
  height: 20px;
}

.field-input {
  width: 100%;
  height: 52px;
  padding: 0 16px 0 48px;
  background: transparent;
  border: none;
  border-radius: var(--pulse-radius-lg);
  color: var(--pulse-text);
  font-size: 15px;
  outline: none;
}

.field-input::placeholder {
  color: rgba(193, 198, 215, 0.4);
}

.field-input.code-input {
  padding-right: 112px;
}

.field-input[name="password"] {
  padding-right: 54px;
}

.password-toggle {
  position: absolute;
  z-index: 2;
  top: 50%;
  right: 8px;
  width: 38px;
  height: 38px;
  padding: 0;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: var(--pulse-text-secondary);
  cursor: pointer;
  touch-action: manipulation;
}

.password-toggle .material-symbols-outlined {
  font-size: 21px;
}

.forgot-link {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--pulse-primary);
  text-decoration: none;
}

.remember-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 0;
  font-size: 13px;
  color: var(--pulse-text-secondary);
  cursor: pointer;
  user-select: none;
}

.remember-check {
  width: 16px;
  height: 16px;
  accent-color: var(--pulse-primary);
  cursor: pointer;
}

.sms-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: rgba(173, 198, 255, 0.1);
  color: var(--pulse-primary);
  font-size: 13px;
  font-weight: 500;
  padding: 6px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s, transform 0.15s;
}

.sms-btn:active:not(:disabled) {
  transform: translateY(-50%) scale(0.95);
}

.sms-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.login-btn {
  width: 100%;
  height: 52px;
  margin-top: 8px;
  border: none;
  border-radius: var(--pulse-radius-lg);
  background: var(--pulse-primary-container);
  color: #fff;
  font-size: 20px;
  font-weight: 600;
  line-height: 25px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: 0 8px 24px rgba(75, 142, 255, 0.35), 0 0 40px rgba(173, 198, 255, 0.12);
  transition: transform 0.15s, opacity 0.15s;
}

.login-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.login-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.login-footer {
  margin-top: 16px;
  text-align: center;
}

.register-hint {
  margin: 0;
  font-size: 15px;
  color: var(--pulse-text-secondary);
}

.register-hint a {
  color: var(--pulse-primary);
  font-weight: 700;
}

.legal-links {
  margin-top: 16px;
  display: flex;
  justify-content: center;
  gap: 8px;
}

.legal-links a {
  font-size: 11px;
  font-weight: 600;
  color: rgba(193, 198, 215, 0.6);
}

.legal-links a:hover {
  color: var(--pulse-text-secondary);
}
</style>

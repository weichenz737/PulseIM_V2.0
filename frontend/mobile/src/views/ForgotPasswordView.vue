<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showLoadingToast, closeToast, showToast } from 'vant'
import IconPhone from '@/components/icons/IconPhone.vue'
import IconLock from '@/components/icons/IconLock.vue'
import { resetPassword, sendSmsCode } from '@/api/auth'

const router = useRouter()
const route = useRoute()

const phone = ref('')
const code = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const showConfirmPassword = ref(false)
const loading = ref(false)
const smsCountdown = ref(0)
let smsTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  const q = route.query.phone
  if (typeof q === 'string' && q.trim()) {
    phone.value = q.trim()
  }
})

async function handleSendSms() {
  if (!phone.value.trim() || phone.value.trim().length < 11) {
    showToast('请输入有效手机号')
    return
  }
  if (smsCountdown.value > 0) return
  try {
    await sendSmsCode(phone.value.trim(), 'reset')
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

async function handleSubmit() {
  if (!phone.value.trim() || phone.value.trim().length < 11) {
    showToast('请输入有效手机号')
    return
  }
  if (!code.value.trim()) {
    showToast('请输入验证码')
    return
  }
  if (!password.value || password.value.length < 6) {
    showToast('密码至少 6 位')
    return
  }
  if (password.value !== confirmPassword.value) {
    showToast('两次输入的密码不一致')
    return
  }

  loading.value = true
  showLoadingToast({ message: '提交中...', forbidClick: true })
  try {
    await resetPassword({
      phone: phone.value.trim(),
      code: code.value.trim(),
      password: password.value,
    })
    closeToast()
    showToast('密码已重置，请登录')
    try {
      const raw = localStorage.getItem('pulse_remember_login')
      if (raw) {
        const data = JSON.parse(raw) as { phone?: string }
        if (data.phone === phone.value.trim()) {
          localStorage.removeItem('pulse_remember_login')
        }
      }
    } catch {
      /* ignore */
    }
    await router.replace({
      path: '/login',
      query: { phone: phone.value.trim() },
    })
  } catch (e) {
    closeToast()
    showToast((e as Error).message || '重置失败')
  } finally {
    loading.value = false
  }
}

function goLogin() {
  router.replace('/login')
}
</script>

<template>
  <div class="forgot-page">
    <main class="forgot-main">
      <header class="forgot-header">
        <button type="button" class="back-btn" @click="goLogin">返回登录</button>
        <h1 class="title">找回密码</h1>
        <p class="subtitle">通过手机验证码重置登录密码</p>
      </header>

      <section class="forgot-card">
        <div class="form">
          <div class="field-group">
            <label class="field-label">手机号</label>
            <div class="field glass-focus">
              <span class="field-icon"><IconPhone /></span>
              <input
                v-model="phone"
                type="tel"
                maxlength="11"
                placeholder="请输入注册手机号"
                class="field-input"
                inputmode="numeric"
                autocomplete="username"
              />
            </div>
          </div>

          <div class="field-group">
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

          <div class="field-group">
            <label class="field-label">新密码</label>
            <div class="field glass-focus">
              <span class="field-icon"><IconLock /></span>
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="至少 6 位"
                class="field-input"
                autocomplete="new-password"
              />
              <button type="button" class="password-toggle" @click="showPassword = !showPassword"><span class="material-symbols-outlined">{{ showPassword ? 'visibility_off' : 'visibility' }}</span></button>
            </div>
          </div>

          <div class="field-group">
            <label class="field-label">确认密码</label>
            <div class="field glass-focus">
              <span class="field-icon"><IconLock /></span>
              <input
                v-model="confirmPassword"
                :type="showConfirmPassword ? 'text' : 'password'"
                placeholder="再次输入新密码"
                class="field-input"
                autocomplete="new-password"
              />
              <button type="button" class="password-toggle" @click="showConfirmPassword = !showConfirmPassword"><span class="material-symbols-outlined">{{ showConfirmPassword ? 'visibility_off' : 'visibility' }}</span></button>
            </div>
          </div>

          <button type="button" class="submit-btn" :disabled="loading" @click="handleSubmit">
            重置密码
          </button>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.forgot-page {
  min-height: 100vh;
  background: radial-gradient(circle at 50% 90%, var(--pulse-surface-low) 0%, var(--pulse-bg) 60%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
}

.forgot-main {
  width: 100%;
  max-width: 420px;
}

.forgot-header {
  margin-bottom: 24px;
}

.back-btn {
  border: none;
  background: transparent;
  color: var(--pulse-primary);
  font-size: 14px;
  font-weight: 600;
  padding: 0;
  margin-bottom: 16px;
  cursor: pointer;
}

.title {
  margin: 0 0 6px;
  font-size: 28px;
  font-weight: 700;
  color: var(--pulse-text);
}

.subtitle {
  margin: 0;
  font-size: 14px;
  color: var(--pulse-text-secondary);
}

.forgot-card {
  background: rgba(30, 31, 35, 0.6);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-radius: 32px;
  padding: 28px 24px;
  border: 1px solid rgba(65, 71, 85, 0.3);
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
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

.field-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--pulse-text-secondary);
  padding-left: 4px;
}

.field {
  position: relative;
  background: var(--pulse-surface-low);
  border: 1px solid rgba(65, 71, 85, 0.5);
  border-radius: var(--pulse-radius-lg);
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

.field-input.code-input {
  padding-right: 112px;
}

.field-input::placeholder {
  color: rgba(193, 198, 215, 0.4);
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
}

.sms-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.submit-btn {
  width: 100%;
  height: 52px;
  margin-top: 8px;
  border: none;
  border-radius: var(--pulse-radius-lg);
  background: var(--pulse-primary-container);
  color: #fff;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(75, 142, 255, 0.35);
}

.submit-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}
.password-toggle { position:absolute; right:8px; top:50%; transform:translateY(-50%); width:38px; height:38px; border:0; background:transparent; color:var(--pulse-text-secondary); }
.password-toggle .material-symbols-outlined { font-size:21px; }
.field:has(.password-toggle) .field-input { padding-right:52px; }
</style>

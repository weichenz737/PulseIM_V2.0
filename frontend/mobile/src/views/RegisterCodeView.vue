<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { useRegisterStore } from '@/stores/register'
import { sendSmsCode } from '@/api/auth'

const router = useRouter()
const route = useRoute()
const registerStore = useRegisterStore()

const CODE_LEN = 4
const digits = ref<string[]>(Array.from({ length: CODE_LEN }, () => ''))
const countdown = ref(60)
const canResend = ref(false)
let timer: ReturnType<typeof setInterval> | null = null

const maskedPhone = computed(() => {
  const p = registerStore.phone
  if (p.length >= 11) return `+86 ${p.slice(0, 3)}****${p.slice(7)}`
  return p
})

const codeComplete = computed(() => digits.value.every((d) => d !== ''))

onMounted(() => {
  if (!registerStore.phone) {
    router.replace('/register')
    return
  }
  if (registerStore.code) {
    registerStore.code.split('').forEach((c, i) => {
      if (i < CODE_LEN) digits.value[i] = c
    })
  }
  startCountdown()
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

function startCountdown() {
  countdown.value = 60
  canResend.value = false
  if (timer) clearInterval(timer)
  timer = setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0) {
      canResend.value = true
      if (timer) clearInterval(timer)
    }
  }, 1000)
}

function onDigitInput(index: number, event: Event) {
  const input = event.target as HTMLInputElement
  let val = input.value.replace(/\D/g, '').slice(-1)
  digits.value[index] = val
  input.value = val
  if (val && index < CODE_LEN - 1) {
    const next = input.parentElement?.querySelectorAll('input')[index + 1] as HTMLInputElement
    next?.focus()
  }
}

function onDigitKeydown(index: number, event: KeyboardEvent) {
  if (event.key === 'Backspace' && !digits.value[index] && index > 0) {
    const prev = (event.target as HTMLInputElement).parentElement?.querySelectorAll('input')[index - 1] as HTMLInputElement
    prev?.focus()
  }
}

async function handleResend() {
  if (!canResend.value) return
  try {
    await sendSmsCode(registerStore.phone, 'register')
    showToast('验证码已重新发送（开发环境固定 1234）')
  } catch (e) {
    showToast((e as Error).message || '发送失败')
  }
  startCountdown()
}

function handleContinue() {
  const code = digits.value.join('')
  if (code.length < CODE_LEN) {
    showToast('请输入4位验证码')
    return
  }
  registerStore.setCode(code)
  router.push({ path: '/register/profile', query: accountFlowQuery() })
}

function goBack() {
  router.back()
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
    <header class="top-bar">
      <button type="button" class="back-btn" @click="goBack">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 18l-6-6 6-6"/>
        </svg>
      </button>
    </header>

    <main class="main-content">
      <div class="content-header">
        <h1 class="title">输入验证码</h1>
        <p class="phone-hint">
          验证码已发送至 <strong>{{ maskedPhone }}</strong>
        </p>
      </div>

      <div class="otp-row">
        <input
          v-for="(_, i) in digits"
          :key="i"
          type="text"
          inputmode="numeric"
          maxlength="1"
          pattern="[0-9]*"
          class="otp-cell"
          :value="digits[i]"
          @input="onDigitInput(i, $event)"
          @keydown="onDigitKeydown(i, $event)"
        />
      </div>

      <div class="resend-wrap">
        <button type="button" class="resend-btn" :class="{ active: canResend }" :disabled="!canResend" @click="handleResend">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
          </svg>
          <template v-if="!canResend">重新发送 ({{ countdown }}s)</template>
          <template v-else>重新发送</template>
        </button>
      </div>

      <div class="action-section">
        <button type="button" class="submit-btn" :class="{ ready: codeComplete }" :disabled="!codeComplete" @click="handleContinue">
          提交
        </button>
        <p class="expire-hint">验证码将在 10 分钟后过期。如未收到短信，请检查垃圾短信或稍后重试。</p>
      </div>
    </main>

    <div class="bg-glow bg-glow-top" />
    <div class="bg-glow bg-glow-bottom" />
  </div>
</template>

<style scoped>
.register-page {
  min-height: 100vh;
  background: var(--pulse-page-bg, var(--pulse-bg));
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

.bg-glow {
  position: fixed;
  border-radius: 50%;
  pointer-events: none;
  z-index: 0;
}

.bg-glow-top {
  top: -10%;
  right: -10%;
  width: 50%;
  height: 40%;
  background: rgba(173, 198, 255, 0.1);
  filter: blur(120px);
}

.bg-glow-bottom {
  bottom: -5%;
  left: -5%;
  width: 40%;
  height: 30%;
  background: rgba(66, 227, 85, 0.1);
  filter: blur(100px);
}

.top-bar {
  position: relative;
  z-index: 1;
  height: 64px;
  display: flex;
  align-items: center;
  padding: 0 16px;
}

.back-btn {
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  color: var(--pulse-text);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s;
}

.back-btn:hover {
  background: var(--pulse-surface-variant, var(--pulse-surface-highest));
}

.main-content {
  position: relative;
  z-index: 1;
  flex: 1;
  max-width: 420px;
  width: 100%;
  margin: 0 auto;
  padding: 48px 16px 48px;
  display: flex;
  flex-direction: column;
}

.content-header {
  margin-bottom: 32px;
}

.title {
  margin: 0 0 8px;
  font-size: 28px;
  font-weight: 700;
  line-height: 34px;
  color: var(--pulse-text);
}

.phone-hint {
  margin: 0;
  font-size: 17px;
  line-height: 24px;
  color: var(--pulse-text-secondary);
}

.phone-hint strong {
  color: var(--pulse-text);
  font-weight: 500;
}

.otp-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 32px;
}

.otp-cell {
  flex: 1;
  max-width: 72px;
  height: 80px;
  background: var(--pulse-surface-high);
  border: 2px solid transparent;
  border-radius: var(--pulse-radius);
  text-align: center;
  font-size: 34px;
  font-weight: 700;
  color: var(--pulse-primary);
  outline: none;
  transition: border-color 0.2s;
}

.otp-cell:focus {
  border-color: var(--pulse-primary);
}

.resend-wrap {
  display: flex;
  justify-content: center;
  margin-bottom: 48px;
}

.resend-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border: none;
  border-radius: 999px;
  background: var(--pulse-surface-low);
  color: var(--pulse-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: not-allowed;
  transition: background 0.2s, color 0.2s;
}

.resend-btn.active {
  background: var(--pulse-surface-high);
  color: var(--pulse-primary);
  cursor: pointer;
}

.action-section {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.submit-btn {
  width: 100%;
  height: 56px;
  border: none;
  border-radius: var(--pulse-radius);
  background: var(--pulse-primary);
  color: var(--pulse-on-primary);
  font-size: 20px;
  font-weight: 600;
  cursor: not-allowed;
  opacity: 0.5;
  box-shadow: 0 8px 24px rgba(173, 198, 255, 0.15);
  transition: transform 0.15s, opacity 0.2s, background 0.2s;
}

.submit-btn.ready {
  opacity: 1;
  cursor: pointer;
}

.submit-btn.ready:active {
  transform: scale(0.98);
  background: var(--pulse-primary-container);
  color: var(--pulse-on-primary-container);
}

.expire-hint {
  margin: 0;
  text-align: center;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--pulse-text-secondary);
  padding: 0 16px;
}
</style>

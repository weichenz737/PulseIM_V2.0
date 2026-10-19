<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { showToast } from 'vant'
import { fetchAccountSecurity, sendSmsCode } from '@/api/auth'
import { resetPaymentPassword, setPaymentPassword } from '@/api/wallet'

const props = defineProps<{ hasPassword: boolean }>()
const emit = defineEmits<{ success: [] }>()
const visible = defineModel<boolean>({ default: false })

type Flow = 'set' | 'modify' | 'forgot'
type ModifyStep = 'old' | 'new' | 'confirm'
type SetStep = 'new' | 'confirm'
type ForgotStep = 'code' | 'new' | 'confirm'

const flow = ref<Flow>('set')
const modifyStep = ref<ModifyStep>('old')
const setStep = ref<SetStep>('new')
const forgotStep = ref<ForgotStep>('code')

const oldPassword = ref('')
const password = ref('')
const confirmPassword = ref('')
const phone = ref('')
const code = ref('')
const saving = ref(false)
const sending = ref(false)
const countdown = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

/** 短信验证码位数（开发固定码为 4 位） */
const CODE_LENGTH = 4
/** 当前输入步骤允许的长度：验证码 4 位，支付密码 6 位 */
const inputLength = computed(() =>
  flow.value === 'forgot' && forgotStep.value === 'code' ? CODE_LENGTH : 6,
)

const title = computed(() => {
  if (flow.value === 'forgot') return '忘记支付密码'
  return props.hasPassword ? '修改支付密码' : '设置支付密码'
})

const maskedPhone = computed(() => phone.value.replace(/^(\d{3})\d{4}(\d+)$/, '$1****$2'))

const stepHint = computed(() => {
  if (flow.value === 'forgot') {
    if (forgotStep.value === 'code') return `验证码将发送至 ${maskedPhone.value || '绑定手机号'}，请输入 ${CODE_LENGTH} 位验证码`
    if (forgotStep.value === 'new') return '请设置新的 6 位数字支付密码'
    return '请再次输入新支付密码'
  }
  if (flow.value === 'modify') {
    if (modifyStep.value === 'old') return '请输入原支付密码'
    if (modifyStep.value === 'new') return '请设置新的 6 位数字支付密码'
    return '请再次输入新支付密码'
  }
  if (setStep.value === 'new') return '请设置 6 位数字支付密码，用于红包、转账等操作'
  return '请再次输入支付密码以确认'
})

const activeLabel = computed(() => {
  if (flow.value === 'forgot') {
    if (forgotStep.value === 'code') return '短信验证码'
    if (forgotStep.value === 'new') return '新支付密码'
    return '确认支付密码'
  }
  if (flow.value === 'modify') {
    if (modifyStep.value === 'old') return '原支付密码'
    if (modifyStep.value === 'new') return '新支付密码'
    return '确认支付密码'
  }
  return setStep.value === 'new' ? '支付密码' : '确认支付密码'
})

const activeValue = computed(() => {
  if (flow.value === 'forgot') {
    if (forgotStep.value === 'code') return code.value
    if (forgotStep.value === 'new') return password.value
    return confirmPassword.value
  }
  if (flow.value === 'modify') {
    if (modifyStep.value === 'old') return oldPassword.value
    if (modifyStep.value === 'new') return password.value
    return confirmPassword.value
  }
  return setStep.value === 'new' ? password.value : confirmPassword.value
})

const showDots = computed(() => !(flow.value === 'forgot' && forgotStep.value === 'code'))

const primaryText = computed(() => {
  if (saving.value) return '提交中…'
  if (flow.value === 'forgot') {
    if (forgotStep.value === 'confirm') return '验证并重置'
    return '下一步'
  }
  if (flow.value === 'modify') {
    if (modifyStep.value === 'confirm') return '确认修改'
    return '下一步'
  }
  return setStep.value === 'confirm' ? '确认设置' : '下一步'
})

const canPrimary = computed(() => activeValue.value.length === inputLength.value && !saving.value)

watch(visible, (value) => {
  if (!value) return
  flow.value = props.hasPassword ? 'modify' : 'set'
  modifyStep.value = 'old'
  setStep.value = 'new'
  forgotStep.value = 'code'
  oldPassword.value = ''
  password.value = ''
  confirmPassword.value = ''
  code.value = ''
})

function close() {
  if (!saving.value) visible.value = false
}

function setActiveValue(next: string) {
  const value = next.replace(/\D/g, '').slice(0, inputLength.value)
  if (flow.value === 'forgot') {
    if (forgotStep.value === 'code') code.value = value
    else if (forgotStep.value === 'new') password.value = value
    else confirmPassword.value = value
    return
  }
  if (flow.value === 'modify') {
    if (modifyStep.value === 'old') oldPassword.value = value
    else if (modifyStep.value === 'new') password.value = value
    else confirmPassword.value = value
    return
  }
  if (setStep.value === 'new') password.value = value
  else confirmPassword.value = value
}

function appendDigit(digit: string) {
  if (saving.value || activeValue.value.length >= inputLength.value) return
  setActiveValue(activeValue.value + digit)
  if (activeValue.value.length === inputLength.value) {
    window.setTimeout(() => {
      if (canPrimary.value) void onPrimary()
    }, 80)
  }
}

function deleteDigit() {
  if (saving.value || !activeValue.value) return
  setActiveValue(activeValue.value.slice(0, -1))
}

async function onPrimary() {
  if (!canPrimary.value) return

  if (flow.value === 'modify') {
    if (modifyStep.value === 'old') {
      modifyStep.value = 'new'
      return
    }
    if (modifyStep.value === 'new') {
      modifyStep.value = 'confirm'
      return
    }
    if (password.value !== confirmPassword.value) {
      showToast('两次支付密码不一致')
      confirmPassword.value = ''
      return
    }
    await submitModify()
    return
  }

  if (flow.value === 'set') {
    if (setStep.value === 'new') {
      setStep.value = 'confirm'
      return
    }
    if (password.value !== confirmPassword.value) {
      showToast('两次支付密码不一致')
      confirmPassword.value = ''
      return
    }
    await submitModify()
    return
  }

  if (forgotStep.value === 'code') {
    forgotStep.value = 'new'
    return
  }
  if (forgotStep.value === 'new') {
    forgotStep.value = 'confirm'
    return
  }
  if (password.value !== confirmPassword.value) {
    showToast('两次支付密码不一致')
    confirmPassword.value = ''
    return
  }
  await submitReset()
}

async function submitModify() {
  saving.value = true
  try {
    await setPaymentPassword(password.value, props.hasPassword ? oldPassword.value : undefined)
    showToast(props.hasPassword ? '支付密码已修改' : '支付密码已设置')
    visible.value = false
    emit('success')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '设置失败')
    if (props.hasPassword) {
      modifyStep.value = 'old'
      oldPassword.value = ''
      password.value = ''
      confirmPassword.value = ''
    } else {
      setStep.value = 'new'
      password.value = ''
      confirmPassword.value = ''
    }
  } finally {
    saving.value = false
  }
}

async function openForgot() {
  flow.value = 'forgot'
  forgotStep.value = 'code'
  password.value = ''
  confirmPassword.value = ''
  code.value = ''
  try {
    phone.value = (await fetchAccountSecurity()).phone || ''
  } catch (e) {
    showToast(e instanceof Error ? e.message : '获取手机号失败')
  }
}

async function sendCode() {
  if (!phone.value || countdown.value > 0) return
  sending.value = true
  try {
    await sendSmsCode(phone.value, 'change_password')
    showToast(`验证码已发送至 ${maskedPhone.value}`)
    countdown.value = 60
    timer = setInterval(() => {
      countdown.value--
      if (countdown.value <= 0 && timer) {
        clearInterval(timer)
        timer = null
      }
    }, 1000)
  } catch (e) {
    showToast(e instanceof Error ? e.message : '验证码发送失败')
  } finally {
    sending.value = false
  }
}

async function submitReset() {
  if (code.value.trim().length !== CODE_LENGTH) return showToast(`请输入 ${CODE_LENGTH} 位短信验证码`)
  saving.value = true
  try {
    await resetPaymentPassword(code.value.trim(), password.value)
    showToast('支付密码已重置')
    visible.value = false
    emit('success')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '重置失败')
  } finally {
    saving.value = false
  }
}

function backToPassword() {
  flow.value = props.hasPassword ? 'modify' : 'set'
  modifyStep.value = 'old'
  setStep.value = 'new'
  oldPassword.value = ''
  password.value = ''
  confirmPassword.value = ''
  code.value = ''
}

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <van-popup
    v-model:show="visible"
    position="bottom"
    round
    class="pay-password-popup"
    :close-on-click-overlay="!saving"
  >
    <div class="popup-head">
      <button type="button" @click="close">取消</button>
      <h2>{{ title }}</h2>
      <span />
    </div>

    <div class="popup-body">
      <p class="tip">{{ stepHint }}</p>
      <span class="pin-label">{{ activeLabel }}</span>

      <div
        class="password-grid"
        :class="{ code: !showDots, 'code-4': flow === 'forgot' && forgotStep === 'code' }"
      >
        <i v-for="n in inputLength" :key="n">
          <template v-if="showDots">{{ activeValue.length >= n ? '●' : '' }}</template>
          <template v-else>{{ activeValue[n - 1] || '' }}</template>
        </i>
      </div>

      <button
        v-if="flow === 'forgot' && forgotStep === 'code'"
        type="button"
        class="send-code"
        :disabled="sending || countdown > 0"
        @click="sendCode"
      >
        {{ countdown > 0 ? `${countdown}s 后重发` : '获取验证码' }}
      </button>

      <div class="number-keyboard" aria-label="数字键盘">
        <button
          v-for="n in 9"
          :key="n"
          type="button"
          :disabled="saving"
          @click="appendDigit(String(n))"
        >
          {{ n }}
        </button>
        <span />
        <button type="button" :disabled="saving" @click="appendDigit('0')">0</button>
        <button type="button" class="delete-key" aria-label="删除" :disabled="saving" @click="deleteDigit">
          ⌫
        </button>
      </div>

      <button class="primary" type="button" :disabled="!canPrimary" @click="onPrimary">
        {{ primaryText }}
      </button>

      <button
        v-if="flow !== 'forgot' && hasPassword && modifyStep === 'old'"
        type="button"
        class="forgot"
        @click="openForgot"
      >
        忘记支付密码？
      </button>
      <button v-if="flow === 'forgot'" type="button" class="forgot" @click="backToPassword">
        返回密码验证
      </button>
    </div>
  </van-popup>
</template>

<style scoped>
.pay-password-popup {
  background: var(--pulse-surface-low);
  color: var(--pulse-text);
  padding-bottom: calc(10px + env(safe-area-inset-bottom));
  max-height: min(92vh, 100dvh);
  overflow: auto;
}

.popup-head {
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--pulse-divider, #2a2a2d);
  padding: 0 18px;
}

.popup-head h2 {
  font-size: 17px;
  margin: 0;
  color: var(--pulse-text);
}

.popup-head button {
  border: 0;
  background: none;
  color: var(--pulse-text-secondary, #aaa);
  font-size: 15px;
}

.popup-head span {
  width: 32px;
}

.popup-body {
  padding: 16px 18px 8px;
}

.tip {
  color: var(--pulse-text-secondary, #929298);
  font-size: 13px;
  line-height: 1.5;
  margin: 0 0 14px;
  text-align: center;
}

.pin-label {
  display: block;
  text-align: center;
  color: var(--pulse-text-secondary, #aaa);
  font-size: 12px;
  margin-bottom: 10px;
}

.password-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  height: 46px;
  border: 1px solid var(--pulse-border, #424247);
  border-radius: 10px;
  overflow: hidden;
  background: var(--pulse-surface-container, var(--pulse-surface-low));
}

.password-grid.code-4 {
  grid-template-columns: repeat(4, 1fr);
}

.password-grid i {
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid var(--pulse-border, #424247);
  color: var(--pulse-text);
  font-size: 16px;
  font-style: normal;
  font-weight: 600;
}

.password-grid i:last-child {
  border-right: 0;
}

.password-grid.code i {
  font-size: 18px;
  letter-spacing: 0;
}

.send-code {
  display: block;
  margin: 12px auto 0;
  border: 0;
  background: none;
  color: #07c160;
  font-size: 14px;
  font-weight: 600;
}

.send-code:disabled {
  opacity: 0.45;
}

.number-keyboard {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 16px;
}

.number-keyboard button,
.number-keyboard span {
  height: 46px;
  border: 0;
  border-radius: 10px;
  background: var(--pulse-surface-highest, #2a2b30);
  color: var(--pulse-text);
  font-size: 22px;
  font-weight: 500;
}

.number-keyboard button:active {
  opacity: 0.72;
}

.number-keyboard button:disabled {
  opacity: 0.45;
}

.number-keyboard .delete-key {
  color: var(--pulse-text-secondary);
  font-size: 20px;
}

.primary {
  width: 100%;
  border: 0;
  border-radius: 9px;
  background: #07c160;
  color: #fff;
  font-size: 16px;
  padding: 12px;
  margin-top: 14px;
}

.primary:disabled {
  opacity: 0.45;
}

.forgot {
  display: block;
  margin: 12px auto 0;
  border: 0;
  background: none;
  color: var(--pulse-primary, #8ca5d1);
  font-size: 14px;
}
</style>

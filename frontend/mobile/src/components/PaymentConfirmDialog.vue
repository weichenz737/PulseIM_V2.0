<script setup lang="ts">
import { ref, watch } from 'vue'
import { yuan } from '@/api/wallet'

const props = defineProps<{
  amount: number
  description: string
  submitting?: boolean
}>()

const emit = defineEmits<{
  confirm: [password: string]
  forgot: []
}>()

const visible = defineModel<boolean>({ default: false })
const password = ref('')

watch(visible, (next) => {
  if (next) password.value = ''
})

watch(() => props.submitting, (next, previous) => {
  if (previous && !next) password.value = ''
})

function appendPassword(value: string) {
  if (!props.submitting && password.value.length < 6) password.value += value
}

function deletePasswordDigit() {
  if (!props.submitting) password.value = password.value.slice(0, -1)
}

function confirm() {
  if (password.value.length !== 6 || props.submitting) return
  emit('confirm', password.value)
}

function openPasswordSettings() {
  visible.value = false
  emit('forgot')
}
</script>

<template>
  <van-popup
    v-model:show="visible"
    round
    position="bottom"
    class="payment-confirm-popup"
    :close-on-click-overlay="!submitting"
  >
    <div class="payment-confirm-head">
      <button type="button" @click="visible = false">取消</button>
      <strong>请输入支付密码</strong>
      <span />
    </div>
    <div class="payment-confirm-body">
      <p>{{ description }}</p>
      <b>{{ yuan(amount) }}</b>
      <div class="payment-password-grid">
        <i v-for="n in 6" :key="n">{{ password.length >= n ? '●' : '' }}</i>
      </div>
      <div class="payment-number-keyboard" aria-label="支付密码数字键盘">
        <button v-for="n in 9" :key="n" type="button" :disabled="submitting" @click="appendPassword(String(n))">
          {{ n }}
        </button>
        <span />
        <button type="button" :disabled="submitting" @click="appendPassword('0')">0</button>
        <button type="button" class="delete-key" aria-label="删除" :disabled="submitting" @click="deletePasswordDigit">
          ⌫
        </button>
      </div>
      <button class="confirm-pay" :disabled="submitting || password.length !== 6" @click="confirm">
        {{ submitting ? '处理中…' : '确认支付' }}
      </button>
      <button class="forgot-pay" type="button" @click="openPasswordSettings">
        忘记支付密码？
      </button>
    </div>
  </van-popup>
</template>

<style scoped>
.payment-confirm-popup {
  background: var(--pulse-surface-low);
  color: var(--pulse-text);
  padding-bottom: calc(20px + env(safe-area-inset-bottom));
}

.payment-confirm-head {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  border-bottom: 1px solid var(--pulse-divider);
}

.payment-confirm-head button {
  border: 0;
  background: none;
  color: var(--pulse-text-secondary);
  font-size: 15px;
}

.payment-confirm-head span { width: 32px; }

.payment-confirm-body {
  padding: 22px;
  text-align: center;
}

.payment-confirm-body p {
  margin: 0;
  color: var(--pulse-text-secondary);
}

.payment-confirm-body > b {
  display: block;
  margin: 8px 0 20px;
  font-size: 34px;
  color: var(--pulse-text);
}

.payment-password-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  height: 52px;
  border: 1px solid var(--pulse-border, #38383c);
  border-radius: 10px;
  overflow: hidden;
  background: var(--pulse-surface-container);
}

.payment-password-grid i {
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid var(--pulse-border, #38383c);
  color: var(--pulse-text);
  font-size: 16px;
  font-style: normal;
}

.payment-password-grid i:last-child { border-right: 0; }

.payment-number-keyboard {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 14px;
}

.payment-number-keyboard button,
.payment-number-keyboard span {
  height: 43px;
  border: 0;
  border-radius: 8px;
  background: var(--pulse-surface-highest);
  color: var(--pulse-text);
  font-size: 21px;
}

.payment-number-keyboard button:active { opacity: 0.75; }
.payment-number-keyboard button:disabled { opacity: 0.6; }
.payment-number-keyboard .delete-key { color: var(--pulse-text-secondary); font-size: 22px; }

.confirm-pay {
  width: 100%;
  height: 46px;
  margin-top: 18px;
  border: 0;
  border-radius: 9px;
  background: #07c160;
  color: #fff;
  font-size: 16px;
}

.confirm-pay:disabled { opacity: 0.4; }

.forgot-pay {
  margin-top: 15px;
  border: 0;
  background: none;
  color: var(--pulse-primary);
}
</style>

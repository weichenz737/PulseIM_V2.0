<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { fetchConversations, fetchGroupDetail } from '@/api/conversation'
import { fetchWallet, fetchWalletAmountConfig, sendRedPacket, sendTransfer, yuan } from '@/api/wallet'
import { useUserStore } from '@/stores/user'
import PaymentPasswordDialog from '@/components/PaymentPasswordDialog.vue'
import PaymentConfirmDialog from '@/components/PaymentConfirmDialog.vue'

const route = useRoute()
const router = useRouter()
const user = useUserStore()
const mode = computed(() => route.meta.mode as 'red-packet' | 'transfer')
const conversationId = String(route.params.id)
const isGroup = ref(false)
const members = ref<Array<{ userId: string; nickname: string }>>([])
const amount = ref('')
const count = ref('1')
const packetType = ref('LUCKY')
const targetUserId = ref('')
const remark = ref('')
const hasPassword = ref(false)
const submitting = ref(false)
const passwordDialog = ref(false)
const payPasswordVisible = ref(false)
const packetTypePickerVisible = ref(false)
const memberPickerVisible = ref(false)
const amountPattern = /^\d+(?:\.\d{0,2})?$/
const amountIsValid = computed(() => amountPattern.test(amount.value.trim()))
const amountInvalid = computed(() => amount.value.trim().length > 0 && !amountIsValid.value)
const cents = computed(() => amountIsValid.value ? Math.round(Number(amount.value) * 100) : 0)
const amountLimits = ref({ redPacketMaxCents: 20000, transferMaxCents: 1000000 })
const maxAmountCents = computed(() => mode.value === 'red-packet'
  ? amountLimits.value.redPacketMaxCents
  : amountLimits.value.transferMaxCents)
const amountTooHigh = computed(() => cents.value > maxAmountCents.value)
const maxAmountYuan = computed(() => (maxAmountCents.value / 100).toFixed(2))

const packetTypeOptions = [
  { value: 'LUCKY', title: '拼手气红包', description: '金额随机分配，适合群聊一起抢' },
  { value: 'NORMAL', title: '普通红包', description: '每位成员领取相同金额' },
  { value: 'EXCLUSIVE', title: '专属红包', description: '仅指定成员可以领取' },
] as const

const selectedPacketType = computed(() =>
  packetTypeOptions.find((item) => item.value === packetType.value) || packetTypeOptions[0],
)
const selectedMember = computed(() =>
  members.value.find((member) => String(member.userId) === String(targetUserId.value)),
)

function selectPacketType(value: string) {
  packetType.value = value
  if (value !== 'EXCLUSIVE') targetUserId.value = ''
  packetTypePickerVisible.value = false
}

function selectPacketMember(userId: string) {
  targetUserId.value = userId
  memberPickerVisible.value = false
}

onMounted(async () => {
  const [conversations, w, limits] = await Promise.all([
    fetchConversations(),
    fetchWallet(),
    fetchWalletAmountConfig(),
  ])
  const conv = conversations.find((c) => c.id === conversationId)
  if (!conv) throw new Error('会话不存在')
  isGroup.value = conv.type === 'group'
  hasPassword.value = w.hasPaymentPassword
  amountLimits.value = limits
  if (isGroup.value) {
    const g = await fetchGroupDetail(conversationId)
    members.value = g.members
      .filter((m) => String(m.userId) !== user.userId)
      .map((m) => ({ userId: String(m.userId), nickname: m.nickname }))
  } else if (conv.peerUserId) {
    members.value = [{ userId: String(conv.peerUserId), nickname: conv.name }]
  }
  if (mode.value === 'transfer' && members.value.length === 1) {
    targetUserId.value = members.value[0].userId
  }
  if (!hasPassword.value) passwordDialog.value = true
})

async function submit() {
  if (!amount.value.trim()) return showToast('请输入金额')
  if (!amountIsValid.value) return showToast('请输入正确的金额')
  if (cents.value <= 0) return showToast('请输入大于 0 的金额')
  if (amountTooHigh.value) {
    return showToast(`${mode.value === 'red-packet' ? '红包' : '转账'}金额不能超过 ${yuan(maxAmountCents.value)}`)
  }
  if (!hasPassword.value) {
    passwordDialog.value = true
    return
  }
  if (mode.value === 'transfer' && !targetUserId.value) return showToast('请选择收款成员')
  payPasswordVisible.value = true
}

async function confirmPayment(password: string) {
  if (!/^\d{6}$/.test(password)) return showToast('请输入6位支付密码')
  if (!amountIsValid.value) return showToast('请输入正确的金额')
  if (cents.value <= 0) return showToast('请输入大于 0 的金额')
  if (amountTooHigh.value) {
    return showToast(`${mode.value === 'red-packet' ? '红包' : '转账'}金额不能超过 ${yuan(maxAmountCents.value)}`)
  }
  submitting.value = true
  try {
    if (mode.value === 'red-packet') {
      await sendRedPacket({
        conversationId,
        packetType: isGroup.value ? packetType.value : 'PRIVATE',
        targetUserId: packetType.value === 'EXCLUSIVE' ? targetUserId.value : undefined,
        totalAmount: cents.value,
        count: Number(count.value),
        greeting: remark.value,
        paymentPassword: password,
      })
    } else {
      await sendTransfer({
        conversationId,
        receiverId: targetUserId.value,
        amount: cents.value,
        remark: remark.value,
        paymentPassword: password,
      })
    }
    payPasswordVisible.value = false
    showToast(mode.value === 'red-packet' ? '红包已发送' : '转账已发出，等待对方收款')
    router.replace({ path: `/chat/${conversationId}`, query: { ...route.query } })
  } catch (e) {
    showToast(e instanceof Error ? e.message : '操作失败')
  } finally {
    submitting.value = false
  }
}

function passwordReady() {
  hasPassword.value = true
}

function openPasswordSettings() {
  payPasswordVisible.value = false
  passwordDialog.value = true
}
</script>

<template>
  <div class="pay-page">
    <header class="pay-header">
      <button type="button" class="back-btn" aria-label="返回" @click="router.back()">‹</button>
      <h1 class="page-title">{{ mode === 'red-packet' ? '发红包' : '转账' }}</h1>
      <span class="header-space" />
    </header>
    <main>
      <template v-if="mode === 'red-packet' && isGroup">
        <button type="button" class="field-row field-button" @click="packetTypePickerVisible = true">
          <span class="field-row-copy">
            <strong>红包类型</strong>
            <small>{{ selectedPacketType.description }}</small>
          </span>
          <span class="field-row-value">{{ selectedPacketType.title }}</span>
          <span class="material-symbols-outlined field-row-arrow">chevron_right</span>
        </button>
        <button
          v-if="packetType === 'EXCLUSIVE'"
          type="button"
          class="field-row field-button"
          @click="memberPickerVisible = true"
        >
          <span class="field-row-copy">
            <strong>指定成员</strong>
            <small>{{ selectedMember ? '只有该成员可以领取' : '请选择一个群成员' }}</small>
          </span>
          <span class="field-row-value" :class="{ placeholder: !selectedMember }">
            {{ selectedMember?.nickname || '请选择' }}
          </span>
          <span class="material-symbols-outlined field-row-arrow">chevron_right</span>
        </button>
        <label v-if="packetType !== 'EXCLUSIVE'" class="field-row">
          红包个数
          <input v-model="count" type="number" min="1" max="100" />
          <span>个</span>
        </label>
      </template>
      <label v-if="mode === 'transfer' && isGroup" class="field-row">
        收款成员
        <select v-model="targetUserId">
          <option value="">请选择</option>
          <option v-for="m in members" :key="m.userId" :value="m.userId">{{ m.nickname }}</option>
        </select>
      </label>
      <section class="amount">
        <span class="amount-label">金额</span>
        <div class="amount-row">
          <b>¥</b>
          <input
            v-model="amount"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            placeholder="0.00"
            :aria-invalid="amountInvalid"
            :class="{ invalid: amountInvalid || amountTooHigh }"
          />
        </div>
        <small v-if="amountInvalid" class="amount-limit-error">请输入正确的金额</small>
        <small v-else :class="{ 'amount-limit-error': amountTooHigh }">
          {{ mode === 'red-packet' ? `单个红包最高${maxAmountYuan}元` : `单笔转账最高${maxAmountYuan}元` }}
          <template v-if="amountTooHigh">，已超出上限</template>
        </small>
      </section>
      <input
        v-model="remark"
        class="field"
        :placeholder="mode === 'red-packet' ? '恭喜发财，大吉大利' : '添加转账说明'"
      />
      <button
        class="pay-submit"
        :disabled="submitting || !amountIsValid || cents <= 0 || amountTooHigh || (!targetUserId && mode === 'transfer')"
        @click="submit"
      >
        {{
          submitting
            ? '处理中…'
            : mode === 'red-packet'
              ? `塞钱进红包 ${yuan(cents)}`
              : `转账 ${yuan(cents)}`
        }}
      </button>
    </main>
    <van-popup
      v-model:show="packetTypePickerVisible"
      position="bottom"
      round
      closeable
      teleport="body"
      class="payment-picker-popup"
    >
      <div class="payment-picker-head">
        <div>
          <strong>选择红包类型</strong>
          <small>选择后可以随时返回修改</small>
        </div>
      </div>
      <div class="payment-choice-list">
        <button
          v-for="option in packetTypeOptions"
          :key="option.value"
          type="button"
          class="payment-choice"
          :class="{ selected: packetType === option.value }"
          @click="selectPacketType(option.value)"
        >
          <span class="payment-choice-icon">
            <span class="material-symbols-outlined filled">redeem</span>
          </span>
          <span class="payment-choice-copy">
            <strong>{{ option.title }}</strong>
            <small>{{ option.description }}</small>
          </span>
          <span class="material-symbols-outlined payment-choice-check">
            {{ packetType === option.value ? 'check_circle' : 'radio_button_unchecked' }}
          </span>
        </button>
      </div>
    </van-popup>
    <van-popup
      v-model:show="memberPickerVisible"
      position="bottom"
      round
      closeable
      teleport="body"
      class="payment-picker-popup member-picker-popup"
    >
      <div class="payment-picker-head">
        <div>
          <strong>指定领取成员</strong>
          <small>专属红包只能由选中的成员领取</small>
        </div>
      </div>
      <div v-if="members.length" class="payment-member-list">
        <button
          v-for="member in members"
          :key="member.userId"
          type="button"
          class="payment-member-choice"
          :class="{ selected: String(targetUserId) === String(member.userId) }"
          @click="selectPacketMember(member.userId)"
        >
          <span class="payment-member-avatar">{{ member.nickname.slice(0, 1) }}</span>
          <span class="payment-member-name">{{ member.nickname }}</span>
          <span class="material-symbols-outlined payment-choice-check">
            {{ String(targetUserId) === String(member.userId) ? 'check_circle' : 'radio_button_unchecked' }}
          </span>
        </button>
      </div>
      <div v-else class="payment-picker-empty">暂无可指定的群成员</div>
    </van-popup>
    <PaymentConfirmDialog
      v-model="payPasswordVisible"
      :amount="cents"
      :description="mode === 'red-packet' ? '塞钱进红包' : '转账'"
      :submitting="submitting"
      @confirm="confirmPayment"
      @forgot="openPasswordSettings"
    />
    <PaymentPasswordDialog
      v-model="passwordDialog"
      :has-password="hasPassword"
      @success="passwordReady"
    />
  </div>
</template>

<style scoped>
.pay-page {
  min-height: 100vh;
  background: var(--pulse-page-bg, var(--pulse-bg));
  color: var(--pulse-text);
}

.pay-header {
  position: sticky;
  top: 0;
  z-index: 20;
  height: 54px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  padding-top: var(--pulse-header-pad-top);
  box-sizing: content-box;
  background: var(--pulse-nav-bg, var(--pulse-surface-low));
  border-bottom: 1px solid var(--pulse-border, #29292c);
}

.back-btn {
  width: 40px;
  height: 40px;
  border: 0;
  background: none;
  color: var(--pulse-primary);
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
}

.page-title {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--pulse-text);
  pointer-events: none;
}

.header-space {
  width: 40px;
}

main {
  padding: 18px;
}

.field-row,
.amount,
.field {
  box-sizing: border-box;
  width: 100%;
  margin-bottom: 12px;
  padding: 16px;
  border-radius: 12px;
  border: 1px solid var(--pulse-border, var(--pulse-outline-variant));
  background: var(--pulse-surface-container);
}

.field-row {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--pulse-text);
  font-size: 15px;
}

.field-button {
  appearance: none;
  text-align: left;
  cursor: pointer;
}

.field-button:active {
  opacity: 0.78;
}

.field-row-copy {
  display: grid;
  flex: 1;
  min-width: 0;
  gap: 4px;
}

.field-row-copy strong {
  font-size: 15px;
  font-weight: 500;
}

.field-row-copy small {
  overflow: hidden;
  color: var(--pulse-text-secondary, #777);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field-row-value {
  max-width: 42%;
  overflow: hidden;
  color: var(--pulse-primary);
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field-row-value.placeholder {
  color: var(--pulse-text-secondary, #777);
  font-weight: 400;
}

.field-row-arrow {
  flex: 0 0 auto;
  color: var(--pulse-text-secondary, #777);
  font-size: 20px;
}

.field-row input {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: var(--pulse-text);
  text-align: right;
  font-size: 16px;
  line-height: 24px;
  min-height: 32px;
  color-scheme: light dark;
}

.payment-picker-popup {
  max-height: min(76vh, 620px);
  padding: 22px 18px calc(18px + env(safe-area-inset-bottom));
  background: var(--pulse-surface-low);
  color: var(--pulse-text);
}

.payment-picker-head {
  padding: 0 34px 16px 2px;
}

.payment-picker-head div {
  display: grid;
  gap: 5px;
}

.payment-picker-head strong {
  font-size: 19px;
}

.payment-picker-head small {
  color: var(--pulse-text-secondary, #777);
  font-size: 12px;
}

.payment-choice-list,
.payment-member-list {
  display: grid;
  gap: 9px;
  max-height: 52vh;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.payment-choice,
.payment-member-choice {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 68px;
  padding: 11px 12px;
  border: 1px solid var(--pulse-border, var(--pulse-outline-variant));
  border-radius: 14px;
  background: var(--pulse-surface-container);
  color: var(--pulse-text);
  text-align: left;
}

.payment-choice.selected,
.payment-member-choice.selected {
  border-color: color-mix(in srgb, var(--pulse-primary) 60%, var(--pulse-border));
  background: color-mix(in srgb, var(--pulse-primary) 11%, var(--pulse-surface-container));
}

.payment-choice:active,
.payment-member-choice:active {
  transform: scale(0.99);
}

.payment-choice-icon,
.payment-member-avatar {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 13px;
  background: linear-gradient(145deg, #ffcb76, #ef5b42);
  color: #fff;
}

.payment-choice-icon .material-symbols-outlined {
  font-size: 23px;
}

.payment-choice-copy {
  display: grid;
  flex: 1;
  min-width: 0;
  gap: 4px;
}

.payment-choice-copy strong,
.payment-member-name {
  font-size: 15px;
  font-weight: 600;
}

.payment-choice-copy small {
  color: var(--pulse-text-secondary, #777);
  font-size: 12px;
}

.payment-choice-check {
  flex: 0 0 auto;
  color: var(--pulse-primary);
  font-size: 22px;
}

.payment-member-avatar {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: linear-gradient(145deg, #6bb7ff, #4c72e8);
  font-size: 16px;
  font-weight: 700;
}

.payment-member-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.payment-picker-empty {
  padding: 36px 12px;
  color: var(--pulse-text-secondary, #777);
  text-align: center;
  font-size: 13px;
}

.amount {
  display: block;
  padding: 18px 18px 14px;
}

.amount-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--pulse-text-secondary, #777);
}

.amount-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-top: 10px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--pulse-divider);
}

.amount-row b {
  font-size: 28px;
  font-weight: 600;
  color: var(--pulse-text);
}

.amount-row input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--pulse-text);
  font-size: 40px;
  font-weight: 600;
  letter-spacing: -0.5px;
  padding: 4px 0;
}

.amount-row input.invalid {
  color: var(--van-danger-color, #ee0a24);
}

.amount-row input::placeholder {
  color: var(--pulse-outline, #8ca4b5);
  font-weight: 500;
}

.amount small {
  display: block;
  margin-top: 10px;
  color: var(--pulse-text-secondary, #777);
  font-size: 12px;
}

.amount-limit-error {
  color: var(--van-danger-color, #ee0a24) !important;
}

.field {
  color: var(--pulse-text);
  font-size: 15px;
  outline: 0;
}

.field::placeholder {
  color: var(--pulse-outline, #8ca4b5);
}

.pay-submit {
  display: block;
  width: 78%;
  margin: 30px auto;
  background: #07c160;
  color: #fff;
  border: 0;
  border-radius: 8px;
  padding: 14px;
  font-size: 17px;
  font-weight: 600;
  cursor: pointer;
}

.pay-submit:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

</style>

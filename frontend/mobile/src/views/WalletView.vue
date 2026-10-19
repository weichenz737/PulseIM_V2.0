<script setup lang="ts">
defineOptions({ name: 'WalletView' })
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { fetchWallet, fetchWalletTransactions, yuan, type WalletSummary, type WalletTransaction } from '@/api/wallet'
import type { PickerConfirmEventParams } from 'vant'
import PaymentPasswordDialog from '@/components/PaymentPasswordDialog.vue'

const router = useRouter()
const wallet = ref<WalletSummary>({ balance: 0, hasPaymentPassword: false })
const rows = ref<WalletTransaction[]>([])
const type = ref('')
const from = ref('')
const to = ref('')
type DateFilterMode = 'range' | 'year' | 'month' | 'day'
const now = new Date()
const filterMode = ref<DateFilterMode>('range')
const filterYear = ref(String(now.getFullYear()))
const filterMonth = ref(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
const filterDay = ref([
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, '0'),
  String(now.getDate()).padStart(2, '0'),
].join('-'))
const yearOptions = computed(() => {
  const current = now.getFullYear()
  return Array.from({ length: current - 1999 }, (_, index) => String(current - index))
})
const loading = ref(false)
const passwordVisible = ref(false)
const walletDatePickerVisible = ref(false)
const walletDatePickerField = ref<'from' | 'to' | 'day'>('from')
const walletDatePickerBaseMinDate = new Date(1970, 0, 1)
const walletDatePickerToday = new Date()
walletDatePickerToday.setHours(23, 59, 59, 999)
const walletTypePickerVisible = ref(false)
const walletYearPickerVisible = ref(false)
const walletYearPickerValue = ref<string[]>([])
const walletMonthPickerVisible = ref(false)
const walletMonthPickerValue = ref<string[]>([])
const walletTypeOptions = [
  { value: '', label: '全部类型', description: '显示所有收支明细', icon: 'account_balance_wallet' },
  { value: 'RED_PACKET', label: '红包', description: '红包收发记录', icon: 'redeem' },
  { value: 'TRANSFER', label: '转账', description: '好友转账记录', icon: 'currency_yen' },
  { value: 'ADMIN_ADJUST', label: '余额调整', description: '系统或管理员调整记录', icon: 'tune' },
]
const walletYearColumns = computed(() => [
  { values: yearOptions.value.map((year) => ({ text: `${year}年`, value: year })) },
])

const walletMonthColumns = computed(() => {
  const selectedYear = Number(walletMonthPickerValue.value[0] || filterMonth.value.slice(0, 4))
  const currentYear = now.getFullYear()
  const latestMonth = selectedYear === currentYear ? now.getMonth() + 1 : 12
  return [
    { values: yearOptions.value.map((year) => ({ text: `${year}年`, value: year })) },
    {
      values: Array.from({ length: latestMonth }, (_, index) => {
        const month = String(index + 1).padStart(2, '0')
        return { text: `${Number(month)}月`, value: month }
      }),
    },
  ]
})

const filterMonthLabel = computed(() => {
  const match = /^(\d{4})-(\d{2})$/.exec(filterMonth.value)
  return match ? `${match[1]}年${Number(match[2])}月` : '选择月份'
})

const selectedDateRange = computed(() => {
  if (filterMode.value === 'year') {
    const year = Number(filterYear.value)
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return { from: '', to: '' }
    return { from: `${year}-01-01`, to: `${year}-12-31` }
  }
  if (filterMode.value === 'month') {
    const match = /^(\d{4})-(\d{2})$/.exec(filterMonth.value)
    if (!match) return { from: '', to: '' }
    const year = Number(match[1])
    const month = Number(match[2])
    const lastDay = new Date(year, month, 0).getDate()
    return {
      from: `${match[1]}-${match[2]}-01`,
      to: `${match[1]}-${match[2]}-${String(lastDay).padStart(2, '0')}`,
    }
  }
  if (filterMode.value === 'day') {
    return { from: filterDay.value, to: filterDay.value }
  }
  return { from: from.value, to: to.value }
})

const hasFilters = computed(() => type.value || (
  filterMode.value === 'range'
    ? from.value || to.value
    : !!selectedDateRange.value.from
))
const selectedWalletType = computed(() => walletTypeOptions.find((item) => item.value === type.value) || walletTypeOptions[0])

async function load() {
  loading.value = true
  try {
    const range = selectedDateRange.value
    ;[wallet.value, rows.value] = await Promise.all([
      fetchWallet(),
      fetchWalletTransactions({
        type: type.value || undefined,
        from: range.from ? `${range.from}T00:00:00+08:00` : undefined,
        to: range.to ? `${range.to}T23:59:59+08:00` : undefined,
      }),
    ])
  } finally {
    loading.value = false
  }
}
function resetFilters() {
  type.value = ''
  filterMode.value = 'range'
  from.value = ''
  to.value = ''
  void load()
}

function openWalletTypePicker() {
  walletTypePickerVisible.value = true
}

function selectWalletType(value: string) {
  type.value = value
  walletTypePickerVisible.value = false
  void load()
}

function changeDateMode(mode: DateFilterMode) {
  filterMode.value = mode
  void load()
}
function walletDateValue(field: 'from' | 'to' | 'day') {
  return field === 'from' ? from.value : field === 'to' ? to.value : filterDay.value
}
function parseWalletDate(value: string) {
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}
function walletDateDefault(field: 'from' | 'to' | 'day') {
  const value = walletDateValue(field)
  const date = value ? new Date(`${value}T12:00:00`) : new Date()
  return Number.isNaN(date.getTime()) ? new Date() : date
}
const walletDatePickerMinDate = computed(() => {
  if (walletDatePickerField.value === 'to' && from.value) {
    return parseWalletDate(from.value) || walletDatePickerBaseMinDate
  }
  return walletDatePickerBaseMinDate
})
const walletDatePickerMaxDate = computed(() => {
  if (walletDatePickerField.value === 'from' && to.value) {
    const endDate = parseWalletDate(to.value)
    if (endDate && endDate < walletDatePickerToday) return endDate
  }
  return walletDatePickerToday
})
function openWalletDatePicker(field: 'from' | 'to' | 'day') {
  walletDatePickerField.value = field
  walletDatePickerVisible.value = true
}

function openWalletYearPicker() {
  walletYearPickerValue.value = [
    yearOptions.value.includes(filterYear.value)
      ? filterYear.value
      : yearOptions.value[0] || String(now.getFullYear()),
  ]
  walletYearPickerVisible.value = true
}

function pickerValue(value: unknown): string {
  if (value && typeof value === 'object') {
    const option = value as { value?: unknown; text?: unknown }
    return String(option.value ?? option.text ?? '')
  }
  return String(value ?? '')
}

function onWalletYearConfirm({ selectedValues }: PickerConfirmEventParams) {
  const year = pickerValue((selectedValues || [])[0] ?? walletYearPickerValue.value[0])
  if (!/^\d{4}$/.test(year)) return
  filterYear.value = year
  walletYearPickerValue.value = [year]
  walletYearPickerVisible.value = false
  void load()
}
function onWalletDateConfirm(date: Date) {
  const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  if (walletDatePickerField.value === 'from') {
    from.value = value
    if (to.value && to.value < value) to.value = value
  } else if (walletDatePickerField.value === 'to') {
    to.value = from.value && value < from.value ? from.value : value
  } else filterDay.value = value
  walletDatePickerVisible.value = false
  void load()
}
function openWalletMonthPicker() {
  const match = /^(\d{4})-(\d{2})$/.exec(filterMonth.value)
  walletMonthPickerValue.value = [
    match?.[1] || String(now.getFullYear()),
    match?.[2] || String(now.getMonth() + 1).padStart(2, '0'),
  ]
  walletMonthPickerVisible.value = true
}
function onWalletMonthConfirm({ selectedValues }: PickerConfirmEventParams) {
  const [rawYear, rawMonth] = selectedValues || []
  const year = pickerValue(rawYear ?? walletMonthPickerValue.value[0])
  const month = pickerValue(rawMonth ?? walletMonthPickerValue.value[1]).padStart(2, '0')
  if (!year || !month) return
  filterMonth.value = `${year}-${month}`
  walletMonthPickerValue.value = [year, month]
  walletMonthPickerVisible.value = false
  void load()
}
function tradeLabel(value: WalletTransaction['trade_type']) {
  return value === 'RED_PACKET' ? '红包' : value === 'TRANSFER' ? '转账' : '余额调整'
}
function tradeIcon(value: WalletTransaction['trade_type']) {
  return value === 'RED_PACKET' ? 'redeem' : value === 'TRANSFER' ? 'currency_yen' : 'account_balance'
}
function formatTime(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
onMounted(load)
</script>

<template>
  <div class="wallet-page">
    <header class="wallet-header">
      <button type="button" class="back" aria-label="返回" @click="router.back()">‹</button>
      <h1 class="page-title">我的钱包</h1>
      <button type="button" class="setting" @click="passwordVisible = true">支付设置</button>
    </header>
    <main>
      <section class="balance">
        <div class="balance-head">
          <span>钱包余额（元）</span>
          <button
            type="button"
            class="balance-refresh"
            :disabled="loading"
            aria-label="刷新余额"
            @click="load"
          >
            <span class="material-symbols-outlined">refresh</span>
          </button>
        </div>
        <strong class="balance-amount">{{ yuan(wallet.balance) }}</strong>
        <span class="balance-status">{{ wallet.hasPaymentPassword ? '支付密码已设置' : '尚未设置支付密码' }}</span>
      </section>
      <section class="filters">
        <div class="filter-row">
          <span class="filter-label">类型</span>
          <button type="button" class="wallet-type-button" @click="openWalletTypePicker">
            <span class="material-symbols-outlined wallet-type-leading-icon">account_balance_wallet</span>
            <span class="wallet-type-copy">
              <small>交易类型</small>
              <strong>{{ selectedWalletType.label }}</strong>
            </span>
            <span class="material-symbols-outlined wallet-type-chevron">expand_more</span>
          </button>
          <button v-if="hasFilters" type="button" class="reset-filter" @click="resetFilters">
            重置
          </button>
        </div>
        <div class="date-modes" aria-label="日期筛选方式">
          <button
            v-for="item in [
              { value: 'range', label: '自定义' },
              { value: 'year', label: '按年' },
              { value: 'month', label: '按月' },
              { value: 'day', label: '按日' },
            ]"
            :key="item.value"
            type="button"
            :class="{ active: filterMode === item.value }"
            @click="changeDateMode(item.value as DateFilterMode)"
          >
            {{ item.label }}
          </button>
        </div>
        <div v-if="filterMode === 'range'" class="dates">
          <button type="button" class="wallet-date-button" @click="openWalletDatePicker('from')"><span class="material-symbols-outlined">calendar_month</span><span><small>开始日期</small><strong>{{ from || '不限' }}</strong></span></button>
          <span>至</span>
          <button type="button" class="wallet-date-button" @click="openWalletDatePicker('to')"><span class="material-symbols-outlined">calendar_month</span><span><small>结束日期</small><strong>{{ to || '不限' }}</strong></span></button>
        </div>
        <div v-else class="single-date">
           <button v-if="filterMode === 'year'" type="button" class="wallet-date-button" @click="openWalletYearPicker"><span class="material-symbols-outlined">calendar_month</span><span><small>选择年份</small><strong>{{ filterYear }}年</strong></span></button>
           <button v-else-if="filterMode === 'month'" type="button" class="wallet-date-button" @click="openWalletMonthPicker"><span class="material-symbols-outlined">calendar_month</span><span><small>选择月份</small><strong>{{ filterMonthLabel }}</strong></span></button>
          <button v-else type="button" class="wallet-date-button" @click="openWalletDatePicker('day')"><span class="material-symbols-outlined">calendar_month</span><span><small>选择日期</small><strong>{{ filterDay }}</strong></span></button>
        </div>
      </section>
      <section class="list">
        <div class="list-head">
          <h2>收支明细</h2>
          <button type="button" class="refresh-btn" :disabled="loading" @click="load">
            <span class="material-symbols-outlined">refresh</span>
          </button>
        </div>
        <div v-if="loading" class="empty">加载中…</div>
        <article
          v-for="row in rows"
          :key="row.id"
          role="button"
          tabindex="0"
          @click="router.push(`/wallet/transactions/${row.id}`)"
          @keydown.enter.prevent="router.push(`/wallet/transactions/${row.id}`)"
        >
          <span class="row-icon" :class="row.direction === 'IN' ? 'in' : 'out'">
            <span class="material-symbols-outlined">{{ tradeIcon(row.trade_type) }}</span>
          </span>
          <div class="row-main">
            <b>{{ tradeLabel(row.trade_type) }}</b>
            <small>{{ row.remark || row.counterparty_name || row.trade_no }}</small>
            <small class="row-time">{{ formatTime(row.created_at) }}</small>
          </div>
          <div class="money" :class="{ income: row.direction === 'IN' }">
            {{ row.direction === 'IN' ? '+' : '-' }}{{ yuan(row.amount) }}
          </div>
          <span class="row-arrow material-symbols-outlined">chevron_right</span>
        </article>
        <div v-if="!loading && !rows.length" class="empty">暂无收支记录</div>
      </section>
    </main>
    <van-calendar v-model:show="walletDatePickerVisible" teleport="body" :default-date="walletDateDefault(walletDatePickerField)" :min-date="walletDatePickerMinDate" :max-date="walletDatePickerMaxDate" :title="walletDatePickerField === 'from' ? '选择开始日期' : walletDatePickerField === 'to' ? '选择结束日期' : '选择日期'" color="var(--pulse-primary)" :show-confirm="false" @confirm="onWalletDateConfirm" />
    <van-popup v-model:show="walletTypePickerVisible" position="bottom" round closeable teleport="body" class="wallet-type-popup">
      <section class="wallet-type-sheet">
        <div class="wallet-type-heading">
          <span><small>钱包筛选</small><strong>选择交易类型</strong></span>
          <span class="material-symbols-outlined">filter_alt</span>
        </div>
        <div class="wallet-type-options">
          <button
            v-for="item in walletTypeOptions"
            :key="item.value || 'all'"
            type="button"
            class="wallet-type-option"
            :class="{ selected: type === item.value }"
            @click="selectWalletType(item.value)"
          >
            <span class="wallet-type-option-icon" :class="{ selected: type === item.value }">
              <span class="material-symbols-outlined">{{ item.icon }}</span>
            </span>
            <span class="wallet-type-option-copy"><strong>{{ item.label }}</strong><small>{{ item.description }}</small></span>
            <span v-if="type === item.value" class="material-symbols-outlined wallet-type-check">check_circle</span>
          </button>
        </div>
      </section>
    </van-popup>
    <van-popup v-model:show="walletYearPickerVisible" position="bottom" round closeable teleport="body" class="wallet-picker-popup">
      <section class="wallet-picker-sheet">
        <div class="wallet-picker-heading">
          <span><small>钱包筛选</small><strong>选择年份</strong></span>
          <span class="material-symbols-outlined">event</span>
        </div>
        <van-picker v-model="walletYearPickerValue" :columns="walletYearColumns" :show-toolbar="false" @confirm="onWalletYearConfirm" @cancel="walletYearPickerVisible = false" />
        <button type="button" class="wallet-picker-confirm" @click="onWalletYearConfirm({ selectedValues: walletYearPickerValue } as PickerConfirmEventParams)">完成</button>
      </section>
    </van-popup>
    <van-popup v-model:show="walletMonthPickerVisible" position="bottom" round closeable teleport="body" class="wallet-picker-popup">
      <section class="wallet-picker-sheet">
        <div class="wallet-picker-heading">
          <span><small>钱包筛选</small><strong>选择月份</strong></span>
          <span class="material-symbols-outlined">calendar_month</span>
        </div>
        <van-picker v-model="walletMonthPickerValue" :columns="walletMonthColumns" :show-toolbar="false" @confirm="onWalletMonthConfirm" @cancel="walletMonthPickerVisible = false" />
        <button type="button" class="wallet-picker-confirm" @click="onWalletMonthConfirm({ selectedValues: walletMonthPickerValue } as PickerConfirmEventParams)">完成</button>
      </section>
    </van-popup>
    <PaymentPasswordDialog
      v-model="passwordVisible"
      :has-password="wallet.hasPaymentPassword"
      @success="load"
    />
  </div>
</template>

<style scoped>
.wallet-page {
  min-height: 100vh;
  background: var(--pulse-page-bg, var(--pulse-bg));
  color: var(--pulse-text);
}

.wallet-header {
  position: sticky;
  top: 0;
  z-index: 2;
  height: 54px;
  background: var(--pulse-page-bg, var(--pulse-bg));
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  padding-top: var(--pulse-header-pad-top);
  box-sizing: content-box;
  border-bottom: 1px solid var(--pulse-border, #29292c);
}

.wallet-header .page-title {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  font-size: 18px;
  margin: 0;
  color: var(--pulse-text);
  pointer-events: none;
}

.back,
.setting {
  border: 0;
  background: none;
  color: var(--pulse-text);
  z-index: 2;
}

.back {
  width: 40px;
  font-size: 29px;
  color: var(--pulse-primary);
}

.setting {
  font-size: 14px;
  color: #07c160;
}

main {
  padding: 14px 14px 28px;
}

.balance {
  position: relative;
  overflow: hidden;
  background: var(--pulse-primary-gradient);
  border-radius: 18px;
  padding: 22px 22px 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #fff;
  box-shadow: 0 10px 26px rgba(0, 90, 200, 0.22);
}

.balance-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.balance-head span {
  font-size: 13px;
  opacity: 0.88;
}

.balance-refresh {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  display: grid;
  place-items: center;
  cursor: pointer;
}

.balance-refresh:disabled {
  opacity: 0.55;
}

.balance-refresh .material-symbols-outlined {
  font-size: 18px;
}

.balance-amount {
  font-size: 40px;
  letter-spacing: -1px;
  line-height: 1.2;
  font-weight: 700;
}

.balance-status {
  font-size: 12px;
  opacity: 0.82;
}

.filters,
.list {
  margin-top: 14px;
  background: var(--pulse-surface-container);
  border: 1px solid var(--pulse-border, #29292c);
  border-radius: 12px;
}

.filters {
  padding: 12px;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.filter-label {
  flex-shrink: 0;
  font-size: 13px;
  color: var(--pulse-text-secondary);
}

.filters select,
.filters input {
  box-sizing: border-box;
  background: var(--pulse-input-bg, #252528);
  color: var(--pulse-text);
  border: 1px solid var(--pulse-border, #36363a);
  border-radius: 7px;
  padding: 8px 10px;
  min-height: 42px;
  font-size: 15px;
  line-height: 24px;
  color-scheme: light dark;
}

.filters select {
  flex: 1;
  min-width: 0;
  height: 42px;
  -webkit-appearance: menulist;
  appearance: auto;
}

.wallet-type-button {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 8px;
  height: 46px;
  padding: 6px 10px;
  border: 1px solid var(--pulse-border, #36363a);
  border-radius: 10px;
  background: var(--pulse-input-bg, #252528);
  color: var(--pulse-text);
  text-align: left;
}

.wallet-type-button:active {
  opacity: 0.76;
}

.wallet-type-leading-icon,
.wallet-type-chevron {
  flex: none;
  color: var(--pulse-primary);
  font-size: 20px;
}

.wallet-type-chevron {
  color: var(--pulse-text-secondary);
  font-size: 19px;
}

.wallet-type-copy,
.wallet-type-option-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.wallet-type-copy small,
.wallet-type-heading small {
  color: var(--pulse-text-secondary);
  font-size: 10px;
}

.wallet-type-copy strong {
  overflow: hidden;
  font-size: 13px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dates {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dates input,
.single-date input {
  min-width: 0;
  width: 100%;
}

.dates span {
  color: var(--pulse-text-secondary, #777);
}

.date-modes {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 12px;
}

.date-modes button {
  min-width: 0;
  height: 34px;
  padding: 0 4px;
  border: 1px solid var(--pulse-border, #36363a);
  border-radius: 8px;
  background: var(--pulse-input-bg, #252528);
  color: var(--pulse-text-secondary, #858a98);
  font-size: 13px;
}

.date-modes button.active {
  border-color: var(--pulse-primary);
  background: color-mix(in srgb, var(--pulse-primary) 14%, transparent);
  color: var(--pulse-primary);
  font-weight: 600;
}

.wallet-date-button{display:flex;min-width:0;flex:1;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--pulse-border,#36363a);border-radius:11px;background:var(--pulse-input-bg,#252528);color:var(--pulse-text);text-align:left}.wallet-date-button>.material-symbols-outlined{flex:none;color:var(--pulse-primary);font-size:19px}.wallet-date-button>span:nth-child(2){display:flex;min-width:0;flex:1;flex-direction:column;gap:2px}.wallet-date-button small{color:var(--pulse-text-secondary);font-size:10px}.wallet-date-button strong{overflow:hidden;font-size:12px;font-weight:650;text-overflow:ellipsis;white-space:nowrap}.single-date .wallet-date-button{width:100%}

.wallet-picker-popup {
  overflow: hidden;
  background: var(--pulse-surface-container);
  color: var(--pulse-text);
}

.wallet-picker-sheet {
  padding: 16px 16px calc(18px + var(--pulse-safe-bottom, env(safe-area-inset-bottom, 0px)));
}

.wallet-picker-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 30px 8px 0;
}

.wallet-picker-heading > span:first-child {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.wallet-picker-heading small {
  color: var(--pulse-text-secondary);
  font-size: 11px;
}

.wallet-picker-heading strong {
  font-size: 19px;
  font-weight: 750;
}

.wallet-picker-heading > .material-symbols-outlined {
  color: var(--pulse-primary);
  font-size: 24px;
}

.wallet-picker-sheet :deep(.van-picker) {
  background: transparent;
  color: var(--pulse-text);
}

.wallet-picker-sheet :deep(.van-picker__mask) {
  background-image: linear-gradient(180deg, var(--pulse-surface-container), rgba(0, 0, 0, 0)), linear-gradient(0deg, var(--pulse-surface-container), rgba(0, 0, 0, 0));
}

.wallet-picker-sheet :deep(.van-picker-column__item) {
  color: var(--pulse-text-secondary);
}

.wallet-picker-sheet :deep(.van-picker-column__item--selected) {
  color: var(--pulse-primary);
  font-weight: 700;
}

.wallet-picker-confirm {
  width: 100%;
  height: 44px;
  margin-top: 10px;
  border: 0;
  border-radius: 13px;
  background: var(--pulse-primary);
  color: var(--pulse-on-primary, #fff);
  font-size: 14px;
  font-weight: 700;
}

.wallet-type-popup {
  background: var(--pulse-surface-container);
  color: var(--pulse-text);
}

.wallet-type-sheet {
  padding: 14px 16px calc(18px + env(safe-area-inset-bottom));
}

.wallet-type-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 2px 28px 14px 0;
}

.wallet-type-heading > span:first-child {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.wallet-type-heading strong {
  font-size: 18px;
  font-weight: 700;
}

.wallet-type-heading > .material-symbols-outlined {
  color: var(--pulse-primary);
  font-size: 22px;
}

.wallet-type-options {
  display: grid;
  gap: 9px;
}

.wallet-type-option {
  display: flex;
  width: 100%;
  min-height: 60px;
  align-items: center;
  gap: 11px;
  padding: 9px 11px;
  border: 1px solid var(--pulse-border, #36363a);
  border-radius: 12px;
  background: var(--pulse-input-bg, #252528);
  color: var(--pulse-text);
  text-align: left;
}

.wallet-type-option.selected {
  border-color: color-mix(in srgb, var(--pulse-primary) 72%, transparent);
  background: color-mix(in srgb, var(--pulse-primary) 12%, var(--pulse-input-bg, #252528));
}

.wallet-type-option:active {
  opacity: 0.76;
}

.wallet-type-option-icon {
  display: grid;
  width: 38px;
  height: 38px;
  flex: none;
  place-items: center;
  border-radius: 11px;
  background: color-mix(in srgb, var(--pulse-text-secondary) 12%, transparent);
  color: var(--pulse-text-secondary);
}

.wallet-type-option-icon.selected {
  background: color-mix(in srgb, var(--pulse-primary) 16%, transparent);
  color: var(--pulse-primary);
}

.wallet-type-option-copy strong {
  font-size: 14px;
  font-weight: 650;
}

.wallet-type-option-copy small {
  overflow: hidden;
  color: var(--pulse-text-secondary);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wallet-type-check {
  flex: none;
  color: var(--pulse-primary);
  font-size: 21px;
}

.list {
  padding: 0 15px;
}

.list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--pulse-border, #29292c);
}

.list h2 {
  font-size: 15px;
  padding: 15px 0;
  margin: 0;
  color: var(--pulse-text);
}

.refresh-btn {
  width: 34px;
  height: 34px;
  border: none;
  background: transparent;
  color: var(--pulse-primary);
  display: grid;
  place-items: center;
  cursor: pointer;
}

.refresh-btn:disabled {
  opacity: 0.5;
}

.refresh-btn .material-symbols-outlined {
  font-size: 20px;
}

.list article {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 13px 0;
  border-bottom: 1px solid var(--pulse-border, #29292c);
  padding-right: 24px;
  cursor: pointer;
}

.list article:active {
  opacity: .72;
}

.row-arrow {
  position: absolute;
  top: 50%;
  right: -5px;
  color: var(--pulse-outline);
  font-size: 20px;
  transform: translateY(-50%);
}

.row-icon {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: grid;
  place-items: center;
}

.row-icon .material-symbols-outlined {
  font-size: 20px;
}

.row-icon.in {
  background: rgba(7, 193, 96, 0.14);
  color: #07c160;
}

.row-icon.out {
  background: rgba(75, 142, 255, 0.14);
  color: var(--pulse-primary);
}

.row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.row-main b {
  font-size: 15px;
  font-weight: 600;
  color: var(--pulse-text);
}

.row-main small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-main .row-time {
  font-size: 11px;
}

.list article > div {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.list small {
  color: var(--pulse-text-secondary, #777);
  font-size: 12px;
}

.money {
  text-align: right;
  font-weight: 600;
  flex-shrink: 0;
  color: var(--pulse-text);
}

.money.income {
  color: #07c160;
}

.empty {
  text-align: center;
  color: var(--pulse-text-secondary, #777);
  padding: 42px;
}

.reset-filter {
  flex-shrink: 0;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid var(--pulse-border, rgba(75, 142, 255, 0.38));
  border-radius: 7px;
  background: transparent;
  color: var(--pulse-primary);
  font-size: 13px;
}

.reset-filter:active {
  opacity: 0.72;
}
</style>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchRedPacket, fetchTransfer, fetchWalletTransaction, yuan, type WalletTransaction } from '@/api/wallet'
import { smartBack } from '@/utils/navBack'

const route = useRoute()
const router = useRouter()
const item = ref<WalletTransaction | null>(null)
const business = ref<Record<string, unknown> | null>(null)
const loading = ref(true)
const error = ref('')

const typeLabel = computed(() => {
  if (item.value?.trade_type === 'RED_PACKET') return '红包'
  if (item.value?.trade_type === 'TRANSFER') return '转账'
  return '余额调整'
})
const directionLabel = computed(() => item.value?.direction === 'IN' ? '收入' : '支出')
const statusLabel = computed(() => {
  const status = String(business.value?.status || '')
  return ({ ACTIVE: '领取中', FINISHED: '已完成', PENDING: '待收款', RECEIVED: '已收款', EXPIRED: '已过期' } as Record<string, string>)[status] || status
})
const packetTypeLabel = computed(() => {
  const value = String(business.value?.packet_type || '')
  return ({ NORMAL: '普通红包', LUCKY: '拼手气红包', EXCLUSIVE: '专属红包' } as Record<string, string>)[value] || value
})

function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString() : '-'
}

onMounted(async () => {
  try {
    item.value = await fetchWalletTransaction(String(route.params.id))
    if (item.value.trade_type === 'RED_PACKET') {
      business.value = await fetchRedPacket(item.value.trade_no).catch(() => null)
    } else if (item.value.trade_type === 'TRANSFER') {
      business.value = await fetchTransfer(item.value.trade_no).catch(() => null)
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '收支详情加载失败'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="transaction-detail-page">
    <header class="page-header">
      <button type="button" class="icon-btn" aria-label="返回" @click="smartBack(router, '/wallet')">
        <span class="material-symbols-outlined">arrow_back_ios</span>
      </button>
      <h1 class="page-title">收支详情</h1>
      <span class="header-space" />
    </header>

    <div v-if="loading" class="state">加载中...</div>
    <div v-else-if="error || !item" class="state">{{ error || '收支记录不存在' }}</div>
    <main v-else>
      <section class="amount-card">
        <span>{{ typeLabel }}{{ directionLabel }}</span>
        <strong :class="{ income: item.direction === 'IN' }">
          {{ item.direction === 'IN' ? '+' : '-' }}{{ yuan(item.amount) }}
        </strong>
        <small v-if="statusLabel">{{ statusLabel }}</small>
      </section>

      <section class="detail-card">
        <div><span>交易类型</span><b>{{ typeLabel }}</b></div>
        <div><span>收支类型</span><b>{{ directionLabel }}</b></div>
        <div v-if="item.counterparty_name"><span>交易对象</span><b>{{ item.counterparty_name }}</b></div>
        <div v-if="packetTypeLabel"><span>红包类型</span><b>{{ packetTypeLabel }}</b></div>
        <div v-if="business?.greeting"><span>红包祝福语</span><b>{{ business.greeting }}</b></div>
        <div v-if="business?.total_count"><span>红包个数</span><b>{{ business.received_count || 0 }}/{{ business.total_count }}</b></div>
        <div v-if="item.remark"><span>备注</span><b>{{ item.remark }}</b></div>
        <div><span>交易后余额</span><b>{{ yuan(item.balance_after) }}</b></div>
        <div><span>交易时间</span><b>{{ formatTime(item.created_at) }}</b></div>
        <div><span>交易单号</span><b class="trade-no">{{ item.trade_no }}</b></div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.transaction-detail-page{min-height:100dvh;background:var(--pulse-page-bg,var(--pulse-bg));color:var(--pulse-text)}
.page-header{position:sticky;top:0;z-index:10;display:flex;align-items:center;height:56px;padding:var(--pulse-header-pad-top) 12px 0;background:var(--pulse-page-bg,var(--pulse-bg))}
.icon-btn,.header-space{width:40px;height:40px}.icon-btn{display:grid;place-items:center;border:0;background:transparent;color:var(--pulse-primary)}
.page-title{flex:1;margin:0;text-align:center;font-size:18px}.state{padding:60px 20px;text-align:center;color:var(--pulse-text-secondary)}
main{padding:16px}.amount-card,.detail-card{border:1px solid var(--pulse-border);border-radius:14px;background:var(--pulse-surface-container)}
.amount-card{display:flex;flex-direction:column;align-items:center;padding:30px 16px;gap:9px}.amount-card span,.amount-card small{color:var(--pulse-text-secondary)}
.amount-card strong{font-size:36px}.amount-card strong.income{color:#07c160}
.detail-card{margin-top:14px;padding:0 16px}.detail-card>div{display:flex;justify-content:space-between;gap:20px;padding:15px 0;border-bottom:1px solid var(--pulse-divider)}
.detail-card>div:last-child{border-bottom:0}.detail-card span{flex:none;color:var(--pulse-text-secondary)}.detail-card b{min-width:0;text-align:right;font-size:14px;font-weight:500;overflow-wrap:anywhere}
.trade-no{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px!important}
</style>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from '@/utils/elementFeedback'
import {
  fetchCommunityIncomeDetails,
  fetchCommunityOrders,
  type AdminCommunityIncome,
  type AdminCommunityOrder,
} from '@/api/communities'
import { formatTime } from '@/utils/datetime'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const orders = ref<AdminCommunityOrder[]>([])
const incomes = ref<AdminCommunityIncome[]>([])
const total = ref(0)
const query = reactive({ keyword: '', status: 'PAID', page: 1, size: 20 })

const activeTab = computed(() => String(route.meta.financeTab || (route.name === 'CommunityIncome' ? 'income' : 'orders')))
const isOrders = computed(() => activeTab.value === 'orders')
const title = computed(() => isOrders.value ? '圈子订单' : '圈主收益明细')
const description = computed(() => isOrders.value
  ? '查看用户花费 PLU 加入付费圈子的订单及分成结果。'
  : '查看每笔付费进圈订单对应的圈主实际收益。')

function money(value: number | undefined) {
  return `${(Number(value || 0) / 100).toFixed(2)} PLU`
}

function statusLabel(status: string) {
  return ({ PAID: '已支付', REFUNDED: '已退款', CLOSED: '已关闭' } as Record<string, string>)[status] || status || '—'
}

async function load() {
  loading.value = true
  try {
    if (isOrders.value) {
      const data = await fetchCommunityOrders({
        keyword: query.keyword || undefined,
        status: query.status || undefined,
        page: query.page,
        size: query.size,
      })
      orders.value = data.items || []
      total.value = data.total || 0
    } else {
      const data = await fetchCommunityIncomeDetails({
        keyword: query.keyword || undefined,
        page: query.page,
        size: query.size,
      })
      incomes.value = data.items || []
      total.value = data.total || 0
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : `${title.value}加载失败`)
  } finally {
    loading.value = false
  }
}

function switchTab(tab: 'orders' | 'income') {
  const path = tab === 'orders' ? '/community-orders' : '/community-income'
  if (route.path !== path) router.push(path)
}

function search() {
  query.page = 1
  void load()
}

function reset() {
  query.keyword = ''
  query.status = 'PAID'
  query.page = 1
  void load()
}

watch(() => route.path, () => {
  query.page = 1
  void load()
})

onMounted(load)
</script>

<template>
  <div class="finance-page">
    <div class="finance-heading">
      <div>
        <div class="eyebrow">PULSE ADMIN / CIRCLE FINANCE</div>
        <h2>{{ title }}</h2>
        <p>{{ description }}</p>
      </div>
      <div class="finance-summary">
        <Money class="finance-icon" />
        <div><b>{{ total }}</b><small>{{ isOrders ? '符合条件的订单' : '收益明细' }}</small></div>
      </div>
    </div>

    <div class="finance-tabs">
      <button :class="{ active: isOrders }" type="button" @click="switchTab('orders')">
        <Tickets class="finance-icon" />圈子订单
      </button>
      <button :class="{ active: !isOrders }" type="button" @click="switchTab('income')">
        <Money class="finance-icon" />圈主收益明细
      </button>
    </div>

    <el-card shadow="never" class="filter-card">
      <el-form inline @submit.prevent="search">
        <el-form-item label="关键词">
          <el-input v-model="query.keyword" clearable :placeholder="isOrders ? '圈子、圈主、购买人或订单号' : '圈子、圈主、购买人或订单号'" style="width: 310px" @keyup.enter="search" />
        </el-form-item>
        <el-form-item v-if="isOrders" label="订单状态">
          <el-select v-model="query.status" clearable style="width: 140px">
            <el-option label="已支付" value="PAID" />
            <el-option label="已退款" value="REFUNDED" />
            <el-option label="已关闭" value="CLOSED" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="search">查询</el-button>
          <el-button @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="table-card">
      <el-table v-if="isOrders" v-loading="loading" :data="orders" stripe>
        <el-table-column prop="order_no" label="订单号" min-width="205" />
        <el-table-column label="圈子 / 圈主" min-width="190">
          <template #default="{ row }"><b>{{ row.community_name }}</b><div class="sub">圈主：{{ row.owner_name }}</div></template>
        </el-table-column>
        <el-table-column label="购买人" min-width="170">
          <template #default="{ row }"><b>{{ row.buyer_name }}</b><div class="sub">{{ row.buyer_pulse_id || row.buyer_phone || `ID ${row.buyer_id}` }}</div></template>
        </el-table-column>
        <el-table-column label="订单金额" width="125"><template #default="{ row }">{{ money(row.amount) }}</template></el-table-column>
        <el-table-column label="平台分成" width="125"><template #default="{ row }">{{ money(row.platform_fee) }}</template></el-table-column>
        <el-table-column label="圈主收益" width="125"><template #default="{ row }"><strong class="income">{{ money(row.owner_income) }}</strong></template></el-table-column>
        <el-table-column label="状态" width="95"><template #default="{ row }"><el-tag type="success">{{ statusLabel(row.status) }}</el-tag></template></el-table-column>
        <el-table-column label="支付时间" width="180"><template #default="{ row }">{{ formatTime(row.created_at) }}</template></el-table-column>
      </el-table>

      <el-table v-else v-loading="loading" :data="incomes" stripe>
        <el-table-column label="圈主" min-width="180">
          <template #default="{ row }"><b>{{ row.owner_name }}</b><div class="sub">{{ row.owner_pulse_id || row.owner_phone || `ID ${row.owner_id}` }}</div></template>
        </el-table-column>
        <el-table-column label="圈子" min-width="160" prop="community_name" />
        <el-table-column label="购买人" min-width="170">
          <template #default="{ row }"><b>{{ row.buyer_name }}</b><div class="sub">{{ row.buyer_pulse_id || row.buyer_phone || `ID ${row.buyer_id}` }}</div></template>
        </el-table-column>
        <el-table-column prop="order_no" label="订单号" min-width="205" />
        <el-table-column label="订单金额" width="125"><template #default="{ row }">{{ money(row.order_amount) }}</template></el-table-column>
        <el-table-column label="平台分成" width="125"><template #default="{ row }">{{ money(row.platform_fee) }}</template></el-table-column>
        <el-table-column label="圈主收益" width="135"><template #default="{ row }"><strong class="income">{{ money(row.income_amount) }}</strong></template></el-table-column>
        <el-table-column label="入账时间" width="180"><template #default="{ row }">{{ formatTime(row.created_at) }}</template></el-table-column>
      </el-table>
      <el-empty v-if="!loading && (isOrders ? !orders.length : !incomes.length)" description="暂无相关记录" />
      <div class="pager">
        <el-pagination v-model:current-page="query.page" v-model:page-size="query.size" :total="total" :page-sizes="[10, 20, 50]" layout="total, sizes, prev, pager, next" background @current-change="load" @size-change="query.page = 1; load()" />
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.finance-page { width: 100%; max-width: 1680px; margin: 0 auto; padding-bottom: 24px; }
.finance-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 18px; }
.eyebrow { color: #3b82f6; font-size: 11px; font-weight: 700; letter-spacing: .12em; }
h2 { margin: 6px 0 7px; color: #1f2937; font-size: 27px; line-height: 1.25; }
.finance-heading p { margin: 0; color: #8b95a7; font-size: 14px; }
.finance-summary { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border: 1px solid #e8eef8; border-radius: 14px; background: #f8fbff; color: #2563eb; }
.finance-icon { width: 20px; height: 20px; flex: none; }
.finance-summary .finance-icon { width: 25px; height: 25px; }
.finance-summary div { display: flex; flex-direction: column; gap: 2px; }
.finance-summary b { color: #1f2937; font-size: 20px; }
.finance-summary small { color: #8b95a7; }
.finance-tabs { display: flex; gap: 8px; margin-bottom: 14px; }
.finance-tabs button { display: inline-flex; align-items: center; gap: 7px; padding: 10px 15px; border: 1px solid #e3eaf5; border-radius: 10px; background: #fff; color: #697386; cursor: pointer; font-size: 14px; transition: .2s; }
.finance-tabs button:hover { color: #2563eb; border-color: #b9d0f8; }
.finance-tabs button.active { border-color: #3b82f6; background: #eff6ff; color: #2563eb; font-weight: 600; }
.filter-card { margin-bottom: 16px; }
.filter-card :deep(.el-form-item) { margin-bottom: 0; }
.table-card { overflow: hidden; }
.sub { margin-top: 4px; color: #9099a8; font-size: 12px; }
.income { color: #16a36a; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
@media (max-width: 900px) { .finance-heading { align-items: stretch; flex-direction: column; } .finance-summary { align-self: flex-start; } .filter-card { overflow-x: auto; } .filter-card :deep(.el-form) { min-width: 680px; } }
</style>

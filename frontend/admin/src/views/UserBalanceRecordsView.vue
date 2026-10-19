<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from '@/utils/elementFeedback'
import { fetchBalanceRecords, type MoneyRecord } from '@/api/wallet'
import { formatTime } from '@/utils/datetime'

const loading = ref(false)
const rows = ref<MoneyRecord[]>([])
const total = ref(0)
const route = useRoute()
const query = reactive({
  keyword: '',
  userId: '' as number | '',
  type: '',
  direction: '',
  page: 1,
  size: 20,
})

const yuan = (v: any) => `¥${(Number(v || 0) / 100).toFixed(2)}`
const typeLabel = (v: string) =>
  ({ RED_PACKET: '红包', TRANSFER: '转账', ADMIN_ADJUST: '后台余额调整', COMMUNITY_INCOME: '圈子收益', REFUND: '退款' }[v] || '其他流水')

function applyRouteQuery() {
  const raw = Array.isArray(route.query.userId) ? route.query.userId[0] : route.query.userId
  const parsed = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : 0
  query.userId = parsed > 0 ? parsed : ''
}

async function load() {
  loading.value = true
  try {
    const data = await fetchBalanceRecords({
      keyword: query.keyword || undefined,
      userId: query.userId === '' ? undefined : query.userId,
      type: query.type || undefined,
      direction: query.direction || undefined,
      page: query.page,
      size: query.size,
    })
    rows.value = data.list
    total.value = data.total
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载余额记录失败')
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  query.page = 1
  load()
}

function reset() {
  query.keyword = ''
  query.userId = ''
  query.type = ''
  query.direction = ''
  query.page = 1
  load()
}

onMounted(() => {
  applyRouteQuery()
  load()
})

watch(
  () => route.fullPath,
  () => {
    applyRouteQuery()
    query.page = 1
    load()
  },
)
</script>

<template>
  <div>
    <el-card shadow="never">
      <el-form :inline="true" @submit.prevent="handleSearch">
        <el-form-item label="关键词">
          <el-input v-model="query.keyword" clearable placeholder="用户、单号或备注" style="width: 220px" />
        </el-form-item>
        <el-form-item label="用户ID">
          <el-input v-model.number="query.userId" clearable style="width: 110px" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="query.type" clearable style="width: 150px">
            <el-option label="红包" value="RED_PACKET" />
            <el-option label="转账" value="TRANSFER" />
            <el-option label="后台余额调整" value="ADMIN_ADJUST" />
          </el-select>
        </el-form-item>
        <el-form-item label="收支">
          <el-select v-model="query.direction" clearable style="width: 110px">
            <el-option label="收入" value="IN" />
            <el-option label="支出" value="OUT" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
    <el-card shadow="never" class="records-card">
      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column label="用户" min-width="160">
          <template #default="{ row }">
            <b>{{ row.nickname }}</b>
            <div class="sub">{{ row.phone }} · {{ row.pulse_id }}</div>
          </template>
        </el-table-column>
        <el-table-column label="流水单号" prop="trade_no" min-width="210" />
        <el-table-column label="类型" width="130">
          <template #default="{ row }">{{ typeLabel(row.trade_type) }}</template>
        </el-table-column>
        <el-table-column label="变动金额" width="120">
          <template #default="{ row }">
            <span :class="row.direction === 'IN' ? 'income' : 'expense'">
              {{ row.direction === 'IN' ? '+' : '-' }}{{ yuan(row.amount) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="变动后余额" width="130">
          <template #default="{ row }">{{ yuan(row.balance_after) }}</template>
        </el-table-column>
        <el-table-column label="关联用户" min-width="110">
          <template #default="{ row }">{{ row.counterparty_name || '—' }}</template>
        </el-table-column>
        <el-table-column label="备注" prop="remark" min-width="190" show-overflow-tooltip />
        <el-table-column label="时间" width="180">
          <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.size"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          background
          @current-change="load"
          @size-change="
            () => {
              query.page = 1
              load()
            }
          "
        />
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.records-card {
  margin-top: 16px;
}
.sub {
  font-size: 12px;
  color: #909399;
  margin-top: 3px;
}
.income {
  color: #e65b4a;
  font-weight: 600;
}
.expense {
  color: #303133;
  font-weight: 600;
}
.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>

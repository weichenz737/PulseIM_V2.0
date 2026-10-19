<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from '@/utils/elementFeedback'
import { fetchRedPacketRecords, fetchTransferRecords, type MoneyRecord } from '@/api/wallet'
import { formatTime } from '@/utils/datetime'

const route = useRoute()
const loading = ref(false)
const rows = ref<MoneyRecord[]>([])
const total = ref(0)
const query = reactive({
  keyword: '',
  packetType: '',
  page: 1,
  size: 20,
})

const kind = computed(() => String(route.meta.kind))
const conversationType = computed(() => Number(route.meta.conversationType))

const yuan = (v: any) => `¥${(Number(v || 0) / 100).toFixed(2)}`
const packetTypeLabel = (v: any) =>
  ({ PRIVATE: '单聊红包', NORMAL: '普通红包', LUCKY: '拼手气红包', EXCLUSIVE: '专属红包' }[String(v)] ||
  (v ? '其他红包' : '-'))
const statusLabel = (v: any) =>
  ({
    ACTIVE: '领取中',
    PENDING: '待领取',
    FINISHED: '已领完',
    RECEIVED: '已收款',
    EXPIRED: '已过期',
    REFUNDED: '已退款',
    CANCELLED: '已取消',
  }[String(v)] || (v ? '其他状态' : '-'))

async function load() {
  loading.value = true
  try {
    const data =
      kind.value === 'red'
        ? await fetchRedPacketRecords({
            conversationType: conversationType.value,
            packetType: query.packetType || undefined,
            keyword: query.keyword.trim() || undefined,
            page: query.page,
            size: query.size,
          })
        : await fetchTransferRecords({
            conversationType: conversationType.value,
            keyword: query.keyword.trim() || undefined,
            page: query.page,
            size: query.size,
          })
    rows.value = data.list
    total.value = data.total
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载失败')
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  query.page = 1
  load()
}

function handleReset() {
  query.keyword = ''
  query.packetType = ''
  query.page = 1
  load()
}

watch(
  () => [route.meta.kind, route.meta.conversationType],
  () => {
    query.page = 1
    query.packetType = ''
    load()
  },
)

onMounted(load)
</script>

<template>
  <div>
    <el-card shadow="never">
      <div class="toolbar">
        <el-input
          v-model="query.keyword"
          clearable
          placeholder="搜索单号、用户、会话"
          style="width: 300px"
          @keyup.enter="handleSearch"
        />
        <el-select
          v-if="kind === 'red' && conversationType === 2"
          v-model="query.packetType"
          clearable
          placeholder="红包类型"
          style="width: 160px"
        >
          <el-option label="普通红包" value="NORMAL" />
          <el-option label="拼手气红包" value="LUCKY" />
          <el-option label="专属红包" value="EXCLUSIVE" />
        </el-select>
        <el-button type="primary" @click="handleSearch">查询</el-button>
        <el-button @click="handleReset">重置</el-button>
      </div>
    </el-card>
    <el-card shadow="never" class="table-card">
      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column :label="kind === 'red' ? '红包单号' : '转账单号'" min-width="210">
          <template #default="{ row }">{{ row.packet_no || row.transfer_no }}</template>
        </el-table-column>
        <el-table-column label="发送人" min-width="130">
          <template #default="{ row }">{{ row.sender_name }} ({{ row.sender_id }})</template>
        </el-table-column>
        <el-table-column v-if="kind === 'red'" label="红包类型" width="120">
          <template #default="{ row }">{{ packetTypeLabel(row.packet_type) }}</template>
        </el-table-column>
        <el-table-column v-else label="收款人" min-width="130">
          <template #default="{ row }">{{ row.receiver_name }} ({{ row.receiver_id }})</template>
        </el-table-column>
        <el-table-column
          v-if="kind === 'red' && conversationType === 2"
          label="领取人"
          min-width="220"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{ row.receiver_names || '暂无领取' }}</template>
        </el-table-column>
        <el-table-column label="金额" width="110">
          <template #default="{ row }">{{ yuan(row.total_amount || row.amount) }}</template>
        </el-table-column>
        <el-table-column v-if="kind === 'red'" label="领取进度" width="130">
          <template #default="{ row }"
            >{{ row.received_count }}/{{ row.total_count }} · {{ yuan(row.received_amount) }}</template
          >
        </el-table-column>
        <el-table-column label="会话" min-width="140">
          <template #default="{ row }"
            >{{ row.conversation_title || '-' }} ({{ row.conversation_id }})</template
          >
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">{{ statusLabel(row.status) }}</template>
        </el-table-column>
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="到期时间" width="180">
          <template #default="{ row }">{{ formatTime(row.expires_at) }}</template>
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
.toolbar {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.table-card {
  margin-top: 16px;
}
.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>

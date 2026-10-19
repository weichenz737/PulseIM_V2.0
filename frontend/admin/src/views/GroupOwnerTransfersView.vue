<script setup lang="ts">
import { formatTime } from '@/utils/datetime'
import { onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from '@/utils/elementFeedback'
import type { TableInstance } from 'element-plus'
import {
  deleteGroupOwnerTransfers,
  fetchGroupOwnerTransfers,
  type GroupOwnerTransfer,
} from '@/api/groupOwnerTransfers'

const route = useRoute()
const loading = ref(false)
const deleting = ref(false)
const records = ref<GroupOwnerTransfer[]>([])
const total = ref(0)
const tableRef = ref<TableInstance>()
const selectedRows = ref<GroupOwnerTransfer[]>([])

const query = reactive({
  keyword: '',
  conversationId: '' as number | '',
  page: 1,
  size: 20,
})

function applyRouteQuery() {
  const raw = route.query.conversationId
  if (raw != null && String(raw).trim() !== '') {
    const n = Number(raw)
    if (!Number.isNaN(n)) {
      query.conversationId = n
    }
  }
}

async function loadRecords() {
  loading.value = true
  selectedRows.value = []
  try {
    const data = await fetchGroupOwnerTransfers({
      page: query.page,
      size: query.size,
      keyword: query.keyword.trim(),
      conversationId: query.conversationId,
    })
    records.value = data.list
    total.value = data.total
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载群主转让记录失败')
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  query.page = 1
  loadRecords()
}

function handleReset() {
  query.keyword = ''
  query.conversationId = ''
  query.page = 1
  loadRecords()
}

function reasonLabel(reason?: string) {
  switch ((reason || '').toLowerCase()) {
    case 'user_transfer':
      return '用户端转让'
    case 'admin_delete_user':
      return '删除用户时转让'
    case 'admin_transfer':
      return '后台转让'
    default:
      return reason ? '其他原因' : '—'
  }
}

function operatorTypeLabel(type?: string) {
  switch ((type || '').toLowerCase()) {
    case 'admin':
      return '管理员'
    case 'user':
      return '用户'
    case 'system':
      return '系统'
    default:
      return type ? '其他操作方' : '—'
  }
}


function onSelectionChange(rows: GroupOwnerTransfer[]) {
  selectedRows.value = rows
}

function clearSelection() {
  tableRef.value?.clearSelection()
  selectedRows.value = []
}

async function handleBatchDelete() {
  if (!selectedRows.value.length) {
    ElMessage.warning('请先勾选要删除的记录')
    return
  }
  const ids = selectedRows.value.map((r) => r.id)
  const count = ids.length
  try {
    await ElMessageBox.confirm(
      `确定删除选中的 ${count} 条群主转让记录吗？删除后不可恢复。`,
      '批量删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      },
    )
    deleting.value = true
    const n = await deleteGroupOwnerTransfers(ids)
    ElMessage.success(`已删除 ${n} 条`)
    clearSelection()
    if (records.value.length <= count && query.page > 1) {
      query.page -= 1
    }
    await loadRecords()
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(e instanceof Error ? e.message : '删除失败')
  } finally {
    deleting.value = false
  }
}

onMounted(() => {
  applyRouteQuery()
  loadRecords()
})
</script>

<template>
  <div class="transfers-page">
    <el-card shadow="never" class="toolbar-card">
      <el-form :inline="true" @submit.prevent="handleSearch">
        <el-form-item label="关键词">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="群名 / 原群主 / 新群主 / 操作人"
            style="width: 260px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="群 ID">
          <el-input
            v-model.number="query.conversationId"
            clearable
            placeholder="群 ID"
            style="width: 120px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="table-card">
      <div class="batch-bar">
        <span class="batch-hint">已选 {{ selectedRows.length }} 条</span>
        <el-button
          type="danger"
          :disabled="!selectedRows.length"
          :loading="deleting"
          @click="handleBatchDelete"
        >删除选中</el-button>
        <el-button :disabled="!selectedRows.length" @click="clearSelection">取消选择</el-button>
      </div>
      <el-table
        ref="tableRef"
        v-loading="loading"
        :data="records"
        stripe
        row-key="id"
        empty-text="暂无群主转让记录"
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="48" />
        <el-table-column label="群聊" min-width="160">
          <template #default="{ row }">
            <div class="title">{{ row.conversationTitle || '—' }}</div>
            <div class="sub">ID {{ row.conversationId ?? '—' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="原群主" min-width="150">
          <template #default="{ row }">
            <div class="title">{{ row.fromNickname || '—' }}</div>
            <div class="sub">{{ row.fromPhone || '—' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="新群主" min-width="150">
          <template #default="{ row }">
            <div class="title">{{ row.toNickname || '—' }}</div>
            <div class="sub">{{ row.toPhone || '—' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="原因" width="140">
          <template #default="{ row }">{{ reasonLabel(row.reason) }}</template>
        </el-table-column>
        <el-table-column label="操作人" min-width="140">
          <template #default="{ row }">
            <div class="title">{{ row.operatorNickname || '—' }}</div>
            <div class="sub">{{ operatorTypeLabel(row.operatorType) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
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
          @current-change="loadRecords"
          @size-change="() => { query.page = 1; loadRecords() }"
        />
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.transfers-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.batch-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.batch-hint {
  font-size: 13px;
  color: #606266;
  margin-right: 4px;
}

.toolbar-card,
.table-card {
  border-radius: 12px;
}

.toolbar-card :deep(.el-card__body) {
  padding-bottom: 2px;
}

.title {
  font-weight: 600;
  color: #303133;
  line-height: 1.3;
}

.sub {
  margin-top: 2px;
  font-size: 12px;
  color: #909399;
}

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>

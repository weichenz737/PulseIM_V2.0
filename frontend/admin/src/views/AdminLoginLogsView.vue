<script setup lang="ts">
import { formatTime } from '@/utils/datetime'
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from '@/utils/elementFeedback'
import type { TableInstance } from 'element-plus'
import {
  clearAllAdminLoginLogs,
  deleteAdminLoginLogs,
  fetchAdminLoginLogs,
  type AdminLoginLog,
} from '@/api/adminLogs'

const loading = ref(false)
const deleting = ref(false)
const clearing = ref(false)
const logs = ref<AdminLoginLog[]>([])
const total = ref(0)
const tableRef = ref<TableInstance>()
const selectedRows = ref<AdminLoginLog[]>([])

const query = reactive({
  keyword: '',
  success: '' as boolean | '',
  page: 1,
  size: 20,
})

async function loadLogs() {
  loading.value = true
  selectedRows.value = []
  try {
    const data = await fetchAdminLoginLogs({
      page: query.page,
      size: query.size,
      keyword: query.keyword.trim(),
      success: query.success,
    })
    logs.value = data.list
    total.value = data.total
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载失败')
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  query.page = 1
  loadLogs()
}

function handleReset() {
  query.keyword = ''
  query.success = ''
  query.page = 1
  loadLogs()
}


function onSelectionChange(rows: AdminLoginLog[]) {
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
    await ElMessageBox.confirm(`确定删除选中的 ${count} 条管理员登录日志吗？`, '批量删除', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
      confirmButtonClass: 'el-button--danger',
    })
    deleting.value = true
    const n = await deleteAdminLoginLogs(ids)
    ElMessage.success(`已删除 ${n} 条`)
    clearSelection()
    if (logs.value.length <= count && query.page > 1) query.page -= 1
    await loadLogs()
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(e instanceof Error ? e.message : '删除失败')
  } finally {
    deleting.value = false
  }
}

async function handleClearAll() {
  const expect = '确认删除'
  try {
    await ElMessageBox.confirm(
      `将删除全部管理员登录日志（当前合计 ${total.value} 条，实际以服务器为准），且不可恢复。`,
      '一键删除全部',
      {
        confirmButtonText: '继续',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      },
    )
    const { value } = await ElMessageBox.prompt(
      `请输入「${expect}」以确认清空全部管理员登录日志`,
      '二次确认',
      {
        confirmButtonText: '全部删除',
        cancelButtonText: '取消',
        inputPlaceholder: expect,
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
        inputValidator: (v) => {
          if ((v || '').trim() !== expect) return `请输入：${expect}`
          return true
        },
      },
    )
    if ((value || '').trim() !== expect) return
    clearing.value = true
    const n = await clearAllAdminLoginLogs()
    ElMessage.success(`已清空 ${n} 条`)
    clearSelection()
    query.page = 1
    await loadLogs()
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(e instanceof Error ? e.message : '清空失败')
  } finally {
    clearing.value = false
  }
}

onMounted(loadLogs)
</script>

<template>
  <div class="logs-page">
    <el-card shadow="never" class="toolbar-card">
      <el-form :inline="true" @submit.prevent="handleSearch">
        <el-form-item label="关键词">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="用户名 / IP / 失败原因"
            style="width: 240px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="结果">
          <el-select v-model="query.success" clearable placeholder="全部" style="width: 120px">
            <el-option label="成功" :value="true" />
            <el-option label="失败" :value="false" />
          </el-select>
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
        <el-button type="danger" plain :loading="clearing" @click="handleClearAll">一键删除全部</el-button>
      </div>
      <el-table
        ref="tableRef"
        v-loading="loading"
        :data="logs"
        stripe
        row-key="id"
        empty-text="暂无管理员登录日志"
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="48" />
        <el-table-column prop="username" label="管理员" width="140">
          <template #default="{ row }">{{ row.username || '—' }}</template>
        </el-table-column>
        <el-table-column label="结果" width="100">
          <template #default="{ row }">
            <el-tag :type="row.success ? 'success' : 'danger'" size="small">
              {{ row.success ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="失败原因" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">{{ row.failReason || '—' }}</template>
        </el-table-column>
        <el-table-column prop="ip" label="IP" width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.ip || '—' }}</template>
        </el-table-column>
        <el-table-column label="设备 / UA" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">{{ row.userAgent || '—' }}</template>
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
          @current-change="loadLogs"
          @size-change="() => { query.page = 1; loadLogs() }"
        />
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.logs-page {
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

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>

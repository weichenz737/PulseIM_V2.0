<script setup lang="ts">
import { formatTime } from '@/utils/datetime'
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from '@/utils/elementFeedback'
import type { TableInstance } from 'element-plus'
import {
  clearAllAdminOperationLogs,
  deleteAdminOperationLogs,
  fetchAdminOperationLogs,
  type AdminOperationLog,
} from '@/api/adminLogs'
import { fetchPermissionCatalog, type PermissionItem } from '@/api/admins'

const loading = ref(false)
const deleting = ref(false)
const clearing = ref(false)
const logs = ref<AdminOperationLog[]>([])
const total = ref(0)
const catalog = ref<PermissionItem[]>([])
const tableRef = ref<TableInstance>()
const selectedRows = ref<AdminOperationLog[]>([])
const detailVisible = ref(false)
const detailRow = ref<AdminOperationLog | null>(null)

const query = reactive({
  keyword: '',
  module: '' as string | '',
  page: 1,
  size: 20,
})

async function loadCatalog() {
  try {
    catalog.value = await fetchPermissionCatalog()
  } catch {
    catalog.value = []
  }
}

async function loadLogs() {
  loading.value = true
  selectedRows.value = []
  try {
    const data = await fetchAdminOperationLogs({
      page: query.page,
      size: query.size,
      keyword: query.keyword.trim(),
      module: query.module,
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
  query.module = ''
  query.page = 1
  loadLogs()
}


function summaryOf(row: AdminOperationLog) {
  return row.summary || row.detail || actionLabel(row.action) || '—'
}

function actionLabel(action?: string) {
  const value = String(action || '').trim()
  const labels: Record<string, string> = {
    GET: '查看操作', POST: '提交操作', PUT: '更新操作', PATCH: '更新操作', DELETE: '删除操作',
    CREATE: '新增', UPDATE: '更新', REMOVE: '移除', ENABLE: '启用', DISABLE: '停用', REVIEW: '审核',
  }
  if (labels[value.toUpperCase()]) return labels[value.toUpperCase()]
  return /^[A-Za-z0-9_.:/-]+$/.test(value) ? '其他操作' : value || '操作'
}

function moduleLabel(row: AdminOperationLog) {
  if (row.moduleLabel) return row.moduleLabel
  const configured = catalog.value.find((item) => item.code === row.module)?.label
  if (configured) return configured
  return row.module && !/^[A-Za-z0-9_.:/-]+$/.test(row.module) ? row.module : '其他模块'
}

function actionTagType(action?: string) {
  const a = action || ''
  if (a.includes('删除') || a.includes('解散') || a.includes('清空')) return 'danger'
  if (a.includes('重置') || a.includes('变更') || a.includes('封禁') || a.includes('转让')) return 'warning'
  if (a.includes('新建') || a.includes('创建')) return 'success'
  return 'info'
}

function openDetail(row: AdminOperationLog) {
  detailRow.value = row
  detailVisible.value = true
}

function onSelectionChange(rows: AdminOperationLog[]) {
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
    await ElMessageBox.confirm(`确定删除选中的 ${count} 条操作日志吗？`, '批量删除', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
      confirmButtonClass: 'el-button--danger',
    })
    deleting.value = true
    const n = await deleteAdminOperationLogs(ids)
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
      `将删除全部管理员操作日志（当前合计 ${total.value} 条，实际以服务器为准），且不可恢复。`,
      '一键删除全部',
      {
        confirmButtonText: '继续',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      },
    )
    const { value } = await ElMessageBox.prompt(
      `请输入「${expect}」以确认清空全部管理员操作日志`,
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
    const n = await clearAllAdminOperationLogs()
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

onMounted(async () => {
  await loadCatalog()
  await loadLogs()
})
</script>

<template>
  <div class="logs-page">
    <el-card shadow="never" class="toolbar-card">
      <el-form :inline="true" @submit.prevent="handleSearch">
        <el-form-item label="关键词">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="管理员 / 操作 / IP"
            style="width: 240px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="模块">
          <el-select v-model="query.module" clearable placeholder="全部" style="width: 160px">
            <el-option
              v-for="p in catalog"
              :key="p.code"
              :label="p.label"
              :value="p.code"
            />
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
        empty-text="暂无操作日志"
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="48" />
        <el-table-column prop="username" label="管理员" width="120">
          <template #default="{ row }">{{ row.username || '—' }}</template>
        </el-table-column>
        <el-table-column label="模块" width="130">
          <template #default="{ row }">{{ moduleLabel(row) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="140">
          <template #default="{ row }">
            <el-tag :type="actionTagType(row.action)" size="small" effect="plain">
              {{ actionLabel(row.action) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作说明" min-width="320">
          <template #default="{ row }">
            <div class="summary-cell">{{ summaryOf(row) }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="ip" label="IP" width="130" show-overflow-tooltip>
          <template #default="{ row }">{{ row.ip || '—' }}</template>
        </el-table-column>
        <el-table-column label="时间" width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="更多" width="88" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">详情</el-button>
          </template>
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

    <el-dialog
      v-model="detailVisible"
      title="操作日志详情"
      width="560px"
      destroy-on-close
    >
      <el-descriptions v-if="detailRow" :column="1" border>
        <el-descriptions-item label="管理员">{{ detailRow.username || '—' }}</el-descriptions-item>
        <el-descriptions-item label="模块">{{ moduleLabel(detailRow) }}</el-descriptions-item>
        <el-descriptions-item label="操作">{{ actionLabel(detailRow.action) }}</el-descriptions-item>
        <el-descriptions-item label="操作说明">{{ summaryOf(detailRow) }}</el-descriptions-item>
        <el-descriptions-item label="IP">{{ detailRow.ip || '—' }}</el-descriptions-item>
        <el-descriptions-item label="时间">{{ formatTime(detailRow.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="请求方法">{{ detailRow.method || '—' }}</el-descriptions-item>
        <el-descriptions-item label="接口路径">
          <code class="path-code">{{ detailRow.path || '—' }}</code>
        </el-descriptions-item>
        <el-descriptions-item label="原始详情">
          <div class="raw-detail">{{ detailRow.detail || '—' }}</div>
        </el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
      </template>
    </el-dialog>
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

.summary-cell {
  color: #303133;
  line-height: 1.5;
  word-break: break-word;
}

.path-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  color: #606266;
  word-break: break-all;
}

.raw-detail {
  white-space: pre-wrap;
  word-break: break-word;
  color: #606266;
  font-size: 13px;
  line-height: 1.5;
}

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>

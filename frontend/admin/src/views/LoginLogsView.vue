<script setup lang="ts">
import { formatTime } from '@/utils/datetime'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from '@/utils/elementFeedback'
import type { TableInstance } from 'element-plus'
import { clearAllLoginLogs, deleteLoginLogs, fetchLoginLogs, type LoginLog } from '@/api/loginLogs'

const route = useRoute()
const loading = ref(false)
const deleting = ref(false)
const logs = ref<LoginLog[]>([])
const total = ref(0)
const tableRef = ref<TableInstance>()
const selectedRows = ref<LoginLog[]>([])
const clearing = ref(false)

const query = reactive({
  keyword: '',
  loginType: '' as string | '',
  success: '' as boolean | '',
  userId: '' as number | '',
  from: '' as string,
  to: '' as string,
  page: 1,
  size: 20,
})

const dateRange = computed({
  get(): [string, string] | null {
    if (query.from && query.to) return [query.from, query.to]
    return null
  },
  set(v: [string, string] | null) {
    if (v && v.length === 2) {
      query.from = v[0] || ''
      query.to = v[1] || ''
    } else {
      query.from = ''
      query.to = ''
    }
  },
})

function applyRouteQuery() {
  const q = route.query
  const raw = q.userId
  if (raw != null && String(raw).trim() !== '') {
    const n = Number(raw)
    query.userId = !Number.isNaN(n) && n > 0 ? n : ''
  } else {
    query.userId = ''
  }
  if (q.success === 'true' || q.success === '1') {
    query.success = true
  } else if (q.success === 'false' || q.success === '0') {
    query.success = false
  } else {
    query.success = ''
  }
  const ymd = /^\d{4}-\d{2}-\d{2}$/
  query.from = typeof q.from === 'string' && ymd.test(q.from) ? q.from : ''
  query.to = typeof q.to === 'string' && ymd.test(q.to) ? q.to : ''
  if (typeof q.loginType === 'string' && q.loginType.trim()) {
    query.loginType = q.loginType.trim()
  } else {
    query.loginType = ''
  }
}

async function loadLogs() {
  loading.value = true
  selectedRows.value = []
  try {
    const data = await fetchLoginLogs({
      page: query.page,
      size: query.size,
      keyword: query.keyword.trim(),
      loginType: query.loginType,
      success: query.success,
      userId: query.userId,
      from: query.from,
      to: query.to,
    })
    logs.value = data.list
    total.value = data.total
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载登录日志失败')
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
  query.loginType = ''
  query.success = ''
  query.userId = ''
  query.from = ''
  query.to = ''
  query.page = 1
  loadLogs()
}

function loginTypeLabel(type?: string) {
  if (type === 'password') return '密码登录'
  if (type === 'sms') return '短信登录'
  if (type === 'register') return '注册登录'
  if (type === 'qr') return '扫码登录'
  return type ? '其他方式' : '—'
}

function eventType(row: LoginLog) {
  const raw = (row.eventType || row.logType || row.loginType || '').toLowerCase()
  if (row.onlineEvent || ['online', 'enter', 'entry', 'system_entry'].includes(raw)) return 'online'
  return 'login'
}

function eventLabel(row: LoginLog) {
  if (row.eventName) return row.eventName
  return eventType(row) === 'online' ? '进入系统' : '登录认证'
}

function deviceLabel(row: LoginLog) {
  return row.deviceSummary || row.userAgent || '—'
}

function securityCodeLabel(row: LoginLog) {
  if (eventType(row) === 'online') return '—'
  if (row.securityCodeChecked === true) return '已校验'
  if (row.newDevice === true && row.securityCodeChecked === false) return '未通过'
  if (row.newDevice === false && row.securityCodeChecked === false) return '免校验'
  if (row.securityCodeChecked === false) return '未校验'
  return '—'
}

function securityCodeTagType(row: LoginLog) {
  if (row.securityCodeChecked === true) return 'success'
  if (row.newDevice === true && row.securityCodeChecked === false) return 'danger'
  if (row.newDevice === false && row.securityCodeChecked === false) return 'info'
  return 'info'
}

function newDeviceLabel(row: LoginLog) {
  if (eventType(row) === 'online') return '—'
  if (row.newDevice === true) return '新设备'
  if (row.newDevice === false) return '已信任'
  return '—'
}


function onSelectionChange(rows: LoginLog[]) {
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
      `确定删除选中的 ${count} 条登录日志吗？删除后不可恢复。`,
      '批量删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      },
    )
    deleting.value = true
    const n = await deleteLoginLogs(ids)
    ElMessage.success(`已删除 ${n} 条`)
    clearSelection()
    if (logs.value.length <= count && query.page > 1) {
      query.page -= 1
    }
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
      `将删除全部用户登录日志（当前合计 ${total.value} 条，实际以服务器为准），且不可恢复。`,
      '一键删除全部',
      {
        confirmButtonText: '继续',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      },
    )
    const { value } = await ElMessageBox.prompt(
      `请输入「${expect}」以确认清空全部用户登录日志`,
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
    const n = await clearAllLoginLogs()
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

onMounted(() => {
  applyRouteQuery()
  loadLogs()
})

watch(
  () => route.fullPath,
  () => {
    if (route.path !== '/login-logs' && !route.path.endsWith('/login-logs')) return
    applyRouteQuery()
    query.page = 1
    loadLogs()
  },
)
</script>

<template>
  <div class="logs-page">
    <el-card shadow="never" class="toolbar-card">
      <el-form :inline="true" @submit.prevent="handleSearch">
        <el-form-item label="关键词">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="手机号 / 昵称 / PulseID / IP"
            style="width: 240px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="用户 ID">
          <el-input-number v-model="query.userId" :controls="false" placeholder="可选" style="width: 140px" />
        </el-form-item>
        <el-form-item label="方式">
          <el-select v-model="query.loginType" clearable placeholder="全部" style="width: 130px">
            <el-option label="密码登录" value="password" />
            <el-option label="短信登录" value="sms" />
            <el-option label="注册登录" value="register" />
            <el-option label="扫码登录" value="qr" />
          </el-select>
        </el-form-item>
        <el-form-item label="结果">
          <el-select v-model="query.success" clearable placeholder="全部" style="width: 120px">
            <el-option label="成功" :value="true" />
            <el-option label="失败" :value="false" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            start-placeholder="开始"
            end-placeholder="结束"
            style="width: 240px"
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
        <el-button
          type="danger"
          plain
          :loading="clearing"
          @click="handleClearAll"
        >一键删除全部</el-button>
      </div>
      <el-table
        ref="tableRef"
        v-loading="loading"
        :data="logs"
        stripe
        row-key="id"
        empty-text="暂无登录日志"
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="48" />
        <el-table-column label="用户" min-width="180">
          <template #default="{ row }">
            <div class="user-cell">
              <div class="nickname">{{ row.nickname || '—' }}</div>
              <div class="sub">
                {{ row.phone || '—' }}
                <template v-if="row.pulseId"> · PulseID {{ row.pulseId }}</template>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="日志类型" width="110">
          <template #default="{ row }">
            <el-tag :type="eventType(row) === 'online' ? 'primary' : 'info'" size="small" effect="plain">
              {{ eventLabel(row) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="进入方式" width="110">
          <template #default="{ row }">
            {{ eventType(row) === 'online' ? '在线进入' : loginTypeLabel(row.loginType) }}
          </template>
        </el-table-column>
        <el-table-column label="结果" width="100">
          <template #default="{ row }">
            <el-tag :type="row.success ? 'success' : 'danger'" size="small">
              {{ row.success ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="安全码" width="100">
          <template #default="{ row }">
            <el-tag
              v-if="securityCodeLabel(row) !== '—'"
              :type="securityCodeTagType(row)"
              size="small"
              effect="plain"
            >
              {{ securityCodeLabel(row) }}
            </el-tag>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="设备信任" width="100">
          <template #default="{ row }">
            <el-tag
              v-if="newDeviceLabel(row) === '新设备'"
              type="warning"
              size="small"
              effect="plain"
            >新设备</el-tag>
            <span v-else>{{ newDeviceLabel(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="失败原因" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.failReason || '—' }}</template>
        </el-table-column>
        <el-table-column prop="ip" label="IP" width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.ip || '—' }}</template>
        </el-table-column>
        <el-table-column label="设备" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <el-tooltip
              v-if="row.userAgent"
              :content="row.userAgent"
              placement="top"
              :show-after="400"
            >
              <span class="device-summary">{{ deviceLabel(row) }}</span>
            </el-tooltip>
            <span v-else class="device-summary">{{ deviceLabel(row) }}</span>
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

.user-cell .nickname {
  font-weight: 600;
  color: #303133;
  line-height: 1.3;
}

.user-cell .sub {
  margin-top: 2px;
  font-size: 12px;
  color: #909399;
}

.device-summary {
  color: #303133;
  cursor: default;
}

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>

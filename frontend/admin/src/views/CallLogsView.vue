<script setup lang="ts">
import { formatTime } from '@/utils/datetime'
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from '@/utils/elementFeedback'
import type { TableInstance } from 'element-plus'
import { deleteCallLogs, fetchCallLogs, type CallLog } from '@/api/callLogs'

const loading = ref(false)
const deleting = ref(false)
const logs = ref<CallLog[]>([])
const total = ref(0)
const tableRef = ref<TableInstance>()
const selectedRows = ref<CallLog[]>([])

const query = reactive({
  keyword: '',
  conversationId: '' as number | '',
  userId: '' as number | '',
  connected: '' as boolean | '',
  reason: '' as string | '',
  mediaType: '' as string | '',
  page: 1,
  size: 20,
})

async function loadLogs() {
  loading.value = true
  selectedRows.value = []
  try {
    const data = await fetchCallLogs({
      page: query.page,
      size: query.size,
      keyword: query.keyword.trim(),
      conversationId: query.conversationId,
      userId: query.userId,
      connected: query.connected,
      reason: query.reason,
      mediaType: query.mediaType,
    })
    logs.value = data.list
    total.value = data.total
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载通话记录失败')
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
  query.conversationId = ''
  query.userId = ''
  query.connected = ''
  query.reason = ''
  query.mediaType = ''
  query.page = 1
  loadLogs()
}


function reasonLabel(reason?: string) {
  switch (reason) {
    case 'rejected':
      return '拒绝'
    case 'timeout':
      return '未接听'
    case 'busy':
      return '忙线'
    case 'unavailable':
      return '不在线'
    case 'hangup':
      return '挂断/取消'
    case 'peer_hangup':
      return '对方挂断'
    case 'error':
      return '异常中断'
    default:
      return reason ? '其他原因' : '—'
  }
}

function mediaLabel(row: CallLog) {
  const media = row.mediaType === 'video' ? '视频' : '语音'
  return row.callType === 'group' ? `群${media}` : `${media}通话`
}

function onSelectionChange(rows: CallLog[]) {
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
      `确定删除选中的 ${count} 条通话记录吗？删除后不可恢复。`,
      '批量删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      },
    )
    deleting.value = true
    const n = await deleteCallLogs(ids)
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
            placeholder="结果 / callId / 会话或用户 ID"
            style="width: 240px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="会话 ID">
          <el-input
            v-model.number="query.conversationId"
            clearable
            placeholder="会话 ID"
            style="width: 120px"
          />
        </el-form-item>
        <el-form-item label="用户 ID">
          <el-input
            v-model.number="query.userId"
            clearable
            placeholder="主叫/被叫"
            style="width: 120px"
          />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="query.mediaType" clearable placeholder="全部" style="width: 120px">
            <el-option label="语音通话" value="audio" />
            <el-option label="视频通话" value="video" />
          </el-select>
        </el-form-item>
        <el-form-item label="是否接通">
          <el-select v-model="query.connected" clearable placeholder="全部" style="width: 110px">
            <el-option label="已接通" :value="true" />
            <el-option label="未接通" :value="false" />
          </el-select>
        </el-form-item>
        <el-form-item label="结果">
          <el-select v-model="query.reason" clearable placeholder="全部" style="width: 130px">
            <el-option label="拒绝" value="rejected" />
            <el-option label="未接听" value="timeout" />
            <el-option label="忙线" value="busy" />
            <el-option label="不在线" value="unavailable" />
            <el-option label="挂断/取消" value="hangup" />
            <el-option label="对方挂断" value="peer_hangup" />
            <el-option label="异常中断" value="error" />
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
      </div>
      <el-table
        ref="tableRef"
        v-loading="loading"
        :data="logs"
        stripe
        row-key="id"
        empty-text="暂无通话记录"
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="48" />
        <el-table-column label="类型" width="110">
          <template #default="{ row }">
            <el-tag
              :type="row.callType === 'group' ? 'success' : row.mediaType === 'video' ? 'warning' : 'primary'"
              size="small"
              effect="plain"
            >
              {{ mediaLabel(row) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="主叫" min-width="150">
          <template #default="{ row }">
            <div class="title">{{ row.callerNickname || (row.callerId != null ? `用户${row.callerId}` : '—') }}</div>
            <div class="sub">{{ row.callerPhone || (row.callerId != null ? `ID ${row.callerId}` : '—') }}</div>
          </template>
        </el-table-column>
        <el-table-column label="被叫" min-width="150">
          <template #default="{ row }">
            <template v-if="row.callType === 'group'">
              <div class="title">{{ row.groupTitle || '群聊' }}</div>
              <div class="sub">{{ row.participantCount || 1 }} 人参与</div>
            </template>
            <template v-else>
              <div class="title">{{ row.calleeNickname || (row.calleeId != null ? `用户${row.calleeId}` : '—') }}</div>
              <div class="sub">{{ row.calleePhone || (row.calleeId != null ? `ID ${row.calleeId}` : '—') }}</div>
            </template>
          </template>
        </el-table-column>
        <el-table-column label="结果" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.resultText && !/^[A-Za-z0-9_.:/-]+$/.test(row.resultText) ? row.resultText : reasonLabel(row.reason || row.resultText) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.connected ? 'success' : 'info'" size="small" effect="plain">
              {{ row.connected ? '已接通' : '未接通' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="时长" width="90">
          <template #default="{ row }">
            {{ row.durationSec != null ? `${row.durationSec} 秒` : (row.durationText && !/\d+s$/i.test(row.durationText) ? row.durationText : '—') }}
          </template>
        </el-table-column>
        <el-table-column label="原因" width="110">
          <template #default="{ row }">{{ reasonLabel(row.reason) }}</template>
        </el-table-column>
        <el-table-column label="会话 ID" width="110">
          <template #default="{ row }">{{ row.conversationId ?? '—' }}</template>
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

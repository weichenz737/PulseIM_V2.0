<script setup lang="ts">
import { formatTime } from '@/utils/datetime'
import { onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from '@/utils/elementFeedback'
import type { TableInstance } from 'element-plus'
import { deleteGroupMemberEvents, fetchGroupMemberEvents, type GroupMemberEvent } from '@/api/groupMemberEvents'

const route = useRoute()
const loading = ref(false)
const deleting = ref(false)
const events = ref<GroupMemberEvent[]>([])
const total = ref(0)
const tableRef = ref<TableInstance>()
const selectedRows = ref<GroupMemberEvent[]>([])

const query = reactive({
  keyword: '',
  conversationId: '' as number | '',
  eventType: '' as string | '',
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

async function loadEvents() {
  loading.value = true
  selectedRows.value = []
  try {
    const data = await fetchGroupMemberEvents({
      page: query.page,
      size: query.size,
      keyword: query.keyword.trim(),
      conversationId: query.conversationId,
      eventType: query.eventType,
    })
    events.value = data.list
    total.value = data.total
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载出入记录失败')
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  query.page = 1
  loadEvents()
}

function handleReset() {
  query.keyword = ''
  query.conversationId = ''
  query.eventType = ''
  query.page = 1
  loadEvents()
}

function eventTypeLabel(type?: string) {
  switch ((type || '').toLowerCase()) {
    case 'join':
      return '加入'
    case 'leave':
      return '退群'
    case 'kick':
      return '移出'
    case 'apply':
      return '申请加群'
    case 'approve':
      return '审核通过'
    case 'reject':
      return '审核拒绝'
    case 'dissolve':
      return '解散'
    default:
      return type ? '其他事件' : '—'
  }
}

function eventTypeTag(type?: string) {
  switch ((type || '').toLowerCase()) {
    case 'join':
    case 'approve':
      return 'success'
    case 'leave':
      return 'info'
    case 'kick':
    case 'reject':
    case 'dissolve':
      return 'danger'
    case 'apply':
      return 'warning'
    default:
      return ''
  }
}

function sourceLabel(source?: string) {
  switch ((source || '').toLowerCase()) {
    case 'create':
      return '创建群聊'
    case 'create_invite':
      return '建群邀请'
    case 'invite':
      return '群内邀请'
    case 'qrcode':
      return '扫码'
    case 'card':
      return '群名片'
    case 'join':
      return '主动加入'
    default:
      return source ? '其他来源' : '—'
  }
}


function onSelectionChange(rows: GroupMemberEvent[]) {
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
      `确定删除选中的 ${count} 条出入记录吗？删除后不可恢复。`,
      '批量删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      },
    )
    deleting.value = true
    const n = await deleteGroupMemberEvents(ids)
    ElMessage.success(`已删除 ${n} 条`)
    clearSelection()
    if (events.value.length <= count && query.page > 1) {
      query.page -= 1
    }
    await loadEvents()
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(e instanceof Error ? e.message : '删除失败')
  } finally {
    deleting.value = false
  }
}

onMounted(() => {
  applyRouteQuery()
  loadEvents()
})
</script>

<template>
  <div class="events-page">
    <el-card shadow="never" class="toolbar-card">
      <el-form :inline="true" @submit.prevent="handleSearch">
        <el-form-item label="关键词">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="群名 / 昵称 / 手机号 / 审核信息"
            style="width: 240px"
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
        <el-form-item label="类型">
          <el-select v-model="query.eventType" clearable placeholder="全部" style="width: 130px">
            <el-option label="加入" value="join" />
            <el-option label="退群" value="leave" />
            <el-option label="移出" value="kick" />
            <el-option label="申请加群" value="apply" />
            <el-option label="审核通过" value="approve" />
            <el-option label="审核拒绝" value="reject" />
            <el-option label="解散" value="dissolve" />
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
        :data="events"
        stripe
        row-key="id"
        empty-text="暂无出入记录"
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="48" />
        <el-table-column label="群聊" min-width="160">
          <template #default="{ row }">
            <div class="title">{{ row.conversationTitle || '—' }}</div>
            <div class="sub">ID {{ row.conversationId ?? '—' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="成员" min-width="150">
          <template #default="{ row }">
            <div class="title">{{ row.userNickname || '—' }}</div>
            <div class="sub">{{ row.userPhone || '—' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="110">
          <template #default="{ row }">
            <el-tag :type="eventTypeTag(row.eventType)" size="small" effect="plain">
              {{ eventTypeLabel(row.eventType) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="来源" width="100">
          <template #default="{ row }">{{ sourceLabel(row.source) }}</template>
        </el-table-column>
        <el-table-column label="审核信息" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            <template v-if="row.message || row.requestId">
              <div>{{ row.message || '—' }}</div>
              <div v-if="row.requestId" class="sub">申请 #{{ row.requestId }}</div>
            </template>
            <template v-else>—</template>
          </template>
        </el-table-column>
        <el-table-column label="原因 / 说明" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">{{ row.reason || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作人" width="120">
          <template #default="{ row }">{{ row.operatorNickname || '—' }}</template>
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
          @current-change="loadEvents"
          @size-change="() => { query.page = 1; loadEvents() }"
        />
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.events-page {
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

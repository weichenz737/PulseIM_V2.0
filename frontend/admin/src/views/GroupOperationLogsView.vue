<script setup lang="ts">
import { formatTime } from '@/utils/datetime'
import { onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from '@/utils/elementFeedback'
import type { TableInstance } from 'element-plus'
import {
  deleteGroupOperationLogs,
  fetchGroupOperationLogs,
  type GroupOperationLog,
} from '@/api/groupOperationLogs'

const route = useRoute()
const loading = ref(false)
const deleting = ref(false)
const rows = ref<GroupOperationLog[]>([])
const total = ref(0)
const tableRef = ref<TableInstance>()
const selectedRows = ref<GroupOperationLog[]>([])

const query = reactive({
  keyword: '',
  conversationId: '' as number | '',
  opType: '' as string | '',
  page: 1,
  size: 20,
})

function applyRouteQuery() {
  const raw = route.query.conversationId
  if (raw != null && String(raw).trim() !== '') {
    const n = Number(raw)
    if (!Number.isNaN(n) && n > 0) query.conversationId = n
  }
}

async function load() {
  loading.value = true
  selectedRows.value = []
  try {
    const data = await fetchGroupOperationLogs({
      page: query.page,
      size: query.size,
      keyword: query.keyword.trim(),
      conversationId: query.conversationId,
      opType: query.opType,
    })
    rows.value = data.list
    total.value = data.total
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载群操作记录失败')
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
  query.conversationId = ''
  query.opType = ''
  query.page = 1
  load()
}

function onSelectionChange(list: GroupOperationLog[]) {
  selectedRows.value = list
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
  try {
    await ElMessageBox.confirm(
      `确定删除选中的 ${ids.length} 条群操作记录吗？将同步删除对应的群内系统消息。`,
      '批量删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      },
    )
    deleting.value = true
    const n = await deleteGroupOperationLogs(ids)
    ElMessage.success(`已删除 ${n} 条`)
    clearSelection()
    await load()
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(e instanceof Error ? e.message : '删除失败')
  } finally {
    deleting.value = false
  }
}

function opTypeTag(type?: string) {
  switch ((type || '').toLowerCase()) {
    case 'owner':
      return 'danger'
    case 'admin':
      return 'warning'
    case 'mute':
      return 'warning'
    case 'kick':
    case 'leave':
      return 'info'
    case 'join':
    case 'create':
      return 'success'
    default:
      return ''
  }
}


onMounted(() => {
  applyRouteQuery()
  load()
})

watch(
  () => route.query.conversationId,
  () => {
    applyRouteQuery()
    query.page = 1
    load()
  },
)
</script>

<template>
  <div class="page">
    <el-card shadow="never" class="toolbar-card">
      <el-form :inline="true" @submit.prevent="handleSearch">
        <el-form-item label="关键词">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="群名 / 内容 / 操作人 / 群 ID"
            style="width: 240px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="群 ID">
          <el-input-number
            v-model="query.conversationId"
            :controls="false"
            placeholder="可选"
            style="width: 140px"
          />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="query.opType" clearable placeholder="全部" style="width: 140px">
            <el-option label="转让群主" value="owner" />
            <el-option label="管理员" value="admin" />
            <el-option label="禁言" value="mute" />
            <el-option label="群公告" value="notice" />
            <el-option label="群名称" value="title" />
            <el-option label="群头像" value="avatar" />
            <el-option label="加群审核" value="verify" />
            <el-option label="加入群聊" value="join" />
            <el-option label="退出群聊" value="leave" />
            <el-option label="移出群聊" value="kick" />
            <el-option label="创建群聊" value="create" />
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
        :data="rows"
        stripe
        row-key="id"
        empty-text="暂无群操作记录"
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="48" />
        <el-table-column label="群聊" min-width="160">
          <template #default="{ row }">
            <div class="title">{{ row.conversationTitle || '—' }}</div>
            <div class="sub">ID {{ row.conversationId ?? '—' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="110">
          <template #default="{ row }">
            <el-tag :type="opTypeTag(row.opType)" size="small" effect="plain">
              {{ row.opTypeLabel || '其他' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作内容" min-width="260" show-overflow-tooltip>
          <template #default="{ row }">{{ row.content || '—' }}</template>
        </el-table-column>
        <el-table-column label="操作人" min-width="150">
          <template #default="{ row }">
            <div class="title">{{ row.operatorNickname || '—' }}</div>
            <div class="sub">
              <template v-if="row.operatorId">ID {{ row.operatorId }}</template>
              <template v-if="row.operatorPhone"> · {{ row.operatorPhone }}</template>
            </div>
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
          @current-change="load"
          @size-change="() => { query.page = 1; load() }"
        />
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.toolbar-card,
.table-card {
  border-radius: 12px;
}
.toolbar-card :deep(.el-card__body) {
  padding-bottom: 2px;
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
.title {
  font-weight: 600;
  color: #303133;
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

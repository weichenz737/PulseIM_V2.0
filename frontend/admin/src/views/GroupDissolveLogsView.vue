<script setup lang="ts">
import { formatTime } from '@/utils/datetime'
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from '@/utils/elementFeedback'
import type { TableInstance } from 'element-plus'
import {
  deleteGroupMemberEvents,
  fetchGroupMemberEvents,
  type GroupMemberEvent,
} from '@/api/groupMemberEvents'

const loading = ref(false)
const deleting = ref(false)
const rows = ref<GroupMemberEvent[]>([])
const total = ref(0)
const tableRef = ref<TableInstance>()
const selected = ref<GroupMemberEvent[]>([])
const query = reactive({ keyword: '', conversationId: '' as number | '', page: 1, size: 20 })

async function load() {
  loading.value = true
  selected.value = []
  try {
    const data = await fetchGroupMemberEvents({
      page: query.page,
      size: query.size,
      keyword: query.keyword.trim(),
      conversationId: query.conversationId,
      eventType: 'group_dissolve',
    })
    rows.value = data.list
    total.value = data.total
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载群解散记录失败')
  } finally {
    loading.value = false
  }
}

function search() {
  query.page = 1
  void load()
}

function reset() {
  query.keyword = ''
  query.conversationId = ''
  query.page = 1
  void load()
}

function memberCount(reason?: string) {
  const matched = String(reason || '').match(/成员数[：:]\s*(\d+)/)
  return matched ? Number(matched[1]) : undefined
}

async function removeSelected() {
  if (!selected.value.length) return
  try {
    await ElMessageBox.confirm(`确定删除选中的 ${selected.value.length} 条群解散记录吗？`, '删除记录', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    deleting.value = true
    const count = await deleteGroupMemberEvents(selected.value.map((row) => row.id))
    ElMessage.success(`已删除 ${count} 条`)
    await load()
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') {
      ElMessage.error(e instanceof Error ? e.message : '删除失败')
    }
  } finally {
    deleting.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <el-card shadow="never">
      <el-form :inline="true" @submit.prevent="search">
        <el-form-item label="关键词">
          <el-input v-model="query.keyword" clearable placeholder="群名 / 群主 / 手机号" style="width:240px" />
        </el-form-item>
        <el-form-item label="群 ID">
          <el-input v-model.number="query.conversationId" clearable placeholder="群 ID" style="width:120px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="search">搜索</el-button>
          <el-button @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never">
      <div class="batch">
        <span>已选 {{ selected.length }} 条</span>
        <el-button type="danger" :disabled="!selected.length" :loading="deleting" @click="removeSelected">
          删除选中
        </el-button>
      </div>
      <el-table
        ref="tableRef"
        v-loading="loading"
        :data="rows"
        row-key="id"
        stripe
        empty-text="暂无群解散记录"
        @selection-change="selected = $event"
      >
        <el-table-column type="selection" width="48" />
        <el-table-column label="群聊" min-width="180">
          <template #default="{ row }">
            <div class="title">{{ row.conversationTitle || '—' }}</div>
            <div class="sub">原群 ID {{ row.conversationId ?? '—' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="原群主" min-width="160">
          <template #default="{ row }">
            <div class="title">{{ row.userNickname || '—' }}</div>
            <div class="sub">{{ row.userPhone || `ID ${row.userId ?? '—'}` }}</div>
          </template>
        </el-table-column>
        <el-table-column label="解散方式" width="130">
          <template #default="{ row }">
            <el-tag type="danger" effect="plain">{{ row.source === 'admin' ? '后台解散' : '群主解散' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="成员数" width="100">
          <template #default="{ row }">{{ memberCount(row.reason) ?? '—' }}</template>
        </el-table-column>
        <el-table-column prop="reason" label="记录说明" min-width="220" show-overflow-tooltip />
        <el-table-column label="解散时间" width="180">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.size"
          :total="total"
          :page-sizes="[10,20,50]"
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
.page{display:flex;flex-direction:column;gap:16px}.batch{display:flex;align-items:center;gap:12px;margin-bottom:12px;color:#606266;font-size:13px}.title{font-weight:600;color:#303133}.sub{margin-top:3px;color:#909399;font-size:12px}.pager{display:flex;justify-content:flex-end;margin-top:16px}
</style>

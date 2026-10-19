<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from '@/utils/elementFeedback'
import { fetchUserDeletionLogs, type UserDeletionLog } from '@/api/userDeletionLogs'
import { formatTime } from '@/utils/datetime'

const loading = ref(false)
const rows = ref<UserDeletionLog[]>([])
const total = ref(0)
const query = reactive({ keyword: '', userId: '' as number | '', page: 1, size: 20 })
const yuan = (value: number) => `¥${(Number(value || 0) / 100).toFixed(2)}`

async function load() {
  loading.value = true
  try {
    const result = await fetchUserDeletionLogs(query)
    rows.value = result.list
    total.value = result.total
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载用户注销记录失败')
  } finally {
    loading.value = false
  }
}

function search() {
  query.page = 1
  load()
}

function reset() {
  query.keyword = ''
  query.userId = ''
  query.page = 1
  load()
}

onMounted(load)
</script>

<template>
  <div class="page">
    <el-card shadow="never" class="toolbar-card">
      <el-form :inline="true" @submit.prevent="search">
        <el-form-item label="关键词">
          <el-input v-model="query.keyword" clearable placeholder="手机号、昵称或 PulseID" style="width: 240px" />
        </el-form-item>
        <el-form-item label="用户 ID">
          <el-input-number v-model="query.userId" :controls="false" :min="1" placeholder="全部用户" style="width: 160px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="search">搜索</el-button>
          <el-button @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
    <el-card shadow="never" class="table-card">
      <el-table v-loading="loading" :data="rows" stripe empty-text="暂无用户注销记录">
        <el-table-column prop="id" label="记录 ID" width="110" />
        <el-table-column label="注销用户" min-width="210">
          <template #default="{ row }">
            <div class="title">{{ row.nickname || '—' }}</div>
            <div class="sub">用户 ID {{ row.userId }} · {{ row.phone || '未绑定手机号' }}</div>
            <div class="sub">PulseID {{ row.pulseId || '—' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="注销时余额" width="130">
          <template #default="{ row }">{{ yuan(row.walletBalance || 0) }}</template>
        </el-table-column>
        <el-table-column label="协议" min-width="170">
          <template #default="{ row }">{{ row.agreementTitle || '账号注销协议' }}</template>
        </el-table-column>
        <el-table-column label="注销时间（北京时间）" width="210">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination v-model:current-page="query.page" v-model:page-size="query.size" :total="total" :page-sizes="[10, 20, 50, 100]" layout="total, sizes, prev, pager, next" background @current-change="load" @size-change="() => { query.page = 1; load() }" />
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 16px; }
.toolbar-card, .table-card { border-radius: 8px; }
.toolbar-card :deep(.el-card__body) { padding-bottom: 2px; }
.title { color: #303133; font-weight: 600; }
.sub { margin-top: 3px; color: #909399; font-size: 12px; }
.pager { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>

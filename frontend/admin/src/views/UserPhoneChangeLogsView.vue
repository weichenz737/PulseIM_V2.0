<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from '@/utils/elementFeedback'
import {
  fetchUserPhoneChangeLogs,
  type UserPhoneChangeLog,
} from '@/api/phoneChangeLogs'
import { formatTime } from '@/utils/datetime'

const route = useRoute()
const loading = ref(false)
const rows = ref<UserPhoneChangeLog[]>([])
const total = ref(0)
const query = reactive({
  userId: '' as number | '',
  page: 1,
  size: 20,
})

function applyRouteQuery() {
  const raw = route.query.userId
  if (raw == null || String(raw).trim() === '') {
    query.userId = ''
    return
  }
  const value = Number(raw)
  query.userId = Number.isInteger(value) && value > 0 ? value : ''
}

async function load() {
  loading.value = true
  try {
    const data = await fetchUserPhoneChangeLogs(query)
    rows.value = data.list
    total.value = data.total
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载手机号修改记录失败')
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  query.page = 1
  load()
}

function handleReset() {
  query.userId = ''
  query.page = 1
  load()
}

onMounted(() => {
  applyRouteQuery()
  load()
})

watch(
  () => route.query.userId,
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
        <el-form-item label="用户 ID">
          <el-input-number
            v-model="query.userId"
            :controls="false"
            :min="1"
            placeholder="全部用户"
            style="width: 180px"
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
      <el-table
        v-loading="loading"
        :data="rows"
        stripe
        empty-text="暂无手机号修改记录"
      >
        <el-table-column prop="id" label="记录 ID" width="110" />
        <el-table-column label="用户" min-width="180">
          <template #default="{ row }">
            <div class="title">{{ row.nickname || '—' }}</div>
            <div class="sub">用户 ID {{ row.userId || '—' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="原手机号" min-width="150">
          <template #default="{ row }">{{ row.oldPhone || '—' }}</template>
        </el-table-column>
        <el-table-column label="新手机号" min-width="150">
          <template #default="{ row }">{{ row.newPhone || '—' }}</template>
        </el-table-column>
        <el-table-column label="修改时间（北京时间）" width="200">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.size"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
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
  border-radius: 8px;
}

.toolbar-card :deep(.el-card__body) {
  padding-bottom: 2px;
}

.title {
  font-weight: 600;
  color: #303133;
}

.sub {
  margin-top: 2px;
  color: #909399;
  font-size: 12px;
}

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>

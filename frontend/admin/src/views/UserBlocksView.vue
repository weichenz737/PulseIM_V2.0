<script setup lang="ts">
import { formatTime } from '@/utils/datetime'
import { onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from '@/utils/elementFeedback'
import { fetchAllUserBlocks, type AdminBlockedUser } from '@/api/users'
import { resolveAvatarUrl } from '@/api/files'
import AdminAvatar from '@/components/AdminAvatar.vue'

const route = useRoute()
const loading = ref(false)
const rows = ref<AdminBlockedUser[]>([])
const total = ref(0)
const query = reactive({
  keyword: '',
  userId: '' as number | '',
  page: 1,
  size: 20,
})

function applyRouteQuery() {
  const raw = route.query.userId
  if (raw != null && String(raw).trim() !== '') {
    const n = Number(raw)
    if (!Number.isNaN(n) && n > 0) query.userId = n
  }
}

async function load() {
  loading.value = true
  try {
    const data = await fetchAllUserBlocks({
      page: query.page,
      size: query.size,
      keyword: query.keyword.trim(),
      userId: query.userId,
    })
    rows.value = data.list
    total.value = data.total
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载黑名单失败')
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
  query.userId = ''
  query.page = 1
  load()
}


function avatarSrc(url?: string) {
  return resolveAvatarUrl(url) || undefined
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
        <el-form-item label="关键词">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="用户 / 被拉黑昵称、手机、PulseID"
            style="width: 260px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="用户 ID">
          <el-input-number v-model="query.userId" :controls="false" placeholder="可选" style="width: 140px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="table-card">
      <el-table v-loading="loading" :data="rows" stripe empty-text="暂无黑名单记录">
        <el-table-column label="用户" min-width="180">
          <template #default="{ row }">
            <div class="title">{{ row.ownerNickname || '—' }}</div>
            <div class="sub">
              ID {{ row.ownerUserId ?? '—' }}
              <template v-if="row.ownerPhone"> · {{ row.ownerPhone }}</template>
              <template v-if="row.ownerPulseId"> · {{ row.ownerPulseId }}</template>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="被拉黑用户" min-width="220">
          <template #default="{ row }">
            <div class="peer">
              <AdminAvatar :size="36" :url="avatarSrc(row.avatarUrl)">
                {{ (row.nickname || '?').slice(0, 1) }}
              </AdminAvatar>
              <div>
                <div class="title">{{ row.nickname || '—' }}</div>
                <div class="sub">
                  ID {{ row.userId ?? '—' }}
                  <template v-if="row.phone"> · {{ row.phone }}</template>
                  <template v-if="row.pulseId"> · {{ row.pulseId }}</template>
                </div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="备注" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.remark || '—' }}</template>
        </el-table-column>
        <el-table-column label="拉黑时间" width="170">
          <template #default="{ row }">{{ formatTime(row.blockedAt) }}</template>
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
.title {
  font-weight: 600;
  color: #303133;
}
.sub {
  margin-top: 2px;
  font-size: 12px;
  color: #909399;
}
.peer {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>

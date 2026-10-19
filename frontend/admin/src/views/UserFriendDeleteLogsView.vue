<script setup lang="ts">
import { formatTime } from '@/utils/datetime'
import { onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from '@/utils/elementFeedback'
import { fetchAllFriendDeleteLogs, type AdminFriendDeleteLog } from '@/api/users'
import { resolveAvatarUrl } from '@/api/files'
import AdminAvatar from '@/components/AdminAvatar.vue'

const route = useRoute()
const loading = ref(false)
const rows = ref<AdminFriendDeleteLog[]>([])
const total = ref(0)
const query = reactive({
  keyword: '',
  userId: '' as number | '',
  reason: '' as string | '',
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
    const data = await fetchAllFriendDeleteLogs({
      page: query.page,
      size: query.size,
      keyword: query.keyword.trim(),
      userId: query.userId,
      reason: query.reason,
    })
    rows.value = data.list
    total.value = data.total
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载删友记录失败')
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
  query.reason = ''
  query.page = 1
  load()
}


function avatarSrc(url?: string) {
  return resolveAvatarUrl(url) || undefined
}

function reasonLabel(reason?: string, backendLabel?: string) {
  if (backendLabel && !/^[A-Za-z0-9_.:/-]+$/.test(backendLabel)) return backendLabel
  return ({ delete: '主动删除', block: '拉黑解除' } as Record<string, string>)[String(reason || '').toLowerCase()] || (reason ? '其他原因' : '—')
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
            placeholder="用户 / 原好友昵称、手机、PulseID"
            style="width: 260px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="用户 ID">
          <el-input-number v-model="query.userId" :controls="false" placeholder="可选" style="width: 140px" />
        </el-form-item>
        <el-form-item label="原因">
          <el-select v-model="query.reason" clearable placeholder="全部" style="width: 130px">
            <el-option label="主动删除" value="delete" />
            <el-option label="拉黑解除" value="block" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="table-card">
      <el-table v-loading="loading" :data="rows" stripe empty-text="暂无删友记录">
        <el-table-column label="用户" min-width="170">
          <template #default="{ row }">
            <div class="title">{{ row.userNickname || '—' }}</div>
            <div class="sub">
              ID {{ row.userId ?? '—' }}
              <template v-if="row.userPhone"> · {{ row.userPhone }}</template>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="原好友" min-width="220">
          <template #default="{ row }">
            <div class="peer">
              <AdminAvatar :size="36" :url="avatarSrc(row.friendAvatarUrl)">
                {{ (row.friendNickname || '?').slice(0, 1) }}
              </AdminAvatar>
              <div>
                <div class="title">{{ row.friendNickname || '—' }}</div>
                <div class="sub">
                  ID {{ row.friendId ?? '—' }}
                  <template v-if="row.friendPhone"> · {{ row.friendPhone }}</template>
                </div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="原因" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="row.reason === 'block' ? 'danger' : 'warning'">
              {{ reasonLabel(row.reason, row.reasonLabel) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="原添加方式" width="120">
          <template #default="{ row }">{{ row.addSourceLabel || '—' }}</template>
        </el-table-column>
        <el-table-column label="曾为好友自" width="170">
          <template #default="{ row }">{{ formatTime(row.friendSince) }}</template>
        </el-table-column>
        <el-table-column label="删除时间" width="170">
          <template #default="{ row }">{{ formatTime(row.deletedAt) }}</template>
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

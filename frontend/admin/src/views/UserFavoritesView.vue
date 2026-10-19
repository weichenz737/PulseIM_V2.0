<script setup lang="ts">
import { formatTime } from '@/utils/datetime'
import { onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from '@/utils/elementFeedback'
import { fetchAllUserFavorites, type AdminFavorite } from '@/api/users'
import { resolveFileUrl } from '@/api/files'

const route = useRoute()
const loading = ref(false)
const rows = ref<AdminFavorite[]>([])
const total = ref(0)
const query = reactive({
  keyword: '',
  userId: '' as number | '',
  msgType: '' as number | '',
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
    const data = await fetchAllUserFavorites({
      page: query.page,
      size: query.size,
      keyword: query.keyword.trim(),
      userId: query.userId,
      msgType: query.msgType,
    })
    rows.value = data.list
    total.value = data.total
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载收藏失败')
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
  query.msgType = ''
  query.page = 1
  load()
}

function favoritePayload(row: AdminFavorite): Record<string, unknown> {
  const content = row.content?.trim()
  if (!content?.startsWith('{')) return {}
  try {
    return JSON.parse(content) as Record<string, unknown>
  } catch {
    return {}
  }
}

function favoriteMediaUrl(row: AdminFavorite) {
  const payload = favoritePayload(row)
  const content = row.content?.trim() || ''
  return resolveFileUrl(String(payload.thumbUrl || payload.url || payload.fileUrl || payload.src || content))
}

function favoriteOriginalUrl(row: AdminFavorite) {
  const payload = favoritePayload(row)
  const content = row.content?.trim() || ''
  return resolveFileUrl(String(payload.originalUrl || payload.url || payload.fileUrl || payload.src || content))
}

function favoriteFileName(row: AdminFavorite) {
  const payload = favoritePayload(row)
  return String(payload.name || payload.fileName || row.contentPreview || '查看文件')
}

function favoriteText(row: AdminFavorite) {
  if (row.msgType === 0) return row.content || row.contentPreview || '—'
  return row.contentPreview || row.content || '—'
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
            placeholder="用户 / 来源 / 内容"
            style="width: 240px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="用户 ID">
          <el-input-number v-model="query.userId" :controls="false" placeholder="可选" style="width: 140px" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="query.msgType" clearable placeholder="全部" style="width: 120px">
            <el-option label="文本" :value="0" />
            <el-option label="图片" :value="1" />
            <el-option label="文件/视频" :value="2" />
            <el-option label="语音" :value="3" />
            <el-option label="聊天记录" :value="4" />
            <el-option label="名片" :value="5" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="table-card">
      <el-table v-loading="loading" :data="rows" stripe empty-text="暂无收藏">
        <el-table-column label="用户" min-width="170">
          <template #default="{ row }">
            <div class="title">{{ row.ownerNickname || '—' }}</div>
            <div class="sub">
              ID {{ row.ownerUserId ?? '—' }}
              <template v-if="row.ownerPhone"> · {{ row.ownerPhone }}</template>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="110">
          <template #default="{ row }">{{ row.msgTypeLabel || '—' }}</template>
        </el-table-column>
        <el-table-column label="收藏内容" min-width="320">
          <template #default="{ row }">
            <el-image
              v-if="row.msgType === 1 && favoriteMediaUrl(row)"
              class="favorite-image"
              :src="favoriteMediaUrl(row)"
              :preview-src-list="[favoriteOriginalUrl(row)]"
              preview-teleported
              fit="cover"
              lazy
            />
            <audio
              v-else-if="row.msgType === 3 && favoriteMediaUrl(row)"
              class="favorite-audio"
              :src="favoriteMediaUrl(row)"
              controls
              preload="none"
            />
            <a
              v-else-if="row.msgType === 2 && favoriteMediaUrl(row)"
              class="favorite-file"
              :href="favoriteMediaUrl(row)"
              target="_blank"
              rel="noopener noreferrer"
            >{{ favoriteFileName(row) }}</a>
            <div v-else class="favorite-content">{{ favoriteText(row) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="来自" width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.fromNickname || '—' }}</template>
        </el-table-column>
        <el-table-column label="会话" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.sourceTitle || '—' }}</template>
        </el-table-column>
        <el-table-column label="收藏时间" width="170">
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
.title {
  font-weight: 600;
  color: #303133;
}
.sub {
  margin-top: 2px;
  font-size: 12px;
  color: #909399;
}
.favorite-content {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.5;
  color: #303133;
}
.favorite-image {
  width: 72px;
  height: 72px;
  border-radius: 6px;
}
.favorite-audio {
  width: min(280px, 100%);
  height: 36px;
}
.favorite-file {
  color: #409eff;
  overflow-wrap: anywhere;
}
.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>

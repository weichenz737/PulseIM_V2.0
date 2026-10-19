<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from '@/utils/elementFeedback'
import { fetchCommunityContent, moderateCommunityPost, type AdminCommunityPost } from '@/api/communities'
import { loadAdminMediaSource, normalizeAdminMedia } from '@/utils/adminMedia'

const loading = ref(false)
const rows = ref<AdminCommunityPost[]>([])
const total = ref(0)
const mediaUrls = ref<Record<string, string>>({})
const mediaLoading = ref<Record<string, boolean>>({})
const query = reactive({ status: '', keyword: '', page: 1, size: 20 })

function statusLabel(status: string) {
  return ({ PENDING: '待审核', PUBLISHED: '已发布', BLOCKED: '已屏蔽', DELETED: '已删除' } as Record<string, string>)[status]
    || (status ? '其他状态' : '—')
}

function mediaItems(row: AdminCommunityPost) {
  return normalizeAdminMedia(row.images, row.original_images, row.media_types, row.media_file_ids, row.video)
}

function mediaKey(row: AdminCommunityPost, index: number) {
  return `${row.id}:${index}`
}

function mediaUrl(row: AdminCommunityPost, index: number) {
  return mediaUrls.value[mediaKey(row, index)] || ''
}

function mediaBusy(row: AdminCommunityPost, index: number) {
  return !!mediaLoading.value[mediaKey(row, index)]
}

async function warmMedia(items: AdminCommunityPost[]) {
  const jobs = items.flatMap((row) => mediaItems(row).map(async (media, index) => {
    const key = mediaKey(row, index)
    if (mediaUrls.value[key] || mediaLoading.value[key]) return
    mediaLoading.value = { ...mediaLoading.value, [key]: true }
    try {
      const variants = media.kind === 'video' ? ['preview', 'original'] as const : ['preview', 'thumb', 'original'] as const
      let url = ''
      for (const variant of variants) {
        try {
          url = await loadAdminMediaSource(media.source, media.fileId, variant, 'communities/content')
          if (url) break
        } catch {
          // A historical upload may not have every generated rendition.
        }
      }
      if (url) mediaUrls.value = { ...mediaUrls.value, [key]: url }
    } catch {
      // Keep the row usable when an old/deleted media object is unavailable.
    } finally {
      const next = { ...mediaLoading.value }
      delete next[key]
      mediaLoading.value = next
    }
  }))
  await Promise.all(jobs)
}

async function load() {
  loading.value = true
  try {
    const data = await fetchCommunityContent({
      status: query.status || undefined,
      keyword: query.keyword || undefined,
      page: query.page,
      size: query.size,
    })
    rows.value = data.items
    total.value = data.total
    void warmMedia(rows.value)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载失败')
  } finally {
    loading.value = false
  }
}

async function act(row: AdminCommunityPost, status: string) {
  try {
    await moderateCommunityPost(row.id, status)
    ElMessage.success('操作成功')
    await load()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败')
  }
}

function openMedia(row: AdminCommunityPost, index: number) {
  const url = mediaUrl(row, index)
  if (url) window.open(url, '_blank', 'noopener,noreferrer')
}

onMounted(load)
</script>

<template>
  <div class="community-content-page">
    <el-card class="toolbar">
      <el-form inline @submit.prevent="query.page = 1; load()">
        <el-form-item label="关键词"><el-input v-model="query.keyword" clearable placeholder="圈子、作者或内容" /></el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" clearable>
            <el-option label="待审核" value="PENDING" />
            <el-option label="已发布" value="PUBLISHED" />
            <el-option label="已屏蔽" value="BLOCKED" />
            <el-option label="已删除" value="DELETED" />
          </el-select>
        </el-form-item>
        <el-button type="primary" @click="query.page = 1; load()">查询</el-button>
      </el-form>
    </el-card>

    <el-card>
      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column prop="community_name" label="圈子" width="150" />
        <el-table-column prop="nickname" label="发布者" width="110" />
        <el-table-column prop="content" label="动态内容" min-width="220" show-overflow-tooltip />
        <el-table-column label="媒体" width="240">
          <template #default="{ row }">
            <div v-if="mediaItems(row).length" class="media-list">
              <button
                v-for="(media, index) in mediaItems(row).slice(0, 4)"
                :key="index"
                type="button"
                class="media-thumb"
                :title="media.kind === 'video' ? '打开视频' : '打开图片'"
                :disabled="mediaBusy(row, index) || !mediaUrl(row, index)"
                @click="openMedia(row, index)"
              >
                <img v-if="mediaUrl(row, index) && media.kind === 'image'" :src="mediaUrl(row, index)" alt="" />
                <video v-else-if="mediaUrl(row, index)" :src="mediaUrl(row, index)" muted preload="metadata" />
                <span v-else>{{ mediaBusy(row, index) ? '加载中' : '不可用' }}</span>
                <i v-if="media.kind === 'video' && mediaUrl(row, index)" class="play-badge">▶</i>
              </button>
              <span v-if="mediaItems(row).length > 4" class="more-count">+{{ mediaItems(row).length - 4 }}</span>
            </div>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column prop="like_count" label="点赞" width="70" />
        <el-table-column prop="comment_count" label="评论" width="70" />
        <el-table-column label="状态" width="95"><template #default="{ row }"><el-tag>{{ statusLabel(row.status) }}</el-tag></template></el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status !== 'PUBLISHED'" link type="success" @click="act(row, 'PUBLISHED')">通过</el-button>
            <el-button v-if="row.status !== 'BLOCKED'" link type="warning" @click="act(row, 'BLOCKED')">屏蔽</el-button>
            <el-button v-if="row.status !== 'DELETED'" link type="danger" @click="act(row, 'DELETED')">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination v-model:current-page="query.page" v-model:page-size="query.size" :total="total" layout="total,prev,pager,next" @current-change="load" />
    </el-card>
  </div>
</template>

<style scoped>
.toolbar { margin-bottom: 16px; overflow-x: auto; }
.toolbar :deep(.el-form) { display: flex; align-items: center; flex-wrap: nowrap; gap: 24px; min-width: 720px; }
.toolbar :deep(.el-form-item) { flex: none; margin: 0; }
.toolbar :deep(.el-form-item:first-child .el-input) { width: 272px; }
.toolbar :deep(.el-form-item:nth-child(2) .el-select) { width: 175px; }
.toolbar :deep(.el-button) { flex: none; }
.el-pagination { margin-top: 16px; justify-content: flex-end; }
.media-list { display: flex; align-items: center; gap: 6px; min-height: 48px; }
.media-thumb { position: relative; width: 48px; height: 48px; padding: 0; overflow: hidden; border: 0; border-radius: 6px; background: #e2e8f0; cursor: pointer; }
.media-thumb:disabled { cursor: default; }
.media-thumb img, .media-thumb video { width: 100%; height: 100%; object-fit: cover; }
.media-thumb span { color: #64748b; font-size: 11px; }
.play-badge { position: absolute; right: 3px; bottom: 2px; color: #fff; font-size: 12px; font-style: normal; text-shadow: 0 1px 2px #000; }
.more-count { color: #64748b; font-size: 12px; }
</style>

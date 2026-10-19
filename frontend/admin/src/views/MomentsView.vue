<script setup lang="ts">
import { formatTime } from '@/utils/datetime'
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from '@/utils/elementFeedback'
import type { TableInstance } from 'element-plus'
import {
  deleteMoment,
  deleteMoments,
  fetchMoment,
  fetchMoments,
  type AdminMoment,
} from '@/api/moments'
import { resolveAvatarUrl } from '@/api/files'
import AdminAvatar from '@/components/AdminAvatar.vue'
import { loadAdminMediaSource, normalizeAdminMedia } from '@/utils/adminMedia'

const loading = ref(false)
const deleting = ref(false)
const moments = ref<AdminMoment[]>([])
const total = ref(0)
const tableRef = ref<TableInstance>()
const selectedRows = ref<AdminMoment[]>([])

const query = reactive({
  keyword: '',
  status: '' as string,
  page: 1,
  size: 20,
})

const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref<AdminMoment | null>(null)
const detailMediaLoading = ref(false)
const detailMediaUrls = ref<Record<string, string>>({})
let detailMediaLoadSequence = 0

async function loadMoments() {
  loading.value = true
  selectedRows.value = []
  try {
    const data = await fetchMoments({
      page: query.page,
      size: query.size,
      keyword: query.keyword.trim(),
      status: query.status,
    })
    moments.value = data.list
    total.value = data.total
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载动态失败')
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  query.page = 1
  loadMoments()
}

function handleReset() {
  query.keyword = ''
  query.status = ''
  query.page = 1
  loadMoments()
}


function avatarUrl(url?: string) {
  return resolveAvatarUrl(url) || undefined
}

function statusTagType(status?: string) {
  if (status === 'user_deleted') return 'info'
  if (status === 'admin_deleted') return 'danger'
  return 'success'
}

function contentPreview(row: AdminMoment) {
  const text = (row.content || '').trim()
  if (text) return text
  const n = row.images?.length || 0
  if (n > 0) return `[媒体 ×${n}]`
  return '—'
}

function onSelectionChange(rows: AdminMoment[]) {
  selectedRows.value = rows
}

function clearSelection() {
  tableRef.value?.clearSelection()
  selectedRows.value = []
}

function momentMediaItems(value: AdminMoment | null) {
  if (!value) return []
  return normalizeAdminMedia(
    value.images,
    value.originalImages,
    value.mediaTypes,
    value.mediaFileIds,
  )
}

function momentMediaUrl(index: number): string {
  return detailMediaUrls.value[`media:${index}`] || ''
}

function commentMediaUrl(commentId: number): string {
  return detailMediaUrls.value[`comment:${commentId}`] || ''
}

async function loadDetailMedia(value: AdminMoment): Promise<void> {
  const sequence = ++detailMediaLoadSequence
  detailMediaUrls.value = {}
  detailMediaLoading.value = true
  const items = momentMediaItems(value)
  const jobs = items.map(async (item, index) => {
    try {
      const variants = item.kind === 'video' ? ['preview', 'original'] as const : ['preview', 'thumb', 'original'] as const
      let url = ''
      for (const variant of variants) {
        try {
          url = await loadAdminMediaSource(item.source, item.fileId, variant)
          if (url) break
        } catch {
          // A historical upload may not have every generated rendition.
        }
      }
      if (sequence === detailMediaLoadSequence && url) {
        detailMediaUrls.value = { ...detailMediaUrls.value, [`media:${index}`]: url }
      }
    } catch {
      // Keep a per-item placeholder; one broken historical file must not hide the rest.
    }
  })
  const comments = (value.comments || []).filter((comment) => comment.imageUrl || comment.imageFileId)
  jobs.push(...comments.map(async (comment) => {
    try {
      const url = await loadAdminMediaSource(comment.imageUrl || '', comment.imageFileId || '', 'original')
      if (sequence === detailMediaLoadSequence && url) {
        detailMediaUrls.value = { ...detailMediaUrls.value, [`comment:${comment.id}`]: url }
      }
    } catch {
      // Keep the comment text visible if its historical image is unavailable.
    }
  }))
  await Promise.all(jobs)
  if (sequence === detailMediaLoadSequence) detailMediaLoading.value = false
}

async function openDetail(row: AdminMoment) {
  detailVisible.value = true
  detailLoading.value = true
  detail.value = row
  detailMediaUrls.value = {}
  try {
    detail.value = await fetchMoment(row.id)
    await loadDetailMedia(detail.value)
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载详情失败')
  } finally {
    detailLoading.value = false
  }
}

async function handleDelete(row: AdminMoment) {
  if (row.status === 'admin_deleted') {
    ElMessage.info('该动态已被管理员删除')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确定删除动态 #${row.id} 吗？删除后用户端不可见，后台仍可查看并显示「管理员已删」。`,
      '删除动态',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      },
    )
    deleting.value = true
    await deleteMoment(row.id)
    ElMessage.success('已删除')
    await loadMoments()
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(e instanceof Error ? e.message : '删除失败')
  } finally {
    deleting.value = false
  }
}

async function handleBatchDelete() {
  const targets = selectedRows.value.filter((r) => r.status !== 'admin_deleted')
  if (!targets.length) {
    ElMessage.warning('请先勾选可删除的动态（管理员已删的无需再删）')
    return
  }
  const ids = targets.map((r) => r.id)
  try {
    await ElMessageBox.confirm(
      `确定删除选中的 ${ids.length} 条动态吗？删除后用户端不可见，后台仍保留记录。`,
      '批量删除',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      },
    )
    deleting.value = true
    const n = await deleteMoments(ids)
    ElMessage.success(`已删除 ${n} 条`)
    clearSelection()
    if (moments.value.length <= ids.length && query.page > 1) {
      query.page -= 1
    }
    await loadMoments()
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(e instanceof Error ? e.message : '删除失败')
  } finally {
    deleting.value = false
  }
}

onMounted(loadMoments)
</script>

<template>
  <div class="moments-page">
    <el-card shadow="never" class="toolbar-card">
      <el-form :inline="true" @submit.prevent="handleSearch">
        <el-form-item label="关键词">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="内容 / 昵称 / 手机号 / 动态ID"
            style="width: 260px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" clearable placeholder="全部" style="width: 140px">
            <el-option label="正常" value="normal" />
            <el-option label="用户已删" value="user_deleted" />
            <el-option label="管理员已删" value="admin_deleted" />
            <el-option label="全部已删" value="deleted" />
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
        :data="moments"
        stripe
        row-key="id"
        empty-text="暂无动态"
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="48" />
        <el-table-column label="ID" prop="id" width="80" />
        <el-table-column label="发布者" min-width="180">
          <template #default="{ row }">
            <div class="user-cell">
            <AdminAvatar :size="36" :url="avatarUrl(row.avatarUrl)">
              {{ (row.nickname || '用').slice(0, 1) }}
            </AdminAvatar>
              <div class="user-meta">
                <div class="nickname">{{ row.nickname || '—' }}</div>
                <div class="sub">
                  {{ row.phone || '—' }}
                  <template v-if="row.pulseId"> · {{ row.pulseId }}</template>
                </div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="内容" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">{{ contentPreview(row) }}</template>
        </el-table-column>
        <el-table-column label="媒体" width="72" align="center">
          <template #default="{ row }">{{ row.images?.length || 0 }}</template>
        </el-table-column>
        <el-table-column label="可见范围" width="100">
          <template #default="{ row }">{{ row.visibilityLabel || '好友可见' }}</template>
        </el-table-column>
        <el-table-column label="赞/评" width="90" align="center">
          <template #default="{ row }">{{ row.likeCount || 0 }} / {{ row.commentCount || 0 }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">
              {{ row.statusLabel || '正常' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="发布时间" width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">详情</el-button>
            <el-button
              link
              type="danger"
              :disabled="row.status === 'admin_deleted'"
              @click="handleDelete(row)"
            >删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.size"
          background
          layout="total, sizes, prev, pager, next"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          @current-change="loadMoments"
          @size-change="
            () => {
              query.page = 1
              loadMoments()
            }
          "
        />
      </div>
    </el-card>

    <el-drawer v-model="detailVisible" title="动态详情" size="520px" destroy-on-close>
      <div v-loading="detailLoading" class="detail-body">
        <template v-if="detail">
          <div class="detail-user">
            <AdminAvatar :size="44" :url="avatarUrl(detail.avatarUrl)">
              {{ (detail.nickname || '用').slice(0, 1) }}
            </AdminAvatar>
            <div>
              <div class="nickname">{{ detail.nickname || '—' }}</div>
              <div class="sub">
                {{ detail.phone || '—' }}
                <template v-if="detail.pulseId"> · PulseID {{ detail.pulseId }}</template>
              </div>
            </div>
          </div>

          <el-descriptions :column="1" border size="small" class="detail-desc">
            <el-descriptions-item label="动态 ID">{{ detail.id }}</el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="statusTagType(detail.status)" size="small">
                {{ detail.statusLabel || '正常' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="可见范围">
              {{ detail.visibilityLabel || '好友可见' }}
            </el-descriptions-item>
            <el-descriptions-item label="发布时间">{{ formatTime(detail.createdAt) }}</el-descriptions-item>
            <el-descriptions-item v-if="detail.removedAt" label="删除时间">
              {{ formatTime(detail.removedAt) }}
              <span v-if="detail.removedBy">（{{ detail.removedBy === 'admin' ? '管理员' : '用户' }}）</span>
            </el-descriptions-item>
            <el-descriptions-item v-if="detail.mentionNicknames?.length" label="@提醒">
              {{ detail.mentionNicknames.join('、') }}
            </el-descriptions-item>
          </el-descriptions>

          <div class="section-title">正文</div>
          <div class="content-box">{{ detail.content?.trim() || '（无文字）' }}</div>

          <template v-if="momentMediaItems(detail).length">
            <div class="section-title">媒体</div>
            <div class="media-grid">
              <div
                v-for="(media, idx) in momentMediaItems(detail)"
                :key="idx"
                class="media-item"
              >
                <a
                  v-if="momentMediaUrl(idx)"
                  :href="momentMediaUrl(idx)"
                  target="_blank"
                  rel="noopener"
                >
                  <video v-if="media.kind === 'video'" :src="momentMediaUrl(idx)" muted controls preload="metadata" />
                  <img v-else :src="momentMediaUrl(idx)" alt="" loading="lazy" decoding="async" />
                </a>
                <span v-else class="media-placeholder">
                  {{ detailMediaLoading ? '加载中…' : '媒体不可用' }}
                </span>
              </div>
            </div>
          </template>

          <div class="section-title">点赞（{{ detail.likeCount || 0 }}）</div>
          <div class="plain-box">
            {{ detail.likeNicknames?.length ? detail.likeNicknames.join('、') : '暂无点赞' }}
          </div>

          <div class="section-title">评论（{{ detail.comments?.length || 0 }}）</div>
          <div v-if="!detail.comments?.length" class="plain-box">暂无评论</div>
          <div v-else class="comment-list">
            <div v-for="c in detail.comments" :key="c.id" class="comment-item">
              <div class="comment-head">
                <span class="comment-name">{{ c.nickname || '用户' }}</span>
                <span class="comment-time">{{ formatTime(c.createdAt) }}</span>
              </div>
              <div class="comment-text">
                <template v-if="c.replyToNickname">回复 {{ c.replyToNickname }}：</template>
                {{ c.content || (c.imageUrl ? '[图片]' : '') }}
              </div>
              <img
                v-if="c.imageUrl || c.imageFileId"
                class="comment-img"
                :src="commentMediaUrl(c.id)"
                alt=""
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.moments-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  color: #64748b;
  font-size: 13px;
  margin-right: 4px;
}

.user-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.user-meta .nickname {
  font-weight: 600;
  color: #0f172a;
}

.user-meta .sub,
.detail-user .sub {
  font-size: 12px;
  color: #64748b;
  margin-top: 2px;
}

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.detail-body {
  min-height: 200px;
}

.detail-user {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.detail-user .nickname {
  font-size: 16px;
  font-weight: 600;
}

.detail-desc {
  margin-bottom: 8px;
}

.section-title {
  margin: 16px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: #334155;
}

.content-box,
.plain-box {
  padding: 10px 12px;
  border-radius: 8px;
  background: #f8fafc;
  color: #0f172a;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
  font-size: 14px;
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.media-item {
  display: block;
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  background: #e2e8f0;
}

.media-item > a {
  display: block;
  width: 100%;
  height: 100%;
}

.media-placeholder {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  color: #64748b;
  font-size: 12px;
}

.media-item img,
.media-item video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.comment-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.comment-item {
  padding: 10px 12px;
  border-radius: 8px;
  background: #f8fafc;
}

.comment-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.comment-name {
  font-weight: 600;
  font-size: 13px;
}

.comment-time {
  font-size: 12px;
  color: #94a3b8;
}

.comment-text {
  font-size: 13px;
  color: #334155;
  line-height: 1.45;
  word-break: break-word;
}

.comment-img {
  margin-top: 8px;
  max-width: 120px;
  border-radius: 6px;
}
</style>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from '@/utils/elementFeedback'
import type { UploadRequestOptions } from 'element-plus'
import {
  createCallRingtone,
  deleteCallRingtone,
  fetchCallRingtoneDetail,
  fetchCallRingtoneUsers,
  fetchCallRingtones,
  updateCallRingtone,
  type CallRingtone,
  type CallRingtoneUser,
} from '@/api/callRingtone'
import { resolveFileUrl, uploadAdminRingtone } from '@/api/files'

const loading = ref(false)
const saving = ref(false)
const uploading = ref(false)
const visible = ref(false)
const detailVisible = ref(false)
const rows = ref<CallRingtone[]>([])
const total = ref(0)
const query = reactive({ page: 1, size: 20, keyword: '' })
const form = reactive({
  id: 0,
  name: '',
  url: '',
  enabled: true,
  isDefault: false,
  sortOrder: 0,
})
const detail = ref<CallRingtone | null>(null)
const users = ref<CallRingtoneUser[]>([])
const usersTotal = ref(0)
const usersPage = ref(1)

async function load() {
  loading.value = true
  try {
    const data = await fetchCallRingtones(query)
    rows.value = data.list
    total.value = data.total
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载失败')
  } finally {
    loading.value = false
  }
}

function open(row?: CallRingtone) {
  Object.assign(
    form,
    row
      ? {
          id: row.id,
          name: row.name,
          url: row.url,
          enabled: row.enabled,
          isDefault: row.isDefault,
          sortOrder: row.sortOrder,
        }
      : { id: 0, name: '', url: '', enabled: true, isDefault: false, sortOrder: 0 },
  )
  visible.value = true
}

async function onUpload(options: UploadRequestOptions) {
  const file = options.file as File
  uploading.value = true
  try {
    const uploaded = await uploadAdminRingtone(file)
    form.url = uploaded.url
    if (!form.name.trim()) {
      form.name = (uploaded.name || file.name).replace(/\.[^.]+$/, '')
    }
    ElMessage.success('上传成功（视频已自动转成音频）')
    options.onSuccess?.(uploaded as never)
  } catch (error) {
    const msg = error instanceof Error ? error.message : '上传失败'
    ElMessage.error(msg)
    options.onError?.(error as never)
  } finally {
    uploading.value = false
  }
}

async function save() {
  if (!form.url.trim()) return ElMessage.warning('请先上传铃声')
  if (!form.name.trim()) return ElMessage.warning('请填写名称')
  saving.value = true
  try {
    const payload = {
      name: form.name.trim(),
      url: form.url.trim(),
      enabled: form.enabled,
      isDefault: form.isDefault,
      sortOrder: form.sortOrder,
    }
    if (form.id) await updateCallRingtone(form.id, payload)
    else await createCallRingtone(payload)
    ElMessage.success('保存成功')
    visible.value = false
    await load()
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '保存失败')
  } finally {
    saving.value = false
  }
}

async function remove(row: CallRingtone) {
  try {
    await ElMessageBox.confirm(
      `确定删除「${row.name}」吗？已选用的用户将改回默认铃声。`,
      '删除铃声',
      { type: 'warning' },
    )
    await deleteCallRingtone(row.id)
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    if (e instanceof Error) ElMessage.error(e.message)
  }
}

async function openDetail(row: CallRingtone) {
  detailVisible.value = true
  detail.value = null
  users.value = []
  usersPage.value = 1
  try {
    detail.value = await fetchCallRingtoneDetail(row.id)
    await loadUsers()
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载详情失败')
  }
}

async function loadUsers() {
  if (!detail.value) return
  const data = await fetchCallRingtoneUsers(detail.value.id, {
    page: usersPage.value,
    size: 50,
  })
  users.value = data.list
  usersTotal.value = data.total
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <el-input
        v-model="query.keyword"
        clearable
        placeholder="搜索铃声名称"
        style="width: 260px"
        @keyup.enter="query.page = 1; load()"
      />
      <el-button type="primary" @click="query.page = 1; load()">查询</el-button>
      <el-button type="primary" @click="open()">新增铃声</el-button>
    </div>

    <el-table v-loading="loading" :data="rows" border>
      <el-table-column prop="name" label="名称" min-width="160" show-overflow-tooltip />
      <el-table-column label="试听" min-width="220">
        <template #default="{ row }">
          <audio v-if="row.url" :src="resolveFileUrl(row.url)" controls preload="none" class="audio" />
        </template>
      </el-table-column>
      <el-table-column label="默认" width="90">
        <template #default="{ row }">
          <el-tag v-if="row.isDefault" type="warning">默认</el-tag>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '停用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="usageCount" label="使用人数" width="110" />
      <el-table-column prop="sortOrder" label="排序" width="80" />
      <el-table-column label="操作" width="210" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row)">详情</el-button>
          <el-button link type="primary" @click="open(row)">编辑</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="query.page"
      v-model:page-size="query.size"
      :total="total"
      layout="total, prev, pager, next"
      @current-change="load"
    />

    <el-dialog v-model="visible" :title="form.id ? '编辑铃声' : '新增铃声'" width="560px" destroy-on-close>
      <el-form label-width="90px">
        <el-form-item label="名称">
          <el-input v-model="form.name" maxlength="64" show-word-limit />
        </el-form-item>
        <el-form-item label="上传">
          <el-upload
            :show-file-list="false"
            accept="audio/*,video/mp4,.mp3,.wav,.ogg,.m4a,.aac,.mp4,.mov"
            :http-request="onUpload"
            :disabled="uploading"
          >
            <el-button :loading="uploading">选择文件</el-button>
          </el-upload>
          <p class="hint">支持 mp3/wav/ogg/m4a/aac，也可上传 mp4（自动转音频），最大 20MB</p>
        </el-form-item>
        <el-form-item v-if="form.url" label="预览">
          <audio :src="resolveFileUrl(form.url)" controls preload="none" class="audio" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sortOrder" :min="-9999" :max="9999" />
        </el-form-item>
        <el-form-item label="启用"><el-switch v-model="form.enabled" /></el-form-item>
        <el-form-item label="设为默认"><el-switch v-model="form.isDefault" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="detailVisible" title="铃声详情" size="480px" destroy-on-close>
      <template v-if="detail">
        <p><strong>{{ detail.name }}</strong></p>
        <audio v-if="detail.url" :src="resolveFileUrl(detail.url)" controls preload="none" class="audio" />
        <p class="meta">
          使用人数：{{ detail.usageCount }} ·
          {{ detail.enabled ? '启用' : '停用' }}
          <span v-if="detail.isDefault"> · 默认</span>
        </p>
        <h4>选用用户</h4>
        <el-table :data="users" size="small" border>
          <el-table-column prop="nickname" label="昵称" min-width="100" />
          <el-table-column prop="pulseId" label="脉冲号" width="110" />
          <el-table-column prop="phone" label="手机号" width="120" />
        </el-table>
        <el-pagination
          v-model:current-page="usersPage"
          :page-size="50"
          :total="usersTotal"
          layout="total, prev, pager, next"
          class="pager"
          @current-change="loadUsers"
        />
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.toolbar {
  display: flex;
  gap: 10px;
}
.el-pagination {
  justify-content: flex-end;
}
.audio {
  width: min(100%, 240px);
  height: 32px;
}
.hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: #909399;
}
.meta {
  margin: 12px 0;
  color: #606266;
}
.pager {
  margin-top: 12px;
}
</style>

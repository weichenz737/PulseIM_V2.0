<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from '@/utils/elementFeedback'
import {
  batchImportSensitiveWords,
  createSensitiveWord,
  deleteSensitiveWord,
  fetchSensitiveWords,
  updateSensitiveWord,
  type SensitiveWord,
} from '@/api/sensitiveWords'
import { formatTime } from '@/utils/datetime'

const loading = ref(false)
const saving = ref(false)
const visible = ref(false)
const batchVisible = ref(false)
const rows = ref<SensitiveWord[]>([])
const total = ref(0)
const query = reactive({ page: 1, size: 20, keyword: '', enabled: '' as '' | 'true' | 'false' })
const form = reactive({ id: 0, word: '', enabled: true })
const batchForm = reactive({ text: '', enabled: true })

async function load() {
  loading.value = true
  try {
    const data = await fetchSensitiveWords({
      page: query.page,
      size: query.size,
      keyword: query.keyword.trim() || undefined,
      enabled: query.enabled === '' ? undefined : query.enabled === 'true',
    })
    rows.value = data.list
    total.value = data.total
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载失败')
  } finally {
    loading.value = false
  }
}

function open(row?: SensitiveWord) {
  Object.assign(
    form,
    row
      ? { id: row.id, word: row.word, enabled: row.enabled }
      : { id: 0, word: '', enabled: true },
  )
  visible.value = true
}

async function save() {
  if (!form.word.trim()) return ElMessage.warning('请填写敏感词')
  saving.value = true
  try {
    const payload = { word: form.word.trim(), enabled: form.enabled }
    form.id
      ? await updateSensitiveWord(form.id, payload)
      : await createSensitiveWord(payload)
    ElMessage.success('保存成功')
    visible.value = false
    await load()
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '保存失败')
  } finally {
    saving.value = false
  }
}

async function remove(row: SensitiveWord) {
  try {
    await ElMessageBox.confirm(`确定删除敏感词「${row.word}」吗？`, '删除敏感词', {
      type: 'warning',
    })
    await deleteSensitiveWord(row.id)
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    if (e instanceof Error) ElMessage.error(e.message)
  }
}

async function saveBatch() {
  if (!batchForm.text.trim()) return ElMessage.warning('请填写敏感词，每行一个或用逗号分隔')
  saving.value = true
  try {
    const result = await batchImportSensitiveWords({
      text: batchForm.text,
      enabled: batchForm.enabled,
    })
    ElMessage.success(`导入完成：新增 ${result.inserted}，跳过已存在 ${result.skipped}`)
    batchVisible.value = false
    batchForm.text = ''
    await load()
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '导入失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="tip">
      已启用的敏感字/词同时作用于聊天文本、朋友圈动态、圈子动态、用户昵称和圈子昵称。昵称命中后无法设置，内容命中后不会发送或发布；动态编辑页会提示并清空已编辑文字。
    </div>
    <div class="toolbar">
      <el-input
        v-model="query.keyword"
        clearable
        placeholder="搜索敏感词"
        style="width: 240px"
        @keyup.enter="query.page = 1; load()"
      />
      <el-select
        v-model="query.enabled"
        clearable
        placeholder="状态"
        style="width: 120px"
        @change="query.page = 1; load()"
      >
        <el-option label="全部" value="" />
        <el-option label="启用" value="true" />
        <el-option label="停用" value="false" />
      </el-select>
      <el-button type="primary" @click="query.page = 1; load()">查询</el-button>
      <el-button @click="open()">新增</el-button>
      <el-button @click="batchVisible = true">批量导入</el-button>
    </div>
    <el-table v-loading="loading" :data="rows" border>
      <el-table-column prop="word" label="敏感词" min-width="260" show-overflow-tooltip />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '停用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="更新时间（北京时间）" min-width="190">
        <template #default="{ row }">
          {{ formatTime(row.updated_at || row.updatedAt || row.created_at || row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
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

    <el-dialog
      v-model="visible"
      :title="form.id ? '编辑敏感词' : '新增敏感词'"
      width="480px"
      destroy-on-close
    >
      <el-form label-width="80px">
        <el-form-item label="敏感词">
          <el-input v-model="form.word" maxlength="128" show-word-limit placeholder="单个字或词" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="batchVisible" title="批量导入敏感词" width="560px" destroy-on-close>
      <el-form label-width="80px">
        <el-form-item label="词表">
          <el-input
            v-model="batchForm.text"
            type="textarea"
            :rows="10"
            placeholder="每行一个，也可用逗号、顿号分隔"
          />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="batchForm.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="batchVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveBatch">导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.tip {
  color: #606266;
  font-size: 13px;
  line-height: 1.5;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.el-pagination {
  justify-content: flex-end;
}
</style>

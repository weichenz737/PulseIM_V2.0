<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from '@/utils/elementFeedback'
import { createHelpFaq, deleteHelpFaq, fetchHelpFaqs, updateHelpFaq, type HelpFaq } from '@/api/helpFeedback'

const loading = ref(false)
const saving = ref(false)
const visible = ref(false)
const rows = ref<HelpFaq[]>([])
const total = ref(0)
const query = reactive({ page: 1, size: 20, keyword: '' })
const form = reactive({ id: 0, title: '', answer: '', sortOrder: 0, enabled: true })

async function load() {
  loading.value = true
  try {
    const data = await fetchHelpFaqs(query)
    rows.value = data.list
    total.value = data.total
  } catch (e) { ElMessage.error(e instanceof Error ? e.message : '加载失败') }
  finally { loading.value = false }
}
function open(row?: HelpFaq) {
  Object.assign(form, row ? {
    id: row.id, title: row.title, answer: row.answer,
    sortOrder: row.sort_order, enabled: row.enabled,
  } : { id: 0, title: '', answer: '', sortOrder: 0, enabled: true })
  visible.value = true
}
async function save() {
  if (!form.title.trim() || !form.answer.trim()) return ElMessage.warning('请填写问题和回答')
  saving.value = true
  try {
    const payload = { title: form.title, answer: form.answer, sortOrder: form.sortOrder, enabled: form.enabled }
    form.id ? await updateHelpFaq(form.id, payload) : await createHelpFaq(payload)
    ElMessage.success('保存成功')
    visible.value = false
    await load()
  } catch (e) { ElMessage.error(e instanceof Error ? e.message : '保存失败') }
  finally { saving.value = false }
}
async function remove(row: HelpFaq) {
  try {
    await ElMessageBox.confirm(`确定删除“${row.title}”吗？`, '删除问题', { type: 'warning' })
    await deleteHelpFaq(row.id)
    ElMessage.success('已删除')
    await load()
  } catch (e) {
    if (e instanceof Error) ElMessage.error(e.message)
  }
}
onMounted(load)
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <el-input v-model="query.keyword" clearable placeholder="搜索问题" style="width: 280px" @keyup.enter="query.page=1;load()" />
      <el-button type="primary" @click="query.page=1;load()">查询</el-button>
      <el-button @click="open()">新增问题</el-button>
    </div>
    <el-table v-loading="loading" :data="rows" border>
      <el-table-column prop="title" label="问题" min-width="220" show-overflow-tooltip />
      <el-table-column prop="answer" label="回答" min-width="320" show-overflow-tooltip />
      <el-table-column prop="sort_order" label="排序" width="90" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }"><el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '停用' }}</el-tag></template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="open(row)">编辑</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination v-model:current-page="query.page" v-model:page-size="query.size" :total="total"
      layout="total, prev, pager, next" @current-change="load" />
    <el-dialog v-model="visible" :title="form.id ? '编辑问题' : '新增问题'" width="640px" destroy-on-close>
      <el-form label-width="80px">
        <el-form-item label="问题"><el-input v-model="form.title" maxlength="200" show-word-limit /></el-form-item>
        <el-form-item label="回答"><el-input v-model="form.answer" type="textarea" :rows="10" /></el-form-item>
        <el-form-item label="排序"><el-input-number v-model="form.sortOrder" :min="-9999" :max="9999" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="form.enabled" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="visible=false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存</el-button></template>
    </el-dialog>
  </div>
</template>
<style scoped>
.page{display:flex;flex-direction:column;gap:16px}.toolbar{display:flex;gap:10px}.el-pagination{justify-content:flex-end}
</style>

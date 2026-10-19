<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from '@/utils/elementFeedback'
import { createCommunityTopic, deleteCommunityTopic, fetchCommunityTopics, updateCommunityTopic, type CommunityTopic } from '@/api/communities'

const loading = ref(false)
const saving = ref(false)
const dialogVisible = ref(false)
const rows = ref<CommunityTopic[]>([])
const query = reactive({ keyword: '', enabled: '' })
const form = reactive<CommunityTopic>({ id: 0, name: '', sort_order: 0, enabled: true })
const filteredRows = computed(() => rows.value.filter((row) => {
  const matchesKeyword = !query.keyword.trim() || row.name.toLowerCase().includes(query.keyword.trim().toLowerCase())
  const matchesStatus = query.enabled === '' || String(row.enabled) === query.enabled
  return matchesKeyword && matchesStatus
}))

async function load() {
  loading.value = true
  try { rows.value = await fetchCommunityTopics() } catch (e) { ElMessage.error(e instanceof Error ? e.message : '加载失败') } finally { loading.value = false }
}
function openCreate() { Object.assign(form, { id: 0, name: '', sort_order: 0, enabled: true }); dialogVisible.value = true }
function openEdit(row: CommunityTopic) { Object.assign(form, row); dialogVisible.value = true }
async function save() {
  if (!form.name.trim()) { ElMessage.warning('请输入主题名称'); return }
  saving.value = true
  try {
    if (form.id) await updateCommunityTopic(form)
    else await createCommunityTopic(form.name, form.sort_order)
    ElMessage.success('已保存'); dialogVisible.value = false; await load()
  } catch (e) { ElMessage.error(e instanceof Error ? e.message : '保存失败') } finally { saving.value = false }
}
async function disable(row: CommunityTopic) {
  try { await ElMessageBox.confirm(`确定停用「${row.name}」吗？停用后用户端不再展示。`, '停用主题', { type: 'warning' }); await deleteCommunityTopic(row.id); ElMessage.success('已停用'); await load() } catch { /* cancelled */ }
}
onMounted(load)
</script>

<template>
  <el-card>
    <template #header><div class="head"><b>主题列表</b><el-button type="primary" @click="openCreate">新增主题</el-button></div></template>
    <el-form inline class="filter-form"><el-form-item label="关键词"><el-input v-model="query.keyword" clearable placeholder="搜索主题名称" /></el-form-item><el-form-item label="状态"><el-select v-model="query.enabled" clearable placeholder="全部状态"><el-option label="启用" value="true" /><el-option label="停用" value="false" /></el-select></el-form-item></el-form>
    <el-table v-loading="loading" :data="filteredRows" stripe>
      <el-table-column prop="name" label="主题名称" min-width="180" />
      <el-table-column prop="sort_order" label="排序" width="120" />
      <el-table-column label="状态" width="120"><template #default="{ row }"><el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '停用' }}</el-tag></template></el-table-column>
      <el-table-column label="操作" width="180"><template #default="{ row }"><el-button link type="primary" @click="openEdit(row)">编辑</el-button><el-button v-if="row.enabled" link type="danger" @click="disable(row)">停用</el-button></template></el-table-column>
    </el-table>
  </el-card>
  <el-dialog v-model="dialogVisible" :title="form.id ? '编辑主题' : '新增主题'" width="420px" destroy-on-close>
    <el-form label-width="80px"><el-form-item label="名称"><el-input v-model="form.name" maxlength="30" show-word-limit /></el-form-item><el-form-item label="排序"><el-input-number v-model="form.sort_order" :min="0" :max="9999" /></el-form-item><el-form-item v-if="form.id" label="状态"><el-switch v-model="form.enabled" active-text="启用" inactive-text="停用" /></el-form-item></el-form>
    <template #footer><el-button @click="dialogVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存</el-button></template>
  </el-dialog>
</template>

<style scoped>.filter-form{margin-bottom:16px}.filter-form :deep(.el-form-item){margin-bottom:0}.filter-form :deep(.el-input){width:240px}.filter-form :deep(.el-select){width:150px}.head{display:flex;align-items:center;justify-content:space-between}</style>

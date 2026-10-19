<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from '@/utils/elementFeedback'
import { fetchSystemTexts, updateSystemText } from '@/api/systemTexts'

const loading = ref(false)
const saving = ref(false)
const form = reactive({ title: '账号注销协议', content: '' })

async function load() {
  loading.value = true
  try {
    const item = (await fetchSystemTexts()).find((text) => text.key === 'account_deletion_agreement')
    if (item) {
      form.title = item.title || form.title
      form.content = item.content || ''
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载注销协议失败')
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!form.title.trim()) {
    ElMessage.warning('请输入协议标题')
    return
  }
  saving.value = true
  try {
    const item = await updateSystemText('account_deletion_agreement', { title: form.title.trim(), content: form.content })
    form.title = item.title
    form.content = item.content
    ElMessage.success('账号注销协议已保存')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存注销协议失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div v-loading="loading" class="agreement-page">
    <section class="agreement-card">
      <div class="agreement-head">
        <div>
          <h2>账号注销协议</h2>
          <p>用户在移动端和电脑端发起注销时会展示此协议，并记录协议快照。</p>
        </div>
        <el-button type="primary" :loading="saving" @click="save"><el-icon><Check /></el-icon>保存协议</el-button>
      </div>
      <el-form label-position="top">
        <el-form-item label="协议标题"><el-input v-model="form.title" maxlength="128" show-word-limit /></el-form-item>
        <el-form-item label="协议正文"><el-input v-model="form.content" type="textarea" :rows="16" resize="vertical" placeholder="请输入账号注销协议正文，支持换行" /></el-form-item>
      </el-form>
    </section>
  </div>
</template>

<style scoped>
.agreement-page { max-width: 1100px; }
.agreement-card { padding: 24px; border: 1px solid #e4e7ed; border-radius: 8px; background: #fff; }
.agreement-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 22px; }
.agreement-head h2 { margin: 0 0 7px; color: #303133; font-size: 20px; }
.agreement-head p { margin: 0; color: #909399; font-size: 13px; }
.agreement-head .el-button { flex: none; }
</style>

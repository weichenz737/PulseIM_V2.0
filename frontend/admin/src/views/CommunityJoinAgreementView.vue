<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from '@/utils/elementFeedback'
import { fetchSystemTexts, updateSystemText, type SystemTextKey } from '@/api/systemTexts'

const key: SystemTextKey = 'community_join_agreement'
const loading = ref(false)
const saving = ref(false)
const form = reactive({ title: '圈子加入协议', content: '' })

async function load() {
  loading.value = true
  try {
    const item = (await fetchSystemTexts()).find((text) => text.key === key)
    if (item) {
      form.title = item.title || form.title
      form.content = item.content || ''
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '协议加载失败')
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
    const result = await updateSystemText(key, { title: form.title.trim(), content: form.content })
    form.title = result.title
    form.content = result.content
    ElMessage.success('圈子加入协议已保存')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '协议保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div v-loading="loading" class="agreement-page">
    <el-card>
      <template #header>
        <div class="agreement-head">
          <div>
            <b>圈子加入协议</b>
            <p>用户加入任意圈子前必须勾选同意，协议正文将在用户端加入确认弹窗中展示。</p>
          </div>
          <el-button type="primary" :loading="saving" @click="save">保存协议</el-button>
        </div>
      </template>
      <el-form label-position="top">
        <el-form-item label="协议标题"><el-input v-model="form.title" maxlength="128" show-word-limit /></el-form-item>
        <el-form-item label="协议正文">
          <el-input v-model="form.content" type="textarea" :rows="18" resize="vertical" placeholder="请输入圈子加入协议内容，支持换行" />
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.agreement-page{max-width:1100px}.agreement-head{display:flex;align-items:flex-start;justify-content:space-between;gap:24px}.agreement-head b{font-size:17px;color:#303133}.agreement-head p{margin:7px 0 0;color:#909399;font-size:13px;line-height:1.5}.agreement-head .el-button{flex:none}
</style>

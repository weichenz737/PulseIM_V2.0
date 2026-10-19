<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from '@/utils/elementFeedback'
import { fetchFileConfig, updateFileConfig } from '@/api/fileConfig'

const loading = ref(false)
const saving = ref(false)
const updatedAt = ref('')
const form = reactive({
  maxSizeMb: 100,
  extensionsText: '',
})

function parseExtensions(text: string): string[] {
  return text
    .split(/[,，\s]+/)
    .map((item) => item.trim().replace(/^\./, '').toLowerCase())
    .filter((item) => /^[a-z0-9]{1,12}$/.test(item))
}

async function load() {
  loading.value = true
  try {
    const data = await fetchFileConfig()
    form.maxSizeMb = data.maxSizeMb
    form.extensionsText = (data.allowedExtensions || []).join(', ')
    updatedAt.value = data.updatedAt || ''
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载文件参数失败')
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    const data = await updateFileConfig({
      maxSizeMb: form.maxSizeMb,
      allowedExtensions: parseExtensions(form.extensionsText),
    })
    form.maxSizeMb = data.maxSizeMb
    form.extensionsText = (data.allowedExtensions || []).join(', ')
    updatedAt.value = data.updatedAt || ''
    ElMessage.success('文件参数已保存')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存文件参数失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div v-loading="loading" class="file-config-page">
    <section class="config-section">
      <div class="section-heading">
        <div>
          <h3>文件发送参数</h3>
          <p>控制移动端与电脑端聊天中可发送文件的大小上限和允许的文件类型，保存后立即生效。</p>
        </div>
      </div>

      <el-form label-position="top">
        <el-form-item label="单文件大小上限（MB）">
          <el-input-number v-model="form.maxSizeMb" :min="1" :max="1024" :step="10" />
          <div class="form-tip">图片、视频、普通文件均受此限制，默认 100MB，最大可设置 1024MB。</div>
        </el-form-item>
        <el-form-item label="允许发送的文件类型">
          <el-input
            v-model="form.extensionsText"
            type="textarea"
            :rows="4"
            maxlength="500"
            placeholder="例如：jpg, png, gif, pdf, doc, docx, xls, xlsx, ppt, pptx, zip, rar, txt"
          />
          <div class="form-tip">
            使用英文逗号或空格分隔扩展名（不需要点）。留空表示不限制类型（系统禁用的脚本、可执行文件仍会被拦截）。
          </div>
        </el-form-item>
        <div class="config-footer">
          <div v-if="updatedAt" class="status-row">
            <span>最近更新时间：{{ updatedAt }}</span>
          </div>
          <el-button type="primary" :loading="saving" @click="save">保存</el-button>
        </div>
      </el-form>
    </section>
  </div>
</template>

<style scoped>
.file-config-page {
  max-width: 900px;
}

.form-tip {
  width: 100%;
  margin-top: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.status-row {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.config-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 18px;
}
</style>

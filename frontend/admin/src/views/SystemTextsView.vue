<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from '@/utils/elementFeedback'
import { fetchSystemTexts, updateSystemText, type SystemTextKey } from '@/api/systemTexts'

interface TextForm {
  title: string
  content: string
}

const loading = ref(false)
const savingKey = ref<SystemTextKey | ''>('')
const forms = reactive<Record<SystemTextKey, TextForm>>({
  privacy_policy: { title: '隐私政策', content: '' },
  service_terms: { title: '服务条款', content: '' },
  community_join_agreement: { title: '圈子加入协议', content: '' },
  community_create_agreement: { title: '圈子创建协议', content: '' },
  account_deletion_agreement: { title: '账号注销协议', content: '' },
})

const sections: Array<{ key: SystemTextKey; label: string; description: string }> = [
  { key: 'privacy_policy', label: '隐私政策', description: '注册和登录页面向用户展示的隐私政策完整内容' },
  { key: 'service_terms', label: '服务条款', description: '注册和登录页面向用户展示的服务条款完整内容' },
]

async function loadTexts() {
  loading.value = true
  try {
    const list = await fetchSystemTexts()
    list.forEach((item) => {
      forms[item.key].title = item.title || sections.find((section) => section.key === item.key)?.label || ''
      forms[item.key].content = item.content || ''
    })
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载文本配置失败')
  } finally {
    loading.value = false
  }
}

async function save(key: SystemTextKey) {
  const form = forms[key]
  if (!form.title.trim()) {
    ElMessage.warning('请输入标题')
    return
  }
  savingKey.value = key
  try {
    const saved = await updateSystemText(key, {
      title: form.title.trim(),
      content: form.content,
    })
    form.title = saved.title
    form.content = saved.content
    ElMessage.success(`${saved.title}已保存`)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败')
  } finally {
    savingKey.value = ''
  }
}

onMounted(loadTexts)
</script>

<template>
  <div v-loading="loading" class="text-config-page">
    <section v-for="section in sections" :key="section.key" class="config-section">
      <div class="section-heading">
        <div>
          <h3>{{ section.label }}</h3>
          <p>{{ section.description }}</p>
        </div>
        <el-button
          type="primary"
          :loading="savingKey === section.key"
          @click="save(section.key)"
        >
          <el-icon><Check /></el-icon>
          保存
        </el-button>
      </div>

      <el-form label-position="top">
        <el-form-item label="显示标题">
          <el-input v-model="forms[section.key].title" maxlength="128" show-word-limit />
        </el-form-item>
        <el-form-item label="正文内容">
          <el-input
            v-model="forms[section.key].content"
            type="textarea"
            :rows="14"
            resize="vertical"
            placeholder="请输入完整内容，支持换行"
          />
        </el-form-item>
      </el-form>
    </section>
  </div>
</template>

<style scoped>
.text-config-page {
  max-width: 1040px;
}

.config-section {
  padding: 24px;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
}

.config-section + .config-section {
  margin-top: 20px;
}

.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 22px;
}

.section-heading h3 {
  margin: 0 0 6px;
  font-size: 17px;
  color: #303133;
}

.section-heading p {
  margin: 0;
  font-size: 13px;
  color: #909399;
}

.section-heading .el-button {
  flex-shrink: 0;
}
</style>

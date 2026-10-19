<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from '@/utils/elementFeedback'
import { fetchSystemTexts, updateSystemText, type SystemTextKey } from '@/api/systemTexts'

type AgreementKey = 'community_join_agreement' | 'community_create_agreement'

interface AgreementForm {
  title: string
  content: string
}

const agreements: Array<{ key: AgreementKey; label: string; description: string }> = [
  {
    key: 'community_join_agreement',
    label: '加入协议',
    description: '用户加入圈子前需要阅读并勾选同意的协议。',
  },
  {
    key: 'community_create_agreement',
    label: '创建协议',
    description: '用户创建圈子前需要阅读并勾选同意的协议。',
  },
]

const loading = ref(false)
const savingKey = ref<AgreementKey | ''>('')
const forms = reactive<Record<AgreementKey, AgreementForm>>({
  community_join_agreement: { title: '圈子加入协议', content: '' },
  community_create_agreement: { title: '圈子创建协议', content: '' },
})

async function load() {
  loading.value = true
  try {
    const list = await fetchSystemTexts()
    list.forEach((item) => {
      if (!(item.key in forms)) return
      const form = forms[item.key as AgreementKey]
      form.title = item.title || form.title
      form.content = item.content || ''
    })
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '圈子协议加载失败')
  } finally {
    loading.value = false
  }
}

async function save(key: AgreementKey) {
  const form = forms[key]
  if (!form.title.trim()) {
    ElMessage.warning('请输入协议标题')
    return
  }
  savingKey.value = key
  try {
    const result = await updateSystemText(key as SystemTextKey, {
      title: form.title.trim(),
      content: form.content,
    })
    form.title = result.title
    form.content = result.content
    ElMessage.success(`${result.title}已保存`)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '协议保存失败')
  } finally {
    savingKey.value = ''
  }
}

onMounted(load)
</script>

<template>
  <div v-loading="loading" class="agreement-page">
    <div class="page-intro">
      <h2>圈子协议</h2>
      <p>分别配置加入圈子和创建圈子时展示给用户的协议内容。</p>
    </div>

    <section v-for="agreement in agreements" :key="agreement.key" class="agreement-card">
      <div class="agreement-head">
        <div>
          <h3>{{ agreement.label }}</h3>
          <p>{{ agreement.description }}</p>
        </div>
        <el-button type="primary" :loading="savingKey === agreement.key" @click="save(agreement.key)">
          <el-icon><Check /></el-icon>
          保存协议
        </el-button>
      </div>
      <el-form label-position="top">
        <el-form-item label="协议标题">
          <el-input v-model="forms[agreement.key].title" maxlength="128" show-word-limit />
        </el-form-item>
        <el-form-item label="协议正文">
          <el-input
            v-model="forms[agreement.key].content"
            type="textarea"
            :rows="14"
            resize="vertical"
            placeholder="请输入协议正文，支持换行"
          />
        </el-form-item>
      </el-form>
    </section>
  </div>
</template>

<style scoped>
.agreement-page{max-width:1100px}.page-intro{margin-bottom:18px}.page-intro h2{margin:0;color:#303133;font-size:20px}.page-intro p{margin:7px 0 0;color:#909399;font-size:13px}.agreement-card{padding:24px;background:#fff;border:1px solid #e4e7ed;border-radius:8px}.agreement-card+.agreement-card{margin-top:20px}.agreement-head{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;margin-bottom:22px}.agreement-head h3{margin:0 0 6px;color:#303133;font-size:17px}.agreement-head p{margin:0;color:#909399;font-size:13px}.agreement-head .el-button{flex:none}
</style>

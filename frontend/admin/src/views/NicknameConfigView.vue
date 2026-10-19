<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from '@/utils/elementFeedback'
import { fetchNicknameConfig, updateNicknameConfig } from '@/api/nicknameConfig'

const loading = ref(false)
const saving = ref(false)
const form = reactive({
  userNicknameMaxLength: 20,
  communityNicknameMaxLength: 30,
})

async function load() {
  loading.value = true
  try {
    const data = await fetchNicknameConfig()
    form.userNicknameMaxLength = Number(data.userNicknameMaxLength)
    form.communityNicknameMaxLength = Number(data.communityNicknameMaxLength)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载昵称配置失败')
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!Number.isInteger(form.userNicknameMaxLength) || form.userNicknameMaxLength < 1 || form.userNicknameMaxLength > 64) {
    ElMessage.warning('用户昵称长度须为 1-64 个字符')
    return
  }
  if (!Number.isInteger(form.communityNicknameMaxLength) || form.communityNicknameMaxLength < 2 || form.communityNicknameMaxLength > 30) {
    ElMessage.warning('圈子昵称长度须为 2-30 个字符')
    return
  }
  saving.value = true
  try {
    const data = await updateNicknameConfig({
      userNicknameMaxLength: form.userNicknameMaxLength,
      communityNicknameMaxLength: form.communityNicknameMaxLength,
    })
    form.userNicknameMaxLength = Number(data.userNicknameMaxLength)
    form.communityNicknameMaxLength = Number(data.communityNicknameMaxLength)
    ElMessage.success('昵称配置已保存，立即生效')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存昵称配置失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div v-loading="loading" class="nickname-config-page">
    <section class="config-section">
      <div class="section-heading">
        <div>
          <h3>用户与圈子昵称</h3>
          <p>控制客户端昵称可设置的最大字符数。保存后新注册、资料编辑和圈子名称变更立即按新规则校验。</p>
        </div>
      </div>

      <el-form label-position="top">
        <el-form-item label="用户昵称字符长度">
          <el-input-number
            v-model="form.userNicknameMaxLength"
            :min="1"
            :max="64"
            :step="1"
            controls-position="right"
          />
          <div class="form-tip">可配置 1-64 个字符，默认 20 个字符。</div>
        </el-form-item>
        <el-form-item label="圈子昵称字符长度">
          <el-input-number
            v-model="form.communityNicknameMaxLength"
            :min="2"
            :max="30"
            :step="1"
            controls-position="right"
          />
          <div class="form-tip">可配置 2-30 个字符，默认 30 个字符；圈子名称仍要求至少 2 个字符。</div>
        </el-form-item>
      </el-form>

      <div class="save-row">
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.nickname-config-page {
  max-width: 900px;
}

.form-tip {
  width: 100%;
  margin-top: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.save-row {
  display: flex;
  justify-content: flex-start;
  margin-top: 28px;
}
</style>

<script setup lang="ts">
import { ref } from 'vue'
import { showToast } from 'vant'
import { fetchSystemText, type SystemTextKey } from '@/api/systemText'

const visible = ref(false)
const loading = ref(false)
const title = ref('')
const content = ref('')

async function open(key: SystemTextKey) {
  visible.value = true
  loading.value = true
    title.value = key === 'privacy_policy' ? '隐私政策' : key === 'service_terms' ? '服务条款' : key === 'community_create_agreement' ? '圈子创建协议' : key === 'account_deletion_agreement' ? '账号注销协议' : '圈子加入协议'
  content.value = ''
  try {
    const result = await fetchSystemText(key)
    title.value = result.title || title.value
    content.value = result.content || '暂未配置内容'
  } catch (error) {
    visible.value = false
    showToast(error instanceof Error ? error.message : '内容加载失败')
  } finally {
    loading.value = false
  }
}

defineExpose({ open })
</script>

<template>
  <van-popup
    v-model:show="visible"
    position="bottom"
    round
    closeable
    teleport="body"
    class="legal-popup"
  >
    <header class="legal-header">
      <h2>{{ title }}</h2>
    </header>
    <div class="legal-content">
      <van-loading v-if="loading" vertical>加载中...</van-loading>
      <div v-else class="legal-body">{{ content }}</div>
    </div>
  </van-popup>
</template>

<style scoped>
.legal-popup {
  height: min(78vh, 680px);
  background: var(--pulse-surface-low, #1c1c1e);
  color: var(--pulse-text, #f5f5f7);
}

.legal-header {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 52px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.legal-header h2 {
  margin: 0;
  font-size: 17px;
  line-height: 24px;
  font-weight: 600;
}

.legal-content {
  height: calc(100% - 56px);
  padding: 20px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.legal-content :deep(.van-loading) {
  margin-top: 64px;
}

.legal-body {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 14px;
  line-height: 1.75;
  color: var(--pulse-text-secondary, var(--pulse-text-secondary));
}
</style>

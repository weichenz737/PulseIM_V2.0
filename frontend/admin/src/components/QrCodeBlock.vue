<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from '@/utils/elementFeedback'
import { downloadDataUrl, renderQrDataUrl } from '@/utils/qrcode'

const props = withDefaults(
  defineProps<{
    payload: string
    title?: string
    filename?: string
    size?: number
  }>(),
  {
    title: '二维码',
    filename: 'pulse-qrcode',
    size: 180,
  },
)

const dataUrl = ref('')
const loading = ref(false)

async function render() {
  const text = props.payload?.trim()
  if (!text) {
    dataUrl.value = ''
    return
  }
  loading.value = true
  try {
    dataUrl.value = await renderQrDataUrl(text, props.size)
  } catch {
    dataUrl.value = ''
    ElMessage.error('二维码生成失败')
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.payload, props.size] as const,
  () => {
    void render()
  },
  { immediate: true },
)

async function copyPayload() {
  try {
    await navigator.clipboard.writeText(props.payload)
    ElMessage.success('已复制二维码内容')
  } catch {
    ElMessage.error('复制失败')
  }
}

function download() {
  if (!dataUrl.value) return
  downloadDataUrl(dataUrl.value, props.filename)
}
</script>

<template>
  <div class="qr-block" v-loading="loading">
    <div class="qr-title">{{ title }}</div>
    <div class="qr-body">
      <img v-if="dataUrl" class="qr-img" :src="dataUrl" :alt="title" />
      <div v-else class="qr-empty">暂无二维码</div>
      <div class="qr-meta">
        <div class="qr-payload" :title="payload">{{ payload || '—' }}</div>
        <div class="qr-actions">
          <el-button size="small" :disabled="!payload" @click="copyPayload">复制内容</el-button>
          <el-button size="small" type="primary" :disabled="!dataUrl" @click="download">下载</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.qr-block {
  margin-top: 18px;
  padding: 14px 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
}

.qr-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 12px;
}

.qr-body {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.qr-img {
  width: 180px;
  height: 180px;
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
  background: #fff;
  flex-shrink: 0;
}

.qr-empty {
  width: 180px;
  height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px dashed var(--el-border-color);
  color: #909399;
  font-size: 13px;
  flex-shrink: 0;
}

.qr-meta {
  flex: 1;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.qr-payload {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  color: #606266;
  word-break: break-all;
  line-height: 1.5;
}

.qr-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
</style>

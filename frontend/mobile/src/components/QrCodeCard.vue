<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { showToast } from 'vant'
import { renderQrDataUrl, saveQrToDevice } from '@/utils/qrcode'

const props = defineProps<{
  payload: string
  title?: string
  subtitle?: string
  filename?: string
  size?: number
}>()

const emit = defineEmits<{ preview: [] }>()

const dataUrl = ref('')
const saving = ref(false)

async function refresh() {
  if (!props.payload) {
    dataUrl.value = ''
    return
  }
  try {
    dataUrl.value = await renderQrDataUrl(props.payload, props.size || 128)
  } catch {
    dataUrl.value = ''
  }
}

async function onSave(e: Event) {
  e.stopPropagation()
  if (!props.payload || saving.value) return
  saving.value = true
  try {
    const result = await saveQrToDevice(props.payload, props.filename || 'pulse-qr.png')
    if (result === 'cancelled') return
    if (result === 'gallery') showToast('已保存到系统相册')
    else if (result === 'shared') showToast('请在分享菜单中选择「存储到照片」')
    else if (result === 'opened') showToast('请长按图片，选择「存储到照片」')
    else showToast('已保存到本地')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void refresh()
})

watch(() => props.payload, () => {
  void refresh()
})
</script>

<template>
  <div class="qr-block">
    <button type="button" class="qr-preview-btn" @click="emit('preview')">
      <img v-if="dataUrl" :src="dataUrl" class="qr-img" alt="二维码" />
      <div v-else class="qr-placeholder">生成中...</div>
    </button>
    <div v-if="title || subtitle" class="qr-meta">
      <div v-if="title" class="qr-title">{{ title }}</div>
      <div v-if="subtitle" class="qr-sub">{{ subtitle }}</div>
    </div>
    <button type="button" class="save-btn" :disabled="saving || !dataUrl" @click="onSave">
      {{ saving ? '保存中...' : '保存到手机' }}
    </button>
  </div>
</template>

<style scoped>
.qr-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.qr-preview-btn {
  border: none;
  background: #fff;
  padding: 8px;
  border-radius: 10px;
  cursor: pointer;
}

.qr-img {
  width: 112px;
  height: 112px;
  display: block;
}

.qr-placeholder {
  width: 112px;
  height: 112px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
  font-size: 12px;
}

.qr-meta {
  text-align: center;
}

.qr-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--pulse-text);
}

.qr-sub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--pulse-text-secondary);
}

.save-btn {
  border: none;
  border-radius: 10px;
  padding: 10px 18px;
  background: rgba(75, 142, 255, 0.2);
  color: var(--pulse-primary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.save-btn:disabled {
  opacity: 0.5;
}
</style>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { showToast } from 'vant'
import { renderQrDataUrl, saveQrToDevice } from '@/utils/qrcode'

const props = defineProps<{
  show: boolean
  payload: string
  title?: string
  filename?: string
  hint?: string
}>()

const emit = defineEmits<{ close: [] }>()

const dataUrl = ref('')
const saving = ref(false)

async function refresh() {
  if (!props.payload) {
    dataUrl.value = ''
    return
  }
  dataUrl.value = await renderQrDataUrl(props.payload, 480)
}

async function onSave() {
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

watch(
  () => [props.show, props.payload] as const,
  ([show]) => {
    if (show) void refresh()
  },
)

onMounted(() => {
  if (props.show) void refresh()
})
</script>

<template>
  <div v-if="show" class="mask" @click.self="emit('close')">
    <div class="sheet">
      <h3 class="title">{{ title || '二维码' }}</h3>
      <div class="qr-wrap">
        <img v-if="dataUrl" :src="dataUrl" alt="二维码预览" class="qr" />
      </div>
      <p class="hint">{{ hint || '扫一扫上面的二维码，加我为好友' }}</p>
      <div class="actions">
        <button type="button" class="btn ghost" @click="emit('close')">关闭</button>
        <button type="button" class="btn primary" :disabled="saving" @click="onSave">
          {{ saving ? '保存中...' : '保存到手机' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.sheet {
  width: 100%;
  max-width: 340px;
  background: var(--pulse-surface-container);
  border-radius: 18px;
  padding: 24px 20px;
  text-align: center;
}

.title {
  margin: 0 0 16px;
  font-size: 17px;
  font-weight: 600;
  color: var(--pulse-text);
}

.qr-wrap {
  display: inline-block;
  background: #fff;
  padding: 14px;
  border-radius: 14px;
}

.qr {
  width: 240px;
  height: 240px;
  display: block;
}

.hint {
  margin: 14px 0 0;
  font-size: 13px;
  color: var(--pulse-text-secondary);
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 18px;
}

.btn {
  flex: 1;
  border: none;
  border-radius: 10px;
  padding: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}

.btn.ghost {
  background: var(--pulse-surface-high);
  color: var(--pulse-text-secondary);
}

.btn.primary {
  background: var(--pulse-primary-container);
  color: var(--pulse-on-primary-container);
}

.btn:disabled {
  opacity: 0.6;
}
</style>

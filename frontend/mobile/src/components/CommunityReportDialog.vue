<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { showImagePreview, showToast } from 'vant'
import {
  fetchCommunityReportReasons,
  reportCommunity,
  type CommunityReportReason,
} from '@/api/community'
import { uploadChatFile } from '@/api/file'
import { openMediaVideoPreview } from '@/composables/useMediaVideoPreview'

const MAX_EVIDENCE_COUNT = 6
const MAX_IMAGE_SIZE = 20 * 1024 * 1024
const MAX_VIDEO_SIZE = 100 * 1024 * 1024

interface EvidenceItem {
  url: string
  previewUrl: string
  type: 'image' | 'video'
  name: string
}

const props = defineProps<{
  show: boolean
  targetType: 'COMMUNITY' | 'POST' | 'COMMENT' | 'USER'
  targetId: string | number
}>()

const emit = defineEmits<{
  'update:show': [boolean]
  submitted: []
}>()

const reasons = ref<CommunityReportReason[]>([])
const selectedReasonCode = ref('')
const detail = ref('')
const evidence = ref<EvidenceItem[]>([])
const loadingReasons = ref(false)
const uploading = ref(false)
const submitting = ref(false)
const loadError = ref('')
const evidenceInput = ref<HTMLInputElement | null>(null)

const busy = computed(() => uploading.value || submitting.value)
const canSubmit = computed(() => !!selectedReasonCode.value && !busy.value && !loadingReasons.value)

function revokeEvidencePreviews() {
  evidence.value.forEach((item) => {
    if (item.previewUrl.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl)
  })
}

function resetForm() {
  revokeEvidencePreviews()
  selectedReasonCode.value = ''
  detail.value = ''
  evidence.value = []
  loadError.value = ''
  if (evidenceInput.value) evidenceInput.value.value = ''
}

async function loadReasons() {
  loadingReasons.value = true
  loadError.value = ''
  try {
    reasons.value = await fetchCommunityReportReasons()
    if (!reasons.value.length) loadError.value = '暂时没有可选的举报原因，请稍后再试'
  } catch (error) {
    reasons.value = []
    loadError.value = error instanceof Error ? error.message : '举报原因加载失败'
  } finally {
    loadingReasons.value = false
  }
}

watch(
  () => props.show,
  (show) => {
    if (show) {
      resetForm()
      void loadReasons()
    } else if (!busy.value) {
      resetForm()
    }
  },
)

onUnmounted(revokeEvidencePreviews)

function requestClose() {
  if (busy.value) {
    showToast(uploading.value ? '凭证正在上传，请稍候' : '举报正在提交，请稍候')
    return
  }
  emit('update:show', false)
}

function openEvidencePicker() {
  if (busy.value) return
  if (evidence.value.length >= MAX_EVIDENCE_COUNT) {
    showToast(`最多上传 ${MAX_EVIDENCE_COUNT} 个凭证`)
    return
  }
  evidenceInput.value?.click()
}

async function onEvidenceSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  if (!files.length) return

  const remaining = MAX_EVIDENCE_COUNT - evidence.value.length
  if (files.length > remaining) showToast(`本次最多还能上传 ${remaining} 个凭证`)
  const selected = files.slice(0, remaining)
  uploading.value = true
  try {
    for (const file of selected) {
      const type: 'image' | 'video' | '' = file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('video/')
          ? 'video'
          : ''
      if (!type) {
        showToast(`${file.name} 不是图片或视频`)
        continue
      }
      const maxSize = type === 'image' ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE
      if (file.size > maxSize) {
        showToast(`${type === 'image' ? '图片' : '视频'}不能超过 ${maxSize / 1024 / 1024}MB`)
        continue
      }
      const previewUrl = URL.createObjectURL(file)
      try {
        const uploaded = await uploadChatFile(file)
        evidence.value.push({
          url: uploaded.originalUrl || uploaded.url,
          previewUrl,
          type,
          name: uploaded.name || file.name,
        })
      } catch (error) {
        URL.revokeObjectURL(previewUrl)
        showToast(error instanceof Error ? error.message : `${file.name} 上传失败`)
      }
    }
  } finally {
    uploading.value = false
  }
}

function removeEvidence(index: number) {
  const item = evidence.value[index]
  if (item?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl)
  evidence.value.splice(index, 1)
}

function previewEvidence(item: EvidenceItem) {
  if (item.type === 'video') {
    void openMediaVideoPreview(item.previewUrl || item.url)
    return
  }
  const images = evidence.value.filter((entry) => entry.type === 'image').map((entry) => entry.previewUrl || entry.url)
  showImagePreview({
    images,
    startPosition: Math.max(0, images.indexOf(item.previewUrl || item.url)),
    closeable: true,
    closeIconPosition: 'top-right',
  })
}

async function submit() {
  if (!selectedReasonCode.value) {
    showToast('请选择举报原因')
    return
  }
  if (busy.value) return
  submitting.value = true
  try {
    await reportCommunity({
      targetType: props.targetType,
      targetId: props.targetId,
      reasonCode: selectedReasonCode.value,
      detail: detail.value,
      evidenceUrls: evidence.value.map((item) => item.url),
      evidenceTypes: evidence.value.map((item) => item.type),
    })
    showToast('举报已提交，我们会尽快处理')
    emit('submitted')
    emit('update:show', false)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '举报提交失败')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <van-popup
    :show="show"
    position="bottom"
    round
    :closeable="!busy"
    :close-on-click-overlay="false"
    class="community-report-popup"
    @update:show="requestClose"
    @click-close-icon="requestClose"
  >
    <header class="report-header">
      <div>
        <h2>举报动态</h2>
        <p>请选择最符合的原因，我们会保护你的隐私</p>
      </div>
    </header>

    <div class="report-body">
      <section class="report-section">
        <h3>举报原因 <em>必选</em></h3>
        <div v-if="loadingReasons" class="reason-state">
          <van-loading size="22px">正在加载举报原因…</van-loading>
        </div>
        <div v-else-if="loadError" class="reason-state reason-error">
          <span>{{ loadError }}</span>
          <button type="button" @click="loadReasons">重新加载</button>
        </div>
        <div v-else class="reason-grid">
          <button
            v-for="reason in reasons"
            :key="reason.code"
            type="button"
            class="reason-option"
            :class="{ selected: selectedReasonCode === reason.code }"
            @click="selectedReasonCode = reason.code"
          >
            <span>{{ reason.name }}</span>
            <span class="material-symbols-outlined">
              {{ selectedReasonCode === reason.code ? 'radio_button_checked' : 'radio_button_unchecked' }}
            </span>
          </button>
        </div>
      </section>

      <section class="report-section">
        <div class="section-heading">
          <h3>补充说明 <em>选填</em></h3>
          <span>{{ detail.length }}/500</span>
        </div>
        <textarea
          v-model="detail"
          maxlength="500"
          rows="4"
          placeholder="请描述具体情况，便于我们更快核实处理"
        />
      </section>

      <section class="report-section">
        <div class="section-heading">
          <h3>图片或视频凭证 <em>选填</em></h3>
          <span>{{ evidence.length }}/{{ MAX_EVIDENCE_COUNT }}</span>
        </div>
        <p class="evidence-tip">图片不超过 20MB，视频不超过 100MB</p>
        <div class="evidence-grid">
          <div v-for="(item, index) in evidence" :key="`${item.url}-${index}`" class="evidence-item">
            <button type="button" class="evidence-preview" :aria-label="`预览${item.type === 'video' ? '视频' : '图片'}`" @click="previewEvidence(item)">
              <video v-if="item.type === 'video'" :src="`${item.previewUrl}#t=0.001`" muted playsinline preload="metadata" />
              <img v-else :src="item.previewUrl" alt="" />
              <span v-if="item.type === 'video'" class="video-mark material-symbols-outlined">play_circle</span>
            </button>
            <button type="button" class="remove-evidence" aria-label="删除凭证" :disabled="busy" @click="removeEvidence(index)">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <button
            v-if="evidence.length < MAX_EVIDENCE_COUNT"
            type="button"
            class="add-evidence"
            :disabled="busy"
            @click="openEvidencePicker"
          >
            <van-loading v-if="uploading" size="22px" />
            <template v-else>
              <span class="material-symbols-outlined">add_photo_alternate</span>
              <small>添加凭证</small>
            </template>
          </button>
        </div>
        <input
          ref="evidenceInput"
          type="file"
          accept="image/*,video/*"
          multiple
          class="hidden-input"
          @change="onEvidenceSelected"
        />
      </section>
    </div>

    <footer class="report-footer">
      <button type="button" class="cancel-button" :disabled="busy" @click="requestClose">取消</button>
      <button type="button" class="submit-button" :disabled="!canSubmit" @click="submit">
        <van-loading v-if="submitting" size="20px" color="var(--pulse-on-primary)" />
        <span v-else>提交举报</span>
      </button>
    </footer>
  </van-popup>
</template>

<style scoped>
.community-report-popup {
  display: flex;
  flex-direction: column;
  max-height: min(90dvh, 760px);
  background: var(--pulse-surface-container);
  color: var(--pulse-text);
}

.report-header {
  flex: 0 0 auto;
  padding: 20px 52px 14px 20px;
  border-bottom: 1px solid var(--pulse-divider);
}

.report-header h2,
.report-header p,
.report-section h3,
.evidence-tip {
  margin: 0;
}

.report-header h2 { font-size: 19px; line-height: 1.35; }
.report-header p { margin-top: 4px; color: var(--pulse-text-secondary); font-size: 12px; line-height: 1.5; }

.report-body {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px 20px 18px;
}

.report-section { padding-top: 18px; }
.report-section h3 { font-size: 15px; font-style: normal; }
.report-section h3 em { margin-left: 5px; color: var(--pulse-text-secondary); font-size: 11px; font-style: normal; font-weight: 400; }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.section-heading > span { color: var(--pulse-text-secondary); font-size: 11px; }

.reason-state {
  min-height: 88px;
  display: grid;
  place-items: center;
  margin-top: 10px;
  border-radius: 14px;
  background: var(--pulse-surface-high);
  color: var(--pulse-text-secondary);
  font-size: 13px;
}

.reason-error { gap: 8px; padding: 16px; text-align: center; }
.reason-error button { border: 0; background: transparent; color: var(--pulse-primary); }
.reason-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }
.reason-option {
  min-width: 0;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: var(--pulse-surface-high);
  color: var(--pulse-text);
  text-align: left;
}
.reason-option.selected { border-color: var(--pulse-primary); background: color-mix(in srgb, var(--pulse-primary) 12%, var(--pulse-surface-high)); color: var(--pulse-primary); }
.reason-option .material-symbols-outlined { flex: 0 0 auto; font-size: 19px; }

textarea {
  width: 100%;
  min-height: 104px;
  margin-top: 10px;
  padding: 12px;
  resize: none;
  border: 1px solid transparent;
  border-radius: 14px;
  outline: none;
  background: var(--pulse-surface-high);
  color: var(--pulse-text);
  font: inherit;
  font-size: 14px;
  line-height: 1.55;
  box-sizing: border-box;
}
textarea:focus { border-color: color-mix(in srgb, var(--pulse-primary) 65%, transparent); }
textarea::placeholder { color: var(--pulse-text-secondary); }
.evidence-tip { margin-top: 5px; color: var(--pulse-text-secondary); font-size: 11px; }
.evidence-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; margin-top: 10px; }
.evidence-item { position: relative; aspect-ratio: 1; }
.evidence-preview,
.add-evidence { width: 100%; height: 100%; padding: 0; overflow: hidden; border: 1px solid var(--pulse-divider); border-radius: 12px; background: var(--pulse-surface-high); }
.evidence-preview img,
.evidence-preview video { width: 100%; height: 100%; display: block; object-fit: cover; }
.video-mark { position: absolute; inset: 0; display: grid; place-items: center; color: var(--pulse-on-primary); font-size: 30px; text-shadow: 0 2px 8px color-mix(in srgb, var(--pulse-text) 62%, transparent); }
.remove-evidence { position: absolute; top: -7px; right: -7px; width: 24px; height: 24px; display: grid; place-items: center; padding: 0; border: 2px solid var(--pulse-surface-container); border-radius: 50%; background: color-mix(in srgb, var(--pulse-text) 82%, transparent); color: var(--pulse-surface-container); }
.remove-evidence .material-symbols-outlined { font-size: 15px; }
.add-evidence { aspect-ratio: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: var(--pulse-text-secondary); }
.add-evidence .material-symbols-outlined { font-size: 25px; color: var(--pulse-primary); }
.add-evidence small { font-size: 10px; }
.hidden-input { display: none; }

.report-footer {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: 1fr 1.7fr;
  gap: 10px;
  padding: 12px 20px calc(12px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--pulse-divider);
  background: var(--pulse-surface-container);
}
.cancel-button,
.submit-button { height: 46px; border: 0; border-radius: 23px; font-weight: 600; }
.cancel-button { background: var(--pulse-surface-high); color: var(--pulse-text); }
.submit-button { display: grid; place-items: center; background: var(--pulse-primary-gradient, var(--pulse-primary)); color: var(--pulse-on-primary); }
button:disabled { opacity: .52; cursor: default; }
button { font: inherit; cursor: pointer; }

@media (max-width: 360px) {
  .reason-grid { grid-template-columns: 1fr; }
  .evidence-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
</style>

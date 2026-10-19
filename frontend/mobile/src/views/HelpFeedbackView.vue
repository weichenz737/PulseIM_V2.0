<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { closeToast, showLoadingToast, showToast } from 'vant'
import { fetchHelpQuestions, submitUserFeedback, type HelpQuestion } from '@/api/help'
import { resolveFileUrl, uploadChatFile } from '@/api/file'
import { compressImageFile } from '@/utils/media'
import { smartBack } from '@/utils/navBack'

type Tab = 'questions' | 'feedback'
type UploadState = 'uploading' | 'done' | 'failed'

interface FeedbackImage {
  id: string
  file: File
  previewUrl: string
  uploadedUrl: string
  state: UploadState
}

const MAX_IMAGES = 4
const MAX_IMAGE_SIZE = 10 * 1024 * 1024

const router = useRouter()
const activeTab = ref<Tab>('questions')
const loading = ref(false)
const questions = ref<HelpQuestion[]>([])
const loadFailed = ref(false)
const faqKeyword = ref('')
const content = ref('')
const images = ref<FeedbackImage[]>([])
const submitting = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const uploading = computed(() => images.value.some((item) => item.state === 'uploading'))
const canSubmit = computed(
  () =>
    !uploading.value &&
    !submitting.value &&
    images.value.every((item) => item.state === 'done'),
)
const filteredQuestions = computed(() => {
  const keyword = faqKeyword.value.trim().toLowerCase()
  if (!keyword) return questions.value
  return questions.value.filter((item) =>
    [item.question, item.answer, item.category].filter(Boolean).some((value) => String(value).toLowerCase().includes(keyword)),
  )
})

onMounted(loadQuestions)

onBeforeUnmount(() => {
  images.value.forEach((item) => URL.revokeObjectURL(item.previewUrl))
})

async function loadQuestions() {
  loading.value = true
  loadFailed.value = false
  try {
    questions.value = await fetchHelpQuestions()
    faqKeyword.value = ''
  } catch (error) {
    loadFailed.value = true
    showToast(error instanceof Error ? error.message : '问题加载失败')
  } finally {
    loading.value = false
  }
}

function selectImages() {
  if (images.value.length >= MAX_IMAGES) {
    showToast(`最多添加 ${MAX_IMAGES} 张图片`)
    return
  }
  fileInput.value?.click()
}

async function onFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const selected = Array.from(target.files || [])
  target.value = ''
  const remaining = MAX_IMAGES - images.value.length
  if (selected.length > remaining) showToast(`最多添加 ${MAX_IMAGES} 张图片`)

  const accepted = selected.slice(0, remaining).filter((file) => {
    if (!file.type.startsWith('image/')) {
      showToast(`${file.name} 不是图片`)
      return false
    }
    if (file.size > MAX_IMAGE_SIZE) {
      showToast(`${file.name} 超过 10MB`)
      return false
    }
    return true
  })

  for (const file of accepted) {
    const item: FeedbackImage = {
      id: `${Date.now()}-${Math.random()}`,
      file,
      previewUrl: URL.createObjectURL(file),
      uploadedUrl: '',
      state: 'uploading',
    }
    images.value.push(item)
    void uploadImage(item)
  }
}

async function uploadImage(item: FeedbackImage) {
  updateImage(item.id, { state: 'uploading', uploadedUrl: '' })
  try {
    const result = await Promise.race([
      (async () => {
        const uploadFile = await compressImageFile(item.file, {
          maxEdge: 1600,
          quality: 0.78,
          maxBytes: 1.5 * 1024 * 1024,
          preserveGif: false,
        })
        return uploadChatFile(uploadFile)
      })(),
      new Promise<never>((_, reject) =>
        window.setTimeout(() => reject(new Error('图片上传超时，请重试')), 60_000),
      ),
    ])
    updateImage(item.id, { uploadedUrl: result.url, state: 'done' })
  } catch (error) {
    updateImage(item.id, { state: 'failed' })
    showToast(error instanceof Error ? error.message : '图片上传失败')
  }
}

function removeImage(item: FeedbackImage) {
  URL.revokeObjectURL(item.previewUrl)
  images.value = images.value.filter((image) => image.id !== item.id)
}

function updateImage(id: string, patch: Partial<FeedbackImage>) {
  const index = images.value.findIndex((image) => image.id === id)
  if (index < 0) return
  images.value[index] = { ...images.value[index], ...patch }
}

async function submitFeedback() {
  const text = content.value.trim()
  if (text.length < 2) {
    showToast('问题描述至少输入 2 个字')
    return
  }
  if (uploading.value) {
    showToast('图片正在上传，请稍候')
    return
  }
  if (images.value.some((item) => item.state === 'failed')) {
    showToast('请重试或删除上传失败的图片')
    return
  }

  submitting.value = true
  showLoadingToast({ message: '正在提交...', forbidClick: true, duration: 0 })
  try {
    await submitUserFeedback(
      text,
      images.value.map((item) => item.uploadedUrl),
    )
    content.value = ''
    images.value.forEach((item) => URL.revokeObjectURL(item.previewUrl))
    images.value = []
    closeToast()
    showToast('反馈已提交，感谢你的帮助')
    activeTab.value = 'questions'
  } catch (error) {
    closeToast()
    showToast(error instanceof Error ? error.message : '反馈提交失败')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page help-feedback-page">
    <header class="header">
      <button type="button" class="icon-btn" aria-label="返回" @click="smartBack(router)">
        <span class="material-symbols-outlined">arrow_back_ios</span>
      </button>
      <h1>帮助与反馈</h1>
      <span class="header-space" />
    </header>

    <div class="tabs" role="tablist" aria-label="帮助与反馈">
      <button type="button" role="tab" :aria-selected="activeTab === 'questions'" :class="{ active: activeTab === 'questions' }" @click="activeTab = 'questions'">
        常见问题
      </button>
      <button type="button" role="tab" :aria-selected="activeTab === 'feedback'" :class="{ active: activeTab === 'feedback' }" @click="activeTab = 'feedback'">
        提交反馈
      </button>
    </div>

    <main class="content">
      <section v-if="activeTab === 'questions'">
        <div class="help-banner">
          <div class="help-banner-icon"><span class="material-symbols-outlined">support_agent</span></div>
          <div class="help-banner-copy">
            <strong>先看看常见问题</strong>
            <span>如果没有找到答案，欢迎告诉我们</span>
          </div>
          <button type="button" @click="activeTab = 'feedback'">去反馈</button>
        </div>
        <div v-if="questions.length" class="faq-search">
          <span class="material-symbols-outlined">search</span>
          <input v-model="faqKeyword" type="text" placeholder="搜索问题关键词" aria-label="搜索常见问题" />
          <button v-if="faqKeyword" type="button" class="search-clear-btn" aria-label="清除搜索" @click="faqKeyword = ''">
            <span class="material-symbols-outlined">cancel</span>
          </button>
        </div>
        <div v-if="loading" class="state">
          <van-loading size="22px">加载中...</van-loading>
        </div>
        <div v-else-if="loadFailed" class="state">
          <span>问题列表加载失败</span>
          <button type="button" class="retry-btn" @click="loadQuestions">重新加载</button>
        </div>
        <div v-else-if="questions.length === 0" class="state">
          <span class="material-symbols-outlined state-icon">help_outline</span>
          <span>暂无相关问题</span>
        </div>
        <div v-else-if="filteredQuestions.length === 0" class="state search-empty">
          <span class="material-symbols-outlined state-icon">search_off</span>
          <span>没有找到匹配的问题</span>
          <button type="button" class="retry-btn" @click="faqKeyword = ''">查看全部问题</button>
        </div>
        <div v-else class="question-list">
          <button
            v-for="item in filteredQuestions"
            :key="item.id"
            type="button"
            class="question-item"
            @click="router.push(`/help/questions/${item.id}`)"
          >
            <span class="question-main">
              <span v-if="item.category" class="category">{{ item.category }}</span>
              <span class="question-title">{{ item.question }}</span>
              <span v-if="item.answer" class="answer-preview">{{ item.answer }}</span>
            </span>
            <span class="material-symbols-outlined chevron">chevron_right</span>
          </button>
        </div>
      </section>

      <section v-else class="feedback-form">
        <div class="feedback-intro">
          <span class="material-symbols-outlined">edit_note</span>
          <div><strong>告诉我们你的想法</strong><p>描述越详细，我们越容易定位和解决问题。</p></div>
        </div>
        <div class="field-card">
          <label for="feedback-content">问题描述</label>
          <textarea
            id="feedback-content"
            v-model="content"
            maxlength="1000"
            rows="7"
            placeholder="请详细描述遇到的问题或建议"
          />
          <span class="counter">{{ content.length }}/1000</span>
        </div>

        <div class="field-card">
          <div class="image-heading">
            <span>相关图片</span>
            <span>{{ images.length }}/{{ MAX_IMAGES }}</span>
          </div>
          <div class="image-grid">
            <div v-for="item in images" :key="item.id" class="image-item">
              <img :src="resolveFileUrl(item.previewUrl)" alt="反馈图片" />
              <div v-if="item.state !== 'done'" class="upload-mask">
                <van-loading v-if="item.state === 'uploading'" color="#fff" size="20px" />
                <button v-else type="button" class="retry-upload" @click="uploadImage(item)">
                  <span class="material-symbols-outlined">refresh</span>
                  重试
                </button>
              </div>
              <button type="button" class="remove-image" aria-label="删除图片" @click="removeImage(item)">
                <span class="material-symbols-outlined">close</span>
              </button>
            </div>
            <button
              v-if="images.length < MAX_IMAGES"
              type="button"
              class="add-image"
              :disabled="submitting"
              @click="selectImages"
            >
              <span class="material-symbols-outlined">add_photo_alternate</span>
              <span>添加图片</span>
            </button>
          </div>
          <p class="image-note">支持 JPG、PNG 等图片，单张不超过 10MB，最多 4 张。</p>
          <input
            ref="fileInput"
            class="file-input"
            type="file"
            accept="image/*"
            multiple
            @change="onFileChange"
          />
        </div>

        <button type="button" class="submit-btn" :disabled="!canSubmit" @click="submitFeedback">
          {{ submitting ? '提交中...' : '提交反馈' }}
        </button>
        <p class="privacy-note">反馈内容仅用于改进 PulseIM，我们会保护你的隐私。</p>
      </section>
    </main>
  </div>
</template>

<style scoped>
.page { min-height: 100%; background: var(--pulse-page-bg, var(--pulse-bg)); color: var(--pulse-text); }
.header { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; height: 56px; padding: var(--pulse-header-pad-top) 12px 0; background: var(--pulse-page-bg, var(--pulse-bg)); backdrop-filter: blur(16px); }
.header h1 { flex: 1; margin: 0; color: var(--pulse-primary); text-align: center; font-size: 18px; font-weight: 600; }
.icon-btn, .header-space { width: 40px; height: 40px; }
.icon-btn { display: grid; place-items: center; padding: 0; border: 0; background: transparent; color: var(--pulse-primary); }
.tabs { position: sticky; top: calc(56px + var(--pulse-header-pad-top)); z-index: 10; display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 8px 16px; background: var(--pulse-page-bg, var(--pulse-bg)); }
.tabs button { height: 38px; border: 0; border-radius: 6px; background: var(--pulse-surface-container); color: var(--pulse-text-secondary); font-size: 14px; }
.tabs button.active { background: var(--pulse-primary); color: #17213a; font-weight: 600; }
.content { padding: 8px 16px 28px; }
.help-banner { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; padding: 13px 12px; border: 1px solid color-mix(in srgb, var(--pulse-primary) 20%, var(--pulse-border)); border-radius: 12px; background: color-mix(in srgb, var(--pulse-primary) 8%, var(--pulse-surface-container)); }
.help-banner-icon { display: grid; width: 34px; height: 34px; flex: 0 0 auto; place-items: center; border-radius: 10px; background: color-mix(in srgb, var(--pulse-primary) 16%, transparent); color: var(--pulse-primary); }
.help-banner-icon .material-symbols-outlined { font-size: 20px; }
.help-banner-copy { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 3px; }
.help-banner-copy strong { color: var(--pulse-text); font-size: 14px; }
.help-banner-copy span { overflow: hidden; color: var(--pulse-text-secondary); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.help-banner button { padding: 7px 10px; border: 0; border-radius: 6px; background: var(--pulse-primary); color: #17213a; font-size: 12px; font-weight: 600; }
.faq-search { display: flex; align-items: center; gap: 7px; margin-bottom: 10px; padding: 0 10px; border: 1px solid var(--pulse-border); border-radius: 8px; background: var(--pulse-surface-container); color: var(--pulse-outline); }
.faq-search > .material-symbols-outlined { font-size: 19px; }
.faq-search input { min-width: 0; flex: 1; height: 40px; border: 0; outline: none; background: transparent; color: var(--pulse-text); font: inherit; font-size: 13px; }
.faq-search input::placeholder { color: var(--pulse-outline); }
.faq-search button { display: grid; width: 28px; height: 28px; place-items: center; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--pulse-outline); }
.faq-search button .material-symbols-outlined { font-size: 17px; }
.state { display: flex; min-height: 240px; flex-direction: column; align-items: center; justify-content: center; gap: 14px; color: var(--pulse-text-secondary); font-size: 14px; }
.state-icon { font-size: 36px; }
.search-empty { min-height: 200px; }
.retry-btn { height: 36px; padding: 0 18px; border: 1px solid var(--pulse-primary); border-radius: 6px; background: transparent; color: var(--pulse-primary); }
.question-list { overflow: hidden; margin-bottom: calc(28px + env(safe-area-inset-bottom, 0px)); border: 1px solid var(--pulse-border); border-radius: 12px; background: var(--pulse-surface-container); }
.question-item { display: flex; width: 100%; min-height: 58px; align-items: center; gap: 12px; padding: 10px 16px; border: 0; border-bottom: 1px solid var(--pulse-divider); background: transparent; color: inherit; text-align: left; }
.question-item:last-child { border-bottom: 0; }
.question-main { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 3px; }
.category { align-self: flex-start; padding: 2px 6px; border-radius: 4px; background: rgba(173,198,255,.12); color: var(--pulse-primary); font-size: 11px; }
.question-title { overflow: hidden; color: var(--pulse-text); font-size: 15px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.answer-preview { overflow: hidden; color: var(--pulse-text-secondary); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.chevron { flex: 0 0 auto; color: var(--pulse-outline); }
.feedback-form { display: flex; flex-direction: column; gap: 12px; }
.feedback-intro { display: flex; align-items: center; gap: 10px; padding: 4px 2px 2px; }
.feedback-intro > .material-symbols-outlined { color: var(--pulse-primary); font-size: 28px; }
.feedback-intro strong { color: var(--pulse-text); font-size: 15px; }
.feedback-intro p { margin: 4px 0 0; color: var(--pulse-text-secondary); font-size: 12px; }
.field-card { position: relative; padding: 16px; border-radius: 8px; background: var(--pulse-surface-container); }
.field-card label, .image-heading { display: flex; justify-content: space-between; margin-bottom: 12px; color: var(--pulse-text); font-size: 15px; font-weight: 600; }
.image-heading span:last-child { color: var(--pulse-text-secondary); font-size: 13px; font-weight: 400; }
textarea { display: block; width: 100%; box-sizing: border-box; resize: none; padding: 12px; border: 1px solid rgba(255,255,255,.1); border-radius: 6px; outline: none; background: var(--pulse-surface-high); color: var(--pulse-text); font: inherit; line-height: 1.55; }
textarea:focus { border-color: var(--pulse-primary); }
.counter { display: block; margin-top: 7px; color: var(--pulse-outline); text-align: right; font-size: 12px; }
.image-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.image-item, .add-image { position: relative; aspect-ratio: 1; overflow: hidden; border-radius: 6px; }
.image-item img { width: 100%; height: 100%; object-fit: cover; }
.upload-mask { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(0,0,0,.6); }
.retry-upload { display: flex; flex-direction: column; align-items: center; border: 0; background: transparent; color: #fff; font-size: 11px; }
.retry-upload .material-symbols-outlined { font-size: 22px; }
.remove-image { position: absolute; top: 3px; right: 3px; display: grid; width: 24px; height: 24px; place-items: center; padding: 0; border: 0; border-radius: 50%; background: rgba(0,0,0,.72); color: #fff; }
.remove-image .material-symbols-outlined { font-size: 17px; }
.add-image { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; border: 1px dashed var(--pulse-outline); background: transparent; color: var(--pulse-text-secondary); font-size: 11px; }
.add-image .material-symbols-outlined { font-size: 25px; }
.file-input { display: none; }
.image-note { margin: 10px 0 0; color: var(--pulse-text-secondary); font-size: 11px; line-height: 1.4; }
.submit-btn { height: 48px; margin-top: 4px; border: 0; border-radius: 8px; background: var(--pulse-primary); color: #17213a; font-size: 16px; font-weight: 600; }
.submit-btn:disabled { opacity: .42; }
.privacy-note { margin: -2px 0 0; color: var(--pulse-outline); text-align: center; font-size: 11px; }
</style>

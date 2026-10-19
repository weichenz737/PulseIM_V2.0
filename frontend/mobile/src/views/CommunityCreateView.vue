<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { closeToast, showLoadingToast, showToast } from 'vant'
import { communityTopics, createCommunity } from '@/api/community'
import { fetchNicknameConfig } from '@/api/nicknameConfig'
import { fetchSystemText } from '@/api/systemText'
import { uploadChatFile, resolveFileUrl } from '@/api/file'
import CommunityChoicePicker from '@/components/CommunityChoicePicker.vue'

const router = useRouter()
const topics = ref<{ id: number; name: string }[]>([])
const communityNicknameMaxLength = ref(30)
const saving = ref(false)
const uploadingAvatar = ref(false)
const avatarInput = ref<HTMLInputElement | null>(null)
const showTopicPicker = ref(false)
const showTypePicker = ref(false)
const showPostModePicker = ref(false)
const agreementVisible = ref(false)
const agreementLoading = ref(false)
const agreementAccepted = ref(false)
const agreementTitle = ref('圈子创建协议')
const agreementContent = ref('')
const communityTypeOptions = [
  { value: 'FREE', label: '免费圈子', description: '成员无需付费即可申请加入', icon: 'diversity_3' },
  { value: 'PAID', label: '付费圈子', description: '成员支付设定的 PLU 后加入', icon: 'paid' },
] as const
const postModeOptions = [
  { value: 'ALL', label: '成员直接发布', description: '成员发布的动态会立即展示', icon: 'edit_note' },
  { value: 'REVIEW', label: '发布需要审核', description: '管理员审核通过后动态才会展示', icon: 'fact_check' },
  { value: 'ADMIN_ONLY', label: '仅管理员发布', description: '只有圈主和管理员可以发布动态', icon: 'admin_panel_settings' },
] as const
const form = reactive({
  name: '',
  avatar: '',
  topicId: undefined as number | undefined,
  description: '',
  rules: '',
  type: 'FREE',
  price: 0,
  postMode: 'ALL',
})

const selectedTopic = computed(() => topics.value.find((item) => item.id === form.topicId))
const selectedCommunityType = computed(() => communityTypeOptions.find((item) => item.value === form.type)!)
const selectedPostMode = computed(() => postModeOptions.find((item) => item.value === form.postMode)!)

onMounted(async () => {
  void fetchNicknameConfig().then((config) => {
    communityNicknameMaxLength.value = Number(config.communityNicknameMaxLength) || 30
  }).catch(() => undefined)
  try {
    topics.value = await communityTopics()
  } catch (error) {
    showToast(error instanceof Error ? error.message : '主题加载失败')
  }
})

async function submit() {
  if (saving.value || uploadingAvatar.value) return
  if (!form.topicId) {
    showToast('请选择圈子主题')
    showTopicPicker.value = true
    return
  }
  agreementAccepted.value = false
  agreementVisible.value = true
  agreementLoading.value = true
  try {
    const agreement = await fetchSystemText('community_create_agreement')
    agreementTitle.value = agreement.title || '圈子创建协议'
    agreementContent.value = agreement.content || '平台暂未配置圈子创建协议，请联系管理员。'
  } catch (error) {
    agreementVisible.value = false
    showToast(error instanceof Error ? error.message : '圈子创建协议加载失败')
  } finally {
    agreementLoading.value = false
  }
}

async function confirmCreate() {
  if (saving.value || agreementLoading.value) return
  if (!agreementAccepted.value) {
    showToast('请先阅读并同意圈子创建协议')
    return
  }
  agreementVisible.value = false
  saving.value = true
  try {
    const result = await createCommunity({
      ...form,
      agreementAccepted: true,
      price: form.type === 'PAID' ? Math.round(Number(form.price) * 100) : 0,
    })
    showToast('已提交审核')
    router.replace(`/communities/${result.id}`)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '创建失败')
  } finally {
    saving.value = false
  }
}

function openAvatarPicker() {
  if (saving.value || uploadingAvatar.value) return
  avatarInput.value?.click()
}

async function onAvatarSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    showToast('请选择图片')
    return
  }
  if (file.size > 20 * 1024 * 1024) {
    showToast('图片不能超过20MB')
    return
  }
  uploadingAvatar.value = true
  showLoadingToast({ message: '上传头像…', forbidClick: true, duration: 0 })
  try {
    const uploaded = await uploadChatFile(file)
    form.avatar = uploaded.url
    closeToast()
  } catch (error) {
    closeToast()
    showToast(error instanceof Error ? error.message : '头像上传失败')
  } finally {
    uploadingAvatar.value = false
  }
}
</script>

<template>
  <div class="page community-create-page">
    <header class="page-header">
      <button type="button" class="icon-btn" aria-label="返回" @click="router.back()">
        <span class="material-symbols-outlined">arrow_back_ios</span>
      </button>
      <h1 class="page-title">创建圈子</h1>
      <span class="header-spacer" />
    </header>

    <form class="create-form" @submit.prevent="submit">
      <div class="avatar-field">
        <button type="button" class="community-avatar-picker" :disabled="saving || uploadingAvatar" aria-label="上传圈子头像" @click="openAvatarPicker">
          <img v-if="form.avatar" :src="resolveFileUrl(form.avatar)" alt="" />
          <span v-else>{{ form.name.slice(0, 1) || '圈' }}</span>
          <i class="material-symbols-outlined">photo_camera</i>
        </button>
        <input ref="avatarInput" class="avatar-file-input" type="file" accept="image/*" tabindex="-1" aria-hidden="true" @change="onAvatarSelected" />
        <div class="avatar-field-copy">
          <strong>圈子头像</strong>
          <small>{{ uploadingAvatar ? '头像上传中…' : '点击上传头像（可选）' }}</small>
        </div>
      </div>
<label>圈子名称<input v-model="form.name" minlength="2" :maxlength="communityNicknameMaxLength" required placeholder="请输入圈子名称" /></label>

      <div class="field-group">
        <span class="field-label">圈子主题</span>
        <button type="button" class="picker-field" @click="showTopicPicker = true">
          <span :class="{ placeholder: !selectedTopic }">{{ selectedTopic?.name || '请选择圈子主题' }}</span>
          <span class="material-symbols-outlined">keyboard_arrow_down</span>
        </button>
      </div>

      <label>圈子介绍<textarea v-model="form.description" maxlength="500" placeholder="介绍圈子的主题和内容" /></label>
      <label>圈子规则<textarea v-model="form.rules" maxlength="2000" placeholder="例如：禁止广告、禁止违规内容" /></label>

      <div class="field-group">
        <span class="field-label">圈子类型</span>
        <button type="button" class="picker-field option-picker-field" @click="showTypePicker = true">
          <span class="option-picker-icon"><span class="material-symbols-outlined">{{ selectedCommunityType.icon }}</span></span>
          <span class="option-picker-copy">
            <strong>{{ selectedCommunityType.label }}</strong>
            <small>{{ selectedCommunityType.description }}</small>
          </span>
          <span class="material-symbols-outlined picker-chevron">chevron_right</span>
        </button>
      </div>
      <label v-if="form.type === 'PAID'">加入价格（PLU）<input v-model.number="form.price" type="number" min="0.01" step="0.01" placeholder="请输入价格" /></label>
      <div class="field-group">
        <span class="field-label">发布模式</span>
        <button type="button" class="picker-field option-picker-field" @click="showPostModePicker = true">
          <span class="option-picker-icon"><span class="material-symbols-outlined">{{ selectedPostMode.icon }}</span></span>
          <span class="option-picker-copy">
            <strong>{{ selectedPostMode.label }}</strong>
            <small>{{ selectedPostMode.description }}</small>
          </span>
          <span class="material-symbols-outlined picker-chevron">chevron_right</span>
        </button>
      </div>
      <button class="submit" :disabled="saving || uploadingAvatar">{{ saving ? '提交中…' : uploadingAvatar ? '头像上传中…' : '提交审核' }}</button>
    </form>

    <van-popup v-model:show="showTopicPicker" position="bottom" round closeable teleport="body" class="topic-picker-popup">
      <section class="topic-picker">
        <div class="topic-picker-head">
          <div>
            <h2>选择圈子主题</h2>
            <p>选择一个最能代表圈子内容的主题</p>
          </div>
        </div>
        <div class="topic-options">
          <button
            v-for="topic in topics"
            :key="topic.id"
            type="button"
            class="topic-option"
            :class="{ selected: form.topicId === topic.id }"
            @click="form.topicId = topic.id; showTopicPicker = false"
          >
            <span class="topic-icon"><span class="material-symbols-outlined">sell</span></span>
            <span class="topic-name">{{ topic.name }}</span>
            <span v-if="form.topicId === topic.id" class="material-symbols-outlined topic-check">check_circle</span>
          </button>
        </div>
      </section>
    </van-popup>

    <CommunityChoicePicker v-model:show="showTypePicker" :value="form.type" kicker="加入方式" title="选择圈子类型" description="设置成员加入圈子的方式，创建后仍可在圈子管理中调整。" :options="communityTypeOptions" @select="form.type = $event" />
    <CommunityChoicePicker v-model:show="showPostModePicker" :value="form.postMode" kicker="内容权限" title="选择发布模式" description="决定成员动态如何发布和展示，让圈子内容更易管理。" :options="postModeOptions" @select="form.postMode = $event" />

    <van-popup v-model:show="agreementVisible" position="bottom" round closeable teleport="body" :close-on-click-overlay="!saving" class="create-agreement-popup">
      <section class="create-agreement-sheet">
        <h2>{{ agreementTitle }}</h2>
        <div class="create-agreement-content">{{ agreementContent }}</div>
        <label class="agreement-check">
          <input v-model="agreementAccepted" type="checkbox" :disabled="agreementLoading || saving" />
          <span>我已阅读并同意《{{ agreementTitle }}》</span>
        </label>
        <button type="button" class="agreement-submit" :disabled="agreementLoading || saving" @click="confirmCreate">
          {{ agreementLoading ? '协议加载中…' : saving ? '提交中…' : '同意并提交审核' }}
        </button>
      </section>
    </van-popup>
  </div>
</template>

<style scoped>
.page{min-height:100%;background:var(--pulse-page-bg,var(--pulse-bg));color:var(--pulse-text)}
button{border:0;background:none;color:inherit;font:inherit}
.page-header{position:sticky;top:0;z-index:20;display:flex;align-items:center;height:56px;padding:0 12px;padding-top:var(--pulse-header-pad-top);background:var(--pulse-page-bg,var(--pulse-bg))}
.icon-btn,.header-spacer{width:40px;height:40px;flex:none}.icon-btn{display:grid;place-items:center;border-radius:50%;color:var(--pulse-primary)}.icon-btn .material-symbols-outlined{font-size:22px}
.page-title{flex:1;margin:0;text-align:center;font-size:18px;font-weight:600;color:var(--pulse-primary)}
.create-form{padding:16px 16px calc(32px + env(safe-area-inset-bottom,0px))}
.avatar-field{display:flex;align-items:center;gap:12px;margin:0 0 20px}.community-avatar-picker{position:relative;width:76px;height:76px;flex:none;padding:0;overflow:hidden;border:0;border-radius:22px;background:var(--pulse-surface-high);color:var(--pulse-primary);font-size:28px;font-weight:700}.community-avatar-picker img{width:100%;height:100%;object-fit:cover}.community-avatar-picker i{position:absolute;right:4px;bottom:4px;display:grid;width:24px;height:24px;place-items:center;border:2px solid var(--pulse-page-bg,var(--pulse-bg));border-radius:50%;background:var(--pulse-primary);color:var(--pulse-on-primary);font-size:14px}.community-avatar-picker:disabled{opacity:.6}.avatar-field-copy{display:flex;flex-direction:column;gap:5px}.avatar-field-copy strong{font-size:15px}.avatar-field-copy small{color:var(--pulse-text-secondary);font-size:12px}
.avatar-file-input{display:none}
label,.field-group{display:block;margin-bottom:16px;font-size:13px;color:var(--pulse-text-secondary)}
input,textarea,.picker-field{display:flex;width:100%;box-sizing:border-box;align-items:center;justify-content:space-between;margin-top:8px;padding:13px 14px;border:1px solid var(--pulse-outline-variant);border-radius:14px;outline:0;background:var(--pulse-surface-container);color:var(--pulse-text);font-size:15px}
input{height:48px}input::placeholder,textarea::placeholder{color:var(--pulse-text-secondary);opacity:.72}
textarea{min-height:106px;resize:none;line-height:1.55}
.picker-field{cursor:pointer;text-align:left}.picker-field .placeholder{color:var(--pulse-text-secondary);opacity:.72}.picker-field .material-symbols-outlined{font-size:20px;color:var(--pulse-text-secondary)}
.option-picker-field{min-height:68px;justify-content:flex-start;gap:12px;padding:10px 12px}.option-picker-icon{display:grid;width:40px;height:40px;flex:0 0 40px;place-items:center;border-radius:13px;background:color-mix(in srgb,var(--pulse-primary) 13%,transparent);color:var(--pulse-primary)}.picker-field .option-picker-icon .material-symbols-outlined{color:var(--pulse-primary);font-size:21px}.option-picker-copy{display:flex;min-width:0;flex:1;flex-direction:column;gap:4px}.option-picker-copy strong{color:var(--pulse-text);font-size:15px;font-weight:650}.option-picker-copy small{overflow:hidden;color:var(--pulse-text-secondary);font-size:11px;text-overflow:ellipsis;white-space:nowrap}.picker-field .picker-chevron{font-size:21px}
.submit{width:100%;height:48px;margin-top:8px;border-radius:14px;background:var(--pulse-primary);color:var(--pulse-on-primary);font-weight:650}.submit:disabled{opacity:.55}
.topic-picker-popup{background:var(--pulse-surface-container);color:var(--pulse-text)}
.topic-picker{padding:24px 16px calc(18px + env(safe-area-inset-bottom,0px))}
.topic-picker-head{padding:0 36px 18px 4px}.topic-picker-head h2{margin:0;font-size:19px}.topic-picker-head p{margin:7px 0 0;color:var(--pulse-text-secondary);font-size:12px}
.topic-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.topic-option{display:flex;align-items:center;gap:10px;min-height:56px;padding:10px 12px;border:1px solid var(--pulse-outline-variant);border-radius:14px;background:var(--pulse-surface-high);text-align:left;transition:.18s ease}
.topic-option.selected{border-color:var(--pulse-primary);background:color-mix(in srgb,var(--pulse-primary) 12%,var(--pulse-surface-high))}.topic-icon{display:grid;place-items:center;width:32px;height:32px;border-radius:10px;background:color-mix(in srgb,var(--pulse-primary) 14%,transparent);color:var(--pulse-primary)}.topic-icon .material-symbols-outlined{font-size:18px}.topic-name{flex:1;min-width:0;font-size:14px}.topic-check{color:var(--pulse-primary);font-size:19px}
.create-agreement-popup{background:var(--pulse-surface-container);color:var(--pulse-text)}.create-agreement-sheet{padding:24px 18px calc(18px + env(safe-area-inset-bottom,0px))}.create-agreement-sheet h2{margin:0 36px 14px 0;font-size:19px}.create-agreement-content{max-height:42vh;overflow:auto;padding:14px;border-radius:12px;background:var(--pulse-surface-high);color:var(--pulse-text-secondary);font-size:13px;line-height:1.7;white-space:pre-wrap}.agreement-check{display:flex;align-items:flex-start;gap:8px;margin:16px 2px;color:var(--pulse-text);font-size:13px;line-height:1.5}.agreement-check input{width:18px;height:18px;flex:none;margin:0;accent-color:var(--pulse-primary)}.agreement-submit{width:100%;height:46px;border-radius:13px;background:var(--pulse-primary);color:var(--pulse-on-primary);font-weight:650}.agreement-submit:disabled{opacity:.55}
</style>

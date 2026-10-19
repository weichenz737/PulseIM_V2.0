<script setup lang="ts">
import { computed, ref, onBeforeUnmount, onMounted } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { showConfirmDialog, showToast, showLoadingToast, closeToast } from 'vant'
import type { PickerConfirmEventParams } from 'vant'
import { areaList } from '@vant/area-data'
import { fetchUserProfile, updateUserProfile } from '@/api/contact'
import { fetchNicknameConfig } from '@/api/nicknameConfig'
import { uploadChatFile, resolveAvatarUrl } from '@/api/file'
import { compressAvatarFile } from '@/utils/media'
import { useUserStore } from '@/stores/user'
import { smartBack } from '@/utils/navBack'
import UserAvatar from '@/components/UserAvatar.vue'

const router = useRouter()
const userStore = useUserStore()

const GENDER_OPTIONS = [
  { text: '男', value: '男' },
  { text: '女', value: '女' },
  { text: '未知', value: '未知' },
] as const

const nickname = ref('')
const nicknameMaxLength = ref(20)
const gender = ref('未知')
const birthday = ref('')
const region = ref('')
const signature = ref('')
/** 展示用（已 resolve） */
const avatarUrl = ref('')
/** 提交给后端的原始地址 */
const avatarRawUrl = ref('')
const avatarInputRef = ref<HTMLInputElement | null>(null)
const uploadingAvatar = ref(false)
const pendingAvatarFile = ref<File | null>(null)
const pendingAvatarPreviewUrl = ref('')
const savedProfile = ref({ nickname: '', gender: '未知', birthday: '', region: '', signature: '', avatarUrl: '' })

const showGenderPicker = ref(false)
const showBirthdayPicker = ref(false)
const showRegionPicker = ref(false)

const genderPickerValue = ref<string[]>(['未知'])
const birthdayPickerValue = ref<string[]>([])
const regionCode = ref('')

const genderColumns = GENDER_OPTIONS.map((item) => ({ text: item.text, value: item.value }))

const minBirthdayDate = new Date(1920, 0, 1)
const maxBirthdayDate = new Date()

// 返回键可能在确认弹窗尚未完成时连续触发；只允许第一条离开请求继续。
let leavePromptInFlight = false

const genderDisplay = computed(() => gender.value || '请选择')
const birthdayDisplay = computed(() => birthday.value || '请选择')
const regionDisplay = computed(() => region.value || '请选择')
const isProfileDirty = computed(() => (
  nickname.value !== savedProfile.value.nickname
  || gender.value !== savedProfile.value.gender
  || birthday.value !== savedProfile.value.birthday
  || region.value !== savedProfile.value.region
  || signature.value !== savedProfile.value.signature
  || avatarRawUrl.value !== savedProfile.value.avatarUrl
  || Boolean(pendingAvatarFile.value)
))

function profileSnapshot() {
  return {
    nickname: nickname.value,
    gender: gender.value,
    birthday: birthday.value,
    region: region.value,
    signature: signature.value,
    avatarUrl: avatarRawUrl.value || avatarUrl.value,
  }
}

function normalizeGender(raw: string) {
  const value = String(raw || '').trim()
  if (value === '男' || value === '女' || value === '未知') return value
  if (value === 'male' || value === 'M' || value === '1') return '男'
  if (value === 'female' || value === 'F' || value === '2') return '女'
  return value ? '未知' : '未知'
}

function parseBirthdayParts(raw: string): string[] {
  const match = String(raw || '').trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!match) {
    const now = new Date()
    const y = String(now.getFullYear() - 18)
    return [y, '01', '01']
  }
  return [
    match[1],
    String(match[2]).padStart(2, '0'),
    String(match[3]).padStart(2, '0'),
  ]
}

function findAreaCodesByText(text: string): string[] {
  const parts = String(text || '')
    .split(/[\s/｜|，,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (!parts.length) return []

  const provinceEntries = Object.entries(areaList.province_list)
  const cityEntries = Object.entries(areaList.city_list)
  const countyEntries = Object.entries(areaList.county_list)

  const province = provinceEntries.find(([, name]) => name === parts[0] || name.includes(parts[0]))
  if (!province) return []
  const provinceCode = province[0]

  if (!parts[1]) return [provinceCode]

  const city = cityEntries.find(
    ([code, name]) => code.startsWith(provinceCode.slice(0, 2)) && (name === parts[1] || name.includes(parts[1])),
  )
  if (!city) return [provinceCode]
  const cityCode = city[0]

  if (!parts[2]) return [provinceCode, cityCode]

  const county = countyEntries.find(
    ([code, name]) => code.startsWith(cityCode.slice(0, 4)) && (name === parts[2] || name.includes(parts[2])),
  )
  if (!county) return [provinceCode, cityCode]
  return [provinceCode, cityCode, county[0]]
}

onMounted(async () => {
  nickname.value = userStore.nickname
  avatarUrl.value = userStore.avatar
  avatarRawUrl.value = userStore.avatar
  region.value = userStore.region
  signature.value = userStore.signature
  void fetchNicknameConfig().then((config) => {
    nicknameMaxLength.value = Number(config.userNicknameMaxLength) || 20
  }).catch(() => undefined)
  try {
    const profile = await fetchUserProfile()
    nickname.value = profile.nickname || nickname.value
    avatarUrl.value = profile.avatarUrl || avatarUrl.value
    avatarRawUrl.value = profile.avatarUrl || ''
    gender.value = normalizeGender(profile.gender || '')
    birthday.value = profile.birthday || ''
    region.value = profile.region || ''
    signature.value = profile.signature || ''
  } catch {
    // use store defaults
  }
  genderPickerValue.value = [gender.value || '未知']
  birthdayPickerValue.value = parseBirthdayParts(birthday.value)
  const codes = findAreaCodesByText(region.value)
  regionCode.value = codes[codes.length - 1] || ''
  savedProfile.value = profileSnapshot()
})

function pickAvatar() {
  if (uploadingAvatar.value) return
  avatarInputRef.value?.click()
}

function clearPendingAvatarPreview() {
  if (pendingAvatarPreviewUrl.value) {
    URL.revokeObjectURL(pendingAvatarPreviewUrl.value)
    pendingAvatarPreviewUrl.value = ''
  }
}

function onAvatarSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    showToast('请选择图片')
    return
  }
  if (file.size > 20 * 1024 * 1024) {
    showToast('头像不能超过 20MB')
    return
  }
  clearPendingAvatarPreview()
  pendingAvatarFile.value = file
  pendingAvatarPreviewUrl.value = URL.createObjectURL(file)
  avatarUrl.value = pendingAvatarPreviewUrl.value
}

function openGenderPicker() {
  genderPickerValue.value = [normalizeGender(gender.value)]
  showGenderPicker.value = true
}

function openBirthdayPicker() {
  birthdayPickerValue.value = parseBirthdayParts(birthday.value)
  showBirthdayPicker.value = true
}

function openRegionPicker() {
  const codes = findAreaCodesByText(region.value)
  regionCode.value = codes[codes.length - 1] || ''
  showRegionPicker.value = true
}

function onGenderConfirm({ selectedValues, selectedOptions }: PickerConfirmEventParams) {
  const next = String(selectedOptions?.[0]?.text || selectedValues?.[0] || '未知')
  gender.value = normalizeGender(next)
  genderPickerValue.value = [gender.value]
  showGenderPicker.value = false
}

function onBirthdayConfirm({ selectedValues }: PickerConfirmEventParams) {
  const [y, m, d] = selectedValues.map(String)
  if (!y || !m || !d) return
  birthday.value = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  birthdayPickerValue.value = [y, String(m).padStart(2, '0'), String(d).padStart(2, '0')]
  showBirthdayPicker.value = false
}

function onRegionConfirm({ selectedOptions, selectedValues }: PickerConfirmEventParams) {
  const names = (selectedOptions || [])
    .map((opt) => String(opt?.text || '').trim())
    .filter(Boolean)
  region.value = names.join(' ')
  const values = (selectedValues || []).map(String)
  regionCode.value = values[values.length - 1] || ''
  showRegionPicker.value = false
}

async function handleSave(leaveAfterSave = true): Promise<boolean> {
  if (uploadingAvatar.value) return false
  uploadingAvatar.value = true
  showLoadingToast({ message: '保存中...', forbidClick: true })
  try {
    let nextAvatarRawUrl = avatarRawUrl.value || avatarUrl.value
    if (pendingAvatarFile.value) {
      const avatarFile = await compressAvatarFile(pendingAvatarFile.value)
      const uploaded = await uploadChatFile(avatarFile)
      nextAvatarRawUrl = uploaded.originalUrl || uploaded.url
    }
    await updateUserProfile({
      nickname: nickname.value,
      avatarUrl: nextAvatarRawUrl,
      gender: gender.value,
      birthday: birthday.value,
      region: region.value,
      signature: signature.value,
    })
    avatarRawUrl.value = nextAvatarRawUrl
    if (pendingAvatarFile.value) {
      avatarUrl.value = resolveAvatarUrl(nextAvatarRawUrl)
      pendingAvatarFile.value = null
      clearPendingAvatarPreview()
    }
    userStore.setUserInfo({
      nickname: nickname.value,
      avatar: nextAvatarRawUrl,
      region: region.value,
      signature: signature.value,
    })
    savedProfile.value = profileSnapshot()
    closeToast()
    showToast('保存成功')
    if (leaveAfterSave) router.back()
    return true
  } catch (err) {
    closeToast()
    showToast(err instanceof Error ? err.message : '保存失败')
    return false
  } finally {
    uploadingAvatar.value = false
  }
}

function goBack() {
  smartBack(router)
}

onBeforeRouteLeave(async () => {
  if (!isProfileDirty.value) return true
  if (leavePromptInFlight) return false
  leavePromptInFlight = true
  try {
    await showConfirmDialog({
      title: '资料尚未保存',
      message: '是否保存当前修改？',
      confirmButtonText: '保存',
      cancelButtonText: '不保存',
    })
    return await handleSave(false)
  } catch {
    // 点击“不保存”或关闭弹窗时继续离开，不再重复弹窗。
    return true
  } finally {
    leavePromptInFlight = false
  }
})

onBeforeUnmount(() => {
  clearPendingAvatarPreview()
})
</script>

<template>
  <div class="edit-profile-page">
    <header class="page-header">
      <button type="button" class="back-btn" @click="goBack">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 18l-6-6 6-6"/>
        </svg>
      </button>
      <h1 class="page-title">编辑资料</h1>
      <button type="button" class="save-btn" :disabled="uploadingAvatar" @click="() => void handleSave()">
        {{ uploadingAvatar ? '保存中...' : '保存' }}
      </button>
    </header>

    <main class="main-content">
      <section class="avatar-section">
        <div class="avatar-wrap" @click="pickAvatar">
          <UserAvatar
            :src="avatarUrl"
            :user-id="userStore.userId"
            :name="nickname || '用'"
            :size="96"
            alt="头像"
            class="avatar"
          />
          <div class="avatar-overlay">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </div>
          <span class="edit-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.84-1.83z"/>
            </svg>
          </span>
        </div>
        <p class="avatar-hint">{{ uploadingAvatar ? '保存中...' : pendingAvatarFile ? '已选择新头像，点击保存后生效' : '点击更换头像' }}</p>
        <input
          ref="avatarInputRef"
          type="file"
          accept="image/*"
          class="hidden-input"
          @change="onAvatarSelected"
        />
      </section>

      <section class="form-card">
        <div class="form-row">
          <div class="form-col">
            <span class="form-label">昵称</span>
            <input v-model="nickname" type="text" :maxlength="nicknameMaxLength" placeholder="请输入昵称" class="form-value" />
          </div>
        </div>
        <button type="button" class="form-row pick-row" @click="openGenderPicker">
          <div class="form-col">
            <span class="form-label">性别</span>
            <span class="form-value" :class="{ placeholder: !gender }">{{ genderDisplay }}</span>
          </div>
          <svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
        <button type="button" class="form-row pick-row" @click="openBirthdayPicker">
          <div class="form-col">
            <span class="form-label">生日</span>
            <span class="form-value" :class="{ placeholder: !birthday }">{{ birthdayDisplay }}</span>
          </div>
          <svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
        <button type="button" class="form-row pick-row last" @click="openRegionPicker">
          <div class="form-col">
            <span class="form-label">地区</span>
            <span class="form-value" :class="{ placeholder: !region }">{{ regionDisplay }}</span>
          </div>
          <svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      </section>

      <section class="form-card signature-card">
        <div class="form-row last">
          <div class="form-col wide">
            <span class="form-label">个性签名</span>
            <input v-model="signature" type="text" placeholder="写点什么..." class="form-value" />
          </div>
        </div>
      </section>
    </main>

    <van-popup v-model:show="showGenderPicker" position="bottom" round>
      <van-picker
        v-model="genderPickerValue"
        title="选择性别"
        :columns="genderColumns"
        @confirm="onGenderConfirm"
        @cancel="showGenderPicker = false"
      />
    </van-popup>

    <van-popup v-model:show="showBirthdayPicker" position="bottom" round>
      <van-date-picker
        v-model="birthdayPickerValue"
        title="选择生日"
        :min-date="minBirthdayDate"
        :max-date="maxBirthdayDate"
        @confirm="onBirthdayConfirm"
        @cancel="showBirthdayPicker = false"
      />
    </van-popup>

    <van-popup v-model:show="showRegionPicker" position="bottom" round>
      <van-area
        v-model="regionCode"
        title="选择地区"
        :area-list="areaList"
        @confirm="onRegionConfirm"
        @cancel="showRegionPicker = false"
      />
    </van-popup>
  </div>
</template>

<style scoped>
.edit-profile-page {
  min-height: 100vh;
  background: var(--pulse-page-bg, var(--pulse-bg));
}

.page-header {
  position: sticky;
  top: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  padding: 0 16px;
  padding-top: var(--pulse-header-pad-top);
  background: var(--pulse-page-bg, var(--pulse-bg));
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.back-btn {
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  color: var(--pulse-text);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 50%;
  transition: background 0.2s;
}

.back-btn:active {
  background: rgba(52, 53, 57, 0.5);
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--pulse-text);
}

.save-btn {
  border: none;
  background: var(--pulse-primary);
  color: var(--pulse-on-primary);
  font-size: 13px;
  font-weight: 500;
  padding: 6px 24px;
  border-radius: 999px;
  cursor: pointer;
  transition: transform 0.15s;
}

.save-btn:active {
  transform: scale(0.95);
}

.main-content {
  max-width: 640px;
  margin: 0 auto;
  padding: 24px 16px 48px;
}

.avatar-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 32px;
}

.avatar-wrap {
  position: relative;
  cursor: pointer;
}

.avatar {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--pulse-surface-highest);
  box-shadow: 0 0 0 4px rgba(173, 198, 255, 0.1);
  transition: transform 0.15s;
}

.avatar-wrap:active .avatar {
  transform: scale(0.95);
}

.avatar-overlay {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  opacity: 0;
  transition: opacity 0.2s;
}

.avatar-wrap:hover .avatar-overlay,
.avatar-wrap:active .avatar-overlay {
  opacity: 1;
}

.hidden-input {
  display: none;
}

.edit-badge {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--pulse-primary);
  color: var(--pulse-on-primary);
  border: 2px solid var(--pulse-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.avatar-hint {
  margin: 16px 0 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--pulse-text-secondary);
}

.form-card {
  background: var(--pulse-surface-container);
  border: 1px solid var(--pulse-border, rgba(255, 255, 255, 0.06));
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

.signature-card {
  margin-top: 12px;
}

.form-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  border: 0;
  border-bottom: 1px solid var(--pulse-divider, rgba(255, 255, 255, 0.06));
  background: transparent;
  color: inherit;
  text-align: left;
  font: inherit;
  transition: background 0.2s;
  box-sizing: border-box;
}

.form-row.last {
  border-bottom: none;
}

.form-row:active,
.pick-row:active {
  background: var(--pulse-surface-high);
}

.pick-row {
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.form-col {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-width: 0;
}

.form-col.wide {
  padding-right: 4px;
}

.form-label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--pulse-text-secondary);
}

.form-value {
  border: none;
  background: transparent;
  color: var(--pulse-text);
  font-size: 16px;
  line-height: 22px;
  outline: none;
  width: 100%;
  padding: 0;
  -webkit-appearance: none;
  appearance: none;
}

.form-value.placeholder,
.form-value::placeholder {
  color: var(--pulse-outline);
}

.chevron {
  flex-shrink: 0;
  color: var(--pulse-outline);
  opacity: 0.7;
}

.pick-row:active .chevron {
  color: var(--pulse-primary);
  opacity: 1;
}
</style>

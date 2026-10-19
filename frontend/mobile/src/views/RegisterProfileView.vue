<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast, showLoadingToast, closeToast } from 'vant'
import RegisterProgress from '@/components/RegisterProgress.vue'
import IconLock from '@/components/icons/IconLock.vue'
import LegalTextDialog from '@/components/LegalTextDialog.vue'
import { useRegisterStore } from '@/stores/register'
import { useUserStore } from '@/stores/user'
import { register } from '@/api/auth'
import { fetchNicknameConfig } from '@/api/nicknameConfig'
import { uploadChatFile, resolveFileUrl } from '@/api/file'
import { updateUserProfile } from '@/api/contact'
import type { SystemTextKey } from '@/api/systemText'

const router = useRouter()
const route = useRoute()
const registerStore = useRegisterStore()
const userStore = useUserStore()

const nickname = ref(registerStore.nickname)
const password = ref(registerStore.password)
const confirmPassword = ref('')
const showPassword = ref(false)
const showConfirmPassword = ref(false)
const agreeTerms = ref(false)
const loading = ref(false)
const legalDialog = ref<InstanceType<typeof LegalTextDialog>>()
const nicknameMaxLength = ref(20)

onMounted(() => {
  void fetchNicknameConfig().then((config) => {
    nicknameMaxLength.value = Number(config.userNicknameMaxLength) || 20
  }).catch(() => undefined)
  if (!registerStore.phone || !registerStore.code) {
    router.replace('/register')
  }
})

async function handleComplete() {
  if (!nickname.value.trim()) {
    showToast('请输入昵称')
    return
  }
  if (!password.value || password.value.length < 6) {
    showToast('密码至少6位')
    return
  }
  if (password.value !== confirmPassword.value) {
    showToast('两次密码不一致')
    return
  }
  if (!agreeTerms.value) {
    showToast('请同意服务条款')
    return
  }

  registerStore.setProfile(nickname.value.trim(), password.value)
  loading.value = true
  showLoadingToast({ message: '注册中...', forbidClick: true })

  try {
    const result = await register({
      phone: registerStore.phone,
      code: registerStore.code,
      nickname: nickname.value.trim(),
      password: password.value,
    })
    // 先落登录态，才能上传头像（上传接口需鉴权）
    // 注册接口未设置头像时可能省略字段或返回 null；显式传空值，
    // 防止新增账号沿用切换前账号的头像。
    userStore.setUserInfo({
      ...result,
      avatar: result.avatar || '',
    })

    const avatarFile = registerStore.avatarFile
    if (avatarFile) {
      try {
        showLoadingToast({ message: '上传头像...', forbidClick: true })
        const uploaded = await uploadChatFile(avatarFile)
        await updateUserProfile({ avatarUrl: uploaded.url })
        userStore.setUserInfo({ avatar: resolveFileUrl(uploaded.url) })
      } catch {
        // 注册已成功，头像失败不阻断进入；可稍后在资料页重传
        showToast('注册成功，头像上传失败可稍后重试')
      }
    }

    closeToast()
    registerStore.reset()
    showToast('注册成功')
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    const returnTo =
      typeof route.query.returnTo === 'string' &&
      route.query.returnTo.startsWith('/') &&
      !route.query.returnTo.startsWith('//')
        ? route.query.returnTo
        : '/app/messages'
    await router.replace(returnTo)
  } catch (e) {
    closeToast()
    showToast((e as Error).message || '注册失败')
  } finally {
    loading.value = false
  }
}

function openLegalText(key: SystemTextKey) {
  legalDialog.value?.open(key)
}
</script>

<template>
  <div class="register-page">
    <main class="register-panel">
      <header class="register-header">
        <h1 class="title">完善资料</h1>
        <p class="step-text">第 3 步，共 3 步</p>
        <RegisterProgress :percent="100" />
      </header>

      <div class="hint-card">
        <p>最后一步：请设置一个强密码来保护您的账号安全。</p>
      </div>

      <div class="form-section">
        <div class="field-group">
          <label class="field-label">昵称</label>
          <div class="field">
            <input
              v-model="nickname"
              type="text"
              :maxlength="nicknameMaxLength"
              placeholder="请输入昵称"
              class="field-input plain"
            />
          </div>
        </div>

        <div class="field-group">
          <label class="field-label">密码</label>
          <div class="field">
            <span class="field-icon"><IconLock /></span>
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="••••••••"
              class="field-input"
            />
            <button type="button" class="password-toggle" @click="showPassword = !showPassword"><span class="material-symbols-outlined">{{ showPassword ? 'visibility_off' : 'visibility' }}</span></button>
          </div>
        </div>

        <div class="field-group">
          <label class="field-label">确认密码</label>
          <div class="field">
            <span class="field-icon"><IconLock /></span>
            <input
              v-model="confirmPassword"
              :type="showConfirmPassword ? 'text' : 'password'"
              placeholder="••••••••"
              class="field-input"
            />
            <button type="button" class="password-toggle" @click="showConfirmPassword = !showConfirmPassword"><span class="material-symbols-outlined">{{ showConfirmPassword ? 'visibility_off' : 'visibility' }}</span></button>
          </div>
        </div>

        <label class="terms-row">
          <input v-model="agreeTerms" type="checkbox" class="terms-check" />
          <span>
            我同意
            <a href="javascript:void(0)" @click.prevent="openLegalText('service_terms')">服务条款</a>
            和
            <a href="javascript:void(0)" @click.prevent="openLegalText('privacy_policy')">隐私政策</a>。
          </span>
        </label>

        <button type="button" class="primary-btn" :disabled="loading" @click="handleComplete">
          创建账号
        </button>
      </div>
    </main>
    <LegalTextDialog ref="legalDialog" />
  </div>
</template>

<style scoped>
.register-page {
  min-height: 100vh;
  background: var(--pulse-page-bg, var(--pulse-bg));
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.register-panel {
  width: 100%;
  max-width: 480px;
  background: rgba(28, 28, 30, 0.7);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 0.5px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--pulse-radius);
  padding: 32px 24px;
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.35);
}

.register-header {
  text-align: center;
  margin-bottom: 24px;
}

.title {
  margin: 0 0 4px;
  font-size: 34px;
  font-weight: 700;
  line-height: 41px;
  letter-spacing: -0.02em;
  color: var(--pulse-text);
}

.step-text {
  margin: 0 0 24px;
  font-size: 15px;
  color: var(--pulse-text-secondary);
}

.hint-card {
  background: var(--pulse-surface-low);
  border: 1px solid rgba(65, 71, 85, 0.3);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 24px;
}

.hint-card p {
  margin: 0;
  font-size: 15px;
  line-height: 20px;
  color: var(--pulse-text-secondary);
  text-align: center;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--pulse-text-secondary);
  padding-left: 4px;
}

.field {
  position: relative;
}

.field-icon {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  color: var(--pulse-outline);
  display: flex;
}

.field-icon :deep(svg) {
  width: 20px;
  height: 20px;
}

.field-input {
  width: 100%;
  height: 48px;
  padding: 0 16px 0 48px;
  background: var(--pulse-surface-low);
  border: none;
  border-radius: 8px;
  color: var(--pulse-text);
  font-size: 15px;
  outline: none;
  transition: box-shadow 0.2s;
}

.field-input.plain {
  padding-left: 16px;
}

.field-input:focus {
  box-shadow: 0 0 0 2px rgba(75, 142, 255, 0.2);
}

.field-input::placeholder {
  color: var(--pulse-outline-variant);
}

.terms-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 4px 0;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--pulse-text-secondary);
  cursor: pointer;
}

.terms-check {
  width: 16px;
  height: 16px;
  margin-top: 2px;
  flex-shrink: 0;
  accent-color: var(--pulse-primary-container);
  border-radius: 4px;
}

.terms-row a {
  color: var(--pulse-primary);
}

.primary-btn {
  width: 100%;
  height: 48px;
  margin-top: 8px;
  border: none;
  border-radius: 8px;
  background: var(--pulse-primary-container);
  color: var(--pulse-on-primary-container);
  font-size: 20px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(75, 142, 255, 0.2);
  transition: transform 0.15s, opacity 0.15s;
}

.primary-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.primary-btn:disabled {
  opacity: 0.7;
}
.password-toggle { position:absolute; right:6px; top:50%; transform:translateY(-50%); width:38px; height:38px; border:0; background:transparent; color:var(--pulse-outline); }
.password-toggle .material-symbols-outlined { font-size:21px; }
.field:has(.password-toggle) .field-input { padding-right:50px; }
</style>

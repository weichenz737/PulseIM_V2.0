<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from '@/utils/elementFeedback'
import type { FormInstance, FormRules } from 'element-plus'
import { useAdminStore } from '@/stores/admin'

const REMEMBER_KEY = 'pulse_admin_remember_login'
const DEFAULT_USERNAME = 'admin'

const router = useRouter()
const route = useRoute()
const adminStore = useAdminStore()

const formRef = ref<FormInstance>()
const loading = ref(false)
const remember = ref(true)

const form = reactive({
  username: '',
  password: '',
})

const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

function loadRemembered() {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY)
    if (raw) {
      const data = JSON.parse(raw) as { username?: string; remember?: boolean }
      form.username = data.username || DEFAULT_USERNAME
      form.password = ''
      remember.value = data.remember !== false
      // Keep only the username in app storage; the browser handles passwords.
      localStorage.setItem(
        REMEMBER_KEY,
        JSON.stringify({ username: form.username, remember: remember.value }),
      )
      return
    }
  } catch {
    localStorage.removeItem(REMEMBER_KEY)
  }
  form.username = DEFAULT_USERNAME
  form.password = ''
  remember.value = true
}

async function persistRemembered() {
  if (remember.value) {
    localStorage.setItem(
      REMEMBER_KEY,
      JSON.stringify({
        username: form.username.trim(),
        remember: true,
      }),
    )

    // Ask the browser's password manager to remember the credential without
    // copying the password into localStorage or the public JavaScript bundle.
    try {
      const credentialApi = navigator.credentials as unknown as {
        store?: (credential: Credential) => Promise<Credential | null>
      }
      const PasswordCredentialCtor = (
        window as typeof window & {
          PasswordCredential?: new (init: { id: string; password: string; name?: string }) => Credential
        }
      ).PasswordCredential
      if (credentialApi?.store && PasswordCredentialCtor) {
        await credentialApi.store(
          new PasswordCredentialCtor({
            id: form.username.trim(),
            password: form.password,
            name: form.username.trim(),
          }),
        )
      }
    } catch {
      // Browser password managers may be unavailable or disabled.
    }
  } else {
    localStorage.removeItem(REMEMBER_KEY)
  }
}

onMounted(loadRemembered)

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    await adminStore.login({
      username: form.username.trim(),
      password: form.password,
    })
    await persistRemembered()
    ElMessage.success('登录成功')
    const redirect = (route.query.redirect as string) || '/dashboard'
    router.replace(redirect)
  } catch {
    ElMessage.error('登录失败，请检查账号密码')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-brand">
        <span class="logo">P</span>
        <h1>Pulse 管理后台</h1>
        <p>团队即时通讯管理平台</p>
      </div>

      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="handleSubmit">
        <el-form-item label="用户名" prop="username">
          <el-input
            v-model="form.username"
            placeholder="请输入管理员用户名"
            size="large"
            autocomplete="username"
          />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            placeholder="请输入密码"
            size="large"
            autocomplete="current-password"
            @keyup.enter="handleSubmit"
          />
        </el-form-item>
        <div class="remember-row">
          <el-checkbox v-model="remember">记住账号密码（浏览器保存）</el-checkbox>
        </div>
        <el-form-item>
          <el-button type="primary" size="large" class="submit-btn" :loading="loading" @click="handleSubmit">
            登录
          </el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0f0f10 0%, #1c1c1e 100%);
  padding: 24px;
}

.login-card {
  width: 100%;
  max-width: 420px;
  background: #fff;
  border-radius: 16px;
  padding: 40px 32px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.login-brand {
  text-align: center;
  margin-bottom: 32px;
}

.logo {
  display: inline-flex;
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: #3b82f6;
  color: #fff;
  font-size: 24px;
  font-weight: 700;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}

.login-brand h1 {
  margin: 0 0 8px;
  font-size: 22px;
  color: #303133;
}

.login-brand p {
  margin: 0;
  font-size: 14px;
  color: #909399;
}

.remember-row {
  margin: -8px 0 16px;
}

.submit-btn {
  width: 100%;
}
</style>

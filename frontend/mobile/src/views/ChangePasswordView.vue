<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { showConfirmDialog, showToast } from 'vant'
import { useRouter } from 'vue-router'
import { changeAccountPassword, fetchAccountSecurity, sendSmsCode } from '@/api/auth'
import { useUserStore } from '@/stores/user'
import { smartBack } from '@/utils/navBack'

const router = useRouter()
const userStore = useUserStore()
const phone = ref('')
const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const showOldPassword = ref(false)
const showNewPassword = ref(false)
const showConfirmPassword = ref(false)
const code = ref('')
const countdown = ref(0)
const submitting = ref(false)
let timer: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  try {
    phone.value = (await fetchAccountSecurity()).phone || ''
  } catch (error) {
    showToast(error instanceof Error ? error.message : '获取绑定手机号失败')
  }
})
onBeforeUnmount(() => timer && clearInterval(timer))

async function sendCode() {
  if (!/^1\d{10}$/.test(phone.value)) return showToast('未获取到绑定手机号')
  if (countdown.value > 0) return
  try {
    await sendSmsCode(phone.value, 'change_password')
    countdown.value = 60
    timer = setInterval(() => {
      countdown.value--
      if (countdown.value <= 0 && timer) {
        clearInterval(timer)
        timer = null
      }
    }, 1000)
    showToast('验证码已发送至绑定手机号')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '验证码发送失败')
  }
}

async function submit() {
  if (!oldPassword.value) return showToast('请输入当前密码')
  if (newPassword.value.length < 6 || newPassword.value.length > 32) return showToast('新密码长度需为 6-32 位')
  if (newPassword.value !== confirmPassword.value) return showToast('两次输入的新密码不一致')
  if (oldPassword.value === newPassword.value) return showToast('新密码不能与当前密码相同')
  if (!code.value.trim()) return showToast('请输入手机验证码')
  try {
    await showConfirmDialog({
      title: '确认修改登录密码',
      message: '修改成功后需要使用新密码重新登录。',
      confirmButtonText: '确认修改',
    })
  } catch {
    return
  }
  submitting.value = true
  try {
    await changeAccountPassword({ oldPassword: oldPassword.value, newPassword: newPassword.value, code: code.value.trim() })
    userStore.logout()
    showToast('密码修改成功，请重新登录')
    await router.replace('/login')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '密码修改失败')
  } finally {
    submitting.value = false
  }
}

async function forgotPassword() {
  try {
    await showConfirmDialog({ title: '忘记密码', message: '将退出当前账号，通过手机验证码重置密码。', confirmButtonText: '继续' })
  } catch {
    return
  }
  const currentPhone = phone.value
  userStore.logout()
  await router.replace({ path: '/forgot-password', query: currentPhone ? { phone: currentPhone } : undefined })
}
</script>

<template>
  <div class="page change-password-page">
    <header class="header"><button type="button" class="icon-btn" aria-label="返回" @click="smartBack(router)"><span class="material-symbols-outlined">arrow_back_ios</span></button><h1>修改密码</h1><span class="header-space" /></header>
    <main class="content">
      <label class="field"><span>当前密码</span><div class="password-wrap"><input v-model="oldPassword" :type="showOldPassword ? 'text' : 'password'" autocomplete="current-password" placeholder="请输入当前密码"><button type="button" @click.prevent="showOldPassword = !showOldPassword"><span class="material-symbols-outlined">{{ showOldPassword ? 'visibility_off' : 'visibility' }}</span></button></div></label>
      <label class="field"><span>新密码</span><div class="password-wrap"><input v-model="newPassword" :type="showNewPassword ? 'text' : 'password'" autocomplete="new-password" placeholder="请输入 6-32 位新密码"><button type="button" @click.prevent="showNewPassword = !showNewPassword"><span class="material-symbols-outlined">{{ showNewPassword ? 'visibility_off' : 'visibility' }}</span></button></div></label>
      <label class="field"><span>确认新密码</span><div class="password-wrap"><input v-model="confirmPassword" :type="showConfirmPassword ? 'text' : 'password'" autocomplete="new-password" placeholder="请再次输入新密码"><button type="button" @click.prevent="showConfirmPassword = !showConfirmPassword"><span class="material-symbols-outlined">{{ showConfirmPassword ? 'visibility_off' : 'visibility' }}</span></button></div></label>
      <label class="field"><span>绑定手机号验证码</span><div class="code-row"><input v-model="code" inputmode="numeric" maxlength="6" placeholder="请输入验证码"><button type="button" :disabled="countdown > 0" @click="sendCode">{{ countdown > 0 ? `${countdown}s` : '获取验证码' }}</button></div></label>
      <button type="button" class="primary" :disabled="submitting" @click="submit">{{ submitting ? '提交中...' : '确认修改' }}</button>
      <button type="button" class="forgot" @click="forgotPassword">忘记当前密码？</button>
    </main>
  </div>
</template>

<style scoped>
.page{min-height:100%;background:var(--pulse-page-bg, var(--pulse-bg));color:var(--pulse-text)}.header{display:flex;align-items:center;height:56px;padding:var(--pulse-header-pad-top) 12px 0;background:var(--pulse-page-bg, var(--pulse-bg)) !important}.header h1{flex:1;margin:0;color:var(--pulse-primary);text-align:center;font-size:18px}.icon-btn,.header-space{width:40px;height:40px}.icon-btn{border:0;background:transparent;color:var(--pulse-primary)}.content{padding:20px 16px}.field{display:block;margin-bottom:16px;color:var(--pulse-text-secondary);font-size:13px}.field>span{display:block;margin-bottom:8px}input{box-sizing:border-box;width:100%;height:46px;padding:0 12px;border:1px solid var(--pulse-outline-variant);border-radius:6px;outline:0;background:var(--pulse-surface-high);color:var(--pulse-text);font-size:15px}input:focus{border-color:#7eafff}.code-row{display:grid;grid-template-columns:minmax(0,1fr) 108px;gap:8px}.code-row button{border:1px solid rgba(8,126,215,.35);border-radius:8px;background:rgba(8,126,215,.12);color:var(--pulse-primary);font-size:13px;font-weight:600}.code-row button:disabled,.primary:disabled{opacity:.55}.primary{width:100%;height:46px;border:0;border-radius:8px;background:var(--pulse-primary);color:#fff;font-size:15px;font-weight:600}.forgot{display:block;margin:16px auto;border:0;background:transparent;color:var(--pulse-primary);font-size:14px}
.password-wrap{position:relative}.password-wrap input{padding-right:48px}.password-wrap button{position:absolute;right:4px;top:4px;width:38px;height:38px;border:0;background:transparent;color:var(--pulse-outline)}.password-wrap .material-symbols-outlined{font-size:21px}
/* 浅色模式：页面与导航栏统一使用应用的蓝白渐变背景，保持与其他页面一致 */
:global(:root[data-theme='light'] .change-password-page) {
  background: var(--pulse-list-page-bg) !important;
}

:global(:root[data-theme='light'] .change-password-page .header) {
  background: var(--pulse-list-page-bg) !important;
  border-bottom-color: transparent !important;
}
</style>

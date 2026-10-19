<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { showConfirmDialog, showToast } from 'vant'
import { useRouter } from 'vue-router'
import { changeAccountPhone, sendSmsCode } from '@/api/auth'
import { useUserStore } from '@/stores/user'
import { smartBack } from '@/utils/navBack'

const router = useRouter()
const userStore = useUserStore()
const newPhone = ref('')
const code = ref('')
const countdown = ref(0)
const submitting = ref(false)
let timer: ReturnType<typeof setInterval> | null = null

onBeforeUnmount(() => timer && clearInterval(timer))

async function sendCode() {
  const phone = newPhone.value.trim()
  if (!/^1\d{10}$/.test(phone)) return showToast('请输入正确的手机号')
  if (countdown.value > 0) return
  try {
    await sendSmsCode(phone, 'change_phone')
    countdown.value = 60
    timer = setInterval(() => {
      countdown.value--
      if (countdown.value <= 0 && timer) {
        clearInterval(timer)
        timer = null
      }
    }, 1000)
    showToast('验证码已发送')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '验证码发送失败')
  }
}

async function submit() {
  const phone = newPhone.value.trim()
  if (!/^1\d{10}$/.test(phone)) return showToast('请输入正确的手机号')
  if (!code.value.trim()) return showToast('请输入验证码')
  try {
    await showConfirmDialog({
      title: '确认修改手机号',
      message: `确定将登录手机号修改为 ${phone} 吗？修改成功后需要重新登录。`,
      confirmButtonText: '确认修改',
    })
  } catch {
    return
  }
  submitting.value = true
  try {
    await changeAccountPhone({ newPhone: phone, code: code.value.trim() })
    userStore.logout()
    showToast('手机号修改成功，请重新登录')
    await router.replace('/login')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '手机号修改失败')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page change-phone-page">
    <header class="header">
      <button type="button" class="icon-btn" aria-label="返回" @click="smartBack(router)"><span class="material-symbols-outlined">arrow_back_ios</span></button>
      <h1>修改手机号</h1><span class="header-space" />
    </header>
    <main class="content">
      <label class="field"><span>新手机号</span><input v-model="newPhone" type="tel" inputmode="numeric" maxlength="11" placeholder="请输入新手机号"></label>
      <label class="field"><span>短信验证码</span><div class="code-row"><input v-model="code" inputmode="numeric" maxlength="6" placeholder="请输入验证码"><button type="button" :disabled="countdown > 0" @click="sendCode">{{ countdown > 0 ? `${countdown}s` : '获取验证码' }}</button></div></label>
      <button type="button" class="primary" :disabled="submitting" @click="submit">{{ submitting ? '提交中...' : '确认修改' }}</button>
    </main>
  </div>
</template>

<style scoped>
.page{min-height:100%;background:var(--pulse-page-bg, var(--pulse-bg));color:var(--pulse-text)}.header{display:flex;align-items:center;height:56px;padding:var(--pulse-header-pad-top) 12px 0;background:var(--pulse-page-bg, var(--pulse-bg)) !important}.header h1{flex:1;margin:0;color:var(--pulse-primary);text-align:center;font-size:18px}.icon-btn,.header-space{width:40px;height:40px}.icon-btn{border:0;background:transparent;color:var(--pulse-primary)}.content{padding:20px 16px}.field{display:block;margin-bottom:18px;color:var(--pulse-text-secondary);font-size:13px}.field>span{display:block;margin-bottom:8px}input{box-sizing:border-box;width:100%;height:46px;padding:0 12px;border:1px solid var(--pulse-outline-variant);border-radius:6px;outline:0;background:var(--pulse-surface-high);color:var(--pulse-text);font-size:15px}input:focus{border-color:#7eafff}.code-row{display:grid;grid-template-columns:minmax(0,1fr) 108px;gap:8px}.code-row button{border:1px solid rgba(8,126,215,.35);border-radius:8px;background:rgba(8,126,215,.12);color:var(--pulse-primary);font-size:13px;font-weight:600}.code-row button:disabled,.primary:disabled{opacity:.55}.primary{width:100%;height:46px;border:0;border-radius:8px;background:var(--pulse-primary);color:#fff;font-size:15px;font-weight:600}
/* 浅色模式：页面与导航栏统一使用应用的蓝白渐变背景，保持与其他页面一致 */
:global(:root[data-theme='light'] .change-phone-page) {
  background: var(--pulse-list-page-bg) !important;
}

:global(:root[data-theme='light'] .change-phone-page .header) {
  background: var(--pulse-list-page-bg) !important;
  border-bottom-color: transparent !important;
}
</style>

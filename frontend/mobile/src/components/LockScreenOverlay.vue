<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useLockScreenStore } from '@/stores/lockScreen'
import { useUserStore } from '@/stores/user'

const lockScreen = useLockScreenStore()
const userStore = useUserStore()
const router = useRouter()
const password = ref('')
const error = ref('')
const passwordInput = ref<HTMLInputElement | null>(null)

const hint = computed(() => lockScreen.passwordHint || '暂未设置密码提示')

function focusPassword(): void {
  void nextTick(() => {
    const input = passwordInput.value
    input?.focus({ preventScroll: true })
    keepPasswordVisible(input)
  })
}

function keepPasswordVisible(target: HTMLElement | null): void {
  if (!target) return
  window.setTimeout(() => {
    target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
  }, 180)
}

function onPasswordFocus(event: FocusEvent): void {
  keepPasswordVisible(event.target instanceof HTMLElement ? event.target : null)
}

function logout(): void {
  userStore.logout()
  password.value = ''
  void router.replace({ name: 'Login' })
}

async function unlock(): Promise<void> {
  if (!password.value || lockScreen.isLocked === false) return
  error.value = ''
  const ok = await lockScreen.unlock(password.value)
  if (ok) return
  password.value = ''
  error.value = '密码错误，请重试'
  focusPassword()
}

onMounted(() => {
  document.documentElement.classList.add('lock-screen-open')
  focusPassword()
})

onBeforeUnmount(() => {
  document.documentElement.classList.remove('lock-screen-open')
})
</script>

<template>
  <div class="lock-screen-overlay" role="dialog" aria-modal="true" aria-labelledby="lock-screen-title">
    <section class="lock-screen-card">
      <div class="lock-screen-icon" aria-hidden="true">
        <span class="material-symbols-outlined">lock</span>
      </div>
      <h1 id="lock-screen-title">Pulse 已锁定</h1>
      <p class="lock-screen-account">{{ userStore.nickname || '当前账号' }}</p>
      <div class="lock-screen-hint">
        <span class="material-symbols-outlined">lightbulb</span>
        <span>密码提示：{{ hint }}</span>
      </div>
      <form class="lock-screen-form" @submit.prevent="unlock">
        <input
          ref="passwordInput"
          v-model="password"
          type="password"
          autocomplete="current-password"
          placeholder="请输入锁屏密码"
          aria-label="锁屏密码"
          @focus="onPasswordFocus"
        />
        <button type="submit" :disabled="!password">解锁</button>
      </form>
      <p v-if="error" class="lock-screen-error">{{ error }}</p>
      <button type="button" class="lock-screen-logout" @click="logout">退出登录</button>
    </section>
  </div>
</template>

<style scoped>
.lock-screen-overlay {
  position: fixed;
  z-index: 10000;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 100%;
  box-sizing: border-box;
  padding: 24px;
  overflow: auto;
  background: color-mix(in srgb, var(--pulse-bg, #101216) 94%, #000 6%);
  color: var(--pulse-text, #fff);
}

:global(:root.pulse-keyboard-open) .lock-screen-overlay,
:global(:root.native-keyboard-open) .lock-screen-overlay {
  top: 0;
  right: 0;
  bottom: auto;
  height: var(--pulse-viewport-height, 100%);
  min-height: var(--pulse-viewport-height, 100%);
  padding-bottom: 24px;
}

.lock-screen-card {
  width: min(100%, 360px);
  padding: 30px 24px 26px;
  border: 1px solid var(--pulse-border, rgba(255, 255, 255, .12));
  border-radius: 24px;
  background: var(--pulse-surface-container, #1d2026);
  box-shadow: 0 20px 60px rgba(0, 0, 0, .28);
  text-align: center;
}

.lock-screen-icon {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  margin: 0 auto 18px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--pulse-primary, #8ab4ff) 18%, transparent);
  color: var(--pulse-primary, #8ab4ff);
}

.lock-screen-icon .material-symbols-outlined { font-size: 30px; }
.lock-screen-card h1 { margin: 0; font-size: 22px; }
.lock-screen-account { margin: 8px 0 20px; color: var(--pulse-text-secondary, #aeb5c2); font-size: 14px; }
.lock-screen-hint { display: flex; align-items: flex-start; gap: 7px; margin-bottom: 16px; padding: 11px 12px; border-radius: 12px; background: var(--pulse-surface-high, rgba(255,255,255,.06)); color: var(--pulse-text-secondary, #aeb5c2); font-size: 13px; line-height: 1.45; text-align: left; }
.lock-screen-hint .material-symbols-outlined { flex: 0 0 auto; color: var(--pulse-primary, #8ab4ff); font-size: 18px; }
.lock-screen-form { display: flex; gap: 8px; }
.lock-screen-form input { min-width: 0; flex: 1; height: 44px; padding: 0 13px; border: 1px solid var(--pulse-border, rgba(255,255,255,.14)); border-radius: 12px; outline: none; background: var(--pulse-surface-highest, rgba(255,255,255,.08)); color: inherit; font: inherit; }
.lock-screen-form input:focus { border-color: var(--pulse-primary, #8ab4ff); box-shadow: 0 0 0 3px color-mix(in srgb, var(--pulse-primary, #8ab4ff) 18%, transparent); }
.lock-screen-form button { min-width: 68px; border: 0; border-radius: 12px; background: var(--pulse-primary, #8ab4ff); color: var(--pulse-on-primary, #101216); font: inherit; font-weight: 700; }
.lock-screen-form button:disabled { opacity: .45; }
.lock-screen-error { margin: 12px 0 0; color: var(--pulse-error, #ff8a80); font-size: 13px; }
.lock-screen-logout { margin-top: 18px; border: 0; background: transparent; color: var(--pulse-text-secondary, #aeb5c2); font: inherit; font-size: 13px; cursor: pointer; }
</style>

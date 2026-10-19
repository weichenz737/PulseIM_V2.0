<script setup lang="ts">
defineOptions({ name: 'AccountSecurityView' })
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { showConfirmDialog, showToast } from 'vant'
import { useRoute, useRouter } from 'vue-router'
import {
  deleteAccount,
  fetchAccountSecurity,
  fetchDeviceSessions,
  refreshSecurityCode,
  revokeDevice,
  revokeOtherDevices,
  setSecurityCodeEnabled,
  type DeviceSession,
} from '@/api/auth'
import { fetchWallet } from '@/api/wallet'
import { fetchSystemText } from '@/api/systemText'
import { useUserStore } from '@/stores/user'
import { useLockScreenStore } from '@/stores/lockScreen'
import { isNativeApp } from '@/native'
import { smartBack } from '@/utils/navBack'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const lockScreen = useLockScreenStore()
const phone = ref('')
const loading = ref(false)
const securityCodeEnabled = ref(false)
const securityCode = ref('')
const securityCodeVisible = ref(false)
const securityCodeBusy = ref(false)
const devices = ref<DeviceSession[]>([])
const currentDeviceId = ref('')
const devicesLoading = ref(false)
const accountError = ref('')
const deviceError = ref('')
const deletionVisible = ref(false)
const deletionLoading = ref(false)
const deletionBusy = ref(false)
const deletionAgreed = ref(false)
const deletionAgreement = ref({ title: '账号注销协议', content: '' })
const deletionBalance = ref(0)
const deletionError = ref('')
const lockPasswordVisible = ref(false)
const lockPassword = ref('')
const lockPasswordConfirm = ref('')
const lockPasswordHint = ref('')
const lockPasswordBusy = ref(false)
const lockPasswordError = ref('')
const lockPasswordContent = ref<HTMLElement | null>(null)

const lockPasswordConfigured = computed(() => lockScreen.hasPassword)

const maskedPhone = computed(() => {
  if (!/^1\d{10}$/.test(phone.value)) return phone.value || '未绑定'
  return `${phone.value.slice(0, 3)}****${phone.value.slice(-4)}`
})

type DisplayDevice = DeviceSession & {
  deviceKey: string
  deviceIds: string[]
}

function deviceLoginTimeValue(value?: string) {
  const time = value ? Date.parse(value) : NaN
  return Number.isNaN(time) ? 0 : time
}

const displayDevices = computed<DisplayDevice[]>(() => {
  const sorted = [...devices.value].sort((a, b) => deviceLoginTimeValue(b.loginAt) - deviceLoginTimeValue(a.loginAt))
  const groups = new Map<string, DisplayDevice>()
  const currentIds = new Set(
    devices.value
      .filter((device) => device.current || device.deviceId === currentDeviceId.value)
      .map((device) => device.deviceId),
  )

  for (const device of sorted) {
    const platform = String(device.platform || '').toLowerCase()
    // Older client builds may create a new ID after an update/reinstall. Keep
    // the newest row for the same client platform and label, while retaining
    // all underlying IDs so revoking the displayed device revokes its legacy
    // records too.
    const sameClientType = ['android', 'ios', 'windows', 'windows_web', 'web'].includes(platform)
    const deviceKey = sameClientType
      ? `${platform}|${deviceLabel(device).trim().toLowerCase()}`
      : `${platform}|${device.deviceId}`
    const existing = groups.get(deviceKey)
    if (existing) {
      existing.deviceIds.push(device.deviceId)
      existing.current = Boolean(existing.current || currentIds.has(device.deviceId))
      existing.trusted = Boolean(existing.trusted || device.trusted)
      continue
    }
    groups.set(deviceKey, {
      ...device,
      deviceKey,
      deviceIds: [device.deviceId],
      current: currentIds.has(device.deviceId),
    })
  }
  return [...groups.values()]
})

const otherDeviceCount = computed(() => displayDevices.value.filter((device) => !device.current).length)
const securityStatus = computed(() => {
  if (loading.value) return '检查中'
  return securityCodeEnabled.value ? '保护中' : '建议开启'
})
const securityCodeDisplay = computed(() => {
  if (!securityCode.value) return '未生成'
  return securityCodeVisible.value ? securityCode.value : '••••••'
})

function maybeOpenLockPasswordSettings() {
  if (isNativeApp && route.query.lockScreen === '1') {
    void nextTick(() => {
      if (!lockPasswordConfigured.value) openLockPasswordSettings()
    })
  }
}

onMounted(() => {
  void loadAccount()
  void loadDevices()
  maybeOpenLockPasswordSettings()
})

watch(() => route.query.lockScreen, () => {
  maybeOpenLockPasswordSettings()
})

function openLockPasswordSettings() {
  lockPassword.value = ''
  lockPasswordConfirm.value = ''
  lockPasswordHint.value = lockScreen.passwordHint || ''
  lockPasswordError.value = ''
  lockPasswordVisible.value = true
  void nextTick(() => {
    const input = lockPasswordContent.value?.querySelector<HTMLInputElement>('input')
    input?.focus({ preventScroll: true })
    keepLockPasswordFieldVisible(input ?? null)
  })
}

function keepLockPasswordFieldVisible(target: HTMLElement | null) {
  if (!target) return
  window.setTimeout(() => {
    target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
  }, 180)
}

function keepLockPasswordFieldVisibleFromEvent(event: FocusEvent) {
  keepLockPasswordFieldVisible(event.target instanceof HTMLElement ? event.target : null)
}

async function saveLockPassword() {
  if (lockPasswordBusy.value) return
  const password = lockPassword.value.trim()
  const confirm = lockPasswordConfirm.value.trim()
  if (password.length < 4 || password.length > 64) {
    lockPasswordError.value = '锁屏密码需为 4-64 位'
    return
  }
  if (password !== confirm) {
    lockPasswordError.value = '两次输入的密码不一致'
    return
  }
  lockPasswordBusy.value = true
  lockPasswordError.value = ''
  try {
    await lockScreen.setPassword(password, lockPasswordHint.value)
    lockPasswordVisible.value = false
    showToast('锁屏密码已设置')
  } catch (error) {
    lockPasswordError.value = error instanceof Error ? error.message : '锁屏密码设置失败'
  } finally {
    lockPasswordBusy.value = false
  }
}

async function disableLockPassword() {
  if (!lockPasswordConfigured.value || lockPasswordBusy.value) return
  try {
    await showConfirmDialog({
      title: '关闭锁屏密码',
      message: '关闭后，当前设备将不再需要锁屏密码。确定继续吗？',
      confirmButtonText: '关闭密码',
      confirmButtonColor: '#ee0a24',
      cancelButtonText: '暂不关闭',
    })
  } catch {
    return
  }
  lockPasswordBusy.value = true
  lockPasswordError.value = ''
  try {
    lockScreen.clearPassword()
    lockPasswordVisible.value = false
    showToast('锁屏密码已关闭')
  } catch (error) {
    lockPasswordError.value = error instanceof Error ? error.message : '锁屏密码关闭失败'
  } finally {
    lockPasswordBusy.value = false
  }
}

async function loadAccount() {
  loading.value = true
  accountError.value = ''
  try {
    const data = await fetchAccountSecurity()
    phone.value = data.phone || ''
    securityCodeEnabled.value = data.securityCodeEnabled
    securityCode.value = data.securityCode || ''
  } catch (error) {
    accountError.value = error instanceof Error ? error.message : '获取账号信息失败'
  } finally {
    loading.value = false
  }
}

async function loadDevices() {
  devicesLoading.value = true
  deviceError.value = ''
  try {
    const data = await fetchDeviceSessions()
    devices.value = data.list || []
    currentDeviceId.value = data.currentDeviceId || ''
  } catch (error) {
    deviceError.value = error instanceof Error ? error.message : '获取设备列表失败'
  } finally {
    devicesLoading.value = false
  }
}

async function refreshSecurity() {
  await Promise.all([loadAccount(), loadDevices()])
}

function deviceLoginTime(value?: string) {
  if (!value) return '登录时间未知'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '登录时间未知'
  return `登录时间 · ${date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}`
}

function deviceLabel(device: DeviceSession) {
  const platform = String(device.platform || '').toLowerCase()
  if (platform === 'windows_web') return 'Windows 网页端'
  if (platform === 'windows') return 'Windows 客户端'
  return device.name || '未知设备'
}

async function handleDevice(device: DeviceSession) {
  if (device.current) {
    showToast('当前设备请使用退出登录')
    return
  }
  try {
    await showConfirmDialog({
      title: '退出设备',
      message: `确定退出“${deviceLabel(device)}”吗？`,
      confirmButtonText: '退出',
      confirmButtonColor: '#ee0a24',
    })
  } catch {
    return
  }
  try {
    const targetIds = 'deviceIds' in device && Array.isArray(device.deviceIds)
      ? device.deviceIds
      : [device.deviceId]
    await Promise.all(targetIds.map((deviceId) => revokeDevice(deviceId)))
    devices.value = devices.value.filter((item) => !targetIds.includes(item.deviceId))
    showToast('设备已退出登录')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '退出设备失败')
  }
}

async function handleLogoutOtherDevices() {
  try {
    await showConfirmDialog({
      title: '退出其他设备',
      message: '除当前设备外，其他设备都需要重新登录。',
      confirmButtonText: '退出',
      confirmButtonColor: '#ee0a24',
    })
  } catch {
    return
  }
  try {
    const result = await revokeOtherDevices()
    devices.value = devices.value.filter((item) => item.current)
    showToast(result.count ? `已退出 ${result.count} 台设备` : '没有其他登录设备')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '退出其他设备失败')
  }
}

async function toggleSecurityCode() {
  const nextEnabled = securityCodeEnabled.value
  securityCodeBusy.value = true
  try {
    const data = await setSecurityCodeEnabled(nextEnabled)
    securityCode.value = data.securityCode || ''
    securityCodeVisible.value = false
    showToast(nextEnabled ? '安全码已开启' : '安全码已关闭')
  } catch (e) {
    securityCodeEnabled.value = !nextEnabled
    showToast(e instanceof Error ? e.message : '设置失败')
  } finally {
    securityCodeBusy.value = false
  }
}

async function updateSecurityCode() {
  securityCodeBusy.value = true
  try {
    const data = await refreshSecurityCode()
    securityCodeEnabled.value = true
    securityCode.value = data.securityCode || ''
    securityCodeVisible.value = true
    showToast('安全码已更新，其他设备需使用新安全码')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '更新失败')
  } finally {
    securityCodeBusy.value = false
  }
}

async function copySecurityCode() {
  if (!securityCode.value) return
  try {
    await navigator.clipboard.writeText(securityCode.value)
    showToast('安全码已复制')
  } catch {
    showToast('当前环境不支持复制，请手动记录')
  }
}

function yuan(cents: number) {
  return `¥${(Number(cents || 0) / 100).toFixed(2)}`
}

async function openAccountDeletion() {
  if (deletionLoading.value || deletionBusy.value) return
  deletionLoading.value = true
  deletionError.value = ''
  deletionAgreed.value = false
  try {
    const [wallet, agreement] = await Promise.all([
      fetchWallet(),
      fetchSystemText('account_deletion_agreement'),
    ])
    deletionBalance.value = Number(wallet?.balance || 0)
    deletionAgreement.value = {
      title: agreement.title || '账号注销协议',
      content: agreement.content || '暂未配置账号注销协议，请联系管理员。',
    }
    deletionVisible.value = true
  } catch (error) {
    showToast(error instanceof Error ? error.message : '注销信息加载失败')
  } finally {
    deletionLoading.value = false
  }
}

async function continueAccountDeletion() {
  if (!deletionAgreed.value) {
    showToast('请先阅读并同意注销协议')
    return
  }
  const balanceHint = deletionBalance.value > 0
    ? `钱包当前余额为 ${yuan(deletionBalance.value)}，注销后余额将无法找回。仍要继续吗？`
    : '注销后账号资料、好友关系、聊天数据等将被删除，且无法恢复。确定继续吗？'
  deletionVisible.value = false
  try {
    await showConfirmDialog({
      title: '再次确认注销账号',
      message: balanceHint,
      confirmButtonText: '确认注销',
      confirmButtonColor: '#ee0a24',
      cancelButtonText: '暂不注销',
    })
  } catch {
    return
  }
  deletionBusy.value = true
  try {
    await deleteAccount('account_deletion_agreement')
    userStore.clearLocalSession()
    await router.replace('/login')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '注销账号失败')
  } finally {
    deletionBusy.value = false
  }
}
</script>

<template>
  <div class="page account-security-page">
    <header class="header">
      <button type="button" class="icon-btn" aria-label="返回" @click="smartBack(router)">
        <span class="material-symbols-outlined">arrow_back_ios</span>
      </button>
      <h1>账号与安全</h1>
      <button type="button" class="icon-btn" aria-label="刷新" :disabled="loading || devicesLoading" @click="refreshSecurity">
        <span class="material-symbols-outlined" :class="{ spinning: loading || devicesLoading }">refresh</span>
      </button>
    </header>
    <main class="content">
      <section class="security-hero">
        <span class="material-symbols-outlined hero-icon">verified_user</span>
        <div class="hero-copy">
          <strong>账号保护</strong>
          <p>{{ securityCodeEnabled ? '安全码已开启，陌生设备登录会受到保护' : '开启安全码，进一步保护账号登录安全' }}</p>
        </div>
        <span class="security-badge" :class="{ enabled: securityCodeEnabled }">{{ securityStatus }}</span>
      </section>
      <section class="phone-card">
        <span class="material-symbols-outlined">smartphone</span>
        <div>
          <div class="label">当前绑定手机号</div>
          <div class="phone">{{ loading ? '加载中...' : maskedPhone }}</div>
        </div>
      </section>
      <div v-if="accountError" class="inline-error">
        <span>{{ accountError }}</span>
        <button type="button" @click="loadAccount">重试</button>
      </div>
      <section class="menu">
        <button type="button" aria-label="修改手机号" @click="router.push('/settings/security/phone')">
          <span class="material-symbols-outlined">phone_iphone</span>
          <span>修改手机号</span>
          <span class="material-symbols-outlined arrow">chevron_right</span>
        </button>
        <button type="button" aria-label="修改密码" @click="router.push('/settings/security/password')">
          <span class="material-symbols-outlined">password</span>
          <span>修改密码</span>
          <span class="material-symbols-outlined arrow">chevron_right</span>
        </button>
      </section>
      <section class="devices-card">
        <div class="devices-heading">
          <div><strong>已登录设备 <span class="heading-count">{{ displayDevices.length }}</span></strong><p>{{ otherDeviceCount ? `还有 ${otherDeviceCount} 台设备登录` : '当前仅此设备登录' }}</p></div>
          <button type="button" class="refresh-devices" :disabled="devicesLoading" @click="loadDevices">
            <span class="material-symbols-outlined" :class="{ spinning: devicesLoading }">refresh</span>
            刷新
          </button>
        </div>
        <div v-if="devicesLoading && !devices.length" class="devices-empty">正在同步设备列表…</div>
        <div v-else-if="deviceError" class="devices-empty device-error">
          <span>{{ deviceError }}</span>
          <button type="button" @click="loadDevices">重新加载</button>
        </div>
        <div v-else-if="!displayDevices.length" class="devices-empty">暂无可管理的登录设备，请重新登录后再试。</div>
        <div v-else class="device-list">
          <div v-for="device in displayDevices" :key="device.deviceKey" class="device-item">
            <div class="device-info">
              <span class="device-icon material-symbols-outlined">{{ ['windows', 'windows_web'].includes(String(device.platform || '').toLowerCase()) ? (device.platform === 'windows_web' ? 'language' : 'grid_view') : device.platform === 'web' ? 'language' : 'smartphone' }}</span>
              <div class="device-copy"><strong>{{ deviceLabel(device) }}<em v-if="device.current">当前设备</em></strong><small>{{ deviceLoginTime(device.loginAt) }}<span v-if="device.trusted"> · 已验证</span></small></div>
            </div>
            <button type="button" class="device-more" :aria-label="device.current ? '当前设备' : `退出${deviceLabel(device)}`" @click="handleDevice(device)"><span class="material-symbols-outlined">more_horiz</span></button>
          </div>
        </div>
        <button v-if="displayDevices.some((device) => !device.current)" type="button" class="logout-other-devices" @click="handleLogoutOtherDevices">退出其他设备</button>
      </section>
      <section class="security-code-card">
        <div class="security-code-head">
          <div>
            <strong>账号安全码</strong>
            <p>开启后，在未验证过的其他设备登录此账号时，需要输入对应安全码。同一设备验证成功后会被记为可信设备。</p>
          </div>
          <label class="switch">
            <input v-model="securityCodeEnabled" type="checkbox" :disabled="securityCodeBusy" @change="toggleSecurityCode" />
            <span />
          </label>
        </div>
        <p v-if="!securityCodeEnabled" class="security-code-off">开启后可防止陌生设备直接登录。</p>
        <div v-else class="security-code-content">
          <div class="security-code-toolbar">
            <div class="security-code-value">{{ securityCodeDisplay }}</div>
            <button type="button" class="code-visibility" :aria-label="securityCodeVisible ? '隐藏安全码' : '显示安全码'" @click="securityCodeVisible = !securityCodeVisible">
              <span class="material-symbols-outlined">{{ securityCodeVisible ? 'visibility_off' : 'visibility' }}</span>
            </button>
          </div>
          <div class="security-code-actions">
            <button type="button" :disabled="securityCodeBusy || !securityCode" @click="copySecurityCode">复制安全码</button>
            <button type="button" :disabled="securityCodeBusy" @click="updateSecurityCode">{{ securityCodeBusy ? '更新中…' : '更新安全码' }}</button>
          </div>
          <p class="security-code-tip">更新后，其他设备需要使用新的安全码重新验证。</p>
        </div>
      </section>
      <section v-if="isNativeApp" class="lock-screen-card">
        <div class="lock-screen-card-copy">
          <strong>锁屏密码</strong>
          <p>{{ lockPasswordConfigured ? '已设置锁屏密码，点击首页锁定按钮即可锁定当前设备。退出登录不会删除设置；卸载重装后本机锁屏密码会清除，需要重新设置。' : '设置后可在首页快速锁定当前设备，解锁时需要输入密码。锁屏密码仅保存在本机。' }}</p>
        </div>
        <div class="lock-screen-actions">
          <button type="button" @click="openLockPasswordSettings">
            {{ lockPasswordConfigured ? '修改密码' : '设置密码' }}
          </button>
          <button v-if="lockPasswordConfigured" type="button" class="danger" @click="disableLockPassword">关闭密码</button>
        </div>
      </section>
      <section class="account-deletion-card">
        <div>
          <strong>注销账号</strong>
          <p>注销前会显示钱包余额，余额大于 0 也可以注销，但余额将无法找回。注销后无法恢复。</p>
        </div>
        <button type="button" :disabled="deletionLoading || deletionBusy" @click="openAccountDeletion">
          {{ deletionLoading ? '加载中…' : deletionBusy ? '注销中…' : '注销账号' }}
        </button>
      </section>
    </main>
    <van-popup v-model:show="deletionVisible" position="bottom" round closeable teleport="body" class="account-deletion-popup">
      <header class="deletion-popup-header"><h2>{{ deletionAgreement.title }}</h2></header>
      <div class="deletion-popup-content">
        <div class="deletion-agreement-body">{{ deletionAgreement.content }}</div>
        <div v-if="deletionBalance > 0" class="deletion-balance-warning">
          钱包当前余额为 {{ yuan(deletionBalance) }}，注销后余额将无法找回，请确认是否继续注销。
        </div>
        <div v-if="deletionError" class="deletion-balance-warning">{{ deletionError }}</div>
        <label class="deletion-agree">
          <input v-model="deletionAgreed" type="checkbox" />
          <span>我已阅读并同意《{{ deletionAgreement.title }}》</span>
        </label>
        <button type="button" class="deletion-continue" @click="continueAccountDeletion">同意并继续</button>
      </div>
    </van-popup>
    <van-popup v-model:show="lockPasswordVisible" position="bottom" round closeable teleport="body" class="lock-password-popup">
      <div ref="lockPasswordContent" class="lock-password-content">
        <header>
          <h2>{{ lockPasswordConfigured ? '修改锁屏密码' : '设置锁屏密码' }}</h2>
          <p>锁屏密码仅保存在当前设备，用于保护当前登录会话。退出登录后仍保留；卸载重装软件后会清除。</p>
        </header>
        <label><span>锁屏密码</span><input v-model="lockPassword" type="password" autocomplete="new-password" maxlength="64" placeholder="请输入 4-64 位密码" @focus="keepLockPasswordFieldVisibleFromEvent" /></label>
        <label><span>确认密码</span><input v-model="lockPasswordConfirm" type="password" autocomplete="new-password" maxlength="64" placeholder="请再次输入锁屏密码" @focus="keepLockPasswordFieldVisibleFromEvent" /></label>
        <label><span>密码提示（可选）</span><input v-model="lockPasswordHint" type="text" maxlength="120" placeholder="例如：我最喜欢的颜色" @focus="keepLockPasswordFieldVisibleFromEvent" /></label>
        <p v-if="lockPasswordError" class="lock-password-error">{{ lockPasswordError }}</p>
        <button type="button" class="lock-password-submit" :disabled="lockPasswordBusy" @click="saveLockPassword">{{ lockPasswordBusy ? '保存中…' : '保存锁屏密码' }}</button>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.page { min-height: 100%; background: var(--pulse-page-bg, var(--pulse-bg)); color: var(--pulse-text); }
.header { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; height: 56px; padding: var(--pulse-header-pad-top) 12px 0; background: var(--pulse-page-bg, var(--pulse-bg)); backdrop-filter: blur(16px); }
.header h1 { flex: 1; margin: 0; color: var(--pulse-primary); text-align: center; font-size: 18px; font-weight: 600; }
.icon-btn { display: grid; place-items: center; width: 40px; height: 40px; border: 0; background: transparent; color: var(--pulse-primary); }
.icon-btn:disabled { opacity: .5; }
.spinning { animation: spin .8s linear infinite; }
.content { padding: 16px; }
.security-hero { display: flex; align-items: center; gap: 12px; padding: 16px; border: 1px solid color-mix(in srgb, var(--pulse-primary) 22%, var(--pulse-border)); border-radius: 14px; background: linear-gradient(135deg, color-mix(in srgb, var(--pulse-primary) 15%, var(--pulse-surface-container)), var(--pulse-surface-container)); }
.hero-icon { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 12px; background: color-mix(in srgb, var(--pulse-primary) 18%, transparent); color: var(--pulse-primary); font-size: 25px; }
.hero-copy { min-width: 0; flex: 1; }
.hero-copy strong { font-size: 16px; }
.hero-copy p { margin: 5px 0 0; color: var(--pulse-outline); font-size: 12px; line-height: 1.45; }
.security-badge { flex: 0 0 auto; padding: 5px 8px; border-radius: 999px; background: rgba(238, 10, 36, .1); color: #ee0a24; font-size: 11px; font-weight: 600; }
.security-badge.enabled { background: rgba(34, 160, 107, .12); color: #22a06b; }
.phone-card { display: flex; align-items: center; gap: 14px; margin-top: 12px; padding: 18px 16px; border-radius: 8px; background: var(--pulse-surface-container); }
.phone-card > .material-symbols-outlined { color: var(--pulse-primary); font-size: 28px; }
.label { color: var(--pulse-outline); font-size: 13px; }
.phone { margin-top: 4px; font-size: 18px; }
.inline-error { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 10px; padding: 10px 12px; border-radius: 8px; background: rgba(238, 10, 36, .08); color: #ee0a24; font-size: 12px; }
.inline-error button, .device-error button { padding: 0; border: 0; background: transparent; color: inherit; font-weight: 600; }
.menu { margin-top: 16px; overflow: hidden; border-radius: 8px; background: var(--pulse-surface-container); }
.menu button { display: grid; grid-template-columns: 28px 1fr 24px; align-items: center; width: 100%; height: 58px; padding: 0 14px; border: 0; border-bottom: 1px solid var(--pulse-divider); background: transparent; color: var(--pulse-text); text-align: left; font-size: 15px; }
.menu button:last-child { border-bottom: 0; }
.menu button > .material-symbols-outlined:first-child { color: var(--pulse-primary); }
.arrow { color: #777b87; }
.devices-card { margin-top: 16px; overflow: hidden; border-radius: 8px; background: transparent; }
.devices-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 18px 16px 10px; }
.devices-heading strong { font-size: 16px; }
.heading-count { display: inline-grid; min-width: 20px; height: 20px; place-items: center; margin-left: 3px; padding: 0 5px; border-radius: 10px; background: color-mix(in srgb, var(--pulse-primary) 14%, transparent); color: var(--pulse-primary); font-size: 11px; font-weight: 600; vertical-align: 2px; }
.devices-heading p { margin: 7px 0 0; color: var(--pulse-outline); font-size: 13px; }
.refresh-devices { display: inline-flex; align-items: center; gap: 3px; padding: 0; border: 0; background: transparent; color: var(--pulse-primary); font-size: 13px; }
.refresh-devices .material-symbols-outlined { font-size: 16px; }
.refresh-devices:disabled { opacity: .5; }
.device-list { padding: 0 16px; }
.device-item { display: flex; align-items: center; gap: 8px; min-height: 64px; border-top: 1px solid var(--pulse-divider); border-radius: 12px; background: transparent; color: var(--pulse-text); }
.device-info { display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1; padding: 10px 12px; border-radius: 10px; }
.device-icon { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: transparent; color: var(--pulse-primary); font-size: 20px; }
.device-copy { display: grid; min-width: 0; gap: 4px; }
.device-copy strong { overflow: hidden; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.device-copy strong em { margin-left: 6px; padding: 3px 6px; border-radius: 5px; background: #e6f8ef; color: #22a06b; font-size: 11px; font-style: normal; font-weight: 500; }
.device-copy small { color: var(--pulse-outline); font-size: 12px; }
.device-more { display: grid; place-items: center; width: 34px; height: 34px; border: 0; background: transparent; color: var(--pulse-outline); }
.device-more .material-symbols-outlined { font-size: 20px; }
.devices-empty { padding: 18px 16px; color: var(--pulse-outline); font-size: 13px; text-align: center; }
.device-error { display: flex; align-items: center; justify-content: center; gap: 8px; color: #ee0a24; }
.logout-other-devices { width: calc(100% - 32px); margin: 4px 16px 16px; padding: 10px; border: 1px solid color-mix(in srgb, #ee0a24 28%, var(--pulse-divider)); border-radius: 7px; background: transparent; color: #ee0a24; font-size: 13px; }
.security-code-card { margin-top: 16px; padding: 18px 16px; border-radius: 8px; background: var(--pulse-surface-container); }
.security-code-head { display: flex; gap: 16px; justify-content: space-between; }
.security-code-head strong { font-size: 16px; }
.security-code-head p { margin: 8px 0 0; color: var(--pulse-outline); font-size: 13px; line-height: 1.6; }
.switch input { display: none; }
.switch span { display: block; width: 46px; height: 26px; border-radius: 13px; background: var(--pulse-outline-variant, #c8d5e3); position: relative; }
.switch span::after { content: ''; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: white; transition: .2s; }
.switch input:checked + span { background: #5b8def; }
.switch input:checked + span::after { transform: translateX(20px); }
.security-code-off, .security-code-tip { margin: 14px 0 0; color: var(--pulse-outline); font-size: 12px; line-height: 1.5; }
.security-code-toolbar { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 18px; }
.security-code-value { color: var(--pulse-primary); font-size: 30px; font-weight: 700; letter-spacing: 8px; }
.code-visibility { display: grid; width: 32px; height: 32px; place-items: center; padding: 0; border: 0; border-radius: 50%; background: color-mix(in srgb, var(--pulse-primary) 10%, transparent); color: var(--pulse-primary); }
.code-visibility .material-symbols-outlined { font-size: 18px; }
.security-code-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 14px; }
.security-code-actions button { min-height: 38px; border: 1px solid color-mix(in srgb, var(--pulse-primary) 50%, var(--pulse-divider)); border-radius: 7px; background: transparent; color: var(--pulse-primary); font-size: 13px; }
.security-code-actions button:disabled { opacity: .5; }
.lock-screen-card { display: flex; align-items: center; gap: 16px; margin-top: 16px; padding: 18px 16px; border-radius: 8px; background: var(--pulse-surface-container); }
.lock-screen-card-copy { min-width: 0; flex: 1; }
.lock-screen-card strong { font-size: 16px; }
.lock-screen-card p { margin: 8px 0 0; color: var(--pulse-outline); font-size: 13px; line-height: 1.55; }
.lock-screen-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 8px; }
.lock-screen-actions button { padding: 8px 12px; border: 1px solid color-mix(in srgb, var(--pulse-primary) 45%, var(--pulse-border)); border-radius: 8px; background: transparent; color: var(--pulse-primary); font-size: 13px; white-space: nowrap; }
.lock-screen-actions button.danger { border-color: rgba(238, 10, 36, .38); color: #ee0a24; }
.lock-password-popup { max-height: min(80vh, 720px); overflow: hidden; color: var(--pulse-text); }
.lock-password-content { max-height: calc(100dvh - 12px); padding: 24px 18px calc(24px + env(safe-area-inset-bottom, 0px) + var(--pulse-keyboard-offset, 0px)); overflow-y: auto; overscroll-behavior: contain; background: var(--pulse-surface-high); }
.lock-password-content header { padding-right: 26px; }
.lock-password-content h2 { margin: 0; font-size: 20px; }
.lock-password-content header p { margin: 8px 0 20px; color: var(--pulse-outline); font-size: 13px; line-height: 1.5; }
.lock-password-content label { display: block; margin-top: 14px; }
.lock-password-content label span { display: block; margin-bottom: 7px; color: var(--pulse-text-secondary); font-size: 13px; }
.lock-password-content input { box-sizing: border-box; width: 100%; height: 44px; padding: 0 12px; border: 1px solid var(--pulse-border); border-radius: 10px; outline: none; background: var(--pulse-surface-container); color: var(--pulse-text); font: inherit; }
.lock-password-content input:focus { border-color: var(--pulse-primary); }
.lock-password-error { margin: 12px 0 0; color: #ee0a24; font-size: 13px; }
.lock-password-submit { width: 100%; height: 44px; margin-top: 20px; border: 0; border-radius: 10px; background: var(--pulse-primary); color: var(--pulse-on-primary, #fff); font-size: 15px; font-weight: 600; }
.lock-password-submit:disabled { opacity: .55; }
.account-deletion-card { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 16px; padding: 18px 16px; border: 1px solid rgba(238, 10, 36, .18); border-radius: 8px; background: color-mix(in srgb, #ee0a24 5%, var(--pulse-surface-container)); }
.account-deletion-card > div { min-width: 0; flex: 1 1 auto; }
.account-deletion-card strong { color: #ee0a24; font-size: 16px; }
.account-deletion-card p { margin: 7px 0 0; color: var(--pulse-outline); font-size: 12px; line-height: 1.55; }
.account-deletion-card button { flex: 0 0 78px; width: 78px; min-width: 78px; box-sizing: border-box; padding: 8px 4px; border: 1px solid rgba(238, 10, 36, .38); border-radius: 7px; background: transparent; color: #ee0a24; font-size: 13px; white-space: nowrap; text-align: center; }
.account-deletion-card button:disabled { opacity: .5; }
.account-deletion-popup { height: min(80vh, 720px); background: var(--pulse-surface-low, #1c1c1e); color: var(--pulse-text); }
.deletion-popup-header { display: flex; align-items: center; justify-content: center; height: 56px; padding: 0 52px; border-bottom: 1px solid var(--pulse-divider); }
.deletion-popup-header h2 { margin: 0; font-size: 17px; }
.deletion-popup-content { height: calc(100% - 56px); padding: 18px 20px calc(20px + var(--pulse-safe-bottom, 0px)); overflow-y: auto; }
.deletion-agreement-body { min-height: 180px; padding: 14px; border-radius: 8px; background: var(--pulse-surface-container); white-space: pre-wrap; overflow-wrap: anywhere; color: var(--pulse-text-secondary, var(--pulse-outline)); font-size: 14px; line-height: 1.75; }
.deletion-balance-warning { margin-top: 14px; padding: 11px 12px; border-radius: 8px; background: rgba(238, 10, 36, .1); color: #ee0a24; font-size: 13px; line-height: 1.55; }
.deletion-agree { display: flex; align-items: flex-start; gap: 8px; margin-top: 16px; color: var(--pulse-text); font-size: 13px; line-height: 1.5; }
.deletion-agree input { margin-top: 2px; accent-color: var(--pulse-primary); }
.deletion-agree.disabled { opacity: .5; }
.deletion-continue { width: 100%; min-height: 44px; margin-top: 18px; border: 0; border-radius: 8px; background: #ee0a24; color: white; font-size: 15px; font-weight: 600; }
.deletion-continue:disabled { opacity: .5; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>

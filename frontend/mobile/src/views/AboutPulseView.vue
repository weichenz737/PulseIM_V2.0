<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { fetchLatestAppVersion, type AppVersionInfo } from '@/api/appVersion'
import { getAppInfo } from '@/native/app'
import {
  downloadAndInstall,
  getDownloadState,
  onDownloadProgress,
  type DownloadProgress,
} from '@/native/updater'
import { absoluteApiUrl } from '@/config/endpoints'
import { isNativeApp } from '@/native'
import { smartBack } from '@/utils/navBack'
import LegalTextDialog from '@/components/LegalTextDialog.vue'
import type { SystemTextKey } from '@/api/systemText'
import { downloadProgressText } from '@/utils/downloadProgress'

const router = useRouter()
const currentName = ref('Web')
const currentCode = ref(0)
const latest = ref<AppVersionInfo | null>(null)
const loading = ref(true)
const updating = ref(false)
const updateProgress = ref<DownloadProgress | null>(null)
const updateStatus = ref('')
const requestedDownloadId = ref<number | null>(null)
const updateRequested = ref(false)
let progressListener: { remove: () => Promise<void> } | null = null
const legalDialog = ref<InstanceType<typeof LegalTextDialog>>()
const hasUpdate = computed(() => !!latest.value?.enabled && latest.value.versionCode > currentCode.value)
const resumableStatuses = new Set<DownloadProgress['status']>(['pending', 'running', 'paused'])

function applyDownloadProgress(progress: DownloadProgress, restored = false) {
  const belongsToCurrentRequest = updateRequested.value
    && (requestedDownloadId.value == null || requestedDownloadId.value === progress.downloadId)
  if (restored && !resumableStatuses.has(progress.status)) return
  if (!restored && !belongsToCurrentRequest && !resumableStatuses.has(progress.status)) return
  updateProgress.value = progress
  updateStatus.value = downloadProgressText(progress)
  updating.value = progress.status === 'pending' || progress.status === 'running'
}

function openLegalText(key: SystemTextKey) {
  legalDialog.value?.open(key)
}

async function check() {
  // Web 版本随站点发布，不展示或调用 Android App 的版本更新能力。
  if (!isNativeApp) {
    loading.value = false
    latest.value = null
    return
  }
  loading.value = true
  try {
    const info = await getAppInfo()
    currentName.value = info.version || '1.0.0'
    currentCode.value = Number(info.build || 1)
    latest.value = await fetchLatestAppVersion()
  } catch {
    showToast('版本检查失败，请稍后重试')
  } finally { loading.value = false }
}

async function update() {
  const data = latest.value
  if (!data?.apkUrl) return
  updateRequested.value = true
  requestedDownloadId.value = null
  updating.value = true
  updateProgress.value = null
  updateStatus.value = '正在启动下载，请稍候…'
  const url = absoluteApiUrl(data.apkUrl)
  try {
    if (isNativeApp) {
      const result = await downloadAndInstall(url, data.apkName || `Pulse-${data.versionName}.apk`)
      requestedDownloadId.value = result.downloadId
      showToast('正在下载，完成后将打开安装页面')
    } else {
      window.open(url, '_blank')
    }
  } catch {
    updateRequested.value = false
    requestedDownloadId.value = null
    updating.value = false
    showToast('启动更新失败，请稍后重试')
  } finally {
    if (!isNativeApp) updating.value = false
  }
}

onMounted(check)
onMounted(() => {
  if (!isNativeApp) return
  void onDownloadProgress((progress) => {
    applyDownloadProgress(progress)
  }).then((handle) => {
    progressListener = handle
  })
  void getDownloadState().then((progress) => {
    if (progress.downloadId < 0) return
    applyDownloadProgress(progress, true)
  }).catch(() => {})
})
onUnmounted(() => {
  void progressListener?.remove()
})
</script>

<template>
  <div class="about-page">
    <header class="page-header">
      <button class="icon-btn" type="button" @click="smartBack(router, '/app/me')">‹</button>
      <h1>关于 Pulse</h1><span class="space" />
    </header>
    <main class="content">
      <div class="logo">P</div><h2>Pulse</h2>
      <p v-if="isNativeApp">当前版本：v{{ currentName }}</p>
      <section v-if="isNativeApp" class="version-card">
        <template v-if="loading">正在检查新版本…</template>
        <template v-else-if="hasUpdate && latest">
          <h3>发现新版本 v{{ latest.versionName }}</h3>
          <p class="notes">{{ latest.releaseNotes || '优化体验并修复已知问题。' }}</p>
          <button type="button" :disabled="updating" @click="update">
            {{ updating ? '准备更新…' : latest.forceUpdate ? '更新到新版本' : '在线更新' }}
          </button>
          <p v-if="updateStatus" class="update-status">{{ updateStatus }}</p>
          <div v-if="updateProgress?.totalBytes" class="update-progress">
            <span :style="{ width: `${updateProgress.percent}%` }" />
          </div>
        </template>
        <template v-else>
          <h3>已是最新版本</h3><p>当前无需更新</p>
        </template>
      </section>
      <button v-if="isNativeApp" class="check-btn" type="button" :disabled="loading" @click="check">检测新版本</button>
      <nav class="legal-links" aria-label="法律信息">
        <button type="button" @click="openLegalText('privacy_policy')">隐私政策</button>
        <span aria-hidden="true">·</span>
        <button type="button" @click="openLegalText('service_terms')">服务条款</button>
      </nav>
    </main>
    <LegalTextDialog ref="legalDialog" />
  </div>
</template>

<style scoped>
.about-page{display:flex;box-sizing:border-box;min-height:100%;min-height:100dvh;flex-direction:column;background:var(--pulse-page-bg,var(--pulse-bg));color:var(--pulse-text)}
.page-header{position:sticky;top:0;z-index:10;display:flex;align-items:center;height:56px;padding:var(--pulse-header-pad-top) 12px 0;margin-bottom:0 !important;background:var(--pulse-page-bg,var(--pulse-bg))}
.page-header h1{flex:1;margin:0;text-align:center;font-size:18px}.icon-btn,.space{width:40px;height:40px}.icon-btn{border:0;background:transparent;color:var(--pulse-primary);font-size:32px}
.content{display:flex;box-sizing:border-box;min-height:0;flex:1;flex-direction:column;padding:42px 20px calc(72px + var(--pulse-safe-bottom, 0px));text-align:center}.logo{display:grid;place-items:center;width:78px;height:78px;margin:0 auto;border-radius:22px;background:var(--pulse-primary-gradient);color:#fff;font-size:40px;font-weight:700}
.content h2{margin:16px 0 6px}.content>p{color:var(--pulse-text-secondary)}.version-card{margin-top:30px;padding:22px;border-radius:16px;background:var(--pulse-surface-container)}
.version-card h3{margin:0 0 10px}.notes{white-space:pre-wrap;text-align:left;line-height:1.6;color:var(--pulse-text-secondary)}
.version-card button,.check-btn{width:100%;height:46px;margin-top:18px;border:0;border-radius:12px;background:var(--pulse-primary);color:var(--pulse-on-primary);font-weight:600}.check-btn{background:transparent;color:var(--pulse-primary);border:1px solid var(--pulse-primary)}
.update-status{margin:12px 0 0;color:var(--pulse-primary);font-size:13px}
.update-progress{height:6px;margin-top:8px;overflow:hidden;border-radius:999px;background:var(--pulse-surface-container-high,rgba(127,127,127,.18))}
.update-progress span{display:block;height:100%;border-radius:inherit;background:var(--pulse-primary);transition:width .25s ease}
.legal-links{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:auto;margin-bottom:0;padding-top:20px;transform:translateY(10px);color:var(--pulse-text-secondary);font-size:12px}
.legal-links button{padding:4px 2px;border:0;background:transparent;color:var(--pulse-text-secondary);font:inherit}
.legal-links button:active{color:var(--pulse-primary)}
</style>

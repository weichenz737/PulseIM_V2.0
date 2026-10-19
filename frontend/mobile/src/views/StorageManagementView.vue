<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { showConfirmDialog, showToast } from 'vant'
import { useRouter } from 'vue-router'
import { smartBack } from '@/utils/navBack'
import { clearAppCache, clearStorageByKind, formatBytes, type StorageCacheKind } from '@/utils/storageCache'
import { invalidateStorageInventory, loadStorageOverview, type StorageOverview } from '@/utils/storageService'

const router = useRouter()
const loading = ref(true)
const refreshing = ref(false)
const clearingCache = ref(false)
const clearingKind = ref<StorageCacheKind | ''>('')
const errorText = ref('')
const overview = ref<StorageOverview | null>(null)

const deviceTotal = computed(() => overview.value?.device.totalBytes || 0)
const deviceAvailable = computed(() => overview.value?.device.availableBytes || 0)
const deviceUsed = computed(() => Math.max(0, deviceTotal.value - deviceAvailable.value))
const pulseUsed = computed(() => overview.value?.pulseUsedBytes || 0)
const otherUsed = computed(() => Math.max(0, deviceUsed.value - pulseUsed.value))
const cacheSize = computed(() => {
  const cache = overview.value?.cache
  return (cache?.chatImages || 0) + (cache?.chatVideos || 0) + (cache?.chatFiles || 0) + (cache?.chatAudio || 0)
})
const chatRecordsSize = computed(() => overview.value?.inventory.chatRecordsBytes || 0)
const chatFilesSize = computed(() => overview.value?.inventory.chatFilesBytes || 0)
const chatTotalSize = computed(() => chatRecordsSize.value + chatFilesSize.value)
const pulsePercent = computed(() => deviceTotal.value > 0 ? (pulseUsed.value / deviceTotal.value) * 100 : 0)

const ringSegments = computed(() => {
  const total = deviceTotal.value || Math.max(1, pulseUsed.value + otherUsed.value + deviceAvailable.value)
  const circumference = 2 * Math.PI * 116
  let consumed = 0
  return [
    { key: 'pulse', color: 'var(--pulse-primary)', value: pulseUsed.value },
    { key: 'other', color: 'var(--storage-other)', value: otherUsed.value },
    { key: 'free', color: 'var(--storage-free)', value: deviceAvailable.value },
  ].map((segment) => {
    const ratio = Math.max(0, Math.min(1, segment.value / total))
    const length = ratio * circumference
    const offset = -consumed * circumference
    consumed += ratio
    return { ...segment, dasharray: `${length} ${circumference - length}`, dashoffset: offset }
  })
})

const formattedPulse = computed(() => pulseUsed.value ? formatBytes(pulseUsed.value) : '暂不可读')
const formattedDeviceTotal = computed(() => deviceTotal.value ? formatBytes(deviceTotal.value) : '设备存储不可用')
const formattedAvailable = computed(() => deviceAvailable.value ? formatBytes(deviceAvailable.value) : '暂不可读')
const displayRecords = computed(() => chatRecordsSize.value ? formatBytes(chatRecordsSize.value) : '0 B')
const displayChatImages = computed(() => formatBytes(overview.value?.cache.chatImages || 0))
const displayChatVideos = computed(() => formatBytes(overview.value?.cache.chatVideos || 0))
const displayChatAudio = computed(() => formatBytes(overview.value?.cache.chatAudio || 0))
const displayChatDocuments = computed(() => formatBytes(overview.value?.cache.chatFiles || 0))
const inventoryNote = computed(() => {
  if (loading.value) return '正在扫描当前账号的会话资源…'
  if (overview.value?.inventory.partial) return '部分会话历史超过单次扫描上限，列表可继续刷新。'
  return `已扫描 ${overview.value?.inventory.loadedMessages || 0} 条本地可见消息`
})

async function refresh(force = false) {
  if (refreshing.value) return
  refreshing.value = true
  errorText.value = ''
  try { overview.value = await loadStorageOverview(force) }
  catch (error) { errorText.value = error instanceof Error ? error.message : '存储空间暂时无法读取' }
  finally { loading.value = false; refreshing.value = false }
}

async function clearCache() {
  if (clearingCache.value || cacheSize.value <= 0) {
    if (!clearingCache.value) showToast('当前没有可清理的缓存')
    return
  }
  try {
    await showConfirmDialog({
      title: '清理缓存数据',
      message: '清理缓存不会删除聊天记录、聊天文件、收藏、登录状态或用户设置。确定继续吗？',
      cancelButtonText: '取消',
      confirmButtonText: '确认清理',
    })
  } catch { return }
  clearingCache.value = true
  try {
    await clearAppCache()
    invalidateStorageInventory()
    await refresh(true)
    showToast('缓存已清理')
  } catch { showToast('清理失败，请稍后重试') }
  finally { clearingCache.value = false }
}

function cacheBytesFor(kind: StorageCacheKind): number {
  const cache = overview.value?.cache
  if (kind === 'chatImage') return cache?.chatImages || 0
  if (kind === 'chatVideo') return cache?.chatVideos || 0
  if (kind === 'chatFile') return cache?.chatFiles || 0
  if (kind === 'chatAudio') return cache?.chatAudio || 0
  return cacheSize.value
}

async function clearCategory(kind: Extract<StorageCacheKind, 'chatImage' | 'chatVideo' | 'chatFile' | 'chatAudio'>) {
  if (clearingCache.value || clearingKind.value || cacheBytesFor(kind) <= 0) {
    if (!clearingCache.value && !clearingKind.value) showToast('当前分类没有可清理的缓存')
    return
  }
  const labels = { chatImage: '图片', chatVideo: '视频', chatFile: '文件', chatAudio: '音频' } as const
  try {
    await showConfirmDialog({
      title: `清理聊天${labels[kind]}缓存`,
      message: `只删除本设备的${labels[kind]}缓存，消息、fileId、服务器文件和用户保存文件都会保留。`,
      cancelButtonText: '取消',
      confirmButtonText: '确认清理',
    })
  } catch { return }
  clearingKind.value = kind
  try {
    await clearStorageByKind(kind)
    invalidateStorageInventory()
    await refresh(true)
    showToast(`聊天${labels[kind]}缓存已清理`)
  } catch { showToast('清理失败，请稍后重试') }
  finally { clearingKind.value = '' }
}

function openChatFiles() { void router.push('/settings/storage/chat-files') }
function openOtherData() { void router.push('/settings/storage/other-data') }
function onStorageChanged() { void refresh(true) }

onMounted(() => {
  void refresh()
  window.addEventListener('pulse:storage-changed', onStorageChanged)
  window.addEventListener('pulse:voice-cache-cleared', onStorageChanged)
})
onUnmounted(() => {
  window.removeEventListener('pulse:storage-changed', onStorageChanged)
  window.removeEventListener('pulse:voice-cache-cleared', onStorageChanged)
})
</script>

<template>
  <div class="storage-page">
    <header class="header storage-header">
      <button type="button" class="icon-btn" aria-label="返回" @click="smartBack(router)"><span class="material-symbols-outlined">arrow_back_ios</span></button>
      <h1>存储空间</h1>
      <button type="button" class="icon-btn" aria-label="刷新" :disabled="refreshing" @click="refresh(true)"><span class="material-symbols-outlined" :class="{ spinning: refreshing }">refresh</span></button>
    </header>

    <main class="storage-content">
      <section class="storage-hero">
        <div class="hero-eyebrow"><span class="material-symbols-outlined">hard_drive</span>设备存储</div>
        <div class="ring-wrap">
          <svg class="storage-ring" viewBox="0 0 260 260" role="img" aria-label="设备存储占用情况">
            <circle class="ring-track" cx="130" cy="130" r="116" />
            <circle v-for="segment in ringSegments" :key="segment.key" class="ring-segment" cx="130" cy="130" r="116" :stroke="segment.color" :stroke-dasharray="segment.dasharray" :stroke-dashoffset="segment.dashoffset" />
          </svg>
          <div class="ring-center"><strong>{{ loading ? '计算中…' : formattedPulse }}</strong><span>{{ deviceTotal ? `占手机存储 ${pulsePercent.toFixed(1)}%` : '等待设备存储信息' }}</span></div>
        </div>
        <div class="ring-legend"><span><i class="legend-dot pulse" />PulseIM 已用空间</span><span><i class="legend-dot other" />手机已用空间</span><span><i class="legend-dot free" />手机可用空间</span></div>
        <div class="device-summary"><span>设备总容量 {{ formattedDeviceTotal }}</span><span>可用 {{ formattedAvailable }}</span></div>
      </section>

      <div v-if="errorText" class="load-error"><span class="material-symbols-outlined">warning</span><span>{{ errorText }}</span><button type="button" @click="refresh(true)">重试</button></div>

      <section class="storage-cards">
        <article class="storage-card" @click="openChatFiles">
          <div class="card-top"><span class="card-title">聊天与文件</span><button type="button" class="card-action" @click.stop="openChatFiles">管理</button></div>
          <div class="card-size">{{ loading ? '计算中…' : formatBytes(chatTotalSize) }}</div>
          <p>包含聊天记录、图片、视频、语音、文件及下载的资源。</p>
          <div class="card-detail"><span>记录 {{ displayRecords }} · 图片 {{ displayChatImages }} · 视频 {{ displayChatVideos }} · 文件 {{ displayChatDocuments }} · 音频 {{ displayChatAudio }}</span><span class="material-symbols-outlined">chevron_right</span></div>
        </article>

        <article class="storage-card" @click="clearCache">
          <div class="card-top"><span class="card-title">缓存数据</span><button type="button" class="card-action primary" :disabled="clearingCache" @click.stop="clearCache">{{ clearingCache ? '清理中…' : '清理' }}</button></div>
          <div class="card-size">{{ loading ? '计算中…' : formatBytes(cacheSize) }}</div>
          <p>只清理本设备的聊天图片、视频、文件和音频缓存。</p>
          <div class="cache-kind-actions"><button type="button" class="cache-kind-btn" :disabled="clearingCache || !!clearingKind" @click.stop="clearCategory('chatImage')">{{ clearingKind === 'chatImage' ? '清理中…' : '图片' }}</button><button type="button" class="cache-kind-btn" :disabled="clearingCache || !!clearingKind" @click.stop="clearCategory('chatVideo')">{{ clearingKind === 'chatVideo' ? '清理中…' : '视频' }}</button><button type="button" class="cache-kind-btn" :disabled="clearingCache || !!clearingKind" @click.stop="clearCategory('chatFile')">{{ clearingKind === 'chatFile' ? '清理中…' : '文件' }}</button><button type="button" class="cache-kind-btn" :disabled="clearingCache || !!clearingKind" @click.stop="clearCategory('chatAudio')">{{ clearingKind === 'chatAudio' ? '清理中…' : '音频' }}</button></div><div class="card-detail"><span>消息、fileId、服务器文件和用户保存文件均保留</span><span class="material-symbols-outlined">cleaning_services</span></div>
        </article>

        <article class="storage-card" @click="openOtherData">
          <div class="card-top"><span class="card-title">其他数据</span><button type="button" class="card-action" @click.stop="openOtherData">查看</button></div>
          <div class="card-size">{{ loading ? '计算中…' : formatBytes(overview?.otherDataBytes || 0) }}</div>
          <p>包含应用数据库、索引、日志和必要业务数据，仅提供查看。</p>
          <div class="card-detail"><span>不会提供危险的一键删除</span><span class="material-symbols-outlined">chevron_right</span></div>
        </article>
      </section>

      <p class="storage-note"><span class="material-symbols-outlined">info</span>{{ inventoryNote }}。图片、视频、文件和音频占用来自本机真实缓存，不按服务器对象大小计入；清理只删除本机聊天缓存。</p>
    </main>
  </div>
</template>

<style scoped>
.storage-page { min-height: 100%; color: var(--pulse-text); background: var(--pulse-page-bg, var(--pulse-bg)); --storage-other: #8b6cff; --storage-free: var(--pulse-surface-highest); }
.header { position: sticky; top: 0; z-index: 20; display: grid; grid-template-columns: 40px 1fr 40px; align-items: center; min-height: 56px; padding: var(--pulse-header-pad-top) 12px 0; background: var(--pulse-page-bg, var(--pulse-bg)); }
.header h1 { margin: 0; text-align: center; font-size: 18px; font-weight: 650; color: var(--pulse-text); }.icon-btn { display: grid; place-items: center; width: 40px; height: 40px; border: 0; background: transparent; color: var(--pulse-text); }.icon-btn:disabled { opacity: .45; }
.storage-content { padding: 12px 16px 28px; }.storage-hero { padding: 18px 12px 16px; border: 1px solid var(--pulse-border); border-radius: 24px; background: var(--pulse-surface-container); box-shadow: 0 12px 30px rgba(0,0,0,.06); }.hero-eyebrow { display: flex; align-items: center; justify-content: center; gap: 6px; color: var(--pulse-outline); font-size: 12px; }.hero-eyebrow .material-symbols-outlined { font-size: 17px; color: var(--pulse-primary); }
.ring-wrap { position: relative; width: 260px; height: 260px; margin: 6px auto 0; }.storage-ring { width: 100%; height: 100%; transform: rotate(-90deg); overflow: visible; }.ring-track,.ring-segment { fill: none; stroke-width: 18; }.ring-track { stroke: color-mix(in srgb, var(--pulse-text) 8%, transparent); }.ring-segment { stroke-linecap: round; transition: stroke-dasharray .3s ease, stroke-dashoffset .3s ease; }.ring-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; }.ring-center strong { font-size: 30px; font-weight: 700; letter-spacing: -.04em; }.ring-center span { color: var(--pulse-outline); font-size: 12px; }.ring-legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px 14px; color: var(--pulse-outline); font-size: 11px; }.ring-legend span { display: inline-flex; align-items: center; gap: 5px; }.legend-dot { width: 8px; height: 8px; border-radius: 50%; }.legend-dot.pulse { background: var(--pulse-primary); }.legend-dot.other { background: var(--storage-other); }.legend-dot.free { background: var(--storage-free); border: 1px solid var(--pulse-border); }.device-summary { display: flex; justify-content: center; gap: 16px; margin-top: 12px; color: var(--pulse-outline); font-size: 11px; }
.load-error { display: flex; align-items: center; gap: 8px; margin: 12px 2px 0; padding: 10px 12px; border-radius: 12px; color: var(--pulse-error); background: color-mix(in srgb, var(--pulse-error) 10%, transparent); font-size: 12px; }.load-error span:nth-child(2) { flex: 1; }.load-error button { border: 0; background: transparent; color: inherit; font-weight: 650; }.storage-cards { display: grid; gap: 12px; margin-top: 14px; }.storage-card { padding: 18px 16px 15px; border: 1px solid var(--pulse-border); border-radius: 20px; background: var(--pulse-surface-container); cursor: pointer; transition: transform .16s, background .16s; }.storage-card:active { transform: scale(.985); background: var(--pulse-surface-high); }.card-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }.card-title { font-size: 17px; font-weight: 650; }.card-action { flex: 0 0 auto; min-width: 66px; height: 34px; padding: 0 14px; border: 0; border-radius: 999px; color: var(--pulse-text); background: var(--pulse-surface-highest); font: inherit; font-size: 13px; font-weight: 650; }.card-action.primary { color: #fff; background: linear-gradient(135deg, var(--pulse-primary), color-mix(in srgb, var(--pulse-primary) 55%, #7b4dff)); }.card-action:disabled { opacity: .55; }.card-size { margin-top: 13px; font-size: 29px; font-weight: 700; letter-spacing: -.03em; }.storage-card p { min-height: 34px; margin: 7px 0 12px; color: var(--pulse-outline); font-size: 12px; line-height: 1.5; }.card-detail { display: flex; align-items: center; gap: 8px; color: var(--pulse-outline); font-size: 11px; }.card-detail span:first-child { flex: 1; }.card-detail .material-symbols-outlined { font-size: 18px; }.storage-note { display: flex; gap: 6px; margin: 15px 4px 0; color: var(--pulse-outline); font-size: 11px; line-height: 1.55; }.storage-note .material-symbols-outlined { flex: 0 0 auto; font-size: 16px; color: var(--pulse-primary); }.spinning { animation: spin .8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
.cache-kind-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 12px; }.cache-kind-btn { min-width: 54px; height: 30px; padding: 0 11px; border: 1px solid var(--pulse-border); border-radius: 999px; color: var(--pulse-text); background: var(--pulse-surface-highest); font: inherit; font-size: 12px; font-weight: 650; }.cache-kind-btn:disabled { opacity: .55; }
</style>
<style scoped>
/* 标题脱离按钮布局，定位在安全区下方的整行中心，刷新按钮不会挤动标题。 */
.storage-page > .storage-header {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
}

.storage-page > .storage-header > h1 {
  position: absolute !important;
  top: var(--pulse-header-pad-top) !important;
  right: 0 !important;
  bottom: auto !important;
  left: 0 !important;
  width: auto !important;
  max-width: none !important;
  height: var(--pulse-header-bar-height) !important;
  margin: 0 !important;
  transform: none !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  pointer-events: none !important;
  overflow: hidden;
  text-align: center !important;
  text-overflow: ellipsis;
  white-space: nowrap;
  z-index: 1 !important;
}

.storage-page > .storage-header > .icon-btn:first-child {
  position: relative !important;
  z-index: 2 !important;
  flex: 0 0 auto !important;
  margin: 0 !important;
}

.storage-page > .storage-header > .icon-btn:last-child {
  position: relative !important;
  z-index: 2 !important;
  flex: 0 0 auto !important;
  margin: 0 !important;
}
</style>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog, showImagePreview, showLoadingToast, showToast, closeToast } from 'vant'
import { addFavorite, fetchLocatableMessage, forwardMessages } from '@/api/message'
import { fetchConversations, type ConversationItem } from '@/api/conversation'
import { isAndroid } from '@/native/platform'
import { refreshTokenIfNeeded } from '@/api/http'
import { nativeMediaGallery } from '@/native'
import { openFilePreview } from '@/composables/useFilePreview'
import { openMediaVideoPreview } from '@/composables/useMediaVideoPreview'
import { fileDownloadUrl } from '@/api/file'
import { saveMediaToDevice, toastForSaveResult } from '@/utils/saveMedia'
import { smartBack } from '@/utils/navBack'
import { cacheChatFile, clearCachedChatFile, getCachedChatFile } from '@/utils/fileCache'
import {
  dateValue,
  formatDuration,
  formatStorageDate,
  formatStorageSize,
  loadStorageInventory,
  type StorageAsset,
  type StorageAssetKind,
  type StorageInventory,
} from '@/utils/storageService'

type SortKey = 'size-desc' | 'size-asc' | 'date-desc' | 'date-asc'
const router = useRouter()
const inventory = ref<StorageInventory | null>(null)
const activeKind = ref<StorageAssetKind>('image')
const sortKey = ref<SortKey>('size-desc')
const search = ref('')
const selectMode = ref(false)
const selected = ref<Set<string>>(new Set())
const loading = ref(true)
const errorText = ref('')
const sortVisible = ref(false)
const forwardVisible = ref(false)
const forwarding = ref(false)
const targets = ref<ConversationItem[]>([])
const forwardTargetIds = ref<Set<string>>(new Set())
const localPreviewUrls = ref<Record<string, string>>({})
const suppressedPreviewFileIds = new Set<string>()

function clearLocalPreviewUrls() {
  // These Blob URLs are owned by fileCache.ts and intentionally shared with
  // ChatView. Revoking them here leaves the cache pointing at dead URLs, so a
  // later visit can only render the placeholder even though the bytes exist.
  localPreviewUrls.value = {}
}

const tabs: Array<{ key: StorageAssetKind; label: string }> = [
  { key: 'image', label: '图片' }, { key: 'video', label: '视频' }, { key: 'file', label: '文件' }, { key: 'audio', label: '音频' },
]
const sortLabel = computed(() => ({ 'size-desc': '按大小 · 从大到小', 'size-asc': '按大小 · 从小到大', 'date-desc': '按时间 · 从新到旧', 'date-asc': '按时间 · 从旧到新' }[sortKey.value]))
const assets = computed(() => {
  const needle = search.value.trim().toLocaleLowerCase()
  const result = (inventory.value?.assets || []).filter((asset) => asset.kind === activeKind.value && (!needle || asset.name.toLocaleLowerCase().includes(needle)))
  return [...result].sort((a, b) => sortKey.value.startsWith('size') ? (sortKey.value === 'size-desc' ? b.size - a.size : a.size - b.size) : (sortKey.value === 'date-desc' ? dateValue(b.createdAt) - dateValue(a.createdAt) : dateValue(a.createdAt) - dateValue(b.createdAt)))
})
const selectedAssets = computed(() => (inventory.value?.assets || []).filter((asset) => selected.value.has(asset.id)))
const allSelected = computed(() => assets.value.length > 0 && assets.value.every((asset) => selected.value.has(asset.id)))
const totalBytes = computed(() => assets.value.reduce((sum, asset) => sum + asset.size, 0))

async function load(force = false) {
  if (force) clearLocalPreviewUrls()
  loading.value = true; errorText.value = ''
  try { inventory.value = await loadStorageInventory(force) }
  catch (error) { errorText.value = error instanceof Error ? error.message : '聊天文件暂时无法读取' }
  finally { loading.value = false }
}

async function warmAssetPreviews(list: StorageAsset[]) {
  await Promise.all(list
    .filter((asset) => (asset.kind === 'image' || asset.kind === 'video') && !!asset.fileId && !localPreviewUrls.value[asset.id])
    .map((asset) => ensureGridPreview(asset)))
}

const previewLoads = new Map<string, Promise<string>>()

async function ensureGridPreview(asset: StorageAsset): Promise<string> {
  if (asset.kind !== 'image' && asset.kind !== 'video') return ''
  const current = localPreviewUrls.value[asset.id]
  if (current) return current
  if (!asset.fileId) return asset.kind === 'image'
    ? asset.thumbUrl || asset.previewUrl || asset.originalUrl || asset.url
    : asset.thumbUrl || asset.previewUrl || asset.originalUrl || asset.url
  if (suppressedPreviewFileIds.has(asset.fileId)) return ''

  const key = `${asset.kind}:${asset.fileId}`
  const existing = previewLoads.get(key)
  if (existing) {
    const resolved = await existing
    if (resolved) localPreviewUrls.value = { ...localPreviewUrls.value, [asset.id]: resolved }
    return resolved
  }
  const task = (async () => {
    const variants = asset.kind === 'image'
      ? (['preview', 'thumb', 'original'] as const)
      : (['thumb'] as const)
    for (const variant of variants) {
      const cached = await getCachedChatFile(asset.kind, asset.fileId!, variant)
      if (cached) {
        localPreviewUrls.value = { ...localPreviewUrls.value, [asset.id]: cached }
        return cached
      }
      try {
        const downloaded = await cacheChatFile(asset.kind, asset.fileId!, variant, fileDownloadUrl(asset.fileId, variant))
        if (suppressedPreviewFileIds.has(asset.fileId!)) return ''
        if (downloaded) {
          localPreviewUrls.value = { ...localPreviewUrls.value, [asset.id]: downloaded }
          return downloaded
        }
      } catch {
        // Try the lower-fidelity fallback variant when the preferred rendition is unavailable.
      }
    }
    return ''
  })()
  previewLoads.set(key, task)
  try {
    return await task
  } finally {
    if (previewLoads.get(key) === task) previewLoads.delete(key)
  }
}
function toggle(asset: StorageAsset) { const next = new Set(selected.value); if (next.has(asset.id)) next.delete(asset.id); else next.add(asset.id); selected.value = next }
function toggleAll() { const next = new Set(selected.value); if (allSelected.value) assets.value.forEach((asset) => next.delete(asset.id)); else assets.value.forEach((asset) => next.add(asset.id)); selected.value = next }
function startSelection(asset?: StorageAsset) { selectMode.value = true; if (asset && !selected.value.has(asset.id)) toggle(asset) }
function finishSelection() { selectMode.value = false; selected.value = new Set() }
function iconFor(asset: StorageAsset) { return asset.kind === 'audio' ? 'graphic_eq' : asset.kind === 'file' ? 'description' : asset.kind === 'video' ? 'movie' : 'image' }
async function localPreviewUrl(asset: StorageAsset): Promise<string> {
  if (asset.kind === 'image' && asset.fileId) return ensureGridPreview(asset)
  if (asset.fileId) {
    const variants = asset.kind === 'image'
      ? (['preview', 'thumb', 'original'] as const)
      : asset.kind === 'video'
        ? (['preview', 'original'] as const)
      : (['original'] as const)
    for (const variant of variants) {
      const cached = await getCachedChatFile(asset.kind, asset.fileId, variant)
      if (cached) return cached
    }
    // Do not download the complete preview before opening the player. The
    // global video overlay streams the authenticated compressed MP4 with
    // Range and only caches it if the WebView cannot use the direct request.
    if (asset.kind === 'video') return ''
  }
  // New fileId routes are authenticated; never hand them to a raw <img> or
  // <video>. FilePreviewOverlay can resolve the fileId through HTTP instead.
  if (asset.fileId) return ''
  if (asset.kind === 'image') return asset.thumbUrl || asset.previewUrl || asset.originalUrl || asset.url
  if (asset.kind === 'video') return asset.previewUrl || asset.originalUrl || asset.url
  return asset.originalUrl || asset.url
}

async function preview(asset: StorageAsset) {
  if (selectMode.value) { toggle(asset); return }
  const url = await localPreviewUrl(asset)
  if (asset.kind === 'image' && url) {
    showImagePreview({ images: [url], startPosition: 0, closeable: true, closeIconPosition: 'top-right', showIndex: false, transition: 'none' })
    return
  }
  if (asset.kind === 'video') {
    const playerUrl = url || (asset.fileId
      ? fileDownloadUrl(asset.fileId, 'preview')
      : asset.previewUrl || asset.originalUrl || asset.url)
    void openMediaVideoPreview(playerUrl, { fileId: asset.fileId, variant: 'preview' })
    return
  }
  openFilePreview({ url: asset.url, fileId: asset.fileId, name: asset.name, size: asset.size, contentType: asset.contentType, onForward: () => startSelection(asset) })
}

async function saveAsset(asset: StorageAsset) {
  if ((asset.kind === 'image' || asset.kind === 'video') && !isAndroid) { const text = toastForSaveResult(await saveMediaToDevice(asset.originalUrl || asset.url, { filename: asset.name, mimeType: asset.contentType })); if (text) showToast(text); return }
  if (isAndroid) { await nativeMediaGallery.downloadFile(asset.originalUrl || asset.url, asset.name, asset.contentType || 'application/octet-stream'); showToast('已开始下载'); return }
  const token = await refreshTokenIfNeeded(); const response = await fetch(asset.originalUrl || asset.url, { credentials: 'include', headers: token ? { Authorization: `Bearer ${token}` } : {} }); if (!response.ok) throw new Error('下载失败'); const blobUrl = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = blobUrl; link.download = asset.name; link.click(); window.setTimeout(() => URL.revokeObjectURL(blobUrl), 5000); showToast('已开始下载')
}
async function downloadSelected() { if (!selectedAssets.value.length) return; showLoadingToast({ message: '准备下载…', forbidClick: true, duration: 0 }); try { for (const asset of selectedAssets.value) await saveAsset(asset); closeToast() } catch (error) { closeToast(); showToast(error instanceof Error ? error.message : '下载失败，请稍后重试') } }
async function deleteSelected() {
  const assetsToDelete = selectedAssets.value
  if (!assetsToDelete.length) return
  try {
    await showConfirmDialog({
      title: '清理聊天文件缓存',
      message: `清理所选 ${assetsToDelete.length} 项在本设备上的缓存？消息、fileId、收藏/转发引用和服务端文件都会保留。`,
      cancelButtonText: '取消',
      confirmButtonText: '确认清理',
      confirmButtonColor: 'var(--pulse-error)',
    })
  } catch { return }
  assetsToDelete.forEach((asset) => {
    if (asset.fileId) suppressedPreviewFileIds.add(asset.fileId)
  })
  await Promise.all(assetsToDelete.map((asset) => clearCachedChatFile(asset.fileId)))
  selected.value = new Set()
  await load(true)
  showToast('本地聊天缓存已清理，消息仍保留')
}
async function favoriteSelected() { if (!selectedAssets.value.length) return; const results = await Promise.allSettled(selectedAssets.value.map((asset) => addFavorite(asset.conversationId, asset.id))); showToast(`已收藏 ${results.filter((result) => result.status === 'fulfilled').length} 项`) }
async function locateSelected() {
  if (selectedAssets.value.length !== 1) return
  const asset = selectedAssets.value[0]
  const original = await fetchLocatableMessage(asset.conversationId, asset.message.id)
  if (!original) {
    showToast('原消息已不存在')
    return
  }
  const source = inventory.value?.conversations.find((stat) => stat.conversation.id === asset.conversationId)
  void router.push({ path: `/chat/${asset.conversationId}`, query: { title: source?.conversation.name || asset.conversationName, type: source?.conversation.type || asset.conversationType, avatar: source?.conversation.avatar || '', highlightMsgId: original.id } })
}
async function openForwardPicker() { if (!selectedAssets.value.length) return; try { targets.value = (await fetchConversations('all')).filter((item) => !item.archived); forwardTargetIds.value = new Set(); forwardVisible.value = true } catch { showToast('加载会话失败') } }
function toggleForwardTarget(id: string) { const next = new Set(forwardTargetIds.value); if (next.has(id)) next.delete(id); else next.add(id); forwardTargetIds.value = next }
async function submitForward() { if (!forwardTargetIds.value.size || forwarding.value) return; forwarding.value = true; try { const grouped = new Map<string, string[]>(); selectedAssets.value.forEach((asset) => grouped.set(asset.conversationId, [...(grouped.get(asset.conversationId) || []), asset.id])); for (const [sourceId, ids] of grouped) await forwardMessages(sourceId, [...forwardTargetIds.value], ids, 'separate'); forwardVisible.value = false; showToast('已转发') } catch { showToast('转发失败，请稍后重试') } finally { forwarding.value = false } }

function goBack() {
  if (forwardVisible.value) {
    forwardVisible.value = false
    return
  }
  if (sortVisible.value) {
    sortVisible.value = false
    return
  }
  if (selectMode.value) {
    finishSelection()
    return
  }
  smartBack(router)
}

function onNativeBack(event: Event) {
  if (forwardVisible.value) {
    forwardVisible.value = false
    event.preventDefault()
    return
  }
  if (sortVisible.value) {
    sortVisible.value = false
    event.preventDefault()
    return
  }
  if (selectMode.value) {
    finishSelection()
    event.preventDefault()
  }
}

onMounted(() => {
  window.addEventListener('pulse:native-back', onNativeBack)
  void load()
})

watch(assets, (list) => { void warmAssetPreviews(list) }, { immediate: true })

onUnmounted(() => {
  window.removeEventListener('pulse:native-back', onNativeBack)
  clearLocalPreviewUrls()
})
</script>

<template>
  <div class="all-files-page" @click="sortVisible = false">
    <header class="page-header"><button type="button" class="header-btn" aria-label="返回" @click="goBack"><span class="material-symbols-outlined">arrow_back_ios</span></button><h1>清理聊天文件</h1><button type="button" class="header-text-btn" @click="selectMode ? finishSelection() : (selectMode = true)">{{ selectMode ? '完成' : '选择' }}</button></header>
    <main class="all-content">
      <div class="tab-row"><button v-for="tab in tabs" :key="tab.key" type="button" :class="{ active: activeKind === tab.key }" @click="activeKind = tab.key">{{ tab.label }}</button></div>
      <label class="search-box"><span class="material-symbols-outlined">search</span><input v-model="search" type="search" placeholder="搜索文件名" /><button v-if="search" type="button" @click="search = ''">×</button></label>
      <div class="toolbar"><span>已加载 {{ assets.length }} 项 · {{ formatStorageSize(totalBytes) }}</span><button type="button" @click.stop="sortVisible = !sortVisible"><span class="material-symbols-outlined">sort</span>{{ sortLabel }}</button></div>
      <div v-if="sortVisible" class="sort-menu" @click.stop><button v-for="item in [{key:'size-desc',label:'按大小从大到小'},{key:'size-asc',label:'按大小从小到大'},{key:'date-desc',label:'按时间从新到旧'},{key:'date-asc',label:'按时间从旧到新'}]" :key="item.key" type="button" :class="{ active: sortKey === item.key }" @click="sortKey = item.key as SortKey; sortVisible = false">{{ item.label }}</button></div>
      <div v-if="loading" class="state"><span class="material-symbols-outlined spinning">sync</span>正在加载全部会话资源…</div>
      <div v-else-if="errorText" class="state error">{{ errorText }}<button type="button" @click="load(true)">重试</button></div>
      <div v-else-if="!assets.length" class="state"><span class="material-symbols-outlined">folder_open</span>暂无资源</div>
      <section v-else-if="activeKind === 'image' || activeKind === 'video'" class="media-grid">
        <button v-for="asset in assets" :key="asset.id" type="button" class="media-item" @click="preview(asset)" @contextmenu.prevent="startSelection(asset)"><img v-if="asset.fileId ? localPreviewUrls[asset.id] : (asset.kind === 'image' || asset.thumbUrl)" :src="asset.fileId ? localPreviewUrls[asset.id] : (asset.thumbUrl || asset.url)" alt="" loading="lazy" /><div v-else class="media-placeholder"><span class="material-symbols-outlined">{{ asset.kind === 'video' ? 'movie' : 'image' }}</span></div><span class="media-label"><span v-if="asset.kind === 'video'" class="material-symbols-outlined">play_circle</span>{{ formatStorageSize(asset.size) }}</span><span v-if="selectMode" class="asset-check" :class="{ checked: selected.has(asset.id) }"><span v-if="selected.has(asset.id)" class="material-symbols-outlined">check</span></span></button>
      </section>
      <section v-else class="asset-list"><button v-for="asset in assets" :key="asset.id" type="button" class="asset-row" @click="preview(asset)" @contextmenu.prevent="startSelection(asset)"><span class="file-icon"><span class="material-symbols-outlined">{{ iconFor(asset) }}</span></span><span class="asset-body"><strong>{{ asset.name }}</strong><small>{{ formatStorageSize(asset.size) }}<template v-if="asset.durationMs"> · {{ formatDuration(asset.durationMs) }}</template> · {{ asset.conversationName }} · {{ formatStorageDate(asset.createdAt) }}</small></span><span v-if="selectMode" class="asset-check" :class="{ checked: selected.has(asset.id) }"><span v-if="selected.has(asset.id)" class="material-symbols-outlined">check</span></span><span v-else class="material-symbols-outlined">chevron_right</span></button></section>
    </main>
    <footer v-if="selectMode" class="action-bar" :class="{ 'has-locate': selected.size === 1 }">
      <button type="button" @click="toggleAll">
        <span class="material-symbols-outlined">checklist</span>
        <span>{{ allSelected ? '取消全选' : '全选' }}</span>
      </button>
      <button type="button" :disabled="!selected.size" @click="downloadSelected">
        <span class="material-symbols-outlined">download</span>
        <span>下载</span>
      </button>
      <button type="button" :disabled="!selected.size" @click="openForwardPicker">
        <span class="material-symbols-outlined">forward</span>
        <span>转发</span>
      </button>
      <button type="button" :disabled="!selected.size" @click="favoriteSelected">
        <span class="material-symbols-outlined">star</span>
        <span>收藏</span>
      </button>
      <button v-if="selected.size === 1" type="button" @click="locateSelected">
        <span class="material-symbols-outlined">location_on</span>
        <span>定位</span>
      </button>
      <button type="button" class="danger" :disabled="!selected.size" @click="deleteSelected">
        <span class="material-symbols-outlined">delete</span>
        <span>删除</span>
      </button>
    </footer>
    <van-popup v-model:show="forwardVisible" position="bottom" round safe-area-inset-bottom class="forward-popup"><div class="forward-panel"><div class="forward-head"><strong>选择转发对象</strong><button type="button" @click="forwardVisible = false">关闭</button></div><div class="forward-list"><button v-for="target in targets" :key="target.id" type="button" class="forward-row" :class="{ selected: forwardTargetIds.has(target.id) }" @click="toggleForwardTarget(target.id)"><span class="material-symbols-outlined">{{ forwardTargetIds.has(target.id) ? 'check_circle' : 'radio_button_unchecked' }}</span><img v-if="target.avatar" :src="target.avatar" alt="" /><span v-else class="target-avatar">{{ target.name.slice(0, 1) }}</span><span>{{ target.name }}</span></button></div><button type="button" class="forward-submit" :disabled="!forwardTargetIds.size || forwarding" @click="submitForward">{{ forwarding ? '转发中…' : '确认转发' }}</button></div></van-popup>
  </div>
</template>

<style scoped>
.all-files-page { min-height: 100%; color: var(--pulse-text); background: var(--pulse-page-bg, var(--pulse-bg)); }.page-header { position: sticky; top: 0; z-index: 10; display: grid; grid-template-columns: 56px 1fr 56px; align-items: center; min-height: 56px; padding: var(--pulse-header-pad-top) 8px 0; background: var(--pulse-page-bg, var(--pulse-bg)); border-bottom: 1px solid var(--pulse-divider); }.page-header h1 { margin: 0; text-align: center; font-size: 18px; }.header-btn,.header-text-btn { border: 0; background: transparent; color: var(--pulse-text); font: inherit; }.header-btn { display: grid; place-items: center; width: 40px; height: 40px; }.header-text-btn { justify-self: end; color: var(--pulse-primary); font-size: 14px; font-weight: 650; }.all-content { position: relative; padding: 0 10px calc(80px + env(safe-area-inset-bottom)); }.tab-row { display: grid; grid-template-columns: repeat(4,1fr); border-bottom: 1px solid var(--pulse-divider); }.tab-row button { position: relative; padding: 14px 3px 12px; border: 0; background: transparent; color: var(--pulse-outline); font: inherit; font-size: 14px; }.tab-row button.active { color: var(--pulse-primary); font-weight: 650; }.tab-row button.active::after { position: absolute; right: 20%; bottom: -1px; left: 20%; height: 3px; border-radius: 3px; background: var(--pulse-primary); content: ''; }.search-box { display: flex; align-items: center; gap: 7px; margin: 12px 4px 7px; padding: 0 10px; height: 40px; border-radius: 12px; background: var(--pulse-surface-container); color: var(--pulse-outline); }.search-box input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: var(--pulse-text); font: inherit; font-size: 13px; }.search-box button { border: 0; background: transparent; color: var(--pulse-outline); font-size: 22px; }.toolbar { display: flex; justify-content: space-between; align-items: center; margin: 0 5px 9px; color: var(--pulse-outline); font-size: 11px; }.toolbar button { display: inline-flex; align-items: center; gap: 4px; border: 0; background: transparent; color: var(--pulse-primary); font: inherit; font-size: 11px; }.toolbar .material-symbols-outlined { font-size: 17px; }.sort-menu { position: absolute; top: 142px; right: 10px; z-index: 5; display: flex; flex-direction: column; min-width: 160px; overflow: hidden; border: 1px solid var(--pulse-border); border-radius: 12px; background: var(--pulse-surface-container); box-shadow: 0 12px 28px rgba(0,0,0,.16); }.sort-menu button { padding: 12px 14px; border: 0; border-bottom: 1px solid var(--pulse-divider); background: transparent; color: var(--pulse-text); text-align: left; font: inherit; font-size: 13px; }.sort-menu button.active { color: var(--pulse-primary); background: color-mix(in srgb, var(--pulse-primary) 10%, transparent); }.media-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 3px; }.media-item { position: relative; aspect-ratio: 1; overflow: hidden; padding: 0; border: 0; background: var(--pulse-surface-high); }.media-item img { width: 100%; height: 100%; object-fit: cover; }.media-placeholder { display: grid; place-items: center; height: 100%; color: var(--pulse-outline); }.media-placeholder .material-symbols-outlined { font-size: 32px; }.media-label { position: absolute; right: 4px; bottom: 3px; left: 4px; display: flex; align-items: center; gap: 3px; color: #fff; font-size: 10px; text-shadow: 0 1px 2px #000; }.media-label .material-symbols-outlined { font-size: 21px; }.asset-check { position: absolute; top: 5px; right: 5px; display: grid; place-items: center; width: 22px; height: 22px; border: 1.5px solid #fff; border-radius: 50%; color: #fff; background: rgba(0,0,0,.25); }.asset-check.checked { border-color: var(--pulse-primary); background: var(--pulse-primary); }.asset-check .material-symbols-outlined { font-size: 16px; }.asset-list { overflow: hidden; border: 1px solid var(--pulse-border); border-radius: 16px; background: var(--pulse-surface-container); }.asset-row { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 68px; padding: 9px 12px; border: 0; border-bottom: 1px solid var(--pulse-divider); color: var(--pulse-text); background: transparent; text-align: left; font: inherit; }.asset-row:last-child { border-bottom: 0; }.file-icon { display: grid; place-items: center; width: 39px; height: 39px; border-radius: 11px; color: var(--pulse-primary); background: color-mix(in srgb, var(--pulse-primary) 12%, transparent); }.asset-body { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 5px; }.asset-body strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }.asset-body small { overflow: hidden; color: var(--pulse-outline); text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }.state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; min-height: 260px; color: var(--pulse-outline); font-size: 13px; }.state.error { color: var(--pulse-error); }.state button { border: 0; background: transparent; color: var(--pulse-primary); font: inherit; }.action-bar { position: fixed; right: 0; bottom: 0; left: 0; z-index: 20; display: flex; gap: 2px; overflow-x: auto; padding: 10px 8px env(safe-area-inset-bottom); background: color-mix(in srgb, var(--pulse-surface-container) 96%, transparent); border-top: 1px solid var(--pulse-divider); backdrop-filter: blur(16px); }.action-bar button { flex: 0 0 auto; min-width: 48px; height: 36px; padding: 0 8px; border: 0; border-radius: 8px; background: transparent; color: var(--pulse-text); font: inherit; font-size: 12px; }.action-bar button:disabled { opacity: .4; }.action-bar .danger { color: var(--pulse-error); }.forward-popup { min-height: 45%; }.forward-panel { padding: 18px 16px calc(16px + env(safe-area-inset-bottom)); }.forward-head { display: flex; justify-content: space-between; align-items: center; }.forward-head button { border: 0; background: transparent; color: var(--pulse-primary); }.forward-list { max-height: 42vh; margin: 14px 0; overflow: auto; }.forward-row { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 52px; border: 0; border-bottom: 1px solid var(--pulse-divider); background: transparent; color: var(--pulse-text); text-align: left; font: inherit; }.forward-row .material-symbols-outlined { color: var(--pulse-outline); }.forward-row.selected .material-symbols-outlined { color: var(--pulse-primary); }.forward-row img,.target-avatar { width: 34px; height: 34px; border-radius: 50%; object-fit: cover; }.target-avatar { display: grid; place-items: center; color: var(--pulse-primary); background: var(--pulse-surface-highest); }.forward-submit { width: 100%; height: 44px; border: 0; border-radius: 12px; color: #fff; background: var(--pulse-primary); font: inherit; font-weight: 650; }.forward-submit:disabled { opacity: .5; }.spinning { animation: spin .8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
</style>
<style scoped>
/* 标题脱离按钮布局，定位在安全区下方的整行中心，避免被挤到第二行。 */
.all-files-page > .page-header {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
}

.all-files-page > .page-header > h1 {
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

.all-files-page > .page-header > .header-btn {
  position: relative !important;
  z-index: 2 !important;
  flex: 0 0 auto !important;
  margin: 0 !important;
}

.all-files-page > .page-header > .header-text-btn {
  position: relative !important;
  z-index: 2 !important;
  flex: 0 0 auto !important;
  margin: 0 !important;
}
</style>
<style scoped>
.action-bar {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 4px;
  overflow: visible;
  padding: 8px max(8px, env(safe-area-inset-left)) calc(8px + env(safe-area-inset-bottom));
}

.action-bar.has-locate { grid-template-columns: repeat(6, minmax(0, 1fr)); }

.action-bar button {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-width: 0;
  height: 52px;
  padding: 3px 1px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  font-size: 11px;
  line-height: 1.2;
  transition: background-color .16s ease, transform .16s ease;
}

.action-bar button .material-symbols-outlined {
  margin: 0;
  font-size: 20px;
  line-height: 1;
}

.action-bar button:first-child { color: var(--pulse-primary); }
.action-bar button:not(:disabled):active { background: var(--pulse-pressed); transform: scale(.96); }

@media (max-width: 360px) {
  .action-bar { gap: 2px; padding-right: 5px; padding-left: 5px; }
  .action-bar button { font-size: 10px; }
}
</style>

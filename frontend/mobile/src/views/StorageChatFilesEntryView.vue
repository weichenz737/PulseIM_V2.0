<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { formatBytes } from '@/utils/storageCache'
import { loadStorageOverview, type StorageOverview } from '@/utils/storageService'
import { smartBack } from '@/utils/navBack'

const router = useRouter()
const overview = ref<StorageOverview | null>(null)
const loading = ref(true)
const errorText = ref('')

onMounted(async () => {
  try { overview.value = await loadStorageOverview() }
  catch (error) { errorText.value = error instanceof Error ? error.message : '数据暂时无法读取' }
  finally { loading.value = false }
})
</script>

<template>
  <div class="entry-page">
    <header class="page-header"><button type="button" class="header-btn" aria-label="返回" @click="smartBack(router)"><span class="material-symbols-outlined">arrow_back_ios</span></button><h1>聊天与文件</h1><span class="header-spacer" /></header>
    <main class="entry-content">
      <div class="intro"><strong>管理当前账号的聊天资源</strong><span>聊天记录与聊天文件分别统计，清理只作用于本设备。</span></div>
      <div v-if="errorText" class="state error">{{ errorText }}</div>
      <section v-else class="entry-list">
        <button type="button" class="entry-row" @click="router.push('/settings/storage/chat-records')"><span class="entry-icon"><span class="material-symbols-outlined">chat_bubble</span></span><span class="entry-body"><strong>清理聊天记录</strong><small>消息正文、索引和必要元数据</small></span><b>{{ loading ? '--' : formatBytes(overview?.inventory.chatRecordsBytes || 0) }}</b><span class="material-symbols-outlined">chevron_right</span></button>
        <button type="button" class="entry-row" @click="router.push('/settings/storage/all-files')"><span class="entry-icon files"><span class="material-symbols-outlined">perm_media</span></span><span class="entry-body"><strong>清理聊天文件</strong><small>图片、视频、文件和音频，可按分类筛选</small></span><b>{{ loading ? '--' : formatBytes(overview?.inventory.chatFilesBytes || 0) }}</b><span class="material-symbols-outlined">chevron_right</span></button>
      </section>
      <p class="note"><span class="material-symbols-outlined">lock</span>当前账号严格隔离。清理聊天文件只删除本机的图片、视频、文件和音频缓存，不修改消息、fileId、收藏/转发引用或服务端对象；原消息仍可重新下载。</p>
    </main>
  </div>
</template>

<style scoped>
.entry-page { min-height: 100%; color: var(--pulse-text); background: var(--pulse-page-bg, var(--pulse-bg)); }.page-header { position: sticky; top: 0; z-index: 10; display: grid; grid-template-columns: 56px 1fr 56px; align-items: center; min-height: 56px; padding: var(--pulse-header-pad-top) 8px 0; background: var(--pulse-page-bg, var(--pulse-bg)); border-bottom: 1px solid var(--pulse-divider); }.page-header h1 { margin: 0; text-align: center; font-size: 18px; }.header-btn,.header-spacer { width: 40px; height: 40px; }.header-btn { border: 0; background: transparent; color: var(--pulse-text); }.entry-content { padding: 16px; }.intro { display: flex; flex-direction: column; gap: 5px; padding: 16px; border-radius: 16px; background: color-mix(in srgb, var(--pulse-primary) 10%, var(--pulse-surface-container)); }.intro strong { font-size: 16px; }.intro span,.note { color: var(--pulse-outline); font-size: 12px; line-height: 1.55; }.entry-list { margin-top: 14px; overflow: hidden; border: 1px solid var(--pulse-border); border-radius: 18px; background: var(--pulse-surface-container); }.entry-row { display: grid; grid-template-columns: 44px minmax(0,1fr) auto 20px; align-items: center; gap: 11px; width: 100%; min-height: 88px; padding: 12px 14px; border: 0; border-bottom: 1px solid var(--pulse-divider); color: var(--pulse-text); background: transparent; text-align: left; font: inherit; }.entry-row:last-child { border-bottom: 0; }.entry-row:active { background: var(--pulse-pressed); }.entry-icon { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 14px; color: var(--pulse-primary); background: color-mix(in srgb, var(--pulse-primary) 12%, transparent); }.entry-icon.files { color: #8b6cff; background: color-mix(in srgb, #8b6cff 12%, transparent); }.entry-body { display: flex; min-width: 0; flex-direction: column; gap: 5px; }.entry-body strong { font-size: 15px; }.entry-body small,.entry-row b,.entry-row > .material-symbols-outlined { color: var(--pulse-outline); font-size: 11px; font-weight: 400; }.entry-row b { white-space: nowrap; }.entry-row > .material-symbols-outlined { font-size: 19px; }.note { display: flex; gap: 6px; margin: 16px 3px; }.note .material-symbols-outlined { color: var(--pulse-primary); font-size: 17px; }.state { padding: 40px; text-align: center; color: var(--pulse-outline); }.state.error { color: var(--pulse-error); }
</style>

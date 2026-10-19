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
  <div class="other-page">
    <header class="page-header"><button type="button" class="header-btn" aria-label="返回" @click="smartBack(router)"><span class="material-symbols-outlined">arrow_back_ios</span></button><h1>其他数据</h1><span class="header-spacer" /></header>
    <main class="other-content">
      <section class="summary"><span class="material-symbols-outlined">database</span><strong>{{ loading ? '计算中…' : formatBytes(overview?.otherDataBytes || 0) }}</strong><p>不能归入聊天记录、聊天文件或缓存的 PulseIM 本地数据</p></section>
      <div v-if="errorText" class="state error">{{ errorText }}</div>
      <section v-else class="data-list">
        <div class="data-row"><span class="material-symbols-outlined">storage</span><div><strong>应用数据</strong><small>当前账号资料与运行状态</small></div><b>{{ loading ? '--' : formatBytes(Math.max(0, (overview?.device.appUsedBytes || 0) - (overview?.cache.total || 0))) }}</b></div>
        <div class="data-row"><span class="material-symbols-outlined">table_chart</span><div><strong>数据库与索引</strong><small>消息索引、搜索索引及必要数据库</small></div><b>包含在应用数据中</b></div>
        <div class="data-row"><span class="material-symbols-outlined">download</span><div><strong>下载数据</strong><small>应用专属目录中的用户主动下载内容</small></div><b>系统管理</b></div>
        <div class="data-row"><span class="material-symbols-outlined">description</span><div><strong>日志与其他必要数据</strong><small>故障诊断和业务运行所需数据</small></div><b>受保护</b></div>
      </section>
      <p class="notice"><span class="material-symbols-outlined">shield</span>这里仅提供查看，不提供“一键全部删除”。登录状态、用户设置、收藏、聊天数据库和服务端文件不会从此处被移除。</p>
    </main>
  </div>
</template>

<style scoped>
.other-page { min-height: 100%; color: var(--pulse-text); background: var(--pulse-page-bg, var(--pulse-bg)); }.page-header { position: sticky; top: 0; z-index: 10; display: grid; grid-template-columns: 56px 1fr 56px; align-items: center; min-height: 56px; padding: var(--pulse-header-pad-top) 8px 0; background: var(--pulse-page-bg, var(--pulse-bg)); border-bottom: 1px solid var(--pulse-divider); }.page-header h1 { margin: 0; text-align: center; font-size: 18px; }.header-btn,.header-spacer { width: 40px; height: 40px; }.header-btn { border: 0; background: transparent; color: var(--pulse-text); }.other-content { padding: 16px; }.summary { display: flex; flex-direction: column; align-items: center; padding: 24px 18px; border: 1px solid var(--pulse-border); border-radius: 20px; background: var(--pulse-surface-container); }.summary .material-symbols-outlined { color: var(--pulse-primary); font-size: 32px; }.summary strong { margin-top: 8px; font-size: 30px; }.summary p { margin: 8px 0 0; color: var(--pulse-outline); font-size: 12px; text-align: center; }.data-list { margin-top: 14px; overflow: hidden; border: 1px solid var(--pulse-border); border-radius: 18px; background: var(--pulse-surface-container); }.data-row { display: grid; grid-template-columns: 28px minmax(0,1fr) auto; align-items: center; gap: 10px; min-height: 68px; padding: 9px 14px; border-bottom: 1px solid var(--pulse-divider); }.data-row:last-child { border-bottom: 0; }.data-row > .material-symbols-outlined { color: var(--pulse-primary); }.data-row div { display: flex; min-width: 0; flex-direction: column; gap: 4px; }.data-row strong { font-size: 14px; }.data-row small,.data-row b { color: var(--pulse-outline); font-size: 11px; font-weight: 400; }.data-row b { white-space: nowrap; }.notice { display: flex; gap: 7px; margin: 16px 4px; color: var(--pulse-outline); font-size: 12px; line-height: 1.6; }.notice .material-symbols-outlined { color: var(--pulse-primary); font-size: 17px; }.state { padding: 40px; text-align: center; color: var(--pulse-outline); }.state.error { color: var(--pulse-error); }
</style>

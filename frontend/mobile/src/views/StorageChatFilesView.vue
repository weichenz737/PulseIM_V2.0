<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { formatBytes } from '@/utils/storageCache'
import { invalidateStorageInventory, loadStorageInventory, type StorageConversationStat } from '@/utils/storageService'
import { markConversationsLocallyCleared } from '@/utils/localChatHistory'
import { clearChatWarmCache } from '@/stores/chatWarmCache'
import { smartBack } from '@/utils/navBack'

const router = useRouter()
const stats = ref<StorageConversationStat[]>([])
const selected = ref<Set<string>>(new Set())
const selectMode = ref(false)
const loading = ref(true)
const deleting = ref(false)
const errorText = ref('')

const selectedStats = computed(() => stats.value.filter((stat) => selected.value.has(stat.conversation.id)))
const selectedBytes = computed(() => selectedStats.value.reduce((sum, stat) => sum + stat.recordsBytes, 0))
const allSelected = computed(() => stats.value.length > 0 && selected.value.size === stats.value.length)

async function load(force = false) {
  loading.value = true
  errorText.value = ''
  try { stats.value = (await loadStorageInventory(force)).conversations }
  catch (error) { errorText.value = error instanceof Error ? error.message : '会话记录暂时无法读取' }
  finally { loading.value = false }
}

function toggle(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id); else next.add(id)
  selected.value = next
}
function toggleAll() { selected.value = allSelected.value ? new Set() : new Set(stats.value.map((stat) => stat.conversation.id)) }
function enterSelection() { selectMode.value = true }
function finishSelection() { selectMode.value = false; selected.value = new Set() }
function onCheckClick(id: string) {
  if (!selectMode.value) enterSelection()
  toggle(id)
}
function onRecordClick(stat: StorageConversationStat) {
  if (!selectMode.value) enterSelection()
  toggle(stat.conversation.id)
}
function openFiles(stat: StorageConversationStat) {
  void router.push({ path: `/settings/storage/conversations/${stat.conversation.id}/files`, query: { name: stat.conversation.name, type: stat.conversation.type, avatar: stat.conversation.avatar } })
}

async function deleteSelected() {
  if (!selectedStats.value.length || deleting.value) return
  try {
    await showConfirmDialog({ title: '清理聊天记录', message: `清理所选 ${selectedStats.value.length} 个会话的本设备消息缓存？服务端消息及其他设备上的聊天记录不会改变。`, cancelButtonText: '取消', confirmButtonText: '确认清理', confirmButtonColor: 'var(--pulse-error)' })
  } catch { return }
  deleting.value = true
  const conversationIds = selectedStats.value.map((stat) => stat.conversation.id)
  markConversationsLocallyCleared(conversationIds)
  clearChatWarmCache()
  deleting.value = false
  invalidateStorageInventory()
  selected.value = new Set()
  await load(true)
  showToast('本设备聊天记录已清理')
}

function goBack() {
  if (selectMode.value) {
    finishSelection()
    return
  }
  smartBack(router)
}

function onNativeBack(event: Event) {
  if (!selectMode.value) return
  finishSelection()
  event.preventDefault()
}

onMounted(() => {
  window.addEventListener('pulse:native-back', onNativeBack)
  void load()
})

onUnmounted(() => {
  window.removeEventListener('pulse:native-back', onNativeBack)
})
</script>

<template>
  <div class="records-page">
    <header class="page-header">
      <button type="button" class="header-btn" aria-label="返回" @click="goBack"><span class="material-symbols-outlined">arrow_back_ios</span></button>
      <h1>清理聊天记录</h1>
      <button type="button" class="header-text-btn" @click="selectMode ? finishSelection() : enterSelection()">{{ selectMode ? '完成' : '选择' }}</button>
    </header>
    <main class="records-content" :class="{ 'with-selection': selectMode }">
      <div class="intro"><strong>按会话清理</strong><span>只清理当前设备上的聊天记录，不会删除服务端消息。</span></div>
      <div v-if="loading" class="state"><span class="material-symbols-outlined spinning">sync</span>正在统计会话…</div>
      <div v-else-if="errorText" class="state error"><span>{{ errorText }}</span><button type="button" @click="load(true)">重试</button></div>
      <div v-else-if="!stats.length" class="state">暂无聊天记录</div>
      <section v-else class="record-list">
         <div v-for="stat in stats" :key="stat.conversation.id" class="record-row" :class="{ selected: selectMode && selected.has(stat.conversation.id) }" tabindex="0" @click="onRecordClick(stat)" @keydown.enter="onRecordClick(stat)">
           <button type="button" class="check" :class="{ checked: selected.has(stat.conversation.id) }" :aria-checked="selected.has(stat.conversation.id)" role="checkbox" aria-label="选择会话" @click.stop="onCheckClick(stat.conversation.id)"><span v-if="selected.has(stat.conversation.id)" class="material-symbols-outlined">check</span></button>
           <img v-if="stat.conversation.avatar" :src="stat.conversation.avatar" alt="" class="avatar" /><span v-else class="avatar avatar-fallback">{{ stat.conversation.name.slice(0, 1) }}</span>
           <span class="row-body"><strong>{{ stat.conversation.name }}</strong><small>{{ formatBytes(stat.recordsBytes) }} · {{ stat.messageCount }} 条消息</small></span>
           <span class="row-size">{{ formatBytes(stat.recordsBytes) }}</span><button type="button" class="record-open" :aria-label="`查看${stat.conversation.name}的聊天记录`" @click.stop="openFiles(stat)"><span class="material-symbols-outlined chevron">chevron_right</span></button>
         </div>
      </section>
      <p class="footnote">聊天记录大小统计消息正文、索引和必要元数据；图片、视频、音频和文件单独计入“聊天文件”，不会重复计算。</p>
    </main>
      <footer v-if="selectMode" class="selection-bar">
        <span class="selection-handle" aria-hidden="true" />
        <div class="selection-summary">
          <div>
            <strong>已选 {{ selected.size }} 个会话</strong>
            <small>预计释放空间：{{ formatBytes(selectedBytes) }}</small>
          </div>
        </div>
      <div class="selection-actions">
        <button type="button" class="secondary" @click="toggleAll">
          <span class="material-symbols-outlined">checklist</span>
          {{ allSelected ? '取消全选' : '全选' }}
        </button>
        <button type="button" class="danger" :disabled="!selected.size || deleting" @click="deleteSelected">
          <span class="material-symbols-outlined">delete</span>
          {{ deleting ? '删除中…' : '删除' }}
        </button>
        <button type="button" class="cancel" @click="finishSelection">
          <span class="material-symbols-outlined">close</span>
          取消
        </button>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.records-page { min-height: 100%; background: var(--pulse-page-bg, var(--pulse-bg)); color: var(--pulse-text); }.page-header { position: sticky; top: 0; z-index: 10; display: grid; grid-template-columns: 72px minmax(0, 1fr) 72px; align-items: center; min-height: 56px; padding: var(--pulse-header-pad-top) 8px 0; background: var(--pulse-page-bg, var(--pulse-bg)); border-bottom: 1px solid var(--pulse-divider); }.page-header h1 { margin: 0; text-align: center; font-size: 18px; font-weight: 650; }.header-btn,.header-text-btn { border: 0; background: transparent; color: var(--pulse-text); font: inherit; }.header-btn { display: grid; place-items: center; width: 40px; height: 40px; }.header-text-btn { justify-self: end; padding: 10px 8px; color: var(--pulse-primary); font-size: 14px; font-weight: 650; }.records-content { padding: 14px 16px calc(90px + env(safe-area-inset-bottom)); }.intro { display: flex; flex-direction: column; gap: 5px; padding: 15px 16px; border-radius: 16px; background: color-mix(in srgb, var(--pulse-primary) 10%, var(--pulse-surface-container)); }.intro strong { font-size: 16px; }.intro span,.footnote { color: var(--pulse-outline); font-size: 12px; line-height: 1.55; }.record-list { margin-top: 14px; overflow: hidden; border: 1px solid var(--pulse-border); border-radius: 18px; background: var(--pulse-surface-container); }.record-row { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 76px; padding: 10px 12px; border: 0; border-bottom: 1px solid var(--pulse-divider); color: inherit; background: transparent; text-align: left; font: inherit; cursor: pointer; transition: background .18s ease; }.record-row:last-child { border-bottom: 0; }.record-row:active { background: var(--pulse-pressed); }.record-row:focus-visible { outline: 2px solid var(--pulse-primary); outline-offset: -2px; }.record-row.selected { background: color-mix(in srgb, var(--pulse-primary) 9%, transparent); }.check { display: grid; place-items: center; flex: 0 0 auto; width: 23px; height: 23px; padding: 0; border: 1.5px solid var(--pulse-outline); border-radius: 50%; color: var(--pulse-text); background: transparent; font: inherit; }.check.checked { border-color: var(--pulse-primary); color: #fff; background: var(--pulse-primary); }.check .material-symbols-outlined { font-size: 17px; }.avatar { flex: 0 0 auto; width: 45px; height: 45px; border-radius: 50%; object-fit: cover; }.avatar-fallback { display: grid; place-items: center; color: var(--pulse-primary); background: var(--pulse-surface-highest); font-weight: 700; }.row-body { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 5px; }.row-body strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 15px; }.row-body small { color: var(--pulse-outline); font-size: 12px; }.row-size { color: var(--pulse-outline); font-size: 12px; white-space: nowrap; }.record-open { display: grid; place-items: center; flex: 0 0 auto; width: 32px; height: 40px; margin: -10px -8px -10px 0; padding: 0; border: 0; border-radius: 10px; color: var(--pulse-outline); background: transparent; }.record-open:active { color: var(--pulse-primary); background: var(--pulse-pressed); }.chevron { font-size: 19px; }.state { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 220px; color: var(--pulse-outline); font-size: 13px; }.state.error { flex-direction: column; color: var(--pulse-error); }.state button { border: 0; background: transparent; color: var(--pulse-primary); font: inherit; font-weight: 650; }.footnote { margin: 15px 3px 0; }.selection-bar { position: fixed; right: 0; bottom: 0; left: 0; z-index: 20; padding: 8px 14px calc(env(safe-area-inset-bottom) + 12px); border-top: 1px solid var(--pulse-border); border-radius: 20px 20px 0 0; background: color-mix(in srgb, var(--pulse-surface-container) 96%, transparent); box-shadow: 0 -12px 32px rgba(0, 0, 0, .18); backdrop-filter: blur(18px); }.selection-handle { display: block; width: 34px; height: 4px; margin: 0 auto 10px; border-radius: 999px; background: var(--pulse-outline); opacity: .45; }.selection-summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }.selection-summary > div { display: flex; min-width: 0; flex-direction: column; gap: 3px; }.selection-summary strong { color: var(--pulse-text); font-size: 14px; }.selection-summary small { color: var(--pulse-outline); font-size: 11px; }.selection-actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }.selection-actions button { display: flex; align-items: center; justify-content: center; min-width: 0; min-height: 40px; padding: 0 8px; border: 0; border-radius: 12px; background: var(--pulse-surface-high); color: var(--pulse-text); font: inherit; font-size: 12px; font-weight: 550; }.selection-actions button .material-symbols-outlined { margin-right: 4px; font-size: 18px; }.selection-actions button:active { opacity: .72; }.selection-actions button:disabled { opacity: .42; }.selection-actions button.danger { color: var(--pulse-error); }.selection-actions button.cancel { color: var(--pulse-outline); }.spinning { animation: spin .8s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }
</style>
<style scoped>
/* 标题脱离按钮布局，定位在安全区下方的整行中心，避免被挤到第二行。 */
.records-page > .page-header {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
}

.records-page > .page-header > h1 {
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

.records-page > .page-header > .header-btn {
  position: relative !important;
  z-index: 2 !important;
  flex: 0 0 auto !important;
  margin: 0 !important;
}

.records-page > .page-header > .header-text-btn {
  position: relative !important;
  z-index: 2 !important;
  flex: 0 0 auto !important;
  margin: 0 !important;
}
</style>
<style scoped>
.records-content { padding-bottom: 28px; }
.records-content.with-selection { padding-bottom: calc(158px + env(safe-area-inset-bottom)); }
.record-row { transition: background .18s ease; }
.record-row.selected { background: color-mix(in srgb, var(--pulse-primary) 9%, transparent); }
.selection-bar { display: block; padding: 8px 14px calc(env(safe-area-inset-bottom) + 12px); border-top: 1px solid var(--pulse-border); border-radius: 20px 20px 0 0; background: color-mix(in srgb, var(--pulse-surface-container) 96%, transparent); box-shadow: 0 -12px 32px rgba(0, 0, 0, .18); backdrop-filter: blur(18px); }
.selection-handle { display: block; width: 34px; height: 4px; margin: 0 auto 10px; border-radius: 999px; background: var(--pulse-outline); opacity: .45; }
.selection-summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.selection-summary > div { display: flex; min-width: 0; flex-direction: column; gap: 3px; }
.selection-summary strong { color: var(--pulse-text); font-size: 14px; }
.selection-summary small { color: var(--pulse-outline); font-size: 11px; }
.selection-actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.selection-actions button { display: flex; align-items: center; justify-content: center; min-width: 0; min-height: 40px; padding: 0 8px; border: 0; border-radius: 12px; background: var(--pulse-surface-high); color: var(--pulse-text); font: inherit; font-size: 12px; font-weight: 550; }
.selection-actions button .material-symbols-outlined { margin-right: 4px; font-size: 18px; }
.selection-actions button:active { opacity: .72; }
.selection-actions button:disabled { opacity: .42; }
.selection-actions button.danger { color: var(--pulse-error); }
.selection-actions button.cancel { color: var(--pulse-outline); }
</style>

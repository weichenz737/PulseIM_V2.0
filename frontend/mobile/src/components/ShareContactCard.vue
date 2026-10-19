<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { showConfirmDialog, showToast } from 'vant'
import { fetchConversations, type ConversationItem } from '@/api/conversation'
import { sendTextMessage, type ContactCardPayload } from '@/api/message'

const props = defineProps<{ show: boolean; card: ContactCardPayload }>()
const emit = defineEmits<{ 'update:show': [value: boolean] }>()
const loading = ref(false)
const sending = ref(false)
const targets = ref<ConversationItem[]>([])
const selected = ref(new Set<string>())
let cachedTargets: ConversationItem[] | null = null
let targetsRequest: Promise<ConversationItem[]> | null = null

const selectedCount = computed(() => selected.value.size)
const cardLabel = computed(() => {
  if (props.card.cardType === 'community') return '圈子名片'
  if (props.card.cardType === 'group') return '群名片'
  return '个人名片'
})
async function loadTargets(background = false) {
  if (cachedTargets) { targets.value = cachedTargets; return }
  if (!background) loading.value = true
  try {
    targetsRequest ||= fetchConversations('all')
    cachedTargets = await targetsRequest
    targets.value = cachedTargets
  } catch {
    targetsRequest = null
    if (!background) showToast('加载会话失败')
  } finally { loading.value = false }
}

onMounted(() => {
  const warm = () => void loadTargets(true)
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(warm, { timeout: 1200 })
  else window.setTimeout(warm, 180)
})

watch(() => props.show, async (show) => {
  if (!show) return
  selected.value = new Set()
  await loadTargets(false)
})

function toggle(id: string) {
  const next = new Set(selected.value)
  next.has(id) ? next.delete(id) : next.add(id)
  selected.value = next
}

async function submit() {
  if (!selectedCount.value || sending.value) return showToast('请选择发送目标')
  try {
    await showConfirmDialog({
      title: `确认发送${cardLabel.value}`,
      message: `确定发送给已选择的 ${selectedCount.value} 个会话吗？`,
      cancelButtonText: '取消',
      confirmButtonText: '发送',
    })
  } catch {
    return
  }
  sending.value = true
  try {
    await Promise.all([...selected.value].map((conversationId) => sendTextMessage({
      conversationId,
      content: JSON.stringify(props.card),
      msgType: 5,
      clientMsgId: `card_${Date.now()}_${conversationId}_${Math.random().toString(36).slice(2, 8)}`,
    })))
    emit('update:show', false)
    showToast(`${cardLabel.value}已发送至 ${selectedCount.value} 个会话`)
  } catch (e) { showToast(e instanceof Error ? e.message : `${cardLabel.value}发送失败`) }
  finally { sending.value = false }
}
</script>

<template>
  <van-popup :show="show" position="bottom" round :duration="0.18" :lazy-render="false" @update:show="emit('update:show', $event)">
    <div class="share-card-sheet">
      <div class="share-head">
        <span class="share-head-icon material-symbols-outlined">ios_share</span>
        <div><h3>分享{{ cardLabel }}</h3><p>选择好友或群聊，可同时发送给多人</p></div>
      </div>
      <div class="target-list">
        <div v-if="loading" class="state">加载中...</div>
        <div v-else-if="!targets.length" class="state">暂无会话</div>
        <button
          v-for="item in targets"
          v-else
          :key="item.id"
          type="button"
          class="target"
          :class="{ selected: selected.has(item.id) }"
          @click="toggle(item.id)"
        >
          <img v-if="item.avatar" :src="item.avatar" :alt="item.name" />
          <span v-else class="avatar">{{ item.name.slice(0, 1) }}</span>
          <span class="name" :title="item.name">{{ item.name }}</span>
          <span class="check" :class="{ selected: selected.has(item.id) }">
            <span v-if="selected.has(item.id)" class="material-symbols-outlined">check</span>
          </span>
        </button>
      </div>
      <div class="share-footer">
        <span class="selected-tip">{{ selectedCount ? `已选择 ${selectedCount} 个` : '请选择发送对象' }}</span>
        <button class="submit" type="button" :disabled="!selectedCount || sending" @click="submit">
          {{ sending ? '发送中...' : '发送' }}
        </button>
      </div>
    </div>
  </van-popup>
</template>

<style scoped>
.share-card-sheet{--share-action:#315fbd;display:flex;max-height:76vh;box-sizing:border-box;flex-direction:column;padding:18px 16px calc(14px + env(safe-area-inset-bottom));overflow:hidden;background:var(--pulse-surface-container);color:var(--pulse-text)}
.share-head{display:flex;align-items:center;gap:12px;padding:2px 38px 15px 2px}.share-head-icon{display:grid;width:42px;height:42px;flex:0 0 42px;place-items:center;border-radius:14px;background:color-mix(in srgb,var(--share-action) 17%,transparent);color:var(--share-action);font-size:22px}.share-head>div{min-width:0}.share-head h3{margin:0;font-size:18px;line-height:1.3}.share-head p{margin:4px 0 0;color:var(--pulse-text-secondary);font-size:12px;line-height:1.4}.state{padding:30px;text-align:center;color:var(--pulse-text-secondary)}
.target-list{min-height:0;overflow-y:auto;overscroll-behavior:contain}.target{display:flex;width:100%;min-height:62px;box-sizing:border-box;align-items:center;gap:12px;padding:9px 10px;border:1px solid transparent;border-radius:14px;background:transparent;color:inherit;content-visibility:auto;contain-intrinsic-size:62px}.target+.target{margin-top:3px}.target.selected{border-color:color-mix(in srgb,var(--share-action) 32%,transparent);background:color-mix(in srgb,var(--share-action) 9%,transparent)}.target img,.avatar{width:42px;height:42px;flex:0 0 42px;border-radius:13px;object-fit:cover}.avatar{display:grid;place-items:center;background:color-mix(in srgb,var(--share-action) 14%,var(--pulse-surface-high));color:var(--share-action);font-weight:700}.name{min-width:0;flex:1;overflow:hidden;padding-right:6px;text-align:left;text-overflow:ellipsis;white-space:nowrap;font-size:15px;font-weight:560;line-height:1.35}.check{display:grid;width:24px;height:24px;box-sizing:border-box;flex:0 0 24px;place-items:center;border:1.5px solid var(--pulse-outline);border-radius:50%}.check.selected{background:var(--share-action);border-color:var(--share-action);color:#fff}.check .material-symbols-outlined{font-size:16px;font-weight:700}
.share-footer{display:flex;align-items:center;gap:14px;margin-top:12px;padding-top:12px;border-top:1px solid var(--pulse-outline-variant);background:var(--pulse-surface-container)}.selected-tip{min-width:0;flex:1;color:var(--pulse-text-secondary);font-size:12px}.submit{min-width:112px;height:44px;padding:0 24px;border:0;border-radius:14px;background:var(--share-action);color:#fff;font-weight:700;box-shadow:0 8px 20px color-mix(in srgb,var(--share-action) 24%,transparent)}.submit:disabled{opacity:.42;box-shadow:none}
:global(:root[data-theme='light']) .share-card-sheet{--share-action:#075f9f;background:#fff;color:#14243a}
:global(:root[data-theme='light']) .share-card-sheet .share-footer{background:#fff}
:global(:root[data-theme='light']) .share-card-sheet .submit{background:var(--share-action) !important;color:#fff !important}
</style>

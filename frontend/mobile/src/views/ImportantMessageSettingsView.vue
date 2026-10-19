<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import {
  fetchGroupDetail,
  fetchImportantNotificationSetting,
  updateImportantNotificationSetting,
  type GroupDetail,
  type ImportantNotificationSetting,
} from '@/api/conversation'
import { smartBack } from '@/utils/navBack'

defineOptions({ name: 'ImportantMessageSettingsView' })

const route = useRoute()
const router = useRouter()
const conversationId = computed(() => route.params.id as string)
const detail = ref<GroupDetail | null>(null)
const setting = ref<ImportantNotificationSetting>({
  atAll: true,
  mentionMe: true,
  replyMe: true,
  announcement: true,
  followedMemberIds: [],
})
const loading = ref(true)
const saving = ref(false)
const showMemberPicker = ref(false)
const draftFollowedIds = ref<string[]>([])

const options = [
  { key: 'atAll' as const, title: '@全体成员', sub: '群主或管理员@全体成员时通知' },
  { key: 'mentionMe' as const, title: '有人@我', sub: '有人在群内提到你时通知' },
  { key: 'replyMe' as const, title: '有人回复我', sub: '有人回复你发出的消息时通知' },
  { key: 'announcement' as const, title: '群公告', sub: '群主或管理员发布群公告时通知' },
]

async function load() {
  loading.value = true
  try {
    const [group, preferences] = await Promise.all([
      fetchGroupDetail(conversationId.value),
      fetchImportantNotificationSetting(conversationId.value),
    ])
    detail.value = group
    setting.value = preferences
  } catch (e) {
    showToast(e instanceof Error ? e.message : '加载失败')
  } finally {
    loading.value = false
  }
}

async function save() {
  if (saving.value) return
  saving.value = true
  try {
    await updateImportantNotificationSetting(conversationId.value, setting.value)
    showToast('设置已保存')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '保存失败')
  } finally {
    saving.value = false
  }
}

function openMemberPicker() {
  draftFollowedIds.value = [...setting.value.followedMemberIds]
  showMemberPicker.value = true
}

function toggleMember(userId: string) {
  const next = new Set(draftFollowedIds.value)
  if (next.has(userId)) next.delete(userId)
  else next.add(userId)
  draftFollowedIds.value = [...next]
}

async function confirmMemberPicker() {
  setting.value.followedMemberIds = [...draftFollowedIds.value]
  showMemberPicker.value = false
  await save()
}

function memberName(userId: string) {
  return detail.value?.members.find((member) => member.userId === userId)?.nickname || '群成员'
}

function goBack() {
  smartBack(router)
}

onMounted(() => void load())
</script>

<template>
  <div class="important-page">
    <header class="page-header">
      <button type="button" class="icon-btn" aria-label="返回" @click="goBack">
        <span class="material-symbols-outlined">arrow_back_ios</span>
      </button>
      <h1 class="page-title">重要消息仍通知</h1>
      <span class="spacer" />
    </header>

    <main v-if="loading" class="loading-state">加载中...</main>
    <main v-else class="page-main">
      <p class="intro">开启消息免打扰后，下面的消息仍会继续通知。</p>
      <section class="card">
        <div v-for="option in options" :key="option.key" class="setting-row">
          <div class="setting-copy"><strong>{{ option.title }}</strong><small>{{ option.sub }}</small></div>
          <label class="switch">
            <input v-model="setting[option.key]" type="checkbox" :disabled="saving" @change="save" />
            <span class="slider" />
          </label>
        </div>
      </section>

      <section class="card">
        <button type="button" class="follow-row" @click="openMemberPicker">
          <div class="setting-copy"><strong>关注群成员的消息</strong><small>{{ setting.followedMemberIds.length ? setting.followedMemberIds.map(memberName).join('、') : '点击添加成员' }}</small></div>
          <span class="material-symbols-outlined chevron">chevron_right</span>
        </button>
      </section>
      <p class="tip">关注的群成员在群内发消息时，即使开启免打扰也会继续通知。</p>
    </main>

    <div v-if="showMemberPicker" class="sheet-mask" @click="showMemberPicker = false">
      <div class="sheet" @click.stop>
        <div class="sheet-header"><button type="button" @click="showMemberPicker = false">取消</button><h3>关注群成员</h3><button type="button" class="confirm" @click="confirmMemberPicker">完成</button></div>
        <div class="member-list">
          <button v-for="member in detail?.members || []" :key="member.userId" type="button" class="member-row" @click="toggleMember(member.userId)">
            <span class="member-avatar">{{ member.nickname.slice(0, 1) }}</span><span class="member-name">{{ member.nickname }}</span><span class="check" :class="{ on: draftFollowedIds.includes(member.userId) }"><span v-if="draftFollowedIds.includes(member.userId)" class="material-symbols-outlined">check</span></span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.important-page{min-height:100%;background:var(--pulse-page-bg,var(--pulse-bg));color:var(--pulse-text);padding-bottom:48px}.page-header{position:sticky;top:0;z-index:20;display:flex;align-items:center;height:56px;padding:var(--pulse-header-pad-top) 12px 0;background:var(--pulse-page-bg,var(--pulse-bg))}.icon-btn{width:40px;height:40px;border:0;background:transparent;color:var(--pulse-primary);display:grid;place-items:center}.page-title{flex:1;margin:0;text-align:center;color:var(--pulse-primary);font-size:18px;font-weight:700}.spacer{width:40px}.page-main{padding:18px 16px}.intro,.tip{margin:0 4px 12px;color:var(--pulse-outline);font-size:13px;line-height:1.5}.card{margin:0 0 16px;overflow:hidden;border-radius:15px;background:var(--pulse-surface-container)}.setting-row,.follow-row{width:100%;display:flex;align-items:center;gap:14px;padding:16px;border:0;border-bottom:1px solid var(--pulse-divider);background:transparent;color:var(--pulse-text);text-align:left}.setting-row:last-child,.follow-row:last-child{border-bottom:0}.setting-copy{min-width:0;flex:1;display:flex;flex-direction:column;gap:5px}.setting-copy strong{font-size:15px;font-weight:650}.setting-copy small{color:var(--pulse-outline);font-size:12px;line-height:1.4}.switch{position:relative;display:inline-flex;width:46px;height:28px;flex:0 0 auto}.switch input{position:absolute;opacity:0}.slider{position:absolute;inset:0;border-radius:99px;background:var(--pulse-outline-variant);transition:.2s}.slider:before{position:absolute;content:"";width:22px;height:22px;left:3px;top:3px;border-radius:50%;background:#fff;transition:.2s;box-shadow:0 2px 5px #0002}.switch input:checked+.slider{background:var(--pulse-primary)}.switch input:checked+.slider:before{transform:translateX(18px)}.chevron{color:var(--pulse-outline)}.sheet-mask{position:fixed;inset:0;z-index:100;background:#0008;display:flex;align-items:flex-end}.sheet{width:100%;max-height:75vh;overflow:auto;border-radius:20px 20px 0 0;background:var(--pulse-surface-container);padding-bottom:env(safe-area-inset-bottom)}.sheet-header{position:sticky;top:0;display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--pulse-surface-container);border-bottom:1px solid var(--pulse-divider)}.sheet-header h3{margin:0;font-size:16px}.sheet-header button{border:0;background:transparent;color:var(--pulse-outline);font-size:14px}.sheet-header .confirm{color:var(--pulse-primary);font-weight:650}.member-row{width:100%;display:flex;align-items:center;gap:12px;padding:13px 16px;border:0;border-bottom:1px solid var(--pulse-divider);background:transparent;color:var(--pulse-text);text-align:left}.member-avatar{width:38px;height:38px;border-radius:12px;background:var(--pulse-primary-container);color:var(--pulse-primary);display:grid;place-items:center;font-weight:700}.member-name{flex:1}.check{width:22px;height:22px;border:1.5px solid var(--pulse-outline-variant);border-radius:50%;display:grid;place-items:center;color:#fff}.check.on{border-color:var(--pulse-primary);background:var(--pulse-primary)}.check .material-symbols-outlined{font-size:15px}
</style>

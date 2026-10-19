<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { searchPublicGroups, type GroupPreview } from '@/api/conversation'
import { smartBack } from '@/utils/navBack'

defineOptions({ name: 'AddGroupView' })

const router = useRouter()
const keyword = ref('')
const loading = ref(false)
const searched = ref(false)
const results = ref<GroupPreview[]>([])

async function search() {
  const value = keyword.value.trim()
  if (!value) {
    showToast('请输入群号或群名称')
    return
  }
  loading.value = true
  searched.value = true
  try {
    results.value = await searchPublicGroups(value)
    if (!results.value.length) showToast('未找到符合条件的群聊')
  } catch (e) {
    results.value = []
    showToast(e instanceof Error ? e.message : '搜索失败')
  } finally {
    loading.value = false
  }
}

function openGroup(group: GroupPreview) {
  router.push({
    path: `/group/${group.id}/profile`,
    query: { source: 'search', title: group.title, avatar: group.avatarUrl },
  })
}

function goBack() {
  smartBack(router)
}
</script>

<template>
  <div class="add-group-page">
    <header class="page-header">
      <button type="button" class="icon-btn" aria-label="返回" @click="goBack">
        <span class="material-symbols-outlined">arrow_back_ios</span>
      </button>
      <h1 class="page-title">添加群聊</h1>
      <span class="spacer" />
    </header>

    <main class="page-main">
      <section class="search-card">
        <div class="search-wrap">
          <span class="material-symbols-outlined search-icon">search</span>
          <input
            v-model="keyword"
            class="search-input"
            type="text"
            maxlength="64"
            placeholder="输入群号或群名称"
            @keyup.enter="search"
          />
          <button
            v-if="keyword"
            type="button"
            class="search-clear-btn"
            aria-label="清除搜索"
            @click="keyword = ''"
          >
            <span class="material-symbols-outlined">cancel</span>
          </button>
          <button type="button" class="search-button" :disabled="loading" @click="search">
            {{ loading ? '搜索中' : '搜索' }}
          </button>
        </div>
        <p class="search-hint">群主可在群管理中设置群聊是否允许被搜索。</p>
      </section>

      <button type="button" class="scan-card" @click="router.push({ path: '/scan', query: { target: 'group' } })">
        <span class="scan-icon material-symbols-outlined">qr_code_scanner</span>
        <span class="scan-copy"><strong>扫一扫</strong><small>扫描群二维码搜索群聊</small></span>
        <span class="material-symbols-outlined arrow">chevron_right</span>
      </button>

      <section v-if="searched" class="result-section">
        <div class="section-title">搜索结果</div>
        <button v-for="group in results" :key="group.id" type="button" class="group-row" @click="openGroup(group)">
          <div class="group-avatar">{{ group.title.slice(0, 1) }}</div>
          <div class="group-copy">
            <strong>{{ group.title }}</strong>
            <small>群号 {{ group.pulseId }} · {{ group.memberCount }} 名成员</small>
          </div>
          <span class="material-symbols-outlined arrow">chevron_right</span>
        </button>
        <div v-if="!results.length && !loading" class="empty">暂无搜索结果</div>
      </section>

      <section v-else class="empty-intro">
        <span class="material-symbols-outlined">groups</span>
        <p>通过群号或群名称查找公开群聊</p>
      </section>
    </main>
  </div>
</template>

<style scoped>
.add-group-page{min-height:100%;background:var(--pulse-page-bg,var(--pulse-bg));color:var(--pulse-text);padding-bottom:48px}.page-header{position:sticky;top:0;z-index:20;display:flex;align-items:center;height:56px;padding:var(--pulse-header-pad-top) 12px 0;background:var(--pulse-page-bg,var(--pulse-bg))}.icon-btn{width:40px;height:40px;border:0;background:transparent;color:var(--pulse-primary);display:grid;place-items:center}.page-title{flex:1;margin:0;text-align:center;color:var(--pulse-primary);font-size:18px;font-weight:700}.spacer{width:40px}.page-main{padding:20px 16px}.search-card,.scan-card,.result-section{border-radius:16px;background:var(--pulse-surface-container)}.search-card{padding:14px}.search-wrap{display:flex;align-items:center;gap:8px;height:46px;border-radius:12px;background:var(--pulse-surface-high);padding:0 10px}.search-icon{color:var(--pulse-outline);font-size:20px}.search-input{min-width:0;flex:1;border:0;outline:0;background:transparent;color:var(--pulse-text);font-size:15px}.search-button{border:0;border-radius:9px;background:var(--pulse-primary);color:var(--pulse-on-primary);padding:8px 12px;font-weight:650}.search-hint{margin:10px 2px 0;color:var(--pulse-outline);font-size:12px}.scan-card{width:100%;margin-top:14px;padding:16px;display:flex;align-items:center;gap:12px;border:0;color:var(--pulse-text);text-align:left}.scan-icon{width:42px;height:42px;border-radius:13px;background:color-mix(in srgb,var(--pulse-primary) 15%,transparent);color:var(--pulse-primary);display:grid;place-items:center}.scan-copy{display:flex;flex:1;flex-direction:column;gap:4px}.scan-copy strong{font-size:15px}.scan-copy small,.group-copy small{color:var(--pulse-outline);font-size:12px}.arrow{color:var(--pulse-outline)}.result-section{margin-top:18px;overflow:hidden}.section-title{padding:15px 16px 8px;color:var(--pulse-outline);font-size:12px}.group-row{width:100%;display:flex;align-items:center;gap:12px;padding:13px 16px;border:0;border-top:1px solid var(--pulse-divider);background:transparent;color:var(--pulse-text);text-align:left}.group-avatar{width:44px;height:44px;border-radius:13px;background:var(--pulse-primary-container);color:var(--pulse-primary);display:grid;place-items:center;font-size:19px;font-weight:700}.group-copy{min-width:0;flex:1;display:flex;flex-direction:column;gap:5px}.group-copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px}.empty,.empty-intro{color:var(--pulse-outline);font-size:13px;text-align:center}.empty{padding:28px 16px}.empty-intro{padding:80px 20px}.empty-intro .material-symbols-outlined{font-size:42px;color:var(--pulse-primary)}.empty-intro p{margin:12px 0}
</style>

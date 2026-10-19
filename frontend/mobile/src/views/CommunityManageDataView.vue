<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { fetchCommunityDashboardDetails, type CommunityDashboardDetail } from '@/api/community'
import { resolveAvatarUrl } from '@/api/file'
import { smartBack } from '@/utils/navBack'

const route = useRoute()
const router = useRouter()
const communityId = Number(route.params.id)
const type = String(route.params.type || '').toUpperCase()
const loading = ref(true)
const refreshing = ref(false)
const rows = ref<CommunityDashboardDetail[]>([])
const titles: Record<string, string> = {
  TOTAL_MEMBERS: '总成员明细', TODAY_NEW: '今日新增成员', CUMULATIVE_JOIN: '累计加入记录',
  CUMULATIVE_EXIT: '累计退出记录', ACTIVE_MEMBERS: '活跃成员', POSTS: '动态列表',
  INCOME_TOTAL: '累计收入明细', INCOME_TODAY: '今日收入明细', ORDERS: '圈子订单',
}
const title = computed(() => titles[type] || '数据明细')

async function load(silent = false) {
  if (!silent) loading.value = true
  try {
    rows.value = await fetchCommunityDashboardDetails(communityId, type)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '明细加载失败')
  } finally {
    if (!silent) loading.value = false
  }
}

async function onPullRefresh() {
  refreshing.value = true
  try {
    await load(true)
  } finally {
    refreshing.value = false
  }
}

onMounted(() => { void load() })

function goBack() { smartBack(router, `/communities/${communityId}/manage`) }
function formatDate(value?: string) { return value ? new Date(value).toLocaleString() : '—' }
function roleLabel(value?: string) { return ({ OWNER: '圈主', ADMIN: '管理员', MEMBER: '成员' } as Record<string,string>)[String(value)] || '成员' }
function statusLabel(value?: string) { return ({ ACTIVE: '正常', MUTED: '已禁言', REMOVED: '已退出', PUBLISHED: '已发布', PENDING: '待审核', BLOCKED: '已屏蔽', DELETED: '已删除' } as Record<string,string>)[String(value)] || String(value || '') }
function openRow(row: CommunityDashboardDetail) {
  if (row.item_type === 'POST') void router.push(`/communities/${communityId}/posts/${row.id}`)
}
</script>

<template>
  <div class="data-page">
    <header class="page-header"><button type="button" class="icon-btn" aria-label="返回" @click="goBack"><span class="material-symbols-outlined">arrow_back_ios</span></button><h1>{{ title }}</h1><span class="header-spacer" /></header>
    <van-pull-refresh v-model="refreshing" class="data-pull" success-text="刷新成功" @refresh="onPullRefresh">
      <div v-if="loading" class="state">加载中…</div>
      <main v-else class="data-list">
        <article v-for="row in rows" :key="`${row.item_type}-${row.id}`" class="data-card" :class="{ clickable: row.item_type === 'POST' }" @click="openRow(row)">
          <template v-if="row.item_type === 'MEMBER'">
            <img v-if="row.avatar_url" :src="resolveAvatarUrl(row.avatar_url)" alt="" class="avatar" /><span v-else class="avatar initials">{{ row.nickname?.slice(0,1) }}</span>
            <div class="card-copy"><strong>{{ row.nickname || '用户' }}</strong><small>{{ roleLabel(row.role) }} · {{ statusLabel(row.status) }}</small><time>{{ row.operation_label }}：{{ formatDate(row.operation_date) }}</time></div>
          </template>
          <template v-else-if="row.item_type === 'POST'">
            <span class="type-icon material-symbols-outlined">article</span><div class="card-copy"><strong>{{ row.nickname || '用户' }} · {{ statusLabel(row.status) }}</strong><p>{{ row.content || '媒体动态' }}</p><time>发布时间：{{ formatDate(row.operation_date) }}</time><small>{{ row.like_count || 0 }} 赞 · {{ row.comment_count || 0 }} 评论</small></div><span class="arrow material-symbols-outlined">chevron_right</span>
          </template>
          <template v-else>
            <span class="type-icon money material-symbols-outlined">receipt_long</span><div class="card-copy"><strong>{{ row.nickname || '用户' }} · {{ ((row.owner_income || 0) / 100).toFixed(2) }} PLU</strong><small>订单金额 {{ ((row.amount || 0) / 100).toFixed(2) }} PLU</small><p>订单号：{{ row.order_no }}</p><time>支付时间：{{ formatDate(row.operation_date) }}</time></div>
          </template>
        </article>
        <div v-if="!rows.length" class="state">暂无相关记录</div>
      </main>
    </van-pull-refresh>
  </div>
</template>

<style scoped>
.data-page{min-height:100dvh;background:var(--pulse-page-bg,var(--pulse-bg));color:var(--pulse-text)}.data-pull{min-height:calc(100dvh - 56px - var(--pulse-header-pad-top))}.page-header{position:sticky;top:0;z-index:10;display:flex;align-items:center;height:56px;padding:0 12px;padding-top:var(--pulse-header-pad-top);background:var(--pulse-page-bg,var(--pulse-bg))}.page-header h1{min-width:0;flex:1;margin:0;text-align:center;color:var(--pulse-primary);font-size:18px}.icon-btn,.header-spacer{width:40px;height:40px;flex:none}.icon-btn{display:grid;place-items:center;border:0;background:transparent;color:var(--pulse-primary)}.data-list{display:flex;flex-direction:column;gap:9px;padding:12px 16px calc(24px + env(safe-area-inset-bottom,0px))}.data-card{display:flex;align-items:center;gap:11px;padding:13px;border:1px solid color-mix(in srgb,var(--pulse-outline-variant) 78%,transparent);border-radius:16px;background:var(--pulse-surface-container)}.data-card.clickable:active{transform:scale(.99)}.avatar{width:44px;height:44px;flex:0 0 44px;border-radius:50%;object-fit:cover;background:var(--pulse-surface-high)}.avatar.initials{display:grid;place-items:center;color:var(--pulse-primary);font-weight:700}.card-copy{display:flex;min-width:0;flex:1;flex-direction:column;gap:4px}.card-copy strong{font-size:14px}.card-copy small,.card-copy time{color:var(--pulse-text-secondary);font-size:11px;font-style:normal}.card-copy p{margin:0;overflow:hidden;color:var(--pulse-text-secondary);font-size:12px;line-height:1.4;text-overflow:ellipsis;white-space:nowrap}.type-icon{display:grid;width:42px;height:42px;flex:0 0 42px;place-items:center;border-radius:13px;background:color-mix(in srgb,var(--pulse-primary) 12%,transparent);color:var(--pulse-primary)}.type-icon.money{background:color-mix(in srgb,#cf8500 12%,transparent);color:#cf8500}.arrow{color:var(--pulse-text-secondary);font-size:19px}.state{padding:56px 16px;text-align:center;color:var(--pulse-text-secondary)}
</style>

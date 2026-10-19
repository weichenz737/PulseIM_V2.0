<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter, type RouteLocationRaw } from 'vue-router'
import { ArrowDown, ArrowUp, DataAnalysis, Refresh, UserFilled, Warning } from '@element-plus/icons-vue'
import { useAdminStore } from '@/stores/admin'
import { todayYmd } from '@/utils/datetime'
import DataCard from '@/components/dashboard/DataCard.vue'
import LineChart from '@/components/dashboard/LineChart.vue'
import AreaChart from '@/components/dashboard/AreaChart.vue'
import BarChart from '@/components/dashboard/BarChart.vue'
import PieChart from '@/components/dashboard/PieChart.vue'
import {
  fetchDashboardOverview,
  fetchGroupRanking,
  fetchMessageStat,
  fetchMomentStat,
  fetchOnlineTrend,
  fetchRiskStat,
  fetchUserRanking,
  fetchUserTrend,
  type DashboardOverview,
  type DashboardQuery,
  type GroupRankingItem,
  type MessageStat,
  type MomentStatItem,
  type OnlineTrendItem,
  type RiskStat,
  type UserRankingItem,
  type UserTrendItem,
} from '@/api/dashboard'

type DateRange = [string, string]

const router = useRouter()
const adminStore = useAdminStore()
const loading = ref(false)
const loadError = ref(false)
const activePreset = ref('7d')
const dateRange = ref<DateRange>([offsetYmd(-6), todayYmd()])
const overview = ref<DashboardOverview>(emptyOverview())
const userTrend = ref<UserTrendItem[]>([])
const onlineTrend = ref<OnlineTrendItem[]>([])
const messageStat = ref<MessageStat>(emptyMessageStat())
const userRanking = ref<UserRankingItem[]>([])
const groupRanking = ref<GroupRankingItem[]>([])
const momentStat = ref<MomentStatItem[]>([])
const riskStat = ref<RiskStat>(emptyRiskStat())
const rankingSort = ref<{ prop: string; order: 'ascending' | 'descending' }>({
  prop: 'messageCount',
  order: 'descending',
})

const quickRanges = [
  { key: 'today', label: '今日' },
  { key: 'yesterday', label: '昨日' },
  { key: '7d', label: '近7天' },
  { key: '30d', label: '近30天' },
  { key: 'month', label: '本月' },
  { key: 'lastMonth', label: '上月' },
]

const metrics = computed(() => [
  { label: '用户总数', value: overview.value.userCount, helper: '累计用户', change: overview.value.registerChange, icon: '◉', tone: 'blue', to: '/users' },
  { label: '在线用户', value: overview.value.onlineCount, helper: '当前在线', icon: '●', tone: 'green', to: { path: '/users', query: { online: 'true', status: '1' } } },
   { label: '范围活跃', value: overview.value.todayActive, helper: '所选范围活跃', change: overview.value.activeChange, icon: '↗', tone: 'orange', to: { path: '/users', query: { activeToday: 'true', status: '1' } } },
   { label: '范围注册', value: overview.value.todayRegister, helper: '所选范围新增', change: overview.value.registerChange, icon: '+', tone: 'purple', to: '/users' },
  { label: '群聊数量', value: overview.value.groupCount, helper: '累计群聊', icon: '▦', tone: 'blue', to: '/groups' },
  { label: '动态数量', value: overview.value.momentCount, helper: '所选范围发布', icon: '✦', tone: 'orange', to: '/moments' },
  { label: '消息数量', value: overview.value.messageCount, helper: '所选范围消息', change: overview.value.messageChange, icon: '▤', tone: 'green', to: '/group-messages' },
  { label: '封禁用户', value: overview.value.blockedCount, helper: '当前封禁', icon: '⊘', tone: 'red', to: { path: '/users', query: { status: '0' } } },
] as Array<{ label: string; value: number; helper: string; change?: number; icon: string; tone: 'blue' | 'green' | 'orange' | 'purple' | 'red'; to: RouteLocationRaw }>)

const userChart = computed(() => ({
  categories: userTrend.value.map((item) => compactDate(item.date)),
  series: [
    { name: '新注册用户', data: userTrend.value.map((item) => item.register), color: '#3b82f6' },
    { name: '累计用户', data: userTrend.value.map((item) => item.total), color: '#8b5cf6' },
    { name: '活跃用户', data: userTrend.value.map((item) => item.active), color: '#10b981' },
  ],
}))

const onlineChart = computed(() => ({
  categories: onlineTrend.value.map((item) => compactTime(item.time)),
  series: [{ name: '小时活跃用户', data: onlineTrend.value.map((item) => item.activeUsers ?? item.current), color: '#14b8a6' }],
}))

const messageChart = computed(() => ({
  categories: messageStat.value.trend.map((item) => compactDate(item.date)),
  series: [
    { name: '文本', data: messageStat.value.trend.map((item) => item.text), color: '#3b82f6' },
    { name: '图片', data: messageStat.value.trend.map((item) => item.image), color: '#8b5cf6' },
    { name: '语音', data: messageStat.value.trend.map((item) => item.voice), color: '#10b981' },
    { name: '视频', data: messageStat.value.trend.map((item) => item.video), color: '#f59e0b' },
    { name: '文件', data: messageStat.value.trend.map((item) => item.file), color: '#ef4444' },
  ],
}))

const momentChart = computed(() => ({
  categories: momentStat.value.map((item) => compactDate(item.date)),
  series: [
    { name: '发布', data: momentStat.value.map((item) => item.publish), color: '#3b82f6' },
    { name: '点赞', data: momentStat.value.map((item) => item.like), color: '#f59e0b' },
    { name: '评论', data: momentStat.value.map((item) => item.comment), color: '#10b981' },
  ],
}))

const sortedUserRanking = computed(() => sortRows(userRanking.value, rankingSort.value))
const sortedGroupRanking = computed(() => [...groupRanking.value].sort((a, b) => b.messageCount - a.messageCount))
const onlinePeak = computed(() => Math.max(0, ...onlineTrend.value.map((item) => item.peakActiveUsers ?? item.peak)))
const onlineAverage = computed(() => onlineTrend.value.length
  ? Math.round(onlineTrend.value.reduce((sum, item) => sum + (item.averageActiveUsers ?? item.average), 0) / onlineTrend.value.length)
  : 0)

function emptyOverview(): DashboardOverview {
  return { userCount: 0, onlineCount: 0, todayActive: 0, todayRegister: 0, groupCount: 0, momentCount: 0, messageCount: 0, blockedCount: 0 }
}

function emptyMessageStat(): MessageStat {
  return { trend: [], distribution: [], total: 0 }
}

function emptyRiskStat(): RiskStat {
  return { report: 0, sensitiveWord: 0, blocked: 0, abnormalLogin: 0 }
}

function offsetYmd(days: number, from = new Date()) {
  const date = new Date(from)
  date.setDate(date.getDate() + days)
  return todayYmd(date)
}

function startOfMonth(date = new Date()) {
  return todayYmd(new Date(date.getFullYear(), date.getMonth(), 1))
}

function previousMonthRange() {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const last = new Date(now.getFullYear(), now.getMonth(), 0)
  return [todayYmd(first), todayYmd(last)] as DateRange
}

function applyPreset(key: string) {
  activePreset.value = key
  const today = todayYmd()
  if (key === 'today') dateRange.value = [today, today]
  else if (key === 'yesterday') dateRange.value = [offsetYmd(-1), offsetYmd(-1)]
  else if (key === '7d') dateRange.value = [offsetYmd(-6), today]
  else if (key === '30d') dateRange.value = [offsetYmd(-29), today]
  else if (key === 'month') dateRange.value = [startOfMonth(), today]
  else if (key === 'lastMonth') dateRange.value = previousMonthRange()
  else activePreset.value = 'custom'
  if (key !== 'custom') loadDashboard()
}

function queryRange(): DashboardQuery | undefined {
  const [startDate, endDate] = dateRange.value || []
  if (!startDate || !endDate) return undefined
  if (startDate > endDate) {
    dateRange.value = [endDate, startDate]
  }
  return { startDate: dateRange.value[0], endDate: dateRange.value[1] }
}

async function loadDashboard() {
  const query = queryRange()
  if (!query) return
  loading.value = true
  loadError.value = false
  const request = async <T>(promise: Promise<T>, fallback: T): Promise<T> => {
    try { return await promise } catch { loadError.value = true; return fallback }
  }
  const [nextOverview, nextUserTrend, nextOnlineTrend, nextMessageStat, nextUserRanking, nextGroupRanking, nextMomentStat, nextRiskStat] = await Promise.all([
    request(adminStore.hasPermission('dashboard:view') ? fetchDashboardOverview(query) : Promise.resolve(emptyOverview()), emptyOverview()),
    request(adminStore.hasPermission('dashboard:user') ? fetchUserTrend(query) : Promise.resolve([]), []),
    request(adminStore.hasPermission('dashboard:user') ? fetchOnlineTrend(query) : Promise.resolve([]), []),
    request(adminStore.hasPermission('dashboard:message') ? fetchMessageStat(query) : Promise.resolve(emptyMessageStat()), emptyMessageStat()),
    request(adminStore.hasPermission('dashboard:user') ? fetchUserRanking(query) : Promise.resolve([]), []),
    request(adminStore.hasPermission('dashboard:user') ? fetchGroupRanking(query) : Promise.resolve([]), []),
    request(adminStore.hasPermission('dashboard:user') ? fetchMomentStat(query) : Promise.resolve([]), []),
    request(adminStore.hasPermission('dashboard:view') ? fetchRiskStat(query) : Promise.resolve(emptyRiskStat()), emptyRiskStat()),
  ])
  overview.value = nextOverview
  userTrend.value = nextUserTrend
  onlineTrend.value = nextOnlineTrend
  messageStat.value = nextMessageStat
  userRanking.value = nextUserRanking
  groupRanking.value = nextGroupRanking
  momentStat.value = nextMomentStat
  riskStat.value = nextRiskStat
  loading.value = false
}

function sortRows(rows: UserRankingItem[], sort: { prop: string; order: string }) {
  const result = [...rows]
  const direction = sort.order === 'ascending' ? 1 : -1
  return result.sort((a, b) => {
    const left = a[sort.prop as keyof UserRankingItem] ?? ''
    const right = b[sort.prop as keyof UserRankingItem] ?? ''
    return (left > right ? 1 : left < right ? -1 : 0) * direction
  })
}

function handleRankingSort({ prop, order }: { prop: string; order: 'ascending' | 'descending' | null }) {
  if (order) rankingSort.value = { prop, order }
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('zh-CN').format(value || 0)
}

function compactDate(value: string) {
  return value.length >= 10 ? value.slice(5, 10) : value
}

function compactTime(value: string) {
  return value.length >= 13 ? value.slice(11, 16) : value
}

function displayLastActive(value?: string) {
  if (!value) return '—'
  return value.replace('T', ' ').slice(5, 16)
}

function go(to: RouteLocationRaw) { router.push(to) }

onMounted(loadDashboard)
</script>

<template>
  <div class="dashboard-page" v-loading="loading">
    <div class="dashboard-heading">
      <div>
        <div class="eyebrow">PULSE ADMIN</div>
        <h1>数据运营中心</h1>
        <p>实时掌握平台用户、消息与内容运营状态</p>
      </div>
      <el-button class="refresh-btn" :icon="Refresh" :loading="loading" @click="loadDashboard">刷新数据</el-button>
    </div>

    <section class="filter-card">
      <div class="filter-title"><span>数据时间范围</span><span class="filter-hint">所有模块同步刷新</span></div>
      <div class="filter-controls">
        <div class="quick-filters">
          <el-button
            v-for="item in quickRanges"
            :key="item.key"
            :type="activePreset === item.key ? 'primary' : 'default'"
            @click="applyPreset(item.key)"
          >{{ item.label }}</el-button>
          <el-button :type="activePreset === 'custom' ? 'primary' : 'default'" @click="activePreset = 'custom'">自定义</el-button>
        </div>
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          :clearable="false"
          @change="activePreset = 'custom'"
        />
        <el-button type="primary" :icon="DataAnalysis" @click="loadDashboard">查询</el-button>
      </div>
      <el-alert v-if="loadError" class="load-alert" title="部分数据接口暂不可用，已展示可用数据；请稍后刷新重试。" type="warning" :closable="false" />
    </section>

    <section class="section-block">
      <div class="section-heading"><div><h2>核心指标</h2><span>平台关键运营数据</span></div></div>
      <div class="metric-grid">
        <div v-for="card in metrics" :key="card.label" class="metric-link" @click="go(card.to)">
          <DataCard v-bind="card" :value="formatNumber(card.value)" />
        </div>
      </div>
    </section>

    <section class="dashboard-grid two-columns">
      <div class="panel panel-large">
        <div class="panel-heading"><div><h3>用户增长趋势</h3><span>注册、活跃与累计用户</span></div><el-tag type="info" effect="plain">日</el-tag></div>
        <LineChart :categories="userChart.categories" :series="userChart.series" />
      </div>
      <div class="panel">
          <div class="panel-heading"><div><h3>小时活跃用户</h3><span>当前 {{ formatNumber(overview.onlineCount) }} 人在线</span></div><span class="live-dot">当前</span></div>
        <AreaChart :categories="onlineChart.categories" :series="onlineChart.series" />
        <div class="inline-stats"><div><span>当前在线</span><b>{{ formatNumber(overview.onlineCount) }}</b></div><div><span>小时活跃峰值</span><b>{{ formatNumber(onlinePeak) }}</b></div><div><span>小时活跃均值</span><b>{{ formatNumber(onlineAverage) }}</b></div></div>
      </div>
    </section>

    <section class="dashboard-grid analysis-grid">
      <div class="panel message-panel">
        <div class="panel-heading"><div><h3>消息统计</h3><span>按日期查看消息类型趋势与占比</span></div><el-button link type="primary" @click="go('/group-messages')">查看记录</el-button></div>
        <div class="message-content">
          <BarChart :categories="messageChart.categories" :series="messageChart.series" height="290px" />
          <div class="message-pie"><div class="pie-title">消息类型占比</div><PieChart :data="messageStat.distribution" height="250px" /><div class="pie-total">共 {{ formatNumber(messageStat.total) }} 条消息</div></div>
        </div>
      </div>
      <div class="panel ranking-panel">
          <div class="panel-heading"><div><h3>用户活跃排行</h3><span>消息量与活跃小时</span></div><el-icon color="#3b82f6"><UserFilled /></el-icon></div>
        <el-table :data="sortedUserRanking" size="small" height="330" @sort-change="handleRankingSort">
          <el-table-column type="index" label="#" width="46" />
          <el-table-column prop="nickname" label="用户昵称" min-width="100" show-overflow-tooltip />
          <el-table-column prop="messageCount" label="消息数" width="78" sortable="custom" align="right" />
          <el-table-column prop="activeHours" label="活跃小时" width="110" sortable="custom" align="right"><template #default="{ row }">{{ row.activeHours }}h</template></el-table-column>
          <el-table-column prop="lastActive" label="最后活跃" width="104"><template #default="{ row }">{{ displayLastActive(row.lastActive) }}</template></el-table-column>
        </el-table>
      </div>
    </section>

    <section class="dashboard-grid lower-grid">
      <div class="panel moment-panel">
        <div class="panel-heading"><div><h3>动态运营数据</h3><span>为圈子业务扩展预留</span></div><el-button link type="primary" @click="go('/moments')">动态管理</el-button></div>
        <LineChart :categories="momentChart.categories" :series="momentChart.series" />
        <div class="moment-summary"><span>发布 <b>{{ formatNumber(momentStat.reduce((sum, item) => sum + item.publish, 0)) }}</b></span><span>点赞 <b>{{ formatNumber(momentStat.reduce((sum, item) => sum + item.like, 0)) }}</b></span><span>评论 <b>{{ formatNumber(momentStat.reduce((sum, item) => sum + item.comment, 0)) }}</b></span></div>
      </div>
      <div class="panel group-panel">
        <div class="panel-heading"><div><h3>热门群聊排行</h3><span>按消息数量排序</span></div><el-button link type="primary" @click="go('/groups')">群聊管理</el-button></div>
        <el-table :data="sortedGroupRanking" size="small" height="285">
          <el-table-column type="index" label="#" width="42" />
          <el-table-column prop="groupName" label="群名称" min-width="100" show-overflow-tooltip />
          <el-table-column prop="memberCount" label="群人数" width="66" align="right" />
          <el-table-column prop="messageCount" label="消息数" width="72" align="right" />
          <el-table-column prop="activeMembers" label="活跃人数" width="76" align="right" />
        </el-table>
      </div>
      <div class="panel risk-panel">
        <div class="panel-heading"><div><h3>风控数据</h3><span>所选范围安全监控</span></div><el-icon color="#ef4444"><Warning /></el-icon></div>
        <div class="risk-list">
          <div class="risk-item" @click="go('/community-reports')"><span><i class="risk-icon report">!</i>今日举报</span><b>{{ formatNumber(riskStat.report) }}</b><el-icon><ArrowUp /></el-icon></div>
          <div class="risk-item" @click="go('/sensitive-words')"><span><i class="risk-icon word">文</i>敏感词触发</span><b>{{ formatNumber(riskStat.sensitiveWord) }}</b><el-icon><ArrowUp /></el-icon></div>
          <div class="risk-item" @click="go({ path: '/users', query: { status: '0' } })"><span><i class="risk-icon blocked">禁</i>封禁用户</span><b>{{ formatNumber(riskStat.blocked) }}</b><el-icon><ArrowDown /></el-icon></div>
          <div class="risk-item" @click="go('/login-logs')"><span><i class="risk-icon login">↗</i>异常登录</span><b>{{ formatNumber(riskStat.abnormalLogin) }}</b><el-icon><ArrowUp /></el-icon></div>
        </div>
      </div>
    </section>

    <div class="dashboard-footer">数据更新时间：{{ adminStore.displayName }} · {{ dateRange[0] }} 至 {{ dateRange[1] }}</div>
  </div>
</template>

<style scoped>
.dashboard-page { width: 100%; max-width: 1680px; min-width: 0; padding-bottom: 28px; color: #1f2937; }
.dashboard-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin-bottom: 22px; }
.eyebrow { color: #3b82f6; font-size: 11px; font-weight: 700; letter-spacing: 1.8px; }
h1 { margin: 6px 0 4px; font-size: 28px; letter-spacing: -0.6px; }
.dashboard-heading p { margin: 0; color: #909399; font-size: 13px; }
.refresh-btn { border-radius: 8px; }
.filter-card { padding: 18px 20px; border: 1px solid #edf0f5; border-radius: 12px; background: #fff; box-shadow: 0 4px 14px rgba(31, 41, 55, 0.03); }
.filter-title { display: flex; align-items: baseline; gap: 10px; margin-bottom: 14px; font-size: 14px; font-weight: 600; }
.filter-hint { color: #a1a1aa; font-size: 12px; font-weight: 400; }
.filter-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.quick-filters { display: flex; flex-wrap: wrap; gap: 8px; }
.quick-filters .el-button { margin: 0; border-radius: 7px; }
.filter-controls .el-date-editor { width: 280px; }
.load-alert { margin-top: 14px; }
.section-block { margin-top: 26px; }
.section-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.section-heading h2, .panel-heading h3 { margin: 0; color: #303133; font-weight: 650; }
.section-heading h2 { font-size: 18px; }
.section-heading span, .panel-heading span { color: #a1a1aa; font-size: 12px; }
.metric-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
.metric-link { cursor: pointer; }
.metric-link:hover :deep(.data-card) { border-color: #bfdbfe; }
.dashboard-grid { display: grid; gap: 14px; margin-top: 14px; }
.two-columns { grid-template-columns: minmax(0, 1.2fr) minmax(360px, .8fr); }
.analysis-grid { grid-template-columns: minmax(0, 1.2fr) minmax(420px, .8fr); }
.lower-grid { grid-template-columns: minmax(0, 1.1fr) minmax(360px, .9fr) minmax(260px, .65fr); }
.panel { min-width: 0; padding: 18px 20px 16px; border: 1px solid #edf0f5; border-radius: 12px; background: #fff; box-shadow: 0 4px 14px rgba(31, 41, 55, 0.03); }
.panel-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.panel-heading h3 { font-size: 16px; margin-bottom: 5px; }
.panel-heading .el-button { padding: 0; }
.panel-heading .el-tag { border-radius: 5px; }
.live-dot { display: inline-flex; align-items: center; gap: 5px; color: #10b981 !important; }
.live-dot::before { width: 6px; height: 6px; border-radius: 50%; background: #10b981; content: ''; }
.inline-stats { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid #f0f2f5; }
.inline-stats div { padding-top: 12px; text-align: center; }
.inline-stats div + div { border-left: 1px solid #f0f2f5; }
.inline-stats span { display: block; color: #a1a1aa; font-size: 11px; }
.inline-stats b { display: block; margin-top: 5px; color: #303133; font-size: 17px; }
.message-content { display: grid; grid-template-columns: minmax(0, 1fr) 220px; gap: 8px; align-items: center; }
.message-pie { border-left: 1px solid #f0f2f5; padding-left: 12px; }
.pie-title { color: #606266; font-size: 13px; font-weight: 600; }
.pie-total { margin-top: -4px; color: #909399; font-size: 12px; text-align: center; }
.ranking-panel :deep(.el-table), .group-panel :deep(.el-table) { --el-table-border-color: #f3f4f6; --el-table-header-bg-color: #fafbfc; }
.ranking-panel :deep(.el-table th.is-sortable .cell) { white-space: nowrap; }
.ranking-panel :deep(.el-table__inner-wrapper::before), .group-panel :deep(.el-table__inner-wrapper::before) { display: none; }
.moment-summary { display: flex; justify-content: space-around; border-top: 1px solid #f0f2f5; padding-top: 12px; color: #909399; font-size: 12px; }
.moment-summary b { margin-left: 4px; color: #303133; font-size: 16px; }
.risk-list { margin-top: 12px; }
.risk-item { display: flex; align-items: center; gap: 9px; min-height: 51px; border-bottom: 1px solid #f3f4f6; color: #606266; font-size: 13px; cursor: pointer; }
.risk-item:last-child { border-bottom: 0; }
.risk-item span { display: flex; align-items: center; flex: 1; gap: 8px; }
.risk-item b { color: #303133; font-size: 18px; }
.risk-item > .el-icon { color: #a1a1aa; font-size: 13px; }
.risk-icon { display: inline-flex; align-items: center; justify-content: center; width: 23px; height: 23px; border-radius: 7px; color: #fff; font-size: 11px; font-style: normal; font-weight: 700; }
.risk-icon.report { background: #fb7185; }.risk-icon.word { background: #f59e0b; }.risk-icon.blocked { background: #8b5cf6; }.risk-icon.login { background: #3b82f6; }
.dashboard-footer { margin-top: 18px; color: #b0b4bc; font-size: 12px; text-align: right; }
@media (max-width: 1200px) { .lower-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .risk-panel { grid-column: span 2; } }
@media (max-width: 900px) { .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .two-columns, .analysis-grid, .lower-grid { grid-template-columns: 1fr; } .risk-panel { grid-column: auto; } .message-content { grid-template-columns: 1fr; } .message-pie { border-top: 1px solid #f0f2f5; border-left: 0; padding: 10px 0 0; } }
@media (max-width: 640px) { .dashboard-heading { align-items: flex-start; flex-direction: column; } .filter-controls .el-date-editor { width: 100%; } .metric-grid { gap: 10px; } .panel, .filter-card { padding-left: 14px; padding-right: 14px; } }
</style>

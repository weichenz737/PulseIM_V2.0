<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from '@/utils/elementFeedback'
import BarChart from '@/components/dashboard/BarChart.vue'
import CircleCard from '@/components/circleDashboard/CircleCard.vue'
import IncomeChart from '@/components/circleDashboard/IncomeChart.vue'
import PieChart from '@/components/circleDashboard/PieChart.vue'
import RankingTable from '@/components/circleDashboard/RankingTable.vue'
import TrendChart from '@/components/circleDashboard/TrendChart.vue'
import {
  fetchCircleDashboardContent,
  fetchCircleDashboardIncome,
  fetchCircleDashboardOverview,
  fetchCircleDashboardRanking,
  fetchCircleDashboardTrend,
  type CircleDashboardContent,
  type CircleDashboardOverview,
  type CircleDashboardRanking,
  type CircleDashboardTrend,
  type CircleIncomeItem,
} from '@/api/circleDashboard'

type QuickRange = 'today' | 'yesterday' | '7days' | '30days' | 'month'

const router = useRouter()
const loading = ref(false)
const refreshing = ref(false)
const dateRange = ref<[string, string]>(defaultRange())
const overview = ref<CircleDashboardOverview>(emptyOverview())
const trend = ref<CircleDashboardTrend>(emptyTrend())
const ranking = ref<CircleDashboardRanking>({ hotCircles: [], activeCircles: [] })
const income = ref<CircleIncomeItem[]>([])
const content = ref<CircleDashboardContent>(emptyContent())

const dateCategories = computed(() => trend.value.circleTrend.map((item) => shortDate(item.date)))
const memberCategories = computed(() => trend.value.memberTrend.map((item) => shortDate(item.date)))
const contentCategories = computed(() => content.value.trend.map((item) => shortDate(item.date)))

const cards = computed(() => [
  { label: '圈子总数', value: number(overview.value.circleCount), helper: '累计创建圈子', change: overview.value.circleChange, tone: 'blue' as const, clickable: true, target: '/communities' },
  { label: '待审核圈子', value: number(overview.value.pendingCount), helper: '等待后台审核', tone: 'orange' as const, clickable: true, target: '/communities?status=PENDING' },
  { label: '已上线圈子', value: number(overview.value.onlineCount), helper: '正常运营圈子', tone: 'green' as const, clickable: true, target: '/communities?status=APPROVED' },
  { label: '活跃成员', value: number(overview.value.activeMemberCount), helper: '所选期间活跃', tone: 'purple' as const, clickable: true, target: '/community-member-events' },
  { label: '已发布动态', value: number(overview.value.momentCount), helper: '动态总量', tone: 'blue' as const, clickable: true, target: '/community-content?status=PUBLISHED' },
  { label: '举报数量', value: number(overview.value.reportCount), helper: '待处理举报', tone: 'red' as const, clickable: true, target: '/community-reports' },
  { label: '付费订单', value: number(overview.value.orderCount), helper: '累计订单', tone: 'orange' as const, clickable: true, target: '/community-orders' },
  { label: '圈主累计收入', value: `¥ ${(number(overview.value.income) / 100).toFixed(2)}`, helper: '平台分成后', tone: 'green' as const, clickable: true, target: '/community-income' },
])

const riskItems = computed(() => [
  { key: 'violationPost', label: '违规动态', value: number(content.value.risk.violationPost), target: '/community-content' },
  { key: 'reportCount', label: '举报数量', value: number(content.value.risk.reportCount), target: '/community-reports' },
  { key: 'blockedCircle', label: '下架/解散圈子', value: number(content.value.risk.blockedCircle), target: '/communities' },
  { key: 'blockedMember', label: '禁言成员', value: number(content.value.risk.blockedMember), target: '/communities' },
  { key: 'sensitiveWord', label: '敏感词触发', value: number(content.value.risk.sensitiveWord), target: '/sensitive-words' },
])

function emptyOverview(): CircleDashboardOverview {
  return { circleCount: 0, pendingCount: 0, onlineCount: 0, activeMemberCount: 0, momentCount: 0, reportCount: 0, orderCount: 0, income: 0, startDate: '', endDate: '' }
}

function emptyTrend(): CircleDashboardTrend {
  return { circleTrend: [], memberTrend: [], typeDistribution: [], statusDistribution: [] }
}

function emptyContent(): CircleDashboardContent {
  return { trend: [], typeDistribution: [], statusDistribution: [], risk: { violationPost: 0, reportCount: 0, blockedCircle: 0, blockedMember: 0, sensitiveWord: 0 } }
}

function number(value: unknown) {
  return Number(value || 0)
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function ymd(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function today() {
  return new Date()
}

function addDays(date: Date, amount: number) {
  const result = new Date(date)
  result.setDate(result.getDate() + amount)
  return result
}

function defaultRange(): [string, string] {
  const end = today()
  return [ymd(addDays(end, -29)), ymd(end)]
}

function shortDate(date: string) {
  return date.length >= 10 ? date.slice(5) : date
}

function setQuickRange(type: QuickRange) {
  const end = today()
  let start = end
  if (type === 'yesterday') {
    start = addDays(end, -1)
  } else if (type === '7days') {
    start = addDays(end, -6)
  } else if (type === '30days') {
    start = addDays(end, -29)
  } else if (type === 'month') {
    start = new Date(end.getFullYear(), end.getMonth(), 1)
  }
  dateRange.value = [ymd(start), ymd(type === 'yesterday' ? start : end)]
  void load()
}

function query() {
  return { startDate: dateRange.value[0], endDate: dateRange.value[1] }
}

async function load() {
  if (!dateRange.value?.[0] || !dateRange.value?.[1]) return
  loading.value = true
  try {
    const current = query()
    const [overviewData, trendData, rankingData, incomeData, contentData] = await Promise.all([
      fetchCircleDashboardOverview(current),
      fetchCircleDashboardTrend(current),
      fetchCircleDashboardRanking(current),
      fetchCircleDashboardIncome(current),
      fetchCircleDashboardContent(current),
    ])
    overview.value = overviewData || emptyOverview()
    trend.value = trendData || emptyTrend()
    ranking.value = rankingData || { hotCircles: [], activeCircles: [] }
    income.value = incomeData || []
    content.value = contentData || emptyContent()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '数据加载失败')
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

function applyRange() {
  void load()
}

function go(target: string) {
  void router.push(target)
}

function refresh() {
  refreshing.value = true
  void load()
}

onMounted(load)
</script>

<template>
  <div v-loading="loading" class="circle-dashboard">
    <div class="page-heading">
      <div>
        <div class="eyebrow">PULSE ADMIN / CIRCLE</div>
        <h1>圈子运营数据中心</h1>
        <p>掌握圈子增长、成员活跃、内容运营与风险动态。</p>
      </div>
      <el-button :loading="refreshing" @click="refresh">刷新数据</el-button>
    </div>

    <el-card shadow="never" class="filter-card">
      <div class="filter-title">时间筛选</div>
      <div class="filter-content">
        <div class="quick-ranges">
          <el-button @click="setQuickRange('today')">今日</el-button>
          <el-button @click="setQuickRange('yesterday')">昨日</el-button>
          <el-button @click="setQuickRange('7days')">7天</el-button>
          <el-button type="primary" plain @click="setQuickRange('30days')">30天</el-button>
          <el-button @click="setQuickRange('month')">本月</el-button>
        </div>
        <el-date-picker v-model="dateRange" type="daterange" value-format="YYYY-MM-DD" range-separator="至" start-placeholder="开始日期" end-placeholder="结束日期" :clearable="false" @change="applyRange" />
        <el-button type="primary" @click="applyRange">查询</el-button>
      </div>
    </el-card>

    <section class="section-block">
      <div class="section-heading"><h2>核心指标</h2><span>{{ overview.startDate || dateRange[0] }} 至 {{ overview.endDate || dateRange[1] }}</span></div>
      <div class="card-grid">
        <CircleCard v-for="card in cards" :key="card.label" v-bind="card" @click="card.clickable && card.target ? go(card.target) : undefined" />
      </div>
    </section>

    <section class="dashboard-grid two-columns">
      <el-card shadow="never" class="panel-card">
        <template #header><div class="panel-heading"><span>圈子增长趋势</span><small>新建 / 审核通过 / 下架</small></div></template>
        <TrendChart :categories="dateCategories" :series="[
          { name: '新建圈子', data: trend.circleTrend.map((item) => number(item.create)), color: '#3b82f6' },
          { name: '审核通过', data: trend.circleTrend.map((item) => number(item.approve)), color: '#10b981' },
          { name: '下架', data: trend.circleTrend.map((item) => number(item.close)), color: '#f59e0b' },
        ]" />
      </el-card>
      <el-card shadow="never" class="panel-card">
        <template #header><div class="panel-heading"><span>成员增长趋势</span><small>新加入 / 总成员 / 活跃成员</small></div></template>
        <TrendChart :categories="memberCategories" :series="[
          { name: '新加入成员', data: trend.memberTrend.map((item) => number(item.newMember)), color: '#8b5cf6' },
          { name: '总成员', data: trend.memberTrend.map((item) => number(item.totalMember)), color: '#3b82f6' },
          { name: '活跃成员', data: trend.memberTrend.map((item) => number(item.activeMember)), color: '#10b981' },
        ]" />
      </el-card>
    </section>

    <section class="dashboard-grid two-columns">
      <el-card shadow="never" class="panel-card">
        <template #header><div class="panel-heading"><span>圈子类型分析</span><small>按后台主题配置统计</small></div></template>
        <PieChart :data="trend.typeDistribution" />
      </el-card>
      <el-card shadow="never" class="panel-card">
        <template #header><div class="panel-heading"><span>圈子状态分布</span><small>当前运营状态</small></div></template>
        <PieChart :data="trend.statusDistribution" doughnut />
      </el-card>
    </section>

    <section class="dashboard-grid two-columns ranking-grid">
      <el-card shadow="never" class="panel-card">
        <template #header><div class="panel-heading"><span>热门圈子排行</span><small>默认按活跃人数</small></div></template>
        <RankingTable :rows="ranking.hotCircles" mode="hot" />
      </el-card>
      <el-card shadow="never" class="panel-card">
        <template #header><div class="panel-heading"><span>圈子活跃排行 TOP10</span><small>所选期间活跃指数</small></div></template>
        <RankingTable :rows="ranking.activeCircles" mode="active" />
      </el-card>
    </section>

    <section class="dashboard-grid two-columns">
      <el-card shadow="never" class="panel-card">
        <template #header><div class="panel-heading"><span>收入分析</span><small>单位：元</small></div></template>
        <IncomeChart :data="income" />
      </el-card>
      <el-card shadow="never" class="panel-card">
        <template #header><div class="panel-heading"><span>动态运营分析</span><small>发布 / 点赞 / 评论 / 收藏</small></div></template>
        <BarChart :categories="contentCategories" :series="[
          { name: '发布动态', data: content.trend.map((item) => number(item.publish)), color: '#3b82f6' },
          { name: '点赞', data: content.trend.map((item) => number(item.likeCount)), color: '#f59e0b' },
          { name: '评论', data: content.trend.map((item) => number(item.commentCount)), color: '#10b981' },
          { name: '收藏', data: content.trend.map((item) => number(item.favoriteCount)), color: '#8b5cf6' },
        ]" />
      </el-card>
    </section>

    <section class="dashboard-grid two-columns">
      <el-card shadow="never" class="panel-card">
        <template #header><div class="panel-heading"><span>风控分析</span><small>点击卡片进入对应管理</small></div></template>
        <div class="risk-grid">
          <button v-for="item in riskItems" :key="item.key" class="risk-item" type="button" @click="go(item.target)">
            <span class="risk-label">{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
            <span class="risk-arrow">查看详情 →</span>
          </button>
        </div>
      </el-card>
      <el-card shadow="never" class="panel-card insight-card">
        <template #header><div class="panel-heading"><span>运营提示</span><small>根据当前数据范围</small></div></template>
        <div class="insight-list">
          <div><span class="insight-icon blue">↗</span><p>活跃成员按圈内发布动态、评论、点赞和收藏的用户去重统计，支持按天查看趋势。</p></div>
          <div><span class="insight-icon green">✓</span><p>收入按已支付订单计算，金额沿用现有 PLU 最小单位。</p></div>
          <div><span class="insight-icon orange">!</span><p>风险数据来自动态审核、举报与圈子风控事件。</p></div>
        </div>
      </el-card>
    </section>
  </div>
</template>

<style scoped>
.circle-dashboard { width: 100%; max-width: 1680px; margin: 0 auto; padding-bottom: 20px; }
.page-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 20px; }
.eyebrow { color: #3b82f6; font-size: 11px; font-weight: 700; letter-spacing: .12em; }
h1 { margin: 6px 0 7px; color: #1f2937; font-size: 28px; line-height: 1.25; }
.page-heading p { margin: 0; color: #8b95a7; font-size: 14px; }
.filter-card, .panel-card { border: 1px solid #edf0f5; border-radius: 14px; }
.filter-card { margin-bottom: 24px; }
.filter-title { margin-bottom: 13px; color: #374151; font-size: 14px; font-weight: 700; }
.filter-content { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.quick-ranges { display: flex; flex-wrap: wrap; gap: 8px; }
.quick-ranges .el-button { margin-left: 0; }
.section-block { margin-bottom: 24px; }
.section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 13px; }
.section-heading h2 { margin: 0; color: #374151; font-size: 17px; }
.section-heading span { color: #9aa3b2; font-size: 12px; }
.card-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
.dashboard-grid { display: grid; gap: 18px; margin-bottom: 18px; }
.two-columns { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.panel-card :deep(.el-card__header) { padding: 16px 18px 12px; border-bottom: 1px solid #f0f2f5; }
.panel-card :deep(.el-card__body) { padding: 12px 16px 16px; }
.panel-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.panel-heading span { color: #374151; font-size: 15px; font-weight: 700; }
.panel-heading small { color: #9aa3b2; font-size: 12px; font-weight: 400; }
.risk-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
.risk-item { min-height: 116px; padding: 14px 12px; text-align: left; border: 1px solid #edf0f5; border-radius: 10px; background: #fafbfc; cursor: pointer; transition: border-color .15s, background .15s, transform .15s; }
.risk-item:hover { border-color: #93c5fd; background: #eff6ff; transform: translateY(-2px); }
.risk-label, .risk-arrow { display: block; color: #7c8799; font-size: 12px; }
.risk-item strong { display: block; margin: 14px 0 10px; color: #1f2937; font-size: 26px; }
.risk-arrow { color: #3b82f6; font-size: 11px; }
.insight-list { display: grid; gap: 16px; padding: 7px 5px; }
.insight-list > div { display: flex; gap: 12px; align-items: flex-start; }
.insight-list p { margin: 2px 0 0; color: #657184; font-size: 13px; line-height: 1.6; }
.insight-icon { display: inline-flex; width: 28px; height: 28px; align-items: center; justify-content: center; flex: 0 0 auto; border-radius: 9px; font-weight: 700; }
.insight-icon.blue { color: #2563eb; background: #dbeafe; }
.insight-icon.green { color: #059669; background: #d1fae5; }
.insight-icon.orange { color: #d97706; background: #fef3c7; }
@media (max-width: 1180px) { .card-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } .risk-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 900px) { .two-columns { grid-template-columns: 1fr; } .card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 600px) { .page-heading { flex-direction: column; } .card-grid, .risk-grid { grid-template-columns: 1fr; } .filter-content { align-items: stretch; } .filter-content > .el-date-editor { width: 100%; } }
</style>

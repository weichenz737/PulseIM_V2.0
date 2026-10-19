import http, { type ApiResult } from './http'

export interface CircleDashboardQuery {
  startDate: string
  endDate: string
}

export interface CircleDashboardOverview {
  circleCount: number
  pendingCount: number
  onlineCount: number
  activeMemberCount: number
  momentCount: number
  reportCount: number
  orderCount: number
  income: number
  circleChange?: number
  activeMemberChange?: number
  startDate: string
  endDate: string
}

export interface CircleTrendItem {
  date: string
  create: number
  approve: number
  close: number
}

export interface MemberTrendItem {
  date: string
  newMember: number
  totalMember: number
  activeMember: number
}

export interface CircleDashboardTrend {
  circleTrend: CircleTrendItem[]
  memberTrend: MemberTrendItem[]
  typeDistribution: Array<{ name: string; value: number }>
  statusDistribution: Array<{ name: string; value: number }>
}

export interface HotCircleItem {
  id: number
  name: string
  ownerName: string
  memberCount: number
  postCount: number
  activeMemberCount: number
  income: number
}

export interface ActiveCircleItem {
  id: number
  name: string
  todayMemberCount: number
  todayMessageCount: number
  todayMomentCount: number
  activeScore?: number
}

export interface CircleDashboardRanking {
  hotCircles: HotCircleItem[]
  activeCircles: ActiveCircleItem[]
}

export interface CircleIncomeItem {
  date: string
  payment: number
  platformFee: number
  ownerIncome: number
}

export interface CircleContentItem {
  date: string
  publish: number
  likeCount: number
  commentCount: number
  favoriteCount: number
}

export interface CircleRiskStat {
  violationPost: number
  reportCount: number
  blockedCircle: number
  blockedMember: number
  sensitiveWord: number
}

export interface CircleDashboardContent {
  trend: CircleContentItem[]
  typeDistribution: Array<{ name: string; value: number }>
  statusDistribution: Array<{ name: string; value: number }>
  risk: CircleRiskStat
}

function params(query: CircleDashboardQuery) {
  return { params: query }
}

async function get<T>(url: string, query: CircleDashboardQuery): Promise<T> {
  const { data } = await http.get<ApiResult<T>>(url, params(query))
  return data.data
}

export const fetchCircleDashboardOverview = (query: CircleDashboardQuery) =>
  get<CircleDashboardOverview>('/admin/circle/dashboard/overview', query)

export const fetchCircleDashboardTrend = (query: CircleDashboardQuery) =>
  get<CircleDashboardTrend>('/admin/circle/dashboard/trend', query)

export const fetchCircleDashboardRanking = (query: CircleDashboardQuery) =>
  get<CircleDashboardRanking>('/admin/circle/dashboard/ranking', query)

export const fetchCircleDashboardIncome = (query: CircleDashboardQuery) =>
  get<CircleIncomeItem[]>('/admin/circle/dashboard/income', query)

export const fetchCircleDashboardContent = (query: CircleDashboardQuery) =>
  get<CircleDashboardContent>('/admin/circle/dashboard/content', query)

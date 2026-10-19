import http, { type ApiResult } from './http'

export interface DashboardQuery { startDate: string; endDate: string }

export interface DashboardOverview {
  userCount: number
  onlineCount: number
  todayActive: number
  todayRegister: number
  groupCount: number
  momentCount: number
  messageCount: number
  blockedCount: number
  registerChange?: number
  activeChange?: number
  messageChange?: number
}

export interface UserTrendItem { date: string; register: number; active: number; total: number }
export interface OnlineTrendItem { time: string; current: number; peak: number; average: number; activeUsers?: number; peakActiveUsers?: number; averageActiveUsers?: number }
export interface MessageTrendItem { date: string; text: number; image: number; voice: number; video: number; file: number }
export interface MessageStat { trend: MessageTrendItem[]; distribution: Array<{ name: string; value: number }>; total: number }
export interface UserRankingItem { userId: number; nickname: string; messageCount: number; activeHours: number; lastActive?: string }
export interface GroupRankingItem { groupId: number; groupName: string; memberCount: number; messageCount: number; activeMembers: number }
export interface MomentStatItem { date: string; publish: number; like: number; comment: number; report: number }
export interface RiskStat { report: number; sensitiveWord: number; blocked: number; abnormalLogin: number }

function params(query: DashboardQuery) {
  return { params: { startDate: query.startDate, endDate: query.endDate } }
}

async function get<T>(url: string, query: DashboardQuery): Promise<T> {
  const { data } = await http.get<ApiResult<T>>(url, params(query))
  return data.data
}

export const fetchDashboardOverview = (query: DashboardQuery) => get<DashboardOverview>('/admin/dashboard/overview', query)
export const fetchUserTrend = (query: DashboardQuery) => get<UserTrendItem[]>('/admin/dashboard/user-trend', query)
export const fetchOnlineTrend = (query: DashboardQuery) => get<OnlineTrendItem[]>('/admin/dashboard/online-trend', query)
export const fetchMessageStat = (query: DashboardQuery) => get<MessageStat>('/admin/dashboard/message-stat', query)
export const fetchUserRanking = (query: DashboardQuery) => get<UserRankingItem[]>('/admin/dashboard/user-ranking', query)
export const fetchGroupRanking = (query: DashboardQuery) => get<GroupRankingItem[]>('/admin/dashboard/group-ranking', query)
export const fetchMomentStat = (query: DashboardQuery) => get<MomentStatItem[]>('/admin/dashboard/moment-stat', query)
export const fetchRiskStat = (query: DashboardQuery) => get<RiskStat>('/admin/dashboard/risk-stat', query)

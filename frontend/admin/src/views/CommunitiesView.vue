<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from '@/utils/elementFeedback'
import {
  fetchCommunities,
  fetchCommunityConfig,
  fetchCommunityDetail,
  fetchCommunityMembers,
  fetchCommunityTopics,
  deleteCommunity,
  saveCommunityConfig,
  saveCommunityRevenue,
  setCommunityStatus,
  transferCommunityOwner,
  type AdminCommunity,
  type AdminCommunityDetail,
  type AdminCommunityMember,
  type CommunityTopic,
} from '@/api/communities'
import { resolveAvatarUrl } from '@/api/files'
import { formatTime } from '@/utils/datetime'
import AdminAvatar from '@/components/AdminAvatar.vue'

const loading = ref(false)
const route = useRoute()
const rows = ref<AdminCommunity[]>([])
const total = ref(0)
const rate = ref(20)
const topics = ref<CommunityTopic[]>([])
const query = reactive({ keyword: '', status: '', type: '', topicId: '', page: 1, size: 20 })
const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref<AdminCommunityDetail>()
const detailTab = ref('members')
const communityRateEnabled = ref(false)
const communityRate = ref(20)
const communityRateSaving = ref(false)
const ownerDialogVisible = ref(false)
const ownerLoading = ref(false)
const ownerSaving = ref(false)
const ownerCommunity = ref<AdminCommunity | null>(null)
const ownerCandidates = ref<AdminCommunityMember[]>([])
const selectedOwnerId = ref<number>()
const ownerReason = ref('')

function typeLabel(type: string) {
  return type === 'PAID' ? '付费圈子' : type === 'FREE' ? '免费圈子' : '其他类型'
}

function statusLabel(status: string) {
  return ({ PENDING: '审核中', APPROVED: '已开启', REJECTED: '已拒绝', CLOSED: '已关闭', DISSOLVED: '已删除' } as Record<string, string>)[status] || status
}

function statusType(status: string) {
  return ({ PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', CLOSED: 'info', DISSOLVED: 'danger' } as Record<string, 'warning' | 'success' | 'danger' | 'info'>)[status] || 'info'
}

function reviewStatusLabel(status: string) {
  return ({ PENDING: '待审核', APPROVED: '已通过', REJECTED: '已拒绝' } as Record<string, string>)[status] || status
}

function roleLabel(role: string) {
  return ({ OWNER: '圈主', ADMIN: '管理员', MEMBER: '成员' } as Record<string, string>)[role] || role
}

function memberStatusLabel(status: string) {
  return ({ ACTIVE: '正常', MUTED: '已禁言', REMOVED: '已退出' } as Record<string, string>)[status] || status
}

function postModeLabel(mode: string) {
  return ({ ALL: '成员直接发布', REVIEW: '发布后需审核', ADMIN_ONLY: '仅圈主和管理员发布' } as Record<string, string>)[mode] || mode
}

function eventLabel(type: string) {
  return ({ JOIN: '加入圈子', LEAVE: '主动退出', LEAVE_APPROVED: '审核退出', REMOVED: '被管理员移除', DISSOLVED: '圈子解散退出' } as Record<string, string>)[type] || type
}

function profileChangeLabel(row: AdminCommunityDetail['profile_reviews'][number]) {
  const changes: string[] = []
  if (row.changed_name) changes.push(`名称：${row.proposed_name || '—'}`)
  if (row.changed_avatar) changes.push('头像变更')
  return changes.join('；') || '未记录变更项'
}

function money(value?: number) {
  return `${(Number(value || 0) / 100).toFixed(2)} PLU`
}

async function load() {
  loading.value = true
  try {
    const data = await fetchCommunities({
      ...query,
      status: query.status || undefined,
      keyword: query.keyword || undefined,
      type: query.type || undefined,
      topicId: query.topicId || undefined,
    })
    rows.value = data.items || []
    total.value = data.total || 0
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '圈子列表加载失败')
  } finally {
    loading.value = false
  }
}

function applyRouteQuery() {
  const status = Array.isArray(route.query.status) ? route.query.status[0] : route.query.status
  const type = Array.isArray(route.query.type) ? route.query.type[0] : route.query.type
  query.status = typeof status === 'string' ? status : ''
  query.type = typeof type === 'string' ? type : ''
}

async function openDetail(row: AdminCommunity) {
  detailVisible.value = true
  detailLoading.value = true
  detail.value = undefined
  detailTab.value = 'members'
  communityRateEnabled.value = false
  communityRate.value = rate.value
  try {
    detail.value = await fetchCommunityDetail(row.id)
    communityRateEnabled.value = detail.value.platform_rate != null
    communityRate.value = Number(detail.value.platform_rate ?? rate.value)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '圈子详情加载失败')
  } finally {
    detailLoading.value = false
  }
}

function memberLabel(member: AdminCommunityMember) {
  return `${member.nickname || `用户 ${member.user_id}`} · ${member.phone || member.pulse_id || `ID ${member.user_id}`}`
}

async function openOwnerDialog(row: AdminCommunity) {
  if (row.status === 'DISSOLVED') return
  ownerLoading.value = true
  try {
    const members = await fetchCommunityMembers(row.id, { status: 'ACTIVE' })
    ownerCandidates.value = members.filter((member) => member.role !== 'OWNER')
    if (!ownerCandidates.value.length) {
      ElMessage.warning('该圈子暂无可接任的正常成员')
      return
    }
    ownerCommunity.value = row
    selectedOwnerId.value = undefined
    ownerReason.value = ''
    ownerDialogVisible.value = true
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '圈子成员加载失败')
  } finally {
    ownerLoading.value = false
  }
}

async function submitOwnerTransfer() {
  if (!ownerCommunity.value || !selectedOwnerId.value) {
    ElMessage.warning('请选择新圈主')
    return
  }
  if (!ownerReason.value.trim()) {
    ElMessage.warning('请填写转让原因')
    return
  }
  try {
    await ElMessageBox.confirm(
      `确认将圈子「${ownerCommunity.value.name}」的圈主更换为所选成员吗？原圈主将保留为管理员，圈子内容、订单和收益不受影响。`,
      '确认更换圈主',
      { confirmButtonText: '确认更换', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  ownerSaving.value = true
  try {
    await transferCommunityOwner(ownerCommunity.value.id, selectedOwnerId.value, ownerReason.value.trim())
    ElMessage.success('圈主已更换')
    ownerDialogVisible.value = false
    await load()
    if (detail.value?.id === ownerCommunity.value.id) {
      detail.value = await fetchCommunityDetail(ownerCommunity.value.id)
    }
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '更换圈主失败')
  } finally {
    ownerSaving.value = false
  }
}

async function saveRateForCommunity() {
  if (!detail.value) return
  communityRateSaving.value = true
  try {
    await saveCommunityRevenue(detail.value.id, communityRateEnabled.value ? communityRate.value : null)
    ElMessage.success(communityRateEnabled.value ? '圈子分成比例已保存' : '已恢复跟随平台比例')
    detail.value = await fetchCommunityDetail(detail.value.id)
    communityRateEnabled.value = detail.value.platform_rate != null
    communityRate.value = Number(detail.value.platform_rate ?? rate.value)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '圈子分成比例保存失败')
  } finally {
    communityRateSaving.value = false
  }
}

async function act(row: AdminCommunity, status: string) {
  let reason = ''
  if (status === 'REJECTED') {
    try {
      const result = await ElMessageBox.prompt('请输入拒绝原因', '拒绝圈子', {
        inputValidator: (value) => !!String(value).trim() || '拒绝原因不能为空',
      })
      reason = result.value
    } catch {
      return
    }
  }
  try {
    await setCommunityStatus(row.id, status, reason)
    ElMessage.success('操作成功')
    await load()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败')
  }
}

async function saveRate() {
  try {
    await saveCommunityConfig(rate.value)
    ElMessage.success('分成比例已保存')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败')
  }
}

async function deleteRow(row: AdminCommunity) {
  try {
    const result = await ElMessageBox.prompt('删除后圈子将停止运营，订单和审计记录会保留。请输入删除原因。', '删除圈子', {
      inputValidator: (value) => String(value).trim().length > 0 || '删除原因不能为空',
    })
    await deleteCommunity(row.id, result.value)
    ElMessage.success('圈子已删除')
    if (detail.value?.id === row.id) detailVisible.value = false
    await load()
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error instanceof Error ? error.message : '删除圈子失败')
  }
}

onMounted(async () => {
  applyRouteQuery()
  await load()
  try {
    topics.value = await fetchCommunityTopics()
    rate.value = Number((await fetchCommunityConfig()).platform_rate)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '收益配置加载失败')
  }
})
</script>

<template>
  <div>
    <el-card class="toolbar">
      <el-form inline>
        <el-form-item label="关键词"><el-input v-model="query.keyword" clearable placeholder="圈子或圈主" /></el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" clearable style="width: 140px">
            <el-option label="审核中" value="PENDING" />
            <el-option label="已通过" value="APPROVED" />
            <el-option label="已拒绝" value="REJECTED" />
            <el-option label="已关闭" value="CLOSED" />
            <el-option label="已删除" value="DISSOLVED" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="query.type" clearable style="width: 125px">
            <el-option label="免费圈子" value="FREE" />
            <el-option label="付费圈子" value="PAID" />
          </el-select>
        </el-form-item>
        <el-form-item label="主题">
          <el-select v-model="query.topicId" clearable filterable style="width: 150px">
            <el-option v-for="topic in topics" :key="topic.id" :label="topic.name" :value="String(topic.id)" />
          </el-select>
        </el-form-item>
        <el-button type="primary" @click="query.page = 1; load()">查询</el-button>
      </el-form>
    </el-card>

    <el-card>
      <template #header>
        <div class="head">
          <b>圈子列表 / 审核</b>
          <div>平台抽成 <el-input-number v-model="rate" :min="0" :max="100" :precision="2" /> % <el-button @click="saveRate">保存</el-button></div>
        </div>
      </template>
      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column prop="name" label="圈子名称" min-width="150" />
        <el-table-column prop="owner_name" label="圈主" min-width="110" />
        <el-table-column prop="topic" label="主题" min-width="100" />
        <el-table-column label="圈子公告" min-width="210" show-overflow-tooltip><template #default="{ row }">{{ row.announcement || '未设置' }}</template></el-table-column>
        <el-table-column label="类型" width="100"><template #default="{ row }">{{ typeLabel(row.type) }}</template></el-table-column>
        <el-table-column label="价格" width="110"><template #default="{ row }">{{ row.type === 'PAID' ? money(row.price) : '免费' }}</template></el-table-column>
        <el-table-column prop="member_count" label="成员" width="78" />
        <el-table-column prop="post_count" label="动态" width="78" />
        <el-table-column label="状态" width="96"><template #default="{ row }"><el-tag :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag></template></el-table-column>
        <el-table-column label="操作" width="430" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">查看详情</el-button>
            <el-button v-if="row.status !== 'DISSOLVED'" link type="warning" :loading="ownerLoading" @click="openOwnerDialog(row)">更换圈主</el-button>
            <el-button v-if="row.status === 'PENDING' || row.status === 'REJECTED'" link type="success" @click="act(row, 'APPROVED')">通过</el-button>
            <el-button v-if="row.status === 'CLOSED'" link type="success" @click="act(row, 'APPROVED')">开启</el-button>
            <el-button v-if="row.status === 'PENDING'" link type="danger" @click="act(row, 'REJECTED')">拒绝</el-button>
            <el-button v-if="row.status === 'APPROVED'" link type="warning" @click="act(row, 'CLOSED')">关闭</el-button>
            <el-button v-if="row.status !== 'DISSOLVED'" link type="danger" @click="deleteRow(row)">删除圈子</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination v-model:current-page="query.page" v-model:page-size="query.size" :total="total" layout="total, prev, pager, next" @current-change="load" />
    </el-card>

    <el-dialog v-model="ownerDialogVisible" title="更换圈主" width="520px" destroy-on-close>
      <el-alert
        title="仅可选择该圈子的正常成员。更换后原圈主会保留为管理员，圈子内容、订单和收益不会被删除。"
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 18px"
      />
      <el-form label-width="82px">
        <el-form-item label="圈子">
          <span>{{ ownerCommunity?.name || '—' }}</span>
        </el-form-item>
        <el-form-item label="新圈主" required>
          <el-select v-model="selectedOwnerId" filterable placeholder="选择正常成员" style="width: 100%">
            <el-option v-for="member in ownerCandidates" :key="member.user_id" :label="memberLabel(member)" :value="member.user_id">
              <div class="owner-option">
                <span>{{ member.nickname || `用户 ${member.user_id}` }}</span>
                <small>{{ member.phone || member.pulse_id || `ID ${member.user_id}` }} · {{ roleLabel(member.role) }}</small>
              </div>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="转让原因" required>
          <el-input v-model="ownerReason" type="textarea" :rows="4" maxlength="500" show-word-limit placeholder="请填写本次更换圈主的原因" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="ownerDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="ownerSaving" @click="submitOwnerTransfer">确认更换</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailVisible" width="min(1080px, 94vw)" destroy-on-close class="community-detail-dialog">
      <template #header><div class="dialog-title"><b>圈子详细数据</b><span v-if="detail">ID {{ detail.id }}</span></div></template>
      <div v-loading="detailLoading" class="detail-shell">
        <template v-if="detail">
          <section class="detail-hero">
            <AdminAvatar :size="68" shape="square" :url="resolveAvatarUrl(detail.avatar)">{{ detail.name.slice(0, 1) }}</AdminAvatar>
            <div class="hero-copy"><h2>{{ detail.name }}</h2><p>{{ detail.topic || '未设置主题' }} · {{ typeLabel(detail.type) }}</p><div><el-tag :type="statusType(detail.status)">{{ statusLabel(detail.status) }}</el-tag><el-tag effect="plain">{{ postModeLabel(detail.post_mode) }}</el-tag></div></div>
            <div class="owner-card"><small>圈主</small><strong>{{ detail.owner_name }}</strong><span>{{ detail.owner_phone || '无手机号' }} · PulseID {{ detail.owner_pulse_id || '—' }}</span></div>
          </section>

          <section class="metric-grid">
            <div><small>正常成员</small><strong>{{ detail.active_member_count }}</strong><span>今日新增 {{ detail.today_join_count }}</span></div>
            <div><small>管理员</small><strong>{{ detail.admin_count }}</strong><span>禁言 {{ detail.muted_member_count }}</span></div>
            <div><small>动态总数</small><strong>{{ detail.total_post_count }}</strong><span>今日发布 {{ detail.today_post_count }}</span></div>
            <div><small>待审动态</small><strong>{{ detail.pending_post_count }}</strong><span>置顶 {{ detail.pinned_post_count }}</span></div>
            <div><small>付费订单</small><strong>{{ detail.order_count }}</strong><span>成交 {{ money(detail.paid_amount) }}</span></div>
            <div><small>圈主收入</small><strong>{{ money(detail.owner_income) }}</strong><span>平台 {{ money(detail.platform_income) }}</span></div>
          </section>

          <section class="community-rate-setting">
            <div class="rate-copy">
              <strong>圈子收益分成</strong>
              <span v-if="communityRateEnabled">当前圈子单独设置平台抽成比例</span>
              <span v-else>当前跟随平台默认比例 {{ rate }}%</span>
            </div>
            <div class="rate-controls">
              <div class="rate-mode" role="group" aria-label="收益分成模式">
                <button
                  type="button"
                  class="rate-mode-option"
                  :class="{ active: !communityRateEnabled }"
                  @click="communityRateEnabled = false"
                >跟随平台</button>
                <button
                  type="button"
                  class="rate-mode-option"
                  :class="{ active: communityRateEnabled }"
                  @click="communityRateEnabled = true"
                >单独设置</button>
              </div>
              <template v-if="communityRateEnabled">
                <el-input-number
                  v-model="communityRate"
                  class="rate-input"
                  :min="0"
                  :max="100"
                  :precision="2"
                />
                <span class="rate-unit">%</span>
              </template>
              <el-button type="primary" :loading="communityRateSaving" @click="saveRateForCommunity">保存</el-button>
            </div>
          </section>

          <el-descriptions :column="2" border class="base-info">
            <el-descriptions-item label="圈子简介" :span="2">{{ detail.description || '未设置' }}</el-descriptions-item>
            <el-descriptions-item label="圈子公告" :span="2">{{ detail.announcement || '未设置' }}</el-descriptions-item>
            <el-descriptions-item label="圈子规则" :span="2"><div class="multiline">{{ detail.rules || '未设置' }}</div></el-descriptions-item>
            <el-descriptions-item label="加入审核">{{ detail.join_review_required ? '需要圈主或管理员审核' : '无需审核' }}</el-descriptions-item>
            <el-descriptions-item label="退出审核">{{ detail.leave_review_required ? '需要圈主或管理员审核' : '无需审核' }}</el-descriptions-item>
            <el-descriptions-item label="发布权限">{{ postModeLabel(detail.post_mode) }}</el-descriptions-item>
            <el-descriptions-item label="圈子价格">{{ detail.type === 'PAID' ? money(detail.price) : '免费' }}</el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ formatTime(detail.created_at) }}</el-descriptions-item>
            <el-descriptions-item label="最后更新">{{ formatTime(detail.updated_at) }}</el-descriptions-item>
            <el-descriptions-item v-if="detail.reject_reason" label="拒绝原因" :span="2">{{ detail.reject_reason }}</el-descriptions-item>
          </el-descriptions>

          <el-tabs v-model="detailTab" class="detail-tabs">
            <el-tab-pane :label="`成员（${detail.recent_members.length}）`" name="members">
              <el-table :data="detail.recent_members" max-height="360" size="small" empty-text="暂无成员">
                <el-table-column label="成员" min-width="170"><template #default="{ row }"><div class="person-cell"><AdminAvatar :size="30" :url="resolveAvatarUrl(row.avatar_url)">{{ row.nickname?.slice(0, 1) }}</AdminAvatar><div><b>{{ row.nickname }}</b><small>ID {{ row.user_id }} · {{ row.phone || '无手机号' }}</small></div></div></template></el-table-column>
                <el-table-column label="角色" width="90"><template #default="{ row }"><el-tag size="small" effect="plain">{{ roleLabel(row.role) }}</el-tag></template></el-table-column>
                <el-table-column label="状态" width="90"><template #default="{ row }">{{ memberStatusLabel(row.status) }}</template></el-table-column>
                <el-table-column label="加入时间" width="165"><template #default="{ row }">{{ formatTime(row.join_time) }}</template></el-table-column>
              </el-table>
            </el-tab-pane>
            <el-tab-pane :label="`动态（${detail.recent_posts.length}）`" name="posts">
              <el-table :data="detail.recent_posts" max-height="360" size="small" empty-text="暂无动态">
                <el-table-column prop="nickname" label="发布者" width="120" />
                <el-table-column prop="content" label="内容" min-width="260" show-overflow-tooltip />
                <el-table-column label="状态" width="100"><template #default="{ row }">{{ row.status }}<el-tag v-if="row.pinned" size="small" type="warning" class="pin-tag">置顶</el-tag></template></el-table-column>
                <el-table-column label="互动" width="110"><template #default="{ row }">赞 {{ row.like_count }} / 评 {{ row.comment_count }}</template></el-table-column>
                <el-table-column label="发布时间" width="165"><template #default="{ row }">{{ formatTime(row.created_at) }}</template></el-table-column>
              </el-table>
            </el-tab-pane>
            <el-tab-pane :label="`资料变更（${detail.profile_reviews.length}）`" name="profiles">
              <el-table :data="detail.profile_reviews" max-height="360" size="small" empty-text="暂无资料变更记录">
                <el-table-column prop="applicant_name" label="申请人" width="120" />
                <el-table-column label="变更内容" min-width="230"><template #default="{ row }">{{ profileChangeLabel(row) }}</template></el-table-column>
                <el-table-column label="结果" width="100"><template #default="{ row }"><el-tag size="small" :type="statusType(row.status)">{{ reviewStatusLabel(row.status) }}</el-tag></template></el-table-column>
                <el-table-column prop="reviewer_name" label="审核人" width="110"><template #default="{ row }">{{ row.reviewer_name || '—' }}</template></el-table-column>
                <el-table-column prop="reject_reason" label="备注" min-width="150"><template #default="{ row }">{{ row.reject_reason || '—' }}</template></el-table-column>
                <el-table-column label="申请时间" width="165"><template #default="{ row }">{{ formatTime(row.created_at) }}</template></el-table-column>
              </el-table>
            </el-tab-pane>
            <el-tab-pane :label="`成员出入（${detail.member_events.length}）`" name="events">
              <el-table :data="detail.member_events" max-height="360" size="small" empty-text="暂无成员出入记录">
                <el-table-column prop="member_name" label="成员" width="130"><template #default="{ row }">{{ row.member_name || `用户 ${row.user_id}` }}</template></el-table-column>
                <el-table-column label="动作" width="110"><template #default="{ row }">{{ eventLabel(row.event_type) }}</template></el-table-column>
                <el-table-column prop="reason" label="具体原因" min-width="240"><template #default="{ row }">{{ row.reason || '未填写' }}</template></el-table-column>
                <el-table-column prop="operator_name" label="操作人" width="120"><template #default="{ row }">{{ row.operator_name || '系统' }}</template></el-table-column>
                <el-table-column label="操作时间" width="165"><template #default="{ row }">{{ formatTime(row.occurred_at) }}</template></el-table-column>
              </el-table>
            </el-tab-pane>
            <el-tab-pane :label="`圈主转移（${detail.owner_transfers.length}）`" name="transfers">
              <el-table :data="detail.owner_transfers" max-height="360" size="small" empty-text="暂无圈主转移记录">
                <el-table-column prop="previous_owner_name" label="原圈主" width="130" />
                <el-table-column prop="new_owner_name" label="新圈主" width="130" />
                <el-table-column prop="reason" label="原因" min-width="220"><template #default="{ row }">{{ row.reason || '未填写' }}</template></el-table-column>
                <el-table-column prop="operator_name" label="操作人" width="120" />
                <el-table-column label="操作时间" width="165"><template #default="{ row }">{{ formatTime(row.created_at) }}</template></el-table-column>
              </el-table>
            </el-tab-pane>
          </el-tabs>
        </template>
      </div>
      <template #footer><el-button @click="detailVisible = false">关闭</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.toolbar{margin-bottom:16px;overflow-x:auto}.toolbar :deep(.el-form){display:flex;align-items:center;flex-wrap:nowrap;gap:24px;min-width:720px}.toolbar :deep(.el-form-item){flex:none;margin:0}.toolbar :deep(.el-form-item:first-child .el-input){width:272px}.head{display:flex;align-items:center;justify-content:space-between}.el-pagination{margin-top:16px;justify-content:flex-end}
.dialog-title{display:flex;align-items:baseline;gap:10px}.dialog-title b{font-size:18px}.dialog-title span{color:var(--el-text-color-secondary);font-size:12px}.detail-shell{min-height:260px}.detail-hero{display:flex;align-items:center;gap:16px;padding:16px;border:1px solid var(--el-border-color-lighter);border-radius:16px;background:linear-gradient(135deg,var(--el-color-primary-light-9),var(--el-fill-color-blank))}.hero-copy{min-width:0;flex:1}.hero-copy h2{margin:0;font-size:22px}.hero-copy p{margin:6px 0;color:var(--el-text-color-secondary)}.hero-copy>div{display:flex;gap:7px}.owner-card{display:flex;min-width:230px;flex-direction:column;gap:4px;padding:12px 14px;border-radius:12px;background:var(--el-fill-color-blank)}.owner-card small,.owner-card span{color:var(--el-text-color-secondary)}.owner-card strong{font-size:15px}.metric-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin:14px 0}.metric-grid>div{display:flex;min-width:0;flex-direction:column;gap:4px;padding:13px;border:1px solid var(--el-border-color-lighter);border-radius:12px}.metric-grid small,.metric-grid span{overflow:hidden;color:var(--el-text-color-secondary);font-size:12px;text-overflow:ellipsis;white-space:nowrap}.metric-grid strong{font-size:17px;color:var(--el-color-primary)}.community-rate-setting{display:flex;align-items:center;gap:12px;margin:14px 0;padding:14px 16px;border:1px solid var(--el-color-primary-light-7);border-radius:12px;background:var(--el-color-primary-light-9)}.community-rate-setting>div{display:flex;min-width:230px;flex:1;flex-direction:column;gap:4px}.community-rate-setting span{color:var(--el-text-color-secondary);font-size:12px}.base-info{margin-top:14px}.multiline{white-space:pre-wrap}.detail-tabs{margin-top:18px}.person-cell{display:flex;align-items:center;gap:9px}.person-cell>div{display:flex;min-width:0;flex-direction:column}.person-cell b,.person-cell small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.person-cell small{margin-top:2px;color:var(--el-text-color-secondary);font-size:11px}.pin-tag{margin-left:5px}.community-detail-dialog :deep(.el-dialog__body){padding-top:8px}
.owner-option{display:flex;flex-direction:column;gap:2px;line-height:1.3}.owner-option small{color:var(--el-text-color-secondary);font-size:11px}
@media(max-width:900px){.metric-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.owner-card{min-width:180px}.community-rate-setting{align-items:flex-start;flex-wrap:wrap}.community-rate-setting>div{min-width:180px}}@media(max-width:640px){.detail-hero{align-items:flex-start;flex-wrap:wrap}.owner-card{width:100%;box-sizing:border-box}.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.head{align-items:flex-start;flex-direction:column;gap:10px}}
.rate-copy{display:flex;min-width:240px;flex:1;flex-direction:column;gap:4px}.rate-controls{display:flex;align-items:center;justify-content:flex-end;gap:10px;min-width:0;flex:0 0 auto;flex-direction:row!important}.rate-copy span{color:var(--el-text-color-secondary);font-size:12px}.rate-mode{display:inline-flex;align-items:center;gap:2px;padding:3px;border:1px solid var(--el-border-color);border-radius:8px;background:var(--el-fill-color-blank)}.rate-mode-option{border:0;border-radius:6px;padding:6px 12px;color:var(--el-text-color-secondary);background:transparent;font:inherit;font-size:13px;line-height:1.2;white-space:nowrap;cursor:pointer;transition:all .2s}.rate-mode-option:hover{color:var(--el-color-primary)}.rate-mode-option.active{color:var(--el-color-primary);background:var(--el-color-primary-light-9);box-shadow:0 1px 3px rgba(64,158,255,.18)}.rate-input{width:150px}.rate-unit{color:var(--el-text-color-secondary);font-size:14px!important}@media(max-width:900px){.rate-copy{min-width:180px}.rate-controls{flex-wrap:wrap;justify-content:flex-start}}@media(max-width:640px){.community-rate-setting{gap:12px}.rate-copy,.rate-controls{width:100%}.rate-controls{justify-content:flex-start}.rate-input{flex:1;min-width:0}}
</style>

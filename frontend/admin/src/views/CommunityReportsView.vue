<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from '@/utils/elementFeedback'
import {
  createCommunityReportReason,
  deleteCommunityReportReason,
  fetchCommunityReportReasons,
  createCommunityMemberRemovalReason,
  deleteCommunityMemberRemovalReason,
  fetchCommunityMemberRemovalReasons,
  fetchCommunityReports,
  handleCommunityReport,
  moderateReportedCommunityPost,
  updateCommunityMemberRemovalReason,
  updateCommunityReportReason,
  type AdminCommunityReport,
  type CommunityMemberRemovalReason,
  type CommunityReportReason,
} from '@/api/communities'
import { resolveFileUrl } from '@/api/files'

const route = useRoute()
const removalOnly = computed(() => route.name === 'CommunityMemberRemovalReasons')

const activeTab = ref('reports')
const loading = ref(false)
const rows = ref<AdminCommunityReport[]>([])
const total = ref(0)
const query = reactive({ status: 'PENDING', keyword: '', targetType: '', page: 1, size: 20 })

const reportVisible = ref(false)
const currentReport = ref<AdminCommunityReport>()

const reasonLoading = ref(false)
const reasonSaving = ref(false)
const reasonDialogVisible = ref(false)
const reasons = ref<CommunityReportReason[]>([])
const reasonForm = reactive<CommunityReportReason>({ id: 0, code: '', name: '', enabled: true, sort_order: 0 })

const removalReasonLoading = ref(false)
const removalReasonSaving = ref(false)
const removalReasonDialogVisible = ref(false)
const removalReasons = ref<CommunityMemberRemovalReason[]>([])
const removalReasonForm = reactive<CommunityMemberRemovalReason>({ id: 0, code: '', name: '', enabled: true, sort_order: 0 })

const legacyReasonLabels: Record<string, string> = {
  PORN: '色情低俗',
  FRAUD: '欺诈骗局',
  AD: '广告骚扰',
  VIOLENCE: '暴力血腥',
  ILLEGAL: '违法违规',
  OTHER: '其他',
}

async function load() {
  loading.value = true
  try {
    const data = await fetchCommunityReports({ status: query.status || undefined, keyword: query.keyword || undefined, targetType: query.targetType || undefined, page: query.page, size: query.size })
    rows.value = data.items || []
    total.value = Number(data.total || 0)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '加载失败')
  } finally {
    loading.value = false
  }
}

async function loadReasons() {
  reasonLoading.value = true
  try {
    reasons.value = await fetchCommunityReportReasons()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '举报理由加载失败')
  } finally {
    reasonLoading.value = false
  }
}

function onTabChange(name: string | number) {
  if (String(name) === 'reasons' && !reasons.value.length) void loadReasons()
  if (String(name) === 'member-reasons' && !removalReasons.value.length) void loadRemovalReasons()
}

async function loadRemovalReasons() {
  removalReasonLoading.value = true
  try {
    removalReasons.value = await fetchCommunityMemberRemovalReasons()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '移除理由加载失败')
  } finally {
    removalReasonLoading.value = false
  }
}

async function handle(row: AdminCommunityReport, status: 'RESOLVED' | 'REJECTED') {
  try {
    await handleCommunityReport(row.id, status)
    ElMessage.success(status === 'RESOLVED' ? '已标记处理' : '已驳回举报')
    await load()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '处理失败')
  }
}

async function deleteReportedPost(row: AdminCommunityReport) {
  try {
    await ElMessageBox.confirm('删除后该动态将不再对用户展示，同时自动处理这条举报。确定继续吗？', '删除被举报动态', { type: 'warning' })
    await moderateReportedCommunityPost(row.id, 'DELETED')
    ElMessage.success('动态已删除，举报已处理')
    await load()
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    ElMessage.error(error instanceof Error ? error.message : '动态处置失败')
  }
}

function reasonLabel(row: AdminCommunityReport) {
  const raw = row.reason_code || row.reason
  const configuredName = String(row.reason_name || '').trim()
  if (configuredName && configuredName !== raw) return configuredName
  return legacyReasonLabels[raw] || (raw && !/^[A-Za-z0-9_.:/-]+$/.test(raw) ? raw : '其他')
}

function targetLabel(type: string) {
  return ({ COMMUNITY: '圈子', POST: '圈子动态', COMMENT: '评论', USER: '用户' } as Record<string, string>)[type] || '其他对象'
}

function statusLabel(status: string) {
  return ({ PENDING: '待处理', RESOLVED: '已处理', REJECTED: '已驳回' } as Record<string, string>)[status] || '其他状态'
}

function statusTag(status: string) {
  return status === 'PENDING' ? 'warning' : status === 'RESOLVED' ? 'success' : 'info'
}

function parseList(value?: string | string[]) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  const text = String(value || '').trim()
  if (!text) return []
  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean)
  } catch {
    // Compatibility with early comma-separated report evidence.
  }
  return text.split(',').map((item) => item.trim()).filter(Boolean)
}

function evidenceItems(row?: AdminCommunityReport) {
  if (!row) return []
  const urls = parseList(row.evidence_urls)
  const types = parseList(row.evidence_types)
  return urls.map((url, index) => {
    const type = types[index] || (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(url) ? 'video' : 'image')
    return { url: resolveFileUrl(url), type: type === 'video' ? 'video' : 'image' }
  })
}

function imagePreviewUrls(row?: AdminCommunityReport) {
  return evidenceItems(row).filter((item) => item.type === 'image').map((item) => item.url)
}

function viewReport(row: AdminCommunityReport) {
  currentReport.value = row
  reportVisible.value = true
}

function openCreateReason() {
  Object.assign(reasonForm, { id: 0, code: '', name: '', enabled: true, sort_order: 0 })
  reasonDialogVisible.value = true
}

function openEditReason(row: CommunityReportReason) {
  Object.assign(reasonForm, row)
  reasonDialogVisible.value = true
}

async function saveReason() {
  const name = reasonForm.name.trim()
  if (!name) return ElMessage.warning('请输入中文举报理由')
  reasonSaving.value = true
  try {
    if (reasonForm.id) {
      await updateCommunityReportReason({ ...reasonForm, name })
    } else {
      await createCommunityReportReason({
        code: `CUSTOM_${Date.now().toString(36).toUpperCase()}`,
        name,
        enabled: reasonForm.enabled,
        sortOrder: reasonForm.sort_order,
      })
    }
    ElMessage.success('举报理由已保存')
    reasonDialogVisible.value = false
    await loadReasons()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败')
  } finally {
    reasonSaving.value = false
  }
}

async function toggleReason(row: CommunityReportReason) {
  try {
    await updateCommunityReportReason(row)
    ElMessage.success(row.enabled ? '已启用' : '已停用')
  } catch (error) {
    row.enabled = !row.enabled
    ElMessage.error(error instanceof Error ? error.message : '状态更新失败')
  }
}

async function removeReason(row: CommunityReportReason) {
  try {
    await ElMessageBox.confirm(`确定删除“${row.name}”吗？已被举报记录使用的理由不能删除。`, '删除举报理由', { type: 'warning' })
  } catch {
    return
  }
  try {
    await deleteCommunityReportReason(row.id)
    ElMessage.success('已删除')
    await loadReasons()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除失败')
  }
}

function openCreateRemovalReason() {
  Object.assign(removalReasonForm, { id: 0, code: '', name: '', enabled: true, sort_order: 0 })
  removalReasonDialogVisible.value = true
}

function openEditRemovalReason(row: CommunityMemberRemovalReason) {
  Object.assign(removalReasonForm, row)
  removalReasonDialogVisible.value = true
}

async function saveRemovalReason() {
  const name = removalReasonForm.name.trim()
  if (!name) return ElMessage.warning('请输入中文移除理由')
  removalReasonSaving.value = true
  try {
    if (removalReasonForm.id) {
      await updateCommunityMemberRemovalReason({ ...removalReasonForm, name })
    } else {
      await createCommunityMemberRemovalReason({
        code: `CUSTOM_${Date.now().toString(36).toUpperCase()}`,
        name,
        enabled: removalReasonForm.enabled,
        sortOrder: removalReasonForm.sort_order,
      })
    }
    ElMessage.success('移除理由已保存')
    removalReasonDialogVisible.value = false
    await loadRemovalReasons()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败')
  } finally {
    removalReasonSaving.value = false
  }
}

async function toggleRemovalReason(row: CommunityMemberRemovalReason) {
  try {
    await updateCommunityMemberRemovalReason(row)
    ElMessage.success(row.enabled ? '已启用' : '已停用')
  } catch (error) {
    row.enabled = !row.enabled
    ElMessage.error(error instanceof Error ? error.message : '状态更新失败')
  }
}

async function removeRemovalReason(row: CommunityMemberRemovalReason) {
  try {
    await ElMessageBox.confirm(`确定删除“${row.name}”吗？已配置给成员移除记录的理由建议停用后保留。`, '删除移除理由', { type: 'warning' })
  } catch {
    return
  }
  try {
    await deleteCommunityMemberRemovalReason(row.id)
    ElMessage.success('已删除')
    await loadRemovalReasons()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除失败')
  }
}

if (removalOnly.value) activeTab.value = 'member-reasons'

onMounted(() => {
  if (removalOnly.value) void loadRemovalReasons()
  else void load()
})
</script>

<template>
  <el-tabs v-model="activeTab" class="report-tabs" @tab-change="onTabChange">
    <el-tab-pane v-if="!removalOnly" label="举报记录" name="reports">
      <el-card class="toolbar">
        <el-form inline>
          <el-form-item label="关键词"><el-input v-model="query.keyword" clearable placeholder="圈子、举报人、理由或对象 ID" @keyup.enter="query.page = 1; load()" /></el-form-item>
          <el-form-item label="对象"><el-select v-model="query.targetType" clearable placeholder="全部对象"><el-option label="圈子" value="COMMUNITY" /><el-option label="动态" value="POST" /><el-option label="评论" value="COMMENT" /><el-option label="用户" value="USER" /></el-select></el-form-item>
          <el-form-item label="状态">
            <el-select v-model="query.status" clearable @change="query.page = 1; load()">
              <el-option label="待处理" value="PENDING" />
              <el-option label="已处理" value="RESOLVED" />
              <el-option label="已驳回" value="REJECTED" />
            </el-select>
          </el-form-item>
          <el-button type="primary" @click="query.page = 1; load()">查询</el-button>
        </el-form>
      </el-card>

      <el-card>
        <el-table v-loading="loading" :data="rows" stripe>
          <el-table-column label="举报对象" width="120"><template #default="{ row }">{{ targetLabel(row.target_type) }}</template></el-table-column>
          <el-table-column prop="target_id" label="对象 ID" width="100" />
          <el-table-column label="被举报动态" min-width="300" show-overflow-tooltip>
            <template #default="{ row }">
              <template v-if="row.post_id">
                <div>{{ row.community_name || '未知圈子' }} · {{ row.post_author_name || '未知作者' }}</div>
                <small>{{ row.post_content || '动态内容为空' }}</small>
              </template>
              <span v-else>—</span>
            </template>
          </el-table-column>
          <el-table-column label="举报理由" min-width="150"><template #default="{ row }">{{ reasonLabel(row) }}</template></el-table-column>
          <el-table-column prop="detail" label="备注" min-width="220" show-overflow-tooltip />
          <el-table-column prop="reporter_name" label="举报人" width="120" />
          <el-table-column label="凭证" width="80"><template #default="{ row }"><el-badge :value="evidenceItems(row).length" :hidden="!evidenceItems(row).length"><el-button link @click="viewReport(row)">查看</el-button></el-badge></template></el-table-column>
          <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="statusTag(row.status)">{{ statusLabel(row.status) }}</el-tag></template></el-table-column>
          <el-table-column label="操作" width="190" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="viewReport(row)">详情</el-button>
              <el-button v-if="row.status === 'PENDING'" link type="success" @click="handle(row, 'RESOLVED')">处理完成</el-button>
              <el-button v-if="row.status === 'PENDING'" link type="info" @click="handle(row, 'REJECTED')">驳回</el-button>
              <el-button v-if="row.post_id && row.status === 'PENDING' && row.post_status !== 'DELETED'" link type="danger" @click="deleteReportedPost(row)">删除动态</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-pagination v-model:current-page="query.page" v-model:page-size="query.size" :total="total" layout="total,prev,pager,next" @current-change="load" />
      </el-card>
    </el-tab-pane>

    <el-tab-pane v-if="!removalOnly" label="举报理由配置" name="reasons">
      <el-card>
        <template #header><div class="reason-head"><div><b>用户端举报理由</b><p>启用后将以中文显示在圈子举报页面</p></div><el-button type="primary" @click="openCreateReason">新增理由</el-button></div></template>
        <el-table v-loading="reasonLoading" :data="reasons" stripe>
          <el-table-column prop="name" label="举报理由" min-width="220" />
          <el-table-column prop="sort_order" label="排序" width="100" />
          <el-table-column label="启用" width="110"><template #default="{ row }"><el-switch v-model="row.enabled" @change="toggleReason(row)" /></template></el-table-column>
          <el-table-column label="操作" width="150"><template #default="{ row }"><el-button link type="primary" @click="openEditReason(row)">编辑</el-button><el-button link type="danger" @click="removeReason(row)">删除</el-button></template></el-table-column>
        </el-table>
      </el-card>
    </el-tab-pane>

    <el-tab-pane v-if="removalOnly" label="移除原因配置" name="member-reasons">
      <el-card>
        <template #header><div class="reason-head"><div><b>圈子成员移除原因</b><p>启用后会显示在圈子管理中心的移除成员弹窗中</p></div><el-button type="primary" @click="openCreateRemovalReason">新增原因</el-button></div></template>
        <el-table v-loading="removalReasonLoading" :data="removalReasons" stripe>
          <el-table-column prop="name" label="移除原因" min-width="240" />
          <el-table-column prop="sort_order" label="排序" width="100" />
          <el-table-column label="启用" width="110"><template #default="{ row }"><el-switch v-model="row.enabled" @change="toggleRemovalReason(row)" /></template></el-table-column>
          <el-table-column label="操作" width="150"><template #default="{ row }"><el-button link type="primary" @click="openEditRemovalReason(row)">编辑</el-button><el-button link type="danger" @click="removeRemovalReason(row)">删除</el-button></template></el-table-column>
        </el-table>
      </el-card>
    </el-tab-pane>
  </el-tabs>

  <el-dialog v-model="reportVisible" title="举报详情" width="680px" destroy-on-close>
    <el-descriptions v-if="currentReport" :column="2" border>
      <el-descriptions-item label="对象">{{ targetLabel(currentReport.target_type) }} #{{ currentReport.target_id }}</el-descriptions-item>
      <el-descriptions-item label="状态">{{ statusLabel(currentReport.status) }}</el-descriptions-item>
      <el-descriptions-item label="举报理由">{{ reasonLabel(currentReport) }}</el-descriptions-item>
      <el-descriptions-item label="举报人">{{ currentReport.reporter_name }}</el-descriptions-item>
      <el-descriptions-item v-if="currentReport.post_id" label="所属圈子">{{ currentReport.community_name || '—' }}</el-descriptions-item>
      <el-descriptions-item v-if="currentReport.post_id" label="动态作者">{{ currentReport.post_author_name || '—' }}</el-descriptions-item>
      <el-descriptions-item v-if="currentReport.post_id" label="动态状态">{{ currentReport.post_status || '—' }}</el-descriptions-item>
      <el-descriptions-item v-if="currentReport.post_id" label="动态内容" :span="2">{{ currentReport.post_content || '动态内容为空' }}</el-descriptions-item>
      <el-descriptions-item label="备注" :span="2">{{ currentReport.detail || '未填写备注' }}</el-descriptions-item>
    </el-descriptions>
    <section class="evidence-section">
      <h3>图片/视频凭证</h3>
      <div v-if="evidenceItems(currentReport).length" class="evidence-grid">
        <template v-for="item in evidenceItems(currentReport)" :key="item.url">
          <video v-if="item.type === 'video'" :src="item.url" controls preload="metadata" />
          <el-image v-else :src="item.url" fit="cover" :preview-src-list="imagePreviewUrls(currentReport)" preview-teleported />
        </template>
      </div>
      <el-empty v-else description="未上传凭证" :image-size="72" />
    </section>
  </el-dialog>

  <el-dialog v-model="reasonDialogVisible" :title="reasonForm.id ? '编辑举报理由' : '新增举报理由'" width="440px" destroy-on-close>
    <el-form label-width="92px">
      <el-form-item label="中文理由"><el-input v-model="reasonForm.name" maxlength="40" show-word-limit placeholder="例如：广告骚扰" /></el-form-item>
      <el-form-item label="排序"><el-input-number v-model="reasonForm.sort_order" :min="0" :max="9999" /></el-form-item>
      <el-form-item label="状态"><el-switch v-model="reasonForm.enabled" active-text="启用" inactive-text="停用" /></el-form-item>
    </el-form>
    <template #footer><el-button @click="reasonDialogVisible = false">取消</el-button><el-button type="primary" :loading="reasonSaving" @click="saveReason">保存</el-button></template>
  </el-dialog>

  <el-dialog v-model="removalReasonDialogVisible" :title="removalReasonForm.id ? '编辑移除原因' : '新增移除原因'" width="440px" destroy-on-close>
    <el-form label-width="92px">
      <el-form-item label="原因名称"><el-input v-model="removalReasonForm.name" maxlength="64" show-word-limit placeholder="例如：违反圈子规则" /></el-form-item>
      <el-form-item label="排序"><el-input-number v-model="removalReasonForm.sort_order" :min="0" :max="9999" /></el-form-item>
      <el-form-item label="状态"><el-switch v-model="removalReasonForm.enabled" active-text="启用" inactive-text="停用" /></el-form-item>
    </el-form>
    <template #footer><el-button @click="removalReasonDialogVisible = false">取消</el-button><el-button type="primary" :loading="removalReasonSaving" @click="saveRemovalReason">保存</el-button></template>
  </el-dialog>
</template>

<style scoped>
.report-tabs{--el-tabs-header-height:46px}.toolbar{margin-bottom:16px}.toolbar :deep(.el-form-item){margin-bottom:0}.toolbar :deep(.el-select){width:175px}.el-pagination{margin-top:16px;justify-content:flex-end}.reason-head{display:flex;align-items:center;justify-content:space-between;gap:24px}.reason-head p{margin:5px 0 0;color:var(--el-text-color-secondary);font-size:13px;font-weight:400}.evidence-section{margin-top:20px}.evidence-section h3{margin:0 0 12px;font-size:15px;color:var(--el-text-color-primary)}.evidence-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.evidence-grid video,.evidence-grid :deep(.el-image){width:100%;height:150px;border-radius:10px;background:var(--el-fill-color-dark);object-fit:cover;overflow:hidden}@media(max-width:760px){.evidence-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.reason-head{align-items:flex-start;flex-direction:column}}
</style>

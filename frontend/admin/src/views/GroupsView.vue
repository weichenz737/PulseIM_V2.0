<script setup lang="ts">
import { formatTime } from '@/utils/datetime'
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from '@/utils/elementFeedback'
import type { TableInstance } from 'element-plus'
import {
  createGroup,
  dissolveGroup,
  dissolveGroups,
  fetchGroup,
  fetchGroups,
  transferGroupOwner,
  type AdminGroup,
  type GroupCreateRecord,
  type GroupMember,
} from '@/api/groups'
import { fetchUsers, type AdminUser } from '@/api/users'
import { resolveAvatarUrl } from '@/api/files'
import QrCodeBlock from '@/components/QrCodeBlock.vue'
import AdminAvatar from '@/components/AdminAvatar.vue'
import { groupQrPayload } from '@/utils/qrcode'

const loading = ref(false)
const deleting = ref(false)
const groups = ref<AdminGroup[]>([])
const total = ref(0)
const tableRef = ref<TableInstance>()
const selectedRows = ref<AdminGroup[]>([])

const query = reactive({
  keyword: '',
  page: 1,
  size: 20,
})

const createVisible = ref(false)
const createSaving = ref(false)
const createForm = reactive({
  title: '',
  ownerId: undefined as number | undefined,
  memberIds: [] as number[],
  notice: '',
})
const ownerOptions = ref<AdminUser[]>([])
const memberOptions = ref<AdminUser[]>([])
const ownerSearching = ref(false)
const memberSearching = ref(false)

const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref<AdminGroup | null>(null)
const detailGroupQrPayload = computed(() => {
  const id = detail.value?.id
  return id != null ? groupQrPayload(id) : ''
})

const transferVisible = ref(false)
const transferLoading = ref(false)
const transferSaving = ref(false)
const transferGroup = ref<AdminGroup | null>(null)
const transferMembers = ref<GroupMember[]>([])
const newOwnerId = ref<number | undefined>(undefined)

async function loadGroups() {
  loading.value = true
  selectedRows.value = []
  try {
    const data = await fetchGroups({
      page: query.page,
      size: query.size,
      keyword: query.keyword.trim(),
    })
    groups.value = data.list
    total.value = data.total
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载群聊失败')
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  query.page = 1
  loadGroups()
}

function handleReset() {
  query.keyword = ''
  query.page = 1
  loadGroups()
}

function userOptionLabel(u: AdminUser) {
  const name = u.nickname || '未命名'
  const phone = u.phone ? ` · ${u.phone}` : ''
  const pid = u.pulseId ? ` · ${u.pulseId}` : ''
  return `${name}${phone}${pid}（ID ${u.id}）`
}

async function searchUsers(keyword: string, target: 'owner' | 'member') {
  const searching = target === 'owner' ? ownerSearching : memberSearching
  const options = target === 'owner' ? ownerOptions : memberOptions
  searching.value = true
  try {
    const data = await fetchUsers({
      page: 1,
      size: 30,
      keyword: keyword.trim(),
      status: 1,
    })
    options.value = data.list || []
  } catch {
    options.value = []
  } finally {
    searching.value = false
  }
}

function openCreate() {
  createForm.title = ''
  createForm.ownerId = undefined
  createForm.memberIds = []
  createForm.notice = ''
  ownerOptions.value = []
  memberOptions.value = []
  createVisible.value = true
  void searchUsers('', 'owner')
  void searchUsers('', 'member')
}

function onOwnerChange() {
  if (createForm.ownerId != null) {
    createForm.memberIds = createForm.memberIds.filter((id) => id !== createForm.ownerId)
  }
}

async function submitCreate() {
  const title = createForm.title.trim()
  if (!title) {
    ElMessage.warning('请输入群名称')
    return
  }
  if (!createForm.ownerId) {
    ElMessage.warning('请选择群主')
    return
  }
  const memberIds = createForm.memberIds.filter((id) => id !== createForm.ownerId)
  if (!memberIds.length) {
    ElMessage.warning('请至少再选择一位群成员')
    return
  }
  createSaving.value = true
  try {
    const g = await createGroup({
      title,
      ownerId: createForm.ownerId,
      memberIds,
      notice: createForm.notice.trim() || undefined,
    })
    ElMessage.success(`群聊「${g.title || title}」已创建`)
    createVisible.value = false
    query.page = 1
    await loadGroups()
    await openDetail(g)
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '创建失败')
  } finally {
    createSaving.value = false
  }
}

function recentMessagePreview(value?: string) {
  const raw = String(value || '').trim()
  if (!raw) return '—'
  if (!raw.startsWith('{') && !raw.startsWith('[')) return raw

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return raw
  }
  if (typeof parsed === 'string') return parsed.trim() || '—'
  if (Array.isArray(parsed)) return '[聊天记录]'
  if (!parsed || typeof parsed !== 'object') return raw

  const data = parsed as Record<string, unknown>
  const text = [data.text, data.message, data.resultText]
    .map((item) => String(item ?? '').trim())
    .find(Boolean)
  if (text) return text

  const kind = String(data.kind || data.type || data.event || '').toLowerCase()
  const contentType = String(data.contentType || data.mimeType || '').toLowerCase()
  if (kind.includes('video') || contentType.startsWith('video/')) return '[视频]'
  if (kind.includes('voice') || kind.includes('audio') || contentType.startsWith('audio/')) return '[语音]'
  if (contentType.startsWith('image/')) return '[图片]'
  if (data.url || data.originalUrl) return `[文件] ${String(data.name || '').trim()}`.trim()
  if (data.packetType || data.packetNo || kind.includes('red_packet')) return '[红包]'
  if (data.transferNo || kind.includes('transfer')) return '[转账]'
  if (data.cardType || data.userId || data.communityId) return '[名片]'
  if (data.latitude != null || data.lat != null) return '[位置]'
  if (Array.isArray(data.items) || data.title || data.sourceTitle) return '[聊天记录]'
  return '[结构化消息]'
}

async function openDetail(row: AdminGroup) {
  detailVisible.value = true
  detailLoading.value = true
  detail.value = row
  try {
    detail.value = await fetchGroup(row.id)
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载详情失败')
  } finally {
    detailLoading.value = false
  }
}

async function openTransferOwner(row: AdminGroup) {
  transferVisible.value = true
  transferLoading.value = true
  transferGroup.value = row
  transferMembers.value = []
  newOwnerId.value = undefined
  try {
    const g = await fetchGroup(row.id)
    transferGroup.value = g
    const ownerId = g.ownerId
    transferMembers.value = (g.members || []).filter((m) => m.userId !== ownerId)
    if (!transferMembers.value.length) {
      ElMessage.warning('该群没有可转让的其他成员')
    }
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载群成员失败')
    transferVisible.value = false
  } finally {
    transferLoading.value = false
  }
}

function memberLabel(m: GroupMember) {
  const name = m.nickname || '未命名'
  const phone = m.phone ? `（${m.phone}）` : ''
  const role = m.role === 'admin' ? ' · 管理员' : ''
  return `${name}${phone}${role}`
}

async function submitTransferOwner() {
  if (!transferGroup.value) return
  if (!newOwnerId.value) {
    ElMessage.warning('请选择新群主')
    return
  }
  const selected = transferMembers.value.find((m) => m.userId === newOwnerId.value)
  const name = selected?.nickname || String(newOwnerId.value)
  try {
    await ElMessageBox.confirm(
      `确定将群「${transferGroup.value.title || transferGroup.value.id}」的群主变更为「${name}」吗？`,
      '更改群主',
      {
        confirmButtonText: '确认更改',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
    transferSaving.value = true
    const updated = await transferGroupOwner(transferGroup.value.id, newOwnerId.value)
    ElMessage.success('群主已更改')
    transferVisible.value = false
    if (detailVisible.value && detail.value?.id === updated.id) {
      detail.value = updated
    }
    await loadGroups()
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(e instanceof Error ? e.message : '更改群主失败')
  } finally {
    transferSaving.value = false
  }
}

async function handleDissolve(row: AdminGroup) {
  try {
    await ElMessageBox.confirm(
      `确定解散群聊「${row.title || row.id}」吗？群消息与成员关系将一并清除，且不可恢复。`,
      '解散群聊',
      {
        confirmButtonText: '解散',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      },
    )
    await dissolveGroup(row.id)
    ElMessage.success('群聊已解散')
    if (detailVisible.value && detail.value?.id === row.id) {
      detailVisible.value = false
    }
    if (groups.value.length <= 1 && query.page > 1) {
      query.page -= 1
    }
    await loadGroups()
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(e instanceof Error ? e.message : '解散失败')
  }
}

function onSelectionChange(rows: AdminGroup[]) {
  selectedRows.value = rows
}

function clearSelection() {
  tableRef.value?.clearSelection()
  selectedRows.value = []
}

async function handleBatchDelete() {
  if (!selectedRows.value.length) {
    ElMessage.warning('请先勾选要解散的群聊')
    return
  }
  const ids = selectedRows.value.map((r) => r.id)
  const count = ids.length
  try {
    await ElMessageBox.confirm(
      `确定解散选中的 ${count} 个群聊吗？群消息与成员关系将一并清除，且不可恢复。`,
      '批量解散',
      {
        confirmButtonText: '解散',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      },
    )
    deleting.value = true
    const n = await dissolveGroups(ids)
    ElMessage.success(`已解散 ${n} 个群聊`)
    clearSelection()
    if (groups.value.length <= count && query.page > 1) {
      query.page -= 1
    }
    await loadGroups()
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(e instanceof Error ? e.message : '解散失败')
  } finally {
    deleting.value = false
  }
}

function avatarSrc(url?: string) {
  return resolveAvatarUrl(url) || undefined
}

function roleLabel(role?: string) {
  if (role === 'owner') return '群主'
  if (role === 'admin') return '管理员'
  return '成员'
}

function joinSourceLabel(source?: string) {
  switch ((source || '').toLowerCase()) {
    case 'create':
      return '创建群聊'
    case 'create_invite':
      return '建群时加入'
    case 'invite':
      return '群内邀请'
    case 'qrcode':
      return '扫码加入'
    case 'card':
      return '群名片'
    case 'join':
      return '主动加入'
    default:
      return '未知'
  }
}


onMounted(loadGroups)
</script>

<template>
  <div class="groups-page">
    <el-card shadow="never" class="toolbar-card">
      <el-form :inline="true" @submit.prevent="handleSearch">
        <el-form-item label="关键词">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="群名称 / 群公告 / 群 PulseID"
            style="width: 240px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
          <el-button type="success" @click="openCreate">新建群聊</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="table-card">
      <div class="batch-bar">
        <span class="batch-hint">已选 {{ selectedRows.length }} 条</span>
        <el-button
          type="danger"
          :disabled="!selectedRows.length"
          :loading="deleting"
          @click="handleBatchDelete"
        >解散选中</el-button>
        <el-button :disabled="!selectedRows.length" @click="clearSelection">取消选择</el-button>
      </div>
      <el-table
        ref="tableRef"
        v-loading="loading"
        :data="groups"
        stripe
        row-key="id"
        empty-text="暂无群聊"
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="48" />
        <el-table-column label="群聊" min-width="220">
          <template #default="{ row }">
            <div class="group-cell">
              <AdminAvatar shape="circle" :size="40" :url="avatarSrc(row.avatarUrl)">
                {{ (row.title || '群').slice(0, 1) }}
              </AdminAvatar>
              <div class="group-meta">
                <div class="title">{{ row.title || '未命名群聊' }}</div>
                <div class="sub">PulseID {{ row.pulseId || '—' }} · ID {{ row.id }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="群主" min-width="140">
          <template #default="{ row }">
            <div>{{ row.ownerNickname || '—' }}</div>
            <div class="sub">{{ row.ownerPhone || '' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="成员数" width="90" align="center">
          <template #default="{ row }">{{ row.memberCount ?? 0 }}</template>
        </el-table-column>
        <el-table-column label="全员禁言" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.muteAll ? 'warning' : 'info'" size="small" effect="plain">
              {{ row.muteAll ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="加群审核" width="100" align="center">
          <template #default="{ row }">
            <el-tag :type="row.joinVerifyRequired ? 'warning' : 'info'" size="small" effect="plain">
              {{ row.joinVerifyRequired ? '需审核' : '免审' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最近活跃" width="170">
          <template #default="{ row }">{{ formatTime(row.lastMsgTime) }}</template>
        </el-table-column>
        <el-table-column label="创建时间" width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="360" fixed="right">
          <template #default="{ row }">
            <div class="op-row">
              <el-button link type="primary" @click="openDetail(row)">查看</el-button>
              <el-button link type="warning" @click="openTransferOwner(row)">更改群主</el-button>
              <el-button link type="primary" @click="$router.push({ path: '/group-member-events', query: { conversationId: String(row.id) } })">出入</el-button>
              <el-button link type="primary" @click="$router.push({ path: '/group-owner-transfers', query: { conversationId: String(row.id) } })">转让记录</el-button>
              <el-button link type="primary" @click="$router.push({ path: '/group-operation-logs', query: { conversationId: String(row.id) } })">操作</el-button>
              <el-button link type="danger" @click="handleDissolve(row)">解散</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.size"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          background
          @current-change="loadGroups"
          @size-change="() => { query.page = 1; loadGroups() }"
        />
      </div>
    </el-card>

    <el-dialog v-model="createVisible" title="新建群聊" width="560px" destroy-on-close>
      <el-form label-width="88px">
        <el-form-item label="群名称" required>
          <el-input v-model="createForm.title" maxlength="64" show-word-limit placeholder="请输入群名称" />
        </el-form-item>
        <el-form-item label="群主" required>
          <el-select
            v-model="createForm.ownerId"
            filterable
            remote
            clearable
            :remote-method="(kw: string) => searchUsers(kw, 'owner')"
            :loading="ownerSearching"
            placeholder="搜索用户昵称 / 手机 / PulseID"
            style="width: 100%"
            @change="onOwnerChange"
          >
            <el-option
              v-for="u in ownerOptions"
              :key="u.id"
              :label="userOptionLabel(u)"
              :value="u.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="群成员" required>
          <el-select
            v-model="createForm.memberIds"
            multiple
            filterable
            remote
            collapse-tags
            collapse-tags-tooltip
            :remote-method="(kw: string) => searchUsers(kw, 'member')"
            :loading="memberSearching"
            placeholder="至少再选一位成员"
            style="width: 100%"
          >
            <el-option
              v-for="u in memberOptions.filter((x) => x.id !== createForm.ownerId)"
              :key="u.id"
              :label="userOptionLabel(u)"
              :value="u.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="群公告">
          <el-input
            v-model="createForm.notice"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="可选"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="createSaving" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailVisible" title="群聊详情" width="680px" destroy-on-close>
      <div v-loading="detailLoading" class="detail-panel">
        <template v-if="detail">
          <div class="detail-header">
            <AdminAvatar shape="circle" :size="64" :url="avatarSrc(detail.avatarUrl)">
              {{ (detail.title || '群').slice(0, 1) }}
            </AdminAvatar>
            <div class="detail-header-meta">
              <div class="detail-name">{{ detail.title || '未命名群聊' }}</div>
              <div class="detail-sub">PulseID {{ detail.pulseId || '—' }} · 群 ID {{ detail.id }} · 成员 {{ detail.memberCount ?? 0 }} 人</div>
              <div class="detail-tags">
                <el-tag :type="detail.muteAll ? 'warning' : 'info'" size="small" effect="plain">
                  {{ detail.muteAll ? '全员禁言' : '正常发言' }}
                </el-tag>
                <el-tag :type="detail.joinVerifyRequired ? 'warning' : 'info'" size="small" effect="plain">
                  {{ detail.joinVerifyRequired ? '加群需审核' : '加群免审' }}
                </el-tag>
              </div>
            </div>
          </div>

          <el-descriptions :column="2" border class="detail-desc">
            <el-descriptions-item label="群主">
              {{ detail.ownerNickname || '—' }}
              <template v-if="detail.ownerPhone">（{{ detail.ownerPhone }}）</template>
            </el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ formatTime(detail.createdAt) }}</el-descriptions-item>
            <el-descriptions-item label="最近活跃">{{ formatTime(detail.lastMsgTime) }}</el-descriptions-item>
            <el-descriptions-item label="最近消息">{{ recentMessagePreview(detail.lastMsgPreview) }}</el-descriptions-item>
            <el-descriptions-item label="群公告" :span="2">{{ detail.notice || '—' }}</el-descriptions-item>
            <el-descriptions-item label="群聊欢迎语" :span="2">
              {{ detail.welcomeMessage || '未设置' }}
              <span v-if="detail.welcomeSetterNickname" class="desc-muted">
                （设置人：{{ detail.welcomeSetterNickname }}）
              </span>
            </el-descriptions-item>
          </el-descriptions>

          <div class="members-title">建群记录（{{ detail.createRecords?.length || 0 }}）</div>
          <el-table
            :data="(detail.createRecords || []) as GroupCreateRecord[]"
            size="small"
            max-height="240"
            empty-text="暂无建群记录"
            class="create-records-table"
          >
            <el-table-column label="用户" min-width="160">
              <template #default="{ row }">
                <div class="member-cell">
                  <AdminAvatar shape="circle" :size="28" :url="avatarSrc(row.avatarUrl)">
                    {{ (row.nickname || '?').slice(0, 1) }}
                  </AdminAvatar>
                  <div>
                    <div>{{ row.nickname || '—' }}</div>
                    <div class="sub">ID {{ row.userId ?? '—' }}</div>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="手机号" width="120">
              <template #default="{ row }">{{ row.phone || '—' }}</template>
            </el-table-column>
            <el-table-column label="动作" width="120">
              <template #default="{ row }">
                <el-tag
                  size="small"
                  :type="row.source === 'create' ? 'danger' : 'warning'"
                  effect="plain"
                >
                  {{ row.sourceLabel || row.reason || '建群' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作人" width="120">
              <template #default="{ row }">{{ row.operatorNickname || '—' }}</template>
            </el-table-column>
            <el-table-column label="时间" width="160">
              <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
            </el-table-column>
          </el-table>

          <QrCodeBlock
            v-if="detailGroupQrPayload"
            title="群聊二维码"
            :payload="detailGroupQrPayload"
            :filename="`group-${detail.id}`"
          />

          <div class="members-title">群成员（{{ detail.members?.length || 0 }}）</div>
          <el-table :data="(detail.members || []) as GroupMember[]" size="small" max-height="320" empty-text="暂无成员">
            <el-table-column label="成员" min-width="160">
              <template #default="{ row }">
                <div class="member-cell">
                  <AdminAvatar shape="circle" :size="28" :url="avatarSrc(row.avatarUrl)">
                    {{ (row.nickname || '?').slice(0, 1) }}
                  </AdminAvatar>
                  <span>{{ row.nickname || '—' }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="phone" label="手机号" width="120">
              <template #default="{ row }">{{ row.phone || '—' }}</template>
            </el-table-column>
            <el-table-column label="PulseID" width="100">
              <template #default="{ row }">{{ row.pulseId || '—' }}</template>
            </el-table-column>
            <el-table-column label="角色" width="90">
              <template #default="{ row }">
                <el-tag
                  size="small"
                  :type="row.role === 'owner' ? 'danger' : row.role === 'admin' ? 'warning' : 'info'"
                  effect="plain"
                >
                  {{ roleLabel(row.role) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="禁言" width="90" align="center">
              <template #default="{ row }">
                <el-tag
                  size="small"
                  :type="row.speakMuted ? 'warning' : 'success'"
                  effect="plain"
                >
                  {{ row.speakMuted ? '已禁言' : '正常' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="入群方式" width="110">
              <template #default="{ row }">{{ joinSourceLabel(row.joinSource) }}</template>
            </el-table-column>
            <el-table-column label="入群时间" width="160">
              <template #default="{ row }">{{ formatTime(row.joinedAt) }}</template>
            </el-table-column>
          </el-table>
        </template>
      </div>
      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
        <el-button
          type="warning"
          :disabled="!detail"
          @click="detail && openTransferOwner(detail)"
        >
          更改群主
        </el-button>
        <el-button
          type="danger"
          :disabled="!detail"
          @click="detail && handleDissolve(detail)"
        >
          解散群聊
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="transferVisible"
      title="更改群主"
      width="480px"
      destroy-on-close
      :close-on-click-modal="false"
    >
      <div v-loading="transferLoading">
        <el-alert
          type="info"
          :closable="false"
          show-icon
          style="margin-bottom: 16px"
          :title="`群聊「${transferGroup?.title || transferGroup?.id || ''}」当前群主：${transferGroup?.ownerNickname || '—'}（${transferGroup?.ownerPhone || '无手机号'}）`"
        />
        <el-form label-width="88px">
          <el-form-item label="新群主" required>
            <el-select
              v-model="newOwnerId"
              filterable
              clearable
              placeholder="请选择群内成员"
              style="width: 100%"
              :disabled="!transferMembers.length"
            >
              <el-option
                v-for="m in transferMembers"
                :key="m.userId"
                :label="memberLabel(m)"
                :value="m.userId"
              />
            </el-select>
          </el-form-item>
        </el-form>
        <div v-if="!transferLoading && !transferMembers.length" class="transfer-empty">
          该群没有可转让的其他成员
        </div>
      </div>
      <template #footer>
        <el-button @click="transferVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="transferSaving"
          :disabled="!newOwnerId || !transferMembers.length"
          @click="submitTransferOwner"
        >
          确认更改
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.groups-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.batch-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.batch-hint {
  font-size: 13px;
  color: #606266;
  margin-right: 4px;
}

.op-row {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  white-space: nowrap;
  gap: 0;
}

.op-row :deep(.el-button) {
  margin-left: 0;
  padding: 0 6px;
}

.toolbar-card,
.table-card {
  border-radius: 12px;
}

.toolbar-card :deep(.el-card__body) {
  padding-bottom: 2px;
}

.group-cell,
.member-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.group-cell :deep(.el-avatar),
.detail-header :deep(.el-avatar),
.member-cell :deep(.el-avatar) {
  border-radius: 50% !important;
  overflow: hidden;
  background: #e5e7eb;
  flex-shrink: 0;
}

.group-cell :deep(.el-avatar > img),
.detail-header :deep(.el-avatar > img),
.member-cell :deep(.el-avatar > img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.group-meta .title,
.detail-name {
  font-weight: 600;
  color: #303133;
  line-height: 1.3;
}

.sub,
.detail-sub {
  margin-top: 2px;
  font-size: 12px;
  color: #909399;
}

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.detail-panel {
  min-height: 200px;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.detail-name {
  font-size: 18px;
}

.detail-tags {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.detail-desc {
  width: 100%;
  margin-bottom: 20px;
}

.members-title {
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.transfer-empty {
  font-size: 13px;
  color: #909399;
  text-align: center;
  padding: 8px 0 4px;
}
</style>

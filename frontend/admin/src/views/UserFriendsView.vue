<script setup lang="ts">
import { formatTime } from '@/utils/datetime'
import { onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from '@/utils/elementFeedback'
import {
  createUserFriend,
  fetchAllUserFriends,
  fetchUsers,
  type AdminCommonGroup,
  type AdminFriend,
  type AdminUser,
} from '@/api/users'
import { resolveAvatarUrl } from '@/api/files'
import AdminAvatar from '@/components/AdminAvatar.vue'

const route = useRoute()
const loading = ref(false)
const saving = ref(false)
const searching = ref(false)
const rows = ref<AdminFriend[]>([])
const total = ref(0)
const userOptions = ref<AdminUser[]>([])
const query = reactive({
  keyword: '',
  userId: '' as number | '',
  page: 1,
  size: 20,
})

const groupsVisible = ref(false)
const groupsTitle = ref('')
const groupsList = ref<AdminCommonGroup[]>([])

const createVisible = ref(false)
const createForm = reactive({
  userId: undefined as number | undefined,
  friendId: undefined as number | undefined,
  remark: '',
})

function applyRouteQuery() {
  const raw = route.query.userId
  if (raw != null && String(raw).trim() !== '') {
    const n = Number(raw)
    if (!Number.isNaN(n) && n > 0) query.userId = n
  }
}

async function load() {
  loading.value = true
  try {
    const data = await fetchAllUserFriends({
      page: query.page,
      size: query.size,
      keyword: query.keyword.trim(),
      userId: query.userId,
    })
    rows.value = data.list
    total.value = data.total
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载好友列表失败')
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  query.page = 1
  load()
}

function handleReset() {
  query.keyword = ''
  query.userId = ''
  query.page = 1
  load()
}

function avatarSrc(url?: string) {
  return resolveAvatarUrl(url) || undefined
}

function userLabel(user: AdminUser) {
  return `${user.nickname || '未命名'} · ${user.phone || '-'} · ID ${user.id}`
}

async function searchUsers(keyword: string) {
  searching.value = true
  try {
    const result = await fetchUsers({
      page: 1,
      size: 50,
      keyword,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    })
    const keepIds = new Set(
      [createForm.userId, createForm.friendId].filter((id): id is number => !!id),
    )
    const kept = userOptions.value.filter((u) => keepIds.has(u.id))
    userOptions.value = [
      ...kept,
      ...result.list.filter((u) => !kept.some((k) => k.id === u.id)),
    ]
  } finally {
    searching.value = false
  }
}

function openCreate() {
  createForm.userId = typeof query.userId === 'number' ? query.userId : undefined
  createForm.friendId = undefined
  createForm.remark = ''
  createVisible.value = true
  void searchUsers('')
}

async function submitCreate() {
  if (!createForm.userId || !createForm.friendId) {
    ElMessage.warning('请选择用户和好友')
    return
  }
  if (createForm.userId === createForm.friendId) {
    ElMessage.warning('用户和好友不能是同一人')
    return
  }
  const owner = userOptions.value.find((u) => u.id === createForm.userId)
  const peer = userOptions.value.find((u) => u.id === createForm.friendId)
  const ownerName = owner?.nickname || `用户 ${createForm.userId}`
  const peerName = peer?.nickname || `用户 ${createForm.friendId}`
  try {
    await ElMessageBox.confirm(
      `确认为「${ownerName}」添加好友「${peerName}」吗？将建立双向好友关系。`,
      '新建好友',
      { type: 'warning', confirmButtonText: '确认创建', cancelButtonText: '取消' },
    )
    saving.value = true
    await createUserFriend({
      userId: createForm.userId,
      friendId: createForm.friendId,
      remark: createForm.remark,
    })
    ElMessage.success('已创建好友关系')
    createVisible.value = false
    query.page = 1
    await load()
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(e instanceof Error ? e.message : '创建失败')
  } finally {
    saving.value = false
  }
}

function commonGroupPreview(row: AdminFriend) {
  const list = row.commonGroups || []
  if (!list.length) return '无'
  const names = list.slice(0, 2).map((g) => g.title || '群聊')
  const more = list.length > 2 ? ` 等${list.length}个` : ''
  return names.join('、') + more
}

function openCommonGroups(row: AdminFriend) {
  const list = row.commonGroups || []
  if (!list.length) return
  groupsTitle.value = `${row.ownerNickname || '用户'} 与 ${row.nickname || '好友'} 的共同群聊`
  groupsList.value = list
  groupsVisible.value = true
}

onMounted(() => {
  applyRouteQuery()
  load()
})

watch(
  () => route.query.userId,
  () => {
    applyRouteQuery()
    query.page = 1
    load()
  },
)
</script>

<template>
  <div class="page">
    <el-card shadow="never" class="toolbar-card">
      <el-form :inline="true" @submit.prevent="handleSearch">
        <el-form-item label="关键词">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="用户 / 好友 / 备注、手机、PulseID"
            style="width: 260px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="用户 ID">
          <el-input-number v-model="query.userId" :controls="false" placeholder="可选" style="width: 140px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
          <el-button type="success" @click="openCreate">新建</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="table-card">
      <el-table v-loading="loading" :data="rows" stripe empty-text="暂无好友关系">
        <el-table-column label="用户" min-width="180">
          <template #default="{ row }">
            <div class="title">{{ row.ownerNickname || '—' }}</div>
            <div class="sub">
              ID {{ row.ownerUserId ?? '—' }}
              <template v-if="row.ownerPhone"> · {{ row.ownerPhone }}</template>
              <template v-if="row.ownerPulseId"> · {{ row.ownerPulseId }}</template>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="好友" min-width="240">
          <template #default="{ row }">
            <div class="peer">
              <AdminAvatar :size="36" :url="avatarSrc(row.avatarUrl)">
                {{ ((row.remark || row.nickname) || '?').slice(0, 1) }}
              </AdminAvatar>
              <div>
                <div class="title">
                  {{ row.remark || row.nickname || '—' }}
                  <el-tag v-if="row.online" size="small" type="success" effect="plain">在线</el-tag>
                </div>
                <div v-if="row.remark" class="sub">昵称：{{ row.nickname || '—' }}</div>
                <div class="sub">
                  ID {{ row.userId ?? '—' }}
                  <template v-if="row.phone"> · {{ row.phone }}</template>
                  <template v-if="row.pulseId"> · {{ row.pulseId }}</template>
                </div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="用户备注" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">
            <span v-if="row.remark" class="remark">{{ row.remark }}</span>
            <span v-else class="muted">未设置</span>
          </template>
        </el-table-column>
        <el-table-column label="共同群聊" min-width="200">
          <template #default="{ row }">
            <button
              v-if="(row.commonGroupCount || 0) > 0"
              type="button"
              class="link-btn"
              @click="openCommonGroups(row)"
            >
              <span class="count">{{ row.commonGroupCount }} 个</span>
              <span class="preview">{{ commonGroupPreview(row) }}</span>
            </button>
            <span v-else class="muted">无</span>
          </template>
        </el-table-column>
        <el-table-column label="添加方式" width="120">
          <template #default="{ row }">{{ row.addSourceLabel || '—' }}</template>
        </el-table-column>
        <el-table-column label="发起人" width="120">
          <template #default="{ row }">{{ row.addInitiatorNickname || '—' }}</template>
        </el-table-column>
        <el-table-column label="成为好友时间" width="170">
          <template #default="{ row }">{{ formatTime(row.friendSince) }}</template>
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
          @current-change="load"
          @size-change="
            () => {
              query.page = 1
              load()
            }
          "
        />
      </div>
    </el-card>

    <el-dialog v-model="createVisible" title="新建好友" width="520px" destroy-on-close>
      <el-form label-width="88px" @submit.prevent="submitCreate">
        <el-form-item label="用户" required>
          <el-select
            v-model="createForm.userId"
            filterable
            remote
            reserve-keyword
            clearable
            :remote-method="searchUsers"
            :loading="searching"
            placeholder="搜索昵称、手机号或 PulseID"
            style="width: 100%"
          >
            <el-option
              v-for="user in userOptions"
              :key="'u-' + user.id"
              :label="userLabel(user)"
              :value="user.id"
              :disabled="user.id === createForm.friendId"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="好友" required>
          <el-select
            v-model="createForm.friendId"
            filterable
            remote
            reserve-keyword
            clearable
            :remote-method="searchUsers"
            :loading="searching"
            placeholder="搜索昵称、手机号或 PulseID"
            style="width: 100%"
          >
            <el-option
              v-for="user in userOptions"
              :key="'f-' + user.id"
              :label="userLabel(user)"
              :value="user.id"
              :disabled="user.id === createForm.userId"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="createForm.remark"
            maxlength="64"
            show-word-limit
            clearable
            placeholder="可选，写入该用户对好友的备注"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitCreate">确认创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="groupsVisible" :title="groupsTitle" width="520px" destroy-on-close>
      <el-table :data="groupsList" stripe empty-text="暂无共同群聊" max-height="420">
        <el-table-column label="群聊" min-width="220">
          <template #default="{ row }">
            <div class="peer">
              <AdminAvatar :size="32" :url="avatarSrc(row.avatarUrl)">
                {{ (row.title || '群').slice(0, 1) }}
              </AdminAvatar>
              <div>
                <div class="title">{{ row.title || '群聊' }}</div>
                <div class="sub">群 ID {{ row.id }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="成员数" width="100" align="center">
          <template #default="{ row }">{{ row.memberCount ?? '—' }}</template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.toolbar-card,
.table-card {
  border-radius: 12px;
}
.toolbar-card :deep(.el-card__body) {
  padding-bottom: 2px;
}
.title {
  font-weight: 600;
  color: #303133;
}
.sub {
  margin-top: 2px;
  font-size: 12px;
  color: #909399;
}
.peer {
  display: flex;
  align-items: center;
  gap: 10px;
}
.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
.link-btn {
  border: none;
  background: transparent;
  padding: 0;
  text-align: left;
  cursor: pointer;
  color: #409eff;
  max-width: 100%;
}
.link-btn .count {
  font-weight: 600;
  margin-right: 6px;
}
.link-btn .preview {
  color: #606266;
  font-size: 12px;
}
.muted {
  color: #c0c4cc;
}
.remark {
  color: #303133;
  font-weight: 500;
}
</style>

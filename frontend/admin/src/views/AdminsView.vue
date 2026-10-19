<script setup lang="ts">
import { formatTime } from '@/utils/datetime'
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from '@/utils/elementFeedback'
import type { FormInstance, FormRules } from 'element-plus'
import {
  createAdmin,
  deleteAdmin,
  fetchAdmins,
  fetchPermissionCatalog,
  resetAdminPassword,
  updateAdmin,
  type AdminAccount,
  type PermissionItem,
} from '@/api/admins'
import { useAdminStore } from '@/stores/admin'

const loading = ref(false)
const saving = ref(false)
const admins = ref<AdminAccount[]>([])
const total = ref(0)
const catalog = ref<PermissionItem[]>([])
const adminStore = useAdminStore()

const query = reactive({
  keyword: '',
  status: '' as number | '',
  page: 1,
  size: 20,
})

const createVisible = ref(false)
const editVisible = ref(false)
const passwordVisible = ref(false)
const current = ref<AdminAccount | null>(null)

const createFormRef = ref<FormInstance>()
const editFormRef = ref<FormInstance>()
const passwordFormRef = ref<FormInstance>()

const createForm = reactive({
  username: '',
  password: '',
  nickname: '',
  superAdmin: false,
  permissions: [] as string[],
  status: 1,
})

const editForm = reactive({
  nickname: '',
  superAdmin: false,
  permissions: [] as string[],
  status: 1,
})

const passwordForm = reactive({
  password: '',
  confirmPassword: '',
})

const createRules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 32, message: '用户名长度 3-32 位', trigger: 'blur' },
    {
      pattern: /^[a-zA-Z0-9_]+$/,
      message: '仅支持字母、数字和下划线',
      trigger: 'blur',
    },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 32, message: '密码长度 6-32 位', trigger: 'blur' },
  ],
}

const passwordRules: FormRules = {
  password: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, max: 32, message: '密码长度 6-32 位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    {
      validator: (_r, v, cb) => {
        if (v !== passwordForm.password) cb(new Error('两次输入不一致'))
        else cb()
      },
      trigger: 'blur',
    },
  ],
}

const canManageSuper = computed(() => adminStore.superAdmin)
const assignablePermissions = computed(() => {
  if (adminStore.superAdmin) return catalog.value
  const mine = new Set(adminStore.permissions || [])
  return catalog.value.filter((p) => mine.has(p.code))
})

const permissionGroups = computed(() => {
  const map = new Map<string, PermissionItem[]>()
  for (const item of assignablePermissions.value) {
    const group = item.group || '其他'
    if (!map.has(group)) map.set(group, [])
    map.get(group)!.push(item)
  }
  return [...map.entries()].map(([name, items]) => ({ name, items }))
})

function isGroupChecked(groupItems: PermissionItem[], selected: string[]) {
  if (!groupItems.length) return false
  return groupItems.every((p) => selected.includes(p.code))
}

function isGroupIndeterminate(groupItems: PermissionItem[], selected: string[]) {
  const hit = groupItems.filter((p) => selected.includes(p.code)).length
  return hit > 0 && hit < groupItems.length
}

function toggleGroup(groupItems: PermissionItem[], selected: string[], checked: boolean) {
  const codes = new Set(selected)
  for (const item of groupItems) {
    if (checked) codes.add(item.code)
    else codes.delete(item.code)
  }
  return [...codes]
}

function selectAllAssignable(target: 'create' | 'edit') {
  const codes = assignablePermissions.value.map((p) => p.code)
  if (target === 'create') createForm.permissions = codes
  else editForm.permissions = codes
}

function clearAssignable(target: 'create' | 'edit') {
  if (target === 'create') createForm.permissions = []
  else editForm.permissions = []
}

async function loadCatalog() {
  try {
    catalog.value = await fetchPermissionCatalog()
  } catch {
    catalog.value = []
  }
}

async function loadAdmins() {
  loading.value = true
  try {
    const data = await fetchAdmins({
      page: query.page,
      size: query.size,
      keyword: query.keyword.trim(),
      status: query.status,
    })
    admins.value = data.list
    total.value = data.total
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载管理员失败')
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  query.page = 1
  loadAdmins()
}

function handleReset() {
  query.keyword = ''
  query.status = ''
  query.page = 1
  loadAdmins()
}

function openCreate() {
  createForm.username = ''
  createForm.password = ''
  createForm.nickname = ''
  createForm.superAdmin = false
  createForm.permissions = []
  createForm.status = 1
  createVisible.value = true
}

function openEdit(row: AdminAccount) {
  current.value = row
  editForm.nickname = row.nickname || ''
  editForm.superAdmin = !!row.superAdmin
  editForm.permissions = [...(row.permissions || [])]
  editForm.status = row.status
  editVisible.value = true
}

function openPassword(row: AdminAccount) {
  current.value = row
  passwordForm.password = ''
  passwordForm.confirmPassword = ''
  passwordVisible.value = true
}

async function submitCreate() {
  const valid = await createFormRef.value?.validate().catch(() => false)
  if (!valid) return
  if (!createForm.superAdmin && !createForm.permissions.length) {
    ElMessage.warning('请至少选择一项权限')
    return
  }
  saving.value = true
  try {
    await createAdmin({
      username: createForm.username.trim(),
      password: createForm.password,
      nickname: createForm.nickname.trim() || undefined,
      superAdmin: createForm.superAdmin,
      permissions: createForm.superAdmin ? undefined : createForm.permissions,
      status: createForm.status,
    })
    ElMessage.success('已创建管理员')
    createVisible.value = false
    await loadAdmins()
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '创建失败')
  } finally {
    saving.value = false
  }
}

async function submitEdit() {
  if (!current.value) return
  if (!editForm.superAdmin && !editForm.permissions.length) {
    ElMessage.warning('请至少选择一项权限')
    return
  }
  saving.value = true
  try {
    await updateAdmin(current.value.id, {
      nickname: editForm.nickname.trim(),
      superAdmin: editForm.superAdmin,
      permissions: editForm.superAdmin ? [] : editForm.permissions,
      status: editForm.status,
    })
    ElMessage.success('已保存')
    editVisible.value = false
    await loadAdmins()
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '保存失败')
  } finally {
    saving.value = false
  }
}

async function submitPassword() {
  if (!current.value) return
  const valid = await passwordFormRef.value?.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    await resetAdminPassword(current.value.id, passwordForm.password)
    ElMessage.success('密码已重置')
    passwordVisible.value = false
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '重置失败')
  } finally {
    saving.value = false
  }
}

async function toggleStatus(row: AdminAccount) {
  const next = row.status === 1 ? 0 : 1
  try {
    await updateAdmin(row.id, { status: next })
    ElMessage.success(next === 1 ? '已启用' : '已禁用')
    await loadAdmins()
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '操作失败')
  }
}

async function handleDelete(row: AdminAccount) {
  try {
    await ElMessageBox.confirm(`确定删除管理员「${row.username}」吗？`, '删除管理员', {
      type: 'warning',
      confirmButtonText: '删除',
      confirmButtonClass: 'el-button--danger',
    })
    await deleteAdmin(row.id)
    ElMessage.success('已删除')
    await loadAdmins()
  } catch (e) {
    if (e === 'cancel' || e === 'close') return
    ElMessage.error(e instanceof Error ? e.message : '删除失败')
  }
}


function permLabels(codes?: string[]) {
  if (!codes?.length) return '—'
  const map = new Map(catalog.value.map((c) => [c.code, c.label]))
  return codes.map((c) => map.get(c) || c).join('、')
}

onMounted(async () => {
  await loadCatalog()
  await loadAdmins()
})
</script>

<template>
  <div class="admins-page">
    <el-card shadow="never" class="toolbar-card">
      <el-form :inline="true" @submit.prevent="handleSearch">
        <el-form-item label="关键词">
          <el-input
            v-model="query.keyword"
            clearable
            placeholder="用户名 / 昵称"
            style="width: 200px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" clearable placeholder="全部" style="width: 120px">
            <el-option label="正常" :value="1" />
            <el-option label="禁用" :value="0" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
          <el-button type="primary" @click="openCreate">新建管理员</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="table-card">
      <el-table v-loading="loading" :data="admins" stripe row-key="id" empty-text="暂无管理员">
        <el-table-column label="账号" min-width="160">
          <template #default="{ row }">
            <div class="name-cell">
              <div class="nickname">{{ row.nickname || row.username }}</div>
              <div class="sub">{{ row.username }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="角色" width="110">
          <template #default="{ row }">
            <el-tag :type="row.superAdmin ? 'danger' : 'info'" size="small" effect="plain">
              {{ row.superAdmin ? '超级管理员' : '子管理员' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="权限" min-width="240" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.superAdmin ? '全部权限' : permLabels(row.permissions) }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'danger'" size="small">
              {{ row.status === 1 ? '正常' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="warning" @click="openPassword(row)">重置密码</el-button>
            <el-button
              link
              :type="row.status === 1 ? 'danger' : 'success'"
              :disabled="String(row.id) === adminStore.userId"
              @click="toggleStatus(row)"
            >
              {{ row.status === 1 ? '禁用' : '启用' }}
            </el-button>
            <el-button
              link
              type="danger"
              :disabled="String(row.id) === adminStore.userId"
              @click="handleDelete(row)"
            >
              删除
            </el-button>
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
          @current-change="loadAdmins"
          @size-change="() => { query.page = 1; loadAdmins() }"
        />
      </div>
    </el-card>

    <el-dialog v-model="createVisible" title="新建管理员" width="720px" destroy-on-close>
      <el-form ref="createFormRef" :model="createForm" :rules="createRules" label-width="96px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="createForm.username" maxlength="32" placeholder="登录用户名" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="createForm.password" type="password" show-password maxlength="32" />
        </el-form-item>
        <el-form-item label="昵称">
          <el-input v-model="createForm.nickname" maxlength="32" placeholder="可选" />
        </el-form-item>
        <el-form-item v-if="canManageSuper" label="超级管理员">
          <el-switch v-model="createForm.superAdmin" />
        </el-form-item>
        <el-form-item v-if="!createForm.superAdmin" label="权限">
          <div class="perm-panel">
            <div class="perm-toolbar">
              <el-button link type="primary" @click="selectAllAssignable('create')">全选</el-button>
              <el-button link @click="clearAssignable('create')">清空</el-button>
            </div>
            <div v-for="group in permissionGroups" :key="group.name" class="perm-section">
              <div class="perm-section-title">
                <el-checkbox
                  :model-value="isGroupChecked(group.items, createForm.permissions)"
                  :indeterminate="isGroupIndeterminate(group.items, createForm.permissions)"
                  @change="(v: boolean | string | number) => {
                    createForm.permissions = toggleGroup(group.items, createForm.permissions, !!v)
                  }"
                >
                  {{ group.name }}
                </el-checkbox>
              </div>
              <el-checkbox-group v-model="createForm.permissions" class="perm-group">
                <el-checkbox v-for="p in group.items" :key="p.code" :label="p.code" :value="p.code">
                  {{ p.label }}
                </el-checkbox>
              </el-checkbox-group>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="createForm.status">
            <el-radio :value="1">正常</el-radio>
            <el-radio :value="0">禁用</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="editVisible" title="编辑管理员" width="720px" destroy-on-close>
      <el-form ref="editFormRef" :model="editForm" label-width="96px">
        <el-form-item label="用户名">
          <el-input :model-value="current?.username" disabled />
        </el-form-item>
        <el-form-item label="昵称">
          <el-input v-model="editForm.nickname" maxlength="32" />
        </el-form-item>
        <el-form-item v-if="canManageSuper" label="超级管理员">
          <el-switch v-model="editForm.superAdmin" />
        </el-form-item>
        <el-form-item v-if="!editForm.superAdmin" label="权限">
          <div class="perm-panel">
            <div class="perm-toolbar">
              <el-button link type="primary" @click="selectAllAssignable('edit')">全选</el-button>
              <el-button link @click="clearAssignable('edit')">清空</el-button>
            </div>
            <div v-for="group in permissionGroups" :key="group.name" class="perm-section">
              <div class="perm-section-title">
                <el-checkbox
                  :model-value="isGroupChecked(group.items, editForm.permissions)"
                  :indeterminate="isGroupIndeterminate(group.items, editForm.permissions)"
                  @change="(v: boolean | string | number) => {
                    editForm.permissions = toggleGroup(group.items, editForm.permissions, !!v)
                  }"
                >
                  {{ group.name }}
                </el-checkbox>
              </div>
              <el-checkbox-group v-model="editForm.permissions" class="perm-group">
                <el-checkbox v-for="p in group.items" :key="p.code" :label="p.code" :value="p.code">
                  {{ p.label }}
                </el-checkbox>
              </el-checkbox-group>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="editForm.status">
            <el-radio :value="1">正常</el-radio>
            <el-radio :value="0">禁用</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="passwordVisible" title="重置密码" width="420px" destroy-on-close>
      <el-form ref="passwordFormRef" :model="passwordForm" :rules="passwordRules" label-width="96px">
        <el-form-item label="新密码" prop="password">
          <el-input v-model="passwordForm.password" type="password" show-password maxlength="32" />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input v-model="passwordForm.confirmPassword" type="password" show-password maxlength="32" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="passwordVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitPassword">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.admins-page {
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

.name-cell .nickname {
  font-weight: 600;
  color: #303133;
}

.name-cell .sub {
  margin-top: 2px;
  font-size: 12px;
  color: #909399;
}

.pager {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

.perm-panel {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.perm-toolbar {
  display: flex;
  gap: 8px;
}

.perm-section {
  padding: 10px 12px;
  border: 1px solid #ebeef5;
  border-radius: 10px;
  background: #fafafa;
}

.perm-section-title {
  margin-bottom: 8px;
  font-weight: 600;
}

.perm-group {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 12px;
  width: 100%;
}

.perm-group :deep(.el-checkbox) {
  margin-right: 0;
  height: auto;
  align-items: flex-start;
  white-space: normal;
}

.perm-group :deep(.el-checkbox__label) {
  line-height: 1.35;
  white-space: normal;
}
</style>

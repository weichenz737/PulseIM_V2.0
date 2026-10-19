<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from '@/utils/elementFeedback'
import {
  fetchDefaultFriend,
  fetchUsers,
  saveDefaultFriend,
  type AdminUser,
} from '@/api/users'

type FriendRow = {
  friendUserId?: number
  nicknameMode: 'original' | 'custom'
  customNickname: string
  tag: string
  greetingText: string
  affectedUsers?: number
}

const loading = ref(false)
const saving = ref(false)
const searching = ref(false)
const options = ref<AdminUser[]>([])
const form = reactive({
  enabled: false,
  items: [] as FriendRow[],
  affectedUsers: 0,
})

function addRow() {
  form.items.push({ nicknameMode: 'original', customNickname: '', tag: '', greetingText: '' })
}

function removeRow(index: number) {
  form.items.splice(index, 1)
}

async function load() {
  loading.value = true
  try {
    const config = await fetchDefaultFriend()
    form.enabled = !!config.enabled
    form.affectedUsers = config.affectedUsers || 0
    form.items = (config.items || []).map((item) => ({
      friendUserId: item.friendUserId,
      nicknameMode: item.nicknameMode || 'original',
      customNickname: item.customNickname || '',
      tag: item.tag || '',
      greetingText: item.greetingText || '',
      affectedUsers: item.affectedUsers || 0,
    }))
    if (!form.items.length) addRow()
    const selectedIds = new Set(form.items.map((item) => item.friendUserId).filter(Boolean))
    if (selectedIds.size) {
      const result = await fetchUsers({ page: 1, size: 100, sortBy: 'createdAt', sortOrder: 'desc' })
      options.value = result.list
    }
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '加载失败')
  } finally {
    loading.value = false
  }
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
    const current = options.value.filter((user) =>
      form.items.some((item) => item.friendUserId === user.id),
    )
    options.value = [...current, ...result.list.filter((user) =>
      !current.some((selected) => selected.id === user.id),
    )]
  } finally {
    searching.value = false
  }
}

function userLabel(user: AdminUser) {
  return `${user.nickname || '未命名'} · ${user.phone || '-'} · PulseID ${user.pulseId || '-'}`
}

async function submit() {
  const configured = form.items.filter((item) => item.friendUserId)
  if (form.enabled && !configured.length) {
    ElMessage.warning('请至少选择一个默认好友')
    return
  }
  if (new Set(configured.map((item) => item.friendUserId)).size !== configured.length) {
    ElMessage.warning('不能重复选择同一个默认好友')
    return
  }
  if (configured.some((item) => item.nicknameMode === 'custom' && !item.customNickname.trim())) {
    ElMessage.warning('请填写每个默认好友的自定义昵称')
    return
  }
  try {
    await ElMessageBox.confirm(
      form.enabled
        ? `保存后将立即为全部用户应用 ${configured.length} 个默认好友，是否继续？`
        : '关闭后将移除系统自动创建的默认好友关系，是否继续？',
      '确认保存',
      { type: 'warning', confirmButtonText: '保存', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  saving.value = true
  try {
    await saveDefaultFriend({
      enabled: form.enabled,
      items: configured.map((item) => ({
        friendUserId: item.friendUserId,
        nicknameMode: item.nicknameMode,
        customNickname: item.nicknameMode === 'custom' ? item.customNickname.trim() : '',
        tag: item.tag.trim(),
        greetingText: item.greetingText.trim(),
      })),
    })
    ElMessage.success('默认好友配置已生效')
    await load()
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void Promise.all([load(), searchUsers('')])
})
</script>

<template>
  <div class="page" v-loading="loading">
    <el-card shadow="never" class="intro">
      <template #header><strong>用户默认好友</strong></template>
      <el-alert
        title="启用后，全部现有用户和后续注册用户都会自动与下方多个账号建立双向好友关系。可为每个默认好友设置用户端展示的标签。"
        type="info"
        :closable="false"
        show-icon
      />

      <el-form label-width="120px" class="form">
        <el-form-item label="启用默认好友">
          <el-switch v-model="form.enabled" />
        </el-form-item>
      </el-form>

      <div class="toolbar">
        <strong>默认好友列表（{{ form.items.filter((item) => item.friendUserId).length }}）</strong>
        <el-button type="primary" plain :disabled="!form.enabled" @click="addRow">
          添加默认好友
        </el-button>
      </div>

      <div v-for="(item, index) in form.items" :key="index" class="friend-row">
        <div class="row-index">{{ index + 1 }}</div>
        <el-select
          v-model="item.friendUserId"
          filterable
          remote
          reserve-keyword
          clearable
          :remote-method="searchUsers"
          :loading="searching"
          placeholder="搜索昵称、手机号或 PulseID"
          class="user-select"
          :disabled="!form.enabled"
        >
          <el-option
            v-for="user in options"
            :key="user.id"
            :label="userLabel(user)"
            :value="user.id"
            :disabled="form.items.some((row, rowIndex) =>
              rowIndex !== index && row.friendUserId === user.id)"
          />
        </el-select>
        <el-radio-group v-model="item.nicknameMode" :disabled="!form.enabled">
          <el-radio value="original">原昵称</el-radio>
          <el-radio value="custom">新昵称</el-radio>
        </el-radio-group>
        <el-input
          v-if="item.nicknameMode === 'custom'"
          v-model="item.customNickname"
          maxlength="64"
          placeholder="输入用户侧显示昵称"
          class="nickname-input"
          :disabled="!form.enabled"
        />
        <span v-else class="nickname-placeholder">显示账号原昵称</span>
        <el-input
          v-model="item.tag"
          maxlength="32"
          clearable
          placeholder="填写备注"
          class="tag-input"
          :disabled="!form.enabled"
        />
        <el-input
          v-model="item.greetingText"
          type="textarea"
          :rows="2"
          maxlength="500"
          show-word-limit
          clearable
          placeholder="打招呼话术（可选），例如：您好，有问题可以随时联系我"
          class="greeting-input"
          :disabled="!form.enabled"
        />
        <el-tag v-if="item.affectedUsers" type="success">{{ item.affectedUsers }} 人</el-tag>
        <el-button
          type="danger"
          link
          :disabled="!form.enabled"
          @click="removeRow(index)"
        >
          删除
        </el-button>
      </div>

      <el-empty v-if="!form.items.length" description="暂无默认好友" :image-size="72" />

      <div class="footer">
        <span>当前覆盖用户：<el-tag type="success">{{ form.affectedUsers }} 人</el-tag></span>
        <el-button type="primary" :loading="saving" @click="submit">保存并立即应用</el-button>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.page { display: flex; flex-direction: column; gap: 16px; }
.intro { width: 100%; max-width: none; border-radius: 12px; }
.form { margin-top: 24px; }
.toolbar, .footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 18px 0; }
.friend-row { display: flex; align-items: center; gap: 14px; padding: 14px; margin-bottom: 12px; border: 1px solid #e5e7eb; border-radius: 10px; background: #fafafa; }
.row-index { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; background: #e8f1ff; color: #2563eb; flex: none; }
.user-select { width: 460px; flex: 0 0 460px; }
.nickname-input { width: 220px; }
.nickname-placeholder { width: 220px; color: #909399; font-size: 13px; }
.tag-input { width: 220px; }
.greeting-input { width: 520px; flex: 1 1 520px; min-width: 420px; }
.footer { border-top: 1px solid #ebeef5; padding-top: 18px; margin-bottom: 0; }
@media (max-width: 1500px) {
  .user-select { width: 400px; flex-basis: 400px; }
  .nickname-input, .nickname-placeholder, .tag-input { width: 190px; }
  .greeting-input { min-width: 340px; }
}
@media (max-width: 900px) {
  .friend-row { align-items: stretch; flex-direction: column; }
  .user-select, .nickname-input, .nickname-placeholder, .tag-input, .greeting-input { width: 100%; }
}
</style>

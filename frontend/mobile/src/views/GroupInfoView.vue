<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { smartBack } from '@/utils/navBack'
import { showConfirmDialog, showToast } from 'vant'
import {
  fetchGroupDetail,
  formatGroupPulseId,
  updateGroupTitle,
  updateGroupNotice,
  updateGroupAvatar,
  leaveGroup,
  updateConversationSettings,
  addGroupMembers,
  roleLabel,
  clearGroupHistory,
  type GroupDetail,
} from '@/api/conversation'
import { fetchContacts, type ContactItem } from '@/api/contact'
import { groupQrPayload } from '@/utils/qrcode'
import QrCodeCard from '@/components/QrCodeCard.vue'
import QrPreviewModal from '@/components/QrPreviewModal.vue'
import { uploadChatFile, resolveAvatarUrl } from '@/api/file'

defineOptions({ name: 'GroupInfoView' })
import { compressAvatarFile } from '@/utils/media'
import { useUserStore } from '@/stores/user'
import ShareContactCard from '@/components/ShareContactCard.vue'
import UserAvatar from '@/components/UserAvatar.vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const conversationId = computed(() => route.params.id as string)

const loading = ref(true)
const detail = ref<GroupDetail | null>(null)
const pinned = ref(false)
const muted = ref(false)
const hidden = ref(false)
const showAllMembers = ref(false)
const showAdd = ref(false)
const contacts = ref<ContactItem[]>([])
const selected = ref<Set<string>>(new Set())
const groupQrPreview = ref(false)
const shareVisible = ref(false)
const showClearHistorySheet = ref(false)

const showTitleDialog = ref(false)
const showNoticeDialog = ref(false)
const titleDraft = ref('')
const noticeDraft = ref('')
const showNicknameDialog = ref(false)
const showRemarkDialog = ref(false)
const nicknameDraft = ref('')
const remarkDraft = ref('')
const saving = ref(false)
const avatarInput = ref<HTMLInputElement | null>(null)
const showAvatarConfirm = ref(false)
const avatarPreviewUrl = ref('')
const pendingAvatarFile = ref<File | null>(null)

const canManage = computed(() => !!detail.value?.admin || !!detail.value?.owner)
const groupQrData = computed(() => groupQrPayload(conversationId.value))

const previewMembers = computed(() => {
  const list = detail.value?.members || []
  if (showAllMembers.value) return list
  return list.slice(0, 8)
})

const memberIds = computed(() => new Set((detail.value?.members || []).map((m) => m.userId)))
const addableContacts = computed(() => contacts.value.filter((c) => !c.fileTransferAssistant && !memberIds.value.has(c.userId)))

onMounted(async () => {
  userStore.restoreSession()
  try {
    detail.value = await fetchGroupDetail(conversationId.value)
    pinned.value = detail.value.pinned
    muted.value = detail.value.mute
    hidden.value = detail.value.hidden
  } catch {
    detail.value = {
      id: conversationId.value,
      title: (route.query.title as string) || '群聊',
      pulseId: formatGroupPulseId(conversationId.value),
      avatarUrl: '',
      notice: '欢迎加入本群。请文明交流，遵守群规。',
      welcomeMessage: '',
      owner: false,
      admin: false,
      myRole: 'member',
      myGroupNickname: '',
      groupRemark: '',
      hidden: false,
      pinned: false,
      mute: false,
      muteAll: false,
      joinVerifyRequired: false,
      allowMemberAddFriend: true,
      searchMode: 3,
      memberInviteAllowed: true,
      pendingJoinCount: 0,
      speakMuted: false,
      memberCount: 0,
      members: [],
    }
  } finally {
    loading.value = false
  }
  try {
    contacts.value = await fetchContacts()
  } catch {
    contacts.value = []
  }
})

async function onPinnedChange() {
  try {
    await updateConversationSettings(conversationId.value, { pinned: pinned.value })
    window.dispatchEvent(new CustomEvent('pulse:conversation-settings-updated', {
      detail: { id: conversationId.value, pinned: pinned.value },
    }))
    showToast(pinned.value ? '已置顶' : '已取消置顶')
  } catch (e) {
    pinned.value = !pinned.value
    showToast(e instanceof Error ? e.message : '设置失败')
  }
}

async function onMuteChange() {
  try {
    await updateConversationSettings(conversationId.value, { mute: muted.value })
    window.dispatchEvent(new CustomEvent('pulse:conversation-settings-updated', {
      detail: { id: conversationId.value, mute: muted.value },
    }))
    showToast(muted.value ? '已开启免打扰' : '已关闭免打扰')
  } catch (e) {
    muted.value = !muted.value
    showToast(e instanceof Error ? e.message : '设置失败')
  }
}

function goBack() {
  smartBack(router)
}

function openMember(userId: string) {
  router.push({
    path: `/contacts/${userId}`,
    query: { source: 'group', groupId: conversationId.value },
  })
}

async function copyGroupPulseId() {
  const value = detail.value?.pulseId || formatGroupPulseId(conversationId.value)
  try {
    await navigator.clipboard.writeText(value)
    showToast('群 PulseID 已复制')
  } catch {
    showToast('当前环境不支持复制，请手动记录')
  }
}

async function savePersonalGroupSetting(kind: 'nickname' | 'remark') {
  const value = (kind === 'nickname' ? nicknameDraft.value : remarkDraft.value).trim()
  try {
    await updateConversationSettings(conversationId.value, kind === 'nickname'
      ? { groupNickname: value }
      : { groupRemark: value })
    if (detail.value) {
      if (kind === 'nickname') detail.value.myGroupNickname = value
      else detail.value.groupRemark = value
    }
    showNicknameDialog.value = false
    showRemarkDialog.value = false
    showToast('已保存')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '保存失败')
  }
}

async function onHiddenChange() {
  try {
    await updateConversationSettings(conversationId.value, { hidden: hidden.value })
    showToast(hidden.value ? '会话已隐藏，新消息到达时会重新显示' : '会话已恢复显示')
  } catch (e) {
    hidden.value = !hidden.value
    showToast(e instanceof Error ? e.message : '设置失败')
  }
}

function memberDisplayName(userId: string, nickname: string) {
  return String(userId) === String(userStore.userId || '') ? '我' : nickname
}

function openTitleDialog() {
  if (!detail.value) return
  if (!canManage.value) {
    showToast('仅群主或管理员可修改')
    return
  }
  titleDraft.value = detail.value.title
  showTitleDialog.value = true
}

async function confirmTitle() {
  const title = titleDraft.value.trim()
  if (!title) {
    showToast('群名称不能为空')
    return
  }
  saving.value = true
  try {
    await updateGroupTitle(conversationId.value, title)
    if (detail.value) detail.value.title = title
    showTitleDialog.value = false
    showToast('已更新')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '更新失败')
  } finally {
    saving.value = false
  }
}

function openNoticeDialog() {
  if (!detail.value) return
  if (!canManage.value) {
    showToast(detail.value.notice || '暂无群公告')
    return
  }
  noticeDraft.value = detail.value.notice || ''
  showNoticeDialog.value = true
}

async function confirmNotice() {
  saving.value = true
  try {
    const notice = noticeDraft.value.trim()
    await updateGroupNotice(conversationId.value, notice)
    if (detail.value) detail.value.notice = notice
    showNoticeDialog.value = false
    showToast('公告已更新')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '更新失败')
  } finally {
    saving.value = false
  }
}

function onAvatarClick() {
  if (!canManage.value) {
    showToast('仅群主或管理员可修改群头像')
    return
  }
  avatarInput.value?.click()
}

function revokeAvatarPreview() {
  if (avatarPreviewUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(avatarPreviewUrl.value)
  }
  avatarPreviewUrl.value = ''
  pendingAvatarFile.value = null
}

function closeAvatarConfirm() {
  showAvatarConfirm.value = false
  revokeAvatarPreview()
}

async function onAvatarSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    showToast('请选择图片文件')
    return
  }
  revokeAvatarPreview()
  pendingAvatarFile.value = file
  avatarPreviewUrl.value = URL.createObjectURL(file)
  showAvatarConfirm.value = true
}

async function confirmAvatarUpload() {
  const file = pendingAvatarFile.value
  if (!file || saving.value) return
  saving.value = true
  try {
    const avatarFile = await compressAvatarFile(file)
    const uploaded = await uploadChatFile(avatarFile)
    await updateGroupAvatar(conversationId.value, uploaded.url)
    const avatarUrl = resolveAvatarUrl(uploaded.url)
    if (detail.value) detail.value.avatarUrl = avatarUrl
    window.dispatchEvent(
      new CustomEvent('pulse:group-profile-updated', {
        detail: { conversationId: conversationId.value, avatarUrl },
      }),
    )
    showAvatarConfirm.value = false
    revokeAvatarPreview()
    showToast('群头像已更新')
  } catch (err) {
    showToast(err instanceof Error ? err.message : '更新失败')
  } finally {
    saving.value = false
  }
}

function onAddMember() {
  selected.value = new Set()
  showAdd.value = true
}

function onRemoveMember() {
  if (!canManage.value) {
    showToast('仅群主或管理员可移除成员')
    return
  }
  router.push(`/group/${conversationId.value}/manage`)
}

function onManage() {
  if (!canManage.value) {
    showToast('仅群主或管理员可管理群聊')
    return
  }
  router.push(`/group/${conversationId.value}/manage`)
}

function onSearchAll() {
  router.push({
    path: `/chat/${conversationId.value}/search`,
    query: {
      title: detail.value?.title || '群聊',
      type: 'group',
      scope: 'all',
    },
  })
}

function onSearchHistory() {
  router.push({
    path: `/chat/${conversationId.value}/search`,
    query: {
      title: detail.value?.title || '群聊',
      type: 'group',
      scope: 'messages',
    },
  })
}

function openImportantMessageSettings() {
  router.push(`/chat/${conversationId.value}/important-messages`)
}

function onClearHistory() {
  if (detail.value?.owner) showClearHistorySheet.value = true
  else void confirmClearHistory('self')
}

async function confirmClearHistory(scope: 'self' | 'both') {
  showClearHistorySheet.value = false
  try {
    await showConfirmDialog({
      title: scope === 'both' ? '确认双向清除？' : '确认清除聊天记录？',
      message: scope === 'both'
        ? '将清除所有群成员当前可见的聊天记录，此操作无法撤销。'
        : '聊天记录将仅从你的账号中清除，其他群成员仍可查看。',
      confirmButtonText: '确认清除',
      confirmButtonColor: '#ee0a24',
    })
    await clearGroupHistory(conversationId.value, scope)
    showToast(scope === 'both' ? '已双向清除群聊记录' : '已单向清除群聊记录')
    router.replace('/app/messages')
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e || '')
    if (!/cancel/i.test(message)) showToast(message || '清除失败')
  }
}

function onClearHistoryScopeSelect(action: { name?: string }) {
  void confirmClearHistory(action.name === '双向清除' ? 'both' : 'self')
}

function toggleSelect(id: string) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

async function confirmAdd() {
  if (selected.value.size === 0) {
    showToast('请选择成员')
    return
  }
  try {
    await addGroupMembers(conversationId.value, [...selected.value])
    showAdd.value = false
    detail.value = await fetchGroupDetail(conversationId.value)
    showToast('已添加')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '添加失败')
  }
}

async function onLeave() {
  try {
    await showConfirmDialog({
      title: '退出群聊',
      message: '确定要退出该群聊吗？退出后将无法接收消息。',
      confirmButtonText: '退出',
      confirmButtonColor: '#ff5447',
    })
  } catch {
    return
  }
  try {
    await leaveGroup(conversationId.value)
    showToast('已退出群聊')
    router.replace('/app/messages')
  } catch (e) {
    showToast(e instanceof Error ? e.message : '退出失败')
  }
}
</script>

<template>
  <div class="group-info-page">
    <header class="page-header glass-header">
      <div class="header-left" @click="goBack">
        <span class="material-symbols-outlined back-ico">arrow_back_ios</span>
      </div>
      <h1 class="page-title">群聊信息</h1>
      <div class="header-right">
        <button type="button" class="icon-btn" aria-label="分享群名片" @click="shareVisible = true">
          <span class="material-symbols-outlined">share</span>
        </button>
        <button type="button" class="icon-btn" @click="onSearchAll">
          <span class="material-symbols-outlined">search</span>
        </button>
      </div>
    </header>

    <main v-if="loading" class="loading-state">加载中...</main>

    <main v-else-if="detail" class="page-main">
      <section class="card member-card">
        <div class="member-grid">
          <button
            v-for="m in previewMembers"
            :key="m.userId"
            type="button"
            class="member-cell"
            @click="openMember(m.userId)"
          >
            <UserAvatar
              :src="m.avatarUrl"
              :user-id="m.userId"
              :name="memberDisplayName(m.userId, m.nickname)"
              :size="48"
              class="member-avatar"
            />
            <span class="member-name">{{ memberDisplayName(m.userId, m.nickname) }}</span>
            <span class="role-tag" :class="m.role">{{ roleLabel(m.role) }}</span>
          </button>

          <button type="button" class="member-cell" @click="onAddMember">
            <div class="member-avatar dashed">
              <span class="material-symbols-outlined">add</span>
            </div>
            <span class="member-name">添加</span>
          </button>
          <button v-if="canManage" type="button" class="member-cell" @click="onRemoveMember">
            <div class="member-avatar dashed">
              <span class="material-symbols-outlined">remove</span>
            </div>
            <span class="member-name">删除</span>
          </button>
        </div>
        <button
          v-if="detail.memberCount > 0"
          type="button"
          class="view-all"
          @click="showAllMembers = !showAllMembers"
        >
          {{ showAllMembers ? '收起成员列表' : `查看全部 ${detail.memberCount} 名群成员` }}
        </button>
      </section>

      <div v-if="detail.speakMuted || detail.muteAll" class="mute-status-banner">
        <span class="material-symbols-outlined">voice_over_off</span>
        <span v-if="detail.speakMuted">你已被禁言，无法在群内发言</span>
        <span v-else>全员禁言已开启，仅群主和管理员可发言</span>
      </div>

      <section class="card menu-card">
        <button type="button" class="menu-row" @click="copyGroupPulseId">
          <span class="menu-label">群 PulseID</span>
          <span class="menu-right">
            <span class="menu-value">{{ detail.pulseId || formatGroupPulseId(detail.id) }}</span>
            <span class="material-symbols-outlined copy-icon">content_copy</span>
          </span>
        </button>
        <button type="button" class="menu-row" @click="openTitleDialog">
          <span class="menu-label">群聊名称</span>
          <span class="menu-right">
            <span class="menu-value">{{ detail.title }}</span>
            <span v-if="canManage" class="material-symbols-outlined chevron">chevron_right</span>
          </span>
        </button>
        <button type="button" class="menu-row notice-row" @click="openNoticeDialog">
          <div class="notice-top">
            <span class="menu-label">群公告</span>
            <span v-if="canManage" class="material-symbols-outlined chevron">chevron_right</span>
          </div>
          <p class="notice-text">{{ detail.notice || '暂无公告' }}</p>
        </button>
        <button v-if="canManage" type="button" class="menu-row" @click="onManage">
          <span class="menu-label">群管理</span>
          <span class="menu-right">
            <span v-if="canManage && detail.pendingJoinCount > 0" class="menu-value">
              {{ detail.pendingJoinCount }} 待审
            </span>
            <span class="material-symbols-outlined chevron">chevron_right</span>
          </span>
        </button>
      </section>

      <section class="card qr-section-card">
        <div class="qr-section-title">群二维码</div>
        <QrCodeCard
          :payload="groupQrData"
          :title="detail.title"
          subtitle="扫一扫加入或打开本群"
          :filename="`pulse-group-${conversationId}.png`"
          @preview="groupQrPreview = true"
        />
      </section>

      <section class="card avatar-card">
        <button type="button" class="avatar-row" @click="onAvatarClick">
          <div class="avatar-meta">
            <span class="menu-label">群聊头像</span>
            <span class="avatar-hint">{{ canManage ? '点击更换' : '仅群主/管理员可修改' }}</span>
          </div>
          <div class="group-avatar-wrap">
            <UserAvatar
              :src="detail.avatarUrl"
              :user-id="conversationId"
              kind="group"
              :name="detail.title"
              :size="64"
              class="group-avatar"
            />
            <span v-if="canManage" class="material-symbols-outlined chevron">chevron_right</span>
          </div>
        </button>
        <input
          ref="avatarInput"
          type="file"
          accept="image/*"
          class="hidden-input"
          @change="onAvatarSelected"
        />
      </section>

      <section class="card menu-card">
        <button type="button" class="menu-row" @click="nicknameDraft = detail.myGroupNickname; showNicknameDialog = true">
          <span class="menu-label">我在本群的昵称</span>
          <span class="menu-right">
            <span class="menu-value">{{ detail.myGroupNickname || '未设置' }}</span>
            <span class="material-symbols-outlined chevron">chevron_right</span>
          </span>
        </button>
        <button type="button" class="menu-row" @click="remarkDraft = detail.groupRemark; showRemarkDialog = true">
          <span class="menu-label">群备注</span>
          <span class="menu-right">
            <span class="menu-value">{{ detail.groupRemark || '未设置' }}</span>
            <span class="material-symbols-outlined chevron">chevron_right</span>
          </span>
        </button>
        <button type="button" class="menu-row" @click="onSearchHistory">
          <span class="menu-label">查找聊天记录</span>
          <span class="material-symbols-outlined chevron">chevron_right</span>
        </button>
        <div class="menu-row">
          <span class="menu-label">置顶聊天</span>
          <label class="switch">
            <input v-model="pinned" type="checkbox" @change="onPinnedChange" />
            <span class="slider" />
          </label>
        </div>
        <div class="menu-row">
          <span class="menu-label">消息免打扰</span>
          <label class="switch">
            <input v-model="muted" type="checkbox" @change="onMuteChange" />
            <span class="slider" />
          </label>
        </div>
        <button type="button" class="menu-row" @click="openImportantMessageSettings">
          <span class="menu-label">重要消息仍然通知</span>
          <span class="material-symbols-outlined chevron">chevron_right</span>
        </button>
        <div class="menu-row">
          <span class="menu-label">隐藏会话</span>
          <label class="switch">
            <input v-model="hidden" type="checkbox" @change="onHiddenChange" />
            <span class="slider" />
          </label>
        </div>
      </section>

      <section class="card menu-card">
        <button type="button" class="menu-row" @click="onClearHistory">
          <span class="menu-label">清除聊天记录</span>
        </button>
      </section>

      <button type="button" class="leave-btn" @click="onLeave">
        <span class="material-symbols-outlined filled">logout</span>
        退出群聊
      </button>
    </main>
    <ShareContactCard
      v-if="detail"
      v-model:show="shareVisible"
      :card="{ cardType: 'group', conversationId, nickname: detail.title, avatarUrl: detail.avatarUrl }"
    />
    <van-action-sheet
      v-model:show="showClearHistorySheet"
      title="清除聊天记录"
      :actions="[
        { name: '单向清除', subname: '仅从我的账号中清除' },
        { name: '双向清除', subname: '清除所有群成员的聊天记录', color: '#ee0a24' },
      ]"
      cancel-text="取消"
      @select="onClearHistoryScopeSelect"
    />

    <div v-if="showAdd" class="sheet-mask" @click="showAdd = false">
      <div class="sheet" @click.stop>
        <div class="sheet-header">
          <button type="button" class="sheet-cancel" @click="showAdd = false">取消</button>
          <h3>添加成员</h3>
          <button type="button" class="sheet-ok" @click="confirmAdd">完成</button>
        </div>
        <div class="sheet-list">
          <button
            v-for="c in addableContacts"
            :key="c.userId"
            type="button"
            class="contact-row"
            @click="toggleSelect(c.userId)"
          >
            <span class="check" :class="{ on: selected.has(c.userId) }">
              <span v-if="selected.has(c.userId)" class="material-symbols-outlined">check</span>
            </span>
            <span>{{ c.nickname }}</span>
          </button>
          <div v-if="addableContacts.length === 0" class="empty-tip">没有可添加的好友</div>
        </div>
      </div>
    </div>

    <div v-if="showNicknameDialog" class="dialog-mask" @click="showNicknameDialog = false">
      <div class="dialog" @click.stop>
        <h3>我在本群的昵称</h3>
        <input v-model="nicknameDraft" class="dialog-input" maxlength="64" placeholder="输入群昵称" />
        <div class="dialog-actions">
          <button type="button" class="dialog-btn" @click="showNicknameDialog = false">取消</button>
          <button type="button" class="dialog-btn primary" :disabled="saving" @click="savePersonalGroupSetting('nickname')">
            保存
          </button>
        </div>
      </div>
    </div>
    <div v-if="showRemarkDialog" class="dialog-mask" @click="showRemarkDialog = false">
      <div class="dialog" @click.stop>
        <h3>群备注</h3>
        <input v-model="remarkDraft" class="dialog-input" maxlength="64" placeholder="仅自己可见" />
        <div class="dialog-actions">
          <button type="button" class="dialog-btn" @click="showRemarkDialog = false">取消</button>
          <button type="button" class="dialog-btn primary" :disabled="saving" @click="savePersonalGroupSetting('remark')">
            保存
          </button>
        </div>
      </div>
    </div>

    <div v-if="showAvatarConfirm" class="dialog-mask" @click="closeAvatarConfirm">
      <div class="dialog avatar-confirm-dialog" @click.stop>
        <h3>确认群头像</h3>
        <div class="avatar-preview-wrap">
          <img v-if="avatarPreviewUrl" :src="avatarPreviewUrl" alt="预览" class="avatar-preview" />
        </div>
        <p class="avatar-confirm-tip">确认后将上传并替换当前群头像</p>
        <div class="dialog-actions">
          <button type="button" class="dialog-btn" :disabled="saving" @click="closeAvatarConfirm">取消</button>
          <button type="button" class="dialog-btn primary" :disabled="saving" @click="confirmAvatarUpload">
            {{ saving ? '上传中...' : '确认使用' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="showTitleDialog" class="dialog-mask" @click="showTitleDialog = false">
      <div class="dialog" @click.stop>
        <h3>修改群聊名称</h3>
        <input v-model="titleDraft" class="dialog-input" maxlength="32" placeholder="请输入群名称" />
        <div class="dialog-actions">
          <button type="button" class="dialog-btn" @click="showTitleDialog = false">取消</button>
          <button type="button" class="dialog-btn primary" :disabled="saving" @click="confirmTitle">
            确定
          </button>
        </div>
      </div>
    </div>

    <div v-if="showNoticeDialog" class="dialog-mask" @click="showNoticeDialog = false">
      <div class="dialog" @click.stop>
        <h3>编辑群公告</h3>
        <textarea
          v-model="noticeDraft"
          class="dialog-textarea"
          maxlength="500"
          rows="5"
          placeholder="请输入群公告"
        />
        <div class="dialog-actions">
          <button type="button" class="dialog-btn" @click="showNoticeDialog = false">取消</button>
          <button type="button" class="dialog-btn primary" :disabled="saving" @click="confirmNotice">
            确定
          </button>
        </div>
      </div>
    </div>

    <QrPreviewModal
      :show="groupQrPreview"
      :payload="groupQrData"
      :title="detail?.title || '群二维码'"
      :filename="`pulse-group-${conversationId}.png`"
      hint="扫一扫上面的二维码，打开本群"
      @close="groupQrPreview = false"
    />
  </div>
</template>

<style scoped>
.group-info-page {
  min-height: 100%;
  background: var(--pulse-page-bg, var(--pulse-bg));
  color: var(--pulse-text);
  padding-bottom: 48px;
}

.page-header {
  position: sticky;
  top: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr) 80px;
  column-gap: 0;
  height: 56px;
  padding: 0 12px;
  padding-top: var(--pulse-header-pad-top);
  background: var(--pulse-page-bg, var(--pulse-bg));
}

/* 全局浅色顶栏会将标题脱离文档流；保持本页三列布局，确保操作组仍贴齐右侧。 */
.group-info-page .page-header {
  display: grid !important;
  grid-template-columns: 80px minmax(0, 1fr) 80px;
  column-gap: 0;
}

.header-left {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.back-ico {
  color: var(--pulse-primary);
  font-size: 22px;
}

.page-title {
  margin: 0;
  min-width: 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 22px;
  color: var(--pulse-primary);
  text-align: center;
}

.header-right {
  display: flex;
  gap: 2px;
  margin-left: 0;
  /* 浅色模式标题会被全局样式设为绝对定位，不能让操作组自动落到第二列。 */
  grid-column: 3;
  justify-self: end;
}

.icon-btn {
  border: none;
  background: transparent;
  color: var(--pulse-text-secondary);
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.page-main {
  padding-top: 16px;
}

.card {
  margin: 0 16px 16px;
  background: var(--pulse-surface-container);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.qr-section-card {
  padding: 20px 16px;
}

.qr-section-title {
  margin-bottom: 14px;
  font-size: 15px;
  font-weight: 600;
  color: var(--pulse-text);
  text-align: center;
}

.member-card {
  padding: 24px 16px 16px;
}

.member-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px 8px;
}

.member-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  color: inherit;
  padding: 0;
  cursor: pointer;
  min-width: 0;
}

.member-cell:active {
  transform: scale(0.96);
}

.member-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: var(--pulse-surface-highest);
}

.member-avatar.initials {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--pulse-primary);
  font-weight: 700;
  font-size: 16px;
}

.member-avatar.dashed {
  border: 2px dashed #414755;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--pulse-outline);
}

.member-name {
  width: 100%;
  text-align: center;
  font-size: 11px;
  font-weight: 600;
  line-height: 13px;
  color: var(--pulse-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role-tag {
  font-size: 10px;
  line-height: 1;
  padding: 2px 5px;
  border-radius: 4px;
  color: var(--pulse-outline);
  background: rgba(255, 255, 255, 0.06);
}

.role-tag.owner {
  color: #ffb74d;
  background: rgba(255, 183, 77, 0.15);
}

.role-tag.admin {
  color: var(--pulse-primary);
  background: rgba(173, 198, 255, 0.15);
}

.view-all {
  display: block;
  width: 100%;
  margin-top: 24px;
  border: none;
  background: transparent;
  color: var(--pulse-primary);
  font-size: 13px;
  font-weight: 500;
  line-height: 18px;
  cursor: pointer;
}

.mute-status-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 16px 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255, 84, 71, 0.12);
  color: var(--pulse-error);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}

.mute-status-banner .material-symbols-outlined {
  font-size: 18px;
  flex-shrink: 0;
}

.menu-row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 16px;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  box-sizing: border-box;
}

.menu-card .menu-row:last-child {
  border-bottom: none;
}

.menu-row:active {
  transform: scale(0.98);
}

.menu-label {
  font-size: 15px;
  line-height: 20px;
  color: var(--pulse-text);
}

.menu-right {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.menu-value {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--pulse-text-secondary);
  font-size: 14px;
}

.chevron {
  color: var(--pulse-outline);
  font-size: 20px;
}

.notice-row {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}

.notice-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.notice-text {
  margin: 0;
  font-size: 13px;
  line-height: 18px;
  color: var(--pulse-text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.avatar-card {
  padding: 0;
}

.avatar-row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.avatar-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.avatar-hint {
  font-size: 12px;
  color: var(--pulse-outline);
}

.group-avatar-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.group-avatar {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  object-fit: cover;
  background: var(--pulse-surface-highest);
}

.group-avatar.initials {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--pulse-primary);
  font-weight: 700;
  font-size: 20px;
}

.hidden-input {
  display: none;
}

.switch {
  position: relative;
  width: 46px;
  height: 26px;
  flex-shrink: 0;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: var(--pulse-outline-variant);
  transition: 0.2s;
  cursor: pointer;
}

.slider::before {
  content: '';
  position: absolute;
  width: 20px;
  height: 20px;
  left: 3px;
  top: 3px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  transition: 0.2s;
}

.switch input:checked + .slider {
  background: var(--pulse-primary-container);
}

.switch input:checked + .slider::before {
  transform: translateX(20px);
}

.leave-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: calc(100% - 32px);
  margin: 8px 16px 0;
  padding: 20px 16px;
  border: none;
  border-radius: 12px;
  background: #93000a;
  color: #ffdad6;
  font-size: 20px;
  font-weight: 600;
  line-height: 25px;
  cursor: pointer;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.25);
}

.leave-btn:active {
  transform: scale(0.95);
}

.leave-btn .material-symbols-outlined {
  font-size: 22px;
  font-variation-settings: 'FILL' 1;
}

.loading-state {
  text-align: center;
  padding: 64px 16px;
  color: var(--pulse-text-secondary);
}

.sheet-mask,
.dialog-mask {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: flex-end;
}

.dialog-mask {
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.sheet {
  width: 100%;
  max-height: 70vh;
  background: var(--pulse-surface-low);
  border-radius: 20px 20px 0 0;
  display: flex;
  flex-direction: column;
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--pulse-outline-variant);
}

.sheet-header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--pulse-text);
}

.sheet-cancel,
.sheet-ok {
  border: none;
  background: transparent;
  font-size: 15px;
  cursor: pointer;
}

.sheet-cancel {
  color: var(--pulse-text-secondary);
}

.sheet-ok {
  color: var(--pulse-primary);
  font-weight: 600;
}

.sheet-list {
  overflow-y: auto;
  padding: 8px 0 24px;
}

.contact-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border: none;
  background: transparent;
  color: var(--pulse-text);
  font-size: 15px;
  text-align: left;
  cursor: pointer;
}

.check {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid var(--pulse-outline-variant);
  display: grid;
  place-items: center;
  color: #001c3a;
}

.check.on {
  background: #a8c8ff;
  border-color: #a8c8ff;
}

.check .material-symbols-outlined {
  font-size: 16px;
}

.empty-tip {
  text-align: center;
  padding: 32px 16px;
  color: var(--pulse-text-secondary);
}

.dialog {
  width: 100%;
  max-width: 360px;
  background: var(--pulse-surface-container);
  border-radius: 16px;
  padding: 20px 16px 12px;
}

.dialog h3 {
  margin: 0 0 14px;
  font-size: 17px;
  text-align: center;
  color: var(--pulse-text);
}

.dialog-input,
.dialog-textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: var(--pulse-page-bg, var(--pulse-bg));
  color: var(--pulse-text);
  padding: 12px;
  font-size: 15px;
  outline: none;
  resize: none;
}

.dialog-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.dialog-btn {
  flex: 1;
  height: 42px;
  border: none;
  border-radius: 10px;
  background: var(--pulse-surface-highest);
  color: var(--pulse-text-secondary);
  font-size: 15px;
  cursor: pointer;
}

.dialog-btn.primary {
  background: var(--pulse-primary-container);
  color: #001c3a;
  font-weight: 600;
}

.dialog-btn:disabled {
  opacity: 0.6;
}

.avatar-confirm-dialog {
  text-align: center;
}

.avatar-preview-wrap {
  width: 148px;
  height: 148px;
  margin: 4px auto 12px;
  border-radius: 20px;
  overflow: hidden;
  background: var(--pulse-page-bg, var(--pulse-bg));
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.avatar-preview {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.avatar-confirm-tip {
  margin: 0 0 4px;
  font-size: 13px;
  color: var(--pulse-text-secondary);
  line-height: 1.4;
}
</style>

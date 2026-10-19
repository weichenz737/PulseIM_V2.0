<script setup lang="ts">
defineOptions({ name: 'FriendPermissionView' })
import { computed, ref, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { smartBack } from '@/utils/navBack'
import { showToast } from 'vant'
import {
  fetchPrivacySettings,
  updatePrivacySettings,
  type MomentsVisibleRange,
  type PrivacySettings,
} from '@/api/contact'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const saving = ref(false)
const showRangePicker = ref(false)
const momentsSectionRef = ref<HTMLElement | null>(null)
const settings = ref<PrivacySettings>({
  friendVerifyRequired: true,
  groupInviteVerify: false,
  addByPhone: true,
  addByPulseId: true,
  addByGroup: true,
  addByQrcode: true,
  addByCard: true,
  addByDeletedChat: true,
  searchByPhone: true,
  searchByPulseId: true,
  momentsVisibleRange: 'all',
  momentsStrangerTen: false,
  hideOnlineStatus: false,
  readReceiptEnabled: true,
  typingStatusEnabled: true,
})

const rangeOptions: { value: MomentsVisibleRange; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'half_year', label: '最近半年' },
  { value: 'month', label: '最近一个月' },
  { value: 'three_days', label: '最近三天' },
]

const rangeLabel = computed(() => {
  const hit = rangeOptions.find((x) => x.value === settings.value.momentsVisibleRange)
  return hit?.label || '全部'
})

onMounted(async () => {
  try {
    settings.value = await fetchPrivacySettings()
  } catch (e) {
    showToast(e instanceof Error ? e.message : '加载失败')
  } finally {
    loading.value = false
    if (String(route.query.section || '') === 'moments') {
      await nextTick()
      momentsSectionRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }
})

function goBack() {
  smartBack(router)
}

function openBlocked() {
  router.push('/contacts/blocked')
}

function openMomentsHide() {
  router.push('/settings/friends/moments-hide')
}

function openMomentsReject() {
  router.push('/settings/friends/moments-reject')
}

async function patch(key: keyof PrivacySettings, value: boolean | MomentsVisibleRange) {
  const prev = settings.value[key]
  settings.value = { ...settings.value, [key]: value } as PrivacySettings
  saving.value = true
  try {
    settings.value = await updatePrivacySettings({ [key]: value })
    window.dispatchEvent(new CustomEvent('pulse:privacy-settings-updated', {
      detail: settings.value,
    }))
  } catch (e) {
    settings.value = { ...settings.value, [key]: prev } as PrivacySettings
    showToast(e instanceof Error ? e.message : '保存失败')
  } finally {
    saving.value = false
  }
}

async function selectRange(value: MomentsVisibleRange) {
  showRangePicker.value = false
  if (value === settings.value.momentsVisibleRange) return
  await patch('momentsVisibleRange', value)
}
</script>

<template>
  <div class="friends-perm-page">
    <header class="page-header">
      <button type="button" class="back-btn" @click="goBack">
        <span class="material-symbols-outlined">arrow_back_ios</span>
      </button>
      <h1 class="page-title">朋友权限</h1>
      <span class="spacer" />
    </header>

    <main v-if="loading" class="state">加载中...</main>
    <main v-else class="main">
      <section class="group">
        <div class="item switch-item">
          <div class="item-text">
            <span class="item-label">加我为好友时需要验证</span>
            <span class="item-sub">关闭后对方添加你将直接成为好友</span>
          </div>
          <button
            type="button"
            class="pulse-switch"
            :class="{ on: settings.friendVerifyRequired }"
            :disabled="saving"
            role="switch"
            :aria-checked="settings.friendVerifyRequired"
            @click="patch('friendVerifyRequired', !settings.friendVerifyRequired)"
          >
            <span class="pulse-switch-knob" />
          </button>
        </div>
        <div class="item switch-item">
          <div class="item-text">
            <span class="item-label">拉我入群时需要验证</span>
            <span class="item-sub">开启后，好友邀请你进群需你确认</span>
          </div>
          <button
            type="button"
            class="pulse-switch"
            :class="{ on: settings.groupInviteVerify }"
            :disabled="saving"
            role="switch"
            :aria-checked="settings.groupInviteVerify"
            @click="patch('groupInviteVerify', !settings.groupInviteVerify)"
          >
            <span class="pulse-switch-knob" />
          </button>
        </div>
      </section>

      <p class="group-title">在线状态与已读回执</p>
      <section class="group">
        <div class="item switch-item">
          <div class="item-text">
            <span class="item-label">隐藏我的在线状态</span>
            <span class="item-sub">开启后，你也无法查看好友的在线状态</span>
          </div>
          <button
            type="button"
            class="pulse-switch"
            :class="{ on: settings.hideOnlineStatus }"
            :disabled="saving"
            role="switch"
            :aria-checked="settings.hideOnlineStatus"
            @click="patch('hideOnlineStatus', !settings.hideOnlineStatus)"
          >
            <span class="pulse-switch-knob" />
          </button>
        </div>
        <div class="item switch-item">
          <div class="item-text">
            <span class="item-label">已读回执</span>
            <span class="item-sub">关闭后，双方都看不到对方是否已读，群聊同样生效</span>
          </div>
          <button
            type="button"
            class="pulse-switch"
            :class="{ on: settings.readReceiptEnabled }"
            :disabled="saving"
            role="switch"
            :aria-checked="settings.readReceiptEnabled"
            @click="patch('readReceiptEnabled', !settings.readReceiptEnabled)"
          >
            <span class="pulse-switch-knob" />
          </button>
        </div>
        <div class="item switch-item">
          <div class="item-text">
            <span class="item-label">展示输入状态</span>
            <span class="item-sub">开启后，双方都开启时，对方可看到你正在输入</span>
          </div>
          <button
            type="button"
            class="pulse-switch"
            :class="{ on: settings.typingStatusEnabled }"
            :disabled="saving"
            role="switch"
            :aria-checked="settings.typingStatusEnabled"
            @click="patch('typingStatusEnabled', !settings.typingStatusEnabled)"
          >
            <span class="pulse-switch-knob" />
          </button>
        </div>
      </section>

      <p class="group-title">添加我的方式</p>
      <section class="group">
        <div class="item switch-item">
          <span class="item-label">手机号</span>
          <button
            type="button"
            class="pulse-switch"
            :class="{ on: settings.addByPhone }"
            :disabled="saving"
            role="switch"
            :aria-checked="settings.addByPhone"
            @click="patch('addByPhone', !settings.addByPhone)"
          >
            <span class="pulse-switch-knob" />
          </button>
        </div>
        <div class="item switch-item">
          <span class="item-label">ID</span>
          <button
            type="button"
            class="pulse-switch"
            :class="{ on: settings.addByPulseId }"
            :disabled="saving"
            role="switch"
            :aria-checked="settings.addByPulseId"
            @click="patch('addByPulseId', !settings.addByPulseId)"
          >
            <span class="pulse-switch-knob" />
          </button>
        </div>
        <div class="item switch-item">
          <span class="item-label">群聊</span>
          <button
            type="button"
            class="pulse-switch"
            :class="{ on: settings.addByGroup }"
            :disabled="saving"
            role="switch"
            :aria-checked="settings.addByGroup"
            @click="patch('addByGroup', !settings.addByGroup)"
          >
            <span class="pulse-switch-knob" />
          </button>
        </div>
        <div class="item switch-item">
          <span class="item-label">我的二维码</span>
          <button
            type="button"
            class="pulse-switch"
            :class="{ on: settings.addByQrcode }"
            :disabled="saving"
            role="switch"
            :aria-checked="settings.addByQrcode"
            @click="patch('addByQrcode', !settings.addByQrcode)"
          >
            <span class="pulse-switch-knob" />
          </button>
        </div>
        <div class="item switch-item">
          <span class="item-label">名片</span>
          <button
            type="button"
            class="pulse-switch"
            :class="{ on: settings.addByCard }"
            :disabled="saving"
            role="switch"
            :aria-checked="settings.addByCard"
            @click="patch('addByCard', !settings.addByCard)"
          >
            <span class="pulse-switch-knob" />
          </button>
        </div>
        <div class="item switch-item">
          <div class="item-text">
            <span class="item-label">删除的联系人保留的聊天</span>
            <span class="item-sub">对方可通过仍保留的私聊记录再次添加你</span>
          </div>
          <button
            type="button"
            class="pulse-switch"
            :class="{ on: settings.addByDeletedChat }"
            :disabled="saving"
            role="switch"
            :aria-checked="settings.addByDeletedChat"
            @click="patch('addByDeletedChat', !settings.addByDeletedChat)"
          >
            <span class="pulse-switch-knob" />
          </button>
        </div>
      </section>

      <p class="group-title">可通过以下方式搜索到我</p>
      <section class="group">
        <div class="item switch-item">
          <span class="item-label">手机号</span>
          <button
            type="button"
            class="pulse-switch"
            :class="{ on: settings.searchByPhone }"
            :disabled="saving"
            role="switch"
            :aria-checked="settings.searchByPhone"
            @click="patch('searchByPhone', !settings.searchByPhone)"
          >
            <span class="pulse-switch-knob" />
          </button>
        </div>
        <div class="item switch-item">
          <span class="item-label">ID</span>
          <button
            type="button"
            class="pulse-switch"
            :class="{ on: settings.searchByPulseId }"
            :disabled="saving"
            role="switch"
            :aria-checked="settings.searchByPulseId"
            @click="patch('searchByPulseId', !settings.searchByPulseId)"
          >
            <span class="pulse-switch-knob" />
          </button>
        </div>
      </section>

      <p ref="momentsSectionRef" class="group-title">朋友圈权限</p>
      <section class="group">
        <button type="button" class="item" @click="openMomentsReject">
          <div class="item-text">
            <span class="item-label">不让他（她）看</span>
            <span class="item-sub">不让指定好友查看我的朋友圈</span>
          </div>
          <span class="material-symbols-outlined chevron">chevron_right</span>
        </button>
        <button type="button" class="item" @click="openMomentsHide">
          <div class="item-text">
            <span class="item-label">不看他（她）</span>
            <span class="item-sub">不看指定好友的朋友圈</span>
          </div>
          <span class="material-symbols-outlined chevron">chevron_right</span>
        </button>
        <button type="button" class="item" :disabled="saving" @click="showRangePicker = true">
          <div class="item-text">
            <span class="item-label">允许朋友查看朋友圈的范围</span>
            <span class="item-sub">{{ rangeLabel }}</span>
          </div>
          <span class="material-symbols-outlined chevron">chevron_right</span>
        </button>
        <div class="item switch-item">
          <div class="item-text">
            <span class="item-label">允许陌生人查看十条朋友圈</span>
            <span class="item-sub">非好友打开你的朋友圈时可看最近十条</span>
          </div>
          <button
            type="button"
            class="pulse-switch"
            :class="{ on: settings.momentsStrangerTen }"
            :disabled="saving"
            role="switch"
            :aria-checked="settings.momentsStrangerTen"
            @click="patch('momentsStrangerTen', !settings.momentsStrangerTen)"
          >
            <span class="pulse-switch-knob" />
          </button>
        </div>
      </section>

      <section class="group">
        <button type="button" class="item" @click="openBlocked">
          <div class="item-left">
            <span class="item-icon">
              <span class="material-symbols-outlined">block</span>
            </span>
            <div class="item-text">
              <span class="item-label">黑名单</span>
              <span class="item-sub">已拉黑的用户无法向你发消息</span>
            </div>
          </div>
          <span class="material-symbols-outlined chevron">chevron_right</span>
        </button>
      </section>
    </main>

    <div v-if="showRangePicker" class="sheet-mask" @click="showRangePicker = false">
      <div class="sheet" @click.stop>
        <div class="sheet-title">允许朋友查看朋友圈的范围</div>
        <button
          v-for="opt in rangeOptions"
          :key="opt.value"
          type="button"
          class="sheet-option"
          :class="{ active: settings.momentsVisibleRange === opt.value }"
          :disabled="saving"
          @click="selectRange(opt.value)"
        >
          <span>{{ opt.label }}</span>
          <span
            v-if="settings.momentsVisibleRange === opt.value"
            class="material-symbols-outlined check"
          >check</span>
        </button>
        <button type="button" class="sheet-cancel" @click="showRangePicker = false">取消</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.friends-perm-page {
  min-height: 100%;
  min-height: 100dvh;
  background: var(--pulse-page-bg, var(--pulse-bg));
  color: var(--pulse-text);
  padding-bottom: 32px;
}

.page-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  height: 56px;
  padding: 0 12px;
  padding-top: var(--pulse-header-pad-top);
  background: var(--pulse-page-bg, var(--pulse-bg));
  backdrop-filter: blur(16px);
}

.back-btn {
  width: 40px;
  height: 40px;
  border: none;
  background: transparent;
  color: var(--pulse-primary);
  display: grid;
  place-items: center;
  cursor: pointer;
}

.page-title {
  flex: 1;
  margin: 0;
  text-align: center;
  font-size: 18px;
  font-weight: 600;
  color: var(--pulse-primary);
}

.spacer {
  width: 40px;
}

.main {
  padding: 16px;
}

.state {
  padding: 48px 16px;
  text-align: center;
  color: var(--pulse-text-secondary);
  font-size: 14px;
}

.group-title {
  margin: 18px 4px 8px;
  font-size: 13px;
  color: var(--pulse-text-secondary);
}

.group {
  border-radius: 12px;
  overflow: hidden;
  background: var(--pulse-surface-container);
  margin-bottom: 12px;
}

.item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.item:last-child {
  border-bottom: none;
}

.item:active:not(.switch-item) {
  background: rgba(255, 255, 255, 0.04);
}

.item.switch-item {
  cursor: default;
}

.item-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.item-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: rgba(255, 107, 107, 0.12);
  color: #ff8a80;
  flex-shrink: 0;
}

.item-icon .material-symbols-outlined {
  font-size: 22px;
}

.item-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.item-label {
  font-size: 15px;
  font-weight: 500;
}

.item-sub {
  font-size: 12px;
  color: var(--pulse-text-secondary);
  line-height: 1.35;
}

.chevron {
  color: var(--pulse-text-secondary);
  font-size: 20px;
  flex-shrink: 0;
}

.pulse-switch {
  flex-shrink: 0;
  width: 46px;
  height: 28px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  padding: 2px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.pulse-switch.on {
  background: var(--pulse-primary-container);
}

.pulse-switch:disabled {
  opacity: 0.55;
  cursor: default;
}

.pulse-switch-knob {
  display: block;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  transition: transform 0.2s ease;
}

.pulse-switch.on .pulse-switch-knob {
  transform: translateX(18px);
}

.sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.sheet {
  width: 100%;
  max-width: 480px;
  padding: 8px 12px calc(12px + env(safe-area-inset-bottom, 0px));
  border-radius: 16px 16px 0 0;
  background: var(--pulse-surface-container);
}

.sheet-title {
  padding: 14px 8px 10px;
  text-align: center;
  font-size: 13px;
  color: var(--pulse-text-secondary);
}

.sheet-option {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 12px;
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: transparent;
  color: var(--pulse-text);
  font-size: 16px;
  cursor: pointer;
}

.sheet-option.active {
  color: var(--pulse-primary);
}

.sheet-option .check {
  font-size: 20px;
  color: var(--pulse-primary);
}

.sheet-cancel {
  width: 100%;
  margin-top: 8px;
  padding: 14px;
  border: none;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--pulse-text);
  font-size: 16px;
  cursor: pointer;
}
</style>

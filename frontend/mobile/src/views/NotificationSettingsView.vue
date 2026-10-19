<script setup lang="ts">
defineOptions({ name: 'NotificationSettingsView' })
import { useRouter } from 'vue-router'
import { smartBack } from '@/utils/navBack'
import { useNotificationSettingsStore } from '@/stores/notificationSettings'

const router = useRouter()
const notif = useNotificationSettingsStore()

function goBack() {
  smartBack(router)
}
</script>

<template>
  <div class="notify-page">
    <header class="page-header">
      <button type="button" class="back-btn" @click="goBack">
        <span class="material-symbols-outlined">arrow_back_ios</span>
      </button>
      <h1 class="page-title">消息通知</h1>
      <span class="spacer" />
    </header>

    <main class="main">
      <p class="group-title">消息通知</p>
      <section class="group">
        <div class="item switch-item">
          <div class="item-text">
            <span class="item-label">通知显示消息预览</span>
            <span class="item-sub">关闭后锁屏和通知栏只显示“你收到了 X 条消息”</span>
          </div>
          <button
            type="button"
            class="pulse-switch"
            :class="{ on: notif.preview }"
            role="switch"
            :aria-checked="notif.preview"
            @click="notif.setPreview(!notif.preview)"
          >
            <span class="pulse-switch-knob" />
          </button>
        </div>

        <div class="item switch-item">
          <div class="item-text">
            <span class="item-label">App 内消息横幅</span>
            <span class="item-sub">关闭后 App 内不再出现消息横幅</span>
          </div>
          <button
            type="button"
            class="pulse-switch"
            :class="{ on: notif.inAppBanner }"
            role="switch"
            :aria-checked="notif.inAppBanner"
            @click="notif.setInAppBanner(!notif.inAppBanner)"
          >
            <span class="pulse-switch-knob" />
          </button>
        </div>

        <div class="item switch-item">
          <div class="item-text">
            <span class="item-label">消息震动</span>
            <span class="item-sub">关闭后收到消息手机不再震动</span>
          </div>
          <button
            type="button"
            class="pulse-switch"
            :class="{ on: notif.vibrate }"
            role="switch"
            :aria-checked="notif.vibrate"
            @click="notif.setVibrate(!notif.vibrate)"
          >
            <span class="pulse-switch-knob" />
          </button>
        </div>

        <div class="item switch-item">
          <div class="item-text">
            <span class="item-label">消息提示音</span>
            <span class="item-sub">关闭后收到消息没有提示音</span>
          </div>
          <button
            type="button"
            class="pulse-switch"
            :class="{ on: notif.sound }"
            role="switch"
            :aria-checked="notif.sound"
            @click="notif.setSound(!notif.sound)"
          >
            <span class="pulse-switch-knob" />
          </button>
        </div>
      </section>

      <p class="group-title">通话通知</p>
      <section class="group">
        <div class="item switch-item">
          <div class="item-text">
            <span class="item-label">通话快捷窗口接听</span>
            <span class="item-sub">开启后可用弹窗快速接听</span>
          </div>
          <button
            type="button"
            class="pulse-switch"
            :class="{ on: notif.callQuick }"
            role="switch"
            :aria-checked="notif.callQuick"
            @click="notif.setCallQuick(!notif.callQuick)"
          >
            <span class="pulse-switch-knob" />
          </button>
        </div>

        <div class="item switch-item">
          <div class="item-text">
            <span class="item-label">语音和视频通话通知</span>
            <span class="item-sub">关闭后手机在后台不再接收语音和视频通话提醒</span>
          </div>
          <button
            type="button"
            class="pulse-switch"
            :class="{ on: notif.callNotify }"
            role="switch"
            :aria-checked="notif.callNotify"
            @click="notif.setCallNotify(!notif.callNotify)"
          >
            <span class="pulse-switch-knob" />
          </button>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.notify-page {
  min-height: 100%;
  background: var(--pulse-page-bg, var(--pulse-bg));
  color: var(--pulse-text);
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
  padding: 12px 16px 24px;
}

.group-title {
  margin: 16px 4px 8px;
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
}

.item:last-child {
  border-bottom: none;
}

.item-text {
  min-width: 0;
}

.item-label {
  display: block;
  font-size: 15px;
  font-weight: 500;
  color: var(--pulse-text);
}

.item-sub {
  display: block;
  margin-top: 3px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--pulse-text-secondary);
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

/* 浅色模式：顶部与其他设置页保持一致（浅蓝渐变） */
:root[data-theme='light'] .notify-page {
  background: #f7faff;
  color: #14243a;
}

:root[data-theme='light'] .notify-page .page-title,
:root[data-theme='light'] .notify-page .back-btn {
  color: #087ed7;
}

:root[data-theme='light'] .notify-page .item {
  border-bottom-color: rgba(169, 193, 211, 0.42);
}

:root[data-theme='light'] .notify-page .item:last-child {
  border-bottom-color: transparent;
}
</style>

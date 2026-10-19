<script setup lang="ts">
defineOptions({ name: 'GeneralSettingsView' })
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { smartBack } from '@/utils/navBack'
import { usePreferenceStore } from '@/stores/preference'

const router = useRouter()
const pref = usePreferenceStore()

const themeLabel = computed(() => (pref.isLightTheme ? '白日模式' : '夜间模式'))

function goBack() {
  smartBack(router)
}

function goFontSize() {
  void router.push('/settings/font-size')
}

function goRingtone() {
  void router.push('/settings/ringtone')
}

async function toggleTheme() {
  const nextLight = !pref.isLightTheme
  const nextLabel = nextLight ? '白日模式' : '夜间模式'
  try {
    await showConfirmDialog({
      title: '切换主题',
      message: `确定切换为${nextLabel}？`,
      confirmButtonText: '切换',
    })
  } catch {
    return
  }
  pref.setTheme(nextLight ? 'light' : 'dark')
  showToast(`已切换为${nextLabel}`)
}
</script>

<template>
  <div class="general-page">
    <header class="page-header">
      <button type="button" class="back-btn" @click="goBack">
        <span class="material-symbols-outlined">arrow_back_ios</span>
      </button>
      <h1 class="page-title">通用</h1>
      <span class="spacer" />
    </header>

    <main class="main">
      <section class="menu-card">
        <button type="button" class="menu-row" @click="goFontSize">
          <div class="menu-left">
            <span class="material-symbols-outlined menu-ico">format_size</span>
            <div class="menu-text">
              <div class="menu-title">字体大小</div>
              <div class="menu-desc">调节聊天消息文字大小</div>
            </div>
          </div>
          <div class="menu-right">
            <span class="menu-extra">{{ pref.fontSizeLabel }}px</span>
            <span class="material-symbols-outlined chevron">chevron_right</span>
          </div>
        </button>

        <button type="button" class="menu-row" @click="goRingtone">
          <div class="menu-left">
            <span class="material-symbols-outlined menu-ico">ring_volume</span>
            <div class="menu-text">
              <div class="menu-title">来电铃声</div>
              <div class="menu-desc">选择语音/视频来电时的铃声</div>
            </div>
          </div>
          <div class="menu-right">
            <span class="material-symbols-outlined chevron">chevron_right</span>
          </div>
        </button>

        <button type="button" class="menu-row" @click="toggleTheme">
          <div class="menu-left">
            <span class="material-symbols-outlined menu-ico">
              {{ pref.isLightTheme ? 'dark_mode' : 'light_mode' }}
            </span>
            <div class="menu-text">
              <div class="menu-title">主题切换</div>
              <div class="menu-desc">当前：{{ themeLabel }}</div>
            </div>
          </div>
          <div class="menu-right">
            <span class="menu-extra">{{ pref.isLightTheme ? '切换夜间' : '切换白日' }}</span>
            <span class="material-symbols-outlined chevron">chevron_right</span>
          </div>
        </button>
      </section>
    </main>
  </div>
</template>

<style scoped>
.general-page {
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
  padding: 16px;
}

.menu-card {
  background: var(--pulse-surface-container);
  border-radius: 12px;
  overflow: hidden;
}

.menu-row {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  font: inherit;
}

.menu-row + .menu-row {
  border-top: 1px solid var(--pulse-border, rgba(255, 255, 255, 0.06));
}

.menu-row:active {
  background: var(--pulse-surface-high);
}

.menu-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.menu-ico {
  font-size: 22px;
  color: var(--pulse-primary);
}

.menu-text {
  min-width: 0;
}

.menu-title {
  font-size: 15px;
  font-weight: 500;
  color: var(--pulse-text);
}

.menu-desc {
  margin-top: 2px;
  font-size: 12px;
  color: var(--pulse-text-secondary);
}

.menu-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.menu-extra {
  font-size: 13px;
  color: var(--pulse-text-secondary);
}

.chevron {
  font-size: 20px;
  color: var(--pulse-outline);
}
</style>

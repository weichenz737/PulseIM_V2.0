<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { smartBack } from '@/utils/navBack'
import {
  usePreferenceStore,
  FONT_SLIDER_MIN,
  FONT_SLIDER_MAX,
  FONT_SLIDER_DEFAULT,
} from '@/stores/preference'

const router = useRouter()
const pref = usePreferenceStore()

const sliderValue = computed({
  get: () => pref.fontSize,
  set: (v: number) => pref.setFontSize(Number(v), false),
})

function goBack() {
  smartBack(router)
}

function onSliderInput(e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  pref.setFontSize(v, false)
}

function onSliderChange(e: Event) {
  const v = Number((e.target as HTMLInputElement).value)
  pref.setFontSize(v, true)
}

function resetDefault() {
  pref.setFontSize(FONT_SLIDER_DEFAULT, true)
}
</script>

<template>
  <div class="font-size-page">
    <header class="page-header">
      <button type="button" class="back-btn" @click="goBack">
        <span class="material-symbols-outlined">arrow_back_ios</span>
      </button>
      <h1 class="page-title">字体大小</h1>
      <span class="spacer" />
    </header>

    <main class="main">
      <section class="card">
        <div class="section-head">
          <div class="section-title">聊天字体大小</div>
          <button type="button" class="reset-btn" @click="resetDefault">恢复默认</button>
        </div>
        <p class="section-desc">
          仅调节聊天消息文字（约 11–28px）。页面标题、导航等界面字号保持原有大小层级；安卓系统大字体已自动校正。
        </p>

        <div class="slider-row">
          <span class="size-hint small">A</span>
          <input
            class="font-slider"
            type="range"
            :min="FONT_SLIDER_MIN"
            :max="FONT_SLIDER_MAX"
            :value="sliderValue"
            @input="onSliderInput"
            @change="onSliderChange"
          />
          <span class="size-hint large">A</span>
        </div>
        <div class="slider-ticks" aria-hidden="true">
          <span>小</span>
          <span>标准</span>
          <span>大</span>
        </div>
        <div class="slider-meta">
          <span>聊天文字约 {{ pref.fontSizeLabel }}px</span>
        </div>
      </section>

      <section class="card preview-card">
        <div class="section-title">聊天预览</div>
        <div class="preview-chat">
          <div class="preview-row">
            <div class="preview-avatar">对</div>
            <div class="preview-bubble other">你好，拖动进度条即可调节聊天文字大小。</div>
          </div>
          <div class="preview-row mine">
            <div class="preview-avatar mine">我</div>
            <div class="preview-bubble mine">标题和按钮大小不会跟着变。</div>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.font-size-page {
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
  background: rgba(18, 19, 23, 0.88);
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

.card {
  background: var(--pulse-surface-container);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 16px;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--pulse-text);
}

.section-desc {
  margin: -8px 0 16px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--pulse-outline);
}

.reset-btn {
  border: none;
  background: transparent;
  color: var(--pulse-primary);
  font-size: 13px;
  cursor: pointer;
  padding: 4px 0;
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.size-hint {
  color: var(--pulse-outline);
  font-weight: 700;
  line-height: 1;
  flex-shrink: 0;
}

.size-hint.small {
  font-size: 12px;
}

.size-hint.large {
  font-size: 26px;
}

.slider-ticks {
  display: flex;
  justify-content: space-between;
  padding: 8px 28px 0;
  font-size: 11px;
  color: #6b7180;
}

.font-slider {
  flex: 1;
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--pulse-outline-variant), var(--pulse-primary-container));
  outline: none;
  cursor: pointer;
}

.font-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--pulse-primary);
  border: 3px solid var(--pulse-on-primary-container);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  cursor: pointer;
}

.font-slider::-moz-range-thumb {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--pulse-primary);
  border: 3px solid var(--pulse-on-primary-container);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  cursor: pointer;
}

.slider-meta {
  margin-top: 12px;
  text-align: center;
  font-size: 12px;
  color: var(--pulse-outline);
}

.preview-chat {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.preview-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.preview-row.mine {
  flex-direction: row-reverse;
}

.preview-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--pulse-surface-highest);
  color: var(--pulse-primary);
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.preview-avatar.mine {
  background: var(--pulse-primary-container);
  color: #001c3a;
}

.preview-bubble {
  max-width: var(--chat-bubble-max, 78%);
  padding: var(--chat-bubble-pad-y, 10px) var(--chat-bubble-pad-x, 14px);
  border-radius: 12px;
  font-size: var(--chat-font-size, 15px);
  line-height: var(--chat-line-height, 22px);
  word-break: break-word;
}

.preview-bubble.other {
  background: var(--pulse-surface-bright);
  color: var(--pulse-text);
}

.preview-bubble.mine {
  background: var(--pulse-primary);
  color: var(--pulse-on-primary-container);
}
</style>

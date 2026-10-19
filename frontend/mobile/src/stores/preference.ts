import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const STORAGE_KEY = 'pulse_font_size'
const THEME_STORAGE_KEY = 'pulse_theme'
export type PulseTheme = 'dark' | 'light'
/** 滑块范围 0–100，默认 50 为标准（约 15px） */
export const FONT_SLIDER_MIN = 0
export const FONT_SLIDER_MAX = 100
export const FONT_SLIDER_DEFAULT = 50

/** 聊天字号：小端可更小，大端可更大（安卓系统大字体时可主动调小） */
export const CHAT_FONT_MIN_PX = 11
export const CHAT_FONT_DEFAULT_PX = 15
export const CHAT_FONT_MAX_PX = 28

function clamp(n: number) {
  return Math.min(FONT_SLIDER_MAX, Math.max(FONT_SLIDER_MIN, Math.round(n)))
}

/** 0–50 → 11–15px；50–100 → 15–28px，保证默认档仍是标准字号 */
export function chatFontPxFromSlider(value: number): number {
  const t = clamp(value) / 100
  if (t <= 0.5) {
    return CHAT_FONT_MIN_PX + (t / 0.5) * (CHAT_FONT_DEFAULT_PX - CHAT_FONT_MIN_PX)
  }
  return (
    CHAT_FONT_DEFAULT_PX +
    ((t - 0.5) / 0.5) * (CHAT_FONT_MAX_PX - CHAT_FONT_DEFAULT_PX)
  )
}

/** 将 0–100 映射为聊天内容视觉参数（不缩放全局 UI 字号，避免标题与正文层级被压扁） */
export function fontParamsFromSlider(value: number) {
  const t = clamp(value) / 100
  const chatFont = chatFontPxFromSlider(value)
  const chatLine = chatFont * 1.45
  const bubbleMax = 68 + t * 18 // 68% ~ 86%
  const bubblePadY = 8 + t * 6
  const bubblePadX = 11 + t * 7
  return {
    chatFont: `${chatFont.toFixed(1)}px`,
    chatLine: `${chatLine.toFixed(1)}px`,
    bubbleMax: `${bubbleMax.toFixed(0)}%`,
    bubblePadY: `${bubblePadY.toFixed(1)}px`,
    bubblePadX: `${bubblePadX.toFixed(1)}px`,
    chatFontPx: chatFont,
  }
}

function migrateLegacy(v: string): number | null {
  if (v === 'small') return 20
  if (v === 'medium') return 50
  if (v === 'large') return 80
  const n = Number(v)
  if (Number.isFinite(n)) return clamp(n)
  return null
}

function readStored(): number {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v == null) return FONT_SLIDER_DEFAULT
    const migrated = migrateLegacy(v)
    if (migrated != null) return migrated
  } catch {
    /* ignore */
  }
  return FONT_SLIDER_DEFAULT
}

function readStoredTheme(): PulseTheme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

function applyThemeToDom(theme: PulseTheme) {
  const root = document.documentElement
  root.dataset.theme = theme
  // The app already renders both themes with its own CSS tokens. Keep the
  // browser's native scheme light so Chrome/WebView does not darken the
  // completed page a second time after startup.
  root.style.colorScheme = 'light'
}

export function applyFontSizeToDom(value: number) {
  const cfg = fontParamsFromSlider(value)
  const root = document.documentElement
  // 只改聊天内容相关变量；页面标题、导航、按钮等保持各页固定字号
  root.style.setProperty('--chat-font-size', cfg.chatFont)
  root.style.setProperty('--chat-line-height', cfg.chatLine)
  root.style.setProperty('--chat-bubble-max', cfg.bubbleMax)
  root.style.setProperty('--chat-bubble-pad-y', cfg.bubblePadY)
  root.style.setProperty('--chat-bubble-pad-x', cfg.bubblePadX)
  root.dataset.fontSize = String(clamp(value))
}

export const usePreferenceStore = defineStore('preference', () => {
  const fontSize = ref(readStored())
  const theme = ref<PulseTheme>(readStoredTheme())
  const isLightTheme = computed(() => theme.value === 'light')

  const fontSizeLabel = computed(() => {
    const px = Math.round(fontParamsFromSlider(fontSize.value).chatFontPx)
    return `${px}`
  })

  function setFontSize(value: number, persist = true) {
    fontSize.value = clamp(value)
    applyFontSizeToDom(fontSize.value)
    if (!persist) return
    try {
      localStorage.setItem(STORAGE_KEY, String(fontSize.value))
    } catch {
      /* ignore */
    }
  }

  function setTheme(value: PulseTheme) {
    theme.value = value
    applyThemeToDom(value)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, value)
    } catch {
      /* ignore */
    }
  }

  function init() {
    applyFontSizeToDom(fontSize.value)
    applyThemeToDom(theme.value)
  }

  return {
    fontSize,
    fontSizeLabel,
    theme,
    isLightTheme,
    setFontSize,
    setTheme,
    init,
  }
})

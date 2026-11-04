import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const STORAGE_KEY = 'pulse_font_size'
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

/** 将字号映射到全局文字比例，并保留聊天气泡的阅读参数。 */
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

function applyLightThemeToDom() {
  const root = document.documentElement
  root.dataset.theme = 'light'
  root.style.colorScheme = 'light'
  try {
    localStorage.removeItem('pulse_theme')
  } catch {
    /* storage may be unavailable in a private WebView */
  }
}

export function applyFontSizeToDom(value: number) {
  const cfg = fontParamsFromSlider(value)
  const root = document.documentElement
  const scale = cfg.chatFontPx / CHAT_FONT_DEFAULT_PX
  root.style.setProperty('--pulse-font-scale', String(scale))
  root.style.setProperty('--pulse-font-body', cfg.chatFont)
  root.style.setProperty('--pulse-font-title', `${(18 * scale).toFixed(2)}px`)
  root.style.setProperty('--pulse-font-heading', `${(22 * scale).toFixed(2)}px`)
  root.style.setProperty('--pulse-line-body', `${(22 * scale).toFixed(2)}px`)
  root.style.setProperty('--pulse-line-caption', `${(22 * scale).toFixed(2)}px`)
  root.style.setProperty('--pulse-line-title', `${(26 * scale).toFixed(2)}px`)
  root.style.setProperty('--chat-font-size', cfg.chatFont)
  root.style.setProperty('--chat-line-height', cfg.chatLine)
  root.style.setProperty('--chat-bubble-max', cfg.bubbleMax)
  root.style.setProperty('--chat-bubble-pad-y', cfg.bubblePadY)
  root.style.setProperty('--chat-bubble-pad-x', cfg.bubblePadX)
  root.dataset.fontSize = String(clamp(value))
}

export const usePreferenceStore = defineStore('preference', () => {
  const fontSize = ref(readStored())

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

  function init() {
    applyFontSizeToDom(fontSize.value)
    applyLightThemeToDom()
  }

  return {
    fontSize,
    fontSizeLabel,
    setFontSize,
    init,
  }
})

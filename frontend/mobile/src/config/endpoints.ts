type CapacitorRuntime = {
  isNativePlatform?: () => boolean
}

function isNativeRuntime(): boolean {
  const runtime = (globalThis as typeof globalThis & { Capacitor?: CapacitorRuntime }).Capacitor
  return runtime?.isNativePlatform?.() === true
}

function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

// Live reload 跟随页面地址，兼容局域网和 USB 转发两种本地调试方式。
const LOCAL_NATIVE_ORIGIN = typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol)
  && !['localhost', ''].includes(window.location.hostname)
  ? window.location.origin
  : 'http://127.0.0.1:5173'
const SERVER_ORIGIN_CACHE_KEY = 'pulse_server_origin'
const CUSTOM_SERVER_KEY = 'pulse_custom_server_origin'
function savedOrigin(): string {
  try { return localStorage.getItem(CUSTOM_SERVER_KEY) || '' } catch { return '' }
}

export function setServerOrigin(value: string): string {
  let url: URL
  try { url = new URL(value.trim()) } catch { throw new Error('请输入完整的服务器地址，例如 http://192.168.1.97:5173') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('服务器地址仅支持 http 或 https，请勿填写账号、接口路径或参数')
  }
  const origin = url.origin
  localStorage.setItem(CUSTOM_SERVER_KEY, origin)
  SERVER_ORIGIN = origin
  API_BASE_URL = `${origin}/api`
  return origin
}
const configuredOrigin = normalizeOrigin(import.meta.env.VITE_SERVER_ORIGIN || '')
const configuredDeployPrefix = normalizeOrigin(import.meta.env.VITE_DEPLOY_PREFIX || '')
const browserDeployOrigin = configuredDeployPrefix && typeof window !== 'undefined'
  ? `${window.location.origin}${configuredDeployPrefix}`
  : ''

/**
 * Web continues to use the same-origin nginx proxy. The packaged app cannot use
 * relative /api and /ws URLs because its origin is Capacitor's local web server.
 */
export let SERVER_ORIGIN = savedOrigin() || configuredOrigin ||
  (isNativeRuntime() ? LOCAL_NATIVE_ORIGIN : browserDeployOrigin)

export let API_BASE_URL = SERVER_ORIGIN ? `${SERVER_ORIGIN}/api` : '/api'

/**
 * 优先使用用户明确保存的地址；未设置时 Native 使用本地调试地址。
 * 旧版本自动写入的服务器缓存不作为配置来源。
 */
export function initializeServerOrigin(_force = false): Promise<string> {
  if (isNativeRuntime()) {
    SERVER_ORIGIN = savedOrigin() || configuredOrigin || LOCAL_NATIVE_ORIGIN
    API_BASE_URL = `${SERVER_ORIGIN}/api`
    try {
      // 兼容仍读取旧缓存键的代码。
      localStorage.setItem(SERVER_ORIGIN_CACHE_KEY, SERVER_ORIGIN)
    } catch {
      // 本地存储不可用时仍使用内存中的本地地址。
    }
  }
  return Promise.resolve(SERVER_ORIGIN)
}

export function websocketUrl(): string {
  if (SERVER_ORIGIN) {
    const url = new URL(SERVER_ORIGIN)
    const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    const basePath = url.pathname.replace(/\/+$/, '')
    return `${protocol}//${url.host}${basePath}/ws`
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}

export function absoluteApiUrl(path: string): string {
  if (!SERVER_ORIGIN || !path.startsWith('/')) return path
  return `${SERVER_ORIGIN}${path}`
}

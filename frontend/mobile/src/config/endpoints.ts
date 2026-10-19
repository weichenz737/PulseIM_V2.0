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

const DEFAULT_BOOTSTRAP_ORIGIN = 'https://110.42.238.238:9001'
const SERVER_ORIGIN_CACHE_KEY = 'pulse_server_origin'
const configuredOrigin = normalizeOrigin(import.meta.env.VITE_SERVER_ORIGIN || '')
const configuredDeployPrefix = normalizeOrigin(import.meta.env.VITE_DEPLOY_PREFIX || '')
const browserDeployOrigin = configuredDeployPrefix && typeof window !== 'undefined'
  ? `${window.location.origin}${configuredDeployPrefix}`
  : ''

/**
 * Web continues to use the same-origin nginx proxy. The packaged app cannot use
 * relative /api and /ws URLs because its origin is Capacitor's local web server.
 */
export let SERVER_ORIGIN = configuredOrigin ||
  (isNativeRuntime() ? 'https://110.42.238.238:9001' : browserDeployOrigin)

export let API_BASE_URL = SERVER_ORIGIN ? `${SERVER_ORIGIN}/api` : '/api'

let discoveryPromise: Promise<string> | null = null
let discoveryCompleted = false

function validOrigin(value: unknown): string {
  const normalized = normalizeOrigin(String(value || ''))
  if (!normalized) return ''
  try {
    const url = new URL(normalized)
    if (!['http:', 'https:'].includes(url.protocol)) return ''
    if (!url.hostname || url.username || url.password || url.search || url.hash) return ''
    return normalized
  } catch {
    return ''
  }
}

function readCachedOrigin(): string {
  try {
    return validOrigin(localStorage.getItem(SERVER_ORIGIN_CACHE_KEY))
  } catch {
    return ''
  }
}

function cacheOrigin(origin: string): void {
  try {
    localStorage.setItem(SERVER_ORIGIN_CACHE_KEY, origin)
  } catch {
    // Caching is best effort; the bootstrap address remains available.
  }
}

function applyServerOrigin(origin: string): string {
  const next = validOrigin(origin)
  if (!next) return SERVER_ORIGIN
  SERVER_ORIGIN = next
  API_BASE_URL = `${next}/api`
  return next
}

/**
 * Packaged clients start from the old server as a bootstrap address, then
 * follow the public migration switch. Browser builds stay same-origin so the
 * /pulseim deployment prefix is not lost.
 */
export function initializeServerOrigin(force = false): Promise<string> {
  if (!isNativeRuntime()) return Promise.resolve(SERVER_ORIGIN)
  if (discoveryPromise) return discoveryPromise
  if (discoveryCompleted && !force) return Promise.resolve(SERVER_ORIGIN)

  discoveryPromise = (async () => {
    const candidates = [readCachedOrigin(), configuredOrigin, DEFAULT_BOOTSTRAP_ORIGIN]
      .map(validOrigin)
      .filter((value, index, values) => value && values.indexOf(value) === index)
    for (const candidate of candidates) {
      const controller = new AbortController()
      const timeout = window.setTimeout(() => controller.abort(), 2500)
      try {
        const response = await fetch(`${candidate}/api/v1/config/server-origin`, {
          cache: 'no-store',
          credentials: 'omit',
          signal: controller.signal,
        })
        if (!response.ok) continue
        const body = await response.json() as {
          code?: number
          data?: { serverOrigin?: unknown }
        }
        if (typeof body.code === 'number' && body.code !== 0) continue
        const discovered = validOrigin(body.data?.serverOrigin)
        if (!discovered) continue
        cacheOrigin(discovered)
        return applyServerOrigin(discovered)
      } catch {
        // Try the next bootstrap candidate. The last working origin remains.
      } finally {
        window.clearTimeout(timeout)
      }
    }
    return SERVER_ORIGIN
  })().finally(() => {
    discoveryCompleted = true
    discoveryPromise = null
  })
  return discoveryPromise
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

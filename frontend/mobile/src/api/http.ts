import axios from 'axios'
import type { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { API_BASE_URL, initializeServerOrigin } from '@/config/endpoints'

const TOKEN_KEY = 'pulse_token'

function authStorage(): Storage {
  return localStorage
}

function migrateTokenFromSession(): void {
  try {
    if (localStorage.getItem(TOKEN_KEY)) {
      sessionStorage.removeItem(TOKEN_KEY)
      return
    }
    const legacy = sessionStorage.getItem(TOKEN_KEY)
    if (!legacy) return
    localStorage.setItem(TOKEN_KEY, legacy)
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // Storage may be unavailable in privacy mode.
  }
}

export function getTokenExpireAt(token: string | null | undefined): number | null {
  if (!token) return null
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number }
    return typeof json.exp === 'number' ? json.exp : null
  } catch {
    return null
  }
}

export function isTokenExpired(token: string | null | undefined): boolean {
  const exp = getTokenExpireAt(token)
  return exp != null && exp * 1000 <= Date.now() + 30_000
}

function storedToken(): string | null {
  migrateTokenFromSession()
  try {
    return authStorage().getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function getToken(): string | null {
  const token = storedToken()
  if (token && isTokenExpired(token)) {
    clearToken()
    return null
  }
  return token
}

export function setToken(token: string): void {
  authStorage().setItem(TOKEN_KEY, token)
  try {
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // Ignore legacy storage cleanup failures.
  }
  window.dispatchEvent(new CustomEvent('pulse:token-updated', { detail: { token } }))
}

export function clearToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // Ignore.
  }
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Ignore.
  }
}

export interface ApiResult<T> {
  code: number
  message: string
  data: T
}

interface RetryableRequestConfig extends InternalAxiosRequestConfig {
  _pulseRetry?: boolean
  _pulseNetworkRetries?: number
}

let refreshPromise: Promise<string | null> | null = null

/**
 * Access Token 在过期前 5 分钟滚动续期。并发请求共享同一个刷新 Promise，
 * 避免同时刷新导致 WebSocket 反复鉴权。
 */
export async function refreshTokenIfNeeded(force = false): Promise<string | null> {
  await initializeServerOrigin()
  const token = storedToken()
  if (!token) return null
  const expireAt = getTokenExpireAt(token)
  const remainingMs = expireAt == null ? Number.POSITIVE_INFINITY : expireAt * 1000 - Date.now()
  if (!force && remainingMs > 5 * 60_000) return token
  if (remainingMs <= 0) return null
  if (refreshPromise) return refreshPromise

  refreshPromise = axios
    .post<ApiResult<{ token: string }>>(
      `${API_BASE_URL}/v1/auth/refresh`,
      {},
      {
        timeout: 15_000,
        withCredentials: true,
        headers: { Authorization: `Bearer ${token}` },
      },
    )
    .then(({ data }) => {
      const next = String(data?.data?.token || '').trim()
      if (!next) throw new Error('刷新 Token 失败')
      setToken(next)
      return next
    })
    .catch(() => null)
    .finally(() => {
      refreshPromise = null
    })
  return refreshPromise
}

const http = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})

http.interceptors.request.use(async (config) => {
  await initializeServerOrigin()
  config.baseURL = API_BASE_URL
  const token = await refreshTokenIfNeeded()
  if (token) config.headers.Authorization = `Bearer ${token}`
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    if (config.headers && 'Content-Type' in config.headers) {
      delete (config.headers as Record<string, unknown>)['Content-Type']
    }
  }
  return config
})

http.interceptors.response.use(
  (response) => {
    const body = response.data as ApiResult<unknown>
    if (body && typeof body.code === 'number' && body.code !== 0) {
      return Promise.reject(new Error(body.message || '请求失败'))
    }
    return response
  },
  async (error: AxiosError) => {
    const config = error.config as RetryableRequestConfig | undefined
    const isRefreshRequest = String(config?.url || '').includes('/v1/auth/refresh')
    if (error.response?.status === 401 && config && !config._pulseRetry && !isRefreshRequest) {
      config._pulseRetry = true
      const next = await refreshTokenIfNeeded(true)
      if (next) {
        config.headers.Authorization = `Bearer ${next}`
        return http.request(config)
      }
      clearToken()
      window.dispatchEvent(new CustomEvent('pulse:auth-revoked', {
        detail: { reason: 'auth_revoked' },
      }))
    }
    const method = String(config?.method || 'get').toLowerCase()
    const status = error.response?.status || 0
    const retryableMethod = method === 'get' || method === 'head' || method === 'options'
    const retryableFailure =
      !error.response ||
      status === 408 ||
      status === 429 ||
      status >= 500
    const retryCount = config?._pulseNetworkRetries || 0
    if (
      config &&
      !isRefreshRequest &&
      retryableMethod &&
      retryableFailure &&
      error.code !== 'ERR_CANCELED' &&
      retryCount < 2
    ) {
      config._pulseNetworkRetries = retryCount + 1
      if (!isRefreshRequest && retryCount === 0) {
        await initializeServerOrigin(true).catch(() => {})
        config.baseURL = API_BASE_URL
      }
      const delay = 350 * 2 ** retryCount + Math.round(Math.random() * 180)
      await new Promise<void>((resolve) => window.setTimeout(resolve, delay))
      return http.request(config)
    }
    const responseData = error.response?.data as { message?: string } | undefined
    const wrapped = new Error(responseData?.message || error.message || '网络错误') as Error & {
      status?: number
      code?: string
    }
    wrapped.status = error.response?.status
    wrapped.code = error.code
    return Promise.reject(wrapped)
  },
)

export default http

import axios from 'axios'

const TOKEN_KEY = 'pulse_admin_token'
const deployPrefix = (import.meta.env.VITE_DEPLOY_PREFIX || '').replace(/\/+$/, '')
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || (deployPrefix ? `${deployPrefix}/api` : '/api')

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export interface ApiResult<T> {
  code: number
  message: string
  data: T
}

const http = axios.create({
  baseURL: apiBaseUrl,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
})

http.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
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
  (error) => {
    if (error.response?.status === 401) {
      clearToken()
    }
    const msg = error.response?.data?.message || error.message || '网络错误'
    return Promise.reject(new Error(msg))
  },
)

export default http

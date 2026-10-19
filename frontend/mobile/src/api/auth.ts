import http, { type ApiResult } from './http'
import { resolveAvatarUrl } from './file'

export interface LoginPayload {
  phone: string
  password?: string
  code?: string
  loginType: 'password' | 'code'
  securityCode?: string
  deviceName?: string
  platform?: string
}

export interface LoginResult {
  token: string
  userId: string
  pulseId?: string
  nickname: string
  avatar?: string
  phone?: string
}

export interface RegisterPayload {
  phone: string
  code: string
  nickname: string
  password: string
  avatarUrl?: string
}

interface BackendLoginVO {
  token: string
  userId: number | string
  pulseId?: string
  nickname: string
  avatarUrl?: string
  phone?: string
}

function mapLogin(vo: BackendLoginVO | null | undefined): LoginResult {
  if (!vo || typeof vo !== 'object') {
    throw new Error('登录接口未返回用户信息，请检查 App 网络和服务器地址')
  }
  const token = String(vo.token || '').trim()
  if (!token) {
    throw new Error('登录接口未返回 Token，请稍后重试')
  }
  return {
    token,
    userId: String(vo.userId),
    pulseId: vo.pulseId ? String(vo.pulseId) : undefined,
    nickname: vo.nickname,
    avatar: resolveAvatarUrl(vo.avatarUrl || ''),
    phone: vo.phone,
  }
}

export async function login(payload: LoginPayload): Promise<LoginResult> {
  const deviceId = getDeviceId()
  const metadata = deviceMetadata()
  if (payload.loginType === 'code') {
    const { data } = await http.post<ApiResult<BackendLoginVO>>('/v1/auth/login/sms', {
      phone: payload.phone,
      code: payload.code,
      deviceId,
      deviceName: payload.deviceName || metadata.deviceName,
      platform: payload.platform || metadata.platform,
    })
    return mapLogin(data.data)
  }
  const { data } = await http.post<ApiResult<BackendLoginVO>>('/v1/auth/login', {
    phone: payload.phone,
    password: payload.password,
    deviceId,
    deviceName: payload.deviceName || metadata.deviceName,
    platform: payload.platform || metadata.platform,
    securityCode: payload.securityCode,
  })
  return mapLogin(data.data)
}

export async function sendSmsCode(
  phone: string,
  scene: 'login' | 'register' | 'reset' | 'change_phone' | 'change_password' = 'login',
) {
  const { data } = await http.post<ApiResult<{ message: string; devHint?: string }>>('/v1/auth/sms/send', {
    phone,
    scene,
  })
  return data.data
}

export async function resetPassword(payload: {
  phone: string
  code: string
  password: string
}): Promise<void> {
  await http.post('/v1/auth/password/reset', payload)
}

/** Confirm a desktop login ticket from the already authenticated phone. */
export async function confirmDesktopQrLogin(ticket: string): Promise<void> {
  await http.post('/v1/auth/qr/confirm', { ticket })
}

export interface DeviceSession {
  deviceId: string
  name: string
  platform?: string
  trusted?: boolean
  trustedAt?: string
  loginAt?: string
  lastActiveAt?: string
  current?: boolean
  /** 该设备当前是否有活跃连接（IM 服务端实时写入） */
  online?: boolean
}

function getDeviceId(): string {
  let deviceId = localStorage.getItem('pulse_device_id')
  if (!deviceId) {
    deviceId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
    localStorage.setItem('pulse_device_id', deviceId)
  }
  return deviceId
}

/** 登出/清理本地会话时轮换设备标识，避免同源页面换账号登录时复用旧标识。 */
export function clearDeviceId(): void {
  try {
    localStorage.removeItem('pulse_device_id')
  } catch {
    // Storage is best effort.
  }
}

function deviceMetadata(): { deviceName: string; platform: string } {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
  if (/Android/i.test(ua)) return { deviceName: 'Android 设备', platform: 'android' }
  if (/iPhone|iPad|iPod/i.test(ua)) return { deviceName: 'iPhone / iPad', platform: 'ios' }
  if (/Windows/i.test(ua)) return { deviceName: 'Windows 网页端', platform: 'windows_web' }
  return { deviceName: 'Web 浏览器', platform: 'web' }
}

/** 服务端登出：吊销当前设备令牌（旧 Cookie 立即失效） */
export async function logout(): Promise<void> {
  try {
    await http.post('/v1/auth/logout')
  } finally {
    // 同一浏览器里移动网页(/pulseim)与桌面网页(/pulseim/desktop/)同源共用
    // localStorage 的 pulse_device_id。若登出不清除，下一个账号登录会复用
    // 同一个设备标识，服务端出现同一 deviceId 挂在两个账号下的脏数据，
    // 导致旧设备互相踢、会话被反复撤销。登出即轮换。
    clearDeviceId()
  }
}

export async function register(payload: RegisterPayload): Promise<LoginResult> {
  const metadata = deviceMetadata()
  const { data } = await http.post<ApiResult<BackendLoginVO>>('/v1/auth/register', {
    phone: payload.phone,
    code: payload.code,
    nickname: payload.nickname,
    password: payload.password,
    avatarUrl: payload.avatarUrl,
    deviceId: getDeviceId(),
    deviceName: metadata.deviceName,
    platform: metadata.platform,
  })
  return mapLogin(data.data)
}

export async function reportOnlineLog(): Promise<void> {
  await http.post('/v1/user/online-log')
}

export interface AccountSecurityInfo {
  phone: string
  securityCodeEnabled: boolean
  securityCode: string
}

export async function setSecurityCodeEnabled(enabled: boolean): Promise<AccountSecurityInfo> {
  const { data } = await http.put<ApiResult<AccountSecurityInfo>>('/v1/user/security/security-code', { enabled })
  return data.data
}

export async function refreshSecurityCode(): Promise<AccountSecurityInfo> {
  const { data } = await http.post<ApiResult<AccountSecurityInfo>>('/v1/user/security/security-code/refresh')
  return data.data
}

export async function fetchAccountSecurity(): Promise<AccountSecurityInfo> {
  const { data } = await http.get<ApiResult<AccountSecurityInfo>>('/v1/user/security')
  return data.data
}

export async function changeAccountPassword(payload: {
  oldPassword: string
  newPassword: string
  code: string
}): Promise<void> {
  await http.put('/v1/user/security/password', payload)
}

export async function changeAccountPhone(payload: {
  newPhone: string
  code: string
}): Promise<AccountSecurityInfo> {
  const { data } = await http.put<ApiResult<AccountSecurityInfo>>('/v1/user/security/phone', payload)
  return data.data
}

export async function deleteAccount(agreementKey = 'account_deletion_agreement'): Promise<void> {
  await http.delete('/v1/user/security/account', { data: { agreementKey } })
}

export async function fetchDeviceSessions(): Promise<{ list: DeviceSession[]; currentDeviceId?: string }> {
  const { data } = await http.get<ApiResult<{ list: DeviceSession[]; currentDeviceId?: string }>>('/v1/user/security/devices')
  const payload = data.data || { list: [] }
  return {
    ...payload,
    list: (payload.list || []).map((device) => {
      const raw = device as DeviceSession & { login_at?: string; last_active_at?: string }
      return {
        ...device,
        // Some older API gateways expose snake_case fields. Never use the
        // activity timestamp as a login timestamp in the device UI.
        loginAt: device.loginAt || raw.login_at || undefined,
        lastActiveAt: undefined,
      }
    }),
  }
}

export async function revokeDevice(deviceId: string): Promise<void> {
  await http.delete(`/v1/user/security/devices/${encodeURIComponent(deviceId)}`)
}

export async function revokeOtherDevices(): Promise<{ count: number }> {
  const { data } = await http.post<ApiResult<{ count: number }>>('/v1/user/security/devices/logout-others')
  return data.data
}

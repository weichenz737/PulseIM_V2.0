import http, { type ApiResult } from './http'

export interface ClientAccessConfig {
  windowsPhoneLoginEnabled: boolean
  windowsQrLoginEnabled: boolean
  windowsRegisterEnabled: boolean
  windowsWalletEnabled: boolean
  updatedAt?: string
}

export async function fetchClientLoginMethods(): Promise<ClientAccessConfig> {
  const { data } = await http.get<ApiResult<ClientAccessConfig>>('/admin/client-login-methods')
  return data.data
}

export async function saveClientLoginMethods(payload: Pick<ClientAccessConfig, 'windowsPhoneLoginEnabled' | 'windowsQrLoginEnabled'>): Promise<ClientAccessConfig> {
  const { data } = await http.put<ApiResult<ClientAccessConfig>>('/admin/client-login-methods', payload)
  return data.data
}

export async function fetchClientRegisterConfig(): Promise<ClientAccessConfig> {
  const { data } = await http.get<ApiResult<ClientAccessConfig>>('/admin/client-register')
  return data.data
}

export async function saveClientRegisterConfig(enabled: boolean): Promise<ClientAccessConfig> {
  const { data } = await http.put<ApiResult<ClientAccessConfig>>('/admin/client-register', {
    windowsRegisterEnabled: enabled,
  })
  return data.data
}

export async function fetchClientWalletConfig(): Promise<ClientAccessConfig> {
  const { data } = await http.get<ApiResult<ClientAccessConfig>>('/admin/client-wallet')
  return data.data
}

export async function saveClientWalletConfig(enabled: boolean): Promise<ClientAccessConfig> {
  const { data } = await http.put<ApiResult<ClientAccessConfig>>('/admin/client-wallet', {
    windowsWalletEnabled: enabled,
  })
  return data.data
}

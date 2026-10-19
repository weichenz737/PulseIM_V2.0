import http, { type ApiResult } from './http'

export type WpsOfficeType = 'w' | 's' | 'p' | 'f'

export interface WpsPreviewConfig {
  appId: string
  fileId: string
  officeType: WpsOfficeType
  token: string
  tokenTimeoutMs: number
  sdkUrl: string
  fileName: string
  callbackBaseUrl: string
}

export async function prepareWpsPreview(payload: {
  url: string
  name: string
  contentType?: string
}): Promise<WpsPreviewConfig> {
  const { data } = await http.post<ApiResult<WpsPreviewConfig>>('/v1/wps/preview', payload)
  return data.data
}

export async function refreshWpsPreview(fileId: string): Promise<{ token: string; timeoutMs: number }> {
  const { data } = await http.post<ApiResult<{ token: string; timeoutMs: number }>>(
    '/v1/wps/preview/refresh',
    { fileId },
  )
  return data.data
}

interface WpsSdk {
  OfficeType?: {
    Writer?: string
    Spreadsheet?: string
    Presentation?: string
    Pdf?: string
  }
  init: (options: {
    officeType: string
    appId: string
    fileId: string
    mount: HTMLElement
    token?: string
    customArgs?: Record<string, string>
    isListenResize?: boolean
    refreshToken?: () => Promise<{ token: string; timeout: number }>
  }) => WpsInstance
}

export interface WpsInstance {
  ready?: () => Promise<unknown>
  destroy?: () => void | Promise<void>
  on?: (event: string, handler: (payload: unknown) => void) => void
}

declare global {
  interface Window {
    WebOfficeSDK?: WpsSdk
  }
}

let sdkPromise: Promise<WpsSdk> | null = null

/** Load the self-hosted WPS JSSDK once; the URL comes from backend/env config. */
export function loadWpsSdk(url: string): Promise<WpsSdk> {
  if (window.WebOfficeSDK) return Promise.resolve(window.WebOfficeSDK)
  if (sdkPromise) return sdkPromise
  sdkPromise = new Promise<WpsSdk>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = url
    script.async = true
    script.onload = () => {
      if (window.WebOfficeSDK) resolve(window.WebOfficeSDK)
      else reject(new Error('WPS WebOffice JSSDK 加载后未找到 WebOfficeSDK'))
    }
    script.onerror = () => reject(new Error('WPS WebOffice JSSDK 加载失败'))
    document.head.appendChild(script)
  }).catch((error) => {
    sdkPromise = null
    throw error
  })
  return sdkPromise
}

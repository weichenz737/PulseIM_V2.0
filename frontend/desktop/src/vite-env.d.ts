/// <reference types="vite/client" />
/// <reference path="../../mobile/node_modules/vite/client.d.ts" />

declare module '*.js'

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}

interface Window {
  pulseDesktop?: {
    apiRequest?: (options: {
      url: string
      method: string
      headers?: Record<string, string>
      body?: string
    }) => Promise<{ status: number; headers?: Record<string, string>; body: string }>
    setServerOrigin?: (origin: string) => Promise<boolean>
    mediaRequest?: (options: {
      url: string
      headers?: Record<string, string>
    }) => Promise<{
      status: number
      contentType?: string
      bodyBytes?: Uint8Array | ArrayBuffer | number[] | { type?: string; data?: number[] }
    }>
    mediaDebug?: (message: string) => void
    setMediaToken?: (token: string) => void
  }
}

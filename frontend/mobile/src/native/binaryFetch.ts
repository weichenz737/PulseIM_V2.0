import { Capacitor, CapacitorHttp, type HttpResponse } from '@capacitor/core'
import { setNativeBinaryResponseFetcher } from '../../../shared/resumableDownload.ts'

function requestParts(input: RequestInfo | URL, init?: RequestInit): {
  url: string
  method: string
  headers: Record<string, string>
} {
  const request = input instanceof Request ? input : null
  const url = request?.url || (input instanceof URL ? input.toString() : String(input))
  const headers = new Headers(request?.headers || init?.headers)
  const method = String(init?.method || request?.method || 'GET').toUpperCase()
  return {
    url,
    method,
    headers: Object.fromEntries(headers.entries()),
  }
}

function base64Bytes(value: unknown): Uint8Array | null {
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (value instanceof Uint8Array) return value
  if (typeof value !== 'string' || !value) return null
  try {
    const binary = atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return bytes
  } catch {
    return null
  }
}

function responseBody(result: HttpResponse): BodyInit | null {
  const bytes = base64Bytes(result.data)
  if (bytes) return bytes
  if (result.data == null) return null
  if (typeof result.data === 'string') return result.data
  return JSON.stringify(result.data)
}

async function fetchBinaryWithCapacitor(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const parts = requestParts(input, init)
  const result = await CapacitorHttp.request({
    url: parts.url,
    method: parts.method,
    headers: parts.headers,
    responseType: 'arraybuffer',
    connectTimeout: 30_000,
    readTimeout: 120_000,
  })
  return new Response(responseBody(result), {
    status: result.status,
    headers: result.headers,
  })
}

/** Install the binary-safe fetch adapter before the first route can load media. */
export function initializeNativeBinaryFetch(): void {
  if (Capacitor.isNativePlatform()) {
    setNativeBinaryResponseFetcher(fetchBinaryWithCapacitor)
  }
}

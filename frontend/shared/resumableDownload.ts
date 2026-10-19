export interface ResumableDownloadOptions {
  key: string
  url: string
  headers?: HeadersInit
  onProgress?: (loaded: number, total: number) => void
  refreshToken?: (force?: boolean) => Promise<string | null>
  request?: (headers: Headers) => Promise<Response>
  timeoutMs?: number
}

interface PartialDownload {
  key: string
  total: number
  contentType: string
  loaded: number
  chunks: ArrayBuffer[]
  updatedAt: number
}

const PARTIAL_DB_NAME = 'pulse-file-download-parts-v1'
const PARTIAL_STORE_NAME = 'parts'
const RANGE_CHUNK_SIZE = 4 * 1024 * 1024
let partialDbPromise: Promise<IDBDatabase | null> | null = null
const resumableInFlightKeys = new Set<string>()
const deferredPartialClearPrefixes = new Set<string>()

type BinaryResponseFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

let nativeBinaryResponseFetcher: BinaryResponseFetcher | null = null

/**
 * Allows a native shell to provide a binary-safe HTTP implementation without
 * making this shared module depend on Capacitor. Desktop and ordinary web
 * builds continue to use the browser fetch implementation.
 */
export function setNativeBinaryResponseFetcher(fetcher: BinaryResponseFetcher | null): void {
  nativeBinaryResponseFetcher = fetcher
}

/**
 * Capacitor's optional CapacitorHttp bridge patches window.fetch on Android.
 * Its patched fetch defaults binary responses to text unless the caller uses
 * the native plugin responseType API, which corrupts protected images/videos.
 * The bridge keeps the original browser fetch as CapacitorWebFetch; use it for
 * binary downloads so Response.blob()/arrayBuffer() receives real bytes.
 */
export function fetchBinaryResponse(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (nativeBinaryResponseFetcher) {
    return nativeBinaryResponseFetcher(input, init)
  }
  const runtime = globalThis as typeof globalThis & {
    CapacitorWebFetch?: typeof fetch
  }
  const originalFetch = runtime.CapacitorWebFetch
  if (typeof originalFetch === 'function') {
    return originalFetch.call(globalThis, input, init)
  }
  return fetch(input, init)
}

function openPartialDb(): Promise<IDBDatabase | null> {
  if (partialDbPromise) return partialDbPromise
  partialDbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    try {
      const request = indexedDB.open(PARTIAL_DB_NAME, 1)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(PARTIAL_STORE_NAME)) {
          request.result.createObjectStore(PARTIAL_STORE_NAME, { keyPath: 'key' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return partialDbPromise
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('partial storage failed'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error || new Error('partial storage failed'))
    transaction.onabort = () => reject(transaction.error || new Error('partial storage aborted'))
  })
}

async function readPartial(key: string): Promise<PartialDownload | null> {
  const db = await openPartialDb()
  if (!db) return null
  try {
    const transaction = db.transaction(PARTIAL_STORE_NAME, 'readonly')
    const value = await requestResult<PartialDownload | undefined>(transaction.objectStore(PARTIAL_STORE_NAME).get(key))
    if (!value || !Array.isArray(value.chunks) || value.loaded <= 0) return null
    const chunks = value.chunks.filter((chunk): chunk is ArrayBuffer => chunk instanceof ArrayBuffer)
    const loaded = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
    if (!chunks.length || loaded !== Number(value.loaded)) return null
    return { ...value, chunks, loaded }
  } catch {
    return null
  }
}

async function writePartial(value: PartialDownload): Promise<void> {
  const db = await openPartialDb()
  if (!db) return
  try {
    const transaction = db.transaction(PARTIAL_STORE_NAME, 'readwrite')
    transaction.objectStore(PARTIAL_STORE_NAME).put(value)
    await transactionDone(transaction)
  } catch {
    // IndexedDB is only a resume optimization. The current request can continue.
  }
}

async function deletePartial(key: string): Promise<void> {
  const db = await openPartialDb()
  if (!db) return
  try {
    const transaction = db.transaction(PARTIAL_STORE_NAME, 'readwrite')
    transaction.objectStore(PARTIAL_STORE_NAME).delete(key)
    await transactionDone(transaction)
  } catch {
    // Best effort; an old completed partial is harmless and will be replaced.
  }
}

async function fetchWithAuth(options: ResumableDownloadOptions, headers: Headers): Promise<Response> {
  const token = await options.refreshToken?.(false)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const request = options.request || ((requestHeaders: Headers) => {
    const controller = new AbortController()
    const timer = globalThis.setTimeout(() => controller.abort(), options.timeoutMs ?? 120_000)
    return fetchBinaryResponse(options.url, {
      headers: requestHeaders,
      credentials: 'include',
      signal: controller.signal,
    }).finally(() => globalThis.clearTimeout(timer))
  })
  let response = await request(headers)
  if (response.status === 401 && options.refreshToken) {
    const refreshed = await options.refreshToken(true)
    if (refreshed) {
      headers.set('Authorization', `Bearer ${refreshed}`)
      response = await request(headers)
    }
  }
  return response
}

async function readResponseBytes(
  response: Response,
  onProgress: (loaded: number) => void,
  loadedBefore: number,
  total: number,
): Promise<Uint8Array> {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    onProgress(loadedBefore + bytes.byteLength)
    return bytes
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = loadedBefore
  while (true) {
    const next = await reader.read()
    if (next.done) break
    if (!next.value) continue
    chunks.push(next.value)
    loaded += next.value.byteLength
    onProgress(total > 0 ? Math.min(loaded, total) : loaded)
  }
  const bytes = new Uint8Array(loaded - loadedBefore)
  let offset = 0
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  })
  return bytes
}

function parseContentRange(value: string | null): { start: number; end: number; total: number } | null {
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(String(value || '').trim())
  if (!match) return null
  const start = Number(match[1])
  const end = Number(match[2])
  const total = match[3] === '*' ? 0 : Number(match[3])
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start) return null
  return { start, end, total: Number.isSafeInteger(total) ? total : 0 }
}

/** Downloads a protected file in HTTP range chunks and resumes completed chunks after interruption. */
export async function fetchResumableBlob(options: ResumableDownloadOptions): Promise<Blob> {
  const key = String(options.key || options.url).trim()
  resumableInFlightKeys.add(key)
  try {
    const partial = await readPartial(key)
    let chunks = partial?.chunks ? [...partial.chunks] : []
    let loaded = partial?.loaded || 0
    let total = partial?.total || 0
    let contentType = partial?.contentType || ''
    let restarted = false
    const report = (value: number) => options.onProgress?.(value, total)

    while (true) {
      const headers = new Headers(options.headers)
      headers.set('Range', `bytes=${loaded}-${loaded + RANGE_CHUNK_SIZE - 1}`)
      const response = await fetchWithAuth(options, headers)
      const responseType = response.headers.get('Content-Type') || contentType || 'application/octet-stream'
      contentType = responseType

      if (response.status === 416 && loaded > 0) {
        // A server that omits the total in 206 responses may answer the
        // exact-end request with 416. If its */total confirms that all bytes
        // are already present, finish without throwing away the download.
        const endRange = /^bytes\s+\*\/(\d+)$/i.exec(String(response.headers.get('Content-Range') || '').trim())
        const endTotal = endRange ? Number(endRange[1]) : 0
        if (endTotal > 0 && loaded === endTotal) {
          await deletePartial(key)
          return new Blob(chunks, { type: contentType })
        }
        if (!restarted) {
          await deletePartial(key)
          chunks = []
          loaded = 0
          total = 0
          restarted = true
          continue
        }
      }
      if (response.status === 200) {
        const responseTotal = Number(response.headers.get('Content-Length') || 0)
        const bytes = await readResponseBytes(response, (value) => options.onProgress?.(value, responseTotal), 0, responseTotal)
        await deletePartial(key)
        return new Blob([bytes], { type: responseType })
      }
      if (response.status === 401) {
        const error = new Error('登录已失效，请重新登录') as Error & { code?: string; status?: number }
        error.name = 'DesktopAuthExpiredError'
        error.code = 'AUTH_EXPIRED'
        error.status = 401
        throw error
      }
      if (response.status !== 206) throw new Error(`文件下载失败 (${response.status})`)

      const contentRange = parseContentRange(response.headers.get('Content-Range'))
      if (!contentRange || contentRange.start !== loaded) {
        if (!restarted) {
          await deletePartial(key)
          chunks = []
          loaded = 0
          total = 0
          restarted = true
          continue
        }
        throw new Error('服务器返回了无效的文件分片')
      }
      if (contentRange.total > 0) total = contentRange.total
      const bytes = await readResponseBytes(response, (value) => report(value), loaded, total)
      if (!bytes.byteLength) throw new Error('服务器返回了空文件分片')
      chunks.push(bytes.slice().buffer)
      loaded += bytes.byteLength
      report(loaded)

      const isComplete = (total > 0 && loaded >= total)
        || (total <= 0 && bytes.byteLength < RANGE_CHUNK_SIZE)
      if (isComplete) {
        await deletePartial(key)
        return new Blob(chunks, { type: contentType })
      }
      await writePartial({ key, total, contentType, loaded, chunks, updatedAt: Date.now() })
    }
  } finally {
    resumableInFlightKeys.delete(key)
    const deferred = [...deferredPartialClearPrefixes].filter((prefix) => !prefix || key.startsWith(prefix))
    if (deferred.length) {
      await deletePartial(key)
      // Keep a prefix alive until every request covered by the clear has
      // finished; otherwise the first completed request would leave a second
      // concurrent partial download behind.
      deferred.forEach((prefix) => {
        const stillActive = [...resumableInFlightKeys].some((activeKey) => !prefix || activeKey.startsWith(prefix))
        if (!stillActive) deferredPartialClearPrefixes.delete(prefix)
      })
    }
  }
}

/** Returns the bytes held by interrupted downloads for storage accounting. */
export async function getResumableDownloadUsage(prefix = ''): Promise<number> {
  const db = await openPartialDb()
  if (!db) return 0
  try {
    const transaction = db.transaction(PARTIAL_STORE_NAME, 'readonly')
    const values = await requestResult<PartialDownload[]>(transaction.objectStore(PARTIAL_STORE_NAME).getAll())
    return values.reduce((total, value) => {
      const key = String(value?.key || '')
      if (prefix && !key.startsWith(prefix)) return total
      const bytes = Array.isArray(value?.chunks)
        ? value.chunks.reduce((sum, chunk) => sum + (chunk instanceof ArrayBuffer ? chunk.byteLength : 0), 0)
        : 0
      return total + bytes
    }, 0)
  } catch {
    return 0
  }
}

/** Removes interrupted local download parts without touching completed caches or server files. */
export async function clearResumableDownloadParts(prefix = ''): Promise<void> {
  const db = await openPartialDb()
  if (!db) return
  deferredPartialClearPrefixes.add(prefix)
  await new Promise<void>((resolve) => {
    try {
      const transaction = db.transaction(PARTIAL_STORE_NAME, 'readwrite')
      const store = transaction.objectStore(PARTIAL_STORE_NAME)
      const cursorRequest = store.openCursor()
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result
        if (!cursor) return
        const key = String(cursor.key || '')
        if ((!prefix || key.startsWith(prefix)) && !resumableInFlightKeys.has(key)) cursor.delete()
        cursor.continue()
      }
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => resolve()
      transaction.onabort = () => resolve()
    } catch {
      resolve()
    }
  })
}

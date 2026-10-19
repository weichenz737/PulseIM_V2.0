import { fileDownloadUrl } from '@/api/file'
import { cacheChatFile, getStableChatFileUrl, markChatCacheInUse } from './fileCache'

export type MomentMediaKind = 'image' | 'video'
export type MomentMediaVariant = 'thumb' | 'preview' | 'original'
export type MomentMediaLoadedCallback = (variant: MomentMediaVariant) => void

export function getStableMomentMedia(
  fileId: string,
  kind: MomentMediaKind,
  preferred: MomentMediaVariant,
): { url: string; variant: MomentMediaVariant } | null {
  const variants: MomentMediaVariant[] = kind === 'image'
    ? preferred === 'original' ? ['original'] : [preferred, preferred === 'preview' ? 'thumb' : 'original', 'original']
    : preferred === 'thumb' ? ['thumb'] : [preferred]
  for (const variant of variants) {
    const url = getStableChatFileUrl(fileId, variant)
    if (url) return { url, variant }
  }
  return null
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

/**
 * Reads a protected moment asset into the authenticated local cache. Older
 * uploads may only have the original object, so image previews deliberately
 * fall back through thumb -> original instead of leaving an empty src.
 */
export async function loadMomentMedia(
  fileId: string,
  kind: MomentMediaKind,
  preferred: MomentMediaVariant,
  fallbackUrl?: string,
  onLoaded?: MomentMediaLoadedCallback,
): Promise<string> {
  const id = String(fileId || '').trim()
  if (!id) return ''
  const variants: MomentMediaVariant[] = kind === 'image'
    ? preferred === 'original' ? ['original'] : [preferred, preferred === 'preview' ? 'thumb' : 'original', 'original']
    : preferred === 'thumb' ? ['thumb'] : [preferred]
  const ordered = variants.map((variant) => ({
    variant,
    url: variant === preferred && fallbackUrl ? fallbackUrl : fileDownloadUrl(id, variant),
  }))
  for (const option of ordered) {
    if (!option.url) continue
    try {
      const cached = await cacheChatFile(kind, id, option.variant, option.url)
      if (cached) {
        onLoaded?.(option.variant)
        return cached
      }
    } catch {
      // Try the next rendition. A missing async video thumbnail is expected
      // immediately after publishing.
    }
  }
  return ''
}

/** Retries only where the server may still be generating a video thumbnail. */
export async function loadMomentMediaWithRetry(
  fileId: string,
  kind: MomentMediaKind,
  preferred: MomentMediaVariant,
  fallbackUrl?: string,
  attempts = kind === 'video' && preferred === 'thumb' ? 18 : 1,
  onLoaded?: MomentMediaLoadedCallback,
): Promise<string> {
  const total = Math.max(1, attempts)
  for (let attempt = 0; attempt < total; attempt += 1) {
    const loaded = await loadMomentMedia(fileId, kind, preferred, fallbackUrl, onLoaded)
    if (loaded) return loaded
    if (attempt + 1 < total) await sleep(700)
  }
  return ''
}

/**
 * Keeps the Blob URLs used by a kept-alive moments page valid while that page
 * is active. The cache manager may otherwise revoke them during eviction or
 * an explicit local-cache cleanup, leaving an already-rendered background or
 * thumbnail pointing at a dead blob URL.
 */
export function createMomentMediaCacheGuard() {
  const loaded = new Map<string, { fileId: string; variant: MomentMediaVariant }>()
  let active = true

  const setInUse = (fileId: string, variant: MomentMediaVariant, inUse: boolean) => {
    const id = String(fileId || '').trim()
    if (id) markChatCacheInUse(id, variant, inUse)
  }

  return {
    onLoaded(fileId: string, variant: MomentMediaVariant) {
      const id = String(fileId || '').trim()
      if (!id) return
      const key = `${id}::${variant}`
      loaded.set(key, { fileId: id, variant })
      if (active) setInUse(id, variant, true)
    },
    activate() {
      active = true
      loaded.forEach(({ fileId, variant }) => setInUse(fileId, variant, true))
    },
    deactivate() {
      active = false
      loaded.forEach(({ fileId, variant }) => setInUse(fileId, variant, false))
    },
    reset() {
      loaded.forEach(({ fileId, variant }) => setInUse(fileId, variant, false))
      loaded.clear()
    },
    dispose() {
      active = false
      loaded.forEach(({ fileId, variant }) => setInUse(fileId, variant, false))
      loaded.clear()
    },
  }
}

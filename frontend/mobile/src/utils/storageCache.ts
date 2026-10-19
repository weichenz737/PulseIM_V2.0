import { clearVoiceCache, getVoiceCacheSize } from '@/utils/voiceCache'
import {
  clearChatFileCache,
  getChatCacheUsage,
  type ChatCacheKind,
} from '@/utils/fileCache'

export interface StorageUsage {
  local: number
  media: number
  browserCache: number
  offline: number | null
  chatImages: number
  chatVideos: number
  chatFiles: number
  chatAudio: number
  total: number
}

/** 清理缓存只处理附件 CacheStorage 和运行时语音缓存，不删除消息、登录态或业务索引。 */
const PROTECTED_KEYS = new Set([
  'pulse_token',
  'pulse_user_profile',
  'pulse_remember_login',
  'pulse_font_size',
  'pulse_theme',
  'pulse_device_id',
  'pulse_chat_font_size',
  'pulse_saved_accounts',
  'pulse_storage_deleted_assets',
])

const PROTECTED_PREFIXES = [
  'pulse_chat_draft:',
  'pulse_chat_draft_',
  'pulse_storage_deleted_assets:',
  'pulse_fab_',
  'pulse_select_all_',
  'pulse_preference_',
]

function isProtectedKey(key: string): boolean {
  return PROTECTED_KEYS.has(key) || PROTECTED_PREFIXES.some((prefix) => key.startsWith(prefix))
}

function stringBytes(value: string | null): number {
  return value ? new Blob([value]).size : 0
}

function storageBytes(storage: Storage): number {
  let bytes = 0
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i)
    if (!key || isProtectedKey(key)) continue
    bytes += stringBytes(key) + stringBytes(storage.getItem(key))
  }
  return bytes
}

interface DetailedStorageEstimate extends StorageEstimate {
  usageDetails?: { indexedDB?: number }
}

async function storageManagerBreakdown(): Promise<{ offline: number | null }> {
  try {
    const estimate = await navigator.storage?.estimate() as DetailedStorageEstimate | undefined
    const indexedDb = Number(estimate?.usageDetails?.indexedDB)
    return { offline: Number.isFinite(indexedDb) ? Math.max(0, indexedDb) : null }
  } catch {
    return { offline: null }
  }
}

export async function measureStorageUsage(): Promise<StorageUsage> {
  const local = storageBytes(localStorage) + storageBytes(sessionStorage)
  const media = getVoiceCacheSize()
  const chat = await getChatCacheUsage()
  const breakdown = await storageManagerBreakdown()
  const chatTotal = chat.total + media
  return {
    local,
    media,
    // Do not use navigator.storage.usageDetails.caches here: it includes unrelated
    // browser/app caches and cannot be safely cleared by PulseIM.
    browserCache: 0,
    offline: breakdown.offline,
    chatImages: chat.image,
    chatVideos: chat.video,
    chatFiles: chat.file,
    chatAudio: chat.audio + media,
    total: local + chatTotal + (breakdown.offline ?? 0),
  }
}

export type StorageCacheKind =
  | 'local'
  | 'media'
  | 'browserCache'
  | 'offline'
  | 'chatImage'
  | 'chatVideo'
  | 'chatFile'
  | 'chatAudio'
  | 'chatAll'

function chatKindOf(kind: StorageCacheKind): ChatCacheKind | undefined {
  if (kind === 'chatImage') return 'image'
  if (kind === 'chatVideo') return 'video'
  if (kind === 'chatFile') return 'file'
  if (kind === 'chatAudio') return 'audio'
  return undefined
}

export async function clearStorageByKind(kind: StorageCacheKind): Promise<void> {
  if (kind === 'media') {
    clearVoiceCache()
    return
  }
  if (kind === 'chatAll') {
    clearVoiceCache()
    await clearChatFileCache()
    return
  }
  const chatKind = chatKindOf(kind)
  if (chatKind) {
    await clearChatFileCache(chatKind)
    if (chatKind === 'audio') clearVoiceCache()
    return
  }
  // local/browserCache/offline are intentionally not mass-deleted. They may
  // contain login state, user preferences, saved data, or unrelated app data.
}

export async function clearAppCache(): Promise<void> {
  await clearStorageByKind('chatAll')
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** unit
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`
}

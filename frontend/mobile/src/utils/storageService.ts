import { fetchConversations, type ConversationItem } from '@/api/conversation'
import {
  fetchMessages,
  parseFilePayload,
  type ChatMessage,
  type FilePayload,
} from '@/api/message'
import { extractChatFileId, fileDownloadUrl, resolveFileUrl } from '@/api/file'
import { isAndroid } from '@/native/platform'
import { nativeStorageInfo } from '@/native'
import { useUserStore } from '@/stores/user'
import { formatFileSize } from '@/utils/media'
import { measureStorageUsage, type StorageUsage } from '@/utils/storageCache'
import { filterLocallyClearedMessages } from '@/utils/localChatHistory'
import { listChatCacheIndex, type ChatCacheIndexEntry } from '@/utils/fileCache'

export type StorageAssetKind = 'image' | 'video' | 'file' | 'audio'

export interface StorageAsset {
  id: string
  fileId?: string
  conversationId: string
  conversationName: string
  conversationType: ConversationItem['type']
  senderId: string
  senderName: string
  createdAt?: string
  kind: StorageAssetKind
  url: string
  thumbUrl?: string
  previewUrl?: string
  originalUrl?: string
  name: string
  size: number
  originalSize: number
  cachedVariants: string[]
  contentType: string
  durationMs?: number
  message: ChatMessage
}

export interface StorageConversationStat {
  conversation: ConversationItem
  recordsBytes: number
  filesBytes: number
  assets: StorageAsset[]
  messageCount: number
  partial: boolean
}

export interface StorageInventory {
  conversations: StorageConversationStat[]
  assets: StorageAsset[]
  chatRecordsBytes: number
  chatFilesBytes: number
  loadedMessages: number
  partial: boolean
}

export interface DeviceStorageMetrics {
  totalBytes: number
  availableBytes: number
  appUsedBytes: number
  source: 'android' | 'browser' | 'unavailable'
}

export interface StorageOverview {
  device: DeviceStorageMetrics
  cache: StorageUsage
  inventory: StorageInventory
  pulseUsedBytes: number
  otherDataBytes: number
}

const PAGE_SIZE = 200
const MAX_MESSAGES_PER_CONVERSATION = 10_000
const inventoryCache = new Map<string, StorageInventory>()

function currentUserId(): string {
  return useUserStore().userId || 'anonymous'
}

function currentUserScope(): string {
  return currentUserId()
}

function payloadIsVideo(payload: FilePayload | null): boolean {
  const value = `${payload?.contentType || ''} ${payload?.url || ''} ${payload?.name || ''}`.toLowerCase()
  return value.includes('video/') || /\.(mp4|webm|mov|m4v|avi|mkv|3gp)(?:[?#]|$)/i.test(value)
}

function classifyMessage(message: ChatMessage): StorageAssetKind | null {
  if (message.msgType === 1) return 'image'
  if (message.msgType === 3) return 'audio'
  if (message.msgType === 2) return payloadIsVideo(parseFilePayload(message.content)) ? 'video' : 'file'
  return null
}

function messagePayload(message: ChatMessage): FilePayload {
  const payload = parseFilePayload(message.content)
  if (payload) return payload
  return { url: message.content, name: '文件' }
}

function assetFromMessage(
  message: ChatMessage,
  conversation: ConversationItem,
  cacheEntries: ChatCacheIndexEntry[],
): StorageAsset | null {
  const kind = classifyMessage(message)
  if (!kind) return null
  const payload = messagePayload(message)
  const rawUrl = payload.url || (payload.fileId ? fileDownloadUrl(payload.fileId) : '')
  const url = resolveFileUrl(rawUrl)
  if (!url) return null
  // Older messages may only carry the protected download URL. Promote the id
  // back into the storage asset so the media grid can fetch it with the
  // Authorization header instead of handing the private URL to <img>.
  const fileId = payload.fileId || extractChatFileId(rawUrl) || extractChatFileId(payload.originalUrl)
  const defaultNames: Record<StorageAssetKind, string> = {
    image: '图片',
    video: '视频',
    file: '文件',
    audio: '语音消息',
  }
  const cached = fileId
    ? cacheEntries.filter((entry) => entry.fileId === fileId)
    : []
  const uniqueCached = [...new Map(cached.map((entry) => [
    `${entry.fileId}::${entry.variant}`,
    entry,
  ])).values()]
  const cachedBytes = uniqueCached.reduce((sum, entry) => sum + Math.max(0, Number(entry.fileSize || 0)), 0)
  // Keep server-backed attachments in the inventory even when this device has
  // not cached a rendition yet. The previous filter made real chat files
  // disappear from storage management until the user opened them locally.
  return {
    id: message.id,
    fileId: fileId || undefined,
    conversationId: conversation.id,
    conversationName: conversation.name,
    conversationType: conversation.type,
    senderId: message.fromUserId,
    senderName: message.fromNickname || '用户',
    createdAt: message.createdAt,
    kind,
    url,
    thumbUrl: payload.thumbUrl ? resolveFileUrl(payload.thumbUrl) : undefined,
    previewUrl: payload.previewUrl ? resolveFileUrl(payload.previewUrl) : undefined,
    originalUrl: payload.originalUrl ? resolveFileUrl(payload.originalUrl) : undefined,
    name: payload.name || defaultNames[kind],
    size: cachedBytes,
    originalSize: Math.max(0, Number(payload.originalSize || payload.size || 0)),
    cachedVariants: uniqueCached.map((entry) => entry.cacheType),
    contentType: payload.contentType || (kind === 'image' ? 'image/*' : kind === 'video' ? 'video/*' : kind === 'audio' ? 'audio/*' : 'application/octet-stream'),
    durationMs: payload.durationMs,
    message,
  }
}

function messageRecordBytes(message: ChatMessage): number {
  // Attachment bytes are deliberately excluded here; they are counted once in
  // chatFilesBytes. This is the metadata/index footprint of the local message row.
  const content = message.msgType === 1 || message.msgType === 2 || message.msgType === 3
    ? (parseFilePayload(message.content)?.name || '')
    : message.content || ''
  let bodyBytes = 0
  try {
    bodyBytes = new Blob([content]).size
  } catch {
    bodyBytes = content.length * 2
  }
  return 160 + bodyBytes + (message.replyToContent?.length || 0) * 2
}

async function loadConversationMessages(conversationId: string, myUserId: string): Promise<{ messages: ChatMessage[]; partial: boolean }> {
  const messages: ChatMessage[] = []
  const seen = new Set<string>()
  let before: string | undefined
  let partial = false

  while (messages.length < MAX_MESSAGES_PER_CONVERSATION) {
    const page = await fetchMessages(conversationId, myUserId, { before, limit: PAGE_SIZE })
    const unique = page.filter((message) => !seen.has(message.id))
    unique.forEach((message) => {
      seen.add(message.id)
      messages.push(message)
    })
    if (page.length < PAGE_SIZE || unique.length === 0) break
    const oldest = unique.find((message) => !!message.createdAt)
    if (!oldest?.createdAt) break
    before = oldest.createdAt
  }
  if (messages.length >= MAX_MESSAGES_PER_CONVERSATION) partial = true
  return { messages, partial }
}

export async function loadStorageInventory(force = false): Promise<StorageInventory> {
  const scope = currentUserScope()
  if (!force && inventoryCache.has(scope)) return inventoryCache.get(scope)!

  const myUserId = currentUserId()
  const [conversations, cacheEntries] = await Promise.all([
    fetchConversations('all'),
    listChatCacheIndex(),
  ])
  const stats: StorageConversationStat[] = []
  let cursor = 0
  const worker = async () => {
    while (cursor < conversations.length) {
      const conversation = conversations[cursor++]
      try {
        const loaded = await loadConversationMessages(conversation.id, myUserId)
        const messages = filterLocallyClearedMessages(conversation.id, loaded.messages)
        const assets = messages
          .map((message) => assetFromMessage(message, conversation, cacheEntries))
          .filter((asset): asset is StorageAsset => !!asset)
        const conversationCacheKeys = new Set<string>()
        assets.forEach((asset) => {
          if (!asset.fileId) return
          cacheEntries
            .filter((entry) => entry.fileId === asset.fileId)
            .forEach((entry) => conversationCacheKeys.add(`${entry.fileId}::${entry.variant}`))
        })
        const filesBytes = cacheEntries
          .filter((entry) => conversationCacheKeys.has(`${entry.fileId}::${entry.variant}`))
          .reduce((sum, entry) => sum + Math.max(0, Number(entry.fileSize || 0)), 0)
        stats.push({
          conversation,
          recordsBytes: messages.reduce((sum, message) => sum + messageRecordBytes(message), 0),
          filesBytes,
          assets,
          messageCount: messages.length,
          partial: loaded.partial,
        })
      } catch {
        // A single inaccessible conversation must not blank the storage page.
        stats.push({ conversation, recordsBytes: 0, filesBytes: 0, assets: [], messageCount: 0, partial: true })
      }
    }
  }
  await Promise.all([worker(), worker()])

  stats.sort((a, b) => b.recordsBytes - a.recordsBytes)
  const inventory: StorageInventory = {
    conversations: stats,
    assets: stats.flatMap((stat) => stat.assets).sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt)),
    chatRecordsBytes: stats.reduce((sum, stat) => sum + stat.recordsBytes, 0),
    // CacheStorage is the source of truth. A forwarded file can appear in
    // several messages, so summing asset rows would count the same local
    // bytes multiple times.
    chatFilesBytes: [...new Map(cacheEntries.map((entry) => [
      `${entry.fileId}::${entry.variant}`,
      entry,
    ])).values()].reduce((sum, entry) => sum + Math.max(0, Number(entry.fileSize || 0)), 0),
    loadedMessages: stats.reduce((sum, stat) => sum + stat.messageCount, 0),
    partial: stats.some((stat) => stat.partial),
  }
  inventoryCache.set(scope, inventory)
  return inventory
}

export async function loadConversationStorage(conversationId: string, force = false): Promise<StorageConversationStat> {
  const inventory = await loadStorageInventory(force)
  const hit = inventory.conversations.find((stat) => stat.conversation.id === conversationId)
  if (hit) return hit
  throw new Error('会话不存在')
}

export function invalidateStorageInventory(): void {
  inventoryCache.delete(currentUserScope())
  window.dispatchEvent(new CustomEvent('pulse:storage-changed'))
}

export function clearStorageInventoryCache(): void {
  inventoryCache.clear()
}

export async function readDeviceStorage(): Promise<DeviceStorageMetrics> {
  if (isAndroid) {
    try {
      const info = await nativeStorageInfo.getDeviceStorageInfo()
      return {
        totalBytes: Math.max(0, Number(info.totalBytes || 0)),
        availableBytes: Math.max(0, Number(info.availableBytes || 0)),
        appUsedBytes: Math.max(0, Number(info.appUsedBytes || 0)),
        source: 'android',
      }
    } catch {
      // The web fallback below keeps the screen usable on old Android WebViews.
    }
  }
  try {
    const estimate = await navigator.storage?.estimate()
    const quota = Number(estimate?.quota || 0)
    const usage = Number(estimate?.usage || 0)
    if (quota > 0) {
      return {
        totalBytes: quota,
        availableBytes: Math.max(0, quota - usage),
        appUsedBytes: Math.max(0, usage),
        source: 'browser',
      }
    }
  } catch {
    // Ignore unavailable StorageManager APIs.
  }
  return { totalBytes: 0, availableBytes: 0, appUsedBytes: 0, source: 'unavailable' }
}

export async function loadStorageOverview(force = false): Promise<StorageOverview> {
  const [device, cache, inventory] = await Promise.all([
    readDeviceStorage(),
    measureStorageUsage(),
    loadStorageInventory(force),
  ])
  const derived = cache.total + inventory.chatRecordsBytes
  const pulseUsedBytes = device.appUsedBytes > 0 ? device.appUsedBytes : derived
  const otherDataBytes = Math.max(0, pulseUsedBytes - cache.total - inventory.chatRecordsBytes)
  return { device, cache, inventory, pulseUsedBytes, otherDataBytes }
}

export function formatStorageSize(value: number): string {
  return value > 0 ? formatFileSize(value) || '0 B' : '0 B'
}

export function dateValue(value?: string): number {
  const time = value ? new Date(value).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

export function formatStorageDate(value?: string): string {
  const time = dateValue(value)
  if (!time) return '时间未知'
  return new Date(time).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
}

export function formatDuration(durationMs?: number): string {
  const seconds = Math.max(0, Math.round(Number(durationMs || 0) / 1000))
  if (!seconds) return ''
  const minutes = Math.floor(seconds / 60)
  return minutes ? `${minutes}:${String(seconds % 60).padStart(2, '0')}` : `0:${String(seconds).padStart(2, '0')}`
}

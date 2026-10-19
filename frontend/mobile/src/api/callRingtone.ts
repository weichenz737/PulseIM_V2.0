import http, { type ApiResult } from './http'
import { resolveFileUrl } from './file'

export interface CallRingtoneItem {
  id: number
  name: string
  url: string
  isDefault?: boolean
}

export interface MyRingtoneState {
  enabled: boolean
  configured: boolean
  id: number | null
  url: string
  name: string
  selectedId: number | null
  list: CallRingtoneItem[]
}

let cachedMine: MyRingtoneState | null = null
let inflightMine: Promise<MyRingtoneState> | null = null

function normalizeItem(raw: Partial<CallRingtoneItem>): CallRingtoneItem {
  return {
    id: Number(raw.id || 0),
    name: String(raw.name || ''),
    url: resolveFileUrl(raw.url || ''),
    isDefault: !!raw.isDefault,
  }
}

export async function fetchMyRingtone(force = false): Promise<MyRingtoneState> {
  if (!force && cachedMine) return cachedMine
  if (!force && inflightMine) return inflightMine
  inflightMine = http
    .get<ApiResult<MyRingtoneState>>('/v1/user/ringtone')
    .then(({ data }) => {
      const raw = data.data || ({} as MyRingtoneState)
      cachedMine = {
        enabled: raw.enabled !== false,
        configured: !!raw.configured,
        id: raw.id == null ? null : Number(raw.id),
        url: resolveFileUrl(raw.url || ''),
        name: raw.name || '',
        selectedId: raw.selectedId == null ? null : Number(raw.selectedId),
        list: Array.isArray(raw.list) ? raw.list.map(normalizeItem) : [],
      }
      return cachedMine
    })
    .catch(() => {
      cachedMine = {
        enabled: false,
        configured: false,
        id: null,
        url: '',
        name: '',
        selectedId: null,
        list: [],
      }
      return cachedMine
    })
    .finally(() => {
      inflightMine = null
    })
  return inflightMine
}

/** 兼容旧调用：当前用户生效铃声 */
export async function fetchCallRingtoneConfig(force = false) {
  const mine = await fetchMyRingtone(force)
  return {
    enabled: mine.enabled,
    configured: mine.configured,
    url: mine.url,
    name: mine.name,
  }
}

export async function setMyRingtone(ringtoneId: number | null) {
  const { data } = await http.put<ApiResult<MyRingtoneState>>('/v1/user/ringtone', {
    ringtoneId,
  })
  const raw = data.data || ({} as MyRingtoneState)
  cachedMine = {
    enabled: raw.enabled !== false,
    configured: !!raw.configured,
    id: raw.id == null ? null : Number(raw.id),
    url: resolveFileUrl(raw.url || ''),
    name: raw.name || '',
    selectedId: raw.selectedId == null ? null : Number(raw.selectedId),
    list: Array.isArray(raw.list) ? raw.list.map(normalizeItem) : [],
  }
  return cachedMine
}

export async function fetchPeerRingtone(userId: string | number) {
  const { data } = await http.get<
    ApiResult<{ enabled: boolean; configured: boolean; url: string; name: string; id?: number }>
  >(`/v1/users/${userId}/ringtone`)
  const raw = data.data || { enabled: false, configured: false, url: '', name: '' }
  return {
    enabled: raw.enabled !== false,
    configured: !!raw.configured,
    url: resolveFileUrl(raw.url || ''),
    name: raw.name || '',
    id: raw.id == null ? null : Number(raw.id),
  }
}

export function clearCallRingtoneCache() {
  cachedMine = null
}

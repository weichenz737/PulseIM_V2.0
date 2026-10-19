const ACCOUNTS_KEY = 'pulse_saved_accounts'

export interface SavedAccount {
  userId: string
  pulseId?: string
  nickname: string
  avatar: string
  phone?: string
  region?: string
  signature?: string
  deviceId?: string
  token: string
  /** 最近一次同步到本设备的底部消息未读数。 */
  unreadCount?: number
  /** 最近一次同步到本设备的全局角标总数。 */
  badgeCount?: number
}

function normalizeAccount(value: unknown): SavedAccount | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<SavedAccount>
  const userId = String(raw.userId || '').trim()
  const token = String(raw.token || '').trim()
  if (!userId || !token) return null
  const unreadRaw = Number(raw.unreadCount)
  const unreadCount = Number.isFinite(unreadRaw)
    ? Math.max(0, Math.floor(unreadRaw))
    : undefined
  const badgeRaw = Number(raw.badgeCount)
  const badgeCount = Number.isFinite(badgeRaw)
    ? Math.max(0, Math.floor(badgeRaw))
    : undefined
  return {
    userId,
    pulseId: raw.pulseId ? String(raw.pulseId) : undefined,
    nickname: String(raw.nickname || ''),
    avatar: String(raw.avatar || ''),
    phone: raw.phone ? String(raw.phone) : undefined,
    region: raw.region ? String(raw.region) : undefined,
    signature: raw.signature ? String(raw.signature) : undefined,
    deviceId: raw.deviceId ? String(raw.deviceId) : undefined,
    token,
    unreadCount,
    badgeCount,
  }
}

export function listSavedAccounts(): SavedAccount[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    const seen = new Set<string>()
    return parsed
      .map(normalizeAccount)
      .filter((account): account is SavedAccount => {
        if (!account || seen.has(account.userId)) return false
        seen.add(account.userId)
        return true
      })
  } catch {
    return []
  }
}

function writeSavedAccounts(accounts: SavedAccount[]) {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
  } catch {
    // Account switching should continue to work even when storage is full or unavailable.
  }
}

function notifySavedAccountUpdated(userId: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('pulse:saved-account-updated', {
    detail: { userId },
  }))
}

export function upsertSavedAccount(account: SavedAccount): void {
  const next = normalizeAccount(account)
  if (!next) return
  const accounts = listSavedAccounts()
  const index = accounts.findIndex((item) => item.userId === next.userId)
  if (index >= 0) {
    accounts.splice(index, 1, {
      ...accounts[index],
      ...next,
      // 新增账号流程会暂时清除全局设备 ID；不要因此丢掉原账号的设备会话信息。
      deviceId: next.deviceId || accounts[index].deviceId,
      // 账号资料刷新时未必携带未读数，避免覆盖该账号最近一次的角标。
      unreadCount: next.unreadCount ?? accounts[index].unreadCount,
      badgeCount: next.badgeCount ?? accounts[index].badgeCount,
    })
  } else {
    accounts.unshift(next)
  }
  writeSavedAccounts(accounts)
}

export function updateSavedAccountUnreadCount(userId: string, unreadCount: number): void {
  const cleanUserId = String(userId || '').trim()
  if (!cleanUserId) return
  const accounts = listSavedAccounts()
  const index = accounts.findIndex((item) => item.userId === cleanUserId)
  if (index < 0) return
  accounts[index] = {
    ...accounts[index],
    unreadCount: Math.max(0, Math.floor(Number(unreadCount) || 0)),
  }
  writeSavedAccounts(accounts)
  notifySavedAccountUpdated(cleanUserId)
}

export function updateSavedAccountBadgeCount(userId: string, badgeCount: number): void {
  const cleanUserId = String(userId || '').trim()
  if (!cleanUserId) return
  const accounts = listSavedAccounts()
  const index = accounts.findIndex((item) => item.userId === cleanUserId)
  if (index < 0) return
  accounts[index] = {
    ...accounts[index],
    badgeCount: Math.max(0, Math.floor(Number(badgeCount) || 0)),
  }
  writeSavedAccounts(accounts)
  notifySavedAccountUpdated(cleanUserId)
}

export function updateSavedAccountToken(userId: string, token: string): void {
  const cleanUserId = String(userId || '').trim()
  const cleanToken = String(token || '').trim()
  if (!cleanUserId || !cleanToken) return
  const accounts = listSavedAccounts()
  const index = accounts.findIndex((item) => item.userId === cleanUserId)
  if (index < 0) return
  accounts[index] = { ...accounts[index], token: cleanToken }
  writeSavedAccounts(accounts)
}

export function removeSavedAccount(userId: string): void {
  const cleanUserId = String(userId || '').trim()
  if (!cleanUserId) return
  writeSavedAccounts(listSavedAccounts().filter((account) => account.userId !== cleanUserId))
}

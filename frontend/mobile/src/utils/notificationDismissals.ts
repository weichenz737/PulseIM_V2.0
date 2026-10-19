type DismissalBucket = Record<string, number>
type DismissalState = Record<string, DismissalBucket>

const STORAGE_PREFIX = 'pulse_notification_dismissals:'
const PROFILE_KEY = 'pulse_user_profile'

function currentUserId(): string {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return 'anonymous'
    const profile = JSON.parse(raw) as { userId?: string | number }
    return profile.userId != null && String(profile.userId).trim() ? String(profile.userId) : 'anonymous'
  } catch {
    return 'anonymous'
  }
}

function storageKey(): string {
  return `${STORAGE_PREFIX}${currentUserId()}`
}

function readDismissals(): DismissalState {
  try {
    const raw = localStorage.getItem(storageKey())
    if (!raw) return {}
    const parsed = JSON.parse(raw) as DismissalState
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeDismissals(state: DismissalState): void {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(state))
  } catch {
    // Storage may be unavailable in privacy mode.
  }
}

/**
 * Notifications are account-local dismissals. If the server reuses an item ID
 * for a newly created request, a later createdAt makes that request visible again.
 */
export function isMobileNotificationDismissed(
  type: string,
  id: string,
  createdAt?: string,
): boolean {
  const dismissedAt = readDismissals()[type]?.[String(id)]
  if (!dismissedAt) return false
  const createdTime = createdAt ? Date.parse(createdAt) : Number.NaN
  return !Number.isFinite(createdTime) || createdTime <= dismissedAt
}

export function dismissMobileNotification(type: string, id: string): void {
  const state = readDismissals()
  const bucket = state[type] || {}
  bucket[String(id)] = Date.now()
  state[type] = bucket
  writeDismissals(state)
}

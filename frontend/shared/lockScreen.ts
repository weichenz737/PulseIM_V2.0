export interface LockScreenConfig {
  passwordHash: string
  hint: string
  updatedAt?: number
}

const LOCK_SCREEN_STORAGE_PREFIX = 'pulse_lock_screen:'
const LOCK_STATE_STORAGE_PREFIX = 'pulse_lock_screen_state:'

function storageKey(userId: string): string {
  return `${LOCK_SCREEN_STORAGE_PREFIX}${String(userId || '').trim()}`
}

function lockStateKey(userId: string): string {
  return `${LOCK_STATE_STORAGE_PREFIX}${String(userId || '').trim()}`
}

export function readLockScreenLocked(userId: string): boolean {
  const id = String(userId || '').trim()
  if (!id) return false
  try {
    return localStorage.getItem(lockStateKey(id)) === 'true'
  } catch {
    return false
  }
}

export function writeLockScreenLocked(userId: string, locked: boolean): void {
  const id = String(userId || '').trim()
  if (!id) return
  try {
    if (locked) localStorage.setItem(lockStateKey(id), 'true')
    else localStorage.removeItem(lockStateKey(id))
  } catch {
    // Storage is best effort; the in-memory lock still protects this page.
  }
}

export function readLockScreenConfig(userId: string): LockScreenConfig | null {
  const id = String(userId || '').trim()
  if (!id) return null
  try {
    const raw = localStorage.getItem(storageKey(id))
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<LockScreenConfig>
    const passwordHash = String(value.passwordHash || '').trim()
    if (!passwordHash) return null
    return {
      passwordHash,
      hint: String(value.hint || '').trim(),
      updatedAt: Number(value.updatedAt || 0) || undefined,
    }
  } catch {
    return null
  }
}

function fallbackHash(value: string): string {
  let hash = 2166136261
  for (const char of value) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return `fallback:${(hash >>> 0).toString(16)}`
}

export async function hashLockScreenPassword(password: string): Promise<string> {
  const value = String(password || '')
  if (globalThis.crypto?.subtle && typeof TextEncoder !== 'undefined') {
    const bytes = new TextEncoder().encode(value)
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
    return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
  }
  return fallbackHash(value)
}

export async function verifyLockScreenPassword(
  password: string,
  config: LockScreenConfig | null,
): Promise<boolean> {
  if (!config?.passwordHash) return false
  return (await hashLockScreenPassword(password)) === config.passwordHash
}

export async function saveLockScreenConfig(
  userId: string,
  password: string,
  hint: string,
): Promise<LockScreenConfig> {
  const id = String(userId || '').trim()
  if (!id) throw new Error('当前账号信息不可用')
  const config: LockScreenConfig = {
    passwordHash: await hashLockScreenPassword(password),
    hint: String(hint || '').trim().slice(0, 120),
    updatedAt: Date.now(),
  }
  localStorage.setItem(storageKey(id), JSON.stringify(config))
  return config
}

export function clearLockScreenConfig(userId: string): void {
  const id = String(userId || '').trim()
  if (!id) return
  try {
    localStorage.removeItem(storageKey(id))
  } catch {
    // Storage is best effort.
  }
}

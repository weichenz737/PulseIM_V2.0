import { SERVER_ORIGIN } from '@/config/endpoints'

type ListKind = 'contacts' | 'conversations'
function key(kind: ListKind, userId: string): string {
  return `pulse_list_snapshot_v1:${encodeURIComponent(SERVER_ORIGIN || window.location.origin)}:${encodeURIComponent(userId)}:${kind}`
}
export function readListSnapshot<T>(kind: ListKind, userId: string): T[] | null {
  if (!userId) return null
  try {
    const parsed = JSON.parse(localStorage.getItem(key(kind, userId)) || 'null')
    const identity = kind === 'contacts' ? 'userId' : 'id'
    if (!parsed || !Array.isArray(parsed.items)
      || !parsed.items.every((item: unknown) => item && typeof item === 'object'
        && typeof (item as Record<string, unknown>)[identity] === 'string')) return null
    return parsed.items.map((item: T) => ({ ...item, online: false }))
  } catch { return null }
}
export function writeListSnapshot<T>(kind: ListKind, userId: string, items: T[]): void {
  if (!userId) return
  try { localStorage.setItem(key(kind, userId), JSON.stringify({ at: Date.now(), items })) }
  catch { /* Local storage failure must not break the live list. */ }
}

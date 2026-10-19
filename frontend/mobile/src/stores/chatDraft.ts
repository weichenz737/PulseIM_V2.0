import { ref } from 'vue'

/**
 * Chat drafts intentionally live only in memory.
 *
 * This keeps a draft while the user navigates between screens during the
 * current app session, but it is discarded when the WebView/JavaScript
 * runtime is restarted. Drafts are scoped by account as well as conversation
 * so switching accounts can never expose another account's text.
 */
const drafts = new Map<string, string>()

/** Changes whenever a draft is added, updated, or removed. */
export const chatDraftRevision = ref(0)

function draftKey(conversationId: string, userId?: string): string {
  return `${String(userId || 'anonymous')}:${String(conversationId || '')}`
}

export function getChatDraft(conversationId: string, userId?: string): string {
  if (!conversationId) return ''
  return drafts.get(draftKey(conversationId, userId)) || ''
}

export function setChatDraft(conversationId: string, userId: string | undefined, text: string): void {
  if (!conversationId) return
  const key = draftKey(conversationId, userId)
  const next = String(text || '')
  const previous = drafts.get(key) || ''
  if (previous === next) return

  if (next) drafts.set(key, next)
  else drafts.delete(key)
  chatDraftRevision.value += 1
}

/** Clear volatile drafts when the active account/session is reset. */
export function clearChatDrafts(): void {
  if (!drafts.size) return
  drafts.clear()
  chatDraftRevision.value += 1
}

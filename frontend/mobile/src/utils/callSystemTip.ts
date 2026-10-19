/** 通话结束系统 tip：先本地插入，再异步落库，避免聊天页等 HTTP/WS 才出现 */

export interface LocalCallSystemTip {
  conversationId: string
  clientMsgId: string
  /** msgType=9 的 JSON 内容 */
  content: string
  /** 会话列表预览文案 */
  preview: string
}

export function publishLocalCallSystemTip(tip: LocalCallSystemTip) {
  const conversationId = String(tip.conversationId || '')
  const clientMsgId = String(tip.clientMsgId || '')
  if (!conversationId || !clientMsgId || !tip.content) return
  try {
    window.dispatchEvent(
      new CustomEvent<LocalCallSystemTip>('pulse:call-system-tip', {
        detail: {
          conversationId,
          clientMsgId,
          content: tip.content,
          preview: tip.preview || '',
        },
      }),
    )
  } catch {
    /* ignore */
  }
}

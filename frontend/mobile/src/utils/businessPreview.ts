export function formatBusinessPreview(content?: string): string {
  const raw = String(content || '').trim()
  if (!raw) return raw
  if (raw.includes('__PULSE_LIVE_LOCATION__')) {
    return '[实时位置共享]'
  }
  const jsonStart = raw.indexOf('{')
  const arrayStart = /^\[\s*(?:\{|\[|"|-?\d|true|false|null)/.test(raw) ? 0 : -1
  const structuredStart =
    jsonStart < 0 ? arrayStart : arrayStart < 0 ? jsonStart : Math.min(jsonStart, arrayStart)
  if (structuredStart < 0) return raw
  const prefix = raw.slice(0, structuredStart)
  try {
    const parsed = JSON.parse(raw.slice(structuredStart)) as unknown
    if (Array.isArray(parsed)) return `${prefix}[聊天记录]`
    if (!parsed || typeof parsed !== 'object') return raw
    const data = parsed as Record<string, unknown>
    const kind = String(data.kind || data.type || '').trim().toLowerCase()
    const amount = Number(data.refundAmount ?? data.amount ?? 0)
    const amountText = Number.isFinite(amount) && amount > 0
      ? ` ¥${(amount / 100).toFixed(2)}`
      : ''
    if (kind === 'red_packet_expired') {
      return `${prefix}[红包] 已过期，未领取金额${amountText} 已退回`
    }
    if (kind === 'transfer_expired') {
      return `${prefix}[转账] 已过期，金额${amountText} 已退回`
    }
    if (kind === 'red_packet_received') {
      return `${prefix}[红包] 已领取`
    }
    if (kind === 'transfer_received') {
      return `${prefix}[转账] 已收款`
    }
    if (kind === 'group_member_join' || kind === 'group_member_kick') {
      return `${prefix}${String(data.text || '群成员发生变更')}`
    }
    if (kind && data.text) {
      return `${prefix}${String(data.text)}`
    }
    const contentType = String(data.contentType || data.mimeType || '').toLowerCase()
    if (data.url || data.originalUrl) {
      const name = String(data.name || '').trim()
      if (contentType.startsWith('image/')) return `${prefix}[图片]`
      if (contentType.startsWith('video/')) return `${prefix}[视频]`
      if (contentType.startsWith('audio/')) return `${prefix}[语音]`
      return `${prefix}[文件]${name ? ` ${name}` : ''}`
    }
    if (Array.isArray(data.items)) {
      const title = String(data.title || '').trim()
      return `${prefix}[聊天记录]${title ? ` ${title}` : ''}`
    }
    if (!data.businessNo) {
      const readable = [data.text, data.title, data.message, data.label]
        .find((value) => typeof value === 'string' && value.trim())
      return readable ? `${prefix}${String(readable).trim()}` : `${prefix}[系统消息]`
    }
    if (data.packetType) {
      return `${prefix}[红包] ${String(data.greeting || '恭喜发财，大吉大利')}`
    }
    if (data.receiverId != null && data.amount != null) {
      const amount = (Number(data.amount) / 100).toFixed(2)
      return `${prefix}[转账] ¥${amount}`
    }
  } catch {
    return `${prefix}[系统消息]`
  }
  return raw
}

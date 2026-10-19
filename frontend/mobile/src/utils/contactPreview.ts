import { parseContactCard, parseLocationPayload } from '@/api/message'

/** 会话列表：名片 JSON →「[名片] 昵称」；非名片返回 null */
export function formatContactCardPreview(content?: string | null): string | null {
  const raw = String(content || '').trim()
  if (!raw) return null
  const jsonStart = raw.indexOf('{')
  if (jsonStart < 0) return null
  const prefix = raw.slice(0, jsonStart)
  const card = parseContactCard(raw.slice(jsonStart))
  if (!card) return null
  const label =
    card.cardType === 'community'
      ? card.nickname
        ? `[圈子] ${card.nickname}`
        : '[圈子]'
      : card.cardType === 'group'
      ? card.nickname
        ? `[群名片] ${card.nickname}`
        : '[群名片]'
      : card.nickname
        ? `[名片] ${card.nickname}`
        : '[名片]'
  return `${prefix}${label}`
}

/** 会话列表：位置 JSON →「[位置] 名称」；非位置返回 null */
export function formatLocationPreview(content?: string | null): string | null {
  const raw = String(content || '').trim()
  if (!raw) return null
  const jsonStart = raw.indexOf('{')
  if (jsonStart < 0) return null
  const prefix = raw.slice(0, jsonStart)
  const location = parseLocationPayload(raw.slice(jsonStart))
  if (!location) return null
  const name = location.name || location.address || '位置信息'
  return `${prefix}[位置] ${name}`
}

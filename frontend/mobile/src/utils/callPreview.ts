type JsonObject = Record<string, unknown>

function parseNested(value: unknown, depth = 0): unknown {
  if (depth > 3 || typeof value !== 'string') return value
  const text = value.trim()
  if (!text || (!text.startsWith('{') && !text.startsWith('[') && !text.startsWith('"'))) {
    return value
  }
  try {
    return parseNested(JSON.parse(text), depth + 1)
  } catch {
    return value
  }
}

function findCallPayload(value: unknown, depth = 0): JsonObject | null {
  if (depth > 4) return null
  const parsed = parseNested(value)
  if (!parsed || typeof parsed !== 'object') return null
  if (Array.isArray(parsed)) {
    for (const child of parsed) {
      const found = findCallPayload(child, depth + 1)
      if (found) return found
    }
    return null
  }
  const object = parsed as JsonObject
  const kind = String(object.kind || object.type || object.event || '').toLowerCase()
  const media = String(object.mediaType || object.media_type || object.callType || '').toLowerCase()
  if (
    kind.includes('call') ||
    ['audio', 'video', 'voice'].includes(media) ||
    object.callId ||
    object.call_id
  ) {
    return object
  }
  for (const key of ['content', 'payload', 'data', 'message', 'body']) {
    const found = findCallPayload(object[key], depth + 1)
    if (found) return found
  }
  return null
}

export function formatCallPreview(content?: string | null): string | null {
  const raw = String(content || '').trim()
  if (!raw) return null

  const jsonStart = raw.search(/[{["]/)
  const candidate = jsonStart >= 0 ? raw.slice(jsonStart) : raw
  try {
    const structured = parseNested(candidate) as JsonObject
    if (structured?.kind === 'group_member_join' || structured?.kind === 'group_member_kick') {
      return String(structured.text || '群成员发生变更')
    }
  } catch {
    /* continue with call preview detection */
  }
  const payload = findCallPayload(candidate)
  const lowerRaw = raw.toLowerCase()
  const looksLikeCallText =
    /video_call|voice_call|audio_call|callrec_|"call_?id"|通话/.test(lowerRaw)
  if (!payload && !looksLikeCallText) return null

  const kind = String(payload?.kind || payload?.type || payload?.event || '').toLowerCase()
  const media = String(
    payload?.mediaType || payload?.media_type || payload?.callType || '',
  ).toLowerCase()
  const isVideo =
    kind.includes('video') ||
    media === 'video' ||
    /video_call|"media_?type"\s*:\s*"video"/.test(lowerRaw)
  const payloadText = payload?.text || payload?.resultText || payload?.result_text
  const text = String(payloadText || '通话已结束').trim() || '通话已结束'
  const selfPrefix = jsonStart > 0 ? raw.slice(0, jsonStart).trim() : ''
  return `${selfPrefix ? `${selfPrefix} ` : ''}${isVideo ? '[视频通话]' : '[语音通话]'} ${text}`
}

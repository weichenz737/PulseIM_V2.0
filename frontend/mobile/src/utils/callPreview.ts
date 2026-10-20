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
  const hasCallId = Boolean(object.callId || object.call_id)
  const isCallRecord = ['voice_call', 'audio_call', 'video_call'].includes(kind)
    || (hasCallId && ['audio', 'video', 'voice'].includes(media)
      && (object.reason != null || object.connected != null || object.durationSec != null))
  if (isCallRecord) {
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

  const jsonStart = raw.indexOf('{')
  const candidate = jsonStart >= 0 ? raw.slice(jsonStart) : raw
  const payload = findCallPayload(candidate)
  if (!payload) return null

  const kind = String(payload?.kind || payload?.type || payload?.event || '').toLowerCase()
  const media = String(
    payload?.mediaType || payload?.media_type || payload?.callType || '',
  ).toLowerCase()
  const isVideo =
    kind === 'video_call' ||
    media === 'video'
  const payloadText = payload?.text || payload?.resultText || payload?.result_text
  const text = String(payloadText || '通话已结束').trim() || '通话已结束'
  const selfPrefix = jsonStart > 0 ? raw.slice(0, jsonStart).trim() : ''
  return `${selfPrefix ? `${selfPrefix} ` : ''}${isVideo ? '[视频通话]' : '[语音通话]'} ${text}`
}

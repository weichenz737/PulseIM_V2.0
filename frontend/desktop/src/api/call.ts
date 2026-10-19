import { getDesktopToken, requestDesktopApi } from '../desktopApi'

export interface IceServerConfig {
  urls: string | string[]
  username?: string
  credential?: string
}

let iceCache: { at: number; servers: RTCIceServer[] } | null = null
const ICE_TTL_MS = 10 * 60 * 1000

export async function fetchIceServers(): Promise<RTCIceServer[]> {
  if (iceCache && Date.now() - iceCache.at < ICE_TTL_MS && iceCache.servers.length) {
    return iceCache.servers
  }
  const list = await requestDesktopApi<IceServerConfig[]>('/v1/calls/ice-servers')
  const servers = list.map((item) => ({
    urls: item.urls,
    ...(item.username ? { username: item.username } : {}),
    ...(item.credential ? { credential: item.credential } : {}),
  }))
  if (servers.length) iceCache = { at: Date.now(), servers }
  return servers
}

export async function reportGroupCallLog(payload: {
  callId: string
  conversationId: string
  mediaType: 'audio' | 'video'
  event: 'start' | 'update' | 'end'
  participantCount: number
  durationSec?: number
}): Promise<void> {
  await requestDesktopApi('/v1/calls/group-log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(getDesktopToken() ? { Authorization: `Bearer ${getDesktopToken()}` } : {}),
      },
      credentials: 'include',
      body: JSON.stringify(payload),
  })
}

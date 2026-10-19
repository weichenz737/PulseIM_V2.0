import http, { type ApiResult } from './http'

export interface IceServerConfig {
  urls: string | string[]
  username?: string
  credential?: string
}

let iceCache: { at: number; servers: RTCIceServer[] } | null = null
const ICE_TTL_MS = 10 * 60 * 1000

function mapIceServers(list: IceServerConfig[]): RTCIceServer[] {
  return list.map((s) => {
    const server: RTCIceServer = { urls: s.urls }
    if (s.username) server.username = s.username
    if (s.credential) server.credential = s.credential
    return server
  })
}

export async function fetchIceServers(): Promise<RTCIceServer[]> {
  if (iceCache && Date.now() - iceCache.at < ICE_TTL_MS && iceCache.servers.length) {
    return iceCache.servers
  }
  const { data } = await http.get<ApiResult<IceServerConfig[]>>('/v1/calls/ice-servers')
  const servers = mapIceServers(data.data || [])
  if (servers.length) {
    iceCache = { at: Date.now(), servers }
  }
  return servers
}

/** 登录后预取，避免首通等 ICE HTTP */
export function prefetchIceServers() {
  void fetchIceServers().catch(() => {})
}

export async function reportGroupCallLog(payload: {
  callId: string
  conversationId: string
  mediaType: 'audio' | 'video'
  event: 'start' | 'update' | 'end'
  participantCount: number
  durationSec?: number
}): Promise<void> {
  await http.post('/v1/calls/group-log', payload)
}

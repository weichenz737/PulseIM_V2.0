import {
  ensureDesktopWsReady,
  isDesktopWsReady,
  onDesktopWsMessage,
  sendDesktopWsMessage,
} from '../desktopWs'

export type CallMediaType = 'audio' | 'video'

export type CallSignalCmd =
  | 'CALL_INVITE' | 'CALL_RINGING' | 'CALL_ACCEPT' | 'CALL_REJECT' | 'CALL_BUSY'
  | 'CALL_OFFER' | 'CALL_ANSWER' | 'CALL_ICE' | 'CALL_HANGUP' | 'CALL_UNAVAILABLE'
  | 'CALL_ERROR' | 'CALL_GROUP_INVITE' | 'CALL_GROUP_RINGING' | 'CALL_GROUP_JOIN'
  | 'CALL_GROUP_MEMBER_JOINED' | 'CALL_GROUP_OFFER' | 'CALL_GROUP_ANSWER'
  | 'CALL_GROUP_ICE' | 'CALL_GROUP_LEAVE' | 'CALL_GROUP_END'

export interface CallSignalPayload {
  cmd: CallSignalCmd
  callId: string
  toUserId: string
  fromUserId?: string
  fromNickname?: string
  fromAvatarUrl?: string
  conversationId?: string
  mediaType?: CallMediaType
  sdp?: string
  candidate?: RTCIceCandidateInit
  reason?: string
  message?: string
  groupTitle?: string
  members?: Array<{ userId: string; nickname: string; avatarUrl?: string }>
  allMembers?: Array<{ userId: string; nickname: string; avatarUrl?: string }>
  member?: { userId: string; nickname: string; avatarUrl?: string }
  pendingMembers?: Array<{ userId: string; nickname: string; avatarUrl?: string }>
  shouldOffer?: boolean
  durationSec?: number
  participantCount?: number
  wasHost?: boolean
  newHostId?: string
}

export function sendCallSignal(payload: CallSignalPayload): boolean {
  return sendDesktopWsMessage(payload)
}

export const isCallSignalCmd = (cmd: string): boolean => cmd.startsWith('CALL_')

export function onWsMessage(handler: (data: unknown) => void): () => void {
  return onDesktopWsMessage(handler)
}

export function isWsAuthed(): boolean {
  return isDesktopWsReady()
}

export function ensureWsReady(token: string, timeoutMs = 8000): Promise<boolean> {
  return ensureDesktopWsReady(token, timeoutMs)
}

export function ensureSignalAfterMedia(token: string, timeoutMs = 8000): Promise<boolean> {
  return ensureDesktopWsReady(token, timeoutMs)
}


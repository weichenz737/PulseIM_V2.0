import { fetchIceServers, reportGroupCallLog } from './api/call'
import { sendDesktopTextMessage, getDesktopToken, resolveDesktopAvatarUrl } from './desktopApi'
import { ensureWsReady, isCallSignalCmd, onWsMessage, sendCallSignal } from './im/ws'
import {
  newCallId,
  VoiceCallSession,
  type CallMediaType,
  type VoicePeerInfo,
} from '../../mobile/src/im/voiceCallSession'

export interface DesktopCallPeer {
  userId: string
  nickname: string
  avatarUrl?: string
  conversationId?: string
}

export interface DesktopGroupMember extends DesktopCallPeer {
  userId: string
}

export interface DesktopCallParticipant extends DesktopGroupMember {
  state: 'invited' | 'ringing' | 'connecting' | 'connected' | 'declined'
  stream?: MediaStream
}

export interface DesktopCallSnapshot {
  mode: 'idle' | 'private' | 'group'
  uiState: 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'connected'
  callId: string
  mediaType: CallMediaType
  peer: DesktopCallPeer | null
  inviter: DesktopCallPeer | null
  conversationId: string
  groupTitle: string
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  participants: DesktopCallParticipant[]
  muted: boolean
  cameraOn: boolean
  elapsedSec: number
  isHost: boolean
}

type ChangeHandler = (snapshot: DesktopCallSnapshot) => void
type NoticeHandler = (message: string) => void
type SignalPayload = Record<string, unknown> & {
  cmd?: string
  callId?: string
  fromUserId?: string
  toUserId?: string
}

const RING_TIMEOUT_MS = 45_000
const CONNECT_TIMEOUT_MS = 30_000
const GROUP_COMMANDS = new Set([
  'CALL_GROUP_INVITE', 'CALL_GROUP_RINGING', 'CALL_GROUP_JOIN', 'CALL_GROUP_MEMBER_JOINED',
  'CALL_GROUP_OFFER', 'CALL_GROUP_ANSWER', 'CALL_GROUP_ICE', 'CALL_GROUP_LEAVE', 'CALL_GROUP_END',
])

function uid(value: unknown): string {
  return String(value ?? '').trim()
}

function mediaTypeOf(value: unknown): CallMediaType {
  return String(value || '').toLowerCase() === 'video' ? 'video' : 'audio'
}

function normalizeCallSignal(data: unknown): SignalPayload | null {
  if (!data || typeof data !== 'object') return null
  const root = data as Record<string, unknown>
  const rootCommand = String(root.cmd || root.type || root.event || '').toUpperCase()
  if (rootCommand.startsWith('CALL_')) return { ...root, cmd: rootCommand } as SignalPayload

  const nestedValue = root.signal ?? root.payload ?? root.data
  let nested: Record<string, unknown> | null = null
  if (nestedValue && typeof nestedValue === 'object') {
    nested = nestedValue as Record<string, unknown>
  } else if (typeof nestedValue === 'string') {
    try {
      const parsed = JSON.parse(nestedValue)
      if (parsed && typeof parsed === 'object') nested = parsed as Record<string, unknown>
    } catch {
      return null
    }
  }
  if (!nested) return null
  const merged = { ...root, ...nested }
  const command = String(merged.cmd || merged.type || merged.event || '').toUpperCase()
  return command.startsWith('CALL_') ? { ...merged, cmd: command } as SignalPayload : null
}

function durationText(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function callText(reason: string, connected: boolean, duration: number, group = false): string {
  if (connected) return `${group ? '群通话' : '通话'}时长 ${durationText(duration)}`
  if (reason === 'rejected') return '通话已拒绝'
  if (reason === 'timeout') return '未接听'
  if (reason === 'busy') return '对方忙线中'
  if (reason === 'unavailable') return '对方不在线'
  if (reason === 'error') return '通话中断'
  return group ? '群通话已结束' : '通话已取消'
}

function selfMember(userId: string, nickname: string, avatarUrl: string): DesktopGroupMember {
  return { userId, nickname: nickname || '用户', avatarUrl: avatarUrl || '' }
}

export class DesktopCallManager {
  private snapshot: DesktopCallSnapshot = {
    mode: 'idle',
    uiState: 'idle',
    callId: '',
    mediaType: 'audio',
    peer: null,
    inviter: null,
    conversationId: '',
    groupTitle: '',
    localStream: null,
    remoteStream: null,
    participants: [],
    muted: false,
    cameraOn: true,
    elapsedSec: 0,
    isHost: false,
  }

  private listeners = new Set<ChangeHandler>()
  private notices = new Set<NoticeHandler>()
  private stopWs: (() => void) | null = null
  private privateSession: VoiceCallSession | null = null
  private privateRole: 'caller' | 'callee' | null = null
  private pendingOfferSdp = ''
  private offerSent = false
  private answerReceived = false
  private groupPcs = new Map<string, RTCPeerConnection>()
  private groupPendingIce = new Map<string, RTCIceCandidateInit[]>()
  private groupDisconnectTimers = new Map<string, number>()
  private inviteRetryTimer: number | null = null
  private joinRetryTimer: number | null = null
  private ringTimer: number | null = null
  private connectTimer: number | null = null
  private elapsedTimer: number | null = null
  private groupMaxParticipants = 1
  private groupAvailableMembers: DesktopGroupMember[] = []
  private groupRecentSignals = new Map<string, number>()
  private started = false
  private recordedCallIds = new Set<string>()

  onChange(handler: ChangeHandler): () => void {
    this.listeners.add(handler)
    handler(this.snapshot)
    return () => this.listeners.delete(handler)
  }

  onNotice(handler: NoticeHandler): () => void {
    this.notices.add(handler)
    return () => this.notices.delete(handler)
  }

  get current(): DesktopCallSnapshot {
    return this.snapshot
  }

  startBridge(): void {
    if (this.started) return
    this.started = true
    this.stopWs = onWsMessage((data) => {
      const signal = normalizeCallSignal(data)
      if (signal && isCallSignalCmd(String(signal.cmd || ''))) void this.handleSignal(signal)
    })
  }

  stopBridge(): void {
    this.stopWs?.()
    this.stopWs = null
    this.started = false
    this.reset()
  }

  async startPrivate(peer: DesktopCallPeer, media: CallMediaType): Promise<void> {
    if (this.snapshot.uiState !== 'idle') return this.notify('当前正在通话中')
    const me = uid(this.userId())
    if (!peer.userId || peer.userId === me) return this.notify('无法呼叫当前用户')
    if (!(await ensureWsReady(getDesktopToken() || '', 8_000))) return this.notify('通话信令未连接，请稍后重试')

    const callId = newCallId()
    this.clearAllTimers()
    this.snapshot = {
      ...this.snapshot,
      mode: 'private',
      uiState: 'outgoing',
      callId,
      mediaType: media,
      peer,
      inviter: null,
      conversationId: peer.conversationId || '',
      groupTitle: '',
      localStream: null,
      remoteStream: null,
      participants: [],
      muted: false,
      cameraOn: true,
      elapsedSec: 0,
      isHost: false,
    }
    this.offerSent = false
    this.answerReceived = false
    this.privateSession = this.createPrivateSession('caller', peer, callId, media)
    this.privateRole = 'caller'
    this.notifyChange()
    this.sendPrivateInvite()
    this.startRingTimer()

    try {
      await this.privateSession.prepareMediaAndPc()
      if (!this.isCurrent(callId) || !this.privateSession) return
      this.snapshot.uiState = 'outgoing'
      this.notifyChange()
    } catch {
      this.notify('无法使用麦克风或摄像头，请检查桌面端权限')
      this.hangupPrivate('mic_denied', true)
    }
  }

  async startGroup(opts: {
    conversationId: string
    groupTitle: string
    mediaType: CallMediaType
    members: DesktopGroupMember[]
  }): Promise<void> {
    if (this.snapshot.uiState !== 'idle') return this.notify('当前正在通话中')
    if (!(await ensureWsReady(getDesktopToken() || '', 8_000))) return this.notify('通话信令未连接，请稍后重试')
    const me = uid(this.userId())
    const allMembers = opts.members.map((member) => ({ ...member, userId: uid(member.userId) })).filter((member) => member.userId && member.userId !== me)
    if (!allMembers.length) return this.notify('群聊中没有可呼叫的其他成员')

    this.clearAllTimers()
    this.groupAvailableMembers = allMembers
    this.groupMaxParticipants = 1
    this.snapshot = {
      ...this.snapshot,
      mode: 'group',
      uiState: 'connecting',
      callId: `gc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      mediaType: opts.mediaType,
      peer: null,
      inviter: null,
      conversationId: opts.conversationId,
      groupTitle: opts.groupTitle,
      localStream: null,
      remoteStream: null,
      participants: allMembers.map((member) => ({ ...member, state: 'invited' as const })),
      muted: false,
      cameraOn: true,
      elapsedSec: 0,
      isHost: true,
    }
    this.notifyChange()
    try {
      this.snapshot.localStream = await this.acquireMedia(opts.mediaType)
      this.snapshot.cameraOn = opts.mediaType === 'video'
      this.notifyChange()
    } catch {
      this.notify('无法使用麦克风或摄像头，请检查桌面端权限')
      this.reset()
      return
    }
    this.inviteGroupMembers(allMembers)
    void reportGroupCallLog({
      callId: this.snapshot.callId,
      conversationId: opts.conversationId,
      mediaType: opts.mediaType,
      event: 'start',
      participantCount: 1,
    }).catch(() => {})
  }

  accept(): void {
    if (this.snapshot.mode === 'private') void this.acceptPrivate()
    else if (this.snapshot.mode === 'group') void this.acceptGroup()
  }

  reject(): void {
    if (this.snapshot.mode === 'private') {
      const peer = this.snapshot.peer
      if (peer) this.sendPrivate({ cmd: 'CALL_REJECT', callId: this.snapshot.callId, toUserId: peer.userId, mediaType: this.snapshot.mediaType })
      this.hangupPrivate('rejected', false)
    } else if (this.snapshot.mode === 'group') {
      const inviter = this.snapshot.inviter
      if (inviter) this.signalGroup(inviter.userId, 'CALL_GROUP_LEAVE', { reason: 'declined' })
      this.reset()
    }
  }

  hangup(): void {
    if (this.snapshot.mode === 'private') this.hangupPrivate('hangup', true)
    else if (this.snapshot.mode === 'group') this.leaveGroup(false)
  }

  endGroupForAll(): void {
    if (this.snapshot.mode === 'group') this.leaveGroup(true)
  }

  toggleMute(): void {
    const next = !this.snapshot.muted
    if (this.privateSession) this.privateSession.setMuted(next)
    this.snapshot.localStream?.getAudioTracks().forEach((track) => { track.enabled = !next })
    this.snapshot.muted = next
    this.notifyChange()
  }

  toggleCamera(): void {
    if (this.snapshot.mediaType !== 'video') return
    const next = !this.snapshot.cameraOn
    if (this.privateSession) this.privateSession.setCameraEnabled(next)
    this.snapshot.localStream?.getVideoTracks().forEach((track) => { track.enabled = next })
    this.snapshot.cameraOn = next
    this.notifyChange()
  }

  private async acceptPrivate(): Promise<void> {
    if (this.snapshot.uiState !== 'incoming' || !this.privateSession || !this.snapshot.peer) return
    const callId = this.snapshot.callId
    const peer = this.snapshot.peer
    this.snapshot.uiState = 'connecting'
    this.notifyChange()
    this.sendPrivate({ cmd: 'CALL_ACCEPT', callId, toUserId: peer.userId, mediaType: this.snapshot.mediaType })
    this.startConnectTimer()
    try {
      await this.privateSession.prepareMediaAndPc()
      if (!this.isCurrent(callId) || !this.privateSession) return
      if (this.pendingOfferSdp) {
        const offer = this.pendingOfferSdp
        this.pendingOfferSdp = ''
        await this.privateSession.handleRemoteOffer(offer)
      }
    } catch {
      this.notify('无法使用麦克风或摄像头，请检查桌面端权限')
      this.hangupPrivate('mic_denied', true)
    }
  }

  private createPrivateSession(role: 'caller' | 'callee', peer: DesktopCallPeer, callId: string, media: CallMediaType): VoiceCallSession {
    const sessionPeer: VoicePeerInfo = { ...peer, userId: uid(peer.userId) }
    return new VoiceCallSession({
      callId,
      role,
      peer: sessionPeer,
      selfUserId: this.userId(),
      mediaType: media,
      hooks: {
        onLocalStream: (stream) => {
          if (this.isCurrent(callId)) {
            this.snapshot.localStream = stream
            this.snapshot.cameraOn = media !== 'video' || (stream?.getVideoTracks()[0]?.enabled ?? true)
            this.notifyChange()
          }
        },
        onRemoteStream: (stream) => {
          if (this.isCurrent(callId)) {
            this.snapshot.remoteStream = stream
            this.notifyChange()
          }
        },
        onState: (state) => {
          if (!this.isCurrent(callId)) return
          if (state === 'connected') {
            this.snapshot.uiState = 'connected'
            this.clearConnectTimer()
            this.startElapsedTimer()
            this.notifyChange()
          }
        },
        onPeerDisconnected: () => {
          if (this.isCurrent(callId)) {
            this.notify('对方已结束通话')
            this.hangupPrivate('peer_hangup', false)
          }
        },
        onError: (message) => {
          if (this.isCurrent(callId)) {
            this.notify(message || '通话连接失败')
            this.hangupPrivate('error', true)
          }
        },
      },
    })
  }

  private sendPrivate(payload: Record<string, unknown>): boolean {
    return sendCallSignal({
      ...payload,
      fromUserId: this.userId(),
    } as never)
  }

  private sendPrivateInvite(): void {
    const peer = this.snapshot.peer
    if (!peer) return
    this.sendPrivate({
      cmd: 'CALL_INVITE',
      callId: this.snapshot.callId,
      toUserId: peer.userId,
      fromNickname: this.userName(),
      fromAvatarUrl: this.userAvatar(),
      conversationId: peer.conversationId,
      mediaType: this.snapshot.mediaType,
    })
  }

  private async sendPrivateOffer(): Promise<void> {
    if (!this.privateSession || !this.isCurrent(this.snapshot.callId) || this.answerReceived) return
    if (!this.privateSession.isPcReady) return
    this.snapshot.uiState = 'connecting'
    this.startConnectTimer()
    this.offerSent = true
    this.notifyChange()
    const ok = await this.privateSession.createAndSendOffer()
    if (!ok) this.offerSent = false
    if (ok) this.startOfferRetry()
  }

  private startOfferRetry(): void {
    this.clearOfferRetry()
    let tries = 0
    this.inviteRetryTimer = window.setInterval(() => {
      tries += 1
      if (this.answerReceived || this.snapshot.uiState === 'connected' || this.snapshot.uiState === 'idle' || tries > 8) {
        this.clearOfferRetry()
        return
      }
      if (!this.privateSession?.resendLocalOffer()) {
        this.offerSent = false
        void this.sendPrivateOffer()
      }
    }, 1_600)
  }

  private startRingTimer(): void {
    this.ringTimer = window.setTimeout(() => {
      if (this.snapshot.uiState === 'outgoing' || this.snapshot.uiState === 'connecting') {
        this.notify('对方未接听')
        this.hangupPrivate('timeout', true)
      }
    }, RING_TIMEOUT_MS)
  }

  private startConnectTimer(): void {
    this.clearConnectTimer()
    this.connectTimer = window.setTimeout(() => {
      if (this.snapshot.uiState === 'connecting') {
        this.notify('无法接通，请检查网络后重试')
        this.hangupPrivate('error', true)
      }
    }, CONNECT_TIMEOUT_MS)
  }

  private hangupPrivate(reason: string, notifyPeer: boolean): void {
    if (this.snapshot.mode !== 'private' || !this.snapshot.callId) return
    const callId = this.snapshot.callId
    const peer = this.snapshot.peer
    const connected = this.snapshot.uiState === 'connected'
    const duration = this.snapshot.elapsedSec
    if (notifyPeer && peer) {
      const payload = { cmd: 'CALL_HANGUP', callId, toUserId: peer.userId, reason, mediaType: this.snapshot.mediaType }
      this.sendPrivate(payload)
      window.setTimeout(() => this.sendPrivate(payload), 320)
      window.setTimeout(() => this.sendPrivate(payload), 640)
    }
    this.privateSession?.close(reason)
    this.privateSession = null
    this.clearAllTimers()
    if (peer && this.privateRole === 'caller') void this.persistCallRecord(callId, peer, this.snapshot.mediaType, reason, connected, duration)
    this.reset()
  }

  private async persistCallRecord(callId: string, peer: DesktopCallPeer, media: CallMediaType, reason: string, connected: boolean, duration: number, group = false): Promise<void> {
    if (this.recordedCallIds.has(callId) || !peer.conversationId) return
    const text = callText(reason, connected, duration, group)
    this.recordedCallIds.add(callId)
    const kind = media === 'video' ? 'video_call' : 'voice_call'
    const content = JSON.stringify({ kind, callId, reason, connected, durationSec: connected ? duration : 0, mediaType: media, text, group })
    try {
      await sendDesktopTextMessage({
        conversationId: peer.conversationId,
        toUserId: group ? undefined : peer.userId,
        content,
        clientMsgId: `callrec_${callId}`,
        msgType: 9,
      })
    } catch {
      this.recordedCallIds.delete(callId)
    }
  }

  private inviteGroupMembers(members: DesktopGroupMember[]): void {
    const known = [selfMember(this.userId(), this.userName(), this.userAvatar())]
    members.forEach((member) => this.upsertParticipant(member, 'invited'))
    members.forEach((member) => this.signalGroup(member.userId, 'CALL_GROUP_INVITE', {
      members: known,
      allMembers: this.groupAvailableMembers,
    }))
    this.startGroupInviteRetry()
  }

  private startGroupInviteRetry(): void {
    this.clearInviteRetry()
    this.inviteRetryTimer = window.setInterval(() => {
      if (this.snapshot.mode !== 'group') return this.clearInviteRetry()
      const known = [
        ...this.snapshot.participants.map(({ userId, nickname, avatarUrl }) => ({ userId, nickname, avatarUrl })),
        selfMember(this.userId(), this.userName(), this.userAvatar()),
      ]
      this.snapshot.participants.filter((member) => member.state === 'invited').forEach((member) => {
        this.signalGroup(member.userId, 'CALL_GROUP_INVITE', { members: known, allMembers: this.groupAvailableMembers })
      })
    }, 2_000)
  }

  private async acceptGroup(): Promise<void> {
    if (this.snapshot.uiState !== 'incoming' || !this.snapshot.inviter) return
    const inviter = this.snapshot.inviter
    this.snapshot.uiState = 'connecting'
    this.upsertParticipant(inviter, 'connecting')
    this.notifyChange()
    try {
      this.snapshot.localStream = await this.acquireMedia(this.snapshot.mediaType)
      const sent = this.signalGroup(inviter.userId, 'CALL_GROUP_JOIN', { member: selfMember(this.userId(), this.userName(), this.userAvatar()) })
      if (!sent) throw new Error('signal')
      this.startGroupJoinRetry(inviter.userId)
    } catch {
      this.notify('无法加入群通话，请检查麦克风或摄像头权限')
      this.reset()
    }
  }

  private startGroupJoinRetry(inviterId: string): void {
    this.clearJoinRetry()
    let tries = 0
    this.joinRetryTimer = window.setInterval(() => {
      if (this.snapshot.mode !== 'group' || this.snapshot.uiState === 'connected' || this.groupPcs.size > 0 || ++tries > 20) return this.clearJoinRetry()
      this.signalGroup(inviterId, 'CALL_GROUP_JOIN', { member: selfMember(this.userId(), this.userName(), this.userAvatar()) })
    }, 1_000)
  }

  private signalGroup(toUserId: string, cmd: string, extra: Record<string, unknown> = {}): boolean {
    const target = uid(toUserId)
    if (!target || !this.snapshot.callId) return false
    return sendCallSignal({
      cmd: cmd as never,
      callId: this.snapshot.callId,
      toUserId: target,
      conversationId: this.snapshot.conversationId,
      groupTitle: this.snapshot.groupTitle,
      mediaType: this.snapshot.mediaType,
      fromNickname: this.userName(),
      fromAvatarUrl: this.userAvatar(),
      ...extra,
    } as never)
  }

  private async acquireMedia(media: CallMediaType): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('media unavailable')
    const audio: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    const video: MediaTrackConstraints = { width: { ideal: 1280, max: 1920 }, height: { ideal: 720, max: 1080 }, frameRate: { ideal: 30, max: 30 } }
    try {
      return await navigator.mediaDevices.getUserMedia({ audio, video: media === 'video' ? video : false })
    } catch {
      return navigator.mediaDevices.getUserMedia({ audio: true, video: media === 'video' })
    }
  }

  private async pcFor(userId: string): Promise<RTCPeerConnection> {
    const id = uid(userId)
    const existing = this.groupPcs.get(id)
    if (existing) return existing
    const servers = await fetchIceServers().catch(() => [{ urls: 'stun:stun.l.google.com:19302' }])
    const pc = new RTCPeerConnection({ iceServers: servers, iceCandidatePoolSize: 2, bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require' })
    this.groupPcs.set(id, pc)
    this.snapshot.localStream?.getTracks().forEach((track) => pc.addTrack(track, this.snapshot.localStream as MediaStream))
    pc.onicecandidate = (event) => {
      if (event.candidate) this.signalGroup(id, 'CALL_GROUP_ICE', { candidate: event.candidate.toJSON() })
    }
    pc.ontrack = (event) => this.markGroupPeerConnected(id, event.streams[0] || new MediaStream([event.track]))
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        this.clearGroupDisconnectTimer(id)
        this.markGroupPeerConnected(id)
      } else if (pc.connectionState === 'failed') {
        void this.restartGroupIce(id)
      } else if (pc.connectionState === 'disconnected' && !this.groupDisconnectTimers.has(id)) {
        const timer = window.setTimeout(() => {
          this.groupDisconnectTimers.delete(id)
          if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') void this.restartGroupIce(id)
        }, 10_000)
        this.groupDisconnectTimers.set(id, timer)
      }
    }
    return pc
  }

  private async offerGroupTo(userId: string): Promise<void> {
    const id = uid(userId)
    const pc = await this.pcFor(id)
    if (pc.signalingState === 'have-local-offer' && pc.localDescription?.type === 'offer') {
      this.signalGroup(id, 'CALL_GROUP_OFFER', { sdp: pc.localDescription.sdp || '' })
      return
    }
    if (pc.signalingState !== 'stable') return
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    this.signalGroup(id, 'CALL_GROUP_OFFER', { sdp: offer.sdp || '' })
  }

  private async restartGroupIce(userId: string): Promise<void> {
    const pc = this.groupPcs.get(uid(userId))
    if (!pc || pc.signalingState !== 'stable') return
    try {
      const offer = await pc.createOffer({ iceRestart: true })
      await pc.setLocalDescription(offer)
      this.signalGroup(uid(userId), 'CALL_GROUP_OFFER', { sdp: offer.sdp || '' })
    } catch {
      // Keep the remaining group members connected.
    }
  }

  private async flushGroupIce(id: string, pc: RTCPeerConnection): Promise<void> {
    const candidates = this.groupPendingIce.get(id) || []
    this.groupPendingIce.delete(id)
    for (const candidate of candidates) await pc.addIceCandidate(candidate).catch(() => {})
  }

  private upsertParticipant(member: DesktopGroupMember, state: DesktopCallParticipant['state'] = 'invited'): void {
    const id = uid(member.userId)
    if (!id || id === uid(this.userId())) return
    const index = this.snapshot.participants.findIndex((item) => uid(item.userId) === id)
    const next = { ...member, userId: id, nickname: member.nickname || '群成员', state }
    if (index < 0) this.snapshot.participants = [...this.snapshot.participants, next]
    else this.snapshot.participants = this.snapshot.participants.map((item, itemIndex) => itemIndex === index ? { ...item, ...next, stream: item.stream } : item)
    this.notifyChange()
  }

  private markGroupPeerConnected(userId: string, stream?: MediaStream): void {
    const id = uid(userId)
    const participant = this.snapshot.participants.find((item) => uid(item.userId) === id)
    if (!participant) return
    participant.state = 'connected'
    if (stream) participant.stream = stream
    this.groupMaxParticipants = Math.max(this.groupMaxParticipants, this.snapshot.participants.filter((item) => item.state === 'connected').length + 1)
    this.snapshot.uiState = 'connected'
    this.startElapsedTimer()
    this.notifyChange()
  }

  private removeGroupPeer(userId: string): void {
    const id = uid(userId)
    this.groupPcs.get(id)?.close()
    this.groupPcs.delete(id)
    this.clearGroupDisconnectTimer(id)
    this.snapshot.participants = this.snapshot.participants.filter((item) => uid(item.userId) !== id)
    this.notifyChange()
  }

  private leaveGroup(endForAll: boolean): void {
    const callId = this.snapshot.callId
    if (!callId) return
    const targets = new Set(this.snapshot.participants.map((item) => uid(item.userId)))
    if (this.snapshot.inviter) targets.add(uid(this.snapshot.inviter.userId))
    let endAll = endForAll
    let newHostId = ''
    const connected = this.snapshot.participants.filter((item) => item.state === 'connected' || item.state === 'connecting')
    if (!endAll && this.snapshot.isHost) {
      newHostId = uid(connected[0]?.userId)
      if (!newHostId) endAll = true
    }
    const hasOthers = this.snapshot.participants.some((item) => uid(item.userId))
    if (endAll || !hasOthers) void this.persistGroupTip(callId, this.snapshot.conversationId, this.snapshot.mediaType, this.snapshot.elapsedSec, this.groupMaxParticipants)
    targets.forEach((id) => {
      if (!id) return
      if (endAll) {
        this.signalGroup(id, 'CALL_GROUP_END', { durationSec: this.snapshot.elapsedSec, participantCount: this.groupMaxParticipants })
      } else {
        this.signalGroup(id, 'CALL_GROUP_LEAVE', {
          reason: 'hangup',
          wasHost: this.snapshot.isHost,
          ...(newHostId ? { newHostId } : {}),
          ...(this.snapshot.isHost ? { members: this.groupAvailableMembers, groupTitle: this.snapshot.groupTitle, conversationId: this.snapshot.conversationId } : {}),
        })
      }
    })
    this.reset()
  }

  private async persistGroupTip(callId: string, conversationId: string, media: CallMediaType, duration: number, count: number): Promise<void> {
    if (!conversationId || this.recordedCallIds.has(callId)) return
    this.recordedCallIds.add(callId)
    const text = callText('hangup', count > 1 || duration > 0, duration, true)
    const content = JSON.stringify({ kind: media === 'video' ? 'video_call' : 'voice_call', callId, reason: 'hangup', connected: count > 1 || duration > 0, durationSec: duration, mediaType: media, text, group: true })
    try {
      await sendDesktopTextMessage({ conversationId, content, clientMsgId: `callrec_${callId}`, msgType: 9 })
    } catch {
      this.recordedCallIds.delete(callId)
    }
  }

  private async handleSignal(raw: SignalPayload): Promise<void> {
    const cmd = String(raw.cmd || '')
    if (GROUP_COMMANDS.has(cmd)) return this.handleGroupSignal(raw)
    if (!cmd.startsWith('CALL_')) return
    const from = uid(raw.fromUserId)
    const sid = uid(raw.callId)
    if (!from || from === uid(this.userId())) return
    if (cmd === 'CALL_INVITE') {
      if (this.snapshot.uiState !== 'idle') {
        sendCallSignal({ cmd: 'CALL_BUSY', callId: sid, toUserId: from } as never)
        return
      }
      const peer: DesktopCallPeer = { userId: from, nickname: String(raw.fromNickname || '用户'), avatarUrl: String(raw.fromAvatarUrl || ''), conversationId: raw.conversationId ? String(raw.conversationId) : undefined }
      this.clearAllTimers()
      this.snapshot = { ...this.snapshot, mode: 'private', uiState: 'incoming', callId: sid, mediaType: mediaTypeOf(raw.mediaType), peer, inviter: null, conversationId: peer.conversationId || '', localStream: null, remoteStream: null, participants: [], muted: false, cameraOn: true, elapsedSec: 0, isHost: false }
      this.privateSession = this.createPrivateSession('callee', peer, sid, this.snapshot.mediaType)
      this.privateRole = 'callee'
      this.notifyChange()
      this.sendPrivate({ cmd: 'CALL_RINGING', callId: sid, toUserId: from, mediaType: this.snapshot.mediaType })
      this.startRingTimer()
      return
    }
    if (sid && sid !== this.snapshot.callId) return
    const peer = this.snapshot.peer
    if (cmd === 'CALL_RINGING') return
    if (cmd === 'CALL_BUSY') {
      this.notify('对方忙线中')
      this.hangupPrivate('busy', false)
      return
    }
    if (cmd === 'CALL_REJECT') {
      if (this.snapshot.uiState === 'outgoing' || this.snapshot.uiState === 'connecting') {
        this.notify('对方已拒绝')
        this.hangupPrivate('rejected', false)
      }
      return
    }
    if (cmd === 'CALL_UNAVAILABLE') return
    if (cmd === 'CALL_ERROR') {
      this.notify(String(raw.message || '通话异常'))
      this.hangupPrivate('error', false)
      return
    }
    if (cmd === 'CALL_HANGUP') {
      if (this.snapshot.uiState !== 'idle') {
        this.notify('通话已结束')
        this.hangupPrivate('peer_hangup', false)
      }
      return
    }
    if (!peer || !this.privateSession) return
    if (cmd === 'CALL_ACCEPT') {
      this.snapshot.uiState = 'connecting'
      this.startConnectTimer()
      this.notifyChange()
      if (!this.privateSession.isPcReady) {
        try { await this.privateSession.prepareMediaAndPc() } catch { this.hangupPrivate('mic_denied', true); return }
      }
      if (!this.offerSent) void this.sendPrivateOffer()
      return
    }
    if (cmd === 'CALL_OFFER') {
      const sdp = String(raw.sdp || '')
      if (!sdp) return
      if (!this.privateSession.isPcReady || this.snapshot.uiState === 'incoming') {
        this.pendingOfferSdp = sdp
      } else {
        await this.privateSession.handleRemoteOffer(sdp)
      }
      return
    }
    if (cmd === 'CALL_ANSWER') {
      const ok = await this.privateSession.handleRemoteAnswer(String(raw.sdp || ''))
      if (ok) {
        this.answerReceived = true
        this.clearOfferRetry()
      }
      return
    }
    if (cmd === 'CALL_ICE' && raw.candidate) {
      await this.privateSession.handleRemoteIce(raw.candidate as RTCIceCandidateInit)
    }
  }

  private async handleGroupSignal(raw: SignalPayload): Promise<void> {
    const cmd = String(raw.cmd || '')
    const from = uid(raw.fromUserId)
    const sid = uid(raw.callId)
    if (!from || from === uid(this.userId())) return
    const fingerprint = `${cmd}|${sid}|${from}|${JSON.stringify(raw.sdp || raw.candidate || raw.member || raw.reason || '')}`
    const now = Date.now()
    if (now - (this.groupRecentSignals.get(fingerprint) || 0) < (cmd === 'CALL_GROUP_INVITE' || cmd === 'CALL_GROUP_JOIN' ? 450 : 1_200)) return
    this.groupRecentSignals.set(fingerprint, now)
    if (cmd === 'CALL_GROUP_INVITE') {
      if (this.snapshot.uiState !== 'idle') {
        sendCallSignal({ cmd: 'CALL_GROUP_LEAVE', callId: sid, toUserId: from, reason: 'busy' } as never)
        return
      }
      this.clearAllTimers()
      const allMembers = Array.isArray(raw.allMembers) ? raw.allMembers as DesktopGroupMember[] : []
      this.groupAvailableMembers = allMembers.map((member) => ({ ...member, userId: uid(member.userId) })).filter((member) => member.userId !== uid(this.userId()))
      this.snapshot = { ...this.snapshot, mode: 'group', uiState: 'incoming', callId: sid, mediaType: mediaTypeOf(raw.mediaType), peer: null, inviter: { userId: from, nickname: String(raw.fromNickname || '群成员'), avatarUrl: String(raw.fromAvatarUrl || '') }, conversationId: String(raw.conversationId || ''), groupTitle: String(raw.groupTitle || '群聊'), localStream: null, remoteStream: null, participants: [], muted: false, cameraOn: true, elapsedSec: 0, isHost: false }
      const members = Array.isArray(raw.members) ? raw.members as DesktopGroupMember[] : []
      members.forEach((member) => this.upsertParticipant(member, 'connecting'))
      const inviter = this.snapshot.inviter
      if (inviter) this.upsertParticipant(inviter, 'ringing')
      this.notifyChange()
      this.signalGroup(from, 'CALL_GROUP_RINGING')
      this.startRingTimer()
      return
    }
    if (sid !== this.snapshot.callId || this.snapshot.mode !== 'group') return
    if (cmd === 'CALL_GROUP_RINGING') {
      this.patchParticipant(from, { state: 'ringing' })
      return
    }
    if (cmd === 'CALL_GROUP_JOIN') {
      this.clearJoinRetry()
      const member = (raw.member || {}) as DesktopGroupMember
      this.upsertParticipant({ userId: from, nickname: member.nickname || String(raw.fromNickname || '群成员'), avatarUrl: member.avatarUrl || '' }, 'connecting')
      const peers = this.snapshot.participants.filter((item) => uid(item.userId) !== from && (item.state === 'connected' || item.state === 'connecting'))
      const joined = this.snapshot.participants.find((item) => uid(item.userId) === from)
      if (joined) peers.forEach((peer) => {
        this.signalGroup(peer.userId, 'CALL_GROUP_MEMBER_JOINED', { member: { userId: joined.userId, nickname: joined.nickname, avatarUrl: joined.avatarUrl }, shouldOffer: true })
        this.signalGroup(from, 'CALL_GROUP_MEMBER_JOINED', { member: { userId: peer.userId, nickname: peer.nickname, avatarUrl: peer.avatarUrl }, shouldOffer: false })
      })
      await this.offerGroupTo(from)
      return
    }
    if (cmd === 'CALL_GROUP_MEMBER_JOINED') {
      const member = (raw.member || {}) as DesktopGroupMember
      const id = uid(member.userId)
      if (!id || id === uid(this.userId())) return
      this.upsertParticipant({ ...member, userId: id }, 'connecting')
      if (raw.shouldOffer === true || raw.shouldOffer === 'true') await this.offerGroupTo(id)
      return
    }
    if (cmd === 'CALL_GROUP_OFFER') {
      const pc = await this.pcFor(from)
      if (pc.signalingState === 'have-local-offer' && uid(this.userId()).localeCompare(from) > 0) await pc.setLocalDescription({ type: 'rollback' })
      await pc.setRemoteDescription({ type: 'offer', sdp: String(raw.sdp || '') })
      await this.flushGroupIce(from, pc)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      this.signalGroup(from, 'CALL_GROUP_ANSWER', { sdp: answer.sdp || '' })
      this.patchParticipant(from, { state: 'connecting' })
      return
    }
    if (cmd === 'CALL_GROUP_ANSWER') {
      const pc = await this.pcFor(from)
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription({ type: 'answer', sdp: String(raw.sdp || '') })
        await this.flushGroupIce(from, pc)
      }
      return
    }
    if (cmd === 'CALL_GROUP_ICE' && raw.candidate) {
      const pc = this.groupPcs.get(from)
      if (pc?.remoteDescription) await pc.addIceCandidate(raw.candidate as RTCIceCandidateInit).catch(() => {})
      else this.groupPendingIce.set(from, [...(this.groupPendingIce.get(from) || []), raw.candidate as RTCIceCandidateInit])
      return
    }
    if (cmd === 'CALL_GROUP_LEAVE') {
      this.removeGroupPeer(from)
      const newHostId = uid(raw.newHostId)
      if (newHostId === uid(this.userId())) {
        this.snapshot.isHost = true
        this.snapshot.inviter = null
        this.startGroupInviteRetry()
      } else if (newHostId) {
        const host = this.snapshot.participants.find((item) => uid(item.userId) === newHostId)
        if (host) this.snapshot.inviter = host
      } else if (raw.wasHost === true && this.snapshot.uiState === 'incoming') {
        this.reset()
      }
      this.notifyChange()
      return
    }
    if (cmd === 'CALL_GROUP_END') {
      if (this.snapshot.isHost) void this.persistGroupTip(this.snapshot.callId, this.snapshot.conversationId, this.snapshot.mediaType, Number(raw.durationSec || this.snapshot.elapsedSec), Number(raw.participantCount || this.groupMaxParticipants))
      this.notify('群通话已结束')
      this.reset()
    }
  }

  private patchParticipant(userId: string, patch: Partial<DesktopCallParticipant>): void {
    const id = uid(userId)
    this.snapshot.participants = this.snapshot.participants.map((item) => uid(item.userId) === id ? { ...item, ...patch } : item)
    this.notifyChange()
  }

  private reset(notify = true): void {
    this.clearAllTimers()
    this.groupPcs.forEach((pc) => pc.close())
    this.groupPcs.clear()
    this.groupPendingIce.clear()
    this.groupDisconnectTimers.forEach((timer) => window.clearTimeout(timer))
    this.groupDisconnectTimers.clear()
    this.snapshot.localStream?.getTracks().forEach((track) => track.stop())
    this.privateSession?.close('reset')
    this.privateSession = null
    this.privateRole = null
    this.groupAvailableMembers = []
    this.groupRecentSignals.clear()
    this.pendingOfferSdp = ''
    this.offerSent = false
    this.answerReceived = false
    this.groupMaxParticipants = 1
    this.snapshot = { ...this.snapshot, mode: 'idle', uiState: 'idle', callId: '', mediaType: 'audio', peer: null, inviter: null, conversationId: '', groupTitle: '', localStream: null, remoteStream: null, participants: [], muted: false, cameraOn: true, elapsedSec: 0, isHost: false }
    if (notify) this.notifyChange()
  }

  private clearAllTimers(): void {
    this.clearInviteRetry()
    this.clearJoinRetry()
    this.clearOfferRetry()
    if (this.ringTimer !== null) window.clearTimeout(this.ringTimer)
    if (this.connectTimer !== null) window.clearTimeout(this.connectTimer)
    if (this.elapsedTimer !== null) window.clearInterval(this.elapsedTimer)
    this.ringTimer = null
    this.connectTimer = null
    this.elapsedTimer = null
  }

  private clearInviteRetry(): void {
    if (this.inviteRetryTimer !== null) window.clearInterval(this.inviteRetryTimer)
    this.inviteRetryTimer = null
  }

  private clearJoinRetry(): void {
    if (this.joinRetryTimer !== null) window.clearInterval(this.joinRetryTimer)
    this.joinRetryTimer = null
  }

  private clearOfferRetry(): void {
    if (this.inviteRetryTimer !== null && this.snapshot.mode === 'private') window.clearInterval(this.inviteRetryTimer)
    if (this.snapshot.mode === 'private') this.inviteRetryTimer = null
  }

  private clearConnectTimer(): void {
    if (this.connectTimer !== null) window.clearTimeout(this.connectTimer)
    this.connectTimer = null
  }

  private clearGroupDisconnectTimer(id: string): void {
    const timer = this.groupDisconnectTimers.get(id)
    if (timer !== undefined) window.clearTimeout(timer)
    this.groupDisconnectTimers.delete(id)
  }

  private startElapsedTimer(): void {
    if (this.elapsedTimer !== null) return
    this.snapshot.elapsedSec = 0
    this.elapsedTimer = window.setInterval(() => {
      this.snapshot.elapsedSec += 1
      this.notifyChange()
    }, 1_000)
  }

  private isCurrent(callId: string): boolean {
    return this.snapshot.callId === callId && this.snapshot.uiState !== 'idle'
  }

  private userId(): string {
    try { return String(JSON.parse(localStorage.getItem('pulse_user_profile') || '{}').userId || '') } catch { return '' }
  }

  private userName(): string {
    try { return String(JSON.parse(localStorage.getItem('pulse_user_profile') || '{}').nickname || '用户') } catch { return '用户' }
  }

  private userAvatar(): string {
    try {
      return resolveDesktopAvatarUrl(String(JSON.parse(localStorage.getItem('pulse_user_profile') || '{}').avatarUrl || ''))
    } catch {
      return ''
    }
  }

  private notify(message: string): void {
    this.notices.forEach((handler) => handler(message))
  }

  private notifyChange(): void {
    this.listeners.forEach((handler) => handler(this.snapshot))
  }
}

export const desktopCall = new DesktopCallManager()

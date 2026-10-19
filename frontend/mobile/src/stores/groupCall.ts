import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { showToast } from 'vant'
import {
  ensureWsReady,
  isCallSignalCmd,
  onWsMessage,
  reconnectWs,
  sendCallSignal,
  ensureSignalAfterMedia,
} from '@/im/ws'
import { fetchIceServers, reportGroupCallLog } from '@/api/call'
import { publishLocalCallSystemTip } from '@/utils/callSystemTip'
import {
  clearCallNotification,
  notifyIncomingCall,
  notifyMissedCall,
} from '@/native/callNotification'
import { sendTextMessage } from '@/api/message'
import { useConversationInboxStore } from '@/stores/conversationInbox'
import { useUserStore } from '@/stores/user'
import type { CallMediaType } from '@/im/voiceCallSession'
import { startCallRingtone, stopCallRingtone, unlockCallRingtoneAudio } from '@/utils/callRingtone'

export interface GroupCallMember {
  userId: string
  nickname: string
  avatarUrl?: string
}

type Participant = GroupCallMember & {
  state: 'invited' | 'ringing' | 'connecting' | 'connected' | 'declined'
  stream?: MediaStream
}

const GROUP_CMDS = new Set([
  'CALL_GROUP_INVITE', 'CALL_GROUP_RINGING', 'CALL_GROUP_JOIN', 'CALL_GROUP_MEMBER_JOINED',
  'CALL_GROUP_OFFER', 'CALL_GROUP_ANSWER', 'CALL_GROUP_ICE',
  'CALL_GROUP_LEAVE', 'CALL_GROUP_END',
])

function uid(value: unknown): string {
  return String(value ?? '').trim()
}

function formatGroupCallDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

export const useGroupCallStore = defineStore('groupCall', () => {
  const callId = ref('')
  const conversationId = ref('')
  const groupTitle = ref('')
  const mediaType = ref<CallMediaType>('audio')
  const state = ref<'idle' | 'incoming' | 'connecting' | 'connected'>('idle')
  const participants = ref<Participant[]>([])
  const availableMembers = ref<GroupCallMember[]>([])
  const localStream = shallowRef<MediaStream | null>(null)
  const muted = ref(false)
  const cameraOn = ref(true)
  const elapsedSec = ref(0)
  const inviter = ref<GroupCallMember | null>(null)
  const visible = computed(() => state.value !== 'idle')
  const isVideo = computed(() => mediaType.value === 'video')
  const connectedCount = computed(() => participants.value.filter((p) => p.state === 'connected').length + 1)

  const pcs = new Map<string, RTCPeerConnection>()
  const pendingIce = new Map<string, RTCIceCandidateInit[]>()
  const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const recentSignals = new Map<string, number>()
  let timer: ReturnType<typeof setInterval> | null = null
  let inviteRetryTimer: ReturnType<typeof setInterval> | null = null
  let joinRetryTimer: ReturnType<typeof setInterval> | null = null
  let unsub: (() => void) | null = null
  let started = false
  /** 是否为本场群通话发起人（主持人） */
  let isHost = false
  let maxParticipantCount = 1
  const recordedCallIds = new Set<string>()
  const me = () => uid(useUserStore().userId)
  const selfInfo = (): GroupCallMember => {
    const user = useUserStore()
    return { userId: me(), nickname: user.nickname || '用户', avatarUrl: user.avatar || '' }
  }

  function upsert(member: GroupCallMember, nextState?: Participant['state']) {
    const normalized = {
      ...member,
      userId: uid(member.userId),
      nickname: member.nickname || '群成员',
      avatarUrl: member.avatarUrl || '',
    }
    if (!normalized.userId || normalized.userId === me()) return
    const index = participants.value.findIndex((p) => uid(p.userId) === normalized.userId)
    const next = participants.value.slice()
    if (index < 0) {
      next.push({ ...normalized, state: nextState || 'invited' })
    } else {
      next[index] = {
        ...next[index],
        ...normalized,
        state: nextState || next[index].state,
        stream: next[index].stream,
      }
    }
    participants.value = next
  }

  function patchParticipant(userId: string, patch: Partial<Participant>) {
    const id = uid(userId)
    const index = participants.value.findIndex((p) => uid(p.userId) === id)
    if (index < 0) return
    const next = participants.value.slice()
    next[index] = { ...next[index], ...patch, userId: id }
    participants.value = next
  }

  function markPeerConnected(userId: string, stream?: MediaStream) {
    const id = uid(userId)
    const index = participants.value.findIndex((p) => uid(p.userId) === id)
    if (index < 0) return
    const next = participants.value.slice()
    next[index] = {
      ...next[index],
      userId: id,
      state: 'connected',
      stream: stream || next[index].stream,
    }
    participants.value = next
    maxParticipantCount = Math.max(maxParticipantCount, connectedCount.value)
    state.value = 'connected'
    startTimer()
    if (isHost) {
      void reportGroupCallLog({
        callId: callId.value,
        conversationId: conversationId.value,
        mediaType: mediaType.value,
        event: 'update',
        participantCount: maxParticipantCount,
      }).catch(() => {})
    }
  }

  function signal(toUserId: string, cmd: string, extra: Record<string, unknown> = {}): boolean {
    const target = uid(toUserId)
    if (!target || !callId.value) return false
    return sendCallSignal({
      cmd: cmd as never,
      callId: callId.value,
      toUserId: target,
      conversationId: conversationId.value,
      groupTitle: groupTitle.value,
      mediaType: mediaType.value,
      fromNickname: selfInfo().nickname,
      fromAvatarUrl: selfInfo().avatarUrl || '',
      ...extra,
    })
  }

  async function prepareMedia() {
    if (localStream.value) return
    const audioFancy = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    } as MediaTrackConstraints
    const videoFancy = {
      facingMode: 'user',
      width: { ideal: 640, max: 1280 },
      height: { ideal: 480, max: 720 },
      frameRate: { ideal: 24, max: 30 },
    } as MediaTrackConstraints

    try {
      localStream.value = await navigator.mediaDevices.getUserMedia({
        audio: audioFancy,
        video: isVideo.value ? videoFancy : false,
      })
      return
    } catch {
      /* fall through */
    }
    try {
      localStream.value = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: isVideo.value ? { facingMode: 'user' } : false,
      })
      return
    } catch {
      /* fall through */
    }
    localStream.value = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isVideo.value,
    })
  }

  async function pcFor(userId: string) {
    const id = uid(userId)
    const old = pcs.get(id)
    if (old) return old
    const pc = new RTCPeerConnection({
      iceServers: await fetchIceServers().catch(() => [{ urls: 'stun:stun.l.google.com:19302' }]),
      iceCandidatePoolSize: 2,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    })
    pcs.set(id, pc)
    localStream.value?.getTracks().forEach((track) => pc.addTrack(track, localStream.value!))
    pc.onicecandidate = (event) => {
      if (event.candidate) signal(id, 'CALL_GROUP_ICE', { candidate: event.candidate.toJSON() })
    }
    pc.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track])
      markPeerConnected(id, stream)
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        const oldTimer = disconnectTimers.get(id)
        if (oldTimer) clearTimeout(oldTimer)
        disconnectTimers.delete(id)
        markPeerConnected(id)
      }
      if (pc.connectionState === 'failed') {
        void restartIce(id)
      } else if (pc.connectionState === 'disconnected' && !disconnectTimers.has(id)) {
        disconnectTimers.set(id, setTimeout(() => {
          disconnectTimers.delete(id)
          if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            void restartIce(id)
          }
        }, 10_000))
      }
    }
    return pc
  }

  async function flushIce(userId: string, pc: RTCPeerConnection) {
    const id = uid(userId)
    const list = pendingIce.get(id) || []
    pendingIce.delete(id)
    for (const candidate of list) await pc.addIceCandidate(candidate).catch(() => {})
  }

  async function offerTo(userId: string) {
    const id = uid(userId)
    const user = useUserStore()
    // 发 Offer 前确保信令在线，否则 setLocalDescription 后会卡死在 have-local-offer
    if (!(await ensureSignalAfterMedia(user.token, 8000))) return
    const pc = await pcFor(id)
    if (pc.signalingState === 'have-local-offer' && pc.localDescription?.type === 'offer') {
      signal(id, 'CALL_GROUP_OFFER', { sdp: pc.localDescription.sdp || '' })
      return
    }
    if (pc.signalingState !== 'stable') return
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    if (!signal(id, 'CALL_GROUP_OFFER', { sdp: offer.sdp })) {
      // 发送失败：保留 local offer，等待下次 JOIN 走重发分支
      void ensureSignalAfterMedia(user.token, 8000).then((ok) => {
        if (ok && pc.localDescription?.type === 'offer') {
          signal(id, 'CALL_GROUP_OFFER', { sdp: pc.localDescription.sdp || '' })
        }
      })
    }
  }

  async function restartIce(userId: string) {
    const id = uid(userId)
    const pc = pcs.get(id)
    if (!pc || pc.signalingState !== 'stable') return
    try {
      const offer = await pc.createOffer({ iceRestart: true })
      await pc.setLocalDescription(offer)
      signal(id, 'CALL_GROUP_OFFER', { sdp: offer.sdp })
    } catch {
      // Keep the call UI alive while the browser retries connectivity.
    }
  }

  async function startGroupCall(opts: {
    conversationId: string
    groupTitle: string
    mediaType: CallMediaType
    members: GroupCallMember[]
    allMembers: GroupCallMember[]
  }) {
    if (visible.value) return showToast('当前正在通话中')
    // 发起方只等待对方接听，不播放来电/回铃
    stopCallRingtone()
    const user = useUserStore()
    if (!(await ensureWsReady(user.token))) return showToast('信令未连接，请稍后重试')
    callId.value = `gc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    isHost = true
    maxParticipantCount = 1
    conversationId.value = opts.conversationId
    groupTitle.value = opts.groupTitle
    mediaType.value = opts.mediaType
    availableMembers.value = opts.allMembers
      .map((m) => ({ ...m, userId: uid(m.userId) }))
      .filter((m) => m.userId && m.userId !== me())
    participants.value = []
    opts.members.forEach((m) => upsert({ ...m, userId: uid(m.userId) }, 'invited'))
    state.value = 'connecting'
    try {
      await prepareMedia()
    } catch {
      reset()
      return showToast(isVideo.value ? '无法使用摄像头或麦克风' : '无法使用麦克风')
    }
    stopCallRingtone()
    if (!(await ensureSignalAfterMedia(user.token))) {
      reset()
      return showToast('信令连接已断开，请稍后重试')
    }
    inviteMembers(opts.members)
    startInviteRetry()
    void reportGroupCallLog({
      callId: callId.value,
      conversationId: conversationId.value,
      mediaType: mediaType.value,
      event: 'start',
      participantCount: 1,
    }).catch(() => {})
  }

  function inviteMembers(members: GroupCallMember[]) {
    const known = [
      ...participants.value.map((p) => ({
        userId: uid(p.userId),
        nickname: p.nickname,
        avatarUrl: p.avatarUrl,
      })),
      selfInfo(),
    ]
    members
      .map((m) => ({ ...m, userId: uid(m.userId) }))
      .filter((m) => m.userId && m.userId !== me())
      .forEach((member) => {
        upsert(member, 'invited')
        signal(member.userId, 'CALL_GROUP_INVITE', {
          members: known,
          allMembers: availableMembers.value,
        })
      })
    startInviteRetry()
  }

  function startInviteRetry() {
    if (inviteRetryTimer) clearInterval(inviteRetryTimer)
    inviteRetryTimer = setInterval(() => {
      if (state.value === 'idle') {
        if (inviteRetryTimer) clearInterval(inviteRetryTimer)
        inviteRetryTimer = null
        return
      }
      const waiting = participants.value.filter((p) => p.state === 'invited')
      if (!waiting.length) {
        if (inviteRetryTimer) clearInterval(inviteRetryTimer)
        inviteRetryTimer = null
        return
      }
      const known = [
        ...participants.value.map((p) => ({
          userId: uid(p.userId),
          nickname: p.nickname,
          avatarUrl: p.avatarUrl,
        })),
        selfInfo(),
      ]
      waiting.forEach((member) =>
        signal(uid(member.userId), 'CALL_GROUP_INVITE', {
          members: known,
          allMembers: availableMembers.value,
        }),
      )
    }, 2_000)
  }

  function clearJoinRetry() {
    if (joinRetryTimer) clearInterval(joinRetryTimer)
    joinRetryTimer = null
  }

  function startJoinRetry(inviteUserId: string) {
    clearJoinRetry()
    let tries = 0
    joinRetryTimer = setInterval(() => {
      if (state.value === 'idle' || state.value === 'connected' || pcs.size > 0) {
        clearJoinRetry()
        return
      }
      if (++tries > 20) {
        clearJoinRetry()
        return
      }
      const user = useUserStore()
      void ensureWsReady(user.token).then((ok) => {
        if (!ok) return
        signal(inviteUserId, 'CALL_GROUP_JOIN', { member: selfInfo() })
      })
    }, 1_000)
  }

  async function accept() {
    if (state.value !== 'incoming') return
    const inviteUserId = uid(inviter.value?.userId)
    // 已接听：清掉来电通知
    if (callId.value) void clearCallNotification(callId.value, true)
    if (!inviteUserId) {
      showToast('邀请已失效，请让对方重新邀请')
      reset()
      return
    }
    stopCallRingtone()
    unlockCallRingtoneAudio()
    // 先切到连接中，并立刻开麦（占住 iOS 手势）
    state.value = 'connecting'
    upsert(
      {
        userId: inviteUserId,
        nickname: inviter.value?.nickname || '群成员',
        avatarUrl: inviter.value?.avatarUrl || '',
      },
      'connecting',
    )
    const mediaTask = prepareMedia()
    try {
      await mediaTask
    } catch {
      state.value = 'incoming'
      void startCallRingtone()
      return showToast(isVideo.value ? '无法使用摄像头或麦克风' : '无法使用麦克风')
    }
    const user = useUserStore()
    // 采集音视频后部分机型会掐断 WS，这里主动重连再发 JOIN
    if (!(await ensureSignalAfterMedia(user.token))) {
      state.value = 'incoming'
      void startCallRingtone()
      return showToast('信令连接已断开，请稍后重试')
    }
    const sent = signal(inviteUserId, 'CALL_GROUP_JOIN', { member: selfInfo() })
    if (!sent) {
      reconnectWs(user.token)
      if (
        !(await ensureWsReady(user.token, 12000)) ||
        !signal(inviteUserId, 'CALL_GROUP_JOIN', { member: selfInfo() })
      ) {
        state.value = 'incoming'
        void startCallRingtone()
        return showToast('加入失败，请重试')
      }
    }
    startJoinRetry(inviteUserId)
  }

  function reject() {
    stopCallRingtone()
    if (callId.value) void clearCallNotification(callId.value, true)
    if (inviter.value) signal(uid(inviter.value.userId), 'CALL_GROUP_LEAVE', { reason: 'declined' })
    reset()
  }

  function removePeer(userId: string) {
    const id = uid(userId)
    const disconnectTimer = disconnectTimers.get(id)
    if (disconnectTimer) clearTimeout(disconnectTimer)
    disconnectTimers.delete(id)
    pcs.get(id)?.close()
    pcs.delete(id)
    participants.value = participants.value.filter((p) => uid(p.userId) !== id)
  }

  /** 主持人挂断时写入群聊系统 tip（幂等）；所有端立刻本地插入 */
  async function persistGroupCallTip(opts: {
    callId: string
    conversationId: string
    mediaType: CallMediaType
    durationSec: number
    participantCount: number
    /** 仅主持/落库方发 HTTP；其他成员只本地展示 */
    persist?: boolean
  }) {
    const {
      callId: cid,
      conversationId: convId,
      mediaType: media,
      durationSec,
      participantCount,
      persist = true,
    } = opts
    if (!cid || !convId || recordedCallIds.has(cid)) return
    recordedCallIds.add(cid)

    const wasConnected = participantCount > 1 || durationSec > 0
    const text = wasConnected && durationSec > 0
      ? `群通话时长 ${formatGroupCallDuration(durationSec)}`
      : '群通话已结束'
    const kind = media === 'video' ? 'video_call' : 'voice_call'
    const tag = media === 'video' ? '[视频通话]' : '[语音通话]'
    const preview = `${tag} ${text}`
    const clientMsgId = `callrec_${cid}`
    const content = JSON.stringify({
      kind,
      callId: cid,
      reason: 'hangup',
      connected: wasConnected,
      durationSec: wasConnected ? durationSec : 0,
      mediaType: media,
      text,
      group: true,
    })

    publishLocalCallSystemTip({
      conversationId: convId,
      clientMsgId,
      content,
      preview,
    })
    try {
      useConversationInboxStore().notifyLocalMessage(convId, preview)
    } catch {
      /* ignore */
    }

    if (!persist) return

    try {
      await sendTextMessage({
        conversationId: convId,
        content,
        clientMsgId,
        msgType: 9,
      })
      try {
        useConversationInboxStore().notifyLocalMessage(convId, preview)
      } catch {
        /* ignore */
      }
    } catch {
      recordedCallIds.delete(cid)
    }
  }

  function showGroupCallEndedTip(raw: Record<string, unknown>) {
    const cid = String(raw.callId || callId.value || '')
    const convId = String(raw.conversationId || conversationId.value || '')
    if (!cid || !convId) return
    const media: CallMediaType =
      String(raw.mediaType || mediaType.value || '').toLowerCase() === 'video' ? 'video' : 'audio'
    const durationSec = Math.max(0, Number(raw.durationSec || elapsedSec.value || 0))
    const participantCount = Math.max(1, Number(raw.participantCount || maxParticipantCount || 1))
    void persistGroupCallTip({
      callId: cid,
      conversationId: convId,
      mediaType: media,
      durationSec,
      participantCount,
      persist: false,
    })
  }

  function leave(endForAll = false) {
    clearJoinRetry()
    stopCallRingtone()
    const cid = callId.value
    const convId = conversationId.value
    const media = mediaType.value
    const durationSec = elapsedSec.value
    const participantCount = maxParticipantCount
    const wasHost = isHost
    let endAll = endForAll

    const targets = new Set<string>()
    participants.value.forEach((p) => targets.add(uid(p.userId)))
    if (inviter.value) targets.add(uid(inviter.value.userId))
    availableMembers.value.forEach((m) => targets.add(uid(m.userId)))

    // 默认挂断 = 仅自己退出；仅显式 endForAll 才整场结束
    // 发起人离开时：若已有人在通话中，移交主持，方便其他人继续加入
    let newHostId = ''
    if (!endAll && wasHost) {
      const connected = participants.value.filter(
        (p) => p.state === 'connected' || p.state === 'connecting',
      )
      if (connected.length) {
        newHostId = uid(connected[0].userId)
      } else {
        // 还没人进房：发起人离开则结束邀请，避免无人主持的空响铃
        endAll = true
      }
    }

    const hasOthers = participants.value.some((p) => {
      const id = uid(p.userId)
      return id && id !== me()
    })

    // 整场真正结束时才落 tip：显式结束 / 发起人离开且无人进房 / 最后一人退出
    if ((endAll || !hasOthers) && cid && convId) {
      void reportGroupCallLog({
        callId: cid,
        conversationId: convId,
        mediaType: media,
        event: 'end',
        participantCount,
        durationSec,
      }).catch(() => {})
      void persistGroupCallTip({
        callId: cid,
        conversationId: convId,
        mediaType: media,
        durationSec,
        participantCount,
      })
    }

    const memberSnapshot = availableMembers.value.map((m) => ({
      userId: uid(m.userId),
      nickname: m.nickname,
      avatarUrl: m.avatarUrl || '',
    }))
    const pendingSnapshot = participants.value
      .filter((p) => p.state === 'invited' || p.state === 'ringing')
      .map((p) => ({
        userId: uid(p.userId),
        nickname: p.nickname,
        avatarUrl: p.avatarUrl || '',
      }))

    targets.forEach((id) => {
      if (!id || id === me()) return
      if (endAll) {
        signal(id, 'CALL_GROUP_END', {
          durationSec,
          participantCount,
          mediaType: media,
          conversationId: convId,
        })
        return
      }
      signal(id, 'CALL_GROUP_LEAVE', {
        reason: 'hangup',
        wasHost,
        ...(newHostId ? { newHostId } : {}),
        ...(wasHost
          ? {
              members: memberSnapshot,
              pendingMembers: pendingSnapshot,
              groupTitle: groupTitle.value,
              conversationId: conversationId.value,
              mediaType: mediaType.value,
            }
          : {}),
      })
    })
    reset()
  }

  function reset() {
    clearJoinRetry()
    stopCallRingtone()
    pcs.forEach((pc) => pc.close())
    pcs.clear()
    pendingIce.clear()
    disconnectTimers.forEach((value) => clearTimeout(value))
    disconnectTimers.clear()
    recentSignals.clear()
    localStream.value?.getTracks().forEach((track) => track.stop())
    localStream.value = null
    if (timer) clearInterval(timer)
    if (inviteRetryTimer) clearInterval(inviteRetryTimer)
    timer = null
    inviteRetryTimer = null
    elapsedSec.value = 0
    participants.value = []
    availableMembers.value = []
    inviter.value = null
    state.value = 'idle'
    callId.value = ''
    isHost = false
    maxParticipantCount = 1
  }

  function startTimer() {
    if (timer) return
    timer = setInterval(() => { elapsedSec.value += 1 }, 1000)
  }

  function toggleMute() {
    muted.value = !muted.value
    localStream.value?.getAudioTracks().forEach((track) => { track.enabled = !muted.value })
  }

  function toggleCamera() {
    cameraOn.value = !cameraOn.value
    localStream.value?.getVideoTracks().forEach((track) => { track.enabled = cameraOn.value })
  }

  async function handle(raw: Record<string, unknown>) {
    const cmd = String(raw.cmd || '')
    if (!GROUP_CMDS.has(cmd)) return
    const from = uid(raw.fromUserId)
    const sid = String(raw.callId || '')
    if (!from || from === me()) return
    // 去重时忽略 timestamp，避免合法重试被误伤；ICE 因 candidate 不同仍会通过
    const { timestamp: _ts, ...rest } = raw
    void _ts
    const fingerprint = `${cmd}|${sid}|${from}|${JSON.stringify(rest.sdp || rest.candidate || rest.member || rest.reason || '')}`
    const now = Date.now()
    const seenAt = recentSignals.get(fingerprint) || 0
    // JOIN/INVITE 需要更频繁重试；过严去重会导致 Offer 发失败后无法补发
    const dedupeMs = cmd === 'CALL_GROUP_JOIN' || cmd === 'CALL_GROUP_INVITE' ? 450 : 1_200
    if (now - seenAt < dedupeMs) return
    recentSignals.set(fingerprint, now)
    if (recentSignals.size > 300) {
      for (const [key, time] of recentSignals) {
        if (now - time > 10_000) recentSignals.delete(key)
      }
    }
    if (cmd === 'CALL_GROUP_INVITE') {
      if (visible.value && sid !== callId.value) {
        sendCallSignal({ cmd: 'CALL_GROUP_LEAVE' as never, callId: sid, toUserId: from, reason: 'busy' })
        return
      }
      // 发起方自己已在通话中：只回 RINGING，绝不播铃
      if (visible.value && sid === callId.value) {
        signal(from, 'CALL_GROUP_RINGING')
        return
      }
      if (!visible.value) {
        isHost = false
        callId.value = sid
        conversationId.value = String(raw.conversationId || '')
        groupTitle.value = String(raw.groupTitle || '群聊')
        mediaType.value = String(raw.mediaType) === 'video' ? 'video' : 'audio'
        inviter.value = {
          userId: from,
          nickname: String(raw.fromNickname || '群成员'),
          avatarUrl: String(raw.fromAvatarUrl || ''),
        }
        participants.value = []
        const allMembers = Array.isArray(raw.allMembers)
          ? raw.allMembers as GroupCallMember[]
          : []
        availableMembers.value = allMembers
          .map((m) => ({ ...m, userId: uid(m.userId) }))
          .filter((m) => m.userId && m.userId !== me())
        const members = Array.isArray(raw.members) ? raw.members as GroupCallMember[] : []
        members.forEach((m) => {
          const id = uid(m.userId)
          if (id && id !== me()) upsert({ ...m, userId: id })
        })
        upsert(inviter.value, 'ringing')
        state.value = 'incoming'
        // 群来电弹系统通知：锁屏/后台也能看到
        void notifyIncomingCall({
          callId: sid,
          nickname: String(raw.fromNickname || '群成员'),
          mediaType: String(raw.mediaType) === 'video' ? 'video' : 'audio',
          group: true,
          title: String(raw.groupTitle || '群聊'),
        })
        unlockCallRingtoneAudio()
        void startCallRingtone()
        window.setTimeout(() => {
          if (state.value === 'incoming') {
            unlockCallRingtoneAudio()
            void startCallRingtone()
          }
        }, 120)
      }
      signal(from, 'CALL_GROUP_RINGING')
      return
    }
    if (sid !== callId.value) return
    if (cmd === 'CALL_GROUP_RINGING') {
      const p = participants.value.find((item) => uid(item.userId) === from)
      // 勿把已加入/通话中的成员打回响铃
      if (p && (p.state === 'invited' || p.state === 'ringing')) {
        patchParticipant(from, { state: 'ringing' })
      }
    } else if (cmd === 'CALL_GROUP_JOIN') {
      clearJoinRetry()
      const member = (raw.member || {}) as GroupCallMember
      const existing = participants.value.filter((p) =>
        uid(p.userId) !== from &&
        uid(p.userId) !== me() &&
        (p.state === 'connected' || p.state === 'connecting'),
      )
      upsert({
        userId: from,
        nickname: member.nickname || String(raw.fromNickname || '群成员'),
        avatarUrl: member.avatarUrl || '',
      }, 'connecting')
      // 任意已加入成员都可以邀请新人；邀请人负责把新人接入现有网状通话。
      const joined = participants.value.find((p) => uid(p.userId) === from)
      if (joined) {
        existing.forEach((peer) => {
          signal(uid(peer.userId), 'CALL_GROUP_MEMBER_JOINED', {
            member: { userId: joined.userId, nickname: joined.nickname, avatarUrl: joined.avatarUrl },
            shouldOffer: true,
          })
          signal(from, 'CALL_GROUP_MEMBER_JOINED', {
            member: { userId: peer.userId, nickname: peer.nickname, avatarUrl: peer.avatarUrl },
            shouldOffer: false,
          })
        })
      }
      await offerTo(from)
    } else if (cmd === 'CALL_GROUP_MEMBER_JOINED') {
      const member = (raw.member || {}) as GroupCallMember
      const peerId = uid(member.userId)
      if (!peerId || peerId === me()) return
      upsert({
        userId: peerId,
        nickname: member.nickname || '群成员',
        avatarUrl: member.avatarUrl || '',
      }, 'connecting')
      if (raw.shouldOffer === true || raw.shouldOffer === 'true') await offerTo(peerId)
    } else if (cmd === 'CALL_GROUP_OFFER') {
      clearJoinRetry()
      const pc = await pcFor(from)
      if (pc.signalingState === 'have-local-offer') {
        if (me().localeCompare(from) < 0) return
        await pc.setLocalDescription({ type: 'rollback' })
      }
      await pc.setRemoteDescription({ type: 'offer', sdp: String(raw.sdp || '') })
      await flushIce(from, pc)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      signal(from, 'CALL_GROUP_ANSWER', { sdp: answer.sdp })
      patchParticipant(from, { state: 'connecting' })
    } else if (cmd === 'CALL_GROUP_ANSWER') {
      const pc = await pcFor(from)
      if (pc.signalingState !== 'have-local-offer') return
      await pc.setRemoteDescription({ type: 'answer', sdp: String(raw.sdp || '') })
      await flushIce(from, pc)
      patchParticipant(from, { state: 'connecting' })
    } else if (cmd === 'CALL_GROUP_ICE') {
      const candidate = raw.candidate as RTCIceCandidateInit
      const pc = pcs.get(from)
      if (pc?.remoteDescription) await pc.addIceCandidate(candidate).catch(() => {})
      else pendingIce.set(from, [...(pendingIce.get(from) || []), candidate])
    } else if (cmd === 'CALL_GROUP_LEAVE') {
      const newHostId = uid(raw.newHostId)
      const leftWasHost = raw.wasHost === true || raw.wasHost === 'true'
      removePeer(from)

      if (Array.isArray(raw.members) && raw.members.length) {
        availableMembers.value = (raw.members as GroupCallMember[])
          .map((m) => ({
            userId: uid(m.userId),
            nickname: m.nickname || '群成员',
            avatarUrl: m.avatarUrl || '',
          }))
          .filter((m) => m.userId && m.userId !== me())
      }
      if (Array.isArray(raw.pendingMembers)) {
        ;(raw.pendingMembers as GroupCallMember[]).forEach((m) => {
          const id = uid(m.userId)
          if (!id || id === me()) return
          const exists = participants.value.some((p) => uid(p.userId) === id)
          if (!exists) upsert({ ...m, userId: id }, 'invited')
        })
      }

      if (newHostId && newHostId === me()) {
        // 接过主持：继续邀请未接听成员，并处理后续 JOIN
        isHost = true
        inviter.value = null
        startInviteRetry()
      } else if (newHostId) {
        const hostPeer = participants.value.find((p) => uid(p.userId) === newHostId)
        const nextInviter = {
          userId: newHostId,
          nickname: hostPeer?.nickname || String(raw.fromNickname || '群成员'),
          avatarUrl: hostPeer?.avatarUrl || '',
        }
        // 来电方改向新主持 JOIN，才能在发起人离开后仍可加入
        if (!isHost && (uid(inviter.value?.userId) === from || leftWasHost)) {
          inviter.value = nextInviter
        }
      } else if (leftWasHost && state.value === 'incoming') {
        // 发起人离开且无人可接主持 → 结束来电
        showToast('群通话已结束')
        reset()
      }
    } else if (cmd === 'CALL_GROUP_END') {
      // 未接听就结束→“未接群语音”；已加入→清除来电通知
      const wasIncoming = state.value === 'incoming'
      if (callId.value) {
        if (wasIncoming) {
          void notifyMissedCall({
            callId: callId.value,
            nickname: inviter.value?.nickname,
            mediaType: mediaType.value,
            group: true,
            title: groupTitle.value,
          })
        } else {
          void clearCallNotification(callId.value, true)
        }
      }
      showGroupCallEndedTip(raw)
      showToast('群通话已结束')
      reset()
    }
  }

  function startBridge() {
    if (started) return
    started = true
    unsub = onWsMessage((data) => {
      const raw = data as Record<string, unknown>
      if (isCallSignalCmd(String(raw.cmd || ''))) void handle(raw)
    })
  }

  function stopBridge() {
    unsub?.()
    unsub = null
    started = false
    reset()
  }

  return {
    callId, conversationId, groupTitle, mediaType, state, participants, availableMembers,
    localStream, muted, cameraOn, elapsedSec, inviter, visible, isVideo, connectedCount,
    startBridge, stopBridge, startGroupCall, inviteMembers, accept, reject, leave,
    toggleMute, toggleCamera,
  }
})

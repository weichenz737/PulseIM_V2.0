import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { showToast } from 'vant'
import { onWsMessage, isCallSignalCmd, sendCallSignal, ensureWsReady, ensureSignalAfterMedia } from '@/im/ws'
import {
  newCallId,
  VoiceCallSession,
  discardWarmedCallMedia,
  type CallMediaType,
  type VoiceCallRole,
  type VoicePeerInfo,
} from '@/im/voiceCallSession'
import { useUserStore } from '@/stores/user'
import { sendTextMessage } from '@/api/message'
import { openPrivateConversation } from '@/api/conversation'
import { useConversationInboxStore } from '@/stores/conversationInbox'
import {
  startCallRingtone,
  startPeerCallRingtone,
  stopCallRingtone,
  keepCallRingtoneAlive,
  prepareCallRingtoneForMic,
  isCallRingtonePlaying,
  unlockCallRingtoneAudio,
} from '@/utils/callRingtone'
import { publishLocalCallSystemTip } from '@/utils/callSystemTip'
import {
  clearCallNotification,
  notifyIncomingCall,
  notifyMissedCall,
} from '@/native/callNotification'

export type CallUiState = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'connected'

const RING_TIMEOUT_MS = 45000
/** 最近已结束/取消的通话 callId，抑制乱序到达的迟到来电 */
const CANCELLED_CALL_TTL_MS = 90000
/** 接听后 ICE/媒体未连通的超时（视频打开摄像头较慢，略放宽） */
const CONNECTING_TIMEOUT_MS = 30000
const CONNECT_FAIL_TOAST = '无法接通，请检查网络后重试'
const cancelledCallIds = new Map<string, number>()

function rememberCancelledCall(id: string) {
  if (!id) return
  cancelledCallIds.set(id, Date.now())
  if (cancelledCallIds.size > 20) {
    const now = Date.now()
    for (const [key, at] of cancelledCallIds) {
      if (now - at > CANCELLED_CALL_TTL_MS) cancelledCallIds.delete(key)
    }
  }
}

function isCallCancelled(id: string): boolean {
  if (!id) return false
  const at = cancelledCallIds.get(id)
  if (at == null) return false
  if (Date.now() - at > CANCELLED_CALL_TTL_MS) {
    cancelledCallIds.delete(id)
    return false
  }
  return true
}

function formatCallDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

function callRecordText(
  reason: string,
  wasConnected: boolean,
  durationSec: number,
): string | null {
  if (reason === 'stop') return null
  if (wasConnected) {
    return `通话时长 ${formatCallDuration(durationSec)}`
  }
  switch (reason) {
    case 'rejected':
      // 通话记录只由主叫方落库并推送到共享聊天，两侧都会看到；
      // 文案必须中性，否则被叫方（拒绝者）会看到“对方已拒绝”。
      return '通话已拒绝'
    case 'timeout':
      return '未接听'
    case 'busy':
      return '对方忙线中'
    case 'unavailable':
      return '对方不在线'
    case 'mic_denied':
    case 'camera_denied':
    case 'ws_closed':
    case 'hangup':
    case 'peer_hangup':
      return '通话已取消'
    case 'error':
      return '通话中断'
    default:
      return '通话已结束'
  }
}

function normalizeMediaType(raw: unknown): CallMediaType {
  return String(raw || '').toLowerCase() === 'video' ? 'video' : 'audio'
}

export const useVoiceCallStore = defineStore('voiceCall', () => {
  const uiState = ref<CallUiState>('idle')
  const callId = ref('')
  const peer = ref<VoicePeerInfo | null>(null)
  const mediaType = ref<CallMediaType>('audio')
  const muted = ref(false)
  const cameraOn = ref(true)
  /** 本地预览朝向：user 前置（镜像），environment 后置 */
  const cameraFacing = ref<'user' | 'environment'>('user')
  const speakerOn = ref(true)
  const statusText = ref('')
  const connectedAt = ref(0)
  const elapsedSec = ref(0)
  const remoteStream = shallowRef<MediaStream | null>(null)
  const localStream = shallowRef<MediaStream | null>(null)

  let session: VoiceCallSession | null = null
  let callRole: VoiceCallRole | null = null
  let ringTimer: ReturnType<typeof setTimeout> | null = null
  let connectingTimer: ReturnType<typeof setTimeout> | null = null
  let elapsedTimer: ReturnType<typeof setInterval> | null = null
  let unsubWs: (() => void) | null = null
  let started = false
  let pendingOfferSdp: string | null = null
  /** 主叫：对方已接听但本端摄像头/PC 尚未就绪 */
  let pendingAccept = false
  /** 主叫：本通话是否已发出 Offer */
  let offerSent = false
  /** 主叫：是否已收到 Answer */
  let answerReceived = false
  /** 被叫：是否已处理过远端 Offer */
  let offerHandled = false
  let inviteRetryTimer: ReturnType<typeof setInterval> | null = null
  let acceptRetryTimer: ReturnType<typeof setInterval> | null = null
  let offerRetryTimer: ReturnType<typeof setInterval> | null = null
  const recordedCallIds = new Set<string>()

  const visible = computed(() => uiState.value !== 'idle')
  const isBusy = computed(() => uiState.value !== 'idle')
  const isVideo = computed(() => mediaType.value === 'video')

  function clearRingTimer() {
    if (ringTimer) {
      clearTimeout(ringTimer)
      ringTimer = null
    }
  }

  function clearInviteRetry() {
    if (inviteRetryTimer) {
      clearInterval(inviteRetryTimer)
      inviteRetryTimer = null
    }
  }

  function clearAcceptRetry() {
    if (acceptRetryTimer) {
      clearInterval(acceptRetryTimer)
      acceptRetryTimer = null
    }
  }

  function clearOfferRetry() {
    if (offerRetryTimer) {
      clearInterval(offerRetryTimer)
      offerRetryTimer = null
    }
  }

  function clearConnectingTimer() {
    if (connectingTimer) {
      clearTimeout(connectingTimer)
      connectingTimer = null
    }
  }

  function startConnectingTimer() {
    clearConnectingTimer()
    connectingTimer = setTimeout(() => {
      connectingTimer = null
      if (uiState.value === 'connecting') {
        showToast(CONNECT_FAIL_TOAST)
        hangupLocal('error', true)
      }
    }, CONNECTING_TIMEOUT_MS)
  }

  function clearElapsedTimer() {
    if (elapsedTimer) {
      clearInterval(elapsedTimer)
      elapsedTimer = null
    }
  }

  function startElapsed() {
    clearElapsedTimer()
    connectedAt.value = Date.now()
    elapsedSec.value = 0
    elapsedTimer = setInterval(() => {
      elapsedSec.value = Math.floor((Date.now() - connectedAt.value) / 1000)
    }, 500)
  }

  function resetUi() {
    clearRingTimer()
    clearInviteRetry()
    clearAcceptRetry()
    clearOfferRetry()
    clearConnectingTimer()
    clearElapsedTimer()
    stopCallRingtone()
    uiState.value = 'idle'
    callId.value = ''
    peer.value = null
    mediaType.value = 'audio'
    muted.value = false
    cameraOn.value = true
    cameraFacing.value = 'user'
    speakerOn.value = true
    statusText.value = ''
    connectedAt.value = 0
    elapsedSec.value = 0
    remoteStream.value = null
    localStream.value = null
    session = null
    callRole = null
    pendingOfferSdp = null
    pendingAccept = false
    offerSent = false
    answerReceived = false
    offerHandled = false
  }

  function bindSession(s: VoiceCallSession) {
    session = s
    callRole = s.role
  }

  function startOfferRetry() {
    clearOfferRetry()
    let n = 0
    offerRetryTimer = setInterval(() => {
      n += 1
      if (answerReceived || uiState.value === 'connected' || uiState.value === 'idle') {
        clearOfferRetry()
        return
      }
      if (n > 8 || !session || uiState.value !== 'connecting') {
        clearOfferRetry()
        return
      }
      // 只重发同一份 Offer，不重新 createOffer
      if (!session.resendLocalOffer()) {
        offerSent = false
        void trySendOffer()
      }
    }, 1600)
  }

  async function trySendOffer() {
    if (!session || !session.isPcReady) return
    if (answerReceived) return
    if (offerSent) return
    if (uiState.value !== 'connecting' && uiState.value !== 'outgoing') return
    if (uiState.value !== 'connecting') {
      stopCallRingtone()
      uiState.value = 'connecting'
      startConnectingTimer()
    }
    statusText.value = '正在接通...'
    pendingAccept = false
    offerSent = true
    const ok = await session.createAndSendOffer()
    if (!ok) {
      offerSent = false
      return
    }
    startOfferRetry()
  }

  function sendAcceptSignal() {
    if (!peer.value || !callId.value) return
    sendCallSignal({
      cmd: 'CALL_ACCEPT',
      callId: callId.value,
      toUserId: peer.value.userId,
      mediaType: mediaType.value,
    })
  }

  /** 被叫：重复发 ACCEPT，直到收到 Offer（解决主叫仍停在「正在呼叫」） */
  function startAcceptRetry() {
    clearAcceptRetry()
    let n = 0
    acceptRetryTimer = setInterval(() => {
      n += 1
      if (offerHandled || uiState.value === 'idle' || uiState.value === 'connected') {
        clearAcceptRetry()
        return
      }
      if (n > 8) {
        clearAcceptRetry()
        return
      }
      if (uiState.value === 'connecting') {
        sendAcceptSignal()
      }
    }, 1200)
  }

  /** 主叫：重复发 INVITE，直到收到响铃/接听 */
  function startInviteRetry(payload: {
    callId: string
    toUserId: string
    fromNickname: string
    fromAvatarUrl: string
    conversationId?: string
    mediaType: CallMediaType
  }) {
    clearInviteRetry()
    let n = 0
    inviteRetryTimer = setInterval(() => {
      n += 1
      if (uiState.value !== 'outgoing' || n > 6) {
        clearInviteRetry()
        return
      }
      sendCallSignal({
        cmd: 'CALL_INVITE',
        callId: payload.callId,
        toUserId: payload.toUserId,
        fromNickname: payload.fromNickname,
        fromAvatarUrl: payload.fromAvatarUrl,
        conversationId: payload.conversationId,
        mediaType: payload.mediaType,
      })
    }, 2000)
  }

  function makeSession(role: VoiceCallRole, id: string, peerInfo: VoicePeerInfo, mt: CallMediaType) {
    const userStore = useUserStore()
    const selfId = String(userStore.userId || '')
    return new VoiceCallSession({
      callId: id,
      role,
      peer: peerInfo,
      selfUserId: selfId,
      mediaType: mt,
        hooks: {
        onLocalStream: (stream) => {
          localStream.value = stream
          if (session) {
            cameraFacing.value = session.cameraFacing
            cameraOn.value = session.cameraOn
          }
        },
        onRemoteStream: (stream) => {
          remoteStream.value = stream
        },
        onError: (msg) => {
          if (uiState.value === 'idle') return
          // 信令抖动不再误杀整通；仅媒体/致命错误才挂断
          const text = String(msg || '')
          if (text.includes('信令')) {
            console.warn('[Pulse Call]', text)
            return
          }
          showToast(msg || CONNECT_FAIL_TOAST)
          hangupLocal('error', true)
        },
        onEnded: () => {
          /* hangup / peerGone 已显式处理 */
        },
        onPeerDisconnected: () => {
          if (uiState.value === 'idle') return
          // 仅「已通话中」才用 WebRTC 断开兜底；接通前交给超时/信令
          if (uiState.value !== 'connected') return
          showToast('通话已结束')
          hangupLocal('peer_hangup', false)
        },
        onState: (st) => {
          if (st === 'connected') {
            if (uiState.value !== 'connected') {
              clearConnectingTimer()
              stopCallRingtone()
              uiState.value = 'connected'
              statusText.value = '通话中'
              startElapsed()
            }
          }
        },
      },
    })
  }

  async function resolveConversationId(peerInfo: VoicePeerInfo): Promise<string | null> {
    if (peerInfo.conversationId) return peerInfo.conversationId
    try {
      const conv = await openPrivateConversation(peerInfo.userId)
      return conv.id
    } catch {
      return null
    }
  }

  /** 写入会话系统消息；主叫负责落库，双方立刻本地插入 tip */
  async function persistCallRecord(opts: {
    callId: string
    reason: string
    role: VoiceCallRole | null
    wasConnected: boolean
    durationSec: number
    peerInfo: VoicePeerInfo
    media: CallMediaType
  }) {
    const { callId: cid, reason, role, wasConnected, durationSec, peerInfo, media } = opts
    if (!cid || recordedCallIds.has(cid)) return

    const text = callRecordText(reason, wasConnected, durationSec)
    if (!text) return

    recordedCallIds.add(cid)
    const kind = media === 'video' ? 'video_call' : 'voice_call'
    const previewTag = media === 'video' ? '[视频通话]' : '[语音通话]'
    const clientMsgId = `callrec_${cid}`
    const payload = JSON.stringify({
      kind,
      callId: cid,
      reason,
      role,
      connected: wasConnected,
      durationSec: wasConnected ? durationSec : 0,
      peerUserId: peerInfo.userId,
      mediaType: media,
      text,
    })
    const preview = `${previewTag} ${text}`

    // 有会话 id 时立刻出现在当前聊天页，不等 HTTP/WS
    if (peerInfo.conversationId) {
      publishLocalCallSystemTip({
        conversationId: peerInfo.conversationId,
        clientMsgId,
        content: payload,
        preview,
      })
      try {
        useConversationInboxStore().notifyLocalMessage(peerInfo.conversationId, preview)
      } catch {
        /* ignore */
      }
    }

    // 仅主叫落库，避免双边各写一条；被叫已本地展示，等主叫推送去重升级即可
    if (role !== 'caller') return

    const conversationId = await resolveConversationId(peerInfo)
    if (!conversationId) {
      recordedCallIds.delete(cid)
      return
    }

    // 若先前没有 conversationId（刚开聊），补一次本地 tip
    if (!peerInfo.conversationId) {
      publishLocalCallSystemTip({
        conversationId,
        clientMsgId,
        content: payload,
        preview,
      })
      try {
        useConversationInboxStore().notifyLocalMessage(conversationId, preview)
      } catch {
        /* ignore */
      }
    }

    try {
      await sendTextMessage({
        conversationId,
        toUserId: peerInfo.userId,
        content: payload,
        clientMsgId,
        msgType: 9,
      })
      try {
        useConversationInboxStore().notifyLocalMessage(conversationId, preview)
      } catch {
        /* ignore */
      }
    } catch {
      recordedCallIds.delete(cid)
    }
  }

  function hangupLocal(reason: string, notifyPeer: boolean) {
    // 幂等：避免 HANGUP 信令与 WebRTC 断开兜底重复收尾
    if (uiState.value === 'idle' && !session) return

    discardWarmedCallMedia()

    const cur = session
    const id = callId.value
    const peerInfo = peer.value
    const role = callRole
    const media = mediaType.value
    const wasConnected = uiState.value === 'connected' || (connectedAt.value > 0 && elapsedSec.value > 0)
    const duration = wasConnected
      ? elapsedSec.value || Math.floor((Date.now() - connectedAt.value) / 1000)
      : 0
    // 来电通知收尾：已接通或主动拒绝→清除；未接→更新为“未接来电”。
    if (role === 'callee' && id && peerInfo) {
      if (wasConnected || reason === 'rejected' || reason === 'busy') {
        void clearCallNotification(id)
      } else {
        void notifyMissedCall({
          callId: id,
          nickname: peerInfo.nickname,
          mediaType: media,
        })
      }
    }
    // 本地挂断后记住该 callId，避免迟到的重复邀请重新弹出来电
    if (id) rememberCancelledCall(id)

    clearRingTimer()
    stopCallRingtone()
    if (notifyPeer && id && peerInfo?.userId) {
      const payload = {
        cmd: 'CALL_HANGUP' as const,
        callId: id,
        toUserId: peerInfo.userId,
        reason,
        mediaType: media,
      }
      // 连发几次，降低对方收不到挂断信令后一直停在通话中的概率
      const burst = () => {
        sendCallSignal(payload)
      }
      burst()
      let n = 0
      const timer = setInterval(() => {
        n += 1
        burst()
        if (n >= 3) clearInterval(timer)
      }, 320)
    }
    cur?.close(reason)
    resetUi()

    if (id && peerInfo) {
      void persistCallRecord({
        callId: id,
        reason,
        role,
        wasConnected,
        durationSec: duration,
        peerInfo,
        media,
      })
    }
  }

  function mediaDeniedReason(err: unknown, mt: CallMediaType): string {
    // 不用 instanceof：Safari 跨上下文时 DOMException 检测会失败，误报「媒体初始化失败」
    const name = String((err as { name?: string })?.name || '')
    const msg = String((err as { message?: string })?.message || '').toLowerCase()
    if (
      name === 'NotAllowedError' ||
      name === 'PermissionDeniedError' ||
      name === 'NotFoundError' ||
      name === 'NotReadableError' ||
      name === 'OverconstrainedError' ||
      name === 'AbortError' ||
      name === 'SecurityError' ||
      msg.includes('permission') ||
      msg.includes('not allowed') ||
      msg.includes('could not start') ||
      msg.includes('device in use')
    ) {
      if (mt === 'video') return 'camera_denied'
      return 'mic_denied'
    }
    if (mt === 'video') return 'camera_denied'
    return 'mic_denied'
  }

  function mediaDeniedToast(mt: CallMediaType, reason: string) {
    if (reason === 'camera_denied' || mt === 'video') {
      showToast('无法使用摄像头或麦克风')
    } else {
      showToast('无法使用麦克风')
    }
  }

  async function startOutgoing(
    peerInfo: VoicePeerInfo,
    mt: CallMediaType = 'audio',
    opts?: { skipRingtone?: boolean },
  ) {
    if (isBusy.value) {
      showToast('当前正在通话中')
      return
    }
    const userStore = useUserStore()
    if (!userStore.userId) {
      showToast('请先登录')
      return
    }
    if (!peerInfo.userId) {
      showToast('无法发起通话')
      return
    }
    if (String(peerInfo.userId) === String(userStore.userId)) {
      showToast('不能给自己打电话')
      return
    }

    // iOS：铃声须在 await 前同步起播；开麦与信令并行（仅一路 getUserMedia，禁止预热双开）
    const id = newCallId()
    callId.value = id
    peer.value = peerInfo
    mediaType.value = mt
    uiState.value = 'outgoing'
    statusText.value = mt === 'video' ? '正在打开摄像头...' : '正在呼叫...'
    // Android 打开麦克风/摄像头时会重新分配音频焦点。先起铃会在
    // 权限弹窗或 getUserMedia 完成时出现一次断音，因此等媒体稳定后再播放。
    const deferRingtoneUntilMedia = /Android/i.test(navigator.userAgent || '')
    let outgoingRingtoneStarted = false
    const startOutgoingRingtone = () => {
      if (outgoingRingtoneStarted || opts?.skipRingtone) return
      outgoingRingtoneStarted = startPeerCallRingtone(peerInfo.userId)
    }
    unlockCallRingtoneAudio()
    prepareCallRingtoneForMic()
    if (!deferRingtoneUntilMedia) startOutgoingRingtone()

    const s = makeSession('caller', id, peerInfo, mt)
    bindSession(s)
    const mediaTask = (async () => {
      prepareCallRingtoneForMic()
      await s.prepareMediaAndPc()
      prepareCallRingtoneForMic()
      if (deferRingtoneUntilMedia) {
        // Android resolves getUserMedia before its audio focus/device route is
        // fully settled. Starting ringback immediately is audible as a short
        // cut when the route switches a moment later.
        await new Promise<void>((resolve) => window.setTimeout(resolve, 1500))
        if (
          callId.value === id &&
          (uiState.value === 'outgoing' || uiState.value === 'connecting')
        ) {
          startOutgoingRingtone()
        }
      }
      void keepCallRingtoneAlive()
    })()

    // 先发 INVITE（可入队），再并行补会话/等 WS — 避免被叫层等开会话+AUTH
    const invitePayload = {
      callId: id,
      toUserId: peerInfo.userId,
      fromNickname: userStore.nickname || '用户',
      fromAvatarUrl: userStore.avatar || '',
      conversationId: peerInfo.conversationId,
      mediaType: mt,
    }
    sendCallSignal({
      cmd: 'CALL_INVITE',
      ...invitePayload,
    })
    startInviteRetry(invitePayload)
    void keepCallRingtoneAlive()
    if (!deferRingtoneUntilMedia && !isCallRingtonePlaying()) startOutgoingRingtone()

    if (!peerInfo.conversationId) {
      void openPrivateConversation(peerInfo.userId)
        .then((conv) => {
          if (callId.value !== id) return
          peerInfo = { ...peerInfo, conversationId: conv.id }
          peer.value = peerInfo
          invitePayload.conversationId = conv.id
        })
        .catch(() => {
          /* 稍后落库时再试 */
        })
    }

    void (async () => {
      let wsOk = await ensureWsReady(userStore.token, 10000)
      if (!wsOk) {
        await new Promise((r) => setTimeout(r, 600))
        wsOk = await ensureWsReady(userStore.token, 8000)
      }
      if (!wsOk && (uiState.value === 'outgoing' || uiState.value === 'connecting') && callId.value === id) {
        showToast('信令未连接，请检查网络后重试')
        hangupLocal('ws_closed', false)
      }
    })()

    ringTimer = setTimeout(() => {
      if (uiState.value === 'outgoing' || uiState.value === 'connecting') {
        showToast('对方无应答')
        hangupLocal('timeout', true)
      }
    }, RING_TIMEOUT_MS)

    try {
      await mediaTask
      if (uiState.value !== 'outgoing' && uiState.value !== 'connecting') return
      const signalOk = await ensureSignalAfterMedia(userStore.token)
      if (!signalOk) {
        showToast('信令连接已断开，请稍后重试')
        hangupLocal('ws_closed', true)
        return
      }
      void keepCallRingtoneAlive()
      cameraOn.value = mt !== 'video' ? true : s.cameraOn
      cameraFacing.value = s.cameraFacing
      if (uiState.value === 'outgoing') statusText.value = '正在呼叫...'
      else if (uiState.value === 'connecting') statusText.value = '正在接通...'
      if (pendingAccept) void trySendOffer()
    } catch (err) {
      const reason = mediaDeniedReason(err, mt)
      mediaDeniedToast(mt, reason)
      hangupLocal(reason, true)
      return
    }
  }

  async function acceptIncoming() {
    if (uiState.value !== 'incoming' || !session || !peer.value) return
    const userStore = useUserStore()
    const mt = mediaType.value
    // 已接听：清掉来电通知
    if (callId.value) void clearCallNotification(callId.value)

    // iOS：接听手势栈内立刻停铃并启动开麦，绝不能先 await WS
    clearRingTimer()
    stopCallRingtone()
    unlockCallRingtoneAudio()
    prepareCallRingtoneForMic()
    uiState.value = 'connecting'
    statusText.value = mt === 'video' ? '正在打开摄像头...' : '正在接通...'
    startConnectingTimer()

    const mediaTask = session.prepareMediaAndPc()

    // 先通知主叫「已接听」，再等媒体（与开麦并行）
    sendAcceptSignal()
    startAcceptRetry()

    try {
      const wsOk = await ensureWsReady(userStore.token)
      if (!wsOk) {
        showToast('信令未连接，请检查网络后重试')
        hangupLocal('ws_closed', false)
        return
      }
      await mediaTask
      const signalOk = await ensureSignalAfterMedia(userStore.token)
      if (!signalOk) {
        showToast('信令连接已断开，请稍后重试')
        sendCallSignal({
          cmd: 'CALL_REJECT',
          callId: callId.value,
          toUserId: peer.value.userId,
          reason: 'ws_closed',
          mediaType: mt,
        })
        hangupLocal('ws_closed', false)
        return
      }
      cameraOn.value = mt !== 'video' ? true : session.cameraOn
      cameraFacing.value = session.cameraFacing
      statusText.value = '正在接通...'
      // 重连后补发 ACCEPT，避免主叫漏接
      sendAcceptSignal()
    } catch (err) {
      const reason = mediaDeniedReason(err, mt)
      mediaDeniedToast(mt, reason)
      sendCallSignal({
        cmd: 'CALL_REJECT',
        callId: callId.value,
        toUserId: peer.value.userId,
        reason,
        mediaType: mt,
      })
      hangupLocal(reason, false)
      return
    }

    if (pendingOfferSdp && session?.isPcReady) {
      const sdp = pendingOfferSdp
      pendingOfferSdp = null
      void (async () => {
        const ok = await session!.handleRemoteOffer(sdp)
        if (ok) {
          offerHandled = true
          clearAcceptRetry()
        }
      })()
    }
  }

  function rejectIncoming() {
    if (uiState.value !== 'incoming' || !peer.value) return
    sendCallSignal({
      cmd: 'CALL_REJECT',
      callId: callId.value,
      toUserId: peer.value.userId,
      mediaType: mediaType.value,
    })
    hangupLocal('rejected', false)
  }

  function hangup() {
    if (uiState.value === 'idle') return
    hangupLocal('hangup', true)
  }

  function toggleMute() {
    if (!session) return
    const next = !muted.value
    session.setMuted(next)
    muted.value = next
  }

  function toggleCamera() {
    if (!session || mediaType.value !== 'video') return
    const next = !cameraOn.value
    session.setCameraEnabled(next)
    cameraOn.value = next
  }

  async function flipCamera() {
    if (!session || mediaType.value !== 'video' || uiState.value === 'incoming') return
    const ok = await session.switchCamera()
    if (!ok) {
      showToast('无法切换摄像头')
      return
    }
    cameraFacing.value = session.cameraFacing
    cameraOn.value = session.cameraOn
  }

  function toggleSpeaker() {
    speakerOn.value = !speakerOn.value
  }

  function handleSignal(raw: Record<string, unknown>) {
    const cmd = String(raw.cmd || '')
    if (!isCallSignalCmd(cmd)) return

    const sid = String(raw.callId || '')
    const fromUserId = String(raw.fromUserId || '')
    const toUserId = String(raw.toUserId || '')
    const userStore = useUserStore()
    const me = String(userStore.userId || '')

    if (fromUserId && fromUserId === me && cmd === 'CALL_INVITE') return

    if (cmd === 'CALL_INVITE') {
      // 挂断/拒绝信令先于来电到达时（乱序/跨通道），直接忽略迟到的邀请
      if (sid && isCallCancelled(sid)) return
      if (
        sid &&
        callId.value === sid &&
        (uiState.value === 'incoming' ||
          uiState.value === 'connecting' ||
          uiState.value === 'connected')
      ) {
        return
      }
      if (isBusy.value) {
        sendCallSignal({
          cmd: 'CALL_BUSY',
          callId: sid,
          toUserId: fromUserId,
        })
        return
      }
      const mt = normalizeMediaType(raw.mediaType)
      const peerInfo: VoicePeerInfo = {
        userId: fromUserId,
        nickname: String(raw.fromNickname || '用户'),
        avatarUrl: String(raw.fromAvatarUrl || ''),
        conversationId: raw.conversationId != null ? String(raw.conversationId) : undefined,
      }
      callId.value = sid
      peer.value = peerInfo
      mediaType.value = mt
      uiState.value = 'incoming'
      statusText.value = mt === 'video' ? '邀请你视频通话' : '邀请你语音通话'
      // 来电弹系统通知：锁屏/后台也能看到来电提醒
      void notifyIncomingCall({ callId: sid, nickname: peerInfo.nickname, mediaType: mt })
      // 来电：依赖此前页面手势已解锁 AudioContext；无缓存时走本地合成回铃
      unlockCallRingtoneAudio()
      void startCallRingtone()
      window.setTimeout(() => {
        if (uiState.value === 'incoming') {
          unlockCallRingtoneAudio()
          void keepCallRingtoneAlive()
          if (!isCallRingtonePlaying()) void startCallRingtone()
        }
      }, 80)
      window.setTimeout(() => {
        if (uiState.value === 'incoming') void keepCallRingtoneAlive()
      }, 320)
      const s = makeSession('callee', sid, peerInfo, mt)
      bindSession(s)
      sendCallSignal({
        cmd: 'CALL_RINGING',
        callId: sid,
        toUserId: fromUserId,
        mediaType: mt,
      })
      ringTimer = setTimeout(() => {
        if (uiState.value === 'incoming') {
          sendCallSignal({
            cmd: 'CALL_REJECT',
            callId: sid,
            toUserId: fromUserId,
            reason: 'timeout',
            mediaType: mt,
          })
          hangupLocal('timeout', false)
        }
      }, RING_TIMEOUT_MS)
      return
    }

    if (sid && callId.value && sid !== callId.value) return

    if (cmd === 'CALL_RINGING') {
      if (uiState.value === 'outgoing') {
        clearInviteRetry()
        statusText.value = '对方响铃中...'
      }
      return
    }

    if (cmd === 'CALL_BUSY') {
      if (sid) rememberCancelledCall(sid)
      showToast('对方忙线中')
      hangupLocal('busy', false)
      return
    }

    if (cmd === 'CALL_REJECT') {
      if (sid) rememberCancelledCall(sid)
      // 仅主叫且通话仍在进行时提示“对方已拒绝”；
      // 被叫收到自己拒绝信令的回显时忽略，避免显示错误文案。
      if (callId.value === sid && (uiState.value === 'outgoing' || uiState.value === 'connecting')) {
        showToast('对方已拒绝')
        hangupLocal('rejected', false)
      }
      return
    }

    if (cmd === 'CALL_UNAVAILABLE') {
      if (sid) rememberCancelledCall(sid)
      // 刷新重连窗口期可能误报；若仍在呼叫中则忽略，交给响铃超时处理
      if (uiState.value === 'outgoing' || uiState.value === 'connecting') {
        statusText.value = '正在呼叫...'
        return
      }
      showToast('对方不在线')
      hangupLocal('unavailable', false)
      return
    }

    if (cmd === 'CALL_ERROR') {
      if (sid) rememberCancelledCall(sid)
      showToast(String(raw.message || '通话异常'))
      hangupLocal('error', false)
      return
    }

    if (cmd === 'CALL_HANGUP') {
      if (sid) rememberCancelledCall(sid)
      if (uiState.value === 'idle') return
      showToast('通话已结束')
      hangupLocal('peer_hangup', false)
      return
    }

    if (cmd === 'CALL_ACCEPT') {
      // 允许在 session 尚未建完时先记上，避免丢失接听
      if (uiState.value !== 'outgoing' && uiState.value !== 'connecting') return
      clearRingTimer()
      clearInviteRetry()
      stopCallRingtone()
      if (uiState.value !== 'connecting') {
        uiState.value = 'connecting'
        statusText.value = '正在接通...'
        startConnectingTimer()
      } else {
        statusText.value = '正在接通...'
      }
      pendingAccept = true
      void (async () => {
        if (!session) return
        try {
          if (!session.isPcReady) {
            statusText.value =
              mediaType.value === 'video' ? '正在打开摄像头...' : '正在接通麦克风...'
            await session.prepareMediaAndPc()
            const userStore = useUserStore()
            const signalOk = await ensureSignalAfterMedia(userStore.token)
            if (!signalOk) {
              showToast('信令连接已断开，请稍后重试')
              hangupLocal('ws_closed', true)
              return
            }
            cameraOn.value = mediaType.value !== 'video' ? true : session.cameraOn
            cameraFacing.value = session.cameraFacing
          }
          if (uiState.value === 'connecting' || uiState.value === 'outgoing') {
            statusText.value = '正在接通...'
            void trySendOffer()
          }
        } catch (err) {
          const mt = mediaType.value
          const reason = mediaDeniedReason(err, mt)
          mediaDeniedToast(mt, reason)
          hangupLocal(reason, true)
        }
      })()
      return
    }

    if (cmd === 'CALL_OFFER') {
      const sdp = String(raw.sdp || '')
      if (!sdp) return
      if (!session) {
        pendingOfferSdp = sdp
        return
      }
      // 本端 PC 未就绪时先缓存（含接听过程中），且不要停掉 ACCEPT 重试
      if (!session.isPcReady || uiState.value === 'incoming') {
        pendingOfferSdp = sdp
        return
      }
      void (async () => {
        const ok = await session!.handleRemoteOffer(sdp)
        if (ok) {
          offerHandled = true
          clearAcceptRetry()
        }
      })()
      return
    }

    if (cmd === 'CALL_ANSWER') {
      const sdp = String(raw.sdp || '')
      if (!sdp || !session) return
      void (async () => {
        const ok = await session!.handleRemoteAnswer(sdp)
        if (ok) {
          answerReceived = true
          clearOfferRetry()
          if (uiState.value === 'connecting') {
            statusText.value = '正在接通...'
          }
        }
      })()
      return
    }

    if (cmd === 'CALL_ICE') {
      const candidate = raw.candidate as RTCIceCandidateInit | undefined
      if (!candidate || !session) return
      void session.handleRemoteIce(candidate)
      return
    }

    void toUserId
  }

  function startBridge() {
    if (started) return
    started = true
    unsubWs = onWsMessage((data) => {
      const msg = data as Record<string, unknown>
      const cmd = String(msg.cmd || '')
      if (!isCallSignalCmd(cmd)) return
      handleSignal(msg)
    })
  }

  function stopBridge() {
    unsubWs?.()
    unsubWs = null
    started = false
    hangupLocal('stop', false)
  }

  return {
    uiState,
    callId,
    peer,
    mediaType,
    muted,
    cameraOn,
    cameraFacing,
    speakerOn,
    statusText,
    elapsedSec,
    remoteStream,
    localStream,
    visible,
    isBusy,
    isVideo,
    startBridge,
    stopBridge,
    startOutgoing,
    acceptIncoming,
    rejectIncoming,
    hangup,
    toggleMute,
    toggleCamera,
    flipCamera,
    toggleSpeaker,
  }
})

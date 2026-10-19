import { fetchIceServers } from '@/api/call'
import { sendCallSignal, type CallSignalPayload } from '@/im/ws'

export type VoiceCallRole = 'caller' | 'callee'
export type CallMediaType = 'audio' | 'video'

export interface VoicePeerInfo {
  userId: string
  nickname: string
  avatarUrl?: string
  conversationId?: string
}

type SessionHooks = {
  onState?: (state: string) => void
  onRemoteStream?: (stream: MediaStream | null) => void
  onLocalStream?: (stream: MediaStream | null) => void
  onError?: (message: string) => void
  onEnded?: (reason: string) => void
  /** 对端 PC 已断开（挂断信令丢失时的兜底） */
  onPeerDisconnected?: () => void
}

/** 采集上限 1080p：够清晰，且避免 4K 打开过慢导致双方卡在「正在接通」 */
const VIDEO_CAPTURE_IDEAL: MediaTrackConstraints = {
  facingMode: { ideal: 'user' },
  width: { ideal: 1080 },
  height: { ideal: 1920 },
  frameRate: { ideal: 30 },
}

/** 1080p 偏高清码率 */
const VIDEO_MAX_BITRATE = 5_500_000
const VIDEO_MAX_FRAMERATE = 30
const VIDEO_CAP_MAX_W = 1920
const VIDEO_CAP_MAX_H = 1920

/** 保留浏览器生成的音频 SDP，避免跨浏览器协商时破坏 CRLF 行结构。 */
function tuneAudioSdp(sdp: string): string {
  return sdp
}

/** 提高视频带宽上限，避免浏览器默认压到几百 K 导致发糊 */
function tuneVideoSdp(sdp: string): string {
  if (!sdp) return sdp
  let out = sdp
  // 仅抬高 video 段带宽
  if (/m=video[\s\S]*?^b=AS:/m.test(out)) {
    out = out.replace(/(m=video.*\r?\n)(b=AS:)\d+/m, `$1$2${6000}`)
  } else {
    out = out.replace(/^(m=video.*)$/m, `$1\r\nb=AS:6000`)
  }
  out = out.replace(/a=fmtp:(\d+) ([^\r\n]*)/g, (line, pt, rest) => {
    const rtp = sdp.match(new RegExp(`a=rtpmap:${pt} ([^\\s/]+)`, 'i'))
    const codec = rtp?.[1] || ''
    if (!/VP8|VP9|H264|AV1/i.test(codec)) return line
    let params = String(rest).trim()
      .replace(/;?x-google-(?:start|min|max)-bitrate=\d+/gi, '')
      .replace(/;{2,}/g, ';')
      .replace(/^;|;$/g, '')
    params =
      `${params};x-google-start-bitrate=2800;x-google-min-bitrate=1500;x-google-max-bitrate=5500`.replace(
        /^;/,
        '',
      )
    return `a=fmtp:${pt} ${params}`
  })
  return out
}

function tuneSdp(sdp: string, mediaType: CallMediaType): string {
  let out = tuneAudioSdp(sdp)
  if (mediaType === 'video') {
    out = tuneVideoSdp(out)
  }
  return out
}

function videoConstraints(facing: 'user' | 'environment'): MediaTrackConstraints {
  return {
    ...VIDEO_CAPTURE_IDEAL,
    facingMode: { ideal: facing },
  }
}

/** 打开摄像头：尽量高清，但封顶 1080p；失败则降级，避免 iOS 约束过严直接失败 */
async function openMaxQualityVideo(
  facing: 'user' | 'environment',
  withAudio: boolean,
): Promise<MediaStream> {
  const audioConstraint: boolean | MediaTrackConstraints = withAudio
    ? {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      }
    : false

  const tryGum = (video: boolean | MediaTrackConstraints, audio: boolean | MediaTrackConstraints) =>
    navigator.mediaDevices.getUserMedia({ audio, video })

  try {
    const stream = await tryGum(videoConstraints(facing), audioConstraint)
    const track = stream.getVideoTracks()[0]
    if (!track) return stream
    await refineVideoTrack(track)
    return stream
  } catch {
    /* fall through */
  }

  try {
    return await tryGum({ facingMode: facing }, withAudio ? true : false)
  } catch {
    /* fall through */
  }

  // 最后兜底：任意摄像头 + 麦
  return tryGum(true, withAudio ? true : false)
}

async function refineVideoTrack(track: MediaStreamTrack) {
  const tryApply = async (c: MediaTrackConstraints) => {
    try {
      await track.applyConstraints(c)
      return true
    } catch {
      return false
    }
  }

  try {
    const caps = track.getCapabilities?.() as
      | (MediaTrackCapabilities & {
          width?: { max?: number }
          height?: { max?: number }
          frameRate?: { max?: number }
        })
      | undefined
    const maxW = Math.min(caps?.width?.max || VIDEO_CAP_MAX_W, VIDEO_CAP_MAX_W)
    const maxH = Math.min(caps?.height?.max || VIDEO_CAP_MAX_H, VIDEO_CAP_MAX_H)
    const maxFps = Math.min(caps?.frameRate?.max || 30, 30)
    if (
      await tryApply({
        width: { ideal: maxW },
        height: { ideal: maxH },
        frameRate: { ideal: maxFps },
      })
    ) {
      return
    }
  } catch {
    /* ignore */
  }

  const profiles = [
    { width: 1080, height: 1920, fps: 30 },
    { width: 1920, height: 1080, fps: 30 },
    { width: 720, height: 1280, fps: 30 },
    { width: 1280, height: 720, fps: 30 },
  ]
  for (const p of profiles) {
    if (
      await tryApply({
        width: { ideal: p.width },
        height: { ideal: p.height },
        frameRate: { ideal: p.fps },
      })
    ) {
      break
    }
  }
}

/**
 * 单路 WebRTC 私聊通话（音频 / 视频）
 */
export class VoiceCallSession {
  readonly callId: string
  readonly role: VoiceCallRole
  readonly peer: VoicePeerInfo
  readonly selfUserId: string
  readonly mediaType: CallMediaType

  private pc: RTCPeerConnection | null = null
  private localStream: MediaStream | null = null
  private remoteStream: MediaStream | null = null
  private iceServers: RTCIceServer[] = []
  private iceRestarted = false
  private closed = false
  private pendingRemoteIce: RTCIceCandidateInit[] = []
  private facingMode: 'user' | 'environment' = 'user'
  private hooks: SessionHooks
  private peerGoneTimer: ReturnType<typeof setTimeout> | null = null
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null
  private peerGoneNotified = false
  /** 是否曾进入过 connected；接通前的 ICE 抖动不得当成对方挂断 */
  private everConnected = false
  private preparePromise: Promise<void> | null = null
  private readonly handleNetworkOnline = () => {
    if (this.closed || !this.pc) return
    const connection = this.pc.connectionState
    const ice = this.pc.iceConnectionState
    if (
      connection === 'disconnected' ||
      connection === 'failed' ||
      ice === 'disconnected' ||
      ice === 'failed'
    ) {
      void this.tryIceRestart()
    }
  }

  constructor(opts: {
    callId: string
    role: VoiceCallRole
    peer: VoicePeerInfo
    selfUserId: string
    mediaType?: CallMediaType
    hooks?: SessionHooks
  }) {
    this.callId = opts.callId
    this.role = opts.role
    this.peer = opts.peer
    this.selfUserId = opts.selfUserId
    this.mediaType = opts.mediaType === 'video' ? 'video' : 'audio'
    this.hooks = opts.hooks || {}
    window.addEventListener('online', this.handleNetworkOnline)
  }

  getLocalStream(): MediaStream | null {
    return this.localStream
  }

  get cameraFacing(): 'user' | 'environment' {
    return this.facingMode
  }

  get isPcReady(): boolean {
    return !!this.pc && !this.closed
  }

  get muted(): boolean {
    const track = this.localStream?.getAudioTracks()[0]
    return track ? !track.enabled : false
  }

  setMuted(mute: boolean) {
    this.localStream?.getAudioTracks().forEach((t) => {
      t.enabled = !mute
    })
  }

  get cameraOn(): boolean {
    const track = this.localStream?.getVideoTracks()[0]
    return track ? track.enabled : false
  }

  setCameraEnabled(enabled: boolean) {
    this.localStream?.getVideoTracks().forEach((t) => {
      t.enabled = enabled
    })
  }

  private enhanceVideoTrack(track: MediaStreamTrack) {
    try {
      if ('contentHint' in track) {
        ;(track as MediaStreamTrack & { contentHint?: string }).contentHint = 'detail'
      }
    } catch {
      /* ignore */
    }
  }

  /** 抬高发送码率 / 帧率，避免默认低码率发糊 */
  private async applyVideoSenderParams() {
    if (!this.pc || this.mediaType !== 'video') return
    const sender = this.pc.getSenders().find((s) => s.track?.kind === 'video')
    if (!sender || typeof sender.getParameters !== 'function') return
    try {
      const params = sender.getParameters()
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}]
      }
      params.encodings = params.encodings.map((enc, idx) => {
        const next: RTCRtpEncodingParameters = {
          ...enc,
          active: enc.active !== false,
          maxBitrate: VIDEO_MAX_BITRATE,
          maxFramerate: VIDEO_MAX_FRAMERATE,
          scaleResolutionDownBy: idx === 0 ? 1 : enc.scaleResolutionDownBy || 1,
        }
        return next
      })
      const withDeg = params as RTCRtpSendParameters & {
        degradationPreference?: RTCDegradationPreference
      }
      withDeg.degradationPreference = 'maintain-resolution'
      await sender.setParameters(withDeg)
    } catch {
      /* 部分浏览器不支持全部字段，忽略 */
    }
  }

  /** 前后摄像头切换（视频通话） */
  async switchCamera(): Promise<boolean> {
    if (this.closed || this.mediaType !== 'video' || !this.pc || !this.localStream) {
      return false
    }
    const next: 'user' | 'environment' =
      this.facingMode === 'user' ? 'environment' : 'user'
    const keepEnabled = this.cameraOn
    let newTrack: MediaStreamTrack | null = null
    try {
      const fresh = await openMaxQualityVideo(next, false)
      newTrack = fresh.getVideoTracks()[0] || null
      fresh.getAudioTracks().forEach((t) => t.stop())
      if (!newTrack) {
        fresh.getTracks().forEach((t) => t.stop())
        return false
      }
      this.enhanceVideoTrack(newTrack)
      newTrack.enabled = keepEnabled
      const sender = this.pc.getSenders().find((s) => s.track?.kind === 'video')
      if (sender) {
        await sender.replaceTrack(newTrack)
      }
      const old = this.localStream.getVideoTracks()[0]
      if (old) {
        this.localStream.removeTrack(old)
        old.stop()
      }
      this.localStream.addTrack(newTrack)
      this.facingMode = next
      await this.applyVideoSenderParams()
      this.hooks.onLocalStream?.(this.localStream)
      return true
    } catch {
      try {
        newTrack?.stop()
      } catch {
        /* ignore */
      }
      return false
    }
  }

  async prepareMediaAndPc() {
    if (this.closed) return
    // 已就绪 / 正在准备：避免 ACCEPT 重试触发并发 getUserMedia 把 PC 换掉导致无法接通
    if (this.pc) return
    if (this.preparePromise) {
      try {
        await this.preparePromise
      } catch {
        // 上一次失败则允许本轮重试
      }
      if (this.pc || this.closed) return
    }
    this.preparePromise = this.doPrepareMediaAndPc()
    try {
      await this.preparePromise
    } finally {
      this.preparePromise = null
    }
  }

  private async acquireLocalStream(): Promise<MediaStream> {
    const openAudio = async () => {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        })
      } catch {
        // iOS 部分机型高级约束会失败，降级为最简 audio
        return await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      }
    }
    const openOnce = async () => {
      if (this.mediaType === 'video') {
        const stream = await openMaxQualityVideo('user', true)
        stream.getVideoTracks().forEach((t) => this.enhanceVideoTrack(t))
        return stream
      }
      return openAudio()
    }
    try {
      return await openOnce()
    } catch (err) {
      const name = String((err as { name?: string })?.name || '')
      if (name === 'NotReadableError' || name === 'AbortError' || name === 'NotAllowedError') {
        await new Promise((r) => setTimeout(r, 320))
        if (this.closed) throw err
        return await openOnce()
      }
      throw err
    }
  }

  private normalizeIceServers(list: RTCIceServer[] | null | undefined): RTCIceServer[] {
    const fallback: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]
    if (!list?.length) return fallback
    const cleaned = list
      .map((s) => {
        const urls = s.urls
        if (!urls || (Array.isArray(urls) && !urls.length)) return null
        const next: RTCIceServer = { urls }
        if (s.username) next.username = s.username
        if (s.credential) next.credential = s.credential
        return next
      })
      .filter(Boolean) as RTCIceServer[]
    return cleaned.length ? cleaned : fallback
  }

  private async doPrepareMediaAndPc() {
    if (this.closed || this.pc) return
    this.facingMode = 'user'
    // iOS：必须先启动 getUserMedia（占住接听手势），ICE 查询并行，不能先 await 网络
    const streamPromise = this.acquireLocalStream()
    const icePromise = fetchIceServers().catch(
      (): RTCIceServer[] => [{ urls: 'stun:stun.l.google.com:19302' }],
    )
    try {
      this.localStream = await streamPromise
    } catch (err) {
      this.localStream = null
      throw err
    }
    if (this.closed) {
      this.localStream.getTracks().forEach((t) => t.stop())
      this.localStream = null
      return
    }
    this.iceServers = this.normalizeIceServers(await icePromise)
    if (this.closed) {
      this.localStream.getTracks().forEach((t) => t.stop())
      this.localStream = null
      return
    }
    this.hooks.onLocalStream?.(this.localStream)
    try {
      this.pc = new RTCPeerConnection({
        iceServers: this.iceServers,
        iceCandidatePoolSize: 2,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
      })
    } catch {
      // iOS 对异常 ICE 配置会抛 TypeError
      this.pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      })
    }

    this.localStream.getTracks().forEach((track) => {
      this.pc!.addTrack(track, this.localStream!)
    })
    await this.applyVideoSenderParams()

    this.pc.ontrack = (ev) => {
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream()
      }
      const addTrack = (t: MediaStreamTrack) => {
        if (!this.remoteStream!.getTracks().some((x) => x.id === t.id)) {
          this.remoteStream!.addTrack(t)
        }
        // 对端挂断会停轨；信令丢失时靠这个兜底结束本端通话 UI
        t.addEventListener('ended', () => this.onRemoteTrackEnded())
      }
      ev.streams[0]?.getTracks().forEach(addTrack)
      if (!ev.streams[0] && ev.track) {
        addTrack(ev.track)
      }
      this.hooks.onRemoteStream?.(this.remoteStream)
    }

    this.pc.onicecandidate = (ev) => {
      if (!ev.candidate || this.closed) return
      this.signal({
        cmd: 'CALL_ICE',
        callId: this.callId,
        toUserId: this.peer.userId,
        candidate: ev.candidate.toJSON(),
      })
    }

    this.pc.onconnectionstatechange = () => {
      const st = this.pc?.connectionState
      if (!st) return
      this.hooks.onState?.(st)
      if (st === 'connected') {
        this.everConnected = true
        this.iceRestarted = false
        this.clearPeerGoneTimer()
        this.clearRecoveryTimer()
        void this.applyVideoSenderParams()
        return
      }
      // 接通前 checking/disconnected/failed 很常见（尤其视频开摄像头慢），不要当挂断
      if (!this.everConnected) {
        if (st === 'failed') void this.tryIceRestart()
        return
      }
      if (st === 'disconnected') {
        this.armPeerGoneTimer(10_000)
        this.scheduleIceRecovery()
        return
      }
      if (st === 'failed') {
        void this.tryIceRestart()
        return
      }
      if (st === 'closed') {
        this.notifyPeerGone()
      }
    }

    this.pc.oniceconnectionstatechange = () => {
      const st = this.pc?.iceConnectionState
      if (st === 'connected' || st === 'completed') {
        this.everConnected = true
        this.iceRestarted = false
        this.clearPeerGoneTimer()
        this.clearRecoveryTimer()
        void this.applyVideoSenderParams()
        return
      }
      if (!this.everConnected) {
        if (st === 'failed') void this.tryIceRestart()
        return
      }
      if (st === 'disconnected') {
        this.armPeerGoneTimer(10_000)
        this.scheduleIceRecovery()
        return
      }
      if (st === 'failed') void this.tryIceRestart()
      if (st === 'closed') this.notifyPeerGone()
    }
  }

  private clearPeerGoneTimer() {
    if (this.peerGoneTimer) {
      clearTimeout(this.peerGoneTimer)
      this.peerGoneTimer = null
    }
  }

  private clearRecoveryTimer() {
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer)
      this.recoveryTimer = null
    }
  }

  private scheduleIceRecovery() {
    if (this.closed || this.role !== 'caller' || this.recoveryTimer) return
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = null
      void this.tryIceRestart()
    }, 1200)
  }

  private armPeerGoneTimer(ms: number) {
    if (this.closed || this.peerGoneNotified || !this.everConnected) return
    this.clearPeerGoneTimer()
    this.peerGoneTimer = setTimeout(() => {
      this.peerGoneTimer = null
      if (this.closed || this.peerGoneNotified || !this.everConnected) return
      const st = this.pc?.connectionState
      const ice = this.pc?.iceConnectionState
      const stillDown =
        st === 'disconnected' ||
        st === 'failed' ||
        st === 'closed' ||
        ice === 'disconnected' ||
        ice === 'failed' ||
        ice === 'closed'
      if (stillDown) {
        this.notifyPeerGone()
      }
    }, ms)
  }

  private onRemoteTrackEnded() {
    // 仅在已通话成功后，用远端轨结束兜底对方挂断
    if (this.closed || this.peerGoneNotified || !this.everConnected) return
    const live = this.remoteStream?.getTracks().some((t) => t.readyState === 'live')
    if (!live) {
      this.armPeerGoneTimer(5_000)
    }
  }

  private notifyPeerGone() {
    if (this.closed || this.peerGoneNotified || !this.everConnected) return
    this.peerGoneNotified = true
    this.clearPeerGoneTimer()
    this.hooks.onPeerDisconnected?.()
    this.close('peer_disconnect')
  }

  /** 重发当前本地 Offer（不重建，避免打断 ICE） */
  resendLocalOffer(): boolean {
    if (this.closed || !this.pc?.localDescription || this.pc.localDescription.type !== 'offer') {
      return false
    }
    return sendCallSignal({
      cmd: 'CALL_OFFER',
      callId: this.callId,
      toUserId: this.peer.userId,
      fromUserId: this.selfUserId,
      mediaType: this.mediaType,
      sdp: this.pc.localDescription.sdp || '',
    })
  }

  async createAndSendOffer(): Promise<boolean> {
    if (!this.pc || this.closed) return false
    try {
      // 上次已 setLocalDescription 但信令发送失败：直接重发，勿再 createOffer
      if (this.pc.signalingState === 'have-local-offer' && this.pc.localDescription?.type === 'offer') {
        return this.resendLocalOffer()
      }
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: this.mediaType === 'video',
      })
      const sdp = tuneSdp(offer.sdp || '', this.mediaType)
      await this.pc.setLocalDescription({ type: 'offer', sdp })
      await this.applyVideoSenderParams()
      const ok = sendCallSignal({
        cmd: 'CALL_OFFER',
        callId: this.callId,
        toUserId: this.peer.userId,
        fromUserId: this.selfUserId,
        mediaType: this.mediaType,
        sdp: this.pc.localDescription?.sdp || sdp,
      })
      // 发送失败不挂断：信令会入队，重连后补发 / 上层 retry
      return ok
    } catch (err) {
      console.warn('[Pulse Call] createAndSendOffer failed', err)
      // 勿立刻整通挂断：交给 offer 重试 / 接通超时；否则一次抖动就「无法接通」
      return false
    }
  }

  async handleRemoteOffer(sdp: string): Promise<boolean> {
    if (!this.pc || this.closed) return false
    try {
      // 已完成 answer：重复收到 offer 时补发 answer，防丢包
      if (
        this.pc.localDescription?.type === 'answer' &&
        this.pc.remoteDescription?.type === 'offer' &&
        this.pc.remoteDescription.sdp === sdp
      ) {
        const ok = sendCallSignal({
          cmd: 'CALL_ANSWER',
          callId: this.callId,
          toUserId: this.peer.userId,
          fromUserId: this.selfUserId,
          sdp: this.pc.localDescription.sdp || '',
        })
        return ok
      }
      await this.pc.setRemoteDescription({ type: 'offer', sdp })
      await this.flushPendingIce()
      const answer = await this.pc.createAnswer()
      const tuned = tuneSdp(answer.sdp || '', this.mediaType)
      await this.pc.setLocalDescription({ type: 'answer', sdp: tuned })
      await this.applyVideoSenderParams()
      const ok = sendCallSignal({
        cmd: 'CALL_ANSWER',
        callId: this.callId,
        toUserId: this.peer.userId,
        fromUserId: this.selfUserId,
        sdp: this.pc.localDescription?.sdp || tuned,
      })
      return ok
    } catch (err) {
      console.warn('[Pulse Call] handleRemoteOffer failed', err)
      // 保留 PC 给后续重试 offer；接通超时仍会兜底
      return false
    }
  }

  async handleRemoteAnswer(sdp: string): Promise<boolean> {
    if (!this.pc || this.closed) return false
    try {
      if (this.pc.signalingState !== 'have-local-offer') {
        // 已接通或状态不对时忽略重复 answer
        return this.pc.signalingState === 'stable'
      }
      await this.pc.setRemoteDescription({ type: 'answer', sdp })
      await this.flushPendingIce()
      await this.applyVideoSenderParams()
      return true
    } catch (err) {
      console.warn('[Pulse Call] handleRemoteAnswer failed', err)
      return false
    }
  }

  async handleRemoteIce(candidate: RTCIceCandidateInit) {
    if (this.closed) return
    // PC 尚未建好或远端描述未就绪时必须缓存，否则会丢候选导致双方卡在「正在接通」
    if (!this.pc || !this.pc.remoteDescription) {
      this.pendingRemoteIce.push(candidate)
      return
    }
    try {
      await this.pc.addIceCandidate(candidate)
    } catch {
      // ignore bad candidates
    }
  }

  private async flushPendingIce() {
    if (!this.pc) return
    const list = this.pendingRemoteIce.splice(0)
    for (const c of list) {
      try {
        await this.pc.addIceCandidate(c)
      } catch {
          /* ignore */
      }
    }
  }

  private async tryIceRestart() {
    const failMsg = '无法接通，请检查网络后重试'
    // 接通前：仅主叫尝试一次 ICE restart；失败交给连接超时，避免被叫一点接听就被杀掉
    if (!this.everConnected) {
      if (this.closed || !this.pc || this.iceRestarted || this.role !== 'caller') {
        return
      }
      this.iceRestarted = true
      try {
        const offer = await this.pc.createOffer({ iceRestart: true })
        const sdp = tuneSdp(offer.sdp || '', this.mediaType)
        await this.pc.setLocalDescription({ type: 'offer', sdp })
        this.signal({
          cmd: 'CALL_OFFER',
          callId: this.callId,
          toUserId: this.peer.userId,
          mediaType: this.mediaType,
          sdp: this.pc.localDescription?.sdp || sdp,
        })
      } catch {
        /* 连接超时会收尾 */
      }
      return
    }

    if (this.closed || !this.pc || this.iceRestarted || this.role !== 'caller') {
      if (this.pc?.connectionState === 'failed' || this.pc?.iceConnectionState === 'failed') {
        this.notifyPeerGone()
      }
      return
    }
    this.iceRestarted = true
    try {
      const offer = await this.pc.createOffer({ iceRestart: true })
      const sdp = tuneSdp(offer.sdp || '', this.mediaType)
      await this.pc.setLocalDescription({ type: 'offer', sdp })
      this.signal({
        cmd: 'CALL_OFFER',
        callId: this.callId,
        toUserId: this.peer.userId,
        mediaType: this.mediaType,
        sdp: this.pc.localDescription?.sdp || sdp,
      })
      this.armPeerGoneTimer(6000)
    } catch {
      this.hooks.onError?.(failMsg)
      this.close('failed')
    }
  }

  signal(payload: CallSignalPayload) {
    const ok = sendCallSignal({
      ...payload,
      fromUserId: this.selfUserId,
    })
    // 信令瞬时失败：入队重发，绝不因此整通挂断（否则会出现「信令通道未连接」误杀）
    return ok
  }

  close(reason = 'hangup') {
    if (this.closed) return
    this.closed = true
    window.removeEventListener('online', this.handleNetworkOnline)
    this.clearPeerGoneTimer()
    this.clearRecoveryTimer()
    try {
      this.pc?.close()
    } catch {
      /* ignore */
    }
    this.pc = null
    this.localStream?.getTracks().forEach((t) => t.stop())
    this.localStream = null
    this.remoteStream = null
    this.hooks.onLocalStream?.(null)
    this.hooks.onRemoteStream?.(null)
    this.hooks.onEnded?.(reason)
  }
}

export function newCallId(): string {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 已废弃：预热 getUserMedia 会与正式开麦并发抢设备，导致「无法使用麦克风/摄像头」。
 * 保留空实现以免旧调用报错；真正开麦只走 prepareMediaAndPc 单飞。
 */
export function warmCallMedia(_mt: CallMediaType): Promise<MediaStream | null> {
  return Promise.resolve(null)
}

export function discardWarmedCallMedia() {
  /* no-op：预热流已停用 */
}

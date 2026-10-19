import { transcribeVoiceOnServer } from '@/api/voiceAsr'

/**
 * 语音转文字：全部走服务端（ffmpeg + Node Whisper），浏览器不再加载模型。
 */

type ProgressCallback = (msg: string) => void

let runToken = 0

export function speechRecognitionSupported(): boolean {
  return true
}

export function resetSpeechRecognize(): void {
  runToken += 1
}

export async function transcribeVoiceUrl(
  url: string,
  _lang = 'zh-CN',
  onProgress?: ProgressCallback,
): Promise<string> {
  const myToken = ++runToken
  onProgress?.('正在识别…')
  try {
    const text = await transcribeVoiceOnServer(url)
    if (myToken !== runToken) throw new Error('已取消')
    return text
  } catch (err) {
    if (myToken !== runToken) throw new Error('已取消')
    const raw = err instanceof Error ? err.message : '转文字失败，请重试'
    if (/已取消/.test(raw)) throw new Error('已取消')
    if (/登录|未授权|401/.test(raw)) throw new Error('登录已失效，请重新登录')
    if (/未能识别|无效|识别|转码|超时/.test(raw)) throw new Error(raw)
    throw new Error(raw.slice(0, 48) || '转文字失败，请重试')
  }
}

/** @deprecated */
export async function recognizeWhilePlaying(
  _play: () => Promise<void>,
  _lang = 'zh-CN',
): Promise<string> {
  return ''
}

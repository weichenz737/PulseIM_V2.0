/** 解析 PCM16 WAV → 16kHz mono float32（不依赖 decodeAudioData） */

function resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input
  const ratio = fromRate / toRate
  const outLen = Math.max(1, Math.round(input.length / ratio))
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio
    const i0 = Math.floor(src)
    const i1 = Math.min(i0 + 1, input.length - 1)
    const t = src - i0
    out[i] = input[i0] * (1 - t) + input[i1] * t
  }
  return out
}

export function pcmFromWavBuffer(buf: ArrayBuffer): Float32Array {
  const view = new DataView(buf)
  if (view.byteLength < 44) throw new Error('语音解析失败')

  const tag = (o: number) =>
    String.fromCharCode(view.getUint8(o), view.getUint8(o + 1), view.getUint8(o + 2), view.getUint8(o + 3))

  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('语音解析失败')

  let offset = 12
  let numChannels = 1
  let sampleRate = 16000
  let bitsPerSample = 16
  let dataOffset = -1
  let dataSize = 0

  while (offset + 8 <= view.byteLength) {
    const id = tag(offset)
    const size = view.getUint32(offset + 4, true)
    const dataStart = offset + 8
    if (id === 'fmt ' && size >= 16) {
      numChannels = Math.max(1, view.getUint16(dataStart + 2, true))
      sampleRate = view.getUint32(dataStart + 4, true) || 16000
      bitsPerSample = view.getUint16(dataStart + 14, true) || 16
    } else if (id === 'data') {
      dataOffset = dataStart
      dataSize = size
      break
    }
    offset = dataStart + size + (size % 2)
  }

  if (dataOffset < 0 || dataSize <= 0) throw new Error('语音解析失败')
  if (bitsPerSample !== 16) throw new Error('语音解析失败')

  const frameSize = numChannels * 2
  const frames = Math.floor(dataSize / frameSize)
  if (frames <= 0) throw new Error('语音内容为空')

  const mono = new Float32Array(frames)
  for (let i = 0; i < frames; i++) {
    let sum = 0
    for (let c = 0; c < numChannels; c++) {
      sum += view.getInt16(dataOffset + i * frameSize + c * 2, true)
    }
    mono[i] = sum / numChannels / 32768
  }
  return resampleLinear(mono, sampleRate, 16000)
}

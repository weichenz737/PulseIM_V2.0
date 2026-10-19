#!/usr/bin/env node
/**
 * CLI 转写（兼容后端回退）：node transcribe.mjs <wavPath>
 * 优先打常驻服务；服务不可用时本进程加载 whisper-small。
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false
env.useBrowserCache = false
env.remoteHost = process.env.HF_ENDPOINT || 'https://hf-mirror.com'

const MODEL = process.env.PULSE_ASR_MODEL || 'Xenova/whisper-small'
const ASR_URL = process.env.PULSE_ASR_URL || 'http://127.0.0.1:3978/transcribe'

function pcmFromWav(buf) {
  if (buf.byteLength < 44) throw new Error('wav too short')
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const tag = (o) =>
    String.fromCharCode(view.getUint8(o), view.getUint8(o + 1), view.getUint8(o + 2), view.getUint8(o + 3))
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('not wav')
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
  if (dataOffset < 0 || bitsPerSample !== 16) throw new Error('unsupported wav')
  const frameSize = numChannels * 2
  const frames = Math.floor(dataSize / frameSize)
  const mono = new Float32Array(frames)
  for (let i = 0; i < frames; i++) {
    let sum = 0
    for (let c = 0; c < numChannels; c++) {
      sum += view.getInt16(dataOffset + i * frameSize + c * 2, true)
    }
    mono[i] = sum / numChannels / 32768
  }
  if (sampleRate === 16000) return mono
  const ratio = sampleRate / 16000
  const outLen = Math.max(1, Math.round(mono.length / ratio))
  const out = new Float32Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio
    const i0 = Math.floor(src)
    const i1 = Math.min(i0 + 1, mono.length - 1)
    const t = src - i0
    out[i] = mono[i0] * (1 - t) + mono[i1] * t
  }
  return out
}

function cleanText(text) {
  return String(text || '')
    .replace(/^\s*\[?\s*BLANK_AUDIO\s*]?\s*$/i, '')
    .trim()
}

const wavPath = process.argv[2]
if (!wavPath) {
  process.stdout.write(JSON.stringify({ error: 'missing wav path' }))
  process.exit(2)
}
const abs = resolve(wavPath)
if (!existsSync(abs)) {
  process.stdout.write(JSON.stringify({ error: 'file not found' }))
  process.exit(2)
}

const wavBuf = readFileSync(abs)

// 1) 优先常驻服务
try {
  const res = await fetch(ASR_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: wavBuf,
  })
  const json = await res.json()
  if (res.ok && typeof json.text === 'string') {
    process.stdout.write(JSON.stringify({ text: cleanText(json.text) }))
    process.exit(0)
  }
} catch {
  /* fall through */
}

// 2) 本进程加载模型
try {
  const pcm = pcmFromWav(wavBuf)
  let lastErr = null
  for (const host of [env.remoteHost, 'https://huggingface.co']) {
    try {
      env.remoteHost = host
      const transcriber = await pipeline('automatic-speech-recognition', MODEL, { dtype: 'q8' })
      const result = await transcriber(pcm, {
        language: 'chinese',
        task: 'transcribe',
        return_timestamps: false,
      })
      const text = cleanText(typeof result === 'string' ? result : result?.text)
      process.stdout.write(JSON.stringify({ text }))
      process.exit(0)
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr || new Error('transcribe failed')
} catch (e) {
  process.stdout.write(JSON.stringify({ error: String(e?.message || e).slice(0, 200) }))
  process.exit(1)
}

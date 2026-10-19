#!/usr/bin/env node
/**
 * PulseIM ASR 常驻服务：预加载 Whisper-small，供后端反复调用。
 * 启动: node server.mjs
 * 健康检查: GET  http://127.0.0.1:3978/health
 * 转写:     POST http://127.0.0.1:3978/transcribe  body=wav二进制
 */
import http from 'node:http'
import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false
env.useBrowserCache = false
env.remoteHost = process.env.HF_ENDPOINT || 'https://hf-mirror.com'

const PORT = Number(process.env.PULSE_ASR_PORT || 3978)
const MODEL = process.env.PULSE_ASR_MODEL || 'Xenova/whisper-small'

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

let transcriber = null
let ready = false
let loading = false

async function ensureModel() {
  if (transcriber) return transcriber
  if (loading) {
    while (loading) await new Promise((r) => setTimeout(r, 200))
    if (transcriber) return transcriber
  }
  loading = true
  try {
    const hosts = [env.remoteHost, 'https://huggingface.co'].filter(Boolean)
    let lastErr = null
    for (const host of hosts) {
      try {
        env.remoteHost = host
        console.error(`[asr] loading ${MODEL} from ${host} ...`)
        transcriber = await pipeline('automatic-speech-recognition', MODEL, { dtype: 'q8' })
        ready = true
        console.error(`[asr] model ready`)
        return transcriber
      } catch (e) {
        lastErr = e
        console.error(`[asr] load failed:`, e?.message || e)
      }
    }
    throw lastErr || new Error('model load failed')
  } finally {
    loading = false
  }
}

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  return Buffer.concat(chunks)
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  try {
    if (req.method === 'GET' && req.url === '/health') {
      res.end(JSON.stringify({ ok: true, ready, model: MODEL }))
      return
    }
    if (req.method === 'POST' && req.url === '/transcribe') {
      const body = await readBody(req)
      if (!body.length) {
        res.statusCode = 400
        res.end(JSON.stringify({ error: 'empty body' }))
        return
      }
      const model = await ensureModel()
      const pcm = pcmFromWav(body)
      const result = await model(pcm, {
        language: 'chinese',
        task: 'transcribe',
        return_timestamps: false,
      })
      const text = cleanText(typeof result === 'string' ? result : result?.text)
      res.end(JSON.stringify({ text }))
      return
    }
    res.statusCode = 404
    res.end(JSON.stringify({ error: 'not found' }))
  } catch (e) {
    res.statusCode = 500
    res.end(JSON.stringify({ error: String(e?.message || e).slice(0, 200) }))
  }
})

server.listen(PORT, '0.0.0.0', async () => {
  console.error(`[asr] listening on 0.0.0.0:${PORT}`)
  try {
    await ensureModel()
  } catch (e) {
    console.error('[asr] preload failed, will retry on first request', e?.message || e)
  }
})

// PulseIM text-message stress client (JSON WebSocket bridge, text frames only).
// Usage:
//   node stress-client.mjs --name test1000 --count 1000 --url wss://39.97.240.31/ws
//       --secret-file <path> --users users.json --duration 60 --interval 1000
import { WebSocket } from 'ws';
import { readFileSync, writeFileSync } from 'node:fs';
import { loadSecret, mintToken } from './mint-jwt.mjs';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}
function argInt(name, def) {
  return Number(arg(name, def));
}

const NAME = arg('name', 'stress');
const COUNT = argInt('count', 1000);
const URL = arg('url', 'wss://39.97.240.31/ws');
const SECRET_FILE = arg('secret-file', '');
const USERS_FILE = arg('users', 'users.json');
const DURATION_MS = argInt('duration', 60) * 1000;
const INTERVAL_MS = argInt('interval', 1000);
const ACK_TIMEOUT_MS = argInt('ack-timeout', 15000);
const HEARTBEAT_MS = argInt('heartbeat', 30000);
const RAMP_BATCH = argInt('ramp-batch', 25);
const RAMP_DELAY_MS = argInt('ramp-delay', 150);

const secret = loadSecret(SECRET_FILE);
const allUsers = JSON.parse(readFileSync(USERS_FILE, 'utf8'));
const users = allUsers.slice(0, COUNT);

const results = {
  name: NAME,
  count: COUNT,
  url: URL,
  startedAt: new Date().toISOString(),
  connections: { attempted: 0, opened: 0, authOk: 0, authFail: 0, dropped: 0 },
  phases: {},
  sends: { total: 0, acked: 0, failed: 0, pendingTimeout: 0 },
  pushes: { total: 0 },
  heartbeats: { sent: 0, acked: 0 },
  errors: [],
  ackLatencyMs: [],
  flushDelayMs: [],
  pushGapMs: [],
  perUser: [],
};

const state = new Map();
let t0 = Date.now();
let allAuthResolve;
const allAuthPromise = new Promise((r) => (allAuthResolve = r));
let sendPhaseStartedAt = 0;
let sendPhaseEndedAt = 0;
let connectedCount = 0;
let authedCount = 0;
let authFailedCount = 0;
let stopSending = false;
let sendPhaseActive = false;

function now() {
  return Date.now() - t0;
}

function pct(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function stats(sorted) {
  if (sorted.length === 0) return { n: 0, avg: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  const sortedCopy = [...sorted].sort((a, b) => a - b);
  const sum = sortedCopy.reduce((a, b) => a + b, 0);
  return {
    n: sortedCopy.length,
    avg: Math.round((sum / sortedCopy.length) * 10) / 10,
    p50: pct(sortedCopy, 50),
    p95: pct(sortedCopy, 95),
    p99: pct(sortedCopy, 99),
    max: sortedCopy[sortedCopy.length - 1],
  };
}

function connectUser(u) {
  results.connections.attempted++;
  const rec = {
    userId: u.id,
    peerId: u.peerId,
    convId: u.convId,
    token: mintToken(secret, u.id),
    openedAt: 0,
    authAt: 0,
    authAckAt: 0,
    closed: false,
    sent: 0,
    acked: 0,
    pushes: 0,
    pending: new Map(),
    sendTimer: null,
    heartbeatTimer: null,
    seq: 0,
  };
  state.set(u.id, rec);

  const ws = new WebSocket(URL, {
    rejectUnauthorized: false,
    perMessageDeflate: false,
    handshakeTimeout: 30000,
  });
  rec.ws = ws;

  ws.on('open', () => {
    rec.openedAt = now();
    results.connections.opened++;
    ws.send(JSON.stringify({ cmd: 'AUTH', token: rec.token, deviceId: `stress-${u.id}`, platform: 'stress' }));
    rec.authAt = now();
    rec.heartbeatTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        results.heartbeats.sent++;
        ws.send(JSON.stringify({ cmd: 'HEARTBEAT', seq: ++rec.seq }));
      }
    }, HEARTBEAT_MS);
  });

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    switch (msg.cmd) {
      case 'AUTH_ACK':
        if (msg.success) {
          rec.authAckAt = now();
          results.connections.authOk++;
          authedCount++;
          connectedCount++;
          if (authedCount === users.length) allAuthResolve();
          startSender(rec);
        } else {
          results.connections.authFail++;
          authFailedCount++;
          results.errors.push({ type: 'AUTH_FAIL', userId: u.id, message: msg.message });
        }
        break;
      case 'MSG_ACK': {
        rec.acked++;
        results.sends.acked++;
        const pend = rec.pending.get(msg.clientMsgId);
        if (pend) {
          rec.pending.delete(msg.clientMsgId);
          results.ackLatencyMs.push(now() - pend);
        }
        break;
      }
      case 'PUSH_MSG':
        rec.pushes++;
        results.pushes.total++;
        break;
      case 'HEARTBEAT_ACK':
        results.heartbeats.acked++;
        break;
      case 'ERROR':
        results.errors.push({ type: 'ERROR_FRAME', userId: u.id, code: msg.code, message: msg.message });
        break;
      default:
        break;
    }
  });

  ws.on('close', () => {
    if (rec.heartbeatTimer) clearInterval(rec.heartbeatTimer);
    if (rec.sendTimer) clearTimeout(rec.sendTimer);
    if (!rec.closed) {
      rec.closed = true;
      results.connections.dropped++;
      for (const [, t] of rec.pending) {
        results.sends.pendingTimeout++;
      }
      rec.pending.clear();
    }
  });

  ws.on('error', (err) => {
    results.errors.push({ type: 'WS_ERROR', userId: u.id, message: String(err.message || err) });
  });
}

function startSender(rec) {
  if (stopSending) return;
  const sendOne = () => {
    if (stopSending || rec.closed || rec.ws.readyState !== WebSocket.OPEN) return;
    if (!sendPhaseActive) {
      rec.sendTimer = setTimeout(sendOne, 100);
      return;
    }
    rec.seq++;
    const clientMsgId = `stress-${rec.userId}-${rec.seq}`;
    const content = `压测文本消息#${rec.userId}#${rec.seq}`;
    rec.pending.set(clientMsgId, now());
    rec.sent++;
    results.sends.total++;
    const sentAt = now();
    rec.ws.send(
      JSON.stringify({
        cmd: 'SEND_MSG',
        conversationId: rec.convId,
        toUserId: rec.peerId,
        msgType: 0,
        content,
        clientMsgId,
        seq: rec.seq,
      }),
      () => {
        results.flushDelayMs.push(now() - sentAt);
      }
    );
    rec.sendTimer = setTimeout(sendOne, INTERVAL_MS + Math.floor(Math.random() * INTERVAL_MS * 0.3));
  };
  rec.sendTimer = setTimeout(sendOne, Math.floor(Math.random() * 500));
}

function flushPending() {
  let timedOut = 0;
  for (const rec of state.values()) {
    timedOut += rec.pending.size;
    rec.pending.clear();
  }
  results.sends.pendingTimeout += timedOut;
}

function summarize() {
  const sendDurSec = (sendPhaseEndedAt - sendPhaseStartedAt) / 1000;
  const rampSec = results.phases.allAuthedAt ? results.phases.allAuthedAt / 1000 : 0;
  const ack = stats(results.ackLatencyMs);
  const perUserSends = [...state.values()].map((r) => r.sent);
  return {
    name: NAME,
    count: COUNT,
    connections: results.connections,
    rampSeconds: Math.round(rampSec * 10) / 10,
    sendPhaseSeconds: Math.round(sendDurSec * 10) / 10,
    sends: {
      total: results.sends.total,
      acked: results.sends.acked,
      ackRatePct: results.sends.total
        ? Math.round((results.sends.acked / results.sends.total) * 1000) / 10
        : 0,
      throughputPerSec: sendDurSec ? Math.round((results.sends.total / sendDurSec) * 10) / 10 : 0,
      pendingTimeout: results.sends.pendingTimeout,
    },
    pushes: {
      total: results.pushes.total,
      throughputPerSec: sendDurSec ? Math.round((results.pushes.total / sendDurSec) * 10) / 10 : 0,
      perUser: state.size ? Math.round((results.pushes.total / state.size) * 10) / 10 : 0,
    },
    ackLatencyMs: ack,
    flushDelayMs: stats(results.flushDelayMs),
    heartbeats: results.heartbeats,
    errors: {
      count: results.errors.length,
      samples: results.errors.slice(0, 20),
    },
    sendsPerUser: {
      min: perUserSends.length ? Math.min(...perUserSends) : 0,
      max: perUserSends.length ? Math.max(...perUserSends) : 0,
      avg: perUserSends.length
        ? Math.round((perUserSends.reduce((a, b) => a + b, 0) / perUserSends.length) * 10) / 10
        : 0,
    },
  };
}

async function main() {
  if (!SECRET_FILE) throw new Error('--secret-file is required');
  console.log(`[stress] ${NAME}: connecting ${COUNT} users to ${URL}`);
  for (let i = 0; i < users.length; i += RAMP_BATCH) {
    const batch = users.slice(i, i + RAMP_BATCH);
    for (const u of batch) connectUser(u);
    await new Promise((r) => setTimeout(r, RAMP_DELAY_MS));
  }

  const rampDeadline = Date.now() + 90000;
  await Promise.race([
    allAuthPromise,
    new Promise((r) => setTimeout(r, rampDeadline - Date.now())),
  ]);
  // Connections that never authenticated are counted as failures.
  for (const rec of state.values()) {
    if (rec.authAckAt === 0 && !rec.closed) {
      results.connections.authFail++;
      rec.closed = true;
      rec.ws.close();
    }
  }
  results.phases.allAuthedAt = now();
  const authed = authedCount;
  const failed = users.length - authed;
  console.log(
    `[stress] ramp done: authed=${authed}/${users.length} failed=${failed} in ${results.phases.allAuthedAt}ms`
  );

  sendPhaseActive = true;
  sendPhaseStartedAt = now();
  console.log(`[stress] send phase ${DURATION_MS / 1000}s, interval=${INTERVAL_MS}ms`);
  await new Promise((r) => setTimeout(r, DURATION_MS));
  stopSending = true;
  sendPhaseEndedAt = now();

  console.log('[stress] draining in-flight acks...');
  const drainDeadline = Date.now() + ACK_TIMEOUT_MS;
  while (Date.now() < drainDeadline) {
    const pending = [...state.values()].reduce((a, r) => a + r.pending.size, 0);
    if (pending === 0) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  flushPending();

  for (const rec of state.values()) {
    if (!rec.closed && rec.ws.readyState === WebSocket.OPEN) {
      rec.closed = true;
      rec.ws.close();
    }
  }

  const summary = summarize();
  results.summary = summary;
  results.finishedAt = new Date().toISOString();
  const outFile = `results-${NAME}.json`;
  writeFileSync(outFile, JSON.stringify(summary, null, 2));

  console.log(JSON.stringify(summary, null, 2));
  console.log(`[stress] wrote ${outFile}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

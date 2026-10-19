// Quick 2-user debug: prints every event immediately.
import { WebSocket } from 'ws';
import { readFileSync } from 'node:fs';
import { loadSecret, mintToken } from './mint-jwt.mjs';

const secret = loadSecret(process.argv[2]);
const url = process.argv[3] || 'wss://39.97.240.31:6080/ws';
const users = JSON.parse(readFileSync('users.json', 'utf8')).slice(0, 2);
const log = (...a) => process.stdout.write(a.join(' ') + '\n');

for (const u of users) {
  const token = mintToken(secret, u.id);
  const ws = new WebSocket(url, { rejectUnauthorized: false, perMessageDeflate: false, handshakeTimeout: 10000 });
  ws.on('open', () => {
    log(`[${u.id}] OPEN`);
    ws.send(JSON.stringify({ cmd: 'AUTH', token, deviceId: `dbg-${u.id}`, platform: 'stress' }));
  });
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    log(`[${u.id}] <- ${m.cmd}`, JSON.stringify(m).slice(0, 160));
    if (m.cmd === 'AUTH_ACK' && m.success) {
      for (let i = 1; i <= 3; i++) {
        ws.send(
          JSON.stringify({
            cmd: 'SEND_MSG',
            conversationId: u.convId,
            toUserId: u.peerId,
            msgType: 0,
            content: `冒烟-${u.id}-${i}`,
            clientMsgId: `dbg-${u.id}-${i}`,
          })
        );
        log(`[${u.id}] -> SEND_MSG ${i}`);
      }
      setTimeout(() => { ws.close(); }, 3000);
    }
  });
  ws.on('error', (e) => log(`[${u.id}] ERROR`, e.message));
  ws.on('close', (c) => log(`[${u.id}] CLOSE`, c));
}

setTimeout(() => { log('DONE'); process.exit(0); }, 20000);

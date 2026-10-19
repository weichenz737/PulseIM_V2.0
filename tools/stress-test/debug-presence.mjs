// Verifies realtime PRESENCE push: A observes B going online/offline.
import { WebSocket } from 'ws';
import { readFileSync } from 'node:fs';
import { loadSecret, mintToken } from './mint-jwt.mjs';

const secret = loadSecret('.jwt-secret.txt');
const url = process.argv[2] || 'wss://39.97.240.31:6080/ws';
const users = JSON.parse(readFileSync('users.json', 'utf8')).slice(0, 2);
const [a, b] = users;
const log = (...x) => process.stdout.write(x.join(' ') + '\n');

const wsA = new WebSocket(url, { rejectUnauthorized: false, perMessageDeflate: false, handshakeTimeout: 15000 });
let bClosed = false;

wsA.on('open', () => {
  log(`[A ${a.id}] OPEN`);
  wsA.send(JSON.stringify({ cmd: 'AUTH', token: mintToken(secret, a.id), deviceId: 'pres-a', platform: 'stress' }));
});
wsA.on('message', (d) => {
  const m = JSON.parse(d.toString());
  if (m.cmd === 'PRESENCE') {
    log(`[A] <- PRESENCE userId=${m.userId} online=${m.online} hidden=${m.onlineHidden} at ${Date.now()}`);
    if (String(m.userId) === String(b.id) && m.online === true) {
      setTimeout(() => {
        log(`[B ${b.id}] closing...`);
        wsB.close();
      }, 800);
    }
    if (String(m.userId) === String(b.id) && m.online === false) {
      log('RESULT: ONLINE+OFFLINE both received');
      process.exit(0);
    }
  }
});
wsA.on('error', (e) => log('[A] ERROR', e.message));

let wsB;
setTimeout(() => {
  wsB = new WebSocket(url, { rejectUnauthorized: false, perMessageDeflate: false, handshakeTimeout: 15000 });
  wsB.on('open', () => {
    log(`[B ${b.id}] OPEN`);
    wsB.send(JSON.stringify({ cmd: 'AUTH', token: mintToken(secret, b.id), deviceId: 'pres-b', platform: 'stress' }));
  });
  wsB.on('close', () => { bClosed = true; log(`[B] CLOSED at ${Date.now()}`); });
  wsB.on('error', (e) => log('[B] ERROR', e.message));
}, 1500);

setTimeout(() => {
  log('TIMEOUT: presence flow incomplete');
  process.exit(2);
}, 25000);

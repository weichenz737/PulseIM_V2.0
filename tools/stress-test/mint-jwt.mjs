// Minimal HS256 JWT minting compatible with pulse-im JwtUtil (jjwt).
// Claims: uid (Long), role ("USER"), authVersion, sub, iat, exp.
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';

export function loadSecret(file) {
  return readFileSync(file, 'utf8').trim();
}

export function mintToken(secret, userId, ttlMs = 7 * 24 * 3600 * 1000) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    uid: userId,
    role: 'USER',
    authVersion: 0,
    sub: String(userId),
    iat: now,
    exp: now + Math.floor(ttlMs / 1000),
  };
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const data = `${enc(header)}.${enc(payload)}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

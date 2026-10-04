import { issueRelayToken } from '../src/access';
// Operator-only utility. Never import this module into the browser or invoke it automatically.
const [origin, subject, ttlText = '900'] = process.argv.slice(2);
const ttl = Number(ttlText);
if (!origin || !subject || !Number.isInteger(ttl) || ttl < 1 || ttl > 3600 || !process.env.AUTH_SECRET) {
  throw new Error('Usage: AUTH_SECRET=<secret from secure environment> bun scripts/mint-token.ts <https-origin> <subject> [ttl-seconds:1..3600]');
}
const now = Math.floor(Date.now() / 1000);
process.stdout.write(await issueRelayToken(process.env.AUTH_SECRET, { v: 1, aud: 'simagents-relay', sub: subject, origin, iat: now, exp: now + ttl }) + '\n');

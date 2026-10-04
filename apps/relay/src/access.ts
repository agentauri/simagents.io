import { z } from 'zod';
const claimsSchema = z.object({ v: z.literal(1), aud: z.literal('simagents-relay'), sub: z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/), origin: z.string().max(2048), iat: z.number().int(), exp: z.number().int() }).strict();
export type RelayClaims = z.infer<typeof claimsSchema>;
const encoder = new TextEncoder();
const HEADER = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
function encode(data: Uint8Array): string { return btoa(Array.from(data, (v) => String.fromCharCode(v)).join('')).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); }
function decode(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid token encoding');
  const plain = value.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(plain + '='.repeat((4 - plain.length % 4) % 4)), (v) => v.charCodeAt(0));
}
async function key(secret: string): Promise<CryptoKey> {
  if (typeof secret !== 'string' || secret.length < 32) throw new Error('Relay access is not configured');
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
function validateClaims(value: unknown, now: number): RelayClaims {
  const claims = claimsSchema.parse(value);
  const origin = new URL(claims.origin);
  if (origin.protocol !== 'https:' || origin.origin !== claims.origin) throw new Error('Invalid token origin');
  if (claims.iat > now + 30 || claims.exp <= now || claims.exp <= claims.iat || claims.exp - claims.iat > 900) throw new Error('Expired or invalid access token');
  return claims;
}
export async function issueRelayToken(secret: string, claims: RelayClaims, now = Math.floor(Date.now() / 1000)): Promise<string> {
  const checked = validateClaims(claims, now);
  const input = `${HEADER}.${encode(encoder.encode(JSON.stringify(checked)))}`;
  return `${input}.${encode(new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(input))))}`;
}
export async function verifyRelayToken(token: string, secret: string, origin: string, now = Math.floor(Date.now() / 1000)): Promise<RelayClaims> {
  if (token.length > 4096) throw new Error('Invalid access token');
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== HEADER) throw new Error('Invalid access token');
  const signature = decode(parts[2]);
  if (signature.length !== 32 || !await crypto.subtle.verify('HMAC', await key(secret), signature, encoder.encode(`${parts[0]}.${parts[1]}`))) throw new Error('Invalid access token');
  const claims = validateClaims(JSON.parse(new TextDecoder().decode(decode(parts[1]))), now);
  if (claims.origin !== origin) throw new Error('Access token origin mismatch');
  return claims;
}
/** Technical abuse key only; never use a provider credential or raw access token as a rate-limit key. */
export async function abuseKey(secret: string, value: string): Promise<string> {
  return encode(new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(value))));
}

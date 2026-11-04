/** Signed, expiring tokens (HMAC-SHA256) for render and download URLs, and unguessable share tokens. */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { authSecret } from '@/auth.config';

function secret(): string {
  const s = authSecret ?? process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET is required to sign tokens');
  return s;
}

export function signToken(
  payload: Record<string, string | number>,
  ttlSeconds: number,
  now = Date.now(),
): string {
  const body = Buffer.from(
    JSON.stringify({ ...payload, exp: Math.floor(now / 1000) + ttlSeconds }),
  ).toString('base64url');
  const sig = createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken<T extends Record<string, unknown>>(
  token: string | null | undefined,
  now = Date.now(),
): (T & { exp: number }) | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & {
      exp: number;
    };
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < now) return null;
    return payload;
  } catch {
    return null;
  }
}

/** 32 random bytes, base64url (spec 11.3 shares). */
export function newShareToken(): string {
  return randomBytes(32).toString('base64url');
}

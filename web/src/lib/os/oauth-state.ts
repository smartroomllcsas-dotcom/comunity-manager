import crypto from 'crypto';

const SECRET = () => {
  const s = process.env.APPROVAL_HMAC_SECRET || process.env.CRON_SECRET;
  if (!s || s.length < 16) throw new Error('APPROVAL_HMAC_SECRET missing or too short');
  return s;
};

export function signState(payload: { orgId: string; userId?: string; provider: string }): string {
  const nonce = crypto.randomBytes(12).toString('hex');
  const issuedAt = Date.now();
  const body = JSON.stringify({ ...payload, nonce, issuedAt });
  const bodyB64 = Buffer.from(body).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET()).update(bodyB64).digest('base64url');
  return `${bodyB64}.${sig}`;
}

export function verifyState(
  state: string,
  expectedProvider: string,
): { orgId: string; userId?: string; issuedAt: number } | null {
  const parts = state.split('.');
  if (parts.length !== 2) return null;
  const [bodyB64, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SECRET()).update(bodyB64).digest('base64url');
  // Pad both to same length before timingSafeEqual to avoid length-leak
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  let payload: any;
  try {
    payload = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (payload.provider !== expectedProvider) return null;
  if (Date.now() - payload.issuedAt > 10 * 60 * 1000) return null; // 10 min TTL
  if (!payload.orgId) return null;
  return { orgId: payload.orgId, userId: payload.userId, issuedAt: payload.issuedAt };
}

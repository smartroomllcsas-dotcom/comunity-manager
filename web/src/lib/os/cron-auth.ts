import crypto from 'node:crypto';

/**
 * Timing-safe verification of the cron Bearer token.
 * Prevents byte-by-byte brute-force via response time analysis.
 *
 * @param authHeader - The Authorization header value (may be null)
 * @returns true if the token matches CRON_SECRET, false otherwise
 */
export function verifyCronAuth(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = `Bearer ${secret}`;
  const provided = authHeader ?? '';

  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);

  // Buffers must be same length for timingSafeEqual; otherwise attacker can
  // learn length via error. Compare with a fixed-length buffer:
  if (providedBuf.length !== expectedBuf.length) {
    // Still spend the same time as if we compared, to reduce length leakage
    try { crypto.timingSafeEqual(expectedBuf, expectedBuf); } catch { /* noop */ }
    return false;
  }
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

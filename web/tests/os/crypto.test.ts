/**
 * Unit tests for web/src/lib/os/crypto.ts (wrapSecret / unwrapSecret)
 * which delegate to the existing AES-256-GCM token-crypto primitives.
 *
 * Run: pnpm vitest run tests/os/crypto.test.ts
 */
import { describe, it, expect, beforeAll } from 'vitest';

const TEST_KEY = 'a'.repeat(64); // 64 hex chars = 32 bytes

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
});

// Lazy import so the env var is set before the module is evaluated.
async function importCrypto() {
  // Reset module cache to re-read env var
  return await import('../../src/lib/os/crypto');
}

describe('wrapSecret / unwrapSecret', () => {
  it('round-trip: wrap then unwrap returns original plaintext', async () => {
    const { wrapSecret, unwrapSecret } = await importCrypto();
    const plain = 'xoxb-slack-token-abc123';
    const wrapped = wrapSecret(plain);
    expect(wrapped).toMatch(/^enc:v1:/);
    expect(unwrapSecret(wrapped)).toBe(plain);
  });

  it('every wrapSecret call produces a unique ciphertext (random IV)', async () => {
    const { wrapSecret } = await importCrypto();
    const a = wrapSecret('same-secret');
    const b = wrapSecret('same-secret');
    expect(a).not.toBe(b);
  });

  it('unwrapSecret with legacy plaintext returns it as-is (backward compat)', async () => {
    const { unwrapSecret } = await importCrypto();
    const legacy = 'rk_live_legacy_stripe_key';
    expect(unwrapSecret(legacy)).toBe(legacy);
  });

  it('unwrapSecret with null/undefined/empty returns null', async () => {
    const { unwrapSecret } = await importCrypto();
    expect(unwrapSecret(null)).toBeNull();
    expect(unwrapSecret(undefined)).toBeNull();
    expect(unwrapSecret('')).toBeNull();
  });

  it('tampered ciphertext (auth tag corrupted) returns null — does not throw', async () => {
    const { wrapSecret, unwrapSecret } = await importCrypto();
    const wrapped = wrapSecret('super-secret');
    // Flip the last character of the base64 payload to corrupt the auth tag
    const corrupted = wrapped.slice(0, -2) + (wrapped.endsWith('A') ? 'B=' : 'A=');
    const result = unwrapSecret(corrupted);
    // decryptToken returns null on auth-tag failure — never throws
    expect(result).toBeNull();
  });
});

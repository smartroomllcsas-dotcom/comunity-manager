/**
 * Thin wrapper around the CM's existing AES-256-GCM token-crypto helpers.
 *
 * Adds a storage-level prefix (`enc:v1:`) so we can detect whether a value
 * in os_connectors.config is encrypted or legacy plaintext — enabling lazy
 * migration without a forced DB rewrite.
 *
 * Usage:
 *   import { wrapSecret, unwrapSecret } from '@/lib/os/crypto'
 *   // store:
 *   config: { api_key: wrapSecret(plainKey) }
 *   // read:
 *   const key = unwrapSecret(cfg.api_key)
 */
import { encryptToken, decryptToken } from '@/lib/auth/token-crypto';

const V1_PREFIX = 'enc:v1:';

/**
 * Encrypts `plaintext` and prepends the `enc:v1:` storage prefix.
 * Store the returned string in os_connectors.config.
 */
export function wrapSecret(plaintext: string): string {
  return V1_PREFIX + encryptToken(plaintext);
}

/**
 * Decrypts a value previously produced by `wrapSecret`.
 * If the value has no `enc:v1:` prefix it is assumed to be legacy plaintext
 * and returned as-is (backward-compat lazy migration).
 * Returns null when the input is null/undefined/empty.
 */
export function unwrapSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (stored.startsWith(V1_PREFIX)) {
    return decryptToken(stored.slice(V1_PREFIX.length));
  }
  // Legacy plaintext — return as-is; will be re-encrypted on next save.
  return stored;
}

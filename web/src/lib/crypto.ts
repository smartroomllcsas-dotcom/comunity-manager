/**
 * Sprint 22 · Cifrado de access tokens (AES-256-GCM)
 * ---------------------------------------------------
 * Wrapper thin sobre `@/lib/auth/token-crypto` (introducido en Sprint 4) para
 * ofrecer la API canónica pedida por el spec de Sprint 22 sin fragmentar la
 * gestión de claves entre dos módulos incompatibles.
 *
 * Formato de ciphertext (heredado de token-crypto, prefijado por versión):
 *   v1:<iv_b64>:<tag_b64>:<ciphertext_b64>
 *
 * IV = 12 bytes aleatorios (randomBytes(12))
 * Auth tag = 16 bytes (validado en decrypt; ciphertext manipulado -> throw)
 *
 * Env var: TOKEN_ENCRYPTION_KEY (canónica en el codebase). Por compat con el
 * spec, ENCRYPTION_KEY se acepta como alias si TOKEN_ENCRYPTION_KEY no está.
 *
 * Generar clave (32 bytes):
 *   openssl rand -base64 32   # o
 *   openssl rand -hex 32
 *
 * Migración progresiva: la app lee primero la columna `_ciphertext` cifrada; si
 * es NULL o inválida, cae a la columna plain legacy y el próximo write la
 * re-cifra. `isEncrypted()` sirve para saber si un valor ya viene cifrado y
 * evitar doble-cifrado en scripts one-off.
 */

import {
  encryptToken as _encryptToken,
  decryptToken as _decryptToken,
  resolveToken as _resolveToken,
} from '@/lib/auth/token-crypto'

const CIPHERTEXT_PREFIX = 'v1:'

// Alias ENCRYPTION_KEY -> TOKEN_ENCRYPTION_KEY (side-effect al importar).
// Sólo si TOKEN_ENCRYPTION_KEY no está definida.
if (!process.env.TOKEN_ENCRYPTION_KEY && process.env.ENCRYPTION_KEY) {
  process.env.TOKEN_ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
}

/**
 * Cifra plaintext con AES-256-GCM. Devuelve string con formato:
 *   v1:<iv_b64>:<tag_b64>:<ct_b64>
 * Throws si TOKEN_ENCRYPTION_KEY / ENCRYPTION_KEY no está o no es 32 bytes.
 */
export function encryptToken(plaintext: string): string {
  return _encryptToken(plaintext)
}

/**
 * Descifra un payload en formato v1. Valida authTag; devuelve string plano.
 * Throws con mensaje claro si el ciphertext está corrupto o la clave es
 * inválida — para permitir que el caller decida entre fallback vs. propagar.
 */
export function decryptToken(payload: string): string {
  const result = _decryptToken(payload)
  if (result === null) {
    throw new Error(
      '[crypto] decryptToken falló: payload nulo/malformado, prefijo incorrecto o authTag inválido (posible tampering o clave incorrecta)',
    )
  }
  return result
}

/**
 * Heurística para saber si un valor ya viene cifrado (útil para migración
 * progresiva y scripts one-off que deben ser idempotentes).
 *
 * Reglas:
 *   - null / undefined / '' -> false
 *   - Debe empezar con 'v1:' y tener 4 piezas separadas por ':'
 *   - Las 3 piezas después del prefijo deben parecer base64 no vacías
 */
export function isEncrypted(value: string | null): boolean {
  if (!value || typeof value !== 'string') return false
  if (!value.startsWith(CIPHERTEXT_PREFIX)) return false
  const parts = value.split(':')
  if (parts.length !== 4) return false
  const [, iv, tag, ct] = parts
  if (!iv || !tag || !ct) return false
  const b64 = /^[A-Za-z0-9+/]+={0,2}$/
  return b64.test(iv) && b64.test(tag) && b64.test(ct)
}

/**
 * Resuelve un token con fallback silencioso:
 *   1) intenta descifrar ciphertext (si viene con prefijo v1:)
 *   2) si es null/invalido, devuelve el valor plano legacy
 * Útil en lecturas de tablas durante la migración progresiva.
 */
export function resolveToken(
  ciphertext: string | null | undefined,
  legacyPlain: string | null | undefined,
): string | null {
  return _resolveToken(ciphertext, legacyPlain)
}

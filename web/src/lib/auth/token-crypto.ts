import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16
const CIPHERTEXT_PREFIX = 'v1:'

function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY
  if (!raw) {
    throw new Error('TOKEN_ENCRYPTION_KEY no configurada. Genera 32 bytes (64 hex chars): openssl rand -hex 32')
  }
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error(`TOKEN_ENCRYPTION_KEY debe ser 32 bytes (recibí ${key.length})`)
  }
  return key
}

/**
 * Cifra plaintext con AES-256-GCM. Devuelve string con formato: v1:<iv_b64>:<tag_b64>:<ct_b64>
 */
export function encryptToken(plain: string): string {
  if (!plain) return ''
  const key = getKey()
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return (
    CIPHERTEXT_PREFIX +
    iv.toString('base64') + ':' +
    tag.toString('base64') + ':' +
    ciphertext.toString('base64')
  )
}

/**
 * Descifra un payload en formato v1. Devuelve null si el input no es válido.
 * Nunca throws para permitir fallback silencioso a la columna legacy.
 */
export function decryptToken(payload: string | null | undefined): string | null {
  if (!payload || typeof payload !== 'string') return null
  if (!payload.startsWith(CIPHERTEXT_PREFIX)) return null

  try {
    const [, ivB64, tagB64, ctB64] = payload.split(':')
    if (!ivB64 || !tagB64 || !ctB64) return null

    const iv = Buffer.from(ivB64, 'base64')
    const tag = Buffer.from(tagB64, 'base64')
    const ct = Buffer.from(ctB64, 'base64')
    if (iv.length !== IV_LEN || tag.length !== TAG_LEN) return null

    const key = getKey()
    const decipher = createDecipheriv(ALGO, key, iv)
    decipher.setAuthTag(tag)
    const plain = Buffer.concat([decipher.update(ct), decipher.final()])
    return plain.toString('utf8')
  } catch {
    return null
  }
}

/**
 * Resuelve un token con fallback:
 *   1) intenta descifrar ciphertext
 *   2) si falla o es null, devuelve el valor plano legacy
 */
export function resolveToken(ciphertext: string | null | undefined, legacyPlain: string | null | undefined): string | null {
  const decrypted = decryptToken(ciphertext)
  if (decrypted) return decrypted
  return legacyPlain || null
}

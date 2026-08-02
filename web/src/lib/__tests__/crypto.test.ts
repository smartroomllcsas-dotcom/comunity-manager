import { beforeAll, describe, expect, it } from 'vitest'

const TEST_KEY = 'a'.repeat(64) // 32 bytes en hex

async function importCrypto() {
  return await import('../crypto')
}

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY
})

describe('crypto — encryptToken / decryptToken', () => {
  it('round-trip devuelve el mismo plaintext', async () => {
    const { encryptToken, decryptToken } = await importCrypto()
    const plain = 'EAAG-super-secret-page-token-42'
    const ct = encryptToken(plain)
    expect(ct).toMatch(/^v1:/)
    expect(decryptToken(ct)).toBe(plain)
  })

  it('dos cifrados del mismo plaintext dan ciphertexts distintos (IV aleatorio)', async () => {
    const { encryptToken } = await importCrypto()
    const a = encryptToken('hola')
    const b = encryptToken('hola')
    expect(a).not.toBe(b)
  })

  it('decryptToken con clave incorrecta / tamper -> throw', async () => {
    const { encryptToken, decryptToken } = await importCrypto()
    const ct = encryptToken('secret')
    const parts = ct.split(':')
    parts[3] = Buffer.from('corrupto-tampered').toString('base64')
    const tampered = parts.join(':')
    expect(() => decryptToken(tampered)).toThrow()
  })

  it('decryptToken con payload malformado -> throw', async () => {
    const { decryptToken } = await importCrypto()
    expect(() => decryptToken('no-prefix')).toThrow()
    expect(() => decryptToken('v1:aa:bb')).toThrow()
  })
})

describe('crypto — isEncrypted', () => {
  it('null / undefined / vacío -> false', async () => {
    const { isEncrypted } = await importCrypto()
    expect(isEncrypted(null)).toBe(false)
    expect(isEncrypted('')).toBe(false)
  })

  it('valor plano legacy -> false', async () => {
    const { isEncrypted } = await importCrypto()
    expect(isEncrypted('EAAG-legacy-token-plaintext')).toBe(false)
  })

  it('ciphertext v1 recién generado -> true', async () => {
    const { encryptToken, isEncrypted } = await importCrypto()
    expect(isEncrypted(encryptToken('x'))).toBe(true)
  })

  it('prefijo v1 pero piezas incompletas -> false', async () => {
    const { isEncrypted } = await importCrypto()
    expect(isEncrypted('v1:aa:bb')).toBe(false)
    expect(isEncrypted('v1:::')).toBe(false)
  })
})

import bcrypt from 'bcryptjs'

const BCRYPT_ROUNDS = 12
const BCRYPT_PREFIXES = ['$2a$', '$2b$', '$2y$']

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS)
}

export function isBcryptHash(value: string | null | undefined): boolean {
  if (!value) return false
  return BCRYPT_PREFIXES.some((prefix) => value.startsWith(prefix))
}

export async function verifyPassword(
  plain: string,
  stored: string | null | undefined
): Promise<{ ok: boolean; legacy: boolean }> {
  if (!stored) return { ok: false, legacy: false }

  if (isBcryptHash(stored)) {
    const ok = await bcrypt.compare(plain, stored)
    return { ok, legacy: false }
  }

  const ok = stored === plain
  return { ok, legacy: ok }
}

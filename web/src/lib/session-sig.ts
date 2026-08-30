import { createHmac, timingSafeEqual } from 'crypto'

// Firma HMAC de la cookie cm_user_id. La cookie la puede escribir cualquier
// cliente (no es autoritativa por sí sola); la firma sólo la emite el server
// en el login, así que un cm_user_id forjado sin cm_session_sig válida no
// resuelve identidad en identify().
export const SESSION_SIG_COOKIE = 'cm_session_sig'

function sigKey(): string | null {
  return process.env.TOKEN_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || null
}

export function signSession(userId: string): string | null {
  const key = sigKey()
  if (!key) return null
  return createHmac('sha256', key).update(`cm_user_id:${userId}`).digest('hex')
}

export function verifySessionSig(userId: string, sig: string | null | undefined): boolean {
  if (!sig) return false
  const expected = signSession(userId)
  if (!expected) return false
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

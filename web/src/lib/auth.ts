import type { CMUser } from '@/types/database'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'

const SESSION_KEY = 'cm_user_id'

function setSessionCookie(userId: string) {
  if (typeof document === 'undefined') return
  document.cookie = `${SESSION_KEY}=${encodeURIComponent(userId)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`
}

function clearSessionCookie() {
  if (typeof document === 'undefined') return
  document.cookie = `${SESSION_KEY}=; path=/; max-age=0; samesite=lax`
}

async function persistSupabaseSession(email: string, password: string) {
  const { error } = await createSupabaseClient().auth.signInWithPassword({
    email,
    password,
  })

  return error
    ? 'No se pudo guardar la sesión segura en el navegador. Intenta nuevamente.'
    : null
}

export async function login(email: string, password: string): Promise<{ user: CMUser | null; error: string | null }> {
  const res = await fetch('/api/auth/local', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'login',
      email,
      password,
    }),
  })

  const payload = await res.json()

  if (!res.ok) {
    return { user: null, error: payload?.error || 'Invalid email or password' }
  }

  const sessionError = await persistSupabaseSession(email, password)
  if (sessionError) {
    return { user: null, error: sessionError }
  }

  if (typeof window !== 'undefined') {
    localStorage.setItem(SESSION_KEY, payload.user.id)
    setSessionCookie(payload.user.id)
  }

  return { user: payload.user as CMUser, error: null }
}

export interface RegistrationData {
  email: string
  password: string
  name: string
  organizationName?: string
  billingPhone?: string
  billingCountryCode?: string
  selectedPlanCode?: string
}

export async function register(
  emailOrData: string | RegistrationData,
  password?: string,
  name?: string
): Promise<{ user: CMUser | null; error: string | null }> {
  const data: RegistrationData =
    typeof emailOrData === 'string'
      ? { email: emailOrData, password: password || '', name: name || '' }
      : emailOrData
  const res = await fetch('/api/auth/local', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'register',
      ...data,
    }),
  })

  const payload = await res.json()

  if (!res.ok) {
    return { user: null, error: payload?.error || 'Unable to register user' }
  }

  const sessionError = await persistSupabaseSession(data.email, data.password)
  if (sessionError) {
    return { user: null, error: sessionError }
  }

  if (typeof window !== 'undefined') {
    localStorage.setItem(SESSION_KEY, payload.user.id)
    setSessionCookie(payload.user.id)
  }

  return { user: payload.user as CMUser, error: null }
}

export function getCurrentUserId(): string | null {
  if (typeof window === 'undefined') return null
  const localId = localStorage.getItem(SESSION_KEY)
  if (localId) return localId

  const cookieMatch = document.cookie.match(new RegExp(`(?:^|; )${SESSION_KEY}=([^;]*)`))
  return cookieMatch ? decodeURIComponent(cookieMatch[1]) : null
}

export class AuthTransientError extends Error {
  constructor() {
    super('auth-transient')
    this.name = 'AuthTransientError'
  }
}

export async function getCurrentUser(): Promise<CMUser | null> {
  const userId = getCurrentUserId()
  if (!userId) return null

  let res: Response
  try {
    res = await fetch('/api/auth/local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'getCurrentUser',
        userId,
      }),
    })
  } catch {
    // Network blip: not proof the session is invalid.
    throw new AuthTransientError()
  }

  if (res.status >= 500 || res.status === 429) {
    throw new AuthTransientError()
  }

  let payload: { user?: CMUser | null } | null = null
  try {
    payload = await res.json()
  } catch {
    throw new AuthTransientError()
  }

  if (!res.ok || !payload?.user) return null

  return payload.user as CMUser
}

export function logout() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(SESSION_KEY)
    clearSessionCookie()
  }
}

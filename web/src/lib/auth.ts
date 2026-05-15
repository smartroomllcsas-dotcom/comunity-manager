import type { CMUser } from '@/types/database'

const SESSION_KEY = 'cm_user_id'

export async function login(email: string, password: string): Promise<{ user: CMUser | null; error: string | null }> {
  const res = await fetch('/api/auth/local', {
    method: 'POST',
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

  if (typeof window !== 'undefined') {
    localStorage.setItem(SESSION_KEY, payload.user.id)
  }

  return { user: payload.user as CMUser, error: null }
}

export async function register(email: string, password: string, name: string): Promise<{ user: CMUser | null; error: string | null }> {
  const res = await fetch('/api/auth/local', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'register',
      email,
      password,
      name,
    }),
  })

  const payload = await res.json()

  if (!res.ok) {
    return { user: null, error: payload?.error || 'Unable to register user' }
  }

  if (typeof window !== 'undefined') {
    localStorage.setItem(SESSION_KEY, payload.user.id)
  }

  return { user: payload.user as CMUser, error: null }
}

export function getCurrentUserId(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(SESSION_KEY)
}

export async function getCurrentUser(): Promise<CMUser | null> {
  const userId = getCurrentUserId()
  if (!userId) return null

  const res = await fetch('/api/auth/local', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'getCurrentUser',
      userId,
    }),
  })

  const payload = await res.json()

  if (!res.ok || !payload?.user) return null

  return payload.user as CMUser | null
}

export function logout() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(SESSION_KEY)
  }
}

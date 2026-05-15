import { supabase } from './supabase'
import type { CMUser } from '@/types/database'

const SESSION_KEY = 'cm_user_id'

function getDbErrorMessage(error: { message?: string } | null, fallback: string) {
  if (!error?.message) return fallback
  return error.message
}

export async function login(email: string, password: string): Promise<{ user: CMUser | null; error: string | null }> {
  const { data, error } = await supabase
    .from('cm_users')
    .select('*')
    .eq('email', email.toLowerCase().trim())
    .single()

  if (error || !data) {
    if (error) {
      return { user: null, error: getDbErrorMessage(error, 'Invalid email or password') }
    }
    return { user: null, error: 'Invalid email or password' }
  }

  // Simple password check (stored as plain text for basic auth - upgrade to bcrypt for production)
  if (data.password_hash !== password) {
    return { user: null, error: 'Invalid email or password' }
  }

  if (typeof window !== 'undefined') {
    localStorage.setItem(SESSION_KEY, data.id)
  }

  return { user: data as CMUser, error: null }
}

export async function register(email: string, password: string, name: string): Promise<{ user: CMUser | null; error: string | null }> {
  const { data: existing, error: existingError } = await supabase
    .from('cm_users')
    .select('id')
    .eq('email', email.toLowerCase().trim())
    .single()

  if (existingError && existingError.code !== 'PGRST116') {
    return { user: null, error: getDbErrorMessage(existingError, 'Unable to check existing users') }
  }

  if (existing) {
    return { user: null, error: 'Email already registered' }
  }

  const { data, error } = await supabase
    .from('cm_users')
    .insert({
      email: email.toLowerCase().trim(),
      password_hash: password,
      name,
    })
    .select()
    .single()

  if (error) {
    return { user: null, error: error.message }
  }

  if (typeof window !== 'undefined') {
    localStorage.setItem(SESSION_KEY, data.id)
  }

  return { user: data as CMUser, error: null }
}

export function getCurrentUserId(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(SESSION_KEY)
}

export async function getCurrentUser(): Promise<CMUser | null> {
  const userId = getCurrentUserId()
  if (!userId) return null

  const { data, error } = await supabase
    .from('cm_users')
    .select('*')
    .eq('id', userId)
    .single()

  if (error || !data) return null

  return data as CMUser | null
}

export function logout() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(SESSION_KEY)
  }
}

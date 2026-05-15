import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import type { CMUser } from '@/types/database'

const SESSION_KEY = 'cm_user_id'

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase admin credentials')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })
}

async function readPayload(request: NextRequest) {
  const contentType = request.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    return request.json()
  }

  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    const form = await request.formData()
    return Object.fromEntries(form.entries())
  }

  return request.json()
}

function buildSessionCookie(userId: string) {
  return `${SESSION_KEY}=${encodeURIComponent(userId)}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`
}

export async function POST(request: NextRequest) {
  try {
    const body = await readPayload(request)
    const action = body?.action
    const supabase = getAdminClient()
    const wantsHtmlRedirect =
      !request.headers.get('content-type')?.includes('application/json') &&
      request.headers.get('accept')?.includes('text/html')

    if (action === 'login') {
      const email = String(body?.email || '').toLowerCase().trim()
      const password = String(body?.password || '')

      const { data, error } = await supabase
        .from('cm_users')
        .select('*')
        .eq('email', email)
        .maybeSingle()

      if (error) {
        return NextResponse.json({ user: null, error: error.message || 'Error consultando usuarios' }, { status: 500 })
      }

      if (!data || data.password_hash !== password) {
        return NextResponse.json({ user: null, error: 'Invalid email or password' }, { status: 401 })
      }

      if (wantsHtmlRedirect) {
        const response = NextResponse.redirect(new URL('/', request.url), { status: 303 })
        response.headers.set('Set-Cookie', buildSessionCookie(data.id))
        return response
      }

      return NextResponse.json({ user: data as CMUser, error: null })
    }

    if (action === 'register') {
      const email = String(body?.email || '').toLowerCase().trim()
      const password = String(body?.password || '')
      const name = String(body?.name || '').trim()

      const { data: existing, error: existingError } = await supabase
        .from('cm_users')
        .select('id')
        .eq('email', email)
        .maybeSingle()

      if (existingError) {
        return NextResponse.json(
          { user: null, error: existingError.message || 'Unable to check existing users' },
          { status: 500 }
        )
      }

      if (existing) {
        return NextResponse.json({ user: null, error: 'Email already registered' }, { status: 409 })
      }

      const { data, error } = await supabase
        .from('cm_users')
        .insert({
          email,
          password_hash: password,
          name,
        })
        .select()
        .single()

      if (error) {
        return NextResponse.json({ user: null, error: error.message }, { status: 500 })
      }

      if (wantsHtmlRedirect) {
        const response = NextResponse.redirect(new URL('/', request.url), { status: 303 })
        response.headers.set('Set-Cookie', buildSessionCookie(data.id))
        return response
      }

      return NextResponse.json({ user: data as CMUser, error: null })
    }

    if (action === 'getCurrentUser') {
      const userId = String(body?.userId || '').trim()
      if (!userId) {
        return NextResponse.json({ user: null, error: null })
      }

      const { data, error } = await supabase
        .from('cm_users')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (error) {
        return NextResponse.json({ user: null, error: error.message }, { status: 500 })
      }

      return NextResponse.json({ user: data as CMUser | null, error: null })
    }

    return NextResponse.json({ user: null, error: 'Unsupported action' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected auth error'
    return NextResponse.json({ user: null, error: message }, { status: 500 })
  }
}

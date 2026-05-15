import { NextRequest, NextResponse } from 'next/server'
import type { CMUser } from '@/types/database'

const SESSION_KEY = 'cm_user_id'

function getSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase admin credentials')
  }

  return { supabaseUrl, serviceRoleKey }
}

async function supabaseRest<T>(
  path: string,
  {
    method = 'GET',
    body,
    prefer = 'return=representation',
  }: {
    method?: string
    body?: unknown
    prefer?: string
  } = {}
): Promise<{ data: T | null; error: { message: string } | null; status: number }> {
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig()
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: prefer,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const text = await res.text()
  let parsed: unknown = null

  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = text
    }
  }

  if (!res.ok) {
    const message =
      typeof parsed === 'string'
        ? parsed
        : Array.isArray(parsed)
          ? 'Supabase request failed'
          : (parsed as { message?: string; error?: string } | null)?.message ||
            (parsed as { message?: string; error?: string } | null)?.error ||
            `Supabase request failed (${res.status})`
    return { data: null, error: { message }, status: res.status }
  }

  return { data: parsed as T, error: null, status: res.status }
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
    const wantsHtmlRedirect =
      !request.headers.get('content-type')?.includes('application/json') &&
      request.headers.get('accept')?.includes('text/html')

    if (action === 'login') {
      const email = String(body?.email || '').toLowerCase().trim()
      const password = String(body?.password || '')

      const { data, error } = await supabaseRest<CMUser[]>(
        `cm_users?select=*&email=eq.${encodeURIComponent(email)}`
      )

      if (error) {
        return NextResponse.json({ user: null, error: error.message || 'Error consultando usuarios' }, { status: 500 })
      }

      const user = Array.isArray(data) ? data[0] : null

      if (!user || user.password_hash !== password) {
        return NextResponse.json({ user: null, error: 'Invalid email or password' }, { status: 401 })
      }

      if (wantsHtmlRedirect) {
        const response = NextResponse.redirect(new URL('/', request.url), { status: 303 })
        response.headers.set('Set-Cookie', buildSessionCookie(user.id))
        return response
      }

      return NextResponse.json({ user, error: null })
    }

    if (action === 'register') {
      const email = String(body?.email || '').toLowerCase().trim()
      const password = String(body?.password || '')
      const name = String(body?.name || '').trim()

      const { data: existingRows, error: existingError } = await supabaseRest<Pick<CMUser, 'id'>[]>(
        `cm_users?select=id&email=eq.${encodeURIComponent(email)}`
      )

      if (existingError) {
        return NextResponse.json(
          { user: null, error: existingError.message || 'Unable to check existing users' },
          { status: 500 }
        )
      }

      if (Array.isArray(existingRows) && existingRows.length > 0) {
        return NextResponse.json({ user: null, error: 'Email already registered' }, { status: 409 })
      }

      const { data, error } = await supabaseRest<CMUser[]>(
        'cm_users',
        {
          method: 'POST',
          body: {
            email,
            password_hash: password,
            name,
          },
        }
      )

      if (error) {
        return NextResponse.json({ user: null, error: error.message }, { status: 500 })
      }

      const user = Array.isArray(data) ? data[0] : null

      if (!user) {
        return NextResponse.json({ user: null, error: 'Unable to create user' }, { status: 500 })
      }

      if (wantsHtmlRedirect) {
        const response = NextResponse.redirect(new URL('/', request.url), { status: 303 })
        response.headers.set('Set-Cookie', buildSessionCookie(user.id))
        return response
      }

      return NextResponse.json({ user, error: null })
    }

    if (action === 'getCurrentUser') {
      const userId = String(body?.userId || '').trim()
      if (!userId) {
        return NextResponse.json({ user: null, error: null })
      }

      const { data, error } = await supabaseRest<CMUser[]>(
        `cm_users?select=*&id=eq.${encodeURIComponent(userId)}`
      )

      if (error) {
        return NextResponse.json({ user: null, error: error.message }, { status: 500 })
      }

      return NextResponse.json({ user: Array.isArray(data) ? data[0] ?? null : null, error: null })
    }

    return NextResponse.json({ user: null, error: 'Unsupported action' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected auth error'
    return NextResponse.json({ user: null, error: message }, { status: 500 })
  }
}

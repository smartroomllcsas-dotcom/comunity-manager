import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createServerClient } from '@supabase/ssr'
import type { CMUser } from '@/types/database'
import { mysqlQuery, quoteId } from '@/lib/mysql'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { clientIp, rateLimit } from '@/lib/rate-limit'

const SESSION_KEY = 'cm_user_id'
const LOGIN_RATE_LIMIT = 5
const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000

function checkLoginRateLimit(request: NextRequest, email: string) {
  const key = `login:${clientIp(request.headers)}:${email.toLowerCase()}`
  return rateLimit(key, LOGIN_RATE_LIMIT, LOGIN_RATE_WINDOW_MS)
}

function tooManyAttempts(retryAfterSeconds: number) {
  return NextResponse.json(
    { user: null, error: 'Demasiados intentos. Intenta más tarde.' },
    {
      status: 429,
      headers: { 'Retry-After': String(retryAfterSeconds) },
    }
  )
}

function getDbProvider() {
  return (process.env.NEXT_PUBLIC_DB_PROVIDER || process.env.DB_PROVIDER || 'supabase').toLowerCase()
}

function isMysqlMode() {
  return process.env.NODE_ENV !== 'production' && getDbProvider() === 'mysql'
}

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
  const parts = [
    `${SESSION_KEY}=${encodeURIComponent(userId)}`,
    'Path=/',
    `Max-Age=${60 * 60 * 24 * 30}`,
    'SameSite=Lax',
    'HttpOnly',
  ]
  if (process.env.NODE_ENV === 'production') parts.push('Secure')
  return parts.join('; ')
}

function nowSql() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

async function bridgeSmarttalkSession(
  request: NextRequest,
  response: NextResponse,
  cmUser: CMUser,
  email: string,
  password: string
) {
  const publicAdmin = createAdminClient('public')
  const smarttalkAdmin = createAdminClient('smarttalk')

  const { data: authUsers, error: listErr } = await publicAdmin.auth.admin.listUsers()
  if (listErr) {
    return `No pude consultar usuarios de autenticación: ${listErr.message}`
  }

  const existingAuthUser = authUsers.users.find(
    (authUser) => authUser.email?.toLowerCase() === email.toLowerCase()
  )

  if (existingAuthUser) {
    const { error: updateErr } = await publicAdmin.auth.admin.updateUserById(existingAuthUser.id, {
      password,
      email_confirm: true,
    })
    if (updateErr) {
      return `No pude sincronizar la contraseña con Supabase Auth: ${updateErr.message}`
    }
  } else {
    const { data: created, error: createErr } = await publicAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name: cmUser.name,
        source: 'cm_bridge',
      },
    })
    if (createErr || !created?.user) {
      return `No pude crear el usuario de autenticación: ${createErr?.message || 'error desconocido'}`
    }
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: 'smarttalk' },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (signInErr || !signInData?.user) {
    return `No pude iniciar sesión en Supabase Auth: ${signInErr?.message || 'error desconocido'}`
  }

  const authUserId = signInData.user.id

  const { data: agent } = await smarttalkAdmin
    .from('agents')
    .select('id, organization_id')
    .eq('id', authUserId)
    .maybeSingle()

  if (!agent) {
    let organizationId: string | null = null

    if (cmUser.cm_client_id) {
      const { data: bridged } = await publicAdmin
        .from('cm_clients')
        .select('smarttalk_organization_id')
        .eq('id', cmUser.cm_client_id)
        .maybeSingle()

      organizationId = bridged?.smarttalk_organization_id ?? null
    }

    if (!organizationId) {
      const orgName = cmUser.name ? `${cmUser.name} Workspace` : `${email} Workspace`
      const { data: org, error: orgErr } = await smarttalkAdmin
        .from('organizations')
        .insert({ name: orgName, cm_client_id: cmUser.cm_client_id ?? null })
        .select('id')
        .single()

      if (orgErr || !org) {
        return `No pude crear la organización de SmartTalk: ${orgErr?.message || 'error desconocido'}`
      }

      organizationId = org.id

      if (cmUser.cm_client_id) {
        await publicAdmin
          .from('cm_clients')
          .update({ smarttalk_organization_id: organizationId })
          .eq('id', cmUser.cm_client_id)
      }
    }

    const role = cmUser.role === 'admin' ? 'admin' : 'agent'
    const { error: agentErr } = await smarttalkAdmin.from('agents').insert({
      id: authUserId,
      organization_id: organizationId,
      email,
      name: cmUser.name ?? email,
      role,
      status: 'online',
    })

    if (agentErr) {
      return `No pude crear el agente de SmartTalk: ${agentErr.message}`
    }
  }

  response.cookies.set(SESSION_KEY, cmUser.id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })

  return null
}

async function mysqlGetUserByEmail(email: string): Promise<CMUser | null> {
  const rows = await mysqlQuery<CMUser[]>(
    `SELECT * FROM ${quoteId('cm_users')} WHERE ${quoteId('email')} = ? LIMIT 1`,
    [email]
  )
  return rows[0] ?? null
}

async function mysqlGetUserById(userId: string): Promise<CMUser | null> {
  const rows = await mysqlQuery<CMUser[]>(
    `SELECT * FROM ${quoteId('cm_users')} WHERE ${quoteId('id')} = ? LIMIT 1`,
    [userId]
  )
  return rows[0] ?? null
}

async function handleMysqlAuth(request: NextRequest, body: any) {
  const action = body?.action
  const wantsHtmlRedirect =
    !request.headers.get('content-type')?.includes('application/json') &&
    request.headers.get('accept')?.includes('text/html')

  if (action === 'login') {
    const email = String(body?.email || '').toLowerCase().trim()
    const password = String(body?.password || '')

    const gate = checkLoginRateLimit(request, email)
    if (!gate.ok) return tooManyAttempts(gate.retryAfterSeconds)

    const user = await mysqlGetUserByEmail(email)
    const verdict = await verifyPassword(password, user?.password_hash)

    if (!user || !verdict.ok) {
      return NextResponse.json({ user: null, error: 'Invalid email or password' }, { status: 401 })
    }

    if (verdict.legacy) {
      const rehashed = await hashPassword(password)
      await mysqlQuery(
        `UPDATE ${quoteId('cm_users')} SET ${quoteId('password_hash')} = ?, ${quoteId('updated_at')} = ? WHERE ${quoteId('id')} = ?`,
        [rehashed, nowSql(), user.id]
      )
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

    const existing = await mysqlGetUserByEmail(email)
    if (existing) {
      return NextResponse.json({ user: null, error: 'Email already registered' }, { status: 409 })
    }

    const userId = randomUUID()
    const timestamp = nowSql()
    const passwordHash = await hashPassword(password)

    await mysqlQuery(
      `INSERT INTO ${quoteId('cm_users')} (
        ${quoteId('id')},
        ${quoteId('email')},
        ${quoteId('password_hash')},
        ${quoteId('name')},
        ${quoteId('role')},
        ${quoteId('plan')},
        ${quoteId('avatar_url')},
        ${quoteId('created_at')},
        ${quoteId('updated_at')}
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, email, passwordHash, name, 'user', 'free', null, timestamp, timestamp]
    )

    const user = await mysqlGetUserById(userId)

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

    const user = await mysqlGetUserById(userId)
    return NextResponse.json({ user, error: null })
  }

  return NextResponse.json({ user: null, error: 'Unsupported action' }, { status: 400 })
}

export async function POST(request: NextRequest) {
  try {
    const body = await readPayload(request)

    if (isMysqlMode()) {
      return await handleMysqlAuth(request, body)
    }

    const action = body?.action
    const wantsHtmlRedirect =
      !request.headers.get('content-type')?.includes('application/json') &&
      request.headers.get('accept')?.includes('text/html')

    if (action === 'login') {
      const email = String(body?.email || '').toLowerCase().trim()
      const password = String(body?.password || '')

      const gate = checkLoginRateLimit(request, email)
      if (!gate.ok) return tooManyAttempts(gate.retryAfterSeconds)

      const { data, error } = await supabaseRest<CMUser[]>(
        `cm_users?select=*&email=eq.${encodeURIComponent(email)}`
      )

      if (error) {
        return NextResponse.json({ user: null, error: error.message || 'Error consultando usuarios' }, { status: 500 })
      }

      const user = Array.isArray(data) ? data[0] : null
      const verdict = await verifyPassword(password, user?.password_hash)

      if (!user || !verdict.ok) {
        return NextResponse.json({ user: null, error: 'Invalid email or password' }, { status: 401 })
      }

      if (verdict.legacy) {
        const rehashed = await hashPassword(password)
        await supabaseRest(`cm_users?id=eq.${encodeURIComponent(user.id)}`, {
          method: 'PATCH',
          body: { password_hash: rehashed },
          prefer: 'return=minimal',
        })
        user.password_hash = rehashed
      }

      const response = wantsHtmlRedirect
        ? NextResponse.redirect(new URL('/', request.url), { status: 303 })
        : NextResponse.json({ user, error: null })

      const bridgeError = await bridgeSmarttalkSession(request, response, user, email, password)
      if (bridgeError) {
        return NextResponse.json({ user: null, error: bridgeError }, { status: 500 })
      }

      return response
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

      const passwordHash = await hashPassword(password)
      const { data, error } = await supabaseRest<CMUser[]>(
        'cm_users',
        {
          method: 'POST',
          body: {
            email,
            password_hash: passwordHash,
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

      const response = wantsHtmlRedirect
        ? NextResponse.redirect(new URL('/', request.url), { status: 303 })
        : NextResponse.json({ user, error: null })

      const bridgeError = await bridgeSmarttalkSession(request, response, user, email, password)
      if (bridgeError) {
        return NextResponse.json({ user: null, error: bridgeError }, { status: 500 })
      }

      return response
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

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import type { CMUser } from '@/types/database'

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const action = body?.action
    const supabase = getAdminClient()

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

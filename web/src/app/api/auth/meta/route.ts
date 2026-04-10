import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getOAuthUrl } from '@/lib/meta'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get('clientId')

  if (!clientId) {
    return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })
  }

  if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
    return NextResponse.json({ error: 'Meta API no configurada' }, { status: 500 })
  }

  const state = `${clientId}:${crypto.randomBytes(16).toString('hex')}`

  // Store state for verification
  await supabase.from('cm_oauth_states').insert({ state, client_id: clientId })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
  const redirectUri = `${appUrl}/api/auth/meta/callback`

  const authUrl = getOAuthUrl(redirectUri, state)

  return NextResponse.redirect(authUrl)
}

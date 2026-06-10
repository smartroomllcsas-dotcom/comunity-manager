import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

function getInstagramAppId() {
  return process.env.INSTAGRAM_APP_ID || process.env.META_IG_APP_ID || ''
}

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) {
    return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })
  }

  const appId = getInstagramAppId()
  if (!appId) {
    return NextResponse.json({ error: 'Instagram API no configurada' }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
  const redirectUri = `${appUrl}/api/auth/instagram/callback`
  const state = `instagram:${clientId}:${crypto.randomBytes(12).toString('hex')}`

  const admin = createAdminClient('public')
  await admin.from('cm_oauth_states').insert({ state, client_id: clientId })

  const scopes = [
    'instagram_business_basic',
    'instagram_business_manage_messages',
    'pages_show_list',
    'pages_read_engagement',
    'business_management',
  ].join(',')

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes,
    state,
  })

  const embedUrl = process.env.NEXT_PUBLIC_INSTAGRAM_LOGIN_URL?.trim()
  if (embedUrl) {
    const url = new URL(embedUrl)
    if (!url.searchParams.get('state')) {
      url.searchParams.set('state', state)
    } else {
      url.searchParams.set('state', state)
    }
    return NextResponse.redirect(url.toString())
  }

  return NextResponse.redirect(`https://www.instagram.com/oauth/authorize?${params}`)
}

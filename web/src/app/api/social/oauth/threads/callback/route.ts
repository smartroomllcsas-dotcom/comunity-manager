import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { encryptToken } from '@/lib/crypto'
import { exchangeThreadsCode, getThreadsUser, THREADS_SCOPES } from '@/lib/social/threads'

/**
 * GET /api/social/oauth/threads/callback
 */
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const err = request.nextUrl.searchParams.get('error')

  if (err) {
    return NextResponse.redirect(
      `${appUrl}/clients?threads_error=${encodeURIComponent(err)}`,
    )
  }
  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/clients?threads_error=Parametros+invalidos`)
  }

  const { data: oauthState } = await supabaseAdmin
    .from('cm_oauth_states')
    .select('*')
    .eq('state', state)
    .single()
  if (!oauthState) {
    return NextResponse.redirect(`${appUrl}/clients?threads_error=Estado+invalido`)
  }
  const clientId: string = oauthState.client_id
  await supabaseAdmin.from('cm_oauth_states').delete().eq('state', state)

  const metaAppId = process.env.META_APP_ID
  const metaSecret = process.env.META_APP_SECRET
  const redirectUri = process.env.THREADS_REDIRECT_URI
  if (!metaAppId || !metaSecret || !redirectUri) {
    return NextResponse.redirect(
      `${appUrl}/clients?threads_error=Threads+no+configurado`,
    )
  }

  try {
    const tok = await exchangeThreadsCode(code, metaAppId, metaSecret, redirectUri)
    const user = await getThreadsUser(tok.access_token).catch(() => null)

    const expiresAt = new Date(Date.now() + tok.expires_in * 1000).toISOString()

    const payload: Record<string, unknown> = {
      client_id: clientId,
      platform: 'threads',
      account_id: tok.user_id,
      account_name: user?.username ?? user?.name ?? null,
      access_token_ciphertext: encryptToken(tok.access_token),
      token_expires_at: expiresAt,
      scopes: [...THREADS_SCOPES],
      status: 'active',
      metadata: {
        picture: user?.threads_profile_picture_url ?? null,
        connected_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    }

    const { data: existing } = await supabaseAdmin
      .from('cm_social_accounts')
      .select('id')
      .eq('client_id', clientId)
      .eq('platform', 'threads')
      .maybeSingle()

    if (existing) {
      await supabaseAdmin.from('cm_social_accounts').update(payload).eq('id', existing.id)
    } else {
      await supabaseAdmin.from('cm_social_accounts').insert(payload)
    }

    return NextResponse.redirect(`${appUrl}/clients?threads_ok=1`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[threads-oauth] callback failed:', msg)
    return NextResponse.redirect(
      `${appUrl}/clients?threads_error=${encodeURIComponent('Fallo autenticacion')}`,
    )
  }
}

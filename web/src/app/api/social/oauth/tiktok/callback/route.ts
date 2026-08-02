import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { encryptToken } from '@/lib/crypto'
import { exchangeTikTokCode, getTikTokUser, TIKTOK_SCOPES } from '@/lib/social/tiktok'

/**
 * GET /api/social/oauth/tiktok/callback
 * TikTok redirects here with { code, state } (or { error }). We validate the
 * state against `cm_oauth_states`, exchange the code for tokens, cipher the
 * access + refresh tokens, and upsert into `cm_social_accounts`.
 */
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const err = request.nextUrl.searchParams.get('error')

  if (err) {
    return NextResponse.redirect(
      `${appUrl}/clients?tiktok_error=${encodeURIComponent(err)}`,
    )
  }
  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/clients?tiktok_error=Parametros+invalidos`)
  }

  const { data: oauthState } = await supabaseAdmin
    .from('cm_oauth_states')
    .select('*')
    .eq('state', state)
    .single()
  if (!oauthState) {
    return NextResponse.redirect(`${appUrl}/clients?tiktok_error=Estado+invalido`)
  }
  const clientId: string = oauthState.client_id
  await supabaseAdmin.from('cm_oauth_states').delete().eq('state', state)

  const clientKey = process.env.TIKTOK_CLIENT_KEY
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET
  const redirectUri = process.env.TIKTOK_REDIRECT_URI
  if (!clientKey || !clientSecret || !redirectUri) {
    return NextResponse.redirect(
      `${appUrl}/clients?tiktok_error=TikTok+no+configurado`,
    )
  }

  try {
    const tok = await exchangeTikTokCode(code, clientKey, clientSecret, redirectUri)
    const user = await getTikTokUser(tok.access_token).catch(() => null)

    const expiresAt = new Date(Date.now() + tok.expires_in * 1000).toISOString()

    const payload: Record<string, unknown> = {
      client_id: clientId,
      platform: 'tiktok',
      account_id: tok.open_id,
      account_name: user?.display_name ?? null,
      access_token_ciphertext: encryptToken(tok.access_token),
      refresh_token_encrypted: tok.refresh_token ? encryptToken(tok.refresh_token) : null,
      token_expires_at: expiresAt,
      scopes: [...TIKTOK_SCOPES],
      status: 'active',
      metadata: {
        avatar_url: user?.avatar_url ?? null,
        connected_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    }

    // Upsert by (client_id, platform).
    const { data: existing } = await supabaseAdmin
      .from('cm_social_accounts')
      .select('id')
      .eq('client_id', clientId)
      .eq('platform', 'tiktok')
      .maybeSingle()

    if (existing) {
      await supabaseAdmin.from('cm_social_accounts').update(payload).eq('id', existing.id)
    } else {
      await supabaseAdmin.from('cm_social_accounts').insert(payload)
    }

    return NextResponse.redirect(`${appUrl}/clients?tiktok_ok=1`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[tiktok-oauth] callback failed:', msg)
    return NextResponse.redirect(
      `${appUrl}/clients?tiktok_error=${encodeURIComponent('Fallo autenticacion')}`,
    )
  }
}

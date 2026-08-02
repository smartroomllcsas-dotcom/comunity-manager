import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { encryptToken } from '@/lib/crypto'
import {
  exchangeYouTubeCode,
  getYouTubeChannel,
  YOUTUBE_SCOPES,
} from '@/lib/social/youtube'

/**
 * GET /api/social/oauth/youtube/callback
 * Google redirects here with { code, state } (or { error }). We validate the
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
      `${appUrl}/clients?youtube_error=${encodeURIComponent(err)}`,
    )
  }
  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/clients?youtube_error=Parametros+invalidos`)
  }

  const { data: oauthState } = await supabaseAdmin
    .from('cm_oauth_states')
    .select('*')
    .eq('state', state)
    .single()
  if (!oauthState) {
    return NextResponse.redirect(`${appUrl}/clients?youtube_error=Estado+invalido`)
  }
  const clientId: string = oauthState.client_id
  await supabaseAdmin.from('cm_oauth_states').delete().eq('state', state)

  const ytClientId = process.env.YOUTUBE_CLIENT_ID
  const ytSecret = process.env.YOUTUBE_CLIENT_SECRET
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI
  if (!ytClientId || !ytSecret || !redirectUri) {
    return NextResponse.redirect(
      `${appUrl}/clients?youtube_error=YouTube+no+configurado`,
    )
  }

  try {
    const tok = await exchangeYouTubeCode(code, ytClientId, ytSecret, redirectUri)
    const channel = await getYouTubeChannel(tok.access_token).catch(() => null)

    const expiresAt = new Date(Date.now() + tok.expires_in * 1000).toISOString()

    const payload: Record<string, unknown> = {
      client_id: clientId,
      platform: 'youtube',
      account_id: channel?.channel_id ?? '',
      account_name: channel?.title ?? null,
      access_token_ciphertext: encryptToken(tok.access_token),
      refresh_token_encrypted: tok.refresh_token ? encryptToken(tok.refresh_token) : null,
      token_expires_at: expiresAt,
      scopes: [...YOUTUBE_SCOPES],
      status: 'active',
      metadata: {
        thumbnail: channel?.thumbnail ?? null,
        custom_url: channel?.custom_url ?? null,
        connected_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    }

    const { data: existing } = await supabaseAdmin
      .from('cm_social_accounts')
      .select('id')
      .eq('client_id', clientId)
      .eq('platform', 'youtube')
      .maybeSingle()

    if (existing) {
      await supabaseAdmin.from('cm_social_accounts').update(payload).eq('id', existing.id)
    } else {
      await supabaseAdmin.from('cm_social_accounts').insert(payload)
    }

    return NextResponse.redirect(`${appUrl}/clients?youtube_ok=1`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[youtube-oauth] callback failed:', msg)
    return NextResponse.redirect(
      `${appUrl}/clients?youtube_error=${encodeURIComponent(msg)}`,
    )
  }
}

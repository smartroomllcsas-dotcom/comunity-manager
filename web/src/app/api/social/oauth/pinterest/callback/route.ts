import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { encryptToken } from '@/lib/crypto'
import {
  exchangePinterestCode,
  getPinterestUser,
  listPinterestBoards,
  PINTEREST_SCOPES,
} from '@/lib/social/pinterest'

/**
 * GET /api/social/oauth/pinterest/callback
 *
 * Persists the Pinterest account row keyed by username. Also caches the first
 * board id in metadata as the default `board_id` used by the publisher
 * dispatcher — the UI can override this per-post later.
 */
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const err = request.nextUrl.searchParams.get('error')

  if (err) {
    return NextResponse.redirect(
      `${appUrl}/clients?pinterest_error=${encodeURIComponent(err)}`,
    )
  }
  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/clients?pinterest_error=Parametros+invalidos`)
  }

  const { data: oauthState } = await supabaseAdmin
    .from('cm_oauth_states')
    .select('*')
    .eq('state', state)
    .single()
  if (!oauthState) {
    return NextResponse.redirect(`${appUrl}/clients?pinterest_error=Estado+invalido`)
  }
  const clientId: string = oauthState.client_id
  await supabaseAdmin.from('cm_oauth_states').delete().eq('state', state)

  const appId = process.env.PINTEREST_APP_ID
  const appSecret = process.env.PINTEREST_APP_SECRET
  const redirectUri = process.env.PINTEREST_REDIRECT_URI
  if (!appId || !appSecret || !redirectUri) {
    return NextResponse.redirect(
      `${appUrl}/clients?pinterest_error=Pinterest+no+configurado`,
    )
  }

  try {
    const tok = await exchangePinterestCode(code, appId, appSecret, redirectUri)
    const user = await getPinterestUser(tok.access_token).catch(() => null)
    const boards = await listPinterestBoards(tok.access_token).catch(() => [])

    const expiresAt = new Date(Date.now() + tok.expires_in * 1000).toISOString()
    const defaultBoard = boards[0]

    const payload: Record<string, unknown> = {
      client_id: clientId,
      platform: 'pinterest',
      account_id: user?.username ?? user?.id ?? '',
      account_name: user?.username ?? null,
      access_token_ciphertext: encryptToken(tok.access_token),
      refresh_token_encrypted: tok.refresh_token ? encryptToken(tok.refresh_token) : null,
      token_expires_at: expiresAt,
      scopes: [...PINTEREST_SCOPES],
      status: 'active',
      metadata: {
        account_type: user?.account_type ?? null,
        profile_image: user?.profile_image ?? null,
        website_url: user?.website_url ?? null,
        board_id: defaultBoard?.id ?? null,
        board_name: defaultBoard?.name ?? null,
        boards: boards.map((b) => ({ id: b.id, name: b.name })),
        connected_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    }

    const { data: existing } = await supabaseAdmin
      .from('cm_social_accounts')
      .select('id')
      .eq('client_id', clientId)
      .eq('platform', 'pinterest')
      .maybeSingle()

    if (existing) {
      await supabaseAdmin.from('cm_social_accounts').update(payload).eq('id', existing.id)
    } else {
      await supabaseAdmin.from('cm_social_accounts').insert(payload)
    }

    return NextResponse.redirect(`${appUrl}/clients?pinterest_ok=1`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[pinterest-oauth] callback failed:', msg)
    return NextResponse.redirect(
      `${appUrl}/clients?pinterest_error=${encodeURIComponent(msg)}`,
    )
  }
}

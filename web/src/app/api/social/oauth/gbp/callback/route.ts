import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { encryptToken } from '@/lib/crypto'
import {
  exchangeGBPCode,
  listGBPAccounts,
  listGBPLocations,
  GBP_SCOPES,
} from '@/lib/social/gbp'

/**
 * GET /api/social/oauth/gbp/callback
 *
 * Persists one row per verified location the authenticated user administers.
 * Each row uses `platform='gbp'`, `account_id = "accounts/{a}/locations/{l}"`
 * and stores the location metadata so the publisher can resolve the target.
 *
 * If no locations are found (e.g. user has no verified profile yet), we still
 * persist a single "pending" row with the account name so the UI can prompt.
 */
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const err = request.nextUrl.searchParams.get('error')

  if (err) {
    return NextResponse.redirect(
      `${appUrl}/clients?gbp_error=${encodeURIComponent(err)}`,
    )
  }
  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/clients?gbp_error=Parametros+invalidos`)
  }

  const { data: oauthState } = await supabaseAdmin
    .from('cm_oauth_states')
    .select('*')
    .eq('state', state)
    .single()
  if (!oauthState) {
    return NextResponse.redirect(`${appUrl}/clients?gbp_error=Estado+invalido`)
  }
  const clientId: string = oauthState.client_id
  await supabaseAdmin.from('cm_oauth_states').delete().eq('state', state)

  const gbpClientId = process.env.GBP_CLIENT_ID
  const gbpSecret = process.env.GBP_CLIENT_SECRET
  const redirectUri = process.env.GBP_REDIRECT_URI
  if (!gbpClientId || !gbpSecret || !redirectUri) {
    return NextResponse.redirect(
      `${appUrl}/clients?gbp_error=Google+Business+Profile+no+configurado`,
    )
  }

  try {
    const tok = await exchangeGBPCode(code, gbpClientId, gbpSecret, redirectUri)
    const expiresAt = new Date(Date.now() + tok.expires_in * 1000).toISOString()
    const cipherAccess = encryptToken(tok.access_token)
    const cipherRefresh = tok.refresh_token ? encryptToken(tok.refresh_token) : null

    const basePayload = {
      client_id: clientId,
      platform: 'gbp',
      access_token_ciphertext: cipherAccess,
      refresh_token_encrypted: cipherRefresh,
      token_expires_at: expiresAt,
      scopes: [...GBP_SCOPES],
      status: 'active',
      updated_at: new Date().toISOString(),
    }

    const accounts = await listGBPAccounts(tok.access_token)

    let persistedCount = 0
    for (const account of accounts) {
      let locations = [] as Awaited<ReturnType<typeof listGBPLocations>>
      try {
        locations = await listGBPLocations(tok.access_token, account.name)
      } catch (locErr) {
        console.warn('[gbp-oauth] listLocations failed for', account.name, locErr)
        continue
      }

      for (const loc of locations) {
        const locationName = loc.name // "accounts/{a}/locations/{l}"
        const payload = {
          ...basePayload,
          account_id: locationName,
          account_name: loc.title ?? account.accountName ?? locationName,
          metadata: {
            location_name: locationName,
            account_name: account.name,
            account_type: account.type ?? null,
            title: loc.title ?? null,
            website: loc.websiteUri ?? null,
            place_id: loc.metadata?.placeId ?? null,
            maps_uri: loc.metadata?.mapsUri ?? null,
            can_operate_local_post: loc.metadata?.canOperateLocalPost ?? null,
            verified: loc.metadata?.hasVoiceOfMerchant ?? null,
            connected_at: new Date().toISOString(),
          },
        }

        const { data: existing } = await supabaseAdmin
          .from('cm_social_accounts')
          .select('id')
          .eq('client_id', clientId)
          .eq('platform', 'gbp')
          .eq('account_id', locationName)
          .maybeSingle()

        if (existing) {
          await supabaseAdmin.from('cm_social_accounts').update(payload).eq('id', existing.id)
        } else {
          await supabaseAdmin.from('cm_social_accounts').insert(payload)
        }
        persistedCount++
      }
    }

    if (persistedCount === 0) {
      // No verified locations — keep a placeholder row so the UI can prompt.
      const account = accounts[0]
      const placeholder = {
        ...basePayload,
        account_id: account?.name ?? 'no-location',
        account_name: account?.accountName ?? 'Sin ubicacion verificada',
        status: 'pending',
        metadata: {
          note: 'No verified/published locations available for this Google account',
          account_name: account?.name ?? null,
          connected_at: new Date().toISOString(),
        },
      }
      const { data: existing } = await supabaseAdmin
        .from('cm_social_accounts')
        .select('id')
        .eq('client_id', clientId)
        .eq('platform', 'gbp')
        .eq('account_id', placeholder.account_id)
        .maybeSingle()
      if (existing) {
        await supabaseAdmin.from('cm_social_accounts').update(placeholder).eq('id', existing.id)
      } else {
        await supabaseAdmin.from('cm_social_accounts').insert(placeholder)
      }
    }

    return NextResponse.redirect(`${appUrl}/clients?gbp_ok=${persistedCount}`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[gbp-oauth] callback failed:', msg)
    return NextResponse.redirect(
      `${appUrl}/clients?gbp_error=${encodeURIComponent(msg)}`,
    )
  }
}

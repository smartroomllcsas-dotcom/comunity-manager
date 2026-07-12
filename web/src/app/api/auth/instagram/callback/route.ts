import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  exchangeInstagramCode,
  getInstagramLongLivedToken,
  getInstagramProfile,
} from '@/lib/instagram'
import { subscribeInstagramAccountToApp } from '@/lib/meta'
import { encryptToken } from '@/lib/auth/token-crypto'

const REDIRECT_URI_FALLBACK = 'https://www.comunitymanager.io/'

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
  const code = request.nextUrl.searchParams.get('code')
  const error = request.nextUrl.searchParams.get('error')
  const errorReason = request.nextUrl.searchParams.get('error_reason')
  const state = request.nextUrl.searchParams.get('state')
  // Instagram registered redirect_uri must match exactly.
  const redirectUri = `${appUrl}/api/auth/instagram/callback`

  const successUrl = (params: Record<string, string>) =>
    `${appUrl}/test-fb-login?${new URLSearchParams(params)}`

  if (error) {
    return NextResponse.redirect(
      successUrl({
        ig_error: error,
        ig_error_reason: errorReason || '',
      })
    )
  }

  if (!code) {
    return NextResponse.redirect(successUrl({ ig_error: 'missing_code' }))
  }

  try {
    const stateRecord = state
      ? await createAdminClient('public')
          .from('cm_oauth_states')
          .select('state, client_id')
          .eq('state', state)
          .maybeSingle()
      : { data: null }
    const clientId = stateRecord?.data?.client_id || null
    if (state && clientId) {
      await createAdminClient('public').from('cm_oauth_states').delete().eq('state', state)
    }

    const short = await exchangeInstagramCode(code, redirectUri)
    let longTokenStr: string
    let expiresIn = 0
    try {
      const long = await getInstagramLongLivedToken(short.access_token)
      longTokenStr = long.access_token
      expiresIn = long.expires_in
    } catch {
      // If long-lived exchange fails (rare for fresh tokens), fall back to short.
      longTokenStr = short.access_token
    }

    const profile = await getInstagramProfile(longTokenStr)

    if (clientId) {
      const publicAdmin = createAdminClient('public')
      const { data: existing } = await publicAdmin
        .from('cm_social_accounts')
        .select('*')
        .eq('client_id', clientId)
        .maybeSingle()

      const tokenExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null
      const socialData = {
        client_id: clientId,
        access_token: null as string | null,
        access_token_ciphertext: encryptToken(longTokenStr),
        instagram_id: profile.id,
        instagram_username: profile.username,
        connected_at: new Date().toISOString(),
        token_expires_at: tokenExpiresAt,
      }

      if (existing) {
        const { error: updateError } = await publicAdmin
          .from('cm_social_accounts')
          .update(socialData)
          .eq('id', existing.id)
        if (updateError) {
          throw updateError
        }
      } else {
        const { error: insertError } = await publicAdmin.from('cm_social_accounts').insert(socialData)
        if (insertError) {
          throw insertError
        }
      }

      try {
        await subscribeInstagramAccountToApp(profile.id, longTokenStr)
      } catch (subscriptionError) {
        console.warn('[ig-oauth-callback] instagram subscription failed', subscriptionError)
      }

      const { data: client } = await publicAdmin
        .from('cm_clients')
        .select('user_id, name')
        .eq('id', clientId)
        .single()
      if (client) {
        await publicAdmin.from('cm_activity_log').insert({
          user_id: client.user_id,
          action: `Instagram conectado: @${profile.username} para ${client.name}`,
          status: 'success',
        })
      }

      return NextResponse.redirect(
        `${appUrl}/clients?${new URLSearchParams({
          meta_success: `Instagram conectado: @${profile.username}`,
          meta_client_id: clientId,
          meta_flow: 'instagram',
          meta_page: profile.username,
          meta_page_id: profile.id,
          meta_instagram: profile.username,
        }).toString()}`
      )
    }

    return NextResponse.redirect(
      successUrl({
        ig_success: 'true',
        ig_user_id: String(profile.id),
        ig_username: profile.username,
        ig_account_type: profile.account_type || '',
        ig_expires_in: String(expiresIn),
      })
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    console.error('[ig-oauth-callback]', msg)
    return NextResponse.redirect(successUrl({ ig_error: msg }))
  }
}

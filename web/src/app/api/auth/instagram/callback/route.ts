import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  exchangeInstagramCode,
  getInstagramLongLivedToken,
  getInstagramProfile,
} from '@/lib/instagram'
import { subscribeInstagramAccountToApp } from '@/lib/meta'
import { encryptToken } from '@/lib/auth/token-crypto'
import { getCmClientAccess } from '@/lib/cm-client-access'
import { billingDeniedResponse, checkBillingFeature } from '@/lib/billing/service'
import { BILLING_FEATURES } from '@/lib/billing/features'
import { findAssetConflict } from '@/lib/meta/asset-conflicts'
import { ensureInstagramChannelReady } from '@/lib/meta/channel-readiness'
import { activateChannels, activationErrorMessage } from '@/lib/meta/channel-activation'
import { isPausedBrandStatus } from '@/lib/smarttalk/brand-status'

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

  // OAuth state es obligatorio (CSRF). Rechaza si ausente, desconocido o expirado.
  if (!state) {
    return NextResponse.redirect(successUrl({ ig_error: 'missing_state' }))
  }

  try {
    const publicAdminEarly = createAdminClient('public')
    const { data: stateRow } = await publicAdminEarly
      .from('cm_oauth_states')
      .select('state, client_id, created_at')
      .eq('state', state)
      .maybeSingle()

    if (!stateRow?.client_id) {
      return NextResponse.redirect(successUrl({ ig_error: 'invalid_state' }))
    }

    // Ventana de 15 min. Después consideramos el state expirado.
    const createdAtMs = stateRow.created_at ? new Date(stateRow.created_at).getTime() : 0
    if (!createdAtMs || Date.now() - createdAtMs > 15 * 60 * 1000) {
      // Limpieza defensiva del state expirado.
      await publicAdminEarly.from('cm_oauth_states').delete().eq('state', state)
      return NextResponse.redirect(successUrl({ ig_error: 'state_expired' }))
    }

    const clientId = stateRow.client_id as string
    const access = await getCmClientAccess(request, clientId)
    if (!access?.organizationId) {
      await publicAdminEarly.from('cm_oauth_states').delete().eq('state', state)
      return NextResponse.redirect(successUrl({ ig_error: 'unauthorized_client' }))
    }

    const smarttalkAdmin = createAdminClient('smarttalk')
    const { data: existingInstagramChannel } = await smarttalkAdmin
      .from('channels')
      .select('id')
      .eq('organization_id', access.organizationId)
      .eq('brand_id', clientId)
      .eq('type', 'instagram')
      .neq('status', 'disconnected')
      .maybeSingle()
    if (!existingInstagramChannel) {
      const billingDecision = await checkBillingFeature({
        organizationId: access.organizationId,
        featureCode: BILLING_FEATURES.CHANNELS_ACTIVE,
        requestedUnits: 1,
        source: 'oauth/instagram',
      })
      if (!billingDecision.allowed) {
        await publicAdminEarly.from('cm_oauth_states').delete().eq('state', state)
        const denied = billingDeniedResponse(billingDecision)
        return NextResponse.redirect(
          successUrl({
            ig_error: 'billing_limit_reached',
            billing_status: String(denied.status),
          })
        )
      }
    }

    // Consumo one-shot: eliminamos el state ya validado (evita replay).
    await publicAdminEarly.from('cm_oauth_states').delete().eq('state', state)

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

      const { data: client } = await publicAdmin
        .from('cm_clients')
        .select('user_id, name, status')
        .eq('id', clientId)
        .maybeSingle()

      // Una marca inactiva no recupera canales por la puerta de atrás.
      if (isPausedBrandStatus((client as { status?: string | null } | null)?.status)) {
        return NextResponse.redirect(
          `${appUrl}/clients?meta_error=${encodeURIComponent(
            'Esta marca está inactiva. Reactívala antes de conectar canales.'
          )}`
        )
      }

      // Un activo pertenece a una sola marca. Este flujo no lo comprobaba: la
      // misma cuenta de Instagram podía quedar en dos marcas y el webhook
      // acababa rechazando el evento por ambigüedad.
      const conflict = await findAssetConflict({
        kind: 'instagram_account',
        assetId: profile.id,
        organizationId: access.organizationId,
        brandId: clientId,
      })
      if (conflict) {
        return NextResponse.redirect(
          `${appUrl}/clients?meta_error=${encodeURIComponent(conflict.message)}`
        )
      }

      const { data: existing } = await publicAdmin
        .from('cm_social_accounts')
        .select('*')
        .eq('client_id', clientId)
        .maybeSingle()
      const previousSocial = existing ? { ...(existing as Record<string, unknown>) } : null

      const tokenExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null
      const connectedAt = new Date().toISOString()
      const tokenCiphertext = encryptToken(longTokenStr)
      const socialData = {
        client_id: clientId,
        access_token: null as string | null,
        access_token_ciphertext: tokenCiphertext,
        instagram_id: profile.id,
        instagram_username: profile.username,
        connected_at: connectedAt,
        token_expires_at: tokenExpiresAt,
      }

      let legacyAccountId = (existing as { id?: string } | null)?.id || null
      if (existing) {
        const { error: updateError } = await publicAdmin
          .from('cm_social_accounts')
          .update(socialData)
          .eq('id', existing.id)
        if (updateError) {
          throw updateError
        }
      } else {
        const { data: insertedAccount, error: insertError } = await publicAdmin
          .from('cm_social_accounts')
          .insert(socialData)
          .select('id')
          .single()
        if (insertError) {
          throw insertError
        }
        legacyAccountId = (insertedAccount as { id?: string } | null)?.id || null
      }

      // El canal operativo, antes de declarar el éxito.
      //
      // Esta ruta no creaba ninguno: la marca aparecía «conectada» y el canal
      // no existía hasta que alguien abría /clients y `useChannels` disparaba
      // `sync-legacy`. Cualquier mensaje enviado en esa ventana llegaba al
      // webhook y no encontraba destino.
      let readyChannel
      try {
        readyChannel = await ensureInstagramChannelReady({
          organizationId: access.organizationId,
          brandId: clientId,
          legacyAccountId,
          instagram: { id: profile.id, username: profile.username },
          accessTokenCiphertext: tokenCiphertext,
          connectedAt,
          tokenExpiresAt,
        })
      } catch (channelError) {
        try {
          if (previousSocial) {
            await publicAdmin
              .from('cm_social_accounts')
              .update(previousSocial)
              .eq('id', previousSocial.id)
          } else if (legacyAccountId) {
            await publicAdmin.from('cm_social_accounts').delete().eq('id', legacyAccountId)
          }
        } catch (rollbackError) {
          console.error('[ig-oauth-callback] no se pudo revertir la cuenta legacy', rollbackError)
        }
        const detail = channelError instanceof Error ? channelError.message : 'Error desconocido'
        return NextResponse.redirect(
          `${appUrl}/clients?meta_error=${encodeURIComponent(detail)}`
        )
      }

      // La suscripción forma parte del éxito: antes su fallo sólo dejaba un
      // `console.warn` y la interfaz seguía diciendo «Instagram conectado».
      const activation = await activateChannels([
        {
          channelId: readyChannel.id,
          asset: 'instagram_account',
          assetId: profile.id,
          wasActive: readyChannel.wasActive,
          subscribe: () => subscribeInstagramAccountToApp(profile.id, longTokenStr),
        },
      ])

      if (client) {
        await publicAdmin.from('cm_activity_log').insert({
          user_id: (client as { user_id?: string }).user_id,
          action: activation.ok
            ? `Instagram conectado: @${profile.username} para ${(client as { name?: string }).name}`
            : `Instagram pendiente de activación: @${profile.username} · ${activation.failures[0]?.cause}`,
          status: activation.ok ? 'success' : 'error',
        })
      }

      if (!activation.ok) {
        return NextResponse.redirect(
          `${appUrl}/clients?meta_error=${encodeURIComponent(
            activationErrorMessage(activation.failures)
          )}&meta_client_id=${encodeURIComponent(clientId)}&meta_flow=instagram`
        )
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

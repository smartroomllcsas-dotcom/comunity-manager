import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import {
  FACEBOOK_CONFIG_ID_ENV,
  getOAuthUrl,
  readFacebookConfigId,
  exchangeCodeForToken,
  getLongLivedToken,
  getUserPages,
  getUserPermissions,
  getUserProfile,
  getUserAdAccounts,
  subscribePageToApp,
  subscribeInstagramAccountToApp,
} from '@/lib/meta'
import { supabaseAdmin } from '@/lib/supabase'
import { getCmClientAccess } from '@/lib/cm-client-access'
import { encryptToken } from '@/lib/crypto'
import { checkBillingFeature, billingDeniedResponse } from '@/lib/billing/service'
import { BILLING_FEATURES } from '@/lib/billing/features'

export async function initiateMetaOAuth(request: NextRequest, callbackPath: string) {
  const clientId = request.nextUrl.searchParams.get('clientId')
  if (!clientId) {
    return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })
  }
  if (!(await getCmClientAccess(request, clientId))) {
    return NextResponse.json({ error: 'No autorizado para este cliente' }, { status: 403 })
  }
  if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
    return NextResponse.json({ error: 'Meta API no configurada' }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
  const redirectUri = `${appUrl}${callbackPath}`
  const isFacebookOnly = callbackPath.includes('/auth/facebook/callback')

  // El flujo exclusivo de Facebook SÓLO es válido a través de la configuración
  // aprobada de Facebook Login for Business.
  //
  // Antes, si `META_FACEBOOK_CONFIG_ID` faltaba, `configId` quedaba `undefined`
  // y `getOAuthUrl` caía a su rama `else`: OAuth clásico con `scope`. El
  // diálogo se abría y el usuario pasaba por él sin que nada avisara, pero los
  // permisos concedidos no eran los de la configuración aprobada. Un fallo
  // silencioso y difícil de diagnosticar, porque todo *parecía* funcionar.
  //
  // Ahora se detiene aquí, antes de crear el `state` en la base y antes de
  // sacar al usuario de la aplicación. Se detiene en **todos los entornos**, no
  // sólo en producción: un desarrollo que funcione por el camino clásico
  // ocultaría el problema justo hasta el despliegue.
  let facebookConfigId: string | undefined
  if (isFacebookOnly) {
    const configResult = readFacebookConfigId()
    if (!configResult.ok) {
      console.error(
        `[meta-oauth] flujo de Facebook bloqueado: ${FACEBOOK_CONFIG_ID_ENV} ${
          configResult.reason === 'missing' ? 'no está definida' : 'tiene un formato inválido'
        }`,
      )
      return NextResponse.json(
        {
          error:
            configResult.reason === 'missing'
              ? `Falta ${FACEBOOK_CONFIG_ID_ENV}. La conexión con Facebook no está disponible.`
              : `${FACEBOOK_CONFIG_ID_ENV} tiene un valor inválido. La conexión con Facebook no está disponible.`,
          code:
            configResult.reason === 'missing'
              ? 'facebook_config_id_missing'
              : 'facebook_config_id_invalid',
          // El valor no se incluye: aunque no es un secreto, un identificador
          // mal puesto puede ser el de otra cuenta.
          hint: `Define ${FACEBOOK_CONFIG_ID_ENV} con el identificador numérico de la configuración de Facebook Login for Business.`,
        },
        { status: 500 },
      )
    }
    facebookConfigId = configResult.configId
  }

  const state = `${clientId}:${crypto.randomBytes(16).toString('hex')}`
  await supabaseAdmin.from('cm_oauth_states').insert({ state, client_id: clientId })

  const authUrl = getOAuthUrl(redirectUri, state, {
    includeInstagramMessaging: !isFacebookOnly,
    includeAds: !isFacebookOnly,
    // External Page administrators must enter through the approved Facebook
    // Login for Business configuration. getOAuthUrl intentionally omits
    // `scope` whenever configId is present because Meta rejects both together.
    configId: facebookConfigId,
  })
  return NextResponse.redirect(authUrl)
}

export async function handleMetaCallback(request: NextRequest, callbackPath: string) {
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const error = request.nextUrl.searchParams.get('error')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
  const flow = callbackPath.includes('/auth/facebook/callback') ? 'facebook' : 'facebook_instagram_ads'

  if (error) {
    return NextResponse.redirect(`${appUrl}/clients?meta_error=Autorizacion+cancelada`)
  }
  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/clients?meta_error=Parametros+invalidos`)
  }

  const { data: oauthState } = await supabaseAdmin
    .from('cm_oauth_states')
    .select('*')
    .eq('state', state)
    .single()
  if (!oauthState) {
    return NextResponse.redirect(`${appUrl}/clients?meta_error=Estado+invalido`)
  }
  const clientId = oauthState.client_id
  await supabaseAdmin.from('cm_oauth_states').delete().eq('state', state)

  try {
    const access = await getCmClientAccess(request, clientId)
    if (!access?.organizationId) {
      return NextResponse.redirect(`${appUrl}/clients?meta_error=No+autorizado+para+esta+marca`)
    }

    const redirectUri = `${appUrl}${callbackPath}`
    const shortToken = await exchangeCodeForToken(code, redirectUri)
    const longToken = await getLongLivedToken(shortToken.access_token)
    const profile = await getUserProfile(longToken.access_token)
    const permissions = await getUserPermissions(longToken.access_token)
    const pages = await getUserPages(longToken.access_token, {
      includeInstagram: flow !== 'facebook',
    })

    if (pages.length === 0) {
      const granted = new Set(
        permissions
          .filter((permission) => permission.status === 'granted')
          .map((permission) => permission.permission)
      )
      const required = flow === 'facebook'
        ? ['public_profile', 'pages_show_list', 'pages_manage_metadata', 'pages_messaging']
        : ['public_profile', 'pages_show_list', 'pages_read_engagement']
      const missing = required.filter((permission) => !granted.has(permission))
      const detail = missing.length > 0
        ? `Meta no concedio los permisos requeridos: ${missing.join(', ')}. Vuelve a autorizar la integracion.`
        : 'Meta autorizo la cuenta, pero no devolvio paginas administradas. Confirma que el perfil tenga control total sobre la pagina seleccionada.'
      console.warn('[meta-oauth] no pages returned', {
        flow,
        profileId: profile.id,
        grantedPermissions: [...granted],
        missingPermissions: missing,
      })
      return NextResponse.redirect(
        `${appUrl}/clients?meta_error=${encodeURIComponent(detail)}`
      )
    }

    // Facebook may return several pages. For the Instagram flow, prefer the
    // page that actually exposes its linked Instagram Business account instead
    // of always taking the first page returned by Meta.
    const page = flow === 'facebook'
      ? pages[0]
      : pages.find((candidate: { instagram_business_account?: unknown }) => candidate.instagram_business_account) || pages[0]
    const igAccount = flow === 'facebook' ? null : page.instagram_business_account

    if (flow !== 'facebook' && !igAccount) {
      return NextResponse.redirect(
        `${appUrl}/clients?meta_error=${encodeURIComponent('No se encontró una cuenta de Instagram Business asociada a las páginas autorizadas')}`
      )
    }
    const adAccounts = flow === 'facebook' ? [] : await getUserAdAccounts(longToken.access_token)
    const adAccount = adAccounts[0]

    // The OAuth record is legacy data. The actual billable resources are the
    // SmartTalk channels created by the sync step, so reserve only channels
    // that do not already exist for this brand.
    const expectedTypes = flow === 'facebook'
      ? ['facebook_messenger']
      : ['facebook_messenger', 'instagram']
    const { data: currentChannels } = await supabaseAdmin
      .schema('smarttalk')
      .from('channels')
      .select('type, status')
      .eq('organization_id', access.organizationId)
      .eq('brand_id', clientId)
    const currentChannelRows = (currentChannels || []) as Array<{
      type: string
      status: string
    }>
    const currentTypes = new Set(
      currentChannelRows
        .filter((channel) => channel.status !== 'disconnected')
        .map((channel) => channel.type)
    )
    const requestedUnits = expectedTypes.filter((type) => !currentTypes.has(type)).length
    if (requestedUnits > 0) {
      const billingDecision = await checkBillingFeature({
        organizationId: access.organizationId,
        featureCode: BILLING_FEATURES.CHANNELS_ACTIVE,
        requestedUnits,
        source: `oauth/meta/${flow}`,
      })
      if (!billingDecision.allowed) {
        const denied = billingDeniedResponse(billingDecision)
        return NextResponse.redirect(
          `${appUrl}/clients?meta_error=${encodeURIComponent('El plan contratado no permite conectar mas canales')}&billing_status=${denied.status}`
        )
      }
    }

    const tokenExpires = new Date()
    tokenExpires.setSeconds(tokenExpires.getSeconds() + (longToken.expires_in || 5184000))

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('cm_social_accounts')
      .select('id')
      .eq('client_id', clientId)
      .maybeSingle()

    if (existingError) {
      throw existingError
    }

    // Sprint 22 · Cifrado AES-256-GCM antes de persistir.
    // Escribimos SOLO a las columnas *_ciphertext y ponemos las columnas plain
    // en NULL para no dejar tokens en claro. Si TOKEN_ENCRYPTION_KEY no está
    // configurada, encryptToken throwea y el catch de abajo redirige con error
    // — comportamiento explícito y visible en lugar de escribir en claro.
    const socialData = {
      client_id: clientId,
      page_id: page.id,
      page_name: page.name,
      access_token: null,
      access_token_ciphertext: encryptToken(longToken.access_token),
      page_access_token: null,
      page_access_token_ciphertext: encryptToken(page.access_token),
      instagram_id: igAccount?.id || null,
      instagram_username: igAccount?.username || null,
      ad_account_id: adAccount?.account_id || adAccount?.id?.replace('act_', '') || null,
      ad_account_name: adAccount?.name || null,
      business_id: adAccount?.business?.id || adAccount?.business || null,
      meta_user_id: profile.id,
      connected_at: new Date().toISOString(),
      token_expires_at: tokenExpires.toISOString(),
    }

    if (existing) {
      const { error: updateError } = await supabaseAdmin.from('cm_social_accounts').update(socialData).eq('id', existing.id)
      if (updateError) {
        throw updateError
      }
    } else {
      const { error: insertError } = await supabaseAdmin.from('cm_social_accounts').insert(socialData)
      if (insertError) {
        throw insertError
      }
    }

    if (page.id && page.access_token) {
      try {
        await subscribePageToApp(page.id, page.access_token)
      } catch (subscriptionError) {
        console.warn('[meta-oauth] page subscription failed', subscriptionError)
      }
    }

    if (igAccount?.id && longToken.access_token) {
      try {
        await subscribeInstagramAccountToApp(igAccount.id, longToken.access_token)
      } catch (subscriptionError) {
        console.warn('[meta-oauth] instagram subscription failed', subscriptionError)
      }
    }

    const { data: client } = await supabaseAdmin
      .from('cm_clients')
      .select('user_id, name')
      .eq('id', clientId)
      .single()
    if (client) {
      await supabaseAdmin.from('cm_activity_log').insert({
        user_id: client.user_id,
        action:
          flow === 'facebook'
            ? `Facebook conectado: ${page.name} para ${client.name}`
            : `Redes conectadas: ${page.name}${igAccount ? ` + @${igAccount.username}` : ''}${adAccount?.name ? ` + Ads: ${adAccount.name}` : ''} para ${client.name}`,
        status: 'success',
      })
    }

    const successMsg =
      flow === 'facebook'
        ? `Facebook conectado: ${page.name}`
        : `Conectado: ${page.name}${igAccount ? ` + @${igAccount.username}` : ''}${adAccount?.name ? ` + Ads: ${adAccount.name}` : ''}`
    const traceParams = new URLSearchParams({
      meta_success: successMsg,
      meta_client_id: clientId,
      meta_flow: flow,
      meta_page: page.name,
      meta_page_id: page.id,
      meta_instagram: igAccount?.username || '',
      meta_ad_account: adAccount?.name || '',
    })
    return NextResponse.redirect(`${appUrl}/clients?${traceParams.toString()}`)
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message?: unknown }).message || 'Error desconocido')
          : 'Error desconocido'
    console.error('Meta OAuth error:', msg)
    return NextResponse.redirect(`${appUrl}/clients?meta_error=${encodeURIComponent(msg)}`)
  }
}

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
import { createPendingSelection } from '@/lib/meta/page-selection'
import { findAssetConflict } from '@/lib/meta/asset-conflicts'
import { ensureMetaChannelsReady } from '@/lib/meta/channel-readiness'
import {
  activateChannels,
  activationErrorMessage,
  type ActivationTarget,
} from '@/lib/meta/channel-activation'
import { isPausedBrandStatus } from '@/lib/smarttalk/brand-status'

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

export interface MetaPageLike {
  id: string
  name: string
  access_token: string
  instagram_business_account?: { id: string; username?: string } | null
}

/**
 * Guarda la conexión de una página ya **elegida** y devuelve la redirección.
 *
 * Se extrajo del callback para que el camino automático (una sola página) y el
 * de selección explícita (varias) recorran exactamente el mismo código. Si
 * fueran dos implementaciones, la validación de conflicto o el cifrado de
 * tokens acabarían divergiendo justo en el camino menos transitado.
 */
export async function finalizeMetaConnection(input: {
  appUrl: string
  clientId: string
  access: { organizationId: string; cmUserId: string }
  flow: 'facebook' | 'facebook_instagram_ads'
  page: MetaPageLike
  igAccount: { id: string; username?: string } | null | undefined
  longToken: { access_token: string; expires_in?: number }
  profile: { id: string }
}): Promise<NextResponse> {
  const { appUrl, clientId, access, flow, page, igAccount, longToken, profile } = input

  // Una marca inactiva no recupera canales por la puerta de atrás.
  //
  // `sync-legacy` ya se negaba a reinsertar canales de una marca pausada y
  // `/api/channels/whatsapp/connect` ya rechazaba la conexión; el OAuth de Meta
  // era el único camino que seguía escribiendo. Conectar aquí dejaba un canal
  // `active` en una marca desactivada: deshacía la pausa a medias, consumía su
  // cupo de canales y volvía a admitir mensajes que la pausa debía descartar.
  const { data: brandRow, error: brandError } = await supabaseAdmin
    .from('cm_clients')
    .select('id, name, status, user_id')
    .eq('id', clientId)
    .maybeSingle()
  if (brandError) {
    throw new Error(`No se pudo verificar el estado de la marca: ${brandError.message}`)
  }
  if (isPausedBrandStatus((brandRow as { status?: string | null } | null)?.status)) {
    return NextResponse.redirect(
      `${appUrl}/clients?meta_error=${encodeURIComponent(
        'Esta marca está inactiva. Reactívala antes de conectar canales.'
      )}`
    )
  }

  // Un activo pertenece a una sola marca. Se comprueba ANTES de reservar cupo
  // y de escribir nada: bloquear después dejaría el cupo consumido y la
  // cuenta social a medio actualizar.
  const conflict = await findAssetConflict({
    kind: 'facebook_page',
    assetId: page.id,
    organizationId: access.organizationId,
    brandId: clientId,
  })
  if (conflict) {
    return NextResponse.redirect(
      `${appUrl}/clients?meta_error=${encodeURIComponent(conflict.message)}`
    )
  }
  if (igAccount?.id) {
    const igConflict = await findAssetConflict({
      kind: 'instagram_account',
      assetId: igAccount.id,
      organizationId: access.organizationId,
      brandId: clientId,
    })
    if (igConflict) {
      return NextResponse.redirect(
        `${appUrl}/clients?meta_error=${encodeURIComponent(igConflict.message)}`
      )
    }
  }

  const adAccounts = flow === 'facebook' ? [] : await getUserAdAccounts(longToken.access_token)
  const adAccount = adAccounts[0]

  // The OAuth record is legacy data. The actual billable resources are the
  // SmartTalk channels created by the sync step, so reserve only channels
  // that do not already exist for this brand.
  const expectedTypes = flow === 'facebook' || !igAccount?.id
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
  const connectedAt = new Date().toISOString()
  const userTokenCiphertext = encryptToken(longToken.access_token)
  const pageTokenCiphertext = encryptToken(page.access_token)

  // Se lee la fila COMPLETA, no sólo el id: si el paso siguiente falla hay que
  // poder devolverla exactamente a como estaba. Véase la compensación de más
  // abajo.
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('cm_social_accounts')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle()

  if (existingError) {
    throw existingError
  }

  // Copia, no referencia. La instantánea tiene que quedar congelada ANTES del
  // UPDATE de más abajo; guardar el objeto tal cual haría que «lo anterior» y
  // «lo nuevo» fueran lo mismo y la compensación no restauraría nada.
  const previousSocial = existing ? { ...(existing as Record<string, unknown>) } : null

  // Sprint 22 · Cifrado AES-256-GCM antes de persistir.
  // Escribimos SOLO a las columnas *_ciphertext y ponemos las columnas plain
  // en NULL para no dejar tokens en claro. Si TOKEN_ENCRYPTION_KEY no está
  // configurada, encryptToken throwea y el catch de abajo redirige con error
  // — comportamiento explícito y visible en lugar de escribir en claro.
  // Campos que SIEMPRE se escriben: identifican la página y el token que acaba
  // de autorizarse, en los dos flujos.
  const socialData: Record<string, unknown> = {
    client_id: clientId,
    page_id: page.id,
    page_name: page.name,
    access_token: null,
    access_token_ciphertext: userTokenCiphertext,
    page_access_token: null,
    page_access_token_ciphertext: pageTokenCiphertext,
    meta_user_id: profile.id,
    connected_at: connectedAt,
    token_expires_at: tokenExpires.toISOString(),
  }

  // Instagram y Ads sólo se tocan en el flujo que los autoriza.
  //
  // Antes se escribían siempre, y en el flujo de Facebook `igAccount` y
  // `adAccount` son null por construcción: reconectar Facebook **borraba** la
  // cuenta de Instagram y la de anuncios que la marca ya tenía. La fila es
  // compartida por los dos flujos, así que escribir lo que no se autorizó es
  // destruir el trabajo del otro.
  if (flow !== 'facebook') {
    socialData.instagram_id = igAccount?.id || null
    socialData.instagram_username = igAccount?.username || null
    socialData.ad_account_id =
      adAccount?.account_id || adAccount?.id?.replace('act_', '') || null
    socialData.ad_account_name = adAccount?.name || null
    socialData.business_id = adAccount?.business?.id || adAccount?.business || null
  }

  let legacyAccountId = existing?.id as string | undefined
  if (existing) {
    const { error: updateError } = await supabaseAdmin.from('cm_social_accounts').update(socialData).eq('id', existing.id)
    if (updateError) {
      throw updateError
    }
  } else {
    const { data: insertedAccount, error: insertError } = await supabaseAdmin
      .from('cm_social_accounts')
      .insert(socialData)
      .select('id')
      .single()
    if (insertError) {
      throw insertError
    }
    legacyAccountId = insertedAccount?.id as string | undefined
  }

  if (!legacyAccountId) {
    throw new Error('No se pudo identificar la conexión Meta guardada')
  }

  // Si el canal operativo no se puede crear, la cuenta legacy no puede quedarse
  // escrita.
  //
  // El orden es obligado —el canal necesita `legacy_account_id`—, así que entre
  // las dos escrituras hay un instante en el que la marca tiene cuenta legacy
  // pero no canal: exactamente el estado que /clients pinta como «conectado» y
  // que el webhook no sabe enrutar. Cuando el segundo paso falla —el índice
  // único de la migración 038 rechazando una conexión simultánea sobre el mismo
  // activo, por ejemplo— se deshace el primero antes de propagar el error: la
  // fila nueva se borra y la que ya existía vuelve a sus valores anteriores.
  let readyChannels
  try {
    readyChannels = await ensureMetaChannelsReady({
      organizationId: access.organizationId,
      brandId: clientId,
      legacyAccountId,
      page,
      instagram: igAccount,
      pageAccessTokenCiphertext: pageTokenCiphertext,
      connectedAt,
      tokenExpiresAt: tokenExpires.toISOString(),
      includeInstagram: flow !== 'facebook',
    })
  } catch (channelError) {
    try {
      if (previousSocial) {
        await supabaseAdmin
          .from('cm_social_accounts')
          .update(previousSocial)
          .eq('id', previousSocial.id)
      } else {
        await supabaseAdmin.from('cm_social_accounts').delete().eq('id', legacyAccountId)
      }
    } catch (rollbackError) {
      // La compensación es el mejor esfuerzo: si también falla, lo que no puede
      // ocurrir es que su error tape el original, que es el que explica qué
      // pasó. Se registra y se sigue.
      console.error('[meta-oauth] no se pudo revertir la cuenta legacy', rollbackError)
    }
    throw channelError
  }

  // La suscripción al webhook forma parte del éxito.
  //
  // Antes vivía en dos `try { } catch { console.warn }`: si Meta rechazaba la
  // suscripción, la interfaz decía «conectado», el canal quedaba `active` y no
  // llegaba ni un mensaje. Ahora el veredicto del proveedor decide el estado
  // del canal y decide también qué se le dice al administrador.
  const activationTargets: ActivationTarget[] = []
  const messengerChannel = readyChannels.find((channel) => channel.type === 'facebook_messenger')
  if (messengerChannel && page.id && page.access_token) {
    activationTargets.push({
      channelId: messengerChannel.id,
      asset: 'facebook_page',
      assetId: page.id,
      wasActive: messengerChannel.wasActive,
      subscribe: () => subscribePageToApp(page.id, page.access_token),
    })
  }
  const instagramChannel = readyChannels.find((channel) => channel.type === 'instagram')
  if (instagramChannel && igAccount?.id && longToken.access_token) {
    activationTargets.push({
      channelId: instagramChannel.id,
      asset: 'instagram_account',
      assetId: igAccount.id,
      wasActive: instagramChannel.wasActive,
      subscribe: () => subscribeInstagramAccountToApp(igAccount.id, longToken.access_token),
    })
  }

  const activation = await activateChannels(activationTargets)

  const client = brandRow as { user_id?: string; name?: string } | null
  if (client) {
    await supabaseAdmin.from('cm_activity_log').insert({
      user_id: client.user_id,
      action: activation.ok
        ? flow === 'facebook'
          ? `Facebook conectado: ${page.name} para ${client.name}`
          : `Redes conectadas: ${page.name}${igAccount ? ` + @${igAccount.username}` : ''}${adAccount?.name ? ` + Ads: ${adAccount.name}` : ''} para ${client.name}`
        : `Conexión Meta pendiente de activación: ${page.name} para ${client.name} · ${activation.failures[0]?.cause}`,
      status: activation.ok ? 'success' : 'error',
    })
  }

  // Sin suscripción no hay «conectado». El canal existe y guarda su token, pero
  // el mensaje que ve el administrador es el de un fallo con reintento.
  if (!activation.ok) {
    return NextResponse.redirect(
      `${appUrl}/clients?meta_error=${encodeURIComponent(activationErrorMessage(activation.failures))}` +
        `&meta_client_id=${encodeURIComponent(clientId)}&meta_flow=${encodeURIComponent(flow)}`
    )
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

    // Meta puede devolver varias páginas administradas, y la primera del array
    // NO es necesariamente la que el usuario seleccionó en el diálogo: el orden
    // lo decide Meta. Elegir por él hacía que la marca se quedara con la página
    // equivocada, y que la misma página acabara en dos marcas distintas.
    //
    // Con un solo candidato se conecta directo —no hay nada que elegir—. Con
    // varios, se guardan los candidatos y se pide una decisión explícita.
    const selectable = flow === 'facebook'
      ? pages
      : pages.filter((candidate: { instagram_business_account?: unknown }) => candidate.instagram_business_account)

    if (flow !== 'facebook' && selectable.length === 0) {
      return NextResponse.redirect(
        `${appUrl}/clients?meta_error=${encodeURIComponent('No se encontró una cuenta de Instagram Business asociada a las páginas autorizadas')}`
      )
    }

    if (selectable.length > 1) {
      const pending = await createPendingSelection({
        cmUserId: access.cmUserId,
        organizationId: access.organizationId,
        clientId,
        flow,
        secret: {
          userAccessToken: longToken.access_token,
          profileId: profile.id,
          pages: selectable,
        },
      })
      if (!pending.ok) {
        return NextResponse.redirect(
          `${appUrl}/clients?meta_error=${encodeURIComponent('No se pudo preparar la selección de página. Inténtalo de nuevo.')}`
        )
      }
      // Sólo viaja el identificador de la selección. Los tokens se quedan
      // cifrados en la base.
      return NextResponse.redirect(
        `${appUrl}/clients/connect/select?selection=${encodeURIComponent(pending.selectionId)}`
      )
    }

    const page = selectable[0]
    const igAccount = flow === 'facebook' ? null : page.instagram_business_account
    // `return await`, no `return`: dentro de un try/catch, devolver la promesa
    // sin esperarla deja su rechazo FUERA del catch de abajo. Cualquier fallo
    // de `finalizeMetaConnection` —el índice único rechazando una conexión
    // simultánea, un INSERT sin permisos— salía como excepción no controlada y
    // el usuario recibía un 500 en blanco en vez de la redirección con
    // `meta_error` que este catch existe para producir.
    return await finalizeMetaConnection({
      appUrl,
      clientId,
      access: { organizationId: access.organizationId, cmUserId: access.cmUserId },
      flow,
      page,
      igAccount,
      longToken,
      profile,
    })
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

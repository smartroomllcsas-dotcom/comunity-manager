import { NextRequest, NextResponse } from 'next/server'
import { findAssetConflict } from '@/lib/meta/asset-conflicts'
import {
  exchangeWhatsAppCode,
  getPhoneNumberDetails,
  subscribeWabaToWebhook,
} from '@/lib/whatsapp-cm'
import { getCmClientAccess } from '@/lib/cm-client-access'
import { encryptToken } from '@/lib/auth/token-crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { billingDeniedResponse, checkBillingFeature } from '@/lib/billing/service'
import { BILLING_FEATURES } from '@/lib/billing/features'
import {
  activateChannels,
  activationErrorMessage,
  wasAssetOperational,
  PENDING_SUBSCRIPTION_CONFIG,
} from '@/lib/meta/channel-activation'
import { isPausedBrandStatus } from '@/lib/smarttalk/brand-status'

interface ExchangeRequestBody {
  code?: string
  phone_number_id?: string
  waba_id?: string
  client_id?: string
}

export async function POST(request: NextRequest) {
  let body: ExchangeRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { code, phone_number_id, waba_id, client_id } = body

  if (!client_id) {
    return NextResponse.json({ error: 'client_id es requerido' }, { status: 400 })
  }
  const access = await getCmClientAccess(request, client_id)
  if (!access?.organizationId) {
    return NextResponse.json({ error: 'No autorizado para esta marca' }, { status: 403 })
  }
  if (!code) {
    return NextResponse.json({ error: 'code es requerido' }, { status: 400 })
  }
  if (!phone_number_id || !waba_id) {
    return NextResponse.json(
      {
        error:
          'phone_number_id y waba_id son requeridos (vienen del callback de WhatsApp Embedded Signup)',
      },
      { status: 400 }
    )
  }

  try {
    const publicAdmin = createAdminClient('public')
    const smarttalkAdmin = createAdminClient('smarttalk')
    const token = await exchangeWhatsAppCode(code)
    const encryptedToken = encryptToken(token.access_token)

    let displayPhone: string | null = null
    let verifiedName: string | null = null
    try {
      const details = await getPhoneNumberDetails(phone_number_id, token.access_token)
      displayPhone = details.display_phone_number ?? null
      verifiedName = details.verified_name ?? null
    } catch (err) {
      console.warn('[wa-exchange] no se pudo obtener detalles del número:', err)
    }

    // Una marca inactiva no recupera canales por la puerta de atrás. Igual que
    // en `/api/channels/whatsapp/connect` y en el OAuth de Meta.
    const { data: brandRow, error: brandError } = await publicAdmin
      .from('cm_clients')
      .select('status')
      .eq('id', client_id)
      .maybeSingle()
    if (brandError) {
      throw new Error(`No se pudo verificar el estado de la marca: ${brandError.message}`)
    }
    if (isPausedBrandStatus((brandRow as { status?: string | null } | null)?.status)) {
      return NextResponse.json(
        {
          error: 'inactive_brand',
          message: 'Esta marca está inactiva. Reactívala antes de conectar canales.',
        },
        { status: 409 }
      )
    }

    // Un número activo no puede estar en dos marcas a la vez.
    //
    // Va **antes de cualquier escritura**. En la primera versión de esta
    // corrección la comprobación estaba después del UPSERT de
    // `cm_whatsapp_accounts`: un intento bloqueado ya había reasignado el
    // `client_id` de la cuenta legacy a la marca nueva, dejando la conexión a
    // medio mover pese a responder 409.
    const conflict = await findAssetConflict({
      kind: 'whatsapp_phone',
      assetId: phone_number_id,
      organizationId: access.organizationId,
      brandId: client_id,
    })
    if (conflict) {
      return NextResponse.json({ error: conflict.message }, { status: 409 })
    }

    const record = {
      waba_id,
      phone_number_id,
      access_token: null,
      access_token_ciphertext: encryptedToken,
      display_phone_number: displayPhone,
      verified_name: verifiedName,
      client_id,
      user_id: access.cmUserId,
      updated_at: new Date().toISOString(),
    }

    const { data: existing, error: existingError } = await publicAdmin
      .from('cm_whatsapp_accounts')
      .select('id')
      .eq('waba_id', waba_id)
      .eq('phone_number_id', phone_number_id)
      .maybeSingle()

    if (existingError) {
      throw new Error(`No se pudo consultar WhatsApp en Supabase: ${existingError.message}`)
    }

    let saveError: { message?: string } | null = null
    if (existing) {
      const { error } = await publicAdmin.from('cm_whatsapp_accounts').update(record).eq('id', existing.id)
      saveError = error
    } else {
      const { error } = await publicAdmin.from('cm_whatsapp_accounts').insert(record)
      saveError = error
    }

    if (saveError) {
      throw new Error(`No se pudo guardar WhatsApp en Supabase: ${saveError.message || 'error desconocido'}`)
    }

    const channelRecord = {
      organization_id: access.organizationId,
      brand_id: client_id,
      type: 'whatsapp_business_api',
      name: verifiedName || (displayPhone ? `WhatsApp ${displayPhone}` : 'WhatsApp Business'),
      status: 'active',
      whatsapp_phone_number_id: phone_number_id,
      whatsapp_business_account_id: waba_id,
      whatsapp_phone_number: displayPhone,
      access_token: null,
      access_token_ciphertext: encryptedToken,
      config: {
        connected_via: 'embedded_signup',
        legacy_source: 'cm_whatsapp_accounts',
        legacy_client_id: client_id,
      },
      connected_at: new Date().toISOString(),
    }
    // `maybeSingle` fallaría si hubiera filas duplicadas de datos antiguos, así
    // que se piden todas y se elige la de esta marca. La auditoría de
    // duplicados vive en scripts/audit-meta-duplicates.mjs.
    const { data: existingChannels, error: existingChannelError } = await smarttalkAdmin
      .from('channels')
      .select('id, organization_id, brand_id, status, whatsapp_phone_number_id, whatsapp_business_account_id, config')
      .eq('whatsapp_phone_number_id', phone_number_id)
    if (existingChannelError) {
      throw new Error(`No se pudo consultar el canal de WhatsApp: ${existingChannelError.message}`)
    }
    const existingChannel = ((existingChannels || []) as Array<{
      id: string
      organization_id: string
      brand_id: string
      status: string
      whatsapp_phone_number_id: string | null
      whatsapp_business_account_id: string | null
      config: Record<string, unknown> | null
    }>).find(
      (channel) =>
        channel.organization_id === access.organizationId && channel.brand_id === client_id
    )

    if (!existingChannel) {
      const billingDecision = await checkBillingFeature({
        organizationId: access.organizationId,
        featureCode: BILLING_FEATURES.CHANNELS_ACTIVE,
        requestedUnits: 1,
        source: 'oauth/whatsapp-exchange',
      })
      if (!billingDecision.allowed) {
        return billingDeniedResponse(billingDecision)
      }
    }

    // ¿Este canal ya recibía por ESTE número y ESTE WABA?
    //
    // La búsqueda ya filtra por `phone_number_id`, pero eso no basta: la
    // suscripción va contra el WABA, y un número puede haberse movido de una
    // cuenta a otra. Con el WABA cambiado la suscripción anterior no cubre la
    // nueva, así que un fallo de resuscripción sí debe dejar el canal en error.
    const wasOperational = wasAssetOperational({
      status: existingChannel?.status,
      config: existingChannel?.config,
      assetPairs: [
        [existingChannel?.whatsapp_phone_number_id, phone_number_id],
        [existingChannel?.whatsapp_business_account_id, waba_id],
      ],
    })

    let channelId = existingChannel?.id
    if (existingChannel) {
      const { error: channelError } = await smarttalkAdmin
        .from('channels')
        .update({
          ...channelRecord,
          // Los indicadores de la suscripción sólo se heredan si el activo es
          // el mismo; si cambió el WABA, arrastrar `webhook_subscribed: true`
          // haría pasar por operativo un canal que aún no lo es. Y el activo
          // nuevo se marca como no-suscrito ANTES de preguntarle a Meta, para
          // que un fallo del guardado final no lo deje pareciendo conectado.
          config: {
            ...(wasOperational ? existingChannel.config || {} : {}),
            ...channelRecord.config,
            ...(wasOperational ? {} : PENDING_SUBSCRIPTION_CONFIG),
          },
        })
        .eq('id', existingChannel.id)
      if (channelError) {
        throw new Error(`WhatsApp se guardó, pero no se pudo crear el canal: ${channelError.message}`)
      }
    } else {
      const { data: insertedChannel, error: channelError } = await smarttalkAdmin
        .from('channels')
        .insert({
          ...channelRecord,
          // Canal nuevo: nace no-conectado.
          config: { ...channelRecord.config, ...PENDING_SUBSCRIPTION_CONFIG },
        })
        .select('id')
        .single()
      if (channelError) {
        // `uq_channels_whatsapp_phone` es global, no por organización: dos
        // agencias no pueden compartir número. Ese caso no lo ve
        // `findAssetConflict` —que filtra por organización a propósito— y sólo
        // aparece aquí, como violación de unicidad. Es la garantía que cierra
        // la carrera entre dos conexiones simultáneas.
        if ((channelError as { code?: string }).code === '23505') {
          return NextResponse.json(
            {
              error:
                'Este número de WhatsApp ya está conectado en otro canal. Desconéctalo antes de asignarlo aquí.',
              code: 'asset_already_connected',
            },
            { status: 409 }
          )
        }
        throw new Error(`WhatsApp se guardó, pero no se pudo crear el canal: ${channelError.message}`)
      }
      channelId = (insertedChannel as { id?: string } | null)?.id
    }

    if (!channelId) {
      throw new Error('WhatsApp se guardó, pero no se pudo identificar el canal creado')
    }

    // La suscripción de la WABA forma parte del éxito.
    //
    // Este flujo **nunca** la llamaba: creaba el canal `active`, respondía
    // `success: true` y esperaba a que alguien más suscribiera la cuenta. Si
    // nadie lo hacía, Meta no enviaba un solo evento y la marca aparecía
    // conectada con la bandeja vacía para siempre.
    const activation = await activateChannels([
      {
        channelId,
        asset: 'whatsapp_phone',
        assetId: phone_number_id,
        wasActive: wasOperational,
        subscribe: () => subscribeWabaToWebhook(waba_id, token.access_token),
      },
    ])

    if (!activation.ok) {
      return NextResponse.json(
        {
          error: activationErrorMessage(activation.failures),
          code: 'webhook_subscription_failed',
          retryable: true,
          channel_id: channelId,
        },
        { status: 502 }
      )
    }

    return NextResponse.json({
      success: true,
      waba_id,
      phone_number_id,
      channel_id: channelId,
      display_phone_number: displayPhone,
      verified_name: verifiedName,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    console.error('[wa-exchange]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { exchangeWhatsAppCode, getPhoneNumberDetails } from '@/lib/whatsapp-cm'
import { getCmClientAccess } from '@/lib/cm-client-access'
import { encryptToken } from '@/lib/auth/token-crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { billingDeniedResponse, checkBillingFeature } from '@/lib/billing/service'
import { BILLING_FEATURES } from '@/lib/billing/features'

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
    const { data: existingChannel, error: existingChannelError } = await smarttalkAdmin
      .from('channels')
      .select('id, organization_id, brand_id')
      .eq('whatsapp_phone_number_id', phone_number_id)
      .maybeSingle()
    if (existingChannelError) {
      throw new Error(`No se pudo consultar el canal de WhatsApp: ${existingChannelError.message}`)
    }
    if (
      existingChannel &&
      (existingChannel.organization_id !== access.organizationId || existingChannel.brand_id !== client_id)
    ) {
      throw new Error('Este número de WhatsApp ya está conectado a otra marca')
    }

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

    const { error: channelError } = existingChannel
      ? await smarttalkAdmin.from('channels').update(channelRecord).eq('id', existingChannel.id)
      : await smarttalkAdmin.from('channels').insert(channelRecord)
    if (channelError) {
      throw new Error(`WhatsApp se guardó, pero no se pudo crear el canal: ${channelError.message}`)
    }

    return NextResponse.json({
      success: true,
      waba_id,
      phone_number_id,
      display_phone_number: displayPhone,
      verified_name: verifiedName,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    console.error('[wa-exchange]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

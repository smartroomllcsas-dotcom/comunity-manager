import { NextRequest, NextResponse } from 'next/server'
import { exchangeWhatsAppCode, getPhoneNumberDetails } from '@/lib/whatsapp-cm'
import { supabaseAdmin } from '@/lib/supabase'

interface ExchangeRequestBody {
  code?: string
  phone_number_id?: string
  waba_id?: string
  client_id?: string
  user_id?: string
}

export async function POST(request: NextRequest) {
  let body: ExchangeRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { code, phone_number_id, waba_id, client_id, user_id } = body

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
    const token = await exchangeWhatsAppCode(code)

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
      access_token: token.access_token,
      display_phone_number: displayPhone,
      verified_name: verifiedName,
      client_id: client_id ?? null,
      user_id: user_id ?? null,
      updated_at: new Date().toISOString(),
    }

    const { data: existing, error: existingError } = await supabaseAdmin
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
      const { error } = await supabaseAdmin.from('cm_whatsapp_accounts').update(record).eq('id', existing.id)
      saveError = error
    } else {
      const { error } = await supabaseAdmin.from('cm_whatsapp_accounts').insert(record)
      saveError = error
    }

    if (saveError) {
      throw new Error(`No se pudo guardar WhatsApp en Supabase: ${saveError.message || 'error desconocido'}`)
    }

    return NextResponse.json({
      success: true,
      waba_id,
      phone_number_id,
      display_phone_number: displayPhone,
      verified_name: verifiedName,
      access_token_preview: token.access_token.slice(0, 24) + '…',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    console.error('[wa-exchange]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

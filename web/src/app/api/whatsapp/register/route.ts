import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { registerWhatsAppNumber } from '@/lib/whatsapp-cm'

export async function POST(request: NextRequest) {
  const { clientId, pin } = await request.json()
  if (!clientId) return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })
  if (!pin || !/^\d{6}$/.test(pin)) {
    return NextResponse.json({ error: 'PIN de 6 digitos requerido' }, { status: 400 })
  }

  const { data: account } = await supabase
    .from('cm_whatsapp_accounts')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle()

  if (!account) return NextResponse.json({ error: 'WhatsApp no conectado' }, { status: 400 })

  try {
    const result = await registerWhatsAppNumber(account.phone_number_id, account.access_token, pin)
    return NextResponse.json({ success: true, result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

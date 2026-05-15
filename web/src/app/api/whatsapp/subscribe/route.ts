import { NextRequest, NextResponse } from 'next/server'
import { subscribeWabaToWebhook } from '@/lib/whatsapp-cm'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  const { clientId } = await request.json()
  if (!clientId) return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })

  const { data: account, error } = await supabaseAdmin
    .from('cm_whatsapp_accounts')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!account) return NextResponse.json({ error: 'WhatsApp no conectado' }, { status: 400 })

  try {
    const result = await subscribeWabaToWebhook(account.waba_id, account.access_token)
    return NextResponse.json({ success: true, result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

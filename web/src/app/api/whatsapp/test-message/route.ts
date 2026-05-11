import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { supabase } from '@/lib/supabase'
import { sendWhatsAppTextMessage } from '@/lib/whatsapp'

export async function POST(request: NextRequest) {
  const { clientId, to, text } = await request.json()
  if (!clientId) return NextResponse.json({ error: 'clientId requerido' }, { status: 400 })
  if (!to) return NextResponse.json({ error: 'destino requerido' }, { status: 400 })

  const { data: account } = await supabase
    .from('cm_whatsapp_accounts')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle()

  if (!account) return NextResponse.json({ error: 'WhatsApp no conectado' }, { status: 400 })

  try {
    let ownerUserId = account.user_id

    if (!ownerUserId && account.client_id) {
      const { data: client } = await supabase
        .from('cm_clients')
        .select('user_id')
        .eq('id', account.client_id)
        .maybeSingle()
      ownerUserId = client?.user_id ?? null
    }

    if (!ownerUserId) {
      return NextResponse.json(
        { error: 'La cuenta de WhatsApp no tiene usuario asociado para registrar el historial' },
        { status: 400 }
      )
    }

    const result = await sendWhatsAppTextMessage(
      account.phone_number_id,
      account.access_token,
      to,
      text || 'Mensaje de prueba desde Community Manager'
    )
    const { error: chatError } = await supabase.from('cm_chat_history').insert({
      id: randomUUID(),
      user_id: ownerUserId,
      client_context: `whatsapp:${clientId}`,
      mode: 'B',
      role: 'assistant',
      content: `Tú → ${to}: ${text || 'Mensaje de prueba desde Community Manager'}`,
    })

    if (chatError) {
      throw new Error(chatError.message || 'No se pudo guardar el mensaje enviado')
    }

    const { error: activityError } = await supabase.from('cm_activity_log').insert({
      id: randomUUID(),
      user_id: ownerUserId,
      action: `WhatsApp test message sent to ${to}`,
      status: 'success',
    })

    if (activityError) {
      console.error('[wa-test-message] error guardando actividad', activityError.message)
    }

    return NextResponse.json({ success: true, result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

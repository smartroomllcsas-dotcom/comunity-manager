import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkBillingFeature } from '@/lib/billing/service'
import { BILLING_FEATURES } from '@/lib/billing/features'

function getVerifyToken() {
  return process.env.META_WEBHOOK_VERIFY_TOKEN || ''
}

export function verifyMetaWebhook(request: NextRequest, channel: 'whatsapp' | 'messenger' | 'facebook') {
  const mode = request.nextUrl.searchParams.get('hub.mode')
  const token = request.nextUrl.searchParams.get('hub.verify_token')
  const challenge = request.nextUrl.searchParams.get('hub.challenge')

  if (mode !== 'subscribe') {
    return NextResponse.json(
      { error: 'hub.mode invalido', expected: 'subscribe', channel },
      { status: 400 }
    )
  }

  if (!token || token !== getVerifyToken()) {
    return NextResponse.json(
      { error: 'hub.verify_token invalido', channel },
      { status: 403 }
    )
  }

  if (!challenge) {
    return NextResponse.json(
      { error: 'hub.challenge requerido', channel },
      { status: 400 }
    )
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  })
}

export async function receiveMetaWebhook(request: NextRequest, channel: 'whatsapp' | 'messenger' | 'facebook') {
  let payload: unknown = null

  try {
    payload = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'JSON invalido', channel },
      { status: 400 }
    )
  }

  console.log(`[meta-webhook:${channel}]`, JSON.stringify(payload))

  if (channel === 'whatsapp') {
    await persistWhatsAppWebhook(payload)
  }

  return NextResponse.json({
    received: true,
    channel,
  })
}

type WhatsAppWebhookValue = {
  metadata?: {
    phone_number_id?: string
    display_phone_number?: string
  }
  messages?: Array<{
    id?: string
    from?: string
    timestamp?: string
    type?: string
    text?: { body?: string }
    button?: { text?: string }
    interactive?: {
      type?: string
      button_reply?: { id?: string; title?: string }
      list_reply?: { id?: string; title?: string; description?: string }
    }
    image?: { caption?: string }
    video?: { caption?: string }
    audio?: unknown
    document?: { caption?: string; filename?: string }
  }>
  statuses?: Array<{
    id?: string
    status?: string
    timestamp?: string
    recipient_id?: string
    conversation?: { id?: string; origin?: { type?: string } }
    pricing?: { billable?: boolean; category?: string }
  }>
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value)
  } catch {
    return '{}'
  }
}

function extractMessageText(message: NonNullable<WhatsAppWebhookValue['messages']>[number]) {
  if (message.text?.body) return message.text.body
  if (message.button?.text) return message.button.text
  if (message.interactive?.button_reply?.title) return message.interactive.button_reply.title
  if (message.interactive?.list_reply?.title) return message.interactive.list_reply.title
  if (message.image?.caption) return message.image.caption
  if (message.video?.caption) return message.video.caption
  if (message.document?.caption) return message.document.caption
  if (message.document?.filename) return message.document.filename
  return message.type || 'Mensaje de WhatsApp'
}

export async function persistWhatsAppWebhook(payload: unknown) {
  const smarttalkAdmin = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient('smarttalk')
    : null
  const entries = Array.isArray((payload as { entry?: unknown[] })?.entry)
    ? ((payload as { entry?: WhatsAppWebhookEntry[] }).entry as WhatsAppWebhookEntry[])
    : []

  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value || {}
      const phoneNumberId =
        value.metadata?.phone_number_id ||
        (entry.id && typeof entry.id === 'string' ? entry.id : null)

      if (!phoneNumberId) continue

      // The legacy history path must not bypass the quota privacy rule used by
      // the canonical SmartTalk processor. Old accounts without a SmartTalk
      // channel keep their existing behavior.
      const { data: smarttalkChannel, error: smarttalkChannelError } = smarttalkAdmin
        ? await smarttalkAdmin
            .from('channels')
            .select('id,organization_id,brand_id')
            .eq('whatsapp_phone_number_id', phoneNumberId)
            .eq('status', 'active')
            .maybeSingle()
        : { data: null, error: null }
      if (smarttalkChannelError) {
        console.error('[meta-webhook:whatsapp] error consultando canal SmartTalk', smarttalkChannelError.message)
      }

      const { data: account, error: accountError } = await supabaseAdmin
        .from('cm_whatsapp_accounts')
        .select('client_id,user_id,waba_id,phone_number_id,display_phone_number')
        .eq(value.metadata?.phone_number_id ? 'phone_number_id' : 'waba_id', phoneNumberId)
        .maybeSingle()

      if (accountError) {
        console.error('[meta-webhook:whatsapp] error consultando cuenta', accountError.message)
        continue
      }

      if (!account) {
        console.warn(`[meta-webhook:whatsapp] cuenta no encontrada para ${phoneNumberId}`)
        continue
      }

      const clientContext = `whatsapp:${account.client_id}`
      let ownerUserId = account.user_id

      if (!ownerUserId && account.client_id) {
        const { data: client } = await supabaseAdmin
          .from('cm_clients')
          .select('user_id')
          .eq('id', account.client_id)
          .maybeSingle()
        ownerUserId = client?.user_id ?? null
      }

      if (!ownerUserId) {
        console.warn(`[meta-webhook:whatsapp] cuenta ${account.phone_number_id} sin user_id para guardar historial`)
        continue
      }

      const messages = Array.isArray(value.messages) ? value.messages : []
      for (const message of messages) {
        if (smarttalkChannel && smarttalkAdmin) {
          const { data: existingContact } = await smarttalkAdmin
            .from('contacts')
            .select('id,visibility_status')
            .eq('organization_id', smarttalkChannel.organization_id)
            .eq('brand_id', smarttalkChannel.brand_id)
            .eq('wa_id', message.from || '')
            .maybeSingle()

          if (!existingContact || existingContact.visibility_status === 'restricted') {
            const billingDecision = await checkBillingFeature({
              organizationId: smarttalkChannel.organization_id,
              featureCode: BILLING_FEATURES.CONTACTS_TOTAL,
              requestedUnits: 1,
              source: 'webhook/whatsapp/legacy-history',
            })
            if (!billingDecision.allowed) {
              console.warn('[billing] skipping legacy WhatsApp history for over-limit contact', {
                organizationId: smarttalkChannel.organization_id,
                brandId: smarttalkChannel.brand_id,
                channelId: smarttalkChannel.id,
              })
              continue
            }
          }
        }

        const content = extractMessageText(message)
        const direction = 'inbound'
        const from = message.from || 'WhatsApp'
        const { error: chatError } = await supabaseAdmin.from('cm_chat_history').insert({
          id: randomUUID(),
          user_id: ownerUserId,
          client_context: clientContext,
          mode: 'B',
          role: 'user',
          content: `${from}: ${content}`,
        })

        if (chatError) {
          console.error('[meta-webhook:whatsapp] error guardando mensaje', chatError.message)
          continue
        }

        const { error: activityError } = await supabaseAdmin.from('cm_activity_log').insert({
          id: randomUUID(),
          user_id: ownerUserId,
          action: `WhatsApp ${direction}: ${content}`,
          status: 'info',
        })

        if (activityError) {
          console.error('[meta-webhook:whatsapp] error guardando actividad', activityError.message)
        }
      }

      const statuses = Array.isArray(value.statuses) ? value.statuses : []
      for (const status of statuses) {
        const { error: statusError } = await supabaseAdmin.from('cm_activity_log').insert({
          id: randomUUID(),
          user_id: ownerUserId,
          action: `WhatsApp status ${status.status || 'desconocido'} para ${status.recipient_id || phoneNumberId}`,
          status: status.status === 'failed' ? 'error' : 'info',
        })

        if (statusError) {
          console.error('[meta-webhook:whatsapp] error guardando estado', statusError.message)
        }
      }
    }
  }
}

type WhatsAppWebhookEntry = {
  id?: string
  changes?: Array<{
    field?: string
    value?: WhatsAppWebhookValue
  }>
}

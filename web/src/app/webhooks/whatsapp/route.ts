// LEGACY: Community Manager WhatsApp webhook (persiste en cm_* tables vía lib/webhook).
// Mantener mientras existan canales Meta apuntando a esta URL en prod.
// Para NUEVOS canales del inbox SmartTalk usar /api/webhook/whatsapp (HMAC + schema smarttalk).
import { NextRequest } from 'next/server'
import { receiveMetaWebhook, verifyMetaWebhook } from '@/lib/webhook'

export async function GET(request: NextRequest) {
  return verifyMetaWebhook(request, 'whatsapp')
}

export async function POST(request: NextRequest) {
  return receiveMetaWebhook(request, 'whatsapp')
}

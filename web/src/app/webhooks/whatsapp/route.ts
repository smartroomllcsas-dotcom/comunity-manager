import { NextRequest } from 'next/server'
import { receiveMetaWebhook, verifyMetaWebhook } from '@/lib/webhook'

export async function GET(request: NextRequest) {
  return verifyMetaWebhook(request, 'whatsapp')
}

export async function POST(request: NextRequest) {
  return receiveMetaWebhook(request, 'whatsapp')
}

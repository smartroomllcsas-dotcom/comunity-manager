import { NextRequest } from 'next/server'
import { receiveMetaWebhook, verifyMetaWebhook } from '@/lib/smarttalk/meta-webhook'

export async function GET(request: NextRequest) {
  return verifyMetaWebhook(request, 'messenger')
}

export async function POST(request: NextRequest) {
  return receiveMetaWebhook(request, 'messenger')
}

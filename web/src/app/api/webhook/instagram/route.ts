import { NextRequest, NextResponse } from 'next/server'
import { receiveMetaWebhook, verifyMetaWebhook } from '@/lib/smarttalk/meta-webhook'
import { clientIp, rateLimitWithWhitelist } from '@/lib/rate-limit'

export const maxDuration = 300;

// Sprint 22 hardening: 200 req/min por IP para webhooks externos.
const WEBHOOK_RATE_LIMIT = 200
const WEBHOOK_RATE_WINDOW_MS = 60 * 1000

export async function GET(request: NextRequest) {
  return verifyMetaWebhook(request, 'instagram')
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request.headers)
  const rl = await rateLimitWithWhitelist(
    ip,
    `webhook-instagram:${ip}`,
    WEBHOOK_RATE_LIMIT,
    WEBHOOK_RATE_WINDOW_MS
  )
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
    )
  }
  return receiveMetaWebhook(request, 'instagram')
}

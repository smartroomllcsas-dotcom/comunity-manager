import { NextRequest, NextResponse } from 'next/server'

const DEFAULT_VERIFY_TOKEN = 'smarttalk_wh_verify_8k2m9x'

function getVerifyToken() {
  return process.env.META_WEBHOOK_VERIFY_TOKEN || DEFAULT_VERIFY_TOKEN
}

export function verifyMetaWebhook(request: NextRequest, channel: 'whatsapp' | 'messenger') {
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

export async function receiveMetaWebhook(request: NextRequest, channel: 'whatsapp' | 'messenger') {
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

  return NextResponse.json({
    received: true,
    channel,
  })
}

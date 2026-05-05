import { NextRequest, NextResponse } from 'next/server'
import {
  exchangeInstagramCode,
  getInstagramLongLivedToken,
  getInstagramProfile,
} from '@/lib/instagram'

const REDIRECT_URI_FALLBACK = 'https://www.comunitymanager.io/'

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
  const code = request.nextUrl.searchParams.get('code')
  const error = request.nextUrl.searchParams.get('error')
  const errorReason = request.nextUrl.searchParams.get('error_reason')
  // Instagram registered redirect_uri must match exactly. We registered the root URL.
  const redirectUri = `${appUrl}/`

  const successUrl = (params: Record<string, string>) =>
    `${appUrl}/test-fb-login?${new URLSearchParams(params)}`

  if (error) {
    return NextResponse.redirect(
      successUrl({
        ig_error: error,
        ig_error_reason: errorReason || '',
      })
    )
  }

  if (!code) {
    return NextResponse.redirect(successUrl({ ig_error: 'missing_code' }))
  }

  try {
    const short = await exchangeInstagramCode(code, redirectUri)
    let longTokenStr: string
    let expiresIn = 0
    try {
      const long = await getInstagramLongLivedToken(short.access_token)
      longTokenStr = long.access_token
      expiresIn = long.expires_in
    } catch {
      // If long-lived exchange fails (rare for fresh tokens), fall back to short.
      longTokenStr = short.access_token
    }

    const profile = await getInstagramProfile(longTokenStr)

    return NextResponse.redirect(
      successUrl({
        ig_success: 'true',
        ig_user_id: String(profile.id),
        ig_username: profile.username,
        ig_account_type: profile.account_type || '',
        ig_token_preview: longTokenStr.slice(0, 24),
        ig_expires_in: String(expiresIn),
      })
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    console.error('[ig-oauth-callback]', msg)
    return NextResponse.redirect(successUrl({ ig_error: msg }))
  }
}

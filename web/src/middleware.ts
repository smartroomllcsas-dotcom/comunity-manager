import { NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const SMARTTALK_PATH_PREFIXES = [
  '/inbox',
  '/contacts',
  '/broadcasts',
  '/chatbot',
  '/settings',
  '/dashboard',
  '/reports',
  '/admin',
  '/register',
  '/invite',
]

function isSmarttalkArea(pathname: string) {
  return SMARTTALK_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  if (pathname === '/' && searchParams.get('code')) {
    const url = request.nextUrl.clone()
    url.pathname = '/api/auth/instagram/callback'
    return NextResponse.redirect(url)
  }

  if (isSmarttalkArea(pathname)) {
    return updateSession(request)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/',
    '/inbox/:path*',
    '/contacts/:path*',
    '/broadcasts/:path*',
    '/chatbot/:path*',
    '/settings/:path*',
    '/dashboard/:path*',
    '/reports/:path*',
    '/admin/:path*',
    '/register/:path*',
    '/invite/:path*',
  ],
}

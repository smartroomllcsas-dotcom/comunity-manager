import { NextRequest, NextResponse } from 'next/server'

// Instagram Business Login redirects to "/" with ?code=... (registered redirect_uri).
// Intercept that case and route to the dedicated callback so the API route can
// exchange the token before AuthProvider bounces unauthenticated users to /login.
export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl
  if (pathname === '/' && searchParams.get('code')) {
    const url = request.nextUrl.clone()
    url.pathname = '/api/auth/instagram/callback'
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/'],
}

import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { locales, defaultLocale } from './i18n';

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'always',
});

export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const isOs = pathname.startsWith('/os') || /^\/(es|en)\/os/.test(pathname);
  if (isOs) return intlMiddleware(req);
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|api|.*\\..*).*)'],
};

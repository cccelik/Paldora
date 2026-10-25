import { buildContentSecurityPolicy, createNonce } from '@/lib/security/csp';
import { publicEnvironment } from '@/lib/server/environment';
import { NextResponse, type NextRequest } from 'next/server';

/** Optimistic navigation only; trusted services verify each read and write. */
const hasSession = (request: NextRequest) =>
  Boolean(request.cookies.get('paldora_session')?.value);

const protectedPrefixes = [
  '/home',
  '/settings',
  '/onboarding',
  '/friends',
  '/boxes',
  '/notifications',
  '/life-updates',
  '/memories',
  '/moderation',
];

export const isProtectedPath = (pathname: string) =>
  protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

export function proxy(request: NextRequest) {
  if (isProtectedPath(request.nextUrl.pathname) && !hasSession(request)) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }
  const nonce = createNonce();
  const contentSecurityPolicy = buildContentSecurityPolicy({
    nonce,
    development: process.env.NODE_ENV === 'development',
    webUrl: publicEnvironment().NEXT_PUBLIC_WEB_URL,
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', contentSecurityPolicy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('content-security-policy', contentSecurityPolicy);
  return response;
}

export const config = {
  matcher: [
    {
      source:
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};

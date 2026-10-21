import { buildContentSecurityPolicy, createNonce } from '@/lib/security/csp';
import { publicEnvironment } from '@/lib/server/environment';
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
const hasSupabaseSession = (request: NextRequest) =>
  request.cookies.getAll().some((cookie) => cookie.name.startsWith('sb-'));

/** Pages that need a session. The API still authorizes every data call. */
const protectedPrefixes = ['/home', '/settings', '/onboarding'];

export const isProtectedPath = (pathname: string) =>
  protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

/**
 * Runs before every page render. It (1) issues the per-request CSP nonce,
 * (2) sends visitors without a session cookie away from protected pages, and
 * (3) refreshes an expiring Supabase session cookie. All of it is optimistic,
 * cookie-only work: authentication and authorization are decided by the API
 * on every request, never here.
 */
export async function proxy(request: NextRequest) {
  if (
    isProtectedPath(request.nextUrl.pathname) &&
    !hasSupabaseSession(request)
  ) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }
  const environment = publicEnvironment();
  const nonce = createNonce();
  const contentSecurityPolicy = buildContentSecurityPolicy({
    nonce,
    development: process.env.NODE_ENV === 'development',
    webUrl: environment.NEXT_PUBLIC_WEB_URL,
    apiUrl: environment.NEXT_PUBLIC_API_URL,
    supabaseUrl: environment.NEXT_PUBLIC_SUPABASE_URL,
    mediaOrigin: environment.NEXT_PUBLIC_MEDIA_ORIGIN,
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', contentSecurityPolicy);
  const next = () =>
    NextResponse.next({ request: { headers: requestHeaders } });
  let response = next();

  if (hasSupabaseSession(request)) {
    const supabase = createServerClient(
      environment.NEXT_PUBLIC_SUPABASE_URL,
      environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (cookies) => {
            for (const { name, value } of cookies) {
              request.cookies.set(name, value);
            }
            requestHeaders.set('cookie', request.cookies.toString());
            response = next();
            for (const { name, value, options } of cookies) {
              response.cookies.set(name, value, options);
            }
          },
        },
      },
    );
    try {
      // getClaims verifies the JWT signature and refreshes when needed.
      await supabase.auth.getClaims();
    } catch {
      // An auth outage must not take down public pages; the API still decides.
    }
  }

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

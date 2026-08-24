import { NextResponse, type NextRequest } from 'next/server';
import { safeCallbackPath } from '../../lib/callback-path';
import { configuredWebOrigin } from '../../lib/public-url';
import { createSupabaseRouteClient } from '../../lib/supabase/server';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const next = safeCallbackPath(url.searchParams.get('next'));
  const webOrigin = configuredWebOrigin();
  const successResponse = NextResponse.redirect(new URL(next, webOrigin));
  const supabase = createSupabaseRouteClient(request, successResponse);
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return successResponse;
  } else if (tokenHash && type === 'recovery') {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'recovery',
    });
    if (!error) return successResponse;
  }
  return NextResponse.redirect(
    new URL('/sign-in?error=invalid_callback', webOrigin),
  );
}

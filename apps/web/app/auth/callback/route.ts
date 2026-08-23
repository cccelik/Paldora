import { NextResponse } from 'next/server';
import { safeCallbackPath } from '../../lib/callback-path';
import { configuredWebOrigin } from '../../lib/public-url';
import { createSupabaseServerClient } from '../../lib/supabase/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeCallbackPath(url.searchParams.get('next'));
  const webOrigin = configuredWebOrigin();
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, webOrigin));
  }
  return NextResponse.redirect(
    new URL('/sign-in?error=invalid_callback', webOrigin),
  );
}

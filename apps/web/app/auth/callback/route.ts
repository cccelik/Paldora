import { redirect } from 'next/navigation';
import { type NextRequest } from 'next/server';
import { safeCallbackPath } from '../../lib/callback-path';
import { createSupabaseServerClient } from '../../lib/supabase/server';
/**
 * Email links land here: PKCE `code` from the default templates, or
 * `token_hash` from custom recovery templates. Only allowlisted in-app paths
 * may follow, and failures never put details in the URL.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get('code');
  const tokenHash = params.get('token_hash');
  const next = safeCallbackPath(params.get('next'));
  const supabase = await createSupabaseServerClient();
  let verified = false;
  if (code) {
    verified = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && params.get('type') === 'recovery') {
    verified = !(
      await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
    ).error;
  }
  redirect(verified ? next : '/auth/link-expired');
}

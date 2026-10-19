import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { publicEnvironment } from '../environment';

/**
 * Supabase client bound to the request's session cookies. Server Components
 * cannot write cookies, so writes are ignored there; the proxy refreshes the
 * session before rendering, and Server Actions and Route Handlers can write.
 */
export async function createSupabaseServerClient() {
  const environment = publicEnvironment();
  const cookieStore = await cookies();
  return createServerClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (items) => {
          try {
            for (const { name, value, options } of items) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Rendering a Server Component: the proxy already refreshed.
          }
        },
      },
    },
  );
}

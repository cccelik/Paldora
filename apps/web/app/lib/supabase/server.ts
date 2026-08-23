import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

function publicSupabaseEnvironment(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('Paldora authentication is not configured.');
  }
  return { url, anonKey };
}

export async function createSupabaseServerClient() {
  const { url, anonKey } = publicSupabaseEnvironment();
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) => {
        try {
          items.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot write cookies; proxy refreshes the session.
        }
      },
    },
  });
}
import 'server-only';

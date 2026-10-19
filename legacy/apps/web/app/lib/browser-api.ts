'use client';

import { PaldoraApiClient } from '@paldora/api-client';
import { createSupabaseBrowserClient } from './supabase/client';

export function createBrowserApiClient(): PaldoraApiClient {
  const supabase = createSupabaseBrowserClient();
  return new PaldoraApiClient({
    baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1',
    getAccessToken: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    },
  });
}

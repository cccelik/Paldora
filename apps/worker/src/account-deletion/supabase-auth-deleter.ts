import { createClient } from '@supabase/supabase-js';
import type { AuthAccountDeleter } from './erase-account.js';

export function createSupabaseAuthDeleter(
  url: string,
  secretKey: string,
): AuthAccountDeleter {
  const client = createClient(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return {
    async deleteUser(subject) {
      const { error } = await client.auth.admin.deleteUser(subject, false);
      if (error && error.status !== 404) throw error;
    },
  };
}

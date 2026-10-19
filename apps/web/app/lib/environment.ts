import {
  parseWebPublicEnvironment,
  type WebPublicEnvironment,
} from '@paldora/config';

let cached: WebPublicEnvironment | undefined;

/**
 * Validated public configuration for server code (proxy, Server Components,
 * Server Actions). Each variable is read by its literal name so Next.js can
 * inline it. Client components receive values through props instead of
 * importing this module, which keeps the validator out of client bundles.
 */
export function publicEnvironment(): WebPublicEnvironment {
  cached ??= parseWebPublicEnvironment({
    PALDORA_ENV: process.env.PALDORA_ENV,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_WEB_URL: process.env.NEXT_PUBLIC_WEB_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_MEDIA_ORIGIN: process.env.NEXT_PUBLIC_MEDIA_ORIGIN,
  });
  return cached;
}

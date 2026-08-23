import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import type { NextConfig } from 'next';

const rootEnvironmentPath = fileURLToPath(
  new URL('../../.env', import.meta.url),
);
const publicEnvironmentKeys = [
  'NEXT_PUBLIC_API_URL',
  'NEXT_PUBLIC_MEDIA_ORIGIN',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_WEB_URL',
] as const;

if (existsSync(rootEnvironmentPath)) {
  const rootEnvironment = parseEnv(readFileSync(rootEnvironmentPath, 'utf8'));
  for (const key of publicEnvironmentKeys) {
    process.env[key] ??= rootEnvironment[key];
  }
}

const securityHeaders = [
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
];

const nextConfig: NextConfig = {
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  allowedDevOrigins: ['127.0.0.1'],
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_MEDIA_ORIGIN: process.env.NEXT_PUBLIC_MEDIA_ORIGIN,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_WEB_URL: process.env.NEXT_PUBLIC_WEB_URL,
  },
  poweredByHeader: false,
  typedRoutes: true,
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;

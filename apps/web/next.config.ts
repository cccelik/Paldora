import { securityHeaders } from '@/lib/security/security-headers';
import { type NextConfig } from 'next';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
// Local development shares the repository-root .env. Values already present
// in the environment (CI, hosting platforms) take precedence.
const rootEnvironmentPath = fileURLToPath(
  new URL('../../.env', import.meta.url),
);
if (existsSync(rootEnvironmentPath)) loadEnvFile(rootEnvironmentPath);

// Fail the build, not the first request, when public configuration is wrong.
const webUrl = process.env.NEXT_PUBLIC_WEB_URL;
if (!webUrl || !['http:', 'https:'].includes(new URL(webUrl).protocol))
  throw new Error('NEXT_PUBLIC_WEB_URL must be an HTTP or HTTPS URL.');

const nextConfig: NextConfig = {
  // Inline only the validated public keys; server secrets never get here.
  env: { NEXT_PUBLIC_WEB_URL: webUrl },
  poweredByHeader: false,
  reactStrictMode: true,
  typedRoutes: true,
  allowedDevOrigins: ['127.0.0.1'],
  // The Content-Security-Policy is set per request in proxy.ts, nowhere else.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders({
          deployed: process.env.PALDORA_ENV !== 'local',
        }),
      },
    ];
  },
};

export default nextConfig;

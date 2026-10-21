import {
  isDeployedEnvironment,
  parseWebPublicEnvironment,
  webPublicEnvironmentKeys,
} from '@paldora/config';
import { type NextConfig } from 'next';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { securityHeaders } from './app/lib/security-headers';
// Local development shares the repository-root .env. Values already present
// in the environment (CI, hosting platforms) take precedence.
const rootEnvironmentPath = fileURLToPath(
  new URL('../../.env', import.meta.url),
);
if (existsSync(rootEnvironmentPath)) loadEnvFile(rootEnvironmentPath);

// Fail the build, not the first request, when public configuration is wrong.
const environment = parseWebPublicEnvironment(process.env);

const nextConfig: NextConfig = {
  // Inline only the validated public keys; server secrets never get here.
  env: Object.fromEntries(
    webPublicEnvironmentKeys.map((key) => [key, environment[key] ?? '']),
  ),
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
          deployed: isDeployedEnvironment(environment.PALDORA_ENV),
        }),
      },
    ];
  },
};

export default nextConfig;

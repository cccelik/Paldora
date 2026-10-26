import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const script = fileURLToPath(
  new URL('../scripts/staff-grant.mjs', import.meta.url),
);

function run(env: Record<string, string>): Promise<number> {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [script, '--revoke', 'uid-1', '--operator', 'ops'],
      { env: { PATH: process.env.PATH ?? '', ...env } },
      (error) => resolve(error ? ((error as { code?: number }).code ?? 1) : 0),
    );
  });
}

describe('staff grant script', () => {
  it('refuses a non-demo project', async () => {
    expect(
      await run({
        GCLOUD_PROJECT: 'prod',
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
      }),
    ).not.toBe(0);
  });
  it('refuses when credentials are set or emulator is missing', async () => {
    expect(
      await run({
        GCLOUD_PROJECT: 'demo-paldora',
        FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
        GOOGLE_APPLICATION_CREDENTIALS: '/nonexistent.json',
      }),
    ).not.toBe(0);
    expect(await run({ GCLOUD_PROJECT: 'demo-paldora' })).not.toBe(0);
  });
});

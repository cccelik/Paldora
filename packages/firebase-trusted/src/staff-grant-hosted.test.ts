import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NativeModeration } from './native-moderation.js';

type Validate = (
  argv: string[],
  env: Record<string, string>,
  repoRoot: string,
) => Record<string, string>;
const guards = (await import(
  new URL('../scripts/staff-grant-hosted-guards.mjs', import.meta.url).href
)) as { validateHostedGrant: Validate };
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const scriptPath = fileURLToPath(
  new URL('../scripts/staff-grant-hosted.mjs', import.meta.url),
);

const args = [
  '--project',
  'paldora-staging-x1',
  '--confirm-project',
  'paldora-staging-x1',
  '--operator-label',
  'owner.main',
  '--grant',
  'uid-1',
  '--role',
  'administrator',
];
const env = { PALDORA_ENV: 'staging' };
const swap = (flag: string, value: string) => {
  const copy = [...args];
  copy[copy.indexOf(flag) + 1] = value;
  return copy;
};
const refuses = (argv: string[], e: Record<string, string>) =>
  expect(() => guards.validateHostedGrant(argv, e, repoRoot));

describe('hosted break-glass guards', () => {
  it('accepts a complete staging request', () => {
    expect(guards.validateHostedGrant(args, env, repoRoot)).toMatchObject({
      project: 'paldora-staging-x1',
      role: 'administrator',
    });
  });
  it('refuses a missing, local or misspelled PALDORA_ENV', () => {
    refuses(args, {}).toThrow(/PALDORA_ENV/);
    refuses(args, { PALDORA_ENV: 'local' }).toThrow(/PALDORA_ENV/);
    refuses(args, { PALDORA_ENV: 'prod' }).toThrow(/PALDORA_ENV/);
  });
  it('refuses demo projects and mismatched confirmation', () => {
    const demo = swap('--project', 'demo-paldora');
    refuses(
      swap('--confirm-project', 'demo-paldora').map((a, i) =>
        i === 1 ? 'demo-paldora' : a,
      ),
      env,
    ).toThrow(/non-demo/);
    expect(demo).toBeTruthy();
    refuses(swap('--confirm-project', 'paldora-staging-x2'), env).toThrow(
      /repeat/,
    );
  });
  it('refuses a bad operator label, role, or extra flags', () => {
    refuses(swap('--operator-label', 'Owner@x.com'), env).toThrow(
      /operator-label/,
    );
    refuses(swap('--role', 'owner'), env).toThrow(/role/);
    refuses([...args, '--extra', 'x'], env).toThrow();
  });
  it('refuses emulator variables and a disagreeing project env', () => {
    refuses(args, {
      ...env,
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    }).toThrow(/Emulator/);
    refuses(args, { ...env, GCLOUD_PROJECT: 'other-project-1' }).toThrow(
      /disagrees/,
    );
  });
  it('refuses key files inside the repo and service-account keys', () => {
    refuses(args, {
      ...env,
      GOOGLE_APPLICATION_CREDENTIALS: join(repoRoot, 'package.json'),
    }).toThrow(/inside the repository/);
    const dir = mkdtempSync(join(tmpdir(), 'adc-'));
    const key = join(dir, 'key.json');
    writeFileSync(key, JSON.stringify({ type: 'service_account' }));
    refuses(args, { ...env, GOOGLE_APPLICATION_CREDENTIALS: key }).toThrow(
      /Service-account/,
    );
    const user = join(dir, 'adc.json');
    writeFileSync(user, JSON.stringify({ type: 'authorized_user' }));
    expect(
      guards.validateHostedGrant(
        args,
        { ...env, GOOGLE_APPLICATION_CREDENTIALS: user },
        repoRoot,
      ),
    ).toBeTruthy();
  });
  it('entrypoint exits non-zero without PALDORA_ENV and never prompts', async () => {
    const code = await new Promise<number>((resolve) => {
      execFile(
        process.execPath,
        [scriptPath, ...args],
        { env: { PATH: process.env.PATH ?? '' } },
        (error) =>
          resolve(error ? ((error as { code?: number }).code ?? 1) : 0),
      );
    });
    expect(code).not.toBe(0);
  });
});

describe('grantStaff breakGlass option', () => {
  function fakeDb(created: Record<string, unknown>[]) {
    const doc = (
      _name: string,
      exists: boolean,
      fields: Record<string, unknown>,
    ) => ({
      exists,
      get: (k: string) => fields[k],
    });
    const tx = {
      get: (ref: { name: string }) =>
        Promise.resolve(
          ref.name === 'acct'
            ? doc('acct', true, { status: 'active' })
            : doc('grant', false, {}),
        ),
      create: (_ref: unknown, data: Record<string, unknown>) =>
        created.push(data),
      set: () => undefined,
    };
    const collection = (name: string) => ({
      doc: () => ({ name: name === 'nativeAccounts' ? 'acct' : 'x' }),
    });
    return {
      collection,
      runTransaction: (fn: (t: typeof tx) => Promise<void>) => fn(tx),
    };
  }
  it('adds breakGlass only when requested', async () => {
    const rows: Record<string, unknown>[] = [];
    const moderation = new NativeModeration(fakeDb(rows) as never);
    await moderation.grantStaff('ops.local', 'u', 'moderator');
    await moderation.grantStaff('owner.main', 'u', 'administrator', {
      breakGlass: true,
    });
    expect(rows[0]).not.toHaveProperty('breakGlass');
    expect(rows[1]).toMatchObject({
      action: 'staff.grant',
      breakGlass: true,
      operator: 'owner.main',
    });
  });
});

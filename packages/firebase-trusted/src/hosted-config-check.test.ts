import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

type Check = (root: string) => string[];
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const scriptUrl = new URL(
  '../../../scripts/check-hosted-config.mjs',
  import.meta.url,
).href;
const { checkHostedConfig } = (await import(scriptUrl)) as {
  checkHostedConfig: Check;
};

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

/** A temp copy of exactly the files the checker reads. */
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'hosted-check-'));
  dirs.push(root);
  for (const file of [
    'firebase.json',
    '.firebaserc',
    'firebase/firestore.rules',
    'firebase/storage.rules',
    'apps/web/apphosting.yaml',
    'apps/web/apphosting.staging.yaml',
    'apps/web/apphosting.production.yaml',
    'apps/firebase-functions/src/index.ts',
  ]) {
    mkdirSync(join(root, file, '..'), { recursive: true });
    cpSync(join(repo, file), join(root, file));
  }
  return root;
}

function edit(root: string, file: string, change: (text: string) => string) {
  const path = join(root, file);
  writeFileSync(path, change(readFileSync(path, 'utf8')));
}

function failuresAfter(file: string, change: (text: string) => string) {
  const root = fixture();
  edit(root, file, change);
  return checkHostedConfig(root).join('\n');
}

describe('hosted config check', () => {
  it('passes for the committed configuration', () => {
    expect(checkHostedConfig(repo)).toEqual([]);
    expect(checkHostedConfig(fixture())).toEqual([]);
  });

  it('rejects firebase.json pointing at native config or rules', () => {
    expect(
      failuresAfter('firebase.json', (t) =>
        t.replace(
          'firebase/firestore.rules',
          'firebase/firestore.native.rules',
        ),
      ),
    ).toMatch(/native/);
  });

  it('rejects a rules file that allows anything', () => {
    expect(
      failuresAfter('firebase/storage.rules', (t) =>
        t.replace('if false', 'if request.auth != null'),
      ),
    ).toMatch(/non-deny allow/);
    expect(
      failuresAfter('firebase/firestore.rules', (t) =>
        t.replace('read, write', 'read'),
      ),
    ).toMatch(/non-deny allow/);
  });

  it.each([
    ['emulator host', 'FIRESTORE_EMULATOR_HOST'],
    ['localhost', 'http://localhost:3000'],
    ['loopback', 'http://127.0.0.1:3000'],
    ['demo id', 'demo-paldora'],
    ['dev_only', 'paldora_dev_only'],
    ['private key', '-----BEGIN PRIVATE KEY-----'],
    ['api key literal', 'AIzaSyA1234567890abcdefghijklmnopqrstuvw'],
    ['long token', 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4'],
  ])('rejects %s in an apphosting file', (_name, literal) => {
    expect(
      failuresAfter('apps/web/apphosting.yaml', (t) =>
        t.replace('value: info', `value: ${literal}`),
      ),
    ).toMatch(/contains/);
  });

  it('rejects emulator hosts and demo ids inside the functions block', () => {
    expect(
      failuresAfter('firebase.json', (t) =>
        t.replace(
          'pnpm functions:prepare',
          'FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 pnpm functions:prepare',
        ),
      ),
    ).toMatch(/functions: contains \*_EMULATOR_HOST/);
    expect(
      failuresAfter('firebase.json', (t) =>
        t.replace('"codebase": "paldora"', '"codebase": "demo-paldora"'),
      ),
    ).toMatch(/functions: contains demo-/);
  });

  it('rejects PALDORA_ENV values other than staging or production', () => {
    expect(
      failuresAfter('apps/web/apphosting.staging.yaml', (t) =>
        t.replace('value: staging', 'value: local'),
      ),
    ).toMatch(/PALDORA_ENV must be staging or production/);
    expect(
      failuresAfter('apps/web/apphosting.production.yaml', (t) =>
        t.replace('value: production', 'value: staging'),
      ),
    ).toMatch(/must equal production/);
  });

  it('rejects a functions region other than europe-west4', () => {
    expect(
      failuresAfter('apps/firebase-functions/src/index.ts', (t) =>
        t.replace("region: 'europe-west4'", "region: 'us-central1'"),
      ),
    ).toMatch(/region us-central1/);
    expect(
      failuresAfter('firebase.json', (t) =>
        t.replace('"codebase"', '"region": "us-central1", "codebase"'),
      ),
    ).toMatch(/region must be europe-west4/);
  });

  it('requires the functions source to be the generated bundle directory', () => {
    expect(
      failuresAfter('firebase.json', (t) =>
        t.replace(
          '"source": "apps/firebase-functions/deploy"',
          '"source": "apps/firebase-functions"',
        ),
      ),
    ).toMatch(/must be the generated bundle directory/);
  });

  it('rejects a missing functions block', () => {
    expect(
      failuresAfter('firebase.json', (t) => {
        const config = JSON.parse(t) as Record<string, unknown>;
        delete config.functions;
        return JSON.stringify(config);
      }),
    ).toMatch(/no functions block/);
  });

  it('rejects a demo project in .firebaserc', () => {
    expect(
      failuresAfter('.firebaserc', () =>
        JSON.stringify({ projects: { staging: 'demo-staging' } }),
      ),
    ).toMatch(/\.firebaserc alias staging uses a demo-/);
  });

  it('rejects NEXT_PUBLIC_ variables outside the allowlist', () => {
    expect(
      failuresAfter('apps/web/apphosting.yaml', (t) =>
        t.replace(
          'env:\n',
          'env:\n  - variable: NEXT_PUBLIC_SECRET_THING\n    value: x\n',
        ),
      ),
    ).toMatch(/NEXT_PUBLIC_SECRET_THING is not an allowed/);
  });
});

import { describe, expect, it } from 'vitest';
import {
  assertHostedEnvironment,
  contactEmail,
  deploymentEnvironment,
} from './environment';

const hosted = {
  PALDORA_ENV: 'production',
  NEXT_PUBLIC_WEB_URL: 'https://paldora.example',
  FIREBASE_PROJECT_ID: 'paldora-prod',
  FIREBASE_WEB_API_KEY: 'AIzaSyExampleKeyForTests000000000000000',
  NEXT_PUBLIC_CONTACT_EMAIL: 'contact@paldora.example',
} as unknown as NodeJS.ProcessEnv;

const with_ = (extra: Record<string, string | undefined>) =>
  ({ ...hosted, ...extra }) as NodeJS.ProcessEnv;

describe('deploymentEnvironment', () => {
  it.each(['local', 'staging', 'production'])('accepts %s', (value) => {
    expect(deploymentEnvironment({ PALDORA_ENV: value } as never)).toBe(value);
  });

  it.each([undefined, '', 'prod', 'Production', 'dev'])(
    'fails closed on %s',
    (value) => {
      expect(() =>
        deploymentEnvironment({ PALDORA_ENV: value } as never),
      ).toThrow('PALDORA_ENV must be');
    },
  );
});

describe('assertHostedEnvironment', () => {
  it('accepts a real HTTPS staging or production project', () => {
    expect(() => assertHostedEnvironment(hosted)).not.toThrow();
    expect(() =>
      assertHostedEnvironment(with_({ PALDORA_ENV: 'staging' })),
    ).not.toThrow();
  });

  it('does not apply hosted rules to local', () => {
    expect(() =>
      assertHostedEnvironment({
        PALDORA_ENV: 'local',
        NEXT_PUBLIC_WEB_URL: 'http://127.0.0.1:3000',
        FIREBASE_PROJECT_ID: 'demo-paldora',
        FIREBASE_WEB_API_KEY: 'demo-api-key',
      } as never),
    ).not.toThrow();
  });

  it.each([
    ['plain HTTP', { NEXT_PUBLIC_WEB_URL: 'http://paldora.example' }],
    ['a missing web URL', { NEXT_PUBLIC_WEB_URL: undefined }],
    ['a demo project', { FIREBASE_PROJECT_ID: 'demo-paldora' }],
    ['a missing project', { FIREBASE_PROJECT_ID: undefined }],
    ['the demo API key', { FIREBASE_WEB_API_KEY: 'demo-api-key' }],
    ['a dev_only key', { FIREBASE_WEB_API_KEY: 'key_dev_only' }],
    ['a missing API key', { FIREBASE_WEB_API_KEY: undefined }],
    ['a missing contact address', { NEXT_PUBLIC_CONTACT_EMAIL: undefined }],
    ['a blank contact address', { NEXT_PUBLIC_CONTACT_EMAIL: '  ' }],
    ['a malformed contact address', { NEXT_PUBLIC_CONTACT_EMAIL: 'nope' }],
    ['an Auth emulator', { FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' }],
    ['a Firestore emulator', { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }],
    [
      'a Storage emulator',
      { FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199' },
    ],
    [
      'a Functions emulator',
      { FIREBASE_FUNCTIONS_EMULATOR_HOST: '127.0.0.1:5001' },
    ],
    ['a misspelled tier', { PALDORA_ENV: 'prod' }],
  ])('rejects %s', (_label, extra) => {
    expect(() => assertHostedEnvironment(with_(extra))).toThrow();
  });
});

describe('contactEmail', () => {
  const of = (value: string | undefined) =>
    contactEmail({ NEXT_PUBLIC_CONTACT_EMAIL: value } as never);

  it('is undefined when unset or blank, never a fake address', () => {
    expect(of(undefined)).toBeUndefined();
    expect(of('')).toBeUndefined();
    expect(of('   ')).toBeUndefined();
  });

  it('returns a trimmed plain address', () => {
    expect(of(' hello@paldora.example ')).toBe('hello@paldora.example');
  });

  it.each([
    'nope',
    'a@b',
    'two@@paldora.example',
    'Name <a@paldora.example>',
    'a b@paldora.example',
    'a@paldora.example, b@paldora.example',
    'javascript:alert(1)@x.example',
  ])('throws on %s', (value) => {
    expect(() => of(value)).toThrow('NEXT_PUBLIC_CONTACT_EMAIL');
  });
});

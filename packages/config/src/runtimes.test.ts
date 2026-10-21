import { describe, expect, it } from 'vitest';
import { requireEnvironmentVariables } from './environment.js';
import {
  parseApiEnvironment,
  parseProvisioningEnvironment,
  parseWebPublicEnvironment,
  parseWorkerEnvironment,
} from './runtimes.js';

const localStorage = {
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'paldora-private',
  S3_ACCESS_KEY_ID: 'paldora_minio',
  S3_SECRET_ACCESS_KEY: 'paldora_minio_dev_only',
  S3_FORCE_PATH_STYLE: 'true',
};

const localApi = {
  ...localStorage,
  DATABASE_URL: 'postgresql://paldora:paldora_dev_only@localhost:5432/paldora',
  REDIS_URL: 'redis://localhost:6379',
  WEB_ORIGIN: 'http://localhost:3000/',
  SUPABASE_URL: 'https://project.supabase.co',
};

const localWeb = {
  NEXT_PUBLIC_API_URL: 'http://localhost:4000/api/v1',
  NEXT_PUBLIC_WEB_URL: 'http://localhost:3000',
  NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key',
  NEXT_PUBLIC_MEDIA_ORIGIN: '',
};

describe('API environment', () => {
  it('applies defaults and normalizes origins', () => {
    const environment = parseApiEnvironment(localApi);
    expect(environment.PALDORA_ENV).toBe('local');
    expect(environment.API_PORT).toBe(4000);
    expect(environment.ROOM_CUSTOM_CSS_ENABLED).toBe(false);
    expect(environment.ROOM_CUSTOM_WIDGETS_ENABLED).toBe(false);
    expect(environment.DATABASE_POOL_MAX).toBe(10);
    expect(environment.WEB_ORIGIN).toBe('http://localhost:3000');
    expect(environment.S3_FORCE_PATH_STYLE).toBe(true);
    expect(environment.S3_REGION).toBe('us-east-1');
  });

  it('enables each personalization surface independently', () => {
    const css = parseApiEnvironment({
      ...localApi,
      ROOM_CUSTOM_CSS_ENABLED: 'true',
    });
    expect([
      css.ROOM_CUSTOM_CSS_ENABLED,
      css.ROOM_CUSTOM_WIDGETS_ENABLED,
    ]).toEqual([true, false]);
    const widgets = parseApiEnvironment({
      ...localApi,
      ROOM_CUSTOM_WIDGETS_ENABLED: 'true',
    });
    expect([
      widgets.ROOM_CUSTOM_CSS_ENABLED,
      widgets.ROOM_CUSTOM_WIDGETS_ENABLED,
    ]).toEqual([false, true]);
  });

  it('names every invalid key without echoing values', () => {
    expect(() =>
      parseApiEnvironment({ ...localApi, REDIS_URL: 'http://secret-host' }),
    ).toThrow(/REDIS_URL/);
    try {
      parseApiEnvironment({ DATABASE_URL: 'mysql://user:hunter2@db' });
    } catch (error) {
      expect(String(error)).toMatch(/DATABASE_URL/);
      expect(String(error)).toMatch(/WEB_ORIGIN/);
      expect(String(error)).not.toMatch(/hunter2/);
    }
  });

  it('requires https and real credentials in deployed environments', () => {
    expect(() =>
      parseApiEnvironment({ ...localApi, PALDORA_ENV: 'production' }),
    ).toThrow(
      /WEB_ORIGIN: must use https.*DATABASE_URL: must not use local.*S3_SECRET_ACCESS_KEY: must not use local/,
    );
    expect(
      parseApiEnvironment({
        ...localApi,
        PALDORA_ENV: 'production',
        WEB_ORIGIN: 'https://paldora.example',
        DATABASE_URL: 'postgresql://app:strong@db.internal:5432/paldora',
        S3_ENDPOINT: 'https://storage.paldora.example',
        S3_SECRET_ACCESS_KEY: 'a-real-secret',
      }).PALDORA_ENV,
    ).toBe('production');
  });
});

describe('worker environment', () => {
  it('needs PostgreSQL, Redis, and storage for media jobs', () => {
    const environment = parseWorkerEnvironment({
      ...localStorage,
      DATABASE_URL: localApi.DATABASE_URL,
      REDIS_URL: localApi.REDIS_URL,
    });
    expect(environment.WORKER_CONCURRENCY).toBe(2);
    expect(environment.OUTBOX_POLL_INTERVAL_MS).toBe(1_000);
    expect(() =>
      parseWorkerEnvironment({ REDIS_URL: localApi.REDIS_URL }),
    ).toThrow(/DATABASE_URL.*S3_BUCKET/);
  });
});

describe('provisioning environment', () => {
  it('requires the service-role key only here', () => {
    expect(() =>
      parseProvisioningEnvironment({
        DATABASE_URL: localApi.DATABASE_URL,
        SUPABASE_URL: localApi.SUPABASE_URL,
      }),
    ).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});

describe('web public environment', () => {
  it('treats empty optional values as absent', () => {
    expect(
      parseWebPublicEnvironment(localWeb).NEXT_PUBLIC_MEDIA_ORIGIN,
    ).toBeUndefined();
  });

  it('fails instead of falling back to localhost', () => {
    expect(() =>
      parseWebPublicEnvironment({ ...localWeb, NEXT_PUBLIC_API_URL: '' }),
    ).toThrow(/NEXT_PUBLIC_API_URL/);
  });
});

describe('integration requirements', () => {
  it('fails loudly when infrastructure is not configured', () => {
    expect(() => requireEnvironmentVariables(['DATABASE_URL'], {})).toThrow(
      /require DATABASE_URL/,
    );
    expect(
      requireEnvironmentVariables(['REDIS_URL'], { REDIS_URL: 'redis://x' }),
    ).toEqual({ REDIS_URL: 'redis://x' });
  });
});

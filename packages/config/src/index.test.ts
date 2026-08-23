import { describe, expect, it } from 'vitest';
import { parseApiEnvironment, parseDemoSeedEnvironment } from './index.js';

describe('parseApiEnvironment', () => {
  it('coerces validated configuration', () => {
    const config = parseApiEnvironment({
      DATABASE_URL: 'postgresql://localhost/paldora',
      REDIS_URL: 'redis://localhost:6379',
      WEB_ORIGIN: 'http://localhost:3000',
      API_PORT: '4100',
      SUPABASE_URL: 'https://example.supabase.co',
      S3_BUCKET: 'paldora-private',
      S3_ACCESS_KEY_ID: 'test',
      S3_SECRET_ACCESS_KEY: 'test-secret',
      S3_FORCE_PATH_STYLE: 'false',
    });
    expect(config.API_PORT).toBe(4100);
    expect(config.S3_FORCE_PATH_STYLE).toBe(false);
  });

  it('fails closed when required configuration is missing', () => {
    expect(() => parseApiEnvironment({})).toThrow(
      'Invalid environment configuration',
    );
  });
});

describe('parseDemoSeedEnvironment', () => {
  const required = {
    DATABASE_URL: 'postgresql://localhost/paldora',
    REDIS_URL: 'redis://localhost:6379',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'server-only',
    DEMO_USER_EMAIL: 'first@example.com',
    DEMO_USER_PASSWORD: 'strong-enough',
    DEMO_USERNAME: 'first_friend',
    DEMO_DISPLAY_NAME: 'First Friend',
  };

  it('allows an omitted second demo account', () => {
    expect(
      parseDemoSeedEnvironment({
        ...required,
        DEMO_FRIEND_EMAIL: '',
        DEMO_FRIEND_PASSWORD: '',
        DEMO_FRIEND_USERNAME: '',
        DEMO_FRIEND_DISPLAY_NAME: '',
      }).DEMO_FRIEND_EMAIL,
    ).toBeUndefined();
  });

  it('requires every second-account value when any is supplied', () => {
    expect(() =>
      parseDemoSeedEnvironment({
        ...required,
        DEMO_FRIEND_EMAIL: 'second@example.com',
      }),
    ).toThrow('All DEMO_FRIEND_* values are required');
  });
});

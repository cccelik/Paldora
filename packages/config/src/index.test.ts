import { describe, expect, it } from 'vitest';
import { parseApiEnvironment } from './index.js';

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
    });
    expect(config.API_PORT).toBe(4100);
  });

  it('fails closed when required configuration is missing', () => {
    expect(() => parseApiEnvironment({})).toThrow(
      'Invalid environment configuration',
    );
  });
});

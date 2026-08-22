import { describe, expect, it } from 'vitest';
import { parseApiEnvironment } from './index.js';

describe('parseApiEnvironment', () => {
  it('coerces validated configuration', () => {
    const config = parseApiEnvironment({
      DATABASE_URL: 'postgresql://localhost/paldora',
      REDIS_URL: 'redis://localhost:6379',
      WEB_ORIGIN: 'http://localhost:3000',
      API_PORT: '4100',
    });
    expect(config.API_PORT).toBe(4100);
  });

  it('fails closed when required configuration is missing', () => {
    expect(() => parseApiEnvironment({})).toThrow(
      'Invalid environment configuration',
    );
  });
});

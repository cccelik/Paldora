import { describe, expect, it } from 'vitest';
import { isAllowedFirebaseActionOrigin } from './origin-check';

const expected = 'http://127.0.0.1:3000';

describe('Firebase action origin', () => {
  it('accepts the configured origin in every environment', () => {
    expect(
      isAllowedFirebaseActionOrigin(
        expected,
        '127.0.0.1:3000',
        expected,
        false,
      ),
    ).toBe(true);
  });

  it('accepts the matching localhost alias only in local mode', () => {
    expect(
      isAllowedFirebaseActionOrigin(
        'http://localhost:3000',
        'localhost:3000',
        expected,
        true,
      ),
    ).toBe(true);
    expect(
      isAllowedFirebaseActionOrigin(
        'http://localhost:3000',
        'localhost:3000',
        expected,
        false,
      ),
    ).toBe(false);
  });

  it.each([
    [null, 'localhost:3000'],
    ['http://localhost:3001', 'localhost:3001'],
    ['http://localhost:3000', '127.0.0.1:3000'],
    ['http://evil.example:3000', 'evil.example:3000'],
    ['not-a-url', 'localhost:3000'],
  ])('rejects a missing or mismatched origin', (origin, host) => {
    expect(isAllowedFirebaseActionOrigin(origin, host, expected, true)).toBe(
      false,
    );
  });
});

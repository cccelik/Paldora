import { describe, expect, it } from 'vitest';
import { API_ERROR_CODES, isApiErrorCode } from './errors.js';

describe('API error codes', () => {
  it('are unique SCREAMING_SNAKE identifiers', () => {
    expect(new Set(API_ERROR_CODES).size).toBe(API_ERROR_CODES.length);
    for (const code of API_ERROR_CODES) {
      expect(code).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  });

  it('recognizes only known codes', () => {
    expect(isApiErrorCode('NOT_FOUND')).toBe(true);
    expect(isApiErrorCode('not_found')).toBe(false);
    expect(isApiErrorCode(42)).toBe(false);
  });
});

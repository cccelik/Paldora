import { describe, expect, it } from 'vitest';
import {
  hasDatabaseErrorCode,
  isUniqueViolation,
} from '../src/database-errors.js';

describe('database error inspection', () => {
  it('finds direct and wrapped PostgreSQL error codes', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ cause: { cause: { code: '23505' } } })).toBe(
      true,
    );
    expect(hasDatabaseErrorCode({ code: '23514' }, '23505')).toBe(false);
  });

  it('stops safely for circular causes', () => {
    const error: { cause?: unknown } = {};
    error.cause = error;
    expect(isUniqueViolation(error)).toBe(false);
  });
});

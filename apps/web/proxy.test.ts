import { describe, expect, it } from 'vitest';
import { isProtectedPath } from './proxy';

describe('isProtectedPath', () => {
  it.each([
    ['/home', true],
    ['/settings/account', true],
    ['/onboarding/username', true],
    ['/', false],
    ['/sign-in', false],
    ['/homepage', false],
    ['/reset-password', false],
  ])('%s → %s', (path, expected) => {
    expect(isProtectedPath(path)).toBe(expected);
  });
});

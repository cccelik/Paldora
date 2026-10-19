import { describe, expect, it } from 'vitest';
import { appearanceAttribute } from './appearance';
import { safeCallbackPath } from './callback-path';
import { routeForOnboarding } from './onboarding';

describe('safeCallbackPath', () => {
  it.each([
    ['/reset-password', '/reset-password'],
    ['/home', '/home'],
    [null, '/home'],
    ['https://evil.example/home', '/home'],
    ['//evil.example', '/home'],
    ['/settings/account', '/home'],
  ])('maps %s to %s', (input, expected) => {
    expect(safeCallbackPath(input)).toBe(expected);
  });
});

describe('appearanceAttribute', () => {
  it('only pins explicit choices', () => {
    expect(appearanceAttribute('dark')).toBe('dark');
    expect(appearanceAttribute('light')).toBe('light');
    expect(appearanceAttribute('system')).toBeUndefined();
    expect(appearanceAttribute('neon')).toBeUndefined();
    expect(appearanceAttribute(undefined)).toBeUndefined();
  });
});

describe('routeForOnboarding', () => {
  it('sends unfinished setup to its step and finished users home', () => {
    expect(routeForOnboarding('username')).toBe('/onboarding/username');
    expect(routeForOnboarding('avatar')).toBe('/onboarding/avatar');
    expect(routeForOnboarding('complete')).toBe('/home');
  });
});

import { describe, expect, it } from 'vitest';
import { safeCallbackPath } from './callback-path';

describe('safeCallbackPath', () => {
  it('allows known internal destinations', () => {
    expect(safeCallbackPath('/reset-password')).toBe('/reset-password');
    expect(safeCallbackPath('/home')).toBe('/home');
  });

  it('rejects protocol-relative and unknown paths', () => {
    expect(safeCallbackPath('//attacker.example')).toBe('/home');
    expect(safeCallbackPath('/settings/account')).toBe('/home');
    expect(safeCallbackPath('https://attacker.example')).toBe('/home');
  });
});

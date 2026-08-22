import { describe, expect, it } from 'vitest';
import { denyByDefault } from './index.js';

describe('authorization defaults', () => {
  it('denies access without an explicit allow decision', () => {
    expect(denyByDefault()).toEqual({ allowed: false, reason: 'forbidden' });
  });
});

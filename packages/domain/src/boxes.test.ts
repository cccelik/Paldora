import { describe, expect, it } from 'vitest';
import { mayChangeRole, mayRemoveMember, type BoxRole } from './boxes.js';

describe('mayChangeRole', () => {
  const cases: [BoxRole, BoxRole, 'admin' | 'member', boolean][] = [
    ['owner', 'member', 'admin', true],
    ['owner', 'admin', 'member', true],
    ['owner', 'admin', 'admin', false],
    ['owner', 'owner', 'member', false],
    ['admin', 'member', 'admin', true],
    ['admin', 'admin', 'member', false],
    ['admin', 'owner', 'member', false],
    ['admin', 'member', 'member', false],
    ['member', 'member', 'admin', false],
    ['member', 'admin', 'member', false],
  ];
  it.each(cases)(
    '%s changing %s to %s → %s',
    (actor, target, next, expected) => {
      expect(mayChangeRole({ actor, target, next })).toBe(expected);
    },
  );
});

describe('mayRemoveMember', () => {
  it('lets owners and admins remove non-owners only', () => {
    expect(mayRemoveMember('owner', 'admin')).toBe(true);
    expect(mayRemoveMember('admin', 'member')).toBe(true);
    expect(mayRemoveMember('admin', 'admin')).toBe(true);
    expect(mayRemoveMember('admin', 'owner')).toBe(false);
    expect(mayRemoveMember('owner', 'owner')).toBe(false);
    expect(mayRemoveMember('member', 'member')).toBe(false);
  });
});

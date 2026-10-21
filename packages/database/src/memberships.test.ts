import { and, eq, inArray } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { activeMembership } from './memberships.js';
import { boxMemberships, posts } from './schema.js';

const dialect = new PgDialect();
const render = (condition: ReturnType<typeof and>) => {
  if (!condition) throw new Error('no condition');
  return dialect.sqlToQuery(condition);
};
const viewer = '7d2f4f3e-8a71-4c55-9b16-2f1f0c6d2a10';
const box = '0a7c1d6e-2f13-4d8b-9f54-5c3e6d1b7a22';

describe('activeMembership', () => {
  it('is the Box, person, and active-status triple', () => {
    expect(render(activeMembership(posts.boxId, viewer))).toEqual(
      render(
        and(
          eq(boxMemberships.boxId, posts.boxId),
          eq(boxMemberships.userId, viewer),
          eq(boxMemberships.status, 'active'),
        ),
      ),
    );
  });

  it('accepts one Box ID or a list of them', () => {
    expect(render(activeMembership(box, viewer)).params).toEqual([
      box,
      viewer,
      'active',
    ]);
    expect(render(activeMembership([box], viewer))).toEqual(
      render(
        and(
          inArray(boxMemberships.boxId, [box]),
          eq(boxMemberships.userId, viewer),
          eq(boxMemberships.status, 'active'),
        ),
      ),
    );
  });
});

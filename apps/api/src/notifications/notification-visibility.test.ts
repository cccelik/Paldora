import { activeMembership, posts } from '@paldora/database';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { visibleTo } from './notification-visibility.js';

const dialect = new PgDialect();
const viewer = '7d2f4f3e-8a71-4c55-9b16-2f1f0c6d2a10';

/** Renders a fragment with its parameters written in as literals. */
function inline(fragment: SQL | undefined): string {
  if (!fragment) throw new Error('no fragment');
  const { sql, params } = dialect.sqlToQuery(fragment);
  return sql.replace(/\$(\d+)/g, (_match, index: string) => {
    const value = params[Number(index) - 1];
    return `'${String(value)}'`;
  });
}

describe('notification visibility', () => {
  it('requires an active membership exactly as the shared rule defines it', () => {
    // The fragment is raw SQL, so it cannot call `activeMembership`. Every
    // condition of the shared rule must appear in it unchanged; a change to
    // the rule that this copy does not follow fails here.
    const rule = inline(activeMembership(posts.boxId, viewer));
    const conditions = rule.replace(/^\(|\)$/g, '').split(' and ');
    expect(conditions).toHaveLength(3);
    const visibility = inline(visibleTo(viewer));
    for (const condition of conditions) {
      expect(visibility).toContain(condition);
    }
  });
});

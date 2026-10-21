import { ACTIVITY_EVENT_TYPES } from '@paldora/domain';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_BACKOFF_CAP_MS,
  MAX_ACTIVITY_ATTEMPTS,
  backoffMs,
} from './activity-store.js';
import { projectEvent, projectionStatement } from './projection-rules.js';

const dialect = new PgDialect();
const eventId = '0a7c1d6e-2f13-4d8b-9f54-5c3e6d1b7a22';
const render = (type: (typeof ACTIVITY_EVENT_TYPES)[number]) =>
  dialect.sqlToQuery(projectionStatement(type, eventId));

describe('projection statements', () => {
  it.each(ACTIVITY_EVENT_TYPES)('%s applies every shared skip rule', (type) => {
    const { sql, params } = render(type);
    expect(params).toEqual([eventId]);
    expect(sql).toContain('n.recipient_user_id <> n.actor_user_id');
    expect(sql).toContain("p.status = 'active'");
    expect(sql).toContain("recipient.status = 'active'");
    expect(sql).toContain("m.status = 'active'");
    // The shared block definition, both directions, recipient vs actor.
    expect(sql).toContain('"user_blocks"');
    expect(sql.match(/n\.recipient_user_id/g)?.length).toBeGreaterThanOrEqual(
      4,
    );
    expect(sql).toContain('on conflict (dedupe_key) do nothing');
    // Display data is never copied: only IDs and the key are inserted.
    expect(sql).not.toMatch(/content|kind|display_name/);
  });

  it('routes comments by their parent: root to the post author, reply to whom it answers', () => {
    const { sql } = render('comment.created');
    expect(sql).toContain("then 'post.comment' else 'comment.reply'");
    expect(sql).toContain('coalesce(c.reply_to_user_id, root.author_user_id)');
    expect(sql).toContain("c.status = 'active'");
  });

  it('requires a reaction that still exists', () => {
    expect(render('post.reaction.set').sql).toContain('paldora.post_reactions');
    const comment = render('comment.reaction.set').sql;
    expect(comment).toContain('paldora.comment_reactions');
    expect(comment).toContain("c.status = 'active'");
  });

  it('rejects an unknown event type instead of guessing', async () => {
    await expect(
      projectEvent({} as never, { id: eventId, type: 'post.created' }),
    ).rejects.toThrow('Unknown activity event type');
  });
});

describe('backoff', () => {
  it('doubles from 500 ms and caps at a minute, plus bounded jitter', () => {
    expect(backoffMs(0, () => 0)).toBe(500);
    expect(backoffMs(1, () => 0)).toBe(1_000);
    expect(backoffMs(3, () => 0)).toBe(4_000);
    expect(backoffMs(20, () => 0)).toBe(ACTIVITY_BACKOFF_CAP_MS);
    expect(backoffMs(0, () => 1)).toBe(600);
    expect(backoffMs(20, () => 1)).toBe(ACTIVITY_BACKOFF_CAP_MS * 1.2);
  });

  it('gives up after eight attempts', () => {
    expect(MAX_ACTIVITY_ATTEMPTS).toBe(8);
  });
});

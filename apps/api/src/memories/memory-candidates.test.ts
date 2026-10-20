import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { memoryCandidates, type MemoryScope } from './memory-candidates.js';

const dialect = new PgDialect();
const viewer = '0a7c1d6e-2f13-4d8b-9f54-5c3e6d1b7a22';
const author = '7f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

const render = (scope: Omit<MemoryScope, 'viewerId'>) =>
  dialect.sqlToQuery(memoryCandidates({ viewerId: viewer, ...scope }));

describe('memoryCandidates', () => {
  it('keeps the Memories rule by default: Only Me outside Box Memories', () => {
    expect(render({ type: 'all' }).sql).toContain("lu.audience = 'only_me'");
    expect(render({ type: 'all', boxId: author }).sql).not.toContain('only_me');
    expect(render({ type: 'posts' }).sql).not.toContain('only_me');
  });

  it('never adds Only Me when told not to, even for the viewer as author', () => {
    for (const authorId of [undefined, viewer, author]) {
      const query = render({ type: 'all', authorId, includeOnlyMe: false });
      expect(query.sql).not.toContain('only_me');
      expect(query.sql).not.toContain('union all');
    }
  });

  it('never adds another author’s Only Me', () => {
    expect(render({ type: 'all', authorId: author }).sql).not.toContain(
      'only_me',
    );
  });

  it('restricts to one author and still starts from the viewer’s memberships', () => {
    const query = render({ type: 'all', authorId: author });
    expect(query.sql).toContain('p.author_user_id = $');
    expect(query.params).toContain(author);
    expect(query.sql).toMatch(/m\.user_id = \$\d+ and m\.status = 'active'/);
    expect(query.params).toContain(viewer);
    expect(query.sql).toContain('"user_blocks"');
  });

  it('adds the ready-photo filter only when asked', () => {
    expect(render({ type: 'all' }).sql).not.toContain('post_media');
    const photos = render({
      type: 'all',
      authorId: author,
      includeOnlyMe: false,
      withPhotos: true,
    }).sql;
    expect(photos).toContain('"post_media"');
    expect(photos).toContain('"life_update_media"');
    expect(photos).toContain("ma.status = 'ready'");
  });
});

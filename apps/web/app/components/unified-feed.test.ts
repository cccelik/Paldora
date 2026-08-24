import type { LifeUpdate, Post } from '@paldora/domain';
import { describe, expect, it } from 'vitest';
import { mergeFeedItems } from '../lib/feed-items';

describe('mergeFeedItems', () => {
  it('deduplicates Life Update content and sorts both item kinds together', () => {
    const post = {
      id: '00000000-0000-4000-8000-000000000001',
      createdAt: '2026-01-10T00:00:00.000Z',
    } as Post;
    const update = {
      id: '00000000-0000-4000-8000-000000000002',
      createdAt: '2026-01-11T00:00:00.000Z',
      contexts: [{ postId: 'delivery-a' }, { postId: 'delivery-b' }],
    } as LifeUpdate;
    const items = mergeFeedItems([post], [update]);
    expect(items.map(({ type }) => type)).toEqual(['life_update', 'standard']);
    expect(items.filter(({ type }) => type === 'life_update')).toHaveLength(1);
  });
});

import type { LifeUpdate, Post, UserId } from '@paldora/domain';
import { describe, expect, it } from 'vitest';
import type { LifeUpdateService } from '../src/life-update.service.js';
import type { PostService } from '../src/post.service.js';
import type {
  AuthorizedRoom,
  RoomAuthorizationPolicy,
} from '../src/room-authorization-policy.service.js';
import { RoomContentService } from '../src/room-content.service.js';
import { decodePostCursor } from '../src/post-cursor.js';

const viewer = '81000000-0000-4000-8000-000000000001' as UserId;
const author = '81000000-0000-4000-8000-000000000002' as UserId;

describe('Room content pagination', () => {
  it('merges post and Life Update timelines with a stable timestamp/UUID cursor', async () => {
    const post = samplePost('2026-08-24T10:00:00.000Z');
    const lifeUpdate = sampleLifeUpdate('2026-08-24T11:00:00.000Z');
    const service = roomContent([post], [lifeUpdate]);
    const page = await service.memories(viewer, 'alice', { limit: 1 });
    expect(page.items).toEqual([
      expect.objectContaining({
        type: 'life_update',
        occurredAt: lifeUpdate.createdAt,
      }),
    ]);
    expect(page.nextCursor).not.toBeNull();
    expect(decodePostCursor(page.nextCursor!).createdAt.toISOString()).toBe(
      lifeUpdate.createdAt,
    );
  });

  it('does not emit a continuation cursor when the merged page is exhausted', async () => {
    const service = roomContent([samplePost('2026-08-24T10:00:00.000Z')], []);
    await expect(
      service.memories(viewer, 'alice', { limit: 5 }),
    ).resolves.toMatchObject({ nextCursor: null });
  });
});

function roomContent(postItems: Post[], lifeItems: LifeUpdate[]) {
  const policy = {
    requireVisible: async () =>
      ({ room: { userId: author } }) as unknown as AuthorizedRoom,
  } as unknown as RoomAuthorizationPolicy;
  const posts = {
    listUser: async () => ({ items: postItems, nextCursor: null }),
  } as unknown as PostService;
  const lifeUpdates = {
    listUser: async () => ({ items: lifeItems, nextCursor: null }),
  } as unknown as LifeUpdateService;
  return new RoomContentService(policy, posts, lifeUpdates);
}

function samplePost(createdAt: string): Post {
  return {
    id: '82000000-0000-4000-8000-000000000001' as Post['id'],
    boxId: '83000000-0000-4000-8000-000000000001' as Post['boxId'],
    boxName: 'Shared Box',
    author: {
      userId: author,
      username: 'alice',
      displayName: 'Alice',
      avatarUrl: null,
    },
    content: 'A Room preview.',
    media: [],
    interactions: {
      commentCount: 0,
      reactions: [],
      currentUserReaction: null,
      realReactions: [],
    },
    status: 'active',
    editedAt: null,
    createdAt,
    updatedAt: createdAt,
  };
}

function sampleLifeUpdate(createdAt: string): LifeUpdate {
  return {
    id: '84000000-0000-4000-8000-000000000001' as LifeUpdate['id'],
    author: {
      userId: author,
      username: 'alice',
      displayName: 'Alice',
      avatarUrl: null,
    },
    sections: { lifeLately: 'A longer Room preview.' },
    media: [],
    contexts: [],
    createdAt,
    updatedAt: createdAt,
  };
}

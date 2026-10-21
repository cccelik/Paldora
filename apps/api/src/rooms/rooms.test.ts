import { DEFAULT_ROOM_WIDGETS } from '@paldora/domain';
import {
  updateRoomSchema,
  type LifeUpdateView,
  type MemoryItemView,
  type PostView,
} from '@paldora/validation';
import { describe, expect, it } from 'vitest';
import {
  relationshipFor,
  type AccessFacts,
} from './services/room-access.service.js';
import { isShareable, toRoomPhotos } from './records/room-content-views.js';
import { assertFresh, DEFAULT_ROOM_STATE } from './records/room-records.js';
import { settingsChanges } from './records/room-settings.js';
import { sameTopFriends } from './services/room-top-friends.service.js';
import { sameWidgets } from './services/room-widget.service.js';
import { mayViewTopFriends, toRoomView } from './records/room-views.js';

const none: AccessFacts = {
  isOwner: false,
  isFriend: false,
  sharesBox: false,
  blocked: false,
};

describe('relationshipFor', () => {
  it('always admits the owner, even hidden or with a block row', () => {
    for (const visibility of ['friends', 'members', 'hidden'] as const) {
      expect(
        relationshipFor(visibility, { ...none, isOwner: true, blocked: true }),
      ).toBe('owner');
    }
  });

  it('nests the tiers: hidden ⊂ friends ⊂ members', () => {
    const friend = { ...none, isFriend: true };
    const member = { ...none, sharesBox: true };
    expect(relationshipFor('hidden', friend)).toBeNull();
    expect(relationshipFor('friends', friend)).toBe('friend');
    expect(relationshipFor('members', friend)).toBe('friend');
    expect(relationshipFor('friends', member)).toBeNull();
    expect(relationshipFor('members', member)).toBe('member');
    expect(relationshipFor('members', none)).toBeNull();
  });

  it('denies on a block at every tier', () => {
    const blocked = { ...none, isFriend: true, sharesBox: true, blocked: true };
    for (const visibility of ['friends', 'members', 'hidden'] as const) {
      expect(relationshipFor(visibility, blocked)).toBeNull();
    }
  });
});

describe('assertFresh', () => {
  it('accepts only the exact version string', () => {
    expect(() => assertFresh(null, null)).not.toThrow();
    const version = '2026-10-20T10:00:00.123456Z';
    expect(() => assertFresh(version, version)).not.toThrow();
    for (const expected of [null, '2026-10-20T10:00:00.123Z']) {
      expect(() => assertFresh(version, expected)).toThrow(
        expect.objectContaining({ code: 'ROOM_UPDATE_STALE' }),
      );
    }
    expect(() => assertFresh(null, version)).toThrow(
      expect.objectContaining({ code: 'ROOM_UPDATE_STALE' }),
    );
  });
});

describe('settingsChanges', () => {
  const current = DEFAULT_ROOM_STATE.settings;
  const parse = (body: Record<string, unknown>) =>
    updateRoomSchema.parse({ expectedUpdatedAt: null, ...body });

  it('is empty when every sent field equals the stored one', () => {
    expect(
      settingsChanges(
        parse({ visibility: 'friends', accent: null, music: null }),
        current,
      ),
    ).toEqual({});
  });

  it('keeps only the differing fields', () => {
    expect(
      settingsChanges(
        parse({ visibility: 'friends', sparkles: true, location: 'Oslo' }),
        current,
      ),
    ).toEqual({ sparkles: true, location: 'Oslo' });
  });

  it('replaces the music card as a whole', () => {
    expect(
      settingsChanges(
        parse({ music: { url: 'https://example.com/song', title: 'Song' } }),
        current,
      ),
    ).toEqual({
      musicUrl: 'https://example.com/song',
      musicTitle: 'Song',
      musicArtist: null,
    });
  });
});

describe('sameWidgets and sameTopFriends', () => {
  it('compares widgets by type, placement, position and state', () => {
    expect(sameWidgets([], DEFAULT_ROOM_WIDGETS)).toBe(true);
    const disabled = DEFAULT_ROOM_WIDGETS.map((widget) =>
      widget.type === 'posts' ? { ...widget, enabled: false } : widget,
    );
    expect(sameWidgets([], disabled)).toBe(false);
  });

  it('compares Top Friends by order, size and audience', () => {
    const current = { ids: ['a', 'b'], state: DEFAULT_ROOM_STATE };
    const input = {
      userIds: ['a', 'b'],
      size: 8,
      visibility: 'friends',
    } as const;
    expect(sameTopFriends(current, input)).toBe(true);
    expect(sameTopFriends(current, { ...input, userIds: ['b', 'a'] })).toBe(
      false,
    );
    expect(sameTopFriends(current, { ...input, size: 4 })).toBe(false);
    expect(sameTopFriends(current, { ...input, visibility: 'visible' })).toBe(
      false,
    );
  });
});

describe('toRoomView', () => {
  const parts = (relationship: 'owner' | 'friend' | 'member') => ({
    relationship,
    owner: {
      id: '5b2d2c9f-6a1f-4b6a-8e3b-1a3c6d7e8f96',
      username: 'ada',
      displayName: 'Ada',
      bio: null,
      avatarUrl: null,
    },
    room: {
      settings: {
        ...DEFAULT_ROOM_STATE.settings,
        bannerMediaId: '7d2f4f3e-8a71-4c55-9b16-2f1f0c6d2a10',
      },
      version: '2026-10-20T10:00:00.123456Z',
    },
    widgets: DEFAULT_ROOM_WIDGETS.map((widget) =>
      widget.type === 'music' ? { ...widget, enabled: false } : widget,
    ),
    topFriends: [],
    bannerUrl: 'https://media.test/banner.webp',
  });

  it('strips every owner-only field for visitors', () => {
    const view = toRoomView(parts('friend'));
    expect(view.visibility).toBeNull();
    expect(view.updatedAt).toBeNull();
    expect(view.banner).toEqual({
      url: 'https://media.test/banner.webp',
      bannerMediaId: null,
    });
    expect(view.topFriends.size).toBeNull();
    expect(view.topFriends.visibility).toBeNull();
    expect(view.widgets.map((widget) => widget.type)).not.toContain('music');
  });

  it('gives the owner everything, in position order', () => {
    const view = toRoomView(parts('owner'));
    expect(view.visibility).toBe('friends');
    expect(view.updatedAt).toBe('2026-10-20T10:00:00.123456Z');
    expect(view.banner?.bannerMediaId).not.toBeNull();
    expect(view.widgets).toHaveLength(7);
    expect(view.widgets.map((widget) => widget.position)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
  });

  it('decides Top Friends visibility per relationship', () => {
    expect(mayViewTopFriends('hidden', 'owner')).toBe(true);
    expect(mayViewTopFriends('visible', 'member')).toBe(true);
    expect(mayViewTopFriends('friends', 'friend')).toBe(true);
    expect(mayViewTopFriends('friends', 'member')).toBe(false);
    expect(mayViewTopFriends('hidden', 'friend')).toBe(false);
  });
});

describe('room content views', () => {
  const photo = (id: string) => ({
    id,
    width: 4,
    height: 3,
    url: `https://media.test/${id}`,
    thumbnailUrl: `https://media.test/${id}/t`,
  });
  const postItem = (id: string, media: string[]): MemoryItemView => ({
    kind: 'post',
    occurredAt: '2026-10-20T10:00:00.000Z',
    post: { id, media: media.map(photo) } as unknown as PostView,
  });
  const lifeUpdateItem = (
    id: string,
    audience: 'boxes' | 'only_me',
    boxIds: string[],
    media: string[],
  ): MemoryItemView => ({
    kind: 'life_update',
    occurredAt: '2026-10-19T10:00:00.000Z',
    lifeUpdate: {
      id,
      audience,
      media: media.map(photo),
      contexts: boxIds.map((boxId) => ({ box: { id: boxId, name: boxId } })),
    } as unknown as LifeUpdateView,
  });

  it('expands items to their photos in order, linking a Life Update through the viewer’s first Box', () => {
    expect(
      toRoomPhotos([
        postItem('p1', ['a', 'b']),
        lifeUpdateItem('l1', 'boxes', ['box-a', 'box-b'], ['c']),
        postItem('p2', []),
      ]).map(({ photo: { id }, source }) => ({ id, source })),
    ).toEqual([
      { id: 'a', source: { kind: 'post', postId: 'p1' } },
      { id: 'b', source: { kind: 'post', postId: 'p1' } },
      {
        id: 'c',
        source: { kind: 'life_update', lifeUpdateId: 'l1', boxId: 'box-a' },
      },
    ]);
  });

  it('never shows an Only Me Life Update or one without a context of the viewer', () => {
    const onlyMe = lifeUpdateItem('l2', 'only_me', [], ['x']);
    expect(isShareable(onlyMe)).toBe(false);
    expect(isShareable(postItem('p1', []))).toBe(true);
    expect(
      toRoomPhotos([onlyMe, lifeUpdateItem('l3', 'boxes', [], ['y'])]),
    ).toEqual([]);
  });
});

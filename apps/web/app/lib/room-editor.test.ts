import { DEFAULT_ROOM_WIDGETS, ROOM_WIDGET_TYPES } from '@paldora/domain';
import { describe, expect, it } from 'vitest';
import {
  friendsToAdd,
  moveItem,
  moveLabel,
  movedAnnouncement,
  topFriendsProblem,
  versionField,
  widgetDrafts,
  widgetSettings,
} from './room-editor';

const person = (id: string) => ({
  id,
  username: id,
  displayName: id.toUpperCase(),
  avatarUrl: null,
});

describe('moveItem', () => {
  it('moves an item one place up or down', () => {
    expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
  });

  it('refuses to move past either end or a missing index', () => {
    expect(moveItem(['a', 'b'], 0, -1)).toBeNull();
    expect(moveItem(['a', 'b'], 1, 1)).toBeNull();
    expect(moveItem(['a'], 3, -1)).toBeNull();
  });

  it('never changes the list it was given', () => {
    const list = ['a', 'b'];
    moveItem(list, 0, 1);
    expect(list).toEqual(['a', 'b']);
  });
});

describe('move words', () => {
  it('names the item and its place, one-based', () => {
    expect(moveLabel('Photos', 'up', 3, 7)).toBe(
      'Move Photos up, position 4 of 7',
    );
    expect(movedAnnouncement('Photos', 2, 7)).toBe(
      'Photos moved to position 3 of 7.',
    );
  });
});

describe('widget drafts', () => {
  it('lists the saved widgets in global order and writes positions back', () => {
    const shuffled = [...DEFAULT_ROOM_WIDGETS].reverse();
    const drafts = widgetDrafts(shuffled);
    expect(drafts.map((draft) => draft.type)).toEqual(
      DEFAULT_ROOM_WIDGETS.map((widget) => widget.type),
    );
    expect(widgetSettings(drafts)).toEqual(DEFAULT_ROOM_WIDGETS);
  });

  it('adds any type a response left out, so a save still lists all seven', () => {
    const drafts = widgetDrafts(
      DEFAULT_ROOM_WIDGETS.filter((widget) => widget.type !== 'music'),
    );
    expect(drafts).toHaveLength(ROOM_WIDGET_TYPES.length);
    expect(drafts.at(-1)).toEqual({
      type: 'music',
      placement: 'main',
      enabled: true,
    });
    expect(widgetSettings(drafts).map((widget) => widget.position)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
  });
});

describe('Top Friends drafts', () => {
  it('offers only friends who are not chosen yet, in list order', () => {
    const friends = [person('a'), person('b'), person('c')];
    expect(friendsToAdd(friends, [person('b')]).map((f) => f.id)).toEqual([
      'a',
      'c',
    ]);
  });

  it('explains a list longer than the chosen size', () => {
    expect(topFriendsProblem(4, 4)).toBeNull();
    expect(topFriendsProblem(5, 4)).toBe(
      'Remove 1 friend or choose a bigger size.',
    );
    expect(topFriendsProblem(9, 4)).toBe(
      'Remove 5 friends or choose a bigger size.',
    );
  });
});

describe('versionField', () => {
  it('is empty for a never-saved Room and the exact version otherwise', () => {
    expect(versionField(null)).toBe('');
    expect(versionField('2026-10-20T10:00:00.123456Z')).toBe(
      '2026-10-20T10:00:00.123456Z',
    );
  });
});

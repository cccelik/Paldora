import { describe, expect, it } from 'vitest';
import {
  INDEX_ACTOR_CAP,
  applyComment,
  applyReaction,
  diffInteractionIndex,
  emptyInteractionIndex,
  parseInteractionIndex,
  planIndexWrite,
  recomputeInteractionIndex,
  type InteractionIndex,
} from './native-interaction-index.js';

function full(map: 'comments' | 'reactions'): InteractionIndex {
  const index = emptyInteractionIndex();
  for (let i = 0; i < INDEX_ACTOR_CAP; i += 1)
    if (map === 'comments') index.comments[`u${i}`] = 1;
    else index.reactions[`u${i}`] = { kind: '👍' };
  return index;
}

describe('interaction index helpers', () => {
  it('parses absent, trusted, overflow, foreign and corrupt values', () => {
    expect(parseInteractionIndex(undefined).state).toBe('absent');
    expect(parseInteractionIndex(emptyInteractionIndex()).state).toBe(
      'trusted',
    );
    expect(parseInteractionIndex({ v: 1, overflow: true }).state).toBe(
      'overflow',
    );
    expect(
      parseInteractionIndex({ v: 2, comments: {}, reactions: {} }).state,
    ).toBe('foreign');
    expect(parseInteractionIndex({ v: 1, comments: {} }).state).toBe('corrupt');
    expect(
      parseInteractionIndex({ v: 1, comments: { a: 0 }, reactions: {} }).state,
    ).toBe('corrupt');
  });

  it('increments, decrements and removes comment keys without mutating', () => {
    const base = emptyInteractionIndex();
    const one = applyComment(base, 'a', 1) as InteractionIndex;
    const two = applyComment(one, 'a', 1) as InteractionIndex;
    expect(base.comments).toEqual({});
    expect(two.comments).toEqual({ a: 2 });
    const back = applyComment(
      applyComment(two, 'a', -1) as InteractionIndex,
      'a',
      -1,
    ) as InteractionIndex;
    expect(back.comments).toEqual({});
  });

  it('sets, switches and clears a reaction', () => {
    const set = applyReaction(emptyInteractionIndex(), 'a', {
      kind: '👍',
    }) as InteractionIndex;
    const real = applyReaction(set, 'a', {
      kind: 'real',
      mediaAssetId: 'm1',
    }) as InteractionIndex;
    expect(real.reactions).toEqual({ a: { kind: 'real', mediaAssetId: 'm1' } });
    expect(
      (applyReaction(real, 'a', null) as InteractionIndex).reactions,
    ).toEqual({});
  });

  it('overflows exactly at actor 1001 in either map', () => {
    expect(applyComment(full('comments'), 'u0', 1)).toMatchObject({ v: 1 });
    expect('overflow' in applyComment(full('comments'), 'u0', 1)).toBe(false);
    expect(applyComment(full('comments'), 'new', 1)).toEqual({
      v: 1,
      overflow: true,
    });
    expect(applyReaction(full('reactions'), 'new', { kind: '🎉' })).toEqual({
      v: 1,
      overflow: true,
    });
    expect(
      'overflow' in applyReaction(full('reactions'), 'u5', { kind: '🎉' }),
    ).toBe(false);
  });

  it('plans: unknown version deletes, absent/overflow/corrupt skip', () => {
    const change = { type: 'comment', uid: 'a', delta: 1 } as const;
    expect(planIndexWrite({ v: 9 }, change).kind).toBe('replace');
    expect(planIndexWrite(undefined, change).kind).toBe('none');
    expect(planIndexWrite({ v: 1, overflow: true }, change).kind).toBe('none');
    expect(planIndexWrite({ v: 1 }, change).kind).toBe('none');
    expect(planIndexWrite(emptyInteractionIndex(), change)).toMatchObject({
      kind: 'entry',
      map: 'comments',
      uid: 'a',
      value: 1,
    });
    expect(planIndexWrite(full('comments'), { ...change, uid: 'x' })).toEqual({
      kind: 'replace',
      value: { v: 1, overflow: true },
    });
  });

  it('recomputes from canonical rows, ignoring deleted and hidden comments', () => {
    const result = recomputeInteractionIndex(
      [
        { authorUid: 'a', status: 'active', moderationHidden: false },
        { authorUid: 'a', status: 'active', moderationHidden: false },
        { authorUid: 'b', status: 'deleted', moderationHidden: false },
        { authorUid: 'c', status: 'active', moderationHidden: true },
      ],
      [
        { uid: 'a', kind: 'real', mediaAssetId: 'm' },
        { uid: 'b', kind: '👍' },
      ],
    );
    expect(result).toEqual({
      v: 1,
      comments: { a: 2 },
      reactions: { a: { kind: 'real', mediaAssetId: 'm' }, b: { kind: '👍' } },
    });
    const many = Array.from({ length: INDEX_ACTOR_CAP + 1 }, (_, i) => ({
      authorUid: `u${i}`,
      status: 'active',
      moderationHidden: false,
    }));
    expect(recomputeInteractionIndex(many, [])).toEqual({
      v: 1,
      overflow: true,
    });
  });

  it('diffs missing and extra actors', () => {
    const stored = parseInteractionIndex({
      v: 1,
      comments: { ghost: 1 },
      reactions: {},
    });
    const check = diffInteractionIndex(stored, {
      v: 1,
      comments: { a: 1 },
      reactions: {},
    });
    expect(check.ok).toBe(false);
    expect(check.missing).toEqual(['a']);
    expect(check.extra).toEqual(['ghost']);
  });
});

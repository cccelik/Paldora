import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  compactMemoryCursor,
  expandMemoryCursor,
  NativeMemoryError,
  type NativeMemoryFilter,
  type NativeMemoryScope,
} from './native-memories.js';

const encode = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');
const home = (at: number, id: string) => encode({ at, id });
const longCursor = (
  scope: NativeMemoryScope,
  filter: NativeMemoryFilter,
  states: Record<string, { position: string | null; done: boolean }>,
) =>
  encode({
    version: 2,
    filter: JSON.stringify([
      scope,
      filter.year ?? null,
      filter.month ?? null,
      filter.type ?? 'all',
    ]),
    states,
  });

describe('compact Memory cursors', () => {
  const personal: NativeMemoryScope = { kind: 'personal' };

  it('round-trips every scope under 128 characters', () => {
    const cases: [
      NativeMemoryScope,
      NativeMemoryFilter,
      Record<string, never> | object,
    ][] = [
      [
        personal,
        {},
        {
          home: {
            position: home(1_790_000_000_000, `l_${randomUUID()}`),
            done: false,
          },
          onlyMe: { position: randomUUID(), done: false },
        },
      ],
      [
        personal,
        { year: 2026, month: 3, type: 'posts' },
        { home: { position: home(0, `p_${randomUUID()}`), done: true } },
      ],
      [
        { kind: 'box', boxId: randomUUID() },
        { year: 2026 },
        { box: { position: null, done: true } },
      ],
      [
        {
          kind: 'room',
          username: 'a_very_long_username_that_is_still_valid_1',
        },
        { type: 'life_updates' },
        { home: { position: home(5, `p_${randomUUID()}`), done: false } },
      ],
    ];
    for (const [scope, filter, states] of cases) {
      const long = longCursor(scope, filter, states as never);
      const compact = compactMemoryCursor(long, scope, filter);
      expect(compact.length).toBeLessThanOrEqual(128);
      expect(compact.length).toBeLessThan(long.length);
      expect(expandMemoryCursor(compact, scope, filter)).toBe(
        encode(JSON.parse(Buffer.from(long, 'base64url').toString())),
      );
    }
  });

  it('refuses a cursor for another scope or filter, and malformed input', () => {
    const states = {
      home: { position: home(7, `p_${randomUUID()}`), done: false },
      onlyMe: { position: null, done: true },
    };
    const compact = compactMemoryCursor(
      longCursor(personal, {}, states),
      personal,
      {},
    );
    for (const [scope, filter] of [
      [personal, { year: 2026 }],
      [{ kind: 'room', username: 'x' }, {}],
    ] as [NativeMemoryScope, NativeMemoryFilter][])
      expect(() => expandMemoryCursor(compact, scope, filter)).toThrow(
        NativeMemoryError,
      );
    for (const bad of ['', '!!', 'AA', `${compact}AA`, compact.slice(0, -4)])
      expect(() => expandMemoryCursor(bad, personal, {})).toThrow(
        NativeMemoryError,
      );
  });
});

import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor, pageOf } from './pagination.js';

const position = {
  at: '2026-10-19T12:00:00.123456Z',
  id: '7d2f4f3e-8a71-4c55-9b16-2f1f0c6d2a10',
};

describe('cursors', () => {
  it('round-trip with microsecond precision', () => {
    expect(decodeCursor(encodeCursor(position))).toEqual(position);
  });

  it('are absent when not supplied', () => {
    expect(decodeCursor(undefined)).toBeUndefined();
  });

  it.each([
    ['not base64 json', '%%%'],
    ['wrong shape', Buffer.from('{"a":1}').toString('base64url')],
    [
      'a millisecond timestamp',
      Buffer.from(
        JSON.stringify({ a: '2026-10-19T12:00:00.123Z', i: position.id }),
      ).toString('base64url'),
    ],
    [
      'an injected id',
      Buffer.from(
        JSON.stringify({ a: position.at, i: "x'; drop table users; --" }),
      ).toString('base64url'),
    ],
  ])('reject %s', (_name, raw) => {
    expect(() => decodeCursor(raw)).toThrow(/page reference/);
  });
});

describe('pageOf', () => {
  const rows = [1, 2, 3].map((n) => ({
    n,
    at: `2026-10-19T12:00:0${n}.000000Z`,
    id: position.id,
  }));
  const at = (row: (typeof rows)[number]) => ({ at: row.at, id: row.id });

  it('returns a cursor to the last visible row when more remain', () => {
    const page = pageOf(rows, 2, at, (row) => row.n);
    expect(page.items).toEqual([1, 2]);
    expect(decodeCursor(page.nextCursor ?? undefined)?.at).toBe(rows[1]?.at);
  });

  it('has no cursor on the final page', () => {
    const page = pageOf(rows, 3, at, (row) => row.n);
    expect(page.items).toEqual([1, 2, 3]);
    expect(page.nextCursor).toBeNull();
  });
});

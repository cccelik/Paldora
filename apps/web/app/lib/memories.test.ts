import type { MemoryItemView } from '@paldora/validation';
import { describe, expect, it } from 'vitest';
import {
  groupByMonth,
  memoryHref,
  monthName,
  parseMemoryType,
  parseMonth,
  parseYear,
} from './memories';

const BOX = '7d2f4f3e-8a71-4c55-9b16-2f1f0c6d2a10';

describe('Memories URL parsing', () => {
  it('accepts only four-digit years in the API range', () => {
    expect(parseYear('2026')).toBe(2026);
    expect(parseYear('1970')).toBe(1970);
    for (const bad of ['1969', '026', '20260', '2026.0', ' 2026', 'abc']) {
      expect(parseYear(bad), bad).toBeNull();
    }
    expect(parseYear(undefined)).toBeNull();
    expect(parseYear(['2026'])).toBeNull();
  });

  it('accepts months 1–12 with one spelling each', () => {
    expect(parseMonth('1')).toBe(1);
    expect(parseMonth('12')).toBe(12);
    for (const bad of ['0', '13', '01', '-1', '1.5', '']) {
      expect(parseMonth(bad), bad).toBeNull();
    }
  });

  it('defaults the type filter and rejects unknown ones', () => {
    expect(parseMemoryType(undefined)).toBe('all');
    expect(parseMemoryType('life_updates')).toBe('life_updates');
    expect(parseMemoryType('photos')).toBeNull();
  });
});

describe('memoryHref', () => {
  it('builds personal paths and leaves the default filter out', () => {
    expect(memoryHref({ kind: 'personal' }, {})).toBe('/memories');
    expect(memoryHref({ kind: 'personal' }, { year: 2026 })).toBe(
      '/memories/2026',
    );
    expect(
      memoryHref(
        { kind: 'personal' },
        { year: 2026, month: 3, type: 'posts', cursor: 'abc' },
      ),
    ).toBe('/memories/2026/3?type=posts&cursor=abc');
  });

  it('builds Box queries', () => {
    const scope = { kind: 'box', boxId: BOX } as const;
    expect(memoryHref(scope, {})).toBe(`/boxes/${BOX}/memories`);
    expect(memoryHref(scope, { year: 2025, month: 12, type: 'all' })).toBe(
      `/boxes/${BOX}/memories?year=2025&month=12`,
    );
  });

  it('builds Room queries with the username encoded', () => {
    const scope = { kind: 'room', username: 'çelik' } as const;
    expect(memoryHref(scope, {})).toBe('/rooms/%C3%A7elik/memories');
    expect(
      memoryHref(scope, { year: 2025, month: 2, type: 'life_updates' }),
    ).toBe('/rooms/%C3%A7elik/memories?year=2025&month=2&type=life_updates');
  });
});

describe('UTC months', () => {
  const item = (occurredAt: string, id: string): MemoryItemView =>
    ({ kind: 'post', occurredAt, post: { id } }) as unknown as MemoryItemView;

  it('names months in UTC', () => {
    expect(monthName(1)).toBe('January');
    expect(monthName(12)).toBe('December');
  });

  it('groups consecutive items by their UTC month, across a year boundary', () => {
    const groups = groupByMonth([
      item('2026-01-01T00:00:00.000Z', 'a'),
      item('2025-12-31T23:59:59.999Z', 'b'),
      item('2025-12-01T00:00:00.000Z', 'c'),
    ]);
    expect(
      groups.map((group) => [group.year, group.month, group.items.length]),
    ).toEqual([
      [2026, 1, 1],
      [2025, 12, 2],
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  memoryQuerySchema,
  memorySummaryQuerySchema,
  memorySummarySchema,
} from './memories.js';

const parse = (query: Record<string, string>) =>
  memoryQuerySchema.safeParse(query);

describe('memoryQuerySchema', () => {
  it('coerces query strings and defaults type and limit', () => {
    const result = parse({ year: '2026', month: '12' });
    expect(result.success && result.data).toEqual({
      year: 2026,
      month: 12,
      type: 'all',
      limit: 20,
    });
  });

  it('accepts the year and month bounds', () => {
    for (const query of [
      { year: '1970', month: '1' },
      { year: '9999', month: '12' },
      { year: '2026' },
    ]) {
      expect(parse(query).success).toBe(true);
    }
  });

  it('rejects out-of-range or malformed years and months', () => {
    for (const query of [
      {},
      { year: '1969' },
      { year: '10000' },
      { year: '2026.5' },
      { year: 'abc' },
      { year: '2026', month: '0' },
      { year: '2026', month: '13' },
      { year: '2026', month: 'x' },
    ]) {
      expect(parse(query).success, JSON.stringify(query)).toBe(false);
    }
  });

  it('accepts only the three types', () => {
    for (const type of ['all', 'posts', 'life_updates']) {
      expect(parse({ year: '2026', type }).success).toBe(true);
    }
    expect(parse({ year: '2026', type: 'comments' }).success).toBe(false);
  });

  it('bounds the page size and the cursor', () => {
    expect(parse({ year: '2026', limit: '51' }).success).toBe(false);
    expect(parse({ year: '2026', cursor: '' }).success).toBe(false);
  });
});

describe('memorySummaryQuerySchema', () => {
  it('makes the year optional', () => {
    expect(memorySummaryQuerySchema.parse({})).toEqual({});
    expect(memorySummaryQuerySchema.parse({ year: '2025' })).toEqual({
      year: 2025,
    });
    expect(memorySummaryQuerySchema.safeParse({ year: '1' }).success).toBe(
      false,
    );
  });
});

describe('memorySummarySchema', () => {
  it('rejects zero counts and a thirteenth month', () => {
    expect(
      memorySummarySchema.safeParse({
        years: [{ year: 2026, count: 0 }],
        year: 2026,
        months: [],
      }).success,
    ).toBe(false);
    expect(
      memorySummarySchema.safeParse({
        years: [],
        year: null,
        months: [{ month: 13, count: 1 }],
      }).success,
    ).toBe(false);
  });
});

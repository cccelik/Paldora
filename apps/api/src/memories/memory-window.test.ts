import { describe, expect, it } from 'vitest';
import { summarize } from './memory-summary.service.js';
import { memoryWindow } from './memory-window.js';

describe('memoryWindow', () => {
  it('ends December at the next January, exclusive', () => {
    expect(memoryWindow(2026, 12)).toEqual({
      start: { year: 2026, month: 12 },
      end: { year: 2027, month: 1 },
    });
  });

  it('covers a whole year when no month is given', () => {
    expect(memoryWindow(2026)).toEqual({
      start: { year: 2026, month: 1 },
      end: { year: 2027, month: 1 },
    });
  });

  it('ends February (leap year or not) at March 1', () => {
    expect(memoryWindow(2028, 2).end).toEqual({ year: 2028, month: 3 });
    expect(memoryWindow(2027, 2).end).toEqual({ year: 2027, month: 3 });
  });

  it('handles the last supported year', () => {
    expect(memoryWindow(9999, 12).end).toEqual({ year: 10000, month: 1 });
  });
});

describe('summarize', () => {
  const counts = [
    { year: 2025, month: 3, count: 2 },
    { year: 2026, month: 1, count: 1 },
    { year: 2026, month: 11, count: 4 },
    { year: 2025, month: 12, count: 5 },
  ];

  it('lists years newest first and defaults to the newest year', () => {
    expect(summarize(counts, undefined)).toEqual({
      years: [
        { year: 2026, count: 5 },
        { year: 2025, count: 7 },
      ],
      year: 2026,
      months: [
        { month: 11, count: 4 },
        { month: 1, count: 1 },
      ],
    });
  });

  it('gives the requested year’s months, even an empty year', () => {
    expect(summarize(counts, 2025).months).toEqual([
      { month: 12, count: 5 },
      { month: 3, count: 2 },
    ]);
    expect(summarize(counts, 2001)).toMatchObject({ year: 2001, months: [] });
  });

  it('is empty, with no year, when there is nothing', () => {
    expect(summarize([], undefined)).toEqual({
      years: [],
      year: null,
      months: [],
    });
  });
});

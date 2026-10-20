import { sql, type SQL } from 'drizzle-orm';

/** A calendar month, 1-based. */
export interface CalendarMonth {
  readonly year: number;
  readonly month: number;
}

/** The half-open UTC range `[start, end)` that a Memories page covers. */
export interface MemoryWindow {
  readonly start: CalendarMonth;
  readonly end: CalendarMonth;
}

/**
 * One UTC month, or the whole UTC year when `month` is absent. The end is
 * the first instant of the next month (or year), exclusive, so
 * 23:59:59.999999 on Dec 31 belongs to December and 00:00:00 on Jan 1 to
 * the next year. Bounds are computed here, never with `+ interval`, which
 * PostgreSQL evaluates in the session time zone.
 */
export function memoryWindow(year: number, month?: number): MemoryWindow {
  if (month === undefined) {
    return { start: { year, month: 1 }, end: { year: year + 1, month: 1 } };
  }
  return {
    start: { year, month },
    end:
      month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 },
  };
}

const utcMonthStart = ({ year, month }: CalendarMonth): SQL =>
  sql`make_timestamptz(${year}::int, ${month}::int, 1, 0, 0, 0, 'UTC')`;

/** `WHERE` fragment: the timestamp falls inside the window, in UTC. */
export function withinWindow(timestamp: SQL, window: MemoryWindow): SQL {
  return sql`(${timestamp} >= ${utcMonthStart(window.start)} and ${timestamp} < ${utcMonthStart(window.end)})`;
}

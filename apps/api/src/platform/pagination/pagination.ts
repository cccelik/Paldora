import { HttpStatus } from '@nestjs/common';
import { asc, desc, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import { defineError } from '../http/api-error.js';

/**
 * Keyset position: the sort timestamp at full microsecond precision and the
 * row ID. Millisecond JavaScript dates would skip or repeat rows that share a
 * millisecond, so timestamps travel as text produced by PostgreSQL.
 */
export interface CursorPosition {
  readonly at: string;
  readonly id: string;
}

const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Select this beside a row to get its exact cursor timestamp. */
export const cursorTimestamp = (column: AnyColumn | SQL) =>
  sql<string>`to_char(${column} at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

export const encodeCursor = (position: CursorPosition): string =>
  Buffer.from(JSON.stringify({ a: position.at, i: position.id })).toString(
    'base64url',
  );

const invalidCursor = defineError(
  HttpStatus.BAD_REQUEST,
  'VALIDATION_FAILED',
  'cursor: This page reference is not valid.',
);

/** Cursors are opaque to clients; anything malformed is a validation error. */
export function decodeCursor(
  raw: string | undefined,
): CursorPosition | undefined {
  if (raw === undefined) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString()) as {
      a?: unknown;
      i?: unknown;
    };
    if (
      typeof parsed.a === 'string' &&
      typeof parsed.i === 'string' &&
      timestampPattern.test(parsed.a) &&
      uuidPattern.test(parsed.i)
    ) {
      return { at: parsed.a, id: parsed.i };
    }
  } catch {
    // Falls through to the error below.
  }
  throw invalidCursor();
}

/** `WHERE` condition for rows strictly after the cursor in sort order. */
export function afterCursor(
  timestamp: AnyColumn | SQL,
  id: AnyColumn | SQL,
  cursor: CursorPosition | undefined,
  direction: 'asc' | 'desc',
): SQL | undefined {
  if (!cursor) return undefined;
  const comparison = direction === 'asc' ? sql`>` : sql`<`;
  return sql`(${timestamp}, ${id}) ${comparison} (${cursor.at}::timestamptz, ${cursor.id}::uuid)`;
}

/** A cursor and a page size, as `cursorPageQuerySchema` parses them. */
export interface PageQuery {
  readonly cursor?: string | undefined;
  readonly limit: number;
}

/**
 * The keyset half of a page query, from one column pair and one direction:
 * `after` goes in the `WHERE`, `orderBy` is spread into `.orderBy(…)`. Both
 * come from the same arguments, so condition and order cannot disagree.
 */
export function keysetWindow(
  timestamp: AnyColumn,
  id: AnyColumn,
  cursor: CursorPosition | undefined,
  direction: 'asc' | 'desc',
): { readonly after: SQL | undefined; readonly orderBy: readonly [SQL, SQL] } {
  const order = direction === 'asc' ? asc : desc;
  return {
    after: afterCursor(timestamp, id, cursor, direction),
    orderBy: [order(timestamp), order(id)],
  };
}

export interface Page<Item> {
  items: Item[];
  nextCursor: string | null;
}

/**
 * Turns `limit + 1` fetched rows into a page. The extra row only proves that
 * another page exists; the cursor points at the last row actually returned.
 */
export function pageOf<Row, Item>(
  rows: readonly Row[],
  limit: number,
  position: (row: Row) => CursorPosition,
  map: (row: Row) => Item,
): Page<Item> {
  const visible = rows.slice(0, limit);
  const last = visible.at(-1);
  return {
    items: visible.map(map),
    nextCursor:
      rows.length > limit && last ? encodeCursor(position(last)) : null,
  };
}

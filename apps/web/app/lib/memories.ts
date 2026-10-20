import {
  MEMORY_MAX_YEAR,
  MEMORY_MIN_YEAR,
  MEMORY_TYPES,
  type MemoryItemView,
  type MemoryType,
} from '@paldora/validation';

/**
 * Pure helpers for the Memories pages: URL parsing, links, and UTC month
 * grouping. Which items exist is the API's decision; nothing here filters.
 */

/** Personal Memories, or one Box's. */
export type MemoryScope =
  | { readonly kind: 'personal' }
  | { readonly kind: 'box'; readonly boxId: string };

export interface MemoryPlace {
  readonly year?: number | undefined;
  readonly month?: number | undefined;
  readonly type?: MemoryType | undefined;
  readonly cursor?: string | undefined;
}

type Param = string | string[] | undefined;

/** A four-digit year in the API's range, or null. */
export function parseYear(value: Param): number | null {
  if (typeof value !== 'string' || !/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  return year >= MEMORY_MIN_YEAR && year <= MEMORY_MAX_YEAR ? year : null;
}

/** A month 1–12 written without a leading zero (one URL per month), or null. */
export function parseMonth(value: Param): number | null {
  if (typeof value !== 'string' || !/^(?:[1-9]|1[0-2])$/.test(value)) {
    return null;
  }
  return Number(value);
}

/** `all` when absent; null for anything that is not a known filter. */
export function parseMemoryType(value: Param): MemoryType | null {
  if (value === undefined) return 'all';
  return MEMORY_TYPES.find((type) => type === value) ?? null;
}

function queryOf(entries: ReadonlyArray<readonly [string, string | number]>) {
  const query = new URLSearchParams(
    entries.map(([key, value]) => [key, String(value)]),
  ).toString();
  return query ? `?${query}` : '';
}

/** The address of one Memories view; the default filter is left out. */
export function memoryHref(scope: MemoryScope, place: MemoryPlace): string {
  const { year, month, type = 'all', cursor } = place;
  const filters: Array<readonly [string, string | number]> = [];
  if (type !== 'all') filters.push(['type', type]);
  if (cursor) filters.push(['cursor', cursor]);
  if (scope.kind === 'personal') {
    const path = ['/memories', year, year ? month : undefined]
      .filter((part) => part !== undefined)
      .join('/');
    return `${path}${queryOf(filters)}`;
  }
  const where: Array<readonly [string, string | number]> = [];
  if (year) where.push(['year', year]);
  if (year && month) where.push(['month', month]);
  return `/boxes/${scope.boxId}/memories${queryOf([...where, ...filters])}`;
}

const monthFormat = new Intl.DateTimeFormat('en', {
  month: 'long',
  timeZone: 'UTC',
});

/** "March" for 3. Memories months are UTC months. */
export function monthName(month: number): string {
  return monthFormat.format(new Date(Date.UTC(2000, month - 1, 1)));
}

export interface MemoryMonthGroup {
  readonly key: string;
  readonly year: number;
  readonly month: number;
  readonly items: readonly MemoryItemView[];
}

/** Consecutive items of one UTC month, in the order the API returned them. */
export function groupByMonth(
  items: readonly MemoryItemView[],
): MemoryMonthGroup[] {
  const groups: Array<MemoryMonthGroup & { items: MemoryItemView[] }> = [];
  for (const item of items) {
    const at = new Date(item.occurredAt);
    const year = at.getUTCFullYear();
    const month = at.getUTCMonth() + 1;
    const key = `${year}-${month}`;
    const last = groups.at(-1);
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, year, month, items: [item] });
  }
  return groups;
}

export function memoryItemKey(item: MemoryItemView): string {
  return item.kind === 'post' ? item.post.id : item.lifeUpdate.id;
}

export const memoryTypeLabels: Readonly<Record<MemoryType, string>> = {
  all: 'Everything',
  posts: 'Posts',
  life_updates: 'Life Updates',
};

export function countLabel(count: number): string {
  return `${count.toLocaleString('en')} ${count === 1 ? 'memory' : 'memories'}`;
}

/** The honest note every Memories page carries about UTC months. */
export const memoriesDescription =
  'Everything you can still see, by the month it was shared. Months follow UTC, so something shared near midnight can sit in the neighbouring month on your clock.';

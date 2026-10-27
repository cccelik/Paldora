/* eslint-disable no-await-in-loop, complexity -- Derived pages walk bounded Firestore batches and reauthorize each canonical item. */
import { createHash } from 'node:crypto';
import { type Firestore } from 'firebase-admin/firestore';
import {
  NativeBoxPosts,
  NativePostError,
  type NativePost,
} from './native-box-posts.js';
import { NativeHomeFeed, NativeHomeFeedError } from './native-home-feed.js';
import {
  NativeLifeUpdates,
  NativeLifeUpdateError,
  type NativeLifeUpdate,
} from './native-life-updates.js';
import { NativeRooms, NativeRoomError } from './native-rooms.js';

export class NativeMemoryError extends Error {
  public constructor(public readonly code: 'UNAVAILABLE' | 'INVALID') {
    super(code);
  }
}

export type NativeMemoryItem =
  | { kind: 'post'; id: string; occurredAt: number; post: NativePost }
  | {
      kind: 'life_update';
      id: string;
      occurredAt: number;
      update: NativeLifeUpdate;
      sourcePostId?: string;
    };

export type NativeMemoryScope =
  | { kind: 'personal' }
  | { kind: 'box'; boxId: string }
  | { kind: 'room'; username: string };

export interface NativeMemoryFilter {
  year?: number | undefined;
  month?: number | undefined;
  type?: 'all' | 'posts' | 'life_updates' | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}

function key(item: NativeMemoryItem): string {
  return `${item.kind === 'post' ? 'p' : 'l'}_${item.id}`;
}

function compare(a: NativeMemoryItem, b: NativeMemoryItem): number {
  return b.occurredAt - a.occurredAt || key(b).localeCompare(key(a));
}

async function* mergeByTime(
  first: AsyncGenerator<NativeMemoryItem>,
  second: AsyncGenerator<NativeMemoryItem>,
): AsyncGenerator<NativeMemoryItem> {
  let [left, right] = await Promise.all([first.next(), second.next()]);
  try {
    while (!left.done || !right.done) {
      if (right.done || (!left.done && compare(left.value, right.value) <= 0)) {
        yield left.value;
        left = await first.next();
      } else {
        yield right.value;
        right = await second.next();
      }
    }
  } finally {
    await Promise.all([first.return(undefined), second.return(undefined)]);
  }
}

function filterKey(
  scope: NativeMemoryScope,
  filter: NativeMemoryFilter,
): string {
  return JSON.stringify([
    scope,
    filter.year ?? null,
    filter.month ?? null,
    filter.type ?? 'all',
  ]);
}

type MemorySource = 'box' | 'home' | 'onlyMe';
type SourceState = { position: string | null; done: boolean };
type MemoryCursor = {
  version: 2;
  filter: string;
  states: Record<MemorySource, SourceState>;
};
type MemoryCandidate = {
  source: MemorySource;
  at: number;
  id: string;
  position: string;
  item: NativeMemoryItem | null;
};
type MemoryWindow = {
  candidates: MemoryCandidate[];
  nextCursor: string | null;
};

/** Extra window reads per source per page when authorization rejects candidates. */
const MAX_WINDOW_REFILLS = 2;

function sources(
  scope: NativeMemoryScope,
  filter: NativeMemoryFilter,
): MemorySource[] {
  return scope.kind === 'box'
    ? ['box']
    : scope.kind === 'room' || filter.type === 'posts'
      ? ['home']
      : ['home', 'onlyMe'];
}

function encodeHomePosition(at: number, id: string): string {
  return Buffer.from(JSON.stringify({ at, id })).toString('base64url');
}

function parsePageCursor(
  cursor: string | undefined,
  scope: NativeMemoryScope,
  filter: NativeMemoryFilter,
): MemoryCursor {
  const expected = sources(scope, filter);
  const empty = Object.fromEntries(
    expected.map((source) => [source, { position: null, done: false }]),
  ) as MemoryCursor['states'];
  if (!cursor)
    return { version: 2, filter: filterKey(scope, filter), states: empty };
  try {
    if (cursor.length > 2048) throw new Error('invalid');
    const value: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString(),
    );
    if (
      !value ||
      typeof value !== 'object' ||
      (value as MemoryCursor).version !== 2 ||
      (value as MemoryCursor).filter !== filterKey(scope, filter) ||
      typeof (value as MemoryCursor).states !== 'object'
    )
      throw new Error('invalid');
    const parsed = value as MemoryCursor;
    if (Object.keys(parsed.states).length !== expected.length)
      throw new Error('invalid');
    for (const source of expected) {
      const state = parsed.states[source];
      if (
        !state ||
        typeof state.done !== 'boolean' ||
        !(
          state.position === null ||
          (typeof state.position === 'string' &&
            state.position.length <= 512 &&
            (source === 'home' || /^[0-9a-f-]{36}$/.test(state.position)))
        )
      )
        throw new Error('invalid');
    }
    return parsed;
  } catch {
    throw new NativeMemoryError('INVALID');
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const COMPACT_MEMORY_CURSOR_VERSION = 1;

function filterDigest(
  scope: NativeMemoryScope,
  filter: NativeMemoryFilter,
): Buffer {
  return createHash('sha256')
    .update(filterKey(scope, filter))
    .digest()
    .subarray(0, 4);
}

function uuidBytes(value: string): Buffer {
  if (!UUID_PATTERN.test(value)) throw new NativeMemoryError('INVALID');
  return Buffer.from(value.replaceAll('-', ''), 'hex');
}

function uuidText(bytes: Buffer): string {
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function packPosition(source: MemorySource, position: string): Buffer {
  if (source !== 'home') return uuidBytes(position);
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(position, 'base64url').toString());
  } catch {
    throw new NativeMemoryError('INVALID');
  }
  const { at, id } = (parsed ?? {}) as { at?: unknown; id?: unknown };
  if (
    typeof at !== 'number' ||
    !Number.isSafeInteger(at) ||
    at < 0 ||
    at >= 2 ** 48 ||
    typeof id !== 'string' ||
    !/^[pl]_/.test(id)
  )
    throw new NativeMemoryError('INVALID');
  const head = Buffer.alloc(7);
  head.writeUIntBE(at, 0, 6);
  head.writeUInt8(id.startsWith('p') ? 0 : 1, 6);
  return Buffer.concat([head, uuidBytes(id.slice(2))]);
}

function unpackPosition(
  source: MemorySource,
  bytes: Buffer,
  offset: number,
): { position: string; next: number } {
  if (source !== 'home') {
    const end = offset + 16;
    if (bytes.length < end) throw new NativeMemoryError('INVALID');
    return { position: uuidText(bytes.subarray(offset, end)), next: end };
  }
  const end = offset + 23;
  if (bytes.length < end) throw new NativeMemoryError('INVALID');
  const kind = bytes.readUInt8(offset + 6);
  if (kind > 1) throw new NativeMemoryError('INVALID');
  const id = `${kind === 0 ? 'p' : 'l'}_${uuidText(bytes.subarray(offset + 7, end))}`;
  return {
    position: Buffer.from(
      JSON.stringify({ at: bytes.readUIntBE(offset, 6), id }),
    ).toString('base64url'),
    next: end,
  };
}

/**
 * The page cursor `page()` returns is a base64url JSON document of several
 * hundred characters. Native clients accept at most 128, so the callable layer
 * sends this packed form instead: a version byte, a digest of the scope and
 * filter, then per source a flag byte (done, position kind) and the position as
 * raw bytes. It carries no authority: `expandMemoryCursor` rebuilds the exact
 * long cursor, and `page()` still validates and re-authorizes every item.
 */
export function compactMemoryCursor(
  cursor: string,
  scope: NativeMemoryScope,
  filter: NativeMemoryFilter,
): string {
  const marker = parsePageCursor(cursor, scope, filter);
  const parts: Buffer[] = [
    Buffer.from([COMPACT_MEMORY_CURSOR_VERSION]),
    filterDigest(scope, filter),
  ];
  for (const source of sources(scope, filter)) {
    const state = marker.states[source];
    const position = state.position;
    parts.push(
      Buffer.from([(state.done ? 1 : 0) | (position === null ? 0 : 2)]),
    );
    if (position !== null) parts.push(packPosition(source, position));
  }
  return Buffer.concat(parts).toString('base64url');
}

export function expandMemoryCursor(
  compact: string,
  scope: NativeMemoryScope,
  filter: NativeMemoryFilter,
): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(compact))
    throw new NativeMemoryError('INVALID');
  const bytes = Buffer.from(compact, 'base64url');
  if (
    bytes.length < 5 ||
    bytes.readUInt8(0) !== COMPACT_MEMORY_CURSOR_VERSION ||
    !bytes.subarray(1, 5).equals(filterDigest(scope, filter))
  )
    throw new NativeMemoryError('INVALID');
  let offset = 5;
  const states: Record<string, SourceState> = {};
  for (const source of sources(scope, filter)) {
    if (offset >= bytes.length) throw new NativeMemoryError('INVALID');
    const flags = bytes.readUInt8(offset);
    offset += 1;
    if (flags > 3) throw new NativeMemoryError('INVALID');
    let position: string | null = null;
    if (flags & 2) {
      const unpacked = unpackPosition(source, bytes, offset);
      position = unpacked.position;
      offset = unpacked.next;
    }
    states[source] = { position, done: (flags & 1) === 1 };
  }
  if (offset !== bytes.length) throw new NativeMemoryError('INVALID');
  return Buffer.from(
    JSON.stringify({ version: 2, filter: filterKey(scope, filter), states }),
  ).toString('base64url');
}

/** UTC Memories derive from live posts and updates; no content snapshot is stored. */
export class NativeMemories {
  private readonly posts: NativeBoxPosts;
  private readonly home: NativeHomeFeed;
  private readonly updates: NativeLifeUpdates;
  private readonly rooms: NativeRooms;

  public constructor(db: Firestore) {
    this.posts = new NativeBoxPosts(db);
    this.home = new NativeHomeFeed(db);
    this.updates = new NativeLifeUpdates(db);
    this.rooms = new NativeRooms(db);
  }

  private async fromPost(
    post: NativePost,
    uid: string,
    scopeBoxId?: string,
  ): Promise<NativeMemoryItem | null> {
    if (post.kind === 'post')
      return { kind: 'post', id: post.id, occurredAt: post.createdAt, post };
    if (!post.lifeUpdateId) return null;
    try {
      const update = await this.updates.get(post.lifeUpdateId, uid, scopeBoxId);
      return {
        kind: 'life_update',
        id: update.id,
        occurredAt: update.createdAt,
        update,
        sourcePostId: post.id,
      };
    } catch (error) {
      if (
        error instanceof NativeLifeUpdateError &&
        error.code === 'UNAVAILABLE'
      )
        return null;
      throw error;
    }
  }

  private async *boxItems(
    uid: string,
    boxId: string,
    beforeAt?: number,
  ): AsyncGenerator<NativeMemoryItem> {
    let cursor: string | undefined;
    do {
      const page = await this.posts
        .list(boxId, uid, cursor, 50, { beforeAt })
        .catch((error: unknown) => {
          if (error instanceof NativePostError)
            throw new NativeMemoryError('UNAVAILABLE');
          throw error;
        });
      for (const post of page.items) {
        const item = await this.fromPost(post, uid, boxId);
        if (item) yield item;
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
  }

  private async *homeItems(
    uid: string,
    ownerUid?: string,
    beforeAt?: number,
  ): AsyncGenerator<NativeMemoryItem> {
    let cursor: string | undefined;
    do {
      const page = await this.home
        .page(uid, cursor, 50, ownerUid, { beforeAt })
        .catch((error: unknown) => {
          if (error instanceof NativeHomeFeedError)
            throw new NativeMemoryError('UNAVAILABLE');
          throw error;
        });
      for (const post of page.items) {
        if (ownerUid && post.authorUid !== ownerUid) continue;
        const item = await this.fromPost(post, uid);
        if (item) yield item;
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
  }

  private async *onlyMeItems(
    uid: string,
    beforeAt?: number,
  ): AsyncGenerator<NativeMemoryItem> {
    let cursor: string | undefined;
    do {
      const page = await this.updates.listMine(uid, cursor, beforeAt);
      for (const update of page.items) {
        if (update.audience === 'only_me')
          yield {
            kind: 'life_update',
            id: update.id,
            occurredAt: update.createdAt,
            update,
          };
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
  }

  private async *items(
    uid: string,
    scope: NativeMemoryScope,
    beforeAt?: number,
  ): AsyncGenerator<NativeMemoryItem> {
    if (scope.kind === 'box') {
      yield* this.boxItems(uid, scope.boxId, beforeAt);
    } else if (scope.kind === 'personal') {
      yield* mergeByTime(
        this.homeItems(uid, undefined, beforeAt),
        this.onlyMeItems(uid, beforeAt),
      );
    } else {
      const room = await this.rooms
        .get(uid, scope.username)
        .catch((error: unknown) => {
          if (error instanceof NativeRoomError)
            throw new NativeMemoryError('UNAVAILABLE');
          throw error;
        });
      yield* this.homeItems(uid, room.owner.id, beforeAt);
    }
  }

  private validate(filter: NativeMemoryFilter): void {
    if (filter.month !== undefined && filter.year === undefined)
      throw new NativeMemoryError('INVALID');
    if (
      (filter.year !== undefined &&
        (!Number.isInteger(filter.year) ||
          filter.year < 1970 ||
          filter.year > 9999)) ||
      (filter.month !== undefined &&
        (!Number.isInteger(filter.month) ||
          filter.month < 1 ||
          filter.month > 12)) ||
      (filter.type !== undefined &&
        !['all', 'posts', 'life_updates'].includes(filter.type))
    )
      throw new NativeMemoryError('INVALID');
  }

  private matches(item: NativeMemoryItem, filter: NativeMemoryFilter): boolean {
    const at = new Date(item.occurredAt);
    return (
      (filter.year === undefined || at.getUTCFullYear() === filter.year) &&
      (filter.month === undefined || at.getUTCMonth() + 1 === filter.month) &&
      (filter.type === undefined ||
        filter.type === 'all' ||
        (filter.type === 'posts' && item.kind === 'post') ||
        (filter.type === 'life_updates' && item.kind === 'life_update'))
    );
  }

  private async window(
    uid: string,
    scope: NativeMemoryScope,
    source: MemorySource,
    position: string | null,
    options: {
      size: number;
      beforeAt: number | undefined;
      afterAt: number | undefined;
      ownerUid: string | undefined;
    },
  ): Promise<MemoryWindow> {
    const time = { beforeAt: options.beforeAt, afterAt: options.afterAt };
    if (source === 'box') {
      if (scope.kind !== 'box') throw new NativeMemoryError('INVALID');
      const page = await this.posts
        .list(scope.boxId, uid, position ?? undefined, options.size, time)
        .catch((error: unknown) => {
          if (error instanceof NativePostError)
            throw new NativeMemoryError('UNAVAILABLE');
          throw error;
        });
      return {
        candidates: await Promise.all(
          page.items.map(async (post) => ({
            source,
            at: post.createdAt,
            id: `p_${post.id}`,
            position: post.id,
            item: await this.fromPost(post, uid, scope.boxId),
          })),
        ),
        nextCursor: page.nextCursor,
      };
    }
    if (source === 'home') {
      const page = await this.home
        .page(uid, position ?? undefined, options.size, options.ownerUid, time)
        .catch((error: unknown) => {
          if (error instanceof NativeHomeFeedError)
            throw new NativeMemoryError('UNAVAILABLE');
          throw error;
        });
      return {
        candidates: await Promise.all(
          page.items.map(async (post) => {
            const id =
              post.kind === 'life_update' && post.lifeUpdateId
                ? `l_${post.lifeUpdateId}`
                : `p_${post.id}`;
            return {
              source,
              at: post.createdAt,
              id,
              position: encodeHomePosition(post.createdAt, id),
              item: await this.fromPost(post, uid),
            };
          }),
        ),
        nextCursor: page.nextCursor,
      };
    }
    const page = await this.updates
      .listMine(uid, position ?? undefined, options.beforeAt, options.afterAt)
      .catch((error: unknown) => {
        if (error instanceof NativeLifeUpdateError)
          throw new NativeMemoryError('UNAVAILABLE');
        throw error;
      });
    return {
      candidates: page.items.map((update) => ({
        source,
        at: update.createdAt,
        id: `l_${update.id}`,
        position: update.id,
        item:
          update.audience === 'only_me'
            ? {
                kind: 'life_update' as const,
                id: update.id,
                occurredAt: update.createdAt,
                update,
              }
            : null,
      })),
      nextCursor: page.nextCursor,
    };
  }

  public async page(
    uid: string,
    scope: NativeMemoryScope,
    filter: NativeMemoryFilter = {},
  ) {
    const size = filter.limit ?? 20;
    if (!Number.isInteger(size) || size < 1 || size > 50)
      throw new NativeMemoryError('INVALID');
    this.validate(filter);
    const marker = parsePageCursor(filter.cursor, scope, filter);
    const activeSources = sources(scope, filter);
    const items: NativeMemoryItem[] = [];
    const beforeAt =
      filter.year === undefined
        ? undefined
        : filter.month === undefined
          ? Date.UTC(filter.year + 1, 0, 1)
          : Date.UTC(filter.year, filter.month, 1);
    const afterAt =
      filter.year === undefined
        ? undefined
        : filter.month === undefined
          ? Date.UTC(filter.year, 0, 1)
          : Date.UTC(filter.year, filter.month - 1, 1);
    const ownerUid =
      scope.kind === 'room'
        ? await this.rooms
            .get(uid, scope.username)
            .then((room) => room.owner.id)
            .catch((error: unknown) => {
              if (error instanceof NativeRoomError)
                throw new NativeMemoryError('UNAVAILABLE');
              throw error;
            })
        : undefined;
    const readWindow = (source: MemorySource, position: string | null) =>
      this.window(uid, scope, source, position, {
        size,
        beforeAt,
        afterAt,
        ownerUid,
      });
    const windows = Object.fromEntries(
      await Promise.all(
        activeSources.map(
          async (source) =>
            [
              source,
              marker.states[source].done
                ? { candidates: [], nextCursor: null }
                : await readWindow(source, marker.states[source].position),
            ] as const,
        ),
      ),
    ) as Record<MemorySource, MemoryWindow>;
    const offsets = Object.fromEntries(
      activeSources.map((source) => [source, 0]),
    ) as Record<MemorySource, number>;
    // Each source window holds `size` candidates. A candidate rejected by
    // authorization (item null) shortens the usable window, so an exhausted
    // window that still has a nextCursor is refilled a bounded number of times.
    // The merge never emits past a source whose next candidate is unknown.
    const refills = Object.fromEntries(
      activeSources.map((source) => [source, 0]),
    ) as Record<MemorySource, number>;
    // A read that returned no candidates already used the source's own scan
    // budget (hidden-heavy history); the cursor advances instead of re-reading.
    const lastRead = Object.fromEntries(
      activeSources.map((source) => [
        source,
        windows[source].candidates.length,
      ]),
    ) as Record<MemorySource, number>;
    while (items.length < size) {
      const starved = activeSources.find(
        (source) =>
          !marker.states[source].done &&
          offsets[source] >= windows[source].candidates.length &&
          windows[source].nextCursor !== null,
      );
      if (starved) {
        if (refills[starved] >= MAX_WINDOW_REFILLS || !lastRead[starved]) break;
        refills[starved] += 1;
        const more = await readWindow(starved, windows[starved].nextCursor);
        lastRead[starved] = more.candidates.length;
        windows[starved] = {
          candidates: [...windows[starved].candidates, ...more.candidates],
          nextCursor: more.nextCursor,
        };
        continue;
      }
      const next = activeSources.flatMap(
        (source) => windows[source].candidates[offsets[source]] ?? [],
      );
      if (!next.length) break;
      next.sort(
        (first, second) =>
          second.at - first.at || second.id.localeCompare(first.id),
      );
      const candidate = next[0]!;
      offsets[candidate.source] += 1;
      marker.states[candidate.source].position = candidate.position;
      if (candidate.item && this.matches(candidate.item, filter))
        items.push(candidate.item);
    }
    for (const source of activeSources) {
      const state = marker.states[source];
      if (state.done) continue;
      const window = windows[source];
      if (offsets[source] === window.candidates.length) {
        if (window.nextCursor) state.position = window.nextCursor;
        else state.done = true;
      }
    }
    return {
      items,
      nextCursor: activeSources.some((source) => !marker.states[source].done)
        ? Buffer.from(JSON.stringify(marker)).toString('base64url')
        : null,
    };
  }

  /** Reference-only exact count; live web requests use bounded period navigation. */
  public async summary(uid: string, scope: NativeMemoryScope, year?: number) {
    if (
      year !== undefined &&
      (!Number.isInteger(year) || year < 1970 || year > 9999)
    )
      throw new NativeMemoryError('INVALID');
    const years = new Map<number, number>();
    const monthsByYear = new Map<number, Map<number, number>>();
    for await (const item of this.items(uid, scope)) {
      const y = new Date(item.occurredAt).getUTCFullYear();
      years.set(y, (years.get(y) ?? 0) + 1);
      const month = new Date(item.occurredAt).getUTCMonth() + 1;
      const counts = monthsByYear.get(y) ?? new Map<number, number>();
      counts.set(month, (counts.get(month) ?? 0) + 1);
      monthsByYear.set(y, counts);
    }
    const yearsList = [...years.entries()]
      .sort(([a], [b]) => b - a)
      .map(([value, count]) => ({ year: value, count }));
    const selected = year ?? yearsList[0]?.year ?? null;
    const months =
      monthsByYear.get(selected ?? -1) ?? new Map<number, number>();
    return {
      years: yearsList,
      year: selected,
      months: [...months.entries()]
        .sort(([a], [b]) => b - a)
        .map(([month, count]) => ({ month, count })),
    };
  }
}

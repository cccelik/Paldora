import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  callableNames,
  httpFunctionNames,
} from '../../../../apps/firebase-functions/src/callable-names.js';
import {
  FUNCTIONS_ERROR_CODES,
  NATIVE_ERROR_REASONS,
  nativeErrorReasonSchema,
  nativeErrorSchema,
} from './errors.js';
import {
  nativeBoxDocSchema,
  nativeBoxRefDocSchema,
  nativeMemberDocSchema,
} from './firestore.js';
import { nativeHttpEndpoints } from './http.js';
import { nativeCallableRegistry } from './registry.js';

interface CallableFixture {
  callable: string;
  request: { valid: unknown[]; invalid: unknown[] };
  response: { valid: unknown[] };
  errors: Array<{ code: string }>;
  cursorPage?: {
    itemsKey: string;
    nextCursorKey: string;
    nextCursorNullable: boolean;
    pageSize: number;
  };
}

interface FirestoreFixture {
  path: string;
  schema: string;
  valid: unknown[];
  invalid: unknown[];
}

const contractDirectory = new URL(
  '../../../../contracts/native/',
  import.meta.url,
);
const readJson = <T>(directory: string, name: string): T =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`${directory}/${name}`, contractDirectory)),
      'utf8',
    ),
  ) as T;
const jsonNames = (directory: string) =>
  readdirSync(
    fileURLToPath(new URL(`${directory}/`, contractDirectory)),
  ).filter((name) => name.endsWith('.json'));

const fixtures = new Map(
  jsonNames('fixtures').map((name) => {
    const fixture = readJson<CallableFixture>('fixtures', name);
    return [fixture.callable, { file: name, fixture }] as const;
  }),
);
const registry = new Map(
  nativeCallableRegistry.map((entry) => [entry.name, entry]),
);

describe('native callable registry', () => {
  it('registers every callable name, once, in callableNames order', () => {
    expect(nativeCallableRegistry.map((entry) => entry.name)).toEqual([
      ...callableNames,
    ]);
  });

  it('declares only real Functions error codes and a positive limit', () => {
    for (const entry of nativeCallableRegistry) {
      expect(entry.errors.length).toBeGreaterThan(0);
      for (const code of entry.errors)
        expect(FUNCTIONS_ERROR_CODES).toContain(code);
      expect(entry.limit.perHour).toBeGreaterThan(0);
      expect(entry.limit.scope).toBe(entry.name);
    }
  });

  it('has a fixture for every entry and an entry for every fixture', () => {
    expect([...fixtures.keys()].sort()).toEqual([...registry.keys()].sort());
    for (const [name, { file }] of fixtures) expect(file).toBe(`${name}.json`);
  });
});

describe.each([...registry.values()])('callable $name', (entry) => {
  const { fixture } = fixtures.get(entry.name)!;

  it('accepts every valid request and rejects every invalid one', () => {
    expect(fixture.request.valid.length).toBeGreaterThan(0);
    for (const request of fixture.request.valid)
      expect(
        entry.input.safeParse(request).success,
        JSON.stringify(request),
      ).toBe(true);
    for (const request of fixture.request.invalid)
      expect(
        entry.input.safeParse(request).success,
        JSON.stringify(request),
      ).toBe(false);
  });

  it('accepts every valid response', () => {
    expect(fixture.response.valid.length).toBeGreaterThan(0);
    for (const response of fixture.response.valid)
      expect(
        entry.output.safeParse(response).success,
        JSON.stringify(response),
      ).toBe(true);
  });

  it('lists exactly the declared error codes', () => {
    expect(fixture.errors.map(({ code }) => code).sort()).toEqual(
      [...entry.errors].sort(),
    );
    for (const { code } of fixture.errors)
      expect(nativeErrorSchema.safeParse({ code, message: 'x' }).success).toBe(
        true,
      );
  });

  it('shapes list responses as an items page with a nullable cursor', () => {
    if (!fixture.cursorPage) return;
    const { itemsKey, nextCursorKey, nextCursorNullable } = fixture.cursorPage;
    expect(fixture.cursorPage.pageSize).toBeGreaterThan(0);
    const pages = fixture.response.valid as Array<Record<string, unknown>>;
    for (const page of pages) {
      expect(Array.isArray(page[itemsKey])).toBe(true);
      const cursor = page[nextCursorKey];
      expect(
        typeof cursor === 'string' || (nextCursorNullable && cursor === null),
      ).toBe(true);
    }
    expect(pages.some((page) => page[nextCursorKey] === null)).toBe(true);
    expect(pages.some((page) => typeof page[nextCursorKey] === 'string')).toBe(
      true,
    );
  });
});

describe('error shape', () => {
  it('requires a code and message and tolerates an optional details.reason', () => {
    expect(
      nativeErrorSchema.safeParse({ code: 'not-found', message: 'x' }).success,
    ).toBe(true);
    expect(
      nativeErrorSchema.safeParse({
        code: 'not-found',
        message: 'x',
        details: { reason: 'BOX_NOT_FOUND' },
      }).success,
    ).toBe(true);
    expect(
      nativeErrorSchema.safeParse({ code: 'NOT_FOUND', message: 'x' }).success,
    ).toBe(false);
    expect(nativeErrorSchema.safeParse({ code: 'not-found' }).success).toBe(
      false,
    );
  });
});

describe('error reasons', () => {
  it('are a small closed set that names no resource or state', () => {
    expect([...NATIVE_ERROR_REASONS]).toEqual([
      'SIGN_IN_REQUIRED',
      'SESSION_ENDED',
      'INVALID_INPUT',
      'RATE_LIMITED',
      'STALE_WRITE',
    ]);
    for (const reason of NATIVE_ERROR_REASONS)
      expect(nativeErrorReasonSchema.safeParse(reason).success).toBe(true);
    expect(nativeErrorReasonSchema.safeParse('BOX_NOT_FOUND').success).toBe(
      false,
    );
  });
});

describe('native Firestore documents', () => {
  const schemas: Record<string, z.ZodType> = {
    nativeBoxRefDocSchema,
    nativeBoxDocSchema,
    nativeMemberDocSchema,
  };
  const files = jsonNames('firestore');

  it('covers the three open paths', () => {
    expect(files.sort()).toEqual([
      'nativeAccounts-boxRefs.json',
      'nativeBoxes-members.json',
      'nativeBoxes.json',
    ]);
  });

  it.each(files)('%s validates', (name) => {
    const fixture = readJson<FirestoreFixture>('firestore', name);
    const schema = schemas[fixture.schema];
    expect(schema).toBeDefined();
    for (const doc of fixture.valid)
      expect(schema!.safeParse(doc).success).toBe(true);
    for (const doc of fixture.invalid)
      expect(schema!.safeParse(doc).success).toBe(false);
  });
});

describe('native HTTP endpoints', () => {
  it('registers every onRequest Function once, in source order', () => {
    expect(nativeHttpEndpoints.map(({ name }) => name)).toEqual([
      ...httpFunctionNames,
    ]);
  });

  it('declares auth, a positive limit and private no-store responses', () => {
    for (const endpoint of nativeHttpEndpoints) {
      expect(endpoint.auth).toBe('Bearer Firebase ID token');
      expect(endpoint.limit.perHour).toBeGreaterThan(0);
      expect(endpoint.responseHeaders['Cache-Control']).toBe(
        'private, no-store',
      );
      expect(endpoint.statuses['401']).toBeDefined();
      expect(endpoint.statuses['404']).toBeDefined();
      expect(endpoint.statuses['429']).toBeDefined();
    }
  });
});

describe('Rooms and Memories contract', () => {
  const room = (name: string) => registry.get(name)!;
  const sample = (name: string) =>
    (
      fixtures.get(name)!.fixture.response.valid as Record<string, unknown>[]
    )[0]!;

  it('declares STALE_WRITE only where a save names expectedUpdatedAt', () => {
    for (const name of [
      'updateMyRoom',
      'updateMyRoomWidgets',
      'updateMyRoomTopFriends',
    ])
      expect(room(name).errors).toContain('failed-precondition');
    for (const name of ['getMyRoom', 'getRoom', 'listMyMemories'])
      expect(room(name).errors).not.toContain('failed-precondition');
  });

  it('never carries a URL or storage key in a Room, only opaque media ids', () => {
    for (const name of ['getMyRoom', 'getRoom', 'updateMyRoom']) {
      const keys = Object.keys(sample(name));
      expect(keys).toContain('bannerMediaId');
      expect(keys).not.toContain('banner');
    }
    expect(JSON.stringify(sample('getMyRoom'))).not.toMatch(
      /avatarUrl|thumbnailUrl|"banner"/,
    );
  });

  it('accepts only the 14 registry themes and rejects CSS-bearing fields', () => {
    const input = room('updateMyRoom').input;
    expect(
      input.safeParse({
        themePreset: 'polaroid_scrapbook',
        expectedUpdatedAt: null,
      }).success,
    ).toBe(true);
    for (const bad of [
      { css: 'x', sparkles: true, expectedUpdatedAt: null },
      { themePreset: '#fff', expectedUpdatedAt: null },
      { music: { url: 'javascript:alert(1)' }, expectedUpdatedAt: null },
    ])
      expect(input.safeParse(bad).success).toBe(false);
  });

  it('keeps Memory cursors opaque and within 128 characters', () => {
    for (const name of [
      'listMyMemories',
      'listBoxMemories',
      'listRoomMemories',
    ])
      expect(
        room(name).input.safeParse({
          ...(name === 'listBoxMemories' ? { boxId: 'b' } : {}),
          ...(name === 'listRoomMemories' ? { username: 'u' } : {}),
          cursor: 'c'.repeat(129),
        }).success,
      ).toBe(false);
  });
});

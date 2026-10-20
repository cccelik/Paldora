import { defineRoute } from '@paldora/validation';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiClientError, PaldoraApiClient } from './index.js';

const json = (status: number, body: unknown, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const privateRoute = defineRoute({
  operationId: 'getThing',
  method: 'GET',
  path: '/things/{thingId}',
  summary: 'Test route.',
  tag: 'Test',
  access: 'authenticated',
  successStatus: 200,
  response: z.object({ id: z.string() }),
  errors: ['NOT_FOUND'],
});

describe('PaldoraApiClient', () => {
  it('parses liveness against the contract', async () => {
    const fetch = vi.fn(async () =>
      json(200, {
        status: 'ok',
        service: 'api',
        timestamp: '2026-10-18T12:00:00.000Z',
      }),
    );
    const client = new PaldoraApiClient({
      baseUrl: 'https://api.test/api/v1/',
      fetch,
    });
    await expect(client.liveness()).resolves.toMatchObject({ status: 'ok' });
    expect(fetch).toHaveBeenCalledWith(
      'https://api.test/api/v1/health',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('sends bearer tokens and encodes path and query values', async () => {
    const fetch = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        expect(new Headers(init?.headers).get('authorization')).toBe(
          'Bearer token-1',
        );
        return json(200, { id: 'x' });
      },
    );
    const client = new PaldoraApiClient({
      baseUrl: 'https://api.test/api/v1',
      fetch,
      getAccessToken: async () => 'token-1',
    });
    await client.call(privateRoute, {
      params: { thingId: 'a/b' },
      query: { limit: 20, cursor: undefined },
    });
    expect(fetch.mock.calls[0]?.[0]).toBe(
      'https://api.test/api/v1/things/a%2Fb?limit=20',
    );
  });

  it('refuses authenticated calls without a token before any network call', async () => {
    const fetch = vi.fn();
    const client = new PaldoraApiClient({ baseUrl: 'https://api.test', fetch });
    await expect(
      client.call(privateRoute, { params: { thingId: '1' } }),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED', status: 401 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('maps error envelopes to typed errors', async () => {
    const client = new PaldoraApiClient({
      baseUrl: 'https://api.test',
      fetch: async () =>
        json(404, {
          error: { code: 'NOT_FOUND', message: 'Missing.', requestId: 'r-1' },
        }),
      getAccessToken: async () => 't',
    });
    const error = await client
      .call(privateRoute, { params: { thingId: '1' } })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      requestId: 'r-1',
    });
  });

  it('treats malformed success and error bodies as unexpected', async () => {
    const malformed = new PaldoraApiClient({
      baseUrl: 'https://api.test',
      fetch: async () => json(200, { id: 42 }, { 'x-request-id': 'r-2' }),
      getAccessToken: async () => 't',
    });
    await expect(
      malformed.call(privateRoute, { params: { thingId: '1' } }),
    ).rejects.toMatchObject({ code: 'UNEXPECTED_RESPONSE', requestId: 'r-2' });

    const htmlError = new PaldoraApiClient({
      baseUrl: 'https://api.test',
      fetch: async () =>
        new Response('<html>Bad gateway</html>', { status: 502 }),
    });
    await expect(htmlError.readiness()).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      status: 502,
    });
  });
});

describe('identity and media methods', () => {
  const currentUser = {
    user: {
      id: '7d2f4f3e-8a71-4c55-9b16-2f1f0c6d2a10',
      email: 'ada@example.test',
      status: 'active',
      createdAt: '2026-10-18T12:00:00.000Z',
    },
    profile: {
      username: 'ada',
      displayName: 'Ada',
      bio: null,
      avatar: null,
      avatarProcessing: false,
      onboardingState: 'complete',
      updatedAt: '2026-10-18T12:00:00.000Z',
    },
    preferences: {
      appearance: 'system',
      reactionPresets: ['👍', '❤️', '😂', '😮', '😢'],
    },
  };

  it('sends profile changes with the bearer token and parses the result', async () => {
    const fetch = vi.fn(async () => json(200, currentUser));
    const client = new PaldoraApiClient({
      baseUrl: 'https://api.test/api/v1',
      getAccessToken: async () => 'token-1',
      fetch,
    });
    await expect(
      client.updateProfile({ displayName: 'Ada' }),
    ).resolves.toMatchObject({ profile: { username: 'ada' } });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/api/v1/me/profile');
    expect(init.method).toBe('PATCH');
    expect(new Headers(init.headers).get('authorization')).toBe(
      'Bearer token-1',
    );
    expect(init.body).toBe(JSON.stringify({ displayName: 'Ada' }));
  });

  it('encodes path parameters and query values', async () => {
    const fetch = vi.fn(async () =>
      json(200, { username: 'a b', available: false, reason: 'invalid' }),
    );
    const client = new PaldoraApiClient({
      baseUrl: 'https://api.test/api/v1',
      getAccessToken: async () => 'token-1',
      fetch,
    });
    await client.usernameAvailability('a b');
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://api.test/api/v1/me/username-availability?username=a+b',
    );
  });

  it('rejects a response that breaks the contract', async () => {
    const client = new PaldoraApiClient({
      baseUrl: 'https://api.test/api/v1',
      getAccessToken: async () => 'token-1',
      fetch: vi.fn(async () =>
        json(200, { ...currentUser, profile: { username: 42 } }),
      ),
    });
    await expect(client.currentUser()).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
    });
  });
});

describe('Box and friend methods', () => {
  const emptyPage = { items: [], nextCursor: null };

  it('sends paging options and decodes a page', async () => {
    const fetch = vi.fn(async () => json(200, emptyPage));
    const client = new PaldoraApiClient({
      baseUrl: 'https://api.test/api/v1',
      getAccessToken: async () => 't',
      fetch,
    });
    await expect(client.friends({ limit: 2, cursor: 'abc' })).resolves.toEqual(
      emptyPage,
    );
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://api.test/api/v1/friends?limit=2&cursor=abc',
    );
  });

  it('returns nothing for 204 responses and encodes the delete confirmation', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    const client = new PaldoraApiClient({
      baseUrl: 'https://api.test/api/v1',
      getAccessToken: async () => 't',
      fetch,
    });
    await expect(
      client.deleteBox('b1', 'Weekend & crew'),
    ).resolves.toBeUndefined();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'https://api.test/api/v1/boxes/b1?confirmName=Weekend+%26+crew',
    );
    expect(init.method).toBe('DELETE');
  });

  it('puts both path parameters in place', async () => {
    const fetch = vi.fn(async () => json(200, { role: 'admin' }));
    const client = new PaldoraApiClient({
      baseUrl: 'https://api.test/api/v1',
      getAccessToken: async () => 't',
      fetch,
    });
    await client.setBoxMemberRole('b1', 'u1', 'admin');
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://api.test/api/v1/boxes/b1/members/u1',
    );
  });
});

describe('comment methods', () => {
  const client = (fetch: typeof globalThis.fetch) =>
    new PaldoraApiClient({
      baseUrl: 'https://api.test/api/v1',
      getAccessToken: async () => 't',
      fetch,
    });

  it('pages threads and replies at their own paths', async () => {
    const fetch = vi.fn(async () => json(200, { items: [], nextCursor: null }));
    await client(fetch).comments('p1', { limit: 5 });
    await client(fetch).commentReplies('c1', { cursor: 'x' });
    expect(
      fetch.mock.calls.map((call) => (call as unknown as [string])[0]),
    ).toEqual([
      'https://api.test/api/v1/posts/p1/comments?limit=5',
      'https://api.test/api/v1/comments/c1/replies?cursor=x',
    ]);
  });

  it('sends edits as a body and deletes without one', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    await expect(client(fetch).deleteComment('c1')).resolves.toBeUndefined();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/api/v1/comments/c1');
    expect(init).toMatchObject({ method: 'DELETE' });
    expect(init.body).toBeUndefined();
  });
});

describe('reaction methods', () => {
  const client = (fetch: typeof globalThis.fetch) =>
    new PaldoraApiClient({
      baseUrl: 'https://api.test/api/v1',
      getAccessToken: async () => 't',
      fetch,
    });
  const commentSummary = {
    reactions: [{ kind: '🔥', count: 1 }],
    reactionCount: 1,
    viewerReaction: { kind: '🔥' },
  };

  it('puts set-state bodies on the reaction paths', async () => {
    const fetch = vi.fn(async () => json(200, commentSummary));
    await client(fetch).setCommentReaction('c1', '🔥');
    await client(fetch).setCommentReaction('c1', null);
    const calls = fetch.mock.calls as unknown as [string, RequestInit][];
    expect(calls.map(([url, init]) => [url, init.method, init.body])).toEqual([
      ['https://api.test/api/v1/comments/c1/reaction', 'PUT', '{"kind":"🔥"}'],
      ['https://api.test/api/v1/comments/c1/reaction', 'PUT', '{"kind":null}'],
    ]);
  });

  it('pages reactions with an optional kind filter', async () => {
    const fetch = vi.fn(async () => json(200, { items: [], nextCursor: null }));
    await client(fetch).postReactions('p1', { kind: 'real', limit: 10 });
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://api.test/api/v1/posts/p1/reactions?kind=real&limit=10',
    );
  });
});

describe('Life Update methods', () => {
  const client = (fetch: typeof globalThis.fetch) =>
    new PaldoraApiClient({
      baseUrl: 'https://api.test/api/v1',
      getAccessToken: async () => 't',
      fetch,
    });

  it('posts the audience and sections, and pages your own updates', async () => {
    const fetch = vi.fn(async () => json(200, { items: [], nextCursor: null }));
    await client(fetch).myLifeUpdates({ limit: 5 });
    const failing = vi.fn(async () =>
      json(404, {
        error: { code: 'BOX_NOT_FOUND', message: 'No.', requestId: 'r1' },
      }),
    );
    await expect(
      client(failing).createLifeUpdate({
        audience: { type: 'only_me' },
        sections: { travel: 'Lisbon' },
      }),
    ).rejects.toMatchObject({ code: 'BOX_NOT_FOUND', status: 404 });
    const [url, init] = failing.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect([url, init.method, init.body]).toEqual([
      'https://api.test/api/v1/life-updates',
      'POST',
      '{"audience":{"type":"only_me"},"sections":{"travel":"Lisbon"}}',
    ]);
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe(
      'https://api.test/api/v1/me/life-updates?limit=5',
    );
  });

  it('patches only the parts being changed', async () => {
    const failing = vi.fn(async () =>
      json(409, {
        error: { code: 'BOX_ARCHIVED', message: 'No.', requestId: 'r1' },
      }),
    );
    await expect(
      client(failing).updateLifeUpdate('l1', { sections: { travel: 'Rome' } }),
    ).rejects.toMatchObject({ code: 'BOX_ARCHIVED', status: 409 });
    const [url, init] = failing.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect([url, init.method, init.body]).toEqual([
      'https://api.test/api/v1/life-updates/l1',
      'PATCH',
      '{"sections":{"travel":"Rome"}}',
    ]);
  });

  it('deletes by ID without a body', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    await expect(client(fetch).deleteLifeUpdate('l1')).resolves.toBeUndefined();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect([url, init.method, init.body]).toEqual([
      'https://api.test/api/v1/life-updates/l1',
      'DELETE',
      undefined,
    ]);
  });
});

describe('Memories methods', () => {
  const client = (fetch: typeof globalThis.fetch) =>
    new PaldoraApiClient({
      baseUrl: 'https://api.test/api/v1',
      getAccessToken: async () => 't',
      fetch,
    });
  const urls = (fetch: ReturnType<typeof vi.fn>) =>
    fetch.mock.calls.map((call) => (call as unknown as [string])[0]);

  it('pages one UTC month of your Memories or a Box’s', async () => {
    const fetch = vi.fn(async () => json(200, { items: [], nextCursor: null }));
    await client(fetch).myMemories({ year: 2026, month: 12, type: 'posts' });
    await client(fetch).boxMemories('b1', {
      year: 2025,
      cursor: 'c',
      limit: 5,
    });
    expect(urls(fetch)).toEqual([
      'https://api.test/api/v1/me/memories?year=2026&month=12&type=posts',
      'https://api.test/api/v1/boxes/b1/memories?year=2025&cursor=c&limit=5',
    ]);
  });

  it('reads summaries with an optional year, against the contract', async () => {
    const fetch = vi.fn(async () =>
      json(200, { years: [{ year: 2026, count: 2 }], year: 2026, months: [] }),
    );
    await expect(client(fetch).myMemorySummary()).resolves.toMatchObject({
      year: 2026,
    });
    await client(fetch).boxMemorySummary('b1', 2024);
    expect(urls(fetch)).toEqual([
      'https://api.test/api/v1/me/memories/summary',
      'https://api.test/api/v1/boxes/b1/memories/summary?year=2024',
    ]);
    const malformed = vi.fn(async () => json(200, { years: [] }));
    await expect(client(malformed).myMemorySummary()).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
    });
  });
});

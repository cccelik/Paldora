import {
  NativeMediaError,
  NativeRateLimitError,
} from '@paldora/firebase-trusted';
import { describe, expect, it, vi } from 'vitest';
import {
  handleMediaRead,
  handleMediaUpload,
  type MediaHttpDeps,
  type MediaHttpRequest,
} from './media-http.js';

const id = '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a';

function response() {
  const out = {
    code: 0,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
  };
  const res = {
    status(code: number) {
      out.code = code;
      return res;
    },
    set(name: string, value: string) {
      out.headers[name] = value;
      return res;
    },
    send(body?: Buffer | string) {
      out.body = body;
    },
  };
  return { res, out };
}

function deps(overrides: Partial<MediaHttpDeps> = {}): MediaHttpDeps {
  return {
    verifyIdToken: async () => ({ uid: 'u1' }),
    sessions: { require: async () => undefined },
    rateLimits: { consume: async () => undefined },
    media: {
      upload: vi.fn(async () => undefined),
      read: vi.fn(async () => Buffer.from('webp')),
    },
    ...overrides,
  };
}

const request = (
  overrides: Partial<MediaHttpRequest> = {},
): MediaHttpRequest => ({
  method: 'GET',
  path: `/${id}/display`,
  headers: { authorization: 'Bearer token' },
  ...overrides,
});

describe('media HTTP functions', () => {
  it('requires a bearer token and a current session', async () => {
    for (const d of [
      deps({
        verifyIdToken: async () => {
          throw new Error('bad token');
        },
      }),
      deps(),
    ]) {
      const { res, out } = response();
      await handleMediaRead(request({ headers: {} }), res, d);
      expect(out.code).toBe(401);
    }
    const { res, out } = response();
    const { NativeCallableSessionError } =
      await import('@paldora/firebase-trusted');
    await handleMediaRead(
      request(),
      res,
      deps({
        sessions: {
          require: async () => {
            throw new NativeCallableSessionError();
          },
        },
      }),
    );
    expect(out.code).toBe(401);
  });

  it('verifies the token with revocation checking and refuses a disabled user', async () => {
    const verifyIdToken = vi.fn(
      async (_token: string, checkRevoked: boolean) => {
        if (checkRevoked) throw new Error('auth/user-disabled');
        return { uid: 'u1' };
      },
    );
    const { res, out } = response();
    await handleMediaRead(request(), res, deps({ verifyIdToken }));
    expect(verifyIdToken).toHaveBeenCalledWith('token', true);
    expect(out.code).toBe(401);
    expect(String(out.body)).toBe('{"error":{"code":"unauthenticated"}}');
  });

  it('answers absence and denial with the same 404 and private headers', async () => {
    const bodies: unknown[] = [];
    for (const path of [
      `/${id}/master`,
      '/not-a-uuid/display',
      `/${id}/display`,
    ]) {
      const { res, out } = response();
      await handleMediaRead(
        request({ path }),
        res,
        deps({
          media: {
            upload: vi.fn(),
            read: async () => {
              throw new NativeMediaError('UNAVAILABLE');
            },
          },
        }),
      );
      expect(out.code).toBe(404);
      expect(out.headers['Cache-Control']).toBe('private, no-store');
      bodies.push(out.body);
    }
    expect(new Set(bodies).size).toBe(1);
  });

  it('serves WebP bytes with no-store', async () => {
    const { res, out } = response();
    await handleMediaRead(request(), res, deps());
    expect(out.code).toBe(200);
    expect(out.headers['Content-Type']).toBe('image/webp');
    expect(out.headers['Cache-Control']).toBe('private, no-store');
  });

  it('maps rate limiting to 429 and rejects other methods', async () => {
    const limited = deps({
      rateLimits: {
        consume: async () => {
          throw new NativeRateLimitError();
        },
      },
    });
    const first = response();
    await handleMediaRead(request(), first.res, limited);
    expect(first.out.code).toBe(429);
    const second = response();
    await handleMediaRead(request({ method: 'POST' }), second.res, deps());
    expect(second.out.code).toBe(405);
    const third = response();
    await handleMediaUpload(request(), third.res, deps());
    expect(third.out.code).toBe(405);
  });

  it('passes the exact Content-Type and bytes to the upload policy', async () => {
    const d = deps();
    const { res, out } = response();
    await handleMediaUpload(
      request({
        method: 'PUT',
        path: `/${id}`,
        headers: { authorization: 'Bearer token', 'content-type': 'image/png' },
        rawBody: Buffer.from('png'),
      }),
      res,
      d,
    );
    expect(out.code).toBe(204);
    expect(d.media.upload).toHaveBeenCalledWith(
      'u1',
      id,
      Buffer.from('png'),
      'image/png',
    );
  });

  it('rejects empty and oversize bodies', async () => {
    const empty = response();
    await handleMediaUpload(
      request({ method: 'PUT', path: `/${id}`, rawBody: Buffer.alloc(0) }),
      empty.res,
      deps(),
    );
    expect(empty.out.code).toBe(400);
    const big = response();
    await handleMediaUpload(
      request({
        method: 'PUT',
        path: `/${id}`,
        rawBody: Buffer.alloc(10 * 1024 * 1024 + 1),
      }),
      big.res,
      deps(),
    );
    expect(big.out.code).toBe(413);
  });
});

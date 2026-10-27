import { PassThrough, Readable } from 'node:stream';
import { NativeLifecycleError } from '@paldora/firebase-trusted';
import { describe, expect, it, vi } from 'vitest';
import {
  handleAccountExportDownload,
  type ExportHttpDeps,
  type ExportHttpResponse,
} from './account-export-http.js';
import type { MediaHttpRequest } from './media-http.js';

const id = '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a';

function response() {
  const out = {
    code: 0,
    headers: {} as Record<string, string>,
    chunks: [] as Buffer[],
  };
  const stream = new PassThrough();
  stream.on('data', (chunk: Buffer) => out.chunks.push(chunk));
  const res = Object.assign(stream, {
    headersSent: false,
    status(code: number) {
      out.code = code;
      return res;
    },
    set(name: string, value: string) {
      out.headers[name] = value;
      return res;
    },
    send(body?: Buffer | string) {
      out.chunks.push(Buffer.from(body ?? ''));
      stream.end();
    },
  }) as unknown as ExportHttpResponse;
  const done = new Promise<void>((resolve) => {
    stream.on('close', resolve);
  });
  return { res, out, done };
}

function deps(overrides: Partial<ExportHttpDeps> = {}): ExportHttpDeps {
  return {
    verifyIdToken: async () => ({ uid: 'u1' }),
    sessions: { require: async () => undefined },
    rateLimits: { consume: vi.fn(async () => undefined) },
    lifecycle: {
      latestExport: async () => ({
        export: {
          id,
          status: 'ready' as const,
          createdAt: '',
          readyAt: '',
          expiresAt: '',
        },
      }),
      downloadStream: vi.fn(async () => Readable.from([Buffer.from('{}')])),
    },
    ...overrides,
  };
}

const request = (
  overrides: Partial<MediaHttpRequest> = {},
): MediaHttpRequest => ({
  method: 'GET',
  path: `/${id}`,
  headers: { authorization: 'Bearer token' },
  ...overrides,
});

describe('account export HTTP function', () => {
  it('streams the latest ready export as a private attachment', async () => {
    const { res, out, done } = response();
    await handleAccountExportDownload(request(), res, deps());
    await done;
    expect(out.code).toBe(200);
    expect(out.headers['Cache-Control']).toBe('private, no-store');
    expect(out.headers['Content-Disposition']).toMatch(/^attachment;/u);
    expect(Buffer.concat(out.chunks).toString()).toBe('{}');
  });

  it('answers every absence and denial with one 404 and never opens Storage', async () => {
    const downloadStream = vi.fn();
    const cases: Array<[string, Partial<ExportHttpDeps>]> = [
      [
        `/${id}`,
        {
          lifecycle: {
            latestExport: async () => ({ export: null }),
            downloadStream,
          },
        },
      ],
      [
        `/${id}`,
        {
          lifecycle: {
            latestExport: async () => ({
              export: {
                id: '11111111-1111-4111-8111-111111111111',
                status: 'ready' as const,
                createdAt: '',
                readyAt: '',
                expiresAt: '',
              },
            }),
            downloadStream,
          },
        },
      ],
      [
        `/${id}`,
        {
          lifecycle: {
            latestExport: async () => {
              throw new NativeLifecycleError('UNAVAILABLE');
            },
            downloadStream,
          },
        },
      ],
      ['/not-an-id', {}],
    ];
    const bodies = new Set<string>();
    for (const [path, overrides] of cases) {
      const { res, out } = response();
      await handleAccountExportDownload(
        request({ path }),
        res,
        deps(overrides),
      );
      expect(out.code).toBe(404);
      bodies.add(Buffer.concat(out.chunks).toString());
    }
    expect(bodies.size).toBe(1);
    expect(downloadStream).not.toHaveBeenCalled();
  });

  it('requires a bearer token, a current session and the right method', async () => {
    const missing = response();
    await handleAccountExportDownload(
      request({ headers: {} }),
      missing.res,
      deps(),
    );
    expect(missing.out.code).toBe(401);
    const ended = response();
    await handleAccountExportDownload(
      request(),
      ended.res,
      deps({
        sessions: {
          require: async () => {
            const { NativeCallableSessionError } =
              await import('@paldora/firebase-trusted');
            throw new NativeCallableSessionError();
          },
        },
      }),
    );
    expect(ended.out.code).toBe(401);
    const post = response();
    await handleAccountExportDownload(
      request({ method: 'POST' }),
      post.res,
      deps(),
    );
    expect(post.out.code).toBe(405);
  });
});

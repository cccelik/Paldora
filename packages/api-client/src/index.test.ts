import { describe, expect, it, vi } from 'vitest';
import { PaldoraApiClient } from './index.js';

describe('PaldoraApiClient', () => {
  it('uses the versioned health endpoint', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'ok',
          service: 'api',
          version: '0.1.0',
          timestamp: '',
        }),
      ),
    );
    const client = new PaldoraApiClient({
      baseUrl: 'https://api.example/api/v1/',
      fetchImplementation: request,
    });
    await client.health();
    expect(request).toHaveBeenCalledWith(
      'https://api.example/api/v1/health',
      expect.any(Object),
    );
  });

  it('attaches a fresh bearer token to authenticated requests', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          user: { id: 'user' },
          profile: { userId: 'user' },
        }),
      ),
    );
    const getAccessToken = vi.fn().mockResolvedValue('fresh-token');
    const client = new PaldoraApiClient({
      baseUrl: 'https://api.example/api/v1',
      fetchImplementation: request,
      getAccessToken,
    });
    await client.currentUser();
    expect(getAccessToken).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith(
      'https://api.example/api/v1/me',
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer fresh-token',
        }),
      }),
    );
  });

  it('invokes the native fetch implementation with the global receiver', async () => {
    const nativeFetch = vi.fn(function (this: unknown) {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      return Promise.resolve(
        new Response(
          JSON.stringify({
            status: 'ok',
            service: 'api',
            version: '0.1.0',
            timestamp: '',
          }),
        ),
      );
    });
    vi.stubGlobal('fetch', nativeFetch);
    try {
      const client = new PaldoraApiClient({
        baseUrl: 'https://api.example/api/v1',
      });
      await client.health();
      expect(nativeFetch).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

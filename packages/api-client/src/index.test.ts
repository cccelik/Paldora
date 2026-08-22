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
});

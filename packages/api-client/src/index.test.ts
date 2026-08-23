import type { BoxId, PostId, UserId } from '@paldora/domain';
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

  it('uses the versioned Boxes and friendship contracts', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'box-id',
            name: 'Close friends',
            currentUserRole: 'owner',
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([])))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ inviteeUserIds: [] })),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ownerUserId: '00000000-0000-4000-8000-000000000002',
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, status: 'removed' })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, status: 'left' })),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })));
    const client = new PaldoraApiClient({
      baseUrl: 'https://api.example/api/v1',
      fetchImplementation: request,
      getAccessToken: () => Promise.resolve('token'),
    });
    await client.createBox({ name: 'Close friends' });
    await client.friendRequests();
    await client.pendingBoxInvitees(
      '00000000-0000-4000-8000-000000000001' as BoxId,
    );
    await client.transferBoxOwnership(
      '00000000-0000-4000-8000-000000000001' as BoxId,
      '00000000-0000-4000-8000-000000000002' as UserId,
    );
    await client.removeBoxMember(
      '00000000-0000-4000-8000-000000000001' as BoxId,
      '00000000-0000-4000-8000-000000000002' as UserId,
    );
    await client.leaveBox('00000000-0000-4000-8000-000000000001' as BoxId);
    await client.deleteBox('00000000-0000-4000-8000-000000000001' as BoxId);
    expect(request).toHaveBeenNthCalledWith(
      1,
      'https://api.example/api/v1/boxes',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Close friends' }),
      }),
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      'https://api.example/api/v1/friend-requests',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(request).toHaveBeenNthCalledWith(
      3,
      'https://api.example/api/v1/boxes/00000000-0000-4000-8000-000000000001/invitations',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(request).toHaveBeenNthCalledWith(
      4,
      'https://api.example/api/v1/boxes/00000000-0000-4000-8000-000000000001/owner',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          userId: '00000000-0000-4000-8000-000000000002',
        }),
      }),
    );
    expect(request).toHaveBeenNthCalledWith(
      5,
      'https://api.example/api/v1/boxes/00000000-0000-4000-8000-000000000001/members/00000000-0000-4000-8000-000000000002',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(request).toHaveBeenNthCalledWith(
      6,
      'https://api.example/api/v1/boxes/00000000-0000-4000-8000-000000000001/members/me',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(request).toHaveBeenNthCalledWith(
      7,
      'https://api.example/api/v1/boxes/00000000-0000-4000-8000-000000000001',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('uses text-post and cursor feed contracts', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'post-id' })))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [], nextCursor: null })),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'post-id' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true })));
    const client = new PaldoraApiClient({
      baseUrl: 'https://api.example/api/v1',
      fetchImplementation: request,
      getAccessToken: () => Promise.resolve('token'),
    });
    const boxId = '00000000-0000-4000-8000-000000000001' as BoxId;
    const postId = '00000000-0000-4000-8000-000000000002' as PostId;
    await client.createPost(boxId, { content: 'Hello circle' });
    await client.feed({ cursor: 'next page', limit: 10 });
    await client.updatePost(postId, { content: 'Edited' });
    await client.deletePost(postId);

    expect(request).toHaveBeenNthCalledWith(
      1,
      `https://api.example/api/v1/boxes/${boxId}/posts`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ content: 'Hello circle' }),
      }),
    );
    expect(request).toHaveBeenNthCalledWith(
      2,
      'https://api.example/api/v1/me/feed?cursor=next+page&limit=10',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(request).toHaveBeenNthCalledWith(
      3,
      `https://api.example/api/v1/posts/${postId}`,
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ content: 'Edited' }),
      }),
    );
    expect(request).toHaveBeenNthCalledWith(
      4,
      `https://api.example/api/v1/posts/${postId}`,
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});

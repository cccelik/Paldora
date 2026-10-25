import { avatarFileProblem, putToSignedUrl } from '@/lib/media/image-upload';
import { describe, expect, it, vi } from 'vitest';
describe('avatarFileProblem', () => {
  it.each([
    [{ type: 'image/png', size: 1024 }, null],
    [{ type: 'image/gif', size: 1024 }, 'Choose a JPEG, PNG, or WebP photo.'],
    [{ type: 'image/svg+xml', size: 10 }, 'Choose a JPEG, PNG, or WebP photo.'],
    [{ type: 'image/jpeg', size: 0 }, 'That file is empty.'],
    [
      { type: 'image/webp', size: 10 * 1024 * 1024 + 1 },
      'Choose a photo up to 10 MB.',
    ],
  ])('%o → %s', (file, expected) => {
    expect(avatarFileProblem(file)).toBe(expected);
  });
});

describe('putToSignedUrl', () => {
  it('uses same-origin credentials for the Firebase media route', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 200 }));
    await putToSignedUrl(
      new Blob(['x']),
      {
        url: '/media/upload/123',
        headers: { 'content-type': 'image/png' },
      },
      fetch,
    );
    expect(fetch).toHaveBeenCalledWith(
      '/media/upload/123',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'content-type': 'image/png' },
        credentials: 'same-origin',
      }),
    );
  });

  it('fails when storage rejects the upload', async () => {
    await expect(
      putToSignedUrl(
        new Blob(['x']),
        { url: 'https://s/u', headers: {} },
        vi.fn(async () => new Response(null, { status: 403 })),
      ),
    ).rejects.toThrow(/rejected/);
  });
});

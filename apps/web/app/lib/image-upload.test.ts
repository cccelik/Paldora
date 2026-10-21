import { describe, expect, it, vi } from 'vitest';
import { avatarFileProblem, putToSignedUrl } from './image-upload';
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
  it('sends the signed headers without credentials', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 200 }));
    await putToSignedUrl(
      new Blob(['x']),
      {
        url: 'https://storage.test/u',
        headers: { 'content-type': 'image/png' },
      },
      fetch,
    );
    expect(fetch).toHaveBeenCalledWith(
      'https://storage.test/u',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'content-type': 'image/png' },
        credentials: 'omit',
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

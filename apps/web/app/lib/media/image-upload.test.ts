import {
  avatarFileProblem,
  checkMediaFile,
  mediaDimensionProblem,
  putToSignedUrl,
  UploadRejectedError,
  uploadFailureMessage,
} from '@/lib/media/image-upload';
import { uploadErrorResponse } from '@/lib/media/upload-error-response';
import { NativeMediaError } from '@paldora/firebase-trusted';
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

describe('mediaDimensionProblem', () => {
  const blob = new Blob(['x']);
  it('rejects photos above the purpose pixel limit', async () => {
    await expect(
      mediaDimensionProblem(blob, 'post_image', async () => ({
        width: 8000,
        height: 6000,
      })),
    ).resolves.toBe(
      'That photo is too large in pixels (max 40 megapixels). Try a smaller one.',
    );
  });
  it('uses each purpose policy (reaction images allow 25 megapixels)', async () => {
    await expect(
      mediaDimensionProblem(blob, 'reaction_image', async () => ({
        width: 6000,
        height: 5000,
      })),
    ).resolves.toMatch(/max 25 megapixels/);
  });
  it('accepts the exact limit and defers to the server when unreadable', async () => {
    await expect(
      mediaDimensionProblem(blob, 'avatar', async () => ({
        width: 8000,
        height: 5000,
      })),
    ).resolves.toBeNull();
    await expect(
      mediaDimensionProblem(blob, 'avatar', async () => null),
    ).resolves.toBeNull();
  });
  it('checks type before decoding', async () => {
    const decode = vi.fn(async () => ({ width: 1, height: 1 }));
    const gif = { type: 'image/gif', size: 5 } as unknown as File;
    await expect(checkMediaFile(gif, 'avatar', decode)).resolves.toBe(
      'Choose a JPEG, PNG, or WebP photo.',
    );
    expect(decode).not.toHaveBeenCalled();
  });
});

describe('upload rejection reasons', () => {
  it('carries the server reason code and maps it to a stable message', async () => {
    const error = await putToSignedUrl(
      new Blob(['x']),
      { url: '/media/upload/1', headers: {} },
      vi.fn(async () =>
        Response.json({ code: 'TOO_MANY_PIXELS' }, { status: 400 }),
      ),
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(UploadRejectedError);
    expect(uploadFailureMessage(error, 'fallback')).toMatch(
      /too large in pixels/,
    );
  });
  it('falls back for unknown codes and non-JSON bodies', async () => {
    expect(
      uploadFailureMessage(new UploadRejectedError(400, 'SOMETHING'), 'fb'),
    ).toBe('fb');
    const error = await putToSignedUrl(
      new Blob(['x']),
      { url: '/u', headers: {} },
      vi.fn(async () => new Response('nope', { status: 400 })),
    ).catch((caught: unknown) => caught);
    expect(uploadFailureMessage(error, 'fb')).toBe('fb');
    expect(uploadFailureMessage(new Error('x'), 'fb')).toBe('fb');
  });
});

describe('uploadErrorResponse', () => {
  it('keeps unavailable assets as an identical empty 404', async () => {
    const response = uploadErrorResponse(new NativeMediaError('UNAVAILABLE'));
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
  });
  it('returns only the stable reason code for rejected files', async () => {
    const response = uploadErrorResponse(
      new NativeMediaError('INVALID', 'TOO_MANY_PIXELS'),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ code: 'TOO_MANY_PIXELS' });
  });
  it('returns a bare 400 for other failures', async () => {
    const response = uploadErrorResponse(new NativeMediaError('MISMATCH'));
    expect(response.status).toBe(400);
    expect(await response.text()).toBe('');
  });
});

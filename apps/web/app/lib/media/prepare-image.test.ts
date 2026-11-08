import {
  cannotPrepareMessage,
  cannotShrinkMessage,
  prepareMediaFile,
  scaledSize,
  scaleToFit,
  type DecodedImage,
} from '@/lib/media/prepare-image';
import { describe, expect, it, vi } from 'vitest';

const MB = 1024 * 1024;
const fileOf = (type: string, bytes: number, name = 'IMG_1.jpg') =>
  new File([new Uint8Array(bytes)], name, { type });

function fake(
  width: number,
  height: number,
  options: {
    alpha?: boolean;
    sizes?: Partial<Record<string, number>>;
    fallbackType?: string;
  } = {},
) {
  const encode = vi.fn(async (_t: unknown, type: string) => {
    const size = options.sizes?.[type] ?? 1000;
    return new Blob([new Uint8Array(size)], {
      type: options.fallbackType ?? type,
    });
  });
  const close = vi.fn();
  const image: DecodedImage = {
    width,
    height,
    hasAlpha: async () => options.alpha ?? false,
    encode,
    close,
  };
  return { image, encode, close, decode: async () => image };
}

describe('scaleToFit / scaledSize', () => {
  it('keeps the aspect ratio and never enlarges', () => {
    expect(scaleToFit({ width: 8000, height: 6000 }, 4096, 40e6)).toBeCloseTo(
      0.512,
    );
    expect(scaledSize({ width: 8000, height: 6000 }, 0.512)).toEqual({
      width: 4096,
      height: 3072,
    });
    expect(scaleToFit({ width: 800, height: 600 }, 4096, 40e6)).toBe(1);
  });
  it('honours the pixel limit when the edge alone would not', () => {
    expect(scaleToFit({ width: 4000, height: 4000 }, 4096, 4e6)).toBeCloseTo(
      0.5,
    );
  });
});

describe('prepareMediaFile', () => {
  it('rejects non-images and empty files without decoding', async () => {
    const decode = vi.fn();
    expect(
      await prepareMediaFile(fileOf('image/gif', 5), 'post_image', decode),
    ).toEqual({ ok: false, problem: 'Choose a JPEG, PNG, or WebP photo.' });
    expect(
      await prepareMediaFile(fileOf('image/png', 0), 'post_image', decode),
    ).toEqual({ ok: false, problem: 'That file is empty.' });
    expect(decode).not.toHaveBeenCalled();
  });

  it('uploads a small in-limit photo untouched', async () => {
    const f = fake(3000, 2000);
    const file = fileOf('image/jpeg', 2 * MB);
    const result = await prepareMediaFile(file, 'post_image', f.decode);
    expect(result).toEqual({ ok: true, file, resized: false });
    expect(f.encode).not.toHaveBeenCalled();
    expect(f.close).toHaveBeenCalled();
  });

  it('downscales to the long edge and re-encodes as WebP', async () => {
    const f = fake(8000, 6000);
    const result = await prepareMediaFile(
      fileOf('image/jpeg', 6 * MB),
      'post_image',
      f.decode,
    );
    expect(f.encode).toHaveBeenCalledWith(
      { width: 4096, height: 3072 },
      'image/webp',
      0.88,
    );
    expect(result).toMatchObject({ ok: true, resized: true });
    if (result.ok) {
      expect(result.file.type).toBe('image/webp');
      expect(result.file.name).toBe('IMG_1.webp');
    }
  });

  it('uses the per-purpose edge (avatar 1024, banner 2400)', async () => {
    const a = fake(3000, 2000);
    await prepareMediaFile(fileOf('image/jpeg', MB), 'avatar', a.decode);
    expect(a.encode.mock.calls[0]?.[0]).toEqual({ width: 1024, height: 682 });
    const b = fake(3000, 1000);
    await prepareMediaFile(fileOf('image/jpeg', MB), 'room_banner', b.decode);
    expect(b.encode.mock.calls[0]?.[0]).toEqual({ width: 2400, height: 800 });
  });

  it('resizes by bytes alone, shrinking further until it fits', async () => {
    const calls: number[] = [];
    const f = fake(3000, 2000);
    f.encode.mockImplementation(async (t: unknown, type: string) => {
      const { width } = t as { width: number };
      calls.push(width);
      return new Blob([new Uint8Array(width > 2500 ? 11 * MB : 1000)], {
        type,
      });
    });
    const result = await prepareMediaFile(
      fileOf('image/jpeg', 12 * MB),
      'post_image',
      f.decode,
    );
    expect(result.ok).toBe(true);
    expect(calls[0]).toBe(3000);
    expect(calls.at(-1)).toBeLessThan(2500);
  });

  it('keeps transparent PNG as PNG when it fits', async () => {
    const f = fake(6000, 6000, { alpha: true });
    const result = await prepareMediaFile(
      fileOf('image/png', 9 * MB, 'a.png'),
      'post_image',
      f.decode,
    );
    expect(result.ok && result.file.type).toBe('image/png');
  });

  it('falls to WebP for a transparent PNG that is too big, and to JPEG for opaque PNG without WebP', async () => {
    const big = fake(6000, 6000, {
      alpha: true,
      sizes: { 'image/png': 20 * MB },
    });
    const r1 = await prepareMediaFile(
      fileOf('image/png', 9 * MB, 'a.png'),
      'post_image',
      big.decode,
    );
    expect(r1.ok && r1.file.type).toBe('image/webp');

    // Browser that can't write WebP returns PNG: ignored, JPEG used.
    const f = fake(6000, 6000);
    f.encode.mockImplementation(
      async (_t: unknown, type: string) =>
        new Blob([new Uint8Array(1000)], {
          type: type === 'image/webp' ? 'image/png' : type,
        }),
    );
    const r2 = await prepareMediaFile(
      fileOf('image/png', 9 * MB, 'a.png'),
      'post_image',
      f.decode,
    );
    expect(r2.ok && r2.file.type).toBe('image/jpeg');
  });

  it('rejects when nothing fits', async () => {
    const f = fake(6000, 6000, {
      sizes: { 'image/webp': 50 * MB, 'image/jpeg': 50 * MB },
    });
    expect(
      await prepareMediaFile(
        fileOf('image/jpeg', 12 * MB),
        'post_image',
        f.decode,
      ),
    ).toEqual({ ok: false, problem: cannotShrinkMessage });
  });

  it('reports a failing encoder', async () => {
    const f = fake(6000, 6000);
    f.encode.mockRejectedValue(new Error('boom'));
    const r = await prepareMediaFile(
      fileOf('image/jpeg', MB),
      'post_image',
      f.decode,
    );
    expect(r).toEqual({ ok: false, problem: cannotShrinkMessage });
    const g = fake(6000, 6000);
    g.image.hasAlpha = vi.fn();
    const decode = async () => ({
      ...g.image,
      width: 6000,
      encode: () => {
        throw new Error('x');
      },
    });
    expect(
      await prepareMediaFile(fileOf('image/jpeg', MB), 'post_image', decode),
    ).toEqual({ ok: false, problem: cannotPrepareMessage });
  });

  it('passes an undecodable in-limit file on, rejects an undecodable oversize one', async () => {
    const none = async () => null;
    const small = fileOf('image/jpeg', 2 * MB);
    expect(await prepareMediaFile(small, 'post_image', none)).toEqual({
      ok: true,
      file: small,
      resized: false,
    });
    expect(
      await prepareMediaFile(fileOf('image/jpeg', 11 * MB), 'post_image', none),
    ).toEqual({ ok: false, problem: 'Choose a photo up to 10 MB.' });
    const throws = async () => {
      throw new Error('oom');
    };
    expect((await prepareMediaFile(small, 'post_image', throws)).ok).toBe(true);
  });
});

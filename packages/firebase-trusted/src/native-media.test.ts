import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { NativeMediaError, uploadRejectionReason } from './native-media.js';

describe('uploadRejectionReason', () => {
  it('maps the real sharp pixel-limit error', async () => {
    const png = await sharp({
      create: { width: 100, height: 100, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();
    const error = await sharp(png, { limitInputPixels: 50 })
      .metadata()
      .catch((caught: unknown) => caught);
    expect(uploadRejectionReason(error)).toBe('TOO_MANY_PIXELS');
  });

  it('maps everything else to UNDECODABLE without leaking the message', () => {
    expect(uploadRejectionReason(new Error('Input buffer is bad'))).toBe(
      'UNDECODABLE',
    );
    expect(uploadRejectionReason('weird')).toBe('UNDECODABLE');
  });

  it('keeps the reason off non-upload errors', () => {
    expect(new NativeMediaError('MISMATCH').reason).toBeUndefined();
    expect(new NativeMediaError('INVALID', 'WRONG_TYPE').reason).toBe(
      'WRONG_TYPE',
    );
  });
});

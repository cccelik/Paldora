import {
  CAMERA_MAX_EDGE,
  fitWithin,
  problemFromError,
  unsupportedReason,
} from '@/lib/media/camera';
import { describe, expect, it } from 'vitest';
describe('fitWithin', () => {
  it('keeps frames that already fit', () => {
    expect(fitWithin({ width: 640, height: 480 })).toEqual({
      width: 640,
      height: 480,
    });
    expect(fitWithin({ width: 1280, height: 720 })).toEqual({
      width: 1280,
      height: 720,
    });
  });

  it('scales the longest edge down to the limit, keeping the ratio', () => {
    expect(fitWithin({ width: 1920, height: 1080 })).toEqual({
      width: CAMERA_MAX_EDGE,
      height: 720,
    });
    expect(fitWithin({ width: 3024, height: 4032 })).toEqual({
      width: 960,
      height: CAMERA_MAX_EDGE,
    });
  });

  it('never returns a zero edge for a thin frame, nor upscales', () => {
    expect(fitWithin({ width: 10_000, height: 1 })).toEqual({
      width: CAMERA_MAX_EDGE,
      height: 1,
    });
    expect(fitWithin({ width: 2, height: 3 }, 100)).toEqual({
      width: 2,
      height: 3,
    });
  });

  it('reports an empty size for a video with no frame yet', () => {
    expect(fitWithin({ width: 0, height: 0 })).toEqual({ width: 0, height: 0 });
  });
});

describe('problemFromError', () => {
  it.each([
    ['NotAllowedError', 'blocked', 'Camera access was blocked'],
    ['SecurityError', 'blocked', 'Camera access was blocked'],
    ['NotFoundError', 'missing', 'No camera found'],
    ['OverconstrainedError', 'missing', 'No camera found'],
    ['NotReadableError', 'busy', 'The camera is busy'],
    ['AbortError', 'unknown', 'The camera didn’t start'],
  ])('%s → %s', (name, kind, title) => {
    const problem = problemFromError(new DOMException('x', name));
    expect(problem.kind).toBe(kind);
    expect(problem.title).toBe(title);
  });

  it('treats anything else as unknown and always points to emoji', () => {
    for (const error of [undefined, 'nope', { name: 42 }, new Error('x')]) {
      const problem = problemFromError(error);
      expect(problem.kind).toBe('unknown');
      expect(problem.detail).toContain('emoji');
    }
  });

  it('offers Try again when the person can fix it', () => {
    expect(problemFromError({ name: 'NotAllowedError' }).retry).toBe(true);
  });
});

describe('unsupportedReason', () => {
  it('needs a secure context first, then getUserMedia', () => {
    expect(
      unsupportedReason({ isSecureContext: false, hasGetUserMedia: true })
        ?.title,
    ).toBe('Camera needs HTTPS');
    expect(
      unsupportedReason({ isSecureContext: false, hasGetUserMedia: true })
        ?.retry,
    ).toBe(false);
    expect(
      unsupportedReason({ isSecureContext: true, hasGetUserMedia: false })
        ?.title,
    ).toBe('No camera found');
    expect(
      unsupportedReason({ isSecureContext: true, hasGetUserMedia: true }),
    ).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { boundedBody } from './bounded-body';

describe('boundedBody', () => {
  it('accepts exactly the declared bytes', async () => {
    const request = new Request('https://example.invalid/media', {
      method: 'PUT',
      body: new Uint8Array([1, 2, 3]),
    });
    expect(await boundedBody(request, 3, 3)).toEqual(Buffer.from([1, 2, 3]));
  });

  it('rejects an oversized stream before reading its remaining chunks', async () => {
    let nextRead = 0;
    const request = new Request('https://example.invalid/media', {
      method: 'PUT',
      body: new ReadableStream({
        pull(controller) {
          nextRead += 1;
          if (nextRead === 1) controller.enqueue(new Uint8Array([1, 2, 3]));
          else if (nextRead === 2) controller.enqueue(new Uint8Array([4, 5]));
          else controller.close();
        },
      }),
      duplex: 'half',
    } as RequestInit);
    expect(await boundedBody(request, 4, 4)).toBeNull();
  });
});

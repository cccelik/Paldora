/* eslint-disable no-await-in-loop -- Stream chunks must be read and capped in order. */
/** Buffers one small upload, rejecting a body that exceeds its declared size. */
export async function boundedBody(
  request: Request,
  expectedLength: number,
  maxBytes: number,
): Promise<Buffer | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > expectedLength || received > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return received === expectedLength ? Buffer.concat(chunks, received) : null;
}

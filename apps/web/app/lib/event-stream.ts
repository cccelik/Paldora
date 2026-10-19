export interface ServerEvent {
  readonly event: string;
  readonly data: string;
}

function parseBlock(block: string): ServerEvent | null {
  let event = 'message';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line === '' || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }
  return data.length > 0 ? { event, data: data.join('\n') } : null;
}

/**
 * Reads a `text/event-stream` body. Handles chunks that split an event,
 * CRLF line endings, comment lines, and multi-line data.
 */
export async function* readEventStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ServerEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      // Each read depends on the previous one by definition of a stream.
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) return;
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(
        /\r\n?/g,
        '\n',
      );
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        const parsed = parseBlock(block);
        if (parsed) yield parsed;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

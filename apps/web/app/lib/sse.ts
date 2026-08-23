export interface ServerSentEvent {
  type: string;
  data: string;
  id: string | null;
}

export function parseServerSentEvents(input: string): {
  events: ServerSentEvent[];
  remainder: string;
} {
  const events: ServerSentEvent[] = [];
  let consumed = 0;
  const boundary = /\r?\n\r?\n/g;
  for (const match of input.matchAll(boundary)) {
    const index = match.index;
    const block = input.slice(consumed, index);
    consumed = index + match[0].length;
    const event = parseBlock(block);
    if (event) events.push(event);
  }
  return { events, remainder: input.slice(consumed) };
}

function parseBlock(block: string): ServerSentEvent | null {
  let type = 'message';
  let id: string | null = null;
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue;
    const separator = line.indexOf(':');
    const field = separator === -1 ? line : line.slice(0, separator);
    const rawValue = separator === -1 ? '' : line.slice(separator + 1);
    const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;
    if (field === 'event') type = value;
    if (field === 'id') id = value;
    if (field === 'data') data.push(value);
  }
  if (data.length === 0) return null;
  return { type, id, data: data.join('\n') };
}

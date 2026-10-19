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

// SSE fields are a small protocol state machine; each branch represents a
// distinct wire-level field rather than application business complexity.
function parseBlock(block: string): ServerSentEvent | null {
  const event: ServerSentEvent = { type: 'message', id: null, data: '' };
  const dataLines: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    const field = parseField(line);
    if (field) applyField(event, dataLines, field);
  }
  if (dataLines.length === 0) return null;
  event.data = dataLines.join('\n');
  return event;
}

interface ParsedField {
  name: string;
  value: string;
}

function parseField(line: string): ParsedField | null {
  if (!line || line.startsWith(':')) return null;
  const separator = line.indexOf(':');
  const name = separator === -1 ? line : line.slice(0, separator);
  const rawValue = separator === -1 ? '' : line.slice(separator + 1);
  return {
    name,
    value: rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue,
  };
}

function applyField(
  event: ServerSentEvent,
  dataLines: string[],
  field: ParsedField,
): void {
  if (field.name === 'event') event.type = field.value;
  else if (field.name === 'id') event.id = field.value;
  else if (field.name === 'data') dataLines.push(field.value);
}

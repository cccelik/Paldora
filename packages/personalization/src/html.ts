import { parseFragment, type DefaultTreeAdapterMap } from 'parse5';
import { boundedSource } from './css.js';

const TAGS = new Set([
  'p',
  'h2',
  'h3',
  'span',
  'strong',
  'em',
  'ul',
  'ol',
  'li',
  'br',
  'blockquote',
  'pre',
  'code',
]);
type Node = DefaultTreeAdapterMap['childNode'];
function escapeText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function compileRoomHtml(source: string): string {
  boundedSource(source);
  let invalid = false;
  const root = parseFragment(source, {
    onParseError: () => {
      invalid = true;
    },
  });
  if (invalid) throw new Error('Malformed HTML');
  let count = 0;
  function serialize(node: Node, depth: number): string {
    if (++count > 128 || depth > 8) throw new Error('Widget is too complex');
    if (node.nodeName === '#text' && 'value' in node)
      return escapeText(node.value);
    if (
      !('tagName' in node) ||
      !TAGS.has(node.tagName) ||
      node.attrs.length ||
      node.namespaceURI !== 'http://www.w3.org/1999/xhtml'
    ) {
      throw new Error('Unsupported HTML');
    }
    const children = node.childNodes
      .map((child) => serialize(child, depth + 1))
      .join('');
    return node.tagName === 'br'
      ? '<br>'
      : `<${node.tagName}>${children}</${node.tagName}>`;
  }
  const html = root.childNodes.map((node) => serialize(node, 1)).join('');
  if (new TextEncoder().encode(html).length > 32768)
    throw new Error('Output too large');
  return html;
}

/** Parent retrieves authorized bytes; the opaque iframe receives no capabilities. */
export function widgetDocument(html: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'none'; img-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><meta name="referrer" content="no-referrer"><title>Room widget</title></head><body>${html}</body></html>`;
}

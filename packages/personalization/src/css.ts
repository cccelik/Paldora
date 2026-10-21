import postcss from 'postcss';

/** Exact spellings only: no selector/value parsing ambiguities or URL-bearing values. */
export const CSS_TARGETS = {
  '.room-title': '.pal-custom-title',
  '.room-card': '.pal-custom-card',
  '.room-text': '.pal-custom-text',
} as const;
const VALUES: Readonly<Record<string, readonly string[]>> = {
  'font-weight': ['400', '500', '600', '700'],
  'font-style': ['normal', 'italic'],
  'text-align': ['left', 'center', 'right'],
  'line-height': ['1.4', '1.5', '1.6', '1.8'],
  'letter-spacing': ['0', '0.02em', '0.05em', '0.1em'],
};
export function boundedSource(source: string): void {
  if (new TextEncoder().encode(source).length > 8192) {
    throw new Error('Source exceeds 8 KiB');
  }
}

export function compileRoomCss(source: string, ownerId: string): string {
  boundedSource(source);
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(ownerId)) {
    throw new Error('Invalid scope');
  }
  const root = postcss.parse(source);
  if (root.nodes.length > 64) throw new Error('Too many rules');
  let declarations = 0;
  return root.nodes
    .map((rule) => {
      if (rule.type !== 'rule') throw new Error('Only rules are supported');
      if (!Object.hasOwn(CSS_TARGETS, rule.selector))
        throw new Error('Unsupported selector');
      const target = CSS_TARGETS[rule.selector as keyof typeof CSS_TARGETS];
      if (!target) throw new Error('Unsupported selector');
      const body = rule.nodes
        .map((node) => {
          if (node.type !== 'decl' || node.important || ++declarations > 256) {
            throw new Error('Unsupported declaration');
          }
          if (!VALUES[node.prop]?.includes(node.value)) {
            throw new Error('Unsupported property or value');
          }
          return `${node.prop}:${node.value};`;
        })
        .join('');
      return `.room-canvas[data-personalization="${ownerId}"] ${target}{${body}}`;
    })
    .join('\n');
}

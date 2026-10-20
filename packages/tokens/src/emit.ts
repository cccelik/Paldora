import type { ResolvedToken, TokenValue } from './resolve.js';
import { accentFor, readRoomThemeTokens } from './room-themes.js';

const header =
  'Generated from design/tokens/paldora.tokens.json by `pnpm tokens:generate`. Do not edit.';

const kebab = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/\./g, '-')
    .toLowerCase();

function cssValue(token: ResolvedToken): string {
  if (token.type === 'cubicBezier' && Array.isArray(token.value)) {
    return `cubic-bezier(${token.value.join(', ')})`;
  }
  if (token.type === 'fontFamily' && Array.isArray(token.value)) {
    return token.value
      .map((family) => (/\s/.test(String(family)) ? `'${family}'` : family))
      .join(', ');
  }
  return String(token.value);
}

function themeBlock(tokens: readonly ResolvedToken[], mode: string): string {
  return tokens
    .filter((token) => token.path.startsWith(`theme.${mode}.`))
    .map(
      (token) =>
        `  --pal-${kebab(token.path.slice(`theme.${mode}.`.length))}: ${cssValue(token)};`,
    )
    .join('\n');
}

/**
 * Primitives become `--pal-<path>` custom properties. Semantic theme tokens
 * become `--pal-<name>` and switch with `data-appearance` or, when the user
 * chose "system", with `prefers-color-scheme`.
 */
export function emitCss(tokens: readonly ResolvedToken[]): string {
  const primitives = tokens
    // Room tokens never reach the shell; they live in room-themes.css.
    .filter(
      (token) =>
        !token.path.startsWith('theme.') && !token.path.startsWith('room.'),
    )
    .map((token) => `  --pal-${kebab(token.path)}: ${cssValue(token)};`)
    .join('\n');
  const light = themeBlock(tokens, 'light');
  const dark = themeBlock(tokens, 'dark');
  return `/* ${header} */
:root {
${primitives}
}

:root,
[data-appearance='light'] {
  color-scheme: light;
${light}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-appearance='light']) {
    color-scheme: dark;
${dark.replace(/^ {2}/gm, '    ')}
  }
}

[data-appearance='dark'] {
  color-scheme: dark;
${dark}
}
`;
}

const fontStack = (families: readonly string[]) =>
  families
    .map((family) => (/\s/.test(family) ? `'${family}'` : family))
    .join(', ');

/**
 * Room themes as static CSS selected by `data-*` attributes on
 * `.room-canvas` (ADR 017). No color is ever computed from user input, and
 * nothing here needs an inline style, so the strict CSP holds. The preset
 * sets the surface colors, the scheme picks each accent's side, and the
 * font key picks a system stack.
 */
export function emitRoomCss(tokens: readonly ResolvedToken[]): string {
  const { presets, accents, fonts } = readRoomThemeTokens(tokens);
  const presetRules = presets.map(
    ({ id, colors }) => `.room-canvas[data-room-theme='${id}'] {
  --room-canvas: ${colors.canvas};
  --room-surface: ${colors.surface};
  --room-text: ${colors.text};
  --room-text-muted: ${colors.textMuted};
  --room-border: ${colors.border};
}`,
  );
  const schemeRules = (['light', 'dark'] as const).map(
    (scheme) => `.room-canvas[data-room-scheme='${scheme}'] {
  color-scheme: ${scheme};
}`,
  );
  const accentRules = (['light', 'dark'] as const).flatMap((scheme) =>
    accents.map(
      (accent) =>
        `.room-canvas[data-room-scheme='${scheme}'][data-room-accent='${accent.key}'] {
  --room-accent: ${accentFor(accent, scheme)};
}`,
    ),
  );
  const fontRules = fonts.map(
    ({ key, families }) => `.room-canvas[data-room-font='${key}'] {
  --room-font: ${fontStack(families)};
}`,
  );
  return `/* ${header} */
${[...presetRules, ...schemeRules, ...accentRules, ...fontRules].join('\n\n')}
`;
}

export function emitTypeScript(tokens: readonly ResolvedToken[]): string {
  const entries = tokens
    .map(
      (token) =>
        `  ${JSON.stringify(token.path)}: ${JSON.stringify(token.value)},`,
    )
    .join('\n');
  return `// ${header}
export const tokens = {
${entries}
} as const;

export type TokenPath = keyof typeof tokens;
`;
}

const identifier = (path: string) =>
  path
    .split('.')
    .map((part, index) =>
      index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join('')
    .replace(/^(\d)/, '_$1');

function nativeLiteral(
  value: TokenValue,
  language: 'swift' | 'kotlin',
): string {
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    const items = value.map((item) => JSON.stringify(item)).join(', ');
    return language === 'swift' ? `[${items}]` : `listOf(${items})`;
  }
  return JSON.stringify(value);
}

/**
 * Raw token values for the native apps. Phase 10/11 adds idiomatic Color and
 * dimension adapters on top; these files only guarantee identical values.
 */
export function emitSwift(tokens: readonly ResolvedToken[]): string {
  const lines = tokens
    .map(
      (token) =>
        `    public static let ${identifier(token.path)} = ${nativeLiteral(token.value, 'swift')}`,
    )
    .join('\n');
  return `// ${header}
public enum PaldoraTokens {
${lines}
}
`;
}

export function emitKotlin(tokens: readonly ResolvedToken[]): string {
  const lines = tokens
    .map(
      (token) =>
        `    val ${identifier(token.path)} = ${nativeLiteral(token.value, 'kotlin')}`,
    )
    .join('\n');
  return `// ${header}
package app.paldora.tokens

object PaldoraTokens {
${lines}
}
`;
}

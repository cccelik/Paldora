import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast.js';
import { emitCss } from './emit.js';
import { resolveTokens } from './resolve.js';

const readDesignFile = (name: string) =>
  JSON.parse(
    readFileSync(
      fileURLToPath(new URL(`../../../design/tokens/${name}`, import.meta.url)),
      'utf8',
    ),
  ) as Record<string, unknown>;

const tokens = resolveTokens(readDesignFile('paldora.tokens.json'));
const byPath = new Map(tokens.map((token) => [token.path, token.value]));
const { pairs } = readDesignFile('contrast-pairs.json') as {
  pairs: [string, string, number][];
};

describe('token resolution', () => {
  it('resolves aliases to concrete values', () => {
    expect(byPath.get('theme.light.canvas')).toBe('#FAF7EF');
    expect(byPath.get('theme.dark.accentText')).toBe('#C79A3B');
  });

  it('rejects dangling aliases and cycles', () => {
    expect(() =>
      resolveTokens({ color: { $type: 'color', a: { $value: '{color.b}' } } }),
    ).toThrow(/Unknown token alias/);
    expect(() =>
      resolveTokens({
        color: {
          $type: 'color',
          a: { $value: '{color.b}' },
          b: { $value: '{color.a}' },
        },
      }),
    ).toThrow(/cycle/);
  });

  it('gives light and dark themes the same semantic names', () => {
    const names = (mode: string) =>
      tokens
        .filter((token) => token.path.startsWith(`theme.${mode}.`))
        .map((token) => token.path.split('.').at(-1))
        .sort();
    expect(names('dark')).toEqual(names('light'));
  });
});

describe('WCAG 2.2 AA contrast', () => {
  it.each(pairs)('%s on %s meets %s:1', (foreground, background, minimum) => {
    const ratio = contrastRatio(
      String(byPath.get(foreground)),
      String(byPath.get(background)),
    );
    expect(ratio).toBeGreaterThanOrEqual(minimum);
  });

  it('computes known reference ratios', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
  });
});

describe('CSS output', () => {
  it('switches appearance by attribute and by system preference', () => {
    const css = emitCss(tokens);
    expect(css).toContain("[data-appearance='dark']");
    expect(css).toContain(":root:not([data-appearance='light'])");
    expect(css).toContain('--pal-color-brand-gold: #C79A3B;');
    expect(css).toContain(
      '--pal-easing-standard: cubic-bezier(0.2, 0.8, 0.2, 1);',
    );
  });
});

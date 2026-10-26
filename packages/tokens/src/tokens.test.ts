import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast.js';
import { emitCss, emitKotlin, emitSwift } from './emit.js';
import { resolveTokens } from './resolve.js';
import { readRoomThemeTokens } from './room-themes.js';

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

describe('native output', () => {
  const swift = emitSwift(tokens);
  const kotlin = emitKotlin(tokens);

  it('has no unit strings; dimensions and durations are numbers', () => {
    for (const output of [swift, kotlin]) {
      expect(output).not.toMatch(/\d(px|rem|em|ms)\b/);
      expect(output).not.toMatch(/"#[0-9A-F]{6,8}"/i);
    }
    expect(swift).toContain('public static let space1: CGFloat = 4');
    expect(swift).toContain('durationFast: TimeInterval = 0.12');
    expect(kotlin).toContain('const val space1: Float = 4f');
    expect(kotlin).toContain('const val durationFast: Int = 120');
    expect(kotlin).toContain('const val fontSizeBody: Float = 16f');
  });

  it('emits colors as ARGB values', () => {
    expect(swift).toContain(
      'colorBrandGold: PaldoraColor = PaldoraColor(argb: 0xFFC79A3B)',
    );
    expect(kotlin).toContain('const val colorBrandGold: Long = 0xFFC79A3BL');
  });

  it('emits every Room preset, accent and font', () => {
    const { presets, accents, fonts } = readRoomThemeTokens(tokens);
    expect(presets).toHaveLength(14);
    for (const { id, colors } of presets) {
      expect(swift).toContain(`id: "${id}"`);
      expect(kotlin).toContain(`id = "${id}"`);
      const canvas = colors.canvas.slice(1).toUpperCase();
      expect(swift).toContain(`canvas: PaldoraColor(argb: 0xFF${canvas})`);
      expect(kotlin).toContain(`canvas = 0xFF${canvas}L`);
    }
    for (const { key } of [...accents, ...fonts]) {
      expect(swift).toContain(`key: "${key}"`);
      expect(kotlin).toContain(`("${key}"`);
    }
  });

  it('keeps Room tokens out of the flat constants', () => {
    expect(swift).not.toMatch(/static let room[A-Z]/);
    expect(kotlin).not.toMatch(/val room[A-Z]/);
  });
});

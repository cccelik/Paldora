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
const { pairs, exceptions } = readDesignFile('contrast-pairs.json') as {
  pairs: [string, string, number][];
  exceptions: [string, string, number, string][];
};

describe('token resolution', () => {
  it('resolves aliases to concrete values', () => {
    expect(byPath.get('theme.light.bg.canvas')).toBe('#F4EFE7');
    expect(byPath.get('theme.dark.accent.brassText')).toBe('#D9B26A');
    expect(byPath.get('deprecated.dark.accentText')).toBe('#D9B26A');
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

  it('keeps the inverse surface dark and the primary action flipping', () => {
    expect(byPath.get('theme.light.bg.inverse')).toBe('#2A2420');
    expect(byPath.get('theme.dark.bg.inverse')).toBe('#2C2621');
    expect(byPath.get('theme.light.text.onInverse')).toBe(
      byPath.get('theme.dark.text.onInverse'),
    );
    expect(byPath.get('theme.light.action.primary')).toBe('#2A2420');
    expect(byPath.get('theme.dark.action.primary')).toBe('#F2EBDF');
  });

  it('maps every deprecated alias to a v2 token of the same mode', () => {
    const v2 = new Set(
      tokens
        .filter((token) => token.path.startsWith('theme.'))
        .map((token) => token.value),
    );
    for (const token of tokens.filter((candidate) =>
      candidate.path.startsWith('deprecated.'),
    )) {
      expect(v2.has(token.value), token.path).toBe(true);
    }
  });

  it('defines the 15 Figma text styles with every property', () => {
    const styles = new Set(
      tokens
        .filter((token) => token.path.startsWith('type.'))
        .map((token) => token.path.split('.')[1]),
    );
    expect(styles.size).toBe(15);
    for (const style of styles) {
      for (const key of [
        'fontFamily',
        'fontWeight',
        'fontSize',
        'lineHeight',
      ]) {
        expect(byPath.has(`type.${style}.${key}`), `${style}.${key}`).toBe(
          true,
        );
      }
    }
    expect(byPath.get('type.displayXl.fontSize')).toBe('76px');
    expect(byPath.get('type.displayXl.lineHeight')).toBe('78px');
    expect(byPath.get('type.eyebrow.tracking')).toBe('0.14em');
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

  it.each(exceptions)(
    'documented shortfall %s on %s stays between %s and 4.5',
    (foreground, background, floor) => {
      const ratio = contrastRatio(
        String(byPath.get(foreground)),
        String(byPath.get(background)),
      );
      expect(ratio).toBeGreaterThanOrEqual(floor);
      expect(ratio).toBeLessThan(4.5);
    },
  );

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
    expect(css).toContain('--pal-bg-canvas: #F4EFE7;');
    expect(css).toContain('--pal-canvas: #F4EFE7;');
    expect(css).toContain(
      '--pal-elevation-soft: 0px 6px 24px 0px rgba(61, 43, 26, 0.07);',
    );
    expect(css).toContain(
      '--pal-elevation-lift: 0px 14px 36px 0px rgba(51, 33, 18, 0.16);',
    );
    expect(css).toContain('--pal-font-ui: var(--font-geist, Geist),');
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
    expect(swift).toContain('typeTitleLFontSize: CGFloat = 26');
    expect(kotlin).toContain('const val layoutTabBarWidth: Float = 370f');
  });

  it('emits colors as ARGB values', () => {
    expect(swift).toContain(
      'themeLightBgCanvas: PaldoraColor = PaldoraColor(argb: 0xFFF4EFE7)',
    );
    expect(kotlin).toContain(
      'const val themeLightBgCanvas: Long = 0xFFF4EFE7L',
    );
  });

  it('pairs Light and Dark per semantic color', () => {
    expect(swift).toContain(
      'public static let bgCanvas = PaldoraSemanticColor(light: PaldoraColor(argb: 0xFFF4EFE7), dark: PaldoraColor(argb: 0xFF14110E))',
    );
    expect(kotlin).toContain('object PaldoraLightColors');
    expect(kotlin).toContain('object PaldoraDarkColors');
    expect(kotlin).toContain('const val bgCanvas: Long = 0xFF14110EL');
  });

  it('keeps deprecated web aliases out of the native files', () => {
    expect(swift).not.toMatch(/deprecated/i);
    expect(kotlin).not.toMatch(/deprecated/i);
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

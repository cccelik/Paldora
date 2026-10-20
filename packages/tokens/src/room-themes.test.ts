import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast.js';
import { emitCss, emitRoomCss } from './emit.js';
import { resolveTokens } from './resolve.js';
import {
  accentFor,
  readRoomThemeTokens,
  roomIdFromTokenKey,
  roomSchemeOf,
  roomTokenKeyFromId,
} from './room-themes.js';

const tokens = resolveTokens(
  JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL('../../../design/tokens/paldora.tokens.json', import.meta.url),
      ),
      'utf8',
    ),
  ) as Record<string, unknown>,
);
const room = readRoomThemeTokens(tokens);

/** The ids `packages/domain` registers; the web test checks them again. */
const PRESET_IDS = [
  'obsidian_gold',
  'cream_paper',
  'lavender_dream',
  'ocean_glow',
  'daisy_day',
  'neon_night',
  'y2k_glitter',
  'dark_academia',
  'frutiger_aero',
  'tumblr_2014',
  'retro_windows',
  'cyberpunk',
  'minimal_editorial',
  'polaroid_scrapbook',
];
const ACCENT_KEYS = [
  'gold',
  'lavender',
  'ocean',
  'daisy',
  'pink',
  'emerald',
  'cyan',
  'crimson',
];

describe('room theme tokens', () => {
  it('define 14 presets, 8 accents, and 5 font stacks', () => {
    expect(room.presets.map((preset) => preset.id)).toEqual(PRESET_IDS);
    expect(room.accents.map((accent) => accent.key)).toEqual(ACCENT_KEYS);
    expect(room.fonts.map((font) => font.key)).toEqual([
      'editorial',
      'modern',
      'rounded',
      'mono',
      'handwritten',
    ]);
  });

  it.each(PRESET_IDS)('round-trips the id %s through its token key', (id) => {
    expect(roomIdFromTokenKey(roomTokenKeyFromId(id))).toBe(id);
  });

  it('uses system font stacks only, never a URL', () => {
    for (const font of room.fonts) {
      expect(font.families.at(-1)).toMatch(
        /^(serif|sans-serif|monospace|cursive)$/,
      );
      for (const family of font.families) {
        expect(family).not.toMatch(/url\(|\/|:/);
      }
    }
  });

  it('has both schemes among the presets', () => {
    const schemes = room.presets.map((preset) => roomSchemeOf(preset.colors));
    expect(schemes.filter((scheme) => scheme === 'dark')).toHaveLength(5);
    expect(schemes.filter((scheme) => scheme === 'light')).toHaveLength(9);
  });
});

const surfaces = (preset: (typeof room.presets)[number]) =>
  [
    ['canvas', preset.colors.canvas],
    ['surface', preset.colors.surface],
  ] as const;

describe('room theme contrast (WCAG 2.2 AA)', () => {
  const textCases = room.presets.flatMap((preset) =>
    surfaces(preset).flatMap(([name, background]) => [
      [preset.id, 'text', name, preset.colors.text, background, 4.5],
      [preset.id, 'textMuted', name, preset.colors.textMuted, background, 4.5],
      [preset.id, 'border', name, preset.colors.border, background, 3],
      // The canvas focus ring is drawn in the text color.
      [preset.id, 'focus', name, preset.colors.text, background, 3],
    ]),
  ) as [string, string, string, string, string, number][];

  it.each(textCases)(
    '%s %s on %s meets the minimum',
    (_preset, _role, _surface, foreground, background, minimum) => {
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(
        minimum,
      );
    },
  );

  const accentCases = room.presets.flatMap((preset) =>
    room.accents.map((accent) => [preset.id, accent.key, preset, accent]),
  ) as [
    string,
    string,
    (typeof room.presets)[number],
    (typeof room.accents)[number],
  ][];

  it.each(accentCases)(
    '%s with the %s accent meets 3:1 on canvas and surface',
    (_preset, _accent, preset, accent) => {
      const value = accentFor(accent, roomSchemeOf(preset.colors));
      for (const [, background] of surfaces(preset)) {
        expect(contrastRatio(value, background)).toBeGreaterThanOrEqual(3);
      }
    },
  );
});

describe('room-themes.css', () => {
  const css = emitRoomCss(tokens);

  it('scopes every rule to the Room canvas', () => {
    const selectors = [...css.matchAll(/^(.*)\{$/gm)].map((match) =>
      (match[1] ?? '').trim(),
    );
    expect(selectors.length).toBe(14 + 2 + 16 + 5);
    for (const selector of selectors) {
      expect(selector.startsWith('.room-canvas[data-room-')).toBe(true);
    }
  });

  it('emits the preset, accent, scheme, and font rules', () => {
    expect(css).toContain(".room-canvas[data-room-theme='tumblr_2014'] {");
    expect(css).toContain(
      ".room-canvas[data-room-scheme='dark'][data-room-accent='daisy'] {",
    );
    expect(css).toContain('color-scheme: dark;');
    expect(css).toMatch(/--room-font: Newsreader, 'Iowan Old Style'/);
    expect(css).not.toMatch(/url\(|@import|z-index/);
  });

  it('keeps room tokens out of the shell stylesheet', () => {
    expect(emitCss(tokens)).not.toMatch(/--pal-room-/);
  });
});

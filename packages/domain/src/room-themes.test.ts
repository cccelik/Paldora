import { describe, expect, it } from 'vitest';
import { ROOM_THEME_PRESETS, roomThemeRegistry } from './index.js';

const allowedVariables = new Set([
  '--room-canvas',
  '--room-text',
  '--room-accent',
  '--room-surface',
  '--room-border',
]);

describe('Room theme registry', () => {
  it('defines every Phase 7 theme exactly once with allowlisted CSS variables', () => {
    expect(ROOM_THEME_PRESETS).toHaveLength(14);
    expect(Object.keys(roomThemeRegistry).sort()).toEqual(
      [...ROOM_THEME_PRESETS].sort(),
    );
    for (const preset of ROOM_THEME_PRESETS) {
      const theme = roomThemeRegistry[preset];
      expect(theme.label).not.toBe('');
      expect(
        Object.keys(theme.variables).every((name) =>
          allowedVariables.has(name),
        ),
      ).toBe(true);
      expect(
        Object.values(theme.variables).every((value) =>
          /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value),
        ),
      ).toBe(true);
    }
  });

  it('keeps theme text above WCAG AA contrast on canvas and surfaces', () => {
    for (const theme of Object.values(roomThemeRegistry)) {
      expect(
        contrast(
          requiredColor(theme.variables['--room-text']),
          requiredColor(theme.variables['--room-canvas']),
        ),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(
          requiredColor(theme.variables['--room-text']),
          requiredColor(theme.variables['--room-surface']),
        ),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});

function requiredColor(value: string | undefined): string {
  if (!value) throw new Error('Theme color is missing.');
  return value;
}

function contrast(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort(
    (left, right) => right - left,
  );
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

function luminance(hex: string): number {
  const channels =
    hex
      .slice(1, 7)
      .match(/.{2}/g)
      ?.map((value) => Number.parseInt(value, 16) / 255) ?? [];
  const linear = channels.map((value) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return (
    0.2126 * (linear[0] ?? 0) +
    0.7152 * (linear[1] ?? 0) +
    0.0722 * (linear[2] ?? 0)
  );
}

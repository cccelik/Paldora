import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REACTION_PRESETS,
  isSingleEmoji,
  REACTION_PRESET_COUNT,
} from './reactions.js';

describe('isSingleEmoji', () => {
  it.each([
    ['simple', '👍'],
    ['variation selector', '❤️'],
    ['skin tone', '👍🏽'],
    ['ZWJ family', '👨‍👩‍👧‍👦'],
    ['ZWJ profession', '🧑‍💻'],
    ['flag', '🇹🇷'],
    ['keycap', '1️⃣'],
    ['hash keycap', '#️⃣'],
  ])('accepts a %s emoji', (_name, value) => {
    expect(isSingleEmoji(value)).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['whitespace', ' '],
    ['padded', ' 👍'],
    ['trailing space', '👍 '],
    ['two emoji', '👍👍'],
    ['emoji and text', '👍a'],
    ['plain text', 'a'],
    ['a digit', '1'],
    ['the camera marker', 'real'],
    ['too long', '👍'.repeat(40)],
  ])('rejects %s', (_name, value) => {
    expect(isSingleEmoji(value)).toBe(false);
  });

  it('accepts every default preset', () => {
    expect(DEFAULT_REACTION_PRESETS).toHaveLength(REACTION_PRESET_COUNT);
    expect(new Set(DEFAULT_REACTION_PRESETS).size).toBe(REACTION_PRESET_COUNT);
    for (const preset of DEFAULT_REACTION_PRESETS) {
      expect(isSingleEmoji(preset)).toBe(true);
    }
  });
});

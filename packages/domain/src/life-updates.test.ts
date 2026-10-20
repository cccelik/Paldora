import { describe, expect, it } from 'vitest';
import {
  LIFE_UPDATE_MAX_BOXES,
  LIFE_UPDATE_SECTION_KEYS,
  LIFE_UPDATE_SECTION_LABELS,
  LIFE_UPDATE_SECTION_MAX_LENGTH,
  LIFE_UPDATE_TOTAL_MAX_LENGTH,
} from './life-updates.js';
import { MEDIA_PURPOSE_POLICIES } from './media.js';

describe('Life Update sections', () => {
  it('has nine distinct keys the database validator accepts, each labelled', () => {
    expect(LIFE_UPDATE_SECTION_KEYS).toHaveLength(9);
    expect(new Set(LIFE_UPDATE_SECTION_KEYS).size).toBe(9);
    for (const key of LIFE_UPDATE_SECTION_KEYS) {
      // Mirrors paldora.life_update_sections_valid (migration 0006).
      expect(key).toMatch(/^[A-Za-z]{1,40}$/);
      expect(LIFE_UPDATE_SECTION_LABELS[key].length).toBeGreaterThan(0);
    }
    expect(Object.keys(LIFE_UPDATE_SECTION_LABELS)).toEqual([
      ...LIFE_UPDATE_SECTION_KEYS,
    ]);
  });

  it('fits every full section inside the total, and matches the DB bounds', () => {
    expect(LIFE_UPDATE_SECTION_MAX_LENGTH).toBe(2_000);
    expect(LIFE_UPDATE_TOTAL_MAX_LENGTH).toBe(10_000);
    expect(LIFE_UPDATE_MAX_BOXES).toBe(20);
  });
});

describe('life_update_image policy', () => {
  it('is user-scoped with the post photo limits and derivatives', () => {
    const policy = MEDIA_PURPOSE_POLICIES.life_update_image;
    expect(policy.scope).toBe('user');
    expect({ ...policy, scope: 'box' }).toEqual(
      MEDIA_PURPOSE_POLICIES.post_image,
    );
  });
});

import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createLifeUpdateSchema,
  updateLifeUpdateSchema,
} from './life-updates.js';

const boxes = (count: number) =>
  Array.from({ length: count }, () => randomUUID());
const toBoxes = (boxIds: string[]) => ({ type: 'boxes' as const, boxIds });
const parse = (body: unknown) => createLifeUpdateSchema.safeParse(body);

describe('createLifeUpdateSchema', () => {
  it('trims sections and drops empty ones', () => {
    const result = parse({
      audience: { type: 'only_me' },
      sections: { travel: '  Lisbon  ', reading: '   ' },
    });
    expect(result.success && result.data.sections).toEqual({
      travel: 'Lisbon',
    });
    expect(result.success && result.data.mediaAssetIds).toEqual([]);
  });

  it('accepts exactly 2,000 per section and 10,000 in total, and rejects one more', () => {
    const full = 'x'.repeat(2000);
    const five = {
      lifeLately: full,
      travel: full,
      reading: full,
      watching: full,
      whatsNext: full,
    };
    expect(
      parse({ audience: { type: 'only_me' }, sections: five }).success,
    ).toBe(true);
    expect(
      parse({
        audience: { type: 'only_me' },
        sections: { ...five, listeningTo: 'x' },
      }).success,
    ).toBe(false);
    expect(
      parse({ audience: { type: 'only_me' }, sections: { travel: `${full}x` } })
        .success,
    ).toBe(false);
  });

  it('requires a section or a photo', () => {
    expect(parse({ audience: { type: 'only_me' } }).success).toBe(false);
    expect(
      parse({ audience: { type: 'only_me' }, sections: { travel: ' ' } })
        .success,
    ).toBe(false);
    expect(
      parse({ audience: { type: 'only_me' }, mediaAssetIds: [randomUUID()] })
        .success,
    ).toBe(true);
  });

  it('accepts 1–20 distinct Boxes only', () => {
    const sections = { travel: 'x' };
    expect(parse({ audience: toBoxes(boxes(20)), sections }).success).toBe(
      true,
    );
    expect(parse({ audience: toBoxes(boxes(21)), sections }).success).toBe(
      false,
    );
    expect(parse({ audience: toBoxes([]), sections }).success).toBe(false);
    const id = randomUUID();
    expect(parse({ audience: toBoxes([id, id]), sections }).success).toBe(
      false,
    );
    // Case does not make one Box two.
    expect(
      parse({ audience: toBoxes([id, id.toUpperCase()]), sections }).success,
    ).toBe(false);
  });

  it('rejects unknown sections, extra keys, and Boxes on Only Me', () => {
    const audience = { type: 'only_me' };
    expect(parse({ audience, sections: { mood: 'x' } }).success).toBe(false);
    expect(
      parse({ audience, sections: { travel: 'x' }, pinned: true }).success,
    ).toBe(false);
    expect(
      parse({
        audience: { type: 'only_me', boxIds: [randomUUID()] },
        sections: { travel: 'x' },
      }).success,
    ).toBe(false);
  });

  it('rejects more than four or repeated photos', () => {
    const audience = { type: 'only_me' };
    expect(parse({ audience, mediaAssetIds: boxes(5) }).success).toBe(false);
    const id = randomUUID();
    expect(parse({ audience, mediaAssetIds: [id, id] }).success).toBe(false);
  });
});

describe('updateLifeUpdateSchema', () => {
  const photo = randomUUID();
  const update = (body: unknown) => updateLifeUpdateSchema.safeParse(body);

  it('takes either part alone, trimmed, and lowercases photo IDs', () => {
    const sections = update({ sections: { travel: '  Rome ', reading: ' ' } });
    expect(sections.success && sections.data).toEqual({
      sections: { travel: 'Rome' },
    });
    const photos = update({ mediaAssetIds: [photo.toUpperCase()] });
    expect(photos.success && photos.data).toEqual({ mediaAssetIds: [photo] });
    // Clearing one part is allowed here; the service checks what is left.
    expect(update({ mediaAssetIds: [] }).success).toBe(true);
    expect(update({ sections: {} }).success).toBe(true);
  });

  it('rejects an empty body, an empty result, and any audience', () => {
    for (const body of [
      {},
      { sections: {}, mediaAssetIds: [] },
      { sections: { travel: '   ' }, mediaAssetIds: [] },
      { sections: { travel: 'x' }, audience: { type: 'only_me' } },
      { audience: { type: 'boxes', boxIds: [randomUUID()] } },
    ]) {
      expect(update(body).success, JSON.stringify(body)).toBe(false);
    }
  });

  it('keeps the create limits on sections and photos', () => {
    for (const body of [
      { sections: { travel: 'x'.repeat(2001) } },
      { sections: { favouriteColour: 'blue' } },
      { mediaAssetIds: [photo, photo] },
      { mediaAssetIds: Array.from({ length: 5 }, () => randomUUID()) },
    ]) {
      expect(update(body).success, JSON.stringify(body)).toBe(false);
    }
  });
});

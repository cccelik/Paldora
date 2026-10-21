import { DEFAULT_ROOM_WIDGETS } from '@paldora/domain';
import { describe, expect, it } from 'vitest';
import {
  roomBannerInputSchema,
  roomSettingsFormSchema,
  roomTopFriendsFormSchema,
  roomWidgetsFormSchema,
} from './room-forms';

const VERSION = '2026-10-20T10:00:00.123456Z';
const FRIEND = '0A7C1D6E-2F13-4D8B-9F54-5C3E6D1B7A22';

describe('roomSettingsFormSchema', () => {
  it('turns the appearance form into a PATCH, empty choices following the theme', () => {
    const parsed = roomSettingsFormSchema.parse({
      section: 'appearance',
      themePreset: 'neon_night',
      layout: 'single',
      accent: '',
      font: 'mono',
      decorationPack: '',
      sparkles: 'on',
      expectedUpdatedAt: VERSION,
    });
    expect(parsed).toEqual({
      themePreset: 'neon_night',
      layout: 'single',
      accent: null,
      font: 'mono',
      decorationPack: null,
      sparkles: true,
      expectedUpdatedAt: VERSION,
    });
  });

  it('reads an unchecked sparkles box as off and an empty version as never saved', () => {
    const parsed = roomSettingsFormSchema.parse({
      section: 'appearance',
      themePreset: 'cream_paper',
      layout: 'two_column',
      expectedUpdatedAt: '',
    });
    expect(parsed).toMatchObject({ sparkles: false, expectedUpdatedAt: null });
  });

  it('rejects values outside the shared allowlists', () => {
    for (const change of [
      { themePreset: 'custom_css' },
      { layout: 'grid' },
      { accent: '#ff0000' },
    ]) {
      const result = roomSettingsFormSchema.safeParse({
        section: 'appearance',
        themePreset: 'cream_paper',
        layout: 'single',
        expectedUpdatedAt: '',
        ...change,
      });
      expect(result.success, JSON.stringify(change)).toBe(false);
    }
  });

  it('sends the audience alone', () => {
    expect(
      roomSettingsFormSchema.parse({
        section: 'audience',
        visibility: 'members',
        expectedUpdatedAt: VERSION,
      }),
    ).toEqual({ visibility: 'members', expectedUpdatedAt: VERSION });
    expect(
      roomSettingsFormSchema.safeParse({
        section: 'audience',
        visibility: 'everyone',
        expectedUpdatedAt: VERSION,
      }).success,
    ).toBe(false);
  });

  it('clears empty about fields and normalizes the music link', () => {
    expect(
      roomSettingsFormSchema.parse({
        section: 'about',
        location: '  ',
        currently: 'Reading',
        musicUrl: 'https://Music.Example.com/track/1',
        musicTitle: 'Song',
        musicArtist: '',
        expectedUpdatedAt: VERSION,
      }),
    ).toEqual({
      location: null,
      currently: 'Reading',
      music: {
        url: 'https://music.example.com/track/1',
        title: 'Song',
        artist: null,
      },
      expectedUpdatedAt: VERSION,
    });
    expect(
      roomSettingsFormSchema.parse({
        section: 'about',
        expectedUpdatedAt: VERSION,
      }),
    ).toEqual({
      location: null,
      currently: null,
      music: null,
      expectedUpdatedAt: VERSION,
    });
  });

  it('refuses unsafe music links and a title without a link', () => {
    for (const musicUrl of [
      'http://music.example.com/track/1',
      'javascript:alert(1)',
      'https://user:pass@music.example.com/',
      'https://127.0.0.1/track',
    ]) {
      const result = roomSettingsFormSchema.safeParse({
        section: 'about',
        musicUrl,
        expectedUpdatedAt: VERSION,
      });
      expect(result.success, musicUrl).toBe(false);
    }
    const orphan = roomSettingsFormSchema.safeParse({
      section: 'about',
      musicTitle: 'Song',
      expectedUpdatedAt: VERSION,
    });
    expect(orphan.success).toBe(false);
    expect(orphan.error?.issues[0]?.message).toBe(
      'Add the song’s link, or clear its title and artist.',
    );
  });

  it('rejects an unknown section and a malformed version', () => {
    expect(
      roomSettingsFormSchema.safeParse({
        section: 'css',
        expectedUpdatedAt: VERSION,
      }).success,
    ).toBe(false);
    expect(
      roomSettingsFormSchema.safeParse({
        section: 'audience',
        visibility: 'friends',
        expectedUpdatedAt: 'yesterday',
      }).success,
    ).toBe(false);
  });
});

describe('roomBannerInputSchema', () => {
  it('attaches an id (lowercased) or removes with null', () => {
    expect(
      roomBannerInputSchema.parse({
        bannerMediaId: FRIEND,
        expectedUpdatedAt: VERSION,
      }),
    ).toEqual({
      bannerMediaId: FRIEND.toLowerCase(),
      expectedUpdatedAt: VERSION,
    });
    expect(
      roomBannerInputSchema.parse({
        bannerMediaId: null,
        expectedUpdatedAt: null,
      }),
    ).toEqual({ bannerMediaId: null, expectedUpdatedAt: null });
    expect(
      roomBannerInputSchema.safeParse({
        bannerMediaId: 'not-an-id',
        expectedUpdatedAt: VERSION,
      }).success,
    ).toBe(false);
  });
});

describe('roomWidgetsFormSchema', () => {
  it('parses the full widget list', () => {
    expect(
      roomWidgetsFormSchema.parse({
        widgets: JSON.stringify(DEFAULT_ROOM_WIDGETS),
        expectedUpdatedAt: '',
      }),
    ).toEqual({ widgets: DEFAULT_ROOM_WIDGETS, expectedUpdatedAt: null });
  });

  it('rejects broken JSON, a missing widget, and a repeated position', () => {
    const bad = [
      '{not json',
      JSON.stringify(DEFAULT_ROOM_WIDGETS.slice(1)),
      JSON.stringify(
        DEFAULT_ROOM_WIDGETS.map((widget) => ({ ...widget, position: 0 })),
      ),
    ];
    for (const widgets of bad) {
      expect(
        roomWidgetsFormSchema.safeParse({ widgets, expectedUpdatedAt: '' })
          .success,
        widgets,
      ).toBe(false);
    }
  });
});

describe('roomTopFriendsFormSchema', () => {
  it('parses the ordered ids, size, and audience', () => {
    expect(
      roomTopFriendsFormSchema.parse({
        userIds: JSON.stringify([FRIEND]),
        size: '4',
        visibility: 'friends',
        expectedUpdatedAt: VERSION,
      }),
    ).toEqual({
      userIds: [FRIEND.toLowerCase()],
      size: 4,
      visibility: 'friends',
      expectedUpdatedAt: VERSION,
    });
  });

  it('rejects a size outside 4, 8, 12 and more friends than the size', () => {
    const ids = Array.from(
      { length: 5 },
      (_, index) => `0a7c1d6e-2f13-4d8b-9f54-5c3e6d1b7a2${index}`,
    );
    for (const form of [
      { userIds: '[]', size: '5' },
      { userIds: JSON.stringify(ids), size: '4' },
      { userIds: JSON.stringify([FRIEND, FRIEND]), size: '4' },
    ]) {
      expect(
        roomTopFriendsFormSchema.safeParse({
          ...form,
          visibility: 'visible',
          expectedUpdatedAt: VERSION,
        }).success,
        JSON.stringify(form),
      ).toBe(false);
    }
  });
});

import {
  DEFAULT_ROOM_WIDGETS,
  ROOM_ACCENTS,
  ROOM_THEME_PRESETS,
  ROOM_WIDGET_TYPES,
} from '@paldora/domain';
import { describe, expect, it } from 'vitest';
import {
  isSafeMusicUrl,
  normalizeMusicUrl,
  roomAccentSchema,
  roomContentQuerySchema,
  roomMusicSchema,
  roomParamsSchema,
  roomSchema,
  roomThemePresetSchema,
  roomWidgetTypeSchema,
  updateRoomSchema,
  updateRoomTopFriendsSchema,
  updateRoomWidgetsSchema,
} from './rooms.js';

const VERSION = '2026-10-20T10:00:00.123456Z';
const ID = '6f1c1c43-5f43-4b0e-9b8a-3a0f8f7a2a10';
const idAt = (index: number) =>
  `6f1c1c43-5f43-4b0e-9b8a-${index.toString(16).padStart(12, '0')}`;

describe('music links', () => {
  it.each([
    'https://open.spotify.com/track/123?si=abc',
    'https://example.com',
    'https://music.example.co.uk/a/b#c',
    `https://example.com/${'a'.repeat(2048 - 'https://example.com/'.length)}`,
  ])('accepts %s', (url) => {
    expect(isSafeMusicUrl(url)).toBe(true);
  });

  it.each([
    ['http', 'http://example.com/song'],
    ['javascript', 'javascript:alert(1)'],
    ['data', 'data:text/html,<script>alert(1)</script>'],
    ['file', 'file:///etc/passwd'],
    ['uppercase scheme', 'HTTPS://example.com'],
    ['userinfo', 'https://user:pass@example.com/'],
    ['bare at', 'https://@example.com/'],
    ['whitespace', 'https://example.com/a song'],
    ['tab', 'https://example.com/a\tsong'],
    ['control character', 'https://example.com/\u0007'],
    ['backslash', 'https://example.com\\@evil.test/'],
    ['IPv4 literal', 'https://127.0.0.1/'],
    ['numeric IPv4 form', 'https://0x7f.1/'],
    ['IPv6 literal', 'https://[::1]/'],
    ['localhost', 'https://localhost/'],
    ['localhost subdomain', 'https://music.localhost/'],
    ['single-label host', 'https://intranet/'],
    ['2,049 characters', `https://example.com/${'a'.repeat(2049 - 20)}`],
    ['not a URL', 'https://'],
  ])('rejects %s', (_name, url) => {
    expect(isSafeMusicUrl(url)).toBe(false);
  });

  it('stores the normalized href, which passes the check again', () => {
    const stored = normalizeMusicUrl('  https://Example.COM/Song  ');
    expect(stored).toBe('https://example.com/Song');
    expect(isSafeMusicUrl(stored ?? '')).toBe(true);
  });

  it('bounds the title and artist at 120 and drops empty ones', () => {
    const ok = roomMusicSchema.parse({
      url: 'https://example.com/x',
      title: ` ${'t'.repeat(120)} `,
      artist: '   ',
    });
    expect(ok).toEqual({
      url: 'https://example.com/x',
      title: 't'.repeat(120),
      artist: null,
    });
    expect(
      roomMusicSchema.parse({ url: 'https://example.com/x' }),
    ).toMatchObject({ title: null, artist: null });
    for (const field of ['title', 'artist']) {
      expect(
        roomMusicSchema.safeParse({
          url: 'https://example.com/x',
          [field]: 'x'.repeat(121),
        }).success,
      ).toBe(false);
    }
    expect(
      roomMusicSchema.safeParse({
        url: 'https://example.com/x',
        embed: '<iframe>',
      }).success,
    ).toBe(false);
  });
});

describe('updateRoomSchema', () => {
  const parse = (body: Record<string, unknown>) =>
    updateRoomSchema.safeParse({ expectedUpdatedAt: VERSION, ...body });

  it('accepts a partial change and null overrides', () => {
    const result = parse({
      themePreset: 'cyberpunk',
      accent: null,
      font: null,
      decorationPack: null,
      bannerMediaId: ID.toUpperCase(),
    });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      themePreset: 'cyberpunk',
      accent: null,
      bannerMediaId: ID,
    });
  });

  it('requires expectedUpdatedAt, which may be null', () => {
    expect(updateRoomSchema.safeParse({ visibility: 'members' }).success).toBe(
      false,
    );
    expect(
      updateRoomSchema.safeParse({
        visibility: 'members',
        expectedUpdatedAt: null,
      }).success,
    ).toBe(true);
    expect(
      parse({ visibility: 'members', expectedUpdatedAt: 'yesterday' }).success,
    ).toBe(false);
  });

  it('rejects an empty change', () => {
    expect(parse({}).success).toBe(false);
    expect(updateRoomSchema.safeParse({}).success).toBe(false);
  });

  it.each([
    'css',
    'html',
    'script',
    'fontUrl',
    'backgroundUrl',
    'background',
    'customStyle',
  ])('rejects the unknown key %s', (key) => {
    expect(parse({ sparkles: true, [key]: 'x' }).success).toBe(false);
  });

  it.each([
    ['themePreset', 'vaporwave'],
    ['accent', '#ff00ff'],
    ['font', 'Comic Sans'],
    ['decorationPack', 'glitter'],
    ['layout', 'three_column'],
    ['visibility', 'public'],
    ['sparkles', 'yes'],
    ['bannerMediaId', 'not-a-uuid'],
  ])('rejects %s = %s', (key, value) => {
    expect(parse({ [key]: value }).success).toBe(false);
  });

  it('bounds location at 120 and currently at 240, and clears empties', () => {
    expect(parse({ location: 'x'.repeat(120) }).success).toBe(true);
    expect(parse({ location: 'x'.repeat(121) }).success).toBe(false);
    expect(parse({ currently: 'x'.repeat(240) }).success).toBe(true);
    expect(parse({ currently: 'x'.repeat(241) }).success).toBe(false);
    expect(parse({ location: '   ', currently: '' }).data).toMatchObject({
      location: null,
      currently: null,
    });
  });

  it('validates the music link inside the change', () => {
    expect(parse({ music: { url: 'http://example.com' } }).success).toBe(false);
    expect(parse({ music: null }).success).toBe(true);
  });
});

describe('updateRoomWidgetsSchema', () => {
  const widgets = DEFAULT_ROOM_WIDGETS.map((widget) => ({ ...widget }));
  const parse = (list: unknown) =>
    updateRoomWidgetsSchema.safeParse({
      widgets: list,
      expectedUpdatedAt: null,
    });

  it('accepts all seven types once at distinct positions', () => {
    expect(parse(widgets).success).toBe(true);
    expect(
      parse(
        widgets.map((widget, index) => ({ ...widget, position: 6 - index })),
      ).success,
    ).toBe(true);
  });

  it('rejects a duplicate type, a missing type, and an eighth widget', () => {
    expect(
      parse(
        widgets.map((widget, index) =>
          index === 1 ? { ...widget, type: 'currently' } : widget,
        ),
      ).success,
    ).toBe(false);
    expect(parse(widgets.slice(0, 6)).success).toBe(false);
    expect(parse([...widgets, widgets[0]]).success).toBe(false);
  });

  it('rejects a duplicate or out-of-range position', () => {
    expect(
      parse(
        widgets.map((widget, index) =>
          index === 1 ? { ...widget, position: 0 } : widget,
        ),
      ).success,
    ).toBe(false);
    expect(
      parse(
        widgets.map((widget, index) =>
          index === 6 ? { ...widget, position: 7 } : widget,
        ),
      ).success,
    ).toBe(false);
  });

  it('rejects a config payload on a widget', () => {
    expect(
      parse(
        widgets.map((widget, index) =>
          index === 0 ? { ...widget, config: { html: '<b>' } } : widget,
        ),
      ).success,
    ).toBe(false);
  });

  it('requires expectedUpdatedAt', () => {
    expect(updateRoomWidgetsSchema.safeParse({ widgets }).success).toBe(false);
  });
});

describe('updateRoomTopFriendsSchema', () => {
  const parse = (body: Record<string, unknown>) =>
    updateRoomTopFriendsSchema.safeParse({
      userIds: [],
      size: 8,
      visibility: 'friends',
      expectedUpdatedAt: VERSION,
      ...body,
    });

  it('accepts up to the chosen size', () => {
    const ids = Array.from({ length: 12 }, (_value, index) => idAt(index));
    expect(parse({ userIds: ids, size: 12 }).success).toBe(true);
    expect(parse({ userIds: ids.slice(0, 4), size: 4 }).success).toBe(true);
    expect(parse({}).success).toBe(true);
  });

  it('rejects 13 ids, a duplicate, more ids than the size, and size 5', () => {
    const ids = Array.from({ length: 13 }, (_value, index) => idAt(index));
    expect(parse({ userIds: ids, size: 12 }).success).toBe(false);
    expect(parse({ userIds: [ID, ID.toUpperCase()] }).success).toBe(false);
    expect(parse({ userIds: ids.slice(0, 5), size: 4 }).success).toBe(false);
    expect(parse({ size: 5 }).success).toBe(false);
    expect(parse({ visibility: 'public' }).success).toBe(false);
    expect(parse({ expectedUpdatedAt: undefined }).success).toBe(false);
  });
});

describe('room enums', () => {
  it('match the domain registry', () => {
    expect(roomThemePresetSchema.options).toEqual([...ROOM_THEME_PRESETS]);
    expect(roomAccentSchema.options).toEqual([...ROOM_ACCENTS]);
    expect(roomWidgetTypeSchema.options).toEqual([...ROOM_WIDGET_TYPES]);
  });
});

describe('room reads', () => {
  it('accepts any short username in the path', () => {
    expect(
      roomParamsSchema.safeParse({ username: 'not a name!' }).success,
    ).toBe(true);
    expect(
      roomParamsSchema.safeParse({ username: 'x'.repeat(101) }).success,
    ).toBe(false);
  });

  it('pages content with an optional year', () => {
    expect(roomContentQuerySchema.parse({})).toMatchObject({
      type: 'all',
      limit: 20,
    });
    expect(roomContentQuerySchema.parse({ year: '2026' }).year).toBe(2026);
  });

  it('describes a visitor view with owner-only fields null', () => {
    const room = {
      owner: {
        id: ID,
        username: 'ada',
        displayName: 'Ada',
        bio: null,
        avatarUrl: null,
      },
      relationship: 'friend',
      style: {
        themePreset: 'cream_paper',
        layout: 'two_column',
        accent: null,
        font: null,
        decorationPack: null,
        sparkles: false,
      },
      location: null,
      currently: null,
      music: null,
      banner: null,
      widgets: DEFAULT_ROOM_WIDGETS,
      topFriends: { size: null, visibility: null, items: null },
      visibility: null,
      updatedAt: null,
      configurationVersion: 1,
    };
    expect(roomSchema.safeParse(room).success).toBe(true);
    expect(
      roomSchema.safeParse({
        ...room,
        music: { url: 'http://example.com', title: null, artist: null },
      }).success,
    ).toBe(false);
  });
});

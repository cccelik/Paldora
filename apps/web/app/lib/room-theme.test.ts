import {
  DEFAULT_ROOM,
  DEFAULT_ROOM_WIDGETS,
  ROOM_ACCENTS,
  ROOM_DECORATION_PACKS,
  ROOM_FONTS,
  ROOM_THEME_META,
  ROOM_THEME_PRESETS,
} from '@paldora/domain';
import {
  readRoomThemeTokens,
  resolveTokens,
  roomSchemeOf,
} from '@paldora/tokens';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  excerpt,
  musicLink,
  roomColumns,
  roomHref,
  roomThemeAttributes,
  roomUsernameParam,
} from './room-theme';
const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

const room = readRoomThemeTokens(
  resolveTokens(
    JSON.parse(read('../../../../design/tokens/paldora.tokens.json')) as Record<
      string,
      unknown
    >,
  ),
);
const css = read('../../../../packages/tokens/generated/css/room-themes.css');

const style = {
  themePreset: DEFAULT_ROOM.themePreset,
  layout: DEFAULT_ROOM.layout,
  accent: null,
  font: null,
  decorationPack: null,
  sparkles: false,
};

describe('the domain registry and the generated Room tokens agree', () => {
  it('names the same presets, in the same order', () => {
    expect(room.presets.map((preset) => preset.id)).toEqual([
      ...ROOM_THEME_PRESETS,
    ]);
  });

  it('declares each preset scheme the way its canvas and text colors are', () => {
    for (const preset of room.presets) {
      const id = preset.id as keyof typeof ROOM_THEME_META;
      expect(ROOM_THEME_META[id].scheme, preset.id).toBe(
        roomSchemeOf(preset.colors),
      );
    }
  });

  it('has a token for every accent, including every default accent', () => {
    expect(room.accents.map((accent) => accent.key)).toEqual([...ROOM_ACCENTS]);
    for (const meta of Object.values(ROOM_THEME_META)) {
      expect(ROOM_ACCENTS).toContain(meta.defaultAccent);
      expect(ROOM_DECORATION_PACKS).toContain(meta.defaultDecoration);
    }
  });

  it('emits a CSS rule for every preset, every scheme × accent, and every font', () => {
    for (const preset of ROOM_THEME_PRESETS) {
      expect(css).toContain(`.room-canvas[data-room-theme='${preset}']`);
    }
    for (const scheme of ['light', 'dark']) {
      for (const accent of ROOM_ACCENTS) {
        expect(css).toContain(
          `.room-canvas[data-room-scheme='${scheme}'][data-room-accent='${accent}']`,
        );
      }
    }
    for (const font of ROOM_FONTS) {
      expect(css).toContain(`.room-canvas[data-room-font='${font}']`);
    }
  });
});

describe('roomThemeAttributes', () => {
  it('fills null overrides from the preset', () => {
    expect(roomThemeAttributes(style)).toEqual({
      'data-room-theme': 'cream_paper',
      'data-room-scheme': 'light',
      'data-room-accent': 'gold',
      'data-room-font': 'editorial',
      'data-room-decoration': 'tape',
      'data-room-sparkles': 'off',
      'data-room-layout': 'two_column',
    });
  });

  it('keeps explicit choices and takes the scheme from the preset', () => {
    expect(
      roomThemeAttributes({
        ...style,
        themePreset: 'neon_night',
        accent: 'emerald',
        font: 'mono',
        decorationPack: 'none',
        sparkles: true,
        layout: 'single',
      }),
    ).toEqual({
      'data-room-theme': 'neon_night',
      'data-room-scheme': 'dark',
      'data-room-accent': 'emerald',
      'data-room-font': 'mono',
      'data-room-decoration': 'none',
      'data-room-sparkles': 'on',
      'data-room-layout': 'single',
    });
  });
});

describe('roomColumns', () => {
  it('splits two columns by placement, each in position order', () => {
    const columns = roomColumns('two_column', DEFAULT_ROOM_WIDGETS);
    expect(columns.sidebar.map((widget) => widget.type)).toEqual([
      'currently',
      'music',
      'top_friends',
      'photos',
    ]);
    expect(columns.main.map((widget) => widget.type)).toEqual([
      'life_updates',
      'posts',
      'memories',
    ]);
  });

  it('puts everything in one list in global order for a single column, without disabled widgets', () => {
    const widgets = DEFAULT_ROOM_WIDGETS.map((widget) => ({
      ...widget,
      position: 6 - widget.position,
      enabled: widget.type !== 'music',
    }));
    const columns = roomColumns('single', widgets);
    expect(columns.sidebar).toEqual([]);
    expect(columns.main.map((widget) => widget.type)).toEqual([
      'memories',
      'posts',
      'life_updates',
      'photos',
      'top_friends',
      'currently',
    ]);
  });
});

describe('musicLink', () => {
  it('shows the hostname of a safe link', () => {
    expect(musicLink('https://www.example.com/song?id=1')).toEqual({
      href: 'https://www.example.com/song?id=1',
      host: 'example.com',
    });
  });

  it('refuses anything that is not a public https link', () => {
    for (const url of [
      'http://example.com/song',
      'javascript:alert(1)',
      'data:text/html,hi',
      'https://user:pass@example.com/',
      'https://127.0.0.1/song',
      'https://localhost/song',
      'https://exa mple.com/',
    ]) {
      expect(musicLink(url), url).toBeNull();
    }
  });
});

describe('roomUsernameParam', () => {
  it('accepts usernames and their case variants', () => {
    expect(roomUsernameParam('ada_lovelace')).toBe('ada_lovelace');
    expect(roomUsernameParam('Ada_Lovelace')).toBe('Ada_Lovelace');
    expect(roomUsernameParam('%C3%A7elik')).toBe('çelik');
  });

  it('rejects anything a username can never be', () => {
    for (const value of [
      '',
      'ab',
      'a'.repeat(31),
      'ada lovelace',
      'ada.lovelace',
      '%E0%A4%A',
      '..',
      '<script>',
    ]) {
      expect(roomUsernameParam(value), value).toBeNull();
    }
  });

  it('builds the matching Room link', () => {
    expect(roomHref('çelik')).toBe('/rooms/%C3%A7elik');
  });
});

describe('excerpt', () => {
  it('keeps short text and flattens whitespace', () => {
    expect(excerpt('Hello\n\n  there')).toBe('Hello there');
  });

  it('cuts long text at a word with an ellipsis', () => {
    const text = `${'word '.repeat(60)}end`;
    const result = excerpt(text, 40);
    expect(result.length).toBeLessThanOrEqual(40);
    expect(result.endsWith('word…')).toBe(true);
  });
});

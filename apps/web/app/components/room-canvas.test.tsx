import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_ROOM_WIDGETS, ROOM_THEME_PRESETS } from '@paldora/domain';
import type { RoomView } from '@paldora/validation';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RoomCanvas, type RoomPreviews } from './room-canvas';

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

const OWNER = '7d2f4f3e-8a71-4c55-9b16-2f1f0c6d2a10';
const FRIEND = '0a7c1d6e-2f13-4d8b-9f54-5c3e6d1b7a22';
const POST = '3b9d2c1e-6a5f-4e7d-8c3b-2a1f0e9d8c7b';
const BOX = '5e4d3c2b-1a0f-4e9d-8c7b-6a5f4e3d2c1b';
const AT = '2026-10-20T10:00:00.000Z';

function roomWith(overrides: Partial<RoomView> = {}): RoomView {
  return {
    owner: {
      id: OWNER,
      username: 'ada',
      displayName: 'Ada',
      bio: 'Counting things.',
      avatarUrl: null,
    },
    relationship: 'friend',
    style: {
      themePreset: 'cream_paper',
      layout: 'two_column',
      accent: null,
      font: null,
      decorationPack: null,
      sparkles: true,
    },
    location: 'London',
    currently: '<script>alert(1)</script>',
    music: {
      url: 'https://music.example.com/track/1',
      title: 'Song',
      artist: 'Band',
    },
    banner: {
      url: 'https://media.example.com/banner.webp',
      bannerMediaId: null,
    },
    widgets: DEFAULT_ROOM_WIDGETS.map((widget) => ({ ...widget })),
    topFriends: {
      size: null,
      visibility: null,
      items: [
        {
          id: FRIEND,
          username: 'grace',
          displayName: 'Grace',
          avatarUrl: null,
        },
      ],
    },
    visibility: null,
    updatedAt: null,
    configurationVersion: 1,
    ...overrides,
  };
}

const previews: RoomPreviews = {
  posts: [
    {
      id: POST,
      box: { id: BOX, name: 'Crew' },
      author: {
        id: OWNER,
        username: 'ada',
        displayName: 'Ada',
        avatarUrl: null,
      },
      content: 'Picnic on Sunday',
      media: [],
      createdAt: AT,
      editedAt: null,
      canEdit: false,
      interactions: {} as never,
      kind: 'post',
      lifeUpdateId: null,
    },
  ],
  lifeUpdates: [],
  photos: [],
  memories: { years: [{ year: 2026, count: 1 }], year: 2026, months: [] },
};

const render = (room: RoomView) =>
  renderToStaticMarkup(<RoomCanvas room={room} previews={previews} />);

describe('RoomCanvas', () => {
  it('sets only theme attributes, never an inline style', () => {
    for (const themePreset of ROOM_THEME_PRESETS) {
      const html = render(
        roomWith({ style: { ...roomWith().style, themePreset } }),
      );
      expect(html).toContain(`data-room-theme="${themePreset}"`);
      expect(html).not.toMatch(/\sstyle=/);
    }
  });

  it('holds no navigation, forms, or controls, and links only inside the allowlist', () => {
    const html = render(roomWith());
    expect(html).not.toMatch(
      /<(nav|form|button|input|select|textarea|iframe|audio|video|script)\b/,
    );
    // Anchors only (React may add an image preload `<link>`, hoisted to <head>).
    const hrefs = [...html.matchAll(/<a\b[^>]*\shref="([^"]*)"/g)].map(
      (match) => match[1],
    );
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href, href).toMatch(
        /^(\/rooms\/[^/]+(\/memories(\?.*)?)?|\/posts\/[0-9a-f-]{36}|\/life-updates\/[0-9a-f-]{36}\?box=[0-9a-f-]{36}|https:\/\/music\.example\.com\/track\/1)$/,
      );
    }
  });

  it('escapes Room text and makes the music link a safe external card', () => {
    const html = render(roomWith());
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('rel="noopener noreferrer nofollow ugc"');
    expect(html).toContain('music.example.com · Opens another site');
  });

  it('renders an unsafe stored music URL as plain text', () => {
    const html = render(
      roomWith({
        music: {
          url: 'http://music.example.com/x',
          title: 'Song',
          artist: null,
        },
      }),
    );
    expect(html).not.toContain('http://music.example.com');
    expect(html).toContain('Song');
  });

  it('marks the banner decorative and decorations hidden', () => {
    const html = render(roomWith());
    expect(html).toMatch(
      /<img[^>]*src="https:\/\/media\.example\.com\/banner\.webp"[^>]*alt=""/,
    );
    expect(html).toContain('aria-hidden="true"');
  });

  it('leaves empty Currently and Music out for visitors and hints for the owner', () => {
    const empty = { currently: null, music: null };
    const visitor = render(roomWith(empty));
    expect(visitor).not.toContain('room-widget-currently');
    expect(visitor).not.toContain('room-widget-music');
    const owner = render(roomWith({ ...empty, relationship: 'owner' }));
    expect(owner).toContain('Say what you’re up to in Customize.');
    expect(owner).toContain('Add a song link in Customize.');
  });

  it('shows private Top Friends as private, with no names', () => {
    const html = render(
      roomWith({ topFriends: { size: null, visibility: null, items: null } }),
    );
    expect(html).toContain('Ada keeps Top Friends private.');
    expect(html).not.toContain('Grace');
  });

  it('renders disabled widgets nowhere', () => {
    const html = render(
      roomWith({
        relationship: 'owner',
        widgets: DEFAULT_ROOM_WIDGETS.map((widget) => ({
          ...widget,
          enabled: widget.type !== 'posts',
        })),
      }),
    );
    expect(html).not.toContain('room-widget-posts');
    expect(html).not.toContain('Picnic on Sunday');
  });
});

describe('Room CSS', () => {
  const sticky = 100;
  const files = [
    './room-canvas.module.css',
    './room-widgets.module.css',
    './room-decoration.module.css',
    '../../../../packages/tokens/generated/css/room-themes.css',
  ];

  it('never lifts anything in the canvas to the sticky layer or above', () => {
    for (const file of files) {
      const css = read(file);
      for (const [, value] of css.matchAll(/z-index\s*:\s*([^;]+);/g)) {
        const trimmed = (value ?? '').trim();
        expect(trimmed, `${file}: z-index ${trimmed}`).toMatch(/^-?\d+$/);
        expect(Number(trimmed), file).toBeLessThan(sticky);
      }
    }
  });

  it('isolates and clips the canvas', () => {
    const css = read('./room-canvas.module.css');
    expect(css).toMatch(/\.canvas\s*{[^}]*isolation:\s*isolate/);
    expect(css).toMatch(/\.canvas\s*{[^}]*contain:\s*layout paint/);
    expect(css).toMatch(/\.canvas\s*{[^}]*overflow:\s*clip/);
  });

  it('animates sparkles only when motion is welcome', () => {
    const css = read('./room-decoration.module.css');
    const [before] = css.split(
      '@media (prefers-reduced-motion: no-preference)',
    );
    expect(before).not.toMatch(/animation\s*:/);
  });
});

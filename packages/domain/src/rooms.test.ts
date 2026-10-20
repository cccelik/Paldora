import { describe, expect, it } from 'vitest';
import { API_ERROR_CODES } from './errors.js';
import { MEDIA_PURPOSE_POLICIES, MEDIA_PURPOSES } from './media.js';
import {
  DEFAULT_ROOM,
  DEFAULT_ROOM_WIDGETS,
  ROOM_ACCENT_LABELS,
  ROOM_ACCENTS,
  ROOM_DECORATION_LABELS,
  ROOM_DECORATION_PACKS,
  ROOM_FONT_LABELS,
  ROOM_FONTS,
  ROOM_THEME_META,
  ROOM_THEME_PRESETS,
  ROOM_VISIBILITIES,
  ROOM_VISIBILITY_DESCRIPTIONS,
  ROOM_WIDGET_LABELS,
  ROOM_WIDGET_TYPES,
  TOP_FRIENDS_MAX,
  TOP_FRIENDS_SIZES,
  resolveRoomStyle,
} from './rooms.js';

describe('room registry', () => {
  it('has 14 presets, 8 accents, 5 fonts, 6 decorations, and 7 widgets', () => {
    expect(ROOM_THEME_PRESETS).toHaveLength(14);
    expect(ROOM_ACCENTS).toHaveLength(8);
    expect(ROOM_FONTS).toHaveLength(5);
    expect(ROOM_DECORATION_PACKS).toHaveLength(6);
    expect(ROOM_WIDGET_TYPES).toHaveLength(7);
    for (const list of [
      ROOM_THEME_PRESETS,
      ROOM_ACCENTS,
      ROOM_FONTS,
      ROOM_DECORATION_PACKS,
      ROOM_WIDGET_TYPES,
    ]) {
      expect(new Set(list).size).toBe(list.length);
      for (const id of list) expect(id).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('labels every entry and describes every audience', () => {
    expect(Object.keys(ROOM_THEME_META).sort()).toEqual(
      [...ROOM_THEME_PRESETS].sort(),
    );
    expect(Object.keys(ROOM_ACCENT_LABELS).sort()).toEqual(
      [...ROOM_ACCENTS].sort(),
    );
    expect(Object.keys(ROOM_FONT_LABELS).sort()).toEqual(
      [...ROOM_FONTS].sort(),
    );
    expect(Object.keys(ROOM_DECORATION_LABELS).sort()).toEqual(
      [...ROOM_DECORATION_PACKS].sort(),
    );
    expect(Object.keys(ROOM_WIDGET_LABELS).sort()).toEqual(
      [...ROOM_WIDGET_TYPES].sort(),
    );
    expect(Object.keys(ROOM_VISIBILITY_DESCRIPTIONS).sort()).toEqual(
      [...ROOM_VISIBILITIES].sort(),
    );
  });

  it('gives every preset a known scheme, accent, and decoration', () => {
    for (const meta of Object.values(ROOM_THEME_META)) {
      expect(['light', 'dark']).toContain(meta.scheme);
      expect(ROOM_ACCENTS).toContain(meta.defaultAccent);
      expect(ROOM_DECORATION_PACKS).toContain(meta.defaultDecoration);
      expect(meta.label.length).toBeGreaterThan(0);
    }
    const dark = ROOM_THEME_PRESETS.filter(
      (preset) => ROOM_THEME_META[preset].scheme === 'dark',
    );
    expect(dark).toEqual([
      'obsidian_gold',
      'neon_night',
      'dark_academia',
      'tumblr_2014',
      'cyberpunk',
    ]);
  });

  it('lays out the default widgets once each at positions 0–6', () => {
    expect(DEFAULT_ROOM_WIDGETS.map((widget) => widget.type).sort()).toEqual(
      [...ROOM_WIDGET_TYPES].sort(),
    );
    expect(DEFAULT_ROOM_WIDGETS.map((widget) => widget.position)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
    expect(
      DEFAULT_ROOM_WIDGETS.filter(
        (widget) => widget.placement === 'sidebar',
      ).map((widget) => widget.type),
    ).toEqual(['currently', 'music', 'top_friends', 'photos']);
    expect(DEFAULT_ROOM_WIDGETS.every((widget) => widget.enabled)).toBe(true);
  });

  it('defaults to a private, friends-only Room', () => {
    expect(DEFAULT_ROOM).toEqual({
      visibility: 'friends',
      themePreset: 'cream_paper',
      layout: 'two_column',
      accent: null,
      font: null,
      decorationPack: null,
      sparkles: false,
      topFriendsSize: 8,
      topFriendsVisibility: 'friends',
    });
    expect(TOP_FRIENDS_SIZES).toEqual([4, 8, 12]);
    expect(Math.max(...TOP_FRIENDS_SIZES)).toBe(TOP_FRIENDS_MAX);
  });
});

describe('resolveRoomStyle', () => {
  it('follows the preset for null overrides', () => {
    expect(resolveRoomStyle(DEFAULT_ROOM)).toEqual({
      theme: 'cream_paper',
      scheme: 'light',
      accent: 'gold',
      font: 'editorial',
      decoration: 'tape',
      sparkles: false,
      layout: 'two_column',
    });
  });

  it('keeps explicit overrides', () => {
    expect(
      resolveRoomStyle({
        themePreset: 'cyberpunk',
        layout: 'single',
        accent: 'crimson',
        font: 'mono',
        decorationPack: 'none',
        sparkles: true,
      }),
    ).toEqual({
      theme: 'cyberpunk',
      scheme: 'dark',
      accent: 'crimson',
      font: 'mono',
      decoration: 'none',
      sparkles: true,
      layout: 'single',
    });
  });
});

describe('room_banner policy', () => {
  it('is user-scoped, avatar-sized, and cropped to 3:1 for display', () => {
    expect(MEDIA_PURPOSES).toContain('room_banner');
    const policy = MEDIA_PURPOSE_POLICIES.room_banner;
    expect(policy.scope).toBe('user');
    expect(policy.maxBytes).toBe(MEDIA_PURPOSE_POLICIES.avatar.maxBytes);
    expect(policy.maxInputPixels).toBe(
      MEDIA_PURPOSE_POLICIES.avatar.maxInputPixels,
    );
    expect(policy.master).toMatchObject({ size: 2560, fit: 'inside' });
    expect(policy.display).toMatchObject({
      size: 1600,
      height: 533,
      fit: 'cover',
    });
    expect(policy.thumbnail).toMatchObject({
      size: 640,
      height: 213,
      fit: 'cover',
    });
  });
});

describe('room error codes', () => {
  it('are registered', () => {
    for (const code of [
      'ROOM_NOT_FOUND',
      'ROOM_UPDATE_STALE',
      'TOP_FRIEND_NOT_ELIGIBLE',
    ]) {
      expect(API_ERROR_CODES).toContain(code);
    }
  });
});

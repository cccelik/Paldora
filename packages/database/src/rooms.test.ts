import { DEFAULT_ROOM } from '@paldora/domain';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { ROOM_DEFAULTS, roomAccessConditions } from './rooms.js';
import { users } from './schema.js';

const dialect = new PgDialect();
const viewer = '0a7c1d6e-2f13-4d8b-9f54-5c3e6d1b7a22';

describe('ROOM_DEFAULTS', () => {
  it('equals the domain’s roomless configuration', () => {
    expect({
      visibility: ROOM_DEFAULTS.visibility,
      themePreset: ROOM_DEFAULTS.themePreset,
      layout: ROOM_DEFAULTS.layout,
      accent: ROOM_DEFAULTS.accent,
      font: ROOM_DEFAULTS.font,
      decorationPack: ROOM_DEFAULTS.decorationPack,
      sparkles: ROOM_DEFAULTS.sparkles,
      topFriendsSize: ROOM_DEFAULTS.topFriendsSize,
      topFriendsVisibility: ROOM_DEFAULTS.topFriendsVisibility,
    }).toEqual(DEFAULT_ROOM);
  });

  it('starts with no profile text, music, or banner', () => {
    expect([
      ROOM_DEFAULTS.location,
      ROOM_DEFAULTS.currently,
      ROOM_DEFAULTS.musicUrl,
      ROOM_DEFAULTS.musicTitle,
      ROOM_DEFAULTS.musicArtist,
      ROOM_DEFAULTS.bannerMediaId,
    ]).toEqual([null, null, null, null, null, null]);
  });
});

describe('roomAccessConditions', () => {
  const render = (fragment: Parameters<PgDialect['sqlToQuery']>[0]) =>
    dialect.sqlToQuery(fragment);
  const conditions = roomAccessConditions(viewer, users.id);

  it('counts only accepted friendships, looked up by the canonical pair', () => {
    const { sql, params } = render(conditions.isFriend);
    expect(sql).toContain(
      '"user_low_id" = least($1::uuid, "paldora"."users"."id")',
    );
    expect(sql).toContain('"status" = \'accepted\'');
    expect(params).toEqual([viewer, viewer]);
  });

  it('needs an active membership of each person in one existing Box', () => {
    const { sql } = render(conditions.sharesBox);
    expect(sql).toContain("owner_membership.status = 'active'");
    expect(sql).toContain("viewer_membership.status = 'active'");
    expect(sql).toContain('"paldora"."boxes" shared_box');
    // An archived Box counts (plan B3): no Box status filter.
    expect(sql).not.toContain('shared_box.status');
  });

  it('uses the shared block definition in both directions', () => {
    const { sql } = render(conditions.blocked);
    expect(sql).toContain('"paldora"."user_blocks"');
    expect(sql.match(/"blocker_id"/g)).toHaveLength(2);
  });
});

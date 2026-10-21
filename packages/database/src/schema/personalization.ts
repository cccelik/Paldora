import { sql } from 'drizzle-orm';
import { check, primaryKey, smallint, text, uuid } from 'drizzle-orm/pg-core';
import { paldoraSchema } from './_shared.js';
import { rooms } from './rooms.js';

/** Source is owner-only and is recompiled under the active policy on every read. */
export const roomCustomizations = paldoraSchema.table(
  'room_customizations',
  {
    roomUserId: uuid('room_user_id')
      .primaryKey()
      .references(() => rooms.userId, { onDelete: 'cascade' }),
    policyVersion: smallint('policy_version').notNull(),
    cssSource: text('css_source').notNull(),
  },
  (table) => [
    check('room_customizations_policy_check', sql`${table.policyVersion} > 0`),
    check(
      'room_customizations_source_check',
      sql`octet_length(${table.cssSource}) <= 8192`,
    ),
  ],
);
export const roomCustomWidgets = paldoraSchema.table(
  'room_custom_widgets',
  {
    roomUserId: uuid('room_user_id')
      .notNull()
      .references(() => rooms.userId, { onDelete: 'cascade' }),
    position: smallint('position').notNull(),
    policyVersion: smallint('policy_version').notNull(),
    title: text('title').notNull(),
    source: text('source').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.roomUserId, table.position] }),
    check(
      'room_custom_widgets_position_check',
      sql`${table.position} between 0 and 2`,
    ),
    check('room_custom_widgets_policy_check', sql`${table.policyVersion} > 0`),
    check(
      'room_custom_widgets_title_check',
      sql`char_length(${table.title}) between 1 and 80`,
    ),
    check(
      'room_custom_widgets_source_check',
      sql`octet_length(${table.source}) <= 8192`,
    ),
  ],
);

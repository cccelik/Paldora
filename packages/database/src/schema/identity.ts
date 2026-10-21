import { sql } from 'drizzle-orm';
import { check, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { paldoraSchema, createdAt, updatedAt } from './_shared.js';

export const userStatus = paldoraSchema.enum('user_status', [
  'active',
  'suspended',
  'deleted',
]);

export const appearancePreference = paldoraSchema.enum(
  'appearance_preference',
  ['light', 'dark', 'system'],
);

/**
 * A provisioned Paldora account. `auth_subject` is the identity provider's
 * `sub`; it is never exposed or used as the internal ID.
 */
export const users = paldoraSchema.table(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    authSubject: text('auth_subject').notNull(),
    email: text('email').notNull(),
    emailNormalized: text('email_normalized').notNull(),
    status: userStatus('status').notNull().default('active'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('users_auth_subject_unique').on(table.authSubject),
    uniqueIndex('users_email_normalized_unique').on(table.emailNormalized),
  ],
);

export const userPreferences = paldoraSchema.table(
  'user_preferences',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    appearance: appearancePreference('appearance').notNull().default('system'),
    /**
     * Five personal reaction shortcuts (Phase 5). Emoji validity and
     * distinctness are enforced by the API; any single emoji is always
     * allowed as a reaction, so a preset is only a convenience.
     */
    reactionPresets: text('reaction_presets')
      .array()
      .notNull()
      .default(sql`array['👍', '❤️', '😂', '😮', '😢']::text[]`),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      'user_preferences_reaction_presets_check',
      sql`cardinality(${table.reactionPresets}) = 5`,
    ),
  ],
);

export type UserRow = typeof users.$inferSelect;

import { sql } from 'drizzle-orm';
import {
  check,
  text,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { paldoraSchema, createdAt, updatedAt } from './_shared.js';
import { users } from './identity.js';
import { mediaAssets } from './media.js';

export const onboardingState = paldoraSchema.enum('onboarding_state', [
  'username',
  'profile',
  'avatar',
  'complete',
]);

export const profiles = paldoraSchema.table(
  'profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    username: text('username'),
    usernameNormalized: text('username_normalized'),
    displayName: text('display_name'),
    bio: text('bio'),
    // Points only at a `ready` avatar; the worker swaps it after processing.
    avatarMediaId: uuid('avatar_media_id').references(
      (): AnyPgColumn => mediaAssets.id,
      { onDelete: 'set null' },
    ),
    onboardingState: onboardingState('onboarding_state')
      .notNull()
      .default('username'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('profiles_username_normalized_unique')
      .on(table.usernameNormalized)
      .where(sql`${table.usernameNormalized} is not null`),
    check(
      'profiles_username_pair_check',
      sql`(${table.username} is null) = (${table.usernameNormalized} is null)`,
    ),
    check(
      'profiles_username_length_check',
      sql`${table.username} is null or char_length(${table.username}) between 3 and 30`,
    ),
    check(
      'profiles_display_name_length_check',
      sql`${table.displayName} is null or char_length(${table.displayName}) between 1 and 80`,
    ),
    check(
      'profiles_bio_length_check',
      sql`${table.bio} is null or char_length(${table.bio}) <= 500`,
    ),
    // Onboarding can only advance past a step whose data exists.
    check(
      'profiles_onboarding_requirements_check',
      sql`(${table.onboardingState} = 'username' or ${table.username} is not null) and (${table.onboardingState} in ('username', 'profile') or ${table.displayName} is not null)`,
    ),
  ],
);

export type ProfileRow = typeof profiles.$inferSelect;

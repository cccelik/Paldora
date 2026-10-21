import { pgSchema, timestamp } from 'drizzle-orm/pg-core';

/**
 * Every Paldora table lives in this schema. Feature phases add tables in the
 * phase that owns their invariants, each with a reviewed migration.
 */
export const paldoraSchema = pgSchema('paldora');

export const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

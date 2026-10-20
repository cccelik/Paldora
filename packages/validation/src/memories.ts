import { z } from 'zod';
import { lifeUpdateSchema } from './life-updates.js';
import { postSchema } from './posts.js';
import {
  cursorPageQuerySchema,
  cursorPageSchema,
  isoTimestampSchema,
} from './primitives.js';

export const MEMORY_MIN_YEAR = 1970;
export const MEMORY_MAX_YEAR = 9999;

export const MEMORY_TYPES = ['all', 'posts', 'life_updates'] as const;

const yearSchema = z.coerce
  .number()
  .int()
  .min(MEMORY_MIN_YEAR)
  .max(MEMORY_MAX_YEAR);

/**
 * One page of Memories: the content the viewer can still access that was
 * published in one UTC year, or one UTC month of it, newest first. `type`
 * narrows to ordinary posts or Life Updates. Cursors are opaque and only
 * valid with the same year, month, and type.
 */
export const memoryQuerySchema = cursorPageQuerySchema.extend({
  year: yearSchema,
  month: z.coerce.number().int().min(1).max(12).optional(),
  type: z.enum(MEMORY_TYPES).default('all'),
});

/** `year` defaults to the newest year that has content for the viewer. */
export const memorySummaryQuerySchema = z.object({
  year: yearSchema.optional(),
});

/**
 * A Memory is a derived view, never a stored copy: each item is the live
 * post or Life Update, re-authorized on every read. `occurredAt` is its
 * publish time, which decides its UTC month and never moves on edit. A Life
 * Update appears once, with a context per Box the viewer is in (only the
 * scoped Box in Box Memories); Only Me appears only in the author's own.
 * Content by someone in a block relationship with the viewer is omitted.
 */
export const memoryItemSchema = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('post'),
      occurredAt: isoTimestampSchema,
      post: postSchema,
    }),
    z.object({
      kind: z.literal('life_update'),
      occurredAt: isoTimestampSchema,
      lifeUpdate: lifeUpdateSchema,
    }),
  ])
  .meta({ id: 'MemoryItem' });

export const memoryPageSchema = cursorPageSchema(memoryItemSchema).meta({
  id: 'MemoryPage',
});

const countSchema = z.number().int().min(1);

/**
 * Counts of the items Memories would list: every year with content, newest
 * first, and the months of `year` (the requested one, or the newest; null
 * when there is nothing at all), newest first. Both lists are bounded by
 * the calendar, so they are not paginated.
 */
export const memorySummarySchema = z
  .object({
    years: z.array(
      z.object({
        year: z.number().int().min(MEMORY_MIN_YEAR).max(MEMORY_MAX_YEAR),
        count: countSchema,
      }),
    ),
    year: z.number().int().min(MEMORY_MIN_YEAR).max(MEMORY_MAX_YEAR).nullable(),
    months: z
      .array(
        z.object({
          month: z.number().int().min(1).max(12),
          count: countSchema,
        }),
      )
      .max(12),
  })
  .meta({ id: 'MemorySummary' });

export type MemoryType = (typeof MEMORY_TYPES)[number];
export type MemoryQuery = z.output<typeof memoryQuerySchema>;
export type MemoryQueryInput = z.input<typeof memoryQuerySchema>;
export type MemorySummaryQuery = z.output<typeof memorySummaryQuerySchema>;
export type MemoryItemView = z.infer<typeof memoryItemSchema>;
export type MemorySummaryView = z.infer<typeof memorySummarySchema>;

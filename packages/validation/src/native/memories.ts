import { z } from 'zod';
import { MEMORY_MAX_YEAR, MEMORY_MIN_YEAR, MEMORY_TYPES } from '../memories.js';
import {
  NATIVE_LIFE_UPDATE_SECTION_KEYS,
  nativeFeedPostSchema,
  nativeInteractionSummarySchema,
} from './feed.js';
import {
  nativeCursorSchema,
  nativePageSchema,
  nativeString,
  nativeTimestampSchema,
} from './primitives.js';

/**
 * Memories (ADR 021 decision 8): a derived, chronological view of content the
 * viewer can still access, never a stored copy. Each callable wraps the same
 * trusted `NativeMemories` service as the web adapter, so every item is
 * re-authorized on read: former members, blocked authors, deleted content and
 * hidden Rooms drop out. Years and months are UTC. A cursor is opaque, at most
 * 128 characters, and only valid with the same scope, year, month and type.
 */

const yearSchema = z.number().int().min(MEMORY_MIN_YEAR).max(MEMORY_MAX_YEAR);
const monthSchema = z.number().int().min(1).max(12);

const filterShape = {
  /** Omit for every year, newest first. A `month` needs a `year`. */
  year: yearSchema.optional(),
  month: monthSchema.optional(),
  type: z.enum(MEMORY_TYPES).optional(),
  cursor: nativeCursorSchema.optional(),
  /** Defaults to 20. */
  limit: z.number().int().min(1).max(50).optional(),
};

const monthNeedsYear = (input: {
  year?: number | undefined;
  month?: number | undefined;
}) => input.month === undefined || input.year !== undefined;

export const listMyMemoriesInputSchema = z
  .object(filterShape)
  .refine(monthNeedsYear);
export const listBoxMemoriesInputSchema = z
  .object({ boxId: nativeString(128), ...filterShape })
  .refine(monthNeedsYear);
export const listRoomMemoriesInputSchema = z
  .object({ username: nativeString(100), ...filterShape })
  .refine(monthNeedsYear);

/** A Box post. `occurredAt` is its publish time and never moves on edit. */
export const nativeMemoryPostSchema = nativeFeedPostSchema.extend({
  occurredAt: nativeTimestampSchema,
});

/**
 * A Life Update appears once, with a context per Box the viewer is in (only
 * the scoped Box in Box Memories). An Only Me update has no contexts and only
 * appears in the author's own Memories.
 */
export const nativeMemoryLifeUpdateSchema = z.object({
  kind: z.literal('life_update'),
  occurredAt: nativeTimestampSchema,
  id: z.string(),
  authorUid: z.string(),
  authorName: z.string(),
  authorAvatarMediaId: z.string().nullable(),
  audience: z.enum(['only_me', 'boxes']),
  sections: z.array(
    z.object({
      key: z.enum(NATIVE_LIFE_UPDATE_SECTION_KEYS),
      content: z.string(),
    }),
  ),
  mediaAssetIds: z.array(z.string()),
  createdAt: nativeTimestampSchema,
  updatedAt: nativeTimestampSchema,
  canEdit: z.boolean(),
  contexts: z.array(
    z.object({
      boxId: z.string(),
      boxName: z.string(),
      postId: z.string(),
      interactions: nativeInteractionSummarySchema,
    }),
  ),
});

export const nativeMemoryItemSchema = z.discriminatedUnion('kind', [
  nativeMemoryPostSchema,
  nativeMemoryLifeUpdateSchema,
]);

export const listMyMemoriesOutputSchema = nativePageSchema(
  nativeMemoryItemSchema,
);
export const listBoxMemoriesOutputSchema = listMyMemoriesOutputSchema;
export const listRoomMemoriesOutputSchema = listMyMemoriesOutputSchema;

export const getMyMemorySummaryInputSchema = z.object({
  year: yearSchema.optional(),
});
export const getBoxMemorySummaryInputSchema = z.object({
  boxId: nativeString(128),
  year: yearSchema.optional(),
});
export const getRoomMemorySummaryInputSchema = z.object({
  username: nativeString(100),
  year: yearSchema.optional(),
});

/**
 * Counts of the items Memories would list: every year with content, newest
 * first, and the months of `year` (the requested one, or the newest; null when
 * there is nothing). An exact scan, so its rate limit is tight.
 */
export const nativeMemorySummarySchema = z.object({
  years: z.array(
    z.object({ year: yearSchema, count: z.number().int().min(1) }),
  ),
  year: yearSchema.nullable(),
  months: z
    .array(z.object({ month: monthSchema, count: z.number().int().min(1) }))
    .max(12),
});
export const getMyMemorySummaryOutputSchema = nativeMemorySummarySchema;
export const getBoxMemorySummaryOutputSchema = nativeMemorySummarySchema;
export const getRoomMemorySummaryOutputSchema = nativeMemorySummarySchema;

export type NativeMemoryItem = z.infer<typeof nativeMemoryItemSchema>;
export type NativeMemorySummary = z.infer<typeof nativeMemorySummarySchema>;

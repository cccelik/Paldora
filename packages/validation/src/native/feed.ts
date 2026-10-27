import { LIFE_UPDATE_SECTION_KEYS } from '@paldora/domain';
import { z } from 'zod';
import { nativePersonSchema } from './notifications.js';
import {
  nativeCursorSchema,
  nativePageSchema,
  nativeTimestampSchema,
} from './primitives.js';

export const NATIVE_LIFE_UPDATE_SECTION_KEYS = LIFE_UPDATE_SECTION_KEYS;

/**
 * Interaction summary as the web adapter shows it. Camera-reaction previews
 * carry the opaque media asset id only: no URL, no object key.
 */
export const nativeInteractionSummarySchema = z.object({
  commentCount: z.number().int().nonnegative(),
  reactions: z.array(
    z.object({ kind: z.string(), count: z.number().int().nonnegative() }),
  ),
  reactionCount: z.number().int().nonnegative(),
  realCount: z.number().int().nonnegative(),
  realPreview: z.array(
    z.object({ user: nativePersonSchema, mediaAssetId: z.string() }),
  ),
  viewerReaction: z
    .object({ kind: z.string(), mediaAssetId: z.string().optional() })
    .nullable(),
  canInteract: z.boolean(),
});

const feedBase = {
  boxId: z.string(),
  authorUid: z.string(),
  authorName: z.string(),
  /** Opaque media id for `mediaRead` thumbnail, or null. */
  authorAvatarMediaId: z.string().nullable(),
  mediaAssetIds: z.array(z.string()),
  createdAt: nativeTimestampSchema,
  interactions: nativeInteractionSummarySchema,
};

export const nativeFeedPostSchema = z.object({
  kind: z.literal('post'),
  id: z.string(),
  ...feedBase,
  text: z.string(),
  edited: z.boolean(),
  canEdit: z.boolean(),
});

/** `id` is the Life Update; `postId` is its delivery in `boxId`. */
export const nativeFeedLifeUpdateSchema = z.object({
  kind: z.literal('life_update'),
  id: z.string(),
  postId: z.string(),
  ...feedBase,
  sections: z.array(
    z.object({ key: z.enum(LIFE_UPDATE_SECTION_KEYS), content: z.string() }),
  ),
});

export const nativeFeedItemSchema = z.discriminatedUnion('kind', [
  nativeFeedPostSchema,
  nativeFeedLifeUpdateSchema,
]);

export const getHomeFeedInputSchema = z.object({
  cursor: nativeCursorSchema.optional(),
});
export const getHomeFeedOutputSchema = nativePageSchema(nativeFeedItemSchema);

export type NativeInteractionSummary = z.infer<
  typeof nativeInteractionSummarySchema
>;
export type NativeFeedItem = z.infer<typeof nativeFeedItemSchema>;

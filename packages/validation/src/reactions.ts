import {
  isSingleEmoji,
  REACTION_PRESET_COUNT,
  REACTION_SUMMARY_KIND_LIMIT,
  REAL_REACTION_KIND,
  REAL_REACTION_PREVIEW_COUNT,
} from '@paldora/domain';
import { z } from 'zod';
import { userSummarySchema } from './people.js';
import {
  cursorPageQuerySchema,
  cursorPageSchema,
  isoTimestampSchema,
  uuidSchema,
} from './primitives.js';

/** Any single emoji grapheme; presets are only shortcuts. */
export const emojiSchema = z
  .string()
  .refine(isSingleEmoji, { message: 'Choose a single emoji.' });

/** One kind and how many visible people chose it. */
export const reactionCountSchema = z
  .object({
    kind: z.string(),
    count: z.number().int().positive(),
  })
  .meta({ id: 'ReactionCount' });

/**
 * Counts are viewer-relative: reactions by people in a block relationship
 * with the viewer are omitted, so a number never reveals blocked activity.
 */
const reactionsSummaryShape = {
  /** Emoji kinds by count, most used first, at most eight. */
  reactions: z.array(reactionCountSchema).max(REACTION_SUMMARY_KIND_LIMIT),
  /** Every visible reaction, emoji and camera. */
  reactionCount: z.number().int().nonnegative(),
};

export const commentInteractionSummarySchema = z
  .object({
    ...reactionsSummaryShape,
    viewerReaction: z.object({ kind: z.string() }).nullable(),
  })
  .meta({ id: 'CommentInteractionSummary' });

/** A camera reaction in a post's preview strip: a signed thumbnail only. */
export const realReactionPreviewSchema = z
  .object({ user: userSummarySchema, thumbnailUrl: z.url() })
  .meta({ id: 'RealReactionPreview' });

export const postInteractionSummarySchema = z
  .object({
    /** Active comments and replies by people the viewer may see. */
    commentCount: z.number().int().nonnegative(),
    ...reactionsSummaryShape,
    /** Camera reactions; they are not listed in `reactions`. */
    realCount: z.number().int().nonnegative(),
    realPreview: z
      .array(realReactionPreviewSchema)
      .max(REAL_REACTION_PREVIEW_COUNT),
    viewerReaction: z
      .object({ kind: z.string(), mediaAssetId: uuidSchema.optional() })
      .nullable(),
    /** False once the Box is archived: reading stays possible, writing not. */
    canInteract: z.boolean(),
  })
  .meta({ id: 'PostInteractionSummary' });

/**
 * Set-state: an emoji, a camera image (`real` with its upload), or `null` to
 * remove. Repeating the same request changes nothing.
 */
export const setPostReactionSchema = z
  .object({
    kind: z.union([emojiSchema, z.literal(REAL_REACTION_KIND)]).nullable(),
    mediaAssetId: uuidSchema.optional(),
  })
  .strict()
  .refine(
    ({ kind, mediaAssetId }) =>
      (kind === REAL_REACTION_KIND) === (mediaAssetId !== undefined),
    {
      path: ['mediaAssetId'],
      message: 'Send a camera image with a camera reaction, and only then.',
    },
  )
  .meta({ id: 'SetPostReactionRequest' });

export const setCommentReactionSchema = z
  .object({ kind: emojiSchema.nullable() })
  .strict()
  .meta({ id: 'SetCommentReactionRequest' });

export const reactionPresetsSchema = z
  .object({
    presets: z
      .array(emojiSchema)
      .length(REACTION_PRESET_COUNT, 'Choose exactly five emoji.')
      .refine((presets) => new Set(presets).size === presets.length, {
        message: 'Each emoji can appear once.',
      }),
  })
  .strict()
  .meta({ id: 'ReactionPresetsRequest' });

export const postReactionEntrySchema = z
  .object({
    user: userSummarySchema,
    kind: z.string(),
    /** Present for camera reactions: short-lived signed URLs. */
    image: z.object({ url: z.url(), thumbnailUrl: z.url() }).optional(),
    createdAt: isoTimestampSchema,
  })
  .meta({ id: 'PostReactionEntry' });

export const postReactionPageSchema = cursorPageSchema(
  postReactionEntrySchema,
).meta({ id: 'PostReactionPage' });

export const postReactionsQuerySchema = cursorPageQuerySchema.extend({
  kind: z.union([emojiSchema, z.literal(REAL_REACTION_KIND)]).optional(),
});

export type ReactionCountView = z.infer<typeof reactionCountSchema>;
export type PostInteractionSummary = z.infer<
  typeof postInteractionSummarySchema
>;
export type CommentInteractionSummary = z.infer<
  typeof commentInteractionSummarySchema
>;
export type SetPostReactionInput = z.infer<typeof setPostReactionSchema>;
export type SetCommentReactionInput = z.infer<typeof setCommentReactionSchema>;
export type PostReactionEntry = z.infer<typeof postReactionEntrySchema>;

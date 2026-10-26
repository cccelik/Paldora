import { REAL_REACTION_KIND } from '@paldora/domain';
import { z } from 'zod';
import { emojiSchema } from '../reactions.js';
import {
  nativeIdSchema,
  nativeOkSchema,
  nativePageSchema,
  nativeString,
} from './primitives.js';

/**
 * `kind: null` clears the caller's reaction. `kind` is required (the key may
 * not be omitted). A camera reaction (`real`) needs `mediaAssetId`, an emoji
 * reaction must not carry one, and a camera reaction cannot target a comment.
 */
export const setBoxReactionInputSchema = z
  .object({
    boxId: nativeIdSchema,
    postId: nativeString(64),
    commentId: nativeString(64).optional(),
    mediaAssetId: nativeString(64).optional(),
    kind: z.union([emojiSchema, z.literal(REAL_REACTION_KIND)]).nullable(),
  })
  .refine(
    ({ kind, mediaAssetId, commentId }) =>
      (kind === REAL_REACTION_KIND) === (mediaAssetId !== undefined) &&
      !(mediaAssetId !== undefined && commentId !== undefined),
    { message: 'Invalid reaction.' },
  );
export const setBoxReactionOutputSchema = nativeOkSchema;

export const listBoxReactionsInputSchema = z.object({
  boxId: nativeIdSchema,
  postId: nativeString(64),
  commentId: nativeString(64).optional(),
  cursor: nativeString(128).optional(),
});
/** The callable projects reactions down to who and what; no timestamps. */
export const nativeReactionSchema = z.object({
  uid: z.string(),
  kind: z.string(),
});
export const listBoxReactionsOutputSchema =
  nativePageSchema(nativeReactionSchema);

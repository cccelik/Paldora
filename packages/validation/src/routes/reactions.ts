import { preferencesSchema } from '../identity.js';
import {
  commentInteractionSummarySchema,
  postInteractionSummarySchema,
  postReactionPageSchema,
  postReactionsQuerySchema,
  reactionPresetsSchema,
  setCommentReactionSchema,
  setPostReactionSchema,
} from '../reactions.js';
import { defineRoute } from '../route.js';

const reactionsTag = 'Reactions';

export const setPostReaction = defineRoute({
  operationId: 'setPostReaction',
  method: 'PUT',
  path: '/posts/{postId}/reaction',
  summary:
    'Set your one reaction on a post (idempotent): an emoji, a camera image (`kind: real` with a ready `reaction_image` upload from this post’s Box), or `null` to remove it. A camera image and an emoji replace each other; a replaced camera image is deleted.',
  tag: reactionsTag,
  access: 'authenticated',
  successStatus: 200,
  response: postInteractionSummarySchema,
  body: setPostReactionSchema,
  errors: [
    'POST_NOT_FOUND',
    'BOX_ARCHIVED',
    'MEDIA_NOT_FOUND',
    'MEDIA_NOT_READY',
  ],
});

export const setCommentReaction = defineRoute({
  operationId: 'setCommentReaction',
  method: 'PUT',
  path: '/comments/{commentId}/reaction',
  summary:
    'Set your one emoji reaction on a comment (idempotent), or `null` to remove it. Comments take no camera reactions.',
  tag: reactionsTag,
  access: 'authenticated',
  successStatus: 200,
  response: commentInteractionSummarySchema,
  body: setCommentReactionSchema,
  errors: ['COMMENT_NOT_FOUND', 'POST_NOT_FOUND', 'BOX_ARCHIVED'],
});

export const listPostReactions = defineRoute({
  operationId: 'listPostReactions',
  method: 'GET',
  path: '/posts/{postId}/reactions',
  summary:
    'Who reacted to a post, newest first, optionally one `kind` only. People in a block relationship with you are omitted. Camera reactions carry short-lived signed image URLs.',
  tag: reactionsTag,
  access: 'authenticated',
  successStatus: 200,
  response: postReactionPageSchema,
  query: postReactionsQuerySchema,
  errors: ['POST_NOT_FOUND'],
});

export const setReactionPresets = defineRoute({
  operationId: 'setReactionPresets',
  method: 'PUT',
  path: '/me/reaction-presets',
  summary:
    'Replace your five reaction shortcuts (idempotent). Shortcuts only: any single emoji is always allowed as a reaction.',
  tag: 'Identity',
  access: 'authenticated',
  successStatus: 200,
  response: preferencesSchema,
  body: reactionPresetsSchema,
  errors: [],
});

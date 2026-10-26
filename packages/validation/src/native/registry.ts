import type { z } from 'zod';
import * as account from './account.js';
import * as boxes from './boxes.js';
import * as comments from './comments.js';
import type { FunctionsErrorCode } from './errors.js';
import * as friendships from './friendships.js';
import * as invitations from './invitations.js';
import * as lifeUpdates from './life-updates.js';
import * as moderation from './moderation.js';
import * as posts from './posts.js';
import * as reactions from './reactions.js';

/** Fixed window of the trusted per-user limiter (`60 * 60 * 1000`). */
export const NATIVE_RATE_LIMIT_WINDOW_MS = 3_600_000;

export interface NativeCallable {
  name: string;
  input: z.ZodType;
  output: z.ZodType;
  /** HttpsError codes the callable can raise. `internal` is never declared. */
  errors: readonly FunctionsErrorCode[];
  /** `limited(uid, scope, perHour)` in `apps/firebase-functions`. */
  limit: { scope: string; perHour: number };
}

/** Every callable requires sign-in, validates input, and is rate limited. */
const baseErrors: FunctionsErrorCode[] = [
  'unauthenticated',
  'invalid-argument',
  'resource-exhausted',
];

const invitationErrors: FunctionsErrorCode[] = [
  'permission-denied',
  'already-exists',
  'failed-precondition',
  'not-found',
];
const friendshipErrors: FunctionsErrorCode[] = [
  'already-exists',
  'permission-denied',
  'not-found',
];
const contentErrors: FunctionsErrorCode[] = ['not-found'];
const moderationErrors: FunctionsErrorCode[] = [
  'permission-denied',
  'not-found',
];

function callable(
  name: string,
  perHour: number,
  schemas: { input: z.ZodType; output: z.ZodType },
  extraErrors: readonly FunctionsErrorCode[] = [],
): NativeCallable {
  return {
    name,
    ...schemas,
    errors: [...new Set([...baseErrors, ...extraErrors])].sort(),
    limit: { scope: name, perHour },
  };
}

/** Registered in the same order as `callableNames`. */
export const nativeCallableRegistry: readonly NativeCallable[] = [
  callable(
    'beginBoxDeletion',
    5,
    {
      input: boxes.beginBoxDeletionInputSchema,
      output: boxes.beginBoxDeletionOutputSchema,
    },
    ['not-found', 'failed-precondition'],
  ),
  callable(
    'boxDeletionStatus',
    120,
    {
      input: boxes.boxDeletionStatusInputSchema,
      output: boxes.boxDeletionStatusOutputSchema,
    },
    ['not-found'],
  ),
  callable(
    'createLifeUpdate',
    30,
    {
      input: lifeUpdates.createLifeUpdateInputSchema,
      output: lifeUpdates.createLifeUpdateOutputSchema,
    },
    contentErrors,
  ),
  callable(
    'getLifeUpdate',
    600,
    {
      input: lifeUpdates.getLifeUpdateInputSchema,
      output: lifeUpdates.getLifeUpdateOutputSchema,
    },
    contentErrors,
  ),
  callable(
    'listMyLifeUpdates',
    600,
    {
      input: lifeUpdates.listMyLifeUpdatesInputSchema,
      output: lifeUpdates.listMyLifeUpdatesOutputSchema,
    },
    contentErrors,
  ),
  callable(
    'editLifeUpdate',
    60,
    {
      input: lifeUpdates.editLifeUpdateInputSchema,
      output: lifeUpdates.editLifeUpdateOutputSchema,
    },
    contentErrors,
  ),
  callable(
    'deleteLifeUpdate',
    30,
    {
      input: lifeUpdates.deleteLifeUpdateInputSchema,
      output: lifeUpdates.deleteLifeUpdateOutputSchema,
    },
    contentErrors,
  ),
  callable(
    'inviteBox',
    60,
    {
      input: invitations.inviteBoxInputSchema,
      output: invitations.inviteBoxOutputSchema,
    },
    invitationErrors,
  ),
  callable(
    'provisionMyAccount',
    10,
    {
      input: account.provisionMyAccountInputSchema,
      output: account.provisionMyAccountOutputSchema,
    },
    ['failed-precondition'],
  ),
  callable(
    'sendFriendRequest',
    60,
    {
      input: friendships.sendFriendRequestInputSchema,
      output: friendships.sendFriendRequestOutputSchema,
    },
    friendshipErrors,
  ),
  callable(
    'acceptFriendRequest',
    120,
    {
      input: friendships.acceptFriendRequestInputSchema,
      output: friendships.acceptFriendRequestOutputSchema,
    },
    friendshipErrors,
  ),
  callable(
    'closeFriendship',
    120,
    {
      input: friendships.closeFriendshipInputSchema,
      output: friendships.closeFriendshipOutputSchema,
    },
    friendshipErrors,
  ),
  callable(
    'listMyFriendships',
    600,
    {
      input: friendships.listMyFriendshipsInputSchema,
      output: friendships.listMyFriendshipsOutputSchema,
    },
    friendshipErrors,
  ),
  callable(
    'listMyBoxInvitations',
    600,
    {
      input: invitations.listMyBoxInvitationsInputSchema,
      output: invitations.listMyBoxInvitationsOutputSchema,
    },
    invitationErrors,
  ),
  callable(
    'listBoxInvitations',
    600,
    {
      input: invitations.listBoxInvitationsInputSchema,
      output: invitations.listBoxInvitationsOutputSchema,
    },
    invitationErrors,
  ),
  callable(
    'listBoxMembers',
    600,
    {
      input: boxes.listBoxMembersInputSchema,
      output: boxes.listBoxMembersOutputSchema,
    },
    ['not-found'],
  ),
  callable(
    'acceptBoxInvitation',
    120,
    {
      input: invitations.acceptBoxInvitationInputSchema,
      output: invitations.acceptBoxInvitationOutputSchema,
    },
    invitationErrors,
  ),
  callable(
    'declineBoxInvitation',
    120,
    {
      input: invitations.declineBoxInvitationInputSchema,
      output: invitations.declineBoxInvitationOutputSchema,
    },
    invitationErrors,
  ),
  callable(
    'revokeBoxInvitation',
    120,
    {
      input: invitations.revokeBoxInvitationInputSchema,
      output: invitations.revokeBoxInvitationOutputSchema,
    },
    invitationErrors,
  ),
  callable(
    'reserveUsername',
    30,
    {
      input: account.reserveUsernameInputSchema,
      output: account.reserveUsernameOutputSchema,
    },
    ['already-exists', 'failed-precondition'],
  ),
  callable(
    'createBoxPost',
    120,
    {
      input: posts.createBoxPostInputSchema,
      output: posts.createBoxPostOutputSchema,
    },
    contentErrors,
  ),
  callable(
    'getBoxPost',
    1200,
    {
      input: posts.getBoxPostInputSchema,
      output: posts.getBoxPostOutputSchema,
    },
    contentErrors,
  ),
  callable(
    'listBoxPosts',
    600,
    {
      input: posts.listBoxPostsInputSchema,
      output: posts.listBoxPostsOutputSchema,
    },
    contentErrors,
  ),
  callable(
    'editBoxPost',
    240,
    {
      input: posts.editBoxPostInputSchema,
      output: posts.editBoxPostOutputSchema,
    },
    contentErrors,
  ),
  callable(
    'deleteBoxPost',
    240,
    {
      input: posts.deleteBoxPostInputSchema,
      output: posts.deleteBoxPostOutputSchema,
    },
    contentErrors,
  ),
  callable(
    'setUserBlock',
    120,
    {
      input: friendships.setUserBlockInputSchema,
      output: friendships.setUserBlockOutputSchema,
    },
    ['failed-precondition'],
  ),
  callable(
    'createBoxComment',
    240,
    {
      input: comments.createBoxCommentInputSchema,
      output: comments.createBoxCommentOutputSchema,
    },
    contentErrors,
  ),
  callable(
    'listBoxComments',
    600,
    {
      input: comments.listBoxCommentsInputSchema,
      output: comments.listBoxCommentsOutputSchema,
    },
    contentErrors,
  ),
  callable(
    'editBoxComment',
    240,
    {
      input: comments.editBoxCommentInputSchema,
      output: comments.editBoxCommentOutputSchema,
    },
    contentErrors,
  ),
  callable(
    'deleteBoxComment',
    240,
    {
      input: comments.deleteBoxCommentInputSchema,
      output: comments.deleteBoxCommentOutputSchema,
    },
    contentErrors,
  ),
  callable(
    'setBoxReaction',
    600,
    {
      input: reactions.setBoxReactionInputSchema,
      output: reactions.setBoxReactionOutputSchema,
    },
    contentErrors,
  ),
  callable(
    'listBoxReactions',
    600,
    {
      input: reactions.listBoxReactionsInputSchema,
      output: reactions.listBoxReactionsOutputSchema,
    },
    contentErrors,
  ),
  callable(
    'reportBoxPost',
    20,
    {
      input: moderation.reportBoxPostInputSchema,
      output: moderation.reportBoxPostOutputSchema,
    },
    moderationErrors,
  ),
  callable(
    'listModerationReports',
    600,
    {
      input: moderation.listModerationReportsInputSchema,
      output: moderation.listModerationReportsOutputSchema,
    },
    moderationErrors,
  ),
  callable(
    'hideReportedPost',
    120,
    {
      input: moderation.hideReportedPostInputSchema,
      output: moderation.hideReportedPostOutputSchema,
    },
    moderationErrors,
  ),
];

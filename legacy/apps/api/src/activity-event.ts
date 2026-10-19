import type { ActivityEventPayload } from '@paldora/database';
import type { UserId } from '@paldora/domain';

export function commentCreatedActivity(
  commentId: string,
  actorUserId: UserId,
  payload: ActivityEventPayload,
) {
  return {
    type: 'comment.created' as const,
    actorUserId,
    dedupeKey: `comment:${commentId}:created`,
    payload,
  };
}

export function reactionSetActivity(
  eventId: string,
  actorUserId: UserId,
  payload: ActivityEventPayload,
) {
  return {
    type: 'reaction.set' as const,
    actorUserId,
    dedupeKey: `reaction:${payload.postId}:${actorUserId}:${eventId}`,
    payload,
  };
}

export function commentReactionSetActivity(
  eventId: string,
  actorUserId: UserId,
  payload: ActivityEventPayload,
) {
  return {
    type: 'comment.reaction.set' as const,
    actorUserId,
    dedupeKey: `comment-reaction:${payload.commentId}:${actorUserId}:${eventId}`,
    payload,
  };
}

export function commentChangedActivity(
  action: 'updated' | 'deleted',
  eventId: string,
  actorUserId: UserId,
  payload: ActivityEventPayload,
) {
  return {
    type: `comment.${action}` as 'comment.updated' | 'comment.deleted',
    actorUserId,
    dedupeKey: `comment:${payload.commentId}:${action}:${eventId}`,
    payload,
  };
}

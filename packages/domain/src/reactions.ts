/**
 * Comments, reactions, and notifications (Phase 5). Limits here are mirrored
 * by check constraints in PostgreSQL, which stay the final authority.
 */
export const COMMENT_CONTENT_MAX_LENGTH = 2_000;

/** A root's reply preview on the comments page: the oldest few replies. */
export const COMMENT_REPLY_PREVIEW_COUNT = 3;

export const COMMENT_STATUSES = ['active', 'deleted'] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];

/** Upper bound on a stored reaction kind; long ZWJ sequences still fit. */
export const REACTION_KIND_MAX_LENGTH = 64;

/** The stored kind of a camera ("real") reaction on a post. */
export const REAL_REACTION_KIND = 'real';

/** How many distinct kinds a reaction summary lists, by count. */
export const REACTION_SUMMARY_KIND_LIMIT = 8;

/** How many of the latest camera reactions a post summary previews. */
export const REAL_REACTION_PREVIEW_COUNT = 4;

export const REACTION_PRESET_COUNT = 5;

/** Personal shortcuts only: any single emoji is always allowed. */
export const DEFAULT_REACTION_PRESETS = [
  '👍',
  '❤️',
  '😂',
  '😮',
  '😢',
] as const satisfies readonly string[];

const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' });
const emojiCodePoint =
  /\p{Extended_Pictographic}|\p{Regional_Indicator}|[#*0-9]️?⃣/u;

/**
 * Exactly one emoji grapheme: ZWJ sequences, flags, keycaps, and skin tones
 * count as one. Untrimmed input and the reserved `real` marker are rejected.
 */
export function isSingleEmoji(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= REACTION_KIND_MAX_LENGTH &&
    value.trim() === value &&
    value !== REAL_REACTION_KIND &&
    emojiCodePoint.test(value) &&
    Array.from(graphemes.segment(value)).length === 1
  );
}

export const NOTIFICATION_TYPES = [
  'post.comment',
  'comment.reply',
  'post.reaction',
  'comment.reaction',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Outbox event types recorded with the write that causes them. */
export const ACTIVITY_EVENT_TYPES = [
  'comment.created',
  'post.reaction.set',
  'comment.reaction.set',
] as const;
export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];

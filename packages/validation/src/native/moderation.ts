import { z } from 'zod';
import {
  nativeIdSchema,
  nativeOkSchema,
  nativePageSchema,
  nativeString,
  nativeTimestampSchema,
} from './primitives.js';
import { nativeUuidCursorSchema } from './posts.js';

export const reportBoxPostInputSchema = z.object({
  boxId: nativeIdSchema,
  postId: nativeString(64),
  reason: nativeString(2_000),
});
export const reportBoxPostOutputSchema = z.object({ reportId: z.string() });

export const listModerationReportsInputSchema = z.object({
  cursor: nativeUuidCursorSchema.optional(),
});
export const nativeReportSchema = z.object({
  id: z.string(),
  boxId: z.string(),
  postId: z.string(),
  reporterUid: z.string(),
  reason: z.string(),
  createdAt: nativeTimestampSchema,
  status: z.literal('open'),
});
export const listModerationReportsOutputSchema =
  nativePageSchema(nativeReportSchema);

export const hideReportedPostInputSchema = z.object({
  reportId: nativeString(64),
});
export const hideReportedPostOutputSchema = nativeOkSchema;

/**
 * User-facing reports (the web `ReportControl`). A comment is addressed by id
 * alone; an unknown, hidden or inaccessible comment is one `not-found`.
 */
export const NATIVE_REPORT_CATEGORIES = [
  'harassment',
  'spam',
  'privacy',
  'other',
] as const;
export const nativeReportCategorySchema = z.enum(NATIVE_REPORT_CATEGORIES);
export const reportBoxCommentInputSchema = z.object({
  commentId: nativeString(64),
  category: nativeReportCategorySchema,
  detail: z.string().trim().min(1).max(2_000).nullable(),
});
export const reportBoxCommentOutputSchema = z.object({ reportId: z.string() });

/** The reporter's own receipt; never the target's content or the reported user. */
export const nativeReportReceiptSchema = z.object({
  id: z.string(),
  targetKind: z.enum(['user', 'box', 'post', 'comment']),
  targetId: z.string(),
  category: nativeReportCategorySchema,
  status: z.enum(['open', 'closed']),
  createdAt: nativeTimestampSchema,
});
export const listMyReportsInputSchema = z.object({
  cursor: nativeUuidCursorSchema.optional(),
});
export const listMyReportsOutputSchema = nativePageSchema(
  nativeReportReceiptSchema,
);

/** Content of the caller's own that moderation hid and that is still hidden. */
export const nativeModerationNoticeSchema = z.object({
  targetKind: z.enum(['post', 'comment']),
  targetId: z.string(),
  originalCreatedAt: nativeTimestampSchema,
});
export const listMyModerationNoticesInputSchema = z.object({});
export const listMyModerationNoticesOutputSchema = z.object({
  items: z.array(nativeModerationNoticeSchema),
});

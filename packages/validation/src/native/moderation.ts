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

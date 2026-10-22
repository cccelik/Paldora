import { z } from 'zod';
import {
  cursorPageQuerySchema,
  cursorPageSchema,
  isoTimestampSchema,
  uuidSchema,
} from './primitives.js';

export const reportTargetKindSchema = z.enum([
  'user',
  'box',
  'post',
  'comment',
]);
export const moderationQueueQuerySchema = cursorPageQuerySchema.extend({
  status: z.enum(['open', 'closed']).default('open'),
});
export const reportCategorySchema = z.enum([
  'harassment',
  'spam',
  'privacy',
  'other',
]);

export const createReportSchema = z
  .object({
    targetKind: reportTargetKindSchema,
    targetId: uuidSchema,
    category: reportCategorySchema,
    detail: z.string().trim().min(1).max(2000).nullable(),
  })
  .strict()
  .meta({ id: 'CreateReport' });

export const reportReceiptSchema = z
  .object({
    id: uuidSchema,
    targetKind: reportTargetKindSchema,
    targetId: uuidSchema,
    category: reportCategorySchema,
    status: z.enum(['open', 'closed']),
    createdAt: isoTimestampSchema,
  })
  .meta({ id: 'ReportReceipt' });

export const reportReceiptPageSchema = cursorPageSchema(
  reportReceiptSchema,
).meta({ id: 'ReportReceiptPage' });

export const moderationCaseSchema = reportReceiptSchema
  .extend({
    detail: z.string().nullable(),
    reporterUserId: uuidSchema.nullable(),
    closedAt: isoTimestampSchema.nullable(),
  })
  .meta({ id: 'ModerationCase' });

export const moderationCasePageSchema = cursorPageSchema(
  reportReceiptSchema,
).meta({ id: 'ModerationCasePage' });

export const moderationActionSchema = z
  .object({
    action: z.enum(['close', 'suspend', 'unsuspend', 'hide', 'restore']),
    reason: z.string().trim().min(20).max(1000),
    idempotencyKey: uuidSchema,
  })
  .strict()
  .meta({ id: 'ModerationAction' });

export type CreateReportInput = z.infer<typeof createReportSchema>;
export type ModerationActionInput = z.infer<typeof moderationActionSchema>;

export const moderationAccountSchema = z
  .object({
    id: uuidSchema,
    username: z.string().nullable(),
    status: z.enum(['active', 'suspended', 'deleted']),
  })
  .meta({ id: 'ModerationAccount' });

export const moderationNoticeSchema = z
  .object({
    targetKind: z.enum(['post', 'comment']),
    targetId: uuidSchema,
    originalCreatedAt: isoTimestampSchema,
  })
  .meta({ id: 'ModerationNotice' });

export const moderationNoticesSchema = z
  .object({ items: z.array(moderationNoticeSchema).max(50) })
  .meta({ id: 'ModerationNotices' });

import { cursorPageQuerySchema } from '../primitives.js';
import {
  createReportSchema,
  moderationCasePageSchema,
  moderationCaseSchema,
  moderationActionSchema,
  moderationAccountSchema,
  moderationQueueQuerySchema,
  reportReceiptPageSchema,
  reportReceiptSchema,
} from '../reports.js';
import { defineRoute } from '../route.js';

export const createReport = defineRoute({
  operationId: 'createReport',
  method: 'POST',
  path: '/reports',
  summary:
    'Private allegation about a currently accessible active target. Duplicate submissions return the existing receipt. A missing or inaccessible target uses its ordinary absence response. Rate limited to 20 per hour.',
  tag: 'Reports',
  access: 'authenticated',
  successStatus: 201,
  body: createReportSchema,
  response: reportReceiptSchema,
  errors: [
    'USER_NOT_FOUND',
    'BOX_NOT_FOUND',
    'POST_NOT_FOUND',
    'COMMENT_NOT_FOUND',
  ],
});

export const listMyReports = defineRoute({
  operationId: 'listMyReports',
  method: 'GET',
  path: '/me/reports',
  summary:
    'Private receipts owned by the reporter; no other reporter or case evidence.',
  tag: 'Reports',
  access: 'authenticated',
  successStatus: 200,
  query: cursorPageQuerySchema,
  response: reportReceiptPageSchema,
  errors: [],
});

export const listModerationCases = defineRoute({
  operationId: 'listModerationCases',
  method: 'GET',
  path: '/moderation/cases',
  summary:
    'Minimal newest-first open or closed case queue; explicit staff grant required.',
  tag: 'Moderation',
  access: 'authenticated',
  successStatus: 200,
  query: moderationQueueQuerySchema,
  response: moderationCasePageSchema,
  errors: ['MODERATION_FORBIDDEN'],
});

export const getModerationCase = defineRoute({
  operationId: 'getModerationCase',
  method: 'GET',
  path: '/moderation/cases/{caseId}',
  summary: 'Staff-only case evidence read, recorded in the append-only audit.',
  tag: 'Moderation',
  access: 'authenticated',
  successStatus: 200,
  response: moderationCaseSchema,
  errors: ['MODERATION_FORBIDDEN', 'REPORT_NOT_FOUND'],
});

export const actOnModerationCase = defineRoute({
  operationId: 'actOnModerationCase',
  method: 'POST',
  path: '/moderation/cases/{caseId}/actions',
  summary:
    'Staff action with mandatory reason and idempotency key. Close a case, suspend/unsuspend a reported user, or hide/restore a reported post or comment. Takedown retires media objects before success. Rate limited to 60 per hour.',
  tag: 'Moderation',
  access: 'authenticated',
  successStatus: 201,
  body: moderationActionSchema,
  response: moderationCaseSchema,
  errors: [
    'MODERATION_FORBIDDEN',
    'REPORT_NOT_FOUND',
    'REPORT_ACTION_UNAVAILABLE',
  ],
});

export const getModerationAccount = defineRoute({
  operationId: 'getModerationAccount',
  method: 'GET',
  path: '/moderation/accounts/{accountId}',
  summary:
    'Administrator-only exact-ID account lookup. Every lookup, including a miss, is audited and rate limited to 30 per hour.',
  tag: 'Moderation',
  access: 'authenticated',
  successStatus: 200,
  response: moderationAccountSchema,
  errors: ['MODERATION_FORBIDDEN', 'USER_NOT_FOUND'],
});

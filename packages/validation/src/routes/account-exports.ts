import {
  accountExportDownloadSchema,
  accountExportLatestSchema,
  accountExportSchema,
} from '../account-exports.js';
import { defineRoute } from '../route.js';

export const requestAccountExport = defineRoute({
  operationId: 'requestAccountExport',
  method: 'POST',
  path: '/me/export',
  summary:
    'Request a private JSON archive of your own account data. One pending request at a time; 3 requests per day.',
  tag: 'Account',
  access: 'authenticated',
  successStatus: 201,
  response: accountExportSchema,
  errors: [],
});

export const getAccountExport = defineRoute({
  operationId: 'getAccountExport',
  method: 'GET',
  path: '/me/export',
  summary:
    'Status of your most recent archive request, or null if none exists.',
  tag: 'Account',
  access: 'authenticated',
  successStatus: 200,
  response: accountExportLatestSchema,
  errors: [],
});

export const downloadAccountExport = defineRoute({
  operationId: 'downloadAccountExport',
  method: 'GET',
  path: '/me/export/{exportId}/download',
  summary:
    'Get a 60-second signed read for your ready, unexpired private JSON archive.',
  tag: 'Account',
  access: 'authenticated',
  successStatus: 200,
  response: accountExportDownloadSchema,
  errors: ['EXPORT_NOT_FOUND', 'EXPORT_NOT_READY'],
});

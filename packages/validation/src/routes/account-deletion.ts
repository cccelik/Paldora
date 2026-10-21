import {
  accountDeletionLatestSchema,
  accountDeletionPasswordSchema,
  accountDeletionSchema,
} from '../account-deletion.js';
import { defineRoute } from '../route.js';

export const requestAccountDeletion = defineRoute({
  operationId: 'requestAccountDeletion',
  method: 'POST',
  path: '/me/deletion',
  summary:
    'Reauthenticate and request account erasure after at least seven days. Transfer all owned Boxes first. New media and Box ownership are blocked while pending.',
  tag: 'Account',
  access: 'authenticated',
  successStatus: 201,
  body: accountDeletionPasswordSchema,
  response: accountDeletionSchema,
  errors: ['ACCOUNT_REAUTH_FAILED', 'BOX_OWNERSHIP_TRANSFER_REQUIRED'],
});

export const getAccountDeletion = defineRoute({
  operationId: 'getAccountDeletion',
  method: 'GET',
  path: '/me/deletion',
  summary: 'Status of your active deletion request, or null.',
  tag: 'Account',
  access: 'authenticated',
  successStatus: 200,
  response: accountDeletionLatestSchema,
  errors: [],
});

export const cancelAccountDeletion = defineRoute({
  operationId: 'cancelAccountDeletion',
  method: 'DELETE',
  path: '/me/deletion',
  summary:
    'Reauthenticate and cancel a pending deletion before erasure commits.',
  tag: 'Account',
  access: 'authenticated',
  successStatus: 200,
  body: accountDeletionPasswordSchema,
  response: accountDeletionSchema,
  errors: ['ACCOUNT_REAUTH_FAILED', 'ACCOUNT_DELETION_NOT_FOUND'],
});

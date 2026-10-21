import {
  createLifeUpdateSchema,
  lifeUpdatePageSchema,
  lifeUpdateSchema,
  updateLifeUpdateSchema,
} from '../life-updates.js';
import { cursorPageQuerySchema } from '../primitives.js';
import { noContent } from './no-content.js';
import { defineRoute } from '../route.js';

const lifeUpdatesTag = 'Life Updates';

export const createLifeUpdate = defineRoute({
  operationId: 'createLifeUpdate',
  method: 'POST',
  path: '/life-updates',
  summary:
    'Publish a Life Update: sections and photos stored once, delivered to 1–20 Boxes you belong to (each Box gets its own conversation) or kept Only Me. The audience can never be changed. Any Box you are not in fails the whole request with BOX_NOT_FOUND, and any archived Box with BOX_ARCHIVED; nothing is partly published.',
  tag: lifeUpdatesTag,
  access: 'authenticated',
  successStatus: 201,
  response: lifeUpdateSchema,
  body: createLifeUpdateSchema,
  errors: [
    'BOX_NOT_FOUND',
    'BOX_ARCHIVED',
    'MEDIA_NOT_FOUND',
    'MEDIA_NOT_READY',
  ],
});

export const getLifeUpdate = defineRoute({
  operationId: 'getLifeUpdate',
  method: 'GET',
  path: '/life-updates/{lifeUpdateId}',
  summary:
    'One Life Update, with a context for each delivery Box you belong to. Missing, deleted, outside your Boxes, and blocked authors all answer LIFE_UPDATE_NOT_FOUND.',
  tag: lifeUpdatesTag,
  access: 'authenticated',
  successStatus: 200,
  response: lifeUpdateSchema,
  errors: ['LIFE_UPDATE_NOT_FOUND'],
});

export const updateLifeUpdate = defineRoute({
  operationId: 'updateLifeUpdate',
  method: 'PATCH',
  path: '/life-updates/{lifeUpdateId}',
  summary:
    'Edit your Life Update: `sections` and `mediaAssetIds` each replace that part whole when present (photos in display order; removed ones are deleted). The change shows in every Box. The audience can never change (there is no field for it). It must keep at least one section or photo. Allowed while it is Only Me or one of its Boxes you are in is open; otherwise BOX_ARCHIVED.',
  tag: lifeUpdatesTag,
  access: 'authenticated',
  successStatus: 200,
  response: lifeUpdateSchema,
  body: updateLifeUpdateSchema,
  errors: [
    'LIFE_UPDATE_NOT_FOUND',
    'LIFE_UPDATE_ACCESS_DENIED',
    'BOX_ARCHIVED',
    'MEDIA_NOT_FOUND',
    'MEDIA_NOT_READY',
  ],
});

export const deleteLifeUpdate = defineRoute({
  operationId: 'deleteLifeUpdate',
  method: 'DELETE',
  path: '/life-updates/{lifeUpdateId}',
  summary:
    'Delete your Life Update from every Box (idempotent). Its text and photos, and every comment, reaction, and notification on each delivery, are erased.',
  tag: lifeUpdatesTag,
  access: 'authenticated',
  successStatus: 204,
  response: noContent,
  errors: ['LIFE_UPDATE_NOT_FOUND', 'LIFE_UPDATE_ACCESS_DENIED'],
});

export const listMyLifeUpdates = defineRoute({
  operationId: 'listMyLifeUpdates',
  method: 'GET',
  path: '/me/life-updates',
  summary:
    'Your own Life Updates, newest first, including Only Me. One you can no longer see in any Box (you left them all) is left out, so a page may be short.',
  tag: lifeUpdatesTag,
  access: 'authenticated',
  successStatus: 200,
  response: lifeUpdatePageSchema,
  query: cursorPageQuerySchema,
  errors: [],
});

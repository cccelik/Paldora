import {
  personalizationSourceSchema,
  renderedPersonalizationSchema,
  updatePersonalizationSchema,
} from '../personalization.js';
import { roomSchema } from '../rooms.js';
import { defineRoute } from '../route.js';
const shared = {
  tag: 'Rooms',
  access: 'authenticated',
  successStatus: 200,
} as const;
export const getMyRoomPersonalization = defineRoute({
  ...shared,
  operationId: 'getMyRoomPersonalization',
  method: 'GET',
  path: '/me/room/personalization',
  summary:
    'Owner-only editable CSS and static widget sources, with independent feature availability. Private/no-store.',
  response: personalizationSourceSchema,
  errors: ['ROOM_NOT_FOUND'],
});
export const getRoomPersonalization = defineRoute({
  ...shared,
  operationId: 'getRoomPersonalization',
  method: 'GET',
  path: '/rooms/{username}/personalization',
  summary:
    'Currently authorized Room typography and sandbox documents; never editable sources. Reauthorizes and recompiles on every request. Disabled or obsolete policies fall back to empty. Private/no-store; reads follow the same unlimited policy as other Room GETs.',
  response: renderedPersonalizationSchema,
  errors: ['ROOM_NOT_FOUND'],
});
export const updateMyRoomPersonalization = defineRoute({
  ...shared,
  operationId: 'updateMyRoomPersonalization',
  method: 'PUT',
  path: '/me/room/personalization',
  summary:
    'Replace CSS and up to three ordered static widgets; empty source/list deletes. Shares Room optimistic version and 120/hour write budget. Disabled surfaces cannot be changed. Only the closed reviewed grammar is accepted.',
  response: roomSchema,
  body: updatePersonalizationSchema,
  errors: ['ROOM_NOT_FOUND', 'ROOM_UPDATE_STALE'],
});

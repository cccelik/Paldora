import { realtimeEventSchema } from '../events.js';
import { defineRoute } from '../route.js';

export const openEventStream = defineRoute({
  operationId: 'openEventStream',
  method: 'GET',
  path: '/me/events',
  summary:
    'One server-sent-event stream per client. Events are IDs only; refetch through normal routes. The stream ends when the access token expires and is capped per person, so clients reconnect with a fresh token and backoff.',
  tag: 'Realtime',
  access: 'authenticated',
  successStatus: 200,
  stream: true,
  response: realtimeEventSchema,
  errors: [],
});

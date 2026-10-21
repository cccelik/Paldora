import {
  memoryPageSchema,
  memoryQuerySchema,
  memorySummaryQuerySchema,
  memorySummarySchema,
} from '../memories.js';
import { defineRoute } from '../route.js';

const memoriesTag = 'Memories';

export const listMyMemories = defineRoute({
  operationId: 'listMyMemories',
  method: 'GET',
  path: '/me/memories',
  summary:
    'Your Memories for one UTC year (or one month of it), newest first: every post and Life Update you can still access, derived live and never copied. A Life Update appears once, with a context per Box you are in; Only Me ones are yours alone. Content by people in a block relationship with you, deleted content, and content in Boxes you left are omitted.',
  tag: memoriesTag,
  access: 'authenticated',
  successStatus: 200,
  response: memoryPageSchema,
  query: memoryQuerySchema,
  errors: [],
});

export const getMyMemorySummary = defineRoute({
  operationId: 'getMyMemorySummary',
  method: 'GET',
  path: '/me/memories/summary',
  summary:
    'How many Memories you have per UTC year, and per month of `year` (default: your newest year). Counted over exactly what the Memories list would show. Bounded by the calendar, so not paginated.',
  tag: memoriesTag,
  access: 'authenticated',
  successStatus: 200,
  response: memorySummarySchema,
  query: memorySummaryQuerySchema,
  errors: [],
});

export const listBoxMemories = defineRoute({
  operationId: 'listBoxMemories',
  method: 'GET',
  path: '/boxes/{boxId}/memories',
  summary:
    'A Box’s Memories for one UTC year (or month), newest first: its posts and Life Updates you can still access, each Life Update with only this Box’s context. A Box you are not in answers BOX_NOT_FOUND.',
  tag: memoriesTag,
  access: 'authenticated',
  successStatus: 200,
  response: memoryPageSchema,
  query: memoryQuerySchema,
  errors: ['BOX_NOT_FOUND'],
});

export const getBoxMemorySummary = defineRoute({
  operationId: 'getBoxMemorySummary',
  method: 'GET',
  path: '/boxes/{boxId}/memories/summary',
  summary:
    'How many of a Box’s Memories you can access per UTC year, and per month of `year` (default: the newest year). A Box you are not in answers BOX_NOT_FOUND.',
  tag: memoriesTag,
  access: 'authenticated',
  successStatus: 200,
  response: memorySummarySchema,
  query: memorySummaryQuerySchema,
  errors: ['BOX_NOT_FOUND'],
});

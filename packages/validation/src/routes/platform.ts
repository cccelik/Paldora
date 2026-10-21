import { livenessSchema, readinessSchema } from '../health.js';
import { defineRoute } from '../route.js';

export const getLiveness = defineRoute({
  operationId: 'getLiveness',
  method: 'GET',
  path: '/health',
  summary: 'Liveness probe. Performs no network I/O.',
  tag: 'Platform',
  access: 'public',
  successStatus: 200,
  response: livenessSchema,
  errors: [],
});

export const getReadiness = defineRoute({
  operationId: 'getReadiness',
  method: 'GET',
  path: '/health/ready',
  summary: 'Readiness probe. Checks PostgreSQL and Redis.',
  tag: 'Platform',
  access: 'public',
  successStatus: 200,
  response: readinessSchema,
  errors: ['SERVICE_UNAVAILABLE'],
});

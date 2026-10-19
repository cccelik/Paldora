import { z } from 'zod';
import { isoTimestampSchema } from './primitives.js';

export const livenessSchema = z
  .object({
    status: z.literal('ok'),
    service: z.literal('api'),
    timestamp: isoTimestampSchema,
  })
  .meta({ id: 'Liveness' });

export const readinessSchema = z
  .object({
    status: z.literal('ready'),
    dependencies: z.array(z.enum(['postgres', 'redis'])),
  })
  .meta({ id: 'Readiness' });

export type Liveness = z.infer<typeof livenessSchema>;
export type Readiness = z.infer<typeof readinessSchema>;

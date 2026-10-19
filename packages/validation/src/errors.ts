import { z } from 'zod';

/**
 * Public error envelope returned by every non-2xx API response. `code` is an
 * open string on the wire so older clients tolerate codes added later; clients
 * fall back to `message` for codes they do not recognize.
 */
export const errorEnvelopeSchema = z
  .object({
    error: z.object({
      code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
      message: z.string().min(1),
      requestId: z.string().min(1),
    }),
  })
  .meta({ id: 'ErrorEnvelope' });

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

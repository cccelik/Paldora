import { z } from 'zod';

export const uuidSchema = z.uuid();

export const cursorPageSchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type CursorPage = z.infer<typeof cursorPageSchema>;

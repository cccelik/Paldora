import { z } from 'zod';

export const MAX_PAGE_SIZE = 50;
export const DEFAULT_PAGE_SIZE = 20;

export const uuidSchema = z.uuid({ message: 'Must be a valid identifier.' });

/**
 * Keyset pagination input. Cursors are opaque to clients: they encode
 * `(createdAt, id)` server-side and must never be constructed by callers.
 */
export const cursorPageQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
});

export const cursorPageSchema = <Item extends z.ZodType>(item: Item) =>
  z.object({
    items: z.array(item).max(MAX_PAGE_SIZE),
    nextCursor: z.string().nullable(),
  });

export const isoTimestampSchema = z.iso.datetime({ offset: true });

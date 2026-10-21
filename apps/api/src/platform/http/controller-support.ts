import type { AuthenticatedPrincipal } from '@paldora/domain';
import { cursorPageQuerySchema } from '@paldora/validation';
import type { PageQuery } from '../pagination/pagination.js';
import { ZodPipe } from './zod.pipe.js';

/** What `@CurrentPrincipal()` gives a handler. */
export type Principal = AuthenticatedPrincipal;

export type { PageQuery };

/** `@Query(cursorPageQuery) query: PageQuery` for plain keyset lists. */
export const cursorPageQuery = new ZodPipe(cursorPageQuerySchema);

/** One hour in seconds: the window most rate limits count over. */
export const HOUR = 3_600;

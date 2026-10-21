import { z } from 'zod';

/** Success responses that carry no body (HTTP 204). */
export const noContent = z.void();

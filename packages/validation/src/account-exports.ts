import { z } from 'zod';
import { isoTimestampSchema, uuidSchema } from './primitives.js';

export const accountExportSchema = z
  .object({
    id: uuidSchema,
    status: z.enum(['pending', 'ready', 'expired']),
    createdAt: isoTimestampSchema,
    readyAt: isoTimestampSchema.nullable(),
    expiresAt: isoTimestampSchema.nullable(),
  })
  .meta({ id: 'AccountExport' });

export const accountExportDownloadSchema = z
  .object({
    url: z.url(),
    expiresAt: isoTimestampSchema,
  })
  .meta({ id: 'AccountExportDownload' });

export const accountExportLatestSchema = z
  .object({ export: accountExportSchema.nullable() })
  .meta({ id: 'AccountExportLatest' });

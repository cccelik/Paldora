import { uuidSchema } from '@paldora/validation';
import { notFound } from 'next/navigation';
/** Required route IDs retain a real not-found response before rendering. */
export function uuidParam(value: unknown): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) notFound();
  return parsed.data;
}
/** Malformed optional hints are ignored, as if they were absent. */
export function optionalUuid(value: unknown): string | undefined {
  const parsed = uuidSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
export const BOX_ABSENT = ['BOX_NOT_FOUND', 'VALIDATION_FAILED'] as const;
export const POST_ABSENT = ['POST_NOT_FOUND', 'VALIDATION_FAILED'] as const;
export const LIFE_UPDATE_ABSENT = [
  'LIFE_UPDATE_NOT_FOUND',
  'VALIDATION_FAILED',
] as const;
export const ROOM_ABSENT = ['ROOM_NOT_FOUND'] as const;
export const MEMORY_ABSENT = ['VALIDATION_FAILED'] as const;

import { LIFE_UPDATE_SECTION_KEYS } from '@paldora/domain';
import { z } from 'zod';
import {
  createLifeUpdateSchema,
  updateLifeUpdateSchema,
} from '../life-updates.js';
import {
  nativeOkSchema,
  nativePageSchema,
  nativeString,
  nativeTimestampSchema,
} from './primitives.js';

/** The service re-parses `request.data` with the shared Life Update schemas. */
export const createLifeUpdateInputSchema = createLifeUpdateSchema;
export const createLifeUpdateOutputSchema = z.object({ id: z.string() });

export const getLifeUpdateInputSchema = z.object({ id: nativeString(36) });

const sectionsShape = Object.fromEntries(
  LIFE_UPDATE_SECTION_KEYS.map((key) => [key, z.string().optional()]),
) as Record<
  (typeof LIFE_UPDATE_SECTION_KEYS)[number],
  z.ZodOptional<z.ZodString>
>;

export const nativeLifeUpdateSchema = z.object({
  id: z.string(),
  authorUid: z.string(),
  audience: z.enum(['only_me', 'boxes']),
  sections: z.object(sectionsShape),
  mediaAssetIds: z.array(z.string()),
  createdAt: nativeTimestampSchema,
  updatedAt: nativeTimestampSchema,
  canEdit: z.boolean(),
  contexts: z.array(
    z.object({
      boxId: z.string(),
      boxName: z.string(),
      postId: z.string(),
      canInteract: z.boolean(),
    }),
  ),
});
export const getLifeUpdateOutputSchema = nativeLifeUpdateSchema;

export const listMyLifeUpdatesInputSchema = z.object({
  cursor: nativeString(36).optional(),
});
export const listMyLifeUpdatesOutputSchema = nativePageSchema(
  nativeLifeUpdateSchema,
);

export const editLifeUpdateInputSchema = z.object({
  id: nativeString(36),
  changes: updateLifeUpdateSchema,
});
export const editLifeUpdateOutputSchema = nativeOkSchema;

export const deleteLifeUpdateInputSchema = getLifeUpdateInputSchema;
export const deleteLifeUpdateOutputSchema = nativeOkSchema;

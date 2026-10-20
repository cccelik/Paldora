import {
  LIFE_UPDATE_AUDIENCES,
  LIFE_UPDATE_MAX_BOXES,
  LIFE_UPDATE_MEDIA_MAX_ITEMS,
  LIFE_UPDATE_SECTION_KEYS,
  LIFE_UPDATE_SECTION_MAX_LENGTH,
  LIFE_UPDATE_TOTAL_MAX_LENGTH,
  type LifeUpdateSectionKey,
} from '@paldora/domain';
import { z } from 'zod';
import { userSummarySchema } from './people.js';
import { postMediaSchema } from './posts.js';
import { postInteractionSummarySchema } from './reactions.js';
import {
  cursorPageSchema,
  isoTimestampSchema,
  uuidSchema,
} from './primitives.js';

/**
 * Body IDs as lowercase UUIDs, so distinctness checks and lock ordering
 * agree with PostgreSQL, which treats `ABC…` and `abc…` as the same UUID.
 */
const idSchema = uuidSchema.transform((value) => value.toLowerCase());

const distinct = (ids: readonly string[]) => new Set(ids).size === ids.length;

const sectionTextSchema = z
  .string()
  .trim()
  .max(
    LIFE_UPDATE_SECTION_MAX_LENGTH,
    'Each section can be up to 2,000 characters.',
  );

const sectionShape = Object.fromEntries(
  LIFE_UPDATE_SECTION_KEYS.map((key) => [key, sectionTextSchema.optional()]),
) as Record<LifeUpdateSectionKey, z.ZodOptional<typeof sectionTextSchema>>;

/** The sections someone wrote, trimmed, with empty ones dropped. */
export type LifeUpdateSectionsInput = Partial<
  Record<LifeUpdateSectionKey, string>
>;

const sectionsLength = (sections: LifeUpdateSectionsInput) =>
  Object.values(sections).reduce((total, text) => total + text.length, 0);

/**
 * Only the nine fixed keys (strict), each optional. Text is trimmed and
 * empty sections are dropped, so `{ travel: '  ' }` means no sections.
 */
export const lifeUpdateSectionsSchema = z
  .object(sectionShape)
  .strict()
  .transform((sections): LifeUpdateSectionsInput =>
    Object.fromEntries(
      Object.entries(sections).filter(
        (entry): entry is [string, string] =>
          entry[1] !== undefined && entry[1].length > 0,
      ),
    ),
  )
  .refine(
    (sections) => sectionsLength(sections) <= LIFE_UPDATE_TOTAL_MAX_LENGTH,
    {
      message: 'A Life Update can be up to 10,000 characters in total.',
    },
  );

/** Chosen once at publish time; it can never be changed afterwards. */
export const lifeUpdateAudienceInputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('only_me') }).strict(),
  z
    .object({
      type: z.literal('boxes'),
      boxIds: z
        .array(idSchema)
        .min(1, 'Choose at least one Box.')
        .max(LIFE_UPDATE_MAX_BOXES, 'A Life Update can go to up to 20 Boxes.')
        .refine(distinct, { message: 'Each Box can be chosen once.' }),
    })
    .strict(),
]);

const lifeUpdateMediaIdsSchema = z
  .array(idSchema)
  .max(LIFE_UPDATE_MEDIA_MAX_ITEMS, 'A Life Update can have up to 4 photos.')
  .refine(distinct, { message: 'Each photo can be attached once.' });

const hasSomething = ({
  sections,
  mediaAssetIds,
}: {
  sections: LifeUpdateSectionsInput;
  mediaAssetIds: readonly string[];
}) => Object.keys(sections).length > 0 || mediaAssetIds.length > 0;

const needsSomething = {
  path: ['sections'],
  message: 'Write at least one section or add a photo first.',
};

export const createLifeUpdateSchema = z
  .object({
    audience: lifeUpdateAudienceInputSchema,
    sections: lifeUpdateSectionsSchema.default({}),
    /** Ready `life_update_image` uploads, in display order. */
    mediaAssetIds: lifeUpdateMediaIdsSchema.default([]),
  })
  .strict()
  .refine(hasSomething, needsSomething)
  .meta({ id: 'CreateLifeUpdateRequest' });

/**
 * A partial edit (strict): a field that is present replaces that part
 * whole (`sections` the sections, `mediaAssetIds` the photos, in display
 * order, kept and new alike); one left out stays as it is. There is no
 * `audience` key: the audience is final. The result must keep at least one
 * section or photo, which the service checks against what is stored.
 */
export const updateLifeUpdateSchema = z
  .object({
    sections: lifeUpdateSectionsSchema.optional(),
    /** Every photo it should have afterwards, in display order. */
    mediaAssetIds: lifeUpdateMediaIdsSchema.optional(),
  })
  .strict()
  .refine(
    ({ sections, mediaAssetIds }) =>
      sections !== undefined || mediaAssetIds !== undefined,
    { message: 'Change the sections or the photos.' },
  )
  .refine(
    ({ sections, mediaAssetIds }) =>
      sections === undefined ||
      mediaAssetIds === undefined ||
      hasSomething({ sections, mediaAssetIds }),
    needsSomething,
  )
  .meta({ id: 'UpdateLifeUpdateRequest' });

export const lifeUpdateSectionSchema = z
  .object({
    key: z.enum(LIFE_UPDATE_SECTION_KEYS),
    /** Display label from the shared domain table. */
    label: z.string(),
    content: z.string(),
  })
  .meta({ id: 'LifeUpdateSection' });

/**
 * One delivery Box the viewer belongs to, with that Box's own conversation:
 * comments and reactions are on `postId` (the Box's backing post).
 */
export const lifeUpdateContextSchema = z
  .object({
    postId: uuidSchema,
    box: z.object({ id: uuidSchema, name: z.string() }),
    interactions: postInteractionSummarySchema,
  })
  .meta({ id: 'LifeUpdateContext' });

/**
 * A Life Update as one viewer may see it. `contexts` lists only Boxes the
 * viewer currently belongs to, alphabetically (never other Boxes), and is
 * empty for Only Me.
 */
export const lifeUpdateSchema = z
  .object({
    id: uuidSchema,
    author: userSummarySchema,
    audience: z.enum(LIFE_UPDATE_AUDIENCES),
    /** Non-empty sections in canonical order. */
    sections: z
      .array(lifeUpdateSectionSchema)
      .max(LIFE_UPDATE_SECTION_KEYS.length),
    media: z.array(postMediaSchema).max(LIFE_UPDATE_MEDIA_MAX_ITEMS),
    createdAt: isoTimestampSchema,
    editedAt: isoTimestampSchema.nullable(),
    /** The viewer wrote it, and it is Only Me or one delivery Box is open. */
    canEdit: z.boolean(),
    contexts: z.array(lifeUpdateContextSchema).max(LIFE_UPDATE_MAX_BOXES),
  })
  .meta({ id: 'LifeUpdate' });

export const lifeUpdatePageSchema = cursorPageSchema(lifeUpdateSchema).meta({
  id: 'LifeUpdatePage',
});

export type CreateLifeUpdateInput = z.input<typeof createLifeUpdateSchema>;
/** After defaults and trimming: what the service receives. */
export type NewLifeUpdate = z.output<typeof createLifeUpdateSchema>;
export type UpdateLifeUpdateInput = z.input<typeof updateLifeUpdateSchema>;
/** After trimming: what the edit service receives. */
export type LifeUpdateChanges = z.output<typeof updateLifeUpdateSchema>;
export type LifeUpdateView = z.infer<typeof lifeUpdateSchema>;
export type LifeUpdateContextView = z.infer<typeof lifeUpdateContextSchema>;
export type LifeUpdateSectionView = z.infer<typeof lifeUpdateSectionSchema>;

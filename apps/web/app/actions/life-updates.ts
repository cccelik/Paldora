'use server';

import { LIFE_UPDATE_SECTION_KEYS } from '@paldora/domain';
import {
  createLifeUpdateSchema,
  updateLifeUpdateSchema,
  uuidSchema,
} from '@paldora/validation';
import { type Route } from 'next';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { type ActionResult } from '../lib/action-result';
import { runForm, runFormWithData } from '../lib/action-runner';
import { lifeUpdateHref, sectionFieldName } from '../lib/life-update-form';
/** Every page that can show a Life Update or one of its conversations. */
const lifeUpdatePaths = [
  '/home',
  '/boxes/[boxId]',
  '/life-updates',
  '/life-updates/[lifeUpdateId]',
];

const copy = {
  BOX_ARCHIVED:
    'One of the chosen Boxes is archived, so nothing was shared. Choose active Boxes.',
  BOX_NOT_FOUND:
    'One of the chosen Boxes isn’t available to you anymore, so nothing was shared.',
  MEDIA_NOT_FOUND: 'A photo is no longer available. Remove it and try again.',
  MEDIA_NOT_READY: 'A photo is still being prepared. Try again in a moment.',
  RATE_LIMITED: 'That’s a lot of Life Updates at once. Try again later.',
  LIFE_UPDATE_NOT_FOUND: 'This Life Update is no longer here.',
  LIFE_UPDATE_ACCESS_DENIED: 'Only the person who wrote it can change it.',
};

const editCopy = {
  ...copy,
  BOX_ARCHIVED:
    'Every Box this was shared to is archived, so it can’t be edited now.',
};

/** A JSON list field (the composer sends IDs in order, as one value). */
function jsonList(value: string | undefined): unknown {
  if (value === undefined || value === '') return [];
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

/** The section fields that were sent, keyed as the API expects. */
function sectionsFrom(fields: Record<string, string>) {
  return Object.fromEntries(
    LIFE_UPDATE_SECTION_KEYS.flatMap((key) => {
      const value = fields[sectionFieldName(key)];
      return value === undefined ? [] : [[key, value]];
    }),
  );
}

const fieldsOf = (value: unknown) =>
  (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    string
  >;

const createForm = z.preprocess((value) => {
  const fields = fieldsOf(value);
  return {
    audience:
      fields.audience === 'only_me'
        ? { type: 'only_me' }
        : { type: 'boxes', boxIds: jsonList(fields.boxIds) },
    sections: sectionsFrom(fields),
    mediaAssetIds: jsonList(fields.mediaAssetIds),
  };
}, createLifeUpdateSchema);

const updateForm = z.preprocess(
  (value) => {
    const fields = fieldsOf(value);
    return {
      lifeUpdateId: fields.lifeUpdateId,
      returnBoxId: fields.returnBoxId ?? '',
      changes: {
        sections: sectionsFrom(fields),
        mediaAssetIds: jsonList(fields.mediaAssetIds),
      },
    };
  },
  z.object({
    lifeUpdateId: uuidSchema,
    returnBoxId: z.union([uuidSchema, z.literal('')]),
    changes: updateLifeUpdateSchema,
  }),
);

/**
 * Publishes once. The audience is final, so the composer says so before
 * this runs; afterwards the person lands on the new Life Update's page.
 */
export async function createLifeUpdateAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runFormWithData(
    formData,
    createForm,
    (api, body) => api.createLifeUpdate(body),
    { success: 'Shared.', paths: lifeUpdatePaths, copy },
  );
  if (result.status !== 'success') return result;
  redirect(lifeUpdateHref(result.data.id) as Route);
}

/** Replaces the sections and photos; the audience never changes. */
export async function updateLifeUpdateAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runFormWithData(
    formData,
    updateForm,
    (api, { lifeUpdateId, changes }) =>
      api.updateLifeUpdate(lifeUpdateId, changes),
    { success: 'Saved.', paths: lifeUpdatePaths, copy: editCopy },
  );
  if (result.status !== 'success') return result;
  const boxId = formData.get('returnBoxId');
  redirect(
    lifeUpdateHref(result.data.id, {
      boxId: typeof boxId === 'string' && boxId !== '' ? boxId : null,
    }) as Route,
  );
}

export async function deleteLifeUpdateAction(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  return runForm(
    formData,
    z.object({ lifeUpdateId: uuidSchema }),
    (api, { lifeUpdateId }) => api.deleteLifeUpdate(lifeUpdateId),
    { success: 'Life Update deleted.', paths: lifeUpdatePaths, copy },
  );
}

/** Deleting from its own page leaves for the list, since the page is gone. */
export async function deleteLifeUpdateAndLeaveAction(
  previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const result = await deleteLifeUpdateAction(previous, formData);
  if (result.status !== 'success') return result;
  redirect('/life-updates');
}

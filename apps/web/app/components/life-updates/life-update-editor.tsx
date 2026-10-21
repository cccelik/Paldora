'use client';

import { prepareLifeUpdatePhoto } from '@/actions/life-update-photos';
import { updateLifeUpdateAction } from '@/actions/life-updates';
import { ActionFeedback } from '@/components/forms/action-feedback';
import { SubmitButton } from '@/components/forms/submit-button';
import { useSubmitShortcut } from '@/components/forms/use-submit-shortcut';
import styles from '@/components/life-updates/life-update-editor.module.css';
import {
  LifeUpdatePhotoField,
  LifeUpdateSectionFields,
} from '@/components/life-updates/life-update-fields';
import {
  usePhotoAttachments,
  type PreparePhoto,
} from '@/components/media/use-photo-attachments';
import { buttonClassName, HiddenFields } from '@/components/ui';
import { idleResult } from '@/lib/actions/action-result';
import {
  draftProblem,
  lifeUpdateHref,
  type SectionDrafts,
} from '@/lib/life-updates/life-update-form';
import { type LifeUpdateSectionKey } from '@paldora/domain';
import { type LifeUpdateView } from '@paldora/validation';
import { type Route } from 'next';
import Link from 'next/link';
import { useActionState, useCallback, useMemo, useRef, useState } from 'react';
/**
 * Edit a Life Update's sections and photos. Kept photos start out ready;
 * saving replaces both parts everywhere it was shared. The audience is not
 * part of this form: it is final, and the page shows it read-only.
 */
export function LifeUpdateEditor({
  lifeUpdate,
  returnBoxId,
}: {
  lifeUpdate: LifeUpdateView;
  /** The Box conversation to return to after saving. */
  returnBoxId?: string | undefined;
}) {
  const [state, action] = useActionState(updateLifeUpdateAction, idleResult);
  const [drafts, setDrafts] = useState<SectionDrafts>(() =>
    Object.fromEntries(
      lifeUpdate.sections.map((section) => [section.key, section.content]),
    ),
  );
  const retained = useMemo(
    () =>
      lifeUpdate.media.map((photo) => ({
        mediaAssetId: photo.id,
        previewUrl: photo.thumbnailUrl,
      })),
    [lifeUpdate.media],
  );
  const photos = usePhotoAttachments(
    useCallback<PreparePhoto>((file) => prepareLifeUpdatePhoto(file), []),
    retained,
  );
  const form = useRef<HTMLFormElement>(null);
  const onSection = useCallback((key: LifeUpdateSectionKey, value: string) => {
    setDrafts((current) => ({ ...current, [key]: value }));
  }, []);
  const problem = draftProblem({
    drafts,
    photoCount: photos.readyIds.length,
    photosBusy: photos.busy,
  });
  const back = lifeUpdateHref(lifeUpdate.id, { boxId: returnBoxId });
  const submitShortcut = useSubmitShortcut(form, problem === null);
  return (
    <form
      ref={form}
      action={action}
      className={styles.form}
      onKeyDown={submitShortcut}
    >
      <HiddenFields values={{ lifeUpdateId: lifeUpdate.id }} />
      <HiddenFields values={{ returnBoxId: returnBoxId ?? '' }} />
      <LifeUpdateSectionFields
        idPrefix={`edit-${lifeUpdate.id}`}
        drafts={drafts}
        onChange={onSection}
      />
      <LifeUpdatePhotoField photos={photos} />
      <ActionFeedback state={state} />
      <div className={styles.actions}>
        <SubmitButton
          pendingLabel="Saving…"
          disabled={problem !== null}
          describedBy={problem === null ? undefined : 'life-update-problem'}
        >
          Save changes
        </SubmitButton>
        <Link className={buttonClassName('secondary')} href={back as Route}>
          Cancel
        </Link>
        {problem ? (
          <p id="life-update-problem" className={styles.hint}>
            {problem}
          </p>
        ) : null}
      </div>
    </form>
  );
}

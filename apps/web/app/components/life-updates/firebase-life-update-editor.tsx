'use client';

import { updateLifeUpdateAction } from '@/actions/life-updates';
import { ActionFeedback } from '@/components/forms/action-feedback';
import { SubmitButton } from '@/components/forms/submit-button';
import {
  LifeUpdatePhotoField,
  LifeUpdateSectionFields,
} from '@/components/life-updates/life-update-fields';
import { prepareLifeUpdatePhoto } from '@/actions/life-update-photos';
import {
  usePhotoAttachments,
  type PreparePhoto,
} from '@/components/media/use-photo-attachments';
import styles from '@/components/life-updates/life-update-editor.module.css';
import { HiddenFields } from '@/components/ui';
import { idleResult } from '@/lib/actions/action-result';
import {
  draftProblem,
  type SectionDrafts,
} from '@/lib/life-updates/life-update-form';
import type { FirebaseLifeUpdateItem } from '@/lib/server/firebase/data';
import type { LifeUpdateSectionKey } from '@paldora/domain';
import { useActionState, useCallback, useMemo, useState } from 'react';

export function FirebaseLifeUpdateEditor({
  update,
  returnBoxId,
}: {
  update: FirebaseLifeUpdateItem;
  returnBoxId?: string | undefined;
}) {
  const [state, action] = useActionState(updateLifeUpdateAction, idleResult);
  const [drafts, setDrafts] = useState<SectionDrafts>(() =>
    Object.fromEntries(
      update.sections.map(({ key, content }) => [key, content]),
    ),
  );
  const onSection = useCallback((key: LifeUpdateSectionKey, value: string) => {
    setDrafts((current) => ({ ...current, [key]: value }));
  }, []);
  const retained = useMemo(
    () =>
      update.mediaAssetIds.map((id) => ({
        mediaAssetId: id,
        previewUrl: `/media/${id}/thumbnail`,
      })),
    [update.mediaAssetIds],
  );
  const photos = usePhotoAttachments(
    useCallback<PreparePhoto>((file) => prepareLifeUpdatePhoto(file), []),
    retained,
  );
  const problem = draftProblem({
    drafts,
    photoCount: photos.readyIds.length,
    photosBusy: photos.busy,
  });
  return (
    <form action={action} className={styles.form}>
      <HiddenFields
        values={{ lifeUpdateId: update.id, returnBoxId: returnBoxId ?? '' }}
      />
      <LifeUpdateSectionFields
        idPrefix={`edit-${update.id}`}
        drafts={drafts}
        onChange={onSection}
      />
      <LifeUpdatePhotoField photos={photos} />
      <ActionFeedback state={state} />
      <div className={styles.actions}>
        <SubmitButton pendingLabel="Saving…" disabled={problem !== null}>
          Save changes
        </SubmitButton>
        {problem ? <p className={styles.hint}>{problem}</p> : null}
      </div>
    </form>
  );
}

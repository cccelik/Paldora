'use client';

import { prepareLifeUpdatePhoto } from '@/actions/life-update-photos';
import { createLifeUpdateAction } from '@/actions/life-updates';
import { ActionFeedback } from '@/components/forms/action-feedback';
import { SubmitButton } from '@/components/forms/submit-button';
import { useSubmitShortcut } from '@/components/forms/use-submit-shortcut';
import {
  AudienceFields,
  audienceSummary,
  type AudienceBox,
  type AudienceType,
} from '@/components/life-updates/life-update-audience';
import styles from '@/components/life-updates/life-update-composer.module.css';
import {
  LifeUpdatePhotoField,
  LifeUpdateSectionFields,
} from '@/components/life-updates/life-update-fields';
import {
  usePhotoAttachments,
  type PreparePhoto,
} from '@/components/media/use-photo-attachments';
import { HiddenFields } from '@/components/ui';
import { idleResult } from '@/lib/actions/action-result';
import {
  draftProblem,
  type SectionDrafts,
} from '@/lib/life-updates/life-update-form';
import { type LifeUpdateSectionKey } from '@paldora/domain';
import { useActionState, useCallback, useRef, useState } from 'react';
export type { AudienceBox } from '@/components/life-updates/life-update-audience';

/**
 * Write a Life Update: optional sections, up to four photos, and where it
 * goes, chosen once. Cmd/Ctrl+Enter shares. Everything stays if sharing
 * fails; the button stays locked, with the reason, until it can be sent.
 */
export function LifeUpdateComposer({
  boxes,
  preselectedBoxId,
  truncated = false,
  allowPhotos = true,
}: {
  boxes: readonly AudienceBox[];
  preselectedBoxId?: string | undefined;
  truncated?: boolean;
  allowPhotos?: boolean;
}) {
  const [state, action] = useActionState(createLifeUpdateAction, idleResult);
  const [drafts, setDrafts] = useState<SectionDrafts>({});
  const preselected = boxes.find(
    (box) => box.id === preselectedBoxId && !box.archived,
  );
  const hasOpenBox = boxes.some((box) => !box.archived);
  const [type, setType] = useState<AudienceType>(
    hasOpenBox ? 'boxes' : 'only_me',
  );
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(preselected ? [preselected.id] : []),
  );
  const photos = usePhotoAttachments(
    useCallback<PreparePhoto>((file) => prepareLifeUpdatePhoto(file), []),
  );
  const form = useRef<HTMLFormElement>(null);

  const onSection = useCallback((key: LifeUpdateSectionKey, value: string) => {
    setDrafts((current) => ({ ...current, [key]: value }));
  }, []);
  const onToggle = useCallback((boxId: string, on: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(boxId);
      else next.delete(boxId);
      return next;
    });
  }, []);

  // In list order (alphabetical), never in click order.
  const chosen = boxes.filter((box) => selected.has(box.id));
  const problem = draftProblem({
    drafts,
    photoCount: allowPhotos ? photos.readyIds.length : 0,
    photosBusy: allowPhotos && photos.busy,
    audience: { type, boxCount: chosen.length },
  });
  const submitShortcut = useSubmitShortcut(form, problem === null);
  return (
    <form
      ref={form}
      action={action}
      className={styles.form}
      onKeyDown={submitShortcut}
    >
      <HiddenFields
        values={{
          boxIds: JSON.stringify(
            type === 'boxes' ? chosen.map((box) => box.id) : [],
          ),
        }}
      />
      <LifeUpdateSectionFields
        idPrefix="life-update"
        drafts={drafts}
        onChange={onSection}
      />
      {allowPhotos ? <LifeUpdatePhotoField photos={photos} /> : null}
      <AudienceFields
        boxes={boxes}
        type={type}
        onType={setType}
        selected={selected}
        onToggle={onToggle}
        truncated={truncated}
      />
      <div className={styles.notice} id="life-update-audience-notice">
        <p className={styles.noticeTitle}>
          Where this goes can’t be changed after you share it.
        </p>
        <p>
          {type === 'boxes' ? 'Each Box gets its own conversation. ' : ''}
          {audienceSummary(
            type,
            chosen.map((box) => box.name),
          )}
        </p>
      </div>
      <ActionFeedback state={state} />
      <div className={styles.actions}>
        <SubmitButton
          pendingLabel="Sharing…"
          disabled={problem !== null}
          describedBy={
            problem === null
              ? 'life-update-audience-notice'
              : 'life-update-audience-notice life-update-problem'
          }
        >
          Share Life Update
        </SubmitButton>
        {problem ? (
          <p id="life-update-problem" className={styles.hint}>
            {problem}
          </p>
        ) : null}
      </div>
    </form>
  );
}

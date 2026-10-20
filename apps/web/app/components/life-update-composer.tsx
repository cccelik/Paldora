'use client';

import {
  LIFE_UPDATE_MAX_BOXES,
  type LifeUpdateSectionKey,
} from '@paldora/domain';
import { useActionState, useCallback, useMemo, useRef, useState } from 'react';
import { prepareLifeUpdatePhoto } from '../actions/life-update-photos';
import { createLifeUpdateAction } from '../actions/life-updates';
import { idleResult } from '../lib/action-result';
import { draftProblem, type SectionDrafts } from '../lib/life-update-form';
import { ActionFeedback } from './action-feedback';
import {
  LifeUpdatePhotoField,
  LifeUpdateSectionFields,
} from './life-update-fields';
import { SubmitButton } from './submit-button';
import { TextField } from './ui';
import {
  usePhotoAttachments,
  type PreparePhoto,
} from './use-photo-attachments';
import styles from './life-update-form.module.css';

export interface AudienceBox {
  readonly id: string;
  readonly name: string;
  readonly archived: boolean;
}

type AudienceType = 'only_me' | 'boxes';

const FILTER_FROM = 7;

function listNames(names: readonly string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')}, and ${names.at(-1) ?? ''}`;
}

function audienceSummary(type: AudienceType, names: readonly string[]) {
  if (type === 'only_me') {
    return 'Only you will see this. Nobody can comment or react.';
  }
  if (names.length === 0) return 'No Boxes chosen yet.';
  return `Sharing to ${listNames(names)}.`;
}

/**
 * The audience: Only me, or 1–20 of the person's active Boxes. Archived
 * Boxes are listed but cannot be chosen, with the reason beside them.
 */
function AudienceFields({
  boxes,
  type,
  onType,
  selected,
  onToggle,
  truncated,
}: {
  boxes: readonly AudienceBox[];
  type: AudienceType;
  onType: (type: AudienceType) => void;
  selected: ReadonlySet<string>;
  onToggle: (boxId: string, on: boolean) => void;
  truncated: boolean;
}) {
  const [filter, setFilter] = useState('');
  const shown = useMemo(() => {
    const needle = filter.trim().toLocaleLowerCase();
    return needle === ''
      ? boxes
      : boxes.filter((box) => box.name.toLocaleLowerCase().includes(needle));
  }, [boxes, filter]);
  const full = selected.size >= LIFE_UPDATE_MAX_BOXES;
  const boxesOff = type !== 'boxes';
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>Who it’s for</legend>
      <div className={styles.choices}>
        <label className={styles.choice}>
          <input
            type="radio"
            name="audience"
            value="boxes"
            checked={type === 'boxes'}
            onChange={() => onType('boxes')}
          />
          <span>Boxes</span>
        </label>
        <label className={styles.choice}>
          <input
            type="radio"
            name="audience"
            value="only_me"
            checked={type === 'only_me'}
            onChange={() => onType('only_me')}
          />
          <span>Only me</span>
        </label>
      </div>
      <fieldset className={styles.boxGroup} disabled={boxesOff}>
        <legend className={styles.subLegend}>Boxes</legend>
        {boxes.length >= FILTER_FROM ? (
          <TextField
            label="Find a Box"
            id="life-update-box-filter"
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            autoComplete="off"
          />
        ) : null}
        {boxes.length === 0 ? (
          <p className={styles.hint}>
            You’re not in any Boxes yet. Share this as Only me, or join a Box
            first.
          </p>
        ) : (
          <ul className={styles.boxList} aria-label="Your Boxes">
            {shown.map((box) => {
              const checked = selected.has(box.id);
              const reasonId = `life-update-box-${box.id}-reason`;
              return (
                <li key={box.id}>
                  <label className={styles.boxRow}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={box.archived || (full && !checked)}
                      aria-describedby={box.archived ? reasonId : undefined}
                      onChange={(event) =>
                        onToggle(box.id, event.target.checked)
                      }
                    />
                    <span className={styles.boxName}>{box.name}</span>
                    {box.archived ? (
                      <span id={reasonId} className={styles.boxReason}>
                        Archived, so it can’t receive new updates
                      </span>
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {shown.length === 0 && boxes.length > 0 ? (
          <p className={styles.hint}>No Box matches that name.</p>
        ) : null}
        <p className={styles.hint} aria-live="polite">
          {selected.size} of {LIFE_UPDATE_MAX_BOXES} selected
          {full ? '. That’s the most one Life Update can go to.' : ''}
        </p>
        {truncated ? (
          <p className={styles.hint}>Showing your first 200 Boxes.</p>
        ) : null}
      </fieldset>
    </fieldset>
  );
}

/**
 * Write a Life Update: optional sections, up to four photos, and where it
 * goes, chosen once. Cmd/Ctrl+Enter shares. Everything stays if sharing
 * fails; the button stays locked, with the reason, until it can be sent.
 */
export function LifeUpdateComposer({
  boxes,
  preselectedBoxId,
  truncated = false,
}: {
  boxes: readonly AudienceBox[];
  preselectedBoxId?: string | undefined;
  truncated?: boolean;
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
    photoCount: photos.readyIds.length,
    photosBusy: photos.busy,
    audience: { type, boxCount: chosen.length },
  });
  return (
    <form
      ref={form}
      action={action}
      className={styles.form}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          if (problem === null) form.current?.requestSubmit();
        }
      }}
    >
      <input
        type="hidden"
        name="boxIds"
        value={JSON.stringify(
          type === 'boxes' ? chosen.map((box) => box.id) : [],
        )}
      />
      <LifeUpdateSectionFields
        idPrefix="life-update"
        drafts={drafts}
        onChange={onSection}
      />
      <LifeUpdatePhotoField photos={photos} />
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

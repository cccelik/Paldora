'use client';

import { type RoomView } from '@paldora/validation';
import { type ReactNode } from 'react';
import { type ActionResult } from '../lib/action-result';
import { moveLabel } from '../lib/room-editor';
import { ActionFeedback } from './action-feedback';
import styles from './room-editor.module.css';
import { SubmitButton } from './submit-button';
import { Button, HiddenFields } from './ui';
import { ROOM_STALE_CODE, type RoomSaveContext } from './use-room-save';
/**
 * A persistent "reload" message: the Room changed somewhere else (another
 * tab or device), so nothing here is saved over it. Reloading shows the
 * latest version; nothing is merged or kept silently.
 */
export function RoomStaleNotice() {
  return (
    <div className={styles.stale} role="alert">
      <p>
        Your Room changed somewhere else, maybe in another tab. Reload to see
        the latest version before you save again. Changes you have not saved
        here will be lost.
      </p>
      <Button variant="secondary" onClick={() => window.location.reload()}>
        Reload
      </Button>
    </div>
  );
}

/**
 * A section's answer. The section whose save was stale shows the reload
 * notice; the others say why their save button is locked.
 */
export function RoomSectionFeedback({
  state,
  context,
  lockedId,
}: {
  state: ActionResult<RoomView>;
  context: RoomSaveContext;
  /** The id for the "locked" note the save button points to. */
  lockedId: string;
}) {
  if (state.status === 'error' && state.code === ROOM_STALE_CODE) {
    return <RoomStaleNotice />;
  }
  if (context.stale) {
    return (
      <p className={styles.locked} id={lockedId}>
        Reload the page to save changes here.
      </p>
    );
  }
  return <ActionFeedback state={state} />;
}

/** A section's save button, locked while the editor is stale. */
export function RoomSaveButton({
  children,
  context,
  lockedId,
  disabled = false,
  describedBy,
}: {
  children: string;
  context: RoomSaveContext;
  lockedId: string;
  disabled?: boolean;
  describedBy?: string | undefined;
}) {
  return (
    <SubmitButton
      pendingLabel="Saving…"
      disabled={disabled || context.stale}
      describedBy={context.stale ? lockedId : describedBy}
    >
      {children}
    </SubmitButton>
  );
}

/** The fields every Room write sends with the person's choices. */
export function RoomVersionField({ context }: { context: RoomSaveContext }) {
  return <HiddenFields values={{ expectedUpdatedAt: context.version ?? '' }} />;
}

/**
 * Keyboard reordering without drag and drop: "Move up" and "Move down"
 * buttons that name the item and its place, disabled at the ends. The
 * list announces each move in its own live region.
 */
export function MoveButtons({
  name,
  index,
  total,
  moveKey,
  onMove,
}: {
  name: string;
  index: number;
  total: number;
  /** Lets the list put focus back on this button after the move. */
  moveKey: string;
  onMove: (delta: -1 | 1) => void;
}) {
  return (
    <span className={styles.moves}>
      <Button
        variant="quiet"
        className={styles.move}
        data-move={`${moveKey}:up`}
        aria-label={moveLabel(name, 'up', index, total)}
        disabled={index === 0}
        onClick={() => onMove(-1)}
      >
        <span aria-hidden="true">↑</span>
      </Button>
      <Button
        variant="quiet"
        className={styles.move}
        data-move={`${moveKey}:down`}
        aria-label={moveLabel(name, 'down', index, total)}
        disabled={index === total - 1}
        onClick={() => onMove(1)}
      >
        <span aria-hidden="true">↓</span>
      </Button>
    </span>
  );
}

/** A titled customizer section (an `h2` and its form). */
export function EditorSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.section} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={styles.sectionTitle}>
        {title}
      </h2>
      {description ? (
        <p className={styles.sectionDetail}>{description}</p>
      ) : null}
      {children}
    </section>
  );
}

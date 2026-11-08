'use client';

import styles from '@/components/ui/overlays.module.css';
import { useEffect, useId, useRef, type ReactNode } from 'react';
/**
 * Figma "Overlays" (44:247): a Dialog and a Bottom sheet over a 50% inverse
 * scrim. Both use a native modal `<dialog>`: focus is trapped, Escape closes,
 * and focus returns to the opener. Never stack more than one overlay.
 */
interface OverlayProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Buttons, right-aligned (Dialog) or stacked (sheet). */
  actions?: ReactNode;
}

function Overlay({
  kind,
  open,
  onClose,
  title,
  children,
  actions,
}: OverlayProps & { kind: 'dialog' | 'sheet' }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`${styles.overlay} ${styles[kind]}`}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // A press on the scrim (the dialog element itself) closes it.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <OverlayCard
        kind={kind}
        title={title}
        titleId={titleId}
        actions={actions}
      >
        {children}
      </OverlayCard>
    </dialog>
  );
}

/** The card itself, without the modal behaviour (previews, static layouts). */
export function OverlayCard({
  kind,
  title,
  titleId,
  actions,
  children,
}: {
  kind: 'dialog' | 'sheet';
  title: string;
  titleId?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`${styles.card} ${styles[`${kind}Card`]}`}>
      {kind === 'sheet' ? (
        <span className={styles.grabber} aria-hidden="true" />
      ) : null}
      <h2 className={styles.title} id={titleId}>
        {title}
      </h2>
      <div className={styles.body}>{children}</div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}

export function Dialog(props: OverlayProps) {
  return <Overlay kind="dialog" {...props} />;
}

export function BottomSheet(props: OverlayProps) {
  return <Overlay kind="sheet" {...props} />;
}

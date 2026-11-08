'use client';

import { BottomSheet, Dialog, OverlayCard } from '@/components/ui/overlays';
import { Button } from '@/components/ui';
import styles from '@/design-preview/gallery.module.css';
import { useState } from 'react';
/** Static cards plus live triggers; only one overlay is open at a time. */
export function OverlayDemo() {
  const [open, setOpen] = useState<'dialog' | 'sheet' | null>(null);
  const close = () => setOpen(null);
  return (
    <div className={styles.sheetFrame}>
      <OverlayCard
        kind="dialog"
        title="Remove Leah?"
        actions={
          <>
            <Button variant="secondary">Cancel</Button>
            <Button variant="danger">Remove</Button>
          </>
        }
      >
        She will no longer see this Box.
      </OverlayCard>
      <OverlayCard
        kind="sheet"
        title="Share to a Box"
        actions={<Button variant="primary">Share</Button>}
      >
        Pick where this Life Update goes. You cannot change it later.
      </OverlayCard>
      <div className={styles.row}>
        <Button variant="secondary" onClick={() => setOpen('dialog')}>
          Open dialog
        </Button>
        <Button variant="secondary" onClick={() => setOpen('sheet')}>
          Open bottom sheet
        </Button>
      </div>
      <Dialog
        open={open === 'dialog'}
        onClose={close}
        title="Leave this Box?"
        actions={
          <>
            <Button variant="secondary" onClick={close}>
              Stay
            </Button>
            <Button variant="danger" onClick={close}>
              Leave
            </Button>
          </>
        }
      >
        You can rejoin only if someone invites you again.
      </Dialog>
      <BottomSheet
        open={open === 'sheet'}
        onClose={close}
        title="Box options"
        actions={
          <Button variant="secondary" onClick={close}>
            Close
          </Button>
        }
      >
        Rename, archive or invite people.
      </BottomSheet>
    </div>
  );
}

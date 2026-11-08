'use client';

import {
  deleteLifeUpdateAction,
  deleteLifeUpdateAndLeaveAction,
} from '@/actions/life-updates';
import { DeleteDialogForm } from '@/components/forms/delete-dialog-form';
import { Dialog, OverflowMenu, type OverflowMenuItem } from '@/components/ui';
import { type Route } from 'next';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
/**
 * The author’s Edit and Delete for one Life Update, in an overflow menu on the
 * dark card. Delete always takes the whole Life Update from every Box.
 */
export function LifeUpdateMenu({
  lifeUpdateId,
  canEdit,
  leaveAfterDelete = false,
}: {
  lifeUpdateId: string;
  /** False when every Box it went to is archived: it can only be deleted. */
  canEdit: boolean;
  leaveAfterDelete?: boolean;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const items: OverflowMenuItem[] = [
    ...(canEdit
      ? [
          {
            key: 'edit',
            label: 'Edit Life Update',
            onSelect: () =>
              router.push(`/life-updates/${lifeUpdateId}/edit` as Route),
          },
        ]
      : []),
    {
      key: 'delete',
      label: 'Delete Life Update',
      destructive: true,
      onSelect: () => setDeleting(true),
    },
  ];
  return (
    <>
      <OverflowMenu label="Life Update options" items={items} tone="inverse" />
      <Dialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete Life Update?"
      >
        {deleting ? (
          <>
            <p>Delete this Life Update from every Box?</p>
            <DeleteDialogForm
              action={
                leaveAfterDelete
                  ? deleteLifeUpdateAndLeaveAction
                  : deleteLifeUpdateAction
              }
              fields={{ lifeUpdateId }}
              confirmLabel="Yes, delete Life Update"
              onCancel={() => setDeleting(false)}
            />
          </>
        ) : null}
      </Dialog>
    </>
  );
}

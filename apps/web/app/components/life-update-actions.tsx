import { type Route } from 'next';
import Link from 'next/link';
import {
  deleteLifeUpdateAction,
  deleteLifeUpdateAndLeaveAction,
} from '../actions/life-updates';
import { ConfirmAction } from './confirm-action';
import styles from './post-card.module.css';
import { buttonClassName } from './ui';
/**
 * The author's Edit link and confirmed Delete. Delete always takes the
 * whole Life Update, from every Box, with its conversations: there is no
 * per-Box removal, since that would change where it went.
 */
export function LifeUpdateActions({
  lifeUpdateId,
  canEdit,
  onlyMe,
  returnBoxId,
  leaveAfterDelete = false,
}: {
  lifeUpdateId: string;
  /** False when every Box it went to is archived: it can only be deleted. */
  canEdit: boolean;
  onlyMe: boolean;
  returnBoxId?: string | undefined;
  leaveAfterDelete?: boolean;
}) {
  const edit = `/life-updates/${lifeUpdateId}/edit${
    returnBoxId ? `?box=${returnBoxId}` : ''
  }`;
  return (
    <div className={styles.row}>
      {canEdit ? (
        <Link className={buttonClassName('secondary')} href={edit as Route}>
          Edit
        </Link>
      ) : null}
      <ConfirmAction
        action={
          leaveAfterDelete
            ? deleteLifeUpdateAndLeaveAction
            : deleteLifeUpdateAction
        }
        fields={{ lifeUpdateId }}
        label="Delete"
        prompt={
          onlyMe
            ? 'Delete this Life Update? It’s erased for good.'
            : 'Delete this Life Update? This removes it from every Box and deletes all comments and reactions.'
        }
        confirmLabel="Yes, delete"
        pendingLabel="Deleting…"
      />
    </div>
  );
}

import type { Box } from '@paldora/domain';
import {
  deleteBoxAction,
  setBoxStatusAction,
  updateBoxAction,
} from '../actions/social';
import { ConfirmSubmitButton } from './confirm-submit-button';
import { PendingSubmitButton } from './pending-submit-button';
import { SurfaceCard } from './ui';

export function BoxSettingsPanel({ box }: { box: Box }) {
  const archived = box.status === 'archived';
  return (
    <SurfaceCard title="Box settings">
      <form className="form-stack" action={updateBoxAction.bind(null, box.id)}>
        <label>
          Box name
          <input
            defaultValue={box.name}
            maxLength={80}
            name="name"
            required
            type="text"
          />
        </label>
        <PendingSubmitButton
          className="button-secondary full-width"
          pendingChildren="Saving…"
        >
          Save name
        </PendingSubmitButton>
      </form>
      <div className="box-status-control">
        <strong>{archived ? 'Archived' : 'Active'}</strong>
        <p>
          {archived
            ? 'Restore this Box to allow new invitations again.'
            : 'Archiving pauses invitations without removing members or history.'}
        </p>
        {archived ? (
          <form action={setBoxStatusAction.bind(null, box.id, 'active')}>
            <PendingSubmitButton
              className="button-secondary full-width"
              pendingChildren="Restoring…"
            >
              Restore Box
            </PendingSubmitButton>
          </form>
        ) : (
          <form action={setBoxStatusAction.bind(null, box.id, 'archived')}>
            <ConfirmSubmitButton
              className="button-quiet danger full-width"
              confirmation="Archive this Box? Existing members keep access, but new invitations will be paused."
            >
              Archive Box
            </ConfirmSubmitButton>
          </form>
        )}
      </div>
      <div className="box-delete-control">
        <strong>Delete permanently</strong>
        <p>
          This removes every member, invitation, and all content belonging to
          this Box. It cannot be undone.
        </p>
        <form
          className="form-stack"
          action={deleteBoxAction.bind(null, box.id, box.name)}
        >
          <label>
            Type “{box.name}” to confirm
            <input
              autoComplete="off"
              name="confirmation"
              required
              type="text"
            />
          </label>
          <ConfirmSubmitButton
            className="button-quiet danger full-width"
            confirmation={`Permanently delete “${box.name}”? Everyone will immediately lose access and this cannot be undone.`}
          >
            Delete Box permanently
          </ConfirmSubmitButton>
        </form>
      </div>
    </SurfaceCard>
  );
}

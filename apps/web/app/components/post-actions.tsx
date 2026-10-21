'use client';

import { POST_CONTENT_MAX_LENGTH } from '@paldora/domain';
import { useActionState, useState } from 'react';
import {
  deletePostAction,
  deletePostAndLeaveAction,
  updatePostAction,
} from '../actions/posts';
import { idleResult } from '../lib/action-result';
import { ActionFeedback } from './action-feedback';
import { ConfirmAction } from './confirm-action';
import styles from './post-card.module.css';
import { SubmitButton } from './submit-button';
import { Button, HiddenFields, TextAreaField } from './ui';
import { useActionSuccess } from './use-action-success';
function EditForm({
  postId,
  initial,
  hasPhotos,
  onDone,
}: {
  postId: string;
  initial: string;
  hasPhotos: boolean;
  onDone: () => void;
}) {
  const [state, action] = useActionState(updatePostAction, idleResult);
  useActionSuccess(state, () => onDone());
  return (
    <form action={action} className={styles.composer}>
      <HiddenFields values={{ postId: postId }} />
      <TextAreaField
        label="Edit your post"
        id={`edit-${postId}`}
        name="content"
        rows={4}
        defaultValue={initial}
        maxLength={POST_CONTENT_MAX_LENGTH}
        required={!hasPhotos}
      />
      <ActionFeedback state={state} />
      <div className={styles.row}>
        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** The author’s Edit and Delete for one post. */
export function PostActions({
  postId,
  content,
  hasPhotos,
  leaveAfterDelete = false,
}: {
  postId: string;
  content: string;
  hasPhotos: boolean;
  /** On a post’s own page, deleting navigates away since the page is gone. */
  leaveAfterDelete?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <EditForm
        postId={postId}
        initial={content}
        hasPhotos={hasPhotos}
        onDone={() => setEditing(false)}
      />
    );
  }
  return (
    <div className={styles.row}>
      <Button variant="secondary" onClick={() => setEditing(true)}>
        Edit
      </Button>
      <ConfirmAction
        action={leaveAfterDelete ? deletePostAndLeaveAction : deletePostAction}
        fields={{ postId }}
        label="Delete"
        prompt="Delete this post? The text is erased for everyone."
        confirmLabel="Yes, delete"
        pendingLabel="Deleting…"
      />
    </div>
  );
}

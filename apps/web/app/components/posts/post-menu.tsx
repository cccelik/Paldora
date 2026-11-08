'use client';

import {
  deletePostAction,
  deletePostAndLeaveAction,
  updatePostAction,
} from '@/actions/posts';
import { ActionFeedback } from '@/components/forms/action-feedback';
import { DeleteDialogForm } from '@/components/forms/delete-dialog-form';
import { SubmitButton } from '@/components/forms/submit-button';
import { useActionSuccess } from '@/components/forms/use-action-success';
import { ReportForm } from '@/components/moderation/report-control';
import styles from '@/components/posts/post-menu.module.css';
import {
  Button,
  Dialog,
  HiddenFields,
  OverflowMenu,
  TextAreaField,
  type OverflowMenuItem,
} from '@/components/ui';
import { idleResult } from '@/lib/actions/action-result';
import { POST_CONTENT_MAX_LENGTH } from '@paldora/domain';
import { useActionState, useState } from 'react';

type Sheet = 'edit' | 'delete' | 'report' | null;

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
    <form action={action} className={styles.form}>
      <HiddenFields values={{ postId }} />
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

/**
 * The overflow menu of one post. The author sees Edit and Delete (only while
 * the Box is active); everyone who can see the post can Report it. Each item
 * opens a dialog, so nothing shifts the feed.
 */
export function PostMenu({
  postId,
  content,
  hasPhotos,
  canManage,
  leaveAfterDelete = false,
}: {
  postId: string;
  content: string;
  hasPhotos: boolean;
  /** The author, in a Box that still accepts changes. */
  canManage: boolean;
  /** On a post’s own page, deleting navigates away since the page is gone. */
  leaveAfterDelete?: boolean;
}) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const close = () => setSheet(null);
  const items: OverflowMenuItem[] = [
    ...(canManage
      ? [
          { key: 'edit', label: 'Edit post', onSelect: () => setSheet('edit') },
          {
            key: 'delete',
            label: 'Delete post',
            destructive: true,
            onSelect: () => setSheet('delete'),
          },
        ]
      : []),
    { key: 'report', label: 'Report post', onSelect: () => setSheet('report') },
  ];
  return (
    <>
      <OverflowMenu label="Post options" items={items} />
      <Dialog open={sheet === 'edit'} onClose={close} title="Edit post">
        {sheet === 'edit' ? (
          <EditForm
            postId={postId}
            initial={content}
            hasPhotos={hasPhotos}
            onDone={close}
          />
        ) : null}
      </Dialog>
      <Dialog open={sheet === 'delete'} onClose={close} title="Delete post?">
        {sheet === 'delete' ? (
          <>
            <p>Delete this post? The text is erased for everyone.</p>
            <DeleteDialogForm
              action={
                leaveAfterDelete ? deletePostAndLeaveAction : deletePostAction
              }
              fields={{ postId }}
              confirmLabel="Yes, delete"
              onCancel={close}
            />
          </>
        ) : null}
      </Dialog>
      <Dialog open={sheet === 'report'} onClose={close} title="Report post">
        {sheet === 'report' ? (
          <>
            <ReportForm targetKind="post" targetId={postId} />
            <Button variant="secondary" onClick={close}>
              Close
            </Button>
          </>
        ) : null}
      </Dialog>
    </>
  );
}

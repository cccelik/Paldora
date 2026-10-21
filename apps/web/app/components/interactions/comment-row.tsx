'use client';

import {
  deleteCommentAction,
  setCommentReactionAction,
  updateCommentAction,
} from '@/actions/interactions';
import { LocalTime } from '@/components/common/local-time';
import { ActionFeedback } from '@/components/forms/action-feedback';
import { ConfirmAction } from '@/components/forms/confirm-action';
import { SubmitButton } from '@/components/forms/submit-button';
import styles from '@/components/interactions/comment-row.module.css';
import { ReactionBar } from '@/components/interactions/reaction-bar';
import { ReportControl } from '@/components/moderation/report-control';
import { useOptimisticReaction } from '@/components/interactions/use-optimistic-reaction';
import { Avatar, Button, HiddenFields, TextAreaField } from '@/components/ui';
import { idleResult, type ActionResult } from '@/lib/actions/action-result';
import { COMMENT_CONTENT_MAX_LENGTH } from '@paldora/domain';
import { type CommentItemView, type CommentView } from '@paldora/validation';
import { useActionState, useEffect, useRef, useState } from 'react';
export interface ReplyTarget {
  readonly id: string;
  readonly name: string;
}

const editInitial: ActionResult<CommentView | undefined> = idleResult;

function EditCommentForm({
  comment,
  onDone,
}: {
  comment: CommentView;
  onDone: (updated?: CommentView) => void;
}) {
  const [state, action] = useActionState(updateCommentAction, editInitial);
  const handled = useRef(state);
  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state.status === 'success') onDone(state.data);
  }, [state, onDone]);
  return (
    <form action={action} className={styles.composer}>
      <HiddenFields values={{ commentId: comment.id }} />
      <TextAreaField
        label="Edit your comment"
        id={`edit-comment-${comment.id}`}
        name="content"
        rows={2}
        defaultValue={comment.content}
        maxLength={COMMENT_CONTENT_MAX_LENGTH}
        required
      />
      <ActionFeedback state={state} />
      <div className={styles.row}>
        <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
        <Button variant="secondary" onClick={() => onDone()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Neutral text for hidden (block) and deleted rows: no author, no words. */
export function CommentPlaceholder({
  kind,
  id,
  focus = false,
}: {
  kind: 'hidden' | 'deleted';
  id: string;
  focus?: boolean;
}) {
  const ref = useFocusOnMount<HTMLDivElement>(focus);
  return (
    <div
      ref={ref}
      id={`comment-${id}`}
      tabIndex={-1}
      className={`${styles.comment} ${styles.placeholder}`}
    >
      <p>
        {kind === 'hidden'
          ? 'A comment here is hidden.'
          : 'This comment was deleted.'}
      </p>
    </div>
  );
}

function useFocusOnMount<Element extends HTMLElement>(focus: boolean) {
  const ref = useRef<Element>(null);
  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus]);
  return ref;
}

function CommentControls({
  comment,
  canInteract,
  onReply,
  onEdit,
  onDeleted,
}: {
  comment: CommentView;
  canInteract: boolean;
  onReply?: ((target: ReplyTarget) => void) | undefined;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  if (!canInteract) return null;
  return (
    <div className={styles.row}>
      {onReply ? (
        <Button
          variant="quiet"
          onClick={() =>
            onReply({ id: comment.id, name: comment.author.displayName })
          }
        >
          Reply
        </Button>
      ) : null}
      {comment.canEdit ? (
        <>
          <Button variant="quiet" onClick={onEdit}>
            Edit
          </Button>
          <ConfirmAction
            action={deleteCommentAction}
            fields={{ commentId: comment.id }}
            label="Delete"
            prompt="Delete this comment? The text is erased for everyone."
            confirmLabel="Yes, delete"
            pendingLabel="Deleting…"
            onSuccess={onDeleted}
          />
        </>
      ) : null}
    </div>
  );
}

function CommentBody({
  initial,
  presets,
  canInteract,
  onReply,
  focus,
}: {
  initial: CommentView;
  presets: readonly string[];
  canInteract: boolean;
  onReply?: ((target: ReplyTarget) => void) | undefined;
  focus: boolean;
}) {
  const [comment, setComment] = useState(initial);
  const [seen, setSeen] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const ref = useFocusOnMount<HTMLElement>(focus);
  const reactions = useOptimisticReaction(comment.interactions, (kind) =>
    setCommentReactionAction({ commentId: comment.id, kind }),
  );
  if (initial !== seen) {
    setSeen(initial);
    setComment(initial);
  }
  if (deleted) return <CommentPlaceholder kind="deleted" id={comment.id} />;
  const name = comment.author.displayName;
  return (
    <article
      ref={ref}
      id={`comment-${comment.id}`}
      tabIndex={-1}
      className={styles.comment}
      aria-label={`Comment by ${name}`}
    >
      <header className={styles.head}>
        <Avatar url={comment.author.avatarUrl} name={name} />
        <span className={styles.name}>{name}</span>
        <span className={styles.meta}>
          <LocalTime iso={comment.createdAt} />
          {comment.editedAt ? <span> · edited</span> : null}
        </span>
      </header>
      {editing ? (
        <EditCommentForm
          comment={comment}
          onDone={(updated) => {
            if (updated) setComment(updated);
            setEditing(false);
          }}
        />
      ) : (
        <p className={styles.body}>{comment.content}</p>
      )}
      <ReactionBar
        summary={reactions.shown}
        presets={presets}
        canInteract={canInteract}
        react={reactions.react}
        compact
        label={`Reactions to ${name}’s comment`}
      />
      {editing ? null : (
        <CommentControls
          comment={comment}
          canInteract={canInteract}
          onReply={onReply}
          onEdit={() => setEditing(true)}
          onDeleted={() => setDeleted(true)}
        />
      )}
      <ReportControl targetKind="comment" targetId={comment.id} />
    </article>
  );
}

/** One comment, reply, tombstone, or hidden placeholder. */
export function CommentEntry({
  item,
  presets,
  canInteract,
  onReply,
  focus = false,
}: {
  item: CommentItemView;
  presets: readonly string[];
  canInteract: boolean;
  onReply?: ((target: ReplyTarget) => void) | undefined;
  focus?: boolean;
}) {
  if (item.kind === 'hidden') {
    return (
      <CommentPlaceholder kind="hidden" id={item.hidden.id} focus={focus} />
    );
  }
  if (item.kind === 'deleted') {
    return (
      <CommentPlaceholder kind="deleted" id={item.deleted.id} focus={focus} />
    );
  }
  return (
    <CommentBody
      initial={item.comment}
      presets={presets}
      canInteract={canInteract}
      onReply={onReply}
      focus={focus}
    />
  );
}

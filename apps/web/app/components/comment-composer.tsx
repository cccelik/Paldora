'use client';

import { COMMENT_CONTENT_MAX_LENGTH } from '@paldora/domain';
import type { CommentView } from '@paldora/validation';
import { useActionState, useEffect, useRef, useState } from 'react';
import { createCommentAction } from '../actions/interactions';
import { idleResult, type ActionResult } from '../lib/action-result';
import { ActionFeedback } from './action-feedback';
import { SubmitButton } from './submit-button';
import { Button, TextAreaField } from './ui';
import styles from './comment-thread.module.css';

const initial: ActionResult<CommentView | undefined> = idleResult;

/**
 * Writes a comment, or a reply when `replyTo` is set (the server attaches a
 * reply to a reply to its root). Cmd/Ctrl+Enter sends; the counter is the
 * field's description.
 */
export function CommentComposer({
  postId,
  replyTo,
  onCancel,
  onPosted,
  autoFocus = false,
}: {
  postId: string;
  replyTo?: { id: string; name: string } | undefined;
  onCancel?: () => void;
  onPosted?: (comment: CommentView) => void;
  autoFocus?: boolean;
}) {
  const [state, action] = useActionState(createCommentAction, initial);
  const [text, setText] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const handled = useRef(state);

  useEffect(() => {
    if (autoFocus) field.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (state === handled.current) return;
    handled.current = state;
    if (state.status !== 'success') return;
    setText('');
    if (state.data) onPosted?.(state.data);
  }, [state, onPosted]);

  const id = replyTo ? `reply-${replyTo.id}` : `comment-${postId}-new`;
  return (
    <form ref={form} action={action} className={styles.composer}>
      <input type="hidden" name="postId" value={postId} />
      <input type="hidden" name="parentCommentId" value={replyTo?.id ?? ''} />
      {replyTo ? (
        <p className={styles.chip}>
          <span>Replying to {replyTo.name}</span>
          {onCancel ? (
            <Button variant="quiet" onClick={onCancel}>
              Cancel reply
            </Button>
          ) : null}
        </p>
      ) : null}
      <TextAreaField
        ref={field}
        label={replyTo ? 'Write a reply' : 'Add a comment'}
        id={id}
        name="content"
        rows={2}
        value={text}
        maxLength={COMMENT_CONTENT_MAX_LENGTH}
        required
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            form.current?.requestSubmit();
          }
        }}
        help={`${text.length.toLocaleString('en')} / ${COMMENT_CONTENT_MAX_LENGTH.toLocaleString('en')}`}
      />
      <ActionFeedback state={state} />
      <div className={styles.row}>
        <SubmitButton
          pendingLabel="Sending…"
          disabled={text.trim().length === 0}
        >
          {replyTo ? 'Reply' : 'Comment'}
        </SubmitButton>
      </div>
    </form>
  );
}

'use client';

import { createCommentAction } from '@/actions/interactions';
import { ActionFeedback } from '@/components/forms/action-feedback';
import { SubmitButton } from '@/components/forms/submit-button';
import { useActionSuccess } from '@/components/forms/use-action-success';
import { useSubmitShortcut } from '@/components/forms/use-submit-shortcut';
import styles from '@/components/interactions/comment-composer.module.css';
import { Button, HiddenFields, TextAreaField } from '@/components/ui';
import { idleResult, type ActionResult } from '@/lib/actions/action-result';
import { characterCount } from '@/lib/actions/character-count';
import { COMMENT_CONTENT_MAX_LENGTH } from '@paldora/domain';
import { type CommentView } from '@paldora/validation';
import { useActionState, useEffect, useRef, useState } from 'react';
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

  useEffect(() => {
    if (autoFocus) field.current?.focus();
  }, [autoFocus]);

  useActionSuccess(state, (data) => {
    setText('');
    if (data) onPosted?.(data);
  });

  const id = replyTo ? `reply-${replyTo.id}` : `comment-${postId}-new`;
  const submitShortcut = useSubmitShortcut(form);
  return (
    <form ref={form} action={action} className={styles.composer}>
      <HiddenFields values={{ postId: postId }} />
      <HiddenFields values={{ parentCommentId: replyTo?.id ?? '' }} />
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
        onKeyDown={submitShortcut}
        help={characterCount(text, COMMENT_CONTENT_MAX_LENGTH)}
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

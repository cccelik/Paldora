'use client';

import { POST_CONTENT_MAX_LENGTH } from '@paldora/domain';
import { useActionState, useEffect, useRef, useState } from 'react';
import { createPostAction } from '../actions/posts';
import { idleResult } from '../lib/action-result';
import { ActionFeedback } from './action-feedback';
import { SubmitButton } from './submit-button';
import { TextAreaField } from './ui';
import styles from './post-card.module.css';

/** Write to a Box. Cmd/Ctrl+Enter posts; the text stays if posting fails. */
export function PostComposer({ boxId }: { boxId: string }) {
  const [state, action] = useActionState(createPostAction, idleResult);
  const [text, setText] = useState('');
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === 'success') setText('');
  }, [state]);

  return (
    <form ref={form} action={action} className={styles.composer}>
      <input type="hidden" name="boxId" value={boxId} />
      <TextAreaField
        label="Share with this Box"
        id={`compose-${boxId}`}
        name="content"
        rows={3}
        value={text}
        maxLength={POST_CONTENT_MAX_LENGTH}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            form.current?.requestSubmit();
          }
        }}
        help={`${text.length.toLocaleString('en')} / ${POST_CONTENT_MAX_LENGTH.toLocaleString('en')}`}
        required
      />
      <ActionFeedback state={state} />
      <div className={styles.row}>
        <SubmitButton
          pendingLabel="Posting…"
          disabled={text.trim().length === 0}
        >
          Post
        </SubmitButton>
      </div>
    </form>
  );
}

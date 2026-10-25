'use client';

import { createPostAction } from '@/actions/posts';
import { ActionFeedback } from '@/components/forms/action-feedback';
import { SubmitButton } from '@/components/forms/submit-button';
import { useActionSuccess } from '@/components/forms/use-action-success';
import { useSubmitShortcut } from '@/components/forms/use-submit-shortcut';
import styles from '@/components/posts/post-forms.module.css';
import { HiddenFields, TextAreaField } from '@/components/ui';
import { idleResult } from '@/lib/actions/action-result';
import { characterCount } from '@/lib/actions/character-count';
import { POST_CONTENT_MAX_LENGTH } from '@paldora/domain';
import { useActionState, useRef, useState } from 'react';

export function FirebasePostComposer({ boxId }: { boxId: string }) {
  const [state, action] = useActionState(createPostAction, idleResult);
  const [text, setText] = useState('');
  const form = useRef<HTMLFormElement>(null);
  useActionSuccess(state, () => setText(''));
  const submitShortcut = useSubmitShortcut(form);
  return (
    <form ref={form} action={action} className={styles.composer}>
      <HiddenFields values={{ boxId, mediaAssetIds: '[]' }} />
      <TextAreaField
        label="Share with this Box"
        id={`compose-${boxId}`}
        name="content"
        rows={3}
        value={text}
        maxLength={POST_CONTENT_MAX_LENGTH}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={submitShortcut}
        help={characterCount(text, POST_CONTENT_MAX_LENGTH)}
      />
      <ActionFeedback state={state} />
      <div className={styles.row}>
        <SubmitButton pendingLabel="Posting…" disabled={!text.trim()}>
          Post
        </SubmitButton>
      </div>
    </form>
  );
}

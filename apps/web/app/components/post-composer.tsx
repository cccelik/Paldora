'use client';

import { POST_CONTENT_MAX_LENGTH, POST_MEDIA_MAX_ITEMS } from '@paldora/domain';
import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { preparePostPhoto } from '../actions/post-photos';
import { createPostAction } from '../actions/posts';
import { idleResult } from '../lib/action-result';
import { PHOTO_ACCEPT } from '../lib/image-upload';
import { ActionFeedback } from './action-feedback';
import { SubmitButton } from './submit-button';
import { Button, TextAreaField } from './ui';
import { PhotoAttachmentList } from './photo-attachment-list';
import {
  usePhotoAttachments,
  type PreparePhoto,
} from './use-photo-attachments';
import styles from './post-card.module.css';

/**
 * Write to a Box, with up to four photos. Cmd/Ctrl+Enter posts. Posting waits
 * until every chosen photo has finished processing; the text and photos stay
 * if posting fails.
 */
export function PostComposer({ boxId }: { boxId: string }) {
  const [state, action] = useActionState(createPostAction, idleResult);
  const [text, setText] = useState('');
  const prepare = useCallback<PreparePhoto>(
    (file) => preparePostPhoto({ boxId, ...file }),
    [boxId],
  );
  const photos = usePhotoAttachments(prepare);
  const form = useRef<HTMLFormElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const { clear } = photos;

  useEffect(() => {
    if (state.status !== 'success') return;
    setText('');
    clear();
  }, [state, clear]);

  const empty = text.trim().length === 0 && photos.readyIds.length === 0;
  return (
    <form ref={form} action={action} className={styles.composer}>
      <input type="hidden" name="boxId" value={boxId} />
      <input
        type="hidden"
        name="mediaAssetIds"
        value={JSON.stringify(photos.readyIds)}
      />
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
      />
      <PhotoAttachmentList
        items={photos.items}
        onRemove={photos.remove}
        label="Photos to post"
      />
      <input
        ref={picker}
        className="visually-hidden"
        type="file"
        multiple
        accept={PHOTO_ACCEPT}
        aria-label="Choose photos"
        tabIndex={-1}
        onChange={(event) => {
          photos.add([...(event.target.files ?? [])]);
          event.target.value = '';
        }}
      />
      <ActionFeedback state={state} />
      <div className={styles.row}>
        <Button
          variant="secondary"
          disabled={photos.full}
          onClick={() => picker.current?.click()}
        >
          {photos.items.length === 0
            ? 'Add photos'
            : `Add more (${photos.items.length}/${POST_MEDIA_MAX_ITEMS})`}
        </Button>
        <SubmitButton pendingLabel="Posting…" disabled={empty || photos.busy}>
          {photos.busy ? 'Preparing photos…' : 'Post'}
        </SubmitButton>
      </div>
    </form>
  );
}

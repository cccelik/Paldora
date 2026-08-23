'use client';

import type { BoxId } from '@paldora/domain';
import { useId, useState } from 'react';
import { createPostAction } from '../actions/posts';
import { PendingSubmitButton } from './pending-submit-button';

export function PostComposer({ boxId }: { boxId: BoxId }) {
  const [expanded, setExpanded] = useState(false);
  const [content, setContent] = useState('');
  const contentId = useId();

  return (
    <section
      className={`post-composer${expanded ? ' expanded' : ''}`}
      aria-label="Create a post"
    >
      <form className="form-stack" action={createPostAction.bind(null, boxId)}>
        <label className="visually-hidden" htmlFor={contentId}>
          Post
        </label>
        <textarea
          aria-expanded={expanded}
          id={contentId}
          maxLength={5_000}
          name="content"
          placeholder="Share a thought with this Box…"
          required
          rows={expanded ? 4 : 1}
          value={content}
          onChange={(event) => {
            setContent(event.target.value);
            setExpanded(true);
          }}
          onFocus={() => setExpanded(true)}
        />
        {expanded && (
          <div className="post-composer-actions">
            <small>Text only · 5,000 characters maximum</small>
            <div>
              {!content && (
                <button
                  className="button-quiet compact-button"
                  type="button"
                  onClick={() => setExpanded(false)}
                >
                  Cancel
                </button>
              )}
              <PendingSubmitButton
                className="button-primary post-submit"
                disabled={!content.trim()}
                pendingChildren="Sharing…"
              >
                Share post
              </PendingSubmitButton>
            </div>
          </div>
        )}
      </form>
    </section>
  );
}

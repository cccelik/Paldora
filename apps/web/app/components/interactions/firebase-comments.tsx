'use client';

import {
  createFirebaseCommentAction,
  deleteFirebaseCommentAction,
  editFirebaseCommentAction,
  moreFirebaseRepliesAction,
} from '@/actions/firebase-comments';
import { setFirebaseCommentReactionAction } from '@/actions/firebase-reactions';
import { ReactionBar } from '@/components/interactions/reaction-bar';
import { LocalTime } from '@/components/common/local-time';
import { MoreLink } from '@/components/common/more-link';
import { ActionFeedback } from '@/components/forms/action-feedback';
import { SubmitButton } from '@/components/forms/submit-button';
import { useActionSuccess } from '@/components/forms/use-action-success';
import { ConfirmAction } from '@/components/forms/confirm-action';
import { ReportControl } from '@/components/moderation/report-control';
import styles from '@/components/interactions/comment-thread.module.css';
import cardStyles from '@/components/posts/post-card.module.css';
import { Button, HiddenFields, TextAreaField } from '@/components/ui';
import { idleResult } from '@/lib/actions/action-result';
import type {
  FirebaseCommentItem,
  FirebaseCommentThread,
  FirebaseThreadItem,
} from '@/lib/server/firebase/data';
import { COMMENT_CONTENT_MAX_LENGTH } from '@paldora/domain';
import { useActionState, useState } from 'react';

function CommentForm({
  boxId,
  postId,
  parentId = '',
}: {
  boxId: string;
  postId: string;
  parentId?: string;
}) {
  const [state, action] = useActionState(
    createFirebaseCommentAction,
    idleResult,
  );
  const [text, setText] = useState('');
  useActionSuccess(state, () => setText(''));
  return (
    <form action={action} className={styles.section}>
      <HiddenFields values={{ boxId, postId, parentId }} />
      <TextAreaField
        label={parentId ? 'Write a reply' : 'Add a comment'}
        id={`firebase-comment-${parentId || postId}`}
        name="content"
        rows={2}
        value={text}
        maxLength={COMMENT_CONTENT_MAX_LENGTH}
        onChange={(event) => setText(event.target.value)}
        required
      />
      <ActionFeedback state={state} />
      <SubmitButton pendingLabel="Sending…" disabled={!text.trim()}>
        {parentId ? 'Reply' : 'Comment'}
      </SubmitButton>
    </form>
  );
}

function CommentRow({
  boxId,
  postId,
  comment,
  active,
  presets,
}: {
  boxId: string;
  postId: string;
  comment: FirebaseCommentItem;
  active: boolean;
  presets: readonly string[];
}) {
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState(comment.interactions);
  const [reactionError, setReactionError] = useState<string | null>(null);
  const [editState, editAction] = useActionState(
    editFirebaseCommentAction,
    idleResult,
  );
  useActionSuccess(editState, () => setEditing(false));
  return (
    <li id={`comment-${comment.id}`} className={cardStyles.card}>
      <div className={cardStyles.head}>
        <span className={cardStyles.name}>{comment.authorName}</span>
        {comment.parentId ? <span>Reply</span> : null}
        <span className={cardStyles.meta}>
          <LocalTime iso={comment.createdAt} />
        </span>
        {comment.edited ? <span>edited</span> : null}
      </div>
      {editing ? (
        <form action={editAction} className={styles.section}>
          <HiddenFields values={{ boxId, postId, commentId: comment.id }} />
          <TextAreaField
            label="Edit comment"
            id={`edit-comment-${comment.id}`}
            name="content"
            rows={2}
            defaultValue={comment.content}
            maxLength={COMMENT_CONTENT_MAX_LENGTH}
            required
          />
          <ActionFeedback state={editState} />
          <SubmitButton pendingLabel="Saving…">Save comment</SubmitButton>
          <Button variant="secondary" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <p className={cardStyles.body}>{comment.content}</p>
      )}
      <ReactionBar
        summary={summary}
        presets={presets}
        canInteract={active}
        compact
        label={`Reactions to ${comment.authorName}'s comment`}
        react={async (kind) => {
          const result = await setFirebaseCommentReactionAction({
            boxId,
            postId,
            commentId: comment.id,
            kind,
          });
          if (result.status === 'success') {
            setSummary(result.data);
            setReactionError(null);
          } else setReactionError(result.message);
        }}
      />
      {reactionError ? <p role="alert">{reactionError}</p> : null}
      {active ? (
        <CommentForm boxId={boxId} postId={postId} parentId={comment.id} />
      ) : null}
      {comment.canEdit ? (
        <>
          {active && !editing ? (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit comment
            </Button>
          ) : null}
          <ConfirmAction
            action={deleteFirebaseCommentAction}
            fields={{ boxId, postId, commentId: comment.id }}
            label="Delete comment"
            prompt="Delete this comment?"
            confirmLabel="Yes, delete comment"
            pendingLabel="Deleting…"
          />
        </>
      ) : null}
      <ReportControl targetKind="comment" targetId={comment.id} />
    </li>
  );
}

function itemId(item: FirebaseThreadItem): string {
  return item.kind === 'comment' ? item.comment.id : item.id;
}

function ThreadItem({
  item,
  boxId,
  postId,
  active,
  presets,
}: {
  item: FirebaseThreadItem;
  boxId: string;
  postId: string;
  active: boolean;
  presets: readonly string[];
}) {
  if (item.kind === 'comment')
    return (
      <CommentRow
        boxId={boxId}
        postId={postId}
        comment={item.comment}
        active={active}
        presets={presets}
      />
    );
  return (
    <li id={`comment-${item.id}`} className={cardStyles.card}>
      {item.kind === 'hidden'
        ? 'A comment here is hidden.'
        : 'This comment was deleted.'}
    </li>
  );
}

function FirebaseThread({
  thread,
  boxId,
  postId,
  active,
  presets,
}: {
  thread: FirebaseCommentThread;
  boxId: string;
  postId: string;
  active: boolean;
  presets: readonly string[];
}) {
  const [loaded, setLoaded] = useState<FirebaseThreadItem[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [problem, setProblem] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const seen = new Set<string>();
  const replies = [...thread.replies, ...loaded].filter((item) => {
    const id = itemId(item);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const remaining =
    cursor === null ? 0 : Math.max(0, thread.replyCount - replies.length);
  const loadMore = async () => {
    setLoading(true);
    const result = await moreFirebaseRepliesAction({
      boxId,
      postId,
      rootId: thread.rootId,
      ...(cursor ? { cursor } : {}),
    });
    setLoading(false);
    if (result.status === 'success') {
      setLoaded((current) => [...current, ...result.data.items]);
      setCursor(result.data.nextCursor);
      setProblem(null);
    } else setProblem(result.message);
  };
  return (
    <div>
      <ol className={styles.threads} aria-label="Thread root">
        <ThreadItem
          item={thread.root}
          boxId={boxId}
          postId={postId}
          active={active}
          presets={presets}
        />
      </ol>
      {replies.length ? (
        <ol className={styles.threads} aria-label="Replies">
          {replies.map((item) => (
            <ThreadItem
              key={itemId(item)}
              item={item}
              boxId={boxId}
              postId={postId}
              active={active}
              presets={presets}
            />
          ))}
        </ol>
      ) : null}
      {remaining ? (
        <Button variant="quiet" disabled={loading} onClick={loadMore}>
          {loading
            ? 'Loading…'
            : `View ${remaining} more ${remaining === 1 ? 'reply' : 'replies'}`}
        </Button>
      ) : null}
      {problem ? <p role="alert">{problem}</p> : null}
    </div>
  );
}

export function FirebaseCommentThreads({
  boxId,
  postId,
  threads,
  nextCursor,
  pinned,
  pinnedMissing,
  active,
  presets,
  count,
  olderHref,
}: {
  boxId: string;
  postId: string;
  threads: readonly FirebaseCommentThread[];
  nextCursor: string | null;
  pinned?: FirebaseCommentThread | null;
  pinnedMissing?: boolean;
  active: boolean;
  presets: readonly string[];
  count: number;
  olderHref?: string | undefined;
}) {
  const rest = threads.filter((thread) => thread.rootId !== pinned?.rootId);
  return (
    <section
      id="comments"
      className={styles.section}
      aria-labelledby="comments-title"
    >
      <h2 id="comments-title" className={styles.title}>
        {count === 1 ? '1 comment' : `${count} comments`}
      </h2>
      {active ? (
        <CommentForm boxId={boxId} postId={postId} />
      ) : (
        <p className={styles.note}>
          This Box is archived. Comments are read-only.
        </p>
      )}
      {pinnedMissing ? (
        <p className={styles.note}>That comment is no longer available.</p>
      ) : null}
      {pinned ? (
        <div aria-label="Linked comment" role="group">
          <FirebaseThread
            thread={pinned}
            boxId={boxId}
            postId={postId}
            active={active}
            presets={presets}
          />
        </div>
      ) : null}
      {rest.length ? (
        <ol className={styles.threads} aria-label="Comments">
          {rest.map((thread) => (
            <li key={thread.rootId}>
              <FirebaseThread
                thread={thread}
                boxId={boxId}
                postId={postId}
                active={active}
                presets={presets}
              />
            </li>
          ))}
        </ol>
      ) : !pinned ? (
        <p>No comments yet.</p>
      ) : null}
      {nextCursor ? (
        <MoreLink
          href={
            olderHref ??
            `/posts/${postId}?comments=${encodeURIComponent(nextCursor)}#comments`
          }
          label="Show older comments"
        />
      ) : null}
    </section>
  );
}

export function FirebaseComments({
  boxId,
  postId,
  items,
  nextCursor,
  active,
  olderHref,
  presets,
}: {
  boxId: string;
  postId: string;
  items: readonly FirebaseCommentItem[];
  nextCursor: string | null;
  active: boolean;
  olderHref?: string | undefined;
  presets: readonly string[];
}) {
  return (
    <section
      id="comments"
      className={styles.section}
      aria-labelledby="comments-title"
    >
      <h2 id="comments-title" className={styles.title}>
        Comments
      </h2>
      {active ? (
        <CommentForm boxId={boxId} postId={postId} />
      ) : (
        <p className={styles.note}>
          This Box is archived. Comments are read-only.
        </p>
      )}
      {items.length ? (
        <ol className={styles.threads} aria-label="Comments">
          {items.map((comment) => (
            <CommentRow
              key={comment.id}
              boxId={boxId}
              postId={postId}
              comment={comment}
              active={active}
              presets={presets}
            />
          ))}
        </ol>
      ) : (
        <p>No comments yet.</p>
      )}
      {nextCursor ? (
        <MoreLink
          href={
            olderHref ??
            `/posts/${postId}?comments=${encodeURIComponent(nextCursor)}#comments`
          }
          label="Show older comments"
        />
      ) : null}
    </section>
  );
}

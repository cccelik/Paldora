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
import { DeleteDialogForm } from '@/components/forms/delete-dialog-form';
import { useToast } from '@/components/common/toast';
import { ReportForm } from '@/components/moderation/report-control';
import styles from '@/components/interactions/comment-thread.module.css';
import {
  Button,
  Comment,
  Dialog,
  HiddenFields,
  OverflowMenu,
  TextAreaField,
  type OverflowMenuItem,
} from '@/components/ui';
import { idleResult } from '@/lib/actions/action-result';
import type {
  FirebaseCommentItem,
  FirebaseCommentThread,
  FirebaseThreadItem,
} from '@/lib/server/firebase/data';
import { COMMENT_CONTENT_MAX_LENGTH } from '@paldora/domain';
import { useActionState, useEffect, useRef, useState } from 'react';

function CommentForm({
  boxId,
  postId,
  parentId = '',
  onPosted,
  onCancel,
}: {
  boxId: string;
  postId: string;
  parentId?: string;
  /** A reply composer collapses after a successful post. */
  onPosted?: () => void;
  /** Present for a reply composer: Cancel and Escape collapse it. */
  onCancel?: () => void;
}) {
  const [state, action] = useActionState(
    createFirebaseCommentAction,
    idleResult,
  );
  const [text, setText] = useState('');
  const field = useRef<HTMLTextAreaElement>(null);
  const showToast = useToast();
  useEffect(() => {
    if (onCancel) field.current?.focus();
  }, [onCancel]);
  useActionSuccess(state, () => {
    setText('');
    if (state.status === 'success')
      showToast({ message: state.message, tone: 'success' });
    onPosted?.();
  });
  return (
    <form action={action} className={styles.section}>
      <HiddenFields values={{ boxId, postId, parentId }} />
      <TextAreaField
        ref={field}
        label={parentId ? 'Write a reply' : 'Add a comment'}
        id={`firebase-comment-${parentId || postId}`}
        name="content"
        rows={2}
        value={text}
        maxLength={COMMENT_CONTENT_MAX_LENGTH}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && onCancel) {
            event.preventDefault();
            onCancel();
          }
        }}
        required
      />
      {state.status === 'error' ? <ActionFeedback state={state} /> : null}
      <div className={styles.formRow}>
        <SubmitButton pendingLabel="Sending…" disabled={!text.trim()}>
          {parentId ? 'Reply' : 'Comment'}
        </SubmitButton>
        {onCancel ? (
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function CommentEditForm({
  boxId,
  postId,
  comment,
  onDone,
}: {
  boxId: string;
  postId: string;
  comment: FirebaseCommentItem;
  onDone: () => void;
}) {
  const [state, action] = useActionState(editFirebaseCommentAction, idleResult);
  useActionSuccess(state, () => onDone());
  return (
    <form action={action} className={styles.formStack}>
      <HiddenFields values={{ boxId, postId, commentId: comment.id }} />
      <TextAreaField
        label="Edit your comment"
        id={`edit-comment-${comment.id}`}
        name="content"
        rows={3}
        defaultValue={comment.content}
        maxLength={COMMENT_CONTENT_MAX_LENGTH}
        required
      />
      <ActionFeedback state={state} />
      <div className={styles.formRow}>
        <SubmitButton pendingLabel="Saving…">Save comment</SubmitButton>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

type Sheet = 'edit' | 'delete' | 'report' | null;

/**
 * The overflow menu of one comment, like `PostMenu`: the author edits and
 * deletes (edit only while the Box is active), everyone else reports.
 */
function CommentMenu({
  boxId,
  postId,
  comment,
  active,
}: {
  boxId: string;
  postId: string;
  comment: FirebaseCommentItem;
  active: boolean;
}) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const close = () => setSheet(null);
  const items: OverflowMenuItem[] = comment.canEdit
    ? [
        ...(active
          ? [
              {
                key: 'edit',
                label: 'Edit comment',
                onSelect: () => setSheet('edit'),
              },
            ]
          : []),
        {
          key: 'delete',
          label: 'Delete comment',
          destructive: true,
          onSelect: () => setSheet('delete'),
        },
      ]
    : [
        {
          key: 'report',
          label: 'Report comment',
          onSelect: () => setSheet('report'),
        },
      ];
  return (
    <>
      <OverflowMenu label="Comment options" items={items} />
      <Dialog open={sheet === 'edit'} onClose={close} title="Edit comment">
        {sheet === 'edit' ? (
          <CommentEditForm
            boxId={boxId}
            postId={postId}
            comment={comment}
            onDone={close}
          />
        ) : null}
      </Dialog>
      <Dialog open={sheet === 'delete'} onClose={close} title="Delete comment?">
        {sheet === 'delete' ? (
          <>
            <p>Delete this comment?</p>
            <DeleteDialogForm
              action={deleteFirebaseCommentAction}
              fields={{ boxId, postId, commentId: comment.id }}
              confirmLabel="Yes, delete comment"
              onCancel={close}
            />
          </>
        ) : null}
      </Dialog>
      <Dialog open={sheet === 'report'} onClose={close} title="Report comment">
        {sheet === 'report' ? (
          <>
            <ReportForm targetKind="comment" targetId={comment.id} />
            <Button variant="secondary" onClick={close}>
              Close
            </Button>
          </>
        ) : null}
      </Dialog>
    </>
  );
}

function CommentRow({
  boxId,
  postId,
  comment,
  active,
  presets,
  reply = false,
}: {
  boxId: string;
  postId: string;
  comment: FirebaseCommentItem;
  active: boolean;
  presets: readonly string[];
  reply?: boolean;
}) {
  const [replying, setReplying] = useState(false);
  const replyButton = useRef<HTMLButtonElement>(null);
  const [summary, setSummary] = useState(comment.interactions);
  const [reactionError, setReactionError] = useState<string | null>(null);
  const collapse = () => {
    setReplying(false);
    replyButton.current?.focus();
  };
  const replyId = `reply-composer-${comment.id}`;
  return (
    <li id={`comment-${comment.id}`} className={styles.item}>
      <Comment
        author={{
          name: comment.authorName,
          avatarUrl: comment.authorAvatarUrl,
        }}
        reply={reply || !!comment.parentId}
        when={
          <>
            <LocalTime iso={comment.createdAt} />
            {comment.edited ? <> · edited</> : null}
          </>
        }
        actions={
          <div className={styles.controls}>
            <div className={styles.controlRow}>
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
              {active ? (
                <Button
                  ref={replyButton}
                  variant="quiet"
                  aria-expanded={replying}
                  aria-controls={replying ? replyId : undefined}
                  onClick={() => setReplying((value) => !value)}
                >
                  Reply
                </Button>
              ) : null}
              <span className={styles.menuSlot}>
                <CommentMenu
                  boxId={boxId}
                  postId={postId}
                  comment={comment}
                  active={active}
                />
              </span>
            </div>
            {reactionError ? <p role="alert">{reactionError}</p> : null}
            {active && replying ? (
              <div id={replyId} className={styles.replyBox}>
                <CommentForm
                  boxId={boxId}
                  postId={postId}
                  parentId={comment.id}
                  onPosted={collapse}
                  onCancel={collapse}
                />
              </div>
            ) : null}
          </div>
        }
      >
        {comment.content}
      </Comment>
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
  reply = false,
}: {
  item: FirebaseThreadItem;
  boxId: string;
  postId: string;
  active: boolean;
  presets: readonly string[];
  reply?: boolean;
}) {
  if (item.kind === 'comment')
    return (
      <CommentRow
        boxId={boxId}
        postId={postId}
        comment={item.comment}
        active={active}
        presets={presets}
        reply={reply}
      />
    );
  return (
    <li id={`comment-${item.id}`} className={styles.item}>
      <Comment
        author={{ name: null }}
        reply={reply}
        deleted
        when=""
        placeholder={
          item.kind === 'hidden'
            ? 'A comment here is hidden.'
            : 'This comment was deleted.'
        }
      />
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
    <div className={styles.thread}>
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
              reply
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

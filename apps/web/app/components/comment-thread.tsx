'use client';

import type {
  Comment,
  CommentId,
  ReactionKind,
  ReactionPresets,
  UserId,
} from '@paldora/domain';
import { useState, type FormEvent } from 'react';
import { CommentReactionBar } from './comment-reaction-bar';
import { OverflowMenu } from './overflow-menu';
import { InitialAvatar } from './ui';

export function CommentThread({
  comments,
  currentUserId,
  busyCommentId,
  busyReactionCommentId,
  onCreate,
  onUpdate,
  onDelete,
  onReaction,
  presets,
}: {
  comments: readonly Comment[];
  currentUserId: UserId;
  busyCommentId: CommentId | null;
  busyReactionCommentId: CommentId | null;
  onCreate: (content: string, parentCommentId?: CommentId) => Promise<boolean>;
  onUpdate: (commentId: CommentId, content: string) => Promise<boolean>;
  onDelete: (commentId: CommentId) => Promise<void>;
  onReaction: (
    commentId: CommentId,
    kind: ReactionKind | null,
  ) => Promise<void>;
  presets: ReactionPresets;
}) {
  if (comments.length === 0) {
    return (
      <p className="comment-empty">No comments yet. Start the conversation.</p>
    );
  }
  return (
    <div className="comment-thread" aria-label="Comments">
      {comments.map((comment) => (
        <CommentItem
          busyCommentId={busyCommentId}
          busyReactionCommentId={busyReactionCommentId}
          comment={comment}
          currentUserId={currentUserId}
          key={comment.id}
          onCreate={onCreate}
          onDelete={onDelete}
          onReaction={onReaction}
          onUpdate={onUpdate}
          presets={presets}
        />
      ))}
    </div>
  );
}

function CommentItem({
  comment,
  currentUserId,
  busyCommentId,
  busyReactionCommentId,
  onCreate,
  onUpdate,
  onDelete,
  onReaction,
  presets,
}: {
  comment: Comment;
  currentUserId: UserId;
  busyCommentId: CommentId | null;
  busyReactionCommentId: CommentId | null;
  onCreate: (content: string, parentCommentId?: CommentId) => Promise<boolean>;
  onUpdate: (commentId: CommentId, content: string) => Promise<boolean>;
  onDelete: (commentId: CommentId) => Promise<void>;
  onReaction: (
    commentId: CommentId,
    kind: ReactionKind | null,
  ) => Promise<void>;
  presets: ReactionPresets;
}) {
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const owned = comment.author.userId === currentUserId;
  return (
    <div className={`comment-item${comment.parentCommentId ? ' reply' : ''}`}>
      <InitialAvatar
        className="comment-avatar"
        imageUrl={comment.author.avatarUrl}
        length={2}
        name={comment.author.displayName}
      />
      <div className="comment-body">
        <div className="comment-bubble">
          <div className="comment-meta">
            <strong>{comment.author.displayName}</strong>
            <span>@{comment.author.username}</span>
            <time dateTime={comment.createdAt}>
              {formatInteractionDate(comment.createdAt)}
            </time>
          </div>
          {comment.deleted ? (
            <p className="comment-deleted">Comment deleted.</p>
          ) : editing ? (
            <CommentForm
              defaultValue={comment.content}
              label="Edit comment"
              pending={busyCommentId === comment.id}
              submitLabel="Save"
              onCancel={() => setEditing(false)}
              onSubmit={async (content) => {
                const saved = await onUpdate(comment.id, content);
                if (saved) setEditing(false);
                return saved;
              }}
            />
          ) : (
            <p>{comment.content}</p>
          )}
          {owned && !comment.deleted && !editing && (
            <OverflowMenu
              className="comment-menu"
              label={`Manage comment by ${comment.author.displayName}`}
            >
              <button onClick={() => setEditing(true)} type="button">
                Edit comment
              </button>
              <button
                className="danger"
                disabled={busyCommentId === comment.id}
                onClick={() => void onDelete(comment.id)}
                type="button"
              >
                Delete comment
              </button>
            </OverflowMenu>
          )}
        </div>
        {!comment.parentCommentId && !comment.deleted && (
          <button
            className="comment-reply-button"
            onClick={() => setReplying((current) => !current)}
            type="button"
          >
            Reply
          </button>
        )}
        {!comment.deleted && (
          <CommentReactionBar
            commentAuthor={comment.author.displayName}
            interactions={comment.interactions}
            onReaction={(kind) => void onReaction(comment.id, kind)}
            pending={busyReactionCommentId === comment.id}
            presets={presets}
          />
        )}
        {replying && (
          <CommentForm
            label={`Reply to ${comment.author.displayName}`}
            pending={busyCommentId === comment.id}
            submitLabel="Reply"
            onCancel={() => setReplying(false)}
            onSubmit={async (content) => {
              const saved = await onCreate(content, comment.id);
              if (saved) setReplying(false);
              return saved;
            }}
          />
        )}
        {comment.replies.length > 0 && (
          <div className="comment-replies">
            {comment.replies.map((reply) => (
              <CommentItem
                busyCommentId={busyCommentId}
                busyReactionCommentId={busyReactionCommentId}
                comment={reply}
                currentUserId={currentUserId}
                key={reply.id}
                onCreate={onCreate}
                onDelete={onDelete}
                onReaction={onReaction}
                onUpdate={onUpdate}
                presets={presets}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function CommentForm({
  label,
  submitLabel,
  pending,
  defaultValue = '',
  onSubmit,
  onCancel,
}: {
  label: string;
  submitLabel: string;
  pending: boolean;
  defaultValue?: string;
  onSubmit: (content: string) => Promise<boolean>;
  onCancel?: (() => void) | undefined;
}) {
  const [value, setValue] = useState(defaultValue);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = value.trim();
    if (!content || pending) return;
    void onSubmit(content).then((saved) => {
      if (saved) setValue('');
    });
  };
  return (
    <form className="comment-form" onSubmit={submit}>
      <label>
        <span className="sr-only">{label}</span>
        <textarea
          aria-label={label}
          maxLength={2_000}
          onChange={(event) => setValue(event.target.value)}
          placeholder={label}
          required
          rows={2}
          value={value}
        />
      </label>
      <div>
        {onCancel && (
          <button
            className="button-quiet compact-button"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        )}
        <button
          className="button-secondary compact-button"
          disabled={pending || !value.trim()}
          type="submit"
        >
          {pending ? 'Sending…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

function formatInteractionDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

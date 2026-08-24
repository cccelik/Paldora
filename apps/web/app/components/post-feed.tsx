'use client';

import type { Post, ReactionPresets, UserId } from '@paldora/domain';
import type { Route } from 'next';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { deletePostAction, updatePostAction } from '../actions/posts';
import { ConfirmSubmitButton } from './confirm-submit-button';
import { InitialAvatar } from './ui';
import { OverflowMenu } from './overflow-menu';
import { PendingSubmitButton } from './pending-submit-button';
import { PostMediaGallery } from './post-media-gallery';
import { PostInteractions } from './post-interactions';

export function PostFeed({
  posts,
  currentUserId,
  returnPath,
  nextCursor,
  emptyTitle = 'No posts yet.',
  emptyDescription = 'Share the first story when the moment feels right.',
  reactionPresets,
}: {
  posts: readonly Post[];
  currentUserId: UserId;
  returnPath: string;
  nextCursor: string | null;
  emptyTitle?: string;
  emptyDescription?: string;
  reactionPresets: ReactionPresets;
}) {
  if (posts.length === 0) {
    return (
      <section className="post-feed-empty">
        <div aria-hidden="true">✦</div>
        <h2>{emptyTitle}</h2>
        <p>{emptyDescription}</p>
      </section>
    );
  }
  return (
    <section className="post-feed" aria-label="Posts">
      {posts.map((post) => (
        <PostCard
          currentUserId={currentUserId}
          key={post.id}
          post={post}
          returnPath={returnPath}
          reactionPresets={reactionPresets}
        />
      ))}
      {nextCursor && (
        <Link
          className="button-secondary post-load-more"
          href={
            `${returnPath}?cursor=${encodeURIComponent(nextCursor)}` as Route
          }
        >
          Load older posts
        </Link>
      )}
    </section>
  );
}

export function PostCard({
  post,
  currentUserId,
  returnPath,
  reactionPresets,
}: {
  post: Post;
  currentUserId: UserId;
  returnPath: string;
  reactionPresets: ReactionPresets;
}) {
  const owned = post.author.userId === currentUserId;
  const [editing, setEditing] = useState(false);
  const [quickLikeRequest, setQuickLikeRequest] = useState(0);
  const lastTouchAt = useRef(0);
  const lastTriggerAt = useRef(0);
  const triggerQuickLike = () => {
    const now = Date.now();
    if (now - lastTriggerAt.current < 350) return;
    lastTriggerAt.current = now;
    setQuickLikeRequest((value) => value + 1);
  };
  return (
    <article
      className="post-card"
      id={`post-${post.id}`}
      onDoubleClick={(event) => {
        if (!isInteractiveTarget(event.target)) triggerQuickLike();
      }}
      onPointerUp={(event) => {
        if (
          event.pointerType !== 'touch' ||
          isInteractiveTarget(event.target)
        ) {
          return;
        }
        const now = Date.now();
        if (now - lastTouchAt.current <= 320) triggerQuickLike();
        lastTouchAt.current = now;
      }}
    >
      <header className={`post-card-header${owned ? ' has-actions' : ''}`}>
        <InitialAvatar
          className="post-avatar"
          imageUrl={post.author.avatarUrl}
          name={post.author.displayName}
          length={2}
        />
        <div>
          <Link className="post-box-link" href={`/boxes/${post.boxId}`}>
            {post.boxName}
          </Link>
          <strong>{post.author.displayName}</strong>
          <span>
            @{post.author.username} ·{' '}
            <time dateTime={post.createdAt}>
              {formatPostDate(post.createdAt)}
            </time>
            {post.editedAt ? ' · edited' : ''}
          </span>
        </div>
      </header>
      {owned && (
        <OverflowMenu
          className="post-actions-menu"
          label={`Manage post by ${post.author.displayName}`}
        >
          <button type="button" onClick={() => setEditing(true)}>
            Edit post
          </button>
          <form action={deletePostAction.bind(null, post.id, returnPath)}>
            <ConfirmSubmitButton
              className="danger"
              confirmation="Delete this post? It will disappear from every member's feed and cannot be restored."
            >
              Delete post
            </ConfirmSubmitButton>
          </form>
        </OverflowMenu>
      )}
      {post.content && <p className="post-content">{post.content}</p>}
      {post.media.length > 0 && (
        <PostMediaGallery
          authorName={post.author.displayName}
          media={post.media}
          postId={post.id}
        />
      )}
      {editing && (
        <form
          className="form-stack post-edit-form"
          action={updatePostAction.bind(null, post.id, returnPath)}
        >
          <label>
            Edit post
            <textarea
              defaultValue={post.content}
              maxLength={5_000}
              name="content"
              required
              rows={4}
            />
          </label>
          <div className="post-edit-actions">
            <button
              className="button-quiet compact-button"
              type="button"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
            <PendingSubmitButton
              className="button-secondary"
              pendingChildren="Saving…"
            >
              Save changes
            </PendingSubmitButton>
          </div>
        </form>
      )}
      <PostInteractions
        currentUserId={currentUserId}
        initial={post.interactions}
        postId={post.id}
        presets={reactionPresets}
        quickLikeRequest={quickLikeRequest}
      />
    </article>
  );
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        'a, button, input, textarea, select, label, form, [role="button"], [contenteditable="true"]',
      ),
    )
  );
}

function formatPostDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value));
}

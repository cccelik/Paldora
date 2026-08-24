'use client';

import type { LifeUpdate, ReactionPresets, UserId } from '@paldora/domain';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { deleteLifeUpdateAction } from '../actions/life-updates';
import { roomPath } from '../lib/room-paths';
import { ConfirmSubmitButton } from './confirm-submit-button';
import { OverflowMenu } from './overflow-menu';
import { PostInteractions } from './post-interactions';
import { PostMediaGallery } from './post-media-gallery';
import { InitialAvatar } from './ui';

const sectionLabels: Record<string, string> = {
  lifeLately: 'Life lately',
  workOrUniversity: 'Work / University',
  travel: 'Travel',
  currentlyInto: 'Currently into',
  listeningTo: 'Listening to',
  watching: 'Watching',
  reading: 'Reading',
  excitedAbout: "Something I'm excited about",
  whatsNext: "What's next",
};

export function LifeUpdateCard({
  update,
  currentUserId,
  reactionPresets,
  initialPostId,
  returnPath = '/life-updates',
}: {
  update: LifeUpdate;
  currentUserId: UserId;
  reactionPresets: ReactionPresets;
  initialPostId?: string | undefined;
  returnPath?: string | undefined;
}) {
  const [selectedPostId, setSelectedPostId] = useState(
    update.contexts.some(({ postId }) => postId === initialPostId)
      ? initialPostId
      : update.contexts[0]?.postId,
  );
  useEffect(() => {
    if (initialPostId) return;
    const stored = sessionStorage.getItem(`life-update-context:${update.id}`);
    if (update.contexts.some(({ postId }) => postId === stored)) {
      setSelectedPostId(stored as LifeUpdate['contexts'][number]['postId']);
    }
  }, [initialPostId, update.contexts, update.id]);
  const context = useMemo(
    () =>
      update.contexts.find(({ postId }) => postId === selectedPostId) ??
      update.contexts[0],
    [selectedPostId, update.contexts],
  );
  if (!context) return null;
  const owned = update.author.userId === currentUserId;
  return (
    <article className="life-update-card">
      <header>
        <Link href={roomPath(update.author.username)}>
          <InitialAvatar
            className="post-avatar"
            imageUrl={update.author.avatarUrl}
            name={update.author.displayName}
            length={2}
          />
        </Link>
        <div>
          <span className="life-update-kicker">Life Update</span>
          <Link
            className="life-update-author-link"
            href={roomPath(update.author.username)}
          >
            {update.author.displayName}
          </Link>
          <span>
            @{update.author.username} ·{' '}
            <time dateTime={update.createdAt}>
              {formatDate(update.createdAt)}
            </time>
          </span>
        </div>
        <div className="life-update-header-actions">
          <Link
            className="button-quiet compact-button"
            href={`/life-updates/${update.id}`}
          >
            View
          </Link>
          {owned && (
            <OverflowMenu label="Manage Life Update">
              <Link href={`/life-updates/${update.id}/edit`}>Edit update</Link>
              <form
                action={deleteLifeUpdateAction.bind(
                  null,
                  update.id,
                  returnPath,
                )}
              >
                <ConfirmSubmitButton
                  className="danger"
                  confirmation="Delete this Life Update from every selected Box? This cannot be undone."
                >
                  Delete update
                </ConfirmSubmitButton>
              </form>
            </OverflowMenu>
          )}
        </div>
      </header>
      <div className="life-update-sections">
        {Object.entries(update.sections).map(([key, value]) =>
          value ? (
            <section key={key}>
              <h3>{sectionLabels[key] ?? key}</h3>
              <p>{value}</p>
            </section>
          ) : null,
        )}
      </div>
      {update.media.length > 0 && (
        <PostMediaGallery
          authorName={update.author.displayName}
          media={update.media}
          postId={context.postId}
        />
      )}
      {update.contexts.length > 1 && (
        <div
          className="life-update-context-tabs"
          role="tablist"
          aria-label="Box conversation"
        >
          <span>Conversation in</span>
          {update.contexts.map((item) => (
            <button
              aria-selected={item.postId === context.postId}
              key={item.postId}
              onClick={() => {
                setSelectedPostId(item.postId);
                sessionStorage.setItem(
                  `life-update-context:${update.id}`,
                  item.postId,
                );
              }}
              role="tab"
              type="button"
            >
              {item.boxName ?? 'Only Me'}
            </button>
          ))}
        </div>
      )}
      {context.audience === 'only_me' ? (
        <p className="life-update-private">🔒 Only Me</p>
      ) : (
        <PostInteractions
          currentUserId={currentUserId}
          initial={context.interactions}
          key={context.postId}
          postId={context.postId}
          presets={reactionPresets}
        />
      )}
    </article>
  );
}

export function LifeUpdateFeed({
  updates,
  currentUserId,
  reactionPresets,
  returnPath,
}: {
  updates: LifeUpdate[];
  currentUserId: UserId;
  reactionPresets: ReactionPresets;
  returnPath?: string | undefined;
}) {
  if (updates.length === 0) return null;
  return (
    <section className="life-update-feed" aria-label="Life Updates">
      {updates.map((update) => (
        <LifeUpdateCard
          currentUserId={currentUserId}
          key={update.id}
          reactionPresets={reactionPresets}
          returnPath={returnPath}
          update={update}
        />
      ))}
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(
    new Date(value),
  );
}

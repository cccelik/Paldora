import { uuidSchema } from '@paldora/validation';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CommentThread } from '../../../components/comment-thread';
import { LifeUpdateCard } from '../../../components/life-update-card';
import { RefreshOnPosts } from '../../../components/refresh-on-posts';
import { lifeUpdateHref } from '../../../lib/life-update-form';
import { conversationFor } from '../../../lib/pinned-thread';
import { apiClient, completedUser, orNotFound } from '../../../lib/session';
import styles from '../../page-stack.module.css';

export const metadata = { title: 'Life Update' };

const absent = ['LIFE_UPDATE_NOT_FOUND', 'VALIDATION_FAILED'];

/**
 * A Life Update with one Box's conversation below it (`?box=`, else the
 * first tab). Missing, deleted, blocked, and not-shared-with-you all render
 * the same not-found page.
 */
export default async function LifeUpdatePage({
  params,
  searchParams,
}: PageProps<'/life-updates/[lifeUpdateId]'>) {
  const me = await completedUser();
  const id = uuidSchema.safeParse((await params).lifeUpdateId);
  if (!id.success) notFound();
  const query = await searchParams;
  const api = await apiClient();
  const lifeUpdate = await orNotFound(api.lifeUpdate(id.data), absent);
  const wanted = uuidSchema.safeParse(query.box);
  const context =
    lifeUpdate.contexts.find(
      (item) => wanted.success && item.box.id === wanted.data.toLowerCase(),
    ) ?? lifeUpdate.contexts[0];
  // The conversation went away between the two reads (left, deleted): the
  // same answer as any other absence.
  const conversation = context
    ? await conversationFor(api, context.postId, query, [
        'POST_NOT_FOUND',
        'VALIDATION_FAILED',
      ])
    : null;
  const presets = me.preferences.reactionPresets;
  return (
    <div className={styles.stack}>
      <p>
        {context ? (
          <Link href={`/boxes/${context.box.id}`}>← {context.box.name}</Link>
        ) : (
          <Link href="/life-updates">← Your Life Updates</Link>
        )}
      </p>
      <RefreshOnPosts
        postIds={lifeUpdate.contexts.map((item) => item.postId)}
      />
      <LifeUpdateCard
        lifeUpdate={lifeUpdate}
        presets={presets}
        viewerId={me.user.id}
        selectedBoxId={context?.box.id}
        permalink
      />
      {context && conversation ? (
        <CommentThread
          postId={context.postId}
          threads={conversation.comments.items}
          nextCursor={conversation.comments.nextCursor}
          pinned={conversation.pinned}
          pinnedMissing={conversation.pinnedMissing}
          focusId={conversation.focusId}
          presets={presets}
          canInteract={context.interactions.canInteract}
          commentCount={context.interactions.commentCount}
          olderHref={
            conversation.comments.nextCursor
              ? lifeUpdateHref(lifeUpdate.id, {
                  boxId: context.box.id,
                  commentsCursor: conversation.comments.nextCursor,
                })
              : undefined
          }
        />
      ) : null}
    </div>
  );
}

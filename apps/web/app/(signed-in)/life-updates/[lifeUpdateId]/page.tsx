import styles from '@/(signed-in)/life-updates/[lifeUpdateId]/page.module.css';
import { CommentThread } from '@/components/interactions/comment-thread';
import { LifeUpdateCard } from '@/components/life-updates/life-update-card';
import { RefreshOnPosts } from '@/components/realtime/refresh-on-posts';
import { conversationFor } from '@/lib/interactions/pinned-thread';
import { lifeUpdateHref } from '@/lib/life-updates/life-update-form';
import {
  LIFE_UPDATE_ABSENT,
  POST_ABSENT,
  optionalUuid,
  uuidParam,
} from '@/lib/server/route-params';
import { apiClient, completedUser, orNotFound } from '@/lib/server/session';
import Link from 'next/link';
export const metadata = { title: 'Life Update' };

const absent = LIFE_UPDATE_ABSENT;

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
  const id = uuidParam((await params).lifeUpdateId);
  const query = await searchParams;
  const api = await apiClient();
  const lifeUpdate = await orNotFound(api.lifeUpdate(id), absent);
  const wanted = optionalUuid(query.box)?.toLowerCase();
  const context =
    lifeUpdate.contexts.find(
      (item) => wanted !== undefined && item.box.id === wanted,
    ) ?? lifeUpdate.contexts[0];
  // The conversation went away between the two reads (left, deleted): the
  // same answer as any other absence.
  const conversation = context
    ? await conversationFor(api, context.postId, query, POST_ABSENT)
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

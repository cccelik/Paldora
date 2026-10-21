import styles from '@/(signed-in)/posts/[postId]/page.module.css';
import { CommentThread } from '@/components/interactions/comment-thread';
import { PostCard } from '@/components/posts/post-card';
import { BackLink } from '@/components/ui';
import { conversationFor } from '@/lib/interactions/pinned-thread';
import { lifeUpdateHref } from '@/lib/life-updates/life-update-form';
import {
  POST_ABSENT,
  optionalUuid,
  uuidParam,
} from '@/lib/server/route-params';
import {
  apiClient,
  completedUser,
  cursorParam,
  orNotFound,
} from '@/lib/server/session';
import { type Route } from 'next';
import { redirect } from 'next/navigation';
export const metadata = { title: 'Post' };

export default async function PostPage({
  params,
  searchParams,
}: PageProps<'/posts/[postId]'>) {
  const me = await completedUser();
  const id = uuidParam((await params).postId);
  const query = await searchParams;
  const api = await apiClient();
  const post = await orNotFound(api.post(id), POST_ABSENT);
  // A Life Update's backing post has no content of its own: show the Life
  // Update, opened on this Box's conversation, keeping any deep link.
  if (post.kind === 'life_update' && post.lifeUpdateId) {
    const linked = optionalUuid(query.comment)?.toLowerCase();
    redirect(
      lifeUpdateHref(post.lifeUpdateId, {
        boxId: post.box.id,
        commentId: linked ?? null,
        commentsCursor: cursorParam(query.comments),
      }) as Route,
    );
  }
  const { comments, pinned, pinnedMissing, focusId } = await conversationFor(
    api,
    post.id,
    query,
    POST_ABSENT,
  );
  const presets = me.preferences.reactionPresets;
  return (
    <div className={styles.stack}>
      <BackLink href={`/boxes/${post.box.id}`}>{post.box.name}</BackLink>
      <PostCard
        post={post}
        presets={presets}
        showBox
        leaveAfterDelete
        permalink
      />
      <CommentThread
        postId={post.id}
        threads={comments.items}
        nextCursor={comments.nextCursor}
        pinned={pinned}
        pinnedMissing={pinnedMissing}
        focusId={focusId}
        presets={presets}
        canInteract={post.interactions.canInteract}
        commentCount={post.interactions.commentCount}
      />
    </div>
  );
}

import { uuidSchema } from '@paldora/validation';
import type { Route } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CommentThread } from '../../../components/comment-thread';
import { PostCard } from '../../../components/post-card';
import { lifeUpdateHref } from '../../../lib/life-update-form';
import { conversationFor } from '../../../lib/pinned-thread';
import {
  apiClient,
  completedUser,
  cursorParam,
  orNotFound,
} from '../../../lib/session';
import styles from '../../page-stack.module.css';

export const metadata = { title: 'Post' };

export default async function PostPage({
  params,
  searchParams,
}: PageProps<'/posts/[postId]'>) {
  const me = await completedUser();
  const id = uuidSchema.safeParse((await params).postId);
  if (!id.success) notFound();
  const query = await searchParams;
  const api = await apiClient();
  const post = await orNotFound(api.post(id.data), [
    'POST_NOT_FOUND',
    'VALIDATION_FAILED',
  ]);
  // A Life Update's backing post has no content of its own: show the Life
  // Update, opened on this Box's conversation, keeping any deep link.
  if (post.kind === 'life_update' && post.lifeUpdateId) {
    const linked = uuidSchema.safeParse(query.comment);
    redirect(
      lifeUpdateHref(post.lifeUpdateId, {
        boxId: post.box.id,
        commentId: linked.success ? linked.data.toLowerCase() : null,
        commentsCursor: cursorParam(query.comments),
      }) as Route,
    );
  }
  const { comments, pinned, pinnedMissing, focusId } = await conversationFor(
    api,
    post.id,
    query,
    ['POST_NOT_FOUND', 'VALIDATION_FAILED'],
  );
  const presets = me.preferences.reactionPresets;
  return (
    <div className={styles.stack}>
      <p>
        <Link href={`/boxes/${post.box.id}`}>← {post.box.name}</Link>
      </p>
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

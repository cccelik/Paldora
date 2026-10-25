import styles from '@/(signed-in)/posts/[postId]/page.module.css';

import { FirebaseCommentThreads } from '@/components/interactions/firebase-comments';

import { FirebaseBoxFeed } from '@/components/posts/firebase-box-feed';
import { BackLink } from '@/components/ui';

import { lifeUpdateHref } from '@/lib/life-updates/life-update-form';
import {
  POST_ABSENT,
  optionalUuid,
  uuidParam,
} from '@/lib/server/route-params';
import { completedUser, cursorParam, orNotFound } from '@/lib/server/session';

import { firebaseWebData } from '@/lib/server/firebase/data';
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
  {
    const data = await firebaseWebData();
    const { box, item } = await orNotFound(data.post(id), POST_ABSENT);
    if (item.kind === 'life_update') {
      redirect(lifeUpdateHref(item.id, { boxId: box.id }) as Route);
    }
    const focusId = optionalUuid(query.comment)?.toLowerCase();
    const [comments, pinned] = await Promise.all([
      orNotFound(
        data.commentThreads(box.id, id, cursorParam(query.comments)),
        POST_ABSENT,
      ),
      focusId ? data.pinnedCommentThread(box.id, id, focusId) : null,
    ]);
    return (
      <div className={styles.stack}>
        <BackLink href={`/boxes/${box.id}`}>{box.name}</BackLink>
        <FirebaseBoxFeed
          items={[item]}
          active={box.status === 'active'}
          presets={me.preferences.reactionPresets}
        />
        <FirebaseCommentThreads
          boxId={box.id}
          postId={id}
          threads={comments.items}
          nextCursor={comments.nextCursor}
          pinned={pinned}
          pinnedMissing={!!focusId && !pinned}
          active={box.status === 'active'}
          presets={me.preferences.reactionPresets}
          count={item.interactions.commentCount}
        />
      </div>
    );
  }
}

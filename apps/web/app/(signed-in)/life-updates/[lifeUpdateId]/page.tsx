import styles from '@/(signed-in)/life-updates/[lifeUpdateId]/page.module.css';

import { FirebaseCommentThreads } from '@/components/interactions/firebase-comments';

import { FirebaseLifeUpdateCard } from '@/components/life-updates/firebase-life-update-card';

import { lifeUpdateHref } from '@/lib/life-updates/life-update-form';
import {
  LIFE_UPDATE_ABSENT,
  POST_ABSENT,
  optionalUuid,
  uuidParam,
} from '@/lib/server/route-params';
import { completedUser, cursorParam, orNotFound } from '@/lib/server/session';

import { firebaseWebData } from '@/lib/server/firebase/data';
import Link from 'next/link';
export const metadata = { title: 'Life Update' };

const absent = LIFE_UPDATE_ABSENT;

async function firebaseLifeUpdatePage(
  id: string,
  query: Record<string, string | string[] | undefined>,
  presets: readonly string[],
) {
  const data = await firebaseWebData();
  const update = await orNotFound(data.lifeUpdate(id), absent);
  const wanted = optionalUuid(query.box)?.toLowerCase();
  const context =
    update.contexts.find((item) => item.boxId === wanted) ?? update.contexts[0];
  const focusId = optionalUuid(query.comment)?.toLowerCase();
  const [comments, pinned] = context
    ? await Promise.all([
        orNotFound(
          data.commentThreads(
            context.boxId,
            context.postId,
            cursorParam(query.comments),
          ),
          POST_ABSENT,
        ),
        focusId
          ? data.pinnedCommentThread(context.boxId, context.postId, focusId)
          : null,
      ])
    : [null, null];
  return (
    <div className={styles.stack}>
      <p>
        <Link href={context ? `/boxes/${context.boxId}` : '/life-updates'}>
          ← {context?.boxName ?? 'Your Life Updates'}
        </Link>
      </p>
      <FirebaseLifeUpdateCard
        update={update}
        ownPage
        selectedBoxId={context?.boxId}
        presets={presets}
      />
      {context && comments ? (
        <FirebaseCommentThreads
          boxId={context.boxId}
          postId={context.postId}
          threads={comments.items}
          nextCursor={comments.nextCursor}
          pinned={pinned}
          pinnedMissing={!!focusId && !pinned}
          active={context.canInteract}
          presets={presets}
          count={context.interactions.commentCount}
          olderHref={
            comments.nextCursor
              ? lifeUpdateHref(id, {
                  boxId: context.boxId,
                  commentsCursor: comments.nextCursor,
                })
              : undefined
          }
        />
      ) : null}
    </div>
  );
}

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
  return firebaseLifeUpdatePage(id, query, me.preferences.reactionPresets);
}

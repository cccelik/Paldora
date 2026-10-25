import styles from '@/(signed-in)/posts/[postId]/reactions/page.module.css';
import { MoreLink } from '@/components/common/more-link';
import {
  ReactionFilter,
  ReactionList,
} from '@/components/interactions/reaction-list';
import { BackLink, EmptyState, PageHeader } from '@/components/ui';
import { POST_ABSENT, uuidParam } from '@/lib/server/route-params';
import { completedUser, cursorParam, orNotFound } from '@/lib/server/session';
import { REAL_REACTION_KIND } from '@paldora/domain';

import { firebaseWebData } from '@/lib/server/firebase/data';
export const metadata = { title: 'Reactions' };

/** Everyone who reacted to a post, newest first; `?kind=real` for camera. */
export default async function PostReactionsPage({
  params,
  searchParams,
}: PageProps<'/posts/[postId]/reactions'>) {
  await completedUser();
  const id = uuidParam((await params).postId);
  const query = await searchParams;
  const cameraOnly = query.kind === REAL_REACTION_KIND;
  const page = await orNotFound(
    (await firebaseWebData()).postReactions(
      id,
      {
        limit: 20,
        cursor: cursorParam(query.cursor),
      },
      cameraOnly,
    ),
    POST_ABSENT,
  );
  const here = `/posts/${id}/reactions?${cameraOnly ? `kind=${REAL_REACTION_KIND}&` : ''}`;
  return (
    <div className={styles.stack}>
      <BackLink href={`/posts/${id}`}>Back to the post</BackLink>
      <PageHeader
        title="Reactions"
        description="Everyone you can see who reacted, newest first."
      />
      <ReactionFilter postId={id} cameraOnly={cameraOnly} />
      {page.items.length === 0 ? (
        <EmptyState>
          {cameraOnly ? 'No camera reactions yet.' : 'No reactions yet.'}
        </EmptyState>
      ) : (
        <ReactionList items={page.items} />
      )}
      {page.nextCursor ? (
        <MoreLink
          href={`${here}cursor=${encodeURIComponent(page.nextCursor)}`}
          label="Show more reactions"
        />
      ) : null}
    </div>
  );
}

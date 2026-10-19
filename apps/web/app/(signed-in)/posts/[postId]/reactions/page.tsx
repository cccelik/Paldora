import { REAL_REACTION_KIND } from '@paldora/domain';
import { uuidSchema } from '@paldora/validation';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MoreLink } from '../../../../components/more-link';
import {
  ReactionFilter,
  ReactionList,
} from '../../../../components/reaction-list';
import { EmptyState, PageHeader } from '../../../../components/ui';
import {
  apiClient,
  completedUser,
  cursorParam,
  orNotFound,
} from '../../../../lib/session';
import styles from '../../../page-stack.module.css';

export const metadata = { title: 'Reactions' };

/** Everyone who reacted to a post, newest first; `?kind=real` for camera. */
export default async function PostReactionsPage({
  params,
  searchParams,
}: PageProps<'/posts/[postId]/reactions'>) {
  await completedUser();
  const id = uuidSchema.safeParse((await params).postId);
  if (!id.success) notFound();
  const query = await searchParams;
  const cameraOnly = query.kind === REAL_REACTION_KIND;
  const page = await orNotFound(
    (await apiClient()).postReactions(id.data, {
      limit: 20,
      cursor: cursorParam(query.cursor),
      ...(cameraOnly ? { kind: REAL_REACTION_KIND } : {}),
    }),
    ['POST_NOT_FOUND', 'VALIDATION_FAILED'],
  );
  const here = `/posts/${id.data}/reactions?${cameraOnly ? `kind=${REAL_REACTION_KIND}&` : ''}`;
  return (
    <div className={styles.stack}>
      <p>
        <Link href={`/posts/${id.data}`}>← Back to the post</Link>
      </p>
      <PageHeader
        title="Reactions"
        description="Everyone you can see who reacted, newest first."
      />
      <ReactionFilter postId={id.data} cameraOnly={cameraOnly} />
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

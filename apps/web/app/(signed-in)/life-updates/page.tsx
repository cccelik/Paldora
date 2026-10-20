import Link from 'next/link';
import { LifeUpdateCard } from '../../components/life-update-card';
import { MoreLink } from '../../components/more-link';
import { buttonClassName, EmptyState, PageHeader } from '../../components/ui';
import { apiClient, completedUser, cursorParam } from '../../lib/session';
import styles from '../page-stack.module.css';

export const metadata = { title: 'Life Updates' };

/** The viewer's own Life Updates, newest first, Only Me included. */
export default async function LifeUpdatesPage({
  searchParams,
}: PageProps<'/life-updates'>) {
  const me = await completedUser();
  const cursor = cursorParam((await searchParams).cursor);
  const page = await (await apiClient()).myLifeUpdates({ limit: 20, cursor });
  return (
    <div className={styles.stack}>
      <PageHeader
        title="Your Life Updates"
        description="What’s been going on, shared once with the Boxes you choose, or kept to yourself."
        meta={
          <div className={styles.actions}>
            <Link
              className={buttonClassName('primary')}
              href="/life-updates/new"
            >
              New Life Update
            </Link>
            <Link className={buttonClassName('secondary')} href="/memories">
              Memories
            </Link>
          </div>
        }
      />
      {page.items.length === 0 ? (
        <EmptyState>
          You haven’t shared a Life Update yet. Start one whenever there’s news.
        </EmptyState>
      ) : (
        <ul className={styles.cards} aria-label="Your Life Updates">
          {page.items.map((lifeUpdate) => (
            <li key={lifeUpdate.id}>
              <LifeUpdateCard
                lifeUpdate={lifeUpdate}
                presets={me.preferences.reactionPresets}
                viewerId={me.user.id}
                showBox
              />
            </li>
          ))}
        </ul>
      )}
      {page.nextCursor ? (
        <MoreLink
          href={`/life-updates?cursor=${encodeURIComponent(page.nextCursor)}`}
          label="Show older Life Updates"
        />
      ) : null}
    </div>
  );
}

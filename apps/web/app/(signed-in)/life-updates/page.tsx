import styles from '@/(signed-in)/life-updates/page.module.css';
import { MoreLink } from '@/components/common/more-link';

import { FirebaseLifeUpdateCard } from '@/components/life-updates/firebase-life-update-card';
import { buttonClassName, EmptyState, PageHeader } from '@/components/ui';
import { completedUser, cursorParam } from '@/lib/server/session';

import { firebaseWebData } from '@/lib/server/firebase/data';
import Link from 'next/link';
export const metadata = { title: 'Life Updates' };

/** The viewer's own Life Updates, newest first, Only Me included. */
export default async function LifeUpdatesPage({
  searchParams,
}: PageProps<'/life-updates'>) {
  const me = await completedUser();
  const cursor = cursorParam((await searchParams).cursor);
  const firebasePage = await (await firebaseWebData()).myLifeUpdates(cursor);
  const count = firebasePage.items.length;
  const nextCursor = firebasePage.nextCursor;
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
      {count === 0 ? (
        <EmptyState>
          You haven’t shared a Life Update yet. Start one whenever there’s news.
        </EmptyState>
      ) : (
        <ul className={styles.cards} aria-label="Your Life Updates">
          {firebasePage?.items.map((lifeUpdate) => (
            <li key={lifeUpdate.id}>
              <FirebaseLifeUpdateCard
                update={lifeUpdate}
                presets={me.preferences.reactionPresets}
              />
            </li>
          ))}
        </ul>
      )}
      {nextCursor ? (
        <MoreLink
          href={`/life-updates?cursor=${encodeURIComponent(nextCursor)}`}
          label="Show older Life Updates"
        />
      ) : null}
    </div>
  );
}

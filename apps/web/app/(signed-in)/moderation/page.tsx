import styles from '@/(signed-in)/moderation/page.module.css';
import { MoreLink } from '@/components/common/more-link';
import { PageHeader } from '@/components/ui';
import {
  apiClient,
  completedUser,
  cursorParam,
  orNotFound,
} from '@/lib/server/session';
import Link from 'next/link';

export const metadata = { title: 'Moderation queue' };

export default async function ModerationQueuePage({
  searchParams,
}: PageProps<'/moderation'>) {
  await completedUser();
  const cursor = cursorParam((await searchParams).cursor);
  const page = await orNotFound(
    (await apiClient()).moderationCases({ limit: 25, cursor }),
    ['MODERATION_FORBIDDEN'],
  );
  return (
    <div className={styles.page}>
      <PageHeader
        title="Moderation queue"
        description="Review reports one case at a time. Opening a case is audited."
      />
      {page.items.length === 0 ? <p>No open reports.</p> : null}
      <ul className={styles.list}>
        {page.items.map((item) => (
          <li key={item.id} className={styles.item}>
            <Link href={`/moderation/cases/${item.id}`}>
              {item.targetKind === 'user' ? 'Person' : item.targetKind} report
            </Link>
            <span>{item.category}</span>
            <time dateTime={item.createdAt}>
              {new Date(item.createdAt).toLocaleDateString()}
            </time>
          </li>
        ))}
      </ul>
      {page.nextCursor ? (
        <MoreLink
          href={`/moderation?cursor=${encodeURIComponent(page.nextCursor)}`}
          label="Show older cases"
        />
      ) : null}
    </div>
  );
}

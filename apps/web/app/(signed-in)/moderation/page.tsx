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
  const search = await searchParams;
  const cursor = cursorParam(search.cursor);
  const status = search.status === 'closed' ? 'closed' : 'open';
  const page = await orNotFound(
    (await apiClient()).moderationCases({ limit: 25, cursor, status }),
    ['MODERATION_FORBIDDEN'],
  );
  return (
    <div className={styles.page}>
      <PageHeader
        title="Moderation queue"
        description="Review reports one case at a time. Opening a case is audited."
      />
      <nav aria-label="Case status" className={styles.tabs}>
        <Link
          href="/moderation"
          aria-current={status === 'open' ? 'page' : undefined}
        >
          Open cases
        </Link>
        <Link
          href="/moderation?status=closed"
          aria-current={status === 'closed' ? 'page' : undefined}
        >
          Closed cases
        </Link>
      </nav>
      {page.items.length === 0 ? <p>No {status} reports.</p> : null}
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
          href={`/moderation?status=${status}&cursor=${encodeURIComponent(page.nextCursor)}`}
          label="Show older cases"
        />
      ) : null}
    </div>
  );
}

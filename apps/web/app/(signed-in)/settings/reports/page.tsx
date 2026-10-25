import styles from '@/(signed-in)/settings/reports/page.module.css';
import { MoreLink } from '@/components/common/more-link';
import { completedUser, cursorParam } from '@/lib/server/session';

import { firebaseWebData } from '@/lib/server/firebase/data';

export const metadata = { title: 'Your reports' };

export default async function ReportsPage({
  searchParams,
}: PageProps<'/settings/reports'>) {
  await completedUser();
  const cursor = cursorParam((await searchParams).cursor);
  const page = await (await firebaseWebData()).myReports({ limit: 20, cursor });
  return (
    <section className={styles.section} aria-labelledby="reports-title">
      <h2 id="reports-title" className={styles.title}>
        Your reports
      </h2>
      <p>
        Only you and the moderation team can see these receipts. Reporting does
        not automatically remove content.
      </p>
      {page.items.length === 0 ? (
        <p>You have not submitted a report.</p>
      ) : (
        <ul className={styles.list}>
          {page.items.map((report) => (
            <li className={styles.item} key={report.id}>
              <strong>
                {report.targetKind === 'user' ? 'Person' : report.targetKind}
              </strong>
              <span>{report.category}</span>
              <span>
                {report.status === 'closed' ? 'Reviewed' : 'Received'}
              </span>
              <time dateTime={report.createdAt}>
                {new Date(report.createdAt).toLocaleDateString()}
              </time>
            </li>
          ))}
        </ul>
      )}
      {page.nextCursor ? (
        <MoreLink
          href={`/settings/reports?cursor=${encodeURIComponent(page.nextCursor)}`}
          label="Show older reports"
        />
      ) : null}
    </section>
  );
}

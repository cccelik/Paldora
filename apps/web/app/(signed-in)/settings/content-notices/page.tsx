import styles from '@/(signed-in)/settings/content-notices/page.module.css';
import { apiClient, completedUser } from '@/lib/server/session';

export const metadata = { title: 'Content notices' };

export default async function ContentNoticesPage() {
  await completedUser();
  const { items } = await (await apiClient()).myModerationNotices();
  return (
    <section className={styles.section} aria-labelledby="notices-title">
      <h2 id="notices-title" className={styles.title}>
        Content notices
      </h2>
      <p>
        If a post or comment you made is hidden by moderation, it appears here.
        Other members cannot see the hidden content. If you think a decision is
        mistaken, contact the person who invited you to request a review.
      </p>
      {items.length === 0 ? <p>No content notices.</p> : null}
      <ul className={styles.list}>
        {items.map((item) => (
          <li
            className={styles.item}
            key={`${item.targetKind}-${item.targetId}`}
          >
            <strong>Your {item.targetKind} was hidden by moderation.</strong>
            <span>Reference ID: {item.targetId}</span>
            <span>
              Originally shared{' '}
              <time dateTime={item.originalCreatedAt}>
                {new Date(item.originalCreatedAt).toLocaleDateString()}
              </time>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

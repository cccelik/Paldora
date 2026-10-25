'use client';

import styles from '@/components/interactions/post-interactions.module.css';
import { REAL_REACTION_KIND } from '@paldora/domain';
import type { PostInteractionSummary } from '@paldora/validation';
import type { Route } from 'next';
import Link from 'next/link';

export function RealStrip({
  postId,
  summary,
}: {
  postId: string;
  summary: PostInteractionSummary;
}) {
  if (!summary.realPreview.length) return null;
  const more = summary.realCount - summary.realPreview.length;
  return (
    <div className={styles.real}>
      <ul className={styles.realList} aria-label="Camera reactions">
        {summary.realPreview.map((preview) => (
          <li key={preview.user.id}>
            <img
              className={styles.realImage}
              src={preview.thumbnailUrl}
              alt={`${preview.user.displayName}’s camera reaction`}
              referrerPolicy="no-referrer"
            />
          </li>
        ))}
      </ul>
      {more > 0 ? <span className={styles.meta}>+{more} more</span> : null}
      <Link
        className={styles.everyone}
        href={`/posts/${postId}/reactions?kind=${REAL_REACTION_KIND}` as Route}
      >
        See all camera reactions
      </Link>
    </div>
  );
}

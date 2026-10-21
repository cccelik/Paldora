import { REAL_REACTION_KIND } from '@paldora/domain';
import { type PostReactionEntry } from '@paldora/validation';
import { type Route } from 'next';
import Link from 'next/link';
import { PersonList, PersonRow } from './person-row';
import styles from './reaction-list.module.css';
/** "All" or "Camera": two plain links, so filtering needs no script. */
export function ReactionFilter({
  postId,
  cameraOnly,
}: {
  postId: string;
  cameraOnly: boolean;
}) {
  const base = `/posts/${postId}/reactions`;
  return (
    <nav aria-label="Show reactions" className={styles.filter}>
      <Link
        className={styles.option}
        href={base as Route}
        aria-current={cameraOnly ? undefined : 'page'}
      >
        All
      </Link>
      <Link
        className={styles.option}
        href={`${base}?kind=${REAL_REACTION_KIND}` as Route}
        aria-current={cameraOnly ? 'page' : undefined}
      >
        Camera
      </Link>
    </nav>
  );
}

/** Who reacted to a post: their emoji, or their camera image. */
export function ReactionList({
  items,
}: {
  items: readonly PostReactionEntry[];
}) {
  return (
    <PersonList label="Reactions">
      {items.map((entry) => (
        <PersonRow
          key={entry.user.id}
          person={entry.user}
          note={
            entry.image ? (
              <img
                className={styles.image}
                src={entry.image.thumbnailUrl}
                alt={`${entry.user.displayName}’s camera reaction`}
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className={styles.emoji}>
                <span aria-hidden="true">{entry.kind}</span>
                <span className="visually-hidden">
                  reacted with {entry.kind}
                </span>
              </span>
            )
          }
        />
      ))}
    </PersonList>
  );
}

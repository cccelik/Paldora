import styles from '@/components/boxes/box-rail.module.css';
import { Chip } from '@/components/ui';
import { type BoxView } from '@paldora/validation';
import Link from 'next/link';

/**
 * The Home right rail's "Your Boxes" card (Figma W03): the caller's own Boxes
 * only, each with its real member count. No invented activity or counts.
 */
export function BoxRail({ boxes }: { boxes: readonly BoxView[] }) {
  return (
    <section className={styles.card} aria-labelledby="box-rail-title">
      <header className={styles.header}>
        <h2 id="box-rail-title" className={styles.title}>
          Your Boxes
        </h2>
        <Link className={styles.all} href="/boxes">
          See all
        </Link>
      </header>
      {boxes.length === 0 ? (
        <p className={styles.empty}>
          You’re not in a Box yet. Create one or accept an invitation.
        </p>
      ) : (
        <ul className={styles.list} aria-label="Box shortcuts">
          {boxes.map((box) => (
            <li key={box.id}>
              <Link className={styles.row} href={`/boxes/${box.id}`}>
                <span className={styles.initial} aria-hidden="true">
                  {Array.from(box.name)[0]?.toUpperCase()}
                </span>
                <span className={styles.text}>
                  <span className={styles.name}>{box.name}</span>
                  <span className={styles.meta}>
                    {box.memberCount}{' '}
                    {box.memberCount === 1 ? 'member' : 'members'}
                  </span>
                </span>
                {box.status === 'archived' ? <Chip>Archived</Chip> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

import styles from '@/components/ui/avatar.module.css';
/** Initials from a display name, or the first letter of a username. */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/u).filter(Boolean);
  const letters = words.slice(0, 2).map((word) => Array.from(word)[0] ?? '');
  return letters.join('').toLocaleUpperCase() || '✦';
}

/**
 * A profile photo, or initials when there is none. Signed URLs are short-
 * lived, so images are never cached beyond the page that received them.
 */
export function Avatar({
  url,
  name,
  size = 'small',
}: {
  url: string | null | undefined;
  name: string | null | undefined;
  size?: 'small' | 'large';
}) {
  return (
    <span className={`${styles.avatar} ${styles[size]}`} aria-hidden="true">
      {url ? (
        // Signed, expiring storage URLs: a plain img, never the optimizer.
        <img src={url} alt="" referrerPolicy="no-referrer" />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}

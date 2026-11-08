import styles from '@/components/ui/avatar.module.css';
/** Figma "Avatar" (43:245): S28, M40, L56, XL104. */
export type AvatarSize = 's' | 'm' | 'l' | 'xl';

/** Initials from a display name, or the first letter of a username. */
export function initialsOf(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/u).filter(Boolean);
  const letters = words.slice(0, 2).map((word) => Array.from(word)[0] ?? '');
  return letters.join('').toLocaleUpperCase() || '✦';
}

/** `small` and `large` are the older names for M and XL. */
const legacySizes = { small: 'm', large: 'xl' } as const;

/**
 * A profile photo, or initials (Fraunces) when there is none. Signed URLs are
 * short-lived, so images are never cached beyond the page that received them.
 * `ring` is the brass ring for you. Decorative: names appear in text beside it.
 */
export function Avatar({
  url,
  name,
  size = 'm',
  ring = false,
}: {
  url: string | null | undefined;
  name: string | null | undefined;
  size?: AvatarSize | keyof typeof legacySizes;
  ring?: boolean;
}) {
  const resolved =
    size in legacySizes ? legacySizes[size as keyof typeof legacySizes] : size;
  return (
    <span
      className={`${styles.avatar} ${styles[resolved]} ${ring ? styles.ring : ''}`}
      aria-hidden="true"
    >
      {url ? (
        // Signed, expiring storage URLs: a plain img, never the optimizer.
        <img src={url} alt="" referrerPolicy="no-referrer" />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
}

/** Overlapping avatars with a "+n" overflow count. */
export function AvatarStack({
  people,
  max = 3,
  size = 's',
}: {
  people: readonly { id: string; name: string | null; url?: string | null }[];
  max?: number;
  size?: AvatarSize;
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className={styles.stack}>
      {shown.map((person) => (
        <span key={person.id} className={styles.stacked}>
          <Avatar url={person.url} name={person.name} size={size} />
        </span>
      ))}
      {extra > 0 ? (
        <span className={`${styles.stacked} ${styles.more}`}>+{extra}</span>
      ) : null}
    </span>
  );
}

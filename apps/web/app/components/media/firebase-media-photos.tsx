import styles from '@/components/media/post-photos.module.css';

/** Private same-origin photo URLs are reauthorized on every request. */
export function FirebaseMediaPhotos({
  ids,
  authorName,
}: {
  ids: readonly string[];
  authorName: string;
}) {
  if (!ids.length) return null;
  return (
    <ul
      className={`${styles.grid} ${ids.length === 1 ? styles.single : ids.length === 2 ? styles.two : styles.many}`}
      aria-label="Photos"
    >
      {ids.map((id, index) => (
        <li key={id}>
          <a
            href={`/media/${id}/display`}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open photo ${index + 1} by ${authorName}`}
          >
            <img
              className={styles.image}
              src={`/media/${id}/thumbnail`}
              alt={`Photo ${index + 1} by ${authorName}`}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}

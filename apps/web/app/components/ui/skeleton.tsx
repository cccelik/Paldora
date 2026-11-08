import styles from '@/components/ui/skeleton.module.css';
/**
 * Figma "Skeleton" (44:212). Loading is a skeleton, never a spinner. The
 * pulse stops under reduced motion. Decorative; announce loading through the
 * region that contains it (`aria-busy`).
 */
export function Skeleton({
  shape = 'line',
}: {
  shape?: 'line' | 'short' | 'avatar' | 'media';
}) {
  return (
    <span
      className={`${styles.skeleton} ${styles[shape]}`}
      aria-hidden="true"
    />
  );
}

/** The post-shaped skeleton: header, media and two lines of text. */
export function PostSkeleton() {
  return (
    <div className={styles.post} role="status" aria-busy="true">
      <span className="visually-hidden">Loading post</span>
      <div className={styles.header}>
        <Skeleton shape="avatar" />
        <div className={styles.lines}>
          <Skeleton shape="short" />
          <Skeleton shape="short" />
        </div>
      </div>
      <Skeleton shape="media" />
      <Skeleton />
      <Skeleton shape="short" />
    </div>
  );
}

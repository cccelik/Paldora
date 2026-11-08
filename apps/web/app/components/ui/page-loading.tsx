import { PostSkeleton } from '@/components/ui/skeleton';
import styles from '@/components/ui/page-loading.module.css';
/** The route-level `loading.tsx` body: skeleton posts, never a spinner. */
export function PageLoading({ rows = 3 }: { rows?: number }) {
  return (
    <div className={styles.page} aria-busy="true">
      {Array.from({ length: rows }, (_, index) => (
        <PostSkeleton key={index} />
      ))}
    </div>
  );
}

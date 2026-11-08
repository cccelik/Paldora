import { Avatar } from '@/components/ui/avatar';
import styles from '@/components/ui/comment.module.css';
import { type ReactNode } from 'react';
/** Figma "Comment" (44:122): Root, Reply (indented 44) and Deleted. */
export function Comment({
  author,
  when,
  reply = false,
  deleted = false,
  actions,
  children,
}: {
  author: { name: string | null; avatarUrl?: string | null | undefined };
  when: ReactNode;
  reply?: boolean;
  deleted?: boolean;
  /** Reaction, reply and menu controls. */
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <article className={`${styles.comment} ${reply ? styles.reply : ''}`}>
      <Avatar
        url={deleted ? null : author.avatarUrl}
        name={deleted ? null : author.name}
        size="s"
      />
      <div className={styles.main}>
        {deleted ? (
          <p className={styles.deleted}>This comment was deleted.</p>
        ) : (
          <>
            <p className={styles.head}>
              <span className={styles.name}>{author.name ?? 'Someone'}</span>
              <span className={styles.when}>{when}</span>
            </p>
            <div className={styles.body}>{children}</div>
            {actions ? <div className={styles.actions}>{actions}</div> : null}
          </>
        )}
      </div>
    </article>
  );
}

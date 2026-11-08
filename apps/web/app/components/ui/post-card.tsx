import { Avatar } from '@/components/ui/avatar';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icons';
import styles from '@/components/ui/post-card.module.css';
import { type ReactNode } from 'react';
/**
 * Figma "Post card" (44:55): Photo and Text variants. Presentational: the
 * feature supplies the data, the media, the overflow menu and (instead of the
 * static counts) real reaction controls through `actions`.
 */
export function PostCard({
  author,
  meta,
  menu,
  media,
  children,
  likes,
  liked = false,
  comments,
  actions,
  audience = 'Only this Box',
}: {
  author: { name: string | null; avatarUrl?: string | null | undefined };
  /** Box name and time, for example "Sunday Supper · 2h". */
  meta: ReactNode;
  menu?: ReactNode;
  /** A photo or photo grid, drawn with radius 22. */
  media?: ReactNode;
  /** The post text, set in Fraunces. */
  children?: ReactNode;
  likes?: number;
  liked?: boolean;
  comments?: number;
  /** Replaces the static counts with real controls. */
  actions?: ReactNode;
  audience?: string;
}) {
  return (
    <article className={styles.card}>
      <header className={styles.header}>
        <Avatar url={author.avatarUrl} name={author.name} size="m" />
        <div className={styles.who}>
          <p className={styles.name}>{author.name ?? 'Someone'}</p>
          <p className={styles.meta}>{meta}</p>
        </div>
        {menu}
      </header>
      {media ? <div className={styles.media}>{media}</div> : null}
      {children ? <div className={styles.body}>{children}</div> : null}
      <footer className={styles.footer}>
        <div className={styles.actions}>
          {actions ?? (
            <>
              {likes === undefined ? null : (
                <Chip kind={liked ? 'accent' : 'default'} icon="heart">
                  {likes}
                </Chip>
              )}
              {comments === undefined ? null : (
                <Chip icon="chat">{comments}</Chip>
              )}
            </>
          )}
        </div>
        <p className={styles.audience}>
          <Icon name="lock" size={14} />
          {audience}
        </p>
      </footer>
    </article>
  );
}

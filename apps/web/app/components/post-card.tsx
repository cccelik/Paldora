import type { FeedItemView, PostView } from '@paldora/validation';
import Link from 'next/link';
import { LocalTime } from './local-time';
import { PostActions } from './post-actions';
import { Avatar, Badge, EmptyState } from './ui';
import styles from './post-card.module.css';

export function PostCard({
  post,
  showBox = false,
  leaveAfterDelete = false,
}: {
  post: PostView;
  showBox?: boolean;
  leaveAfterDelete?: boolean;
}) {
  return (
    <article
      className={styles.card}
      aria-label={`Post by ${post.author.displayName}`}
    >
      <header className={styles.head}>
        <Avatar url={post.author.avatarUrl} name={post.author.displayName} />
        <div className={styles.who}>
          <span className={styles.name}>{post.author.displayName}</span>
          <span className={styles.meta}>
            <Link href={`/posts/${post.id}`}>
              <LocalTime iso={post.createdAt} />
            </Link>
            {post.editedAt ? <span>edited</span> : null}
          </span>
        </div>
        {showBox ? (
          <Link href={`/boxes/${post.box.id}`}>
            <Badge>{post.box.name}</Badge>
          </Link>
        ) : null}
      </header>
      <p className={styles.body}>{post.content}</p>
      {post.canEdit ? (
        <PostActions
          postId={post.id}
          content={post.content}
          leaveAfterDelete={leaveAfterDelete}
        />
      ) : null}
    </article>
  );
}

/** A post from someone in a block relationship: no author, no text, no hint. */
function HiddenPostCard() {
  return (
    <article
      className={`${styles.card} ${styles.hidden}`}
      aria-label="Hidden post"
    >
      <p>A post here is hidden.</p>
    </article>
  );
}

export function PostFeed({
  items,
  showBox = false,
  empty,
}: {
  items: readonly FeedItemView[];
  showBox?: boolean;
  empty: string;
}) {
  if (items.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <ul className={styles.list} aria-label="Posts">
      {items.map((item) => (
        <li key={item.kind === 'post' ? item.post.id : item.hidden.id}>
          {item.kind === 'post' ? (
            <PostCard post={item.post} showBox={showBox} />
          ) : (
            <HiddenPostCard />
          )}
        </li>
      ))}
    </ul>
  );
}

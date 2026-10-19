import type { FeedItemView, PostView } from '@paldora/validation';
import Link from 'next/link';
import { LocalTime } from './local-time';
import { PostActions } from './post-actions';
import { PostInteractions } from './post-interactions';
import { PostPhotos } from './post-photos';
import { Avatar, Badge, EmptyState } from './ui';
import styles from './post-card.module.css';

export function PostCard({
  post,
  presets,
  showBox = false,
  leaveAfterDelete = false,
  permalink = false,
}: {
  post: PostView;
  /** The viewer's five reaction shortcuts. */
  presets: readonly string[];
  showBox?: boolean;
  leaveAfterDelete?: boolean;
  /** On the post's own page the thread follows, so no comments link. */
  permalink?: boolean;
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
      {post.content ? <p className={styles.body}>{post.content}</p> : null}
      <PostPhotos photos={post.media} authorName={post.author.displayName} />
      <PostInteractions
        postId={post.id}
        boxId={post.box.id}
        summary={post.interactions}
        presets={presets}
        commentsLink={!permalink}
      />
      {post.canEdit ? (
        <PostActions
          postId={post.id}
          content={post.content}
          hasPhotos={post.media.length > 0}
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
  presets,
  showBox = false,
  empty,
}: {
  items: readonly FeedItemView[];
  presets: readonly string[];
  showBox?: boolean;
  empty: string;
}) {
  if (items.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <ul className={styles.list} aria-label="Posts">
      {items.map((item) => (
        <li key={item.kind === 'post' ? item.post.id : item.hidden.id}>
          {item.kind === 'post' ? (
            <PostCard post={item.post} presets={presets} showBox={showBox} />
          ) : (
            <HiddenPostCard />
          )}
        </li>
      ))}
    </ul>
  );
}

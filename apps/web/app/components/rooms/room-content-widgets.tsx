import styles from '@/components/rooms/room-content-widgets.module.css';
import { Empty, Preview } from '@/components/rooms/room-widget-parts';
import { countLabel, memoryHref } from '@/lib/life-updates/memories';
import { excerpt } from '@/lib/rooms/room-theme';
import {
  type LifeUpdateView,
  type MemorySummaryView,
  type PostView,
} from '@paldora/validation';
import { type Route } from 'next';
import Link from 'next/link';
export function postTitle(post: PostView): string {
  if (post.content) return excerpt(post.content);
  const count = post.media.length;
  return count === 1 ? 'A photo' : `${count} photos`;
}

export function Posts({
  posts,
  isOwner,
}: {
  posts: readonly PostView[];
  isOwner: boolean;
}) {
  const shown = posts.filter((post) => post.kind === 'post');
  if (shown.length === 0) {
    return (
      <Empty>
        {isOwner
          ? 'Your latest posts in your Boxes show up here.'
          : 'No posts to show yet.'}
      </Empty>
    );
  }
  return (
    <ul className={styles.previews}>
      {shown.map((post) => (
        <Preview
          key={post.id}
          href={`/posts/${post.id}`}
          title={postTitle(post)}
          where={post.box.name}
          at={post.createdAt}
        />
      ))}
    </ul>
  );
}

export function lifeUpdateTitle(lifeUpdate: LifeUpdateView): string {
  const [first] = lifeUpdate.sections;
  if (first) return `${first.label}: ${excerpt(first.content)}`;
  const count = lifeUpdate.media.length;
  return count === 1 ? 'A photo' : `${count} photos`;
}

export function LifeUpdates({
  lifeUpdates,
  isOwner,
}: {
  lifeUpdates: readonly LifeUpdateView[];
  isOwner: boolean;
}) {
  // Only Box deliveries the viewer is in; Only Me never reaches a Room.
  const shown = lifeUpdates.flatMap((lifeUpdate) => {
    const [context] = lifeUpdate.contexts;
    return context ? [{ lifeUpdate, context }] : [];
  });
  if (shown.length === 0) {
    return (
      <Empty>
        {isOwner
          ? 'Life Updates you share with your Boxes show up here.'
          : 'No Life Updates to show yet.'}
      </Empty>
    );
  }
  return (
    <ul className={styles.previews}>
      {shown.map(({ lifeUpdate, context }) => (
        <Preview
          key={lifeUpdate.id}
          href={`/life-updates/${lifeUpdate.id}?box=${context.box.id}`}
          title={lifeUpdateTitle(lifeUpdate)}
          where={lifeUpdate.contexts.map((each) => each.box.name).join(', ')}
          at={lifeUpdate.createdAt}
        />
      ))}
    </ul>
  );
}

export function Memories({
  username,
  summary,
  isOwner,
}: {
  username: string;
  summary: MemorySummaryView;
  isOwner: boolean;
}) {
  const scope = { kind: 'room', username } as const;
  if (summary.years.length === 0) {
    return (
      <Empty>
        {isOwner
          ? 'What you share collects here, year by year.'
          : 'No memories to show yet.'}
      </Empty>
    );
  }
  return (
    <ul className={styles.years}>
      {summary.years.map(({ year, count }) => (
        <li key={year}>
          <Link
            className={styles.year}
            href={memoryHref(scope, { year }) as Route}
          >
            <span className={styles.yearLabel}>{year}</span>{' '}
            <span className={styles.yearCount}>{countLabel(count)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

import { LocalTime } from '@/components/common/local-time';
import { FirebasePostReactions } from '@/components/interactions/firebase-post-reactions';
import { FirebaseMediaPhotos } from '@/components/media/firebase-media-photos';
import { ReportControl } from '@/components/moderation/report-control';
import { PostActions } from '@/components/posts/post-actions';
import styles from '@/components/posts/post-card.module.css';
import {
  buttonClassName,
  EmptyState,
  LifeUpdateCard,
  PostCard,
} from '@/components/ui';
import type { FirebaseFeedItem } from '@/lib/server/firebase/data';
import { LIFE_UPDATE_SECTION_LABELS } from '@paldora/domain';
import { type Route } from 'next';
import Link from 'next/link';

type LifeUpdateFeedItem = Extract<FirebaseFeedItem, { kind: 'life_update' }>;
type PostFeedItem = Extract<FirebaseFeedItem, { kind: 'post' }>;

function FeedPost({
  item,
  active,
  presets,
  boxName,
}: {
  item: PostFeedItem;
  active: boolean;
  presets: readonly string[];
  boxName: string | undefined;
}) {
  return (
    <PostCard
      ariaLabel={`Post by ${item.authorName}`}
      author={{ name: item.authorName, avatarUrl: item.authorAvatarUrl }}
      audience={boxName ? `Only ${boxName}` : 'Only this Box'}
      meta={
        <>
          <Link href={`/posts/${item.id}`}>
            <LocalTime iso={item.createdAt} />
          </Link>
          {boxName ? <> · {boxName}</> : null}
          {item.edited ? <> · edited</> : null}
        </>
      }
      media={
        <FirebaseMediaPhotos
          ids={item.mediaAssetIds}
          authorName={item.authorName}
        />
      }
      actions={
        <FirebasePostReactions
          boxId={item.boxId}
          postId={item.id}
          initialSummary={item.interactions}
          presets={presets}
          active={active}
        />
      }
      controls={
        <>
          {item.canEdit && active ? (
            <PostActions
              postId={item.id}
              content={item.content}
              hasPhotos={item.mediaAssetIds.length > 0}
            />
          ) : null}
          <ReportControl targetKind="post" targetId={item.id} />
        </>
      }
    >
      {item.content}
    </PostCard>
  );
}

function FeedLifeUpdate({
  item,
  active,
  presets,
  boxName,
}: {
  item: LifeUpdateFeedItem;
  active: boolean;
  presets: readonly string[];
  boxName: string | undefined;
}) {
  const href = `/life-updates/${item.id}?box=${item.boxId}` as Route;
  return (
    <LifeUpdateCard
      ariaLabel={`Life Update by ${item.authorName}`}
      when={
        <Link href={href}>
          <LocalTime iso={item.createdAt} />
        </Link>
      }
      title={`${item.authorName} shared a life update${boxName ? ` in ${boxName}` : ''}.`}
      action={
        <Link className={buttonClassName('accent')} href={href}>
          View
        </Link>
      }
      footer={
        <FirebasePostReactions
          boxId={item.boxId}
          postId={item.postId}
          initialSummary={item.interactions}
          presets={presets}
          active={active}
          commentsHref={`${href}#comments`}
        />
      }
    >
      {item.sections.map((section) => (
        <section key={section.key}>
          <h3 className={styles.sectionLabel}>
            {LIFE_UPDATE_SECTION_LABELS[section.key]}
          </h3>
          <p>{section.content}</p>
        </section>
      ))}
      <FirebaseMediaPhotos
        ids={item.mediaAssetIds}
        authorName={item.authorName}
      />
    </LifeUpdateCard>
  );
}

/** The local Firebase feed renders only capabilities backed by trusted services. */
export function FirebaseBoxFeed({
  items,
  active,
  presets,
  boxNames,
  empty = 'No posts yet. Be the first to share.',
}: {
  items: readonly FirebaseFeedItem[];
  active: boolean;
  presets: readonly string[];
  /** Box names by id, so Home can say where each item was shared. */
  boxNames?: ReadonlyMap<string, string>;
  empty?: string;
}) {
  if (!items.length) return <EmptyState>{empty}</EmptyState>;
  return (
    <ul className={styles.list} aria-label="Posts">
      {items.map((item) => {
        const boxName = boxNames?.get(item.boxId);
        return (
          <li key={`${item.kind}-${item.id}`}>
            {item.kind === 'post' ? (
              <FeedPost
                item={item}
                active={active}
                presets={presets}
                boxName={boxName}
              />
            ) : (
              <FeedLifeUpdate
                item={item}
                active={active}
                presets={presets}
                boxName={boxName}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

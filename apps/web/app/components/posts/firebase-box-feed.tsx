import { LocalTime } from '@/components/common/local-time';
import { PostActions } from '@/components/posts/post-actions';
import { FirebasePostReactions } from '@/components/interactions/firebase-post-reactions';
import { FirebaseMediaPhotos } from '@/components/media/firebase-media-photos';
import { ReportControl } from '@/components/moderation/report-control';
import styles from '@/components/posts/post-card.module.css';
import { Avatar, Badge, EmptyState } from '@/components/ui';
import type { FirebaseFeedItem } from '@/lib/server/firebase/data';
import { LIFE_UPDATE_SECTION_LABELS } from '@paldora/domain';
import Link from 'next/link';

/** The local Firebase feed renders only capabilities backed by trusted services. */
export function FirebaseBoxFeed({
  items,
  active,
  presets,
  showBox = false,
  empty = 'No posts yet. Be the first to share.',
}: {
  items: readonly FirebaseFeedItem[];
  active: boolean;
  presets: readonly string[];
  showBox?: boolean;
  empty?: string;
}) {
  if (!items.length) return <EmptyState>{empty}</EmptyState>;
  return (
    <ul className={styles.list} aria-label="Posts">
      {items.map((item) => (
        <li key={`${item.kind}-${item.id}`}>
          <article
            className={styles.card}
            aria-label={`${item.kind === 'post' ? 'Post' : 'Life Update'} by ${item.authorName}`}
          >
            <header className={styles.head}>
              <Avatar url={item.authorAvatarUrl} name={item.authorName} />
              <div className={styles.who}>
                <span className={styles.name}>{item.authorName}</span>
                <span className={styles.meta}>
                  {item.kind === 'post' ? (
                    <Link href={`/posts/${item.id}`}>
                      <LocalTime iso={item.createdAt} />
                    </Link>
                  ) : (
                    <Link href={`/life-updates/${item.id}?box=${item.boxId}`}>
                      <LocalTime iso={item.createdAt} />
                    </Link>
                  )}
                  {item.kind === 'post' && item.edited ? (
                    <span>edited</span>
                  ) : null}
                </span>
              </div>
              {item.kind === 'life_update' ? (
                <Badge tone="accent">Life Update</Badge>
              ) : null}
            </header>
            {showBox ? (
              <Link href={`/boxes/${item.boxId}`}>View Box</Link>
            ) : null}
            {item.kind === 'post' ? (
              <>
                <p className={styles.body}>{item.content}</p>
                <FirebaseMediaPhotos
                  ids={item.mediaAssetIds}
                  authorName={item.authorName}
                />
                <FirebasePostReactions
                  boxId={item.boxId}
                  postId={item.id}
                  initialSummary={item.interactions}
                  presets={presets}
                  active={active}
                />
                {item.canEdit && active ? (
                  <PostActions
                    postId={item.id}
                    content={item.content}
                    hasPhotos={item.mediaAssetIds.length > 0}
                  />
                ) : null}
                <ReportControl targetKind="post" targetId={item.id} />
              </>
            ) : (
              <>
                {item.sections.map((section) => (
                  <section key={section.key}>
                    <h3>{LIFE_UPDATE_SECTION_LABELS[section.key]}</h3>
                    <p className={styles.body}>{section.content}</p>
                  </section>
                ))}
                <FirebaseMediaPhotos
                  ids={item.mediaAssetIds}
                  authorName={item.authorName}
                />
                <FirebasePostReactions
                  boxId={item.boxId}
                  postId={item.postId}
                  initialSummary={item.interactions}
                  presets={presets}
                  active={active}
                  commentsHref={`/life-updates/${item.id}?box=${item.boxId}#comments`}
                />
              </>
            )}
          </article>
        </li>
      ))}
    </ul>
  );
}

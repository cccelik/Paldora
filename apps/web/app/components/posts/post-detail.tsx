import { LocalTime } from '@/components/common/local-time';
import { FirebasePostReactions } from '@/components/interactions/firebase-post-reactions';
import { FirebaseMediaPhotos } from '@/components/media/firebase-media-photos';
import { ReportControl } from '@/components/moderation/report-control';
import { PostActions } from '@/components/posts/post-actions';
import styles from '@/components/posts/post-detail.module.css';
import { Avatar } from '@/components/ui';
import type { FirebaseFeedItem } from '@/lib/server/firebase/data';
import { type ReactNode } from 'react';

type PostItem = Extract<FirebaseFeedItem, { kind: 'post' }>;

/**
 * Figma W04: the photo large on the left; the author, text, reactions and the
 * conversation (`children`) on the right. Without a photo it is one column.
 */
export function PostDetail({
  item,
  active,
  presets,
  children,
}: {
  item: PostItem;
  active: boolean;
  presets: readonly string[];
  /** The conversation. */
  children: ReactNode;
}) {
  const hasMedia = item.mediaAssetIds.length > 0;
  return (
    <div className={`${styles.detail} ${hasMedia ? styles.withMedia : ''}`}>
      {hasMedia ? (
        <div className={styles.media}>
          <FirebaseMediaPhotos
            ids={item.mediaAssetIds}
            authorName={item.authorName}
          />
        </div>
      ) : null}
      <div className={styles.side}>
        <article
          className={styles.post}
          aria-label={`Post by ${item.authorName}`}
        >
          <header className={styles.header}>
            <Avatar url={item.authorAvatarUrl} name={item.authorName} />
            <div>
              <p className={styles.name}>{item.authorName}</p>
              <p className={styles.when}>
                <LocalTime iso={item.createdAt} />
                {item.edited ? <> · edited</> : null}
              </p>
            </div>
          </header>
          <p className={styles.body}>{item.content}</p>
          <FirebasePostReactions
            boxId={item.boxId}
            postId={item.id}
            initialSummary={item.interactions}
            presets={presets}
            active={active}
          />
          <div className={styles.controls}>
            {item.canEdit && active ? (
              <PostActions
                postId={item.id}
                content={item.content}
                hasPhotos={hasMedia}
              />
            ) : null}
            <ReportControl targetKind="post" targetId={item.id} />
          </div>
        </article>
        {children}
      </div>
    </div>
  );
}

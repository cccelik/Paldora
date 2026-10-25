import {
  deleteLifeUpdateAction,
  deleteLifeUpdateAndLeaveAction,
} from '@/actions/life-updates';
import { LocalTime } from '@/components/common/local-time';
import { FirebasePostReactions } from '@/components/interactions/firebase-post-reactions';
import { FirebaseMediaPhotos } from '@/components/media/firebase-media-photos';
import { ConfirmAction } from '@/components/forms/confirm-action';
import styles from '@/components/posts/post-card.module.css';
import { Avatar, Badge, buttonClassName } from '@/components/ui';
import type { FirebaseLifeUpdateItem } from '@/lib/server/firebase/data';
import { LIFE_UPDATE_SECTION_LABELS } from '@paldora/domain';
import Link from 'next/link';

export function FirebaseLifeUpdateCard({
  update,
  ownPage = false,
  selectedBoxId,
  presets = [],
}: {
  update: FirebaseLifeUpdateItem;
  ownPage?: boolean;
  selectedBoxId?: string | undefined;
  presets?: readonly string[];
}) {
  const context =
    update.contexts.find((item) => item.boxId === selectedBoxId) ??
    update.contexts[0];
  return (
    <article
      className={styles.card}
      aria-label={`Life Update by ${update.authorName}`}
    >
      <header className={styles.head}>
        <Avatar url={update.authorAvatarUrl} name={update.authorName} />
        <div className={styles.who}>
          <span className={styles.name}>{update.authorName}</span>
          <span className={styles.meta}>
            {ownPage ? (
              <LocalTime iso={update.createdAt} />
            ) : (
              <Link href={`/life-updates/${update.id}`}>
                <LocalTime iso={update.createdAt} />
              </Link>
            )}
            {update.edited ? <span>edited</span> : null}
          </span>
        </div>
        <Badge tone="accent">Life Update</Badge>
        {update.audience === 'only_me' ? <Badge>Only me</Badge> : null}
      </header>
      {update.sections.map(({ key, content }) => (
        <section key={key}>
          <h3>{LIFE_UPDATE_SECTION_LABELS[key]}</h3>
          <p className={styles.body}>{content}</p>
        </section>
      ))}
      <FirebaseMediaPhotos
        ids={update.mediaAssetIds}
        authorName={update.authorName}
      />
      {update.contexts.length ? (
        <div className={styles.meta}>
          {update.contexts.map((context) => (
            <Link key={context.boxId} href={`/boxes/${context.boxId}`}>
              {context.boxName}
            </Link>
          ))}
        </div>
      ) : null}
      {context ? (
        <FirebasePostReactions
          boxId={context.boxId}
          postId={context.postId}
          initialSummary={context.interactions}
          presets={presets}
          active={context.canInteract}
          commentsHref={`/life-updates/${update.id}?box=${context.boxId}#comments`}
        />
      ) : null}
      {update.isOwner ? (
        <>
          {update.canEdit ? (
            <Link
              className={buttonClassName('secondary')}
              href={`/life-updates/${update.id}/edit`}
            >
              Edit Life Update
            </Link>
          ) : null}
          <ConfirmAction
            action={
              ownPage ? deleteLifeUpdateAndLeaveAction : deleteLifeUpdateAction
            }
            fields={{ lifeUpdateId: update.id }}
            label="Delete Life Update"
            prompt="Delete this Life Update from every Box?"
            confirmLabel="Yes, delete Life Update"
            pendingLabel="Deleting…"
          />
        </>
      ) : null}
    </article>
  );
}

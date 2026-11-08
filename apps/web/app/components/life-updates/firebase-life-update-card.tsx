import {
  deleteLifeUpdateAction,
  deleteLifeUpdateAndLeaveAction,
} from '@/actions/life-updates';
import { LocalTime } from '@/components/common/local-time';
import { ConfirmAction } from '@/components/forms/confirm-action';
import { FirebasePostReactions } from '@/components/interactions/firebase-post-reactions';
import { FirebaseMediaPhotos } from '@/components/media/firebase-media-photos';
import styles from '@/components/posts/post-card.module.css';
import { buttonClassName, Chip, LifeUpdateCard } from '@/components/ui';
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
  const when = <LocalTime iso={update.createdAt} />;
  return (
    <LifeUpdateCard
      ariaLabel={`Life Update by ${update.authorName}`}
      when={
        <>
          {ownPage ? (
            when
          ) : (
            <Link href={`/life-updates/${update.id}`}>{when}</Link>
          )}
          {update.edited ? <> · edited</> : null}
        </>
      }
      title={`${update.authorName}’s life update`}
      footer={
        context || update.isOwner ? (
          <div className={styles.footer}>
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
              <div className={styles.owner}>
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
                    ownPage
                      ? deleteLifeUpdateAndLeaveAction
                      : deleteLifeUpdateAction
                  }
                  fields={{ lifeUpdateId: update.id }}
                  label="Delete Life Update"
                  prompt="Delete this Life Update from every Box?"
                  confirmLabel="Yes, delete Life Update"
                  pendingLabel="Deleting…"
                />
              </div>
            ) : null}
          </div>
        ) : null
      }
    >
      <div className={styles.sections}>
        {update.sections.map(({ key, content }) => (
          <section key={key}>
            <h3 className={styles.sectionLabel}>
              {LIFE_UPDATE_SECTION_LABELS[key]}
            </h3>
            <p>{content}</p>
          </section>
        ))}
      </div>
      <FirebaseMediaPhotos
        ids={update.mediaAssetIds}
        authorName={update.authorName}
      />
      <div className={styles.contexts}>
        {update.audience === 'only_me' ? (
          <Chip icon="lock">Only me</Chip>
        ) : null}
        {update.contexts.map((box) => (
          <Link key={box.boxId} href={`/boxes/${box.boxId}`}>
            {box.boxName}
          </Link>
        ))}
      </div>
    </LifeUpdateCard>
  );
}

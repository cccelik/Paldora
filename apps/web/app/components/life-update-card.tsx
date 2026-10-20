import type { LifeUpdateView } from '@paldora/validation';
import { LocalTime } from './local-time';
import { PostInteractions } from './post-interactions';
import { PostPhotos } from './post-photos';
import { Avatar, Badge } from './ui';
import styles from './post-card.module.css';

/**
 * A Life Update in a feed: the shared content once, then one conversation
 * per Box the viewer is in (`contexts`; a Box feed has exactly one). This
 * is the minimal Phase 6 rendering; the tabbed card replaces it.
 */
export function LifeUpdateCard({
  lifeUpdate,
  presets,
}: {
  lifeUpdate: LifeUpdateView;
  /** The viewer's five reaction shortcuts. */
  presets: readonly string[];
}) {
  const { author } = lifeUpdate;
  return (
    <article
      className={styles.card}
      aria-label={`Life Update by ${author.displayName}`}
    >
      <header className={styles.head}>
        <Avatar url={author.avatarUrl} name={author.displayName} />
        <div className={styles.who}>
          <span className={styles.name}>{author.displayName}</span>
          <span className={styles.meta}>
            <span>Life Update</span>
            <LocalTime iso={lifeUpdate.createdAt} />
            {lifeUpdate.editedAt ? <span>edited</span> : null}
          </span>
        </div>
      </header>
      {lifeUpdate.sections.map((section) => (
        <section key={section.key} className={styles.section}>
          <h3 className={styles.sectionLabel}>{section.label}</h3>
          <p className={styles.body}>{section.content}</p>
        </section>
      ))}
      <PostPhotos photos={lifeUpdate.media} authorName={author.displayName} />
      {lifeUpdate.contexts.map((context) => (
        <section
          key={context.postId}
          className={styles.section}
          aria-label={`Conversation in ${context.box.name}`}
        >
          {lifeUpdate.contexts.length > 1 ? (
            <Badge>{context.box.name}</Badge>
          ) : null}
          <PostInteractions
            postId={context.postId}
            boxId={context.box.id}
            summary={context.interactions}
            presets={presets}
            commentsLink
          />
        </section>
      ))}
    </article>
  );
}

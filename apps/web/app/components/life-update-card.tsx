import type { LifeUpdateView } from '@paldora/validation';
import Link from 'next/link';
import type { Route } from 'next';
import { lifeUpdateHref } from '../lib/life-update-form';
import { LifeUpdateActions } from './life-update-actions';
import { LifeUpdateContexts } from './life-update-contexts';
import { LocalTime } from './local-time';
import { PostPhotos } from './post-photos';
import { Avatar, Badge } from './ui';
import postStyles from './post-card.module.css';
import styles from './life-update-card.module.css';

function LifeUpdateHeader({
  lifeUpdate,
  href,
  boxBadge,
}: {
  lifeUpdate: LifeUpdateView;
  href: string;
  /** The one Box shown, when it is not obvious from the page. */
  boxBadge?: { id: string; name: string } | undefined;
}) {
  const { author } = lifeUpdate;
  return (
    <header className={postStyles.head}>
      <Avatar url={author.avatarUrl} name={author.displayName} />
      <div className={postStyles.who}>
        <span className={postStyles.name}>{author.displayName}</span>
        <span className={postStyles.meta}>
          <Link href={href as Route}>
            <LocalTime iso={lifeUpdate.createdAt} />
          </Link>
          {lifeUpdate.editedAt ? <span>edited</span> : null}
        </span>
      </div>
      <span className={styles.badges}>
        <Badge tone="accent">Life Update</Badge>
        {lifeUpdate.audience === 'only_me' ? <Badge>Only me</Badge> : null}
        {boxBadge ? (
          <Link href={`/boxes/${boxBadge.id}`}>
            <Badge>{boxBadge.name}</Badge>
          </Link>
        ) : null}
      </span>
    </header>
  );
}

/** The written sections, in canonical order, as editorial headings. */
function LifeUpdateSections({
  sections,
}: {
  sections: LifeUpdateView['sections'];
}) {
  if (sections.length === 0) return null;
  return (
    <div className={styles.sections}>
      {sections.map((section) => (
        <section key={section.key} className={postStyles.section}>
          <h3 className={postStyles.sectionLabel}>{section.label}</h3>
          <p className={postStyles.body}>{section.content}</p>
        </section>
      ))}
    </div>
  );
}

/**
 * A Life Update: the shared sections and photos once, then one conversation
 * per Box the viewer is in (tabs when there are several; a Box feed has
 * exactly one). Only Me has no conversation at all. The author gets Edit
 * and Delete; Delete removes it from every Box.
 */
export function LifeUpdateCard({
  lifeUpdate,
  presets,
  viewerId,
  showBox = false,
  selectedBoxId,
  permalink = false,
}: {
  lifeUpdate: LifeUpdateView;
  /** The viewer's five reaction shortcuts. */
  presets: readonly string[];
  /** Lets the author delete even when every Box is archived (no edits). */
  viewerId?: string | undefined;
  /** Name the Box when a single conversation is shown outside its Box. */
  showBox?: boolean;
  /** The Box conversation to open first (a `?box=` link). */
  selectedBoxId?: string | undefined;
  /** On its own page: tabs follow the address and the thread is below. */
  permalink?: boolean;
}) {
  const { author, contexts } = lifeUpdate;
  const onlyMe = lifeUpdate.audience === 'only_me';
  const single = contexts.length === 1 ? contexts[0] : undefined;
  const href = lifeUpdateHref(lifeUpdate.id, {
    boxId: selectedBoxId ?? single?.box.id,
  });
  const isAuthor = viewerId ? author.id === viewerId : lifeUpdate.canEdit;
  return (
    <article
      className={`${postStyles.card} ${styles.card}`}
      aria-label={`Life Update by ${author.displayName}`}
    >
      <LifeUpdateHeader
        lifeUpdate={lifeUpdate}
        href={href}
        boxBadge={showBox ? single?.box : undefined}
      />
      <LifeUpdateSections sections={lifeUpdate.sections} />
      <PostPhotos photos={lifeUpdate.media} authorName={author.displayName} />
      {onlyMe ? (
        <p className={styles.private}>
          Only you can see this. It has no comments or reactions.
        </p>
      ) : (
        <LifeUpdateContexts
          lifeUpdateId={lifeUpdate.id}
          contexts={contexts}
          presets={presets}
          selectedBoxId={selectedBoxId}
          followUrl={permalink}
        />
      )}
      {isAuthor ? (
        <LifeUpdateActions
          lifeUpdateId={lifeUpdate.id}
          canEdit={lifeUpdate.canEdit}
          onlyMe={onlyMe}
          returnBoxId={selectedBoxId ?? single?.box.id}
          leaveAfterDelete={permalink}
        />
      ) : null}
    </article>
  );
}

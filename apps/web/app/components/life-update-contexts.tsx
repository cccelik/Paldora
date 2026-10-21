'use client';

import { type LifeUpdateContextView } from '@paldora/validation';
import { type Route } from 'next';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { lifeUpdateHref, nextTabIndex } from '../lib/life-update-form';
import styles from './life-update-card.module.css';
import { PostInteractions } from './post-interactions';
/**
 * One conversation per Box the viewer shares with the author, as tabs in
 * alphabetical order (the API's order). Each Box has its own comments and
 * reactions, so switching tabs remounts that Box's interactions. Arrow
 * keys, Home, and End move between tabs (roving tabindex).
 *
 * On a Life Update's own page (`followUrl`) a tab change also updates the
 * address, so the server renders that Box's comment thread below.
 */
export function LifeUpdateContexts({
  lifeUpdateId,
  contexts,
  presets,
  selectedBoxId,
  followUrl = false,
}: {
  lifeUpdateId: string;
  contexts: readonly LifeUpdateContextView[];
  presets: readonly string[];
  selectedBoxId?: string | undefined;
  followUrl?: boolean;
}) {
  const router = useRouter();
  const baseId = useId();
  const initial = Math.max(
    0,
    contexts.findIndex((context) => context.box.id === selectedBoxId),
  );
  const [index, setIndex] = useState(initial);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = contexts[Math.min(index, contexts.length - 1)];
  if (!current) return null;

  const select = (next: number) => {
    const context = contexts[next];
    if (!context) return;
    setIndex(next);
    if (followUrl) {
      router.replace(
        lifeUpdateHref(lifeUpdateId, { boxId: context.box.id }) as Route,
        { scroll: false },
      );
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const next = nextTabIndex(event.key, index, contexts.length);
    if (next === null) return;
    event.preventDefault();
    select(next);
    tabs.current[next]?.focus();
  };

  const tabId = (boxId: string) => `${baseId}-tab-${boxId}`;
  const panelId = `${baseId}-panel`;
  const interactions = (
    <PostInteractions
      key={current.postId}
      postId={current.postId}
      boxId={current.box.id}
      summary={current.interactions}
      presets={presets}
      commentsLink={!followUrl}
      commentsHref={`${lifeUpdateHref(lifeUpdateId, { boxId: current.box.id })}#comments`}
    />
  );

  if (contexts.length === 1) {
    return <div className={styles.single}>{interactions}</div>;
  }
  return (
    <div className={styles.contexts}>
      <div
        role="tablist"
        aria-label="Conversations by Box"
        className={styles.tabs}
      >
        {contexts.map((context, position) => {
          const selected = context === current;
          return (
            <button
              key={context.postId}
              ref={(element) => {
                tabs.current[position] = element;
              }}
              type="button"
              role="tab"
              id={tabId(context.box.id)}
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              className={styles.tab}
              onClick={() => select(position)}
              onKeyDown={onKeyDown}
            >
              {context.box.name}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={tabId(current.box.id)}
        className={styles.panel}
      >
        {interactions}
      </div>
    </div>
  );
}

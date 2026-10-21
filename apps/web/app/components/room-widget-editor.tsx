'use client';

import {
  ROOM_WIDGET_PLACEMENTS,
  type RoomLayout,
  type RoomWidgetPlacement,
} from '@paldora/domain';
import { type RoomView } from '@paldora/validation';
import { useState } from 'react';
import { updateRoomWidgetsAction } from '../actions/rooms';
import {
  moveItem,
  movedAnnouncement,
  widgetDrafts,
  widgetName,
  widgetSettings,
  type WidgetDraft,
} from '../lib/room-editor';
import {
  EditorSection,
  MoveButtons,
  RoomSaveButton,
  RoomSectionFeedback,
  RoomVersionField,
} from './room-editor-parts';
import styles from './room-editor.module.css';
import { HiddenFields } from './ui';
import { useMoveFocus } from './use-move-focus';
import { useRoomSave, type RoomSaveContext } from './use-room-save';
const placementLabels: Readonly<Record<RoomWidgetPlacement, string>> = {
  sidebar: 'Sidebar',
  main: 'Main column',
};

function WidgetRow({
  draft,
  index,
  total,
  layout,
  onChange,
  onMove,
}: {
  draft: WidgetDraft;
  index: number;
  total: number;
  layout: RoomLayout;
  onChange: (patch: Partial<WidgetDraft>) => void;
  onMove: (delta: -1 | 1) => void;
}) {
  const name = widgetName(draft);
  const id = `customize-widget-${draft.type}`;
  return (
    <li className={styles.row}>
      <span className={styles.rowName}>
        <span className={styles.rowPosition}>{index + 1}.</span> {name}
      </span>
      <label className={styles.inlineCheck}>
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(event) => onChange({ enabled: event.target.checked })}
        />
        Show {name}
      </label>
      {layout === 'two_column' ? (
        <span className={styles.inlineControl}>
          <label htmlFor={`${id}-placement`} className="visually-hidden">
            Column for {name}
          </label>
          <select
            id={`${id}-placement`}
            className={styles.select}
            value={draft.placement}
            onChange={(event) =>
              onChange({
                placement:
                  event.target.value === 'sidebar' ? 'sidebar' : 'main',
              })
            }
          >
            {ROOM_WIDGET_PLACEMENTS.map((placement) => (
              <option key={placement} value={placement}>
                {placementLabels[placement]}
              </option>
            ))}
          </select>
        </span>
      ) : null}
      <MoveButtons
        name={name}
        index={index}
        total={total}
        moveKey={draft.type}
        onMove={onMove}
      />
    </li>
  );
}

/**
 * The seven widgets: show or hide, pick a column, and set the order with
 * "Move up" / "Move down" (announced in a live region). Saving replaces
 * the whole list. Hidden widgets are listed here only, never to visitors.
 */
export function RoomWidgetEditor({
  room,
  layout,
  context,
}: {
  room: RoomView;
  /** The draft layout: columns only matter in two columns. */
  layout: RoomLayout;
  context: RoomSaveContext;
}) {
  const [drafts, setDrafts] = useState(() => widgetDrafts(room.widgets));
  const [state, action] = useRoomSave(
    updateRoomWidgetsAction,
    context,
    (saved) => setDrafts(widgetDrafts(saved.widgets)),
  );
  const focus = useMoveFocus();
  const lockedId = 'customize-widgets-locked';

  const move = (index: number, delta: -1 | 1) => {
    const next = moveItem(drafts, index, delta);
    const item = drafts[index];
    if (!next || !item) return;
    setDrafts(next);
    focus.moved(
      item.type,
      delta,
      movedAnnouncement(widgetName(item), index + delta, next.length),
    );
  };

  const change = (index: number, patch: Partial<WidgetDraft>) =>
    setDrafts((current) =>
      current.map((draft, at) =>
        at === index ? { ...draft, ...patch } : draft,
      ),
    );

  return (
    <EditorSection
      id="customize-widgets"
      title="Widgets"
      description={
        layout === 'two_column'
          ? 'Order counts within each column. Phones show every widget in one column, in this order.'
          : 'One column, in this order.'
      }
    >
      <form action={action} className={styles.form}>
        <RoomVersionField context={context} />
        <HiddenFields
          values={{ widgets: JSON.stringify(widgetSettings(drafts)) }}
        />
        <ol ref={focus.list} className={styles.rows} aria-label="Widget order">
          {drafts.map((draft, index) => (
            <WidgetRow
              key={draft.type}
              draft={draft}
              index={index}
              total={drafts.length}
              layout={layout}
              onChange={(patch) => change(index, patch)}
              onMove={(delta) => move(index, delta)}
            />
          ))}
        </ol>
        <p className="visually-hidden" role="status" aria-live="polite">
          {focus.announcement}
        </p>
        <RoomSectionFeedback
          state={state}
          context={context}
          lockedId={lockedId}
        />
        <div className={styles.actions}>
          <RoomSaveButton context={context} lockedId={lockedId}>
            Save widgets
          </RoomSaveButton>
        </div>
      </form>
    </EditorSection>
  );
}

'use client';

import { DEFAULT_ROOM } from '@paldora/domain';
import type { RoomView, UserSummary } from '@paldora/validation';
import { useCallback, useMemo, useState } from 'react';
import { RoomAboutForm } from './room-about-form';
import { RoomAppearanceForm } from './room-appearance-form';
import { RoomAudienceForm } from './room-audience-form';
import { RoomBannerEditor } from './room-banner-editor';
import { RoomCanvas, type RoomPreviews } from './room-canvas';
import { RoomTopFriendsEditor } from './room-top-friends-editor';
import { RoomWidgetEditor } from './room-widget-editor';
import type { RoomSaveContext } from './use-room-save';
import styles from './room-editor.module.css';

/**
 * The Room customizer. It holds the last saved Room and its version: every
 * section sends that version, and every save hands back the new one, so a
 * section never overwrites a newer save from another tab (that answer is
 * ROOM_UPDATE_STALE, which locks every section until a reload). Each
 * section keeps its own draft; only the appearance draft is shared, with
 * the live preview, which is the real `RoomCanvas` with the owner's saved
 * content and the draft style.
 */
export function RoomEditor({
  room,
  previews,
  friends,
  moreFriends,
}: {
  room: RoomView;
  previews: RoomPreviews;
  friends: readonly UserSummary[];
  moreFriends: boolean;
}) {
  const [saved, setSaved] = useState(room);
  const [stale, setStale] = useState(false);
  const [style, setStyle] = useState(room.style);

  const onSaved = useCallback((next: RoomView) => setSaved(next), []);
  const onStale = useCallback(() => setStale(true), []);
  const context = useMemo<RoomSaveContext>(
    () => ({ version: saved.updatedAt, stale, onSaved, onStale }),
    [saved.updatedAt, stale, onSaved, onStale],
  );
  const preview = useMemo(() => ({ ...saved, style }), [saved, style]);

  return (
    <div className={styles.layout}>
      <section
        className={styles.preview}
        aria-labelledby="customize-preview-title"
      >
        <h2 id="customize-preview-title" className={styles.sectionTitle}>
          Preview
        </h2>
        <p className={styles.sectionDetail}>
          Your saved Room with the appearance you are trying. Each visitor sees
          only what they can already see.
        </p>
        {/* A picture of the Room, not a second copy to use: not focusable,
            not read twice, and its links cannot take you off this page. */}
        <div className={styles.previewFrame} inert>
          <RoomCanvas room={preview} previews={previews} />
        </div>
      </section>
      <div className={styles.sections}>
        <RoomAppearanceForm
          draft={style}
          onDraft={setStyle}
          context={context}
        />
        <RoomAudienceForm
          saved={saved.visibility ?? DEFAULT_ROOM.visibility}
          context={context}
        />
        <RoomAboutForm room={room} context={context} />
        <RoomBannerEditor banner={saved.banner} context={context} />
        <RoomWidgetEditor room={room} layout={style.layout} context={context} />
        <RoomTopFriendsEditor
          room={room}
          friends={friends}
          moreFriends={moreFriends}
          context={context}
        />
      </div>
    </div>
  );
}

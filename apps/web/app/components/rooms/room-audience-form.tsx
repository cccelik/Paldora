'use client';

import { updateRoomAction } from '@/actions/rooms';
import styles from '@/components/rooms/room-audience-form.module.css';
import {
  EditorSection,
  RoomSaveButton,
  RoomSectionFeedback,
  RoomVersionField,
} from '@/components/rooms/room-editor-parts';
import {
  useRoomSave,
  type RoomSaveContext,
} from '@/components/rooms/use-room-save';
import { HiddenFields } from '@/components/ui';
import {
  ROOM_VISIBILITIES,
  ROOM_VISIBILITY_DESCRIPTIONS,
  ROOM_VISIBILITY_LABELS,
  type RoomVisibility,
} from '@paldora/domain';
import { useState } from 'react';
/** Who may visit: three nested audiences, each in plain words. */
export function RoomAudienceForm({
  saved,
  context,
}: {
  saved: RoomVisibility;
  context: RoomSaveContext;
}) {
  const [visibility, setVisibility] = useState(saved);
  const [state, action] = useRoomSave(updateRoomAction, context, (room) => {
    if (room.visibility) setVisibility(room.visibility);
  });
  const lockedId = 'customize-audience-locked';
  return (
    <EditorSection
      id="customize-audience"
      title="Who can visit"
      description="A block in either direction always hides your Room, whatever you choose here. Visitors only ever see posts and Life Updates they can already see."
    >
      <form action={action} className={styles.form}>
        <HiddenFields values={{ section: 'audience' }} />
        <RoomVersionField context={context} />
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Visible to</legend>
          {ROOM_VISIBILITIES.map((option) => (
            <label key={option} className={styles.option}>
              <input
                type="radio"
                name="visibility"
                value={option}
                checked={visibility === option}
                onChange={() => setVisibility(option)}
              />
              <span>
                <span className={styles.optionLabel}>
                  {ROOM_VISIBILITY_LABELS[option]}
                </span>
                <span className={styles.optionDetail}>
                  {ROOM_VISIBILITY_DESCRIPTIONS[option]}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        <RoomSectionFeedback
          state={state}
          context={context}
          lockedId={lockedId}
        />
        <div className={styles.actions}>
          <RoomSaveButton context={context} lockedId={lockedId}>
            Save audience
          </RoomSaveButton>
        </div>
      </form>
    </EditorSection>
  );
}

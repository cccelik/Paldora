'use client';

import {
  ROOM_CURRENTLY_MAX,
  ROOM_LOCATION_MAX,
  ROOM_MUSIC_TEXT_MAX,
  ROOM_MUSIC_URL_MAX,
} from '@paldora/domain';
import { normalizeMusicUrl, type RoomView } from '@paldora/validation';
import { useState } from 'react';
import { updateRoomAction } from '../actions/rooms';
import { musicLink } from '../lib/room-theme';
import {
  EditorSection,
  RoomSaveButton,
  RoomSectionFeedback,
  RoomVersionField,
} from './room-editor-parts';
import { TextAreaField, TextField } from './ui';
import { useRoomSave, type RoomSaveContext } from './use-room-save';
import styles from './room-editor.module.css';

interface AboutDraft {
  readonly location: string;
  readonly currently: string;
  readonly musicUrl: string;
  readonly musicTitle: string;
  readonly musicArtist: string;
}

const aboutDraft = (room: RoomView): AboutDraft => ({
  location: room.location ?? '',
  currently: room.currently ?? '',
  musicUrl: room.music?.url ?? '',
  musicTitle: room.music?.title ?? '',
  musicArtist: room.music?.artist ?? '',
});

/**
 * What the link check says right now: nothing for an empty field, the
 * reason it is refused, or how the card will look. The same shared check
 * (`normalizeMusicUrl`) runs again in the action, the API, and on render.
 */
function musicStatus(url: string): { ok: boolean; text: string } | null {
  if (url.trim() === '') return null;
  const normalized = normalizeMusicUrl(url);
  const link = normalized ? musicLink(normalized) : null;
  if (!link) {
    return {
      ok: false,
      text: 'Use a public https:// link, like https://music.example.com/track/1. Other kinds of links aren’t allowed.',
    };
  }
  return { ok: true, text: `Shows as ${link.host} · Opens another site` };
}

/** Location, "currently", and one song link (no embeds, no autoplay). */
export function RoomAboutForm({
  room,
  context,
}: {
  room: RoomView;
  context: RoomSaveContext;
}) {
  const [draft, setDraft] = useState(() => aboutDraft(room));
  const [state, action] = useRoomSave(updateRoomAction, context, (saved) =>
    setDraft(aboutDraft(saved)),
  );
  const change = (patch: Partial<AboutDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const music = musicStatus(draft.musicUrl);
  const lockedId = 'customize-about-locked';
  const musicStatusId = 'customize-music-url-status';
  return (
    <EditorSection
      id="customize-about"
      title="About"
      description="Plain text only. Leave a field empty to take it off your Room."
    >
      <form action={action} className={styles.form}>
        <input type="hidden" name="section" value="about" />
        <RoomVersionField context={context} />
        <TextField
          label="Location"
          id="customize-location"
          name="location"
          optional
          maxLength={ROOM_LOCATION_MAX}
          value={draft.location}
          onChange={(event) => change({ location: event.target.value })}
        />
        <TextAreaField
          label="Currently"
          id="customize-currently"
          name="currently"
          optional
          rows={2}
          maxLength={ROOM_CURRENTLY_MAX}
          value={draft.currently}
          onChange={(event) => change({ currently: event.target.value })}
          help={`What you’re up to. ${draft.currently.length} / ${ROOM_CURRENTLY_MAX}`}
        />
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>A song</legend>
          <TextField
            label="Link"
            id="customize-music-url"
            name="musicUrl"
            type="url"
            inputMode="url"
            optional
            maxLength={ROOM_MUSIC_URL_MAX}
            value={draft.musicUrl}
            onChange={(event) => change({ musicUrl: event.target.value })}
            aria-invalid={music?.ok === false}
            aria-describedby={musicStatusId}
          />
          <p
            id={musicStatusId}
            className={music?.ok === false ? styles.invalid : styles.hint}
            aria-live="polite"
          >
            {music?.text ??
              'An https:// link to the song. It opens on the other site; nothing plays here.'}
          </p>
          <TextField
            label="Title"
            id="customize-music-title"
            name="musicTitle"
            optional
            maxLength={ROOM_MUSIC_TEXT_MAX}
            value={draft.musicTitle}
            onChange={(event) => change({ musicTitle: event.target.value })}
          />
          <TextField
            label="Artist"
            id="customize-music-artist"
            name="musicArtist"
            optional
            maxLength={ROOM_MUSIC_TEXT_MAX}
            value={draft.musicArtist}
            onChange={(event) => change({ musicArtist: event.target.value })}
          />
        </fieldset>
        <RoomSectionFeedback
          state={state}
          context={context}
          lockedId={lockedId}
        />
        <div className={styles.actions}>
          <RoomSaveButton
            context={context}
            lockedId={lockedId}
            disabled={music?.ok === false}
            describedBy={music?.ok === false ? musicStatusId : undefined}
          >
            Save about
          </RoomSaveButton>
        </div>
      </form>
    </EditorSection>
  );
}

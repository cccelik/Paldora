'use client';

import {
  ROOM_THEME_PRESETS,
  roomThemeRegistry,
  type RoomThemePreset,
  type RoomView,
  type UpdateRoomInput,
} from '@paldora/domain';

const STYLE_OPTIONS = {
  accent: [
    'gold',
    'lavender',
    'ocean',
    'daisy',
    'pink',
    'emerald',
    'cyan',
    'crimson',
  ],
  background: [
    'theme',
    'paper',
    'midnight',
    'gradient',
    'scrapbook',
    'terminal',
  ],
  font: ['editorial', 'modern', 'rounded', 'mono', 'handwritten'],
  decorationPack: ['none', 'stars', 'flowers', 'stickers', 'tape', 'pixels'],
} as const;

type UpdateDraft = <Key extends keyof UpdateRoomInput>(
  key: Key,
  value: UpdateRoomInput[Key],
) => void;

export function RoomStyleForm({
  room,
  draft,
  busy,
  dirty,
  message,
  onUpdate,
  onThemeChange,
  onSubmit,
}: {
  room: RoomView;
  draft: UpdateRoomInput;
  busy: boolean;
  dirty: boolean;
  message: string | null;
  onUpdate: UpdateDraft;
  onThemeChange: (theme: RoomThemePreset) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="form-stack" onSubmit={onSubmit}>
      <h2>Room style</h2>
      <ThemeFields
        draft={draft}
        onThemeChange={onThemeChange}
        onUpdate={onUpdate}
        room={room}
      />
      <RoomCopyFields draft={draft} onUpdate={onUpdate} />
      <MusicFields draft={draft} onUpdate={onUpdate} />
      {message && (
        <p
          className={`form-notice ${message.includes('saved') ? 'success' : 'error'}`}
          role="status"
        >
          {message}
        </p>
      )}
      <button
        className="button-primary"
        disabled={busy || !dirty}
        type="submit"
      >
        {busy ? 'Saving…' : 'Save Room settings'}
      </button>
    </form>
  );
}

function ThemeFields({
  room,
  draft,
  onUpdate,
  onThemeChange,
}: {
  room: RoomView;
  draft: UpdateRoomInput;
  onUpdate: UpdateDraft;
  onThemeChange: (theme: RoomThemePreset) => void;
}) {
  return (
    <>
      <label>
        Theme preset
        <select
          onChange={(event) =>
            onThemeChange(event.target.value as RoomThemePreset)
          }
          value={draft.themePreset}
        >
          {ROOM_THEME_PRESETS.map((preset) => (
            <option key={preset} value={preset}>
              {roomThemeRegistry[preset].label}
            </option>
          ))}
        </select>
      </label>
      <div className="form-grid-two">
        <Select
          label="Visibility"
          onChange={(value) =>
            onUpdate('visibility', value as RoomView['visibility'])
          }
          options={['friends', 'members', 'hidden']}
          value={draft.visibility ?? room.visibility}
        />
        <Select
          label="Layout"
          onChange={(value) => onUpdate('layout', value as RoomView['layout'])}
          options={['two_column', 'single']}
          value={draft.layout ?? room.layout}
        />
        <Select
          label="Accent"
          onChange={(value) => onUpdate('accent', value)}
          options={[...STYLE_OPTIONS.accent]}
          value={draft.accent ?? room.accent}
        />
        <Select
          label="Background"
          onChange={(value) => onUpdate('background', value)}
          options={[...STYLE_OPTIONS.background]}
          value={draft.background ?? room.background}
        />
        <Select
          label="Font"
          onChange={(value) => onUpdate('font', value)}
          options={[...STYLE_OPTIONS.font]}
          value={draft.font ?? room.font}
        />
        <Select
          label="Decorations"
          onChange={(value) => onUpdate('decorationPack', value)}
          options={[...STYLE_OPTIONS.decorationPack]}
          value={draft.decorationPack ?? room.decorationPack}
        />
      </div>
      <label className="checkbox-row">
        <input
          checked={draft.sparkles ?? false}
          onChange={(event) => onUpdate('sparkles', event.target.checked)}
          type="checkbox"
        />
        Enable subtle sparkle motion
      </label>
    </>
  );
}

function RoomCopyFields({
  draft,
  onUpdate,
}: {
  draft: UpdateRoomInput;
  onUpdate: UpdateDraft;
}) {
  return (
    <>
      <label>
        Location
        <input
          maxLength={120}
          onChange={(event) => onUpdate('location', event.target.value || null)}
          value={draft.location ?? ''}
        />
      </label>
      <label>
        Currently
        <textarea
          maxLength={240}
          onChange={(event) =>
            onUpdate('currently', event.target.value || null)
          }
          rows={3}
          value={draft.currently ?? ''}
        />
      </label>
    </>
  );
}

function MusicFields({
  draft,
  onUpdate,
}: {
  draft: UpdateRoomInput;
  onUpdate: UpdateDraft;
}) {
  return (
    <fieldset>
      <legend>Music link</legend>
      <label>
        HTTPS link
        <input
          onChange={(event) =>
            onUpdate(
              'music',
              event.target.value
                ? {
                    url: event.target.value,
                    title: draft.music?.title ?? null,
                    artist: draft.music?.artist ?? null,
                  }
                : null,
            )
          }
          placeholder="https://…"
          type="url"
          value={draft.music?.url ?? ''}
        />
      </label>
      <label>
        Title
        <input
          maxLength={120}
          onChange={(event) =>
            draft.music &&
            onUpdate('music', {
              ...draft.music,
              title: event.target.value || null,
            })
          }
          value={draft.music?.title ?? ''}
        />
      </label>
      <label>
        Artist
        <input
          maxLength={120}
          onChange={(event) =>
            draft.music &&
            onUpdate('music', {
              ...draft.music,
              artist: event.target.value || null,
            })
          }
          value={draft.music?.artist ?? ''}
        />
      </label>
    </fieldset>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <select onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option.replaceAll('_', ' ')}
          </option>
        ))}
      </select>
    </label>
  );
}

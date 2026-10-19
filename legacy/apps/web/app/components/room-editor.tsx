'use client';

import {
  roomThemeRegistry,
  type Friendship,
  type RoomThemePreset,
  type RoomView,
  type UpdateRoomInput,
} from '@paldora/domain';
import { useEffect, useState } from 'react';
import { createBrowserApiClient } from '../lib/browser-api';
import { RoomBannerUploader } from './room-banner-uploader';
import { RoomCanvas } from './room-canvas';
import { RoomStyleForm } from './room-style-form';
import { RoomTopFriendsEditor } from './room-top-friends-editor';
import { RoomWidgetEditor } from './room-widget-editor';

const emptyPosts = { items: [], nextCursor: null };
const emptyLifeUpdates = { items: [], nextCursor: null };
const emptyGallery = { items: [], nextCursor: null };
const emptyMemories = { items: [], nextCursor: null };

export function RoomEditor({
  initialRoom,
  friends,
}: {
  initialRoom: RoomView;
  friends: Friendship[];
}) {
  const [room, setRoom] = useState(initialRoom);
  const [draft, setDraft] = useState(() => roomInput(initialRoom));
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useUnsavedChangesWarning(dirty);

  function update<Key extends keyof UpdateRoomInput>(
    key: Key,
    value: UpdateRoomInput[Key],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setMessage(null);
  }

  function chooseTheme(themePreset: RoomThemePreset) {
    setDraft((current) => ({
      ...current,
      themePreset,
      ...roomThemeRegistry[themePreset].defaults,
    }));
    setDirty(true);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const saved = await createBrowserApiClient().updateRoom({
        ...draft,
        expectedUpdatedAt: room.updatedAt,
      });
      setRoom(saved);
      setDraft(roomInput(saved));
      setDirty(false);
      setMessage('Room settings saved.');
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const previewRoom: RoomView = {
    ...room,
    ...draft,
    music: draft.music === undefined ? room.music : draft.music,
  };

  return (
    <div className="room-editor-shell">
      <aside className="room-editor-controls">
        <RoomStyleForm
          busy={busy}
          dirty={dirty}
          draft={draft}
          message={message}
          onSubmit={(event) => void save(event)}
          onThemeChange={chooseTheme}
          onUpdate={update}
          room={room}
        />
        <RoomBannerUploader onChange={setRoom} room={room} />
        <RoomWidgetEditor onChange={setRoom} room={room} />
        <RoomTopFriendsEditor
          friends={friends}
          onChange={setRoom}
          room={room}
        />
      </aside>
      <RoomPreview
        device={device}
        onDeviceChange={setDevice}
        room={previewRoom}
      />
    </div>
  );
}

function RoomPreview({
  room,
  device,
  onDeviceChange,
}: {
  room: RoomView;
  device: 'desktop' | 'mobile';
  onDeviceChange: (device: 'desktop' | 'mobile') => void;
}) {
  return (
    <section className="room-editor-preview">
      <div className="room-preview-toolbar">
        <strong>Live preview</strong>
        <div>
          <button
            aria-pressed={device === 'desktop'}
            onClick={() => onDeviceChange('desktop')}
            type="button"
          >
            Desktop
          </button>
          <button
            aria-pressed={device === 'mobile'}
            onClick={() => onDeviceChange('mobile')}
            type="button"
          >
            Mobile
          </button>
        </div>
      </div>
      <div className={`room-preview-frame ${device}`}>
        <RoomCanvas
          gallery={emptyGallery}
          lifeUpdates={emptyLifeUpdates}
          memories={emptyMemories}
          posts={emptyPosts}
          room={room}
        />
      </div>
    </section>
  );
}

function useUnsavedChangesWarning(dirty: boolean) {
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
}

function roomInput(room: RoomView): UpdateRoomInput {
  return {
    visibility: room.visibility,
    themePreset: room.themePreset,
    layout: room.layout,
    accent: room.accent,
    background: room.background,
    font: room.font,
    decorationPack: room.decorationPack,
    sparkles: room.sparkles,
    location: room.location,
    currently: room.currently,
    music: room.music,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Room settings could not be saved.';
}

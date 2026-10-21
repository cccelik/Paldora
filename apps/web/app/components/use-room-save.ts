'use client';

import { type RoomView } from '@paldora/validation';
import { useActionState } from 'react';
import {
  idleResult,
  type ActionOutcome,
  type ActionResult,
} from '../lib/action-result';
export const ROOM_STALE_CODE = 'ROOM_UPDATE_STALE';

/**
 * What every customizer section shares with the editor: the version to send
 * (`expectedUpdatedAt`), whether another save made it stale, and what to do
 * with an answer.
 */
export interface RoomSaveContext {
  readonly version: string | null;
  readonly stale: boolean;
  readonly onSaved: (room: RoomView) => void;
  readonly onStale: () => void;
}

type RoomFormAction = (
  previous: ActionResult<RoomView>,
  formData: FormData,
) => Promise<ActionResult<RoomView>>;

/** Hands a Room write's answer to the editor (and to the section). */
export function reportRoomSave(
  result: ActionOutcome<RoomView>,
  context: RoomSaveContext,
  onOwnSave?: (room: RoomView) => void,
): void {
  if (result.status === 'success') {
    context.onSaved(result.data);
    onOwnSave?.(result.data);
  } else if (result.code === ROOM_STALE_CODE) {
    context.onStale();
  }
}

/**
 * `useActionState` for one customizer section. A success updates the
 * editor's saved Room and version; ROOM_UPDATE_STALE marks the editor
 * stale, so every section asks for a reload instead of saving again.
 */
export function useRoomSave(
  action: RoomFormAction,
  context: RoomSaveContext,
  onOwnSave?: (room: RoomView) => void,
) {
  return useActionState<ActionResult<RoomView>, FormData>(
    async (previous, formData) => {
      const result = await action(previous, formData);
      if (result.status !== 'idle') reportRoomSave(result, context, onOwnSave);
      return result;
    },
    idleResult,
  );
}

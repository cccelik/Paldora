import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { rooms, type DatabaseTransaction } from '@paldora/database';
import {
  isSafeMusicUrl,
  type RoomView,
  type UpdateRoomInput,
} from '@paldora/validation';
import { eq } from 'drizzle-orm';
import { defineError } from '../../platform/http/api-error.js';
import { claimBanner, retireBanner } from '../records/room-banner.js';
import type { RoomState } from '../records/room-records.js';
import { settingsChanges } from '../records/room-settings.js';
import { RoomWriteService } from './room-write.service.js';

const unsafeMusic = defineError(
  HttpStatus.BAD_REQUEST,
  'VALIDATION_FAILED',
  'music.url: Use a public https:// link.',
);

/**
 * `PATCH /me/room`: a partial change of the style, audience, profile text,
 * music card, and banner (`bannerMediaId`: a value attaches a ready upload
 * of yours, null removes it; the previous banner is retired in the same
 * transaction).
 */
@Injectable()
export class RoomUpdateService {
  public constructor(
    @Inject(RoomWriteService) private readonly writer: RoomWriteService,
  ) {}

  public update(userId: string, input: UpdateRoomInput): Promise<RoomView> {
    return this.writer.write(userId, input.expectedUpdatedAt, {
      unchanged: (_transaction, state) =>
        Promise.resolve(
          Object.keys(settingsChanges(input, state.settings)).length === 0,
        ),
      apply: (transaction, state) =>
        this.apply(transaction, userId, input, state),
    });
  }

  private async apply(
    transaction: DatabaseTransaction,
    userId: string,
    input: UpdateRoomInput,
    state: RoomState,
  ): Promise<void> {
    const changes = settingsChanges(input, state.settings);
    // Re-checked here, not only at the edge: the stored link must always
    // pass the same rule the web render path uses.
    if (changes.musicUrl && !isSafeMusicUrl(changes.musicUrl)) {
      throw unsafeMusic();
    }
    const bannerChanged = changes.bannerMediaId !== undefined;
    if (bannerChanged && changes.bannerMediaId !== null) {
      await claimBanner(transaction, userId, changes.bannerMediaId);
    }
    await transaction
      .update(rooms)
      .set(changes)
      .where(eq(rooms.userId, userId));
    const previous = state.settings.bannerMediaId;
    if (bannerChanged && previous !== null) {
      await retireBanner(transaction, previous);
    }
  }
}

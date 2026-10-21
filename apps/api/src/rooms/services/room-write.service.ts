import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  profiles,
  type DatabaseTransaction,
  type PaldoraDatabase,
} from '@paldora/database';
import type { RoomView } from '@paldora/validation';
import { and, eq, isNotNull } from 'drizzle-orm';
import { mediaNotFound } from '../../media/media-errors.js';
import { ApiError } from '../../platform/http/api-error.js';
import {
  isForeignKeyViolation,
  isTriggerViolation,
  isUniqueViolation,
} from '../../platform/db/database-errors.js';
import { DATABASE } from '../../platform/config/tokens.js';
import { roomNotFound, topFriendNotEligible } from '../room-errors.js';
import {
  assertFresh,
  createRoom,
  lockRoom,
  type RoomState,
} from '../records/room-records.js';
import { RoomViewService } from './room-view.service.js';

/** One section's change, run inside the Room write protocol. */
export interface RoomWriteStep {
  /**
   * True when the request would leave the Room exactly as it is. Such a
   * request succeeds with the current Room and issues no UPDATE (which
   * would move the version), so a retry after a lost response is never a
   * false conflict, whatever `expectedUpdatedAt` it carries.
   */
  unchanged(
    transaction: DatabaseTransaction,
    state: RoomState,
  ): Promise<boolean>;
  /** Writes the change. The Room row exists and is locked. */
  apply(transaction: DatabaseTransaction, state: RoomState): Promise<void>;
}

const invalid = (message: string) =>
  new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', message);

/**
 * The database is the final authority; its named rules become the public
 * errors the plan lists (slice 2 notes). Anything else propagates.
 */
export function mapRoomWriteError(error: unknown): never {
  if (isTriggerViolation(error, 'top_friend_not_eligible')) {
    throw topFriendNotEligible();
  }
  if (isTriggerViolation(error, 'top_friend_position_out_of_range')) {
    throw invalid('userIds: Choose no more Top Friends than the size.');
  }
  if (isTriggerViolation(error, 'room_widgets_incomplete')) {
    throw invalid('widgets: List all seven widgets.');
  }
  if (
    isUniqueViolation(error, 'rooms_banner_media_unique') ||
    isForeignKeyViolation(error, 'rooms_banner_media_fk')
  ) {
    throw mediaNotFound();
  }
  throw error;
}

/**
 * The one write protocol for every Room section (settings, banner,
 * widgets, Top Friends), so they share one version and serialize on one
 * row lock:
 *
 * 1. Lock the Room row (or learn there is none: the defaults, version null).
 * 2. A request equal to the stored state is a no-op success.
 * 3. `expectedUpdatedAt` must equal the stored version exactly
 *    (ROOM_UPDATE_STALE otherwise).
 * 4. The first real change creates the row (rows are lazy, reads never
 *    write), then the step writes and the trigger bumps `updated_at`.
 *
 * No network I/O happens inside the transaction; the response is built
 * (and signed) after commit.
 */
@Injectable()
export class RoomWriteService {
  public constructor(
    @Inject(DATABASE) private readonly database: PaldoraDatabase,
    @Inject(RoomViewService) private readonly views: RoomViewService,
  ) {}

  public async write(
    userId: string,
    expectedUpdatedAt: string | null,
    step: RoomWriteStep,
  ): Promise<RoomView> {
    await this.database
      .transaction(async (transaction) => {
        await assertHasUsername(transaction, userId);
        const { state, exists } = await lockRoom(transaction, userId);
        if (await step.unchanged(transaction, state)) return;
        assertFresh(state.version, expectedUpdatedAt);
        if (!exists) await createRoom(transaction, userId);
        await step.apply(transaction, state);
      })
      .catch(mapRoomWriteError);
    return this.views.forOwner(userId);
  }
}

/** A Room lives at `/rooms/{username}`: none until onboarding names it. */
async function assertHasUsername(
  transaction: DatabaseTransaction,
  userId: string,
): Promise<void> {
  const [profile] = await transaction
    .select({ userId: profiles.userId })
    .from(profiles)
    .where(and(eq(profiles.userId, userId), isNotNull(profiles.username)));
  if (!profile) throw roomNotFound();
}

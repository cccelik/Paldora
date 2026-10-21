import { Inject, Injectable } from '@nestjs/common';
import { roomWidgets, rooms } from '@paldora/database';
import type { RoomWidgetSetting } from '@paldora/domain';
import type { RoomView, UpdateRoomWidgetsInput } from '@paldora/validation';
import { eq, sql } from 'drizzle-orm';
import { storedWidgets } from '../records/room-records.js';
import { orderedWidgets } from '../records/room-views.js';
import { RoomWriteService } from './room-write.service.js';

const keyOf = (widget: RoomWidgetSetting) =>
  `${widget.type}:${widget.placement}:${widget.position}:${widget.enabled}`;

/** Same seven widgets with the same placement, position, and state. Pure. */
export function sameWidgets(
  first: readonly RoomWidgetSetting[],
  second: readonly RoomWidgetSetting[],
): boolean {
  const left = orderedWidgets(first).map(keyOf);
  const right = orderedWidgets(second).map(keyOf);
  return (
    left.length === right.length &&
    left.every((key, index) => key === right[index])
  );
}

/**
 * `PUT /me/room/widgets`: replaces all seven rows (delete, then insert, so
 * the position index never trips mid-statement) under the Room lock, and
 * moves the Room's version. The deferred trigger checks "0 or 7" at commit.
 */
@Injectable()
export class RoomWidgetService {
  public constructor(
    @Inject(RoomWriteService) private readonly writer: RoomWriteService,
  ) {}

  public replace(
    userId: string,
    input: UpdateRoomWidgetsInput,
  ): Promise<RoomView> {
    return this.writer.write(userId, input.expectedUpdatedAt, {
      unchanged: async (transaction) =>
        sameWidgets(await storedWidgets(transaction, userId), input.widgets),
      apply: async (transaction) => {
        await transaction
          .delete(roomWidgets)
          .where(eq(roomWidgets.roomUserId, userId));
        await transaction.insert(roomWidgets).values(
          input.widgets.map((widget) => ({
            roomUserId: userId,
            widgetType: widget.type,
            placement: widget.placement,
            position: widget.position,
            enabled: widget.enabled,
          })),
        );
        // Any UPDATE moves the version (the rooms_touch trigger sets it).
        await transaction
          .update(rooms)
          .set({ updatedAt: sql`now()` })
          .where(eq(rooms.userId, userId));
      },
    });
  }
}

import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { ApiEnvironment } from '@paldora/config';
import {
  roomCustomizations,
  roomCustomWidgets,
  rooms,
  type PaldoraDatabase,
} from '@paldora/database';
import {
  compileRoomCss,
  compileRoomHtml,
  widgetDocument,
  PERSONALIZATION_POLICY_VERSION as POLICY,
} from '@paldora/personalization';
import type {
  PersonalizationSource,
  RenderedPersonalization,
  UpdatePersonalizationInput,
} from '@paldora/validation';
import { asc, eq, sql } from 'drizzle-orm';
import { API_ENVIRONMENT, DATABASE } from '../../platform/config/tokens.js';
import { ApiError } from '../../platform/http/api-error.js';
import { RoomAccessService } from './room-access.service.js';
import { RoomWriteService } from './room-write.service.js';

const invalid = () =>
  new ApiError(
    HttpStatus.BAD_REQUEST,
    'VALIDATION_FAILED',
    'Personalization is unavailable or uses unsupported syntax.',
  );
@Injectable()
export class RoomPersonalizationService {
  public constructor(
    @Inject(DATABASE) private readonly db: PaldoraDatabase,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
    @Inject(RoomAccessService) private readonly access: RoomAccessService,
    @Inject(RoomWriteService) private readonly writer: RoomWriteService,
  ) {}
  private async stored(userId: string) {
    const [css, widgets] = await Promise.all([
      this.db
        .select()
        .from(roomCustomizations)
        .where(eq(roomCustomizations.roomUserId, userId)),
      this.db
        .select()
        .from(roomCustomWidgets)
        .where(eq(roomCustomWidgets.roomUserId, userId))
        .orderBy(asc(roomCustomWidgets.position)),
    ]);
    return { css: css[0], widgets };
  }
  public async source(userId: string): Promise<PersonalizationSource> {
    await this.access.own(userId);
    const stored = await this.stored(userId);
    return {
      cssSource: stored.css?.cssSource ?? '',
      widgets: stored.widgets.map(({ title, source }) => ({ title, source })),
      cssEnabled: this.environment.ROOM_CUSTOM_CSS_ENABLED,
      widgetsEnabled: this.environment.ROOM_CUSTOM_WIDGETS_ENABLED,
    };
  }
  public async rendered(
    viewerId: string,
    username: string,
  ): Promise<RenderedPersonalization> {
    const room = await this.access.resolve(viewerId, username);
    const stored = await this.stored(room.owner.id);
    let css = '';
    const widgets: RenderedPersonalization['widgets'] = [];
    if (
      this.environment.ROOM_CUSTOM_CSS_ENABLED &&
      stored.css?.policyVersion === POLICY
    ) {
      try {
        css = compileRoomCss(stored.css.cssSource, room.owner.id);
      } catch {
        /* Fail closed on obsolete or corrupt persisted sources. */
      }
    }
    if (this.environment.ROOM_CUSTOM_WIDGETS_ENABLED) {
      for (const widget of stored.widgets) {
        if (widget.policyVersion !== POLICY) continue;
        try {
          widgets.push({
            title: widget.title,
            document: widgetDocument(compileRoomHtml(widget.source)),
          });
        } catch {
          /* Token Room remains usable. */
        }
      }
    }
    return { css, widgets };
  }
  public async replace(userId: string, input: UpdatePersonalizationInput) {
    await this.access.own(userId);
    const previous = await this.source(userId);
    if (
      (!previous.cssEnabled && input.cssSource !== previous.cssSource) ||
      (!previous.widgetsEnabled &&
        JSON.stringify(input.widgets) !== JSON.stringify(previous.widgets))
    )
      throw invalid();
    try {
      if (previous.cssEnabled) compileRoomCss(input.cssSource, userId);
      if (previous.widgetsEnabled)
        input.widgets.forEach((widget) => compileRoomHtml(widget.source));
    } catch {
      throw invalid();
    }
    return this.writer.write(userId, input.expectedUpdatedAt, {
      unchanged: async (tx) => {
        const [css] = await tx
          .select()
          .from(roomCustomizations)
          .where(eq(roomCustomizations.roomUserId, userId));
        const widgets = await tx
          .select()
          .from(roomCustomWidgets)
          .where(eq(roomCustomWidgets.roomUserId, userId))
          .orderBy(asc(roomCustomWidgets.position));
        return (
          (!previous.cssEnabled ||
            ((css?.cssSource ?? '') === input.cssSource &&
              (css === undefined || css.policyVersion === POLICY))) &&
          (!previous.widgetsEnabled ||
            (JSON.stringify(
              widgets.map(({ title, source }) => ({ title, source })),
            ) === JSON.stringify(input.widgets) &&
              widgets.every((widget) => widget.policyVersion === POLICY)))
        );
      },
      apply: async (tx) => {
        if (previous.cssEnabled) {
          await tx
            .delete(roomCustomizations)
            .where(eq(roomCustomizations.roomUserId, userId));
          if (input.cssSource)
            await tx.insert(roomCustomizations).values({
              roomUserId: userId,
              policyVersion: POLICY,
              cssSource: input.cssSource,
            });
        }
        if (previous.widgetsEnabled) {
          await tx
            .delete(roomCustomWidgets)
            .where(eq(roomCustomWidgets.roomUserId, userId));
          if (input.widgets.length)
            await tx.insert(roomCustomWidgets).values(
              input.widgets.map((widget, position) => ({
                ...widget,
                roomUserId: userId,
                position,
                policyVersion: POLICY,
              })),
            );
        }
        await tx
          .update(rooms)
          .set({ updatedAt: sql`now()` })
          .where(eq(rooms.userId, userId));
      },
    });
  }
}

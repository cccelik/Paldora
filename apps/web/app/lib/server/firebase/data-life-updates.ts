import { ApiClientError } from '@/lib/server/web-data-error';
import { LIFE_UPDATE_SECTION_KEYS } from '@paldora/domain';
import {
  NativeLifeUpdateError,
  NativeHomeFeed,
  type NativeLifeUpdates,
} from '@paldora/firebase-trusted';
import { type LifeUpdateChanges } from '@paldora/validation';
import { unavailable, iso, type FirebaseLifeUpdateItem } from './data-views';
import type { WebDataContext } from './data-context';
import 'server-only';

/** Life Updates. */
export class LifeUpdatesData {
  public constructor(private readonly ctx: WebDataContext) {}

  private async lifeUpdateItem(
    update: Awaited<ReturnType<NativeLifeUpdates['get']>>,
  ): Promise<FirebaseLifeUpdateItem> {
    return {
      id: update.id,
      authorName: await this.ctx.authorName(update.authorUid),
      authorAvatarUrl: await this.ctx.authorAvatarUrl(update.authorUid),
      mediaAssetIds: update.mediaAssetIds,
      audience: update.audience,
      sections: LIFE_UPDATE_SECTION_KEYS.flatMap((key) =>
        update.sections[key] ? [{ key, content: update.sections[key] }] : [],
      ),
      createdAt: iso(update.createdAt),
      edited: update.updatedAt > update.createdAt,
      canEdit: update.canEdit,
      isOwner: update.authorUid === this.ctx.uid,
      contexts: await Promise.all(
        update.contexts.map(
          async ({ boxId, boxName, postId, canInteract }) => ({
            boxId,
            boxName,
            postId,
            canInteract,
            interactions: await this.ctx.summary(boxId, postId),
          }),
        ),
      ),
    };
  }

  public async myLifeUpdates(cursor?: string) {
    try {
      const page = await this.ctx.lifeUpdatesService.listMine(
        this.ctx.uid,
        cursor,
      );
      return {
        items: await Promise.all(
          page.items.map((item) => this.lifeUpdateItem(item)),
        ),
        nextCursor: page.nextCursor,
      };
    } catch (error) {
      if (
        error instanceof NativeLifeUpdateError &&
        error.code === 'UNAVAILABLE'
      )
        throw unavailable('LIFE_UPDATE_NOT_FOUND');
      throw error;
    }
  }

  public async lifeUpdate(id: string, scopeBoxId?: string) {
    try {
      return await this.lifeUpdateItem(
        await this.ctx.lifeUpdatesService.get(id, this.ctx.uid, scopeBoxId),
      );
    } catch (error) {
      if (
        error instanceof NativeLifeUpdateError &&
        error.code === 'UNAVAILABLE'
      )
        throw unavailable('LIFE_UPDATE_NOT_FOUND');
      throw error;
    }
  }

  public async createLifeUpdate(input: unknown) {
    try {
      const id = await this.ctx.lifeUpdatesService.create(this.ctx.uid, input);
      const contexts = (await this.ctx.lifeUpdatesService.get(id, this.ctx.uid))
        .contexts;
      await Promise.all(
        contexts.map((context) =>
          this.ctx.homeFeedService
            .processOnce(NativeHomeFeed.publishJobId(context.postId))
            .catch(() => undefined),
        ),
      );
      return { id };
    } catch (error) {
      if (
        error instanceof NativeLifeUpdateError &&
        error.code === 'UNAVAILABLE'
      )
        throw unavailable('BOX_NOT_FOUND');
      if (error instanceof NativeLifeUpdateError && error.code === 'INVALID')
        throw new ApiClientError(
          400,
          'VALIDATION_FAILED',
          'Check this Life Update and try again.',
          null,
        );
      throw error;
    }
  }

  public async deleteLifeUpdate(id: string) {
    try {
      const current = await this.ctx.lifeUpdatesService.get(id, this.ctx.uid);
      const mediaIds = await this.ctx.lifeUpdatesService.remove(
        id,
        this.ctx.uid,
      );
      await Promise.all(
        mediaIds.map((mediaId) => this.ctx.mediaService.retire(mediaId)),
      );
      await Promise.all(
        current.contexts.map((context) =>
          this.ctx.drainMediaPostCleanup(context.postId),
        ),
      );
    } catch (error) {
      if (
        error instanceof NativeLifeUpdateError &&
        error.code === 'UNAVAILABLE'
      )
        throw unavailable('LIFE_UPDATE_NOT_FOUND');
      throw error;
    }
  }

  public async editLifeUpdate(id: string, changes: LifeUpdateChanges) {
    try {
      const removed = await this.ctx.lifeUpdatesService.edit(
        id,
        this.ctx.uid,
        changes,
      );
      await Promise.all(
        removed.map((mediaId) => this.ctx.mediaService.retire(mediaId)),
      );
      return { id };
    } catch (error) {
      if (
        error instanceof NativeLifeUpdateError &&
        error.code === 'UNAVAILABLE'
      )
        throw unavailable('LIFE_UPDATE_NOT_FOUND');
      if (error instanceof NativeLifeUpdateError && error.code === 'INVALID')
        throw new ApiClientError(
          400,
          'VALIDATION_FAILED',
          'Check this Life Update and try again.',
          null,
        );
      throw error;
    }
  }
}

import { ApiClientError, type PageOptions } from '@/lib/server/web-data-error';
import {
  NativeMediaError,
  type NativeNotifications,
} from '@paldora/firebase-trusted';
import { type NotificationView } from '@paldora/validation';
import { firebaseLocalWebUrl } from './mode';
import { iso } from './data-views';
import type { WebDataContext } from './data-context';
import 'server-only';

/** Notifications and media uploads. */
export class NotificationsMediaData {
  public constructor(private readonly ctx: WebDataContext) {}

  private async notificationView(
    item: Awaited<ReturnType<NativeNotifications['get']>>,
  ): Promise<NotificationView> {
    const box = await this.ctx.box(item.boxId);
    return {
      id: item.id,
      type: item.type,
      actor: await this.ctx.personView(item.actorUid),
      postId: item.postId,
      lifeUpdateId: item.lifeUpdateId,
      commentId: item.commentId,
      box: { id: box.id, name: box.name },
      reaction: item.reactionKind ? { kind: item.reactionKind } : null,
      read: item.read,
      createdAt: iso(item.createdAt),
    };
  }

  public async notifications(page: PageOptions = {}) {
    await this.ctx.notificationsService.processPending();
    const result = await this.ctx.notificationsService.list(
      this.ctx.uid,
      page.cursor,
      page.limit ?? 20,
    );
    const items = await Promise.all(
      result.items.map((item) => this.notificationView(item)),
    );
    return {
      items,
      nextCursor: result.nextCursor,
      unreadCount: await this.ctx.notificationsService.unreadCount(
        this.ctx.uid,
      ),
    };
  }

  public async unreadNotificationCount() {
    await this.ctx.notificationsService.processPending();
    return this.ctx.notificationsService.unreadCount(this.ctx.uid);
  }

  public async markNotificationRead(id: string) {
    const item = await this.ctx.notificationsService.markRead(this.ctx.uid, id);
    return this.notificationView(item);
  }

  public async markAllNotificationsRead() {
    await this.ctx.notificationsService.markAllRead(this.ctx.uid);
  }

  private mediaError(error: unknown): never {
    if (error instanceof NativeMediaError) {
      const names = {
        INVALID: 'VALIDATION_FAILED',
        UNAVAILABLE: 'MEDIA_NOT_FOUND',
        MISMATCH: 'MEDIA_UPLOAD_MISMATCH',
        EXPIRED: 'MEDIA_UPLOAD_EXPIRED',
        NOT_READY: 'MEDIA_NOT_READY',
        STORAGE_UNAVAILABLE: 'STORAGE_UNAVAILABLE',
      } as const;
      throw new ApiClientError(
        error.code === 'UNAVAILABLE' ? 404 : 400,
        names[error.code],
        'Photo unavailable.',
        null,
      );
    }
    throw error;
  }

  public async createMediaUpload(input: unknown) {
    try {
      const asset = await this.ctx.mediaService.reserve(this.ctx.uid, input);
      return {
        mediaAsset: {
          id: asset.id,
          purpose: asset.purpose,
          status: asset.status,
          contentType: asset.contentType,
          contentLength: asset.contentLength,
          createdAt: iso(asset.createdAt),
        },
        upload: {
          method: 'PUT' as const,
          url: `${firebaseLocalWebUrl()}/media/upload/${asset.id}`,
          headers: { 'Content-Type': asset.contentType },
          expiresAt: iso(asset.createdAt + 300_000),
        },
      };
    } catch (error) {
      this.mediaError(error);
    }
  }

  public async completeMediaUpload(id: string) {
    try {
      const asset = await this.ctx.mediaService.complete(this.ctx.uid, id);
      return { ...asset, createdAt: iso(asset.createdAt) };
    } catch (error) {
      this.mediaError(error);
    }
  }

  public async mediaAsset(id: string) {
    try {
      const asset = await this.ctx.mediaService.status(this.ctx.uid, id);
      return { ...asset, createdAt: iso(asset.createdAt) };
    } catch (error) {
      this.mediaError(error);
    }
  }

  public async deleteAvatar() {
    try {
      await this.ctx.mediaService.removeAvatar(this.ctx.uid);
    } catch (error) {
      this.mediaError(error);
    }
  }
}

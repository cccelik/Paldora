import { ApiClientError, type PageOptions } from '@/lib/server/web-data-error';
import {
  LIFE_UPDATE_SECTION_KEYS,
  LIFE_UPDATE_SECTION_LABELS,
} from '@paldora/domain';
import {
  NativePostError,
  NativeMemoryError,
  type NativeMemoryFilter,
  type NativeMemoryItem,
  NativeRoomError,
  type NativeMemories,
  type NativeRooms,
} from '@paldora/firebase-trusted';
import {
  type BlockedUserView,
  type UpdateRoomRequest,
  type UpdateRoomWidgetsRequest,
  type UpdateRoomTopFriendsRequest,
  type UpdatePersonalizationInput,
  type MemoryItemView,
  type PostView,
  type RoomPhotoView,
  type LifeUpdateView,
} from '@paldora/validation';
import { firebaseLocalWebUrl } from './mode';
import {
  unavailable,
  iso,
  viewFriend,
  precomputed,
  type SummaryLookup,
} from './data-views';
import type { WebDataContext } from './data-context';
import 'server-only';

/** Rooms, memories, friends and blocks. */
export class RoomsSocialData {
  public constructor(private readonly ctx: WebDataContext) {}

  private roomError(error: unknown): never {
    if (error instanceof NativeRoomError) {
      if (error.code === 'UNAVAILABLE') throw unavailable('ROOM_NOT_FOUND');
      if (error.code === 'STALE')
        throw new ApiClientError(
          409,
          'ROOM_UPDATE_STALE',
          'Reload your Room.',
          null,
        );
      if (error.code === 'FRIEND_INELIGIBLE')
        throw new ApiClientError(
          409,
          'TOP_FRIEND_NOT_ELIGIBLE',
          'Reload your friends.',
          null,
        );
      if (error.code === 'MEDIA_NOT_READY')
        throw new ApiClientError(
          409,
          'MEDIA_NOT_READY',
          'Banner upload is not available yet.',
          null,
        );
      throw new ApiClientError(
        400,
        'VALIDATION_FAILED',
        'Check your Room settings.',
        null,
      );
    }
    throw error;
  }

  public async myRoom() {
    const room = await this.ctx.roomsService
      .get(this.ctx.uid)
      .catch((error: unknown) => this.roomError(error));
    return this.withRoomBanner(room);
  }

  public async room(username: string) {
    const room = await this.ctx.roomsService
      .get(this.ctx.uid, username)
      .catch((error: unknown) => this.roomError(error));
    return this.withRoomBanner(room);
  }

  private async withRoomBanner(room: Awaited<ReturnType<NativeRooms['get']>>) {
    const profile = await this.ctx.services.db
      .collection('nativeProfiles')
      .doc(room.owner.id)
      .get();
    const avatarId = profile.get('avatarMediaId') as string | null | undefined;
    const avatar = avatarId
      ? await this.ctx.services.db
          .collection('nativeMediaAssets')
          .doc(avatarId)
          .get()
      : null;
    const decorated =
      avatar?.get('status') === 'ready'
        ? {
            ...room,
            owner: {
              ...room.owner,
              avatarUrl: `${firebaseLocalWebUrl()}/media/${avatarId}/thumbnail`,
            },
          }
        : room;
    const row = await this.ctx.services.db
      .collection('nativeRooms')
      .doc(room.owner.id)
      .get();
    const id = row.get('bannerMediaId') as string | null | undefined;
    if (!id) return decorated;
    const asset = await this.ctx.services.db
      .collection('nativeMediaAssets')
      .doc(id)
      .get();
    if (
      asset.get('status') !== 'ready' ||
      asset.get('attachedRoomUid') !== room.owner.id
    )
      return decorated;
    return {
      ...decorated,
      banner: {
        url: `${firebaseLocalWebUrl()}/media/${id}/display`,
        bannerMediaId: id,
      },
    };
  }

  public async updateMyRoom(input: UpdateRoomRequest) {
    const previous = await this.ctx.services.db
      .collection('nativeRooms')
      .doc(this.ctx.uid)
      .get();
    const oldId = previous.get('bannerMediaId') as string | null | undefined;
    const room = await this.ctx.roomsService
      .update(this.ctx.uid, input)
      .catch((error: unknown) => this.roomError(error));
    if (
      input.bannerMediaId !== undefined &&
      oldId &&
      oldId !== input.bannerMediaId
    )
      await this.ctx.mediaService.retire(oldId);
    return this.withRoomBanner(room);
  }

  public async updateMyRoomWidgets(input: UpdateRoomWidgetsRequest) {
    return this.ctx.roomsService
      .updateWidgets(this.ctx.uid, input)
      .catch((error: unknown) => this.roomError(error));
  }

  public async updateMyRoomTopFriends(input: UpdateRoomTopFriendsRequest) {
    return this.ctx.roomsService
      .updateTopFriends(this.ctx.uid, input)
      .catch((error: unknown) => this.roomError(error));
  }

  public async myRoomPersonalization() {
    return this.ctx.roomsService
      .personalizationSource(this.ctx.uid)
      .catch((error: unknown) => this.roomError(error));
  }

  public async roomPersonalization(username: string) {
    return this.ctx.roomsService
      .personalizationRendered(this.ctx.uid, username)
      .catch((error: unknown) => this.roomError(error));
  }

  public async updateMyRoomPersonalization(input: UpdatePersonalizationInput) {
    return this.ctx.roomsService
      .updatePersonalization(this.ctx.uid, input)
      .catch((error: unknown) => this.roomError(error));
  }

  private async memoryItem(
    item: NativeMemoryItem,
    summaries: SummaryLookup,
  ): Promise<MemoryItemView> {
    if (item.kind === 'post') {
      const box = await this.ctx.box(item.post.boxId);
      const author = await this.ctx.personView(item.post.authorUid);
      const post: PostView = {
        id: item.post.id,
        box: { id: box.id, name: box.name },
        author,
        content: item.post.text,
        media: await this.ctx.mediaViews(item.post.mediaAssetIds),
        createdAt: iso(item.post.createdAt),
        editedAt:
          item.post.updatedAt > item.post.createdAt
            ? iso(item.post.updatedAt)
            : null,
        canEdit:
          item.post.authorUid === this.ctx.uid && box.status === 'active',
        interactions: precomputed(summaries, item.post.id),
        kind: 'post',
        lifeUpdateId: null,
      };
      return { kind: 'post', occurredAt: iso(item.occurredAt), post };
    }
    const update = item.update;
    const author = await this.ctx.personView(update.authorUid);
    const lifeUpdate: LifeUpdateView = {
      id: update.id,
      author,
      audience: update.audience,
      sections: LIFE_UPDATE_SECTION_KEYS.flatMap((key) =>
        update.sections[key]
          ? [
              {
                key,
                label: LIFE_UPDATE_SECTION_LABELS[key],
                content: update.sections[key],
              },
            ]
          : [],
      ),
      media: await this.ctx.mediaViews(update.mediaAssetIds),
      createdAt: iso(update.createdAt),
      editedAt:
        update.updatedAt > update.createdAt ? iso(update.updatedAt) : null,
      canEdit: update.canEdit,
      contexts: await Promise.all(
        update.contexts.map(async (context) => ({
          postId: context.postId,
          box: { id: context.boxId, name: context.boxName },
          interactions: precomputed(summaries, context.postId),
        })),
      ),
    };
    return {
      kind: 'life_update',
      occurredAt: iso(item.occurredAt),
      lifeUpdate,
    };
  }

  private memoryError(
    error: unknown,
    scope: Parameters<NativeMemories['page']>[1],
  ): never {
    if (error instanceof NativeMemoryError) {
      if (error.code === 'UNAVAILABLE')
        throw unavailable(
          scope.kind === 'box'
            ? 'BOX_NOT_FOUND'
            : scope.kind === 'room'
              ? 'ROOM_NOT_FOUND'
              : 'MEMORY_NOT_FOUND',
        );
      throw new ApiClientError(
        400,
        'INVALID_CURSOR',
        'Invalid memory page.',
        null,
      );
    }
    throw error;
  }

  private async memoryPage(
    scope: Parameters<NativeMemories['page']>[1],
    filter: NativeMemoryFilter,
  ) {
    try {
      await this.ctx.homeFeedService.processPending();
      const page = await this.ctx.memoriesService.page(
        this.ctx.uid,
        scope,
        filter,
      );
      const summaries = await this.ctx.summariesFor(
        page.items.flatMap((item) =>
          item.kind === 'post'
            ? [{ boxId: item.post.boxId, postId: item.post.id }]
            : item.update.contexts.map((context) => ({
                boxId: context.boxId,
                postId: context.postId,
              })),
        ),
      );
      const projected = await Promise.all(
        page.items.map(async (item) => {
          try {
            return await this.memoryItem(item, summaries);
          } catch (error) {
            // A Box may close between the canonical scan and DTO projection.
            if (
              (error instanceof ApiClientError && error.status === 404) ||
              (error instanceof NativePostError && error.code === 'UNAVAILABLE')
            )
              return null;
            throw error;
          }
        }),
      );
      return {
        items: projected.filter(
          (item): item is MemoryItemView => item !== null,
        ),
        nextCursor: page.nextCursor,
      };
    } catch (error) {
      this.memoryError(error, scope);
    }
  }

  public myMemories(filter: NativeMemoryFilter) {
    return this.memoryPage({ kind: 'personal' }, filter);
  }

  public myMemorySummary(year?: number) {
    return this.memorySummary({ kind: 'personal' }, year);
  }

  public boxMemories(boxId: string, filter: NativeMemoryFilter) {
    return this.memoryPage({ kind: 'box', boxId }, filter);
  }

  public boxMemorySummary(boxId: string, year?: number) {
    return this.memorySummary({ kind: 'box', boxId }, year);
  }

  public roomContent(username: string, filter: NativeMemoryFilter = {}) {
    return this.memoryPage({ kind: 'room', username }, filter);
  }

  public roomContentSummary(username: string, year?: number) {
    return this.memorySummary({ kind: 'room', username }, year);
  }

  private async memorySummary(
    scope: Parameters<NativeMemories['summary']>[1],
    year?: number,
  ) {
    try {
      await this.ctx.homeFeedService.processPending();
      return await this.ctx.memoriesService.summary(this.ctx.uid, scope, year);
    } catch (error) {
      this.memoryError(error, scope);
    }
  }

  public async roomPhotos(
    username: string,
  ): Promise<{ items: RoomPhotoView[]; nextCursor: null }> {
    const items: RoomPhotoView[] = [];
    let cursor: string | undefined;
    // Keep previews bounded even when recent memories have no photos.
    for (
      let pageNumber = 0;
      pageNumber < 4 && items.length < 6;
      pageNumber += 1
    ) {
      // Each page rechecks Room visibility and canonical content state.
      // eslint-disable-next-line no-await-in-loop
      const page = await this.roomContent(username, { limit: 50, cursor });
      for (const item of page.items) {
        const source =
          item.kind === 'post'
            ? { kind: 'post' as const, postId: item.post.id }
            : item.lifeUpdate.contexts[0]
              ? {
                  kind: 'life_update' as const,
                  lifeUpdateId: item.lifeUpdate.id,
                  boxId: item.lifeUpdate.contexts[0].box.id,
                }
              : null;
        if (!source) continue;
        const photos =
          item.kind === 'post' ? item.post.media : item.lifeUpdate.media;
        for (const photo of photos) {
          items.push({ photo, source, occurredAt: item.occurredAt });
          if (items.length === 6) break;
        }
        if (items.length === 6) break;
      }
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    return { items, nextCursor: null };
  }

  public async friends(page: PageOptions = {}) {
    const result = await this.ctx.friendsService.list(
      this.ctx.uid,
      'accepted',
      page.cursor,
      page.limit,
    );
    return { ...result, items: result.items.map(viewFriend) };
  }

  public async friendRequests(page: PageOptions = {}) {
    const result = await this.ctx.friendsService.list(
      this.ctx.uid,
      'requests',
      page.cursor,
      page.limit,
    );
    return { ...result, items: result.items.map(viewFriend) };
  }

  public async sendFriendRequest(username: string) {
    return this.ctx.friendsService.sendByUsername(this.ctx.uid, username);
  }

  public async acceptFriendRequest(id: string) {
    return this.ctx.friendsService.accept(id, this.ctx.uid);
  }

  public async declineFriendRequest(id: string) {
    return this.ctx.friendsService.decline(id, this.ctx.uid);
  }

  public async cancelFriendRequest(id: string) {
    return this.ctx.friendsService.cancel(id, this.ctx.uid);
  }

  public async removeFriend(otherUid: string) {
    return this.ctx.friendsService.remove(this.ctx.uid, otherUid);
  }

  public async blocks(page: PageOptions = {}) {
    const result = await this.ctx.blocksService.list(
      this.ctx.uid,
      page.cursor,
      page.limit,
    );
    return {
      ...result,
      items: result.items.map((item): BlockedUserView => ({
        ...item,
        blockedAt: iso(item.blockedAt),
      })),
    };
  }

  public async block(username: string) {
    return this.ctx.blocksService.blockByUsername(this.ctx.uid, username);
  }

  public async unblock(otherUid: string) {
    return this.ctx.blocksService.setBlocked(this.ctx.uid, otherUid, false);
  }

  public async setReactionPresets(presets: readonly string[]) {
    return this.ctx.profilesService.setReactionPresets(this.ctx.uid, presets);
  }
}

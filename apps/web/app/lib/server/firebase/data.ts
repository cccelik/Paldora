import { ApiClientError, type PageOptions } from '@/lib/server/web-data-error';
import {
  LIFE_UPDATE_SECTION_KEYS,
  LIFE_UPDATE_SECTION_LABELS,
  type LifeUpdateSectionKey,
} from '@paldora/domain';
import {
  NativeBlockPairs,
  NativeAccountLifecycle,
  NativeBoxDeletion,
  NativeBoxDeletionError,
  NativeBoxError,
  NativeBoxInvitations,
  NativeBoxMemberError,
  NativeBoxMembers,
  NativeBoxPosts,
  NativePostError,
  NativeLifeUpdates,
  NativeLifeUpdateError,
  NativeMedia,
  NativeMediaError,
  NativeBoxes,
  NativeFriendships,
  NativeHomeFeed,
  NativeHomeFeedError,
  NativeMemories,
  NativeModeration,
  NativeModerationError,
  type NativeCase,
  NativeNotifications,
  NativeMemoryError,
  type NativeMemoryFilter,
  type NativeMemoryItem,
  NativeInvitationError,
  NativeProfiles,
  NativeRooms,
  NativeRoomError,
  type TrustedBox,
  type NativeFriendship,
  type NativeComment,
  type NativeCommentItem,
} from '@paldora/firebase-trusted';
import type {
  BlockedUserView,
  BoxInvitationView,
  BoxMemberView,
  BoxView,
  FriendshipView,
  LifeUpdateChanges,
  UpdateRoomRequest,
  UpdateRoomWidgetsRequest,
  UpdateRoomTopFriendsRequest,
  UpdatePersonalizationInput,
  MemoryItemView,
  PostView,
  PostMediaView,
  PostInteractionSummary,
  PostReactionEntry,
  RoomPhotoView,
  CommentInteractionSummary,
  LifeUpdateView,
  UserSummary,
  NotificationView,
  CreateReportInput,
  ModerationActionInput,
} from '@paldora/validation';
import { firebaseAdminServices, firebaseSessionUid } from './session';
import { firebaseLocalWebUrl } from './mode';
import 'server-only';

export type FirebaseFeedItem =
  | {
      kind: 'post';
      id: string;
      boxId: string;
      authorName: string;
      authorAvatarUrl: string | null;
      content: string;
      mediaAssetIds: string[];
      createdAt: string;
      edited: boolean;
      canEdit: boolean;
      interactions: PostInteractionSummary;
    }
  | {
      kind: 'life_update';
      id: string;
      boxId: string;
      postId: string;
      authorName: string;
      authorAvatarUrl: string | null;
      mediaAssetIds: string[];
      createdAt: string;
      sections: { key: LifeUpdateSectionKey; content: string }[];
      interactions: PostInteractionSummary;
    };

export interface FirebaseCommentItem {
  id: string;
  content: string;
  parentId: string | null;
  authorName: string;
  authorAvatarUrl: string | null;
  createdAt: string;
  edited: boolean;
  canEdit: boolean;
  interactions: CommentInteractionSummary;
}

export type FirebaseThreadItem =
  | { kind: 'comment'; comment: FirebaseCommentItem }
  | { kind: 'hidden' | 'deleted'; id: string; createdAt: string };

export interface FirebaseCommentThread {
  root: FirebaseThreadItem;
  rootId: string;
  replies: FirebaseThreadItem[];
  replyCount: number;
}

export interface FirebaseLifeUpdateItem {
  id: string;
  authorName: string;
  authorAvatarUrl: string | null;
  mediaAssetIds: string[];
  audience: 'only_me' | 'boxes';
  sections: { key: LifeUpdateSectionKey; content: string }[];
  createdAt: string;
  edited: boolean;
  canEdit: boolean;
  contexts: {
    boxId: string;
    boxName: string;
    postId: string;
    canInteract: boolean;
    interactions: PostInteractionSummary;
  }[];
  isOwner: boolean;
}

function unavailable(code: string): ApiClientError {
  return new ApiClientError(404, code, 'Unavailable.', null);
}

function boxAbsent(error: unknown): never {
  if (
    error instanceof NativeBoxError ||
    error instanceof NativeBoxMemberError ||
    (error instanceof NativeInvitationError && error.code === 'UNAVAILABLE')
  )
    throw unavailable('BOX_NOT_FOUND');
  throw error;
}

function iso(value: number): string {
  return new Date(value).toISOString();
}

function person(
  uid: string,
  username: string,
  displayName: string,
): UserSummary {
  return { id: uid, username, displayName, avatarUrl: null };
}

function viewBox(box: TrustedBox): BoxView {
  return {
    id: box.id,
    name: box.name,
    status: box.status,
    currentUserRole: box.currentUserRole,
    memberCount: box.memberCount,
    createdAt: iso(box.createdAt),
    updatedAt: iso(box.updatedAt),
  };
}

function viewFriend(item: NativeFriendship): FriendshipView {
  return {
    id: item.id,
    user: person(item.otherUid, item.username, item.displayName),
    status: item.status === 'accepted' ? 'accepted' : 'pending',
    direction:
      item.status === 'accepted'
        ? 'established'
        : item.status === 'sent'
          ? 'outgoing'
          : 'incoming',
    createdAt: iso(item.createdAt),
    updatedAt: iso(item.updatedAt),
  };
}

/** Firebase-only Phase 2/3 web data access, always scoped to a verified cookie. */
interface DisplaySummary {
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export class FirebaseWebData {
  private readonly services = firebaseAdminServices();
  private readonly friendsService = new NativeFriendships(this.services.db);
  private readonly blocksService = new NativeBlockPairs(this.services.db);
  private readonly boxesService = new NativeBoxes(this.services.db);
  private readonly postsService = new NativeBoxPosts(this.services.db);
  private readonly homeFeedService = new NativeHomeFeed(this.services.db);
  private readonly lifeUpdatesService = new NativeLifeUpdates(this.services.db);
  private readonly membersService = new NativeBoxMembers(this.services.db);
  private readonly invitationsService = new NativeBoxInvitations(
    this.services.db,
  );
  private readonly deletionService = new NativeBoxDeletion(
    this.services.db,
    async (path) => {
      await this.services.bucket.file(path).delete({ ignoreNotFound: true });
    },
    async (id) => {
      await this.mediaService.retire(id);
    },
  );
  private readonly profilesService = new NativeProfiles(
    this.services.db,
    this.services.auth,
  );
  private readonly roomsService = new NativeRooms(this.services.db);
  private readonly memoriesService = new NativeMemories(this.services.db);
  private readonly mediaService = new NativeMedia(
    this.services.db,
    this.services.storage,
    this.services.bucket.name,
  );
  private readonly notificationsService = new NativeNotifications(
    this.services.db,
  );
  private readonly moderationService = new NativeModeration(this.services.db);
  private readonly accountLifecycle = new NativeAccountLifecycle(
    this.services.db,
    this.services.auth,
    this.services.storage,
    this.services.bucket.name,
  );

  public constructor(private readonly uid: string) {}

  public accountExport() {
    return this.accountLifecycle.latestExport(this.uid);
  }
  public requestAccountExport() {
    return this.accountLifecycle.requestExport(this.uid);
  }
  public accountDeletion() {
    return this.accountLifecycle.currentDeletion(this.uid);
  }
  public async requestAccountDeletion(password: string) {
    return this.accountLifecycle.requestDeletion(
      this.uid,
      password,
      (uid, email, credential) =>
        this.services.sessions.reauthenticate(uid, email, credential),
    );
  }
  public async cancelAccountDeletion(password: string) {
    return this.accountLifecycle.cancelDeletion(
      this.uid,
      password,
      (uid, email, credential) =>
        this.services.sessions.reauthenticate(uid, email, credential),
    );
  }
  public downloadAccountExport(id: string) {
    return this.accountLifecycle.downloadStream(this.uid, id);
  }

  private moderationError(error: unknown): never {
    if (error instanceof NativeModerationError) {
      const code =
        error.code === 'FORBIDDEN'
          ? 'MODERATION_FORBIDDEN'
          : error.code === 'INVALID'
            ? 'REPORT_ACTION_UNAVAILABLE'
            : 'REPORT_NOT_FOUND';
      throw new ApiClientError(
        error.code === 'FORBIDDEN' ? 403 : error.code === 'INVALID' ? 409 : 404,
        code,
        'Moderation action unavailable.',
        null,
      );
    }
    throw error;
  }

  private receipt(item: NativeCase) {
    return {
      id: item.id,
      targetKind: item.targetKind,
      targetId: item.targetId,
      category: item.category,
      status: item.status,
      createdAt: iso(item.createdAt),
    };
  }

  public async createReport(input: CreateReportInput) {
    try {
      return this.receipt(
        await this.moderationService.createReport(this.uid, input),
      );
    } catch (error) {
      this.moderationError(error);
    }
  }

  public async myReports(page: PageOptions = {}) {
    const result = await this.moderationService.myReports(
      this.uid,
      page.cursor,
      page.limit ?? 20,
    );
    return {
      items: result.items.map((item) => this.receipt(item)),
      nextCursor: result.nextCursor,
    };
  }

  public async moderationCases(
    page: PageOptions & { status: 'open' | 'closed' },
  ) {
    try {
      const result = await this.moderationService.cases(
        this.uid,
        page.status,
        page.cursor,
        page.limit ?? 25,
      );
      return {
        items: result.items.map((item) => this.receipt(item)),
        nextCursor: result.nextCursor,
      };
    } catch (error) {
      this.moderationError(error);
    }
  }

  public async moderationCase(id: string) {
    try {
      const item = await this.moderationService.getCase(this.uid, id);
      return {
        ...this.receipt(item),
        detail: item.detail,
        reporterUserId: item.reporterUid,
        closedAt: item.closedAt ? iso(item.closedAt) : null,
      };
    } catch (error) {
      this.moderationError(error);
    }
  }

  public async actOnModerationCase(id: string, input: ModerationActionInput) {
    try {
      const result = await this.moderationService.actOnCase(
        this.uid,
        id,
        input,
      );
      if (result.action === 'hide' && result.postId)
        await this.drainMediaPostCleanup(result.postId);
      if (result.action === 'suspend' && result.targetUid)
        await this.services.auth.revokeRefreshTokens(result.targetUid);
    } catch (error) {
      this.moderationError(error);
    }
  }

  public async moderationAccount(id: string) {
    try {
      return await this.moderationService.account(this.uid, id);
    } catch (error) {
      this.moderationError(error);
    }
  }

  public async myModerationNotices() {
    const items = await this.moderationService.notices(this.uid);
    return {
      items: items.map((item) => ({
        ...item,
        originalCreatedAt: iso(item.originalCreatedAt),
      })),
    };
  }

  private async notificationView(
    item: Awaited<ReturnType<NativeNotifications['get']>>,
  ): Promise<NotificationView> {
    const box = await this.box(item.boxId);
    return {
      id: item.id,
      type: item.type,
      actor: await this.personView(item.actorUid),
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
    await this.notificationsService.processPending();
    const result = await this.notificationsService.list(
      this.uid,
      page.cursor,
      page.limit ?? 20,
    );
    const items = await Promise.all(
      result.items.map((item) => this.notificationView(item)),
    );
    return {
      items,
      nextCursor: result.nextCursor,
      unreadCount: await this.notificationsService.unreadCount(this.uid),
    };
  }

  public async unreadNotificationCount() {
    await this.notificationsService.processPending();
    return this.notificationsService.unreadCount(this.uid);
  }

  public async markNotificationRead(id: string) {
    const item = await this.notificationsService.markRead(this.uid, id);
    return this.notificationView(item);
  }

  public async markAllNotificationsRead() {
    await this.notificationsService.markAllRead(this.uid);
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
      const asset = await this.mediaService.reserve(this.uid, input);
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
      const asset = await this.mediaService.complete(this.uid, id);
      return { ...asset, createdAt: iso(asset.createdAt) };
    } catch (error) {
      this.mediaError(error);
    }
  }

  public async mediaAsset(id: string) {
    try {
      const asset = await this.mediaService.status(this.uid, id);
      return { ...asset, createdAt: iso(asset.createdAt) };
    } catch (error) {
      this.mediaError(error);
    }
  }

  public async deleteAvatar() {
    try {
      await this.mediaService.removeAvatar(this.uid);
    } catch (error) {
      this.mediaError(error);
    }
  }

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
    const room = await this.roomsService
      .get(this.uid)
      .catch((error: unknown) => this.roomError(error));
    return this.withRoomBanner(room);
  }

  public async room(username: string) {
    const room = await this.roomsService
      .get(this.uid, username)
      .catch((error: unknown) => this.roomError(error));
    return this.withRoomBanner(room);
  }

  private async withRoomBanner(room: Awaited<ReturnType<NativeRooms['get']>>) {
    const profile = await this.services.db
      .collection('nativeProfiles')
      .doc(room.owner.id)
      .get();
    const avatarId = profile.get('avatarMediaId') as string | null | undefined;
    const avatar = avatarId
      ? await this.services.db
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
    const row = await this.services.db
      .collection('nativeRooms')
      .doc(room.owner.id)
      .get();
    const id = row.get('bannerMediaId') as string | null | undefined;
    if (!id) return decorated;
    const asset = await this.services.db
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
    const previous = await this.services.db
      .collection('nativeRooms')
      .doc(this.uid)
      .get();
    const oldId = previous.get('bannerMediaId') as string | null | undefined;
    const room = await this.roomsService
      .update(this.uid, input)
      .catch((error: unknown) => this.roomError(error));
    if (
      input.bannerMediaId !== undefined &&
      oldId &&
      oldId !== input.bannerMediaId
    )
      await this.mediaService.retire(oldId);
    return this.withRoomBanner(room);
  }

  public async updateMyRoomWidgets(input: UpdateRoomWidgetsRequest) {
    return this.roomsService
      .updateWidgets(this.uid, input)
      .catch((error: unknown) => this.roomError(error));
  }

  public async updateMyRoomTopFriends(input: UpdateRoomTopFriendsRequest) {
    return this.roomsService
      .updateTopFriends(this.uid, input)
      .catch((error: unknown) => this.roomError(error));
  }

  public async myRoomPersonalization() {
    return this.roomsService
      .personalizationSource(this.uid)
      .catch((error: unknown) => this.roomError(error));
  }

  public async roomPersonalization(username: string) {
    return this.roomsService
      .personalizationRendered(this.uid, username)
      .catch((error: unknown) => this.roomError(error));
  }

  public async updateMyRoomPersonalization(input: UpdatePersonalizationInput) {
    return this.roomsService
      .updatePersonalization(this.uid, input)
      .catch((error: unknown) => this.roomError(error));
  }

  private async mediaViews(ids: readonly string[]): Promise<PostMediaView[]> {
    const snapshots = await Promise.all(
      ids.map((id) =>
        this.services.db.collection('nativeMediaAssets').doc(id).get(),
      ),
    );
    return snapshots.flatMap((asset) => {
      if (asset.get('status') !== 'ready') return [];
      const width = asset.get('width') as number | undefined;
      const height = asset.get('height') as number | undefined;
      if (!width || !height) return [];
      const root = `${firebaseLocalWebUrl()}/media/${asset.id}`;
      return [
        {
          id: asset.id,
          width,
          height,
          url: `${root}/display`,
          thumbnailUrl: `${root}/thumbnail`,
        },
      ];
    });
  }

  private async summary(
    boxId: string,
    postId: string,
  ): Promise<PostInteractionSummary> {
    const result = await this.postsService.interactionSummary(
      boxId,
      postId,
      this.uid,
    );
    return {
      ...result,
      realPreview: result.realPreview.map((preview) => ({
        ...preview,
        thumbnailUrl: `${firebaseLocalWebUrl()}${preview.thumbnailUrl}`,
      })),
    };
  }

  private async memoryItem(item: NativeMemoryItem): Promise<MemoryItemView> {
    if (item.kind === 'post') {
      const box = await this.box(item.post.boxId);
      const author = await this.personView(item.post.authorUid);
      const post: PostView = {
        id: item.post.id,
        box: { id: box.id, name: box.name },
        author,
        content: item.post.text,
        media: await this.mediaViews(item.post.mediaAssetIds),
        createdAt: iso(item.post.createdAt),
        editedAt:
          item.post.updatedAt > item.post.createdAt
            ? iso(item.post.updatedAt)
            : null,
        canEdit: item.post.authorUid === this.uid && box.status === 'active',
        interactions: await this.summary(item.post.boxId, item.post.id),
        kind: 'post',
        lifeUpdateId: null,
      };
      return { kind: 'post', occurredAt: iso(item.occurredAt), post };
    }
    const update = item.update;
    const author = await this.personView(update.authorUid);
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
      media: await this.mediaViews(update.mediaAssetIds),
      createdAt: iso(update.createdAt),
      editedAt:
        update.updatedAt > update.createdAt ? iso(update.updatedAt) : null,
      canEdit: update.canEdit,
      contexts: await Promise.all(
        update.contexts.map(async (context) => ({
          postId: context.postId,
          box: { id: context.boxId, name: context.boxName },
          interactions: await this.summary(context.boxId, context.postId),
        })),
      ),
    };
    return {
      kind: 'life_update',
      occurredAt: iso(item.occurredAt),
      lifeUpdate,
    };
  }

  private async personView(uid: string): Promise<UserSummary> {
    const summary = await this.userSummary(uid);
    return {
      ...person(uid, summary.username, summary.displayName),
      avatarUrl: summary.avatarUrl,
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
      await this.homeFeedService.processPending();
      const page = await this.memoriesService.page(this.uid, scope, filter);
      const projected = await Promise.all(
        page.items.map(async (item) => {
          try {
            return await this.memoryItem(item);
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
      await this.homeFeedService.processPending();
      return await this.memoriesService.summary(this.uid, scope, year);
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
    const result = await this.friendsService.list(
      this.uid,
      'accepted',
      page.cursor,
      page.limit,
    );
    return { ...result, items: result.items.map(viewFriend) };
  }

  public async friendRequests(page: PageOptions = {}) {
    const result = await this.friendsService.list(
      this.uid,
      'requests',
      page.cursor,
      page.limit,
    );
    return { ...result, items: result.items.map(viewFriend) };
  }

  public async sendFriendRequest(username: string) {
    return this.friendsService.sendByUsername(this.uid, username);
  }

  public async acceptFriendRequest(id: string) {
    return this.friendsService.accept(id, this.uid);
  }

  public async declineFriendRequest(id: string) {
    return this.friendsService.decline(id, this.uid);
  }

  public async cancelFriendRequest(id: string) {
    return this.friendsService.cancel(id, this.uid);
  }

  public async removeFriend(otherUid: string) {
    return this.friendsService.remove(this.uid, otherUid);
  }

  public async blocks(page: PageOptions = {}) {
    const result = await this.blocksService.list(
      this.uid,
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
    return this.blocksService.blockByUsername(this.uid, username);
  }

  public async unblock(otherUid: string) {
    return this.blocksService.setBlocked(this.uid, otherUid, false);
  }

  public async setReactionPresets(presets: readonly string[]) {
    return this.profilesService.setReactionPresets(this.uid, presets);
  }

  public async boxes(page: PageOptions = {}) {
    const result = await this.boxesService.list(
      this.uid,
      page.cursor,
      page.limit,
    );
    return { ...result, items: result.items.map(viewBox) };
  }

  // Display-only identity, memoized per instance (one instance per request).
  // The promise is stored so parallel callers share one read.
  private readonly userSummaries = new Map<string, Promise<DisplaySummary>>();

  private userSummary(uid: string): Promise<DisplaySummary> {
    let pending = this.userSummaries.get(uid);
    if (!pending) {
      pending = this.loadUserSummary(uid);
      this.userSummaries.set(uid, pending);
    }
    return pending;
  }

  private async loadUserSummary(uid: string): Promise<DisplaySummary> {
    const { db } = this.services;
    const [account, profile] = await db.getAll(
      db.collection('nativeAccounts').doc(uid),
      db.collection('nativeProfiles').doc(uid),
    );
    const username = (account?.get('username') as string | undefined) ?? uid;
    const displayName =
      (profile?.get('displayName') as string | undefined) ??
      (profile?.get('username') as string | undefined) ??
      'Member';
    const id = profile?.get('avatarMediaId') as string | null | undefined;
    let avatarUrl: string | null = null;
    if (id) {
      const asset = await db.collection('nativeMediaAssets').doc(id).get();
      if (asset.get('status') === 'ready' && asset.get('ownerUid') === uid)
        avatarUrl = `${firebaseLocalWebUrl()}/media/${id}/thumbnail`;
    }
    return { username, displayName, avatarUrl };
  }

  private async authorName(uid: string): Promise<string> {
    return (await this.userSummary(uid)).displayName;
  }

  private async authorAvatarUrl(uid: string): Promise<string | null> {
    return (await this.userSummary(uid)).avatarUrl;
  }

  private async feedItem(
    post: Awaited<ReturnType<NativeBoxPosts['get']>>,
  ): Promise<FirebaseFeedItem | null> {
    if (post.kind === 'life_update') {
      if (!post.lifeUpdateId) return null;
      try {
        const update = await this.lifeUpdatesService.get(
          post.lifeUpdateId,
          this.uid,
          post.boxId,
        );
        if (!update.contexts.some((context) => context.postId === post.id))
          return null;
        return {
          kind: 'life_update',
          id: update.id,
          boxId: post.boxId,
          postId: post.id,
          authorName: await this.authorName(update.authorUid),
          authorAvatarUrl: await this.authorAvatarUrl(update.authorUid),
          mediaAssetIds: update.mediaAssetIds,
          createdAt: iso(update.createdAt),
          interactions: await this.summary(post.boxId, post.id),
          sections: LIFE_UPDATE_SECTION_KEYS.flatMap((key) =>
            update.sections[key]
              ? [{ key, content: update.sections[key] }]
              : [],
          ),
        };
      } catch (error) {
        if (
          error instanceof NativeLifeUpdateError &&
          error.code === 'UNAVAILABLE'
        )
          return null;
        throw error;
      }
    }
    return {
      kind: 'post',
      id: post.id,
      boxId: post.boxId,
      authorName: await this.authorName(post.authorUid),
      authorAvatarUrl: await this.authorAvatarUrl(post.authorUid),
      content: post.text,
      mediaAssetIds: post.mediaAssetIds,
      createdAt: iso(post.createdAt),
      edited: post.updatedAt > post.createdAt,
      canEdit: post.authorUid === this.uid,
      interactions: await this.summary(post.boxId, post.id),
    };
  }

  private async lifeUpdateItem(
    update: Awaited<ReturnType<NativeLifeUpdates['get']>>,
  ): Promise<FirebaseLifeUpdateItem> {
    return {
      id: update.id,
      authorName: await this.authorName(update.authorUid),
      authorAvatarUrl: await this.authorAvatarUrl(update.authorUid),
      mediaAssetIds: update.mediaAssetIds,
      audience: update.audience,
      sections: LIFE_UPDATE_SECTION_KEYS.flatMap((key) =>
        update.sections[key] ? [{ key, content: update.sections[key] }] : [],
      ),
      createdAt: iso(update.createdAt),
      edited: update.updatedAt > update.createdAt,
      canEdit: update.canEdit,
      isOwner: update.authorUid === this.uid,
      contexts: await Promise.all(
        update.contexts.map(
          async ({ boxId, boxName, postId, canInteract }) => ({
            boxId,
            boxName,
            postId,
            canInteract,
            interactions: await this.summary(boxId, postId),
          }),
        ),
      ),
    };
  }

  public async myLifeUpdates(cursor?: string) {
    try {
      const page = await this.lifeUpdatesService.listMine(this.uid, cursor);
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
        await this.lifeUpdatesService.get(id, this.uid, scopeBoxId),
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
      const id = await this.lifeUpdatesService.create(this.uid, input);
      const contexts = (await this.lifeUpdatesService.get(id, this.uid))
        .contexts;
      await Promise.all(
        contexts.map((context) =>
          this.homeFeedService
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
      const current = await this.lifeUpdatesService.get(id, this.uid);
      const mediaIds = await this.lifeUpdatesService.remove(id, this.uid);
      await Promise.all(
        mediaIds.map((mediaId) => this.mediaService.retire(mediaId)),
      );
      await Promise.all(
        current.contexts.map((context) =>
          this.drainMediaPostCleanup(context.postId),
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
      const removed = await this.lifeUpdatesService.edit(id, this.uid, changes);
      await Promise.all(
        removed.map((mediaId) => this.mediaService.retire(mediaId)),
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

  public async boxPosts(boxId: string, page: PageOptions = {}) {
    try {
      const result = await this.postsService.list(
        boxId,
        this.uid,
        page.cursor,
        page.limit,
      );
      const projected = await Promise.all(
        result.items.map((post) => this.feedItem(post)),
      );
      return {
        items: projected.filter(
          (item): item is FirebaseFeedItem => item !== null,
        ),
        nextCursor: result.nextCursor,
      };
    } catch (error) {
      if (error instanceof NativePostError && error.code === 'UNAVAILABLE')
        throw unavailable('BOX_NOT_FOUND');
      throw error;
    }
  }

  public postInteractionSummary(boxId: string, postId: string) {
    return this.summary(boxId, postId);
  }

  public async postReactions(
    postId: string,
    page: PageOptions = {},
    cameraOnly = false,
  ) {
    try {
      const resolved = await this.postsService.resolve(postId, this.uid);
      const result = await this.postsService.listReactions(
        resolved.post.boxId,
        postId,
        this.uid,
        undefined,
        page.cursor,
      );
      const items: PostReactionEntry[] = await Promise.all(
        result.items
          .filter((reaction) => !cameraOnly || reaction.kind === 'real')
          .map(async (reaction) => ({
            user: await this.personView(reaction.uid),
            kind: reaction.kind,
            ...(reaction.mediaAssetId
              ? {
                  image: {
                    url: `${firebaseLocalWebUrl()}/media/${reaction.mediaAssetId}/display`,
                    thumbnailUrl: `${firebaseLocalWebUrl()}/media/${reaction.mediaAssetId}/thumbnail`,
                  },
                }
              : {}),
            createdAt: iso(reaction.createdAt),
          })),
      );
      return { items, nextCursor: result.nextCursor };
    } catch (error) {
      if (error instanceof NativePostError) throw unavailable('POST_NOT_FOUND');
      throw error;
    }
  }

  public async homeFeed(page: PageOptions = {}) {
    try {
      // Repair a bounded amount of durable fanout/backfill work on local reads.
      await this.homeFeedService.processPending();
      const result = await this.homeFeedService.page(
        this.uid,
        page.cursor,
        page.limit ?? 20,
      );
      const projected = await Promise.all(
        result.items.map((post) => this.feedItem(post)),
      );
      return {
        items: projected.filter(
          (item): item is FirebaseFeedItem => item !== null,
        ),
        nextCursor: result.nextCursor,
      };
    } catch (error) {
      if (error instanceof NativeHomeFeedError && error.code === 'INVALID')
        throw new ApiClientError(
          400,
          'INVALID_CURSOR',
          'Invalid feed page.',
          null,
        );
      if (error instanceof NativeHomeFeedError && error.code === 'UNAVAILABLE')
        throw unavailable('ACCOUNT_NOT_FOUND');
      throw error;
    }
  }

  public async post(postId: string) {
    try {
      const { post } = await this.postsService.resolve(postId, this.uid);
      const [box, item] = await Promise.all([
        this.box(post.boxId),
        this.feedItem(post),
      ]);
      if (!item) throw unavailable('POST_NOT_FOUND');
      return { box, item };
    } catch (error) {
      if (error instanceof NativePostError && error.code === 'UNAVAILABLE')
        throw unavailable('POST_NOT_FOUND');
      throw error;
    }
  }

  public async comments(boxId: string, postId: string, cursor?: string) {
    try {
      const result = await this.postsService.listComments(
        boxId,
        postId,
        this.uid,
        cursor,
      );
      const items = await Promise.all(
        result.items.map(async (item): Promise<FirebaseCommentItem> => ({
          id: item.id,
          content: item.text,
          parentId: item.parentId,
          authorName: await this.authorName(item.authorUid),
          authorAvatarUrl: await this.authorAvatarUrl(item.authorUid),
          createdAt: iso(item.createdAt),
          edited: item.updatedAt > item.createdAt,
          canEdit: item.authorUid === this.uid,
          interactions: await this.postsService.commentInteractionSummary(
            boxId,
            postId,
            item.id,
            this.uid,
          ),
        })),
      );
      return { items, nextCursor: result.nextCursor };
    } catch (error) {
      if (error instanceof NativePostError && error.code === 'UNAVAILABLE')
        throw unavailable('POST_NOT_FOUND');
      throw error;
    }
  }

  private async firebaseComment(
    boxId: string,
    postId: string,
    item: NativeComment,
  ): Promise<FirebaseCommentItem> {
    return {
      id: item.id,
      content: item.text,
      parentId: item.parentId,
      authorName: await this.authorName(item.authorUid),
      authorAvatarUrl: await this.authorAvatarUrl(item.authorUid),
      createdAt: iso(item.createdAt),
      edited: item.updatedAt > item.createdAt,
      canEdit: item.authorUid === this.uid,
      interactions: await this.postsService.commentInteractionSummary(
        boxId,
        postId,
        item.id,
        this.uid,
      ),
    };
  }

  private async firebaseThreadItem(
    boxId: string,
    postId: string,
    item: NativeCommentItem,
  ): Promise<FirebaseThreadItem> {
    return item.kind === 'comment'
      ? {
          kind: 'comment',
          comment: await this.firebaseComment(boxId, postId, item.comment),
        }
      : { kind: item.kind, id: item.id, createdAt: iso(item.createdAt) };
  }

  public async commentThreads(boxId: string, postId: string, cursor?: string) {
    try {
      const roots = await this.postsService.listCommentRoots(
        boxId,
        postId,
        this.uid,
        cursor,
      );
      const items = await Promise.all(
        roots.items.map(async (root): Promise<FirebaseCommentThread> => {
          const rootId = root.kind === 'comment' ? root.comment.id : root.id;
          if (root.kind === 'hidden')
            return {
              root: await this.firebaseThreadItem(boxId, postId, root),
              rootId,
              replies: [],
              replyCount: 0,
            };
          const [preview, replyCount] = await Promise.all([
            this.postsService.listCommentReplies(
              boxId,
              postId,
              rootId,
              this.uid,
              undefined,
              3,
            ),
            this.postsService.countCommentReplies(
              boxId,
              postId,
              rootId,
              this.uid,
            ),
          ]);
          return {
            root: await this.firebaseThreadItem(boxId, postId, root),
            rootId,
            replies: await Promise.all(
              preview.items.map((item) =>
                this.firebaseThreadItem(boxId, postId, item),
              ),
            ),
            replyCount,
          };
        }),
      );
      return { items, nextCursor: roots.nextCursor };
    } catch (error) {
      if (error instanceof NativePostError && error.code === 'UNAVAILABLE')
        throw unavailable('POST_NOT_FOUND');
      throw error;
    }
  }

  public async moreCommentReplies(
    boxId: string,
    postId: string,
    rootId: string,
    cursor?: string,
  ) {
    try {
      const page = await this.postsService.listCommentReplies(
        boxId,
        postId,
        rootId,
        this.uid,
        cursor,
      );
      return {
        items: await Promise.all(
          page.items.map((item) =>
            this.firebaseThreadItem(boxId, postId, item),
          ),
        ),
        nextCursor: page.nextCursor,
      };
    } catch (error) {
      if (error instanceof NativePostError && error.code === 'UNAVAILABLE')
        throw unavailable('COMMENT_NOT_FOUND');
      throw error;
    }
  }

  public async pinnedCommentThread(
    boxId: string,
    postId: string,
    commentId: string,
  ) {
    try {
      const detail = await this.postsService.commentDetail(
        boxId,
        postId,
        commentId,
        this.uid,
      );
      const rootId = detail.rootId;
      const root =
        detail.comment.parentId === null
          ? detail.comment
          : await this.postsService
              .commentDetail(boxId, postId, rootId, this.uid)
              .then((result) => result.comment)
              .catch((error: unknown) => {
                if (
                  error instanceof NativePostError &&
                  error.code === 'UNAVAILABLE'
                )
                  return null;
                throw error;
              });
      const replies = root
        ? await this.postsService.listCommentReplies(
            boxId,
            postId,
            rootId,
            this.uid,
            undefined,
            3,
          )
        : null;
      const preview = replies?.items ?? [];
      if (
        detail.comment.parentId !== null &&
        !preview.some(
          (item) => item.kind === 'comment' && item.comment.id === commentId,
        )
      )
        preview.push({ kind: 'comment', comment: detail.comment });
      return {
        root: root
          ? await this.firebaseThreadItem(boxId, postId, {
              kind: 'comment',
              comment: root,
            })
          : ({
              kind: 'deleted',
              id: rootId,
              createdAt: iso(detail.comment.createdAt),
            } as FirebaseThreadItem),
        rootId,
        replies: await Promise.all(
          preview.map((item) => this.firebaseThreadItem(boxId, postId, item)),
        ),
        replyCount: root
          ? await this.postsService.countCommentReplies(
              boxId,
              postId,
              rootId,
              this.uid,
            )
          : preview.length,
      } satisfies FirebaseCommentThread;
    } catch (error) {
      if (error instanceof NativePostError && error.code === 'UNAVAILABLE')
        return null;
      throw error;
    }
  }

  public async createComment(
    boxId: string,
    postId: string,
    content: string,
    parentId: string | null,
  ) {
    try {
      return await this.postsService.createComment(
        boxId,
        postId,
        this.uid,
        content,
        parentId,
      );
    } catch (error) {
      if (error instanceof NativePostError && error.code === 'UNAVAILABLE')
        throw unavailable('POST_NOT_FOUND');
      if (error instanceof NativePostError && error.code === 'INVALID')
        throw new ApiClientError(
          400,
          'VALIDATION_FAILED',
          'Check your comment.',
          null,
        );
      throw error;
    }
  }

  public async setCommentReaction(
    boxId: string,
    postId: string,
    commentId: string,
    kind: string | null,
  ) {
    try {
      await this.postsService.setReaction(
        boxId,
        postId,
        this.uid,
        kind,
        commentId,
      );
      return this.postsService.commentInteractionSummary(
        boxId,
        postId,
        commentId,
        this.uid,
      );
    } catch (error) {
      if (error instanceof NativePostError && error.code === 'UNAVAILABLE')
        throw unavailable('COMMENT_NOT_FOUND');
      throw error;
    }
  }

  public async deleteComment(boxId: string, postId: string, commentId: string) {
    try {
      return await this.postsService.deleteComment(
        boxId,
        postId,
        commentId,
        this.uid,
      );
    } catch (error) {
      if (error instanceof NativePostError && error.code === 'UNAVAILABLE')
        throw unavailable('COMMENT_NOT_FOUND');
      throw error;
    }
  }

  public async editComment(
    boxId: string,
    postId: string,
    commentId: string,
    content: string,
  ) {
    try {
      return await this.postsService.editComment(
        boxId,
        postId,
        commentId,
        this.uid,
        content,
      );
    } catch (error) {
      if (error instanceof NativePostError && error.code === 'UNAVAILABLE')
        throw unavailable('COMMENT_NOT_FOUND');
      if (error instanceof NativePostError && error.code === 'INVALID')
        throw new ApiClientError(
          400,
          'VALIDATION_FAILED',
          'Check your comment.',
          null,
        );
      throw error;
    }
  }

  public async createPost(
    boxId: string,
    body: { content: string; mediaAssetIds: string[] },
  ) {
    try {
      const id = await this.postsService.create(
        boxId,
        this.uid,
        body.content,
        Date.now(),
        body.mediaAssetIds,
      );
      // Publication is already committed; a failed projection remains retryable.
      await this.homeFeedService
        .processOnce(NativeHomeFeed.publishJobId(id))
        .catch(() => undefined);
      return id;
    } catch (error) {
      if (error instanceof NativePostError && error.code === 'UNAVAILABLE')
        throw unavailable('BOX_NOT_FOUND');
      if (error instanceof NativePostError && error.code === 'INVALID')
        throw new ApiClientError(
          400,
          'VALIDATION_FAILED',
          'Write something before posting.',
          null,
        );
      throw error;
    }
  }

  public async updatePost(postId: string, body: { content: string }) {
    try {
      const { post, kind } = await this.postsService.resolve(postId, this.uid);
      if (kind !== 'post') throw unavailable('POST_NOT_FOUND');
      return await this.postsService.edit(
        post.boxId,
        postId,
        this.uid,
        body.content,
      );
    } catch (error) {
      if (error instanceof NativePostError && error.code === 'UNAVAILABLE')
        throw unavailable('POST_NOT_FOUND');
      if (error instanceof NativePostError && error.code === 'INVALID')
        throw new ApiClientError(
          400,
          'VALIDATION_FAILED',
          'Write something before saving.',
          null,
        );
      throw error;
    }
  }

  public async deletePost(postId: string) {
    try {
      const { post, kind } = await this.postsService.resolve(postId, this.uid);
      if (kind !== 'post') throw unavailable('POST_NOT_FOUND');
      const mediaIds = await this.postsService.remove(
        post.boxId,
        postId,
        this.uid,
      );
      await Promise.all(mediaIds.map((id) => this.mediaService.retire(id)));
      await this.drainMediaPostCleanup(postId);
    } catch (error) {
      if (error instanceof NativePostError && error.code === 'UNAVAILABLE')
        throw unavailable('POST_NOT_FOUND');
      throw error;
    }
  }

  private async drainMediaPostCleanup(
    postId: string,
    left = 100,
  ): Promise<void> {
    if (left <= 0)
      throw new ApiClientError(
        409,
        'MEDIA_CLEANUP_PENDING',
        'Photo cleanup is still running.',
        null,
      );
    const result = await this.mediaService.cleanupPost(
      `media-post-cleanup-${postId}`,
    );
    if (result === 'pending')
      await this.drainMediaPostCleanup(postId, left - 1);
  }

  public async setPostReaction(
    boxId: string,
    postId: string,
    kind: string | null,
    mediaAssetId?: string,
  ) {
    try {
      const previousMediaId = await this.postsService.setReaction(
        boxId,
        postId,
        this.uid,
        kind,
        mediaAssetId ? { mediaAssetId } : undefined,
      );
      if (previousMediaId) await this.mediaService.retire(previousMediaId);
      return { kind };
    } catch (error) {
      if (error instanceof NativePostError && error.code === 'UNAVAILABLE')
        throw unavailable('POST_NOT_FOUND');
      if (error instanceof NativePostError && error.code === 'INVALID')
        throw new ApiClientError(
          400,
          'VALIDATION_FAILED',
          'Choose one emoji.',
          null,
        );
      throw error;
    }
  }

  public async createBox(body: { name: string }): Promise<BoxView> {
    return viewBox(await this.boxesService.create(this.uid, body.name));
  }

  public async box(boxId: string): Promise<BoxView> {
    try {
      return viewBox(await this.boxesService.get(boxId, this.uid));
    } catch (error) {
      boxAbsent(error);
    }
  }

  public async updateBox(
    boxId: string,
    body: { name?: string; status?: 'active' | 'archived' },
  ) {
    return viewBox(await this.boxesService.update(boxId, this.uid, body));
  }

  public async deleteBox(boxId: string, confirmName: string) {
    await this.deletionService.start(boxId, this.uid, confirmName);
    if (!(await this.drainDeletion(boxId, 100)))
      throw new ApiClientError(
        409,
        'BOX_DELETION_PENDING',
        'Box deletion is still running. Retry in a moment.',
        null,
      );
  }

  private async drainDeletion(
    boxId: string,
    remaining: number,
  ): Promise<boolean> {
    if (remaining === 0) return false;
    const phase = await this.deletionService
      .processOnce(boxId)
      .catch((error: unknown) => {
        if (
          error instanceof NativeBoxDeletionError &&
          error.code === 'DEPENDENCY_PENDING'
        )
          return null;
        throw error;
      });
    if (phase === 'complete') return true;
    if (phase === null) return false;
    return this.drainDeletion(boxId, remaining - 1);
  }

  public async boxMembers(boxId: string, page: PageOptions = {}) {
    const result = await this.membersService
      .list(boxId, this.uid, page.cursor, page.limit)
      .catch(boxAbsent);
    return {
      ...result,
      items: result.items.map((item): BoxMemberView => ({
        user: person(
          item.uid,
          item.username ?? item.uid,
          item.displayName ?? item.username ?? item.uid,
        ),
        role: item.role,
        status: 'active',
        joinedAt: iso(item.joinedAt),
      })),
    };
  }

  public async setBoxMemberRole(
    boxId: string,
    userId: string,
    role: 'admin' | 'member',
  ) {
    return this.boxesService.changeRole(boxId, this.uid, userId, role);
  }

  public async removeBoxMember(boxId: string, userId: string) {
    return this.boxesService.removeMember(boxId, this.uid, userId);
  }

  public async leaveBox(boxId: string) {
    return this.boxesService.removeMember(boxId, this.uid, this.uid);
  }

  public async transferBoxOwnership(boxId: string, userId: string) {
    return this.boxesService.transfer(boxId, this.uid, userId);
  }

  public async inviteToBox(boxId: string, username: string) {
    return this.invitationsService.inviteByUsername(boxId, this.uid, username);
  }

  public async revokeBoxInvitation(boxId: string, invitationId: string) {
    return this.invitationsService.revoke(invitationId, boxId, this.uid);
  }

  public async acceptBoxInvitation(invitationId: string) {
    const boxId = await this.invitationsService.accept(invitationId, this.uid);
    const member = await this.services.db
      .collection('nativeBoxes')
      .doc(boxId)
      .collection('members')
      .doc(this.uid)
      .get();
    const joinedAt = member.get('joinedAt') as number | undefined;
    if (joinedAt !== undefined) {
      const jobId = NativeHomeFeed.joinJobId(boxId, this.uid, joinedAt);
      for (let i = 0; i < 8; i += 1) {
        try {
          // eslint-disable-next-line no-await-in-loop -- Each page advances the same durable cursor.
          if ((await this.homeFeedService.processOnce(jobId)) === 'complete')
            break;
        } catch {
          // Membership is committed; the durable job remains available for repair.
          break;
        }
      }
    }
    return boxId;
  }

  public async declineBoxInvitation(invitationId: string) {
    return this.invitationsService.decline(invitationId, this.uid);
  }

  public async myBoxInvitations(page: PageOptions = {}) {
    const result = await this.invitationsService.listPending(
      this.uid,
      page.cursor,
      Date.now(),
      page.limit,
    );
    const current = await this.profilesService.current(this.uid);
    const invitee = person(
      this.uid,
      current.profile.username ?? this.uid,
      current.profile.displayName ?? current.profile.username ?? this.uid,
    );
    return {
      ...result,
      items: result.items.map((item): BoxInvitationView => ({
        id: item.id,
        box: { id: item.boxId, name: item.boxName },
        inviter: person(
          item.inviterUid,
          item.inviterUsername,
          item.inviterDisplayName,
        ),
        invitee,
        expiresAt: iso(item.expiresAt),
        createdAt: iso(item.createdAt),
      })),
    };
  }

  public async boxInvitations(boxId: string, page: PageOptions = {}) {
    const box = await this.box(boxId);
    const result = await this.invitationsService
      .listForBox(boxId, this.uid, page.cursor, Date.now(), page.limit)
      .catch(boxAbsent);
    return {
      ...result,
      items: result.items.map((item): BoxInvitationView => ({
        id: item.id,
        box: { id: boxId, name: box.name },
        inviter: person(
          item.inviterUid,
          item.inviterUsername ?? item.inviterUid,
          item.inviterDisplayName ?? item.inviterUsername ?? item.inviterUid,
        ),
        invitee: person(
          item.inviteeUid,
          item.inviteeUsername ?? item.inviteeUid,
          item.inviteeDisplayName ?? item.inviteeUsername ?? item.inviteeUid,
        ),
        expiresAt: iso(item.expiresAt),
        createdAt: iso(item.createdAt),
      })),
    };
  }
}

export async function firebaseWebData(): Promise<FirebaseWebData> {
  const uid = await firebaseSessionUid();
  if (!uid)
    throw new ApiClientError(401, 'AUTHENTICATION_REQUIRED', 'Sign in.', null);
  return new FirebaseWebData(uid);
}

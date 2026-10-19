import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  friendships,
  mediaAssets,
  profiles,
  rooms,
  roomTopFriends,
  roomWidgets,
  userPreferences,
  users,
  type PaldoraDatabase,
} from '@paldora/database';
import type {
  RoomConfiguration,
  RoomId,
  RoomTopFriend,
  RoomView,
  UpdateRoomInput,
  UpdateRoomTopFriendsInput,
  UpdateRoomWidgetsInput,
  UpdateUserPreferencesInput,
  UserId,
  UserPreferences,
} from '@paldora/domain';
import type { ObjectStorage } from '@paldora/storage';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { ApiError } from './api-error.js';
import { InfrastructureService } from './infrastructure.service.js';
import { ProfileAvatarService } from './profile-avatar.service.js';
import {
  type AuthorizedRoom,
  RoomAuthorizationPolicy,
} from './room-authorization-policy.service.js';
import { OBJECT_STORAGE } from './storage.provider.js';

const DEFAULT_WIDGETS = [
  ['currently', 'sidebar'],
  ['music', 'sidebar'],
  ['top_friends', 'sidebar'],
  ['photos', 'sidebar'],
  ['life_updates', 'main'],
  ['posts', 'main'],
  ['memories', 'main'],
] as const;

@Injectable()
export class RoomService {
  private readonly database: PaldoraDatabase;

  public constructor(
    @Inject(InfrastructureService) infrastructure: InfrastructureService,
    @Inject(RoomAuthorizationPolicy)
    private readonly policy: RoomAuthorizationPolicy,
    @Inject(ProfileAvatarService)
    private readonly avatars: ProfileAvatarService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {
    this.database = infrastructure.databaseClient;
  }

  public async mine(userId: UserId): Promise<RoomView> {
    await this.ensure(userId);
    const [profile] = await this.database
      .select({ username: profiles.username })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);
    if (!profile?.username) this.policy.notFound();
    return this.view(userId, profile.username);
  }

  public async view(viewerUserId: UserId, username: string): Promise<RoomView> {
    const access = await this.policy.requireVisible(viewerUserId, username);
    return this.map(access);
  }

  public async update(
    userId: UserId,
    input: UpdateRoomInput,
  ): Promise<RoomView> {
    await this.ensure(userId);
    const [updated] = await this.database
      .update(rooms)
      .set(this.roomUpdates(input))
      .where(this.ownerVersion(userId, input.expectedUpdatedAt))
      .returning({ userId: rooms.userId });
    if (!updated) this.stale();
    return this.mine(userId);
  }

  private roomUpdates(
    input: UpdateRoomInput,
  ): Partial<typeof rooms.$inferInsert> {
    return {
      ...this.roomStyleUpdates(input),
      ...this.roomCopyUpdates(input),
      ...this.roomMusicUpdates(input),
      updatedAt: new Date(),
    };
  }

  private roomStyleUpdates(
    input: UpdateRoomInput,
  ): Partial<typeof rooms.$inferInsert> {
    return {
      ...(input.visibility === undefined
        ? {}
        : { visibility: input.visibility }),
      ...(input.themePreset === undefined
        ? {}
        : { themePreset: input.themePreset }),
      ...(input.layout === undefined ? {} : { layout: input.layout }),
      ...(input.accent === undefined ? {} : { accent: input.accent }),
      ...(input.background === undefined
        ? {}
        : { background: input.background }),
      ...(input.font === undefined ? {} : { font: input.font }),
      ...(input.decorationPack === undefined
        ? {}
        : { decorationPack: input.decorationPack }),
      ...(input.sparkles === undefined ? {} : { sparkles: input.sparkles }),
    };
  }

  private roomCopyUpdates(
    input: UpdateRoomInput,
  ): Partial<typeof rooms.$inferInsert> {
    return {
      ...(input.location === undefined
        ? {}
        : { location: input.location?.trim() || null }),
      ...(input.currently === undefined
        ? {}
        : { currently: input.currently?.trim() || null }),
    };
  }

  private roomMusicUpdates(
    input: UpdateRoomInput,
  ): Partial<typeof rooms.$inferInsert> {
    if (input.music === undefined) return {};
    return {
      musicUrl: input.music?.url ?? null,
      musicTitle: input.music?.title?.trim() || null,
      musicArtist: input.music?.artist?.trim() || null,
    };
  }

  public async updateWidgets(
    userId: UserId,
    input: UpdateRoomWidgetsInput,
  ): Promise<RoomView> {
    await this.ensure(userId);
    await this.database.transaction(async (tx) => {
      const [locked] = await tx
        .select({ updatedAt: rooms.updatedAt })
        .from(rooms)
        .where(eq(rooms.userId, userId))
        .for('update')
        .limit(1);
      if (
        !locked ||
        !this.versionMatches(locked.updatedAt, input.expectedUpdatedAt)
      )
        this.stale();
      await tx.delete(roomWidgets).where(eq(roomWidgets.roomUserId, userId));
      await tx.insert(roomWidgets).values(
        input.widgets.map((widget) => ({
          roomUserId: userId,
          widgetType: widget.type,
          placement: widget.placement,
          position: widget.position,
          enabled: widget.enabled,
        })),
      );
      await tx
        .update(rooms)
        .set({ updatedAt: new Date() })
        .where(eq(rooms.userId, userId));
    });
    return this.mine(userId);
  }

  public async updateTopFriends(
    userId: UserId,
    input: UpdateRoomTopFriendsInput,
  ): Promise<RoomView> {
    await this.ensure(userId);
    await this.database.transaction(async (tx) => {
      const [locked] = await tx
        .select({ updatedAt: rooms.updatedAt })
        .from(rooms)
        .where(eq(rooms.userId, userId))
        .for('update')
        .limit(1);
      if (
        !locked ||
        !this.versionMatches(locked.updatedAt, input.expectedUpdatedAt)
      )
        this.stale();
      if (input.userIds.length > 0) {
        const accepted = await tx
          .select({ low: friendships.userLowId, high: friendships.userHighId })
          .from(friendships)
          .where(
            and(
              eq(friendships.status, 'accepted'),
              or(
                and(
                  eq(friendships.userLowId, userId),
                  inArray(friendships.userHighId, input.userIds),
                ),
                and(
                  eq(friendships.userHighId, userId),
                  inArray(friendships.userLowId, input.userIds),
                ),
              ),
            ),
          );
        const eligible = new Set(
          accepted.map(({ low, high }) => (low === userId ? high : low)),
        );
        const active = await tx
          .select({ id: users.id })
          .from(users)
          .where(
            and(inArray(users.id, input.userIds), eq(users.status, 'active')),
          );
        const activeIds = new Set(active.map(({ id }) => id));
        if (input.userIds.some((id) => !eligible.has(id) || !activeIds.has(id)))
          this.ineligible();
      }
      await tx
        .delete(roomTopFriends)
        .where(eq(roomTopFriends.roomUserId, userId));
      if (input.userIds.length > 0)
        await tx.insert(roomTopFriends).values(
          input.userIds.map((friendUserId, position) => ({
            roomUserId: userId,
            friendUserId,
            position,
          })),
        );
      await tx
        .update(rooms)
        .set({
          topFriendsSize: input.size,
          topFriendsVisibility: input.visibility,
          updatedAt: new Date(),
        })
        .where(eq(rooms.userId, userId));
    });
    return this.mine(userId);
  }

  public async preferences(userId: UserId): Promise<UserPreferences> {
    await this.ensure(userId);
    const [value] = await this.database
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);
    if (!value) throw new Error('User preferences were not provisioned.');
    return {
      appearance: value.appearance,
      updatedAt: value.updatedAt.toISOString(),
    };
  }

  public async updatePreferences(
    userId: UserId,
    input: UpdateUserPreferencesInput,
  ): Promise<UserPreferences> {
    await this.ensure(userId);
    await this.database
      .update(userPreferences)
      .set({ appearance: input.appearance, updatedAt: new Date() })
      .where(eq(userPreferences.userId, userId));
    return this.preferences(userId);
  }

  public async ensure(userId: UserId): Promise<void> {
    await this.database.transaction(async (tx) => {
      await tx.insert(rooms).values({ userId }).onConflictDoNothing();
      await tx.insert(userPreferences).values({ userId }).onConflictDoNothing();
      await tx
        .insert(roomWidgets)
        .values(
          DEFAULT_WIDGETS.map(([widgetType, placement], position) => ({
            roomUserId: userId,
            widgetType,
            placement,
            position,
          })),
        )
        .onConflictDoNothing();
    });
  }

  private async map(access: AuthorizedRoom): Promise<RoomView> {
    const [widgets, topFriends, avatarUrl, bannerUrl] = await Promise.all([
      this.database
        .select()
        .from(roomWidgets)
        .where(eq(roomWidgets.roomUserId, access.room.userId))
        .orderBy(roomWidgets.position),
      this.topFriends(access),
      this.avatars.forUser(access.room.userId as UserId),
      this.bannerUrl(access.room.bannerMediaId),
    ]);
    return {
      id: access.room.userId as RoomId,
      ownerUserId: access.room.userId as UserId,
      owner: {
        userId: access.room.userId as UserId,
        username: access.profile.username,
        displayName: access.profile.displayName,
        bio: access.profile.bio,
        avatarUrl,
      },
      visibility: access.room.visibility,
      themePreset: access.room.themePreset as RoomConfiguration['themePreset'],
      configurationVersion: 1,
      layout: access.room.layout,
      accent: access.room.accent,
      background: access.room.background,
      font: access.room.font,
      decorationPack: access.room.decorationPack,
      sparkles: access.room.sparkles,
      location: access.room.location,
      currently: access.room.currently,
      music: access.room.musicUrl
        ? {
            url: access.room.musicUrl,
            title: access.room.musicTitle,
            artist: access.room.musicArtist,
          }
        : null,
      bannerMediaId: access.room
        .bannerMediaId as RoomConfiguration['bannerMediaId'],
      bannerUrl,
      topFriendsSize: access.room
        .topFriendsSize as RoomConfiguration['topFriendsSize'],
      topFriendsVisibility: access.room.topFriendsVisibility,
      widgets: widgets.map((widget) => ({
        type: widget.widgetType as RoomConfiguration['widgets'][number]['type'],
        placement: widget.placement,
        position: widget.position,
        enabled: widget.enabled,
      })),
      topFriends,
      viewerRelationship: access.relationship,
      createdAt: access.room.createdAt.toISOString(),
      updatedAt: access.room.updatedAt.toISOString(),
    };
  }

  private async topFriends(access: AuthorizedRoom): Promise<RoomTopFriend[]> {
    const visible =
      access.relationship === 'owner' ||
      access.room.topFriendsVisibility === 'visible' ||
      (access.room.topFriendsVisibility === 'friends' &&
        access.relationship === 'friend');
    if (!visible) return [];
    const rows = await this.database
      .select({ selection: roomTopFriends, profile: profiles })
      .from(roomTopFriends)
      .innerJoin(profiles, eq(profiles.userId, roomTopFriends.friendUserId))
      .innerJoin(users, eq(users.id, profiles.userId))
      .innerJoin(
        friendships,
        and(
          eq(friendships.status, 'accepted'),
          or(
            and(
              eq(friendships.userLowId, access.room.userId),
              eq(friendships.userHighId, roomTopFriends.friendUserId),
            ),
            and(
              eq(friendships.userHighId, access.room.userId),
              eq(friendships.userLowId, roomTopFriends.friendUserId),
            ),
          ),
        ),
      )
      .where(
        and(
          eq(roomTopFriends.roomUserId, access.room.userId),
          eq(users.status, 'active'),
        ),
      )
      .orderBy(roomTopFriends.position)
      .limit(access.room.topFriendsSize);
    const avatarUrls = await this.avatars.forUsers(
      rows.map(({ selection }) => selection.friendUserId as UserId),
    );
    return rows.map(({ selection, profile }) => ({
      userId: selection.friendUserId as UserId,
      username: profile.username ?? '',
      displayName: profile.displayName ?? profile.username ?? 'Paldora friend',
      avatarUrl: avatarUrls.get(selection.friendUserId as UserId) ?? null,
      position: selection.position,
    }));
  }

  private async bannerUrl(mediaAssetId: string | null): Promise<string | null> {
    if (!mediaAssetId) return null;
    const [asset] = await this.database
      .select({ status: mediaAssets.status, key: mediaAssets.displayObjectKey })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.id, mediaAssetId),
          eq(mediaAssets.purpose, 'room_banner'),
        ),
      )
      .limit(1);
    return asset?.status === 'ready' && asset.key
      ? this.storage.createSignedDownload(asset.key, 900).catch(() => null)
      : null;
  }

  private ownerVersion(userId: UserId, expected?: string) {
    return and(
      eq(rooms.userId, userId),
      expected
        ? sql`date_trunc('milliseconds', ${rooms.updatedAt}) = ${new Date(expected)}`
        : undefined,
    );
  }

  private versionMatches(actual: Date, expected?: string): boolean {
    return !expected || actual.getTime() === new Date(expected).getTime();
  }

  private stale(): never {
    throw new ApiError(
      HttpStatus.CONFLICT,
      'ROOM_UPDATE_STALE',
      'This Room changed elsewhere. Refresh before saving again.',
    );
  }

  private ineligible(): never {
    throw new ApiError(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'TOP_FRIEND_NOT_ELIGIBLE',
      'Top Friends must be active accepted friends.',
    );
  }
}

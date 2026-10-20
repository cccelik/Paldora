import { Inject, Injectable } from '@nestjs/common';
import {
  mediaAssets,
  profiles,
  roomAccessConditions,
  rooms,
  users,
  type MediaAssetRow,
} from '@paldora/database';
import type { RoomRelationship } from '@paldora/domain';
import { normalizeUsername, roomParamsSchema } from '@paldora/validation';
import { and, eq, isNotNull, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Infrastructure } from '../platform/infrastructure.service.js';
import { cursorTimestamp } from '../platform/pagination.js';
import { INFRASTRUCTURE } from '../platform/tokens.js';
import { roomNotFound } from './room-errors.js';
import {
  DEFAULT_ROOM_STATE,
  roomSettingsColumns,
  settingsOf,
  type RoomState,
} from './room-records.js';

type AvatarKeys = Pick<MediaAssetRow, 'id' | 'status' | 'thumbnailObjectKey'>;
export type BannerKeys = Pick<
  MediaAssetRow,
  'id' | 'status' | 'displayObjectKey' | 'thumbnailObjectKey'
>;

export interface RoomOwner {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly bio: string | null;
  readonly avatar: AvatarKeys | null;
}

/** A Room the viewer may see, and how they are related to its owner. */
export interface RoomAccess {
  readonly viewerId: string;
  readonly relationship: RoomRelationship;
  readonly owner: RoomOwner;
  readonly room: RoomState;
  /** The banner asset's keys; signed only after this access decision. */
  readonly banner: BannerKeys | null;
}

/** The relationship facts the access query computes for every request. */
export interface AccessFacts {
  readonly isOwner: boolean;
  readonly isFriend: boolean;
  readonly sharesBox: boolean;
  readonly blocked: boolean;
}

/**
 * The audience rule (plan §D, B2/B3). Tiers nest: hidden ⊂ friends ⊂
 * members. A block in either direction denies at every tier; the owner
 * always sees their own Room. Null means "not visible", whatever the
 * reason, so every denial becomes the same ROOM_NOT_FOUND.
 */
export function relationshipFor(
  visibility: RoomState['settings']['visibility'],
  facts: AccessFacts,
): RoomRelationship | null {
  if (facts.isOwner) return 'owner';
  if (facts.blocked || visibility === 'hidden') return null;
  if (facts.isFriend) return 'friend';
  return visibility === 'members' && facts.sharesBox ? 'member' : null;
}

const ownerAvatar = alias(mediaAssets, 'room_owner_avatar');
const bannerAsset = alias(mediaAssets, 'room_banner_asset');

/**
 * The only place a Room's audience is decided. Every Room route starts
 * here: one statement resolves the owner (active, with a username), their
 * Room row (or the defaults), and every relationship fact, whatever the
 * outcome, so each denial does the same work and throws the same error.
 */
@Injectable()
export class RoomAccessService {
  public constructor(
    @Inject(INFRASTRUCTURE) private readonly infrastructure: Infrastructure,
  ) {}

  /**
   * The Room at `/rooms/{rawUsername}` as `viewerId` may see it. The name is
   * taken leniently: one that could never be a username (too long, any
   * characters) is simply not found, never a validation error.
   */
  public async resolve(
    viewerId: string,
    rawUsername: string,
  ): Promise<RoomAccess> {
    const parsed = roomParamsSchema.shape.username.safeParse(rawUsername);
    // An empty normalized name matches nobody (usernames have 3+ characters).
    const normalized = parsed.success ? normalizeUsername(parsed.data) : '';
    return this.load(viewerId, eq(profiles.usernameNormalized, normalized));
  }

  /** The caller's own Room; ROOM_NOT_FOUND until they have a username. */
  public own(userId: string): Promise<RoomAccess> {
    return this.load(userId, eq(users.id, userId));
  }

  private async load(viewerId: string, owner: SQL): Promise<RoomAccess> {
    const facts = roomAccessConditions(viewerId, users.id);
    const [row] = await this.infrastructure.database
      .select({
        owner: {
          id: users.id,
          username: profiles.username,
          displayName: profiles.displayName,
          bio: profiles.bio,
        },
        avatar: {
          id: ownerAvatar.id,
          status: ownerAvatar.status,
          thumbnailObjectKey: ownerAvatar.thumbnailObjectKey,
        },
        banner: {
          id: bannerAsset.id,
          status: bannerAsset.status,
          displayObjectKey: bannerAsset.displayObjectKey,
          thumbnailObjectKey: bannerAsset.thumbnailObjectKey,
        },
        room: roomSettingsColumns,
        version: cursorTimestamp(rooms.updatedAt),
        isOwner: sql<boolean>`${users.id} = ${viewerId}::uuid`,
        isFriend: sql<boolean>`${facts.isFriend}`,
        sharesBox: sql<boolean>`${facts.sharesBox}`,
        blocked: sql<boolean>`${facts.blocked}`,
      })
      .from(profiles)
      .innerJoin(users, eq(users.id, profiles.userId))
      .leftJoin(rooms, eq(rooms.userId, users.id))
      .leftJoin(ownerAvatar, eq(ownerAvatar.id, profiles.avatarMediaId))
      .leftJoin(bannerAsset, eq(bannerAsset.id, rooms.bannerMediaId))
      .where(
        and(owner, isNotNull(profiles.username), eq(users.status, 'active')),
      )
      .limit(1);
    if (!row?.owner.username) throw roomNotFound();
    const room: RoomState = row.room
      ? {
          settings: settingsOf(row.room),
          version: row.version,
        }
      : DEFAULT_ROOM_STATE;
    const relationship = relationshipFor(room.settings.visibility, row);
    if (!relationship) throw roomNotFound();
    return {
      viewerId,
      relationship,
      owner: {
        ...row.owner,
        username: row.owner.username,
        displayName: row.owner.displayName ?? row.owner.username,
        avatar: row.avatar,
      },
      room,
      banner: row.banner,
    };
  }
}

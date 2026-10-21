import { Inject, Injectable } from '@nestjs/common';
import {
  mediaAssets,
  profiles,
  userPreferences,
  users,
  type PaldoraDatabase,
} from '@paldora/database';
import { DEFAULT_REACTION_PRESETS, type UserId } from '@paldora/domain';
import type { CurrentUser } from '@paldora/validation';
import { and, eq, exists, gt, isNull, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { MediaUrlService } from '../media/media-urls.service.js';
import { DATABASE } from '../platform/config/tokens.js';

const newerAvatar = alias(mediaAssets, 'newer_avatar');

/** Reads the signed-in user's own account view. Never used for other users. */
@Injectable()
export class CurrentUserService {
  public constructor(
    @Inject(DATABASE) private readonly database: PaldoraDatabase,
    @Inject(MediaUrlService) private readonly mediaUrls: MediaUrlService,
  ) {}

  public async load(userId: UserId): Promise<CurrentUser> {
    const [row] = await this.database
      .select({
        user: users,
        profile: profiles,
        appearance: userPreferences.appearance,
        reactionPresets: userPreferences.reactionPresets,
        avatar: {
          id: mediaAssets.id,
          status: mediaAssets.status,
          displayObjectKey: mediaAssets.displayObjectKey,
          thumbnailObjectKey: mediaAssets.thumbnailObjectKey,
          createdAt: mediaAssets.createdAt,
        },
        avatarProcessing: sql<boolean>`${exists(
          this.database
            .select({ one: sql`1` })
            .from(newerAvatar)
            .where(
              and(
                eq(newerAvatar.ownerUserId, users.id),
                eq(newerAvatar.purpose, 'avatar'),
                eq(newerAvatar.status, 'processing'),
                or(
                  isNull(mediaAssets.createdAt),
                  gt(newerAvatar.createdAt, mediaAssets.createdAt),
                ),
              ),
            ),
        )}`,
      })
      .from(users)
      .innerJoin(profiles, eq(profiles.userId, users.id))
      .leftJoin(userPreferences, eq(userPreferences.userId, users.id))
      .leftJoin(mediaAssets, eq(mediaAssets.id, profiles.avatarMediaId))
      .where(eq(users.id, userId))
      .limit(1);
    // The guard resolved this user moments ago; a missing profile is a
    // provisioning defect, not a client error.
    if (!row) throw new Error('Provisioned user has no profile.');
    return {
      user: {
        id: row.user.id,
        email: row.user.email,
        status: row.user.status,
        createdAt: row.user.createdAt.toISOString(),
      },
      profile: {
        username: row.profile.username,
        displayName: row.profile.displayName,
        bio: row.profile.bio,
        avatar: await this.mediaUrls.sign(row.avatar),
        avatarProcessing: row.avatarProcessing,
        onboardingState: row.profile.onboardingState,
        updatedAt: row.profile.updatedAt.toISOString(),
      },
      // A missing preferences row means "all defaults".
      preferences: {
        appearance: row.appearance ?? 'system',
        reactionPresets: row.reactionPresets ?? [...DEFAULT_REACTION_PRESETS],
      },
    };
  }
}

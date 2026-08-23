import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  mediaAssets,
  profiles,
  users,
  type PaldoraDatabase,
} from '@paldora/database';
import type {
  CurrentUser,
  MediaAsset,
  MediaAssetId,
  UpdateProfileInput,
  UserId,
  UsernameAvailability,
} from '@paldora/domain';
import type { ObjectStorage } from '@paldora/storage';
import {
  isReservedUsername,
  normalizeUsername,
  usernameSchema,
} from '@paldora/validation';
import { and, eq, ne } from 'drizzle-orm';
import { ApiError } from './api-error.js';
import { isUniqueViolation } from './database-errors.js';
import { InfrastructureService } from './infrastructure.service.js';

@Injectable()
export class UserService {
  private readonly database: PaldoraDatabase;

  public constructor(
    @Inject(InfrastructureService) infrastructure: InfrastructureService,
  ) {
    this.database = infrastructure.databaseClient;
  }

  public async getCurrentUser(
    userId: UserId,
    storage?: ObjectStorage,
  ): Promise<CurrentUser> {
    const [row] = await this.database
      .select({ user: users, profile: profiles, avatar: mediaAssets })
      .from(users)
      .innerJoin(profiles, eq(profiles.userId, users.id))
      .leftJoin(mediaAssets, eq(profiles.avatarMediaId, mediaAssets.id))
      .where(eq(users.id, userId))
      .limit(1);
    if (!row) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        'USER_NOT_FOUND',
        'User not found.',
      );
    }
    const avatarUrl =
      storage && row.avatar?.status === 'ready'
        ? await storage.createSignedDownload(row.avatar.objectKey, 900)
        : null;
    return {
      user: {
        id: row.user.id as UserId,
        email: row.user.email,
        status: row.user.status,
        createdAt: row.user.createdAt.toISOString(),
        updatedAt: row.user.updatedAt.toISOString(),
      },
      profile: {
        userId: row.user.id as UserId,
        username: row.profile.username,
        displayName: row.profile.displayName,
        bio: row.profile.bio,
        avatarUrl,
        onboardingState: row.profile.onboardingState,
        createdAt: row.profile.createdAt.toISOString(),
        updatedAt: row.profile.updatedAt.toISOString(),
      },
    };
  }

  public async checkUsername(
    userId: UserId,
    username: string,
  ): Promise<UsernameAvailability> {
    const parsed = usernameSchema.safeParse(username);
    const normalized = normalizeUsername(username);
    if (!parsed.success)
      return { username, normalized, available: false, reason: 'invalid' };
    if (isReservedUsername(username))
      return { username, normalized, available: false, reason: 'reserved' };
    const [taken] = await this.database
      .select({ userId: profiles.userId })
      .from(profiles)
      .where(
        and(
          eq(profiles.usernameNormalized, normalized),
          ne(profiles.userId, userId),
        ),
      )
      .limit(1);
    return {
      username,
      normalized,
      available: !taken,
      ...(!taken ? {} : { reason: 'taken' as const }),
    };
  }

  public async updateProfile(
    userId: UserId,
    input: UpdateProfileInput,
    storage?: ObjectStorage,
  ): Promise<CurrentUser> {
    const [existing] = await this.database
      .select({
        username: profiles.username,
        displayName: profiles.displayName,
        onboardingState: profiles.onboardingState,
      })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);
    if (!existing) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        'PROFILE_NOT_FOUND',
        'Profile not found.',
      );
    }
    if (input.username) {
      const availability = await this.checkUsername(userId, input.username);
      if (!availability.available) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'USERNAME_UNAVAILABLE',
          'That username is unavailable.',
        );
      }
    }
    if (input.onboardingState) {
      const rank = { username: 0, profile: 1, avatar: 2, complete: 3 } as const;
      if (rank[input.onboardingState] < rank[existing.onboardingState]) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'INVALID_ONBOARDING_TRANSITION',
          'Completed onboarding steps cannot be reopened through the API.',
        );
      }
      const nextUsername = input.username ?? existing.username;
      const nextDisplayName = input.displayName ?? existing.displayName;
      if (rank[input.onboardingState] >= 1 && !nextUsername) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'ONBOARDING_INCOMPLETE',
          'Choose a username before continuing.',
        );
      }
      if (rank[input.onboardingState] >= 2 && !nextDisplayName?.trim()) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          'ONBOARDING_INCOMPLETE',
          'Add a display name before continuing.',
        );
      }
    }
    try {
      await this.database
        .update(profiles)
        .set({
          ...(input.username
            ? {
                username: input.username.trim(),
                usernameNormalized: normalizeUsername(input.username),
              }
            : {}),
          ...(input.displayName !== undefined
            ? { displayName: input.displayName.trim() }
            : {}),
          ...(input.bio !== undefined
            ? { bio: input.bio?.trim() || null }
            : {}),
          ...(input.onboardingState
            ? { onboardingState: input.onboardingState }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(profiles.userId, userId));
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiError(
          HttpStatus.CONFLICT,
          'USERNAME_UNAVAILABLE',
          'That username is unavailable.',
        );
      }
      throw error;
    }
    return this.getCurrentUser(userId, storage);
  }

  public mapMediaAsset(row: typeof mediaAssets.$inferSelect): MediaAsset {
    return {
      id: row.id as MediaAssetId,
      ownerUserId: row.ownerUserId as UserId,
      purpose: 'avatar',
      contentType: row.contentType as MediaAsset['contentType'],
      contentLength: row.contentLength,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

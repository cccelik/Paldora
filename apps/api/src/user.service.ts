import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  profiles,
  users,
  type mediaAssets,
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
import {
  isReservedUsername,
  normalizeUsername,
  usernameSchema,
} from '@paldora/validation';
import { and, eq, ne } from 'drizzle-orm';
import { ApiError } from './api-error.js';
import { isUniqueViolation } from './database-errors.js';
import { InfrastructureService } from './infrastructure.service.js';
import { ProfileAvatarService } from './profile-avatar.service.js';

const onboardingRank = {
  username: 0,
  profile: 1,
  avatar: 2,
  complete: 3,
} as const;

@Injectable()
export class UserService {
  private readonly database: PaldoraDatabase;

  public constructor(
    @Inject(InfrastructureService) infrastructure: InfrastructureService,
    @Inject(ProfileAvatarService)
    private readonly avatars: ProfileAvatarService,
  ) {
    this.database = infrastructure.databaseClient;
  }

  public async getCurrentUser(userId: UserId): Promise<CurrentUser> {
    const [row] = await this.database
      .select({ user: users, profile: profiles })
      .from(users)
      .innerJoin(profiles, eq(profiles.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1);
    if (!row) {
      throw new ApiError(
        HttpStatus.NOT_FOUND,
        'USER_NOT_FOUND',
        'User not found.',
      );
    }
    const avatarUrl = await this.avatars.forUser(userId);
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
    if (input.username !== undefined)
      await this.assertUsernameAvailable(userId, input.username);
    this.assertOnboardingTransition(existing, input);
    try {
      await this.database
        .update(profiles)
        .set(this.profileUpdates(input))
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
    return this.getCurrentUser(userId);
  }

  private async assertUsernameAvailable(
    userId: UserId,
    username: string,
  ): Promise<void> {
    const availability = await this.checkUsername(userId, username);
    if (availability.available) return;
    throw new ApiError(
      HttpStatus.CONFLICT,
      'USERNAME_UNAVAILABLE',
      'That username is unavailable.',
    );
  }

  private assertOnboardingTransition(
    existing: Pick<
      typeof profiles.$inferSelect,
      'username' | 'displayName' | 'onboardingState'
    >,
    input: UpdateProfileInput,
  ): void {
    const nextState = input.onboardingState;
    if (!nextState) return;
    if (onboardingRank[nextState] < onboardingRank[existing.onboardingState]) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'INVALID_ONBOARDING_TRANSITION',
        'Completed onboarding steps cannot be reopened through the API.',
      );
    }
    const nextUsername = input.username ?? existing.username;
    if (onboardingRank[nextState] >= onboardingRank.profile && !nextUsername) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'ONBOARDING_INCOMPLETE',
        'Choose a username before continuing.',
      );
    }
    const nextDisplayName = input.displayName ?? existing.displayName;
    if (
      onboardingRank[nextState] >= onboardingRank.avatar &&
      !nextDisplayName?.trim()
    ) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        'ONBOARDING_INCOMPLETE',
        'Add a display name before continuing.',
      );
    }
  }

  private profileUpdates(
    input: UpdateProfileInput,
  ): Partial<typeof profiles.$inferInsert> {
    return {
      ...(input.username !== undefined
        ? {
            username: input.username.trim(),
            usernameNormalized: normalizeUsername(input.username),
          }
        : {}),
      ...(input.displayName !== undefined
        ? { displayName: input.displayName.trim() }
        : {}),
      ...(input.bio !== undefined ? { bio: input.bio?.trim() || null } : {}),
      ...(input.onboardingState !== undefined
        ? { onboardingState: input.onboardingState }
        : {}),
      updatedAt: new Date(),
    };
  }

  public mapMediaAsset(row: typeof mediaAssets.$inferSelect): MediaAsset {
    return {
      id: row.id as MediaAssetId,
      ownerUserId: row.ownerUserId as UserId,
      purpose: row.purpose as MediaAsset['purpose'],
      contentType: row.contentType as MediaAsset['contentType'],
      contentLength: row.contentLength,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

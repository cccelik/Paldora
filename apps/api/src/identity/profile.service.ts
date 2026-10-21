import { Inject, Injectable } from '@nestjs/common';
import {
  profiles,
  type PaldoraDatabase,
  type ProfileRow,
} from '@paldora/database';
import { onboardingRank, type UserId } from '@paldora/domain';
import {
  isReservedUsername,
  normalizeUsername,
  usernameSchema,
  type UpdateProfileInput,
  type UsernameAvailability,
} from '@paldora/validation';
import { and, eq, ne } from 'drizzle-orm';
import {
  isCheckViolation,
  isUniqueViolation,
} from '../platform/db/database-errors.js';
import { DATABASE } from '../platform/config/tokens.js';
import {
  invalidOnboardingTransition,
  onboardingIncomplete,
  usernameUnavailable,
} from './identity-errors.js';

type ProfileUpdate = Partial<typeof profiles.$inferInsert>;

/**
 * Onboarding rules: the state only moves forward, and it can only pass a
 * step whose data exists. The database enforces the second rule as well
 * (`profiles_onboarding_requirements_check`).
 */
export function assertOnboardingTransition(
  existing: Pick<ProfileRow, 'username' | 'displayName' | 'onboardingState'>,
  input: UpdateProfileInput,
): void {
  const next = input.onboardingState;
  if (!next) return;
  if (onboardingRank(next) < onboardingRank(existing.onboardingState)) {
    throw invalidOnboardingTransition();
  }
  if (
    onboardingRank(next) >= onboardingRank('profile') &&
    !(input.username ?? existing.username)
  ) {
    throw onboardingIncomplete('Choose a username before continuing.');
  }
  if (
    onboardingRank(next) >= onboardingRank('avatar') &&
    !(input.displayName ?? existing.displayName)
  ) {
    throw onboardingIncomplete('Add a display name before continuing.');
  }
}

function profileUpdate(input: UpdateProfileInput): ProfileUpdate {
  return {
    ...(input.username !== undefined
      ? {
          username: input.username,
          usernameNormalized: normalizeUsername(input.username),
        }
      : {}),
    ...(input.displayName !== undefined
      ? { displayName: input.displayName }
      : {}),
    ...(input.bio !== undefined ? { bio: input.bio } : {}),
    ...(input.onboardingState !== undefined
      ? { onboardingState: input.onboardingState }
      : {}),
    updatedAt: new Date(),
  };
}

@Injectable()
export class ProfileService {
  public constructor(
    @Inject(DATABASE) private readonly database: PaldoraDatabase,
  ) {}

  /** Advisory only: the unique index decides when the profile is saved. */
  public async usernameAvailability(
    userId: UserId,
    username: string,
  ): Promise<UsernameAvailability> {
    if (!usernameSchema.safeParse(username).success) {
      return { username, available: false, reason: 'invalid' };
    }
    if (isReservedUsername(username)) {
      return { username, available: false, reason: 'reserved' };
    }
    const [taken] = await this.database
      .select({ userId: profiles.userId })
      .from(profiles)
      .where(
        and(
          eq(profiles.usernameNormalized, normalizeUsername(username)),
          ne(profiles.userId, userId),
        ),
      )
      .limit(1);
    return taken
      ? { username, available: false, reason: 'taken' }
      : { username, available: true, reason: null };
  }

  public async update(
    userId: UserId,
    input: UpdateProfileInput,
  ): Promise<void> {
    if (input.username !== undefined && isReservedUsername(input.username)) {
      throw usernameUnavailable();
    }
    try {
      await this.database.transaction(async (transaction) => {
        const [existing] = await transaction
          .select({
            username: profiles.username,
            displayName: profiles.displayName,
            onboardingState: profiles.onboardingState,
          })
          .from(profiles)
          .where(eq(profiles.userId, userId))
          .for('update')
          .limit(1);
        if (!existing) throw new Error('Provisioned user has no profile.');
        assertOnboardingTransition(existing, input);
        await transaction
          .update(profiles)
          .set(profileUpdate(input))
          .where(eq(profiles.userId, userId));
      });
    } catch (error) {
      if (isUniqueViolation(error, 'profiles_username_normalized_unique')) {
        throw usernameUnavailable();
      }
      if (isCheckViolation(error, 'profiles_onboarding_requirements_check')) {
        throw onboardingIncomplete('Finish the earlier setup steps first.');
      }
      throw error;
    }
  }
}

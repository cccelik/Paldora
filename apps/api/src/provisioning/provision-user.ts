import {
  profiles,
  userPreferences,
  users,
  type PaldoraDatabase,
} from '@paldora/database';
import {
  displayNameSchema,
  isReservedUsername,
  normalizeUsername,
  usernameSchema,
} from '@paldora/validation';
import { eq } from 'drizzle-orm';

export interface ProvisionRequest {
  /** The identity provider's `sub` for this person. */
  readonly subject: string;
  readonly email: string;
  /** Optional: when both are given, onboarding is marked complete. */
  readonly username?: string | undefined;
  readonly displayName?: string | undefined;
}

export interface ProvisionResult {
  readonly userId: string;
  readonly created: boolean;
}

export const normalizeEmail = (email: string) =>
  email.trim().toLocaleLowerCase('en-US');

function profileSeed(request: ProvisionRequest) {
  if (!request.username || !request.displayName) return {};
  const username = usernameSchema.parse(request.username);
  if (isReservedUsername(username)) {
    throw new Error('That username is reserved.');
  }
  return {
    username,
    usernameNormalized: normalizeUsername(username),
    displayName: displayNameSchema.parse(request.displayName),
    onboardingState: 'complete' as const,
  };
}

/**
 * Creates or reconciles the internal Paldora user for an identity in one
 * transaction: user row, profile, and preferences. Re-running it is safe; an
 * existing profile is never overwritten.
 */
export async function provisionUser(
  database: PaldoraDatabase,
  request: ProvisionRequest,
): Promise<ProvisionResult> {
  const seed = profileSeed(request);
  return database.transaction(async (transaction) => {
    const [existing] = await transaction
      .select({ id: users.id })
      .from(users)
      .where(eq(users.authSubject, request.subject))
      .limit(1);
    const [user] = await transaction
      .insert(users)
      .values({
        authSubject: request.subject,
        email: request.email.trim(),
        emailNormalized: normalizeEmail(request.email),
      })
      .onConflictDoUpdate({
        target: users.authSubject,
        set: {
          email: request.email.trim(),
          emailNormalized: normalizeEmail(request.email),
          updatedAt: new Date(),
        },
      })
      .returning({ id: users.id });
    if (!user) throw new Error('User upsert returned no row.');
    await transaction
      .insert(profiles)
      .values({ userId: user.id, ...seed })
      .onConflictDoNothing({ target: profiles.userId });
    await transaction
      .insert(userPreferences)
      .values({ userId: user.id })
      .onConflictDoNothing({ target: userPreferences.userId });
    return { userId: user.id, created: !existing };
  });
}

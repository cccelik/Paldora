import { DEFAULT_REACTION_PRESETS, onboardingRank } from '@paldora/domain';
import {
  isReservedUsername,
  normalizeUsername,
  reactionPresetsSchema,
  updatePreferencesSchema,
  updateProfileSchema,
  usernameSchema,
  type CurrentUser,
  type Preferences,
  type UpdatePreferencesInput,
  type UpdateProfileInput,
  type UsernameAvailability,
} from '@paldora/validation';
import type { Auth } from 'firebase-admin/auth';
import type {
  DocumentSnapshot,
  Firestore,
  Transaction,
} from 'firebase-admin/firestore';

export class NativeProfileError extends Error {
  public constructor(
    public readonly code: 'INVALID' | 'UNAVAILABLE' | 'TAKEN',
  ) {
    super(code);
  }
}

type OnboardingState = CurrentUser['profile']['onboardingState'];

function assertOnboardingTransition(
  current: OnboardingState,
  next: OnboardingState,
  username: string | undefined,
  displayName: string | null,
): void {
  if (
    onboardingRank(next) < onboardingRank(current) ||
    (onboardingRank(next) >= onboardingRank('profile') && !username) ||
    (onboardingRank(next) >= onboardingRank('avatar') && !displayName)
  )
    throw new NativeProfileError('INVALID');
}

async function reserveUsername(
  db: Firestore,
  tx: Transaction,
  uid: string,
  account: DocumentSnapshot,
  username: string,
): Promise<void> {
  const normalized = normalizeUsername(username);
  const previous = account.get('usernameNormalized') as string | undefined;
  const nextRef = db.collection('nativeUsernames').doc(normalized);
  const oldRef =
    previous && previous !== normalized
      ? db.collection('nativeUsernames').doc(previous)
      : null;
  const [next, old] = await Promise.all([
    tx.get(nextRef),
    oldRef ? tx.get(oldRef) : Promise.resolve(null),
  ]);
  if (next.exists && next.get('uid') !== uid)
    throw new NativeProfileError('TAKEN');
  if (old && old.exists && old.get('uid') !== uid)
    throw new NativeProfileError('UNAVAILABLE');
  if (oldRef && old?.exists) tx.delete(oldRef);
  tx.set(nextRef, { uid });
  tx.update(account.ref, { username, usernameNormalized: normalized });
}

/** Account/profile preferences are trusted-only; no client collection scans. */
export class NativeProfiles {
  public constructor(
    private readonly db: Firestore,
    private readonly auth: Auth,
  ) {}

  public async current(uid: string): Promise<CurrentUser> {
    const [account, profile, preferences, authUser] = await Promise.all([
      this.db.collection('nativeAccounts').doc(uid).get(),
      this.db.collection('nativeProfiles').doc(uid).get(),
      this.db.collection('nativePreferences').doc(uid).get(),
      this.auth.getUser(uid),
    ]);
    if (
      account.get('status') !== 'active' ||
      !profile.exists ||
      authUser.disabled ||
      !authUser.emailVerified ||
      authUser.customClaims?.paldoraAdmitted !== true ||
      !authUser.email
    )
      throw new NativeProfileError('UNAVAILABLE');
    return {
      user: {
        id: uid,
        email: authUser.email,
        status: 'active',
        createdAt: new Date(account.get('createdAt') as number).toISOString(),
      },
      profile: {
        username: (account.get('username') as string | undefined) ?? null,
        displayName: (profile.get('displayName') as string | null) ?? null,
        bio: (profile.get('bio') as string | null) ?? null,
        avatar: null,
        avatarProcessing: false,
        onboardingState: profile.get(
          'onboardingState',
        ) as CurrentUser['profile']['onboardingState'],
        updatedAt: new Date(profile.get('updatedAt') as number).toISOString(),
      },
      preferences: {
        appearance:
          (preferences.get('appearance') as
            Preferences['appearance'] | undefined) ?? 'system',
        reactionPresets: (preferences.get('reactionPresets') as
          string[] | undefined) ?? [...DEFAULT_REACTION_PRESETS],
      },
    };
  }

  public async usernameAvailability(
    uid: string,
    username: string,
  ): Promise<UsernameAvailability> {
    const account = await this.db.collection('nativeAccounts').doc(uid).get();
    if (account.get('status') !== 'active')
      throw new NativeProfileError('UNAVAILABLE');
    if (!usernameSchema.safeParse(username).success)
      return { username, available: false, reason: 'invalid' };
    if (isReservedUsername(username))
      return { username, available: false, reason: 'reserved' };
    const mapping = await this.db
      .collection('nativeUsernames')
      .doc(normalizeUsername(username))
      .get();
    return mapping.exists && mapping.get('uid') !== uid
      ? { username, available: false, reason: 'taken' }
      : { username, available: true, reason: null };
  }

  public async update(
    uid: string,
    input: UpdateProfileInput,
    now = Date.now(),
  ): Promise<CurrentUser> {
    const parsed = updateProfileSchema.safeParse(input);
    if (
      !parsed.success ||
      (input.username && isReservedUsername(input.username))
    )
      throw new NativeProfileError('INVALID');
    const changes = parsed.data;
    const accountRef = this.db.collection('nativeAccounts').doc(uid);
    const profileRef = this.db.collection('nativeProfiles').doc(uid);
    await this.db.runTransaction(async (tx) => {
      const [account, profile] = await Promise.all([
        tx.get(accountRef),
        tx.get(profileRef),
      ]);
      if (account.get('status') !== 'active' || !profile.exists)
        throw new NativeProfileError('UNAVAILABLE');
      const nextUsername =
        changes.username ?? (account.get('username') as string | undefined);
      const nextDisplay =
        changes.displayName ?? (profile.get('displayName') as string | null);
      const currentState = profile.get(
        'onboardingState',
      ) as CurrentUser['profile']['onboardingState'];
      const nextState = changes.onboardingState ?? currentState;
      assertOnboardingTransition(
        currentState,
        nextState,
        nextUsername,
        nextDisplay,
      );
      if (changes.username !== undefined)
        await reserveUsername(this.db, tx, uid, account, changes.username);
      tx.update(profileRef, {
        ...(changes.displayName === undefined
          ? {}
          : { displayName: changes.displayName }),
        ...(changes.bio === undefined ? {} : { bio: changes.bio }),
        onboardingState: nextState,
        updatedAt: now,
      });
    });
    return this.current(uid);
  }

  public async updatePreferences(
    uid: string,
    input: UpdatePreferencesInput,
  ): Promise<Preferences> {
    const parsed = updatePreferencesSchema.safeParse(input);
    if (!parsed.success) throw new NativeProfileError('INVALID');
    const ref = this.db.collection('nativePreferences').doc(uid);
    await this.db.runTransaction(async (tx) => {
      const [account, existing] = await Promise.all([
        tx.get(this.db.collection('nativeAccounts').doc(uid)),
        tx.get(ref),
      ]);
      if (account.get('status') !== 'active')
        throw new NativeProfileError('UNAVAILABLE');
      tx.set(ref, {
        appearance: parsed.data.appearance,
        reactionPresets: existing.exists
          ? (existing.get('reactionPresets') as string[])
          : [...DEFAULT_REACTION_PRESETS],
      });
    });
    return (await this.current(uid)).preferences;
  }

  public async setReactionPresets(
    uid: string,
    presets: readonly string[],
  ): Promise<Preferences> {
    const parsed = reactionPresetsSchema.safeParse({ presets });
    if (!parsed.success) throw new NativeProfileError('INVALID');
    const ref = this.db.collection('nativePreferences').doc(uid);
    await this.db.runTransaction(async (tx) => {
      const [account, existing] = await Promise.all([
        tx.get(this.db.collection('nativeAccounts').doc(uid)),
        tx.get(ref),
      ]);
      if (account.get('status') !== 'active')
        throw new NativeProfileError('UNAVAILABLE');
      tx.set(ref, {
        appearance: existing.exists ? existing.get('appearance') : 'system',
        reactionPresets: [...parsed.data.presets],
      });
    });
    return (await this.current(uid)).preferences;
  }
}

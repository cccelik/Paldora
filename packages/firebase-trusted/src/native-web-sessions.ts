import { randomUUID } from 'node:crypto';
import type { Auth, UserRecord } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';

const SESSION_MS = 7 * 24 * 60 * 60 * 1_000;

export class NativeWebSessionError extends Error {
  public constructor() {
    super('SESSION_UNAVAILABLE');
  }
}

interface SignInResponse {
  idToken: string;
  localId: string;
}

interface ResetResponse {
  email: string;
}

function credentials(value: unknown): value is SignInResponse {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.idToken === 'string' && typeof record.localId === 'string'
  );
}

/**
 * Server-only session boundary. The Auth REST response's refresh token is
 * deliberately discarded; no browser Firebase credentials are persisted.
 * An Auth claim and account-side epoch reject older cookies immediately,
 * including password changes inside Auth's one-second revocation granularity.
 */
export class NativeWebSessions {
  public constructor(
    private readonly auth: Auth,
    private readonly db: Firestore,
    private readonly restBaseUrl: string,
    private readonly apiKey: string,
    private readonly request: typeof fetch = fetch,
  ) {}

  private async passwordSignIn(
    email: string,
    password: string,
  ): Promise<SignInResponse> {
    if (!email || !password || email.length > 320 || password.length > 1024)
      throw new NativeWebSessionError();
    const endpoint = new URL(
      'v1/accounts:signInWithPassword',
      `${this.restBaseUrl.replace(/\/$/, '')}/`,
    );
    endpoint.searchParams.set('key', this.apiKey);
    const response = await this.request(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
      cache: 'no-store',
    }).catch(() => {
      throw new NativeWebSessionError();
    });
    if (!response.ok) throw new NativeWebSessionError();
    const data: unknown = await response.json().catch(() => null);
    if (!credentials(data)) throw new NativeWebSessionError();
    return data;
  }

  private async requireActive(uid: string): Promise<{
    user: UserRecord;
    sessionEpoch: string | undefined;
  }> {
    const [user, account] = await Promise.all([
      this.auth.getUser(uid),
      this.db.collection('nativeAccounts').doc(uid).get(),
    ]).catch(() => {
      throw new NativeWebSessionError();
    });
    if (
      user.disabled ||
      !user.emailVerified ||
      user.customClaims?.paldoraAdmitted !== true ||
      account.get('status') !== 'active'
    )
      throw new NativeWebSessionError();
    return {
      user,
      sessionEpoch: account.get('sessionEpoch') as string | undefined,
    };
  }

  public async signIn(
    email: string,
    password: string,
  ): Promise<{ uid: string; cookie: string }> {
    const signedIn = await this.passwordSignIn(email, password);
    await this.requireActive(signedIn.localId);
    const cookie = await this.auth
      .createSessionCookie(signedIn.idToken, { expiresIn: SESSION_MS })
      .catch(() => {
        throw new NativeWebSessionError();
      });
    return { uid: signedIn.localId, cookie };
  }

  public async verify(cookie: string): Promise<string> {
    if (!cookie) throw new NativeWebSessionError();
    const decoded = await this.auth
      .verifySessionCookie(cookie, true)
      .catch(() => {
        throw new NativeWebSessionError();
      });
    const { user, sessionEpoch } = await this.requireActive(decoded.uid);
    if (
      decoded.paldoraSessionEpoch !== user.customClaims?.paldoraSessionEpoch ||
      decoded.paldoraSessionEpoch !== sessionEpoch
    )
      throw new NativeWebSessionError();
    return decoded.uid;
  }

  public async reauthenticate(
    uid: string,
    email: string,
    password: string,
  ): Promise<void> {
    const signedIn = await this.passwordSignIn(email, password);
    if (signedIn.localId !== uid) throw new NativeWebSessionError();
    await this.requireActive(uid);
  }

  /** Settings password change requires current credentials and kills old sessions. */
  public async changePassword(
    uid: string,
    email: string,
    currentPassword: string,
    nextPassword: string,
  ): Promise<void> {
    if (nextPassword.length < 10 || nextPassword.length > 1024)
      throw new NativeWebSessionError();
    await this.reauthenticate(uid, email, currentPassword);
    await this.invalidateSessions(uid);
    await this.auth.updateUser(uid, { password: nextPassword }).catch(() => {
      throw new NativeWebSessionError();
    });
  }

  /** Generic result for unknown, disabled and unadmitted accounts. */
  public async requestPasswordReset(email: string): Promise<void> {
    if (!email || email.length > 320) return;
    const user = await this.auth.getUserByEmail(email).catch(() => null);
    if (!user) return;
    try {
      await this.requireActive(user.uid);
    } catch {
      return;
    }
    await this.authRest('v1/accounts:sendOobCode', {
      requestType: 'PASSWORD_RESET',
      email,
    }).catch(() => undefined);
  }

  public async resetPassword(
    oobCode: string,
    nextPassword: string,
  ): Promise<void> {
    if (
      !oobCode ||
      oobCode.length > 2048 ||
      nextPassword.length < 10 ||
      nextPassword.length > 1024
    )
      throw new NativeWebSessionError();
    const response = await this.authRest('v1/accounts:resetPassword', {
      oobCode,
      newPassword: nextPassword,
    });
    if (
      !response ||
      typeof response !== 'object' ||
      typeof (response as ResetResponse).email !== 'string'
    )
      throw new NativeWebSessionError();
    const user = await this.auth
      .getUserByEmail((response as ResetResponse).email)
      .catch(() => {
        throw new NativeWebSessionError();
      });
    await this.invalidateSessions(user.uid);
  }

  private async authRest(
    path: string,
    body: Record<string, string>,
  ): Promise<unknown> {
    const endpoint = new URL(path, `${this.restBaseUrl.replace(/\/$/, '')}/`);
    endpoint.searchParams.set('key', this.apiKey);
    const response = await this.request(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    }).catch(() => {
      throw new NativeWebSessionError();
    });
    if (!response.ok) throw new NativeWebSessionError();
    return response.json().catch(() => {
      throw new NativeWebSessionError();
    });
  }

  private async invalidateSessions(uid: string): Promise<void> {
    const user = await this.auth.getUser(uid).catch(() => {
      throw new NativeWebSessionError();
    });
    const sessionEpoch = randomUUID();
    await this.auth
      .setCustomUserClaims(uid, {
        ...user.customClaims,
        paldoraSessionEpoch: sessionEpoch,
      })
      .catch(() => {
        throw new NativeWebSessionError();
      });
    await this.db
      .collection('nativeAccounts')
      .doc(uid)
      .update({ sessionEpoch })
      .catch(() => {
        throw new NativeWebSessionError();
      });
    await this.auth.revokeRefreshTokens(uid).catch(() => {
      throw new NativeWebSessionError();
    });
  }
}

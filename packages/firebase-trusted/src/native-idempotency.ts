import type {
  DocumentReference,
  Firestore,
  Transaction,
} from 'firebase-admin/firestore';

/** Markers expire 24h after creation (Firestore TTL policy on `expiresAt`). */
export const IDEMPOTENCY_RETENTION_MS = 24 * 60 * 60 * 1000;

export type IdempotentKind = 'box_create' | 'box_post' | 'box_comment';

/**
 * `nativeIdempotency/{kind}_{uid}_{key}`: scoped by the authenticated uid, so
 * one user's key can never address (or reveal) another user's marker. The
 * client UUID is lowercased so case variants are the same key.
 */
export function idempotencyRef(
  db: Firestore,
  kind: IdempotentKind,
  uid: string,
  key: string,
): DocumentReference {
  return db
    .collection('nativeIdempotency')
    .doc(`${kind}_${uid}_${key.toLowerCase()}`);
}

/** The original result ID when an unexpired marker exists, else `null`. */
export async function priorResult(
  tx: Transaction,
  ref: DocumentReference,
  field: string,
  now: number,
): Promise<string | null> {
  const prior = await tx.get(ref);
  if (!prior.exists || (prior.get('expiresAt') as number) <= now) return null;
  const value = prior.get(field);
  return typeof value === 'string' ? value : null;
}

/** Call only after every read of the transaction (Firestore read-before-write). */
export function writeMarker(
  tx: Transaction,
  ref: DocumentReference,
  marker: {
    uid: string;
    kind: IdempotentKind;
    field: string;
    resultId: string;
    now: number;
  },
): void {
  tx.set(ref, {
    uid: marker.uid,
    kind: marker.kind,
    [marker.field]: marker.resultId,
    createdAt: marker.now,
    expiresAt: marker.now + IDEMPOTENCY_RETENTION_MS,
  });
}

/* eslint-disable complexity, no-await-in-loop -- Media lifecycle checks and storage cleanup must stay in a strict order. */
import { randomUUID } from 'node:crypto';
import {
  MEDIA_PURPOSE_POLICIES,
  SIGNED_UPLOAD_TTL_SECONDS,
  UNATTACHED_MEDIA_TTL_SECONDS,
  type DerivativeSpec,
  type MediaContentType,
  type MediaPurpose,
} from '@paldora/domain';
import { createMediaUploadSchema, uuidSchema } from '@paldora/validation';
import {
  FieldPath,
  type Firestore,
  type DocumentSnapshot,
} from 'firebase-admin/firestore';
import type { Storage } from 'firebase-admin/storage';
import sharp, { type Sharp } from 'sharp';
import { NativeBoxPosts, NativePostError } from './native-box-posts.js';
import { NativeRooms, NativeRoomError } from './native-rooms.js';
import {
  NativeLifeUpdates,
  NativeLifeUpdateError,
} from './native-life-updates.js';
import { nativeBlockPairId } from './native-box-invitations.js';
import { logEvent } from './log.js';

export class NativeMediaError extends Error {
  public constructor(
    public readonly code:
      | 'INVALID'
      | 'UNAVAILABLE'
      | 'MISMATCH'
      | 'EXPIRED'
      | 'NOT_READY'
      | 'STORAGE_UNAVAILABLE',
  ) {
    super(code);
  }
}

type Variant = 'master' | 'display' | 'thumbnail';
type MediaStatus =
  'pending' | 'uploading' | 'processing' | 'ready' | 'failed' | 'deleted';
type MediaRecord = {
  id: string;
  ownerUid: string;
  purpose: MediaPurpose;
  boxId: string | null;
  status: MediaStatus;
  lifecycleEpoch: number;
  contentType: MediaContentType;
  contentLength: number;
  rawPath: string;
  objectPaths: string[];
  derivativeObjectPaths?: Record<Variant, string>;
  createdAt: number;
  expiresAt: number;
  uploadedAt: number | null;
  attachedPostId: string | null;
  attachedLifeUpdateId: string | null;
  attachedRoomUid: string | null;
  attachedReactionPostId: string | null;
};

/**
 * Reads must fail closed uniformly: an expected domain denial and an
 * unexpected infrastructure error both surface as UNAVAILABLE, so a Firestore
 * failure cannot distinguish a real attached asset from a random id. The error
 * class is still logged for monitoring.
 */
function failClosedLookup(
  error: unknown,
  expected: abstract new (...args: never[]) => Error,
): NativeMediaError {
  if (!(error instanceof expected))
    logEvent('ERROR', { event: 'media.read_lookup_failed' }, error);
  return new NativeMediaError('UNAVAILABLE');
}

function record(snapshot: DocumentSnapshot): MediaRecord {
  if (!snapshot.exists) throw new NativeMediaError('UNAVAILABLE');
  const data = snapshot.data() as Omit<MediaRecord, 'id'>;
  return { ...data, id: snapshot.id };
}

function objectRoot(
  asset: Pick<MediaRecord, 'ownerUid' | 'boxId' | 'id'>,
): string {
  return asset.boxId
    ? `private/boxes/${asset.boxId}/${asset.id}`
    : `private/users/${asset.ownerUid}/${asset.id}`;
}

function derivativePaths(
  asset: MediaRecord,
  attempt = '',
): Record<Variant, string> {
  const root = objectRoot(asset);
  const prefix = attempt
    ? `e${asset.lifecycleEpoch}/${attempt}`
    : `e${asset.lifecycleEpoch}`;
  return {
    master: `${root}/${prefix}/master.webp`,
    display: `${root}/${prefix}/display.webp`,
    thumbnail: `${root}/${prefix}/thumbnail.webp`,
  };
}

function allKnownPaths(asset: MediaRecord): string[] {
  return [
    ...new Set([
      ...asset.objectPaths,
      asset.rawPath,
      ...Object.values(asset.derivativeObjectPaths ?? {}),
    ]),
  ];
}

function resize(source: Sharp, spec: DerivativeSpec): Sharp {
  if (spec.fit === 'inside')
    return source.resize(spec.size, spec.size, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  if (spec.fit === 'cover')
    return source.resize(spec.size, spec.height, {
      fit: 'cover',
      position: sharp.strategy.attention,
    });
  return source.resize(spec.size, spec.size, {
    fit: 'cover',
    position: sharp.strategy.attention,
  });
}

async function derivatives(input: Buffer, purpose: MediaPurpose) {
  const policy = MEDIA_PURPOSE_POLICIES[purpose];
  const decoder = sharp(input, {
    failOn: 'error',
    limitInputPixels: policy.maxInputPixels,
    sequentialRead: true,
  });
  const metadata = await decoder.metadata();
  if (!metadata.format || !['jpeg', 'png', 'webp'].includes(metadata.format))
    throw new NativeMediaError('INVALID');
  const source = decoder.rotate();
  const variants = ['master', 'display', 'thumbnail'] as const;
  const result = await Promise.all(
    variants.map(async (variant) => {
      const { data, info } = await resize(source.clone(), policy[variant])
        // Sharp omits EXIF, XMP, IPTC and ICC metadata unless explicitly asked.
        .webp({ quality: policy[variant].quality, effort: 4 })
        .toBuffer({ resolveWithObject: true });
      return { variant, data, width: info.width, height: info.height };
    }),
  );
  return result;
}

/** Trusted private media lifecycle. Firestore state closes access before object retirement. */
export class NativeMedia {
  private readonly bucket: ReturnType<Storage['bucket']>;
  private readonly posts: NativeBoxPosts;

  public constructor(
    private readonly db: Firestore,
    storage: Storage,
    bucketName: string,
  ) {
    this.bucket = storage.bucket(bucketName);
    this.posts = new NativeBoxPosts(db);
  }

  private ref(id: string) {
    return this.db.collection('nativeMediaAssets').doc(id);
  }

  private job(id: string, epoch: number, mode: 'process' | 'delete') {
    return this.db.collection('nativeJobs').doc(`media-${mode}-${id}-${epoch}`);
  }

  private async sweepAbandonedAttempts(
    asset: MediaRecord,
    currentPaths: Record<Variant, string>,
  ): Promise<void> {
    const keep = new Set(Object.values(currentPaths));
    const [files] = await this.bucket.getFiles({
      prefix: `${objectRoot(asset)}/`,
    });
    await Promise.all(
      files
        .filter((file) => !keep.has(file.name))
        .map((file) => file.delete({ ignoreNotFound: true })),
    );
  }

  private async account(uid: string): Promise<void> {
    const account = await this.db.collection('nativeAccounts').doc(uid).get();
    if (account.get('status') !== 'active')
      throw new NativeMediaError('UNAVAILABLE');
  }

  private async avatarVisible(
    viewerUid: string,
    ownerUid: string,
    id: string,
  ): Promise<boolean> {
    const [profile, account] = await Promise.all([
      this.db.collection('nativeProfiles').doc(ownerUid).get(),
      this.db.collection('nativeAccounts').doc(ownerUid).get(),
    ]);
    if (
      profile.get('avatarMediaId') !== id ||
      account.get('status') !== 'active'
    )
      return false;
    if (viewerUid === ownerUid) return true;
    const pairId = nativeBlockPairId(viewerUid, ownerUid);
    const [block, friend] = await Promise.all([
      this.db.collection('nativeBlockPairs').doc(pairId).get(),
      this.db.collection('nativeFriendPairs').doc(pairId).get(),
    ]);
    if ((block.get('blockedBy') as string[] | undefined)?.length) return false;
    if (friend.get('status') === 'accepted') return true;
    let cursor: string | null = null;
    for (;;) {
      let query = this.db
        .collection('nativeAccounts')
        .doc(viewerUid)
        .collection('boxRefs')
        .orderBy(FieldPath.documentId())
        .limit(50);
      if (cursor) query = query.startAfter(cursor);
      const page = await query.get();
      const shared = await Promise.all(
        page.docs.map(async (hint) => {
          const box = this.db.collection('nativeBoxes').doc(hint.id);
          const [state, viewer, owner] = await Promise.all([
            box.get(),
            box.collection('members').doc(viewerUid).get(),
            box.collection('members').doc(ownerUid).get(),
          ]);
          return (
            ['active', 'archived'].includes(state.get('status') as string) &&
            viewer.get('status') === 'active' &&
            owner.get('status') === 'active'
          );
        }),
      );
      if (shared.some(Boolean)) return true;
      if (page.size < 50) return false;
      cursor = page.docs.at(-1)!.id;
    }
  }

  public async reserve(uid: string, input: unknown, now = Date.now()) {
    const parsed = createMediaUploadSchema.safeParse(input);
    if (!parsed.success) throw new NativeMediaError('INVALID');
    const { purpose, boxId, contentType, contentLength } = parsed.data;
    const id = randomUUID();
    const root = objectRoot({ id, ownerUid: uid, boxId: boxId ?? null });
    await this.db.runTransaction(async (tx) => {
      const account = await tx.get(
        this.db.collection('nativeAccounts').doc(uid),
      );
      if (account.get('status') !== 'active')
        throw new NativeMediaError('UNAVAILABLE');
      if (boxId) {
        const boxRef = this.db.collection('nativeBoxes').doc(boxId);
        const [box, member] = await Promise.all([
          tx.get(boxRef),
          tx.get(boxRef.collection('members').doc(uid)),
        ]);
        if (box.get('status') !== 'active' || member.get('status') !== 'active')
          throw new NativeMediaError('UNAVAILABLE');
      }
      tx.create(this.ref(id), {
        schemaVersion: 1,
        ownerUid: uid,
        purpose,
        boxId: boxId ?? null,
        contentType,
        contentLength,
        status: 'pending',
        lifecycleEpoch: 0,
        rawPath: `${root}/raw`,
        objectPaths: [],
        createdAt: now,
        expiresAt: now + SIGNED_UPLOAD_TTL_SECONDS * 1000,
        unattachedExpiresAt: now + (SIGNED_UPLOAD_TTL_SECONDS + 15 * 60) * 1000,
        uploadedAt: null,
        uploadInFlight: false,
        attachedPostId: null,
        attachedLifeUpdateId: null,
        attachedRoomUid: null,
        attachedReactionPostId: null,
      });
      if (purpose === 'avatar')
        tx.update(this.db.collection('nativeProfiles').doc(uid), {
          pendingAvatarMediaId: id,
        });
    });
    return {
      id,
      purpose,
      status: 'pending' as const,
      contentType,
      contentLength,
      createdAt: now,
    };
  }

  /** Same-origin PUT only: exact length/type and a decodable allowed image. */
  public async upload(
    uid: string,
    id: string,
    bytes: Buffer,
    type: string,
    now = Date.now(),
  ) {
    if (!uuidSchema.safeParse(id).success)
      throw new NativeMediaError('UNAVAILABLE');
    let asset: MediaRecord | null = null;
    await this.db.runTransaction(async (tx) => {
      const [account, snapshot] = await Promise.all([
        tx.get(this.db.collection('nativeAccounts').doc(uid)),
        tx.get(this.ref(id)),
      ]);
      const current = record(snapshot);
      if (account.get('status') !== 'active' || current.ownerUid !== uid)
        throw new NativeMediaError('UNAVAILABLE');
      if (current.status !== 'pending' || current.uploadedAt !== null)
        throw new NativeMediaError('UNAVAILABLE');
      if (now > current.expiresAt) throw new NativeMediaError('EXPIRED');
      if (
        bytes.length !== current.contentLength ||
        type !== current.contentType
      )
        throw new NativeMediaError('MISMATCH');
      if (current.boxId) {
        const boxRef = this.db.collection('nativeBoxes').doc(current.boxId);
        const [box, member] = await Promise.all([
          tx.get(boxRef),
          tx.get(boxRef.collection('members').doc(uid)),
        ]);
        if (box.get('status') !== 'active' || member.get('status') !== 'active')
          throw new NativeMediaError('UNAVAILABLE');
      }
      asset = current;
      tx.update(snapshot.ref, {
        status: 'uploading',
        uploadInFlight: true,
        updatedAt: now,
      });
    });
    const selected = asset as MediaRecord | null;
    if (!selected) throw new NativeMediaError('UNAVAILABLE');
    let validated = false;
    try {
      const metadata = await sharp(bytes, {
        failOn: 'error',
        limitInputPixels:
          MEDIA_PURPOSE_POLICIES[selected.purpose].maxInputPixels,
      }).metadata();
      const actual =
        metadata.format === 'jpeg'
          ? 'image/jpeg'
          : metadata.format === 'png'
            ? 'image/png'
            : metadata.format === 'webp'
              ? 'image/webp'
              : null;
      if (actual !== type) throw new NativeMediaError('INVALID');
      validated = true;
      await this.bucket.file(selected.rawPath).save(bytes, {
        resumable: false,
        contentType: type,
        metadata: { cacheControl: 'private, no-store' },
      });
      await this.db.runTransaction(async (tx) => {
        const snapshot = await tx.get(this.ref(id));
        if (
          snapshot.get('status') !== 'uploading' ||
          snapshot.get('lifecycleEpoch') !== selected.lifecycleEpoch
        )
          throw new NativeMediaError('UNAVAILABLE');
        tx.update(snapshot.ref, {
          status: 'pending',
          uploadInFlight: false,
          uploadedAt: now,
          objectPaths: [selected.rawPath],
          updatedAt: now,
        });
      });
    } catch (error) {
      await this.bucket
        .file(selected.rawPath)
        .delete({ ignoreNotFound: true })
        .catch(() => undefined);
      await this.db.runTransaction(async (tx) => {
        const snapshot = await tx.get(this.ref(id));
        if (
          snapshot.get('status') === 'uploading' &&
          snapshot.get('lifecycleEpoch') === selected.lifecycleEpoch
        )
          tx.update(snapshot.ref, {
            status: 'failed',
            uploadInFlight: false,
            updatedAt: now,
          });
        else if (snapshot.get('uploadInFlight') === true)
          tx.update(snapshot.ref, { uploadInFlight: false, updatedAt: now });
      });
      if (error instanceof NativeMediaError) throw error;
      throw new NativeMediaError(validated ? 'STORAGE_UNAVAILABLE' : 'INVALID');
    }
  }

  public async complete(uid: string, id: string, now = Date.now()) {
    if (!uuidSchema.safeParse(id).success)
      throw new NativeMediaError('UNAVAILABLE');
    await this.db.runTransaction(async (tx) => {
      const [account, snapshot] = await Promise.all([
        tx.get(this.db.collection('nativeAccounts').doc(uid)),
        tx.get(this.ref(id)),
      ]);
      const asset = record(snapshot);
      if (account.get('status') !== 'active' || asset.ownerUid !== uid)
        throw new NativeMediaError('UNAVAILABLE');
      if (asset.status === 'processing' || asset.status === 'ready') return;
      if (asset.status !== 'pending' || asset.uploadedAt === null)
        throw new NativeMediaError('MISMATCH');
      if (now > asset.expiresAt + 15 * 60_000)
        throw new NativeMediaError('EXPIRED');
      tx.update(snapshot.ref, { status: 'processing', updatedAt: now });
      tx.create(this.job(id, asset.lifecycleEpoch, 'process'), {
        type: 'media',
        mode: 'process',
        assetId: id,
        epoch: asset.lifecycleEpoch,
        status: 'pending',
        phase: 'encode',
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      });
    });
    return this.status(uid, id);
  }

  public async status(uid: string, id: string) {
    await this.account(uid);
    if (!uuidSchema.safeParse(id).success)
      throw new NativeMediaError('UNAVAILABLE');
    const asset = record(await this.ref(id).get());
    if (asset.ownerUid !== uid) throw new NativeMediaError('UNAVAILABLE');
    return {
      id,
      purpose: asset.purpose,
      status: asset.status === 'uploading' ? 'pending' : asset.status,
      contentType: asset.contentType,
      contentLength: asset.contentLength,
      createdAt: asset.createdAt,
    };
  }

  /** A worker may be retried after any storage or Firestore failure. */
  // eslint-disable-next-line max-lines-per-function -- A single job owns encode, publish, and raw retirement ordering.
  public async processOnce(jobId: string, now = Date.now()): Promise<void> {
    const jobRef = this.db.collection('nativeJobs').doc(jobId);
    const claimId = randomUUID();
    const job = await this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(jobRef);
      if (
        snapshot.get('type') !== 'media' ||
        (snapshot.get('status') !== 'pending' &&
          !(
            snapshot.get('status') === 'running' &&
            (snapshot.get('leaseUntil') as number) < now
          ))
      )
        return null;
      tx.update(jobRef, {
        status: 'running',
        claimId,
        leaseUntil: now + 15 * 60_000,
        updatedAt: now,
      });
      return snapshot;
    });
    if (!job) return;
    try {
      const id = job.get('assetId') as string;
      const epoch = job.get('epoch') as number;
      const mode = job.get('mode') as 'process' | 'delete';
      const snapshot = await this.ref(id).get();
      if (!snapshot.exists) {
        await this.finishJob(jobRef, claimId, now);
        return;
      }
      const asset = record(snapshot);
      if (mode === 'delete') {
        if (asset.status !== 'deleted' || asset.lifecycleEpoch !== epoch) {
          await this.finishJob(jobRef, claimId, now);
          return;
        }
        await Promise.all(
          [...allKnownPaths(asset)].map((path) =>
            this.bucket.file(path).delete({ ignoreNotFound: true }),
          ),
        );
        // Scan the private asset prefix: a crashed encoder may have written an
        // attempt whose object paths were never committed to Firestore.
        const [orphans] = await this.bucket.getFiles({
          prefix: `${objectRoot(asset)}/`,
        });
        await Promise.all(
          orphans.map((file) => file.delete({ ignoreNotFound: true })),
        );
        await this.db.runTransaction(async (tx) => {
          const [fresh, pending] = await Promise.all([
            tx.get(this.ref(id)),
            tx.get(jobRef),
          ]);
          if (
            fresh.get('status') !== 'deleted' ||
            fresh.get('lifecycleEpoch') !== epoch ||
            pending.get('status') !== 'running' ||
            pending.get('claimId') !== claimId
          )
            return;
          tx.update(fresh.ref, { objectPaths: [], updatedAt: now });
          tx.update(jobRef, { status: 'complete', updatedAt: now });
        });
        return;
      }
      if (
        asset.lifecycleEpoch !== epoch ||
        !['processing', 'ready'].includes(asset.status)
      ) {
        if (asset.status === 'deleted') {
          const [files] = await this.bucket.getFiles({
            prefix: `${objectRoot(asset)}/`,
          });
          await Promise.all(
            files.map((file) => file.delete({ ignoreNotFound: true })),
          );
        }
        await this.finishJob(jobRef, claimId, now);
        return;
      }
      if (job.get('phase') === 'retire_raw') {
        await this.bucket.file(asset.rawPath).delete({ ignoreNotFound: true });
        if (!asset.derivativeObjectPaths)
          throw new NativeMediaError('STORAGE_UNAVAILABLE');
        await this.sweepAbandonedAttempts(asset, asset.derivativeObjectPaths);
        let done = false;
        await this.db.runTransaction(async (tx) => {
          done = false;
          const [fresh, pending] = await Promise.all([
            tx.get(this.ref(id)),
            tx.get(jobRef),
          ]);
          if (
            fresh.get('lifecycleEpoch') !== epoch ||
            pending.get('status') !== 'running' ||
            pending.get('claimId') !== claimId
          )
            return;
          tx.update(fresh.ref, {
            objectPaths: (
              (fresh.get('objectPaths') as string[] | undefined) ?? []
            ).filter((path) => path !== asset.rawPath),
            updatedAt: now,
          });
          tx.update(jobRef, { status: 'complete', updatedAt: now });
          done = true;
        });
        // A retire that bumped the epoch mid-process must not leave this job
        // 'running' for its lease; the delete job owns cleanup. No writes here.
        if (!done) await this.finishJob(jobRef, claimId, now);
        return;
      }
      let results: Awaited<ReturnType<typeof derivatives>>;
      try {
        const [raw] = await this.bucket.file(asset.rawPath).download();
        if (raw.length !== asset.contentLength)
          throw new NativeMediaError('MISMATCH');
        results = await derivatives(raw, asset.purpose);
      } catch (error) {
        if (
          error instanceof NativeMediaError ||
          (error instanceof Error &&
            /Input buffer|unsupported image|pixel limit/i.test(error.message))
        ) {
          await this.bucket
            .file(asset.rawPath)
            .delete({ ignoreNotFound: true });
          await this.db.runTransaction(async (tx) => {
            const [fresh, pending, profile] = await Promise.all([
              tx.get(this.ref(id)),
              tx.get(jobRef),
              asset.purpose === 'avatar'
                ? tx.get(
                    this.db.collection('nativeProfiles').doc(asset.ownerUid),
                  )
                : Promise.resolve(null),
            ]);
            if (
              fresh.get('status') !== 'processing' ||
              fresh.get('lifecycleEpoch') !== epoch ||
              pending.get('status') !== 'running' ||
              pending.get('claimId') !== claimId
            )
              return;
            tx.update(fresh.ref, { status: 'failed', updatedAt: now });
            if (profile?.get('pendingAvatarMediaId') === id)
              tx.update(profile.ref, { pendingAvatarMediaId: null });
            tx.update(jobRef, { status: 'complete', updatedAt: now });
          });
          return;
        }
        throw error;
      }
      const paths = derivativePaths(asset, claimId);
      const writes = await Promise.allSettled(
        results.map((result) =>
          this.bucket.file(paths[result.variant]).save(result.data, {
            resumable: false,
            contentType: 'image/webp',
            metadata: { cacheControl: 'private, no-store' },
          }),
        ),
      );
      const failedWrite = writes.find((write) => write.status === 'rejected');
      if (failedWrite?.status === 'rejected') throw failedWrite.reason;
      let published = false;
      let previousAvatarId: string | null = null;
      await this.db.runTransaction(async (tx) => {
        const [fresh, pending, profile] = await Promise.all([
          tx.get(this.ref(id)),
          tx.get(jobRef),
          asset.purpose === 'avatar'
            ? tx.get(this.db.collection('nativeProfiles').doc(asset.ownerUid))
            : Promise.resolve(null),
        ]);
        if (
          fresh.get('status') !== 'processing' ||
          fresh.get('lifecycleEpoch') !== epoch ||
          pending.get('status') !== 'running' ||
          pending.get('claimId') !== claimId
        )
          return;
        tx.update(fresh.ref, {
          status: 'ready',
          unattachedExpiresAt:
            asset.purpose === 'avatar' &&
            profile?.get('pendingAvatarMediaId') === id
              ? null
              : now + UNATTACHED_MEDIA_TTL_SECONDS * 1000,
          objectPaths: [asset.rawPath, ...Object.values(paths)],
          derivativeObjectPaths: paths,
          width: results[0]!.width,
          height: results[0]!.height,
          updatedAt: now,
        });
        if (profile?.get('pendingAvatarMediaId') === id) {
          const oldId = profile.get('avatarMediaId') as
            string | null | undefined;
          if (oldId && oldId !== id) {
            previousAvatarId = oldId;
            tx.update(this.ref(oldId), { unattachedExpiresAt: now });
          }
          tx.update(profile.ref, {
            avatarMediaId: id,
            pendingAvatarMediaId: null,
          });
        }
        tx.update(jobRef, { phase: 'retire_raw', updatedAt: now });
        published = true;
      });
      if (!published) {
        await Promise.all(
          Object.values(paths).map((path) =>
            this.bucket.file(path).delete({ ignoreNotFound: true }),
          ),
        );
        await this.finishJob(jobRef, claimId, now);
      } else {
        await this.bucket.file(asset.rawPath).delete({ ignoreNotFound: true });
        await this.sweepAbandonedAttempts(asset, paths);
        let done = false;
        await this.db.runTransaction(async (tx) => {
          done = false;
          const [fresh, pending] = await Promise.all([
            tx.get(this.ref(id)),
            tx.get(jobRef),
          ]);
          if (
            fresh.get('lifecycleEpoch') !== epoch ||
            pending.get('status') !== 'running' ||
            pending.get('claimId') !== claimId
          )
            return;
          tx.update(fresh.ref, {
            objectPaths: Object.values(paths),
            updatedAt: now,
          });
          tx.update(jobRef, { status: 'complete', updatedAt: now });
          done = true;
        });
        if (!done) await this.finishJob(jobRef, claimId, now);
        if (previousAvatarId)
          await this.retire(previousAvatarId, now).catch(() => undefined);
      }
    } catch (error) {
      await this.db.runTransaction(async (tx) => {
        const pending = await tx.get(jobRef);
        if (
          pending.get('status') !== 'running' ||
          pending.get('claimId') !== claimId
        )
          return;
        const attempts =
          ((pending.get('attempts') as number | undefined) ?? 0) + 1;
        tx.update(jobRef, {
          attempts,
          status: attempts >= 5 ? 'dead' : 'pending',
          updatedAt: now,
        });
      });
      throw error;
    }
  }

  private async finishJob(
    ref: FirebaseFirestore.DocumentReference,
    claimId: string,
    now: number,
  ) {
    await this.db.runTransaction(async (tx) => {
      const job = await tx.get(ref);
      if (job.get('status') === 'running' && job.get('claimId') === claimId)
        tx.update(ref, { status: 'complete', updatedAt: now });
    });
  }

  /** Close reads first, then physically remove every known object before success. */
  public async retire(id: string, now = Date.now()): Promise<void> {
    if (!uuidSchema.safeParse(id).success)
      throw new NativeMediaError('UNAVAILABLE');
    let jobId: string | null = null;
    await this.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(this.ref(id));
      if (!snapshot.exists) return;
      if (snapshot.get('status') === 'deleted') {
        jobId = this.job(
          id,
          snapshot.get('lifecycleEpoch') as number,
          'delete',
        ).id;
        return;
      }
      const epoch = (snapshot.get('lifecycleEpoch') as number) + 1;
      tx.update(snapshot.ref, {
        status: 'deleted',
        unattachedExpiresAt: null,
        lifecycleEpoch: epoch,
        updatedAt: now,
      });
      const ref = this.job(id, epoch, 'delete');
      jobId = ref.id;
      tx.create(ref, {
        type: 'media',
        mode: 'delete',
        assetId: id,
        epoch,
        status: 'pending',
        phase: 'delete',
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      });
    });
    if (jobId) await this.processOnce(jobId, now);
    const deleted = await this.ref(id).get();
    if (deleted.get('status') === 'deleted') {
      if (deleted.get('uploadInFlight') === true)
        throw new NativeMediaError('STORAGE_UNAVAILABLE');
      const processJob = await this.job(
        id,
        (deleted.get('lifecycleEpoch') as number) - 1,
        'process',
      ).get();
      if (processJob.get('status') === 'running')
        throw new NativeMediaError('STORAGE_UNAVAILABLE');
      const job = await this.job(
        id,
        deleted.get('lifecycleEpoch') as number,
        'delete',
      ).get();
      if (
        job.get('status') !== 'complete' ||
        ((deleted.get('objectPaths') as string[] | undefined) ?? []).length
      )
        throw new NativeMediaError('STORAGE_UNAVAILABLE');
      const [orphans] = await this.bucket.getFiles({
        prefix: `${objectRoot(record(deleted))}/`,
      });
      if (orphans.length) throw new NativeMediaError('STORAGE_UNAVAILABLE');
      await deleted.ref.update({
        attachedPostId: null,
        attachedReactionPostId: null,
        attachedReactionUid: null,
        attachedLifeUpdateId: null,
        attachedRoomUid: null,
      });
      if (deleted.get('purpose') === 'avatar') {
        await this.db.runTransaction(async (tx) => {
          const profile = await tx.get(
            this.db
              .collection('nativeProfiles')
              .doc(deleted.get('ownerUid') as string),
          );
          if (!profile.exists) return;
          const changes: Record<string, null> = {};
          if (profile.get('avatarMediaId') === id) changes.avatarMediaId = null;
          if (profile.get('pendingAvatarMediaId') === id)
            changes.pendingAvatarMediaId = null;
          if (Object.keys(changes).length) tx.update(profile.ref, changes);
        });
      }
    }
  }

  /** Resumable cleanup for post photos and every camera reaction on a tombstoned post. */
  public async cleanupPost(
    jobId: string,
    now = Date.now(),
  ): Promise<'pending' | 'complete'> {
    const ref = this.db.collection('nativeJobs').doc(jobId);
    const job = await ref.get();
    if (
      job.get('type') !== 'mediaPostCleanup' ||
      job.get('status') !== 'pending'
    )
      return 'complete';
    const postId = job.get('postId') as string;
    for (const field of ['attachedPostId', 'attachedReactionPostId'] as const) {
      const page = await this.db
        .collection('nativeMediaAssets')
        .where(field, '==', postId)
        .limit(20)
        .get();
      if (!page.empty) {
        await Promise.all(page.docs.map((asset) => this.retire(asset.id, now)));
        await ref.update({ updatedAt: now });
        return 'pending';
      }
    }
    await ref.update({ status: 'complete', updatedAt: now });
    return 'complete';
  }

  public async repairPostCleanups(
    limit = 20,
    now = Date.now(),
  ): Promise<number> {
    const jobs = await this.db
      .collection('nativeJobs')
      .where('type', '==', 'mediaPostCleanup')
      .where('status', '==', 'pending')
      .limit(limit)
      .get();
    let steps = 0;
    for (const job of jobs.docs) {
      try {
        await this.cleanupPost(job.id, now);
        steps += 1;
      } catch {
        // The durable intent remains pending until Storage recovers.
      }
    }
    return steps;
  }

  public async removeAvatar(uid: string): Promise<void> {
    await this.account(uid);
    const profileRef = this.db.collection('nativeProfiles').doc(uid);
    const ids = await this.db.runTransaction(async (tx) => {
      const profile = await tx.get(profileRef);
      const selected = [
        profile.get('avatarMediaId') as string | null | undefined,
        profile.get('pendingAvatarMediaId') as string | null | undefined,
      ].filter((id): id is string => Boolean(id));
      tx.update(profileRef, {
        avatarMediaId: null,
        pendingAvatarMediaId: null,
      });
      for (const id of new Set(selected))
        tx.update(this.ref(id), { unattachedExpiresAt: Date.now() });
      return selected;
    });
    for (const id of new Set(ids)) await this.retire(id);
  }

  // eslint-disable-next-line max-lines-per-function -- Reads repeat canonical authorization checks after Storage I/O.
  public async read(
    uid: string,
    id: string,
    variant: Variant,
  ): Promise<Buffer> {
    await this.account(uid);
    if (
      !uuidSchema.safeParse(id).success ||
      !['master', 'display', 'thumbnail'].includes(variant)
    )
      throw new NativeMediaError('UNAVAILABLE');
    const asset = record(await this.ref(id).get());
    if (asset.status !== 'ready') throw new NativeMediaError('UNAVAILABLE');
    if (asset.attachedPostId && asset.boxId) {
      const post = await this.posts
        .get(asset.boxId, asset.attachedPostId, uid)
        .catch((error: unknown) => {
          throw failClosedLookup(error, NativePostError);
        });
      if (
        !((post as { mediaAssetIds?: string[] }).mediaAssetIds ?? []).includes(
          id,
        )
      )
        throw new NativeMediaError('UNAVAILABLE');
    } else if (asset.purpose === 'avatar') {
      if (!(await this.avatarVisible(uid, asset.ownerUid, id)))
        throw new NativeMediaError('UNAVAILABLE');
    } else if (asset.attachedReactionPostId && asset.boxId) {
      await this.posts
        .get(asset.boxId, asset.attachedReactionPostId, uid)
        .catch((error: unknown) => {
          throw failClosedLookup(error, NativePostError);
        });
      const reactorUid = asset.ownerUid;
      const [reaction, reactor, pair] = await Promise.all([
        this.db
          .collection('nativeBoxes')
          .doc(asset.boxId)
          .collection('posts')
          .doc(asset.attachedReactionPostId)
          .collection('reactions')
          .doc(reactorUid)
          .get(),
        this.db.collection('nativeAccounts').doc(reactorUid).get(),
        this.db
          .collection('nativeBlockPairs')
          .doc(nativeBlockPairId(uid, reactorUid))
          .get(),
      ]);
      if (
        reaction.get('kind') !== 'real' ||
        reaction.get('mediaAssetId') !== id ||
        reactor.get('status') !== 'active' ||
        ((pair.get('blockedBy') as string[] | undefined)?.length ?? 0) > 0
      )
        throw new NativeMediaError('UNAVAILABLE');
    } else if (asset.attachedLifeUpdateId) {
      const update = await new NativeLifeUpdates(this.db)
        .get(asset.attachedLifeUpdateId, uid)
        .catch((error: unknown) => {
          throw failClosedLookup(error, NativeLifeUpdateError);
        });
      if (!update.mediaAssetIds.includes(id))
        throw new NativeMediaError('UNAVAILABLE');
    } else if (asset.attachedRoomUid) {
      const owner = await this.db
        .collection('nativeAccounts')
        .doc(asset.attachedRoomUid)
        .get();
      const username = owner.get('username') as string | undefined;
      if (!username) throw new NativeMediaError('UNAVAILABLE');
      await new NativeRooms(this.db)
        .get(uid, username)
        .catch((error: unknown) => {
          throw failClosedLookup(error, NativeRoomError);
        });
      const room = await this.db
        .collection('nativeRooms')
        .doc(asset.attachedRoomUid)
        .get();
      if (room.get('bannerMediaId') !== id)
        throw new NativeMediaError('UNAVAILABLE');
    } else if (asset.ownerUid !== uid) {
      throw new NativeMediaError('UNAVAILABLE');
    }
    const path = (asset.derivativeObjectPaths ?? derivativePaths(asset))[
      variant
    ];
    const [bytes] = await this.bucket.file(path).download();
    // Recheck after I/O: a takedown or deletion may have closed reads meanwhile.
    const fresh = await this.ref(id).get();
    if (
      fresh.get('status') !== 'ready' ||
      fresh.get('lifecycleEpoch') !== asset.lifecycleEpoch
    )
      throw new NativeMediaError('UNAVAILABLE');
    // A canonical relationship or moderation decision may change while
    // Storage is downloading the object. Recheck the source immediately
    // before sending any bytes to the browser.
    if (asset.attachedPostId && asset.boxId) {
      const post = await this.posts
        .get(asset.boxId, asset.attachedPostId, uid)
        .catch(() => {
          throw new NativeMediaError('UNAVAILABLE');
        });
      if (!post.mediaAssetIds.includes(id))
        throw new NativeMediaError('UNAVAILABLE');
    }
    if (asset.attachedReactionPostId && asset.boxId) {
      await this.posts
        .get(asset.boxId, asset.attachedReactionPostId, uid)
        .catch(() => {
          throw new NativeMediaError('UNAVAILABLE');
        });
      const reaction = await this.db
        .collection('nativeBoxes')
        .doc(asset.boxId)
        .collection('posts')
        .doc(asset.attachedReactionPostId)
        .collection('reactions')
        .doc(asset.ownerUid)
        .get();
      const [reactor, pair] = await Promise.all([
        this.db.collection('nativeAccounts').doc(asset.ownerUid).get(),
        this.db
          .collection('nativeBlockPairs')
          .doc(nativeBlockPairId(uid, asset.ownerUid))
          .get(),
      ]);
      if (
        reaction.get('mediaAssetId') !== id ||
        reactor.get('status') !== 'active' ||
        ((pair.get('blockedBy') as string[] | undefined)?.length ?? 0) > 0
      )
        throw new NativeMediaError('UNAVAILABLE');
    }
    if (asset.attachedLifeUpdateId) {
      const update = await new NativeLifeUpdates(this.db)
        .get(asset.attachedLifeUpdateId, uid)
        .catch(() => {
          throw new NativeMediaError('UNAVAILABLE');
        });
      if (!update.mediaAssetIds.includes(id))
        throw new NativeMediaError('UNAVAILABLE');
    }
    if (asset.attachedRoomUid) {
      const account = await this.db
        .collection('nativeAccounts')
        .doc(asset.attachedRoomUid)
        .get();
      const username = account.get('username') as string | undefined;
      if (!username) throw new NativeMediaError('UNAVAILABLE');
      await new NativeRooms(this.db).get(uid, username).catch(() => {
        throw new NativeMediaError('UNAVAILABLE');
      });
      const room = await this.db
        .collection('nativeRooms')
        .doc(asset.attachedRoomUid)
        .get();
      if (room.get('bannerMediaId') !== id)
        throw new NativeMediaError('UNAVAILABLE');
    }
    if (
      asset.purpose === 'avatar' &&
      !(await this.avatarVisible(uid, asset.ownerUid, id))
    )
      throw new NativeMediaError('UNAVAILABLE');
    await this.account(uid);
    return bytes;
  }

  public async repairPending(limit = 20, now = Date.now()): Promise<number> {
    const pending = await this.db
      .collection('nativeJobs')
      .where('type', '==', 'media')
      .where('status', '==', 'pending')
      .limit(limit)
      .get();
    const stale = await this.db
      .collection('nativeJobs')
      .where('type', '==', 'media')
      .where('status', '==', 'running')
      .limit(limit)
      .get();
    const jobs = [
      ...pending.docs,
      ...stale.docs.filter(
        (job) => ((job.get('leaseUntil') as number | undefined) ?? 0) < now,
      ),
    ];
    let completed = 0;
    for (const job of jobs.slice(0, limit)) {
      try {
        await this.processOnce(job.id, now);
        completed += 1;
      } catch {
        /* Durable pending job remains for the next repair pass. */
      }
    }
    return completed;
  }

  /** Operator-only dead-letter replay; never called by a public request. */
  public async retryDead(jobId: string, now = Date.now()): Promise<void> {
    if (!/^media-(process|delete)-[0-9a-f-]{36}-\d+$/.test(jobId))
      throw new NativeMediaError('INVALID');
    await this.db.runTransaction(async (tx) => {
      const ref = this.db.collection('nativeJobs').doc(jobId);
      const job = await tx.get(ref);
      if (job.get('type') !== 'media' || job.get('status') !== 'dead')
        throw new NativeMediaError('UNAVAILABLE');
      tx.update(ref, { status: 'pending', attempts: 0, updatedAt: now });
    });
    await this.processOnce(jobId, now);
  }

  public async expireUnattached(limit = 20, now = Date.now()): Promise<number> {
    const page = await this.db
      .collection('nativeMediaAssets')
      .where('unattachedExpiresAt', '<', now)
      .limit(limit)
      .get();
    let retired = 0;
    for (const snapshot of page.docs) {
      const asset = record(snapshot);
      if (
        asset.status === 'deleted' ||
        asset.attachedPostId ||
        asset.attachedLifeUpdateId ||
        asset.attachedRoomUid ||
        asset.attachedReactionPostId
      )
        continue;
      await this.retire(asset.id, now);
      retired += 1;
    }
    return retired;
  }
}

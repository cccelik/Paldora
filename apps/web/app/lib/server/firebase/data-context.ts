import { ApiClientError } from '@/lib/server/web-data-error';
import {
  NativeBlockPairs,
  NativeAccountLifecycle,
  NativeBoxDeletion,
  NativeBoxInvitations,
  NativeBoxMembers,
  NativeBoxPosts,
  NativeLifeUpdates,
  NativeMedia,
  NativeBoxes,
  NativeFriendships,
  NativeHomeFeed,
  NativeMemories,
  NativeModeration,
  NativeNotifications,
  NativeProfiles,
  NativeRooms,
} from '@paldora/firebase-trusted';
import {
  type BoxView,
  type PostMediaView,
  type PostInteractionSummary,
  type UserSummary,
} from '@paldora/validation';
import { firebaseAdminServices } from './session';
import { firebaseLocalWebUrl } from './mode';
import {
  boxAbsent,
  person,
  viewBox,
  type DisplaySummary,
  type SummaryLookup,
} from './data-views';
import 'server-only';

/** Per-request services and shared read helpers for the Firebase web data modules. */
export class WebDataContext {
  public readonly services = firebaseAdminServices();
  public readonly friendsService = new NativeFriendships(this.services.db);
  public readonly blocksService = new NativeBlockPairs(this.services.db);
  public readonly boxesService = new NativeBoxes(this.services.db);
  public readonly postsService = new NativeBoxPosts(this.services.db, {
    trustInteractionIndex: process.env.PALDORA_TRUST_INTERACTION_INDEX === '1',
  });
  public readonly homeFeedService = new NativeHomeFeed(this.services.db);
  public readonly lifeUpdatesService = new NativeLifeUpdates(this.services.db);
  public readonly membersService = new NativeBoxMembers(this.services.db);
  public readonly invitationsService = new NativeBoxInvitations(
    this.services.db,
  );
  public readonly deletionService = new NativeBoxDeletion(
    this.services.db,
    async (path) => {
      await this.services.bucket.file(path).delete({ ignoreNotFound: true });
    },
    async (id) => {
      await this.mediaService.retire(id);
    },
  );
  public readonly profilesService = new NativeProfiles(
    this.services.db,
    this.services.auth,
  );
  public readonly roomsService = new NativeRooms(this.services.db);
  public readonly memoriesService = new NativeMemories(this.services.db);
  public readonly mediaService = new NativeMedia(
    this.services.db,
    this.services.storage,
    this.services.bucket.name,
  );
  public readonly notificationsService = new NativeNotifications(
    this.services.db,
  );
  public readonly moderationService = new NativeModeration(this.services.db);
  public readonly accountLifecycle = new NativeAccountLifecycle(
    this.services.db,
    this.services.auth,
    this.services.storage,
    this.services.bucket.name,
  );

  public constructor(public readonly uid: string) {}

  public async box(boxId: string): Promise<BoxView> {
    try {
      return viewBox(await this.boxesService.get(boxId, this.uid));
    } catch (error) {
      boxAbsent(error);
    }
  }

  async mediaViews(ids: readonly string[]): Promise<PostMediaView[]> {
    const snapshots = await Promise.all(
      ids.map((id) =>
        this.services.db.collection('nativeMediaAssets').doc(id).get(),
      ),
    );
    return snapshots.flatMap((asset) => {
      if (asset.get('status') !== 'ready') return [];
      const width = asset.get('width') as number | undefined;
      const height = asset.get('height') as number | undefined;
      if (!width || !height) return [];
      const root = `${firebaseLocalWebUrl()}/media/${asset.id}`;
      return [
        {
          id: asset.id,
          width,
          height,
          url: `${root}/display`,
          thumbnailUrl: `${root}/thumbnail`,
        },
      ];
    });
  }

  async summary(
    boxId: string,
    postId: string,
  ): Promise<PostInteractionSummary> {
    return this.toSummaryView(
      await this.postsService.interactionSummary(boxId, postId, this.uid),
    );
  }

  toSummaryView(
    result: Awaited<ReturnType<NativeBoxPosts['interactionSummary']>>,
  ): PostInteractionSummary {
    return {
      ...result,
      realPreview: result.realPreview.map((preview) => ({
        ...preview,
        thumbnailUrl: `${firebaseLocalWebUrl()}${preview.thumbnailUrl}`,
      })),
    };
  }

  /** One batched read per page; keyed by post id. Unavailable posts are absent. */
  async summariesFor(
    refs: { boxId: string; postId: string }[],
  ): Promise<SummaryLookup> {
    const unique = [...new Map(refs.map((ref) => [ref.postId, ref])).values()];
    const results = await this.postsService.interactionSummaries(
      unique,
      this.uid,
    );
    const lookup: SummaryLookup = new Map();
    unique.forEach((ref, i) => {
      const result = results[i];
      if (result) lookup.set(ref.postId, this.toSummaryView(result));
    });
    return lookup;
  }

  async personView(uid: string): Promise<UserSummary> {
    const summary = await this.userSummary(uid);
    return {
      ...person(uid, summary.username, summary.displayName),
      avatarUrl: summary.avatarUrl,
    };
  }

  // Display-only identity, memoized per instance (one instance per request).
  // The promise is stored so parallel callers share one read.
  readonly userSummaries = new Map<string, Promise<DisplaySummary>>();

  userSummary(uid: string): Promise<DisplaySummary> {
    let pending = this.userSummaries.get(uid);
    if (!pending) {
      pending = this.loadUserSummary(uid);
      this.userSummaries.set(uid, pending);
    }
    return pending;
  }

  async loadUserSummary(uid: string): Promise<DisplaySummary> {
    const { db } = this.services;
    const [account, profile] = await db.getAll(
      db.collection('nativeAccounts').doc(uid),
      db.collection('nativeProfiles').doc(uid),
    );
    const username = (account?.get('username') as string | undefined) ?? uid;
    const displayName =
      (profile?.get('displayName') as string | undefined) ??
      (profile?.get('username') as string | undefined) ??
      'Member';
    const id = profile?.get('avatarMediaId') as string | null | undefined;
    let avatarUrl: string | null = null;
    if (id) {
      const asset = await db.collection('nativeMediaAssets').doc(id).get();
      if (asset.get('status') === 'ready' && asset.get('ownerUid') === uid)
        avatarUrl = `${firebaseLocalWebUrl()}/media/${id}/thumbnail`;
    }
    return { username, displayName, avatarUrl };
  }

  async authorName(uid: string): Promise<string> {
    return (await this.userSummary(uid)).displayName;
  }

  async authorAvatarUrl(uid: string): Promise<string | null> {
    return (await this.userSummary(uid)).avatarUrl;
  }

  async drainMediaPostCleanup(postId: string, left = 100): Promise<void> {
    if (left <= 0)
      throw new ApiClientError(
        409,
        'MEDIA_CLEANUP_PENDING',
        'Photo cleanup is still running.',
        null,
      );
    const result = await this.mediaService.cleanupPost(
      `media-post-cleanup-${postId}`,
    );
    if (result === 'pending')
      await this.drainMediaPostCleanup(postId, left - 1);
  }
}

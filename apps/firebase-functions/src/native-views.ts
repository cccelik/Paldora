import {
  NativeBoxError,
  NativeLifeUpdateError,
  NativePostError,
  readyAvatarMediaId,
  type NativeBoxes,
  type NativeBoxPosts,
  type NativeLifeUpdates,
  type NativeMemoryItem,
  type NativeNotifications,
  type TrustedBox,
} from '@paldora/firebase-trusted';
import type { Firestore } from 'firebase-admin/firestore';
import { native } from '@paldora/validation';
import { readyPhotos } from './native-room-views.js';

type Person = {
  uid: string;
  username: string;
  displayName: string;
  avatarMediaId: string | null;
};
type Post = Awaited<ReturnType<NativeBoxPosts['get']>>;
type Notification = Awaited<ReturnType<NativeNotifications['get']>>;
type Summary = Awaited<ReturnType<NativeBoxPosts['interactionSummary']>>;

const MEDIA_PATH = /^\/media\/([A-Za-z0-9_-]{1,128})\/thumbnail$/;

export function boxView(box: TrustedBox) {
  return {
    id: box.id,
    name: box.name,
    status: box.status,
    currentUserRole: box.currentUserRole,
    memberCount: box.memberCount,
    createdAt: box.createdAt,
    updatedAt: box.updatedAt,
  };
}

/** Display-only identity reads, shared per request. Avatars are opaque media ids, never URLs. */
export class NativeViews {
  private readonly people = new Map<string, Promise<Person>>();
  private readonly boxStatuses = new Map<string, Promise<string | null>>();

  public constructor(
    private readonly db: Firestore,
    private readonly boxes: NativeBoxes,
    private readonly posts: NativeBoxPosts,
    private readonly updates: NativeLifeUpdates,
  ) {}

  public person(uid: string): Promise<Person> {
    let pending = this.people.get(uid);
    if (!pending) {
      pending = this.loadPerson(uid);
      this.people.set(uid, pending);
    }
    return pending;
  }

  private async loadPerson(uid: string): Promise<Person> {
    const [[account, profile], avatarMediaId] = await Promise.all([
      this.db.getAll(
        this.db.collection('nativeAccounts').doc(uid),
        this.db.collection('nativeProfiles').doc(uid),
      ),
      readyAvatarMediaId(this.db, uid),
    ]);
    const username = (account?.get('username') as string | undefined) ?? uid;
    const displayName =
      (profile?.get('displayName') as string | undefined) ?? 'Member';
    return { uid, username, displayName, avatarMediaId };
  }

  public async notification(
    uid: string,
    item: Notification,
  ): Promise<native.NativeNotification> {
    const [box, actor] = await Promise.all([
      this.boxes.get(item.boxId, uid),
      this.person(item.actorUid),
    ]);
    return {
      id: item.id,
      type: item.type,
      actor,
      boxId: item.boxId,
      boxName: box.name,
      postId: item.postId,
      lifeUpdateId: item.lifeUpdateId,
      commentId: item.commentId,
      reaction: item.reactionKind ? { kind: item.reactionKind } : null,
      read: item.read,
      createdAt: item.createdAt,
    };
  }

  private summary(summary: Summary): native.NativeInteractionSummary {
    return {
      commentCount: summary.commentCount,
      reactions: summary.reactions,
      reactionCount: summary.reactionCount,
      realCount: summary.realCount,
      realPreview: summary.realPreview.flatMap((preview) => {
        const id = MEDIA_PATH.exec(preview.thumbnailUrl)?.[1];
        return id
          ? [
              {
                user: {
                  uid: preview.user.id,
                  username: preview.user.username,
                  displayName: preview.user.displayName,
                },
                mediaAssetId: id,
              },
            ]
          : [];
      }),
      viewerReaction: summary.viewerReaction,
      canInteract: summary.canInteract,
    };
  }

  private boxStatus(uid: string, boxId: string): Promise<string | null> {
    let pending = this.boxStatuses.get(boxId);
    if (!pending) {
      pending = this.boxes.get(boxId, uid).then(
        (box) => box.status,
        (error: unknown) => {
          if (error instanceof NativeBoxError) return null;
          throw error;
        },
      );
      this.boxStatuses.set(boxId, pending);
    }
    return pending;
  }

  /**
   * Memories as the web adapter projects them: live interaction summaries, and
   * an item whose Box or summary became unavailable between the canonical scan
   * and this projection is dropped. Photos are the ready ones only.
   */
  public async memoryItems(
    uid: string,
    items: NativeMemoryItem[],
  ): Promise<native.NativeMemoryItem[]> {
    const refs = items.flatMap((item) =>
      item.kind === 'post'
        ? [{ boxId: item.post.boxId, postId: item.post.id }]
        : item.update.contexts.map((context) => ({
            boxId: context.boxId,
            postId: context.postId,
          })),
    );
    const [summaries, ready] = await Promise.all([
      this.posts.interactionSummaries(refs, uid),
      readyPhotos(
        this.db,
        items.flatMap((item) =>
          item.kind === 'post'
            ? item.post.mediaAssetIds
            : item.update.mediaAssetIds,
        ),
      ),
    ]);
    const summaryOf = new Map(
      refs.map((ref, at) => [`${ref.boxId}/${ref.postId}`, summaries[at]]),
    );
    const projected = await Promise.all(
      items.map((item) => this.memoryItem(uid, item, summaryOf, ready)),
    );
    return projected.filter(
      (item): item is native.NativeMemoryItem => item !== null,
    );
  }

  private async memoryItem(
    uid: string,
    item: NativeMemoryItem,
    summaryOf: Map<string, Summary | null | undefined>,
    ready: Map<string, unknown>,
  ): Promise<native.NativeMemoryItem | null> {
    const photos = (ids: string[]) => ids.filter((id) => ready.has(id));
    try {
      if (item.kind === 'post') {
        const { post } = item;
        const raw = summaryOf.get(`${post.boxId}/${post.id}`);
        const status = await this.boxStatus(uid, post.boxId);
        if (!raw || !status) return null;
        const author = await this.person(post.authorUid);
        return {
          kind: 'post',
          occurredAt: item.occurredAt,
          id: post.id,
          boxId: post.boxId,
          authorUid: post.authorUid,
          authorName: author.displayName,
          authorAvatarMediaId: author.avatarMediaId,
          mediaAssetIds: photos(post.mediaAssetIds),
          createdAt: post.createdAt,
          interactions: this.summary(raw),
          text: post.text,
          edited: post.updatedAt > post.createdAt,
          canEdit: post.authorUid === uid && status === 'active',
        };
      }
      const { update } = item;
      const contexts = update.contexts.map((context) => ({
        context,
        raw: summaryOf.get(`${context.boxId}/${context.postId}`),
      }));
      if (contexts.some(({ raw }) => !raw)) return null;
      const author = await this.person(update.authorUid);
      return {
        kind: 'life_update',
        occurredAt: item.occurredAt,
        id: update.id,
        authorUid: update.authorUid,
        authorName: author.displayName,
        authorAvatarMediaId: author.avatarMediaId,
        audience: update.audience,
        sections: native.NATIVE_LIFE_UPDATE_SECTION_KEYS.flatMap((key) =>
          update.sections[key]
            ? [{ key, content: update.sections[key] as string }]
            : [],
        ),
        mediaAssetIds: photos(update.mediaAssetIds),
        createdAt: update.createdAt,
        updatedAt: update.updatedAt,
        canEdit: update.canEdit,
        contexts: contexts.map(({ context, raw }) => ({
          boxId: context.boxId,
          boxName: context.boxName,
          postId: context.postId,
          interactions: this.summary(raw!),
        })),
      };
    } catch (error) {
      // A Box may close between the canonical scan and DTO projection.
      if (error instanceof NativePostError && error.code === 'UNAVAILABLE')
        return null;
      throw error;
    }
  }

  /** Same projection as the web Home feed; unavailable items drop out. */
  public async feedItems(
    uid: string,
    items: Post[],
  ): Promise<native.NativeFeedItem[]> {
    const refs = items.map((post) => ({ boxId: post.boxId, postId: post.id }));
    const summaries = await this.posts.interactionSummaries(refs, uid);
    const projected = await Promise.all(
      items.map((post, at) => this.feedItem(uid, post, summaries[at] ?? null)),
    );
    return projected.filter(
      (item): item is native.NativeFeedItem => item !== null,
    );
  }

  private async feedItem(
    uid: string,
    post: Post,
    rawSummary: Summary | null,
  ): Promise<native.NativeFeedItem | null> {
    if (!rawSummary) return null;
    const interactions = this.summary(rawSummary);
    const author = await this.person(post.authorUid);
    const base = {
      boxId: post.boxId,
      authorUid: post.authorUid,
      authorName: author.displayName,
      authorAvatarMediaId: author.avatarMediaId,
      mediaAssetIds: post.mediaAssetIds,
      createdAt: post.createdAt,
      interactions,
    };
    if (post.kind !== 'life_update')
      return {
        kind: 'post',
        id: post.id,
        ...base,
        text: post.text,
        edited: post.updatedAt > post.createdAt,
        canEdit: post.authorUid === uid,
      };
    if (!post.lifeUpdateId) return null;
    try {
      const update = await this.updates.get(post.lifeUpdateId, uid, post.boxId);
      if (!update.contexts.some((context) => context.postId === post.id))
        return null;
      return {
        kind: 'life_update',
        id: update.id,
        postId: post.id,
        ...base,
        authorUid: update.authorUid,
        authorName: (await this.person(update.authorUid)).displayName,
        authorAvatarMediaId: (await this.person(update.authorUid))
          .avatarMediaId,
        mediaAssetIds: update.mediaAssetIds,
        createdAt: update.createdAt,
        sections: native.NATIVE_LIFE_UPDATE_SECTION_KEYS.flatMap((key) =>
          update.sections[key]
            ? [{ key, content: update.sections[key] as string }]
            : [],
        ),
      };
    } catch (error) {
      if (
        error instanceof NativeLifeUpdateError &&
        error.code === 'UNAVAILABLE'
      )
        return null;
      throw error;
    }
  }
}

import {
  NativeLifeUpdateError,
  type NativeBoxes,
  type NativeBoxPosts,
  type NativeLifeUpdates,
  type NativeNotifications,
  type TrustedBox,
} from '@paldora/firebase-trusted';
import type { Firestore } from 'firebase-admin/firestore';
import { native } from '@paldora/validation';

type Person = { uid: string; username: string; displayName: string };
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

/** Display-only identity reads, shared per request. Never avatars or media URLs. */
export class NativeViews {
  private readonly people = new Map<string, Promise<Person>>();

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
    const [account, profile] = await this.db.getAll(
      this.db.collection('nativeAccounts').doc(uid),
      this.db.collection('nativeProfiles').doc(uid),
    );
    const username = (account?.get('username') as string | undefined) ?? uid;
    const displayName =
      (profile?.get('displayName') as string | undefined) ?? 'Member';
    return { uid, username, displayName };
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

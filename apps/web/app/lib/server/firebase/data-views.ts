import { ApiClientError } from '@/lib/server/web-data-error';
import { type LifeUpdateSectionKey } from '@paldora/domain';
import {
  NativeBoxError,
  NativeBoxMemberError,
  NativePostError,
  NativeInvitationError,
  type TrustedBox,
  type NativeFriendship,
} from '@paldora/firebase-trusted';
import {
  type BoxView,
  type FriendshipView,
  type PostInteractionSummary,
  type CommentInteractionSummary,
  type UserSummary,
} from '@paldora/validation';
import 'server-only';

export type FirebaseFeedItem =
  | {
      kind: 'post';
      id: string;
      boxId: string;
      authorName: string;
      authorAvatarUrl: string | null;
      content: string;
      mediaAssetIds: string[];
      createdAt: string;
      edited: boolean;
      canEdit: boolean;
      interactions: PostInteractionSummary;
    }
  | {
      kind: 'life_update';
      id: string;
      boxId: string;
      postId: string;
      authorName: string;
      authorAvatarUrl: string | null;
      mediaAssetIds: string[];
      createdAt: string;
      sections: { key: LifeUpdateSectionKey; content: string }[];
      interactions: PostInteractionSummary;
    };

export interface FirebaseCommentItem {
  id: string;
  content: string;
  parentId: string | null;
  authorName: string;
  authorAvatarUrl: string | null;
  createdAt: string;
  edited: boolean;
  canEdit: boolean;
  interactions: CommentInteractionSummary;
}

export type FirebaseThreadItem =
  | { kind: 'comment'; comment: FirebaseCommentItem }
  | { kind: 'hidden' | 'deleted'; id: string; createdAt: string };

export interface FirebaseCommentThread {
  root: FirebaseThreadItem;
  rootId: string;
  replies: FirebaseThreadItem[];
  replyCount: number;
}

export interface FirebaseLifeUpdateItem {
  id: string;
  authorName: string;
  authorAvatarUrl: string | null;
  mediaAssetIds: string[];
  audience: 'only_me' | 'boxes';
  sections: { key: LifeUpdateSectionKey; content: string }[];
  createdAt: string;
  edited: boolean;
  canEdit: boolean;
  contexts: {
    boxId: string;
    boxName: string;
    postId: string;
    canInteract: boolean;
    interactions: PostInteractionSummary;
  }[];
  isOwner: boolean;
}

export function unavailable(code: string): ApiClientError {
  return new ApiClientError(404, code, 'Unavailable.', null);
}

export function boxAbsent(error: unknown): never {
  if (
    error instanceof NativeBoxError ||
    error instanceof NativeBoxMemberError ||
    (error instanceof NativeInvitationError && error.code === 'UNAVAILABLE')
  )
    throw unavailable('BOX_NOT_FOUND');
  throw error;
}

export function iso(value: number): string {
  return new Date(value).toISOString();
}

export function person(
  uid: string,
  username: string,
  displayName: string,
): UserSummary {
  return { id: uid, username, displayName, avatarUrl: null };
}

export function viewBox(box: TrustedBox): BoxView {
  return {
    id: box.id,
    name: box.name,
    status: box.status,
    currentUserRole: box.currentUserRole,
    memberCount: box.memberCount,
    createdAt: iso(box.createdAt),
    updatedAt: iso(box.updatedAt),
  };
}

export function viewFriend(item: NativeFriendship): FriendshipView {
  return {
    id: item.id,
    user: person(item.otherUid, item.username, item.displayName),
    status: item.status === 'accepted' ? 'accepted' : 'pending',
    direction:
      item.status === 'accepted'
        ? 'established'
        : item.status === 'sent'
          ? 'outgoing'
          : 'incoming',
    createdAt: iso(item.createdAt),
    updatedAt: iso(item.updatedAt),
  };
}

/** Firebase-only Phase 2/3 web data access, always scoped to a verified cookie. */
export interface DisplaySummary {
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

/** Page-level precomputed summaries keyed by post id. */
export type SummaryLookup = Map<string, PostInteractionSummary>;

export function precomputed(
  lookup: SummaryLookup,
  postId: string,
): PostInteractionSummary {
  const summary = lookup.get(postId);
  if (!summary) throw new NativePostError('UNAVAILABLE');
  return summary;
}

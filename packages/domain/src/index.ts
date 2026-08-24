declare const brand: unique symbol;
export const POST_EVENT_CHANNEL = 'paldora:post-events:v1';
export const INTERACTION_EVENT_CHANNEL = 'paldora:interaction-events:v1';
export type Brand<Value, Name extends string> = Value & {
  readonly [brand]: Name;
};

export type UserId = Brand<string, 'UserId'>;
export type MediaAssetId = Brand<string, 'MediaAssetId'>;
export type BoxId = Brand<string, 'BoxId'>;
export type BoxInvitationId = Brand<string, 'BoxInvitationId'>;
export type FriendshipId = Brand<string, 'FriendshipId'>;
export type PostId = Brand<string, 'PostId'>;
export type CommentId = Brand<string, 'CommentId'>;
export type NotificationId = Brand<string, 'NotificationId'>;
export type LifeUpdateId = Brand<string, 'LifeUpdateId'>;

export type UserStatus = 'active' | 'suspended' | 'deleted';
export type OnboardingState = 'username' | 'profile' | 'avatar' | 'complete';
export type MediaAssetStatus = 'pending' | 'processing' | 'ready' | 'failed';
export type MediaAssetPurpose =
  'avatar' | 'post_image' | 'reaction_image' | 'life_update_image';
export type BoxRole = 'owner' | 'admin' | 'member';
export type BoxStatus = 'active' | 'archived';
export type BoxMembershipStatus = 'active' | 'left' | 'removed';
export type BoxInvitationStatus =
  'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';
export type FriendshipStatus = 'pending' | 'accepted' | 'declined' | 'blocked';
export type PostStatus = 'active' | 'deleted';
/** A single Unicode emoji, or the internal `real` camera-reaction marker. */
export type ReactionKind = string;
export type ReactionPresets = readonly [string, string, string, string, string];
export const DEFAULT_REACTION_PRESETS: ReactionPresets = [
  '👍',
  '❤️',
  '😂',
  '😮',
  '😢',
];
export const REACTION_EMOJI_MAX_LENGTH = 64;
const emojiSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
const emojiCodePoint =
  /\p{Extended_Pictographic}|\p{Regional_Indicator}|[#*0-9]\uFE0F?\u20E3/u;

export function isSingleEmoji(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= REACTION_EMOJI_MAX_LENGTH &&
    value.trim() === value &&
    value !== 'real' &&
    emojiCodePoint.test(value) &&
    Array.from(emojiSegmenter.segment(value)).length === 1
  );
}

export interface User {
  id: UserId;
  email: string;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Profile {
  userId: UserId;
  username: string | null;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  reactionPresets: ReactionPresets;
  onboardingState: OnboardingState;
  createdAt: string;
  updatedAt: string;
}

export interface CurrentUser {
  user: User;
  profile: Profile;
}

export interface MediaAsset {
  id: MediaAssetId;
  ownerUserId: UserId;
  purpose: MediaAssetPurpose;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  contentLength: number;
  status: MediaAssetStatus;
  createdAt: string;
}

export interface UsernameAvailability {
  username: string;
  normalized: string;
  available: boolean;
  reason?: 'invalid' | 'reserved' | 'taken';
}

export interface UpdateProfileInput {
  username?: string | undefined;
  displayName?: string | undefined;
  bio?: string | null | undefined;
  onboardingState?: OnboardingState | undefined;
  reactionPresets?: ReactionPresets | undefined;
}

export interface CreateAvatarUploadInput {
  contentType: MediaAsset['contentType'];
  contentLength: number;
}

export interface CreateAvatarUploadResult {
  mediaAsset: MediaAsset;
  upload: {
    url: string;
    headers: Readonly<Record<string, string>>;
    expiresAt: string;
  };
}

export interface Box {
  id: BoxId;
  name: string;
  slug: string;
  ownerUserId: UserId;
  privacyMode: 'private';
  status: BoxStatus;
  currentUserRole: BoxRole;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BoxMember {
  userId: UserId;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: BoxRole;
  status: BoxMembershipStatus;
  joinedAt: string;
}

export interface BoxInvitation {
  id: BoxInvitationId;
  boxId: BoxId;
  boxName: string;
  inviterUserId: UserId;
  inviteeUserId: UserId;
  status: BoxInvitationStatus;
  expiresAt: string;
  createdAt: string;
}

export interface Friendship {
  id: FriendshipId;
  user: Pick<User, 'id'> &
    Pick<Profile, 'username' | 'displayName' | 'avatarUrl'>;
  status: FriendshipStatus;
  direction: 'incoming' | 'outgoing' | 'established' | 'blocked';
  createdAt: string;
  updatedAt: string;
}

export interface Post {
  id: PostId;
  boxId: BoxId;
  boxName: string;
  author: {
    userId: UserId;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  content: string;
  media: PostMedia[];
  interactions: PostInteractions;
  status: 'active';
  editedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReactionSummary {
  kind: ReactionKind;
  count: number;
}

export interface RealReaction {
  userId: UserId;
  username: string;
  displayName: string;
  mediaAssetId: MediaAssetId;
  status: 'processing' | 'ready' | 'failed';
  url: string | null;
  thumbnailUrl: string | null;
  createdAt: string;
}

export interface PostInteractions {
  commentCount: number;
  reactions: ReactionSummary[];
  currentUserReaction: ReactionKind | null;
  realReactions: RealReaction[];
}

export interface CommentAuthor {
  userId: UserId;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface Comment {
  id: CommentId;
  postId: PostId;
  parentCommentId: CommentId | null;
  author: CommentAuthor;
  content: string;
  deleted: boolean;
  editedAt: string | null;
  createdAt: string;
  updatedAt: string;
  interactions: CommentInteractions;
  replies: Comment[];
}

export interface CommentInteractions {
  reactions: ReactionSummary[];
  currentUserReaction: ReactionKind | null;
}

export interface CommentPage {
  items: Comment[];
  nextCursor: string | null;
}

export interface CreateCommentInput {
  content: string;
  parentCommentId?: CommentId | undefined;
}

export interface UpdateCommentInput {
  content: string;
}

export interface SetCommentReactionInput {
  kind: ReactionKind | null;
}

export interface SetPostReactionInput {
  kind: ReactionKind | null;
  mediaAssetId?: MediaAssetId | undefined;
}

export type CreateReactionPhotoUploadInput = CreateAvatarUploadInput;
export type CreateReactionPhotoUploadResult = CreateAvatarUploadResult;

export interface NotificationActor {
  userId: UserId;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export type NotificationType =
  | 'post.comment'
  | 'comment.reply'
  | 'post.reaction'
  | 'comment.reaction'
  | 'life_update.published';

export interface Notification {
  id: NotificationId;
  type: NotificationType;
  actor: NotificationActor;
  postId: PostId;
  commentId: CommentId | null;
  lifeUpdateId: LifeUpdateId | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationPage {
  items: Notification[];
  nextCursor: string | null;
  unreadCount: number;
}

export interface PostMedia {
  id: MediaAssetId;
  contentType: MediaAsset['contentType'];
  status: 'processing' | 'ready' | 'failed';
  url: string | null;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
}

export interface PostPage {
  items: Post[];
  nextCursor: string | null;
}

export interface CursorPageInput {
  cursor?: string | undefined;
  limit?: number | undefined;
}

export interface CreatePostInput {
  content: string;
  mediaAssetIds?: MediaAssetId[] | undefined;
}

export type CreatePostMediaUploadInput = CreateAvatarUploadInput;
export type CreatePostMediaUploadResult = CreateAvatarUploadResult;

export interface UpdatePostInput {
  content: string;
}

export interface CreateBoxInput {
  name: string;
}

export interface UpdateBoxInput {
  name?: string | undefined;
  status?: BoxStatus | undefined;
}

export interface CreateBoxInvitationInput {
  username: string;
}

export const LIFE_UPDATE_SECTION_KEYS = [
  'lifeLately',
  'workOrUniversity',
  'travel',
  'currentlyInto',
  'listeningTo',
  'watching',
  'reading',
  'excitedAbout',
  'whatsNext',
] as const;
export type LifeUpdateSectionKey = (typeof LIFE_UPDATE_SECTION_KEYS)[number];
export type LifeUpdateSections = Partial<Record<LifeUpdateSectionKey, string>>;
export type LifeUpdateAudience =
  { type: 'only_me' } | { type: 'boxes'; boxIds: BoxId[] };

export interface LifeUpdateContext {
  postId: PostId;
  audience: 'box' | 'only_me';
  boxId: BoxId | null;
  boxName: string | null;
  interactions: PostInteractions;
}

export interface LifeUpdate {
  id: LifeUpdateId;
  author: Post['author'];
  sections: LifeUpdateSections;
  media: PostMedia[];
  contexts: LifeUpdateContext[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateLifeUpdateInput {
  audience: LifeUpdateAudience;
  sections: LifeUpdateSections;
  mediaAssetIds?: MediaAssetId[] | undefined;
}

export interface UpdateLifeUpdateInput {
  sections: LifeUpdateSections;
  mediaAssetIds?: MediaAssetId[] | undefined;
}

export interface LifeUpdatePage {
  items: LifeUpdate[];
  nextCursor: string | null;
}

export interface StandardFeedItem {
  type: 'standard';
  occurredAt: string;
  post: Post;
}

export interface LifeUpdateFeedItem {
  type: 'life_update';
  occurredAt: string;
  lifeUpdate: LifeUpdate;
}

export type FeedItem = StandardFeedItem | LifeUpdateFeedItem;

export type CreateLifeUpdateMediaUploadInput = CreateAvatarUploadInput;
export type CreateLifeUpdateMediaUploadResult = CreateAvatarUploadResult;

export interface MemoryYear {
  year: number;
  count: number;
}

export type MemoryItem =
  | { type: 'post'; occurredAt: string; post: Post }
  | { type: 'life_update'; occurredAt: string; lifeUpdate: LifeUpdate };

export interface MemoryPage {
  items: MemoryItem[];
  nextCursor: string | null;
}

export interface CreateFriendRequestInput {
  username: string;
}

export interface ApiErrorShape {
  error: {
    code: string;
    message: string;
    requestId?: string;
  };
}

export interface HealthStatus {
  status: 'ok';
  service: string;
  version: string;
  timestamp: string;
}

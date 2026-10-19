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
export type RoomId = Brand<string, 'RoomId'>;

export type UserStatus = 'active' | 'suspended' | 'deleted';
export type OnboardingState = 'username' | 'profile' | 'avatar' | 'complete';
export type MediaAssetStatus = 'pending' | 'processing' | 'ready' | 'failed';
export type MediaAssetPurpose =
  | 'avatar'
  | 'post_image'
  | 'reaction_image'
  | 'life_update_image'
  | 'room_banner';
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

export const ROOM_THEME_PRESETS = [
  'obsidian_gold',
  'cream_paper',
  'lavender_dream',
  'ocean_glow',
  'daisy_day',
  'neon_night',
  'y2k_glitter',
  'dark_academia',
  'frutiger_aero',
  'tumblr_2014',
  'retro_windows',
  'cyberpunk',
  'minimal_editorial',
  'polaroid_scrapbook',
] as const;
export type RoomThemePreset = (typeof ROOM_THEME_PRESETS)[number];
export const roomThemeRegistry: Record<
  RoomThemePreset,
  {
    label: string;
    defaults: {
      accent: string;
      background: string;
      font: string;
      decorationPack: string;
      sparkles: boolean;
    };
    variables: Record<`--${string}`, string>;
  }
> = {
  obsidian_gold: roomTheme(
    'Obsidian Gold',
    '#14110d',
    '#f7efd9',
    '#c4933f',
    '#211b14',
    'none',
    'gold',
  ),
  cream_paper: roomTheme(
    'Cream Paper',
    '#f8f0df',
    '#241d16',
    '#b47a22',
    '#fffaf0',
    'tape',
    'gold',
  ),
  lavender_dream: roomTheme(
    'Lavender Dream',
    '#eee6fa',
    '#2e2140',
    '#8c63bd',
    '#faf7ff',
    'stars',
    'lavender',
  ),
  ocean_glow: roomTheme(
    'Ocean Glow',
    '#dff5f4',
    '#102f39',
    '#168ca0',
    '#f5ffff',
    'stars',
    'ocean',
  ),
  daisy_day: roomTheme(
    'Daisy Day',
    '#fff4c9',
    '#3a3115',
    '#db8d16',
    '#fffbed',
    'flowers',
    'daisy',
  ),
  neon_night: roomTheme(
    'Neon Night',
    '#100d20',
    '#f8f2ff',
    '#dc49ff',
    '#211839',
    'pixels',
    'pink',
  ),
  y2k_glitter: roomTheme(
    'Y2K Glitter',
    '#f2e8fa',
    '#352044',
    '#ad65d5',
    '#fff7ff',
    'stars',
    'lavender',
  ),
  dark_academia: roomTheme(
    'Dark Academia',
    '#211b14',
    '#f1dfbd',
    '#a7763e',
    '#30271c',
    'tape',
    'gold',
  ),
  frutiger_aero: roomTheme(
    'Frutiger Aero',
    '#dff7ff',
    '#12374a',
    '#2d9d4d',
    '#f7ffff',
    'stickers',
    'emerald',
  ),
  tumblr_2014: roomTheme(
    'Tumblr 2014',
    '#263247',
    '#f5f7fb',
    '#7fa4d8',
    '#34445f',
    'stars',
    'ocean',
  ),
  retro_windows: roomTheme(
    'Retro Windows',
    '#c0c0c0',
    '#101010',
    '#000080',
    '#ececec',
    'pixels',
    'cyan',
  ),
  cyberpunk: roomTheme(
    'Cyberpunk',
    '#110b1b',
    '#f4ff52',
    '#00e5ff',
    '#21122d',
    'pixels',
    'cyan',
  ),
  minimal_editorial: roomTheme(
    'Minimal Editorial',
    '#f7f5f0',
    '#151515',
    '#a23c2d',
    '#ffffff',
    'none',
    'crimson',
  ),
  polaroid_scrapbook: roomTheme(
    'Polaroid Scrapbook',
    '#eee3cc',
    '#292118',
    '#b85542',
    '#fffdf8',
    'tape',
    'crimson',
  ),
};

function roomTheme(
  ...[
    label,
    canvas,
    text,
    accent,
    surface,
    decorationPack,
    accentToken,
  ]: readonly [string, string, string, string, string, string, string]
) {
  return {
    label,
    defaults: {
      accent: accentToken,
      background: 'theme',
      font: 'editorial',
      decorationPack,
      sparkles: decorationPack === 'stars',
    },
    variables: {
      '--room-canvas': canvas,
      '--room-text': text,
      '--room-accent': accent,
      '--room-surface': surface,
      '--room-border': `${accent}66`,
    },
  };
}
export const ROOM_WIDGET_TYPES = [
  'currently',
  'music',
  'top_friends',
  'photos',
  'life_updates',
  'posts',
  'memories',
] as const;
export type RoomWidgetType = (typeof ROOM_WIDGET_TYPES)[number];
export type RoomVisibility = 'friends' | 'members' | 'hidden';
export type RoomLayout = 'single' | 'two_column';
export type RoomWidgetPlacement = 'main' | 'sidebar';
export type TopFriendsSize = 4 | 8 | 12;
export type TopFriendsVisibility = 'visible' | 'friends' | 'hidden';
export type AppearancePreference = 'light' | 'dark' | 'system';
export type RoomViewerRelationship = 'owner' | 'friend' | 'member';

export interface RoomMusic {
  url: string;
  title: string | null;
  artist: string | null;
}

export interface RoomWidget {
  type: RoomWidgetType;
  placement: RoomWidgetPlacement;
  position: number;
  enabled: boolean;
}

export interface RoomTopFriend {
  userId: UserId;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  position: number;
}

export interface RoomConfiguration {
  id: RoomId;
  ownerUserId: UserId;
  visibility: RoomVisibility;
  themePreset: RoomThemePreset;
  configurationVersion: 1;
  layout: RoomLayout;
  accent: string;
  background: string;
  font: string;
  decorationPack: string;
  sparkles: boolean;
  location: string | null;
  currently: string | null;
  music: RoomMusic | null;
  bannerMediaId: MediaAssetId | null;
  bannerUrl: string | null;
  topFriendsSize: TopFriendsSize;
  topFriendsVisibility: TopFriendsVisibility;
  widgets: RoomWidget[];
  topFriends: RoomTopFriend[];
  createdAt: string;
  updatedAt: string;
}

export interface RoomView extends RoomConfiguration {
  owner: Pick<
    Profile,
    'userId' | 'username' | 'displayName' | 'bio' | 'avatarUrl'
  >;
  viewerRelationship: RoomViewerRelationship;
}

export interface UpdateRoomInput {
  visibility?: RoomVisibility;
  themePreset?: RoomThemePreset;
  layout?: RoomLayout;
  accent?: string;
  background?: string;
  font?: string;
  decorationPack?: string;
  sparkles?: boolean;
  location?: string | null;
  currently?: string | null;
  music?: RoomMusic | null;
  expectedUpdatedAt?: string;
}

export interface UpdateRoomWidgetsInput {
  widgets: RoomWidget[];
  expectedUpdatedAt?: string;
}

export interface UpdateRoomTopFriendsInput {
  userIds: UserId[];
  size: TopFriendsSize;
  visibility: TopFriendsVisibility;
  expectedUpdatedAt?: string;
}

export interface UserPreferences {
  appearance: AppearancePreference;
  updatedAt: string;
}

export interface UpdateUserPreferencesInput {
  appearance: AppearancePreference;
}

export interface RoomGalleryItem {
  media: PostMedia;
  postId: PostId;
  lifeUpdateId: LifeUpdateId | null;
  occurredAt: string;
}

export interface RoomGalleryPage {
  items: RoomGalleryItem[];
  nextCursor: string | null;
}

export type CreateRoomBannerUploadInput = CreateAvatarUploadInput;
export type CreateRoomBannerUploadResult = CreateAvatarUploadResult;

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

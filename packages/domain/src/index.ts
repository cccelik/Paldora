declare const brand: unique symbol;
export const POST_EVENT_CHANNEL = 'paldora:post-events:v1';
export type Brand<Value, Name extends string> = Value & {
  readonly [brand]: Name;
};

export type UserId = Brand<string, 'UserId'>;
export type MediaAssetId = Brand<string, 'MediaAssetId'>;
export type BoxId = Brand<string, 'BoxId'>;
export type BoxInvitationId = Brand<string, 'BoxInvitationId'>;
export type FriendshipId = Brand<string, 'FriendshipId'>;
export type PostId = Brand<string, 'PostId'>;

export type UserStatus = 'active' | 'suspended' | 'deleted';
export type OnboardingState = 'username' | 'profile' | 'avatar' | 'complete';
export type MediaAssetStatus = 'pending' | 'processing' | 'ready' | 'failed';
export type MediaAssetPurpose = 'avatar' | 'post_image';
export type BoxRole = 'owner' | 'admin' | 'member';
export type BoxStatus = 'active' | 'archived';
export type BoxMembershipStatus = 'active' | 'left' | 'removed';
export type BoxInvitationStatus =
  'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';
export type FriendshipStatus = 'pending' | 'accepted' | 'declined' | 'blocked';
export type PostStatus = 'active' | 'deleted';

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
  status: 'active';
  editedAt: string | null;
  createdAt: string;
  updatedAt: string;
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

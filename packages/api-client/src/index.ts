import type {
  ApiErrorShape,
  Box,
  BoxId,
  BoxInvitation,
  BoxInvitationId,
  BoxMember,
  BoxRole,
  Comment,
  CommentId,
  CommentPage,
  CommentInteractions,
  CreateCommentInput,
  CreateBoxInput,
  CreateBoxInvitationInput,
  CreateFriendRequestInput,
  CreateLifeUpdateInput,
  CreateLifeUpdateMediaUploadInput,
  CreateLifeUpdateMediaUploadResult,
  CreateAvatarUploadInput,
  CreateAvatarUploadResult,
  CreatePostInput,
  CreatePostMediaUploadInput,
  CreatePostMediaUploadResult,
  CreateReactionPhotoUploadInput,
  CreateReactionPhotoUploadResult,
  CursorPageInput,
  CurrentUser,
  HealthStatus,
  Friendship,
  FriendshipId,
  MediaAsset,
  MediaAssetId,
  LifeUpdate,
  LifeUpdateId,
  LifeUpdatePage,
  MemoryPage,
  MemoryYear,
  NotificationId,
  NotificationPage,
  Post,
  PostId,
  PostPage,
  PostInteractions,
  SetPostReactionInput,
  SetCommentReactionInput,
  UpdateCommentInput,
  UpdatePostInput,
  UpdateProfileInput,
  UpdateLifeUpdateInput,
  UsernameAvailability,
  UserId,
} from '@paldora/domain';

export class ApiClientError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  fetchImplementation?: typeof fetch;
  getAccessToken?: () => Promise<string | null>;
}

interface SendOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal | undefined;
  authenticated?: boolean;
}

export class PaldoraApiClient {
  private readonly request: typeof fetch;
  private readonly baseUrl: string;
  private readonly getAccessToken: () => Promise<string | null>;

  public constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.request =
      options.fetchImplementation ?? globalThis.fetch.bind(globalThis);
    this.getAccessToken =
      options.getAccessToken ?? (() => Promise.resolve(null));
  }

  public async health(signal?: AbortSignal): Promise<HealthStatus> {
    return this.send<HealthStatus>('/health', { signal, authenticated: false });
  }

  public currentUser(signal?: AbortSignal): Promise<CurrentUser> {
    return this.send('/me', { signal });
  }

  public usernameAvailability(
    username: string,
    signal?: AbortSignal,
  ): Promise<UsernameAvailability> {
    return this.send('/me/username/availability', {
      method: 'POST',
      body: { username },
      signal,
    });
  }

  public updateProfile(
    input: UpdateProfileInput,
    signal?: AbortSignal,
  ): Promise<CurrentUser> {
    return this.send('/me/profile', {
      method: 'PATCH',
      body: input,
      signal,
    });
  }

  public createAvatarUpload(
    input: CreateAvatarUploadInput,
    signal?: AbortSignal,
  ): Promise<CreateAvatarUploadResult> {
    return this.send('/me/avatar/uploads', {
      method: 'POST',
      body: input,
      signal,
    });
  }

  public completeAvatarUpload(
    id: MediaAssetId,
    signal?: AbortSignal,
  ): Promise<CurrentUser> {
    return this.send(`/me/avatar/uploads/${id}/complete`, {
      method: 'POST',
      signal,
    });
  }

  public deleteAvatar(signal?: AbortSignal): Promise<CurrentUser> {
    return this.send('/me/avatar', { method: 'DELETE', signal });
  }

  public boxes(signal?: AbortSignal): Promise<Box[]> {
    return this.send('/boxes', { signal });
  }

  public createBox(input: CreateBoxInput, signal?: AbortSignal): Promise<Box> {
    return this.send('/boxes', { method: 'POST', body: input, signal });
  }

  public box(id: BoxId, signal?: AbortSignal): Promise<Box> {
    return this.send(`/boxes/${id}`, { signal });
  }

  public updateBox(
    id: BoxId,
    input: { name?: string; status?: 'active' | 'archived' },
    signal?: AbortSignal,
  ): Promise<Box> {
    return this.send(`/boxes/${id}`, {
      method: 'PATCH',
      body: input,
      signal,
    });
  }

  public deleteBox(
    id: BoxId,
    signal?: AbortSignal,
  ): Promise<{ success: true }> {
    return this.send(`/boxes/${id}`, { method: 'DELETE', signal });
  }

  public boxMembers(id: BoxId, signal?: AbortSignal): Promise<BoxMember[]> {
    return this.send(`/boxes/${id}/members`, { signal });
  }

  public inviteToBox(
    id: BoxId,
    input: CreateBoxInvitationInput,
    signal?: AbortSignal,
  ): Promise<BoxInvitation> {
    return this.send(`/boxes/${id}/invitations`, {
      method: 'POST',
      body: input,
      signal,
    });
  }

  public pendingBoxInvitees(
    boxId: BoxId,
    signal?: AbortSignal,
  ): Promise<{ inviteeUserIds: UserId[] }> {
    return this.send(`/boxes/${boxId}/invitations`, { signal });
  }

  public boxInvitations(signal?: AbortSignal): Promise<BoxInvitation[]> {
    return this.send('/me/box-invitations', { signal });
  }

  public respondToBoxInvitation(
    id: BoxInvitationId,
    response: 'accept' | 'decline',
    signal?: AbortSignal,
  ): Promise<{ status: 'accepted' | 'declined' }> {
    return this.send(`/box-invitations/${id}/${response}`, {
      method: 'POST',
      signal,
    });
  }

  public updateBoxMemberRole(
    boxId: BoxId,
    userId: UserId,
    role: Exclude<BoxRole, 'owner'>,
    signal?: AbortSignal,
  ): Promise<{ role: Exclude<BoxRole, 'owner'> }> {
    return this.send(`/boxes/${boxId}/members/${userId}`, {
      method: 'PATCH',
      body: { role },
      signal,
    });
  }

  public transferBoxOwnership(
    boxId: BoxId,
    userId: UserId,
    signal?: AbortSignal,
  ): Promise<{ ownerUserId: UserId }> {
    return this.send(`/boxes/${boxId}/owner`, {
      method: 'PATCH',
      body: { userId },
      signal,
    });
  }

  public removeBoxMember(
    boxId: BoxId,
    userId: UserId,
    signal?: AbortSignal,
  ): Promise<{ success: true; status: 'left' | 'removed' }> {
    return this.send(`/boxes/${boxId}/members/${userId}`, {
      method: 'DELETE',
      signal,
    });
  }

  public leaveBox(
    boxId: BoxId,
    signal?: AbortSignal,
  ): Promise<{ success: true; status: 'left' }> {
    return this.send(`/boxes/${boxId}/members/me`, {
      method: 'DELETE',
      signal,
    });
  }

  public friends(signal?: AbortSignal): Promise<Friendship[]> {
    return this.send('/friends', { signal });
  }

  public friendRequests(signal?: AbortSignal): Promise<Friendship[]> {
    return this.send('/friend-requests', { signal });
  }

  public createFriendRequest(
    input: CreateFriendRequestInput,
    signal?: AbortSignal,
  ): Promise<Friendship> {
    return this.send('/friend-requests', {
      method: 'POST',
      body: input,
      signal,
    });
  }

  public respondToFriendRequest(
    id: FriendshipId,
    response: 'accept' | 'decline',
    signal?: AbortSignal,
  ): Promise<Friendship> {
    return this.send(`/friend-requests/${id}/${response}`, {
      method: 'POST',
      signal,
    });
  }

  public removeFriend(
    userId: UserId,
    signal?: AbortSignal,
  ): Promise<{ success: true }> {
    return this.send(`/friends/${userId}`, { method: 'DELETE', signal });
  }

  public blockedUsers(signal?: AbortSignal): Promise<Friendship[]> {
    return this.send('/blocks', { signal });
  }

  public blockUser(
    input: CreateFriendRequestInput,
    signal?: AbortSignal,
  ): Promise<Friendship> {
    return this.send('/blocks', { method: 'POST', body: input, signal });
  }

  public unblockUser(
    userId: UserId,
    signal?: AbortSignal,
  ): Promise<{ success: true }> {
    return this.send(`/blocks/${userId}`, { method: 'DELETE', signal });
  }

  public createPost(
    boxId: BoxId,
    input: CreatePostInput,
    signal?: AbortSignal,
  ): Promise<Post> {
    return this.send(`/boxes/${boxId}/posts`, {
      method: 'POST',
      body: input,
      signal,
    });
  }

  public createLifeUpdate(
    input: CreateLifeUpdateInput,
    signal?: AbortSignal,
  ): Promise<LifeUpdate> {
    return this.send('/me/life-updates', {
      method: 'POST',
      body: input,
      signal,
    });
  }

  public lifeUpdates(
    page?: CursorPageInput,
    signal?: AbortSignal,
  ): Promise<LifeUpdatePage> {
    return this.send(pagePath('/me/life-updates', page), { signal });
  }

  public feedLifeUpdates(
    page?: CursorPageInput,
    signal?: AbortSignal,
  ): Promise<LifeUpdatePage> {
    return this.send(pagePath('/me/feed/life-updates', page), { signal });
  }

  public boxLifeUpdates(
    boxId: BoxId,
    page?: CursorPageInput,
    signal?: AbortSignal,
  ): Promise<LifeUpdatePage> {
    return this.send(pagePath(`/boxes/${boxId}/life-updates`, page), {
      signal,
    });
  }

  public userLifeUpdates(
    username: string,
    page?: CursorPageInput,
    signal?: AbortSignal,
  ): Promise<LifeUpdatePage> {
    return this.send(
      pagePath(`/users/${encodeURIComponent(username)}/life-updates`, page),
      { signal },
    );
  }

  public lifeUpdate(
    id: LifeUpdateId,
    signal?: AbortSignal,
  ): Promise<LifeUpdate> {
    return this.send(`/life-updates/${id}`, { signal });
  }

  public updateLifeUpdate(
    id: LifeUpdateId,
    input: UpdateLifeUpdateInput,
    signal?: AbortSignal,
  ): Promise<LifeUpdate> {
    return this.send(`/life-updates/${id}`, {
      method: 'PATCH',
      body: input,
      signal,
    });
  }

  public deleteLifeUpdate(
    id: LifeUpdateId,
    signal?: AbortSignal,
  ): Promise<{ success: true }> {
    return this.send(`/life-updates/${id}`, { method: 'DELETE', signal });
  }

  public createLifeUpdateMediaUpload(
    input: CreateLifeUpdateMediaUploadInput,
    signal?: AbortSignal,
  ): Promise<CreateLifeUpdateMediaUploadResult> {
    return this.send('/life-update-media/uploads', {
      method: 'POST',
      body: input,
      signal,
    });
  }

  public completeLifeUpdateMediaUpload(
    id: MediaAssetId,
    signal?: AbortSignal,
  ): Promise<MediaAsset> {
    return this.send(`/life-update-media/uploads/${id}/complete`, {
      method: 'POST',
      signal,
    });
  }

  public cancelLifeUpdateMediaUpload(
    id: MediaAssetId,
    signal?: AbortSignal,
  ): Promise<{ success: true }> {
    return this.send(`/life-update-media/uploads/${id}`, {
      method: 'DELETE',
      signal,
    });
  }

  public memoryYears(
    boxId?: BoxId,
    signal?: AbortSignal,
  ): Promise<MemoryYear[]> {
    return this.send(
      boxId ? `/boxes/${boxId}/memories/years` : '/me/memories/years',
      { signal },
    );
  }

  public memories(
    input: { year: number; month?: number; cursor?: string; limit?: number },
    boxId?: BoxId,
    signal?: AbortSignal,
  ): Promise<MemoryPage> {
    const search = new URLSearchParams({
      year: String(input.year),
      limit: String(input.limit ?? 20),
    });
    if (input.month) search.set('month', String(input.month));
    if (input.cursor) search.set('cursor', input.cursor);
    const base = boxId ? `/boxes/${boxId}/memories` : '/me/memories';
    return this.send(`${base}?${search.toString()}`, { signal });
  }

  public createPostMediaUpload(
    boxId: BoxId,
    input: CreatePostMediaUploadInput,
    signal?: AbortSignal,
  ): Promise<CreatePostMediaUploadResult> {
    return this.send(`/boxes/${boxId}/post-media/uploads`, {
      method: 'POST',
      body: input,
      signal,
    });
  }

  public completePostMediaUpload(
    id: MediaAssetId,
    signal?: AbortSignal,
  ): Promise<MediaAsset> {
    return this.send(`/post-media/uploads/${id}/complete`, {
      method: 'POST',
      signal,
    });
  }

  public cancelPostMediaUpload(
    id: MediaAssetId,
    signal?: AbortSignal,
  ): Promise<{ success: true }> {
    return this.send(`/post-media/uploads/${id}`, {
      method: 'DELETE',
      signal,
    });
  }

  public boxPosts(
    boxId: BoxId,
    page?: CursorPageInput,
    signal?: AbortSignal,
  ): Promise<PostPage> {
    return this.send(pagePath(`/boxes/${boxId}/posts`, page), { signal });
  }

  public feed(page?: CursorPageInput, signal?: AbortSignal): Promise<PostPage> {
    return this.send(pagePath('/me/feed', page), { signal });
  }

  public post(id: PostId, signal?: AbortSignal): Promise<Post> {
    return this.send(`/posts/${id}`, { signal });
  }

  public updatePost(
    id: PostId,
    input: UpdatePostInput,
    signal?: AbortSignal,
  ): Promise<Post> {
    return this.send(`/posts/${id}`, {
      method: 'PATCH',
      body: input,
      signal,
    });
  }

  public deletePost(
    id: PostId,
    signal?: AbortSignal,
  ): Promise<{ success: true }> {
    return this.send(`/posts/${id}`, { method: 'DELETE', signal });
  }

  public postComments(
    postId: PostId,
    page?: CursorPageInput,
    signal?: AbortSignal,
  ): Promise<CommentPage> {
    return this.send(pagePath(`/posts/${postId}/comments`, page), { signal });
  }

  public createComment(
    postId: PostId,
    input: CreateCommentInput,
    signal?: AbortSignal,
  ): Promise<Comment> {
    return this.send(`/posts/${postId}/comments`, {
      method: 'POST',
      body: input,
      signal,
    });
  }

  public updateComment(
    commentId: CommentId,
    input: UpdateCommentInput,
    signal?: AbortSignal,
  ): Promise<Comment> {
    return this.send(`/comments/${commentId}`, {
      method: 'PATCH',
      body: input,
      signal,
    });
  }

  public deleteComment(
    commentId: CommentId,
    signal?: AbortSignal,
  ): Promise<{ success: true }> {
    return this.send(`/comments/${commentId}`, {
      method: 'DELETE',
      signal,
    });
  }

  public setCommentReaction(
    commentId: CommentId,
    input: SetCommentReactionInput,
    signal?: AbortSignal,
  ): Promise<CommentInteractions> {
    return this.send(`/comments/${commentId}/reaction`, {
      method: 'PUT',
      body: input,
      signal,
    });
  }

  public setPostReaction(
    postId: PostId,
    input: SetPostReactionInput,
    signal?: AbortSignal,
  ): Promise<PostInteractions> {
    return this.send(`/posts/${postId}/reaction`, {
      method: 'PUT',
      body: input,
      signal,
    });
  }

  public createReactionPhotoUpload(
    postId: PostId,
    input: CreateReactionPhotoUploadInput,
    signal?: AbortSignal,
  ): Promise<CreateReactionPhotoUploadResult> {
    return this.send(`/posts/${postId}/reaction-media/uploads`, {
      method: 'POST',
      body: input,
      signal,
    });
  }

  public completeReactionPhotoUpload(
    id: MediaAssetId,
    signal?: AbortSignal,
  ): Promise<MediaAsset> {
    return this.send(`/reaction-media/uploads/${id}/complete`, {
      method: 'POST',
      signal,
    });
  }

  public cancelReactionPhotoUpload(
    id: MediaAssetId,
    signal?: AbortSignal,
  ): Promise<{ success: true }> {
    return this.send(`/reaction-media/uploads/${id}`, {
      method: 'DELETE',
      signal,
    });
  }

  public notifications(
    page?: CursorPageInput,
    signal?: AbortSignal,
  ): Promise<NotificationPage> {
    return this.send(pagePath('/me/notifications', page), { signal });
  }

  public unreadNotificationCount(
    signal?: AbortSignal,
  ): Promise<{ unreadCount: number }> {
    return this.send('/me/notifications/unread-count', { signal });
  }

  public markNotificationRead(
    notificationId: NotificationId,
    signal?: AbortSignal,
  ): Promise<{ success: true }> {
    return this.send(`/me/notifications/${notificationId}/read`, {
      method: 'PATCH',
      signal,
    });
  }

  public markAllNotificationsRead(
    signal?: AbortSignal,
  ): Promise<{ success: true }> {
    return this.send('/me/notifications/read', {
      method: 'PATCH',
      signal,
    });
  }

  private async send<Result>(
    path: string,
    options: SendOptions = {},
  ): Promise<Result> {
    const token =
      options.authenticated === false ? null : await this.getAccessToken();
    const requestInit = requestOptions(options, token);
    const response = await this.request(`${this.baseUrl}${path}`, requestInit);
    if (!response.ok) throw await responseError(response);
    return (await response.json()) as Result;
  }
}

function requestOptions(
  options: SendOptions,
  token: string | null,
): RequestInit {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  return {
    method: options.method ?? 'GET',
    headers,
    cache: 'no-store',
    ...(options.body !== undefined
      ? { body: JSON.stringify(options.body) }
      : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  };
}

async function responseError(response: Response): Promise<ApiClientError> {
  const body = (await response
    .json()
    .catch(() => null)) as ApiErrorShape | null;
  return new ApiClientError(
    response.status,
    body?.error.code ?? 'UNEXPECTED_API_ERROR',
    body?.error.message ?? 'The Paldora API request failed.',
  );
}

function pagePath(path: string, page?: CursorPageInput): string {
  const query = new URLSearchParams();
  if (page?.cursor) query.set('cursor', page.cursor);
  if (page?.limit !== undefined) query.set('limit', String(page.limit));
  const value = query.toString();
  return value ? `${path}?${value}` : path;
}

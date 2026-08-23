import type {
  ApiErrorShape,
  Box,
  BoxId,
  BoxInvitation,
  BoxInvitationId,
  BoxMember,
  BoxRole,
  CreateBoxInput,
  CreateBoxInvitationInput,
  CreateFriendRequestInput,
  CreateAvatarUploadInput,
  CreateAvatarUploadResult,
  CreatePostInput,
  CursorPageInput,
  CurrentUser,
  HealthStatus,
  Friendship,
  FriendshipId,
  MediaAssetId,
  Post,
  PostId,
  PostPage,
  UpdatePostInput,
  UpdateProfileInput,
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

  private async send<Result>(
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
      body?: unknown;
      signal?: AbortSignal | undefined;
      authenticated?: boolean;
    } = {},
  ): Promise<Result> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (options.body !== undefined)
      headers['content-type'] = 'application/json';
    if (options.authenticated !== false) {
      const token = await this.getAccessToken();
      if (token) headers.authorization = `Bearer ${token}`;
    }
    const requestInit: RequestInit = {
      method: options.method ?? 'GET',
      headers,
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    };
    const response = await this.request(`${this.baseUrl}${path}`, requestInit);
    if (!response.ok) {
      const body = (await response
        .json()
        .catch(() => null)) as ApiErrorShape | null;
      throw new ApiClientError(
        response.status,
        body?.error.code ?? 'UNEXPECTED_API_ERROR',
        body?.error.message ?? 'The Paldora API request failed.',
      );
    }
    return (await response.json()) as Result;
  }
}

function pagePath(path: string, page?: CursorPageInput): string {
  const query = new URLSearchParams();
  if (page?.cursor) query.set('cursor', page.cursor);
  if (page?.limit !== undefined) query.set('limit', String(page.limit));
  const value = query.toString();
  return value ? `${path}?${value}` : path;
}

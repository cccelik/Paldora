import {
  type UpdatePersonalizationInput,
  apiRoutes,
  errorEnvelopeSchema,
  type CreateBoxInput,
  type CreateCommentInput,
  type CreateLifeUpdateInput,
  type UpdateLifeUpdateInput,
  type CreateMediaUploadInput,
  type MemoryType,
  type CreatePostInput,
  type SetPostReactionInput,
  type UpdatePreferencesInput,
  type UpdateBoxInput,
  type UpdateRoomRequest,
  type UpdateRoomTopFriendsRequest,
  type UpdateRoomWidgetsRequest,
  type RouteDefinition,
  type RouteResponse,
  type CreateReportInput,
} from '@paldora/validation';
import type { z } from 'zod';

/**
 * A failed API call. `code` is the stable public error code; branch on it,
 * never on `message`, which is human copy and may change.
 */
export class ApiClientError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId: string | null,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export interface PaldoraApiClientOptions {
  /** Absolute base URL ending in `/api/v1`. */
  baseUrl: string;
  /** Returns a current access token, or null for anonymous calls. */
  getAccessToken?: () => Promise<string | null>;
  fetch?: typeof globalThis.fetch;
}

/** Keyset paging for every list: opaque `cursor`, `limit` of 1–50. */
// A type alias (not an interface) so it is assignable to a query record.
export type PageOptions = {
  cursor?: string | undefined;
  limit?: number | undefined;
};

/** A Memories page: `year` is required, `month` and `type` optional. */
export type MemoryOptions = PageOptions & {
  year: number;
  month?: number | undefined;
  type?: MemoryType | undefined;
};

export type RoomContentOptions = PageOptions & {
  year?: number | undefined;
  month?: number | undefined;
  type?: MemoryType | undefined;
};

/** The profile fields a client may send; see `updateProfileSchema`. */
export type ProfileChanges = z.input<typeof apiRoutes.updateProfile.body>;

interface CallOptions {
  params?: Readonly<Record<string, string>>;
  query?: Readonly<Record<string, string | number | undefined>>;
  body?: unknown;
  signal?: AbortSignal;
}

function buildPath(
  route: RouteDefinition,
  params: CallOptions['params'] = {},
): string {
  return route.path.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) {
      throw new Error(
        `Missing path parameter ${name} for ${route.operationId}.`,
      );
    }
    return encodeURIComponent(value);
  });
}

function buildQuery(query: CallOptions['query'] = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const serialized = search.toString();
  return serialized ? `?${serialized}` : '';
}

async function toError(response: Response): Promise<ApiClientError> {
  const fallback = new ApiClientError(
    response.status,
    response.status >= 500 ? 'INTERNAL_ERROR' : 'UNEXPECTED_RESPONSE',
    'Something went wrong. Try again.',
    response.headers.get('x-request-id'),
  );
  const parsed = errorEnvelopeSchema.safeParse(
    await response.json().catch(() => null),
  );
  if (!parsed.success) return fallback;
  const { code, message, requestId } = parsed.data.error;
  return new ApiClientError(response.status, code, message, requestId);
}

export class PaldoraApiClient {
  private readonly baseUrl: string;
  private readonly fetchImplementation: typeof globalThis.fetch;

  public constructor(private readonly options: PaldoraApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.fetchImplementation =
      options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  public liveness(signal?: AbortSignal) {
    return this.call(apiRoutes.getLiveness, signal ? { signal } : {});
  }

  public readiness(signal?: AbortSignal) {
    return this.call(apiRoutes.getReadiness, signal ? { signal } : {});
  }

  public currentUser() {
    return this.call(apiRoutes.getCurrentUser);
  }

  public createReport(body: CreateReportInput) {
    return this.call(apiRoutes.createReport, { body });
  }

  public myReports(page: PageOptions = {}) {
    return this.call(apiRoutes.listMyReports, { query: page });
  }

  public moderationCases(page: PageOptions = {}) {
    return this.call(apiRoutes.listModerationCases, { query: page });
  }

  public moderationCase(caseId: string) {
    return this.call(apiRoutes.getModerationCase, { params: { caseId } });
  }

  /** Accepts the wire input; the server validates and normalizes it. */
  public updateProfile(body: ProfileChanges) {
    return this.call(apiRoutes.updateProfile, { body });
  }

  public usernameAvailability(username: string) {
    return this.call(apiRoutes.getUsernameAvailability, {
      query: { username },
    });
  }

  public updatePreferences(body: UpdatePreferencesInput) {
    return this.call(apiRoutes.updatePreferences, { body });
  }

  public deleteAvatar() {
    return this.call(apiRoutes.deleteAvatar);
  }

  public createMediaUpload(body: CreateMediaUploadInput) {
    return this.call(apiRoutes.createMediaUpload, { body });
  }

  public completeMediaUpload(mediaAssetId: string) {
    return this.call(apiRoutes.completeMediaUpload, {
      params: { mediaAssetId },
    });
  }

  public mediaAsset(mediaAssetId: string) {
    return this.call(apiRoutes.getMediaAsset, { params: { mediaAssetId } });
  }

  // --- Friends and blocks ---------------------------------------------------

  public friends(page: PageOptions = {}) {
    return this.call(apiRoutes.listFriends, { query: page });
  }

  public friendRequests(page: PageOptions = {}) {
    return this.call(apiRoutes.listFriendRequests, { query: page });
  }

  public sendFriendRequest(username: string) {
    return this.call(apiRoutes.createFriendRequest, { body: { username } });
  }

  public acceptFriendRequest(friendshipId: string) {
    return this.call(apiRoutes.acceptFriendRequest, {
      params: { friendshipId },
    });
  }

  public declineFriendRequest(friendshipId: string) {
    return this.call(apiRoutes.declineFriendRequest, {
      params: { friendshipId },
    });
  }

  public cancelFriendRequest(friendshipId: string) {
    return this.call(apiRoutes.cancelFriendRequest, {
      params: { friendshipId },
    });
  }

  public removeFriend(userId: string) {
    return this.call(apiRoutes.removeFriend, { params: { userId } });
  }

  public blocks(page: PageOptions = {}) {
    return this.call(apiRoutes.listBlocks, { query: page });
  }

  public block(username: string) {
    return this.call(apiRoutes.createBlock, { body: { username } });
  }

  public unblock(userId: string) {
    return this.call(apiRoutes.removeBlock, { params: { userId } });
  }

  // --- Boxes ---------------------------------------------------------------

  public boxes(page: PageOptions = {}) {
    return this.call(apiRoutes.listBoxes, { query: page });
  }

  public createBox(body: CreateBoxInput) {
    return this.call(apiRoutes.createBox, { body });
  }

  public box(boxId: string) {
    return this.call(apiRoutes.getBox, { params: { boxId } });
  }

  public updateBox(boxId: string, body: UpdateBoxInput) {
    return this.call(apiRoutes.updateBox, { params: { boxId }, body });
  }

  public deleteBox(boxId: string, confirmName: string) {
    return this.call(apiRoutes.deleteBox, {
      params: { boxId },
      query: { confirmName },
    });
  }

  public boxMembers(boxId: string, page: PageOptions = {}) {
    return this.call(apiRoutes.listBoxMembers, {
      params: { boxId },
      query: page,
    });
  }

  public setBoxMemberRole(
    boxId: string,
    userId: string,
    role: 'admin' | 'member',
  ) {
    return this.call(apiRoutes.updateBoxMember, {
      params: { boxId, userId },
      body: { role },
    });
  }

  public removeBoxMember(boxId: string, userId: string) {
    return this.call(apiRoutes.removeBoxMember, { params: { boxId, userId } });
  }

  public leaveBox(boxId: string) {
    return this.call(apiRoutes.leaveBox, { params: { boxId } });
  }

  public transferBoxOwnership(boxId: string, userId: string) {
    return this.call(apiRoutes.transferBoxOwnership, {
      params: { boxId },
      body: { userId },
    });
  }

  public inviteToBox(boxId: string, username: string) {
    return this.call(apiRoutes.createBoxInvitation, {
      params: { boxId },
      body: { username },
    });
  }

  public boxInvitations(boxId: string, page: PageOptions = {}) {
    return this.call(apiRoutes.listBoxInvitations, {
      params: { boxId },
      query: page,
    });
  }

  public revokeBoxInvitation(boxId: string, invitationId: string) {
    return this.call(apiRoutes.revokeBoxInvitation, {
      params: { boxId, invitationId },
    });
  }

  public myBoxInvitations(page: PageOptions = {}) {
    return this.call(apiRoutes.listMyBoxInvitations, { query: page });
  }

  public acceptBoxInvitation(invitationId: string) {
    return this.call(apiRoutes.acceptBoxInvitation, {
      params: { invitationId },
    });
  }

  // --- Posts ---------------------------------------------------------------

  public createPost(boxId: string, body: CreatePostInput) {
    return this.call(apiRoutes.createPost, { params: { boxId }, body });
  }

  public boxPosts(boxId: string, page: PageOptions = {}) {
    return this.call(apiRoutes.listBoxPosts, {
      params: { boxId },
      query: page,
    });
  }

  public homeFeed(page: PageOptions = {}) {
    return this.call(apiRoutes.getHomeFeed, { query: page });
  }

  public post(postId: string) {
    return this.call(apiRoutes.getPost, { params: { postId } });
  }

  public updatePost(postId: string, body: CreatePostInput) {
    return this.call(apiRoutes.updatePost, { params: { postId }, body });
  }

  public deletePost(postId: string) {
    return this.call(apiRoutes.deletePost, { params: { postId } });
  }

  // --- Comments ------------------------------------------------------------

  public createComment(postId: string, body: CreateCommentInput) {
    return this.call(apiRoutes.createComment, { params: { postId }, body });
  }

  /** Threads, newest root first, each with its oldest replies. */
  public comments(postId: string, page: PageOptions = {}) {
    return this.call(apiRoutes.listComments, {
      params: { postId },
      query: page,
    });
  }

  public commentReplies(commentId: string, page: PageOptions = {}) {
    return this.call(apiRoutes.listReplies, {
      params: { commentId },
      query: page,
    });
  }

  /** A comment and its thread's root, for deep links. */
  public comment(commentId: string) {
    return this.call(apiRoutes.getComment, { params: { commentId } });
  }

  public updateComment(commentId: string, content: string) {
    return this.call(apiRoutes.updateComment, {
      params: { commentId },
      body: { content },
    });
  }

  public deleteComment(commentId: string) {
    return this.call(apiRoutes.deleteComment, { params: { commentId } });
  }

  // --- Reactions -----------------------------------------------------------

  /**
   * Set-state: an emoji, `{ kind: 'real', mediaAssetId }` for a camera
   * image, or `{ kind: null }` to remove. Returns the post's new summary.
   */
  public setPostReaction(postId: string, body: SetPostReactionInput) {
    return this.call(apiRoutes.setPostReaction, { params: { postId }, body });
  }

  /** An emoji, or `null` to remove. Returns the comment's new summary. */
  public setCommentReaction(commentId: string, kind: string | null) {
    return this.call(apiRoutes.setCommentReaction, {
      params: { commentId },
      body: { kind },
    });
  }

  /** Who reacted, newest first; `kind` narrows to one emoji or `real`. */
  public postReactions(
    postId: string,
    options: PageOptions & { kind?: string | undefined } = {},
  ) {
    return this.call(apiRoutes.listPostReactions, {
      params: { postId },
      query: options,
    });
  }

  /** Exactly five distinct emoji, in order. */
  public setReactionPresets(presets: readonly string[]) {
    return this.call(apiRoutes.setReactionPresets, {
      body: { presets },
    });
  }

  public declineBoxInvitation(invitationId: string) {
    return this.call(apiRoutes.declineBoxInvitation, {
      params: { invitationId },
    });
  }

  // --- Life Updates --------------------------------------------------------

  /** The audience (`only_me` or 1–20 Boxes) is final once published. */
  public createLifeUpdate(body: CreateLifeUpdateInput) {
    return this.call(apiRoutes.createLifeUpdate, { body });
  }

  /** With a context (conversation) per delivery Box you belong to. */
  public lifeUpdate(lifeUpdateId: string) {
    return this.call(apiRoutes.getLifeUpdate, { params: { lifeUpdateId } });
  }

  /**
   * Author only. `sections` and `mediaAssetIds` each replace that part when
   * present; the audience never changes.
   */
  public updateLifeUpdate(lifeUpdateId: string, body: UpdateLifeUpdateInput) {
    return this.call(apiRoutes.updateLifeUpdate, {
      params: { lifeUpdateId },
      body,
    });
  }

  /** Removes it from every Box at once (idempotent). */
  public deleteLifeUpdate(lifeUpdateId: string) {
    return this.call(apiRoutes.deleteLifeUpdate, { params: { lifeUpdateId } });
  }

  /** Your own, newest first, including Only Me. */
  public myLifeUpdates(page: PageOptions = {}) {
    return this.call(apiRoutes.listMyLifeUpdates, { query: page });
  }

  // --- Memories ------------------------------------------------------------

  /**
   * One UTC year (or month) of what you can still access, newest first.
   * Keep `year`, `month`, and `type` the same when following `nextCursor`.
   */
  public myMemories(query: MemoryOptions) {
    return this.call(apiRoutes.listMyMemories, { query });
  }

  /** Counts per year, and per month of `year` (default: the newest). */
  public myMemorySummary(year?: number) {
    return this.call(apiRoutes.getMyMemorySummary, { query: { year } });
  }

  /** One Box's Memories; each Life Update carries only this Box's context. */
  public boxMemories(boxId: string, query: MemoryOptions) {
    return this.call(apiRoutes.listBoxMemories, {
      params: { boxId },
      query,
    });
  }

  public boxMemorySummary(boxId: string, year?: number) {
    return this.call(apiRoutes.getBoxMemorySummary, {
      params: { boxId },
      query: { year },
    });
  }

  // --- Rooms ---------------------------------------------------------------

  /**
   * Your own Room with the owner-only fields. `updatedAt` is the version to
   * send as `expectedUpdatedAt` on your next Room write (null: never saved).
   */
  public myRoomPersonalization() {
    return this.call(apiRoutes.getMyRoomPersonalization);
  }
  public roomPersonalization(username: string) {
    return this.call(apiRoutes.getRoomPersonalization, {
      params: { username },
    });
  }
  public updateMyRoomPersonalization(body: UpdatePersonalizationInput) {
    return this.call(apiRoutes.updateMyRoomPersonalization, { body });
  }

  public myRoom() {
    return this.call(apiRoutes.getMyRoom);
  }

  /** Someone's Room as you may see it; any denial is ROOM_NOT_FOUND. */
  public room(username: string) {
    return this.call(apiRoutes.getRoom, { params: { username } });
  }

  /**
   * The owner's posts and Life Updates you can reach today, newest first
   * (every year without `year`). Keep the query when following `nextCursor`.
   */
  public roomContent(username: string, query: RoomContentOptions = {}) {
    return this.call(apiRoutes.listRoomContent, {
      params: { username },
      query,
    });
  }

  /** Counts per year, and per month of `year`, over `roomContent`. */
  public roomContentSummary(username: string, year?: number) {
    return this.call(apiRoutes.getRoomContentSummary, {
      params: { username },
      query: { year },
    });
  }

  /** Photos you can reach; `limit` counts the items carrying them (≤ 12). */
  public roomPhotos(username: string, page: PageOptions = {}) {
    return this.call(apiRoutes.listRoomPhotos, {
      params: { username },
      query: page,
    });
  }

  /** A partial change; returns the Room with its new `updatedAt`. */
  public updateMyRoom(body: UpdateRoomRequest) {
    return this.call(apiRoutes.updateMyRoom, { body });
  }

  /** All seven widgets, each once, positions 0–6. */
  public updateMyRoomWidgets(body: UpdateRoomWidgetsRequest) {
    return this.call(apiRoutes.updateMyRoomWidgets, { body });
  }

  /** The full Top Friends list in order, its size, and its audience. */
  public updateMyRoomTopFriends(body: UpdateRoomTopFriendsRequest) {
    return this.call(apiRoutes.updateMyRoomTopFriends, { body });
  }

  // --- Notifications -------------------------------------------------------

  /** Newest first, with the unread count; rows are visibility-checked live. */
  public notifications(page: PageOptions = {}) {
    return this.call(apiRoutes.listNotifications, { query: page });
  }

  /** Counted up to 100; `capped` means there may be more. */
  public unreadNotificationCount() {
    return this.call(apiRoutes.getUnreadCount);
  }

  /** Idempotent. Anything not visible to you is NOTIFICATION_NOT_FOUND. */
  public markNotificationRead(notificationId: string) {
    return this.call(apiRoutes.markNotificationRead, {
      params: { notificationId },
    });
  }

  public markAllNotificationsRead() {
    return this.call(apiRoutes.markAllNotificationsRead);
  }

  /**
   * Performs one registered operation and validates the response against the
   * contract, so a server/client mismatch fails loudly instead of rendering
   * malformed data.
   */
  public async call<Route extends RouteDefinition>(
    route: Route,
    options: CallOptions = {},
  ): Promise<RouteResponse<Route>> {
    const headers = new Headers({ accept: 'application/json' });
    if (route.access === 'authenticated') {
      const token = await this.options.getAccessToken?.();
      if (!token) {
        throw new ApiClientError(
          401,
          'AUTHENTICATION_REQUIRED',
          'Sign in to continue.',
          null,
        );
      }
      headers.set('authorization', `Bearer ${token}`);
    }
    if (options.body !== undefined) {
      headers.set('content-type', 'application/json');
    }
    const response = await this.fetchImplementation(
      `${this.baseUrl}${buildPath(route, options.params)}${buildQuery(options.query)}`,
      {
        method: route.method,
        headers,
        cache: 'no-store',
        ...(options.body !== undefined
          ? { body: JSON.stringify(options.body) }
          : {}),
        ...(options.signal ? { signal: options.signal } : {}),
      },
    );
    if (!response.ok) throw await toError(response);
    if (route.successStatus === 204) return undefined as RouteResponse<Route>;
    const schema: z.ZodType = route.response;
    const parsed = schema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiClientError(
        response.status,
        'UNEXPECTED_RESPONSE',
        'The server returned an unexpected response.',
        response.headers.get('x-request-id'),
      );
    }
    return parsed.data as RouteResponse<Route>;
  }
}

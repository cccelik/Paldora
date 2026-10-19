import {
  apiRoutes,
  errorEnvelopeSchema,
  type CreateBoxInput,
  type CreateCommentInput,
  type CreateMediaUploadInput,
  type CreatePostInput,
  type SetPostReactionInput,
  type UpdatePreferencesInput,
  type UpdateBoxInput,
  type RouteDefinition,
  type RouteResponse,
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

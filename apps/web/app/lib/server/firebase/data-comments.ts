import { ApiClientError } from '@/lib/server/web-data-error';
import {
  NativePostError,
  type NativeComment,
  type NativeCommentItem,
} from '@paldora/firebase-trusted';
import {
  unavailable,
  iso,
  type FirebaseCommentItem,
  type FirebaseThreadItem,
  type FirebaseCommentThread,
} from './data-views';
import type { WebDataContext } from './data-context';
import 'server-only';

/** Comments and threads. */
export class CommentsData {
  public constructor(private readonly ctx: WebDataContext) {}

  public async comments(boxId: string, postId: string, cursor?: string) {
    try {
      const result = await this.ctx.postsService.listComments(
        boxId,
        postId,
        this.ctx.uid,
        cursor,
      );
      const items = await Promise.all(
        result.items.map(async (item): Promise<FirebaseCommentItem> => ({
          id: item.id,
          content: item.text,
          parentId: item.parentId,
          authorName: await this.ctx.authorName(item.authorUid),
          authorAvatarUrl: await this.ctx.authorAvatarUrl(item.authorUid),
          createdAt: iso(item.createdAt),
          edited: item.updatedAt > item.createdAt,
          canEdit: item.authorUid === this.ctx.uid,
          interactions: await this.ctx.postsService.commentInteractionSummary(
            boxId,
            postId,
            item.id,
            this.ctx.uid,
          ),
        })),
      );
      return { items, nextCursor: result.nextCursor };
    } catch (error) {
      if (error instanceof NativePostError && error.code === 'UNAVAILABLE')
        throw unavailable('POST_NOT_FOUND');
      throw error;
    }
  }

  private async firebaseComment(
    boxId: string,
    postId: string,
    item: NativeComment,
  ): Promise<FirebaseCommentItem> {
    return {
      id: item.id,
      content: item.text,
      parentId: item.parentId,
      authorName: await this.ctx.authorName(item.authorUid),
      authorAvatarUrl: await this.ctx.authorAvatarUrl(item.authorUid),
      createdAt: iso(item.createdAt),
      edited: item.updatedAt > item.createdAt,
      canEdit: item.authorUid === this.ctx.uid,
      interactions: await this.ctx.postsService.commentInteractionSummary(
        boxId,
        postId,
        item.id,
        this.ctx.uid,
      ),
    };
  }

  private async firebaseThreadItem(
    boxId: string,
    postId: string,
    item: NativeCommentItem,
  ): Promise<FirebaseThreadItem> {
    return item.kind === 'comment'
      ? {
          kind: 'comment',
          comment: await this.firebaseComment(boxId, postId, item.comment),
        }
      : { kind: item.kind, id: item.id, createdAt: iso(item.createdAt) };
  }

  public async commentThreads(boxId: string, postId: string, cursor?: string) {
    try {
      const roots = await this.ctx.postsService.commentThreadsPage(
        boxId,
        postId,
        this.ctx.uid,
        cursor,
      );
      const items = await Promise.all(
        roots.items.map(async (thread): Promise<FirebaseCommentThread> => ({
          root: await this.firebaseThreadItem(boxId, postId, thread.root),
          rootId: thread.rootId,
          replies: await Promise.all(
            thread.replies.map((item) =>
              this.firebaseThreadItem(boxId, postId, item),
            ),
          ),
          replyCount: thread.replyCount,
        })),
      );
      return { items, nextCursor: roots.nextCursor };
    } catch (error) {
      if (error instanceof NativePostError && error.code === 'UNAVAILABLE')
        throw unavailable('POST_NOT_FOUND');
      throw error;
    }
  }

  public async moreCommentReplies(
    boxId: string,
    postId: string,
    rootId: string,
    cursor?: string,
  ) {
    try {
      const page = await this.ctx.postsService.listCommentReplies(
        boxId,
        postId,
        rootId,
        this.ctx.uid,
        cursor,
      );
      return {
        items: await Promise.all(
          page.items.map((item) =>
            this.firebaseThreadItem(boxId, postId, item),
          ),
        ),
        nextCursor: page.nextCursor,
      };
    } catch (error) {
      if (error instanceof NativePostError && error.code === 'UNAVAILABLE')
        throw unavailable('COMMENT_NOT_FOUND');
      throw error;
    }
  }

  public async pinnedCommentThread(
    boxId: string,
    postId: string,
    commentId: string,
  ) {
    try {
      const detail = await this.ctx.postsService.commentDetail(
        boxId,
        postId,
        commentId,
        this.ctx.uid,
      );
      const rootId = detail.rootId;
      const root =
        detail.comment.parentId === null
          ? detail.comment
          : await this.ctx.postsService
              .commentDetail(boxId, postId, rootId, this.ctx.uid)
              .then((result) => result.comment)
              .catch((error: unknown) => {
                if (
                  error instanceof NativePostError &&
                  error.code === 'UNAVAILABLE'
                )
                  return null;
                throw error;
              });
      const replies = root
        ? await this.ctx.postsService.listCommentReplies(
            boxId,
            postId,
            rootId,
            this.ctx.uid,
            undefined,
            3,
          )
        : null;
      const preview = replies?.items ?? [];
      if (
        detail.comment.parentId !== null &&
        !preview.some(
          (item) => item.kind === 'comment' && item.comment.id === commentId,
        )
      )
        preview.push({ kind: 'comment', comment: detail.comment });
      return {
        root: root
          ? await this.firebaseThreadItem(boxId, postId, {
              kind: 'comment',
              comment: root,
            })
          : ({
              kind: 'deleted',
              id: rootId,
              createdAt: iso(detail.comment.createdAt),
            } as FirebaseThreadItem),
        rootId,
        replies: await Promise.all(
          preview.map((item) => this.firebaseThreadItem(boxId, postId, item)),
        ),
        replyCount: root
          ? await this.ctx.postsService.countCommentReplies(
              boxId,
              postId,
              rootId,
              this.ctx.uid,
            )
          : preview.length,
      } satisfies FirebaseCommentThread;
    } catch (error) {
      if (error instanceof NativePostError && error.code === 'UNAVAILABLE')
        return null;
      throw error;
    }
  }

  public async createComment(
    boxId: string,
    postId: string,
    content: string,
    parentId: string | null,
  ) {
    try {
      return await this.ctx.postsService.createComment(
        boxId,
        postId,
        this.ctx.uid,
        content,
        parentId,
      );
    } catch (error) {
      if (error instanceof NativePostError && error.code === 'UNAVAILABLE')
        throw unavailable('POST_NOT_FOUND');
      if (error instanceof NativePostError && error.code === 'INVALID')
        throw new ApiClientError(
          400,
          'VALIDATION_FAILED',
          'Check your comment.',
          null,
        );
      throw error;
    }
  }

  public async setCommentReaction(
    boxId: string,
    postId: string,
    commentId: string,
    kind: string | null,
  ) {
    try {
      await this.ctx.postsService.setReaction(
        boxId,
        postId,
        this.ctx.uid,
        kind,
        commentId,
      );
      return this.ctx.postsService.commentInteractionSummary(
        boxId,
        postId,
        commentId,
        this.ctx.uid,
      );
    } catch (error) {
      if (error instanceof NativePostError && error.code === 'UNAVAILABLE')
        throw unavailable('COMMENT_NOT_FOUND');
      throw error;
    }
  }

  public async deleteComment(boxId: string, postId: string, commentId: string) {
    try {
      return await this.ctx.postsService.deleteComment(
        boxId,
        postId,
        commentId,
        this.ctx.uid,
      );
    } catch (error) {
      if (error instanceof NativePostError && error.code === 'UNAVAILABLE')
        throw unavailable('COMMENT_NOT_FOUND');
      throw error;
    }
  }

  public async editComment(
    boxId: string,
    postId: string,
    commentId: string,
    content: string,
  ) {
    try {
      return await this.ctx.postsService.editComment(
        boxId,
        postId,
        commentId,
        this.ctx.uid,
        content,
      );
    } catch (error) {
      if (error instanceof NativePostError && error.code === 'UNAVAILABLE')
        throw unavailable('COMMENT_NOT_FOUND');
      if (error instanceof NativePostError && error.code === 'INVALID')
        throw new ApiClientError(
          400,
          'VALIDATION_FAILED',
          'Check your comment.',
          null,
        );
      throw error;
    }
  }
}

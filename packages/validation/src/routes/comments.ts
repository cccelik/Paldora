import {
  commentDetailSchema,
  commentPageSchema,
  commentSchema,
  commentThreadPageSchema,
  createCommentSchema,
  updateCommentSchema,
} from '../comments.js';
import { cursorPageQuerySchema } from '../primitives.js';
import { noContent } from './no-content.js';
import { defineRoute } from '../route.js';

const commentsTag = 'Comments';

export const createComment = defineRoute({
  operationId: 'createComment',
  method: 'POST',
  path: '/posts/{postId}/comments',
  summary:
    'Comment on a post, or reply with `parentCommentId`. A reply to a reply joins the root’s thread (one reply level). Archived Boxes are read-only.',
  tag: commentsTag,
  access: 'authenticated',
  successStatus: 201,
  response: commentSchema,
  body: createCommentSchema,
  errors: ['POST_NOT_FOUND', 'COMMENT_NOT_FOUND', 'BOX_ARCHIVED'],
});

export const listComments = defineRoute({
  operationId: 'listComments',
  method: 'GET',
  path: '/posts/{postId}/comments',
  summary:
    'A post’s threads, newest root first, each with its oldest replies. Comments by people in a block relationship with you appear as hidden items; a deleted root stays only while it has replies.',
  tag: commentsTag,
  access: 'authenticated',
  successStatus: 200,
  response: commentThreadPageSchema,
  query: cursorPageQuerySchema,
  errors: ['POST_NOT_FOUND'],
});

export const listReplies = defineRoute({
  operationId: 'listReplies',
  method: 'GET',
  path: '/comments/{commentId}/replies',
  summary: 'The replies in one thread, oldest first.',
  tag: commentsTag,
  access: 'authenticated',
  successStatus: 200,
  response: commentPageSchema,
  query: cursorPageQuerySchema,
  errors: ['COMMENT_NOT_FOUND'],
});

export const getComment = defineRoute({
  operationId: 'getComment',
  method: 'GET',
  path: '/comments/{commentId}',
  summary:
    'One comment and the root of its thread, for deep links. Missing, deleted, outside your Boxes, and blocked all answer COMMENT_NOT_FOUND.',
  tag: commentsTag,
  access: 'authenticated',
  successStatus: 200,
  response: commentDetailSchema,
  errors: ['COMMENT_NOT_FOUND'],
});

export const updateComment = defineRoute({
  operationId: 'updateComment',
  method: 'PATCH',
  path: '/comments/{commentId}',
  summary: 'Edit your own comment.',
  tag: commentsTag,
  access: 'authenticated',
  successStatus: 200,
  response: commentSchema,
  body: updateCommentSchema,
  errors: ['COMMENT_NOT_FOUND', 'COMMENT_ACCESS_DENIED', 'BOX_ARCHIVED'],
});

export const deleteComment = defineRoute({
  operationId: 'deleteComment',
  method: 'DELETE',
  path: '/comments/{commentId}',
  summary:
    'Delete your own comment (idempotent). The text is erased; replies stay.',
  tag: commentsTag,
  access: 'authenticated',
  successStatus: 204,
  response: noContent,
  errors: ['COMMENT_NOT_FOUND', 'COMMENT_ACCESS_DENIED', 'BOX_ARCHIVED'],
});
